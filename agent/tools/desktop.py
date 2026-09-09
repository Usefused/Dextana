from typing import Literal
from harnest.agent import tool
from harnest.models.desktop_result import DesktopResult
from harnest.approval import request_human_approval
from harnest.lib.desktop_bridge import desktop_bridge as _desktop_bridge


@tool
async def desktop(action: Literal['discover', 'call'],
            work: Literal['', 'time', 'files', 'workflows', 'processing', 'device', 'computer'] = '',
            operation: str = '', arguments_json: str = '{}') -> DesktopResult:
    """Use the device through a small catalog selected for the work at hand.

    Discover first with work=time (timers and reminders), files (open documents),
    workflows (folder watches, work setup, rename preview/undo, handoff, completion
    alerts), processing (installed local OCR, transcription, conversion, indexing),
    device (power state and background-work policy), or computer (owner-selected
    native window observation and input). Empty work lists categories.
    Only the selected category's supported operation schemas are returned. Discover
    again when the work changes; never invent operations, IDs, paths or parameters.
    Operation names are NOT tool names. Always invoke this desktop tool with
    action='call', operation='<returned name>', and arguments_json containing a
    JSON object matching inputSchema (use '{}' for no arguments). For example,
    after desktop(action='discover', work='computer'), read status with
    desktop(action='call', work='computer', operation='computer.status', arguments_json='{}').
    Never invoke computer.status or another catalog operation as a standalone tool. The
    desktop supplies chat ownership and obtains permission before side effects or
    reading local contents. Discovery does not grant permission. No shell commands.
    Rename requires preview followed by applying its returned reference. Retain it for undo.
    Use returned references only in tool calls; describe outcomes by name, action and state.
    Timers and reminders persist, but a powered-off device cannot sound an alert.
    Report actual delivery guarantees, unavailable processors, and uncertain results.
    Use schedule for recurring reminders and future agent work.
    """
    if action == 'discover':
        return DesktopResult.model_validate(await _desktop_bridge(phase='discover', work=work))
    prepared = await _desktop_bridge(phase='prepare', operation=operation, arguments_json=arguments_json)
    if 'error' in prepared:
        return DesktopResult.model_validate(prepared)
    if prepared['requiresApproval']:
        async with request_human_approval(action='desktop.execute', message=prepared['message'], arguments=prepared['arguments']):
            return DesktopResult.model_validate(await _desktop_bridge(phase='execute', ticket=prepared['ticket']))
    return DesktopResult.model_validate(await _desktop_bridge(phase='execute', ticket=prepared['ticket']))
