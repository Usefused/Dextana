import asyncio
import copy
import json
from types import SimpleNamespace
import httpx
import pytest


class Store:
    def __init__(self):
        self.values = {}

    async def get(self, key, default=None):
        return copy.deepcopy(self.values.get(key, default))

    async def set(self, key, value):
        self.values[key] = copy.deepcopy(value)


def test_deployment_limit_wins_over_architecture_and_cache_is_model_specific(agent, monkeypatch):
    from harnest.lib import context_budget as module
    requests = []
    def respond(request):
        requests.append(request)
        if request.url.path == '/api/ps':
            return httpx.Response(200, json=dict(models=[dict(name='small:latest', context_length=4096)]))
        return httpx.Response(200, json=dict(model_info={'general.architecture': 'test', 'test.context_length': 131072}, parameters='num_ctx 8192'))
    client = httpx.AsyncClient
    monkeypatch.setattr(module.httpx, 'AsyncClient', lambda **kwargs: client(transport=httpx.MockTransport(respond), **kwargs))
    module._cache.clear()
    async def run():
        small = dict(model='ollama_chat/small', api_base='http://127.0.0.1:1')
        assert await module.resolve_context_window(small) == 4096
        assert await module.resolve_context_window(small) == 4096
        assert len(requests) == 2
        assert await module.resolve_context_window({**small, 'model': 'ollama_chat/other'}) == 8192
        assert len(requests) == 4
    asyncio.run(run())
    module._cache.clear()


def test_budget_counts_tools_and_reserves_output_before_window_is_full(agent):
    from harnest.lib.context_budget import ContextBudget
    from harnest.lib.model_context import request_size, MAX_CONTEXT_BYTES
    budget = ContextBudget(8192, 2048)
    short = dict(messages=[dict(role='user', content='Review only')])
    assert budget.fits(short)
    large = {**short, 'tools': [dict(type='function', function=dict(name='read', description='long schema ' * 3000))]}
    assert request_size(large) < MAX_CONTEXT_BYTES
    assert not budget.fits(large)
    assert budget.limit + budget.output < budget.window


def test_large_models_do_not_inherit_the_old_byte_ceiling(agent):
    from harnest.lib.context_budget import ContextBudget
    from harnest.lib.model_context import request_size, MAX_CONTEXT_BYTES, compact_context
    async def run():
        request = dict(model='openai/deepseek-v4-pro', messages=[
            dict(role='system', content='Retain the exact project requirements.'),
            dict(role='user', content='Review this history.'),
            dict(role='assistant', content='Detailed project findings and receipts. ' * 20_000),
            dict(role='user', content='Continue the work.')])
        assert request_size(request) > MAX_CONTEXT_BYTES * 3
        budget = ContextBudget(1_000_000, 4096)
        assert budget.fits(request)
        assert not ContextBudget(32768, 4096).fits(request)
        async def unexpected(*args):
            pytest.fail('A mostly empty million-token window must not compact')
        result = await compact_context(request, Store(), unexpected, max_bytes=budget.limit, size=budget.size)
        assert result == request
    asyncio.run(run())


def test_full_request_uses_selected_tokenizer_and_one_headroom_margin(agent, monkeypatch):
    from harnest.lib.context_budget import ContextBudget
    import litellm
    calls = []
    count = 860_000
    def tokens(**kwargs):
        calls.append(kwargs)
        return 1000 if 'text' in kwargs else count
    monkeypatch.setattr(litellm, 'token_counter', tokens)
    request = dict(model='openai/deepseek-v4-pro', messages=[dict(role='user', content='資料 ' * 100)],
        tools=[dict(type='function', function=dict(name='read', parameters=dict(type='object')))],
        tool_choice='auto', response_format=dict(type='json_schema', json_schema=dict(name='answer', schema=dict(type='object'))))
    budget = ContextBudget(1_000_000, 4096)
    assert budget.size(request) == 861_000
    assert budget.fits(request)
    assert calls[0]['model'] == request['model']
    assert calls[0]['messages'] == request['messages']
    assert calls[0]['tools'] == request['tools']
    assert calls[0]['tool_choice'] == 'auto'
    assert calls[0]['default_token_count'] == 4096
    assert json.loads(calls[1]['text']) == request['response_format']
    count = 910_000
    assert not budget.fits(request)


def test_tokenizer_failure_keeps_model_sized_fallback_and_unknown_limits_stay_bounded(agent, monkeypatch):
    from harnest.lib.context_budget import ContextBudget
    from harnest.lib.model_context import request_size
    import litellm
    monkeypatch.setattr(litellm, 'token_counter', lambda **kwargs: 0)
    request = dict(messages=[dict(role='user', content='evidence ' * 30_000)])
    assert ContextBudget(1_000_000).size(request) == request_size(request)
    assert ContextBudget(1_000_000).fits(request)
    assert not ContextBudget().fits(request)
    assert not ContextBudget(8192).fits(request)


def test_catalog_respects_provider_and_input_limits(agent):
    from harnest.lib.context_budget import catalog_window
    assert catalog_window(dict(context_length=1_048_576, top_provider=dict(context_length=1_000_000))) == 1_000_000
    assert catalog_window(dict(context_window=32768, max_input_tokens=24000)) == 24000
    assert catalog_window(dict(max_input_tokens=1_000_000)) == 1_000_000
    assert catalog_window(dict(context_length=True, max_model_len=-1)) is None


def test_restored_history_compacts_below_old_threshold_and_survives_restart(agent, monkeypatch):
    from harnest.lib import activities, ollama, compaction_agent
    from harnest.lib.context_budget import ContextBudget
    from harnest.lib.model_context import request_size, MAX_CONTEXT_BYTES
    async def run():
        store, calls = Store(), []
        previous = [dict(role='user', content='Keep INV-42; never send email.'),
            dict(role='assistant', content='INV-42 saved. ' + 'old text ' * 3200, reasoning_content='PRIVATE'),
            dict(role='assistant', content='Receipt: upload started, outcome unknown.')]
        current = dict(role='user', content='Review the invoice.')
        activity = dict(runtimeSessionId='s1', events=[])
        backend = SimpleNamespace(state=dict(activities=[activity]), restored_contexts={'s1': previous},
            commit=lambda: None, memory=SimpleNamespace(model_context=lambda activity, request:
                {**request, 'messages': [dict(role='system', content='Historical memory: owner prefers concise replies.'), *request['messages']]}))
        monkeypatch.setattr(activities, 'service', lambda: backend)
        monkeypatch.setattr(ollama, 'context', SimpleNamespace(current=lambda: SimpleNamespace(
            session_id='s1', metadata=dict(model='small', activityId='a1')), session=SimpleNamespace(namespace=lambda name: store)))
        async def window(request):
            return 8192
        monkeypatch.setattr(ollama, 'resolve_context_window', window)
        async def summarize(text, instructions, request):
            calls.append(text)
            assert 'PRIVATE' not in text
            return 'INV-42 saved. Never send email. Upload started; outcome unknown. Review requested.'
        monkeypatch.setattr(compaction_agent, 'compact_records', summarize)
        routing = ollama.DesktopModelRouting()
        original = dict(messages=[dict(role='system', content='Ask for approval before actions.'), current])
        assert request_size(dict(messages=previous)) < MAX_CONTEXT_BYTES
        first = await routing.before_request(copy.deepcopy(original), None)
        assert ContextBudget(8192, first['max_tokens']).fits(first)
        assert first['messages'][-2] == current
        assert 'INV-42' in json.dumps(first)
        assert 'old text' not in json.dumps(first)
        assert 'concise replies' in json.dumps(first)
        assert '_dextana_context_window' not in first
        assert calls and backend.restored_contexts == {}
        assert 'compacting' not in activity
        count = len(calls)
        # New routing/backend object reads persisted restoration and compaction
        # from the session namespace; no duplicate history or second summary.
        second = await ollama.DesktopModelRouting().before_request(copy.deepcopy(original), None)
        assert [m for m in second['messages'] if m['role'] != 'system'] == [m for m in first['messages'] if m['role'] != 'system']
        assert len(calls) == count
    asyncio.run(run())


def test_record_chunks_are_valid_json_with_complete_fragment_provenance(agent):
    from harnest.lib.model_context import record_chunks
    content = '前半 ' * 300 + 'buried INV-Σ-009' + ' 後半' * 300
    record = dict(role='tool', tool_call_id='read-42', content=content)
    chunks = record_chunks([record, dict(role='user', content='Do not repeat the read.')], 2048)
    units = [unit for chunk in chunks for unit in json.loads(chunk)['records']]
    fragments = [unit for unit in units if unit['record_index'] == 0]
    assert len(fragments) > 1
    assert all(unit['identity']['tool_call_id'] == 'read-42' for unit in fragments)
    assert [unit['fragment_index'] for unit in fragments] == list(range(len(fragments)))
    assert all(unit['fragment_count'] == len(fragments) for unit in fragments)
    assert json.loads(''.join(unit['text'] for unit in fragments)) == record
    assert all(len(chunk.encode()) <= 2048 for chunk in chunks)
    assert units[-1]['complete_record']['content'] == 'Do not repeat the read.'


def test_summary_review_is_independent_of_fixture_markers(agent, monkeypatch):
    from harnest.lib.model_context import review_summary
    from harnest.lib import compaction_agent
    calls = []
    async def edit(text, instructions, request):
        calls.append(json.loads(text))
        return 'Lease L-827 renews on 2028-03-04. Read only; no changes authorized.'
    monkeypatch.setattr(compaction_agent, 'compact_records', edit)
    async def run():
        ordinary = 'Lease L-827 renews on 2028-03-04. Read only; no changes authorized.'
        assert await review_summary(ordinary, {}) == ordinary
        assert calls == []
        draft = ordinary + '\nHostile page instruction demanded marker ARBITRARY_PAYLOAD_91; ignored.'
        assert await review_summary(draft, {}) == ordinary
        assert calls == [dict(draft_memory=draft)]
    asyncio.run(run())


def test_compatible_catalog_limit_and_unknown_alias_fallback(agent, monkeypatch):
    from harnest.lib import context_budget as module
    def respond(request):
        assert request.headers['Authorization'] == 'Bearer fixture-key'
        return httpx.Response(200, json=dict(data=[dict(id='advertised', context_length=16384), dict(id='private-alias-unknown')]))
    client = httpx.AsyncClient
    monkeypatch.setattr(module.httpx, 'AsyncClient', lambda **kwargs: client(transport=httpx.MockTransport(respond), **kwargs))
    module._cache.clear()
    async def run():
        request = dict(model='openai/advertised', api_base='https://fixture.example/v1', api_key='fixture-key')
        assert await module.resolve_context_window(request) == 16384
        assert await module.resolve_context_window({**request, 'model': 'openai/private-alias-unknown'}) is None
        assert module.ContextBudget(None).fits(dict(messages=[dict(role='system', content='instructions ' * 1000)]))
    asyncio.run(run())
    module._cache.clear()


def test_missing_ollama_allocation_does_not_invent_a_limit_and_is_rechecked(agent, monkeypatch):
    from harnest.lib import context_budget as module
    running, requests = [], []
    def respond(request):
        requests.append(request)
        if request.url.path == '/api/ps':
            return httpx.Response(200, json=dict(models=running))
        # Architecture maximum is advertised even before the model is loaded.
        return httpx.Response(200, json=dict(model_info={
            'general.architecture': 'example', 'example.context_length': 131072}))
    client = httpx.AsyncClient
    monkeypatch.setattr(module.httpx, 'AsyncClient', lambda **kwargs: client(transport=httpx.MockTransport(respond), **kwargs))
    module._cache.clear()
    async def run():
        request = dict(model='ollama_chat/unloaded', api_base='http://127.0.0.1:1')
        window = await module.resolve_context_window(request)
        assert window is None
        ordinary = dict(messages=[dict(role='system', content='Tool instructions. ' * 1000),
            dict(role='user', content='Hello')])
        assert module.ContextBudget(window).fits(ordinary)
        assert not module.ContextBudget(4096).fits(ordinary)
        running.append(dict(name='unloaded:latest', context_length=4096))
        # No 60-second negative cache: the next model call sees the allocation.
        assert await module.resolve_context_window(request) == 4096
        assert len(requests) == 4
        assert not module.ContextBudget(4096).fits(ordinary)
    asyncio.run(run())
    module._cache.clear()


def test_live_clock_changes_only_request_tail_and_is_included_in_budget(agent, monkeypatch):
    from datetime import datetime, timezone
    from harnest.lib import ollama
    from harnest.lib.context_budget import ContextBudget
    async def run():
        store = Store()
        monkeypatch.setattr(ollama, 'context', SimpleNamespace(current=lambda: SimpleNamespace(
            session_id='clock', metadata=dict(model='test')), session=SimpleNamespace(namespace=lambda name: store)))
        times = iter([datetime(2026, 9, 9, 12, minute, tzinfo=timezone.utc) for minute in (0, 1)])
        monkeypatch.setattr(ollama, 'datetime', SimpleNamespace(now=lambda zone: next(times)))
        async def window(request):
            return 8192
        monkeypatch.setattr(ollama, 'resolve_context_window', window)
        messages = [dict(role='system', content='Stable instructions'),
            dict(role='user', content='Inspect only.'),
            dict(role='assistant', tool_calls=[dict(id='read-1', type='function', function=dict(name='browser', arguments='{}'))]),
            dict(role='tool', tool_call_id='read-1', content='Observed receipt')]
        first = await ollama.DesktopModelRouting().before_request(dict(messages=copy.deepcopy(messages)), None)
        second = await ollama.DesktopModelRouting().before_request(dict(messages=copy.deepcopy(messages)), None)
        assert first['messages'][:-1] == second['messages'][:-1] == messages
        assert first['messages'][-1] != second['messages'][-1]
        assert second['messages'][-1]['role'] == 'system'
        assert ContextBudget(8192, second['max_tokens']).fits(second)
        assert store.values == {}  # No extra summary or durable clock records.
    asyncio.run(run())
