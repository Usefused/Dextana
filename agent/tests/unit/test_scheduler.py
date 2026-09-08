from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
import pytest


def scheduler_module(agent):
    from harnest.lib import scheduler
    return scheduler


def test_schedules_are_server_owned_and_claimed_once(agent, tmp_path):
    module = scheduler_module(agent)
    now = [datetime.fromisoformat('2026-09-08T08:00:00+00:00').timestamp()]
    service = module.Scheduler(str(tmp_path / 'jobs.sqlite'), lambda: now[0])
    job_id = service.save(dict(name='Notes', prompt='Summarize', model='test', expression='* * * * *', timezone='UTC', enabled=True))
    now[0] += 61
    service.tick()
    # A new instance sees the server's committed run without a desktop client.
    assert module.Scheduler(service.path).list()[0]['runs'][0]['status'] == 'queued'
    with ThreadPoolExecutor(2) as pool:
        claims = list(pool.map(lambda _: service.claim(), range(2)))
    assert sum(len(items) for items in claims) == 1
    run = next(items[0] for items in claims if items)
    now[0] += 60
    service.tick()
    assert 'previous run' in service.list()[0]['error']
    service.report(job_id, run['runId'], dict(status='completed', activityId='activity'))
    now[0] += 60
    service.tick()
    assert len(service.claim()) == 1


def test_restart_missed_times_pause_and_validation(agent, tmp_path):
    module = scheduler_module(agent)
    now = [datetime.fromisoformat('2026-09-08T08:00:00+00:00').timestamp()]
    service = module.Scheduler(str(tmp_path / 'jobs.sqlite'), lambda: now[0])
    data = dict(name='Notes', prompt='Summarize', model='test', expression='* * * * *', timezone='UTC', enabled=True)
    job_id = service.save(data)
    now[0] += 3600
    service.tick()
    assert not service.claim()
    service.run_now(job_id)
    service.claim()
    service.initialize()
    assert service.list()[0]['runs'][0]['status'] == 'interrupted'
    assert not service.claim()
    service.save({**data, 'enabled': False}, job_id)
    now[0] += 60
    service.tick()
    assert not service.claim()
    service.run_now(job_id)
    assert len(service.claim()) == 1
    with pytest.raises((ValueError, KeyError)):
        service.save({**data, 'timezone': 'Invalid'})
    with pytest.raises(ValueError):
        service.save({**data, 'expression': '0 0 31 2 *'})
    service.remove(job_id)
    assert service.list() == []


def test_dst_and_weekdays(agent):
    module = scheduler_module(agent)
    now = datetime.fromisoformat('2026-09-08T07:00:00+00:00').timestamp()
    assert module.iso(module.next_run('0 9 * * 1-5', 'Europe/London', now)) == '2026-09-08T08:00:00+00:00'
    now = datetime.fromisoformat('2026-10-24T09:00:00+00:00').timestamp()
    assert module.iso(module.next_run('0 9 * * *', 'Europe/London', now)) == '2026-10-25T09:00:00+00:00'


def test_job_routes_require_authentication_and_validate_input(agent, tmp_path, monkeypatch):
    import importlib.util
    from pathlib import Path
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    spec = importlib.util.spec_from_file_location('test_schedule_routes', Path(__file__).parents[2] / 'lifecycle' / 'scheduler.py')
    routes = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(routes)
    monkeypatch.setenv('DEXTANA_RUNTIME_TOKEN', 'synthetic-test-token')
    monkeypatch.setenv('DEXTANA_SCHEDULER_DIRECTORY', str(tmp_path))
    app = FastAPI()
    app.include_router(routes.schedule_routes(None))
    with TestClient(app) as client:
        assert client.get('/dextana/jobs').status_code == 401
        headers = {'Authorization': 'Bearer synthetic-test-token'}
        assert client.post('/dextana/jobs', headers=headers, json={}).status_code == 422
        data = dict(name='Test', prompt='Notes', model='test', expression='invalid', timezone='UTC', enabled=True)
        assert client.post('/dextana/jobs', headers=headers, json=data).status_code == 400
        data['expression'] = '* * * * *'
        assert client.post('/dextana/jobs', headers=headers, json=data).status_code == 200
        assert len(client.get('/dextana/jobs', headers=headers).json()) == 1
