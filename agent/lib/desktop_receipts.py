"""Explicit desktop result contracts; storage records never become model text."""
from harnest.lib.tool_references import fields, desktop_kind


def alarm(value, refs):
    return dict(id=refs.public('Alarm', value['id']), **fields(value,
        'kind', 'title', 'message', 'state', 'createdAt', 'dueAt', 'remainingMs',
        'firedAt', 'overdue', 'notificationError', 'availability'))


def watch(value, refs):
    return dict(id=refs.public('Watch', value['id']), **fields(value,
        'name', 'folder', 'prompt', 'extensions', 'enabled', 'pending', 'status', 'lastRunAt', 'error'))


def rename(value, refs):
    return dict(id=refs.public('Rename', value['id']),
                entries=[fields(entry, 'from', 'to', 'moved') for entry in value['entries']],
                **fields(value, 'createdAt', 'status', 'direction', 'error'))


def processing(value, refs):
    return dict(id=refs.public('Processing', value['id']), **fields(value,
        'kind', 'paths', 'outputPath', 'modelPath', 'status', 'createdAt', 'finishedAt',
        'error', 'cancellationRequested'))


def desktop_result(operation, value, refs):
    if isinstance(value, dict) and 'error' in value and 'id' not in value:
        return fields(value, 'error')
    if operation == 'alarms.list':
        return dict(alarms=[alarm(item, refs) for item in value['alarms']],
                    **fields(value, 'availability'))
    kind = desktop_kind(operation)
    if kind == 'Alarm':
        return alarm(value, refs)
    if operation in ('workflow.watch_remove', 'workflow.watch_run'):
        key = 'removed' if operation.endswith('remove') else 'queued'
        return {key: refs.public('Watch', value[key]), **fields(value, 'pausedOnBattery')}
    project = {'Watch': watch, 'Rename': rename, 'Processing': processing}.get(kind)
    if operation in ('processing.capabilities', 'device.status'):
        return fields(value, 'processors', 'onBattery', 'pauseOnBattery', 'limitations')
    if project:
        return [project(item, refs) for item in value] if isinstance(value, list) else project(value, refs)
    if operation == 'file.open':
        return dict(status=value['status'], fileId=refs.public('File', value['fileId']))
    if operation == 'workflow.setup_open':
        return dict(results=[fields(item, 'target', 'path', 'url', 'opened', 'error') for item in value['results']])
    if operation == 'workflow.handoff':
        return fields(value, 'opened', 'application')
    if operation == 'workflow.notify':
        return fields(value, 'notificationRequested', 'status', 'path')
    if operation == 'device.power_policy':
        return fields(value, 'pauseOnBattery', 'onBattery')
    if operation == 'computer.status':
        result = fields(value, 'enabled')
        if value.get('selection'):
            selected = value['selection']
            result['selection'] = dict(id=refs.public('Window', selected['id']),
                state=selected['state'], window=fields(selected['window'], 'application', 'title'))
        return result
    if operation == 'computer.observe':
        return dict(selectionId=refs.public('Window', value['selectionId']),
                    snapshotId=refs.public('Observation', value['snapshotId']),
                    **fields(value, 'elements', 'returned_element_count', 'image'))
    if operation == 'computer.act':
        return fields(value, 'success', 'status', 'message', 'instruction')
    if operation == 'computer.stop':
        return fields(value, 'state')
    # A new desktop operation must add a reviewed result contract here. Do not
    # leak an unknown payload, or imply a completed side effect can be retried.
    return {'message': 'This action returned an unsupported result format. Inspect Desktop to verify its outcome before trying again.'}
