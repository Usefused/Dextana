import asyncio
import copy


class Memory:
    def __init__(self):
        self.values = {}

    async def get(self, key, default=None):
        return copy.deepcopy(self.values.get(key, default))

    async def set(self, key, value):
        self.values[key] = copy.deepcopy(value)


def exchange(index, content):
    return [dict(role='assistant', content=None, tool_calls=[dict(id=f'call-{index}',
        type='function', function=dict(name='read', arguments='{}'))]),
        dict(role='tool', tool_call_id=f'call-{index}', content=content)]


def test_compacted_tool_history_survives_followups_until_working_context_fills(agent):
    from harnest.lib.model_context import compact_context, request_size, MAX_CONTEXT_BYTES

    async def run():
        store, calls, reports = Memory(), [], []
        async def summarize(records, request):
            calls.append(copy.deepcopy(records))
            return 'Report 42 read successfully. Total 123. Review is pending.'
        request = dict(messages=[dict(role='system', content='Never publish.'),
            dict(role='user', content='Read report 42.'), *exchange(1, 'Report 42: ' + 'details ' * 35_000)])
        original = copy.deepcopy(request)
        compacted = await compact_context(request, store, summarize, reports.append)
        assert len(calls) == 1
        reports.clear()
        for index in range(2, 7):
            request['messages'].extend([dict(role='user', content=f'Next question {index}'),
                *exchange(index, f'Read-only result {index}')])
            compacted = await compact_context(request, store, summarize, reports.append)
            assert len(calls) == 1
            assert reports == []
            assert 'Total 123' in str(compacted)
            assert original['messages'][-1]['content'] not in str(compacted)
        # A larger selected context window must not resurrect the old raw result.
        assert await compact_context(request, store, summarize, max_bytes=1_000_000) == compacted
        assert len(calls) == 1
        assert request['messages'][:len(original['messages'])] == original['messages']
        # Compact again only once genuinely new working context exceeds budget.
        request['messages'].insert(-3, dict(role='assistant', content='New research ' * 20_000))
        result = await compact_context(request, store, summarize, reports.append)
        assert len(calls) > 1
        assert sum(message.startswith('Context compacted:') for message in reports) == 1
        assert request_size(result) <= MAX_CONTEXT_BYTES
        assert result['messages'][-3:] == request['messages'][-3:]
        assert 'Total 123' in str(calls[1:])
        assert 'details details' not in str(calls[1:])
        completed_calls = len(calls)
        assert await compact_context(request, store, summarize) == result
        assert len(calls) == completed_calls

    asyncio.run(run())


def test_compaction_leaves_headroom_and_persists_smaller_cached_results(agent):
    from harnest.lib.model_context import compact_context, fingerprint, request_size, SUMMARY_VERSION

    async def run():
        store, calls = Memory(), []
        messages = [dict(role='user', content='Inspect reports; never publish.')]
        replacements = {}
        for index in range(12):
            content = f'Report {index}: ' + 'raw data ' * 4000
            messages.extend(exchange(index, content))
            replacements[fingerprint(content)] = f'Read receipt {index}. ' + 'Old verbose summary. ' * 250
        await store.set('compaction', dict(version=SUMMARY_VERSION, results=replacements))
        async def summarize(records, request):
            calls.append(records)
            return f'Read completed, receipt {records[0]["tool_call_id"]}. Review pending; do not publish.'
        request = dict(messages=messages)
        result = await compact_context(request, store, summarize, max_bytes=40_000)
        assert request_size(result) <= 40_000 * .35
        completed_calls = len(calls)
        assert completed_calls > 0
        assert await compact_context(request, store, summarize, max_bytes=40_000) == result
        # Several substantive follow-ups fit without a new compaction cycle.
        for index in range(5):
            messages.extend([dict(role='user', content=f'Follow-up {index}'),
                dict(role='assistant', content='New findings. ' * 100)])
            await compact_context(request, store, summarize, max_bytes=40_000)
        assert len(calls) == completed_calls
        assert set(store.values['compaction']['results']) == set(replacements)

    asyncio.run(run())


def test_summary_output_scales_to_context_and_condenses_oversized_drafts(agent, monkeypatch):
    from harnest import context
    from harnest.lib import compaction_agent
    from harnest.lib.model_context import summarize_records
    from harnest.lib.context_budget import budget_for
    from types import SimpleNamespace

    monkeypatch.setattr(context, 'current', lambda: SimpleNamespace(metadata={}))
    calls = []
    async def compact(text, instructions, request):
        calls.append((text, instructions, request))
        return 'Verbose draft. ' * 300 if len(calls) == 1 else 'Goal: Review report 42. Read receipt 9 confirmed; publishing prohibited.'
    monkeypatch.setattr(compaction_agent, 'compact_records', compact)
    request = dict(model='ollama_chat/test', _dextana_context_window=8192)
    result = asyncio.run(summarize_records([dict(role='user', content='Review report 42.')], request))
    assert len(calls) == 2
    limit = calls[0][2]['_dextana_summary_tokens']
    assert limit <= 600 and limit <= budget_for(request).limit * .1
    assert len(result.encode()) <= limit * 3
    assert 'draft_memory' in calls[1][0]
    routed = asyncio.run(compaction_agent.CompactionRouting(calls[0][2]).before_request(
        dict(messages=[dict(role='user', content='Records')]), None))
    assert routed['max_tokens'] == limit
    assert '_dextana_summary_tokens' not in routed


def test_cached_result_replacements_are_not_evicted_while_history_still_needs_them(agent):
    from harnest.lib.model_context import compact_context, fingerprint, SUMMARY_VERSION

    async def run():
        store = Memory()
        messages = [dict(role='user', content='Inspect these results without repeating actions.')]
        replacements = {}
        for index in range(18):
            content = f'Result {index}: ' + 'data ' * 10_000
            messages.extend(exchange(index, content))
            replacements[fingerprint(content)] = f'Completed result {index}.'
        await store.set('compaction', dict(version=SUMMARY_VERSION, results=replacements))
        calls = []
        async def summarize(records, request):
            calls.append(records)
            return 'New result completed.'
        messages.extend(exchange(18, 'New result: ' + 'large ' * 40_000))
        request = dict(messages=messages)
        first = await compact_context(request, store, summarize)
        assert len(calls) == 1
        assert len(store.values['compaction']['results']) == 19
        assert await compact_context(request, store, summarize) == first
        assert len(calls) == 1
        assert [message.get('tool_call_id') for message in first['messages']] == [message.get('tool_call_id') for message in messages]

    asyncio.run(run())
