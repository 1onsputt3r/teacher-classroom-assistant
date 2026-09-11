import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  assert.equal((open.match(/data-timer-option=/g) || []).length, 160);
  assert.doesNotMatch(open, /data-timer-value=/); // Reserved for the countdown output.
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
    const rows = Array.from({ length: unit === 'minutes' ? 100 : 60 }, (_, value) => ({
      dataset: { timerOption: String(value) }, textContent: String(value).padStart(2, '0'),
      classList: new Set(value === values[unit] ? ['is-selected'] : []),
      getBoundingClientRect() { return { height: rowHeight }; },
      closest(selector) { return selector === '[data-timer-option]' ? this : null; }
    }));
    for (const row of rows) row.classList.remove = row.classList.delete;
    return {
      dataset: { timerWheel: unit }, listeners, attrs, captured, rows, style: {},
      scrollTop: 0, scrollCalls: [], pendingScroll: null,
      querySelectorAll: () => rows,
      addEventListener(type, fn) { listeners.set(type, fn); },
      removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
      setAttribute(key, value) { attrs.set(key, value); },
      setPointerCapture(id) { captured.add(id); },
      releasePointerCapture(id) { captured.delete(id); },
      hasPointerCapture(id) { return captured.has(id); },
      scrollTo(options) {
        this.scrollCalls.push(options);
        this.pendingScroll = options.behavior === 'smooth' ? options.top : null;
        if (this.pendingScroll === null) this.scrollTop = options.top;
      },
      nativeScroll(top) { this.scrollTop = top; this.fire('scroll'); },
      finishSmooth() { const top = this.pendingScroll; this.pendingScroll = null; this.nativeScroll(top); },
      fire(type, event = {}) { listeners.get(type)?.({ button: 0, isPrimary: true, pointerType: 'mouse', pointerId: 1, preventDefault() {}, ...event }); }
    };
  });
  const controller = bindTimerWheels({ querySelectorAll: () => wheels }, { values, onChange() { changes += 1; } });
  return { values, wheels, controller, get changes() { return changes; } };
}

test('原生滑動只同步中央數值，不重寫數字、不強制捲動或攔截觸控', () => {
  const fixture = wheelFixture();
  const seconds = fixture.wheels[1];
  const originalText = seconds.rows.map((row) => row.textContent);
  seconds.scrollCalls.length = 0;
  seconds.fire('pointerdown', { clientY: 200, pointerType: 'touch' });
  seconds.fire('pointermove', { clientY: 96, pointerType: 'touch' });
  seconds.fire('pointercancel', { pointerType: 'touch' });
  assert.equal(seconds.captured.size, 0);
  assert.equal(seconds.listeners.has('touchmove'), false);
  assert.equal(seconds.listeners.has('wheel'), false);
  seconds.nativeScroll(2.35 * 52);
  assert.equal(fixture.values.seconds, 2);
  assert.equal(seconds.attrs.get('aria-valuenow'), '2');
  assert.equal(seconds.rows[2].classList.has('is-selected'), true);
  seconds.nativeScroll(4 * 52); // Browser inertia/snap settles later.
  assert.deepEqual(fixture.values, { minutes: 1, seconds: 4 });
  assert.equal(seconds.rows[2].classList.has('is-selected'), false);
  assert.equal(seconds.rows[4].classList.has('is-selected'), true);
  assert.deepEqual(seconds.rows.map((row) => row.textContent), originalText);
  assert.equal(seconds.scrollCalls.length, 0);
  fixture.controller.destroy();
});

test('滾輪從原設定位置開始，實際列高與邊界正確，兩欄可分別點選', () => {
  const fixture = wheelFixture({ rowHeight: 104, minutes: 99, seconds: 58 });
  const seconds = fixture.wheels[1];
  assert.equal(seconds.scrollTop, 58 * 104);
  assert.equal(fixture.wheels[0].scrollTop, 99 * 104);
  seconds.nativeScroll(60 * 104); // Clamp overscroll/bounce.
  assert.deepEqual(fixture.values, { minutes: 99, seconds: 59 });
  seconds.nativeScroll(-104);
  assert.equal(fixture.values.seconds, 0);
  fixture.wheels[0].fire('click', { target: fixture.wheels[0].rows[98] });
  assert.deepEqual(fixture.wheels[0].scrollCalls.at(-1), { top: 98 * 104, behavior: 'smooth' });
  fixture.wheels[0].finishSmooth();
  assert.equal(fixture.values.minutes, 98);
  assert.equal(fixture.values.seconds, 0);
  assert.equal(timerWheelValue(-100, 52, 59), 0);
  assert.equal(timerWheelValue(6000, 52, 59), 59);
  fixture.controller.destroy();
});

test('按開始前同步未送達的捲動位置並停止慣性，不用舊的設定值', () => {
  const fixture = wheelFixture({ minutes: 0, seconds: 30 });
  const seconds = fixture.wheels[1];
  seconds.scrollTop = 12.7 * 52; // Scroll event has not reached JS yet.
  assert.equal(fixture.values.seconds, 30);
  fixture.controller.commit();
  assert.equal(fixture.values.seconds, 13);
  assert.equal(seconds.scrollTop, 13 * 52);
  assert.deepEqual(seconds.scrollCalls.at(-1), { top: 13 * 52, behavior: 'instant' });
  seconds.scrollTop = 0;
  fixture.controller.commit();
  assert.equal(timerDurationSeconds(fixture.values.minutes, fixture.values.seconds), null);
  fixture.controller.destroy();
  fixture.controller.commit(); // Detached wheels must not be touched again.
});

test('滑鼠仍可拖動、放開後對齊，拖動後不會額外點選下一個數字', () => {
  const fixture = wheelFixture();
  const seconds = fixture.wheels[1];
  seconds.fire('pointerdown', { clientY: 200 });
  seconds.fire('pointermove', { clientY: 75 });
  assert.equal(seconds.style.scrollSnapType, 'none');
  assert.equal(seconds.scrollTop, 125);
  assert.equal(fixture.values.seconds, 2);
  seconds.fire('pointerup', { clientY: 75 });
  assert.deepEqual(seconds.scrollCalls.at(-1), { top: 104, behavior: 'smooth' });
  assert.equal(seconds.style.scrollSnapType, '');
  assert.equal(seconds.captured.size, 0);
  seconds.fire('click', { target: seconds.rows[3] });
  seconds.finishSmooth();
  assert.equal(fixture.values.seconds, 2);
  fixture.controller.destroy();
});

test('滾輪支援鍵盤並忽略非主要指標，卸載時移除監聽與指標捕捉', () => {
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
  fixture.controller.destroy();
  assert.equal(minutes.captured.size, 0);
  assert.equal(minutes.listeners.size, 0);
  fixture.controller.destroy();
});

test('手機滾輪使用可捲動清單與置中吸附，綠底不跟著捲動', async () => {
  const css = await readFile(new URL('../preview-v2/styles.css', import.meta.url), 'utf8');
  const wheel = css.match(/\.timer-wheel \{([^}]+)\}/)[1];
  assert.match(wheel, /overflow-y: auto/);
  assert.match(wheel, /touch-action: pan-y pinch-zoom/);
  assert.match(wheel, /scroll-snap-type: y mandatory/);
  assert.match(wheel, /overscroll-behavior-y: contain/);
  assert.doesNotMatch(wheel, /touch-action: none|overflow: hidden/);
  assert.match(css, /\.timer-wheel-frame::before/);
  assert.match(css, /\.timer-wheel-track \{[^}]*padding-block: var\(--timer-row-height\)/);
  assert.match(css, /\.timer-wheel-row \{[^}]*scroll-snap-align: center/);
});
