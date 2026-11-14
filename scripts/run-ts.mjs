// Runs one of the TypeScript data scripts (scripts/*.ts) with Node, through Vite's module runner,
// so it can import the app's own code (src/) without a build step or a new package:
//   node scripts/run-ts.mjs scripts/fetch_horizons.ts [--refresh]
import { resolve } from 'node:path';
import { runnerImport } from 'vite';

const script = process.argv[2];
if (!script || !script.endsWith('.ts')) {
  console.error('usage: node scripts/run-ts.mjs scripts/<name>.ts [args]');
  process.exit(1);
}
try {
  await runnerImport(resolve(script), { configFile: false, logLevel: 'error' });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
