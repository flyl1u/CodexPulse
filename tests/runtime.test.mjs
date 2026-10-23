import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {AppClient, requestPipe} from '../src/app-client.mjs';
import {planOrder, normalizePath} from '../src/planner.mjs';
import {readActivity} from '../src/activity.mjs';

function inventory() {
  return {
    projects: ['a', 'b', 'pinned'].map(id => ({projectId: id, projectKind: 'local', path: `D:/${id}`, hostId: 'local'})),
    sections: [
      {sectionId: 'threads', itemKeys: ['codex:project:a', 'codex:project:b']},
      {sectionId: 'pinned', itemKeys: ['codex:project:pinned']},
    ],
  };
}
const activity = [
  {id: 'ta', project_id: 'a', cwd: 'D:/a', activity_ms: 1000, source: 'cli'},
  {id: 'tb', project_id: 'b', cwd: 'D:/b', activity_ms: 2000, source: 'cli'},
];

test('sorts by activity, preserves input, and skips a repeated order', () => {
  const input = inventory();
  const before = structuredClone(input);
  assert.deepEqual(planOrder(input, {}, activity).projectIds, ['b', 'a']);
  assert.deepEqual(input, before);
  input.sections[0].itemKeys.reverse();
  assert.equal(planOrder(input, {}, activity).changed, false);
  assert.deepEqual(planOrder(input, {}, []).projectIds, ['b', 'a']);
});

test('excludes projectless and subagent activity', () => {
  assert.deepEqual(planOrder(inventory(), {'projectless-thread-ids': ['tb']}, activity).projectIds, ['a', 'b']);
  const rows = structuredClone(activity);
  rows[1].source = {subagent: {parent_thread_id: 'ta'}};
  assert.deepEqual(planOrder(inventory(), {}, rows).projectIds, ['a', 'b']);
});

test('preserves pinned, remote, ChatGPT, and custom-section projects', () => {
  const input = inventory();
  input.projects.push({projectId: 'remote', projectKind: 'local', hostId: 'ssh:host'},
    {projectId: 'cloud', projectKind: 'chatgpt'}, {projectId: 'custom', projectKind: 'local', hostId: 'local'});
  input.sections[0].itemKeys.splice(1, 0, 'codex:project:remote', 'chatgpt:project:cloud');
  input.sections.push({sectionId: 'custom', itemKeys: ['codex:project:custom']});
  assert.deepEqual(planOrder(input, {}, activity).projectIds, ['b', 'a']);
});

test('handles extended Windows paths, migrated IDs, and assignments', () => {
  assert.equal(normalizePath('\\\\?\\D:\\A\\'), 'd:/a');
  const rows = [{id: 'tb', project_id: 'new-b', cwd: '', activity_ms: 2000, source: 'cli'}];
  const state = {'app-server-project-id-by-legacy-project-id-by-host': {local: {b: 'new-b'}}};
  assert.deepEqual(planOrder(inventory(), state, rows).projectIds, ['b', 'a']);
  assert.deepEqual(planOrder(inventory(), {'thread-project-assignments': {tb: {projectId: 'a'}}}, rows).projectIds, ['a', 'b']);
});

test('reads SQLite without writes and prefers recency over metadata updates', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pulse-activity-'));
  try {
    writeFileSync(path.join(dir, '.codex-global-state.json'), '{}');
    const db = new DatabaseSync(path.join(dir, 'state_5.sqlite'));
    db.exec(`CREATE TABLE threads(id TEXT, project_id TEXT, cwd TEXT, source TEXT, archived INTEGER,
      updated_at_ms INTEGER, recency_at_ms INTEGER);
      INSERT INTO threads VALUES('ta','a','D:/a','cli',0,9000,1000);
      INSERT INTO threads VALUES('old','a','D:/a','cli',1,9999,9999);`);
    db.close();
    const result = readActivity(dir);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].activity_ms, 1000);
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('pulse-activity-'));
    rmSync(dir, {recursive: true, force: true});
  }
});

async function fakePipe(t, handler) {
  const pipe = process.platform === 'win32' ? `\\\\.\\pipe\\pulse-test-${randomUUID()}`
    : path.join(os.tmpdir(), `pulse-${randomUUID()}.sock`);
  const server = net.createServer(handler);
  await new Promise(resolve => server.listen(pipe, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return pipe;
}

test('accepts a fragmented native pipe response and sends task identity', async t => {
  const pipe = await fakePipe(t, socket => socket.once('data', data => {
    const request = JSON.parse(data.subarray(4).toString());
    assert.equal(request.params.threadId, 'test-thread');
    assert.equal(request.params.tool, 'list_projects');
    const body = Buffer.from(JSON.stringify({jsonrpc: '2.0', id: 1, result: {
      success: true, contentItems: [{type: 'inputText', text: '{"projects":[]}'}],
    }}));
    const frame = Buffer.alloc(4 + body.length);
    frame.writeUInt32LE(body.length);body.copy(frame, 4);
    socket.write(frame.subarray(0, 2));
    setTimeout(() => socket.write(frame.subarray(2)), 5);
  }));
  const client = new AppClient({pipePath: pipe, threadId: 'test-thread'});
  assert.deepEqual(await client.call('list_projects'), {projects: []});
  await assert.rejects(() => client.call('send_message_to_thread'), /APP_TOOL_NOT_ALLOWED/);
});

test('rejects oversized frames and times out instead of hanging', async t => {
  const pipe = await fakePipe(t, socket => socket.once('data', () => {
    const frame = Buffer.alloc(4);frame.writeUInt32LE(9 * 1024 * 1024);socket.write(frame);
  }));
  await assert.rejects(() => requestPipe(pipe, 'tools/list', {}), /APP_FRAME_TOO_LARGE/);
  const silent = await fakePipe(t, socket => socket.resume());
  await assert.rejects(() => requestPipe(silent, 'tools/list', {}, {timeout: 30}), /APP_TIMEOUT/);
});
