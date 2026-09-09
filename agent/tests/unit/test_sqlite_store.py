"""Exercise the custom store through Harnest's public storage contracts."""
import asyncio
from dataclasses import replace
import os
import sqlite3
import subprocess
import sys

import pytest
from harnest.checkpoint import (
    CheckpointConflictError, CheckpointRecord, CheckpointStore, CheckpointWrite,
    PendingAction, RunScope,
)
from harnest.runtime import SessionConflictError
from harnest.session import SessionStore


def store_type(agent):
    from harnest.lib.sqlite_store import SQLiteStore
    return SQLiteStore


def checkpoint(run, name='one', namespace=''):
    return CheckpointRecord(
        run_id=run.run_id, checkpoint_id=name, namespace=namespace, framework='adk',
        type_name='json', payload=b'{"history":[]}', metadata_type='json',
        metadata=b'{}', versions_type='json', versions=b'{}',
    )


def test_sessions_and_application_data_survive_reopening(agent, tmp_path):
    cls = store_type(agent)

    async def exercise():
        path = tmp_path / 'state.sqlite'
        store = cls(path)
        assert isinstance(store, SessionStore)
        assert isinstance(store, CheckpointStore)
        await store.start()
        try:
            await store.create(user_id='owner', session_id='one', state={'history': ['hello']})
            with pytest.raises(SessionConflictError):
                await store.create(user_id='owner', session_id='one', state={})
            async with store.acquire(user_id='owner', session_id='one') as lease:
                await asyncio.gather(
                    lease.patch_state({'first': 1}), lease.patch_state({'second': 2}),
                    lease.replace_application_data({'selected': 'report.pdf'}),
                )
            assert await store.get(user_id='other', session_id='one') is None
            await store.create(user_id='other', session_id='one', state={'private': True})
            await store.create(user_id='owner', session_id='two', state={})
            assert [s.id for s in await store.list(user_id='owner', after='one', limit=1)] == ['two']
        finally:
            await store.close()
        reopened = cls(path)
        await reopened.start()
        try:
            record = await reopened.get(user_id='owner', session_id='one')
            assert record.state == {'history': ['hello'], 'first': 1, 'second': 2}
            assert record.application_data == {'selected': 'report.pdf'}
            assert await reopened.delete(user_id='owner', session_id='one')
            assert (await reopened.get(user_id='other', session_id='one')).state == {'private': True}
            if os.name != 'nt':
                assert path.stat().st_mode & 0o777 == 0o600
        finally:
            await reopened.close()
    asyncio.run(exercise())


def test_session_leases_serialize_same_session_without_blocking_other_chats(agent, tmp_path):
    cls = store_type(agent)

    async def exercise():
        store = cls(tmp_path / 'state.sqlite')
        await store.start()
        try:
            for session in ('one', 'two'):
                await store.create(user_id='owner', session_id=session, state={})
            async with store.acquire(user_id='owner', session_id='one'):
                waiting = asyncio.create_task(store.update(user_id='owner', session_id='one', state_delta={'late': 1}))
                await asyncio.sleep(0)
                assert not waiting.done()
                await asyncio.wait_for(store.update(user_id='owner', session_id='two', state_delta={'ready': 1}), 1)
            assert (await waiting).state == {'late': 1}
        finally:
            await store.close()
    asyncio.run(exercise())


def test_checkpoints_enforce_scope_revisions_and_run_exclusivity(agent, tmp_path):
    cls = store_type(agent)

    async def exercise():
        store = cls(tmp_path / 'state.sqlite')
        await store.start()
        try:
            args = dict(application_id='app', user_id='owner', session_id='one', framework='adk')
            run = await store.begin_run(**args, run_id='run')
            assert await store.begin_run(**args, run_id='run') == run
            with pytest.raises(CheckpointConflictError):
                await store.begin_run(**args, run_id='another')
            foreign = RunScope('app', 'other', 'one', 'run')
            assert await store.get_run(scope=foreign) is None
            with pytest.raises(KeyError):
                await store.put(checkpoint(run), scope=foreign, expected_revision=None)
            first = await store.put(checkpoint(run), scope=run.scope, expected_revision=None)
            with pytest.raises(sqlite3.ProgrammingError):
                await store.put(replace(first, payload=object()), scope=run.scope, expected_revision=first.revision)
            assert await store.get_checkpoint(scope=run.scope) == first
            with pytest.raises(CheckpointConflictError):
                await store.put(checkpoint(run), scope=run.scope, expected_revision=None)
            second = await store.put(checkpoint(run, 'two'), scope=run.scope, expected_revision=None)
            assert second.revision > first.revision
            assert await store.get_checkpoint(scope=run.scope) == second
            assert [c.checkpoint_id async for c in store.list_checkpoints(scope=run.scope, before='two')] == ['one']
            writes = [CheckpointWrite('task', 'result', 'bytes', b'\x00\xff')]
            await store.put_writes(scope=run.scope, checkpoint_id='two', writes=writes + writes)
            await store.put_writes(scope=run.scope, checkpoint_id='two', writes=writes)
            assert await store.get_writes(scope=run.scope, checkpoint_id='two') == tuple(writes)
            assert await store.get_writes_batch(scope=run.scope, checkpoint_ids=['one', 'two']) == {'one': (), 'two': tuple(writes)}
            assert await store.get_checkpoint(scope=foreign) is None
            assert await store.get_writes(scope=foreign, checkpoint_id='two') == ()
            await store.transition(scope=run.scope, expected_status='running', status='waiting', pending_action=PendingAction('client_tool', 'tool', 'browser'))
            with pytest.raises(CheckpointConflictError):
                await store.transition(scope=run.scope, expected_status='running', status='completed')
            await store.transition(scope=run.scope, expected_status='waiting', status='running')
            await store.transition(scope=run.scope, expected_status='running', status='completed')
            with pytest.raises(CheckpointConflictError):
                await store.put(replace(first, payload=b'changed'), scope=run.scope, expected_revision=first.revision)
        finally:
            await store.close()
        reopened = cls(tmp_path / 'state.sqlite')
        await reopened.start()
        try:
            assert (await reopened.get_run(scope=run.scope)).status == 'completed'
            assert (await reopened.get_checkpoint(scope=run.scope)).payload == b'{"history":[]}'
            assert await reopened.get_writes(scope=run.scope, checkpoint_id='two') == tuple(writes)
            await reopened.begin_run(**args, run_id='next')
            await reopened.delete_run(scope=foreign)
            assert await reopened.get_run(scope=run.scope) is not None
            await reopened.delete_run(scope=run.scope)
            assert await reopened.get_checkpoint(scope=run.scope) is None
        finally:
            await reopened.close()
    asyncio.run(exercise())


def test_unknown_schema_is_rejected_without_replacing_existing_data(agent, tmp_path):
    cls = store_type(agent)
    path = tmp_path / 'future.sqlite'
    with sqlite3.connect(path) as db:
        db.execute('PRAGMA user_version=99')
        db.execute('CREATE TABLE preserved (value TEXT)')
        db.execute("INSERT INTO preserved VALUES ('keep')")

    async def exercise():
        store = cls(path)
        with pytest.raises(RuntimeError, match='Unsupported'):
            await store.start()
        await store.close()
    asyncio.run(exercise())
    with sqlite3.connect(path) as db:
        assert db.execute('PRAGMA user_version').fetchone()[0] == 99
        assert db.execute('SELECT value FROM preserved').fetchone()[0] == 'keep'


def test_process_exit_preserves_commits_and_retires_unfinished_runs(agent, tmp_path):
    cls = store_type(agent)
    module = sys.modules[cls.__module__]
    path = tmp_path / 'state.sqlite'
    script = '''
import asyncio, importlib.util, os, sys
spec = importlib.util.spec_from_file_location("sqlite_test", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
async def run():
    store = module.SQLiteStore(sys.argv[2])
    await store.start()
    await store.create(user_id="owner", session_id="one", state={"committed": True})
    await store.begin_run(application_id="app", user_id="owner", session_id="one", run_id="crashed", framework="adk")
    os._exit(0)
asyncio.run(run())
'''
    subprocess.run([sys.executable, '-c', script, module.__file__, str(path)], check=True, timeout=30)

    async def exercise():
        store = cls(path)
        await store.start()
        try:
            assert (await store.get(user_id='owner', session_id='one')).state == {'committed': True}
            scope = RunScope('app', 'owner', 'one', 'crashed')
            assert (await store.get_run(scope=scope)).status == 'failed'
            await store.begin_run(application_id='app', user_id='owner', session_id='one', run_id='next', framework='adk')
            second = cls(path)
            with pytest.raises(RuntimeError, match='already in use'):
                await second.start()
            await second.close()
        finally:
            await store.close()
    asyncio.run(exercise())
