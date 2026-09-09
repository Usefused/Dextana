import json
import pytest


@pytest.fixture
def boundary(agent):
    from harnest.lib.tool_receipts import ToolReceipts
    return ToolReceipts({})


def desktop(boundary, operation, result, ticket='private-ticket'):
    prepared = dict(ticket=ticket, requiresApproval=False, arguments={})
    assert boundary.result('desktop_bridge', dict(phase='prepare', operation=operation), prepared) is prepared
    return boundary.result('desktop_bridge', dict(phase='execute', ticket=ticket), result)


def test_desktop_records_exclude_bookkeeping_and_rename_fingerprints(boundary):
    private = dict(id='storage-id', activityId='private-chat', sourceActivityId='private-chat',
                   requestId='private-request', occurrence=3, alertedOccurrence=3,
                   seen={'file': 'private-fingerprint'}, futureMetadata={'private': 'future'})
    alarm = desktop(boundary, 'timer.start', dict(private, kind='timer', title='Tea', state='running', dueAt='later'))
    assert alarm == dict(id='Alarm 1', kind='timer', title='Tea', state='running', dueAt='later')
    watch = desktop(boundary, 'workflow.watch_save', dict(private, name='Invoices', folder='/invoices', status='watching'))
    assert watch == dict(id='Watch 1', name='Invoices', folder='/invoices', status='watching')
    rename = desktop(boundary, 'workflow.rename_list', [dict(private, status='applied', entries=[
        dict(from_='unused', **{'from': '/old', 'to': '/new', 'identity': 'private-file-identity', 'moved': True})])])
    assert rename == [dict(id='Rename 1', status='applied', entries=[{'from': '/old', 'to': '/new', 'moved': True}])]
    processing = desktop(boundary, 'processing.list', [dict(private, kind='ocr', status='completed', outputPath='/result.txt')])
    assert processing == [dict(id='Processing 1', kind='ocr', status='completed', outputPath='/result.txt')]
    notified = desktop(boundary, 'workflow.notify', dict(private, status='submitted', notificationRequested=True))
    assert notified == dict(status='submitted', notificationRequested=True)
    for kind, operation in [('Alarm', 'timer.pause'), ('Watch', 'workflow.watch_remove'),
                            ('Rename', 'workflow.rename_undo'), ('Processing', 'processing.cancel')]:
        args = boundary.arguments('desktop_bridge', dict(phase='prepare', operation=operation,
                                   arguments_json=json.dumps({'id': f'{kind} 1'})))
        assert json.loads(args['arguments_json']) == {'id': 'storage-id'}


def test_computer_selection_excludes_native_process_ids_but_observations_still_route(boundary):
    status = desktop(boundary, 'computer.status', dict(enabled=True, selection=dict(id='private-selection',
        activityId='private-chat', state='ready', window=dict(id='process:window', pid=42, windowId=123,
        application='Editor', title='Invoice'))))
    assert status == dict(enabled=True, selection=dict(id='Window 1', state='ready',
                                                     window=dict(application='Editor', title='Invoice')))
    observed = desktop(boundary, 'computer.observe', dict(selectionId='private-selection', snapshotId='private-snapshot',
        snapshot_id='private-snapshot', pid=42, futureMetadata=True,
        elements=[dict(element_index=3, label='Business ID 123')], returned_element_count=1,
        image={'type': 'image', 'data': 'bytes'}))
    assert set(observed) == {'selectionId', 'snapshotId', 'elements', 'returned_element_count', 'image'}
    args = boundary.arguments('desktop_bridge', dict(phase='prepare', operation='computer.act',
        arguments_json=json.dumps(dict(selectionId=observed['selectionId'], snapshotId=observed['snapshotId'],
                                       elementIndex=3, text='Business ID 123'))))
    assert json.loads(args['arguments_json']) == dict(selectionId='private-selection', snapshotId='private-snapshot',
                                                     elementIndex=3, text='Business ID 123')


def test_refs_survive_reload_and_deleted_resources_never_rebind(agent):
    from harnest.lib.tool_receipts import ToolReceipts
    state = {}
    first = ToolReceipts(state)
    result = first.result('browser', {}, {'tabs': [dict(tab_id='private-tab', title='Page', url='https://example.com')]})
    assert result['tabs'][0]['tab_id'] == 'Tab 1'
    restored = ToolReceipts(json.loads(json.dumps(state)))
    assert restored.arguments('browser', dict(action='close_tab', tab_id='Tab 1'))['tab_id'] == 'private-tab'
    assert restored.result('browser', {}, dict(tab_id='second-tab')) == dict(tab_id='Tab 2')
    assert ToolReceipts({}).arguments('browser', dict(tab_id='Tab 1'))['tab_id'] == 'Tab 1'


def test_service_business_ids_and_schemas_are_untouched(boundary):
    customer = dict(id='c0e89bca-d4ee-4cd5-b224-4e5e5080beb4', activityId='business-id', filename='data.csv')
    schema = {'name': 'get_customer', 'inputSchema': {'properties': {'id': {'enum': [customer['id']]}}}}
    listed = boundary.result('mcp_bridge', dict(phase='list'), dict(connections=[
        dict(id='private-connection', name='CRM', tools=[schema], revision='private-revision')]))
    assert listed == dict(connections=[dict(id='Connection 1', name='CRM', tools=[schema])])
    args = boundary.arguments('mcp_bridge', dict(phase='prepare', server_id='Connection 1', arguments_json=json.dumps(customer)))
    assert args['server_id'] == 'private-connection' and json.loads(args['arguments_json']) == customer
    assert boundary.result('mcp_bridge', dict(phase='execute'), customer) is customer
    assert boundary.result('fused', dict(action='execute'), customer) is customer
    assert boundary.result('files', {}, dict(content=customer)) == dict(content=customer)
    assert boundary.result('browser', {}, dict(tab_id='tab', attributes=customer)) == dict(tab_id='Tab 1', attributes=customer)


def test_context_and_plans_keep_useful_locations_and_action_handles(boundary):
    context = boundary.context([
        dict(id='private-file', kind='file', name='Invoice', location='/invoice.pdf', status='read'),
        dict(id='private-context', kind='desktop', name='Tea', location='desktop:private-alarm',
             desktop=dict(work='time', resourceId='private-alarm', operation='timer', state='running'))])
    assert context == [dict(id='File 1', kind='file', name='Invoice', location='/invoice.pdf', status='read'),
                       dict(kind='desktop', name='Tea', desktop=dict(work='time', operation='timer', state='running'))]
    args = boundary.arguments('desktop_bridge', dict(phase='prepare', operation='file.open', arguments_json='{"fileId":"File 1"}'))
    assert json.loads(args['arguments_json']) == dict(fileId='private-file')
    original = dict(id='private-plan', messageId='private-message', title='Read invoice', steps=['Read it'],
        scope=dict(files=[dict(action='read', path='/invoice.pdf', parentIdentity='private-inode')],
                   mcpTools=[dict(serverId='private-server', serverName='CRM', toolName='get', revision='private-revision', fingerprint='private-hash')],
                   fusedIntegrations=[dict(id='private-fused', name='Fused', revision='private-revision')]))
    plan = boundary.plan(original)
    assert 'private-' not in json.dumps(plan)
    restored = boundary.arguments('propose_plan', dict(mcp_tools=[dict(server_id='Connection 1', tool_name='get')], fused_integrations=['Integration 1']))
    assert restored['mcp_tools'][0]['server_id'] == 'private-server'
    assert restored['fused_integrations'] == ['private-fused']
    assert original['id'] == 'private-plan'
    assert boundary.result('propose_plan', {}, dict(planId='private-plan', status='proposed')) == dict(status='proposed')
    assert boundary.result('delegate', {}, dict(workers=[dict(id='private-worker', model='test', status='completed', result='Done')])) == dict(workers=[dict(worker=1, model='test', status='completed', result='Done')])


def test_unknown_desktop_contract_cannot_leak_or_encourage_repeating_side_effects(boundary):
    result = desktop(boundary, 'future.operation', dict(id='private-id', secret='private-value'))
    assert 'private' not in json.dumps(result)
    assert 'verify its outcome before trying again' in result['message']
