"""Durable, chat-scoped handles for known Dextana routing fields only."""
import copy


class ToolReferences:
    def __init__(self, activity):
        self.entries = activity.setdefault('toolReferences', {})

    def public(self, kind, identifier):
        if not identifier:
            return identifier
        entries = self.entries.setdefault(kind, {})
        if identifier not in entries:
            entries[identifier] = f'{kind} {len(entries) + 1}'
        return entries[identifier]

    def internal(self, kind, reference):
        for identifier, saved in self.entries.get(kind, {}).items():
            if saved == reference:
                return identifier
        # Old conversations can still contain storage handles. The owning service
        # must validate ownership, freshness and approval just as before.
        return reference


def fields(value, *names):
    return {name: copy.deepcopy(value[name]) for name in names if name in value}


def desktop_kind(operation):
    if operation.startswith(('timer.', 'reminder.')) or operation == 'alarms.list':
        return 'Alarm'
    if operation.startswith('workflow.watch_'):
        return 'Watch'
    if operation.startswith('workflow.rename_'):
        return 'Rename'
    if operation.startswith('processing.'):
        return 'Processing'
    return None
