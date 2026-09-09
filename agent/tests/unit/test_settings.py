import asyncio
from types import SimpleNamespace
import pytest


def test_personal_skills_are_durable_scoped_and_revocable(agent, monkeypatch, tmp_path):
    from harnest.lib.settings_store import save_skill, skills, delete_skill, import_skill
    from harnest.lib.personal_skills import PersonalSkills
    from harnest.skills import SkillNotFoundError
    monkeypatch.setenv('DEXTANA_STORAGE_DIRECTORY', str(tmp_path))
    imported = import_skill('---\nname: weekly-review\ndescription: Summarize the week.\n---\nStart with completed work.')
    item = save_skill(imported)
    assert skills()[0]['instructions'] == 'Start with completed work.'
    with pytest.raises(ValueError, match='already exists'):
        save_skill(imported)

    async def check():
        source = PersonalSkills()
        owner = SimpleNamespace(user_id='owner')
        assert len((await source.list(owner, query='review')).items) == 1
        assert not (await source.list(SimpleNamespace(user_id='other'))).items
        assert (await source.load(item['id'], owner, version=item['version'])).instructions == 'Start with completed work.'
        disabled = save_skill(dict(item, enabled=False))
        assert not (await source.list(owner)).items
        with pytest.raises(SkillNotFoundError):
            await source.load(item['id'], owner, version=item['version'])
        save_skill(dict(disabled, enabled=True, instructions='Updated instructions.'))
        with pytest.raises(SkillNotFoundError):
            await source.load(item['id'], owner, version=item['version'])
        assert (await source.load(item['id'], owner)).instructions == 'Updated instructions.'
    asyncio.run(check())
    delete_skill(item['id'])
    assert skills() == []


def test_usage_deduplicates_events_and_does_not_estimate_missing_tokens(agent, monkeypatch, tmp_path):
    from harnest.lib.settings_store import record_usage, usage_summary
    monkeypatch.setenv('DEXTANA_STORAGE_DIRECTORY', str(tmp_path))
    activity = dict(id='activity', model='chat', provider='openai')
    event = dict(responseId='response', sequence=1, usage=dict(inputTokens=100, outputTokens=20, totalTokens=120))
    record_usage(activity, event)
    record_usage(activity, event)
    record_usage(activity, dict(responseId='response', sequence=2))
    usage = usage_summary('all')
    assert usage['inputTokens'] == 100
    assert usage['outputTokens'] == 20
    assert usage['totalTokens'] == 120
    assert usage['calls'] == 1
    assert usage['reportedCalls'] == 1
    assert usage['models'][0]['provider'] == 'openai'
    with pytest.raises(ValueError):
        usage_summary('invalid')
