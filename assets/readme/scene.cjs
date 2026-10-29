// Build with fly-ppt: node <skill>/scripts/build.cjs assets/readme/scene.cjs
//   --out work/readme-hero --formats svg,png --renderer browser
// The two SVGs are published as hero.zh-CN.svg and hero.en.svg.
module.exports = ({ draw: d }) => {
  const width = 1600;
  const height = 560;
  const muted = '#6D7065';
  const handwritten = '"Comic Sans MS", "Segoe Print", cursive';
  const chinese = 'KaiTi, STKaiti, "Microsoft YaHei", sans-serif';

  function label(text, x, y, w, h, size, options = {}) {
    return {
      text, x, y, w, h, size, align: 'left',
      font: /[\u3400-\u9fff]/.test(text) ? chinese : handwritten,
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
    return d.path(`M${x + 10} ${y + 3} Q${x + 116} ${y - 1} ${x + 226} ${y + 3}
      Q${x + 239} ${y + 4} ${x + 236} ${y + 18} L${x + 233} ${y + 50}
      Q${x + 133} ${y + 57} ${x + 4} ${y + 52} L${x + 1} ${y + 13} Q${x} ${y + 4} ${x + 10} ${y + 3} Z`, {
      fill: color, width: 0, opacity: 0.84,
    });
  }

  function sidebar(x, after, lang) {
    const y = 170;
    const order = after ? ['B', 'A', 'C'] : ['A', 'B', 'C'];
    let art = d.box({ x, y, w: 270, h: 310, fill: '#FFFCF4', seed: after ? 7 : 4 });
    art += d.path(`M${x + 22} ${y + 66} Q${x + 135} ${y + 69} ${x + 247} ${y + 65}`, {
      width: 1.7, color: '#B8B5A7',
    });
    const labels = [label('Projects', x + 25, y + 16, 220, 38, 26, { color: muted })];
    order.forEach((project, index) => {
      const row = y + 83 + index * 73;
      const active = project === 'B';
      if (active) art += highlight(x + 16, row - 3, after ? '#CFE6D5' : '#F6DE9B');
      art += folder(x + 28, row + 8, active);
      labels.push(label(lang === 'zh-CN' ? `项目 ${project}` : `Project ${project}`,
        x + 85, row, 164, 52, lang === 'zh-CN' ? 32 : 28, { bold: active }));
    });
    return { art, labels };
  }

  function slide(lang) {
    const zh = lang === 'zh-CN';
    const id = zh ? 'hero-zh-cn' : 'hero-en';
    const before = sidebar(820, false, lang);
    const after = sidebar(1210, true, lang);
    const description = zh
      ? '侧边栏排序示意，非客户端截图：在 B 项目完成一轮对话后，项目顺序从 A、B、C 调整为 B、A、C。'
      : 'Sidebar sorting illustration, not a client screenshot: after a turn finishes in project B, the order changes from A, B, C to B, A, C.';
    const background = `<defs><pattern id="paper-dots" width="28" height="28" patternUnits="userSpaceOnUse">`
      + '<circle cx="9" cy="11" r="0.7" fill="#A69C87" opacity="0.15"/></pattern></defs>'
      + `<rect width="${width}" height="${height}" rx="28" fill="#FBF8EF"/>`
      + `<rect width="${width}" height="${height}" rx="28" fill="url(#paper-dots)"/>`;
    let art = `<desc id="description">${d.esc(description)}</desc>`;
    // A broad pencil highlight ties the name to the warm active-project row.
    art += d.path('M86 236 Q330 228 564 234', { color: '#F4D786', width: 16, opacity: 0.66 });
    art += d.path('M91 242 Q339 237 550 241', { color: '#D4B65B', width: 1.3, opacity: 0.45 });
    art += before.art + after.art;
    // The arrow connects B's old row to B's new row, with 20px of clearance.
    art += d.arrow({ from: [1110, 352], to: [1190, 279], bend: 12, width: 3.5, head: 18 });
    // A generic completed-conversation symbol, not a product logo.
    art += d.path('M831 62 Q822 61 823 72 L823 94 Q822 102 831 103 L835 103 L834 115 L848 104 L861 104 Q869 104 869 95 L869 72 Q869 63 861 63 Z', {
      fill: '#E2ECE2', width: 2.6,
    });
    art += d.path('M834 82 L842 90 L856 76', { width: 2.7 });
    // Pulse motif and a small upward accent keep the sketch focused on activity.
    art += d.path('M85 454 L99 454 L108 439 L120 469 L131 451 L144 451', { width: 3.1, color: '#6C866E' });
    art += d.path('M1493 211 L1510 203 M1486 193 L1495 177 M1500 231 L1519 233', {
      color: '#C6A149', width: 3,
    });
    return {
      id,
      title: zh ? 'Codex Pulse — 最近聊的项目，自动排到前面' : 'Codex Pulse — Your latest project, back at the top',
      width, height, background, art,
      labels: [
        label('Codex Pulse', 78, 116, 650, 132, 88, { bold: true, letterSpacing: -3 }),
        label(zh ? '让最近聊的项目\n自动排到前面。' : 'Your latest project,\nback at the top.',
          85, 269, 650, 125, zh ? 42 : 37, { lineHeight: 1.35 }),
        label(zh ? '对话结束触发 · 本地排序' : 'Turn complete · Local sort',
          163, 432, 560, 46, 24, { color: muted }),
        label(zh ? 'B 聊完一轮，自动往前排' : 'A turn in B, then B moves up.',
          893, 62, 620, 56, zh ? 31 : 29),
        label(zh ? '原顺序' : 'Before', 840, 121, 230, 38, 25, { color: muted }),
        label(zh ? '新顺序' : 'After', 1230, 121, 230, 38, 25, { color: muted }),
        ...before.labels,
        ...after.labels,
      ],
      notes: description,
    };
  }

  return {
    title: 'Codex Pulse README headers',
    slides: [slide('zh-CN'), slide('en')],
    sources: [
      'Project behavior: README.md, README.en.md and docs/verification.md in this repository.',
      'Original vector illustration using fly-ppt drawing helpers; no third-party brand icons, screenshots or fonts are embedded.',
    ],
  };
};
