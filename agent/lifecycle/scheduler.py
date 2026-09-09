"""Authenticated schedule controls; Harnest owns the worker and cron loop."""
import os
from secrets import compare_digest
from fastapi import APIRouter, HTTPException, Request, Depends
from harnest import lifecycle
from harnest.lib.scheduler import scheduler
from harnest.models.schedule import ScheduleInput


@lifecycle.resource
async def schedule_registry():
    backend = scheduler()
    await backend.initialize()
    yield backend


@lifecycle.http_routes
def schedule_routes(agent):
    def owner(request: Request):
        token = os.environ.get('DEXTANA_RUNTIME_TOKEN', '')
        if not token or not compare_digest(request.headers.get('authorization', ''), 'Bearer ' + token):
            raise HTTPException(401, 'Desktop authentication required')

    router = APIRouter(prefix='/dextana/jobs', dependencies=[Depends(owner)])

    @router.get('')
    async def list_jobs():
        return await scheduler().list()

    @router.post('')
    async def create_job(data: ScheduleInput):
        try:
            return await scheduler().save(data.model_dump())
        except (ValueError, KeyError) as error:
            raise HTTPException(400, str(error)) from None

    @router.put('/{job_id}')
    async def update_job(job_id: str, data: ScheduleInput):
        try:
            return await scheduler().save(data.model_dump(), job_id)
        except (ValueError, KeyError) as error:
            raise HTTPException(400, str(error)) from None

    @router.delete('/{job_id}')
    async def delete_job(job_id: str):
        await scheduler().remove(job_id)

    @router.post('/{job_id}/run')
    async def run_job(job_id: str):
        try:
            await scheduler().run_now(job_id)
        except ValueError as error:
            raise HTTPException(400, str(error)) from None

    return router
