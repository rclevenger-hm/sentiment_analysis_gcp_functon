import { build } from 'esbuild';
import { rm, mkdir, copyFile } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await build({ entryPoints: ['src/index.js'], outfile: 'dist/index.js', bundle: true, platform: 'node', target: 'node24', format: 'cjs', packages: 'external', logLevel: 'info' });
await rm('artifacts', { recursive: true, force: true });
await mkdir('artifacts/dist', { recursive: true });
for (const path of ['package.json', 'package-lock.json', 'dist/index.js']) await copyFile(path, `artifacts/${path}`);
console.log('Function source artifact ready; Cloud Build installs the locked dependencies.');
