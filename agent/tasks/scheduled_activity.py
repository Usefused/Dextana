"""Native Harnest task delivering a scheduled desktop activity once."""
from harnest import context
from harnest.task import task
from harnest.lib.scheduler import scheduler


@task(queue='desktop-schedules', max_retries=0)
async def scheduled_activity(job_id: str, generation: str, manual: bool = False,
                             occurrence: str = '', due_at: float = 0.0):
    """Keep local actions behind the ordinary activity approval boundary."""
    if not manual:
        occurrence = context.current().invocation_id
        due_at = float(occurrence.rsplit(':', 1)[1])
    return await scheduler().execute(job_id, generation, occurrence, due_at, manual)
