import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { shouldShowBottomNavigation } from '../preview-v2/core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(resolve(here, '../preview-v2/styles.css'), 'utf8');
const appSource = readFileSync(resolve(here, '../preview-v2/app.js'), 'utf8');

test('主頁開啟 modal 時仍保留底部四鍵導覽', () => {
  for (const page of ['today', 'course', 'assignment-hub', 'exam-hub', 'settings']) {
    assert.equal(shouldShowBottomNavigation(page, true), true);
  }
  for (const page of ['homework', 'exam-attendance', 'reminders', 'draw', 'assignment-form', 'exam-form']) {
    assert.equal(shouldShowBottomNavigation(page, true), false);
  }
});

test('modal 高度跟隨動態 viewport 並涵蓋四向安全區', () => {
  const backdropRule = styles.match(/\.modal-backdrop\s*\{[^}]+\}/)?.[0] || '';
  const cardRule = styles.match(/\.modal-card\s*\{[^}]+\}/)?.[0] || '';

  assert.match(backdropRule, /min-height:\s*100svh/);
  assert.match(backdropRule, /height:\s*100dvh/);
  for (const side of ['top', 'right', 'bottom', 'left']) {
    assert.match(backdropRule, new RegExp(`env\\(safe-area-inset-${side}\\)`));
  }
  assert.match(backdropRule, /overflow:\s*hidden/);
  assert.match(cardRule, /max-height:\s*min\(760px,\s*100%\)/);
  assert.match(cardRule, /overflow:\s*auto/);
  assert.match(cardRule, /overscroll-behavior:\s*contain/);
});

test('今日課堂 modal 的自動聚焦不會捲動頁面', () => {
  const protectedSelectors = [
    "row.course ? '[data-action=\"enter-course\"]' : '[data-action=\"show-adjust\"]'",
    "'[data-action=\"adjust-teaching-class\"]'",
    "'[data-action=\"show-adjust\"]'",
    "'[data-action=\"enter-course\"]'",
    "'[data-action=\"confirm-restore-schedule\"]'",
    "'[data-action=\"request-restore-schedule\"]'",
    "restoredSlot?.course ? '[data-action=\"enter-course\"]' : '[data-action=\"show-adjust\"]'"
  ];

  for (const selector of protectedSelectors) {
    assert.ok(
      appSource.includes(`querySelector(${selector})?.focus({ preventScroll: true })`),
      `${selector} 應使用 preventScroll 聚焦`
    );
  }
});
