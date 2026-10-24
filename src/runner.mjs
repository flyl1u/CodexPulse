import {appendFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {planOrder, projectLayout} from './planner.mjs';

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function sortOnce({client, readLocalActivity, apply = false}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [projects, sidebar] = await Promise.all([
      client.call('list_projects'), client.call('list_threads', {limit: 1}),
    ]);
    const inventory = {...sidebar, projects: projects.projects};
    const {state, rows} = readLocalActivity();
    const plan = planOrder(inventory, state, rows);
    if (!plan.changed || !apply) {
      return {status: plan.changed ? 'planned' : 'unchanged', changed: plan.changed, count: plan.count, writes: 0};
    }
    // The bridge has no compare-and-swap; re-read immediately before writing.
    const before = await client.call('list_threads', {limit: 1});
    if (!equal(projectLayout(before), projectLayout(sidebar))) continue;
    await client.call('reorder_sidebar_projects', {projectIds: plan.projectIds});
    const after = await client.call('list_threads', {limit: 1});
    const verified = planOrder({...after, projects: projects.projects}, state, rows);
    if (!equal(verified.current, plan.projectIds)) throw new Error('SIDEBAR_VERIFICATION_FAILED');
    const beforeOther = projectLayout(before).filter(([id]) => id !== 'threads');
    const afterOther = projectLayout(after).filter(([id]) => id !== 'threads');
    if (!equal(beforeOther, afterOther)) throw new Error('SIDEBAR_MEMBERSHIP_CHANGED');
    return {status: 'sorted', changed: true, count: plan.count, writes: 1};
  }
  throw new Error('SIDEBAR_CHANGED_DURING_CHECK');
}

export async function withLock(runtimeDir, action, {waitMs = 15000} = {}) {
  mkdirSync(runtimeDir, {recursive: true});
  const lockPath = path.join(runtimeDir, 'sort.lock');
  const token = randomUUID();
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx');
      try {
        writeFileSync(fd, JSON.stringify({pid: process.pid, token, createdAt: Date.now()}));
      } finally {
        closeSync(fd);
      }
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const old = JSON.parse(readFileSync(lockPath, 'utf8'));
        if (Number.isInteger(old.pid) && old.pid > 0) {
          try {
            process.kill(old.pid, 0);
          } catch (probe) {
            if (probe.code === 'ESRCH' && equal(old, JSON.parse(readFileSync(lockPath, 'utf8')))) {
              unlinkSync(lockPath);
              continue;
            }
          }
        }
      } catch (readError) {
        if (readError.code === 'ENOENT') continue;
      }
      if (Date.now() >= deadline) throw new Error('SORT_LOCK_TIMEOUT');
      await delay(60);
    }
  }
  try {
    return await action();
  } finally {
    if (existsSync(lockPath)) {
      const current = JSON.parse(readFileSync(lockPath, 'utf8'));
      if (current.token === token) unlinkSync(lockPath);
    }
  }
}

export function recordRun(runtimeDir, summary) {
  mkdirSync(runtimeDir, {recursive: true});
  const entry = {at: new Date().toISOString(), ...summary};
  const logPath = path.join(runtimeDir, 'events.jsonl');
  // Keep only a bounded diagnostic tail. Never save prompts, titles, or transcripts.
  if (existsSync(logPath)) {
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    if (lines.length >= 300) writeFileSync(logPath, `${lines.slice(-199).join('\n')}\n`);
  }
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  return entry;
}
