"""Compute sidebar project order from read-only local activity and current app inventory."""
import argparse
import json
import sqlite3
from pathlib import Path


def norm(path):
    return str(path or "").replace("\\", "/").rstrip("/").casefold()


def plan(inventory, state, rows):
    projects = inventory["projects"]
    sections = inventory["sections"]
    section = next(s for s in sections if s["sectionId"] == "threads")
    keys = section.get("itemKeys", [])
    prefix = "codex:project:"
    current = [k[len(prefix):] for k in keys if k.startswith(prefix)]
    available = {p["projectId"] for p in projects}
    current = [p for p in current if p in available]
    migration = {}
    for host_map in state.get("app-server-project-id-by-legacy-project-id-by-host", {}).values():
        migration.update({new: old for old, new in host_map.items()})
    assignments = state.get("thread-project-assignments", {})
    projectless = set(state.get("projectless-thread-ids", []))
    paths = {norm(p["path"]): p["projectId"] for p in projects if p.get("path") and p.get("hostId", "local") == "local"}
    latest = {}
    for thread_id, project_id, cwd, updated_ms, source in rows:
        if thread_id in projectless or "subagent" in str(source).lower():
            continue
        assignment = assignments.get(thread_id, {})
        if assignment.get("projectOrigin") == "chatgpt":
            continue
        project = assignment.get("projectId") or migration.get(project_id, project_id)
        if project not in available:
            project = paths.get(norm(cwd))
        if project in available:
            latest[project] = max(latest.get(project, 0), updated_ms or 0)
    for thread in inventory.get("threads", []) + inventory.get("pinnedThreads", []):
        project = thread.get("projectId")
        if project not in available:
            continue
        updated = thread.get("updatedAt") or 0
        if updated < 1_000_000_000_000:
            updated *= 1000
        latest[project] = max(latest.get(project, 0), updated)
    # Stable ties retain the current order; unavailable activity stays at the end.
    ordered = sorted(current, key=lambda project: -latest.get(project, 0))
    return {"projectIds": ordered, "changed": ordered != current, "count": len(ordered)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--codex-dir", default=str(Path.home() / ".codex"))
    parser.add_argument("--inventory", type=Path, required=True)
    args = parser.parse_args()
    codex_dir = Path(args.codex_dir)
    inventory = json.loads(args.inventory.read_text(encoding="utf-8-sig"))
    state = json.loads((codex_dir / ".codex-global-state.json").read_text(encoding="utf-8-sig"))
    db = codex_dir / "state_5.sqlite"
    with sqlite3.connect(db.as_uri() + "?mode=ro", uri=True, timeout=5) as connection:
        connection.execute("PRAGMA query_only=ON")
        rows = connection.execute(
            "SELECT id, project_id, cwd, COALESCE(updated_at_ms, updated_at*1000), source "
            "FROM threads WHERE archived=0"
        ).fetchall()
    print(json.dumps(plan(inventory, state, rows), ensure_ascii=True))


if __name__ == "__main__":
    main()
