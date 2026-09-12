"""Local SQLite implementation of Harnest's public TaskStore and CronStore.

Harnest owns cron evaluation, workers, retries and lease renewal. This provider
only owns atomic persistence. It needs no database server or application timer.
"""
import asyncio
from dataclasses import fields, replace
import json
import math
import os
from pathlib import Path
import sqlite3
from uuid import uuid4

from harnest.cron_storage import CronRecord, CronStoreConflictError, cron_fingerprint
from harnest.task_storage import TaskRecord, TaskStoreConflictError, task_fingerprint, plain_json


_SCHEMA = '''
CREATE TABLE IF NOT EXISTS harnest_tasks (
 application_id TEXT NOT NULL, job_id TEXT NOT NULL, user_id TEXT NOT NULL,
 task_name TEXT NOT NULL, queue TEXT NOT NULL, status TEXT NOT NULL,
 scheduled_at REAL NOT NULL, lease_expires_at REAL, attempt INTEGER NOT NULL,
 max_retries INTEGER NOT NULL, idempotency_key TEXT, fingerprint TEXT NOT NULL,
 data TEXT NOT NULL, PRIMARY KEY(application_id, job_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS task_deduplication
 ON harnest_tasks(application_id, user_id, task_name, idempotency_key);
CREATE INDEX IF NOT EXISTS task_queue
 ON harnest_tasks(application_id, queue, status, scheduled_at, job_id);
CREATE INDEX IF NOT EXISTS task_leases
 ON harnest_tasks(application_id, queue, status, lease_expires_at);
CREATE TABLE IF NOT EXISTS harnest_cron (
 application_id TEXT NOT NULL, schedule_id TEXT NOT NULL, user_id TEXT NOT NULL,
 schedule_key TEXT NOT NULL, status TEXT NOT NULL, next_run_at REAL NOT NULL,
 revision INTEGER NOT NULL, data TEXT NOT NULL,
 PRIMARY KEY(application_id, schedule_id),
 UNIQUE(application_id, user_id, schedule_key)
);
CREATE INDEX IF NOT EXISTS cron_due
 ON harnest_cron(application_id, status, next_run_at, schedule_id);
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS schedule_references (
 number INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT UNIQUE NOT NULL
);
'''


def encode(value):
    return json.dumps(plain_json(value), allow_nan=False, separators=(',', ':'))


def _values(record):
    return {field.name: getattr(record, field.name) for field in fields(record)}


def _task(row):
    if row is None:
        return None
    value = json.loads(row['data'])
    if value['agent_permissions'] is not None:
        value['agent_permissions'] = tuple(value['agent_permissions'])
    return TaskRecord(**value)


def _cron(row):
    return None if row is None else CronRecord(**json.loads(row['data']))


def _limit(limit):
    if type(limit) is not int or not 1 <= limit <= 1000:
        raise ValueError('limit must be an integer from 1 to 1000')


def _lease(now, duration):
    if not math.isfinite(now) or not math.isfinite(duration) or duration <= 0:
        raise ValueError('A lease needs finite time and a positive duration')


def _owns(record, token, now):
    return (record is not None and record.status == 'running'
            and record.lease_token == token and record.lease_expires_at is not None
            and record.lease_expires_at > now)


def _terminal(record, status, now, result=None, failure_code=None):
    return replace(record, status=status, result=result, failure_code=failure_code,
                   arguments={}, invocation=None, agent_permissions=None,
                   lease_token=None, lease_expires_at=None, updated_at=now)


class SQLiteTaskStore:
    """Commit scoped queries and occurrence handoffs in short SQL transactions."""

    def __init__(self, path):
        self.path = Path(path).resolve()
        self.started = False

    def _connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA synchronous=FULL')
        return db

    async def start(self):
        def initialize():
            self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            fd = os.open(self.path, os.O_CREAT | os.O_RDWR, 0o600)
            os.close(fd)
            os.chmod(self.path, 0o600)
            db = self._connect()
            try:
                db.execute('PRAGMA journal_mode=WAL')
                db.executescript(_SCHEMA)
            finally:
                db.close()
        await asyncio.to_thread(initialize)
        self.started = True

    async def close(self):
        # Connections belong to individual operations, never to an event loop.
        self.started = False

    async def transaction(self, action):
        if not self.started:
            raise RuntimeError('Task storage is not started')
        def execute():
            db = self._connect()
            try:
                with db:
                    db.execute('BEGIN IMMEDIATE')
                    return action(db)
            finally:
                db.close()
        return await asyncio.to_thread(execute)

    def write_task(self, db, record, fingerprint=None):
        if fingerprint is None:
            fingerprint = db.execute('SELECT fingerprint FROM harnest_tasks WHERE application_id=? AND job_id=?',
                                     (record.application_id, record.job_id)).fetchone()['fingerprint']
        values = (record.application_id, record.job_id, record.user_id, record.task_name,
                  record.queue, record.status, record.scheduled_at, record.lease_expires_at,
                  record.attempt, record.max_retries, record.idempotency_key, fingerprint, encode(_values(record)))
        db.execute('''INSERT INTO harnest_tasks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(application_id,job_id) DO UPDATE SET status=excluded.status,
          scheduled_at=excluded.scheduled_at, lease_expires_at=excluded.lease_expires_at,
          attempt=excluded.attempt, data=excluded.data''', values)

    def enqueue(self, db, record):
        by_id = db.execute('SELECT * FROM harnest_tasks WHERE application_id=? AND job_id=?',
                           (record.application_id, record.job_id)).fetchone()
        by_key = None if record.idempotency_key is None else db.execute(
            'SELECT * FROM harnest_tasks WHERE application_id=? AND user_id=? AND task_name=? AND idempotency_key=?',
            (record.application_id, record.user_id, record.task_name, record.idempotency_key)).fetchone()
        if by_id and by_key and by_id['job_id'] != by_key['job_id']:
            raise TaskStoreConflictError('Task ID conflicts with its idempotency key')
        existing = by_key or by_id
        fingerprint = task_fingerprint(record)
        if existing:
            if existing['user_id'] != record.user_id or existing['fingerprint'] != fingerprint:
                raise TaskStoreConflictError('Task identity has a different definition')
            return _task(existing)
        self.write_task(db, record, fingerprint)
        return _task({'data': encode(_values(record))})

    async def enqueue_task(self, record):
        return await self.transaction(lambda db: self.enqueue(db, record))

    async def get_task(self, *, application_id, job_id, user_id=None):
        return await self.transaction(lambda db: _task(db.execute(
            'SELECT data FROM harnest_tasks WHERE application_id=? AND job_id=? AND (? IS NULL OR user_id=?)',
            (application_id, job_id, user_id, user_id)).fetchone()))

    async def claim_tasks(self, *, application_id, queues, now, lease_seconds, limit=1):
        _limit(limit)
        _lease(now, lease_seconds)
        if not queues:
            return ()
        def claim(db):
            marks = ','.join('?' for _ in queues)
            where = f"application_id=? AND queue IN ({marks}) AND ((status='pending' AND scheduled_at<=?) OR (status='running' AND lease_expires_at<=?))"
            params = (application_id, *queues, now, now)
            # Expired final attempts must not be resurrected or starve later work.
            db.execute(f'''UPDATE harnest_tasks SET status='failed', lease_expires_at=NULL,
              data=json_set(data, '$.status','failed', '$.failure_code','task_failed',
                '$.arguments',json('{{}}'), '$.invocation',NULL, '$.agent_permissions',NULL,
                '$.lease_token',NULL, '$.lease_expires_at',NULL, '$.updated_at',?)
              WHERE {where} AND attempt>=max_retries+1''', (now, *params))
            rows = db.execute(f'SELECT data FROM harnest_tasks WHERE {where} AND attempt<max_retries+1 ORDER BY scheduled_at,job_id LIMIT ?', (*params, limit)).fetchall()
            result = []
            for row in rows:
                record = _task(row)
                record = replace(record, status='running', attempt=record.attempt + 1,
                                 lease_token=uuid4().hex, lease_expires_at=now + lease_seconds, updated_at=now)
                self.write_task(db, record)
                result.append(record)
            return tuple(result)
        return await self.transaction(claim)

    async def renew_task_lease(self, *, application_id, job_id, lease_token, now, lease_seconds):
        _lease(now, lease_seconds)
        def renew(db):
            record = _task(db.execute('SELECT data FROM harnest_tasks WHERE application_id=? AND job_id=?', (application_id, job_id)).fetchone())
            if not _owns(record, lease_token, now):
                return False
            self.write_task(db, replace(record, lease_expires_at=now + lease_seconds, updated_at=now))
            return True
        return await self.transaction(renew)

    async def finish_task(self, *, application_id, job_id, lease_token, now, status, result=None, failure_code=None, retry_at=None):
        if status not in ('pending', 'completed', 'failed') or not math.isfinite(now):
            raise ValueError('Invalid task outcome')
        if status == 'pending' and (retry_at is None or not math.isfinite(retry_at) or retry_at < now):
            raise ValueError('Retry time must be at or after now')
        def finish(db):
            record = _task(db.execute('SELECT data FROM harnest_tasks WHERE application_id=? AND job_id=?', (application_id, job_id)).fetchone())
            if not _owns(record, lease_token, now):
                return False
            if status == 'pending' and record.attempt <= record.max_retries:
                record = replace(record, status='pending', scheduled_at=retry_at,
                                 lease_token=None, lease_expires_at=None, updated_at=now)
            elif status == 'pending':
                record = _terminal(record, 'failed', now, failure_code='task_failed')
            else:
                record = _terminal(record, status, now, result, failure_code)
            self.write_task(db, record)
            return True
        return await self.transaction(finish)

    def cancel(self, db, *, application_id, user_id, job_id, now):
        record = _task(db.execute('SELECT data FROM harnest_tasks WHERE application_id=? AND user_id=? AND job_id=?', (application_id, user_id, job_id)).fetchone())
        if record is None or record.status not in ('pending', 'running'):
            return False
        self.write_task(db, _terminal(record, 'cancelled', now, failure_code='task_cancelled'))
        return True

    async def cancel_task(self, *, application_id, user_id, job_id, now):
        return await self.transaction(lambda db: self.cancel(db, application_id=application_id, user_id=user_id, job_id=job_id, now=now))

    def write_cron(self, db, record):
        db.execute('''INSERT INTO harnest_cron VALUES (?,?,?,?,?,?,?,?)
          ON CONFLICT(application_id,schedule_id) DO UPDATE SET status=excluded.status,
          next_run_at=excluded.next_run_at, revision=excluded.revision, data=excluded.data''',
          (record.application_id, record.schedule_id, record.user_id, record.key, record.status,
           record.next_run_at, record.revision, encode(_values(record))))

    def create(self, db, record):
        rows = db.execute('''SELECT data FROM harnest_cron WHERE application_id=?
          AND (schedule_id=? OR (user_id=? AND schedule_key=?))''',
          (record.application_id, record.schedule_id, record.user_id, record.key)).fetchall()
        if rows:
            existing = _cron(rows[0])
            if len(rows) != 1 or (existing.user_id, existing.key) != (record.user_id, record.key) or cron_fingerprint(existing) != cron_fingerprint(record):
                raise CronStoreConflictError('Cron identity has a different definition')
            return existing
        self.write_cron(db, record)
        return _cron({'data': encode(_values(record))})

    async def create_cron(self, record):
        return await self.transaction(lambda db: self.create(db, record))

    async def get_cron(self, *, application_id, user_id, schedule_id):
        return await self.transaction(lambda db: _cron(db.execute(
            'SELECT data FROM harnest_cron WHERE application_id=? AND user_id=? AND schedule_id=?',
            (application_id, user_id, schedule_id)).fetchone()))

    async def list_crons(self, *, application_id, user_id, after=None, limit=100):
        _limit(limit)
        return await self.transaction(lambda db: tuple(_cron(row) for row in db.execute(
            'SELECT data FROM harnest_cron WHERE application_id=? AND user_id=? AND schedule_id>? ORDER BY schedule_id LIMIT ?',
            (application_id, user_id, after or '', limit))))

    def update(self, db, record, expected_revision):
        existing = _cron(db.execute('SELECT data FROM harnest_cron WHERE application_id=? AND user_id=? AND schedule_id=?',
                                   (record.application_id, record.user_id, record.schedule_id)).fetchone())
        if existing is None:
            raise KeyError(record.schedule_id)
        if (existing.key, existing.task_name) != (record.key, record.task_name) or existing.revision != expected_revision:
            raise CronStoreConflictError('Cron identity or revision changed')
        if existing.status == 'cancelled':
            if existing != record:
                raise CronStoreConflictError('Cancelled cron cannot change')
            return existing
        updated = replace(record, revision=existing.revision + 1)
        self.write_cron(db, updated)
        return _cron({'data': encode(_values(updated))})

    async def update_cron(self, record, *, expected_revision):
        return await self.transaction(lambda db: self.update(db, record, expected_revision))

    async def delete_cron(self, *, application_id, user_id, schedule_id):
        return await self.transaction(lambda db: bool(db.execute(
            'DELETE FROM harnest_cron WHERE application_id=? AND user_id=? AND schedule_id=?',
            (application_id, user_id, schedule_id)).rowcount))

    async def list_due_crons(self, *, application_id, now, after=None, limit=100):
        _limit(limit)
        cursor = '' if after is None else ' AND (next_run_at>? OR (next_run_at=? AND schedule_id>?))'
        values = () if after is None else (after[0], after[0], after[1])
        return await self.transaction(lambda db: tuple(_cron(row) for row in db.execute(
            "SELECT data FROM harnest_cron WHERE application_id=? AND status='active' AND next_run_at<=?" + cursor + ' ORDER BY next_run_at,schedule_id LIMIT ?',
            (application_id, now, *values, limit))))

    async def commit_cron_occurrence(self, *, application_id, user_id, schedule_id, expected_revision, due_at, next_run_at, task):
        if not math.isfinite(next_run_at) or next_run_at <= due_at:
            raise ValueError('Cron cursor must advance')
        def commit(db):
            record = _cron(db.execute('SELECT data FROM harnest_cron WHERE application_id=? AND user_id=? AND schedule_id=?',
                                     (application_id, user_id, schedule_id)).fetchone())
            if record is None or record.status != 'active' or record.revision != expected_revision or record.next_run_at != due_at:
                return None
            if (record.application_id, record.user_id, record.task_name, record.arguments) != (task.application_id, task.user_id, task.task_name, task.arguments):
                raise CronStoreConflictError('Occurrence does not match its schedule')
            queued = self.enqueue(db, task)
            self.write_cron(db, replace(record, next_run_at=next_run_at,
                                       revision=record.revision + 1, updated_at=task.created_at))
            return queued
        return await self.transaction(commit)


_stores = {}


def store():
    path = str(Path(os.environ.get('DEXTANA_SCHEDULER_DIRECTORY', '.harnest/state')) / 'schedules.sqlite')
    if path not in _stores:
        _stores[path] = SQLiteTaskStore(path)
    return _stores[path]
