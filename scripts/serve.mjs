import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 4176);
const staticFiles = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/styles.css', 'styles.css'],
  ['/app.js', 'app.js'],
  ['/core.mjs', 'core.mjs'],
  ['/manifest.webmanifest', 'manifest.webmanifest'],
  ['/sw.js', 'sw.js'],
  ['/icon.svg', 'icon.svg'],
  ['/icon-192.png', 'icon-192.png'],
  ['/icon-512.png', 'icon-512.png'],
  ['/icon-maskable-512.png', 'icon-maskable-512.png'],
  ['/apple-touch-icon.png', 'apple-touch-icon.png'],
  ['/og.jpg', 'og.jpg'],
  ['/preview-v2/', 'preview-v2/index.html'],
  ['/preview-v2/index.html', 'preview-v2/index.html'],
  ['/preview-v2/styles.css', 'preview-v2/styles.css'],
  ['/preview-v2/app.js', 'preview-v2/app.js'],
  ['/preview-v2/core.mjs', 'preview-v2/core.mjs']
]);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

createServer((request, response) => {
  let urlPath;
  try { urlPath = decodeURIComponent((request.url || '/').split('?')[0]); }
  catch { response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Bad request'); return; }
  const filename = staticFiles.get(urlPath);
  if (!filename) { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not found'); return; }
  const file = join(root, filename);
  response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  if (request.method === 'HEAD') { response.end(); return; }
  createReadStream(file).on('error', () => { if (!response.headersSent) response.writeHead(404); response.end(); }).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Local preview: http://127.0.0.1:${port}`);
});
