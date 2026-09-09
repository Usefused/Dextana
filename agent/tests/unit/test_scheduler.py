import asyncio
from datetime import datetime
import json
from types import SimpleNamespace
import pytest


class Backend:
    def __init__(self):
        self.state = {'activities': []}
        self.started = []

    def start(self, data, internal=False):
        assert internal
        identifier = 'activity-' + str(len(self.started))
        self.started.append(data)
        self.state['activities'].append(dict(id=identifier, scheduledRunId=data['scheduledRunId'], status='running'))
        return identifier


def test_manual_dispatch_is_durable_and_never_replays_or_overlaps(agent, tmp_path):
    from harnest.lib.scheduler import Scheduler, APPLICATION, OWNER, QUEUE
    from harnest.lib.task_store import SQLiteTaskStore

    async def check():
        backend = Backend()
        now = [1000.0]
        provider = SQLiteTaskStore(tmp_path / 'jobs.sqlite')
        service = Scheduler(provider, lambda: now[0], backend)
        await service.initialize()
        data = dict(name='Notes', prompt='Summarize', model='test', expression='* * * * *', timezone='UTC', enabled=False)
        identifier = await service.save(data)
        await service.run_now(identifier)
        await service.run_now(identifier)
        assert len((await service.list())[0]['runs']) == 1
        queued, = await provider.claim_tasks(application_id=APPLICATION, queues=(QUEUE,), now=now[0], lease_seconds=30)
        await service.execute(**dict(queued.arguments))
        await service.execute(**dict(queued.arguments))
        assert len(backend.started) == 1
        await service.run_now(identifier)
        assert 'previous run' in (await service.list())[0]['error']
        backend.state['activities'][0]['status'] = 'completed'
        await service.run_now(identifier)
        assert len((await service.list())[0]['runs']) == 2
        await provider.close()
        reopened = SQLiteTaskStore(provider.path)
        restored = Scheduler(reopened, lambda: now[0], backend)
        await restored.initialize()
        assert (await restored.list())[0]['runs'][1]['status'] == 'completed'
        await restored.remove(identifier)
        assert await restored.list() == []
        assert await reopened.list_crons(application_id=APPLICATION, user_id=OWNER) == ()
        await reopened.close()
    asyncio.run(check())


def test_editing_a_queued_schedule_retires_the_old_run_without_blocking_new_work(agent, tmp_path):
    from harnest.lib.scheduler import Scheduler, APPLICATION, QUEUE
    from harnest.lib.task_store import SQLiteTaskStore

    async def check():
        backend = Backend()
        provider = SQLiteTaskStore(tmp_path / 'jobs.sqlite')
        service = Scheduler(provider, lambda: 1000.0, backend)
        await service.initialize()
        data = dict(name='Notes', prompt='Original', model='test', expression='* * * * *', timezone='UTC', enabled=True)
        identifier = await service.save(data)
        await service.run_now(identifier)
        old, = await provider.claim_tasks(application_id=APPLICATION, queues=(QUEUE,), now=1000, lease_seconds=30)
        await service.save({**data, 'prompt': 'Updated'}, identifier)
        result = await service.execute(**dict(old.arguments))
        assert result == {'status': 'skipped'} and backend.started == []
        await provider.finish_task(application_id=APPLICATION, job_id=old.job_id, lease_token=old.lease_token,
                                   now=1001, status='completed', result=result)
        assert (await service.list())[0]['runs'][0]['status'] == 'skipped'
        await service.run_now(identifier)
        new, = await provider.claim_tasks(application_id=APPLICATION, queues=(QUEUE,), now=1000, lease_seconds=30)
        await service.execute(**dict(new.arguments))
        assert backend.started[0]['prompt'] == 'Updated'
        await provider.close()
    asyncio.run(check())


def test_legacy_history_migrates_once_and_uncertain_runs_are_not_replayed(agent, tmp_path):
    from harnest.lib.scheduler import Scheduler, APPLICATION, OWNER
    from harnest.lib.task_store import SQLiteTaskStore

    async def check():
        provider = SQLiteTaskStore(tmp_path / 'jobs.sqlite')
        await provider.start()
        legacy = dict(id='legacy', name='Notes', prompt='Summarize', model='test', expression='0 9 * * *', timezone='Europe/London', enabled=False,
                      runs=[dict(id='old', status='completed', startedAt='2026-09-08T08:00:00+00:00'), dict(id='uncertain', status='claimed', startedAt='2026-09-08T09:00:00+00:00')])
        await provider.transaction(lambda db: db.execute('INSERT INTO jobs VALUES (?,?)', ('legacy', json.dumps(legacy))).rowcount)
        service = Scheduler(provider, lambda: 1788858000.0, Backend())
        await service.initialize()
        await service.initialize()
        saved, = await service.list()
        assert saved['id'] == 'legacy' and not saved['enabled']
        assert saved['timezone'] == 'Europe/London' and len(saved['runs']) == 2
        assert saved['runs'][0]['status'] == 'completed'
        assert saved['runs'][1]['status'] == 'interrupted'
        native, = await provider.list_crons(application_id=APPLICATION, user_id=OWNER)
        assert native.status == 'paused' and native.timezone == 'UTC'
        assert native.arguments['job_id'] == 'legacy'
        assert await provider.transaction(lambda db: db.execute('SELECT count(*) FROM harnest_tasks').fetchone()[0]) == 0
        await provider.close()
    asyncio.run(check())


def test_time_zones_rearm_native_cron_without_polling_and_missed_runs_are_skipped(agent, tmp_path):
    from harnest.lib.scheduler import Scheduler, APPLICATION, OWNER, next_run, iso
    from harnest.lib.task_store import SQLiteTaskStore
    now = [datetime.fromisoformat('2026-10-24T09:00:00+00:00').timestamp()]
    assert iso(next_run('0 9 * * *', 'Europe/London', now[0])) == '2026-10-25T09:00:00+00:00'

    async def check():
        backend = Backend()
        provider = SQLiteTaskStore(tmp_path / 'jobs.sqlite')
        service = Scheduler(provider, lambda: now[0], backend)
        await service.initialize()
        data = dict(name='Notes', prompt='Summarize', model='test', expression='0 9 * * *', timezone='Europe/London', enabled=True)
        identifier = await service.save(data)
        native, = await provider.list_crons(application_id=APPLICATION, user_id=OWNER)
        assert native.expression == '0 9 25 10 *'
        now[0] = native.next_run_at
        await service.execute(**dict(native.arguments), occurrence=native.schedule_id + ':' + str(now[0]), due_at=now[0])
        following, = await provider.list_crons(application_id=APPLICATION, user_id=OWNER)
        assert following.expression == '0 9 26 10 *'
        assert len(backend.started) == 1
        backend.state['activities'][0]['status'] = 'completed'
        now[0] = following.next_run_at + 3600
        await service.execute(**dict(following.arguments), occurrence=following.schedule_id + ':' + str(following.next_run_at), due_at=following.next_run_at)
        assert len(backend.started) == 1
        assert (await service.list())[0]['nextRunAt'] == '2026-10-27T09:00:00+00:00'
        for change in ({'timezone': 'Invalid'}, {'expression': '0 0 31 2 *'}, {'expression': 'not cron'}):
            with pytest.raises((ValueError, KeyError)):
                await service.save({**data, **change}, identifier)
        await provider.close()
    asyncio.run(check())


def test_job_routes_require_authentication_and_validate_input(agent, tmp_path, monkeypatch):
    import importlib.util
    from contextlib import asynccontextmanager
    from pathlib import Path
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from harnest.lib.scheduler import Scheduler
    from harnest.lib.task_store import SQLiteTaskStore
    spec = importlib.util.spec_from_file_location('test_schedule_routes', Path(__file__).parents[2] / 'lifecycle' / 'scheduler.py')
    routes = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(routes)
    monkeypatch.setenv('DEXTANA_RUNTIME_TOKEN', 'synthetic-test-token')
    provider = SQLiteTaskStore(tmp_path / 'jobs.sqlite')
    service = Scheduler(provider, backend=Backend())
    monkeypatch.setattr(routes, 'scheduler', lambda: service)
    @asynccontextmanager
    async def lifespan(app):
        await service.initialize()
        yield
        await provider.close()
    app = FastAPI(lifespan=lifespan)
    app.include_router(routes.schedule_routes(None))
    with TestClient(app) as client:
        assert client.get('/dextana/jobs').status_code == 401
        headers = {'Authorization': 'Bearer synthetic-test-token'}
        assert client.post('/dextana/jobs', headers=headers, json={}).status_code == 422
        data = dict(name='Test', prompt='Notes', model='test', expression='invalid', timezone='UTC', enabled=True)
        assert client.post('/dextana/jobs', headers=headers, json=data).status_code == 400
        data['expression'] = '* * * * *'
        assert client.post('/dextana/jobs', headers=headers, json=data).status_code == 200
        assert len(client.get('/dextana/jobs', headers=headers).json()) == 1
        assert client.post('/dextana/jobs/claim', headers=headers).status_code in (404, 405)


def test_agent_schedules_one_time_reminders_and_tasks_with_verified_times(agent, tmp_path):
    from harnest.lib.scheduler import Scheduler, APPLICATION, QUEUE
    from harnest.lib.task_store import SQLiteTaskStore
    from harnest.lib.activities import Activities

    async def check():
        now = [1000.0]
        backend = Activities(tmp_path / 'state')
        backend.configure({'settings': {'models': ['test']}})
        activity = dict(id='chat', model='test', status='completed', messages=[], events=[])
        backend.state['activities'].append(activity)
        backend.commit()
        provider = SQLiteTaskStore(tmp_path / 'jobs.sqlite')
        service = Scheduler(provider, lambda: now[0], backend)
        await service.initialize()
        args = dict(action='create', name='Email', prompt='Check Zoho', kind='reminder', delay_seconds=30, timezone='Europe/London')
        saved = await service.tool(activity, args)
        assert saved['status'] == 'scheduled' and saved['nextRunAt'] == '1970-01-01T01:17:10+01:00'
        with pytest.raises(ValueError):
            await service.tool(activity, {**args, 'delay_seconds': 0})
        with pytest.raises(ValueError):
            await service.tool(activity, {**args, 'expression': '* * * * *'})
        with pytest.raises(ValueError):
            await service.tool(activity, {**args, 'delay_seconds': 0, 'run_at': '2026-09-09T12:00:00'})
        assert await provider.claim_tasks(application_id=APPLICATION, queues=(QUEUE,), now=1029, lease_seconds=30) == ()
        # Reopening storage must retain the original exact due time and queued task.
        await service.initialize()
        now[0] = 1030
        task, = await provider.claim_tasks(application_id=APPLICATION, queues=(QUEUE,), now=now[0], lease_seconds=30)
        result = await service.execute(**dict(task.arguments))
        await provider.finish_task(application_id=APPLICATION, job_id=task.job_id, lease_token=task.lease_token, now=1030, status='completed', result=result)
        assert result['status'] == 'completed'
        assert activity['messages'][0]['content'] == 'Reminder: Check Zoho'
        assert not backend.tasks
        await service.execute(**dict(task.arguments))
        assert len(activity['messages']) == 1
        restored = Activities(tmp_path / 'state')
        restored.remind('chat', 'Check Zoho', task.job_id, saved['id'])
        assert len(restored.get('chat')['messages']) == 1
        job, = await service.list()
        assert not job['enabled'] and job['nextRunAt'] is None and job['runs'][0]['status'] == 'completed'
        await service.tool(activity, {'action': 'remove', 'schedule_id': saved['id']})
        assert (await service.tool(activity, {'action': 'list'}))['jobs'] == []
        await provider.close()
    asyncio.run(check())


def test_one_time_pause_edit_and_delete_cancel_the_native_queue_entries(agent, tmp_path):
    from harnest.lib.scheduler import Scheduler, APPLICATION, QUEUE
    from harnest.lib.task_store import SQLiteTaskStore

    async def check():
        provider = SQLiteTaskStore(tmp_path / 'jobs.sqlite')
        service = Scheduler(provider, lambda: 1000.0, Backend())
        await service.initialize()
        data = dict(name='Once', prompt='Original', model='test', expression='', runAt='1970-01-01T00:20:00+00:00', timezone='UTC', enabled=True)
        identifier = await service.save(data)
        await service.save({**data, 'enabled': False}, identifier)
        assert await provider.claim_tasks(application_id=APPLICATION, queues=(QUEUE,), now=1200, lease_seconds=30) == ()
        await service.save(data, identifier)
        await service.save({**data, 'prompt': 'Updated'}, identifier)
        current, = await provider.claim_tasks(application_id=APPLICATION, queues=(QUEUE,), now=1200, lease_seconds=30)
        await service.remove(identifier)
        assert (await provider.get_task(application_id=APPLICATION, job_id=current.job_id)).status == 'cancelled'
        assert await service.execute(**dict(current.arguments)) == {'status': 'skipped'}
        assert await provider.claim_tasks(application_id=APPLICATION, queues=(QUEUE,), now=1300, lease_seconds=30) == ()
        await provider.close()
    asyncio.run(check())
