import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

/** Offline recovery fixtures only: never edit the owner's live database. */
export function updateBackendState(directory: string, update: (state: any) => void) {
  const db = new DatabaseSync(join(directory, 'agent-state', 'activities.sqlite'));
  try {
    db.exec('BEGIN IMMEDIATE');
    const state = JSON.parse((db.prepare('SELECT data FROM state WHERE id=1').get() as { data: string }).data);
    update(state);
    db.prepare('UPDATE state SET data=? WHERE id=1').run(JSON.stringify(state));
    db.exec('COMMIT');
  } finally { db.close(); }
}
