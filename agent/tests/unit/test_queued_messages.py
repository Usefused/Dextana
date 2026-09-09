import asyncio
import copy
import pytest


def test_queue_changes_are_durable_preserve_metadata_and_do_not_interrupt_work(agent, tmp_path):
    from harnest.lib.activities import Activities

    async def check():
        backend = Activities(tmp_path)
        backend.configure({'settings': {'models': ['test'], 'ollamaUrl': ''}})
        entered, release = asyncio.Queue(), asyncio.Queue()

        async def run(activity):
            activity['status'] = 'running'
            entered.put_nowait(activity['messages'][-1]['content'])
            await release.get()
            activity['status'] = 'completed'

        backend.run = run
        identifier = backend.start(dict(prompt='Current work', model='test'))
        assert await entered.get() == 'Current work'
        activity = backend.get(identifier)
        for prompt in ['Delete this', 'Edit this', 'Last in queue']:
            backend.start(dict(activityId=identifier, prompt=prompt, model='test', reasoning='high'))
        first, second, third = copy.deepcopy(activity['queue'])
        current_message = activity['messages'][-1]
        second_data = dict(activityId=identifier, messageId=second['id'], action='edit', prompt='  Revised work  ')
        backend.update_queued_message(second_data)
        backend.update_queued_message(dict(activityId=identifier, messageId=first['id'], action='delete'))
        expected = [dict(second, prompt='Revised work'), third]
        assert activity['queue'] == expected
        assert activity['messages'][-1] is current_message
        assert activity['status'] == 'running' and entered.empty()
        assert Activities(tmp_path).get(identifier)['queue'] == expected

        original_queue = activity['queue']
        save = backend.repository.save
        backend.repository.save = lambda _: (_ for _ in ()).throw(OSError('Disk full'))
        for action in ['edit', 'delete']:
            with pytest.raises(OSError, match='Disk full'):
                backend.update_queued_message(dict(second_data, action=action, prompt='Unsaved'))
            assert activity['queue'] is original_queue
        backend.repository.save = save

        release.put_nowait(None)
        assert await entered.get() == 'Revised work'
        for action in ['edit', 'delete']:
            with pytest.raises(ValueError, match='no longer queued'):
                backend.update_queued_message(dict(second_data, action=action))
        assert activity['messages'][-1]['content'] == 'Revised work'
        release.put_nowait(None)
        assert await entered.get() == 'Last in queue'
        release.put_nowait(None)
        await backend.tasks[identifier]
        assert activity['status'] == 'completed' and not activity['queue']

    asyncio.run(check())


def test_invalid_queue_changes_preserve_the_queue(agent, tmp_path):
    from harnest.lib.activities import Activities
    backend = Activities(tmp_path)
    backend.configure({'settings': {'models': ['test'], 'ollamaUrl': ''}})
    activity = dict(id='chat', status='cancelled', messages=[], queue=[dict(id='queued', prompt='Keep me', model='test')])
    backend.state['activities'].append(activity)
    data = dict(activityId='chat', messageId='queued', action='edit', prompt='Updated')
    for patch in [dict(prompt=''), dict(prompt='  '), dict(prompt=None), dict(prompt='x' * 32001), dict(action='unknown'), dict(messageId='other')]:
        with pytest.raises(ValueError):
            backend.update_queued_message(dict(data, **patch))
    for key in ['archived', 'parentId']:
        activity[key] = True
        with pytest.raises(ValueError):
            backend.update_queued_message(data)
        del activity[key]
    backend.deciding.add('chat')
    with pytest.raises(ValueError):
        backend.update_queued_message(data)
    assert activity['queue'][0]['prompt'] == 'Keep me'
