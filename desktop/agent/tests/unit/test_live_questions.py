import asyncio
import pytest

FORM = dict(title='Audience', questions=[dict(id='audience', prompt='Who is this for?', type='text')])


def test_worker_question_reaches_parent_before_sibling_completes_and_routes_answer(agent, tmp_path):
    from harnest.lib.activities import Activities

    async def check():
        backend = Activities(tmp_path)
        backend.configure({'settings': {'models': ['test'], 'ollamaUrl': ''}})
        sibling = asyncio.Event()
        sibling_done = asyncio.Event()
        answered = asyncio.Queue()
        aggregate = asyncio.Queue()

        async def run(activity):
            if not activity.get('parentId'):
                aggregate.put_nowait(await backend.delegate(activity, [dict(prompt='Question worker'), dict(prompt='Independent worker')]))
            elif activity['title'] == 'Question worker':
                answered.put_nowait(await backend.questions.ask(activity, FORM))
            else:
                await sibling.wait()
                sibling_done.set()
            activity['status'] = 'completed'

        backend.run = run
        parent_id = backend.start(dict(model='test', prompt='Coordinate work'))
        parent = backend.get(parent_id)
        while not parent.get('questions'):
            backend.changed.clear()
            await asyncio.wait_for(backend.changed.wait(), 1)
        question = parent['questions'][0]
        assert question['status'] == 'pending'
        assert not sibling_done.is_set() and aggregate.empty()
        with pytest.raises(ValueError, match='no longer waiting'):
            backend.questions.answer(dict(activityId='wrong-parent', questionId=question['id'], prompt='Wrong destination'))
        sibling.set()
        await asyncio.wait_for(sibling_done.wait(), 1)
        assert question['status'] == 'pending' and aggregate.empty()
        data = dict(activityId=parent_id, questionId=question['id'], prompt='My team')
        save = backend.repository.save
        backend.repository.save = lambda _: (_ for _ in ()).throw(OSError('Disk full'))
        with pytest.raises(OSError):
            backend.questions.answer(data)
        backend.repository.save = save
        assert question['status'] == 'pending' and answered.empty()
        backend.questions.answer(data)
        with pytest.raises(ValueError, match='no longer waiting'):
            backend.questions.answer(data)
        result = await asyncio.wait_for(answered.get(), 1)
        assert result['answer'] == 'My team'
        await backend.tasks[parent_id]
        workers = (await aggregate.get())['workers']
        assert next(worker for worker in workers if worker['id'] == question['activityId'])['clarifications'] == [dict(title='Audience', answer='My team')]
        assert all(worker['status'] == 'completed' for worker in workers)
        restored = Activities(tmp_path)
        assert restored.get(parent_id)['questions'][0]['answer'] == 'My team'

    asyncio.run(check())


def test_parallel_questions_remain_independent_and_parent_cancel_closes_them(agent, tmp_path):
    from harnest.lib.activities import Activities

    async def check():
        backend = Activities(tmp_path)
        backend.configure({'settings': {'models': ['test'], 'ollamaUrl': ''}})
        async def run(activity):
            if not activity.get('parentId'):
                await backend.delegate(activity, [dict(prompt='Worker A'), dict(prompt='Worker B')])
            else:
                await backend.questions.ask(activity, FORM)
            activity['status'] = 'completed'
        backend.run = run
        parent_id = backend.start(dict(prompt='Parent', model='test'))
        parent = backend.get(parent_id)
        while len(parent.get('questions', [])) < 2:
            backend.changed.clear()
            await asyncio.wait_for(backend.changed.wait(), 1)
        first, second = parent['questions']
        with pytest.raises(ValueError, match='Several agents'):
            backend.start(dict(activityId=parent_id, prompt='Ambiguous reply', model='test'))
        assert first['status'] == second['status'] == 'pending' and not parent.get('queue')
        backend.questions.answer(dict(activityId=parent_id, questionId=first['id'], prompt='First answer'))
        assert first['status'] == 'answered' and second['status'] == 'pending'
        await backend.cancel(parent_id)
        assert second['status'] == 'cancelled'
        assert not backend.questions.pending
        with pytest.raises(ValueError, match='no longer waiting'):
            backend.questions.answer(dict(activityId=parent_id, questionId=second['id'], prompt='Too late'))
        second['status'] = 'pending'
        backend.commit()
        assert Activities(tmp_path).get(parent_id)['questions'][1]['status'] == 'cancelled'

    asyncio.run(check())


def test_waiting_for_an_answer_pauses_then_restores_the_execution_deadline(agent):
    from harnest.lib.questions import without_run_deadline

    async def check():
        with pytest.raises(TimeoutError):
            async with asyncio.timeout(0.03) as deadline:
                await without_run_deadline(deadline, asyncio.sleep(0.06))
                assert not deadline.expired() and deadline.when() is not None
                await asyncio.sleep(0.06)
    asyncio.run(check())


@pytest.mark.parametrize('delegated', [False, True])
def test_composer_answers_waiting_agent_without_queueing_or_restarting(agent, tmp_path, delegated):
    from harnest.lib.activities import Activities
    async def check():
        backend = Activities(tmp_path)
        backend.configure({'settings': {'models': ['test'], 'ollamaUrl': ''}})
        entered = []
        result = asyncio.Queue()
        async def run(activity):
            entered.append(activity['id'])
            if delegated and not activity.get('parentId'):
                await backend.delegate(activity, [dict(prompt='Question worker')])
            else:
                result.put_nowait(await backend.questions.ask(activity, FORM))
            activity['status'] = 'completed'
        backend.run = run
        owner_id = backend.start(dict(prompt='Composer answer', model='test'))
        owner = backend.get(owner_id)
        while not owner.get('questions'):
            backend.changed.clear()
            await asyncio.wait_for(backend.changed.wait(), 1)
        question = owner['questions'][0]
        task = backend.tasks[owner_id]
        source = backend.get(question['activityId'])
        data = dict(activityId=owner_id, prompt='My team', model='test', files=['/tmp/brief.txt'])
        save = backend.repository.save
        backend.repository.save = lambda _: (_ for _ in ()).throw(OSError('Disk full'))
        with pytest.raises(OSError):
            backend.start(data)
        backend.repository.save = save
        assert question['status'] == 'pending' and result.empty()
        assert not source.get('context') and not question.get('files')
        assert backend.start(data) == owner_id
        assert backend.tasks[owner_id] is task and not owner.get('queue')
        answer = await asyncio.wait_for(result.get(), 1)
        assert answer['answer'] == 'My team' and answer['files'] == ['/tmp/brief.txt']
        assert source['context'][0]['location'] == '/tmp/brief.txt'
        await task
        assert len(entered) == (2 if delegated else 1)
        assert question['status'] == 'answered'
        assert Activities(tmp_path).get(owner_id)['questions'][0]['answer'] == 'My team'
    asyncio.run(check())
