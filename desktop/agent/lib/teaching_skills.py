"""Server-side interpretation and validation for demonstrations."""
import re
from uuid import uuid4


LIMITS = dict(evidence=200, apps=12, inputs=20, steps=100, questions=20)


def _text(value, label, maximum=8000, required=True):
    if not isinstance(value, str) or (required and not value.strip()) or len(value.encode('utf-8')) > maximum:
        raise ValueError(f'Add {label} up to {maximum:,} bytes.')
    return value.strip()


def _slug(value):
    value = re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-')[:64].strip('-')
    return value or 'taught-workflow'


def _safe_evidence(value):
    if not isinstance(value, list) or not value or len(value) > LIMITS['evidence']:
        raise ValueError('Provide 1–200 captured steps.')
    safe = []
    for item in value:
        if not isinstance(item, dict) or item.get('kind') not in ('click', 'scroll', 'keyboard', 'app_change', 'explanation'):
            raise ValueError('Invalid demonstration evidence.')
        row = {key: item[key] for key in ('id', 'kind', 'at', 'application', 'window', 'role', 'label', 'value', 'structure', 'explanation', 'screenshot', 'redacted') if key in item}
        for key in ('id', 'at', 'application', 'window', 'role', 'label', 'value', 'explanation'):
            if key in row and (not isinstance(row[key], str) or len(row[key]) > (2_000_000 if key == 'screenshot' else 4000)):
                raise ValueError('Invalid demonstration evidence.')
        if 'screenshot' in row and (not isinstance(row['screenshot'], str) or len(row['screenshot']) > 2_000_000 or not row['screenshot'].startswith('data:image/')):
            raise ValueError('Invalid demonstration screenshot.')
        if 'structure' in row and (not isinstance(row['structure'], list) or len(row['structure']) > 12 or any(not isinstance(part, str) or len(part) > 500 for part in row['structure'])):
            raise ValueError('Invalid demonstration evidence.')
        # The desktop redacts first; the server independently refuses suspicious values.
        sensitive = ' '.join(str(row.get(key, '')) for key in ('label', 'role')).lower()
        if any(word in sensitive for word in ('password', 'passcode', 'pin', 'secret', 'security code', 'one-time code', 'verification code', 'cvv', 'card number')) and row.get('value') not in (None, '[REDACTED]'):
            raise ValueError('Sensitive input was not redacted.')
        safe.append(row)
    return safe


def draft_teaching(data):
    if not isinstance(data, dict):
        raise ValueError('Invalid teaching session.')
    objective = _text(data.get('objective'), 'an outcome')
    evidence = _safe_evidence(data.get('evidence'))
    applications = []
    for item in evidence:
        app = item.get('application')
        if app and app not in applications:
            applications.append(app)
    applications = applications[:LIMITS['apps']]
    inputs = []
    for item in evidence:
        if item['kind'] != 'keyboard' or item.get('redacted') or not item.get('label'):
            continue
        identifier = _slug(item['label'])
        if not any(existing['id'] == identifier for existing in inputs):
            inputs.append(dict(id=identifier, name=item['label'],
                               description=f"Value to enter in {item['label']}.", required=True))
    steps = []
    for item in evidence:
        if item['kind'] == 'explanation':
            intent = item.get('explanation', '')
        elif item['kind'] == 'app_change':
            intent = f"Bring {item.get('application', 'the demonstrated app')} forward and locate {item.get('window', 'the demonstrated window')}."
        elif item['kind'] == 'keyboard':
            intent = f"Enter the required value in {item.get('label') or item.get('role') or 'the demonstrated field'}."
        elif item['kind'] == 'scroll':
            intent = f"Find the section containing {item.get('label') or 'the demonstrated content'}; scroll as needed rather than relying on its recorded position."
        else:
            intent = f"Locate {item.get('label') or item.get('role') or 'the demonstrated control'} by its current label and surrounding UI, then activate it."
        element = {key: item[key] for key in ('role', 'label', 'structure') if item.get(key) is not None}
        steps.append(dict(id=str(uuid4()), intent=intent, application=item.get('application'),
                          element=element,
                          method='connector_or_browser' if re.search(r'browser|chrome|edge|safari|firefox', item.get('application', ''), re.I) else 'computer',
                          evidenceIds=[item.get('id')], **({'screenshot': item['screenshot']} if item.get('screenshot') else {})))
    explained = [item['explanation'] for item in evidence if item.get('explanation')]
    questions = [] if explained else [dict(id=str(uuid4()), prompt='What should Dex do when the demonstrated source information is missing?', answer='')]
    return dict(name=_slug(objective), description=objective[:1024], objective=objective,
                applications=applications, inputs=inputs[:LIMITS['inputs']], steps=steps,
                decisions=['If the screen differs materially or more than one control matches, pause and ask for guidance.',
                           'Prefer an available connector when it can complete the same intent reliably; otherwise use supervised computer interaction.'],
                completionChecks=[f'Confirm that the requested outcome is visible: {objective}'], questions=questions)


def validate_draft(data):
    if not isinstance(data, dict):
        raise ValueError('Invalid taught skill.')
    draft = dict(id=data.get('id'), name=_slug(_text(data.get('name'), 'a skill name', 64)),
                 description=_text(data.get('description'), 'a description', 1024),
                 objective=_text(data.get('objective'), 'an objective'))
    for key, limit in (('applications', LIMITS['apps']), ('decisions', 30), ('completionChecks', 30), ('pendingCorrections', 30)):
        values = data.get(key, [])
        if not isinstance(values, list) or len(values) > limit or any(not isinstance(value, str) or not value.strip() or len(value) > 4000 for value in values):
            raise ValueError(f'Invalid {key}.')
        draft[key] = [value.strip() for value in values]
    inputs = data.get('inputs', [])
    if not isinstance(inputs, list) or len(inputs) > LIMITS['inputs']:
        raise ValueError('Add up to 20 skill inputs.')
    draft['inputs'] = []
    for item in inputs:
        if not isinstance(item, dict) or type(item.get('required', True)) is not bool:
            raise ValueError('Invalid skill input.')
        draft['inputs'].append(dict(id=_text(item.get('id') or str(uuid4()), 'an input identifier', 100),
                                    name=_text(item.get('name'), 'an input name', 120),
                                    description=_text(item.get('description', ''), 'an input description', 500, False),
                                    required=item.get('required', True)))
    steps = data.get('steps')
    if not isinstance(steps, list) or not steps or len(steps) > LIMITS['steps']:
        raise ValueError('Add 1–100 skill steps.')
    draft['steps'] = []
    for item in steps:
        if not isinstance(item, dict) or item.get('method') not in ('connector_or_browser', 'computer'):
            raise ValueError('Invalid skill step.')
        application = item.get('application')
        if application is not None and (not isinstance(application, str) or len(application) > 500):
            raise ValueError('Invalid skill step application.')
        element = item.get('element', {})
        if not isinstance(element, dict):
            raise ValueError('Invalid skill step element.')
        safe_element = {key: element[key] for key in ('role', 'label', 'structure') if element.get(key) is not None}
        if any(not isinstance(safe_element.get(key), str) or len(safe_element[key]) > 500 for key in ('role', 'label') if key in safe_element):
            raise ValueError('Invalid skill step element.')
        if 'structure' in safe_element and (not isinstance(safe_element['structure'], list) or len(safe_element['structure']) > 12 or any(not isinstance(value, str) or len(value) > 500 for value in safe_element['structure'])):
            raise ValueError('Invalid skill step structure.')
        evidence_ids = item.get('evidenceIds', [])
        if not isinstance(evidence_ids, list) or len(evidence_ids) > 20 or any(not isinstance(value, str) or len(value) > 100 for value in evidence_ids):
            raise ValueError('Invalid skill evidence references.')
        draft['steps'].append(dict(id=_text(item.get('id') or str(uuid4()), 'a step identifier', 100),
                                   intent=_text(item.get('intent'), 'a step intent'), application=application,
                                   element=safe_element, method=item['method'], evidenceIds=evidence_ids))
    questions = data.get('questions', [])
    if not isinstance(questions, list) or len(questions) > LIMITS['questions']:
        raise ValueError('Add up to 20 unresolved questions.')
    draft['questions'] = [dict(id=_text(item.get('id') or str(uuid4()), 'a question identifier', 100),
                               prompt=_text(item.get('prompt'), 'a question', 1000),
                               answer=_text(item.get('answer', ''), 'an answer', 4000, False)) for item in questions if isinstance(item, dict)]
    return draft


def skill_instructions(draft):
    inputs = '\n'.join(f"- {item['name']}: {item['description'] or 'Ask the owner for this value.'}" for item in draft['inputs']) or '- None.'
    steps = '\n'.join(f"{number}. {item['intent']} Use {('a reliable connector or browser interaction' if item['method'] == 'connector_or_browser' else 'computer interaction')} and locate controls afresh from accessibility labels and surrounding UI; never reuse recorded coordinates." for number, item in enumerate(draft['steps'], 1))
    decisions = '\n'.join(f'- {item}' for item in draft['decisions'])
    checks = '\n'.join(f'- {item}' for item in draft['completionChecks'])
    answers = '\n'.join(f"- {item['prompt']} Answer: {item.get('answer') or 'Ask the owner during the run.'}" for item in draft['questions'])
    corrections = '\n'.join(f'- {item}' for item in draft.get('pendingCorrections', []))
    return f"""Objective: {draft['objective']}

Required applications: {', '.join(draft['applications']) or 'Determine from the current task.'}

Inputs:
{inputs}

Workflow:
{steps}

Decision rules:
{decisions}

Completion checks:
{checks}

Clarifications:
{answers or '- None.'}

Reviewed corrections:
{corrections or '- None.'}

Run under supervision. Inspect the current screen before every action. If the screen differs materially, a target is ambiguous, or a completion check cannot be verified, stop and ask the owner for guidance. Existing action permissions always apply."""
