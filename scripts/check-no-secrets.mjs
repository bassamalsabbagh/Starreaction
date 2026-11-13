// Fails the build if the Gemini API key (or anything shaped like a Google API key) is in the built
// site. Runs after `npm run build` (postbuild). Usage: node scripts/check-no-secrets.mjs [dir]
//
// The key itself is read from GEMINI_API_KEY (as set on Vercel or in the shell), or from
// .env.local / .env when present, so a leaked real key is caught even if Google changes its format.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
// Google API keys: "AIza" and 35 more URL-safe characters.
const KEY_SHAPE = /AIza[0-9A-Za-z_-]{35}/;
// Only text files can carry a key; images, fonts and the like are skipped.
const TEXT_FILE = /\.(?:html|js|mjs|cjs|css|json|map|txt|xml|svg|webmanifest)$/i;

function keyFromEnvFiles() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    const line = readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith('GEMINI_API_KEY='));
    const value = line
      ?.slice(line.indexOf('=') + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (value) return value;
  }
  return '';
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (TEXT_FILE.test(name)) yield path;
  }
}

if (!existsSync(root)) {
  console.error(`check-no-secrets: ${root} does not exist. Build first.`);
  process.exit(1);
}

const key = (process.env.GEMINI_API_KEY ?? '').trim() || keyFromEnvFiles();
const found = [];
let scanned = 0;
for (const path of files(root)) {
  scanned += 1;
  const text = readFileSync(path, 'utf8');
  if (key.length >= 8 && text.includes(key))
    found.push(`${relative(root, path)}: the GEMINI_API_KEY value`);
  else if (KEY_SHAPE.test(text)) found.push(`${relative(root, path)}: a Google API key pattern`);
}

if (found.length > 0) {
  console.error('check-no-secrets: an API key was found in the built site. Do not deploy it.');
  for (const entry of found) console.error(`  ${entry}`);
  process.exit(1);
}
console.log(
  `check-no-secrets: ${scanned} files in ${relative(process.cwd(), root) || '.'} checked, no API key found` +
    (key
      ? ' (including the GEMINI_API_KEY value).'
      : ' (GEMINI_API_KEY not set: checked the key pattern only).'),
);
