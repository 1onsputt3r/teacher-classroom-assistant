import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const dist = resolve(root, 'dist');
const files = ['index.html', 'manifest.webmanifest', 'sw.js', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'og.jpg'];
const previewV2Files = ['index.html', 'styles.css', 'app.js', 'core.mjs'];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of files) await cp(resolve(root, file), resolve(dist, file));
await mkdir(resolve(dist, 'preview-v2'), { recursive: true });
for (const file of previewV2Files) await cp(resolve(root, 'preview-v2', file), resolve(dist, 'preview-v2', file));
console.log(`Built ${files.length + previewV2Files.length} static assets in dist/, including /preview-v2/`);
