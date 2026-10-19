import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const spikePkg = join(root, 'spike/package.json');
const playwrightPkg = join(
  root,
  'spike/node_modules/.pnpm/playwright@1.64.1/node_modules/playwright/package.json',
);
let chromium;
try {
  ({ chromium } = createRequire(spikePkg)('playwright'));
} catch {
  ({ chromium } = createRequire(playwrightPkg)('playwright'));
}

// 布谷鑫声 / 三鸟和鸣
// 三只面性布谷鸟沿上升枝条排列，中间一只张口鸣唱。
const TOKENS = {
  light: {
    bg: '#FFF3E6',
    halo: '#FFE4D3',
    branch: '#1E3A33',
    body: '#E85D3F',
    wing: '#C7462B',
    beak: '#F2AE45',
    eye: '#1E3A33',
    eyeLight: '#FFF3E6',
    leg: '#E85D3F',
  },
  dark: {
    bg: '#173B34',
    halo: '#1D463D',
    branch: '#F5E6CD',
    body: '#F5E6CD',
    wing: '#DFC7A4',
    beak: '#FF8A68',
    eye: '#173B34',
    eyeLight: '#F5E6CD',
    leg: '#DDC3A0',
  },
};

const BIRD_BODY = `M 172 26
  C 208 26 228 48 228 82
  C 228 104 218 116 207 124
  C 211 148 206 176 195 200
  C 183 228 163 246 143 254
  C 123 262 101 264 83 258
  L 4 302
  L 24 244
  C 52 222 62 198 64 174
  C 68 128 68 92 92 66
  C 112 42 140 26 172 26 Z`;

const BIRD_WING = `M 104 128
  C 138 128 172 150 188 188
  C 193 200 187 211 174 213
  C 145 218 116 199 104 170
  C 96 151 95 137 104 128 Z`;

const BEAK_CLOSED = `M 226 66
  C 244 66 258 74 268 84
  C 256 92 240 96 224 92 Z`;

const BEAK_UPPER = `M 223 64
  C 240 58 255 59 264 66
  C 253 74 239 78 222 80 Z`;

const BEAK_LOWER = `M 222 86
  C 236 88 246 95 252 106
  C 238 109 227 101 220 94 Z`;

const MOUTH = `M 221 77
  C 233 80 242 83 247 86
  C 236 88 227 89 221 89 Z`;

function bird({ x, footY, scale, t, open = false }) {
  const dx = x - 140 * scale;
  const dy = footY - 301 * scale;
  const beak = open
    ? `<path d="${MOUTH}" fill="${t.eye}"/>
       <path d="${BEAK_UPPER}" fill="${t.beak}"/>
       <path d="${BEAK_LOWER}" fill="${t.beak}"/>`
    : `<path d="${BEAK_CLOSED}" fill="${t.beak}"/>`;
  return `<g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${scale})">
    <path d="M 130 246 L 130 300" stroke="${t.leg}" stroke-width="13" stroke-linecap="round"/>
    <path d="M 158 248 L 158 300" stroke="${t.leg}" stroke-width="13" stroke-linecap="round"/>
    <ellipse cx="136" cy="301" rx="23" ry="7" fill="${t.leg}"/>
    <ellipse cx="164" cy="301" rx="23" ry="7" fill="${t.leg}"/>
    <path d="${BIRD_BODY}" fill="${t.body}"/>
    <path d="${BIRD_WING}" fill="${t.wing}"/>
    <circle cx="194" cy="74" r="9.5" fill="${t.eye}"/>
    <circle cx="197.2" cy="70.8" r="2.6" fill="${t.eyeLight}"/>
    ${beak}
  </g>`;
}

function svg({ rounded = false, theme = 'light' } = {}) {
  const t = TOKENS[theme];
  const clipId = `clip-${theme}-${rounded ? 'r' : 'f'}`;
  const content = `
  <rect width="1024" height="1024" fill="${t.bg}"/>
  <circle cx="505" cy="512" r="322" fill="${t.halo}"/>
  <path d="M 140 870 Q 515 700 890 312" fill="none" stroke="${t.branch}" stroke-width="21" stroke-linecap="round"/>
  ${bird({ x: 290, footY: 793.3, scale: 0.82, t })}
  ${bird({ x: 500, footY: 656.6, scale: 0.96, t, open: true })}
  ${bird({ x: 760, footY: 439.9, scale: 0.88, t })}`;
  const body = rounded
    ? `<defs><clipPath id="${clipId}"><rect width="1024" height="1024" rx="230"/></clipPath></defs>
       <g clip-path="url(#${clipId})">${content}</g>`
    : content;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024" role="img"><title>布谷鑫声 · 三鸟和鸣</title>${body}</svg>`;
}

async function render() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  const sizes = [1024, 512, 256, 128, 64, 32];

  for (const theme of Object.keys(TOKENS)) {
    await writeFile(join(here, 'src', `icon-${theme}.svg`), svg({ theme }), 'utf8');
    await writeFile(join(here, 'src', `icon-${theme}-rounded.svg`), svg({ theme, rounded: true }), 'utf8');

    for (const size of sizes) {
      const suffix = theme === 'light' ? '' : `-${theme}`;
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(
        `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg({ theme })}`,
        { waitUntil: 'load' },
      );
      await page.screenshot({ path: join(here, 'png', `${size}${suffix}.png`), omitBackground: true });

      await page.setContent(
        `<!doctype html><style>html,body{margin:0;background:transparent}.r{width:${size}px;height:${size}px;border-radius:22.5%;overflow:hidden}svg{display:block;width:${size}px;height:${size}px}</style><div class="r">${svg({ theme })}</div>`,
        { waitUntil: 'load' },
      );
      await page.screenshot({ path: join(here, 'png', `${size}${suffix}-rounded.png`), omitBackground: true });
    }
  }

  await browser.close();
  await writeFragment();
}

function inlineSvg(theme) {
  return svg({ theme })
    .replace(' role="img"', '')
    .replace(/<title>[\s\S]*?<\/title>/, '');
}

function sample(theme, label) {
  return `<div class="app-icon" role="img" aria-label="${label}">${inlineSvg(theme)}</div>`;
}

async function writeFragment() {
  const fragment = `<div id="bgxs-icon-viz">
  <style>
    #bgxs-icon-viz {
      color: var(--foreground);
      font-family: "Noto Sans SC", "PingFang SC", system-ui, -apple-system, sans-serif;
      max-width: 880px;
      margin: 0 auto;
      padding: 6px 0 2px;
    }
    #bgxs-icon-viz .masthead {
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    }
    #bgxs-icon-viz .app-icon {
      border-radius: 22.5%;
      overflow: hidden;
      flex: none;
    }
    #bgxs-icon-viz .app-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    #bgxs-icon-viz .hero-icon {
      width: 88px;
      height: 88px;
      box-shadow: 0 10px 28px color-mix(in srgb, var(--foreground) 15%, transparent);
    }
    #bgxs-icon-viz h1 {
      margin: 0;
    }
    #bgxs-icon-viz .meta {
      display: flex;
      align-items: center;
      gap: 9px;
      flex-wrap: wrap;
      margin-top: 5px;
      color: var(--muted-foreground);
    }
    #bgxs-icon-viz .dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: currentColor;
      opacity: .55;
    }
    #bgxs-icon-viz .section {
      margin-top: 26px;
    }
    #bgxs-icon-viz .section-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 14px;
      color: var(--muted-foreground);
    }
    #bgxs-icon-viz .showcase {
      display: flex;
      gap: 26px;
      flex-wrap: wrap;
    }
    #bgxs-icon-viz .variant {
      flex: 1 1 250px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 11px;
      align-items: flex-start;
    }
    #bgxs-icon-viz .variant .app-icon {
      width: min(100%, 286px);
      aspect-ratio: 1;
      box-shadow: 0 14px 38px color-mix(in srgb, var(--foreground) 13%, transparent);
    }
    #bgxs-icon-viz .label {
      display: flex;
      align-items: baseline;
      gap: 9px;
      flex-wrap: wrap;
    }
    #bgxs-icon-viz .label strong {
      font-weight: 500;
    }
    #bgxs-icon-viz .sizes {
      display: flex;
      align-items: flex-end;
      gap: 24px;
      flex-wrap: wrap;
      padding: 2px 0;
    }
    #bgxs-icon-viz .size {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      color: var(--muted-foreground);
    }
    #bgxs-icon-viz .size .app-icon {
      box-shadow: 0 6px 18px color-mix(in srgb, var(--foreground) 12%, transparent);
    }
    #bgxs-icon-viz .size[data-px="128"] .app-icon { width: 128px; height: 128px; }
    #bgxs-icon-viz .size[data-px="64"] .app-icon { width: 64px; height: 64px; }
    #bgxs-icon-viz .size[data-px="32"] .app-icon { width: 32px; height: 32px; border-radius: 22.5%; }
    #bgxs-icon-viz .swatches {
      display: flex;
      gap: 22px;
      flex-wrap: wrap;
    }
    #bgxs-icon-viz .swatch {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--muted-foreground);
    }
    #bgxs-icon-viz .chip {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--foreground) 16%, transparent);
    }
    #bgxs-icon-viz .hex {
      font-variant-numeric: tabular-nums;
    }
    #bgxs-icon-viz hr {
      border: 0;
      border-top: 1px solid var(--border);
      margin: 26px 0 0;
    }
    @media (max-width: 560px) {
      #bgxs-icon-viz .showcase { gap: 22px; }
      #bgxs-icon-viz .variant { flex-basis: 100%; }
      #bgxs-icon-viz .sizes { gap: 18px; }
    }
  </style>

  <div class="masthead">
    <div class="app-icon hero-icon" aria-hidden="true">${inlineSvg('light')}</div>
    <div>
      <h1>布谷鑫声</h1>
      <div class="meta text-small">
        <span>APP ICON</span>
        <span class="dot"></span>
        <span>面性图标</span>
        <span class="dot"></span>
        <span>三鸟和鸣</span>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-head">
      <span>配色版本</span>
      <span class="text-small">1024 × 1024</span>
    </div>
    <div class="showcase">
      <div class="variant">
        ${sample('light', '布谷鑫声图标，暖米明亮版，三只布谷鸟沿枝条向上和鸣')}
        <div class="label"><strong>暖米明亮</strong><span class="text-small">#FFF3E6</span></div>
      </div>
      <div class="variant">
        ${sample('dark', '布谷鑫声图标，松绿深色版，三只布谷鸟沿枝条向上和鸣')}
        <div class="label"><strong>松绿深色</strong><span class="text-small">#173B34</span></div>
      </div>
    </div>
  </div>

  <hr />

  <div class="section">
    <div class="section-head">
      <span>尺寸可读性</span>
      <span class="text-small">128 / 64 / 32 px</span>
    </div>
    <div class="sizes">
      <div class="size" data-px="128"><div class="app-icon" aria-hidden="true">${inlineSvg('light')}</div><span class="text-small">128</span></div>
      <div class="size" data-px="64"><div class="app-icon" aria-hidden="true">${inlineSvg('light')}</div><span class="text-small">64</span></div>
      <div class="size" data-px="32"><div class="app-icon" aria-hidden="true">${inlineSvg('light')}</div><span class="text-small">32</span></div>
    </div>
  </div>

  <hr />

  <div class="section">
    <div class="section-head">
      <span>明亮版主色</span>
      <span class="text-small">取自界面令牌</span>
    </div>
    <div class="swatches">
      <div class="swatch"><span class="chip" style="background:#E85D3F"></span><span class="text-small">珊瑚 <span class="hex">#E85D3F</span></span></div>
      <div class="swatch"><span class="chip" style="background:#FFF3E6"></span><span class="text-small">暖米 <span class="hex">#FFF3E6</span></span></div>
      <div class="swatch"><span class="chip" style="background:#1E3A33"></span><span class="text-small">松墨 <span class="hex">#1E3A33</span></span></div>
      <div class="swatch"><span class="chip" style="background:#F2AE45"></span><span class="text-small">蜜金 <span class="hex">#F2AE45</span></span></div>
    </div>
  </div>
</div>
`;

  await writeFile(join(here, 'preview-fragment.html'), fragment, 'utf8');
  await writeFile(join(visualDir, 'buguxinsheng-icon.html'), fragment, 'utf8');

  const standalone = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>布谷鑫声 · 图标预览</title>
<style>
  :root {
    --background: #ffffff;
    --foreground: #1f2937;
    --muted-foreground: #6b7280;
    --border: #e5e7eb;
    --font-size-base: 16px;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --background: #0f1215;
      --foreground: #f2f4f5;
      --muted-foreground: #9aa3ad;
      --border: #2a2f36;
      color-scheme: dark;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: clamp(20px, 4vw, 40px);
    background: var(--background);
    color: var(--foreground);
    font-family: "Noto Sans SC", "PingFang SC", system-ui, sans-serif;
  }
  h1 { font-size: clamp(24px, 4vw, 32px); line-height: 1.2; font-weight: 500; }
  .text-small { font-size: 12px; }
</style>
</head>
<body>
${fragment}
</body>
</html>
`;
  await writeFile(join(here, 'preview.html'), standalone, 'utf8');
}

const visualDir =
  process.env.BUGU_VISUAL_DIR ||
  '/Users/jihui/.zcode/v2/visualizations/770296ad09c0cb63d762f493cada937faa23e8a946163be9e1e4197ba1b6fcef';

export { svg, TOKENS };

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await mkdir(join(here, 'src'), { recursive: true });
  await mkdir(join(here, 'png'), { recursive: true });
  await render();
}
