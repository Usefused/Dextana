# Scheduled jobs

Use the dropdown beside the Workspace + to switch to Cron jobs. Create a job with instructions, a model, a five-field cron expression and an IANA time zone. Daily, weekday and hourly presets are available. Jobs can be edited, paused, resumed, run immediately or deleted; recent runs link to their activities. Deleting a job preserves its activities.

The Harnest backend owns schedule validation, time-zone evaluation, the timer, and durable job/run records in `schedules.sqlite` under `DEXTANA_SCHEDULER_DIRECTORY`. Its authenticated `/dextana/jobs` routes provide CRUD, manual enqueue, atomic claim and outcome reporting. No renderer or Electron timer decides when jobs are due. The Electron adapter only polls for dispatches and reports activity outcomes.

The current local backend starts and stops with Dextana. An isolated backend can keep scheduling without the desktop UI. Execution currently uses the desktop activity worker for browser, file, and approval capabilities; the claim/report boundary allows a future server worker without moving schedule ownership. An absent worker leaves one queued run per job, preventing a backlog of duplicate runs. This change does not provision an always-on service or remote deployment.

Schedules missed while the server is stopped or asleep are skipped. Restart marks uncertain in-flight runs interrupted, without automatic replay. Claims commit before execution; an ambiguous claim or dispatch must be reviewed rather than retried. Each job keeps 20 recent records. A job with an active/queued run skips its next occurrence. Runs use normal activity approval rules, with no automatic permission grants.

Backend tests cover time zones, concurrent claims, persistence, overlap prevention and restart behavior. Electron tests exercise management, manual execution through Harnest, persistence across restart, and automatic due-time dispatch.
