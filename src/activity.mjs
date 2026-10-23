import {readFileSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

export function readActivity(codexDir) {
  const state = JSON.parse(readFileSync(path.join(codexDir, '.codex-global-state.json'), 'utf8').replace(/^\uFEFF/, ''));
  const db = new DatabaseSync(path.join(codexDir, 'state_5.sqlite'), {readOnly: true, timeout: 3000});
  try {
    db.exec('PRAGMA query_only=ON');
    const columns = new Set(db.prepare('PRAGMA table_info(threads)').all().map(row => row.name));
    for (const required of ['id', 'project_id', 'cwd', 'source', 'archived']) {
      if (!columns.has(required)) throw new Error('ACTIVITY_SCHEMA_UNSUPPORTED');
    }
    const candidates = ['recency_at_ms', 'recency_at*1000', 'updated_at_ms', 'updated_at*1000']
      .filter(expression => columns.has(expression.split('*')[0]));
    if (!candidates.length) throw new Error('ACTIVITY_TIME_MISSING');
    const rows = db.prepare(`SELECT id, project_id, cwd, source,
      COALESCE(${candidates.join(',')},0) AS activity_ms FROM threads WHERE archived=0`).all();
    return {state, rows};
  } finally {
    db.close();
  }
}
