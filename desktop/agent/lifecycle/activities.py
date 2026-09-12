import asyncio
import os
from secrets import compare_digest
from fastapi import APIRouter, Depends, HTTPException, Request
from harnest import lifecycle
from harnest.lib.activities import service


@lifecycle.resource
async def activity_worker():
    backend = service()
    try:
        yield backend
    finally:
        await backend.close()


@lifecycle.http_routes
def activity_routes(agent):
    def owner(request: Request):
        token = os.environ.get('DEXTANA_RUNTIME_TOKEN', '')
        if not token or not compare_digest(request.headers.get('authorization', ''), 'Bearer ' + token):
            raise HTTPException(401, 'Desktop authentication required')

    router = APIRouter(prefix='/dextana/activity', dependencies=[Depends(owner)])

    def snapshot():
        backend = service()
        return dict(revision=backend.revision, activities=(backend.state or {}).get('activities', []), requests=[{k: v for k, v in r.items() if k != 'future'} for r in backend.pending.values()])

    @router.get('/skills')
    async def skills_list():
        from harnest.lib.settings_store import skills
        return skills()

    @router.post('/skills')
    async def skills_save(request: Request):
        from harnest.lib.settings_store import save_skill
        try:
            return save_skill(await request.json())
        except (ValueError, TypeError) as error:
            raise HTTPException(400, str(error)) from None

    @router.post('/skills/import')
    async def skills_import(request: Request):
        from harnest.lib.settings_store import import_skill
        try:
            return import_skill((await request.json()).get('markdown'))
        except (ValueError, TypeError) as error:
            raise HTTPException(400, str(error)) from None

    @router.delete('/skills/{identifier}')
    async def skills_delete(identifier: str):
        from harnest.lib.settings_store import delete_skill
        try:
            delete_skill(identifier)
            return {'ok': True}
        except ValueError as error:
            raise HTTPException(400, str(error)) from None

    @router.get('/teaching/skills')
    async def teaching_skills_list():
        from harnest.lib.settings_store import taught_skills
        return taught_skills()

    @router.post('/teaching/draft')
    async def teaching_draft(request: Request):
        from harnest.lib.teaching_skills import draft_teaching
        try:
            return draft_teaching(await request.json())
        except (ValueError, TypeError) as error:
            raise HTTPException(400, str(error)) from None

    @router.post('/teaching/skills')
    async def teaching_skill_save(request: Request):
        from harnest.lib.settings_store import save_taught_skill
        try:
            return save_taught_skill(await request.json())
        except (ValueError, TypeError) as error:
            raise HTTPException(400, str(error)) from None

    @router.post('/teaching/skills/{identifier}/archive')
    async def teaching_skill_archive(identifier: str, request: Request):
        from harnest.lib.settings_store import archive_taught_skill
        try:
            return archive_taught_skill(identifier, (await request.json()).get('archived'))
        except (ValueError, TypeError) as error:
            raise HTTPException(400, str(error)) from None

    @router.post('/teaching/skills/{identifier}/test')
    async def teaching_skill_test(identifier: str, request: Request):
        from harnest.lib.settings_store import record_taught_test
        try:
            return record_taught_test(identifier, await request.json())
        except (ValueError, TypeError) as error:
            raise HTTPException(400, str(error)) from None

    @router.get('/usage')
    async def usage(period: str = '30d'):
        from harnest.lib.settings_store import usage_summary
        try:
            return usage_summary(period)
        except ValueError as error:
            raise HTTPException(400, str(error)) from None

    @router.post('/model-connections')
    async def model_connections(request: Request):
        from harnest.lib.ollama import configure_connections
        try:
            configure_connections((await request.json())['connections'])
        except (ValueError, KeyError, TypeError):
            raise HTTPException(400, 'Invalid model connections') from None
        return {'ok': True}

    @router.post('/memory/validate')
    async def memory_validate(request: Request):
        from harnest.lib.embeddings import validate
        data = await request.json()
        return await validate(data['settings'], data.get('apiKey', ''), data.get('auth'))

    @router.post('/command')
    async def command(request: Request):
        data = await request.json()
        backend = service()
        try:
            if 'settings' in data or 'local' in data or backend.state is None:
                backend.configure(data)
            action = data.get('action', 'initialize')
            result = None
            if action == 'model':
                result = backend.select_model(data['input'])
            elif action == 'start':
                result = backend.start(data['input'])
            elif action == 'edit_message':
                result = backend.edit_message(data['input'])
            elif action == 'update_queued_message':
                result = backend.update_queued_message(data['input'])
            elif action == 'answer_questions':
                result = backend.questions.answer(data['input'])
            elif action in ('cancel', 'resume', 'steer', 'plan'):
                result = await backend.control(action, data['input'])
            elif action != 'initialize':
                raise ValueError('Unknown activity command.')
            return dict(**snapshot(), result=result)
        except (ValueError, KeyError, TypeError) as error:
            raise HTTPException(400, str(error)) from None

    @router.get('/events')
    async def events(revision: int = -1):
        backend = service()
        if revision == backend.revision:
            backend.changed.clear()
            try:
                await asyncio.wait_for(backend.changed.wait(), 1)
            except TimeoutError:
                pass
        return snapshot()

    @router.post('/result/{request_id}')
    async def result(request_id: str, request: Request):
        try:
            service().resolve(request_id, await request.json())
            return {'ok': True}
        except ValueError as error:
            raise HTTPException(409, str(error)) from None

    @router.post('/receipt')
    async def receipt(request: Request):
        data = await request.json()
        backend = service()
        pending = backend.pending.get(data.get('requestId'))
        if not pending or pending['activityId'] != data.get('activityId'):
            raise HTTPException(409, 'This local request is no longer pending.')
        activity = backend.get(data['activityId'])
        activity['events'].extend(data.get('events', []))
        backend.configure({'local': data.get('local', [])})
        return {'ok': True}

    return router
