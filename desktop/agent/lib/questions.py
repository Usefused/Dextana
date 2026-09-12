"""Deliver worker questions independently of the delegate result barrier."""
import asyncio
import copy
from uuid import uuid4
from harnest.models.questions import QuestionsForm


async def without_run_deadline(deadline, operation):
    loop = asyncio.get_running_loop()
    remaining = max(0, deadline.when() - loop.time()) if deadline.when() is not None else None
    deadline.reschedule(None)
    try:
        return await operation
    finally:
        if not deadline.expired():
            deadline.reschedule(loop.time() + remaining if remaining is not None else None)


class Questions:
    def __init__(self, backend):
        self.backend = backend
        self.pending = {}

    def owner(self, activity):
        while activity.get('parentId'):
            activity = self.backend.get(activity['parentId'])
        return activity

    async def ask(self, activity, value):
        form = QuestionsForm.model_validate(value).model_dump(exclude_none=True)
        owner = self.owner(activity)
        if owner.get('archived'):
            raise ValueError('This chat is archived.')
        question = dict(id=str(uuid4()), activityId=activity['id'], sourceTitle=activity['title'],
                        form=form, status='pending')
        future = asyncio.get_running_loop().create_future()
        owner.setdefault('questions', []).append(question)
        self.pending[question['id']] = (owner['id'], activity['id'], question, future)
        try:
            self.backend.commit()
            return await future
        finally:
            self.pending.pop(question['id'], None)
            if question['status'] == 'pending':
                question['status'] = 'cancelled'
                self.backend.commit()

    def answer(self, data):
        pending = self.pending.get(data.get('questionId'))
        if not pending or pending[0] != data.get('activityId'):
            raise ValueError('This question is no longer waiting for an answer.')
        owner_id, source_id, question, future = pending
        if future.done() or source_id not in self.backend.tasks or self.backend.get(owner_id).get('archived'):
            raise ValueError('This question is no longer waiting for an answer.')
        prompt = data.get('prompt')
        if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 32000:
            raise ValueError('Enter an answer up to 32,000 characters.')
        source = self.backend.get(source_id)
        previous_context = copy.deepcopy(source.get('context'))
        files = data.get('files') or []
        question.update(status='answered', answer=prompt.strip())
        try:
            if files:
                from harnest.lib.activities import remember
                question['files'] = files
                for path in files:
                    remember(source, 'file', path, 'selected')
            self.backend.commit()
        except Exception:
            question['status'] = 'pending'
            question.pop('answer', None)
            question.pop('files', None)
            if previous_context is None:
                source.pop('context', None)
            else:
                source['context'] = previous_context
            raise
        future.set_result(dict(answer=prompt.strip(), source='owner', questionId=question['id'], **({'files': files} if files else {})))

    def answer_from_composer(self, activity, data):
        pending = [item for owner_id, source_id, item, future in self.pending.values()
            if owner_id == activity['id'] and item['status'] == 'pending' and not future.done()]
        own = [item for item in pending if item['activityId'] == activity['id']]
        candidates = own or pending
        if not candidates:
            return False
        if len(candidates) != 1:
            raise ValueError('Several agents have questions. Reply in the relevant question card so your answer reaches the right agent.')
        self.answer(dict(activityId=activity['id'], questionId=candidates[0]['id'], prompt=data['prompt'], files=data.get('files')))
        return True

    def answers(self, activity):
        return [dict(title=item['form']['title'], answer=item['answer'])
                for item in self.owner(activity).get('questions', [])
                if item['status'] == 'answered' and item['activityId'] == activity['id']]
