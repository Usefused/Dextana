"""Desktop schedule metadata and time-zone policy over Harnest's cron runtime.

There is no polling or dispatch loop here. Harnest advances durable UTC cursors
and invokes tasks/scheduled_activity.py. Non-UTC schedules project their next
local occurrence into UTC and re-arm after delivery, retaining DST behavior.
"""
import asyncio
from dataclasses import replace
from datetime import datetime
import json
import re
import time
from uuid import uuid4, uuid5, NAMESPACE_URL
from zoneinfo import ZoneInfo
from croniter import croniter
from harnest.cron_storage import CronRecord
from harnest.runtime_cron_store import next_occurrence
from harnest.task_storage import TaskRecord
from harnest.lib.task_store import store, encode
from harnest.models.schedule import ScheduleInput

APPLICATION = 'dextana'
OWNER = 'owner'
TASK = 'harnest.dextana.tasks.scheduled_activity'
QUEUE = 'desktop-schedules'
_ACTIVE = ('queued', 'claimed', 'starting', 'running')


def next_run(expression, timezone, now):
    if len(expression) > 200 or len(expression.split()) != 5:
        raise ValueError('Use five cron fields: minute hour day month weekday.')
    zone = ZoneInfo(timezone)
    return croniter(expression, datetime.fromtimestamp(now, zone), max_years_between_matches=8).get_next(datetime).timestamp()


def iso(value):
    return datetime.fromtimestamp(value, ZoneInfo('UTC')).isoformat()


def _native_schedule(job, now):
    upcoming = next_run(job['expression'], job['timezone'], now)
    if job['timezone'] in ('UTC', 'Etc/UTC', 'GMT') and re.fullmatch(r'[0-9*/ ,\-]+', job['expression']):
        expression = job['expression']
    else:
        # Harnest 0.18 supports UTC only. Project exactly one upcoming local
        # occurrence rather than waking every minute to test a local expression.
        moment = datetime.fromtimestamp(upcoming, ZoneInfo('UTC'))
        expression = f'{moment.minute} {moment.hour} {moment.day} {moment.month} *'
    return expression, next_occurrence(expression, now)


def _read(db, job_id):
    row = db.execute('SELECT data FROM jobs WHERE id=?', (job_id,)).fetchone()
    return None if row is None else json.loads(row['data'])


def _write(db, job):
    db.execute('INSERT INTO jobs VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', (job['id'], encode(job)))


class Scheduler:
    """Adapt authenticated desktop CRUD and run history to native Harnest jobs."""

    def __init__(self, provider=None, clock=time.time, backend=None):
        self.provider = provider or store()
        self.clock = clock
        self._backend = backend
        self._lock = asyncio.Lock()

    def backend(self):
        if self._backend is not None:
            return self._backend
        from harnest.lib.activities import service
        return service()

    def _schedule(self, db, job, now):
        expression, upcoming = _native_schedule(job, now)
        identifier = job.setdefault('nativeCronId', 'cron_' + uuid5(NAMESPACE_URL, APPLICATION + ':' + job['id']).hex)
        generation = job.setdefault('generation', uuid4().hex)
        row = db.execute('SELECT data FROM harnest_cron WHERE application_id=? AND user_id=? AND schedule_id=?',
                         (APPLICATION, OWNER, identifier)).fetchone()
        current = CronRecord(**json.loads(row['data'])) if row else None
        record = CronRecord(schedule_id=identifier, application_id=APPLICATION, user_id=OWNER,
                            key='desktop:' + job['id'], expression=expression, task_name=TASK,
                            arguments=dict(job_id=job['id'], generation=generation), next_run_at=upcoming,
                            status='active' if job['enabled'] else 'paused', created_at=now, updated_at=now)
        if current:
            record = replace(record, created_at=current.created_at, revision=current.revision)
            self.provider.update(db, record, current.revision)
        else:
            self.provider.create(db, record)
        job['nextRunAt'] = iso(upcoming) if job['enabled'] else None

    def _reconcile(self, db, job, activities):
        for run in job['runs']:
            activity = next((a for a in activities if a['id'] == run.get('activityId') or a.get('scheduledRunId') == run['id']), None)
            if activity:
                run.update(activityId=activity['id'], status=activity['status'])
                if activity.get('error'):
                    run['error'] = activity['error']
                else:
                    run.pop('error', None)
            elif run.get('status') in _ACTIVE and run.get('taskId'):
                task = db.execute('SELECT data FROM harnest_tasks WHERE application_id=? AND job_id=?', (APPLICATION, run['taskId'])).fetchone()
                task = json.loads(task['data']) if task else None
                if task and task['status'] in ('failed', 'cancelled'):
                    run.update(status='interrupted', error='The dispatch did not finish. It was not retried.')
                elif task and task['status'] == 'completed' and (task.get('result') or {}).get('status') == 'skipped':
                    run.update(status='skipped', error='The schedule changed before dispatch. This run was skipped.')

    async def initialize(self):
        if not self.provider.started:
            await self.provider.start()
        activities = (self.backend().state or {}).get('activities', [])
        def migrate(db):
            for row in db.execute('SELECT data FROM jobs ORDER BY rowid').fetchall():
                job = json.loads(row['data'])
                legacy = not job.get('nativeCronId')
                self._reconcile(db, job, activities)
                for run in job['runs']:
                    if run.get('status') in _ACTIVE and (legacy or run.get('status') != 'queued'):
                        run.update(status='interrupted', error='Backend restarted. This run was not retried.')
                try:
                    # Desktop policy skips missed work. Re-arm before Harnest's
                    # worker starts so a restart cannot create a catch-up storm.
                    self._schedule(db, job, self.clock())
                except (ValueError, KeyError) as error:
                    job.update(enabled=False, error=str(error), nextRunAt=None)
                    db.execute("UPDATE harnest_cron SET status='paused', data=json_set(data,'$.status','paused') WHERE application_id=? AND user_id=? AND schedule_id=?",
                               (APPLICATION, OWNER, job.get('nativeCronId', '')))
                _write(db, job)
        async with self._lock:
            await self.provider.transaction(migrate)

    async def list(self):
        activities = (self.backend().state or {}).get('activities', [])
        def read(db):
            jobs = [json.loads(row['data']) for row in db.execute('SELECT data FROM jobs ORDER BY rowid')]
            for job in jobs:
                self._reconcile(db, job, activities)
                _write(db, job)
            return [{key: value for key, value in job.items() if key not in ('nativeCronId', 'generation')} for job in jobs]
        async with self._lock:
            return await self.provider.transaction(read)

    async def save(self, data, job_id=None):
        data = ScheduleInput(**data).model_dump()
        _native_schedule(data, self.clock())
        def save(db):
            old = _read(db, job_id) if job_id else None
            if job_id and not old:
                raise ValueError('Scheduled job no longer exists.')
            if not old and db.execute('SELECT count(*) FROM jobs').fetchone()[0] >= 100:
                raise ValueError('Keep up to 100 jobs.')
            job = {**(old or {}), **data, 'id': job_id or str(uuid4()), 'runs': old['runs'] if old else []}
            if not old or any(old[key] != data[key] for key in ('prompt', 'model', 'expression', 'timezone')):
                job['generation'] = uuid4().hex
            job.pop('error', None)
            self._schedule(db, job, self.clock())
            _write(db, job)
            return job['id']
        async with self._lock:
            return await self.provider.transaction(save)

    async def remove(self, job_id):
        def remove(db):
            job = _read(db, job_id)
            if job:
                db.execute('DELETE FROM harnest_cron WHERE application_id=? AND user_id=? AND schedule_id=?', (APPLICATION, OWNER, job['nativeCronId']))
                db.execute('DELETE FROM jobs WHERE id=?', (job_id,))
        async with self._lock:
            await self.provider.transaction(remove)

    async def run_now(self, job_id):
        now = self.clock()
        activities = (self.backend().state or {}).get('activities', [])
        def enqueue(db):
            job = _read(db, job_id)
            if not job:
                raise ValueError('Scheduled job no longer exists.')
            self._reconcile(db, job, activities)
            if any(run.get('status') in _ACTIVE for run in job['runs']):
                job['error'] = 'Skipped: the previous run is still active or waiting for approval.'
                _write(db, job)
                return
            identifier = uuid4().hex
            arguments = dict(job_id=job_id, generation=job['generation'], manual=True, occurrence=identifier, due_at=now)
            task = TaskRecord(job_id=identifier, application_id=APPLICATION, user_id=OWNER,
                              task_name=TASK, queue=QUEUE, arguments=arguments, agent_permissions=(),
                              trigger='user', scheduled_at=now, max_retries=0, idempotency_key=identifier,
                              created_at=now, updated_at=now)
            self.provider.enqueue(db, task)
            job['runs'] = [dict(id=identifier, taskId=identifier, startedAt=iso(now), status='queued'), *job['runs']][:20]
            job.pop('error', None)
            _write(db, job)
        async with self._lock:
            await self.provider.transaction(enqueue)

    async def execute(self, job_id, generation, occurrence, due_at, manual=False):
        """Launch one activity after a durable, non-replayable dispatch receipt."""
        now = self.clock()
        backend = self.backend()
        activities = (backend.state or {}).get('activities', [])
        def prepare(db):
            job = _read(db, job_id)
            if not job or job['generation'] != generation:
                return None
            if not manual:
                if not job['enabled']:
                    return None
                # Re-arm time-zone projections and skip missed occurrences after
                # wake. UTC expressions still use Harnest's own cron calculator.
                self._schedule(db, job, now)
            self._reconcile(db, job, activities)
            run = next((r for r in job['runs'] if r['id'] == occurrence), None)
            if run and run.get('status') != 'queued':
                _write(db, job)
                return None
            if now - due_at > 90:
                if run:
                    run.update(status='interrupted', error='Missed run skipped. It was not retried.')
                _write(db, job)
                return None
            if any(r['id'] != occurrence and r.get('status') in _ACTIVE for r in job['runs']):
                job['error'] = 'Skipped: the previous run is still active or waiting for approval.'
                if run:
                    run.update(status='skipped', error=job['error'])
                _write(db, job)
                return None
            if not run:
                run = dict(id=occurrence, startedAt=iso(now))
                job['runs'] = [run, *job['runs']][:20]
            run['status'] = 'starting'
            job.pop('error', None)
            _write(db, job)
            return job
        async with self._lock:
            job = await self.provider.transaction(prepare)
            if job is None:
                return {'status': 'skipped'}
            try:
                activity_id = backend.start(dict(prompt=job['prompt'], model=job['model'], scheduledRunId=occurrence), internal=True)
                result = dict(activityId=activity_id, status='starting')
            except Exception as error:
                result = dict(status='failed', error=str(error)[:2000])
            def report(db):
                saved = _read(db, job_id)
                if saved:
                    for run in saved['runs']:
                        if run['id'] == occurrence:
                            run.update(result)
                    _write(db, saved)
            await self.provider.transaction(report)
            return result


_schedulers = {}


def scheduler():
    provider = store()
    key = str(provider.path)
    if key not in _schedulers:
        _schedulers[key] = Scheduler(provider)
    return _schedulers[key]
