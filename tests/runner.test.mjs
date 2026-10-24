import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtempSync, rmSync, readFileSync, writeFileSync, utimesSync, existsSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {sortOnce, withLock, recordRun} from '../src/runner.mjs';
import {eventContext, forwardNotification} from '../src/events.mjs';

function fixture() {
  let keys = ['codex:project:a', 'codex:project:b'];
  let writes = 0;
  const projects = ['a', 'b'].map(id => ({projectId: id, projectKind: 'local', hostId: 'local'}));
  const client = {async call(tool, args) {
    if (tool === 'list_projects') return {projects};
    if (tool === 'list_threads') return {sections: [{sectionId: 'threads', itemKeys: [...keys]}]};
    if (tool === 'reorder_sidebar_projects') { writes++; keys = args.projectIds.map(id => `codex:project:${id}`); return {}; }
    throw new Error('unexpected call');
  }};
  const readLocalActivity = () => ({state: {}, rows: [
    {id: 'ta', project_id: 'a', activity_ms: 1000, source: 'cli'},
    {id: 'tb', project_id: 'b', activity_ms: 2000, source: 'cli'},
  ]});
  return {client, readLocalActivity, writes: () => writes};
}

test('writes once, verifies the client, and performs no write on a repeat', async () => {
  const setup = fixture();
  assert.equal((await sortOnce({...setup, apply: false})).status, 'planned');
  assert.equal(setup.writes(), 0);
  assert.equal((await sortOnce({...setup, apply: true})).status, 'sorted');
  assert.equal((await sortOnce({...setup, apply: true})).status, 'unchanged');
  assert.equal(setup.writes(), 1);
});

test('refuses to write if sidebar membership changes during the check', async () => {
  const setup = fixture();
  const call = setup.client.call;
  let reads = 0;
  setup.client.call = async (tool, args) => {
    const result = await call(tool, args);
    if (tool === 'list_threads' && ++reads % 2 === 0) {
      result.sections.push({sectionId: 'new-section', itemKeys: ['codex:project:new']});
    }
    return result;
  };
  await assert.rejects(() => sortOnce({...setup, apply: true}), /SIDEBAR_CHANGED_DURING_CHECK/);
  assert.equal(setup.writes(), 0);
});

test('detects a client which acknowledges but does not apply a write', async () => {
  const setup = fixture();
  const call = setup.client.call;
  setup.client.call = (tool, args) => tool === 'reorder_sidebar_projects' ? {} : call(tool, args);
  await assert.rejects(() => sortOnce({...setup, apply: true}), /SIDEBAR_VERIFICATION_FAILED/);
});

test('serializes overlapping callbacks and bounds diagnostic logs', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pulse-runner-'));
  try {
    let active = 0;
    let maxActive = 0;
    const action = () => withLock(dir, async () => {
      maxActive = Math.max(maxActive, ++active);
      await delay(20);
      active--;
    });
    await Promise.all([action(), action(), action()]);
    assert.equal(maxActive, 1);
    for (let i = 0; i < 310; i++) recordRun(dir, {status: 'unchanged', writes: 0});
    assert.ok(readFileSync(path.join(dir, 'events.jsonl'), 'utf8').trim().split('\n').length <= 300);
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('pulse-runner-'));
    rmSync(dir, {recursive: true, force: true});
  }
});

test('handles notify and Stop identities, ignoring other event types', () => {
  assert.deepEqual(eventContext({'type': 'agent-turn-complete', 'thread-id': 't', 'turn-id': 'u'}),
    {threadId: 't', turnId: 'u', trigger: 'notify'});
  assert.equal(eventContext({type: 'approval-requested'}), null);
  assert.equal(eventContext({hook_event_name: 'Stop', session_id: 't', stop_hook_active: true}), null);
  assert.equal(eventContext({hook_event_name: 'Stop', session_id: 't'}).threadId, 't');
});

test('recovers an old partial lock left by a crashed process', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pulse-lock-'));
  try {
    const file = path.join(dir, 'sort.lock');
    writeFileSync(file, '{');
    const old = new Date(Date.now() - 60000);
    utimesSync(file, old, old);
    assert.equal(await withLock(dir, async () => 'recovered', {waitMs: 100}), 'recovered');
    assert.equal(existsSync(file), false);
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('pulse-lock-'));
    rmSync(dir, {recursive: true, force: true});
  }
});

test('forwards a notification exactly once without shell interpolation', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pulse-notify-'));
  try {
    const output = path.join(dir, 'event.txt');
    const script = path.join(dir, 'notifier.mjs');
    writeFileSync(script, `import {writeFileSync} from 'node:fs';writeFileSync(process.argv[2],process.argv[3]);`);
    const event = JSON.stringify({type: 'agent-turn-complete', 'last-assistant-message': '" & $(echo no) 中文'});
    forwardNotification([process.execPath, script, output], event);
    assert.equal(readFileSync(output, 'utf8'), event);
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('pulse-notify-'));
    rmSync(dir, {recursive: true, force: true});
  }
});
