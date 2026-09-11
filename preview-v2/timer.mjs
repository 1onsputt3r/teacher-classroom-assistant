// Ephemeral classroom tool: no storage, roster, or draw-weight dependencies.
export const MAX_TIMER_SECONDS = 99 * 60 + 59;

export function timerDurationSeconds(minutes, seconds) {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 99
    || !Number.isInteger(seconds) || seconds < 0 || seconds > 59) return null;
  const total = minutes * 60 + seconds;
  return total > 0 ? total : null;
}

export function formatTimerTime(remainingMs) {
  const seconds = Math.ceil(Math.max(0, Number(remainingMs) || 0) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function createCountdown(now = () => Date.now()) {
  let phase = 'idle', remainingMs = 0, deadline = null;
  function snapshot() {
    if (phase === 'running') {
      remainingMs = Math.max(0, deadline - now());
      if (remainingMs === 0) { phase = 'done'; deadline = null; }
    }
    return { phase, remainingMs };
  }
  return {
    snapshot,
    start(seconds) {
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_TIMER_SECONDS) return false;
      remainingMs = seconds * 1000;
      deadline = now() + remainingMs;
      phase = 'running';
      return true;
    },
    pause() { snapshot(); if (phase === 'running') { phase = 'paused'; deadline = null; } return snapshot(); },
    resume() { if (phase === 'paused') { deadline = now() + remainingMs; phase = 'running'; } return snapshot(); },
    stop() { phase = 'idle'; remainingMs = 0; deadline = null; }
  };
}

export function timerWheelValue(scrollTop, rowHeight, max) {
  return Math.max(0, Math.min(max, Math.round(scrollTop / rowHeight)));
}

function wheelMarkup(unit, value, max, label) {
  const rows = Array.from({ length: max + 1 }, (_, candidate) =>
    `<span class="timer-wheel-row${candidate === value ? ' is-selected' : ''}" data-timer-option="${candidate}" aria-hidden="true">${String(candidate).padStart(2, '0')}</span>`
  ).join('');
  return `<div class="timer-wheel-field"><span id="timer-${unit}-label">${label}</span><div class="timer-wheel-frame"><div class="timer-wheel" data-timer-wheel="${unit}" role="spinbutton" tabindex="0" aria-labelledby="timer-${unit}-label" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}" aria-valuetext="${value} ${label}"><div class="timer-wheel-track">${rows}</div></div></div></div>`;
}

export function renderCountdownContents({ phase, remainingMs }, { customOpen = false, minutes = 1, seconds = 0 } = {}) {
  const active = phase === 'running' || phase === 'paused';
  const hint = phase === 'done' ? '時間到' : phase === 'paused' ? '已暫停' : phase === 'running' ? '剩餘時間' : '';
  return `<div class="draw-timer-heading"><h2 id="draw-timer-title">計時</h2><span data-timer-hint>${hint}</span></div>
    ${active ? `<div class="draw-timer-active"><output class="draw-timer-value" role="timer" aria-live="off" aria-label="剩餘時間" data-timer-value>${formatTimerTime(remainingMs)}</output><div class="draw-timer-controls"><button type="button" data-action="timer-${phase === 'paused' ? 'resume' : 'pause'}">${phase === 'paused' ? '繼續' : '暫停'}</button><button type="button" data-action="timer-end">結束</button></div></div>`
    : `<div class="draw-timer-presets"><button type="button" data-action="timer-preset" data-seconds="30">30 秒</button><button type="button" data-action="timer-preset" data-seconds="60">1 分鐘</button><button type="button" data-action="timer-custom" aria-expanded="${customOpen}" aria-controls="draw-timer-custom">自訂</button></div>
    <div id="draw-timer-custom" class="draw-timer-custom" ${customOpen ? '' : 'hidden'}><div class="timer-wheels">${customOpen ? wheelMarkup('minutes', minutes, 99, '分') + wheelMarkup('seconds', seconds, 59, '秒') : ''}</div><div class="draw-timer-custom-actions"><button type="button" data-action="timer-cancel">取消</button><button type="button" class="timer-start" data-action="timer-start" ${timerDurationSeconds(minutes, seconds) == null ? 'disabled' : ''}>開始</button></div></div>`}`;
}

// Touch and trackpad scrolling belong to the browser: native inertia + CSS snap.
// Keep every row mounted so the numbers follow the finger without being replaced.
export function bindTimerWheels(panel, { values, onChange }) {
  const cleanups = [], commits = [];
  const controller = {
    commit() { commits.forEach((commit) => commit()); },
    destroy() { cleanups.splice(0).forEach((cleanup) => cleanup()); commits.length = 0; }
  };
  if (!panel) return controller;
  for (const wheel of panel.querySelectorAll('[data-timer-wheel]')) {
    const unit = wheel.dataset.timerWheel;
    const max = unit === 'minutes' ? 99 : 59;
    const label = unit === 'minutes' ? '分' : '秒';
    const rows = [...wheel.querySelectorAll('[data-timer-option]')];
    let drag = null, ignoreClickUntil = 0;
    const rowHeight = () => rows[0].getBoundingClientRect().height || 52;
    const visibleValue = () => timerWheelValue(wheel.scrollTop, rowHeight(), max);
    const listen = (type, handler, options) => {
      wheel.addEventListener(type, handler, options);
      cleanups.push(() => wheel.removeEventListener(type, handler, options));
    };
    function select(value) {
      const next = Math.max(0, Math.min(max, Math.round(value)));
      if (values[unit] === next) return;
      rows[values[unit]].classList.remove('is-selected');
      rows[next].classList.add('is-selected');
      values[unit] = next;
      wheel.setAttribute('aria-valuenow', String(next));
      wheel.setAttribute('aria-valuetext', `${next} ${label}`);
      onChange();
    }
    function scrollToValue(value, smooth = false) {
      const next = Math.max(0, Math.min(max, Math.round(value)));
      const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const animate = smooth && !reducedMotion;
      wheel.scrollTo({ top: next * rowHeight(), behavior: animate ? 'smooth' : 'instant' });
      if (!animate) select(next);
    }
    function finish(event) {
      if (!drag || drag.id !== event.pointerId) return;
      const moved = drag.moved;
      if (moved) ignoreClickUntil = Date.now() + 250;
      drag = null;
      wheel.style.scrollSnapType = '';
      if (wheel.hasPointerCapture(event.pointerId)) wheel.releasePointerCapture(event.pointerId);
      if (moved) scrollToValue(visibleValue(), true);
    }
    scrollToValue(values[unit]);
    // Read the actual centered row during inertia, without forcing a scroll/snap.
    listen('scroll', () => select(visibleValue()), { passive: true });
    // Before Start, flush any not-yet-delivered scroll event and stop inertia.
    commits.push(() => scrollToValue(visibleValue()));
    listen('pointerdown', (event) => {
      // Only a mouse needs emulated dragging. Never capture/cancel a touch pan.
      if (event.pointerType !== 'mouse' || event.button !== 0 || !event.isPrimary) return;
      ignoreClickUntil = 0;
      drag = { id: event.pointerId, y: event.clientY, top: wheel.scrollTop, moved: false };
    });
    listen('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const distance = event.clientY - drag.y;
      if (Math.abs(distance) > 5 && !drag.moved) {
        drag.moved = true;
        wheel.style.scrollSnapType = 'none';
        wheel.setPointerCapture(event.pointerId);
      }
      if (!drag.moved) return;
      wheel.scrollTop = Math.max(0, Math.min(max * rowHeight(), drag.top - distance));
      select(visibleValue());
    });
    listen('pointerup', finish);
    listen('pointercancel', finish);
    listen('lostpointercapture', finish);
    listen('pointerleave', (event) => { if (drag && !drag.moved) finish(event); });
    listen('click', (event) => {
      if (Date.now() < ignoreClickUntil) return;
      const row = event.target.closest('[data-timer-option]');
      if (row) scrollToValue(Number(row.dataset.timerOption), true);
    });
    listen('keydown', (event) => {
      const steps = { ArrowUp: 1, ArrowDown: -1, PageUp: 5, PageDown: -5 };
      if (Object.hasOwn(steps, event.key)) { event.preventDefault(); scrollToValue(visibleValue() + steps[event.key]); }
      else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); scrollToValue(event.key === 'Home' ? 0 : max); }
    });
    // Re-align after browser text-size/viewport changes using the measured row.
    const resizeObserver = globalThis.ResizeObserver ? new ResizeObserver(() => scrollToValue(values[unit])) : null;
    resizeObserver?.observe(wheel);
    cleanups.push(() => {
      resizeObserver?.disconnect();
      const pointerId = drag?.id;
      drag = null;
      wheel.style.scrollSnapType = '';
      if (pointerId != null && wheel.hasPointerCapture(pointerId)) wheel.releasePointerCapture(pointerId);
    });
  }
  return controller;
}
