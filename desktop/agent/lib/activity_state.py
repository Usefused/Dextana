"""Durable desktop orchestration state, separate from framework checkpoints."""
from contextlib import contextmanager
import json
import os
import sqlite3
from pathlib import Path


class ActivityState:
    def __init__(self, directory):
        self.path = Path(directory) / 'activities.sqlite'

    @contextmanager
    def connect(self):
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        db = sqlite3.connect(self.path)
        try:
            os.chmod(self.path, 0o600)
            version = db.execute('PRAGMA user_version').fetchone()[0]
            if version not in (0, 1):
                raise ValueError('Unsupported activity database version.')
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('PRAGMA synchronous=FULL')
            db.execute('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)')
            db.execute('PRAGMA user_version=1')
            with db:
                yield db
        finally:
            db.close()

    def load(self):
        with self.connect() as db:
            row = db.execute('SELECT data FROM state WHERE id=1').fetchone()
            return json.loads(row[0]) if row else None

    def save(self, state):
        with self.connect() as db:
            db.execute('INSERT INTO state VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', (json.dumps(state),))
