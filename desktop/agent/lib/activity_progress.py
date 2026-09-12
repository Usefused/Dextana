"""A run may keep working; only a lack of execution progress expires it."""
import asyncio


IDLE_SECONDS = 15 * 60
WAIT_SECONDS = 24 * 60 * 60


def execution_progress(event):
    kind = event.get('type')
    if kind in ('response.text.delta', 'response.thinking.delta'):
        return bool(event.get('delta'))
    return kind in ('response.created', 'response.tool_call', 'client_tool.requested',
                    'client_tool.completed', 'approval.resolved', 'response.completed')


def refresh_deadline(deadline, event, seconds=IDLE_SECONDS):
    # Do not count socket pings, usage metadata or UI polling as progress, or
    # resume a deadline deliberately paused while waiting for the owner/workers.
    if execution_progress(event) and deadline.when() is not None and not deadline.expired():
        deadline.reschedule(asyncio.get_running_loop().time() + seconds)
