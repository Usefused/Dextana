"""Backend-owned personal skills and provider-reported model usage."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import re
import sqlite3
import json
from uuid import uuid4


def timestamp():
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def database():
    directory = Path(os.environ.get('DEXTANA_STORAGE_DIRECTORY', '.dextana'))
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = directory / 'settings.sqlite'
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    try:
        os.chmod(path, 0o600)
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL, instructions TEXT NOT NULL, enabled INTEGER NOT NULL, version TEXT NOT NULL, updatedAt TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS taught_skills (id TEXT PRIMARY KEY, status TEXT NOT NULL, archived INTEGER NOT NULL, payload TEXT NOT NULL, tested TEXT)')
        db.execute('CREATE TABLE IF NOT EXISTS taught_skill_versions (skillId TEXT NOT NULL, versionNumber INTEGER NOT NULL, version TEXT NOT NULL, payload TEXT NOT NULL, createdAt TEXT NOT NULL, PRIMARY KEY(skillId, versionNumber))')
        db.execute('CREATE TABLE IF NOT EXISTS usage (id TEXT PRIMARY KEY, activityId TEXT NOT NULL, model TEXT NOT NULL, provider TEXT NOT NULL, recordedAt TEXT NOT NULL, inputTokens INTEGER, outputTokens INTEGER, totalTokens INTEGER)')
        with db:
            yield db
    finally:
        db.close()


def skills():
    with database() as db:
        return [dict(row, enabled=bool(row['enabled'])) for row in db.execute('SELECT * FROM skills ORDER BY name')]


def save_skill(data):
    if not isinstance(data, dict) or (data.get('id') is not None and not isinstance(data['id'], str)):
        raise ValueError('Invalid skill.')
    name, description, instructions = (data.get(key) for key in ('name', 'description', 'instructions'))
    if not isinstance(name, str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name) or len(name) > 64:
        raise ValueError('Use a name up to 64 characters with lowercase letters, numbers, and hyphens.')
    if not isinstance(description, str) or not description.strip() or len(description) > 1024:
        raise ValueError('Add a description up to 1,024 characters.')
    if not isinstance(instructions, str) or not instructions.strip() or len(instructions.encode('utf-8')) > 65536:
        raise ValueError('Add instructions up to 64 KB.')
    if type(data.get('enabled', True)) is not bool:
        raise ValueError('Invalid skill state.')
    identifier = data.get('id') or str(uuid4())
    with database() as db:
        if data.get('id') and not db.execute('SELECT 1 FROM skills WHERE id=?', (identifier,)).fetchone():
            raise ValueError('This skill no longer exists.')
        try:
            db.execute('INSERT INTO skills VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, instructions=excluded.instructions, enabled=excluded.enabled, version=excluded.version, updatedAt=excluded.updatedAt', (identifier, name, description.strip(), instructions.strip(), data.get('enabled', True), str(uuid4()), timestamp()))
        except sqlite3.IntegrityError:
            raise ValueError('A skill with this name already exists.') from None
    return next(item for item in skills() if item['id'] == identifier)


def delete_skill(identifier):
    with database() as db:
        if db.execute('DELETE FROM skills WHERE id=?', (identifier,)).rowcount != 1:
            raise ValueError('This skill no longer exists.')


def import_skill(markdown):
    import yaml
    if not isinstance(markdown, str) or len(markdown.encode('utf-8')) > 65536:
        raise ValueError('Choose a SKILL.md file up to 64 KB.')
    match = re.match(r'\A---\s*\r?\n(.*?)\r?\n---\s*\r?\n(.*)\Z', markdown, re.S)
    if not match:
        raise ValueError('SKILL.md needs name and description in YAML frontmatter.')
    try:
        metadata = yaml.safe_load(match[1])
    except yaml.YAMLError:
        raise ValueError('Could not read this skill’s frontmatter.') from None
    if not isinstance(metadata, dict) or not isinstance(metadata.get('name'), str) or not isinstance(metadata.get('description'), str):
        raise ValueError('SKILL.md needs a name and description.')
    return dict(name=metadata['name'], description=metadata['description'], instructions=match[2].strip(), enabled=True)


def _taught_row(db, identifier):
    row = db.execute('SELECT taught_skills.*, skills.name, skills.description, skills.version, skills.updatedAt FROM taught_skills JOIN skills USING(id) WHERE taught_skills.id=?', (identifier,)).fetchone()
    if not row:
        raise ValueError('This taught skill no longer exists.')
    payload = json.loads(row['payload'])
    tested = json.loads(row['tested']) if row['tested'] else None
    version_number = db.execute('SELECT COUNT(*) FROM taught_skill_versions WHERE skillId=?', (identifier,)).fetchone()[0]
    return dict(payload, id=identifier, name=row['name'], description=row['description'], version=row['version'],
                versionNumber=version_number, updatedAt=row['updatedAt'], status=row['status'],
                archived=bool(row['archived']), **({'tested': tested} if tested else {}))


def taught_skills():
    with database() as db:
        identifiers = [row['id'] for row in db.execute('SELECT id FROM taught_skills ORDER BY archived, id')]
        return [_taught_row(db, identifier) for identifier in identifiers]


def save_taught_skill(data):
    from harnest.lib.teaching_skills import validate_draft, skill_instructions
    draft = validate_draft(data)
    personal = save_skill(dict(id=draft.get('id'), name=draft['name'], description=draft['description'],
                               instructions=skill_instructions(draft), enabled=True))
    draft['id'] = personal['id']
    status = data.get('status', 'draft')
    if status not in ('draft', 'tested_successfully', 'needs_attention'):
        raise ValueError('Invalid taught skill status.')
    payload = json.dumps(draft, separators=(',', ':'), ensure_ascii=False)
    with database() as db:
        existing = db.execute('SELECT tested FROM taught_skills WHERE id=?', (personal['id'],)).fetchone()
        db.execute('INSERT INTO taught_skills VALUES (?, ?, 0, ?, ?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, archived=0, payload=excluded.payload',
                   (personal['id'], status, payload, existing['tested'] if existing else None))
        number = db.execute('SELECT COUNT(*) FROM taught_skill_versions WHERE skillId=?', (personal['id'],)).fetchone()[0] + 1
        db.execute('INSERT INTO taught_skill_versions VALUES (?, ?, ?, ?, ?)',
                   (personal['id'], number, personal['version'], payload, timestamp()))
        return _taught_row(db, personal['id'])


def archive_taught_skill(identifier, archived):
    if type(archived) is not bool:
        raise ValueError('Invalid archive state.')
    with database() as db:
        if db.execute('UPDATE taught_skills SET archived=? WHERE id=?', (archived, identifier)).rowcount != 1:
            raise ValueError('This taught skill no longer exists.')
        db.execute('UPDATE skills SET enabled=? WHERE id=?', (not archived, identifier))
        return _taught_row(db, identifier)


def record_taught_test(identifier, data):
    if not isinstance(data, dict) or data.get('outcome') not in ('completed', 'needs_attention'):
        raise ValueError('Invalid supervised test result.')
    activity_id, input_names = data.get('activityId'), data.get('inputNames', [])
    if not isinstance(activity_id, str) or not activity_id or not isinstance(input_names, list) or len(input_names) > 20 or any(not isinstance(value, str) or len(value) > 100 for value in input_names):
        raise ValueError('Invalid supervised test result.')
    tested = dict(at=timestamp(), activityId=activity_id, inputs=input_names, outcome=data['outcome'])
    status = 'tested_successfully' if data['outcome'] == 'completed' else 'needs_attention'
    with database() as db:
        if db.execute('UPDATE taught_skills SET status=?, tested=? WHERE id=?', (status, json.dumps(tested), identifier)).rowcount != 1:
            raise ValueError('This taught skill no longer exists.')
        return _taught_row(db, identifier)


def record_usage(activity, event):
    usage = event.get('usage') or {}
    values = [usage.get(key) for key in ('inputTokens', 'outputTokens', 'totalTokens')]
    if not all(type(value) is int and value >= 0 for value in values):
        # Harnest can emit extra finish/model metadata separately from usage.
        # Such events are not evidence of another model call.
        return
    # Response sequence distinguishes individual model calls and prevents replay totals.
    identifier = f"{event['responseId']}:{event['sequence']}"
    with database() as db:
        db.execute('INSERT OR IGNORE INTO usage VALUES (?, ?, ?, ?, ?, ?, ?, ?)', (identifier, activity['id'], activity['model'], activity.get('provider', 'ollama'), timestamp(), *values))


def usage_summary(period):
    if period not in ('7d', '30d', 'all'):
        raise ValueError('Choose a usage period.')
    since = '' if period == 'all' else (datetime.now(timezone.utc) - timedelta(days=7 if period == '7d' else 30)).isoformat()
    columns = 'COUNT(*) AS calls, COUNT(totalTokens) AS reportedCalls, COALESCE(SUM(inputTokens),0) AS inputTokens, COALESCE(SUM(outputTokens),0) AS outputTokens, COALESCE(SUM(totalTokens),0) AS totalTokens'
    with database() as db:
        total = dict(db.execute(f'SELECT {columns} FROM usage WHERE recordedAt>=?', (since,)).fetchone())
        models = [dict(row) for row in db.execute(f'SELECT model, provider, {columns} FROM usage WHERE recordedAt>=? GROUP BY model, provider ORDER BY totalTokens DESC', (since,))]
    return dict(**total, models=models, period=period)
