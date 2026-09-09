"""Local Harnest sessions and checkpoints owned by one desktop runtime.

An OS lock excludes other runtime processes; per-session leases serialize graph
execution. Short SQLite transactions run on a dedicated thread, never across a
model or client-tool wait. This store does not implement external continuations.
"""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sqlite3

from harnest.checkpoint import (
    CheckpointConflictError, CheckpointRecord, CheckpointWrite, HarnestStore,
    PendingAction, RunRecord,
)
from harnest.logging import get_logger
from harnest.runtime import SessionConflictError, SessionRecord


_AUDIT = get_logger('dextana.storage')
_SCOPE = 'application_id=? AND user_id=? AND session_id=? AND run_id=?'
_SCHEMA = '''
CREATE TABLE sessions (
    user_id TEXT NOT NULL, session_id TEXT NOT NULL, state TEXT NOT NULL,
    application_data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL, PRIMARY KEY (user_id, session_id)
);
CREATE TABLE runs (
    application_id TEXT NOT NULL, user_id TEXT NOT NULL, session_id TEXT NOT NULL,
    run_id TEXT PRIMARY KEY, framework TEXT NOT NULL, status TEXT NOT NULL,
    revision INTEGER NOT NULL, pending_action TEXT, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX active_session ON runs(application_id, user_id, session_id)
    WHERE status IN ('running', 'waiting');
CREATE TABLE checkpoints (
    run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    checkpoint_id TEXT NOT NULL, namespace TEXT NOT NULL, framework TEXT NOT NULL,
    type_name TEXT NOT NULL, payload BLOB NOT NULL, metadata_type TEXT NOT NULL,
    metadata BLOB NOT NULL, versions_type TEXT NOT NULL, versions BLOB NOT NULL,
    parent_checkpoint_id TEXT, revision INTEGER NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (run_id, namespace, checkpoint_id)
);
CREATE INDEX checkpoint_history ON checkpoints(run_id, namespace, revision DESC);
CREATE TABLE writes (
    run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    checkpoint_id TEXT NOT NULL, task_id TEXT NOT NULL, channel TEXT NOT NULL,
    type_name TEXT NOT NULL, payload BLOB NOT NULL, task_path TEXT NOT NULL,
    PRIMARY KEY (run_id, checkpoint_id, task_id, channel)
);
PRAGMA user_version=1;
'''


def _now():
    return datetime.now(timezone.utc).isoformat()


def _dump(value):
    """Persist JSON data strictly, without pickle or lossy string conversion."""
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':'))


def _identity(*values):
    if any(not isinstance(value, str) or not value.strip() for value in values):
        raise ValueError('Storage identifiers must be non-empty strings')


def _limit(value):
    if value is not None and (type(value) is not int or value < 1):
        raise ValueError('limit must be a positive integer')


def _scope(scope):
    return (scope.application_id, scope.user_id, scope.session_id, scope.run_id)


def _session(row):
    if row is None:
        return None
    return SessionRecord(
        id=row['session_id'], user_id=row['user_id'], state=json.loads(row['state']),
        application_data=json.loads(row['application_data']),
        created_at=row['created_at'], updated_at=row['updated_at'],
    )


def _run(row):
    if row is None:
        return None
    values = dict(row)
    pending = values['pending_action']
    values['pending_action'] = PendingAction(**json.loads(pending)) if pending else None
    return RunRecord(**values)


def _owned(db, scope, *, writable=False):
    """Check the entire ownership key before checkpoint reads or mutations."""
    run = _run(db.execute(f'SELECT * FROM runs WHERE {_SCOPE}', _scope(scope)).fetchone())
    if writable:
        if run is None:
            raise KeyError('checkpoint run not found')
        if run.status not in ('running', 'waiting'):
            raise CheckpointConflictError('checkpoint run is already terminal')
    return run


def _insert(db, table, values):
    """Insert an internal, fixed-schema record with every value parameterized."""
    columns = ','.join(values)
    placeholders = ','.join('?' for _ in values)
    db.execute(f'INSERT INTO {table} ({columns}) VALUES ({placeholders})', tuple(values.values()))


class SQLiteStore(HarnestStore):
    """Durable combined store for Dextana's single-process ADK backend."""

    def __init__(self, path):
        """Defer all disk access until Harnest starts the storage lifecycle."""
        self.path = Path(path).resolve()
        self._db = None
        self._owner = None
        self._executor = None
        self._session_locks = {}

    def _claim(self):
        """Hold a kernel-released lock for the full runtime lifetime."""
        fd = os.open(str(self.path) + '.lock', os.O_CREAT | os.O_RDWR, 0o600)
        try:
            if os.name == 'nt':
                import msvcrt
                if os.fstat(fd).st_size == 0:
                    os.write(fd, b'0')
                os.lseek(fd, 0, os.SEEK_SET)
                msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            os.close(fd)
            raise RuntimeError('Dextana agent storage is already in use') from error
        self._owner = fd

    def _open(self):
        """Open private WAL storage and retire runs abandoned by a prior process."""
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self._claim()
        try:
            fd = os.open(self.path, os.O_CREAT | os.O_RDWR, 0o600)
            os.close(fd)
            os.chmod(self.path, 0o600)
            self._db = sqlite3.connect(self.path, timeout=10)
            self._db.row_factory = sqlite3.Row
            self._db.execute('PRAGMA foreign_keys=ON')
            self._db.execute('PRAGMA journal_mode=WAL')
            self._db.execute('PRAGMA synchronous=FULL')
            version = self._db.execute('PRAGMA user_version').fetchone()[0]
            if version == 0:
                self._db.executescript('BEGIN IMMEDIATE;\n' + _SCHEMA + '\nCOMMIT;')
            elif version != 1:
                raise RuntimeError('Unsupported Dextana agent storage schema')
            # No previous process can still own an invocation after _claim().
            # Preserve its checkpoints, but never replay an uncertain action.
            with self._db:
                recovered = self._db.execute(
                    "UPDATE runs SET status='failed', pending_action=NULL, revision=revision+1, updated_at=? WHERE status IN ('running','waiting')",
                    (_now(),),
                ).rowcount
            if recovered:
                _AUDIT.info('run.recovery', operation='run.recovery', outcome='committed', backend='sqlite')
        except BaseException:
            self._close()
            raise

    async def start(self):
        """Start a dedicated database thread; compilation only constructs us."""
        if self._executor is not None:
            raise RuntimeError('SQLite store is already started')
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='dextana-storage')
        try:
            await asyncio.get_running_loop().run_in_executor(self._executor, self._open)
        except BaseException:
            await self.close()
            raise

    async def _call(self, action, operation=None):
        """Serialize short atomic operations and audit mutations after commit."""
        if self._executor is None or self._db is None:
            raise RuntimeError('SQLite store is not started')

        def transaction():
            try:
                with self._db:
                    self._db.execute('BEGIN IMMEDIATE')
                    result = action(self._db)
            except BaseException:
                if operation:
                    _AUDIT.info(operation, operation=operation, outcome='failed', backend='sqlite')
                raise
            if operation:
                _AUDIT.info(operation, operation=operation, outcome='committed', backend='sqlite')
            return result
        return await asyncio.get_running_loop().run_in_executor(self._executor, transaction)

    def _close(self):
        """Close the connection before releasing the process ownership lock."""
        try:
            if self._db is not None:
                self._db.close()
                self._db = None
        finally:
            if self._owner is not None:
                os.close(self._owner)
                self._owner = None

    async def close(self):
        """Drain committed operations and release resources without deleting data."""
        if self._executor is not None:
            executor = self._executor
            await asyncio.get_running_loop().run_in_executor(executor, self._close)
            executor.shutdown(wait=True)
            self._executor = None
        self._session_locks.clear()

    @asynccontextmanager
    async def _locked(self, user_id, session_id):
        """Keep session locks only while holders or waiters reference them."""
        _identity(user_id, session_id)
        key = (user_id, session_id)
        entry = self._session_locks.setdefault(key, [asyncio.Lock(), 0])
        entry[1] += 1
        try:
            async with entry[0]:
                yield
        finally:
            entry[1] -= 1
            if not entry[1]:
                self._session_locks.pop(key, None)

    async def create(self, *, session_id, user_id, state):
        """Create a scoped session without overwriting an existing conversation."""
        _identity(session_id, user_id)
        encoded = _dump(dict(state))

        def create(db):
            try:
                db.execute('INSERT INTO sessions VALUES (?,?,?,\'{}\',?,?)',
                           (user_id, session_id, encoded, _now(), _now()))
            except sqlite3.IntegrityError as error:
                raise SessionConflictError('session already exists') from error
            return _session(db.execute('SELECT * FROM sessions WHERE user_id=? AND session_id=?', (user_id, session_id)).fetchone())
        return await self._call(create, 'session.create')

    async def get(self, *, session_id, user_id):
        """Read a committed snapshot without waiting for a long model invocation."""
        _identity(session_id, user_id)
        return await self._call(lambda db: _session(db.execute(
            'SELECT * FROM sessions WHERE user_id=? AND session_id=?', (user_id, session_id)).fetchone()))

    async def list(self, *, user_id, after=None, limit=None):
        """Filter and paginate by owner and session key in SQLite."""
        _identity(user_id)
        if after is not None:
            _identity(after)
        _limit(limit)
        return await self._call(lambda db: tuple(_session(row) for row in db.execute(
            'SELECT * FROM sessions WHERE user_id=? AND (? IS NULL OR session_id>?) ORDER BY session_id LIMIT ?',
            (user_id, after, after, -1 if limit is None else limit))))

    async def _replace(self, session_id, user_id, value, *, lane='state', merge=False):
        """Commit one data lane; callers must already hold the session lease."""
        if lane not in ('state', 'application_data'):
            raise ValueError('Unknown session data lane')
        normalized = json.loads(_dump(dict(value)))

        def update(db):
            row = db.execute('SELECT * FROM sessions WHERE user_id=? AND session_id=?', (user_id, session_id)).fetchone()
            if row is None:
                return None
            updated = {**json.loads(row[lane]), **normalized} if merge else normalized
            db.execute(f'UPDATE sessions SET {lane}=?, updated_at=? WHERE user_id=? AND session_id=?',
                       (_dump(updated), _now(), user_id, session_id))
            return _session(db.execute('SELECT * FROM sessions WHERE user_id=? AND session_id=?', (user_id, session_id)).fetchone())
        return await self._call(update, 'session.update')

    async def update(self, *, session_id, user_id, state_delta):
        """Merge a public update after any active execution lease finishes."""
        async with self._locked(user_id, session_id):
            return await self._replace(session_id, user_id, state_delta, merge=True)

    async def delete(self, *, session_id, user_id):
        """Delete one owner's session after active execution has released it."""
        async with self._locked(user_id, session_id):
            return await self._call(lambda db: bool(db.execute(
                'DELETE FROM sessions WHERE user_id=? AND session_id=?', (user_id, session_id)).rowcount), 'session.delete')

    @asynccontextmanager
    async def acquire(self, *, session_id, user_id):
        """Hold session exclusivity without holding a SQLite write transaction."""
        async with self._locked(user_id, session_id):
            record = await self.get(session_id=session_id, user_id=user_id)
            if record is None:
                raise KeyError('session not found')
            lease = _SQLiteLease(self, record)
            try:
                yield lease
            finally:
                lease.active = False

    async def begin_run(self, *, application_id, user_id, session_id, run_id, framework):
        """Idempotently create a run while enforcing one active run per session."""
        _identity(application_id, user_id, session_id, run_id)
        if framework not in ('adk', 'langgraph'):
            raise ValueError('Unknown checkpoint framework')
        run = RunRecord(application_id, user_id, session_id, run_id, framework)

        def begin(db):
            existing = _run(db.execute('SELECT * FROM runs WHERE run_id=?', (run_id,)).fetchone())
            if existing is not None:
                if existing.scope != run.scope or existing.framework != framework:
                    raise CheckpointConflictError('run_id belongs to another execution')
                return existing
            try:
                _insert(db, 'runs', asdict(run))
            except sqlite3.IntegrityError as error:
                raise CheckpointConflictError('session already has an active checkpoint run') from error
            return run
        return await self._call(begin, 'run.begin')

    async def get_run(self, *, scope):
        """Read a run using its full application, user, and session identity."""
        return await self._call(lambda db: _owned(db, scope))

    async def get_checkpoint(self, *, scope, checkpoint_id=None, namespace=''):
        """Read an exact checkpoint or the highest committed namespace revision."""
        def read(db):
            if _owned(db, scope) is None:
                return None
            row = db.execute('SELECT * FROM checkpoints WHERE run_id=? AND namespace=? AND (? IS NULL OR checkpoint_id=?) ORDER BY revision DESC LIMIT 1',
                             (scope.run_id, namespace, checkpoint_id, checkpoint_id)).fetchone()
            return None if row is None else CheckpointRecord(**dict(row))
        return await self._call(read)

    async def list_checkpoints(self, *, scope, namespace=None, before=None, limit=20):
        """Read a bounded newest-first history entirely within the owned run."""
        _limit(limit)
        if limit is None:
            raise ValueError('checkpoint history needs a finite limit')

        def read(db):
            if _owned(db, scope) is None:
                return ()
            return tuple(CheckpointRecord(**dict(row)) for row in db.execute(
                'SELECT * FROM checkpoints WHERE run_id=? AND (? IS NULL OR namespace=?) AND (? IS NULL OR checkpoint_id<?) ORDER BY revision DESC LIMIT ?',
                (scope.run_id, namespace, namespace, before, before, limit)))
        for record in await self._call(read):
            yield record

    async def put(self, checkpoint, *, scope, expected_revision):
        """Use transactional compare-and-swap and preserve opaque checkpoint bytes."""
        if checkpoint.run_id != scope.run_id:
            raise ValueError('checkpoint run does not match scope')

        def put(db):
            run = _owned(db, scope, writable=True)
            if checkpoint.framework != run.framework:
                raise ValueError('checkpoint framework does not match run')
            key = (scope.run_id, checkpoint.namespace, checkpoint.checkpoint_id)
            current = db.execute('SELECT revision FROM checkpoints WHERE run_id=? AND namespace=? AND checkpoint_id=?', key).fetchone()
            if (None if current is None else current[0]) != expected_revision:
                raise CheckpointConflictError('checkpoint revision changed')
            revision = db.execute('SELECT COALESCE(MAX(revision),-1)+1 FROM checkpoints WHERE run_id=? AND namespace=?', key[:2]).fetchone()[0]
            values = {**asdict(checkpoint), 'revision': revision}
            db.execute('DELETE FROM checkpoints WHERE run_id=? AND namespace=? AND checkpoint_id=?', key)
            _insert(db, 'checkpoints', values)
            return CheckpointRecord(**values)
        return await self._call(put, 'checkpoint.put')

    async def put_writes(self, *, scope, checkpoint_id, writes):
        """Keep the first write for each task/channel, including duplicate batches."""
        values = [asdict(write) for write in writes]

        def put(db):
            _owned(db, scope, writable=True)
            db.executemany('INSERT OR IGNORE INTO writes VALUES (?,?,?,?,?,?,?)', [
                (scope.run_id, checkpoint_id, item['task_id'], item['channel'], item['type_name'], item['payload'], item['task_path'])
                for item in values])
        await self._call(put, 'checkpoint.writes')

    async def get_writes(self, *, scope, checkpoint_id):
        """Read writes through the same scoped batch path used by history reads."""
        return (await self.get_writes_batch(scope=scope, checkpoint_ids=[checkpoint_id])).get(checkpoint_id, ())

    async def get_writes_batch(self, *, scope, checkpoint_ids):
        """Fetch all requested writes in one indexed SQL query."""
        ids = tuple(dict.fromkeys(checkpoint_ids))

        def read(db):
            if _owned(db, scope) is None or not ids:
                return {}
            grouped = {key: [] for key in ids}
            marks = ','.join('?' for _ in ids)
            for row in db.execute(f'SELECT * FROM writes WHERE run_id=? AND checkpoint_id IN ({marks}) ORDER BY rowid', (scope.run_id, *ids)):
                values = dict(row)
                values.pop('run_id')
                grouped[values.pop('checkpoint_id')].append(CheckpointWrite(**values))
            return {key: tuple(value) for key, value in grouped.items()}
        return await self._call(read)

    async def transition(self, *, scope, expected_status, status, pending_action=None):
        """Apply the Harnest run-state machine with an atomic status comparison."""
        allowed = {'running': {'waiting', 'completed', 'failed', 'cancelled'}, 'waiting': {'running', 'failed', 'cancelled'}}
        if status not in allowed.get(expected_status, set()):
            raise CheckpointConflictError('invalid run transition')
        if (status == 'waiting') != (pending_action is not None):
            raise ValueError('pending_action is required only for waiting runs')

        def transition(db):
            current = _owned(db, scope, writable=True)
            if current.status != expected_status:
                raise CheckpointConflictError('checkpoint run status changed')
            db.execute(f'UPDATE runs SET status=?, pending_action=?, revision=revision+1, updated_at=? WHERE {_SCOPE}',
                       (status, _dump(asdict(pending_action)) if pending_action else None, _now(), *_scope(scope)))
            return _owned(db, scope)
        return await self._call(transition, 'run.transition')

    async def delete_run(self, *, scope):
        """Delete an owned run and cascade to its checkpoints and pending writes."""
        await self._call(lambda db: db.execute(f'DELETE FROM runs WHERE {_SCOPE}', _scope(scope)).rowcount, 'run.delete')


class _SQLiteLease:
    """A session-scoped capability whose mutations expire when the lease exits."""

    def __init__(self, store, record):
        self._store = store
        self._record = record
        self._lock = asyncio.Lock()
        self.active = True

    @property
    def record(self):
        return self._record

    async def _replace(self, value, **options):
        """Serialize sibling ADK writes so state and application data stay distinct."""
        async with self._lock:
            if not self.active:
                raise RuntimeError('Session lease has expired')
            self._record = await self._store._replace(self._record.id, self._record.user_id, value, **options)
            if self._record is None:
                raise KeyError('session not found')
            return self._record

    async def patch_state(self, delta):
        return await self._replace(delta, merge=True)

    async def replace_state(self, state):
        return await self._replace(state)

    async def replace_application_data(self, data):
        return await self._replace(data, lane='application_data')
