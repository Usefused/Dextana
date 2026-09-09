import asyncio
import json
import pytest


def setup(agent, tmp_path):
    from harnest.lib.activity_state import ActivityState
    from harnest.lib.memory import Memory
    repository = ActivityState(tmp_path)
    return Memory(repository.connect), repository


async def vectors(texts):
    return [[1, 0] if 'unrelated' not in text else [0, 1] for text in texts]


async def save(memory, text, *, owner='owner', scope='', key='company.audience', source='chat/turn'):
    memory.enqueue(owner, scope, source, [dict(role='user', content=text or 'Forget that')])
    async def extract(records, existing):
        return [dict(key=key, text=text)]
    await memory.capture(owner, memory.pending(owner), 'model-a', 2, vectors, extract)


def test_recall_across_restart_is_scoped_and_updates_replace_facts(agent, tmp_path):
    memory, repository = setup(agent, tmp_path)
    async def check():
        await save(memory, 'Our customers are accountants.')
        await save(memory, 'Other user secret', owner='other')
        await save(memory, 'Private project fact', scope='private')
        from harnest.lib.memory import Memory
        restored = Memory(repository.connect)
        result = await restored.recall('owner', '', 'Write a landing page', 'model-a', 2, vectors)
        assert [m['text'] for m in result] == ['Our customers are accountants.']
        assert result[0]['source'] == 'chat/turn'
        assert await restored.recall('owner', '', 'unrelated', 'model-a', 2, vectors) == []
        await save(restored, 'Our customers are dentists.', source='new/correction')
        assert [m['text'] for m in await restored.recall('owner', '', 'homepage', 'model-a', 2, vectors)] == ['Our customers are dentists.']
        await save(restored, '', source='new/forget')
        assert await restored.recall('owner', '', 'homepage', 'model-a', 2, vectors) == []
    asyncio.run(check())


def test_new_embedding_profile_reindexes_and_reuses_vectors(agent, tmp_path):
    memory, _ = setup(agent, tmp_path)
    calls = []
    async def new_vectors(texts):
        calls.append(texts)
        return [[0, 0, 1] for _ in texts]
    async def check():
        await save(memory, 'Our customers are accountants.')
        result = await memory.recall('owner', '', 'homepage', 'model-b', 3, new_vectors)
        assert len(result) == 1
        assert calls == [['Our customers are accountants.'], ['homepage']]
        calls.clear()
        await memory.recall('owner', '', 'another query', 'model-b', 3, new_vectors)
        assert calls == [['another query']]
    asyncio.run(check())


def test_jobs_are_idempotent_and_edited_sources_cancel_inflight_writes(agent, tmp_path):
    memory, repository = setup(agent, tmp_path)
    async def check():
        records = [dict(role='user', content='We serve accountants')]
        identifier = memory.enqueue('owner', '', 'chat/turn', records)
        assert memory.enqueue('owner', '', 'chat/turn', records) == identifier
        from harnest.lib.memory import Memory
        restored = Memory(repository.connect)
        job = restored.pending('owner')
        assert job['id'] == identifier
        async def extract(records, existing):
            restored.forget_source('owner', 'chat/turn')
            return [dict(key='audience', text='Accountants')]
        assert await restored.capture('owner', job, 'model-a', 2, vectors, extract) == 0
        assert not restored.pending('owner')
        assert await restored.recall('owner', '', 'homepage', 'model-a', 2, vectors) == []
    asyncio.run(check())


def test_invalid_extraction_is_atomic_and_failed_jobs_have_bounded_retries(agent, tmp_path):
    memory, _ = setup(agent, tmp_path)
    async def check():
        identifier = memory.enqueue('owner', '', 'source', [dict(role='user', content='Hello')])
        async def extract(records, existing):
            return [dict(key='valid', text='Fact'), dict(key='broken', text=3)]
        with pytest.raises(ValueError):
            await memory.capture('owner', memory.pending('owner'), 'model-a', 2, vectors, extract)
        assert await memory.recall('owner', '', 'query', 'model-a', 2, vectors) == []
        for _ in range(3):
            memory.failed(identifier)
        assert not memory.pending('owner')
    asyncio.run(check())


@pytest.mark.parametrize('vector', [[], [True], [float('nan')], [float('inf')], [0, 0], ['1']])
def test_invalid_vectors_are_rejected(agent, vector):
    from harnest.lib.memory import normalized
    with pytest.raises(ValueError):
        normalized(vector)


def test_shared_distillation_caches_and_compaction_reuses_exact_turns(agent, tmp_path, monkeypatch):
    _, repository = setup(agent, tmp_path)
    from harnest.lib import distillation
    calls = []
    async def worker(text, instructions, request):
        calls.append(json.loads(text))
        assert 'personal memories' in instructions
        return json.dumps(dict(summary='Turn summary', memories=[dict(key='audience', text='Accountants')]))
    monkeypatch.setattr(distillation, 'compact_records', worker)
    async def check():
        shared = distillation.Distillation(repository.connect)
        turn = [dict(role='user', content='We serve accountants'), dict(role='assistant', content='Understood')]
        results = await asyncio.gather(*(shared.get('owner', turn, [], {}) for _ in range(2)))
        assert results[0] == results[1]
        assert len(calls) == 1
        restored = distillation.Distillation(repository.connect)
        assert restored.reuse('owner', turn) == 'Turn summary'
        assert restored.reuse('owner', [turn[0], dict(turn[1], tool_calls=None)]) == 'Turn summary'
        assert restored.reuse('owner', [turn[0], dict(turn[1], tool_calls=[dict(id='new-call')])]) is None
        assert restored.reuse('other', turn) is None
        assert restored.reuse('owner', [*turn, dict(role='tool', content='Additional result')]) is None
        await restored.get('owner', [dict(role='user', content='Second turn')], [], {})
        assert restored.reuse('owner', [*turn, dict(role='user', content='Second turn')]) == 'Turn summary\n\nTurn summary'
        assert len(calls) == 2
    asyncio.run(check())


def test_disabled_memory_does_not_call_models_or_enqueue(agent, tmp_path):
    from harnest.lib.activities import Activities
    async def check():
        backend = Activities(tmp_path)
        backend.configure(dict(settings=dict(models=['chat'], ollamaUrl='http://localhost:11434')))
        activity = dict(id='test', status='completed', events=[], messages=[dict(id='turn', role='user', content='Remember me')])
        await backend.memory.before(activity)
        backend.memory.after(activity)
        assert backend.memory.worker is None
        assert backend.memory.store.pending('owner') is None
        await backend.close()
    asyncio.run(check())


def test_historical_compaction_cannot_restore_an_edited_or_forgotten_fact(agent, tmp_path):
    memory, _ = setup(agent, tmp_path)
    async def check():
        await save(memory, 'Accountants', source='chat/editable')
        memory.forget_source('owner', 'chat/editable')
        memory.enqueue('owner', '', 'historical', [dict(role='user', content='Accountants')], updated='')
        async def extract(records, existing):
            return [dict(key='company.audience', text='Accountants')]
        assert await memory.capture('owner', memory.pending('owner'), 'model-a', 2, vectors, extract) == 0
        assert await memory.recall('owner', '', 'homepage', 'model-a', 2, vectors) == []
    asyncio.run(check())


def test_memory_context_preserves_unabridged_results_for_routing_budget_and_turn_records(agent, tmp_path):
    from harnest.lib.activities import Activities
    from harnest.lib.model_context import MAX_CONTEXT_BYTES, request_size
    backend = Activities(tmp_path)
    # No configure/wake: inspect the adapter without launching a worker.
    backend.memory.settings = dict(embeddingModel='vectors', embeddingDimensions=2)
    backend.memory.contexts['chat'] = [dict(text='Fact ' * 150, source='private-chat/private-message', key='private-key', scope='private-scope')]
    owner = dict(role='user', content='Current owner request')
    first = dict(messages=[dict(role='user', content='Earlier'), dict(role='assistant', content='Earlier reply'), owner])
    backend.memory.model_context('chat', first)
    tool = dict(role='tool', tool_call_id='call', content='Result ' * 28000)
    shifted = dict(messages=[dict(role='assistant', content='Earlier summary'), owner, tool])
    result = backend.memory.model_context('chat', shifted)
    assert 'private-' not in result['messages'][0]['content']
    assert 'Fact ' in result['messages'][0]['content']
    assert request_size(result) > MAX_CONTEXT_BYTES  # Routing must see the full result before summarizing.
    assert result['messages'][-1] == tool
    assert owner in result['messages']
    assert backend.memory.records['chat'][1] == [owner, tool]
    assert shifted['messages'][-1] == tool  # No mutation of the saved transcript.


def test_recalled_memory_leaves_static_instruction_prefix_cacheable(agent, tmp_path):
    from harnest.lib.activities import Activities
    backend = Activities(tmp_path)
    memory = backend.memory
    memory.settings = dict(embeddingModel='vectors', embeddingDimensions=2)
    instructions = [dict(role='system', content='Stable instructions'), dict(role='developer', content='Stable rules')]
    owner = dict(role='user', content='Write a description')
    request = dict(messages=instructions + [owner])
    for fact in ['Concise writing.', 'Detailed writing.']:
        memory.contexts['chat'] = [dict(text=fact)]
        result = memory.model_context('chat', request)
        assert result['messages'][:2] == instructions
        assert fact in result['messages'][2]['content']
        assert result['messages'][3:] == [owner]
    assert request['messages'] == instructions + [owner]
