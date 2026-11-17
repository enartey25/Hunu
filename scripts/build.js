import { execSync } from 'child_process';
import esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';

console.log('[Hunu] 1. Generating professional icons...');
execSync('node scripts/generate-icons.js', { stdio: 'inherit' });

console.log('[Hunu] 2. Building Vite UI bundles (Popup & Side Panel)...');
execSync('npx vite build', { stdio: 'inherit' });

console.log('[Hunu] 3. Bundling standalone content script (IIFE) and background service worker...');

// Bundle Content Script as single self-contained IIFE
esbuild.buildSync({
  entryPoints: [path.resolve('src/content/content-script.ts')],
  outfile: path.resolve('dist/content.js'),
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome110']
});

// The page reader injected on demand into shop pages, where the content script does not run
esbuild.buildSync({
  entryPoints: [path.resolve('src/content/page-extract.ts')],
  outfile: path.resolve('dist/page-extract.js'),
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome110']
});

// Bundle Background Service Worker
esbuild.buildSync({
  entryPoints: [path.resolve('src/background/service-worker.ts')],
  outfile: path.resolve('dist/background.js'),
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['chrome110']
});

// The in-page overlay loads Hind from the extension, so the files need stable names
const fontDir = path.resolve('dist/fonts');
fs.mkdirSync(fontDir, { recursive: true });
for (const weight of ['400', '600', '700']) {
  const file = `hind-latin-${weight}-normal.woff2`;
  fs.copyFileSync(path.resolve('node_modules/@fontsource/hind/files', file), path.join(fontDir, file));
}

console.log('[Hunu] Build completed successfully! Extension is ready in ./dist');

