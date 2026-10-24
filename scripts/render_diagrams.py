"""Export bilingual Mermaid diagrams and synchronize their README code blocks."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
DIAGRAMS = ROOT / "docs" / "diagrams"
START = "<!-- architecture:start -->"
END = "<!-- architecture:end -->"
LANGUAGES = (("en", "README.md", "Mermaid source"),
             ("zh-CN", "README.zh-CN.md", "Mermaid 源码"))


def sync_readme(language, name, source_label):
    source = (DIAGRAMS / f"architecture.{language}.mmd").read_text(encoding="utf-8").strip()
    prefix = f"docs/diagrams/architecture.{language}"
    block = (f"{START}\n```mermaid\n{source}\n```\n\n"
             f"[SVG]({prefix}.svg) · [PNG]({prefix}.png) · [{source_label}]({prefix}.mmd)\n{END}")
    readme = ROOT / name
    text = readme.read_text(encoding="utf-8")
    if START in text:
        if text.count(START) != 1 or text.count(END) != 1:
            raise ValueError(f"Unexpected architecture markers in {name}")
        pattern = re.escape(START) + r".*?" + re.escape(END)
    else:
        # Migrate the original architecture code block once; preserve all other prose.
        pattern = r"```mermaid\n.*?\n```"
        if len(re.findall(pattern, text, re.S)) != 1:
            raise ValueError(f"Expected one architecture diagram in {name}")
    updated, count = re.subn(pattern, lambda _: block, text, count=1, flags=re.S)
    if count != 1:
        raise ValueError(f"Cannot locate the architecture diagram in {name}")
    if updated != text:
        readme.write_text(updated, encoding="utf-8", newline="\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", default=os.environ.get("CODEX_MCP_NODE_PATH") or shutil.which("node"))
    parser.add_argument("--renderer", type=Path,
                        default=ROOT / "work/diagram-tools/node_modules/@mermaid-js/mermaid-cli/src/cli.js")
    parser.add_argument("--browser", type=Path, help="Existing Chrome/Edge executable for the exporter")
    parser.add_argument("--sync-only", action="store_true", help="Only synchronize the README blocks")
    args = parser.parse_args()
    if not args.sync_only:
        if not args.node or not args.renderer.is_file():
            parser.error("Install @mermaid-js/mermaid-cli@12.0.0 under work/diagram-tools first.")
        work = ROOT / "work"
        work.mkdir(exist_ok=True)
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".json", dir=work,
                                         delete=False) as handle:
            browser_config = Path(handle.name)
            json.dump({"executablePath": str(args.browser.resolve())} if args.browser else {}, handle)
        try:
            for language, _, _ in LANGUAGES:
                for extension in ("svg", "png"):
                    output = DIAGRAMS / f"architecture.{language}.{extension}"
                    subprocess.run([
                        args.node, str(args.renderer.resolve()),
                        "-i", str(DIAGRAMS / f"architecture.{language}.mmd"),
                        "-o", str(output), "-c", str(DIAGRAMS / "mermaid-config.json"),
                        "-p", str(browser_config), "-b", "white", "--size", "2200", "-s", "2",
                    ], check=True, cwd=ROOT, timeout=60)
                    if extension == "svg":
                        svg = ET.parse(output).getroot()
                        _, _, width, height = map(float, svg.attrib["viewBox"].split())
                        if width <= height:
                            raise ValueError(f"Expected landscape output: {output.name}")
                    print(f"Exported {output.relative_to(ROOT)}")
        finally:
            browser_config.unlink(missing_ok=True)
    for language, readme, source_label in LANGUAGES:
        sync_readme(language, readme, source_label)
        print(f"Synchronized {readme}")


if __name__ == "__main__":
    main()
