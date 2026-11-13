// Copies CesiumJS's runtime files (web workers, assets, widget CSS, third-party code) into
// public/cesium so Vite serves them in dev and copies them into dist on build. The copy is
// generated and git-ignored; this script runs automatically before `npm run dev` and `build`.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'cesium', 'Build', 'Cesium');
const target = join(root, 'public', 'cesium');

if (!existsSync(source)) {
  console.error(`Cesium build not found at ${source}. Run npm install first.`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
for (const folder of ['Workers', 'ThirdParty', 'Assets', 'Widgets']) {
  cpSync(join(source, folder), join(target, folder), { recursive: true });
}
console.log(`Copied Cesium runtime files to ${target}`);
