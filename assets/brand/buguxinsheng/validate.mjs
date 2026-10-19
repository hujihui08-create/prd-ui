import { readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sizes = [1024, 512, 256, 128, 64, 32];
const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
}

async function pngSize(path) {
  const buf = await readFile(path);
  if (buf.toString('ascii', 1, 4) !== 'PNG') throw new Error(`not PNG: ${path}`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

for (const theme of ['light', 'dark']) {
  const suffix = theme === 'light' ? '' : '-dark';
  const svg = await readFile(join(here, 'src', `icon-${theme}.svg`), 'utf8');
  check(`SVG ${theme}`, svg.includes('viewBox="0 0 1024 1024"') && svg.includes('<title>'));
  for (const rounded of [false, true]) {
    for (const size of sizes) {
      const name = `${size}${suffix}${rounded ? '-rounded' : ''}.png`;
      const path = join(here, 'png', name);
      try {
        const { width, height } = await pngSize(path);
        check(name, width === size && height === size, `${width}×${height}`);
      } catch (err) {
        check(name, false, err.message);
      }
    }
  }
}

const fragment = await readFile(join(here, 'preview-fragment.html'), 'utf8');
check('fragment root', fragment.includes('id="bgxs-icon-viz"'));
check('fragment is fragment', !/<html|<body|<!doctype/i.test(fragment));
check('fragment literal quotes', !fragment.includes('\\"'));
check('fragment size < 1MB', (await stat(join(here, 'preview-fragment.html'))).size < 1024 * 1024);
check('standalone preview', (await stat(join(here, 'preview.html'))).size > 0);

const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exit(1);
