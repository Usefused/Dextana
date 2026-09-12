import asyncio
import copy
import pytest


def test_question_replies_are_atomic_persistent_and_cannot_replay(agent, tmp_path):
    from harnest.lib.activities import Activities

    async def check():
        backend = Activities(tmp_path)
        backend.configure({'settings': {'models': ['test'], 'ollamaUrl': ''}})
        question = dict(id='question', role='assistant', content='Who is this for?', model='test')
        activity = dict(id='chat', title='Report', model='test', status='completed', messages=[question], events=[], mode='plan')
        backend.state['activities'] = [activity]
        backend.commit()

        async def run(current):
            current['status'] = 'completed'

        backend.run = run
        data = dict(activityId='chat', model='test', prompt='My team', mode='plan', replyToMessageId='question')
        for patch in [dict(parentId='parent'), dict(archived=True), dict(status='running'), dict(approval={'id': 'approval'}), dict(queue=[{'id': 'queued'}])]:
            original = copy.deepcopy(activity)
            activity.update(patch)
            with pytest.raises(ValueError, match='no longer waiting'):
                backend.start(data)
            activity.clear()
            activity.update(original)
        with pytest.raises(ValueError, match='no longer waiting'):
            backend.start(dict(data, replyToMessageId='another-chat-question'))
        backend.start(data)
        assert activity['messages'][-1]['replyToMessageId'] == 'question'
        assert activity['turnMode'] == 'plan'
        with pytest.raises(ValueError, match='no longer waiting'):
            backend.start(data)
        assert not activity.get('queue')
        await backend.tasks['chat']
        backend.commit()
        restored = Activities(tmp_path)
        assert restored.get('chat')['messages'][-1]['replyToMessageId'] == 'question'
        with pytest.raises(ValueError, match='no longer waiting'):
            restored.start(data)
        backend.edit_message(dict(activityId='chat', messageId=activity['messages'][-1]['id'], prompt='Leadership instead'))
        assert activity['messages'][-1]['replyToMessageId'] == 'question'
        await backend.tasks['chat']

    asyncio.run(check())
