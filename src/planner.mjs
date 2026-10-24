const PROJECT_KEY = /^(?:codex|chatgpt):project:(.+)$/;

export const normalizePath = value => String(value || '').replaceAll('\\', '/')
  .replace(/^\/\/\?\/UNC\//i, '//').replace(/^\/\/\?\//, '').replace(/\/+$/, '').toLowerCase();

export function projectLayout(inventory) {
  if (!Array.isArray(inventory.sections)) throw new Error('SIDEBAR_SECTIONS_MISSING');
  return inventory.sections.map(section => [section.sectionId,
    (section.itemKeys || []).filter(key => PROJECT_KEY.test(key))]);
}

export function planOrder(inventory, state, rows) {
  const section = inventory.sections?.find(item => item.sectionId === 'threads');
  if (!section || !Array.isArray(inventory.projects)) throw new Error('SIDEBAR_INVENTORY_INVALID');
  const local = inventory.projects.filter(project => project.projectKind === 'local'
    && (project.hostId || 'local') === 'local');
  const available = new Set(local.map(project => project.projectId));
  const current = (section.itemKeys || []).map(key => key.match(PROJECT_KEY)?.[1])
    .filter(id => available.has(id));
  if (new Set(current).size !== current.length) throw new Error('SIDEBAR_DUPLICATE_PROJECT');
  const aliases = new Map();
  for (const hostMap of Object.values(state['app-server-project-id-by-legacy-project-id-by-host'] || {})) {
    for (const [oldId, newId] of Object.entries(hostMap)) {
      if (available.has(oldId)) aliases.set(newId, oldId);
      if (available.has(newId)) aliases.set(oldId, newId);
    }
  }
  const pathIds = new Map();
  for (const project of local) {
    if (!project.path) continue;
    const key = normalizePath(project.path);
    pathIds.set(key, pathIds.has(key) ? null : project.projectId);
  }
  const assignments = state['thread-project-assignments'] || {};
  const projectless = new Set(state['projectless-thread-ids'] || []);
  const excludedThreads = new Set(projectless);
  const latest = new Map();
  const resolve = id => available.has(id) ? id : aliases.get(id);
  const record = (projectId, timestamp) => {
    const time = Number(timestamp);
    if (available.has(projectId) && Number.isFinite(time) && time >= 0) {
      latest.set(projectId, Math.max(latest.get(projectId) || 0, time));
    }
  };
  for (const row of rows) {
    if (projectless.has(row.id) || String(JSON.stringify(row.source) || '').toLowerCase().includes('subagent')) {
      excludedThreads.add(row.id);
      continue;
    }
    const assignment = assignments[row.id];
    if (assignment?.projectOrigin === 'chatgpt') { excludedThreads.add(row.id); continue; }
    const assignedId = typeof assignment === 'string' ? assignment : assignment?.projectId;
    const projectId = resolve(assignedId || row.project_id) || pathIds.get(normalizePath(row.cwd));
    record(projectId, row.activity_ms);
  }
  const databaseProjects = new Set(latest.keys());
  for (const thread of [...(inventory.threads || []), ...(inventory.pinnedThreads || [])]) {
    if (thread.kind !== 'codex' || (thread.hostId || 'local') !== 'local' || excludedThreads.has(thread.id)) continue;
    // SQLite is the complete local activity source; inventory only fills missing projects.
    const projectId = resolve(thread.projectId);
    if (!databaseProjects.has(projectId)) {
      let time = Number(thread.updatedAt || 0);
      if (time < 1e12) time *= 1000;
      record(projectId, time);
    }
  }
  const projectIds = [...current].sort((a, b) => (latest.get(b) || 0) - (latest.get(a) || 0));
  return {current, projectIds, changed: JSON.stringify(projectIds) !== JSON.stringify(current), count: projectIds.length};
}
