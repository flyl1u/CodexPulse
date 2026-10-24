"""Integration checks use a disposable Codex home, never the user's config."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import tomllib
import unittest


ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.environ.get("CODEX_CLI_PATH") and os.environ.get("CODEX_MCP_NODE_PATH"),
                     "Bundled Codex and Node runtimes are required")
class InstallerIntegrationTests(unittest.TestCase):
    def test_install_repeat_uninstall_and_external_conflict(self):
        work = ROOT / "work"
        work.mkdir(exist_ok=True)
        directory = Path(tempfile.mkdtemp(prefix="installer-test-", dir=work)).resolve()
        codex_dir = directory / "codex"
        runtime = directory / "runtime"
        codex_dir.mkdir()
        config = codex_dir / "config.toml"
        original = {"notify": ["original-notifier", "turn-ended"], "personality": "pragmatic",
                    "tui": {"notifications": False}}
        config.write_text('notify = ["original-notifier", "turn-ended"]\n'
                          '# Preserve unrelated preferences.\npersonality = "pragmatic"\n'
                          '[tui]\nnotifications = false\n', encoding="utf-8")

        def run(action, success=True):
            result = subprocess.run(
                [os.sys.executable, str(ROOT / "scripts/configure.py"), action,
                 "--codex-dir", str(codex_dir), "--runtime-dir", str(runtime)],
                text=True, encoding="utf-8", capture_output=True, timeout=30,
            )
            self.assertEqual(result.returncode == 0, success, result.stderr)
            return json.loads(result.stdout) if success else result.stderr

        try:
            self.assertTrue(run("install")["installed"])
            first = config.read_bytes()
            metadata = json.loads((runtime / "installation.json").read_text(encoding="utf-8"))
            self.assertEqual(metadata["originalNotify"], original["notify"])
            self.assertFalse(run("install")["changed"])
            self.assertEqual(config.read_bytes(), first)
            self.assertTrue(run("status")["effective"])
            self.assertFalse(run("uninstall")["installed"])
            self.assertEqual(tomllib.loads(config.read_text(encoding="utf-8")), original)
            self.assertFalse(run("status")["installed"])
            run("install")
            changed = config.read_text(encoding="utf-8")
            # Change the top-level notify key through a valid TOML fixture.
            lines = changed.splitlines()
            start = next(i for i, line in enumerate(lines) if line.startswith("notify ="))
            end = start + 1
            while "]" not in lines[end - 1]:
                end += 1
            lines[start:end] = ['notify = ["new-user-notifier"]']
            config.write_text("\n".join(lines) + "\n", encoding="utf-8")
            self.assertIn("NOTIFY_CHANGED_EXTERNALLY", run("uninstall", success=False))
            self.assertEqual(tomllib.loads(config.read_text(encoding="utf-8"))['notify'], ["new-user-notifier"])
        finally:
            self.assertEqual(directory.parent, work.resolve())
            self.assertTrue(directory.name.startswith("installer-test-"))
            # Windows can release watcher/directory handles shortly after server exit.
            for attempt in range(15):
                try:
                    shutil.rmtree(directory)
                    break
                except PermissionError:
                    if attempt == 14:
                        raise
                    time.sleep(0.2)


if __name__ == "__main__":
    unittest.main()
