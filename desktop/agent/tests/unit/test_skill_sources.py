import asyncio
import importlib.util
from pathlib import Path
from unittest.mock import AsyncMock
from types import SimpleNamespace

import pytest


def hook(monkeypatch, skills):
    path = Path(__file__).parents[2] / 'lifecycle' / 'skill_sources.py'
    spec = importlib.util.spec_from_file_location('skill_source_validation', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, 'context', SimpleNamespace(skills=skills))
    return module.validate_skill_source


@pytest.mark.parametrize('name,source', [('browser', 'dextana'), ('list_skills', ''), ('list_skills', None)])
def test_unrelated_and_unfiltered_calls_are_unchanged(agent, monkeypatch, name, source):
    from harnest.lifecycle_transition import TransitionContext
    from harnest.tool_lifecycle import ToolCallRequest
    skills = SimpleNamespace(list=AsyncMock())
    request = ToolCallRequest(name=name, kwargs={'source': source})
    result = asyncio.run(hook(monkeypatch, skills)(TransitionContext(), request))
    assert result.value is request
    skills.list.assert_not_called()


def test_missing_source_returns_recovery_without_loading_or_aliasing(agent, monkeypatch):
    from harnest.skills import SkillNotFoundError
    from harnest.lifecycle_transition import TransitionContext
    from harnest.tool_lifecycle import ToolCallRequest
    skills = SimpleNamespace(load=AsyncMock(side_effect=SkillNotFoundError('unavailable')))
    request = ToolCallRequest(name='load_skill', kwargs={'source': 'dextana', 'name': 'browser-work'})
    result = asyncio.run(hook(monkeypatch, skills)(TransitionContext(), request))
    assert 'No skill was loaded' in result.result
    skills.load.assert_awaited_once_with('browser-work', source='dextana', version=None)


def test_valid_source_preserves_request_and_provider_failures_propagate(agent, monkeypatch):
    from harnest.lifecycle_transition import TransitionContext
    from harnest.tool_lifecycle import ToolCallRequest
    skills = SimpleNamespace(load=AsyncMock(return_value=SimpleNamespace(instructions='Loaded instructions')))
    request = ToolCallRequest(name='load_skill', kwargs={'name': 'private-skill', 'source': 'personal', 'version': 'exact'})
    validate = hook(monkeypatch, skills)
    assert asyncio.run(validate(TransitionContext(), request)).result == 'Loaded instructions'
    skills.load.assert_awaited_once_with('private-skill', source='personal', version='exact')
    skills.load.side_effect = RuntimeError('provider offline')
    with pytest.raises(RuntimeError, match='provider offline'):
        asyncio.run(validate(TransitionContext(), request))
