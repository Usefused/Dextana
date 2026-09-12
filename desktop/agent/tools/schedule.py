from typing import Literal
from harnest.agent import client_tool


@client_tool
def schedule(action: Literal['create', 'list', 'remove'], name: str = '', prompt: str = '',
             kind: Literal['reminder', 'task'] = 'reminder', delay_seconds: int = 0,
             run_at: str = '', expression: str = '', timezone: str = '', schedule_id: str = '') -> dict:
    """Persist a reminder or future work in Harnest and the desktop Scheduled jobs view.

    create: supply a short name and self-contained prompt. For kind reminder, prompt is
      the exact message delivered to this chat without calling a model. For kind task,
      prompt is work executed in a new activity with normal action approvals.
    Timing: supply exactly ONE of delay_seconds (relative to now), run_at (future ISO
      8601 timestamp with an explicit UTC offset), or expression (five-field cron).
      timezone is an IANA zone such as Europe/London; empty uses the owner's local zone.
      Ask the owner when if no time is given; never invent a reminder time.
    list: return saved jobs with stable references such as "Schedule 1".
    remove: pass the exact returned reference as schedule_id. Do not guess a reference
      from a name or list position. Only remove schedules the owner asked to cancel.

    A plan or a text reply does NOT schedule anything. Call this after plan approval
    or a direct request in Work mode. Only confirm success after status=scheduled;
    state its returned date, time and time zone, and that it appears in Scheduled jobs.
    Describe reminders by name and time in replies. References are for tool calls;
    do not append reminder IDs, references, or raw result records to confirmations.
    One-time reminders that become overdue are delivered when Dextana next runs
    or the computer wakes. Missed recurring reminder periods are combined into
    one overdue reminder before resuming. Missed scheduled task runs are skipped.
    """
    ...
