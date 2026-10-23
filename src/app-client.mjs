import net from 'node:net';
import {randomUUID} from 'node:crypto';

const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const ALLOWED_TOOLS = new Set(['list_projects', 'list_threads', 'reorder_sidebar_projects']);

export function requestPipe(pipePath, method, params, {timeout = 5000} = {}) {
  if (!pipePath) return Promise.reject(new Error('APP_PIPE_UNAVAILABLE'));
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify({jsonrpc: '2.0', id: 1, method, params}));
    if (payload.length > MAX_FRAME_BYTES) return reject(new Error('APP_FRAME_TOO_LARGE'));
    const frame = Buffer.alloc(4 + payload.length);
    frame.writeUInt32LE(payload.length);
    payload.copy(frame, 4);
    const socket = net.createConnection(pipePath);
    let data = Buffer.alloc(0);
    let finished = false;
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.destroy();
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('APP_TIMEOUT')), timeout);
    socket.once('connect', () => socket.write(frame));
    socket.on('error', () => finish(new Error('APP_CONNECTION_FAILED')));
    socket.on('close', () => finish(new Error('APP_CONNECTION_CLOSED')));
    socket.on('data', chunk => {
      data = Buffer.concat([data, chunk]);
      if (data.length < 4) return;
      const length = data.readUInt32LE(0);
      if (length > MAX_FRAME_BYTES) return finish(new Error('APP_FRAME_TOO_LARGE'));
      if (data.length < length + 4) return;
      try {
        const response = JSON.parse(data.subarray(4, length + 4).toString('utf8'));
        if (response.jsonrpc !== '2.0' || response.id !== 1) throw new Error('APP_INVALID_RESPONSE');
        if (response.error) throw new Error(`APP_RPC_ERROR_${response.error.code}`);
        if (!Object.hasOwn(response, 'result')) throw new Error('APP_INVALID_RESPONSE');
        finish(null, response.result);
      } catch (error) {
        finish(error);
      }
    });
  });
}

export class AppClient {
  constructor({pipePath = process.env.CODEX_APP_TOOLS_PIPE_PATH, threadId, turnId, timeout} = {}) {
    if (!threadId) throw new Error('THREAD_ID_REQUIRED');
    this.pipePath = pipePath;
    this.threadId = threadId;
    this.turnId = turnId || `pulse-${randomUUID()}`;
    this.timeout = timeout;
  }

  async call(tool, args = {}) {
    if (!ALLOWED_TOOLS.has(tool)) throw new Error('APP_TOOL_NOT_ALLOWED');
    const result = await requestPipe(this.pipePath, 'tools/call', {
      arguments: args,
      callerSource: 'codex',
      callId: `pulse-${randomUUID()}`,
      namespace: 'codex_app',
      threadId: this.threadId,
      turnId: this.turnId,
      tool,
    }, {timeout: this.timeout});
    if (result?.success !== true) throw new Error('APP_TOOL_FAILED');
    const text = result.contentItems?.filter(item => item.type === 'inputText').map(item => item.text).join('\n');
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('APP_TOOL_INVALID_JSON');
    }
  }
}
