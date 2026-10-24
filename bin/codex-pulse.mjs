import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {AppClient} from '../src/app-client.mjs';
import {readActivity} from '../src/activity.mjs';
import {sortOnce, withLock, recordRun} from '../src/runner.mjs';
import {eventContext, forwardNotification} from '../src/events.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const runtime = process.env.CODEX_PULSE_RUNTIME_DIR || path.join(root, 'runtime');
const mode = process.argv[2] || 'check';
const callback = mode === 'notify' || mode === 'stop';
const started = Date.now();
let context;
let installation = {};

try {
  const metadata = path.join(runtime, 'installation.json');
  if (existsSync(metadata)) installation = JSON.parse(readFileSync(metadata, 'utf8'));
  if (callback) {
    const raw = mode === 'notify' ? process.argv[3] : readFileSync(0, 'utf8');
    if (mode === 'notify') {
      try { forwardNotification(installation.originalNotify, raw); }
      catch { recordRun(runtime, {trigger: mode, status: 'warning', error: 'ORIGINAL_NOTIFY_FAILED'}); }
    }
    context = eventContext(JSON.parse(raw));
    if (!context || installation.enabled === false) process.exit(0);
  } else {
    if (!['check', 'apply'].includes(mode)) throw new Error('USAGE: codex-pulse.mjs [check|apply|notify|stop]');
    context = {threadId: process.env.CODEX_THREAD_ID || process.env.CODEX_SESSION_ID, trigger: mode};
  }
  const codexDir = installation.codexDir || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const client = new AppClient(context);
  const result = await withLock(runtime, () => {
    const activity = readActivity(codexDir);
    const source = activity.rows.find(row => row.id === context.threadId)?.source;
    if (callback && String(source || '').toLowerCase().includes('subagent')) {
      return {status: 'ignored-subagent', writes: 0};
    }
    return sortOnce({client, readLocalActivity: () => readActivity(codexDir), apply: callback || mode === 'apply'});
  });
  const summary = recordRun(runtime, {...result, trigger: context.trigger, durationMs: Date.now() - started});
  if (!callback) console.log(JSON.stringify(summary));
} catch (error) {
  // Callback failures must not interrupt a conversation or expose its payload.
  const code = /^[A-Z][A-Z_0-9]+$/.test(error.message) ? error.message : 'PULSE_RUNTIME_ERROR';
  try { recordRun(runtime, {trigger: context?.trigger || mode, status: 'error', error: code, durationMs: Date.now() - started}); }
  catch { /* A read-only/full disk must not affect Codex. */ }
  if (!callback) { console.error(code); process.exitCode = 1; }
}
