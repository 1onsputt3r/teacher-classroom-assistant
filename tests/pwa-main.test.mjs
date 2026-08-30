import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('根網址載入 V2 主程式並連結 PWA manifest', async () => {
  const html = await read('index.html');
  assert.match(html, /href="\.\/manifest\.webmanifest"/);
  assert.match(html, /href="\.\/preview-v2\/styles\.css\?v=20260830-pwa-main-1"/);
  assert.match(html, /src="\.\/preview-v2\/app\.js\?v=20260830-pwa-main-1"/);
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
  const worker = await read('sw.js');
  for (const asset of [
    './preview-v2/styles.css?v=20260830-pwa-main-1',
    './preview-v2/app.js?v=20260830-pwa-main-1',
    './preview-v2/core.mjs?v=20260830-pwa-main-1'
  ]) assert.match(worker, new RegExp(asset.replace(/[.?]/g, '\\$&')));
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
