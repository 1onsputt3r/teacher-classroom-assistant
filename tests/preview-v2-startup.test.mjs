import test from 'node:test';
import assert from 'node:assert/strict';

function installBrowserStubs(search = '', options = {}) {
  const values = new Map();
  const handlers = {};
  const appListeners = {};
  let reloadCount = 0;
  const app = {
    innerHTML: '',
    addEventListener(type, handler) {
      (appListeners[type] ||= []).push(handler);
      handlers[type] = handler;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  globalThis.localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
  globalThis.document = {
    visibilityState: 'hidden',
    activeElement: null,
    querySelector(selector) { return selector === '#app' ? app : null; },
    addEventListener() {}
  };
  globalThis.window = {
    location: { search, reload() { reloadCount += 1; } },
    scrollY: 0,
    addEventListener(type, handler) { handlers[type] = handler; },
    requestAnimationFrame(callback) { callback(); return 1; },
    setInterval() { return 1; },
    setTimeout,
    clearTimeout,
    matchMedia(query) {
      return {
        matches: Boolean(options.coarsePointer && query === '(pointer: coarse)'),
        media: query,
        addEventListener() {},
        removeEventListener() {}
      };
    },
    scrollTo() {}
  };
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate: null }, configurable: true });
  globalThis.CSS = { escape: (value) => String(value) };
  Object.defineProperties(values, {
    app: { value: app },
    appListeners: { value: appListeners },
    handlers: { value: handlers },
    reloadCount: { get() { return reloadCount; } }
  });
  return values;
}

function actionTarget(action, dataset = {}) {
  return {
    dataset: { action, ...dataset },
    disabled: false,
    closest(selector) { return selector === '[data-action]' ? this : null; },
    hasAttribute() { return false; },
    matches() { return false; }
  };
}

function teachingClassInput(field, value, rowIndex = null) {
  const dataset = { teachingClassField: field };
  if (Number.isInteger(rowIndex)) dataset.teachingClassRowIndex = String(rowIndex);
  return {
    value: String(value),
    dataset,
    closest(selector) { return selector === 'input[data-action="teaching-class-field"]' ? this : null; }
  };
}

function shiftDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day + days, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function changeTarget(action, value) {
  return {
    value,
    dataset: { action },
    closest(selector) { return selector === `[data-action="${action}"]` ? this : null; }
  };
}

function ensureExamCourseSelected(values, courseKey, selected = true) {
  const selectedMarkup = `data-course-key="${courseKey}" aria-pressed="true"`;
  if (values.app.innerHTML.includes(selectedMarkup) !== selected) {
    values.handlers.click({ target: actionTarget('toggle-exam-form-course', { courseKey }) });
  }
}

async function installClonedTestProfile(label, mutate = () => {}) {
  const seeded = installBrowserStubs('?data-profile=test');
  await import(`../preview-v2/app.js?seed-${label}-${Date.now()}`);
  const suffix = '::test::integration-v1';
  seeded.set(`teacher-assistant-preview-v2-data-sync-v1${suffix}`, JSON.stringify({ testDataState: 'custom' }));
  mutate(seeded, suffix);
  const values = installBrowserStubs('?data-profile=test');
  for (const [key, value] of seeded) values.set(key, value);
  await import(`../preview-v2/app.js?clone-${label}-${Date.now()}`);
  return values;
}

function clearTestClassroomCollections(values, suffix) {
  const key = `teacher-assistant-preview-v2-homework-v4${suffix}`;
  const classroom = JSON.parse(values.get(key));
  values.set(key, JSON.stringify({ ...classroom, assignments: {}, exams: {} }));
}

function nextWeekdayDateKey(dateKey, weekday) {
  const date = new Date(`${dateKey}T12:00:00`);
  const offset = (weekday - date.getDay() + 7) % 7 || 7;
  return shiftDateKey(dateKey, offset);
}

function clickAction(values, action, dataset = {}) {
  values.handlers.click({ target: actionTarget(action, dataset) });
}

function openHubClass(values, kind, className = '5', system = 'junior', grade = 'j8') {
  clickAction(values, `open-${kind}-hub`);
  clickAction(values, 'open-record-class', { kind, classKey: JSON.stringify([system, grade, className]) });
}

function openClassRecord(values, kind, recordId, courseKey = 'teaching-class:test-int-v1-j8-805-chem', groupKey = 'junior:j8:理化') {
  clickAction(values, 'open-class-record', { kind, recordId, courseKey, groupKey });
}

function storedClassroom(values) {
  const key = [...values.keys()].find((item) => item.includes('homework-v4'));
  return { key, raw: values.get(key), data: JSON.parse(values.get(key)) };
}

async function installWeeklyDrawProfile(label, mutate = () => {}) {
  let fixture;
  const values = await installClonedTestProfile(`weekly-draw-${label}`, (stored, suffix) => {
    const classroomKey = `teacher-assistant-preview-v2-homework-v4${suffix}`;
    const teachingKey = `teacher-assistant-preview-v2-teaching-classes-v1${suffix}`;
    const scheduleKey = `teacher-assistant-preview-v2-schedule-v2${suffix}`;
    const classroom = JSON.parse(stored.get(classroomKey));
    const teaching = JSON.parse(stored.get(teachingKey));
    const overrides = JSON.parse(stored.get(scheduleKey));
    const today = classroom.meta.referenceDateKey;
    const monday = shiftDateKey(today, -14 - ((new Date(`${today}T12:00:00`).getDay() + 6) % 7));
    const tuesday = shiftDateKey(monday, 1);
    const sunday = shiftDateKey(monday, 6);
    const nextMonday = shiftDateKey(monday, 7);
    const courseKey = 'teaching-class:test-int-v1-j8-805-chem';
    const otherCourseKey = 'teaching-class:test-int-v1-j8-806-chem';
    const course = overrides[`${today}:p2`];
    const otherCourse = { ...course, teachingClassId: 'test-int-v1-j8-806-chem', className: '6', classLabel: '806' };
    for (const classes of Object.values(teaching.byAcademicYear)) {
      for (const record of classes) {
        if ([course.teachingClassId, otherCourse.teachingClassId].includes(record.id)) {
          record.lastSeat = 3;
          record.vacantSeats = [];
        }
      }
    }
    for (const dateKey of [monday, tuesday, sunday, nextMonday]) overrides[`${dateKey}:p2`] = course;
    overrides[`${monday}:p3`] = otherCourse;
    const courseRecord = classroom.courses[courseKey];
    courseRecord.manualDrawWeightsByMonth = Object.fromEntries(
      [...new Set([monday, tuesday, sunday, nextMonday].map((dateKey) => dateKey.slice(0, 7)))].map((month) => [month, { 1: 1 }])
    );
    classroom.drawSessions = {};
    fixture = { monday, tuesday, sunday, nextMonday, courseKey, otherCourseKey, sessionKey: `${monday}:p2:${courseKey}` };
    mutate(classroom, fixture);
    stored.set(classroomKey, JSON.stringify(classroom));
    stored.set(teachingKey, JSON.stringify(teaching));
    stored.set(scheduleKey, JSON.stringify(overrides));
  });
  return { values, ...fixture };
}

function savedDrawSession(history = [], options = {}) {
  return {
    useWeighting: true,
    allowRepeat: false,
    currentSeat: null,
    excludedSeats: [],
    seatsThisRound: [],
    history: history.map((record, index) => ({ id: `fixture-draw-${index}`, time: '09:28', absent: false, ...record })),
    updatedAt: '2026-01-01T09:28:00',
    ...options
  };
}

function openDrawLesson(values, dateKey, slot = 'p2') {
  clickAction(values, 'back-today');
  clickAction(values, 'open-calendar');
  clickAction(values, 'select-calendar-date', { date: dateKey });
  clickAction(values, 'open-course', { slot });
  assert.match(values.app.innerHTML, /data-action="enter-course"/);
  clickAction(values, 'enter-course');
  clickAction(values, 'open-draw');
  assert.match(values.app.innerHTML, /<h1>抽一位同學<\/h1>/);
}

function drawPoolRow(values, seat) {
  const row = values.app.innerHTML.match(new RegExp(`<article\\b[^>]*data-draw-pool-seat="${seat}"[^>]*>[\\s\\S]*?<\\/article>`))?.[0];
  assert.ok(row, `卡池應顯示 ${seat} 號的個別權重`);
  return row;
}

function assertDrawPoolWeight(values, seat, expected) {
  const row = drawPoolRow(values, seat);
  const effectiveWeight = Number(row.match(/data-effective-weight="([^"]+)"/)?.[1]);
  assert.ok(Math.abs(effectiveWeight - expected) < 1e-12, `${seat} 號實際權重應為 ${expected}，得到 ${effectiveWeight}`);
  return row;
}

function withDrawRandom(value, action) {
  const originalRandom = Math.random;
  try {
    Math.random = () => value;
    action();
  } finally {
    Math.random = originalRandom;
  }
}

test('每週抽籤依所選課堂的週一至週日與精確課程統計，切換課堂還原且查看不改寫資料', async () => {
  const fixture = await installWeeklyDrawProfile('week-and-course-scope', (classroom, context) => {
    const { monday, tuesday, sunday, nextMonday, courseKey, otherCourseKey, sessionKey } = context;
    const repeated = (count) => Array.from({ length: count }, () => ({ seat: 1 }));
    classroom.drawSessions = {
      [`${shiftDateKey(monday, -1)}:p1:${courseKey}`]: savedDrawSession(repeated(10)),
      [`${monday}:p1:${courseKey}`]: savedDrawSession([{ seat: 1 }]),
      [`${tuesday}:p1:${courseKey}`]: savedDrawSession([{ seat: 1 }]),
      [`${sunday}:p1:${courseKey}`]: savedDrawSession([{ seat: 1 }]),
      [`${nextMonday}:p1:${courseKey}`]: savedDrawSession(repeated(10)),
      [`${monday}:p1:${otherCourseKey}`]: savedDrawSession(repeated(8)),
      [`${monday}:p1:${courseKey}:other-subject`]: savedDrawSession(repeated(9)),
      [sessionKey]: savedDrawSession([{ seat: 1, absent: true }, { seat: 2 }], {
        currentSeat: 2, excludedSeats: [1], seatsThisRound: [1, 2], allowRepeat: true
      })
    };
  });
  const { values, monday, sunday, nextMonday, sessionKey } = fixture;
  const before = [...values].sort(([left], [right]) => left.localeCompare(right));
  openDrawLesson(values, monday);
  assert.match(values.app.innerHTML, /aria-label="使用額外加權"/);
  clickAction(values, 'open-draw-sheet', { sheet: 'pool' });
  assert.match(assertDrawPoolWeight(values, 1, 0.5), /本週抽中 3 次 → ÷4/);
  assert.match(assertDrawPoolWeight(values, 2, 0.5), /本週抽中 1 次 → ÷2/);

  openDrawLesson(values, sunday);
  clickAction(values, 'open-draw-sheet', { sheet: 'pool' });
  assert.match(assertDrawPoolWeight(values, 1, 0.5), /本週抽中 3 次 → ÷4/);
  openDrawLesson(values, nextMonday);
  clickAction(values, 'open-draw-sheet', { sheet: 'pool' });
  assert.match(assertDrawPoolWeight(values, 1, 2 / 11), /本週抽中 10 次 → ÷11/);
  openDrawLesson(values, monday, 'p3');
  clickAction(values, 'open-draw-sheet', { sheet: 'pool' });
  assert.match(assertDrawPoolWeight(values, 1, 1 / 9), /本週抽中 8 次 → ÷9/);

  openDrawLesson(values, monday);
  assert.match(values.app.innerHTML, /aria-checked="true" aria-label="同一人可再抽中"/);
  clickAction(values, 'open-draw-sheet', { sheet: 'history' });
  assert.match(values.app.innerHTML, /01號<\/span><strong>不在場<\/strong>/);
  assert.match(values.app.innerHTML, /02號<\/span><strong>抽中<\/strong>/);
  assert.equal(storedClassroom(values).data.drawSessions[sessionKey].currentSeat, 2);
  assert.deepEqual([...values].sort(([left], [right]) => left.localeCompare(right)), before);
});

test('關閉額外加權仍使用每週分數，顯示兩位小數但抽樣保留完整精度', async () => {
  const { values, monday, courseKey, sessionKey } = await installWeeklyDrawProfile('fractional-sampling', (classroom, context) => {
    classroom.drawSessions[`${context.monday}:p1:${context.courseKey}`] = savedDrawSession([{ seat: 1 }, { seat: 1 }]);
    classroom.drawSessions[context.sessionKey] = savedDrawSession([], { useWeighting: false, allowRepeat: true });
  });
  const before = storedClassroom(values).data;
  const originalRandom = Math.random;
  openDrawLesson(values, monday);
  assert.match(values.app.innerHTML, /aria-checked="false" aria-label="使用額外加權"/);
  assert.doesNotMatch(values.app.innerHTML, /所有可抽座號機率相同|每人等機率|每位同學等機率/);
  clickAction(values, 'open-draw-sheet', { sheet: 'pool' });
  const row = assertDrawPoolWeight(values, 1, 1 / 3);
  assert.match(row, /本週抽中 2 次 → ÷3/);
  assert.match(row.replace(/<[^>]*>/g, ''), /0\.33/);
  assert.doesNotMatch(row.replace(/<[^>]*>/g, ''), /0\.333/);
  clickAction(values, 'close-draw-sheet');

  withDrawRandom(0.1425, () => clickAction(values, 'draw-one'));
  assert.equal(Math.random, originalRandom);
  assert.equal(storedClassroom(values).data.drawSessions[sessionKey].currentSeat, 1, '1/3 不可先四捨五入為 0.33 再抽樣');
  withDrawRandom(0.2, () => clickAction(values, 'draw-one'));
  assert.equal(storedClassroom(values).data.drawSessions[sessionKey].currentSeat, 2, '關閉額外加權後不可退回等機率抽樣');
  clickAction(values, 'open-draw-sheet', { sheet: 'pool' });
  assert.match(assertDrawPoolWeight(values, 1, 0.25), /本週抽中 3 次 → ÷4/);
  assert.match(assertDrawPoolWeight(values, 2, 0.5), /本週抽中 1 次 → ÷2/);
  clickAction(values, 'toggle-draw-weighting');
  assertDrawPoolWeight(values, 1, 0.5);
  const after = storedClassroom(values).data;
  assert.deepEqual(after.courses[courseKey], before.courses[courseKey]);
  assert.deepEqual(after.reminders, before.reminders);
  assert.deepEqual(after.assignments, before.assignments);
  assert.deepEqual(after.drawSessions[`${monday}:p1:${courseKey}`], before.drawSessions[`${monday}:p1:${courseKey}`]);
});

test('不在場重抽不計入本週次數，本輪不重複且新一輪與重新載入均保留本週紀錄', async () => {
  const { values, monday, tuesday, courseKey, sessionKey } = await installWeeklyDrawProfile('absence-round-and-reload', (classroom, context) => {
    classroom.drawSessions[context.sessionKey] = savedDrawSession([], { useWeighting: false });
  });
  const before = storedClassroom(values).data;
  const otherStorage = [...values].filter(([key]) => !key.includes('homework-v4'));
  openDrawLesson(values, monday);
  withDrawRandom(0, () => clickAction(values, 'draw-one'));
  withDrawRandom(0, () => clickAction(values, 'draw-one'));
  assert.equal(storedClassroom(values).data.drawSessions[sessionKey].currentSeat, 2, '同一節不重複時應排除已抽中的 1 號');
  withDrawRandom(0, () => clickAction(values, 'absent-redraw'));
  let saved = storedClassroom(values).data.drawSessions[sessionKey];
  assert.equal(saved.currentSeat, 3);
  assert.deepEqual(saved.history.map(({ seat, absent }) => [seat, absent]), [[3, false], [2, true], [1, false]]);
  assert.deepEqual(saved.excludedSeats, [2]);
  assert.match(values.app.innerHTML, /data-action="restart-draw-round"/);

  clickAction(values, 'toggle-draw-exclusion', { seat: '2' });
  assert.match(values.app.innerHTML, /data-action="restart-draw-round"/);
  withDrawRandom(0, () => clickAction(values, 'restart-draw-round'));
  saved = storedClassroom(values).data.drawSessions[sessionKey];
  assert.equal(saved.currentSeat, 1);
  assert.deepEqual(saved.seatsThisRound, [1]);
  assert.equal(saved.history.length, 4, '新一輪只清除本輪排除，不得清除本節與本週紀錄');
  clickAction(values, 'toggle-draw-repeat');
  withDrawRandom(0, () => clickAction(values, 'draw-one'));
  saved = storedClassroom(values).data.drawSessions[sessionKey];
  assert.equal(saved.currentSeat, 1);
  assert.deepEqual(saved.seatsThisRound, [1, 1]);
  assert.equal(saved.history.length, 5);
  clickAction(values, 'open-draw-sheet', { sheet: 'pool' });
  assert.match(assertDrawPoolWeight(values, 1, 0.25), /本週抽中 3 次 → ÷4/);
  const absentRow = values.app.innerHTML.match(/<article\b[^>]*data-draw-pool-seat="2"[^>]*>[\s\S]*?<\/article>/)?.[0];
  if (absentRow) assert.doesNotMatch(absentRow, /本週抽中 [1-9]/);

  openDrawLesson(values, tuesday);
  clickAction(values, 'open-draw-sheet', { sheet: 'pool' });
  assert.match(assertDrawPoolWeight(values, 1, 0.5), /本週抽中 3 次 → ÷4/);
  assert.equal(storedClassroom(values).data.drawSessions[`${tuesday}:p2:${courseKey}`], undefined, '查看新課堂不應憑空新增抽籤儲存');
  openDrawLesson(values, monday);
  assert.match(values.app.innerHTML, /aria-checked="true" aria-label="同一人可再抽中"/);
  assert.match(values.app.innerHTML, /aria-checked="false" aria-label="使用額外加權"/);

  const restored = installBrowserStubs('?data-profile=test');
  for (const [key, value] of values) restored.set(key, value);
  await import(`../preview-v2/app.js?weekly-draw-reload-${Date.now()}`);
  openDrawLesson(restored, monday);
  clickAction(restored, 'open-draw-sheet', { sheet: 'pool' });
  assert.match(assertDrawPoolWeight(restored, 1, 0.25), /本週抽中 3 次 → ÷4/);
  const after = storedClassroom(restored).data;
  assert.deepEqual(after.drawSessions[sessionKey], saved);
  assert.deepEqual({ ...after, drawSessions: {} }, { ...before, drawSessions: {} });
  assert.deepEqual([...restored].filter(([key]) => !key.includes('homework-v4')), otherStorage);
});

test('聯動測試資料使用獨立鍵並涵蓋課表、名冊與四類課堂資料', async () => {
  const values = installBrowserStubs('?data-profile=test');
  await import(`../preview-v2/app.js?startup-integration=${Date.now()}`);
  const keys = [...values.keys()].sort();
  assert.equal(keys.length, 5);
  assert.equal(keys.every((key) => key.endsWith('::test::integration-v1')), true);
  const parsed = (fragment) => JSON.parse(values.get(keys.find((key) => key.includes(fragment))));
  const academic = parsed('academic-period');
  const teaching = parsed('teaching-classes');
  const schedules = parsed('managed-schedules');
  const overrides = parsed('schedule-v2');
  const classroom = parsed('homework-v4');
  const yearKey = String(academic.academicYear);
  assert.equal(teaching.byAcademicYear[yearKey].length, 5);
  assert.equal(schedules.version, 2);
  assert.equal(schedules.byAcademicYear[yearKey].times.length, 8);
  assert.equal(schedules.byAcademicYear[yearKey].versions.length, 2);
  assert.equal('times' in schedules.byAcademicYear[yearKey].versions[0], false);
  assert.equal(schedules.byAcademicYear[yearKey].versions.at(-1).slots['1'].p8, 'test-int-v1-s2-a-physics');
  assert.equal(Object.keys(overrides).length, 1);
  assert.equal(Object.keys(overrides)[0].endsWith(':p2'), true);
  assert.equal(Object.keys(classroom.assignments).length, 2);
  assert.equal(Object.keys(classroom.exams).length, 1);
  assert.equal(Object.keys(classroom.exams['test-int-v1-exam-weekly'].targets).length, 2);
  assert.equal(Object.keys(classroom.reminders).length, 5);
  assert.equal(Object.keys(classroom.drawSessions).length, 1);
  assert.equal(classroom.courses['teaching-class:test-int-v1-j8-805-chem'].homeworkWeights['12'], 2);
  assert.equal(classroom.meta.dataProfile, 'integration-v1');
  assert.equal(classroom.meta.schemaVersion, 1);
  assert.match(classroom.meta.referenceDateKey, /^\d{4}-\d{2}-\d{2}$/);
});

test('空白共同頁仍顯示年級與班級，底部新增先選年級科目且取消不寫入資料', async () => {
  const values = await installClonedTestProfile('empty-common-hubs', clearTestClassroomCollections);
  const before = [...values].sort(([left], [right]) => left.localeCompare(right));

  for (const kind of ['assignment', 'exam']) {
    const noun = kind === 'assignment' ? '作業' : '考試';
    clickAction(values, `open-${kind}-hub`);
    assert.match(values.app.innerHTML, /<h1>選擇班級<\/h1>/);
    assert.equal((values.app.innerHTML.match(/data-action="open-record-class"/g) || []).length, 4);
    assert.match(values.app.innerHTML, new RegExp(`0 份${noun}`));
    assert.doesNotMatch(values.app.innerHTML, /請先從本堂課新增|data-action="open-assignment-group"|data-action="open-exam-group"/);
    assert.ok(values.app.innerHTML.indexOf(`data-action="add-common-${kind}"`) > values.app.innerHTML.lastIndexOf('data-action="open-record-class"'));
    clickAction(values, `add-common-${kind}`);
    assert.match(values.app.innerHTML, /role="dialog"/);
    assert.match(values.app.innerHTML, /選擇年級與科目/);
    assert.equal((values.app.innerHTML.match(/data-action="choose-record-create-group"/g) || []).length, 3);
    clickAction(values, 'choose-record-create-group', { kind, groupKey: 'junior:j8:理化' });
    assert.match(values.app.innerHTML, new RegExp(`data-action="save-${kind}"`));
    const toggle = kind === 'assignment' ? 'toggle-form-course' : 'toggle-exam-form-course';
    assert.equal((values.app.innerHTML.match(new RegExp(`data-action="${toggle}"`, 'g')) || []).length, 3);
    assert.doesNotMatch(values.app.innerHTML, /加入其他班級/);
    clickAction(values, `back-${kind}-form`);
    assert.match(values.app.innerHTML, /<h1>選擇班級<\/h1>/);
    assert.doesNotMatch(values.app.innerHTML, /role="dialog"/);
  }
  assert.deepEqual([...values].sort(([left], [right]) => left.localeCompare(right)), before);
});

test('共同頁年級預設展開，可獨立收合並將同一班的多科目合併成一張班級卡', async () => {
  const values = await installClonedTestProfile('class-directory');
  const before = storedClassroom(values).raw;
  clickAction(values, 'open-assignment-hub');
  assert.equal((values.app.innerHTML.match(/data-action="toggle-record-grade"/g) || []).length, 2);
  assert.equal((values.app.innerHTML.match(/aria-expanded="true"/g) || []).length, 2);
  assert.equal((values.app.innerHTML.match(/data-action="open-record-class"/g) || []).length, 4);
  assert.match(values.app.innerHTML, /物理・物理探究/);
  clickAction(values, 'toggle-record-grade', { kind: 'assignment', gradeKey: JSON.stringify(['junior', 'j8']) });
  assert.match(values.app.innerHTML, /aria-expanded="false" aria-controls="assignment-grade-classes-0"/);
  assert.match(values.app.innerHTML, /id="assignment-grade-classes-0" class="record-class-grid" hidden/);
  clickAction(values, 'open-exam-hub');
  assert.match(values.app.innerHTML, /aria-expanded="true" aria-controls="exam-grade-classes-0"/);
  clickAction(values, 'open-assignment-hub');
  assert.match(values.app.innerHTML, /aria-expanded="false" aria-controls="assignment-grade-classes-0"/);
  clickAction(values, 'toggle-record-grade', { kind: 'assignment', gradeKey: JSON.stringify(['junior', 'j8']) });
  assert.match(values.app.innerHTML, /aria-expanded="true" aria-controls="assignment-grade-classes-0"/);
  assert.equal(storedClassroom(values).raw, before);
});

test('班級作業與考試以本班紀錄分區，已處理在上且不受另一班檢查狀態影響', async () => {
  const values = await installClonedTestProfile('class-record-sections', (stored, suffix) => {
    const key = `teacher-assistant-preview-v2-homework-v4${suffix}`;
    const data = JSON.parse(stored.get(key));
    const courseKey = 'teaching-class:test-int-v1-j8-806-chem';
    for (const [collection, id, followups] of [['assignments', 'test-int-v1-assignment-density', 'submissions'], ['exams', 'test-int-v1-exam-weekly', 'makeups']]) {
      const target = data[collection][id].targets[courseKey];
      target.lastCheck = null;
      target.checks = [];
      target[followups] = {};
    }
    data.courses[courseKey].pendingHomework = [];
    data.courses[courseKey].completedHomework = [];
    stored.set(key, JSON.stringify(data));
  });
  for (const [kind, recordId] of [['assignment', 'test-int-v1-assignment-density'], ['exam', 'test-int-v1-exam-weekly']]) {
    openHubClass(values, kind, '6');
    const markup = values.app.innerHTML;
    const checked = markup.indexOf(`id="${kind}-class-section-checked"`);
    const pending = markup.indexOf(`id="${kind}-class-section-pending"`);
    const record = markup.indexOf(`data-record-id="${recordId}"`);
    assert.ok(checked >= 0 && checked < pending && pending < record);
    assert.doesNotMatch(markup.slice(checked, pending), /data-action="open-class-record"/);
    openHubClass(values, kind, '5');
    assert.ok(values.app.innerHTML.indexOf(`data-record-id="${recordId}"`) < values.app.innerHTML.indexOf(`id="${kind}-class-section-pending"`));
  }
});

test('班級作業直接進入資訊並完成指定補交，不更動同座號其他作業或其他班', async () => {
  const values = await installClonedTestProfile('class-submission-isolation');
  const before = storedClassroom(values);
  const assignmentId = 'test-int-v1-assignment-density';
  const courseKey = 'teaching-class:test-int-v1-j8-805-chem';
  const submission = Object.values(before.data.assignments[assignmentId].targets[courseKey].submissions).find((item) => item.seat === 12);
  openHubClass(values, 'assignment');
  openClassRecord(values, 'assignment', assignmentId);
  assert.match(values.app.innerHTML, /班級作業資訊/);
  assert.match(values.app.innerHTML, /aria-label="返回本班作業"/);
  assert.doesNotMatch(values.app.innerHTML, /<h1>選擇班級與時間<\/h1>/);
  clickAction(values, 'request-complete-common-submission', { assignmentId, courseKey, submissionId: submission.id, seat: '12' });
  assert.equal(storedClassroom(values).raw, before.raw);
  clickAction(values, 'confirm-complete-common-submission');
  const after = storedClassroom(values).data;
  assert.equal(after.assignments[assignmentId].targets[courseKey].submissions[submission.id].status, 'completed');
  assert.deepEqual(after.assignments[assignmentId].targets['teaching-class:test-int-v1-j8-806-chem'], before.data.assignments[assignmentId].targets['teaching-class:test-int-v1-j8-806-chem']);
  assert.deepEqual(after.assignments['test-int-v1-assignment-workbook'], before.data.assignments['test-int-v1-assignment-workbook']);
  assert.deepEqual(after.exams, before.data.exams);
  clickAction(values, 'back-assignment-hub');
  assert.match(values.app.innerHTML, /<h1>805班的作業<\/h1>/);
});

test('班級考試直接進入資訊，完成補考只更新該班指定學生', async () => {
  const values = await installClonedTestProfile('class-makeup-isolation', (stored, suffix) => {
    const key = `teacher-assistant-preview-v2-homework-v4${suffix}`;
    const data = JSON.parse(stored.get(key));
    const peer = data.exams['test-int-v1-exam-weekly'].targets['teaching-class:test-int-v1-j8-806-chem'];
    peer.makeups['15'] = { ...peer.makeups['3'], seat: 15 };
    stored.set(key, JSON.stringify(data));
  });
  const before = storedClassroom(values);
  const examId = 'test-int-v1-exam-weekly';
  const courseKey = 'teaching-class:test-int-v1-j8-805-chem';
  openHubClass(values, 'exam');
  openClassRecord(values, 'exam', examId);
  assert.match(values.app.innerHTML, /班級考試資訊/);
  clickAction(values, 'request-complete-common-makeup', { examId, courseKey, seat: '15' });
  assert.equal(storedClassroom(values).raw, before.raw);
  clickAction(values, 'confirm-complete-common-makeup');
  const after = storedClassroom(values).data;
  assert.equal(after.exams[examId].targets[courseKey].makeups['15'].status, 'completed');
  assert.deepEqual(after.exams[examId].targets['teaching-class:test-int-v1-j8-806-chem'], before.data.exams[examId].targets['teaching-class:test-int-v1-j8-806-chem']);
  assert.deepEqual(after.assignments, before.data.assignments);
  clickAction(values, 'back-exam-hub');
  assert.match(values.app.innerHTML, /<h1>805班的考試<\/h1>/);
});

test('共同頁新增經分類選擇後直到儲存才寫入，儲存直接回新增項目的班級資訊', async () => {
  const values = await installClonedTestProfile('root-create-save', clearTestClassroomCollections);
  for (const kind of ['assignment', 'exam']) {
    const before = storedClassroom(values);
    clickAction(values, `open-${kind}-hub`);
    clickAction(values, `add-common-${kind}`);
    clickAction(values, 'choose-record-create-group', { kind, groupKey: 'junior:j8:理化' });
    values.handlers.input({ target: changeTarget(`${kind}-title`, `測試新增${kind}`) });
    if (kind === 'exam') clickAction(values, 'apply-exam-batch-time', { mode: 'next' });
    assert.equal(storedClassroom(values).raw, before.raw);
    clickAction(values, `save-${kind}`);
    const collection = kind === 'assignment' ? 'assignments' : 'exams';
    const records = Object.values(storedClassroom(values).data[collection]);
    assert.equal(records.length, 1);
    assert.equal(records[0].title, `測試新增${kind}`);
    assert.match(values.app.innerHTML, new RegExp(kind === 'assignment' ? '班級作業資訊' : '班級考試資訊'));
    assert.match(values.app.innerHTML, new RegExp(`測試新增${kind}`));
    clickAction(values, `back-${kind}-hub`);
    assert.match(values.app.innerHTML, /data-action="open-class-record"/);
  }
});

test('班級新增自動選本班，若同班教多科則只詢問科目並保留本班選擇', async () => {
  const values = await installClonedTestProfile('class-create-subjects', clearTestClassroomCollections);
  const before = storedClassroom(values).raw;
  for (const kind of ['assignment', 'exam']) {
    openHubClass(values, kind);
    clickAction(values, `add-common-${kind}`);
    assert.match(values.app.innerHTML, /data-course-key="teaching-class:test-int-v1-j8-805-chem" aria-pressed="true"/);
    assert.doesNotMatch(values.app.innerHTML, /data-action="choose-record-create-group"/);
    clickAction(values, `back-${kind}-form`);
    assert.match(values.app.innerHTML, new RegExp(`<h1>805班的${kind === 'assignment' ? '作業' : '考試'}<\/h1>`));
    openHubClass(values, kind, '甲', 'senior', 's2');
    clickAction(values, `add-common-${kind}`);
    assert.match(values.app.innerHTML, /選擇科目/);
    assert.equal((values.app.innerHTML.match(/data-action="choose-record-create-group"/g) || []).length, 2);
    assert.doesNotMatch(values.app.innerHTML, /data-group-key="junior:j8:理化"/);
    clickAction(values, 'choose-record-create-group', { kind, groupKey: 'senior:s2:物理探究' });
    assert.match(values.app.innerHTML, /data-course-key="teaching-class:test-int-v1-s2-a-inquiry" aria-pressed="true"/);
    clickAction(values, `back-${kind}-form`);
    assert.doesNotMatch(values.app.innerHTML, /data-action="save-assignment"|data-action="save-exam"|role="dialog"/);
  }
  assert.equal(storedClassroom(values).raw, before);
});

test('跨班共用設定可往返其他班資訊與修改表單，最後返回原班作業或考試', async () => {
  const values = await installClonedTestProfile('shared-overview-return');
  const before = storedClassroom(values).raw;
  for (const [kind, id] of [['assignment', 'test-int-v1-assignment-density'], ['exam', 'test-int-v1-exam-weekly']]) {
    openHubClass(values, kind);
    openClassRecord(values, kind, id);
    clickAction(values, 'open-record-shared-overview', { kind });
    assert.match(values.app.innerHTML, /<h1>選擇班級與時間<\/h1>/);
    clickAction(values, `open-common-${kind}-class`, { courseKey: 'teaching-class:test-int-v1-j8-806-chem' });
    assert.match(values.app.innerHTML, /<dd>806班<\/dd>/);
    clickAction(values, `back-${kind}-hub`);
    assert.match(values.app.innerHTML, /<h1>選擇班級與時間<\/h1>/);
    clickAction(values, `edit-common-${kind}`);
    assert.match(values.app.innerHTML, new RegExp(`data-action="save-${kind}"`));
    clickAction(values, `back-${kind}-form`);
    assert.match(values.app.innerHTML, /<h1>選擇班級與時間<\/h1>/);
    clickAction(values, `back-${kind}-hub`);
    assert.match(values.app.innerHTML, /<dd>805班<\/dd>/);
    clickAction(values, `start-common-${kind}-check`);
    assert.match(values.app.innerHTML, /class="seat-grid"/);
    clickAction(values, kind === 'assignment' ? 'back-course' : 'back-exam-attendance');
    assert.match(values.app.innerHTML, /<dd>805班<\/dd>/);
  }
  assert.equal(storedClassroom(values).raw, before);
});

test('本堂課的共同頁入口直接顯示本班清單，返回恢復原課堂', async () => {
  const values = await installClonedTestProfile('course-entry-return');
  clickAction(values, 'open-course', { slot: 'p2' });
  clickAction(values, 'enter-course');
  for (const kind of ['assignment', 'exam']) {
    clickAction(values, `open-course-${kind}-hub`);
    assert.match(values.app.innerHTML, new RegExp(`<h1>805班的${kind === 'assignment' ? '作業' : '考試'}<\/h1>`));
    assert.match(values.app.innerHTML, /aria-label="返回本堂課"/);
    clickAction(values, `back-${kind}-hub`);
    assert.match(values.app.innerHTML, new RegExp(`data-action="add-${kind}"`));
    assert.match(values.app.innerHTML, /<h1>805班 <span>理化<\/span><\/h1>/);
    assert.doesNotMatch(values.app.innerHTML, /data-action="open-record-class"|data-action="open-class-record"/);
  }
});

test('共通分類沒有可用課表時仍開啟表單並顯示明確排程驗證', async () => {
  const values = await installClonedTestProfile('common-hub-no-schedule', (stored, suffix) => {
    clearTestClassroomCollections(stored, suffix);
    const key = `teacher-assistant-preview-v2-managed-schedules-v1${suffix}`;
    const schedules = JSON.parse(stored.get(key));
    for (const year of Object.values(schedules.byAcademicYear)) year.versions = [];
    stored.set(key, JSON.stringify(schedules));
    stored.set(`teacher-assistant-preview-v2-schedule-v2${suffix}`, JSON.stringify({}));
  });

  values.handlers.click({ target: actionTarget('open-assignment-hub') });
  values.handlers.click({ target: actionTarget('open-assignment-group', { groupKey: 'junior:j8:理化' }) });
  values.handlers.click({ target: actionTarget('add-common-assignment') });
  assert.match(values.app.innerHTML, /新增作業/);
  assert.match(values.app.innerHTML, /找不到下一堂課/);

  values.handlers.click({ target: actionTarget('back-assignment-form') });
  values.handlers.click({ target: actionTarget('open-exam-hub') });
  values.handlers.click({ target: actionTarget('open-exam-group', { groupKey: 'junior:j8:理化' }) });
  values.handlers.click({ target: actionTarget('add-common-exam') });
  assert.match(values.app.innerHTML, /新增考試/);
  assert.match(values.app.innerHTML, /尚未設定考試時間/);
});

test('修改作業選完日期即批次更新各班，日期保留且儲存前不寫入本機資料', async () => {
  const values = installBrowserStubs('?data-profile=test');
  await import(`../preview-v2/app.js?assignment-date-auto-${Date.now()}`);
  const homeworkKey = [...values.keys()].find((key) => key.includes('homework-v4'));
  const beforeRaw = values.get(homeworkKey);
  const before = JSON.parse(beforeRaw);
  const todayKey = before.meta.referenceDateKey;
  const mondayKey = nextWeekdayDateKey(todayKey, 1);

  values.handlers.click({ target: actionTarget('open-assignment-hub') });
  values.handlers.click({ target: actionTarget('open-assignment-group', { groupKey: 'junior:j8:理化' }) });
  values.handlers.click({ target: actionTarget('open-common-assignment', { assignmentId: 'test-int-v1-assignment-density' }) });
  values.handlers.click({ target: actionTarget('edit-common-assignment') });
  values.handlers.click({ target: actionTarget('set-schedule-mode', { mode: 'date' }) });
  assert.doesNotMatch(values.app.innerHTML, /apply-assignment-batch-date|套用日期/);
  assert.match(values.app.innerHTML, /data-action="assignment-date"[^>]*value=""/);
  await values.handlers.change({ target: changeTarget('assignment-date', mondayKey) });
  assert.match(values.app.innerHTML, new RegExp(`data-action="assignment-date"[^>]*value="${mondayKey}"`));
  const formatted = `${Number(mondayKey.slice(5, 7))}/${Number(mondayKey.slice(8, 10))}`;
  assert.match(values.app.innerHTML, new RegExp(`${formatted}・第 1 節`));
  assert.match(values.app.innerHTML, new RegExp(`${formatted}・第 3 節`));
  assert.equal(values.get(homeworkKey), beforeRaw);

  values.handlers.click({ target: actionTarget('save-assignment') });
  const after = JSON.parse(values.get(homeworkKey));
  const assignment = after.assignments['test-int-v1-assignment-density'];
  assert.deepEqual(Object.values(assignment.targets).map((target) => target.due.dateKey), [mondayKey, mondayKey]);
  assert.deepEqual(assignment.targets['teaching-class:test-int-v1-j8-805-chem'].checks, before.assignments['test-int-v1-assignment-density'].targets['teaching-class:test-int-v1-j8-805-chem'].checks);
  assert.deepEqual(assignment.targets['teaching-class:test-int-v1-j8-805-chem'].submissions, before.assignments['test-int-v1-assignment-density'].targets['teaching-class:test-int-v1-j8-805-chem'].submissions);
});

test('取消日期批次覆蓋會還原空白日期，避免畫面日期與逐班草稿不一致', async () => {
  const values = installBrowserStubs('?data-profile=test');
  await import(`../preview-v2/app.js?assignment-date-cancel-${Date.now()}`);
  const homeworkKey = [...values.keys()].find((key) => key.includes('homework-v4'));
  const beforeRaw = values.get(homeworkKey);
  const classroom = JSON.parse(beforeRaw);
  const mondayKey = nextWeekdayDateKey(classroom.meta.referenceDateKey, 1);
  const courseKey = 'teaching-class:test-int-v1-j8-805-chem';

  values.handlers.click({ target: actionTarget('open-assignment-hub') });
  values.handlers.click({ target: actionTarget('open-assignment-group', { groupKey: 'junior:j8:理化' }) });
  values.handlers.click({ target: actionTarget('open-common-assignment', { assignmentId: 'test-int-v1-assignment-density' }) });
  values.handlers.click({ target: actionTarget('edit-common-assignment') });
  values.handlers.click({ target: actionTarget('open-single-assignment-time', { courseKey }) });
  values.handlers.click({ target: actionTarget('apply-single-assignment-time', { mode: 'next-week' }) });
  values.handlers.click({ target: actionTarget('set-schedule-mode', { mode: 'date' }) });
  await values.handlers.change({ target: changeTarget('assignment-date', mondayKey) });
  assert.match(values.app.innerHTML, /覆蓋個別修改/);
  values.handlers.click({ target: actionTarget('close-assignment-batch-confirm') });

  assert.doesNotMatch(values.app.innerHTML, /覆蓋個別修改/);
  assert.match(values.app.innerHTML, /data-action="assignment-date"[^>]*value=""/);
  assert.equal(values.get(homeworkKey), beforeRaw);
});

test('行動裝置日期選擇器關閉前只暫存選擇，不會提早重畫並關閉原生面板', async () => {
  const values = installBrowserStubs('?data-profile=test', { coarsePointer: true });
  await import(`../preview-v2/app.js?mobile-date-confirm-${Date.now()}`);
  const classroom = JSON.parse(values.get([...values.keys()].find((key) => key.includes('homework-v4'))));
  const mondayKey = nextWeekdayDateKey(classroom.meta.referenceDateKey, 1);

  values.handlers.click({ target: actionTarget('open-assignment-hub') });
  values.handlers.click({ target: actionTarget('open-assignment-group', { groupKey: 'junior:j8:理化' }) });
  values.handlers.click({ target: actionTarget('add-common-assignment') });
  values.handlers.click({ target: actionTarget('set-schedule-mode', { mode: 'date' }) });
  const input = changeTarget('assignment-date', mondayKey);
  const beforeChange = values.app.innerHTML;

  await values.handlers.change({ target: input });
  assert.equal(values.app.innerHTML, beforeChange);
  assert.match(values.app.innerHTML, /data-action="assignment-date"[^>]*value=""/);

  values.handlers.focusout({ target: input });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.match(values.app.innerHTML, new RegExp(`data-action="assignment-date"[^>]*value="${mondayKey}"`));
});

test('行動裝置選完作業日期直接按儲存時，仍會先要求確認覆蓋個別時間', async () => {
  const values = installBrowserStubs('?data-profile=test', { coarsePointer: true });
  await import(`../preview-v2/app.js?mobile-date-save-confirm-${Date.now()}`);
  const homeworkKey = [...values.keys()].find((key) => key.includes('homework-v4'));
  const beforeRaw = values.get(homeworkKey);
  const classroom = JSON.parse(beforeRaw);
  const mondayKey = nextWeekdayDateKey(classroom.meta.referenceDateKey, 1);
  const courseKey = 'teaching-class:test-int-v1-j8-805-chem';

  values.handlers.click({ target: actionTarget('open-assignment-hub') });
  values.handlers.click({ target: actionTarget('open-assignment-group', { groupKey: 'junior:j8:理化' }) });
  values.handlers.click({ target: actionTarget('open-common-assignment', { assignmentId: 'test-int-v1-assignment-density' }) });
  values.handlers.click({ target: actionTarget('edit-common-assignment') });
  values.handlers.click({ target: actionTarget('open-single-assignment-time', { courseKey }) });
  values.handlers.click({ target: actionTarget('apply-single-assignment-time', { mode: 'next-week' }) });
  values.handlers.click({ target: actionTarget('set-schedule-mode', { mode: 'date' }) });

  const dateInput = changeTarget('assignment-date', mondayKey);
  await values.handlers.change({ target: dateInput });
  const saveButton = actionTarget('save-assignment');
  values.appListeners.pointerdown[0]({ target: saveButton });
  values.handlers.focusout({ target: dateInput, relatedTarget: saveButton });
  assert.match(values.app.innerHTML, /覆蓋個別修改/);

  let prevented = false;
  values.handlers.click({ target: saveButton, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(values.get(homeworkKey), beforeRaw);
  assert.match(values.app.innerHTML, /覆蓋個別修改/);
});

test('行動裝置選完考試日期後首次開啟共同節次不會被整頁重畫關閉', async () => {
  const values = installBrowserStubs('?data-profile=test', { coarsePointer: true });
  await import(`../preview-v2/app.js?mobile-exam-date-period-${Date.now()}`);
  const classroom = JSON.parse(values.get([...values.keys()].find((key) => key.includes('homework-v4'))));
  const mondayKey = nextWeekdayDateKey(classroom.meta.referenceDateKey, 1);

  values.handlers.click({ target: actionTarget('open-exam-hub') });
  values.handlers.click({ target: actionTarget('open-exam-group', { groupKey: 'junior:j8:理化' }) });
  values.handlers.click({ target: actionTarget('add-common-exam') });
  ensureExamCourseSelected(values, 'teaching-class:test-int-v1-j8-805-chem');
  ensureExamCourseSelected(values, 'teaching-class:test-int-v1-j8-806-chem');
  ensureExamCourseSelected(values, 'teaching-class:test-int-v1-j8-807-chem', false);
  values.handlers.click({ target: actionTarget('open-exam-common-time') });

  const dateInput = changeTarget('exam-batch-date', mondayKey);
  await values.handlers.change({ target: dateInput });
  const beforeMovingToPeriod = values.app.innerHTML;
  const periodSelect = {
    value: 'p6',
    dataset: { action: 'exam-batch-period' },
    closest(selector) {
      return selector === '[data-action]' || selector === '[data-action="exam-batch-period"]' ? this : null;
    }
  };
  values.appListeners.pointerdown[0]({ target: periodSelect });
  values.handlers.focusout({ target: dateInput, relatedTarget: periodSelect });
  assert.equal(values.app.innerHTML, beforeMovingToPeriod);

  await values.handlers.change({ target: periodSelect });
  const formatted = `${Number(mondayKey.slice(5, 7))}/${Number(mondayKey.slice(8, 10))}`;
  assert.equal((values.app.innerHTML.match(new RegExp(`${formatted}・第 6 節`, 'g')) || []).length, 2);
});

test('新增共同考試可選共同日期，節次留空依各班課表，選節次後全班同堂', async () => {
  const values = installBrowserStubs('?data-profile=test');
  await import(`../preview-v2/app.js?exam-batch-date-${Date.now()}`);
  const classroom = JSON.parse(values.get([...values.keys()].find((key) => key.includes('homework-v4'))));
  const mondayKey = nextWeekdayDateKey(classroom.meta.referenceDateKey, 1);
  values.handlers.click({ target: actionTarget('open-exam-hub') });
  values.handlers.click({ target: actionTarget('open-exam-group', { groupKey: 'junior:j8:理化' }) });
  values.handlers.click({ target: actionTarget('add-common-exam') });
  ensureExamCourseSelected(values, 'teaching-class:test-int-v1-j8-805-chem');
  ensureExamCourseSelected(values, 'teaching-class:test-int-v1-j8-806-chem');
  ensureExamCourseSelected(values, 'teaching-class:test-int-v1-j8-807-chem', false);
  values.handlers.click({ target: actionTarget('open-exam-common-time') });

  assert.match(values.app.innerHTML, /data-action="exam-batch-date"/);
  assert.match(values.app.innerHTML, /共同節次（選填）/);
  assert.match(values.app.innerHTML, /<option value="">依各班當日課表<\/option>/);

  await values.handlers.change({ target: changeTarget('exam-batch-date', mondayKey) });
  const formatted = `${Number(mondayKey.slice(5, 7))}/${Number(mondayKey.slice(8, 10))}`;
  assert.match(values.app.innerHTML, new RegExp(`${formatted}・第 1 節`));
  assert.match(values.app.innerHTML, new RegExp(`${formatted}・第 3 節`));

  await values.handlers.change({ target: changeTarget('exam-batch-period', 'p6') });
  assert.equal((values.app.innerHTML.match(new RegExp(`${formatted}・第 6 節`, 'g')) || []).length, 2);
});

test('共同作業與考試依是否處理分區顯示', async () => {
  const values = installBrowserStubs('?data-profile=test');
  await import(`../preview-v2/app.js?common-record-sections-${Date.now()}`);

  values.handlers.click({ target: actionTarget('open-assignment-hub') });
  values.handlers.click({ target: actionTarget('open-assignment-group', { groupKey: 'junior:j8:理化' }) });
  assert.match(values.app.innerHTML, />未檢查<\/h2>/);
  assert.match(values.app.innerHTML, />已檢查<\/h2>/);

  values.handlers.click({ target: actionTarget('open-exam-hub') });
  values.handlers.click({ target: actionTarget('open-exam-group', { groupKey: 'junior:j8:理化' }) });
  assert.match(values.app.innerHTML, />未考試<\/h2>/);
  assert.match(values.app.innerHTML, />已考試<\/h2>/);
});

test('節次時間入口位於課表管理主頁，修改單一課表時不再出現', async () => {
  const values = installBrowserStubs('?data-profile=test');
  await import(`../preview-v2/app.js?startup-time-location=${Date.now()}`);
  values.handlers.click({ target: actionTarget('open-settings-tab') });
  values.handlers.click({ target: actionTarget('open-schedule-management') });
  assert.match(values.app.innerHTML, /data-action="open-managed-schedule-times"/);
  assert.match(values.app.innerHTML, /學年度共用/);

  const scheduleKey = [...values.keys()].find((key) => key.includes('managed-schedules'));
  const schedules = JSON.parse(values.get(scheduleKey));
  const year = Object.keys(schedules.byAcademicYear)[0];
  const versionId = schedules.byAcademicYear[year].versions[0].id;
  values.handlers.click({ target: actionTarget('edit-managed-schedule', { versionId }) });
  assert.doesNotMatch(values.app.innerHTML, /data-action="open-managed-schedule-times"/);
});

test('課表管理儲存學年度節次時間後，今日八節課表立即使用新時間', async () => {
  const values = installBrowserStubs('?data-profile=test');
  await import(`../preview-v2/app.js?startup-time-save=${Date.now()}`);
  values.handlers.click({ target: actionTarget('open-settings-tab') });
  values.handlers.click({ target: actionTarget('open-schedule-management') });
  values.handlers.click({ target: actionTarget('open-managed-schedule-times') });
  values.handlers.change({
    target: {
      value: '08:00',
      dataset: { periodId: 'p1', field: 'start' },
      closest(selector) { return selector === '[data-action="managed-schedule-time-input"]' ? this : null; }
    }
  });
  values.handlers.click({ target: actionTarget('save-managed-schedule-times') });

  const scheduleKey = [...values.keys()].find((key) => key.includes('managed-schedules'));
  const schedules = JSON.parse(values.get(scheduleKey));
  const year = Object.keys(schedules.byAcademicYear)[0];
  assert.equal(schedules.byAcademicYear[year].times[0].start, '08:00');
  assert.equal(schedules.byAcademicYear[year].versions.every((version) => !Object.hasOwn(version, 'times')), true);
  const metadata = JSON.parse(values.get('teacher-assistant-preview-v2-data-sync-v1::test::integration-v1'));
  assert.equal(metadata.testDataState, 'custom');

  values.handlers.click({ target: actionTarget('open-today-tab') });
  assert.match(values.app.innerHTML, /08:00/);
});

test('新增授課班級可增加多列並一次保存，之後仍以單班流程修改', async () => {
  const values = installBrowserStubs('?data-profile=test');
  await import(`../preview-v2/app.js?startup-teaching-class-batch=${Date.now()}`);
  values.handlers.click({ target: actionTarget('open-settings-tab') });
  values.handlers.click({ target: actionTarget('open-teaching-classes') });
  values.handlers.click({ target: actionTarget('new-teaching-class') });

  assert.match(values.app.innerHTML, /批次新增/);
  assert.match(values.app.innerHTML, /學制（共用）/);
  assert.match(values.app.innerHTML, /科目（共用）/);
  assert.equal((values.app.innerHTML.match(/data-teaching-class-row="/g) || []).length, 1);
  assert.match(values.app.innerHTML, /class="teaching-class-batch-fields"/);
  assert.match(values.app.innerHTML, /班級[\s\S]*最後座號[\s\S]*空號（選填）/);
  assert.match(values.app.innerHTML, /data-action="add-teaching-class-row"/);

  values.handlers.input({ target: teachingClassInput('subject', '科學專題') });
  values.handlers.input({ target: teachingClassInput('className', '8', 0) });
  values.handlers.input({ target: teachingClassInput('lastSeat', '40', 0) });
  values.handlers.input({ target: teachingClassInput('vacantSeats', '4、12', 0) });
  values.handlers.click({ target: actionTarget('add-teaching-class-row') });
  assert.equal((values.app.innerHTML.match(/data-teaching-class-row="/g) || []).length, 2);
  values.handlers.input({ target: teachingClassInput('className', '9', 1) });
  values.handlers.input({ target: teachingClassInput('lastSeat', '42', 1) });
  values.handlers.input({ target: teachingClassInput('vacantSeats', '5', 1) });
  values.handlers.click({ target: actionTarget('add-teaching-class-row') });
  assert.equal((values.app.innerHTML.match(/data-teaching-class-row="/g) || []).length, 3);
  values.handlers.click({ target: actionTarget('remove-teaching-class-row', { teachingClassRowIndex: '2' }) });
  assert.equal((values.app.innerHTML.match(/data-teaching-class-row="/g) || []).length, 2);
  values.handlers.click({ target: actionTarget('save-teaching-class-batch') });

  const teachingKey = [...values.keys()].find((key) => key.includes('teaching-classes'));
  const saved = JSON.parse(values.get(teachingKey));
  const year = Object.keys(saved.byAcademicYear)[0];
  const batchRecords = saved.byAcademicYear[year].filter((record) => record.subject === '科學專題');
  assert.equal(saved.byAcademicYear[year].length, 7);
  assert.deepEqual(batchRecords.map(({ className, lastSeat, vacantSeats }) => ({ className, lastSeat, vacantSeats })), [
    { className: '8', lastSeat: 40, vacantSeats: [4, 12] },
    { className: '9', lastSeat: 42, vacantSeats: [5] }
  ]);
  assert.equal(new Set(batchRecords.map((record) => record.id)).size, 2);

  const editedId = batchRecords[0].id;
  values.handlers.click({ target: actionTarget('edit-teaching-class', { classId: editedId }) });
  assert.match(values.app.innerHTML, /修改授課班級/);
  assert.doesNotMatch(values.app.innerHTML, /data-action="add-teaching-class-row"/);
  values.handlers.input({ target: teachingClassInput('className', '10') });
  values.handlers.click({ target: actionTarget('save-teaching-class') });
  const edited = JSON.parse(values.get(teachingKey)).byAcademicYear[year];
  assert.equal(edited.length, 7);
  assert.equal(edited.find((record) => record.id === editedId).className, '10');
});

test('今日頁可開啟所選日期生效版本的唯讀完整每週課表', async () => {
  const values = installBrowserStubs('?data-profile=test');
  await import(`../preview-v2/app.js?startup-weekly-schedule=${Date.now()}`);
  assert.match(values.app.innerHTML, /data-action="open-weekly-schedule"/);

  values.handlers.click({ target: actionTarget('open-weekly-schedule') });
  assert.match(values.app.innerHTML, /每週課表/);
  assert.match(values.app.innerHTML, /上學期・第二週版/);
  assert.equal((values.app.innerHTML.match(/weekly-schedule-cell/g) || []).length, 40);
  assert.equal((values.app.innerHTML.match(/class="managed-schedule-grid-row" role="row"/g) || []).length, 9);
  assert.doesNotMatch(values.app.innerHTML, /data-action="open-managed-schedule-cell"/);
  assert.doesNotMatch(values.app.innerHTML, /class="bottom-navigation"/);
  assert.match(values.app.innerHTML, /data-action="open-calendar"/);
  assert.match(values.app.innerHTML, /單日調課仍會顯示在對應日期的今日頁/);

  const homeworkKey = [...values.keys()].find((key) => key.includes('homework-v4'));
  const todayKey = JSON.parse(values.get(homeworkKey)).meta.referenceDateKey;
  values.handlers.click({ target: actionTarget('open-calendar') });
  values.handlers.click({ target: actionTarget('select-calendar-date', { date: shiftDateKey(todayKey, -10) }) });
  assert.match(values.app.innerHTML, /上學期・開學版/);

  values.handlers.click({ target: actionTarget('back-weekly-schedule') });
  assert.match(values.app.innerHTML, /data-action="open-weekly-schedule"/);
});

test('一般網址預設使用空白正式資料且不顯示測試標籤', async () => {
  const values = installBrowserStubs('');
  await import(`../preview-v2/app.js?startup-default-formal=${Date.now()}`);
  const keys = [...values.keys()];
  assert.deepEqual(keys, ['teacher-assistant-preview-v2-homework-v4']);
  assert.doesNotMatch(values.app.innerHTML, /test-data-banner/);
  assert.doesNotMatch(values.app.innerHTML, /聯動測試資料/);
});

test('正式模式更新後保留六個既有資料區，且不建立測試模式副本', async () => {
  const seeded = installBrowserStubs('?data-profile=test');
  await import(`../preview-v2/app.js?seed-formal-preservation-${Date.now()}`);
  const suffix = '::test::integration-v1';
  const formalKeys = [
    'teacher-assistant-preview-v2-schedule-v2',
    'teacher-assistant-preview-v2-homework-v4',
    'teacher-assistant-preview-v2-academic-period-v1',
    'teacher-assistant-preview-v2-teaching-classes-v1',
    'teacher-assistant-preview-v2-managed-schedules-v1',
    'teacher-assistant-preview-v2-data-sync-v1'
  ];
  seeded.set(`teacher-assistant-preview-v2-data-sync-v1${suffix}`, JSON.stringify({ testDataState: 'custom' }));
  const values = installBrowserStubs('');
  for (const key of formalKeys) values.set(key, seeded.get(`${key}${suffix}`));
  const before = Object.fromEntries(formalKeys.map((key) => [key, JSON.parse(values.get(key))]));

  await import(`../preview-v2/app.js?formal-preservation-${Date.now()}`);

  assert.deepEqual([...values.keys()].sort(), [...formalKeys].sort());
  for (const key of formalKeys) assert.deepEqual(JSON.parse(values.get(key)), before[key]);
  assert.equal([...values.keys()].some((key) => key.endsWith(suffix)), false);
});

test('正式資料模式不自動加入假課表、假作業或假考試', async () => {
  const values = installBrowserStubs('?data-profile=unknown');
  await import(`../preview-v2/app.js?startup-normal=${Date.now()}`);
  const keys = [...values.keys()];
  assert.deepEqual(keys, ['teacher-assistant-preview-v2-homework-v4']);
  const classroom = JSON.parse(values.get(keys[0]));
  assert.deepEqual(classroom.assignments, {});
  assert.deepEqual(classroom.exams, {});
  assert.deepEqual(classroom.reminders, {});
  assert.deepEqual(classroom.drawSessions, {});
  assert.match(values.app.innerHTML, /data-action="open-weekly-schedule"/);
  values.handlers.click({ target: actionTarget('open-weekly-schedule') });
  assert.match(values.app.innerHTML, /沒有生效中的課表版本/);
  assert.match(values.app.innerHTML, /data-action="open-calendar"/);
});

test('設定頁可進入資料與同步，正式與測試模式顯示各自操作', async () => {
  const formal = installBrowserStubs('');
  await import(`../preview-v2/app.js?startup-data-sync-formal=${Date.now()}`);
  formal.handlers.click({ target: actionTarget('open-settings-tab') });
  assert.match(formal.app.innerHTML, /data-action="open-data-sync"/);
  formal.handlers.click({ target: actionTarget('open-data-sync') });
  assert.match(formal.app.innerHTML, /資料與同步/);
  assert.match(formal.app.innerHTML, /我的資料/);
  assert.match(formal.app.innerHTML, /data-action="export-backup"/);
  assert.match(formal.app.innerHTML, /data-action="request-clear-profile"/);
  assert.doesNotMatch(formal.app.innerHTML, /恢復預設測試資料/);

  const testProfile = installBrowserStubs('?data-profile=test');
  await import(`../preview-v2/app.js?startup-data-sync-test=${Date.now()}`);
  testProfile.handlers.click({ target: actionTarget('open-settings-tab') });
  testProfile.handlers.click({ target: actionTarget('open-data-sync') });
  assert.match(testProfile.app.innerHTML, /測試資料管理/);
  assert.match(testProfile.app.innerHTML, /data-action="request-restore-test-data"/);
  assert.match(testProfile.app.innerHTML, /返回正式資料/);
  assert.doesNotMatch(testProfile.app.innerHTML, /class="bottom-navigation"/);
});

test('設定頁提供安裝入口，無系統提示時顯示 iPhone 與 Android 操作方式', async () => {
  const values = installBrowserStubs('');
  await import(`../preview-v2/app.js?startup-install-help=${Date.now()}`);
  values.handlers.click({ target: actionTarget('open-settings-tab') });
  assert.match(values.app.innerHTML, /data-action="install-app"/);
  assert.match(values.app.innerHTML, /安裝到主畫面/);
  values.handlers.click({ target: actionTarget('install-app') });
  assert.match(values.app.innerHTML, /iPhone／iPad Safari/);
  assert.match(values.app.innerHTML, /Android Chrome/);
  assert.match(values.app.innerHTML, /從主畫面開啟時會進入正式資料/);
});

test('瀏覽器提供安裝提示時，設定頁顯示一鍵安裝狀態', async () => {
  const values = installBrowserStubs('');
  await import(`../preview-v2/app.js?startup-install-prompt=${Date.now()}`);
  let prevented = false;
  values.handlers.beforeinstallprompt({
    preventDefault() { prevented = true; },
    prompt() { return Promise.resolve({ outcome: 'accepted' }); }
  });
  values.handlers.click({ target: actionTarget('open-settings-tab') });
  assert.equal(prevented, true);
  assert.match(values.app.innerHTML, /可以安裝/);
  assert.match(values.app.innerHTML, /安裝後可從手機主畫面直接開啟/);
});

test('匯入先驗證模式再確認，成功時完整取代目前正式資料', async () => {
  const values = installBrowserStubs('');
  await import(`../preview-v2/app.js?startup-import-formal=${Date.now()}`);
  values.handlers.click({ target: actionTarget('open-settings-tab') });
  values.handlers.click({ target: actionTarget('open-data-sync') });
  const envelope = {
    appId: 'teacher-classroom-assistant',
    schemaVersion: 1,
    dataProfile: 'formal',
    exportedAt: '2026-08-29T08:00:00.000Z',
    payload: {
      scheduleOverrides: { '2026-08-29:p1': { classLabel: '測試班', subject: '理化' } },
      academicPeriodSettings: null,
      teachingClassSettings: null,
      scheduleManagementSettings: null,
      classroomRecords: { assignments: {}, exams: {}, courses: {}, reminders: {}, drawSessions: {}, meta: { importedMarker: 'imported' } }
    }
  };
  const input = {
    files: [{ size: 1000, async text() { return JSON.stringify(envelope); } }],
    value: 'backup.json',
    closest(selector) { return selector === '[data-action="import-backup-file"]' ? this : null; }
  };
  await values.handlers.change({ target: input });
  assert.match(values.app.innerHTML, /匯入這份正式資料備份？/);
  assert.equal(input.value, '');
  values.handlers.click({ target: actionTarget('confirm-import-backup') });
  assert.equal(values.reloadCount, 1);
  assert.equal(JSON.parse(values.get('teacher-assistant-preview-v2-homework-v4')).meta.importedMarker, 'imported');
  assert.equal(JSON.parse(values.get('teacher-assistant-preview-v2-data-sync-v1')).lastImportedAt.length > 10, true);
});

test('正式模式拒絕測試備份且完全不改動目前資料', async () => {
  const values = installBrowserStubs('');
  await import(`../preview-v2/app.js?startup-reject-test-backup=${Date.now()}`);
  const original = values.get('teacher-assistant-preview-v2-homework-v4');
  values.handlers.click({ target: actionTarget('open-settings-tab') });
  values.handlers.click({ target: actionTarget('open-data-sync') });
  const envelope = {
    appId: 'teacher-classroom-assistant', schemaVersion: 1, dataProfile: 'test', exportedAt: '2026-08-29T08:00:00.000Z',
    payload: {
      scheduleOverrides: null, academicPeriodSettings: null, teachingClassSettings: null, scheduleManagementSettings: null,
      classroomRecords: { assignments: {}, exams: {}, courses: {}, reminders: {}, drawSessions: {} }
    }
  };
  await values.handlers.change({ target: {
    files: [{ size: 1000, async text() { return JSON.stringify(envelope); } }], value: 'test.json',
    closest(selector) { return selector === '[data-action="import-backup-file"]' ? this : null; }
  } });
  assert.match(values.app.innerHTML, /不能匯入測試資料備份/);
  assert.equal(values.get('teacher-assistant-preview-v2-homework-v4'), original);
  assert.equal(values.reloadCount, 0);
});

test('匯入寫入中途失敗會恢復匯入前的完整資料', async () => {
  const values = installBrowserStubs('');
  await import(`../preview-v2/app.js?startup-import-rollback=${Date.now()}`);
  const classroomKey = 'teacher-assistant-preview-v2-homework-v4';
  const originalClassroom = values.get(classroomKey);
  values.handlers.click({ target: actionTarget('open-settings-tab') });
  values.handlers.click({ target: actionTarget('open-data-sync') });
  const envelope = {
    appId: 'teacher-classroom-assistant', schemaVersion: 1, dataProfile: 'formal', exportedAt: '2026-08-29T08:00:00.000Z',
    payload: {
      scheduleOverrides: { '2026-08-29:p1': { classLabel: '測試班', subject: '理化' } },
      academicPeriodSettings: null, teachingClassSettings: null, scheduleManagementSettings: null,
      classroomRecords: { assignments: {}, exams: {}, courses: {}, reminders: {}, drawSessions: {}, meta: { shouldNotRemain: true } }
    }
  };
  await values.handlers.change({ target: {
    files: [{ size: 1000, async text() { return JSON.stringify(envelope); } }], value: 'rollback.json',
    closest(selector) { return selector === '[data-action="import-backup-file"]' ? this : null; }
  } });
  const originalSetItem = globalThis.localStorage.setItem.bind(globalThis.localStorage);
  let writeCount = 0;
  globalThis.localStorage.setItem = (key, value) => {
    writeCount += 1;
    if (writeCount === 2) throw new Error('simulated quota failure');
    originalSetItem(key, value);
  };
  values.handlers.click({ target: actionTarget('confirm-import-backup') });
  assert.equal(values.reloadCount, 0);
  assert.equal(values.get(classroomKey), originalClassroom);
  assert.equal(values.has('teacher-assistant-preview-v2-schedule-v2'), false);
  assert.match(values.app.innerHTML, /已保留匯入前的資料/);
});

test('匯入失敗且回滾也失敗時不會誤稱原資料已保留', async () => {
  const values = installBrowserStubs('');
  await import(`../preview-v2/app.js?startup-import-rollback-failure=${Date.now()}`);
  values.handlers.click({ target: actionTarget('open-settings-tab') });
  values.handlers.click({ target: actionTarget('open-data-sync') });
  const envelope = {
    appId: 'teacher-classroom-assistant', schemaVersion: 1, dataProfile: 'formal', exportedAt: '2026-08-29T08:00:00.000Z',
    payload: {
      scheduleOverrides: { '2026-08-29:p1': { classLabel: '測試班', subject: '理化' } },
      academicPeriodSettings: null, teachingClassSettings: null, scheduleManagementSettings: null,
      classroomRecords: { assignments: {}, exams: {}, courses: {}, reminders: {}, drawSessions: {}, meta: { imported: true } }
    }
  };
  await values.handlers.change({ target: {
    files: [{ size: 1000, async text() { return JSON.stringify(envelope); } }], value: 'rollback-failure.json',
    closest(selector) { return selector === '[data-action="import-backup-file"]' ? this : null; }
  } });
  const originalSetItem = globalThis.localStorage.setItem.bind(globalThis.localStorage);
  const originalRemoveItem = globalThis.localStorage.removeItem.bind(globalThis.localStorage);
  globalThis.localStorage.setItem = (key, value) => {
    if (key === 'teacher-assistant-preview-v2-homework-v4') throw new Error('simulated write failure');
    originalSetItem(key, value);
  };
  globalThis.localStorage.removeItem = (key) => {
    if (key === 'teacher-assistant-preview-v2-schedule-v2') throw new Error('simulated rollback failure');
    originalRemoveItem(key);
  };
  values.handlers.click({ target: actionTarget('confirm-import-backup') });
  assert.equal(values.reloadCount, 0);
  assert.match(values.app.innerHTML, /資料可能不完整/);
  assert.doesNotMatch(values.app.innerHTML, /已保留匯入前的資料/);
});

test('清除測試資料只保留清除標記，重新開啟仍維持空白', async () => {
  const values = installBrowserStubs('?data-profile=test');
  await import(`../preview-v2/app.js?startup-clear-test=${Date.now()}`);
  values.handlers.click({ target: actionTarget('open-settings-tab') });
  values.handlers.click({ target: actionTarget('open-data-sync') });
  values.handlers.click({ target: actionTarget('request-clear-profile') });
  assert.match(values.app.innerHTML, /清除測試資料？/);
  values.handlers.click({ target: actionTarget('confirm-clear-profile') });
  assert.equal(values.reloadCount, 1);
  const metadataKey = 'teacher-assistant-preview-v2-data-sync-v1::test::integration-v1';
  assert.deepEqual([...values.keys()], [metadataKey]);
  assert.equal(JSON.parse(values.get(metadataKey)).testDataState, 'cleared');

  const reopened = installBrowserStubs('?data-profile=test');
  reopened.set(metadataKey, values.get(metadataKey));
  await import(`../preview-v2/app.js?startup-cleared-test=${Date.now()}`);
  const classroomKey = 'teacher-assistant-preview-v2-homework-v4::test::integration-v1';
  const classroom = JSON.parse(reopened.get(classroomKey));
  assert.deepEqual(classroom.assignments, {});
  assert.deepEqual(classroom.exams, {});
  assert.doesNotMatch(reopened.app.innerHTML, /805班/);
  assert.match(reopened.app.innerHTML, /測試資料/);
});

test('空白測試模式可明確恢復整套預設測試資料', async () => {
  const values = installBrowserStubs('?data-profile=test');
  const metadataKey = 'teacher-assistant-preview-v2-data-sync-v1::test::integration-v1';
  values.set(metadataKey, JSON.stringify({ testDataState: 'cleared' }));
  await import(`../preview-v2/app.js?startup-restore-test=${Date.now()}`);
  values.handlers.click({ target: actionTarget('open-settings-tab') });
  values.handlers.click({ target: actionTarget('open-data-sync') });
  values.handlers.click({ target: actionTarget('request-restore-test-data') });
  assert.match(values.app.innerHTML, /恢復預設測試資料？/);
  values.handlers.click({ target: actionTarget('confirm-restore-test-data') });
  assert.equal(values.reloadCount, 1);
  assert.equal(JSON.parse(values.get(metadataKey)).testDataState, 'default');
  const teaching = JSON.parse(values.get('teacher-assistant-preview-v2-teaching-classes-v1::test::integration-v1'));
  const classroom = JSON.parse(values.get('teacher-assistant-preview-v2-homework-v4::test::integration-v1'));
  assert.equal(Object.values(teaching.byAcademicYear)[0].length, 5);
  assert.equal(Object.keys(classroom.assignments).length, 2);
  assert.equal(Object.keys(classroom.exams).length, 1);
  assert.equal(Object.keys(classroom.reminders).length, 5);
  assert.equal(Object.keys(classroom.drawSessions).length, 1);
});

test('聯動測試資料跨日後只重建測試專用鍵', async () => {
  const values = installBrowserStubs('?data-profile=integration-v1');
  const homeworkKey = 'teacher-assistant-preview-v2-homework-v4::test::integration-v1';
  values.set(homeworkKey, JSON.stringify({ assignments: {}, meta: { dataProfile: 'integration-v1', schemaVersion: 1, referenceDateKey: '2000-01-01' } }));
  await import(`../preview-v2/app.js?startup-stale-test=${Date.now()}`);
  assert.equal([...values.keys()].length, 5);
  assert.equal([...values.keys()].every((key) => key.endsWith('::test::integration-v1')), true);
  const classroom = JSON.parse(values.get(homeworkKey));
  assert.notEqual(classroom.meta.referenceDateKey, '2000-01-01');
  assert.equal(Object.keys(classroom.assignments).length, 2);
});

test('已修改或匯入的測試資料不會因參考日期不同被自動覆寫', async () => {
  const values = installBrowserStubs('?data-profile=test');
  const suffix = '::test::integration-v1';
  values.set(`teacher-assistant-preview-v2-data-sync-v1${suffix}`, JSON.stringify({ testDataState: 'custom' }));
  values.set(`teacher-assistant-preview-v2-homework-v4${suffix}`, JSON.stringify({
    assignments: {}, exams: {}, courses: {}, reminders: {}, drawSessions: {},
    meta: { dataProfile: 'integration-v1', schemaVersion: 1, referenceDateKey: '2000-01-01' }
  }));
  await import(`../preview-v2/app.js?startup-custom-test=${Date.now()}`);
  const classroom = JSON.parse(values.get(`teacher-assistant-preview-v2-homework-v4${suffix}`));
  assert.deepEqual(classroom.assignments, {});
  assert.doesNotMatch(values.app.innerHTML, /805班/);
});

test('正式教學資料損壞時啟動不會用空資料覆寫原字串', async () => {
  const values = installBrowserStubs('?data-profile=formal');
  const homeworkKey = 'teacher-assistant-preview-v2-homework-v4';
  const damaged = '{尚未結束的 JSON';
  values.set(homeworkKey, damaged);
  await import(`../preview-v2/app.js?startup-damaged=${Date.now()}`);
  assert.equal(values.get(homeworkKey), damaged);
  assert.deepEqual([...values.keys()], [homeworkKey]);
});
