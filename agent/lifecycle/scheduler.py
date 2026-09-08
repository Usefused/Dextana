import asyncio
import logging
import os
from contextlib import suppress
from secrets import compare_digest
from fastapi import APIRouter, HTTPException, Request, Depends
from harnest.lifecycle import lifecycle
from harnest.lib.scheduler import Scheduler
from harnest.models.schedule import ScheduleInput, RunReport


@lifecycle.resource
async def scheduler_worker():
    if not os.environ.get('DEXTANA_SCHEDULER_DIRECTORY'):
        yield None
        return
    scheduler = Scheduler()
    scheduler.initialize()

    async def loop():
        while True:
            await asyncio.sleep(5)
            try:
                await asyncio.to_thread(scheduler.tick)
            except Exception:
                logging.getLogger(__name__).exception('Scheduler tick failed')

    worker = asyncio.create_task(loop())
    try:
        yield scheduler
    finally:
        worker.cancel()
        with suppress(asyncio.CancelledError):
            await worker


@lifecycle.http_routes
def schedule_routes(agent):
    # Custom CRUD routes enforce the same private desktop bearer boundary even
    # when they do not invoke the agent (and hence do not call authenticate).
    def owner(request: Request):
        token = os.environ.get('DEXTANA_RUNTIME_TOKEN', '')
        if not token or not compare_digest(request.headers.get('authorization', ''), 'Bearer ' + token):
            raise HTTPException(401, 'Desktop authentication required')

    router = APIRouter(prefix='/dextana/jobs', dependencies=[Depends(owner)])

    @router.get('')
    def list_jobs():
        return Scheduler().list()

    @router.post('')
    def create_job(data: ScheduleInput):
        try:
            return Scheduler().save(data.model_dump())
        except (ValueError, KeyError) as error:
            raise HTTPException(400, str(error)) from None

    @router.put('/{job_id}')
    def update_job(job_id: str, data: ScheduleInput):
        try:
            return Scheduler().save(data.model_dump(), job_id)
        except (ValueError, KeyError) as error:
            raise HTTPException(400, str(error)) from None

    @router.delete('/{job_id}')
    def delete_job(job_id: str):
        Scheduler().remove(job_id)

    @router.post('/claim')
    def claim():
        return Scheduler().claim()

    @router.post('/{job_id}/run')
    def run_job(job_id: str):
        try:
            Scheduler().run_now(job_id)
        except ValueError as error:
            raise HTTPException(400, str(error)) from None

    @router.put('/{job_id}/runs/{run_id}')
    def report(job_id: str, run_id: str, data: RunReport):
        Scheduler().report(job_id, run_id, data.model_dump(exclude_none=True))

    return router
