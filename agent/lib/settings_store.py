"""Backend-owned personal skills and provider-reported model usage."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import re
import sqlite3
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
