import asyncio
import pytest


def test_progressing_runs_outlive_the_idle_window(agent):
    from harnest.lib.activity_progress import refresh_deadline
    async def run():
        async with asyncio.timeout(.08) as deadline:
            for kind in ['response.text.delta', 'response.thinking.delta', 'response.tool_call', 'client_tool.completed'] * 3:
                await asyncio.sleep(.02)
                refresh_deadline(deadline, dict(type=kind, delta='new output'), seconds=.08)
        assert not deadline.expired()
    asyncio.run(run())


def test_empty_updates_and_transport_activity_do_not_keep_stalled_runs_alive(agent):
    from harnest.lib.activity_progress import refresh_deadline
    async def run():
        with pytest.raises(TimeoutError):
            async with asyncio.timeout(.05) as deadline:
                while True:
                    for event in [dict(type='response.text.delta', delta=''), dict(type='response.agent_metadata'), dict(type='ping')]:
                        refresh_deadline(deadline, event, seconds=.1)
                    await asyncio.sleep(.01)
    asyncio.run(run())


def test_owner_waits_pause_expiry_and_cancellation_still_interrupts(agent):
    from harnest.lib.activity_progress import refresh_deadline
    from harnest.lib.questions import without_run_deadline
    async def run():
        async with asyncio.timeout(.05) as deadline:
            async def waiting():
                refresh_deadline(deadline, dict(type='client_tool.completed'), seconds=.01)
                assert deadline.when() is None
                await asyncio.sleep(.08)
            await without_run_deadline(deadline, waiting())
            refresh_deadline(deadline, dict(type='approval.resolved'), seconds=.05)
            assert not deadline.expired()
        async def cancellable():
            async with asyncio.timeout(900):
                await asyncio.sleep(900)
        task = asyncio.create_task(cancellable())
        await asyncio.sleep(0)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    asyncio.run(run())
