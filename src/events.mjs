import {spawnSync} from 'node:child_process';

export function eventContext(event) {
  if (!event || typeof event !== 'object') return null;
  const notify = event.type === 'agent-turn-complete';
  const stop = event.hook_event_name === 'Stop' && event.stop_hook_active !== true;
  if (!notify && !stop) return null;
  const threadId = notify ? event['thread-id'] : event.session_id;
  const turnId = notify ? event['turn-id'] : event.turn_id;
  if (typeof threadId !== 'string' || !threadId.trim()) return null;
  return {threadId, turnId, trigger: notify ? 'notify' : 'Stop'};
}

export function forwardNotification(command, rawEvent) {
  if (!Array.isArray(command) || command.length === 0) return;
  // Preserve the original notifier's exact argv; never invoke a shell.
  const result = spawnSync(command[0], [...command.slice(1), rawEvent], {
    shell: false, windowsHide: true, stdio: 'ignore', timeout: 5000,
  });
  if (result.error || result.status !== 0) throw new Error('ORIGINAL_NOTIFY_FAILED');
}
