# Install, check, and uninstall

[Back to the README](../README.en.md) · [简体中文](installation.md)

Start by sending the [README installation prompt](../README.en.md#get-started) to your Agent in Codex desktop. These detailed steps support both Agent and manual installation.

## Requirements

- Codex desktop with its local App Tools pipe available. The current implementation has been verified on **Windows**.
- **Node.js 24 or later** for built-in SQLite support.
- **Python 3.11 or later** for the standard-library `tomllib` installer dependency.
- Git to clone the repository.

There are no npm or pip dependencies. You can use the runtimes supplied by Codex.

## Install

Clone into a directory you intend to keep, then open that directory as a project in Codex desktop:

```powershell
git clone https://github.com/flyl1u/CodexPulse.git
cd CodexPulse
```

Run from the project root through a Codex-provided shell that inherits the desktop environment:

```powershell
python scripts/configure.py install
python scripts/configure.py status
```

The installer finds executables through `CODEX_CLI_PATH`, `CODEX_MCP_NODE_PATH`, or PATH. You can also pass `--codex` and `--node`. Executable paths do not replace the desktop pipe and current conversation context required at runtime.

Installation changes the user-level `notify` setting through the Codex configuration API, saves the original notification command and a configuration backup, and checks that unrelated configuration values remain unchanged. The callback starts running once the client loads the updated configuration.

**Keep the checkout at its installed location.** The callback uses absolute paths; uninstall before moving or deleting it.

## Confirm it has run

`status` checks installation configuration. `installed: true` and `effective: true` mean that the callback command is installed and returned as the effective configuration. They do not prove that a turn-completion callback has executed.

Finish a normal conversation turn, then check `runtime/events.jsonl`. `trigger: "notify"` identifies a turn-completion callback; `check` and `apply` identify manual runs. Example successful records:

```jsonl
{"trigger":"notify","status":"sorted","count":3,"writes":1}
{"trigger":"notify","status":"unchanged","count":3,"writes":0}
```

`writes` counts sidebar reorder requests, excluding logs and lock-file writes. A natural callback record confirms automatic triggering; without one, report the **callback as unverified**. See the existing [Windows verification record](verification.md).

## Manual check or reorder

These commands require the desktop-provided `CODEX_APP_TOOLS_PIPE_PATH` and current conversation context:

```powershell
& $env:CODEX_MCP_NODE_PATH --disable-warning=ExperimentalWarning bin/codex-pulse.mjs check
& $env:CODEX_MCP_NODE_PATH --disable-warning=ExperimentalWarning bin/codex-pulse.mjs apply
```

`check` only calculates the order. `apply` updates it when needed and reads the result back for verification. Normal callbacks run quietly; errors go to local logs without interrupting the conversation. If the desktop environment is missing, check from a Codex-provided shell. A successful manual check does not prove automatic triggering.

The installer registers `notify`. The code also parses `Stop` events, but the installer does not register a separate Stop Hook.

## Uninstall

Run from the original installation directory:

```powershell
python scripts/configure.py uninstall
```

Uninstalling restores the previous notification command. It refuses to overwrite a notification setting subsequently changed by another tool. Configuration backups remain in the Git-ignored `runtime/` directory.

## Development checks

```powershell
& $env:CODEX_MCP_NODE_PATH --disable-warning=ExperimentalWarning --test
python -m unittest discover -s tests -p 'test_*.py' -v
```

The installer integration test requires the Codex runtime. It uses a separate temporary data directory and does not modify real user configuration.

The entry point is [`bin/codex-pulse.mjs`](../bin/codex-pulse.mjs). Event handling, read-only activity queries, sorting, client communication, and callback execution live in [`src/`](../src/). See the [implementation plan](plan.md) for details.

`work/`, `runtime/`, databases, logs, credentials, and local snapshots are Git-ignored. Diagnostic logs contain run summaries without conversation text. Do not commit personal project lists, transcripts, or configuration backups.
