#!/usr/bin/env python3
"""Run the actual production migration shell command on isolated POSIX files."""
import hashlib
import json
from pathlib import Path
import re
import shlex
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


def production_command():
    source = (ROOT / "app/DSHRootUpgrader.m").read_text()
    body = source.split("NSString *script = [NSString stringWithFormat:", 1)[1].split(", kPrevMountPoint];", 1)[0]
    return "".join(json.loads(value[1:]) for value in re.findall(r'@"(?:[^"\\]|\\.)*"', body))


class MigrationDataTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="dsh-upgrade-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve()
        self.previous = self.base / "previous"
        self.current = self.base / "current"
        self.defaults = self.base / "defaults"
        for path in (self.previous / "root", self.current, self.defaults):
            path.mkdir(parents=True)
        self.profile = ".dsh/profiles/web/cordis.patch.yml"
        self.samples = {
            self.profile: b"- id: locale\n  config:\n    preference: zh\n# custom model settings\n",
            ".dsh/sessions/project/session/log.jsonl": b'{"version":1,"user":"retained"}\n',
            ".dsh/credentials.json": b'{"test_only":"not-a-real-key"}\n',
            "workspace/project/app.bin": bytes(range(256)),
            ".gitconfig": b"[user]\n  name = Test\n",
        }
        for name, data in self.samples.items():
            path = self.previous / "root" / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        (self.current / ".dsh").mkdir()
        (self.defaults / "home.patch.yml").write_text("new native bridge\n")
        (self.defaults / "cordis.patch.yml").write_text("bundled defaults\n")
        self.original = self.snapshot()

    def snapshot(self):
        return {str(p.relative_to(self.previous)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in self.previous.rglob("*") if p.is_file()}

    def run_command(self, prefix=""):
        command = production_command().replace("%@", shlex.quote(str(self.previous)))
        # Preserve $P/root source paths while rebasing destination-only paths.
        command = re.sub(r"(?<!\$P)/root(?=/|[ ;])", shlex.quote(str(self.current)), command)
        command = command.replace("/usr/local/share/dsh", shlex.quote(str(self.defaults)))
        assert " /root/" not in command and "/usr/local/" not in command
        return subprocess.run(["/bin/sh", "-c", prefix + command], text=True, capture_output=True)

    def test_profile_sessions_credentials_and_workspace_survive_migration(self):
        result = self.run_command()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("MIGRATION-DONE", result.stdout)
        for name, data in self.samples.items():
            self.assertEqual((self.current / name).read_bytes(), data, name)
        self.assertEqual((self.current / ".dsh/cordis.patch.yml").read_text(), "new native bridge\n")
        self.assertEqual(self.snapshot(), self.original)

    def test_missing_profile_patch_gets_current_defaults(self):
        (self.previous / "root" / self.profile).unlink()
        result = self.run_command()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.current / self.profile).read_text(), "bundled defaults\n")

    def test_copy_failure_cannot_report_completion_or_modify_source(self):
        result = self.run_command("cp() { return 17; }; ")
        self.assertEqual(result.returncode, 17)
        self.assertNotIn("MIGRATION-DONE", result.stdout)
        self.assertEqual(self.snapshot(), self.original)


if __name__ == "__main__":
    unittest.main(verbosity=2)
