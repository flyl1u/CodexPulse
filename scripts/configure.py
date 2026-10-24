"""Install the turn-completion callback through Codex's config API; no inference."""
import argparse
import datetime
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import threading
import tomllib


ROOT = Path(__file__).resolve().parents[1]


class ConfigAPI:
    def __init__(self, executable, codex_dir):
        env = os.environ.copy()
        env["CODEX_HOME"] = str(codex_dir)
        self.proc = subprocess.Popen(
            [executable, "app-server", "--stdio"], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding="utf-8", env=env,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        self.responses = queue.Queue()
        self.next_id = 0
        threading.Thread(target=self._read, daemon=True).start()
        try:
            self.call("initialize", {
                "clientInfo": {"name": "codex-pulse-installer", "version": "0.1.0"},
                "capabilities": {"experimentalApi": True},
            })
            self.send({"method": "initialized"})
        except Exception:
            self.close()
            raise

    def _read(self):
        for line in self.proc.stdout:
            try:
                self.responses.put(json.loads(line))
            except json.JSONDecodeError:
                pass
        self.responses.put({"closed": True})

    def send(self, message):
        self.proc.stdin.write(json.dumps(message) + "\n")
        self.proc.stdin.flush()

    def call(self, method, params):
        self.next_id += 1
        request_id = self.next_id
        self.send({"id": request_id, "method": method, "params": params})
        while True:
            response = self.responses.get(timeout=15)
            if response.get("closed"):
                raise RuntimeError("CONFIG_API_CLOSED")
            if response.get("id") != request_id:
                continue
            if "error" in response:
                raise RuntimeError(f"CONFIG_API_ERROR_{response['error'].get('code')}")
            return response["result"]

    def close(self):
        if self.proc.stdin and not self.proc.stdin.closed:
            self.proc.stdin.close()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()


def atomic_json(file, value):
    temporary = file.with_suffix(".pending")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, file)


def configure(args):
    codex_dir = Path(args.codex_dir or os.environ.get("CODEX_HOME", Path.home() / ".codex")).resolve()
    runtime = Path(args.runtime_dir or ROOT / "runtime").resolve()
    metadata_path = runtime / "installation.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8")) if metadata_path.exists() else {}
    executable = args.codex or os.environ.get("CODEX_CLI_PATH") or shutil.which("codex.exe")
    if not executable:
        raise RuntimeError("CODEX_EXECUTABLE_REQUIRED")
    api = ConfigAPI(executable, codex_dir)
    try:
        snapshot = api.call("config/read", {"includeLayers": True, "cwd": str(ROOT)})
        config_path = codex_dir / "config.toml"
        layers = snapshot.get("layers") or []
        layer = next((item for item in layers if item["name"].get("type") == "user"
                      and Path(item["name"].get("file", "")).resolve() == config_path
                      and item["name"].get("profile") is None), None)
        current = (layer or {}).get("config", {}).get("notify") or []
        if args.action == "status":
            return {"installed": bool(metadata.get("enabled") and current == metadata.get("notifyCommand")),
                    "effective": snapshot["config"].get("notify") == metadata.get("notifyCommand"),
                    "trigger": "agent-turn-complete", "runtimeDir": str(runtime)}
        runtime.mkdir(parents=True, exist_ok=True)
        if args.action == "install":
            node = args.node or os.environ.get("CODEX_MCP_NODE_PATH") or shutil.which("node")
            if not node:
                raise RuntimeError("NODE_EXECUTABLE_REQUIRED")
            version = subprocess.check_output([node, "-p", "process.versions.node"], text=True).strip()
            if int(version.split(".")[0]) < 24:
                raise RuntimeError("NODE_24_REQUIRED")
            command = [node, "--disable-warning=ExperimentalWarning", str(ROOT / "bin" / "codex-pulse.mjs"), "notify"]
            if current == command and metadata.get("notifyCommand") == command:
                metadata["enabled"] = True
                atomic_json(metadata_path, metadata)
                return {"installed": True, "changed": False}
            if len(current) >= 3 and any("codex-pulse.mjs" in str(value) for value in current):
                raise RuntimeError("EXISTING_PULSE_INSTALLATION_NEEDS_REVIEW")
            target = command
        else:
            if not metadata or not metadata.get("enabled"):
                return {"installed": False, "changed": False}
            if current != metadata.get("notifyCommand"):
                raise RuntimeError("NOTIFY_CHANGED_EXTERNALLY_REFUSING_TO_OVERWRITE")
            target = metadata.get("originalNotify", [])
        original_bytes = config_path.read_bytes() if config_path.exists() else b""
        before = tomllib.loads(original_bytes.decode("utf-8-sig"))
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup = runtime / f"config-before-{stamp}.toml"
        backup.write_bytes(original_bytes)
        previous_metadata = metadata_path.read_bytes() if metadata_path.exists() else None
        if args.action == "install":
            metadata = {"enabled": True, "codexDir": str(codex_dir), "notifyCommand": target,
                        "originalNotify": current, "configBackup": str(backup), "installedAt": stamp}
            # Persist forwarding details before Codex can start the new callback.
            atomic_json(metadata_path, metadata)
        try:
            api.call("config/value/write", {
                "keyPath": "notify", "value": target, "mergeStrategy": "replace",
                "filePath": str(config_path), "expectedVersion": layer["version"] if layer else None,
            })
        except Exception:
            if args.action == "install":
                if previous_metadata is None:
                    metadata_path.unlink(missing_ok=True)
                else:
                    metadata_path.write_bytes(previous_metadata)
            raise
        after = tomllib.loads(config_path.read_text(encoding="utf-8-sig"))
        if after.get("notify") != target:
            raise RuntimeError("NOTIFY_WRITE_VERIFICATION_FAILED")
        before.pop("notify", None)
        after.pop("notify", None)
        if before != after:
            raise RuntimeError("OTHER_CONFIG_CHANGED_DURING_INSTALL")
        if args.action == "uninstall":
            metadata["enabled"] = False
            atomic_json(metadata_path, metadata)
        return {"installed": args.action == "install", "changed": True, "backup": str(backup)}
    finally:
        api.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["install", "uninstall", "status"])
    parser.add_argument("--node")
    parser.add_argument("--codex")
    parser.add_argument("--codex-dir")
    parser.add_argument("--runtime-dir")
    args = parser.parse_args()
    try:
        print(json.dumps(configure(args), ensure_ascii=False))
    except Exception as error:
        message = str(error)
        safe = message if message and all(character.isupper() or character.isdigit() or character == "_"
                                          for character in message) else "CONFIGURATION_FAILED"
        parser.exit(1, safe + "\n")


if __name__ == "__main__":
    main()
