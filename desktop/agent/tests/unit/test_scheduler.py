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
        restored.remind('chat', 'Check Zoho', task.job_id, task.arguments['job_id'])
        assert len(restored.get('chat')['messages']) == 1
        assert await provider.transaction(lambda db: db.execute('SELECT count(*) FROM jobs').fetchone()[0]) == 0
        await service.initialize()
        assert (await service.tool(activity, {'action': 'list'}))['jobs'] == []
        await provider.close()
    asyncio.run(check())


@pytest.mark.parametrize('status', ['running', 'failed', 'cancelled', 'completed'])
@pytest.mark.parametrize('restart', [False, True])
def test_one_time_work_is_removed_only_after_success(agent, tmp_path, status, restart):
    from harnest.lib.scheduler import Scheduler, APPLICATION, QUEUE
    from harnest.lib.task_store import SQLiteTaskStore

    async def check():
        backend = Backend()
        now = [1000.0]
        provider = SQLiteTaskStore(tmp_path / 'jobs.sqlite')
        service = Scheduler(provider, lambda: now[0], backend)
        await service.initialize()
        await service.save(dict(name='Once', prompt='Do work', model='test', runAt='1970-01-01T00:20:00+00:00', timezone='UTC', enabled=True))
        now[0] = 1200
        task, = await provider.claim_tasks(application_id=APPLICATION, queues=(QUEUE,), now=now[0], lease_seconds=30)
        result = await service.execute(**dict(task.arguments))
        await provider.finish_task(application_id=APPLICATION, job_id=task.job_id, lease_token=task.lease_token,
                                   now=now[0], status='completed', result=result)
        # Dispatch completion is not completion of the agent's work.
        assert len(await service.list()) == 1
        backend.state['activities'][0]['status'] = status
        if restart:
            await provider.close()
            provider = SQLiteTaskStore(provider.path)
            service = Scheduler(provider, lambda: now[0], backend)
            await service.initialize()
        assert len(await service.list()) == (0 if status == 'completed' else 1)
        assert len(backend.state['activities']) == 1
        assert await provider.get_task(application_id=APPLICATION, job_id=task.job_id) is not None
        await provider.close()
    asyncio.run(check())


def test_completed_manual_or_previous_runs_do_not_remove_future_one_time_work(agent, tmp_path):
    from harnest.lib.scheduler import Scheduler, APPLICATION, QUEUE
    from harnest.lib.task_store import SQLiteTaskStore

    async def check():
        backend = Backend()
        now = [1000.0]
        provider = SQLiteTaskStore(tmp_path / 'jobs.sqlite')
        service = Scheduler(provider, lambda: now[0], backend)
        await service.initialize()
        data = dict(name='Once', prompt='Do work', model='test', runAt='1970-01-01T00:20:00+00:00', timezone='UTC', enabled=True)
        identifier = await service.save(data)
        await service.run_now(identifier)
        manual, = await provider.claim_tasks(application_id=APPLICATION, queues=(QUEUE,), now=1000, lease_seconds=30)
        await service.execute(**dict(manual.arguments))
        backend.state['activities'][0]['status'] = 'completed'
        assert (await service.list())[0]['nextRunAt'] == data['runAt']
        now[0] = 1200
        due, = await provider.claim_tasks(application_id=APPLICATION, queues=(QUEUE,), now=1200, lease_seconds=30)
        await service.execute(**dict(due.arguments))
        # Reschedule while the old activity is still running, then pause it.
        await service.save({**data, 'runAt': '1970-01-01T00:30:00+00:00'}, identifier)
        await service.save({**data, 'runAt': '1970-01-01T00:30:00+00:00', 'enabled': False}, identifier)
        backend.state['activities'][1]['status'] = 'completed'
        job, = await service.list()
        assert job['id'] == identifier and not job['enabled']
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


@pytest.mark.parametrize('restart', [False, True])
def test_overdue_one_time_reminders_deliver_once_after_wake_or_restart(agent, tmp_path, restart):
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
        await service.tool(activity, dict(action='create', name='Invoice', prompt='Send invoice', kind='reminder', delay_seconds=30))
        now[0] = 2000
        if restart:
            await provider.close()
            provider = SQLiteTaskStore(provider.path)
            service = Scheduler(provider, lambda: now[0], backend)
            await service.initialize()
        task, = await provider.claim_tasks(application_id=APPLICATION, queues=(QUEUE,), now=now[0], lease_seconds=30)
        result = await service.execute(**dict(task.arguments))
        await service.execute(**dict(task.arguments))
        assert result['status'] == 'completed'
        assert len(activity['messages']) == 1
        assert activity['messages'][0]['content'] == 'Reminder: Send invoice'
        assert activity['messages'][0]['reminder']['overdue'] is True
        assert activity['messages'][0]['reminder']['dueAt'] == '1970-01-01T00:17:10+00:00'
        assert not backend.tasks
        await provider.close()
    asyncio.run(check())


def test_recurring_reminders_keep_harnest_due_cursor_then_resume_without_catchup_storm(agent, tmp_path):
    from harnest.lib.scheduler import Scheduler, APPLICATION, OWNER
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
        await service.tool(activity, dict(action='create', name='Stretch', prompt='Stand up', kind='reminder', expression='* * * * *', timezone='UTC'))
        original, = await provider.list_crons(application_id=APPLICATION, user_id=OWNER)
        now[0] = 2000
        await provider.close()
        provider = SQLiteTaskStore(provider.path)
        service = Scheduler(provider, lambda: now[0], backend)
        await service.initialize()
        due, = await provider.list_crons(application_id=APPLICATION, user_id=OWNER)
        assert due.next_run_at == original.next_run_at
        result = await service.execute(**dict(due.arguments), occurrence=due.schedule_id + ':overdue', due_at=due.next_run_at)
        assert result['status'] == 'completed'
        assert len(activity['messages']) == 1
        resumed, = await provider.list_crons(application_id=APPLICATION, user_id=OWNER)
        assert resumed.next_run_at > now[0]
        queued_while_asleep = await service.execute(**dict(due.arguments), occurrence=due.schedule_id + ':also-overdue', due_at=due.next_run_at + 60)
        assert queued_while_asleep == {'status': 'skipped'}
        assert len(activity['messages']) == 1
        await service.initialize()
        assert len(activity['messages']) == 1
        now[0] = resumed.next_run_at
        following = await service.execute(**dict(resumed.arguments), occurrence=resumed.schedule_id + ':following', due_at=now[0])
        assert following['status'] == 'completed'
        assert len(activity['messages']) == 2
        assert activity['messages'][-1]['reminder']['overdue'] is False
        await provider.close()
    asyncio.run(check())


def test_schedule_tool_receipts_keep_storage_ids_private_and_references_durable(agent, tmp_path):
    from harnest.lib.scheduler import Scheduler
    from harnest.lib.task_store import SQLiteTaskStore
    from harnest.lib.activities import Activities

    async def check():
        backend = Activities(tmp_path / 'state')
        backend.configure({'settings': {'models': ['test']}})
        activity = dict(id='private-chat', model='test', status='completed', messages=[], events=[])
        backend.state['activities'].append(activity)
        provider = SQLiteTaskStore(tmp_path / 'jobs.sqlite')
        service = Scheduler(provider, lambda: 1000, backend)
        await service.initialize()
        args = dict(action='create', name='Email', prompt='Check inbox', kind='reminder', delay_seconds=60, timezone='UTC')
        first = await service.tool(activity, args)
        second = await service.tool(activity, args)
        assert first['reference'] != second['reference']
        assert set(first) == {'status', 'reference', 'name', 'kind', 'nextRunAt', 'timezone', 'expression', 'delivery', 'availability'}
        internal = await service.list()
        ids = [job['id'] for job in internal]
        # Simulate additional metadata, including nested run identifiers, in persisted jobs.
        def add_metadata(db):
            import json
            for job in internal:
                job.update(futureMetadata={'id': 'future-private-id'})
                db.execute('UPDATE jobs SET data=? WHERE id=?', (json.dumps(job), job['id']))
        await provider.transaction(add_metadata)
        await provider.close()
        provider = SQLiteTaskStore(tmp_path / 'jobs.sqlite')
        service = Scheduler(provider, lambda: 1000, backend)
        await service.initialize()
        listed = (await service.tool(activity, {'action': 'list'}))['jobs']
        assert [job['reference'] for job in listed] == [first['reference'], second['reference']]
        for job in listed:
            assert set(job) == {'reference', 'name', 'prompt', 'kind', 'enabled', 'nextRunAt', 'timezone', 'expression', 'runAt'}
        import json
        wire = json.dumps([first, second, listed])
        assert all(identifier not in wire for identifier in ids + ['private-chat', 'future-private-id'])
        removed = await service.tool(activity, dict(action='remove', schedule_id=first['reference']))
        assert removed == dict(status='removed', reference=first['reference'], name='Email')
        assert [job['reference'] for job in (await service.tool(activity, {'action': 'list'}))['jobs']] == [second['reference']]
        third = await service.tool(activity, args)
        assert third['reference'] not in (first['reference'], second['reference'])
        with pytest.raises(ValueError, match='not found'):
            await service.tool(activity, dict(action='remove', schedule_id=first['reference']))
        # Previously saved tool calls can still cancel by their old internal handle.
        legacy = await service.tool(activity, dict(action='remove', schedule_id=ids[1]))
        assert 'id' not in legacy and legacy['reference'] == second['reference']
        await provider.close()
    asyncio.run(check())
