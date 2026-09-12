import copy
import asyncio
import json
import pytest


def test_large_results_shorten_without_losing_tool_pairs_or_owner_instructions(agent):
    from harnest.lib.model_context import bound_context, request_size, MAX_CONTEXT_BYTES
    request = dict(messages=[dict(role='system', content='Keep all permission checks.'),
        dict(role='user', content='Find the report and inspect its totals.'),
        dict(role='assistant', content=None, tool_calls=[dict(id='call-1', type='function', function=dict(name='files', arguments='{"action":"read"}'))]),
        dict(role='tool', tool_call_id='call-1', content=json.dumps(dict(status='complete', result='large result ' * 30_000))),
        dict(role='assistant', content='The file was read.'),
        dict(role='user', content='Summarize the totals without repeating work.')], tools=[dict(type='function', function=dict(name='files'))])
    original = copy.deepcopy(request)
    result = bound_context(request)
    assert request == original
    assert request_size(result) <= MAX_CONTEXT_BYTES
    assert result['tools'] == original['tools']
    assert result['messages'][1:4] == original['messages'][:3]
    assert result['messages'][4]['tool_call_id'] == 'call-1'
    assert json.loads(result['messages'][4]['content'])['shortened'] is True
    assert result['messages'][-1] == original['messages'][-1]
    assert 'Do not repeat' in result['messages'][0]['content']


def test_normal_history_and_images_are_preserved_and_large_assistant_text_is_bounded(agent):
    from harnest.lib.model_context import bound_context, request_size, MAX_CONTEXT_BYTES
    image = dict(type='image_url', image_url=dict(url='data:image/png;base64,' + 'a' * 400_000))
    normal = dict(messages=[dict(role='system', content='Instructions'), dict(role='user', content=[dict(type='text', text='Inspect this screenshot'), image])])
    assert bound_context(normal) is normal
    large = copy.deepcopy(normal)
    large['messages'].extend([dict(role='assistant', content='Earlier response ' * 30_000), dict(role='user', content='Explain the result')])
    result = bound_context(large)
    assert request_size(result) <= MAX_CONTEXT_BYTES
    assert result['messages'][2]['content'][1] == image
    assert result['messages'][-1]['content'] == 'Explain the result'


def test_context_guard_never_silently_cuts_system_text_user_text_or_tool_arguments(agent):
    from harnest.lib.model_context import bound_context
    for message in [dict(role='system', content='Policy ' * 40_000), dict(role='user', content='Owner ' * 40_000),
        dict(role='assistant', content=None, tool_calls=[dict(id='large-call', function=dict(name='write', arguments='code' * 60_000))])]:
        request = dict(messages=[message])
        original = copy.deepcopy(request)
        with pytest.raises(ValueError, match='saved conversation has not been changed'):
            bound_context(request)
        assert request == original


class Memory:
    def __init__(self):
        self.values = {}

    async def get(self, key, default=None):
        return copy.deepcopy(self.values.get(key, default))

    async def set(self, key, value):
        self.values[key] = copy.deepcopy(value)


def test_thinking_is_removed_without_mutating_transcript_or_owner_text(agent):
    from harnest.lib.model_context import without_thinking
    request = dict(messages=[dict(role='user', content='<think>Keep this literal markup</think>'),
        dict(role='assistant', content='Final answer', reasoning_content='private reasoning',
            thinking_blocks=[dict(thinking='internal')]),
        dict(role='assistant', content=[dict(type='thinking', thinking='internal'),
            dict(type='text', text='private', thought=True), dict(type='text', text='Public')]),
        dict(role='assistant', content='<think>private</think>\nResult'),
        dict(role='assistant', content='<think>unfinished'),
        dict(role='assistant', content=None, reasoning='private', tool_calls=[dict(id='call')])])
    original = copy.deepcopy(request)
    result = without_thinking(request)
    assert request == original
    assert result['messages'] == [original['messages'][0], dict(role='assistant', content='Final answer'),
        dict(role='assistant', content=[dict(type='text', text='Public')]), dict(role='assistant', content='Result'),
        dict(role='assistant', content=None, tool_calls=[dict(id='call')])]


def test_semantic_memory_preserves_recent_turns_reuses_cache_and_invalidates_edits(agent):
    async def check():
        from harnest.lib.model_context import compact_context, request_size, MAX_CONTEXT_BYTES
        request = dict(messages=[dict(role='system', content='Owner permissions still apply.'),
            dict(role='user', content='Remember report ID 42; do not publish.'),
            dict(role='assistant', content='Saved report 42. ' + 'verbose ' * 30_000, reasoning_content='SECRET_THOUGHT'),
            dict(role='user', content='What remains?'), dict(role='assistant', content='Review remains.'),
            dict(role='user', content='Continue with review only.')])
        original = copy.deepcopy(request)
        calls = []
        async def summarize(records, request):
            calls.append(copy.deepcopy(records))
            return 'Goal: Review report 42. Constraint: do not publish. Completed: report saved. Open: review.'
        memory = Memory()
        result = await compact_context(request, memory, summarize)
        assert request == original
        assert len(calls) == 1
        assert 'SECRET_THOUGHT' not in json.dumps(calls)
        assert result['messages'][0] == original['messages'][0]
        assert result['messages'][-3:] == original['messages'][-3:]
        assert 'report 42' in result['messages'][1]['content']
        assert request_size(result) <= MAX_CONTEXT_BYTES
        assert await compact_context(request, memory, summarize) == result
        assert len(calls) == 1
        request['messages'].extend([dict(role='assistant', content='Reviewed.'), dict(role='user', content='Explain.')])
        reused = await compact_context(request, memory, summarize)
        assert len(calls) == 1
        assert reused['messages'][-1] == request['messages'][-1]
        request['messages'][1]['content'] = 'Actually use report 99.'
        await compact_context(request, memory, summarize)
        assert len(calls) == 2
        assert 'Actually use report 99.' in json.dumps(calls[-1])

    asyncio.run(check())

def test_large_current_tool_result_is_summarized_with_pair_and_receipt_preserved(agent):
    async def check():
        from harnest.lib.model_context import compact_context
        request = dict(messages=[dict(role='user', content='Inspect the saved report.'),
            dict(role='assistant', content=None, tool_calls=[dict(id='read-1', function=dict(name='read', arguments='{"id":42}'))]),
            dict(role='tool', tool_call_id='read-1', content='read succeeded receipt 456\n' + 'data ' * 50_000)])
        calls = []
        async def summarize(records, request):
            calls.append(records)
            return 'Read succeeded, receipt 456. Report 42 total: 123. Do not repeat the read.'
        memory = Memory()
        result = await compact_context(request, memory, summarize)
        assert result['messages'][:2] == request['messages'][:2]
        assert result['messages'][2]['tool_call_id'] == 'read-1'
        assert 'receipt 456' in json.loads(result['messages'][2]['content'])['summary']
        assert await compact_context(request, memory, summarize) == result
        assert len(calls) == 1

    asyncio.run(check())

def test_compactor_failure_falls_back_without_repeating_actions_or_saving_bad_memory(agent):
    async def check():
        from harnest.lib.model_context import compact_context, request_size, MAX_CONTEXT_BYTES
        request = dict(messages=[dict(role='user', content='Read the report'),
            dict(role='assistant', content='large ' * 50_000), dict(role='user', content='Summarize')])
        async def fail(records, request):
            raise RuntimeError('provider unavailable')
        memory, reports = Memory(), []
        result = await compact_context(request, memory, fail, reports.append)
        assert request_size(result) <= MAX_CONTEXT_BYTES
        assert result['messages'][-1] == request['messages'][-1]
        assert memory.values == {}
        assert 'unavailable' in reports[-1]

    asyncio.run(check())



def test_compaction_boundary_does_not_split_outstanding_tool_calls(agent):
    from harnest.lib.model_context import history_boundary
    messages = [dict(role='user', content='Start'), dict(role='assistant', tool_calls=[dict(id='call')]),
        dict(role='user', content='Image observation')]
    assert history_boundary(messages) == 0
    messages.insert(2, dict(role='tool', tool_call_id='call', content='done'))
    assert history_boundary(messages) == 3


def test_compaction_worker_uses_resolved_connection_without_tools_or_recursion(agent):
    async def check():
        from harnest.lib.compaction_agent import CompactionRouting
        routing = CompactionRouting(dict(model='ollama_chat/chosen', api_base='http://127.0.0.1:1234', api_key='key', tools=['parent']))
        result = await routing.before_request(dict(messages=[dict(role='user', content='records')],
            tools=['unsafe'], tool_choice='auto', model='wrong'), None)
        assert result['model'] == 'ollama_chat/chosen'
        assert result['api_base'] == 'http://127.0.0.1:1234'
        assert result['think'] is False
        assert result['max_tokens'] == 2000
        assert result['tools'] is None and 'tool_choice' not in result

    asyncio.run(check())


def test_harnest_compaction_worker_runs_with_ephemeral_history(agent, monkeypatch):
    from harnest.lib.compaction_agent import compact_records
    from harnest.lib.model_context import SUMMARY_INSTRUCTIONS
    from google.adk.models import lite_llm
    from litellm import ModelResponse
    lite_llm._ensure_litellm_imported()
    observed = []
    async def complete(**request):
        observed.append(request)
        return ModelResponse(model='test', choices=[dict(index=0, finish_reason='stop',
            message=dict(role='assistant', content='Report 42 saved; do not publish.'))])
    monkeypatch.setattr(lite_llm, 'acompletion', complete)
    result = asyncio.run(compact_records('Report 42 saved. Do not publish.', SUMMARY_INSTRUCTIONS,
        dict(model='ollama_chat/test', api_base='http://127.0.0.1:1')))
    assert result == 'Report 42 saved; do not publish.'
    assert len(observed) == 1
    assert observed[0]['tools'] is None
    assert observed[0]['think'] is False
    assert len([message for message in observed[0]['messages'] if message['role'] == 'user']) == 1
