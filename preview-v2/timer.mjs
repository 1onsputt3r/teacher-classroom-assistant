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

export function timerWheelValue(startValue, distance, rowHeight, max) {
  return Math.max(0, Math.min(max, startValue + Math.round(-distance / rowHeight)));
}

function wheelMarkup(unit, value, max, label) {
  const rows = [-1, 0, 1].map((offset) => {
    const candidate = value + offset;
    return `<span class="timer-wheel-row${offset === 0 ? ' is-selected' : ''}" data-timer-offset="${offset}" aria-hidden="true">${candidate >= 0 && candidate <= max ? String(candidate).padStart(2, '0') : ''}</span>`;
  }).join('');
  return `<div class="timer-wheel-field"><span id="timer-${unit}-label">${label}</span><div class="timer-wheel" data-timer-wheel="${unit}" role="spinbutton" tabindex="0" aria-labelledby="timer-${unit}-label" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}" aria-valuetext="${value} ${label}"><div class="timer-wheel-track">${rows}</div></div></div>`;
}

export function renderCountdownContents({ phase, remainingMs }, { customOpen = false, minutes = 1, seconds = 0 } = {}) {
  const active = phase === 'running' || phase === 'paused';
  const hint = phase === 'done' ? '時間到' : phase === 'paused' ? '已暫停' : phase === 'running' ? '剩餘時間' : '';
  return `<div class="draw-timer-heading"><h2 id="draw-timer-title">計時</h2><span data-timer-hint>${hint}</span></div>
    ${active ? `<div class="draw-timer-active"><output class="draw-timer-value" role="timer" aria-live="off" aria-label="剩餘時間" data-timer-value>${formatTimerTime(remainingMs)}</output><div class="draw-timer-controls"><button type="button" data-action="timer-${phase === 'paused' ? 'resume' : 'pause'}">${phase === 'paused' ? '繼續' : '暫停'}</button><button type="button" data-action="timer-end">結束</button></div></div>`
    : `<div class="draw-timer-presets"><button type="button" data-action="timer-preset" data-seconds="30">30 秒</button><button type="button" data-action="timer-preset" data-seconds="60">1 分鐘</button><button type="button" data-action="timer-custom" aria-expanded="${customOpen}" aria-controls="draw-timer-custom">自訂</button></div>
    <div id="draw-timer-custom" class="draw-timer-custom" ${customOpen ? '' : 'hidden'}><div class="timer-wheels">${customOpen ? wheelMarkup('minutes', minutes, 99, '分') + wheelMarkup('seconds', seconds, 59, '秒') : ''}</div><div class="draw-timer-custom-actions"><button type="button" data-action="timer-cancel">取消</button><button type="button" class="timer-start" data-action="timer-start" ${timerDurationSeconds(minutes, seconds) == null ? 'disabled' : ''}>開始</button></div></div>`}`;
}

// Three visible rows, without a keyboard or a long list of focus targets.
// Pointer, mouse wheel, and keyboard all commit the same displayed value.
export function bindTimerWheels(panel, { values, onChange }) {
  if (!panel) return () => {};
  const cleanups = [];
  for (const wheel of panel.querySelectorAll('[data-timer-wheel]')) {
    const unit = wheel.dataset.timerWheel;
    const max = unit === 'minutes' ? 99 : 59;
    const label = unit === 'minutes' ? '分' : '秒';
    const track = wheel.querySelector('.timer-wheel-track');
    const rows = [...wheel.querySelectorAll('[data-timer-offset]')];
    let drag = null, ignoreClickUntil = 0, wheelDistance = 0, lastWheelAt = 0;
    const rowHeight = () => rows[1].getBoundingClientRect().height || 52;
    const listen = (type, handler, options) => {
      wheel.addEventListener(type, handler, options);
      cleanups.push(() => wheel.removeEventListener(type, handler, options));
    };
    function select(value) {
      const next = Math.max(0, Math.min(max, Math.round(value)));
      values[unit] = next;
      wheel.setAttribute('aria-valuenow', String(next));
      wheel.setAttribute('aria-valuetext', `${next} ${label}`);
      for (const row of rows) {
        const candidate = next + Number(row.dataset.timerOffset);
        row.textContent = candidate < 0 || candidate > max ? '' : String(candidate).padStart(2, '0');
      }
      onChange();
    }
    function finish(event) {
      if (!drag || drag.id !== event.pointerId) return;
      if (drag.moved) ignoreClickUntil = Date.now() + 250;
      drag = null;
      track.style.transform = '';
      if (wheel.hasPointerCapture(event.pointerId)) wheel.releasePointerCapture(event.pointerId);
    }
    listen('pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      drag = { id: event.pointerId, y: event.clientY, value: values[unit], moved: false };
    });
    listen('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const distance = event.clientY - drag.y;
      if (Math.abs(distance) > 5 && !drag.moved) { drag.moved = true; wheel.setPointerCapture(event.pointerId); }
      if (!drag.moved) return;
      const height = rowHeight();
      const step = Math.round(-distance / height);
      select(timerWheelValue(drag.value, distance, height, max));
      const outside = drag.value + step < 0 || drag.value + step > max;
      track.style.transform = `translateY(${outside ? 0 : distance + step * height}px)`;
    });
    listen('pointerup', finish);
    listen('pointercancel', finish);
    listen('lostpointercapture', finish);
    listen('pointerleave', (event) => { if (drag && !drag.moved) finish(event); });
    listen('click', (event) => {
      if (Date.now() < ignoreClickUntil) return;
      const row = event.target.closest('[data-timer-offset]');
      if (row && row.textContent) select(values[unit] + Number(row.dataset.timerOffset));
    });
    listen('wheel', (event) => {
      event.preventDefault();
      if (Date.now() - lastWheelAt > 180) wheelDistance = 0;
      lastWheelAt = Date.now();
      wheelDistance += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rowHeight() * 3 : 1);
      const steps = Math.trunc(wheelDistance / 40);
      if (steps) { select(values[unit] + steps); wheelDistance -= steps * 40; }
    }, { passive: false });
    listen('keydown', (event) => {
      const steps = { ArrowUp: 1, ArrowDown: -1, PageUp: 5, PageDown: -5 };
      if (Object.hasOwn(steps, event.key)) { event.preventDefault(); select(values[unit] + steps[event.key]); }
      else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); select(event.key === 'Home' ? 0 : max); }
    });
    cleanups.push(() => {
      if (drag && wheel.hasPointerCapture(drag.id)) wheel.releasePointerCapture(drag.id);
      drag = null;
    });
  }
  return () => cleanups.forEach((cleanup) => cleanup());
}
