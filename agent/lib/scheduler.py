"""Backend-owned schedules and durable dispatch records for desktop activities."""
import json
import os
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo
from croniter import croniter


def next_run(expression, timezone, now):
    if len(expression) > 200 or len(expression.split()) != 5:
        raise ValueError('Use five cron fields: minute hour day month weekday.')
    zone = ZoneInfo(timezone)
    return croniter(expression, datetime.fromtimestamp(now, zone), max_years_between_matches=8).get_next(datetime).timestamp()


def iso(value):
    return datetime.fromtimestamp(value, ZoneInfo('UTC')).isoformat()


class Scheduler:
    def __init__(self, path=None, clock=time.time):
        self.path = path or str(Path(os.environ['DEXTANA_SCHEDULER_DIRECTORY']) / 'schedules.sqlite')
        self.clock = clock

    @contextmanager
    def connect(self):
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=10)
        os.chmod(self.path, 0o600)
        try:
            db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
            with db:
                yield db
        finally:
            db.close()

    def jobs(self, db):
        return [json.loads(row[0]) for row in db.execute('SELECT data FROM jobs ORDER BY rowid')]

    def write(self, db, job):
        db.execute('INSERT INTO jobs VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', (job['id'], json.dumps(job)))

    def list(self):
        with self.connect() as db:
            return self.jobs(db)

    def save(self, data, job_id=None):
        now = self.clock()
        upcoming = next_run(data['expression'], data['timezone'], now)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            jobs = self.jobs(db)
            old = next((job for job in jobs if job['id'] == job_id), None)
            if job_id and not old:
                raise ValueError('Scheduled job no longer exists.')
            if not old and len(jobs) >= 100:
                raise ValueError('Keep up to 100 jobs.')
            job = {**data, 'id': job_id or str(uuid4()), 'runs': old['runs'] if old else [], 'nextRunAt': iso(upcoming) if data['enabled'] else None}
            self.write(db, job)
            return job['id']

    def remove(self, job_id):
        with self.connect() as db:
            db.execute('DELETE FROM jobs WHERE id=?', (job_id,))

    def enqueue(self, job, now):
        if any(run.get('status') in ('queued', 'claimed', 'starting', 'running') for run in job['runs']):
            job['error'] = 'Skipped: the previous run is still active or waiting for approval.'
            return
        job.pop('error', None)
        job['runs'] = [{'id': str(uuid4()), 'startedAt': iso(now), 'status': 'queued'}, *job['runs']][:20]

    def run_now(self, job_id):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            job = next((job for job in self.jobs(db) if job['id'] == job_id), None)
            if not job:
                raise ValueError('Scheduled job no longer exists.')
            self.enqueue(job, self.clock())
            self.write(db, job)

    def initialize(self):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            for job in self.jobs(db):
                # Never replay runs whose outcome is uncertain after a server restart.
                for run in job['runs']:
                    if run.get('status') in ('queued', 'claimed', 'starting', 'running'):
                        run.update(status='interrupted', error='Backend restarted. This run was not retried.')
                try:
                    job['nextRunAt'] = iso(next_run(job['expression'], job['timezone'], self.clock())) if job['enabled'] else None
                except (ValueError, KeyError) as error:
                    job.update(enabled=False, error=str(error), nextRunAt=None)
                self.write(db, job)

    def tick(self):
        now = self.clock()
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            for job in self.jobs(db):
                if not job['enabled'] or not job.get('nextRunAt'):
                    continue
                due = datetime.fromisoformat(job['nextRunAt']).timestamp()
                if due > now:
                    continue
                job['nextRunAt'] = iso(next_run(job['expression'], job['timezone'], now))
                if now - due <= 90:
                    self.enqueue(job, now)
                self.write(db, job)

    def claim(self):
        claimed = []
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            for job in self.jobs(db):
                for run in job['runs']:
                    if run.get('status') == 'queued':
                        run['status'] = 'claimed'
                        claimed.append({'jobId': job['id'], 'runId': run['id'], 'prompt': job['prompt'], 'model': job['model']})
                self.write(db, job)
        return claimed

    def report(self, job_id, run_id, result):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            for job in self.jobs(db):
                if job['id'] != job_id:
                    continue
                for run in job['runs']:
                    if run['id'] == run_id:
                        run.update(result)
                self.write(db, job)
