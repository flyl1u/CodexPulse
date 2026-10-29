# Architecture diagrams

[English SVG](architecture.en.svg) · [English PNG](architecture.en.png) · [中文 SVG](architecture.zh-CN.svg) · [中文 PNG](architecture.zh-CN.png)

The two `.mmd` files are the source of truth. They use the same left-to-right Mermaid layout and service/storage palette as [fly-CodexLimit](https://github.com/flyl1u/fly-CodexLimit#architecture): pale blue processing nodes, mint data/output nodes, and Mermaid's purple event/decision nodes.

The diagram adds the read-only data source to the original completion → check → optional reorder flow. It describes the existing runtime; it does not introduce another watcher or model call.

## Regenerate

Install the export tool only into the ignored `work/` directory. This does not add a runtime dependency to CodexPluse.

```powershell
$env:PUPPETEER_SKIP_DOWNLOAD = '1'
npm install --prefix work/diagram-tools --no-audit --no-fund --save-exact @mermaid-js/mermaid-cli@12.0.0
python scripts/render_diagrams.py --browser 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
```

Use `--browser` to select your installed Chrome or Edge. Omit it if Puppeteer already has a browser available. Rendering uses local Mermaid sources; it does not call an image-generation service. SVG labels are text, rather than HTML `foreignObject` nodes, for portable embedding; PNG exports use a 2× scale.

The script exports both languages as SVG and PNG, then synchronizes only the marked architecture blocks in the Chinese `README.md` and English `README.en.md`. The previous `README.zh-CN.md` remains as a link to the default Chinese README. To update the README code blocks without exporting images:

```powershell
python scripts/render_diagrams.py --sync-only
```
