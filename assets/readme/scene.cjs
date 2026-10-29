// Build with fly-ppt: node <skill>/scripts/build.cjs assets/readme/scene.cjs
//   --out work/readme-hero --formats svg,png --renderer browser
// The two SVGs are published as hero.zh-CN.svg and hero.en.svg.
module.exports = ({ draw: d }) => {
  const width = 1680;
  const height = 640;
  const muted = '#6E7065';
  const handwritten = 'Comic Sans MS, Segoe Print, cursive';
  const sans = 'Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif';

  function label(text, x, y, w, h, size, options = {}) {
    return {
      text, x, y, w, h, size, align: 'left',
      font: /[\u3400-\u9fff]/.test(text) ? sans : handwritten,
      ...options,
    };
  }

  function folder(x, y, active) {
    return `<g transform="translate(${x} ${y})">`
      + d.path('M1 7 Q0 3 5 3 L15 3 L20 9 L35 9 Q39 9 39 13 L37 32 Q37 35 33 35 L5 35 Q1 35 1 31 Z', {
        fill: active ? '#F4D786' : '#F2EBDD', width: 2.3,
      })
      + d.path('M3 14 Q19 12 37 14 M6 31 L32 32', {
        color: '#887C62', width: 1.1, opacity: 0.5,
      }) + '</g>';
  }

  function highlight(x, y, color) {
    return d.path(`M${x + 10} ${y + 3} Q${x + 132} ${y - 1} ${x + 256} ${y + 3}
      Q${x + 269} ${y + 4} ${x + 266} ${y + 18} L${x + 263} ${y + 50}
      Q${x + 149} ${y + 57} ${x + 4} ${y + 52} L${x + 1} ${y + 13} Q${x} ${y + 4} ${x + 10} ${y + 3} Z`, {
      fill: color, width: 0, opacity: 0.84,
    });
  }

  function sidebar(x, after, lang) {
    const y = 200;
    const order = after ? ['B', 'A', 'C'] : ['A', 'B', 'C'];
    let art = d.box({ x, y, w: 300, h: 340, fill: '#FFFFFF', seed: after ? 7 : 4 });
    art += d.path(`M${x + 22} ${y + 66} Q${x + 150} ${y + 69} ${x + 277} ${y + 65}`, {
      width: 1.7, color: '#B8B5A7',
    });
    const labels = [label('Projects', x + 25, y + 16, 220, 38, 26, { color: muted })];
    order.forEach((project, index) => {
      const row = y + 90 + index * 81;
      const active = project === 'B';
      if (active) art += highlight(x + 16, row - 3, after ? '#CFE6D5' : '#F6DE9B');
      art += folder(x + 28, row + 8, active);
      labels.push(label(lang === 'zh-CN' ? `项目 ${project}` : `Project ${project}`,
        x + 85, row, 194, 56, lang === 'zh-CN' ? 32 : 28, { bold: active }));
    });
    return { art, labels };
  }

  function slide(lang) {
    const zh = lang === 'zh-CN';
    const id = zh ? 'hero-zh-cn' : 'hero-en';
    const before = sidebar(710, false, lang);
    const after = sidebar(1220, true, lang);
    const description = zh
      ? '侧边栏排序示意，非客户端截图：在 B 项目完成一轮对话后，项目顺序从 A、B、C 调整为 B、A、C。'
      : 'Sidebar sorting illustration, not a client screenshot: after a turn finishes in project B, the order changes from A, B, C to B, A, C.';
    const background = d.paper({ width, height, color: '#FCFCFA' });
    let art = `<desc id="description">${d.esc(description)}</desc>`;
    // A broad pencil highlight ties the name to the warm active-project row.
    art += d.path('M65 301 Q264 312 545 298', { color: '#F4D786', width: 17, opacity: 0.7 });
    art += d.path('M587 146 Q583 309 588 484', { color: '#C9C5B6', width: 1.4, opacity: 0.65 });
    art += before.art + after.art;
    // The arrow connects B's old row to B's new row, with 20px of clearance.
    art += d.arrow({ from: [1030, 399], to: [1200, 318], bend: 12, width: 3.5, head: 18 });
    // A generic completed-conversation symbol, not a product logo.
    art += '<g transform="translate(-113 30)">';
    art += d.path('M831 62 Q822 61 823 72 L823 94 Q822 102 831 103 L835 103 L834 115 L848 104 L861 104 Q869 104 869 95 L869 72 Q869 63 861 63 Z', {
      fill: '#E2ECE2', width: 2.6,
    });
    art += d.path('M834 82 L842 90 L856 76', { width: 2.7 });
    art += '</g>';
    art += d.path('M1533 241 L1550 233 M1526 223 L1535 207 M1540 261 L1559 263', {
      color: '#C6A149', width: 3,
    });
    return {
      id,
      title: zh ? 'CodexPluse — 最近聊的项目，自动排到前面' : 'CodexPluse — Your latest project, back at the top',
      width, height, background, art,
      labels: [
        label('Codex Desktop', 66, 165, 475, 48, 23, { color: muted }),
        label('CodexPluse', 60, 204, 505, 132, 88, { bold: true, letterSpacing: -3 }),
        label(zh ? '让最近聊的项目，自动靠前。' : 'Your latest project, on top.',
          66, 338, 475, 51, zh ? 34 : 32, { font: sans }),
        label(zh ? '对话结束触发，本地按需重排。' : 'Turn complete. Local sort, as needed.',
          68, 405, 480, 46, zh ? 23 : 22, { font: sans, color: muted }),
        label(zh ? 'B 聊完一轮，自动往前排' : 'A turn in B, then B moves up.',
          780, 92, 810, 56, zh ? 31 : 29),
        label(zh ? '原顺序' : 'Before', 730, 152, 250, 38, 25, { color: muted }),
        label(zh ? '新顺序' : 'After', 1240, 152, 250, 38, 25, { color: muted }),
        ...before.labels,
        ...after.labels,
      ],
      notes: description,
    };
  }

  return {
    title: 'CodexPluse README headers',
    slides: [slide('zh-CN'), slide('en')],
    sources: [
      'Project behavior: README.md, README.en.md and docs/verification.md in this repository.',
      'Typography, left text hierarchy and divider reference: https://github.com/flyl1u/fly-brief/blob/main/assets/readme/hero.zh-CN.svg',
      'Original vector illustration using fly-ppt drawing helpers; no third-party brand icons, screenshots or fonts are embedded.',
    ],
  };
};
