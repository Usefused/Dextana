"""Desktop schedule metadata and time-zone policy over Harnest's cron runtime.

There is no polling or dispatch loop here. Harnest advances durable UTC cursors
and invokes tasks/scheduled_activity.py. Non-UTC schedules project their next
local occurrence into UTC and re-arm after delivery, retaining DST behavior.
"""
import asyncio
from dataclasses import replace
from datetime import datetime
import json
import os
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
    if job.get('runAt'):
        ZoneInfo(job['timezone'])
        return '', datetime.fromisoformat(job['runAt']).timestamp()
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


def _reference(db, job_id):
    # Durable public handles never change on restart, collide on duplicate names,
    # or get reused after removal. Existing jobs acquire one without rescheduling.
    row = db.execute('SELECT number FROM schedule_references WHERE job_id=?', (job_id,)).fetchone()
    number = row['number'] if row else db.execute(
        'INSERT INTO schedule_references(job_id) VALUES (?)', (job_id,)).lastrowid
    return f'Schedule {number}'


def _tool_receipt(job):
    # Explicit model-facing contract. Never spread stored jobs or run records here.
    return dict(reference=job['reference'], name=job['name'], prompt=job['prompt'],
                kind=job['kind'], enabled=job['enabled'], nextRunAt=job.get('nextRunAt'),
                timezone=job['timezone'], expression=job.get('expression') or None,
                runAt=job.get('runAt'))


def _retire_completed(db, job):
    # Match the current one-time occurrence: older/manual runs must not remove
    # a rescheduled job. Keep native task receipts for durable replay protection.
    if (job.get('runAt') and not job['enabled']
            and any(run['id'] == job.get('nativeTaskId') and run.get('status') == 'completed' for run in job['runs'])
            and not any(run.get('status') in _ACTIVE for run in job['runs'])):
        db.execute('DELETE FROM jobs WHERE id=?', (job['id'],))
        return True
    return False


def _overdue_reminder(job, current, now):
    return (job.get('kind') == 'reminder' and job['enabled'] and current
            and current.status == 'active' and current.next_run_at <= now)


def _interrupt_restart_runs(job, legacy):
    for run in job['runs']:
        if run.get('status') in _ACTIVE and (legacy or run.get('status') != 'queued'):
            run.update(status='interrupted', error='Backend restarted. This run was not retried.')


def _existing_job(db, job_id):
    old = _read(db, job_id) if job_id else None
    if job_id and not old:
        raise ValueError('Scheduled job no longer exists.')
    if not old and db.execute('SELECT count(*) FROM jobs').fetchone()[0] >= 100:
        raise ValueError('Keep up to 100 jobs.')
    return old


def _generation_changed(old, data):
    if not old:
        return True
    fields = ('prompt', 'model', 'expression', 'timezone', 'runAt', 'kind')
    if any(old.get(key) != data.get(key) for key in fields):
        return True
    return bool(data.get('runAt') and old['enabled'] != data['enabled'])


def _task_replaced(old, job):
    return old and old.get('nativeTaskId') and (job['generation'] != old['generation'] or not job['enabled'])


def _missed_status(job, due_at, manual, now):
    if job.get('kind') != 'reminder':
        if now - due_at > 90:
            return 'interrupted', 'Missed run skipped. It was not retried.'
        return None
    if not manual and due_at <= job.get('reminderCatchupThrough', 0):
        return 'skipped', 'Combined into the overdue reminder already delivered.'
    return None


def _skip_occurrence(job, run, occurrence, due_at, manual, now):
    if run and run.get('status') != 'queued':
        return True
    missed = _missed_status(job, due_at, manual, now)
    if missed:
        if run:
            run.update(status=missed[0], error=missed[1])
        return True
    return _overlapping_run(job, run, occurrence)


def _overlapping_run(job, run, occurrence):
    if not any(r['id'] != occurrence and r.get('status') in _ACTIVE for r in job['runs']):
        return False
    job['error'] = 'Skipped: the previous run is still active or waiting for approval.'
    if run:
        run.update(status='skipped', error=job['error'])
    return True


def _start_run(job, run, occurrence, due_at, manual, now):
    if not run:
        run = dict(id=occurrence, startedAt=iso(now))
        if job.get('kind') == 'reminder':
            run['activityId'] = job['sourceActivityId']
        job['runs'] = [run, *job['runs']][:20]
    run['status'] = 'starting'
    if job.get('kind') == 'reminder' and not manual and now - due_at > 90:
        # Native tasks already queued for this missed period share one reminder.
        job['reminderCatchupThrough'] = now
    job.pop('error', None)


def _tool_timing(arguments, now):
    delay = arguments.get('delay_seconds', 0)
    run_at = arguments.get('run_at', '')
    expression = arguments.get('expression', '')
    if type(delay) not in (int, float) or delay < 0 or delay > 315360000:
        raise ValueError('Use a positive delay of at most ten years.')
    if sum(bool(value) for value in (delay, run_at, expression)) != 1:
        raise ValueError('Specify exactly one delay, future date, or recurring cron expression. Ask the owner when if it is unknown.')
    if delay:
        run_at = iso(now + delay)
    return run_at, expression


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

    def _schedule(self, db, job, now, preserve_reminder_due=False):
        expression, upcoming = _native_schedule(job, now)
        if job.get('runAt'):
            self._schedule_once(db, job, now, upcoming)
            return
        self._schedule_recurring(db, job, now, expression, upcoming, preserve_reminder_due)

    def _schedule_once(self, db, job, now, upcoming):
        job['nextRunAt'] = iso(upcoming) if job['enabled'] else None
        if job.get('nativeCronId'):
            db.execute('DELETE FROM harnest_cron WHERE application_id=? AND schedule_id=?', (APPLICATION, job.pop('nativeCronId')))
        if job['enabled']:
            identifier = 'once_' + uuid5(NAMESPACE_URL, job['id'] + ':' + job['generation']).hex
            arguments = dict(job_id=job['id'], generation=job['generation'], once=True, occurrence=identifier, due_at=upcoming)
            record = self.provider.enqueue(db, TaskRecord(job_id=identifier, application_id=APPLICATION, user_id=OWNER,
                task_name=TASK, queue=QUEUE, arguments=arguments, agent_permissions=(), trigger='user',
                scheduled_at=upcoming, max_retries=0, idempotency_key=identifier, created_at=now, updated_at=now))
            job['nativeTaskId'] = record.job_id
            if record.status in ('completed', 'failed', 'cancelled'):
                job.update(enabled=False, nextRunAt=None)

    def _schedule_recurring(self, db, job, now, expression, upcoming, preserve_reminder_due):
        identifier = job.setdefault('nativeCronId', 'cron_' + uuid5(NAMESPACE_URL, APPLICATION + ':' + job['id']).hex)
        generation = job.setdefault('generation', uuid4().hex)
        row = db.execute('SELECT data FROM harnest_cron WHERE application_id=? AND user_id=? AND schedule_id=?',
                         (APPLICATION, OWNER, identifier)).fetchone()
        current = CronRecord(**json.loads(row['data'])) if row else None
        if preserve_reminder_due and _overdue_reminder(job, current, now):
            # Let Harnest dispatch its existing durable occurrence. execute()
            # re-arms from the current time, coalescing missed reminder periods.
            upcoming = current.next_run_at
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
                self._reconcile_activity(job, run, activity)
            elif run.get('status') in _ACTIVE and run.get('taskId'):
                self._reconcile_task(db, run)

    def _reconcile_activity(self, job, run, activity):
        if job.get('kind') == 'reminder':
            if any(m.get('id') == run['id'] and m.get('reminder') for m in activity.get('messages', [])):
                run.update(activityId=activity['id'], status='completed')
            return
        run.update(activityId=activity['id'], status=activity['status'])
        if activity.get('error'):
            run['error'] = activity['error']
        else:
            run.pop('error', None)

    def _reconcile_task(self, db, run):
        row = db.execute('SELECT data FROM harnest_tasks WHERE application_id=? AND job_id=?', (APPLICATION, run['taskId'])).fetchone()
        if not row:
            return
        task = json.loads(row['data'])
        if task['status'] in ('failed', 'cancelled'):
            run.update(status='interrupted', error='The dispatch did not finish. It was not retried.')
        elif task['status'] == 'completed' and (task.get('result') or {}).get('status') == 'skipped':
            run.update(status='skipped', error='The schedule changed before dispatch. This run was skipped.')

    def _initialize_job(self, db, job, activities):
        legacy = not job.get('nativeCronId') and not job.get('nativeTaskId')
        job.setdefault('generation', uuid4().hex)
        self._reconcile(db, job, activities)
        if _retire_completed(db, job):
            return
        _interrupt_restart_runs(job, legacy)
        try:
            # Work skips missed runs; reminders preserve Harnest's due cursor.
            self._skip_stopped_work(db, job)
            self._schedule(db, job, self.clock(), preserve_reminder_due=True)
        except (ValueError, KeyError) as error:
            job.update(enabled=False, error=str(error), nextRunAt=None)
            db.execute("UPDATE harnest_cron SET status='paused', data=json_set(data,'$.status','paused') WHERE application_id=? AND user_id=? AND schedule_id=?",
                       (APPLICATION, OWNER, job.get('nativeCronId', '')))
        _write(db, job)

    def _skip_stopped_work(self, db, job):
        if job.get('kind') == 'reminder' or not job.get('runAt') or not job['enabled']:
            return
        if datetime.fromisoformat(job['runAt']).timestamp() >= self.clock() - 90:
            return
        job.update(enabled=False, nextRunAt=None, error='Missed run skipped while the backend was stopped.')
        self.provider.cancel(db, application_id=APPLICATION, user_id=OWNER, job_id=job.get('nativeTaskId', ''), now=self.clock())

    async def initialize(self):
        if not self.provider.started:
            await self.provider.start()
        activities = (self.backend().state or {}).get('activities', [])
        def migrate(db):
            for row in db.execute('SELECT data FROM jobs ORDER BY rowid').fetchall():
                self._initialize_job(db, json.loads(row['data']), activities)
        async with self._lock:
            await self.provider.transaction(migrate)

    async def list(self):
        activities = (self.backend().state or {}).get('activities', [])
        def read(db):
            jobs = [json.loads(row['data']) for row in db.execute('SELECT data FROM jobs ORDER BY rowid')]
            remaining = []
            for job in jobs:
                self._reconcile(db, job, activities)
                if _retire_completed(db, job):
                    continue
                _write(db, job)
                remaining.append({**{key: value for key, value in job.items() if key not in ('nativeCronId', 'nativeTaskId', 'generation')},
                                  'reference': _reference(db, job['id'])})
            return remaining
        async with self._lock:
            return await self.provider.transaction(read)

    async def save(self, data, job_id=None, source_activity_id=None):
        data = ScheduleInput(**data).model_dump()
        _, upcoming = _native_schedule(data, self.clock())
        if data.get('runAt') and data['enabled'] and upcoming <= self.clock():
            raise ValueError('Choose a future date and time.')
        async with self._lock:
            return await self.provider.transaction(lambda db: self._save_record(db, data, job_id, source_activity_id))

    def _save_record(self, db, data, job_id, source_activity_id):
        old = _existing_job(db, job_id)
        job = {**(old or {}), **data, 'id': job_id or str(uuid4()), 'runs': old['runs'] if old else []}
        if _generation_changed(old, data):
            job['generation'] = uuid4().hex
        if _task_replaced(old, job):
            self.provider.cancel(db, application_id=APPLICATION, user_id=OWNER, job_id=job.pop('nativeTaskId'), now=self.clock())
        if source_activity_id:
            job['sourceActivityId'] = source_activity_id
        if job['kind'] == 'reminder' and not job.get('sourceActivityId'):
            raise ValueError('Create reminders from the chat where they should be delivered.')
        job.pop('error', None)
        self._schedule(db, job, self.clock())
        _write(db, job)
        return job['id']

    async def remove(self, job_id):
        def remove(db):
            job = _read(db, job_id)
            if job:
                self.provider.cancel(db, application_id=APPLICATION, user_id=OWNER, job_id=job.get('nativeTaskId', ''), now=self.clock())
                db.execute('DELETE FROM harnest_cron WHERE application_id=? AND user_id=? AND schedule_id=?', (APPLICATION, OWNER, job.get('nativeCronId', '')))
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

    def _advance_dispatch(self, db, job, now, manual):
        if manual:
            return True
        if not job['enabled']:
            return False
        if job.get('runAt'):
            job.update(enabled=False, nextRunAt=None)
        else:
            self._schedule(db, job, now)
        return True

    def _prepare_dispatch(self, db, job_id, generation, occurrence, due_at, manual, now, activities):
        job = _read(db, job_id)
        if not job or job['generation'] != generation:
            return None
        if not self._advance_dispatch(db, job, now, manual):
            return None
        self._reconcile(db, job, activities)
        run = next((r for r in job['runs'] if r['id'] == occurrence), None)
        if _skip_occurrence(job, run, occurrence, due_at, manual, now):
            _write(db, job)
            return None
        _start_run(job, run, occurrence, due_at, manual, now)
        _write(db, job)
        return job

    async def execute(self, job_id, generation, occurrence, due_at, manual=False, once=False):
        """Launch one activity after a durable, non-replayable dispatch receipt."""
        now = self.clock()
        backend = self.backend()
        activities = (backend.state or {}).get('activities', [])
        def prepare(db):
            return self._prepare_dispatch(db, job_id, generation, occurrence, due_at, manual, now, activities)
        async with self._lock:
            job = await self.provider.transaction(prepare)
            if job is None:
                return {'status': 'skipped'}
            try:
                if job.get('kind') == 'reminder':
                    activity_id = backend.remind(job['sourceActivityId'], job['prompt'], occurrence, job['id'],
                                                 overdue=now - due_at > 90, due_at=iso(due_at))
                    result = dict(activityId=activity_id, status='completed')
                else:
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
                    if not _retire_completed(db, saved):
                        _write(db, saved)
            await self.provider.transaction(report)
            return result

    async def tool(self, activity, arguments):
        """Trusted activity identity and model come from the backend, never the model."""
        action = arguments.get('action')
        if action == 'list':
            return {'jobs': [_tool_receipt(job) for job in await self.list()]}
        if action == 'remove':
            identifier = arguments.get('schedule_id', '')
            # Accept old tool calls from saved conversations, but never return UUIDs.
            job = next((job for job in await self.list() if identifier in (job['reference'], job['id'])), None)
            if not job:
                raise ValueError('Scheduled job not found. List jobs to get its reference.')
            await self.remove(job['id'])
            return {'status': 'removed', 'reference': job['reference'], 'name': job['name']}
        if action != 'create':
            raise ValueError('Choose create, list, or remove.')
        return await self._create_from_tool(activity, arguments)

    async def _create_from_tool(self, activity, arguments):
        run_at, expression = _tool_timing(arguments, self.clock())
        zone = arguments.get('timezone') or os.environ.get('DEXTANA_TIMEZONE', 'UTC')
        identifier = await self.save(dict(name=arguments.get('name', ''), prompt=arguments.get('prompt', ''),
            kind=arguments.get('kind', 'reminder'), model=activity['model'], expression=expression, runAt=run_at or None,
            timezone=zone, enabled=True), source_activity_id=activity['id'])
        saved = next(job for job in await self.list() if job['id'] == identifier)
        local = datetime.fromisoformat(saved['nextRunAt']).astimezone(ZoneInfo(zone)).isoformat()
        return dict(status='scheduled', reference=saved['reference'], name=saved['name'], kind=saved['kind'], nextRunAt=local,
                    timezone=zone, expression=expression or None,
                    delivery='This chat' if saved['kind'] == 'reminder' else 'A new activity with normal action approvals',
                    availability=('Dextana delivers overdue reminders when it next runs or the computer wakes. Missed recurring periods are combined into one overdue reminder before resuming the schedule.'
                                  if saved['kind'] == 'reminder' else 'Dextana must be running and the computer awake. Missed task runs are skipped.'))


_schedulers = {}


def scheduler():
    provider = store()
    key = str(provider.path)
    if key not in _schedulers:
        _schedulers[key] = Scheduler(provider)
    return _schedulers[key]
