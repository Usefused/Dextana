"""Bound browser retries using observations, independent of model narration."""
import hashlib
import json
from collections import OrderedDict


class BrowserStalled(ValueError):
    pass


class BrowserProgress:
    def __init__(self):
        self.tabs = OrderedDict()

    def observe(self, name, args, result):
        if name != 'browser' or not isinstance(result, dict):
            return result
        if args.get('action') in ('list_tabs', 'connect_user', 'new_tab', 'close_tab'):
            return result
        key = str(result.get('tab_id') or args.get('tab_id') or 'default')
        state = self.tabs.setdefault(key, dict(texts=[], shapes=[], images=[], errors=[], repeats=0))
        self.tabs.move_to_end(key)
        while len(self.tabs) > 64:
            self.tabs.popitem(last=False)
        error = result.get('error')
        if error:
            signature = str(error)
            repeated = signature in state['errors']
            self.remember(state['errors'], signature)
        else:
            repeated = not self.changed(state, result)
            state['errors'].clear()
        state['repeats'] = state['repeats'] + 1 if repeated else 0
        warn, stop = (1, 3) if error else (3, 7)
        if state['repeats'] >= stop:
            raise BrowserStalled('Stopped a browser loop: repeated actions returned no new information. '
                'The requested work is incomplete. Review the last result and choose a different observed target or ask for help; no action was replayed to recover it.')
        if state['repeats'] >= warn:
            return dict(result, recovery='Repeated browser actions are returning no new information. '
                'Do not repeat the same click, scroll, screenshot or overlapping text read. '
                'For an attachment, find its observed control using element pagination (next_offset), '
                'then open it and verify the viewer. Use a different observed approach or explain what is blocked. '
                'Further unchanged results will stop this turn.')
        return result

    @staticmethod
    def remember(history, value):
        if value not in history:
            history.append(value)
            del history[:-16]

    def changed(self, state, result):
        changed = False
        text = result.get('text')
        if isinstance(text, str) and text.strip():
            # Overlapping text pagination is not new evidence.
            text = ' '.join(text.split())
            changed = not any(text in old for old in state['texts'])
            self.remember(state['texts'], text)
        if isinstance(result.get('elements'), list):
            shape = dict(url=result.get('url'), viewport=result.get('viewport'), elements=[
                {key: item[key] for key in ('tag', 'label', 'role', 'value', 'visible', 'bounds', 'actions') if key in item}
                for item in result['elements'] if isinstance(item, dict)])
            digest = hashlib.sha256(json.dumps(shape, sort_keys=True).encode()).hexdigest()
            changed = changed or digest not in state['shapes']
            self.remember(state['shapes'], digest)
        image = result.get('image')
        if isinstance(image, dict) and image.get('data'):
            digest = hashlib.sha256(str(image['data']).encode()).hexdigest()
            changed = changed or digest not in state['images']
            self.remember(state['images'], digest)
        # Navigation receipts alone do not prove that the destination loaded.
        return changed
