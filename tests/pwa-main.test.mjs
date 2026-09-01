import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('根網址載入 V2 主程式並連結 PWA manifest', async () => {
  const html = await read('index.html');
  const cssToken = html.match(/href="\.\/preview-v2\/styles\.css\?v=([^"]+)"/)?.[1];
  const appToken = html.match(/src="\.\/preview-v2\/app\.js\?v=([^"]+)"/)?.[1];
  assert.match(html, /href="\.\/manifest\.webmanifest"/);
  assert.match(cssToken || '', /^\d{8}-[a-z0-9-]+$/);
  assert.equal(appToken, cssToken);
  assert.doesNotMatch(html, /src="\.\/app\.js"/);
});

test('manifest 從根網址啟動正式資料並具備完整安裝圖示', async () => {
  const manifest = JSON.parse(await read('manifest.webmanifest'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.id, './');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.icons.some((icon) => icon.sizes === '192x192'), true);
  assert.equal(manifest.icons.some((icon) => icon.sizes === '512x512'), true);
  assert.equal(manifest.icons.some((icon) => icon.purpose === 'maskable'), true);
});

test('離線殼預先快取 HTML 實際引用的同版 V2 資產', async () => {
  const rootHtml = await read('index.html');
  const previewHtml = await read('preview-v2/index.html');
  const previewApp = await read('preview-v2/app.js');
  const worker = await read('sw.js');
  const token = rootHtml.match(/href="\.\/preview-v2\/styles\.css\?v=([^"]+)"/)?.[1];
  assert.ok(token);
  assert.match(rootHtml, new RegExp(`src="\\.\\/preview-v2\\/app\\.js\\?v=${token}"`));
  assert.match(previewHtml, new RegExp(`href="\\.\\/styles\\.css\\?v=${token}"`));
  assert.match(previewHtml, new RegExp(`src="\\.\\/app\\.js\\?v=${token}"`));
  assert.match(previewApp, new RegExp(`from '\\.\\/core\\.mjs\\?v=${token}'`));
  for (const asset of [
    `./preview-v2/styles.css?v=${token}`,
    `./preview-v2/app.js?v=${token}`,
    `./preview-v2/core.mjs?v=${token}`
  ]) assert.match(worker, new RegExp(asset.replace(/[.?]/g, '\\$&')));
  assert.match(worker, new RegExp(`pwa-main-${token}`));
  assert.match(worker, /requestUrl\.origin !== self\.location\.origin/);
  assert.match(worker, /response\.ok/);
  assert.doesNotMatch(worker, /from '\.\/core\.mjs'/);
});

test('正式建置不再把舊根版 app、core 與 styles 發布為主程式', async () => {
  const build = await read('scripts/build.mjs');
  assert.match(build, /const previewV2Files = \['index\.html', 'styles\.css', 'app\.js', 'core\.mjs'\]/);
  assert.doesNotMatch(build, /const files = \[[^\n]*'app\.js'/);
  assert.doesNotMatch(build, /const files = \[[^\n]*'styles\.css'/);
});
