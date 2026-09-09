import asyncio
import copy
import pytest


def test_backend_queue_steer_and_restart(agent, tmp_path):
    from harnest.lib.activities import Activities

    async def check():
        backend = Activities(tmp_path)
        backend.configure({'settings': {'models': ['test'], 'ollamaUrl': 'http://127.0.0.1:11434'}})
        entered = asyncio.Queue()

        async def run(activity):
            activity['status'] = 'running'
            entered.put_nowait(activity['messages'][-1]['content'])
            await backend.bridge(activity, 'tool', {'name': 'browser'})
            activity['status'] = 'completed'

        backend.run = run
        activity_id = backend.start({'prompt': 'Original', 'model': 'test', 'reasoning': 'on'})
        assert await entered.get() == 'Original'
        activity = backend.get(activity_id)
        assert activity['reasoning'] == 'on'
        backend.select_model(dict(activityId=activity_id, model='test', reasoning='high'))
        assert activity['modelSelection'] == dict(model='test', reasoning='high')
        assert activity['reasoning'] == 'on'
        backend.start({'activityId': activity_id, 'prompt': 'Later', 'model': 'test'})
        backend.start({'activityId': activity_id, 'prompt': 'Correction', 'model': 'test', 'reasoning': 'off'})
        original_request = next(iter(backend.pending))
        correction = activity['queue'][1]['id']
        await backend.control('steer', {'activityId': activity_id, 'messageId': correction})
        assert await entered.get() == 'Correction'
        assert activity['reasoning'] == 'off'
        assert activity['messages'][-1]['reasoning'] == 'off'
        assert [q['prompt'] for q in activity['queue']] == ['Later']
        with pytest.raises(ValueError, match='no longer pending'):
            backend.resolve(original_request, {'activityId': activity_id, 'output': {}})
        await backend.cancel(activity_id)
        assert activity['status'] == 'cancelled'
        await backend.control('resume', {'activityId': activity_id})
        assert await entered.get() == 'Later'
        request = next(iter(backend.pending))
        backend.resolve(request, {'activityId': activity_id, 'output': {}})
        await backend.tasks[activity_id]
        assert activity['status'] == 'completed'
        assert activity['queue'] == []
        backend.select_model(dict(activityId=activity_id, model='test', reasoning='medium'))
        restored = Activities(tmp_path)
        assert restored.get(activity_id)['modelSelection'] == dict(model='test', reasoning='medium')
        assert restored.get(activity_id)['messages'] == activity['messages']
        # Durable core survives a stale desktop snapshot; importing is one-time.
        restored.configure({'activities': [], 'settings': backend.state['settings']})
        assert restored.get(activity_id)['messages'] == activity['messages']

    asyncio.run(check())


def test_backend_workers_share_scope_but_not_local_permissions(agent, tmp_path):
    from harnest.lib.activities import Activities

    async def check():
        backend = Activities(tmp_path)
        backend.configure({'settings': {'models': ['test'], 'ollamaUrl': 'http://127.0.0.1:11434'}})
        parent = dict(id='parent', title='Parent', model='test', ollamaUrl='http://127.0.0.1:11434', status='running', messages=[], events=[], activePlanId='plan', permissions={'browser': True}, plans=[dict(id='plan', status='approved')])
        backend.state['activities'].append(parent)
        observed = []

        async def run(activity):
            observed.append(copy.deepcopy(activity))
            activity['messages'].append(dict(role='assistant', content='Worker done'))
            activity['status'] = 'completed'

        backend.run = run
        result = await backend.delegate(parent, [{'prompt': 'First', 'model': ''}, {'prompt': 'Second'}])
        assert len(result['workers']) == 2
        assert all(w['result'] == 'Worker done' for w in result['workers'])
        assert all(a['activePlanId'] == 'plan' and a['planOwnerId'] == 'parent' for a in observed)
        assert all('permissions' not in a and 'allowAllApprovals' not in a for a in observed)
        parent['status'] = 'running'
        backend.commit()
        restored = Activities(tmp_path)
        assert restored.get('parent')['status'] == 'interrupted'
        assert restored.get('parent')['plans'][0]['status'] == 'interrupted'
        assert 'activePlanId' not in restored.get('parent')

    asyncio.run(check())


def test_backend_plan_decisions_and_fifo_are_durable_before_execution(agent, tmp_path):
    from harnest.lib.activities import Activities

    async def check():
        backend = Activities(tmp_path)
        backend.configure({'settings': {'models': ['test'], 'ollamaUrl': 'http://127.0.0.1:11434'}})
        activity = dict(id='plan-chat', title='Plan', model='test', ollamaUrl='', status='awaiting_plan', messages=[], events=[], mode='plan', plans=[dict(id='plan', title='Report', status='proposed')])
        backend.state['activities'].append(activity)
        ran = []
        release = asyncio.Queue()

        async def run(current):
            saved = backend.repository.load()['activities'][0]
            assert saved['messages'] == current['messages']
            ran.append(current['messages'][-1]['content'])
            await release.get()
            current['status'] = 'completed'

        backend.run = run
        await backend.control('plan', {'activityId': activity['id'], 'planId': 'plan', 'approved': False})
        with pytest.raises(ValueError, match='no longer waiting'):
            await backend.control('plan', {'activityId': activity['id'], 'planId': 'plan', 'approved': True})
        assert not ran
        activity['plans'].append(dict(id='new', title='Revised', status='proposed'))
        activity['status'] = 'awaiting_plan'
        # A failed durable write cannot launch approved work.
        save = backend.repository.save
        backend.repository.save = lambda _: (_ for _ in ()).throw(OSError('Disk full'))
        with pytest.raises(OSError):
            await backend.control('plan', {'activityId': activity['id'], 'planId': 'new', 'approved': True})
        assert not backend.tasks and not ran
        backend.repository.save = save
        activity['plans'][-1]['status'] = 'proposed'
        activity['status'] = 'awaiting_plan'
        await backend.control('plan', {'activityId': activity['id'], 'planId': 'new', 'approved': True})
        await asyncio.sleep(0)
        backend.start(dict(activityId=activity['id'], model='test', prompt='Second'))
        backend.start(dict(activityId=activity['id'], model='test', prompt='Third'))
        release.put_nowait(None)
        await asyncio.sleep(0)
        assert ran[-1] == 'Second'
        release.put_nowait(None)
        await asyncio.sleep(0)
        assert ran[-1] == 'Third'
        release.put_nowait(None)
        await backend.tasks[activity['id']]
        assert not activity['queue']

    asyncio.run(check())


def test_cancel_before_coroutine_entry_releases_run_slot_and_scope(agent, tmp_path):
    from harnest.lib.activities import Activities

    async def check():
        backend = Activities(tmp_path)
        backend.configure({'settings': {'models': ['test'], 'ollamaUrl': ''}})
        ran = []
        async def run(activity):
            ran.append(activity['id'])
        backend.run = run
        activity_id = backend.start(dict(prompt='Cancel immediately', model='test'))
        await backend.cancel(activity_id)
        assert not ran and not backend.tasks
        assert backend.get(activity_id)['status'] == 'cancelled'
        assert Activities(tmp_path).get(activity_id)['status'] == 'cancelled'

    asyncio.run(check())


def test_parent_cancellation_retires_workers_and_their_local_requests(agent, tmp_path):
    from harnest.lib.activities import Activities

    async def check():
        backend = Activities(tmp_path)
        backend.configure({'settings': {'models': ['test'], 'ollamaUrl': ''}})
        entered = asyncio.Queue()
        async def run(activity):
            if not activity.get('parentId'):
                await backend.delegate(activity, [{'prompt': 'Worker one'}, {'prompt': 'Worker two'}])
            else:
                entered.put_nowait(activity['id'])
                await backend.bridge(activity, 'tool', {'name': 'browser'})
        backend.run = run
        parent = backend.start(dict(prompt='Parent', model='test'))
        children = [await entered.get(), await entered.get()]
        assert len(backend.pending) == 2
        await backend.cancel(parent)
        assert not backend.pending and not backend.tasks
        assert all(backend.get(i)['status'] == 'cancelled' for i in [parent, *children])

    asyncio.run(check())


def test_rejected_start_and_failed_queue_save_preserve_live_message_identity(agent, tmp_path):
    from harnest.lib.activities import Activities

    async def check():
        backend = Activities(tmp_path)
        backend.configure({'settings': {'models': ['test'], 'ollamaUrl': ''}})
        entered = asyncio.Queue()
        async def run(activity):
            message = dict(role='assistant', content='First')
            activity['messages'].append(message)
            entered.put_nowait(message)
            await backend.bridge(activity, 'tool', {})
            message['content'] += ' final'
            activity['status'] = 'completed'
        backend.run = run
        first = backend.start(dict(prompt='First', model='test'))
        message = await entered.get()
        with pytest.raises(ValueError):
            backend.start(dict(prompt='Invalid model', model='missing'))
        assert backend.get(first)['messages'][-1] is message
        save = backend.repository.save
        backend.repository.save = lambda _: (_ for _ in ()).throw(OSError('Disk full'))
        with pytest.raises(OSError):
            backend.start(dict(activityId=first, prompt='Cannot save queue', model='test'))
        backend.repository.save = save
        assert backend.get(first)['messages'][-1] is message
        assert not backend.get(first).get('queue')
        request = next(iter(backend.pending))
        backend.resolve(request, {'activityId': first, 'output': {}})
        await backend.tasks[first]
        assert backend.repository.load()['activities'][0]['messages'][-1]['content'] == 'First final'

    asyncio.run(check())


def test_edit_latest_message_replaces_turn_and_preserves_history_receipts_and_files(agent, tmp_path):
    from harnest.lib.activities import Activities

    async def check():
        backend = Activities(tmp_path)
        history = [dict(id='earlier', role='user', content='Earlier request', model='test'),
                   dict(id='answer', role='assistant', content='Earlier answer', model='test')]
        original = dict(id='last', role='user', content='Old request', model='test', mode='plan', files=['/tmp/report.txt'])
        backend.configure(dict(settings=dict(models=['test'], ollamaUrl=''), activities=[dict(
            id='chat', title='Chat', model='test', status='awaiting_plan', mode='plan', runtimeSessionId='old-session',
            activePlanId='old-plan', messages=history + [original, dict(id='automatic', role='user', content='Approved plan', model='test', generated=True), dict(id='old-answer', role='assistant', content='Obsolete answer', model='test')],
            plans=[dict(id='old-plan', messageId='old-answer', status='proposed')], events=['Created report.txt'])]))
        seen = []
        async def run(activity):
            seen.append(copy.deepcopy(activity))
            activity['messages'].append(dict(id='new-answer', role='assistant', content='Revised answer', model='test'))
            activity['status'] = 'completed'
        backend.run = run
        backend.edit_message(dict(activityId='chat', messageId='last', prompt='Revised request'))
        await backend.tasks['chat']
        activity = backend.get('chat')
        assert activity['messages'][:2] == history
        assert activity['messages'][2]['id'] == original['id']
        assert activity['messages'][2]['content'] == 'Revised request'
        assert activity['messages'][2]['files'] == original['files']
        assert activity['messages'][2]['editedAt']
        assert seen[0]['turnMode'] == 'plan'
        assert 'runtimeSessionId' not in seen[0]
        assert 'activePlanId' not in seen[0]
        assert activity['plans'] == []
        assert activity['events'] == ['Created report.txt']
        assert Activities(tmp_path).get('chat')['messages'] == activity['messages']
    asyncio.run(check())


def test_edit_message_rejects_stale_busy_and_invalid_changes_without_losing_the_turn(agent, tmp_path):
    from harnest.lib.activities import Activities

    async def check():
        backend = Activities(tmp_path)
        backend.configure(dict(settings=dict(models=['test'], ollamaUrl=''), activities=[dict(
            id='chat', title='Chat', model='test', status='completed', runtimeSessionId='saved-session',
            messages=[dict(id='last', role='user', content='Original', model='test'),
                      dict(id='answer', role='assistant', content='Keep this answer', model='test')], events=[])]))
        activity = backend.get('chat')
        data = dict(activityId='chat', messageId='last', prompt='Edited')
        previous = copy.deepcopy(activity)
        for patch in [dict(messageId='old'), dict(prompt=' '), dict(prompt='x' * 32001)]:
            with pytest.raises(ValueError):
                backend.edit_message(dict(data, **patch))
            assert activity == previous
        for field, value in [('archived', True), ('parentId', 'parent'), ('queue', [dict(id='queued')]), ('approval', dict(id='pending'))]:
            activity[field] = value
            with pytest.raises(ValueError):
                backend.edit_message(data)
            activity.pop(field)
            assert activity == previous
        for pending in (backend.tasks, backend.deciding):
            if isinstance(pending, dict):
                pending['chat'] = object()
            else:
                pending.add('chat')
            with pytest.raises(ValueError):
                backend.edit_message(data)
            if isinstance(pending, dict):
                pending.pop('chat')
            else:
                pending.discard('chat')
            assert activity == previous
        activity['messages'][0]['generated'] = True
        with pytest.raises(ValueError):
            backend.edit_message(data)
        activity['messages'][0].pop('generated')
        save = backend.repository.save
        backend.repository.save = lambda _: (_ for _ in ()).throw(OSError('Disk full'))
        with pytest.raises(OSError):
            backend.edit_message(data)
        backend.repository.save = save
        assert activity == previous
        assert backend.repository.load()['activities'][0] == previous
        assert not backend.tasks
    asyncio.run(check())


def test_desktop_context_and_file_handles_survive_backend_restart(agent, tmp_path):
    from harnest.lib.activities import Activities
    backend = Activities(tmp_path)
    backend.configure(dict(activities=[dict(id='chat', messages=[], events=[], status='completed')]))
    references = [dict(id='file-handle', kind='file', location='/Documents/report.xlsx', status='created', name='report.xlsx'),
                  dict(id='desktop-handle', kind='desktop', location='desktop:time:timer', status='referenced', name='Tea', desktop=dict(work='time', resourceId='timer', operation='timer', state='running'))]
    backend.configure(dict(local=[dict(id='chat', context=references)]))
    assert backend.get('chat')['context'] == references
    references[1]['desktop']['state'] = 'ringing'
    backend.configure(dict(local=[dict(id='chat', context=references)]))
    restored = Activities(tmp_path)
    assert restored.get('chat')['context'] == references
