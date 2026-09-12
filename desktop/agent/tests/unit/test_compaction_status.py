import asyncio
import copy
from types import SimpleNamespace

import pytest


@pytest.mark.parametrize('outcome', ['complete', 'error', 'cancel'])
def test_compaction_status_stays_set_until_worker_exits(agent, monkeypatch, outcome):
    from harnest.lib import ollama, activities

    async def run():
        activity = dict(runtimeSessionId='session-1', events=[])
        snapshots = []
        backend = SimpleNamespace(state=dict(activities=[activity]),
            commit=lambda: snapshots.append(copy.deepcopy(activity)))
        monkeypatch.setattr(activities, 'service', lambda: backend)
        monkeypatch.setattr(ollama, 'context', SimpleNamespace(
            current=lambda: SimpleNamespace(session_id='session-1'),
            session=SimpleNamespace(namespace=lambda name: object())))
        started, finish = asyncio.Event(), asyncio.Event()

        async def compact(request, store, report, **budget):
            report('Compacting older context with the selected model…')
            started.set()
            await finish.wait()
            if outcome == 'error':
                raise RuntimeError('Model unavailable')
            return request

        monkeypatch.setattr(ollama, 'compact_context', compact)
        task = asyncio.create_task(ollama.DesktopModelRouting().prepare_context(
            dict(messages=[dict(role='assistant', content='x' * 200_000)])))
        await started.wait()
        assert activity['compacting'] is True
        assert snapshots[-1]['compacting'] is True
        if outcome == 'cancel':
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        else:
            finish.set()
            if outcome == 'error':
                with pytest.raises(RuntimeError):
                    await task
            else:
                await task
        assert 'compacting' not in activity
        assert 'compacting' not in snapshots[-1]

    asyncio.run(run())
