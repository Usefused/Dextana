"""Portable cross-session memory. Only SQLite and injected async model functions.

The host supplies a transactional connection factory, embed(texts), and
extract(records, existing). No Harnest, desktop, credentials, or provider imports.
"""
import hashlib
import json
import math
from datetime import datetime, timezone


def normalized(vector, dimensions=None):
    if (not isinstance(vector, list) or not 1 <= len(vector) <= 16384 or
            (dimensions is not None and len(vector) != dimensions) or
            any(type(x) not in (int, float) or not math.isfinite(x) for x in vector)):
        raise ValueError('Invalid embedding vector')
    norm = math.hypot(*vector)
    if not norm or not math.isfinite(norm):
        raise ValueError('Invalid embedding vector')
    return [x / norm for x in vector]


def extracted_facts(changes):
    if not isinstance(changes, list) or len(changes) > 12:
        raise ValueError('Invalid extracted memories')
    facts = {}
    for change in changes:
        if not isinstance(change, dict):
            raise ValueError('Invalid extracted memory')
        key, text = change.get('key'), change.get('text')
        if not isinstance(key, str) or not 1 <= len(key.strip()) <= 160 or not isinstance(text, str) or len(text) > 1000:
            raise ValueError('Invalid extracted memory')
        facts[key.strip().casefold()] = text.strip()
    return facts


class Memory:
    def __init__(self, connect):
        self.connect = connect
        with connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS memories (owner TEXT NOT NULL, scope TEXT NOT NULL, key TEXT NOT NULL, text TEXT NOT NULL, source TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY(owner, scope, key))')
            db.execute('CREATE TABLE IF NOT EXISTS memory_vectors (owner TEXT NOT NULL, scope TEXT NOT NULL, key TEXT NOT NULL, profile TEXT NOT NULL, text TEXT NOT NULL, vector TEXT NOT NULL, PRIMARY KEY(owner, scope, key, profile))')
            db.execute('CREATE TABLE IF NOT EXISTS memory_jobs (id TEXT PRIMARY KEY, owner TEXT NOT NULL, scope TEXT NOT NULL, source TEXT NOT NULL, records TEXT NOT NULL, updated TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'pending\', attempts INTEGER NOT NULL DEFAULT 0)')

    def enqueue(self, owner, scope, source, records, *, updated=None):
        encoded = json.dumps(records, ensure_ascii=False)
        identifier = hashlib.sha256(json.dumps([owner, source, records], sort_keys=True).encode()).hexdigest()
        with self.connect() as db:
            db.execute('INSERT OR IGNORE INTO memory_jobs(id,owner,scope,source,records,updated) VALUES(?,?,?,?,?,?)',
                (identifier, owner, scope, source, encoded, updated if updated is not None else datetime.now(timezone.utc).isoformat()))
        return identifier

    def pending(self, owner):
        with self.connect() as db:
            row = db.execute("SELECT id,scope,source,records,updated FROM memory_jobs WHERE owner=? AND status='pending' AND attempts<3 ORDER BY updated LIMIT 1", (owner,)).fetchone()
            if row:
                return dict(zip(('id', 'scope', 'source', 'records', 'updated'), row))

    def failed(self, identifier):
        with self.connect() as db:
            db.execute('UPDATE memory_jobs SET attempts=attempts+1 WHERE id=?', (identifier,))

    def forget_source(self, owner, source):
        with self.connect() as db:
            db.execute('DELETE FROM memory_jobs WHERE owner=? AND source=?', (owner, source))
            db.execute('DELETE FROM memory_vectors WHERE owner=? AND EXISTS (SELECT 1 FROM memories m WHERE m.owner=memory_vectors.owner AND m.scope=memory_vectors.scope AND m.key=memory_vectors.key AND m.source=?)', (owner, source))
            db.execute("UPDATE memories SET text='',updated=? WHERE owner=? AND source=?",
                (datetime.now(timezone.utc).isoformat(), owner, source))

    async def recall(self, owner, scope, query, profile, dimensions, embed, limit=6):
        with self.connect() as db:
            rows = db.execute('SELECT m.scope,m.key,m.text,m.source,m.updated,v.vector FROM memories m LEFT JOIN memory_vectors v ON v.owner=m.owner AND v.scope=m.scope AND v.key=m.key AND v.text=m.text AND v.profile=? WHERE m.owner=? AND m.scope IN (\'\',?) AND m.text<>\'\' ORDER BY m.updated DESC', (profile, owner, scope)).fetchall()
        if not rows:
            return []
        # Rebuild missing vectors when the provider, model, dimensions or fact changes.
        # Transactions never span model calls; a stale result cannot match newer text.
        vectors = {i: json.loads(row[5]) for i, row in enumerate(rows) if row[5]}
        missing = [i for i in range(len(rows)) if i not in vectors]
        for offset in range(0, len(missing), 32):
            indices = missing[offset:offset + 32]
            batch = await embed([rows[i][2] for i in indices])
            if len(batch) != len(indices):
                raise ValueError('Wrong embedding count')
            batch = [normalized(v, dimensions) for v in batch]
            with self.connect() as db:
                for i, vector in zip(indices, batch):
                    vectors[i] = vector
                    db.execute('INSERT OR REPLACE INTO memory_vectors VALUES(?,?,?,?,?,?)',
                        (owner, rows[i][0], rows[i][1], profile, rows[i][2], json.dumps(vector)))
        query_vectors = await embed([query])
        if len(query_vectors) != 1:
            raise ValueError('Wrong embedding count')
        target = normalized(query_vectors[0], dimensions)
        scored = [(sum(a * b for a, b in zip(target, vectors[i])), row) for i, row in enumerate(rows)]
        result = []
        for score, row in sorted(scored, key=lambda item: item[0], reverse=True):
            if score < 0.3 or len(result) == limit:
                break
            result.append(dict(key=row[1], text=row[2], source=row[3], updated=row[4], scope=row[0]))
        return result

    async def capture(self, owner, job, profile, dimensions, embed, extract):
        records = json.loads(job['records'])
        query = next((r['content'] for r in reversed(records) if r.get('role') == 'user' and isinstance(r.get('content'), str)), 'User preferences and decisions')
        existing = await self.recall(owner, job['scope'], query[:8000], profile, dimensions, embed, limit=12)
        changes = await extract(records, existing)
        facts = extracted_facts(changes)
        keys = [key for key, text in facts.items() if text]
        batch = await embed([facts[key] for key in keys]) if keys else []
        if len(batch) != len(keys):
            raise ValueError('Wrong embedding count')
        vectors = dict(zip(keys, [normalized(vector, dimensions) for vector in batch]))
        written = 0
        with self.connect() as db:
            # An edited/deleted turn invalidates a worker already in flight.
            if not db.execute("SELECT 1 FROM memory_jobs WHERE id=? AND status='pending'", (job['id'],)).fetchone():
                return 0
            for key, text in facts.items():
                current = db.execute('SELECT updated FROM memories WHERE owner=? AND scope=? AND key=?', (owner, job['scope'], key)).fetchone()
                if current and current[0] > job['updated']:
                    continue
                # Empty text is a tombstone, preventing an older job restoring a forgotten fact.
                db.execute('INSERT OR REPLACE INTO memories VALUES(?,?,?,?,?,?)',
                    (owner, job['scope'], key, text, job['source'], job['updated']))
                db.execute('DELETE FROM memory_vectors WHERE owner=? AND scope=? AND key=?', (owner, job['scope'], key))
                if text:
                    db.execute('INSERT INTO memory_vectors VALUES(?,?,?,?,?,?)',
                        (owner, job['scope'], key, profile, text, json.dumps(vectors[key])))
                written += 1
            db.execute("UPDATE memory_jobs SET status='done',records='[]' WHERE id=?", (job['id'],))
        return written
