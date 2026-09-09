import asyncio
from dataclasses import replace
import pytest


def test_durable_tasks_claim_once_fence_stale_leases_and_scrub_terminal_payloads(agent, tmp_path):
    from harnest.lib.task_store import SQLiteTaskStore
    from harnest.task_storage import TaskRecord, TaskStore, TaskStoreConflictError
    from harnest.cron_storage import CronStore

    async def check():
        first = SQLiteTaskStore(tmp_path / 'tasks.sqlite')
        second = SQLiteTaskStore(first.path)
        assert isinstance(first, TaskStore) and isinstance(first, CronStore)
        await first.start()
        await second.start()
        record = TaskRecord('job', 'app', 'owner', 'task', 'queue', {'private': 'input'}, invocation={'private': 'scope'}, agent_permissions=('grant',), scheduled_at=10, max_retries=1, idempotency_key='once')
        await first.enqueue_task(record)
        claims = await asyncio.gather(*[provider.claim_tasks(application_id='app', queues=('queue',), now=10, lease_seconds=5) for provider in (first, second)])
        assert sum(map(len, claims)) == 1
        old = next(batch[0] for batch in claims if batch)
        assert await first.get_task(application_id='app', user_id='foreign', job_id='job') is None
        assert await second.claim_tasks(application_id='other', queues=('queue',), now=20, lease_seconds=5) == ()
        assert not await first.renew_task_lease(application_id='app', job_id='job', lease_token=old.lease_token, now=15, lease_seconds=5)
        new, = await second.claim_tasks(application_id='app', queues=('queue',), now=15, lease_seconds=5)
        assert new.attempt == 2 and new.lease_token != old.lease_token
        assert not await first.finish_task(application_id='app', job_id='job', lease_token=old.lease_token, now=16, status='completed')
        assert await second.finish_task(application_id='app', job_id='job', lease_token=new.lease_token, now=16, status='completed', result={'activity': 'result'})
        await first.close()
        reopened = SQLiteTaskStore(first.path)
        await reopened.start()
        saved = await reopened.get_task(application_id='app', user_id='owner', job_id='job')
        assert saved.status == 'completed' and saved.result == {'activity': 'result'}
        assert saved.arguments == {} and saved.invocation is None and saved.agent_permissions is None
        assert (await reopened.enqueue_task(record)).job_id == 'job'
        with pytest.raises(TaskStoreConflictError):
            await reopened.enqueue_task(replace(record, arguments={'changed': True}))
        assert await reopened.claim_tasks(application_id='app', queues=(), now=20, lease_seconds=5) == ()
        await reopened.close()
        await second.close()
    asyncio.run(check())


def test_final_attempt_is_not_replayed_and_cancellation_revokes_execution(agent, tmp_path):
    from harnest.lib.task_store import SQLiteTaskStore
    from harnest.task_storage import TaskRecord

    async def check():
        provider = SQLiteTaskStore(tmp_path / 'tasks.sqlite')
        await provider.start()
        await provider.enqueue_task(TaskRecord('once', 'app', 'owner', 'task', 'queue', {'private': 1}, max_retries=0))
        old, = await provider.claim_tasks(application_id='app', queues=('queue',), now=10, lease_seconds=5)
        assert await provider.claim_tasks(application_id='app', queues=('queue',), now=15, lease_seconds=5) == ()
        terminal = await provider.get_task(application_id='app', job_id='once')
        assert terminal.status == 'failed' and terminal.arguments == {}
        assert not await provider.finish_task(application_id='app', job_id='once', lease_token=old.lease_token, now=16, status='completed')
        await provider.enqueue_task(TaskRecord('cancel', 'app', 'owner', 'task', 'queue', {'private': 2}))
        running, = await provider.claim_tasks(application_id='app', queues=('queue',), now=20, lease_seconds=5)
        assert not await provider.cancel_task(application_id='app', user_id='foreign', job_id='cancel', now=21)
        assert await provider.cancel_task(application_id='app', user_id='owner', job_id='cancel', now=21)
        assert not await provider.renew_task_lease(application_id='app', job_id='cancel', lease_token=running.lease_token, now=22, lease_seconds=5)
        assert not await provider.finish_task(application_id='app', job_id='cancel', lease_token=running.lease_token, now=22, status='completed')
        await provider.close()
    asyncio.run(check())


def test_cron_occurrence_and_cursor_commit_atomically_across_connections(agent, tmp_path):
    from harnest.lib.task_store import SQLiteTaskStore
    from harnest.task_storage import TaskRecord
    from harnest.cron_storage import CronRecord, CronStoreConflictError

    async def check():
        first = SQLiteTaskStore(tmp_path / 'tasks.sqlite')
        second = SQLiteTaskStore(first.path)
        await first.start()
        await second.start()
        schedule = CronRecord('cron_test', 'app', 'owner', 'daily', '* * * * *', 'task', {'job_id': 'desktop'}, 60)
        await first.create_cron(schedule)
        task = TaskRecord('occurrence', 'app', 'owner', 'task', 'queue', schedule.arguments, scheduled_at=60, idempotency_key='cron_test:60')
        options = dict(application_id='app', user_id='owner', schedule_id='cron_test', expected_revision=0, due_at=60, next_run_at=120)
        with pytest.raises(CronStoreConflictError):
            await first.commit_cron_occurrence(**options, task=replace(task, user_id='foreign'))
        assert (await first.get_cron(application_id='app', user_id='owner', schedule_id='cron_test')).next_run_at == 60
        results = await asyncio.gather(*[provider.commit_cron_occurrence(**options, task=task) for provider in (first, second)])
        assert sum(item is not None for item in results) == 1
        current = await first.get_cron(application_id='app', user_id='owner', schedule_id='cron_test')
        assert current.next_run_at == 120 and current.revision == 1
        with pytest.raises(CronStoreConflictError):
            await first.update_cron(replace(current, status='paused'), expected_revision=0)
        paused = await first.update_cron(replace(current, status='paused'), expected_revision=1)
        assert (await first.create_cron(schedule)).status == 'paused'
        assert await first.list_due_crons(application_id='app', now=200) == ()
        assert await first.list_crons(application_id='app', user_id='foreign') == ()
        assert not await first.delete_cron(application_id='app', user_id='foreign', schedule_id='cron_test')
        cancelled = await first.update_cron(replace(paused, status='cancelled'), expected_revision=paused.revision)
        with pytest.raises(CronStoreConflictError):
            await first.update_cron(replace(cancelled, status='active'), expected_revision=cancelled.revision)
        await first.close()
        await second.close()
    asyncio.run(check())
