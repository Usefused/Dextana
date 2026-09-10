"""Model boundary for Dextana data, with exact routing slots and no UUID heuristics.

MCP payloads, document contents and web page data are business data, not records
owned by Dextana. Never recursively redact or rename their fields.
"""
import base64
import hashlib
import copy
import json
from harnest.lib.tool_references import ToolReferences, fields, desktop_kind
from harnest.lib.desktop_receipts import desktop_result


class ToolReceipts:
    def __init__(self, activity):
        self.refs = ToolReferences(activity)
        self.desktop_tickets = {}

    def arguments(self, name, args):
        args = copy.deepcopy(args)
        slots = {'browser': ('tab_id', 'Tab'), 'fused': ('integration_id', 'Integration'),
                 'mcp_bridge': ('server_id', 'Connection')}
        if name in slots:
            field, kind = slots[name]
            if field in args:
                args[field] = self.refs.internal(kind, args[field])
        if name == 'propose_plan':
            for item in args.get('mcp_tools', []):
                item['server_id'] = self.refs.internal('Connection', item['server_id'])
            args['fused_integrations'] = [self.refs.internal('Integration', item) for item in args.get('fused_integrations', [])]
        if name == 'desktop_bridge' and args.get('phase') == 'prepare':
            data = json.loads(args.get('arguments_json') or '{}')
            if isinstance(data, dict):
                kind = desktop_kind(args.get('operation', ''))
                for field, domain in [('id', kind), ('fileId', 'File'),
                                      ('selectionId', 'Window'), ('snapshotId', 'Observation')]:
                    if domain and field in data:
                        data[field] = self.refs.internal(domain, data[field])
                args['arguments_json'] = json.dumps(data)
        return args

    def result(self, name, args, value):
        if name == 'desktop_bridge':
            phase = args.get('phase')
            if phase == 'prepare' and value.get('ticket'):
                self.desktop_tickets[value['ticket']] = args['operation']
            if phase == 'execute':
                return desktop_result(self.desktop_tickets.pop(args.get('ticket'), ''), value, self.refs)
            # Prepare/discovery are consumed by authored tool code. Single-use
            # approval tickets never appear in its model-facing final return.
            return value
        if name == 'propose_plan':
            return fields(value, 'status', 'message', 'error')
        if name == 'ask_questions':
            return fields(value, 'answer', 'source', 'error')
        if name == 'delegate':
            if 'workers' not in value:
                return value
            return dict(workers=[dict(worker=index + 1, **fields(worker, 'model', 'status', 'result', 'clarifications', 'error'))
                                 for index, worker in enumerate(value['workers'])])
        if name == 'mcp_bridge' and args.get('phase') == 'list' and 'connections' in value:
            return dict(connections=[dict(id=self.refs.public('Connection', item['id']),
                        **fields(item, 'name', 'tools')) for item in value['connections']])
        if name == 'fused' and args.get('action') == 'connections' and 'integrations' in value:
            return dict(integrations=[dict(id=self.refs.public('Integration', item['id']),
                        **fields(item, 'name', 'url')) for item in value['integrations']])
        if name == 'browser':
            value = copy.deepcopy(value)
            image = value.get('image')
            if value.get('screenshot_id') and isinstance(image, dict) and image.get('data'):
                value['screenshot_image_sha256'] = hashlib.sha256(base64.b64decode(image['data'], validate=True)).hexdigest()
            if 'tab_id' in value:
                value['tab_id'] = self.refs.public('Tab', value['tab_id'])
            if 'tabs' in value:
                value['tabs'] = [dict(tab_id=self.refs.public('Tab', item['tab_id']),
                                     **fields(item, 'title', 'url', 'created')) for item in value['tabs']]
            if 'downloads' in value:
                value['downloads'] = [fields(item, 'filename', 'state', 'receivedBytes', 'totalBytes', 'path', 'message')
                                      for item in value['downloads']]
        return value

    def context(self, items):
        results = []
        for item in items:
            result = fields(item, 'kind', 'name', 'status')
            if item.get('kind') != 'desktop':
                result.update(fields(item, 'location'))
                if item.get('kind') == 'file':
                    result['id'] = self.refs.public('File', item['id'])
            elif item.get('desktop'):
                # Desktop operations can discover their own references. Context
                # needs the resource name and state, not its stored routing key.
                result['desktop'] = fields(item['desktop'], 'work', 'operation', 'state', 'path')
            results.append(result)
        return results

    def plan(self, plan):
        result = fields(plan, 'title', 'steps', 'status', 'createdAt')
        scope = plan.get('scope', {})
        result['scope'] = dict(browserOrigins=copy.deepcopy(scope.get('browserOrigins', [])),
            files=[fields(item, 'action', 'path') for item in scope.get('files', [])],
            mcpTools=[dict(serverId=self.refs.public('Connection', item['serverId']),
                          **fields(item, 'serverName', 'toolName')) for item in scope.get('mcpTools', [])],
            fusedIntegrations=[dict(id=self.refs.public('Integration', item['id']), name=item['name'])
                               for item in scope.get('fusedIntegrations', [])])
        return result
