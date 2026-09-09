"""Select a shared local provider for Harnest's task and cron authorities."""
from harnest import lifecycle
from harnest.lib.task_store import store


@lifecycle.storage.tasks
@lifecycle.storage.cron
def scheduled_work_store():
    return store()
