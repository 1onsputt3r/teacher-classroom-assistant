import test from 'node:test';
import assert from 'node:assert/strict';
import { bindTimerWheels, createCountdown, formatTimerTime, renderCountdownContents, timerDurationSeconds, timerWheelValue } from '../preview-v2/timer.mjs';

test('計時只接受 1 秒到 99 分 59 秒，不接受空白、負數或小數', () => {
  assert.equal(timerDurationSeconds(0, 1), 1);
  assert.equal(timerDurationSeconds(1, 30), 90);
  assert.equal(timerDurationSeconds(99, 59), 5999);
  for (const [minutes, seconds] of [[0, 0], [100, 0], [0, 60], [-1, 0], [1, -1], [0.5, 1], [1, 1.5], ['1', 0], [0, NaN]]) {
    assert.equal(timerDurationSeconds(minutes, seconds), null);
  }
  const timer = createCountdown(() => 1000);
  for (const seconds of [0, -1, 6000, 1.5, NaN, Infinity, null, '30']) assert.equal(timer.start(seconds), false);
  assert.deepEqual(timer.snapshot(), { phase: 'idle', remainingMs: 0 });
});

test('快捷 30 秒與 1 分鐘直接開始，重開只以新截止時間為準', () => {
  let now = 1000;
  const timer = createCountdown(() => now);
  timer.start(30);
  assert.deepEqual(timer.snapshot(), { phase: 'running', remainingMs: 30_000 });
  now += 12_400;
  assert.equal(formatTimerTime(timer.snapshot().remainingMs), '00:18');
  timer.start(60);
  assert.equal(formatTimerTime(timer.snapshot().remainingMs), '01:00');
  now += 59_999;
  assert.equal(formatTimerTime(timer.snapshot().remainingMs), '00:01');
  now += 1;
  assert.deepEqual(timer.snapshot(), { phase: 'done', remainingMs: 0 });
});

test('背景沒有回呼仍依截止時間完成，完成後不會自己再開一輪', () => {
  let now = 0;
  const timer = createCountdown(() => now);
  timer.start(30);
  now = 240_000;
  assert.deepEqual(timer.snapshot(), { phase: 'done', remainingMs: 0 });
  now += 5000;
  assert.deepEqual(timer.resume(), { phase: 'done', remainingMs: 0 });
  assert.deepEqual(timer.pause(), { phase: 'done', remainingMs: 0 });
});

test('暫停保留當下不足一秒的餘數，暫停多久都不扣時間', () => {
  let now = 0;
  const timer = createCountdown(() => now);
  timer.start(30);
  now = 12_345;
  assert.deepEqual(timer.pause(), { phase: 'paused', remainingMs: 17_655 });
  now += 100_000;
  assert.deepEqual(timer.snapshot(), { phase: 'paused', remainingMs: 17_655 });
  timer.resume();
  now += 17_654;
  assert.equal(formatTimerTime(timer.snapshot().remainingMs), '00:01');
  now += 1;
  assert.deepEqual(timer.snapshot(), { phase: 'done', remainingMs: 0 });
});

test('截止後才按暫停不會產生零秒暫停狀態，結束後不能續跑', () => {
  let now = 0;
  const timer = createCountdown(() => now);
  timer.start(1);
  now = 1001;
  assert.equal(timer.pause().phase, 'done');
  timer.stop();
  now += 100_000;
  assert.deepEqual(timer.resume(), { phase: 'idle', remainingMs: 0 });
  timer.start(5999);
  assert.equal(formatTimerTime(timer.snapshot().remainingMs), '99:59');
});

test('自訂滾輪預設收起、明確展開才顯示分秒，零秒不可開始', () => {
  const idle = { phase: 'idle', remainingMs: 0 };
  const closed = renderCountdownContents(idle);
  assert.match(closed, />計時<\/h2>/);
  assert.match(closed, /data-seconds="30">30 秒/);
  assert.match(closed, /data-seconds="60">1 分鐘/);
  assert.match(closed, /aria-expanded="false"/);
  assert.doesNotMatch(closed, /data-timer-wheel=/);
  const open = renderCountdownContents(idle, { customOpen: true, minutes: 0, seconds: 0 });
  assert.match(open, /role="spinbutton" tabindex="0"[^>]*aria-valuemax="99"/);
  assert.match(open, /role="spinbutton" tabindex="0"[^>]*aria-valuemax="59"/);
  assert.match(open, /data-action="timer-start" disabled/);
  assert.doesNotMatch(open, /<input|討論計時/);
  const running = renderCountdownContents({ phase: 'running', remainingMs: 90_000 }, { customOpen: true });
  assert.match(running, />01:30<\/output>/);
  assert.match(running, /data-action="timer-pause"/);
  assert.doesNotMatch(running, /data-timer-wheel=/);
  assert.match(renderCountdownContents({ phase: 'paused', remainingMs: 5000 }), /data-action="timer-resume"/);
  assert.match(renderCountdownContents({ phase: 'done', remainingMs: 0 }), />時間到<\/span>/);
});

function wheelFixture({ rowHeight = 52, minutes = 1, seconds = 0 } = {}) {
  const values = { minutes, seconds };
  let changes = 0;
  const wheels = ['minutes', 'seconds'].map((unit) => {
    const listeners = new Map(), attrs = new Map(), captured = new Set();
    const rows = [-1, 0, 1].map((offset) => ({
      dataset: { timerOffset: String(offset) }, textContent: String(values[unit] + offset),
      getBoundingClientRect() { return { height: rowHeight }; },
      closest(selector) { return selector === '[data-timer-offset]' ? this : null; }
    }));
    const track = { style: {} };
    return {
      dataset: { timerWheel: unit }, listeners, attrs, captured, rows, track,
      querySelector: () => track, querySelectorAll: () => rows,
      addEventListener(type, fn) { listeners.set(type, fn); },
      removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
      setAttribute(key, value) { attrs.set(key, value); },
      setPointerCapture(id) { captured.add(id); },
      releasePointerCapture(id) { captured.delete(id); },
      hasPointerCapture(id) { return captured.has(id); },
      fire(type, event = {}) { listeners.get(type)?.({ button: 0, isPrimary: true, pointerId: 1, preventDefault() {}, ...event }); }
    };
  });
  const release = bindTimerWheels({ querySelectorAll: () => wheels }, { values, onChange() { changes += 1; } });
  return { values, wheels, release, get changes() { return changes; } };
}

test('滾輪可上下拖動，放開後以中央數值為準且抑制滑動帶出的點擊', () => {
  const fixture = wheelFixture();
  const seconds = fixture.wheels[1];
  seconds.fire('pointerdown', { clientY: 200 });
  seconds.fire('pointermove', { clientY: 96 });
  assert.equal(fixture.values.seconds, 2);
  assert.equal(seconds.attrs.get('aria-valuenow'), '2');
  assert.equal(seconds.rows[1].textContent, '02');
  seconds.fire('pointerup', { clientY: 96 });
  seconds.fire('click', { target: seconds.rows[2] });
  assert.equal(fixture.values.seconds, 2);
  assert.equal(seconds.track.style.transform, '');
  assert.equal(seconds.captured.size, 0);
  fixture.release();
});

test('滾輪取實際列高、只改本欄、支援點選及滑鼠滾輪，數值不超界', () => {
  const fixture = wheelFixture({ rowHeight: 104, minutes: 99, seconds: 58 });
  const seconds = fixture.wheels[1];
  seconds.fire('pointerdown', { clientY: 300 });
  seconds.fire('pointermove', { clientY: 196 });
  seconds.fire('pointercancel');
  assert.deepEqual(fixture.values, { minutes: 99, seconds: 59 });
  seconds.fire('wheel', { deltaY: 4000, deltaMode: 0 });
  assert.equal(fixture.values.seconds, 59);
  seconds.fire('wheel', { deltaY: -4000, deltaMode: 0 });
  assert.equal(fixture.values.seconds, 0);
  fixture.wheels[0].fire('click', { target: fixture.wheels[0].rows[0] });
  assert.equal(fixture.values.minutes, 98);
  assert.equal(timerWheelValue(0, 100, 52, 59), 0);
  assert.equal(timerWheelValue(58, -520, 52, 59), 59);
  fixture.release();
});

test('滾輪可用鍵盤並忽略非主要指標，卸載時移除監聽與指標捕捉', () => {
  const fixture = wheelFixture();
  const minutes = fixture.wheels[0];
  minutes.fire('keydown', { key: 'End' });
  assert.equal(fixture.values.minutes, 99);
  minutes.fire('keydown', { key: 'ArrowUp' });
  assert.equal(fixture.values.minutes, 99);
  minutes.fire('keydown', { key: 'PageDown' });
  assert.equal(fixture.values.minutes, 94);
  minutes.fire('keydown', { key: 'Home' });
  assert.equal(fixture.values.minutes, 0);
  minutes.fire('pointerdown', { clientY: 200, isPrimary: false });
  minutes.fire('pointermove', { clientY: 0 });
  assert.equal(fixture.values.minutes, 0);
  minutes.fire('pointerdown', { clientY: 200 });
  minutes.fire('pointermove', { clientY: 100 });
  assert.equal(minutes.captured.size, 1);
  fixture.release();
  assert.equal(minutes.captured.size, 0);
  assert.equal(minutes.listeners.size, 0);
});
