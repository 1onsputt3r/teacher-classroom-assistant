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

function ensureExamCourseSelected(values, courseKey) {
  const selectedMarkup = `data-course-key="${courseKey}" aria-pressed="true"`;
  if (!values.app.innerHTML.includes(selectedMarkup)) {
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

test('空白作業與考試仍由授課班級顯示分類，且可直接開啟新增表單而不寫入資料', async () => {
  const values = await installClonedTestProfile('empty-common-hubs', clearTestClassroomCollections);
  const before = [...values].sort(([left], [right]) => left.localeCompare(right));

  values.handlers.click({ target: actionTarget('open-assignment-hub') });
  assert.match(values.app.innerHTML, /data-action="open-assignment-group" data-group-key="junior:j8:理化"/);
  assert.match(values.app.innerHTML, /0 份作業・3 個班級/);
  assert.doesNotMatch(values.app.innerHTML, /請先從本堂課新增作業/);
  values.handlers.click({ target: actionTarget('open-assignment-group', { groupKey: 'junior:j8:理化' }) });
  assert.match(values.app.innerHTML, /這個年級與科目目前還沒有作業/);
  assert.match(values.app.innerHTML, /data-action="add-common-assignment"/);
  values.handlers.click({ target: actionTarget('add-common-assignment') });
  assert.match(values.app.innerHTML, /新增作業/);
  assert.match(values.app.innerHTML, /data-action="save-assignment"/);
  assert.equal((values.app.innerHTML.match(/data-action="toggle-form-course"/g) || []).length, 3);
  assert.doesNotMatch(values.app.innerHTML, /加入其他班級/);

  values.handlers.click({ target: actionTarget('back-assignment-form') });
  values.handlers.click({ target: actionTarget('open-exam-hub') });
  assert.match(values.app.innerHTML, /data-action="open-exam-group" data-group-key="junior:j8:理化"/);
  assert.match(values.app.innerHTML, /0 份考試・3 個班級/);
  assert.doesNotMatch(values.app.innerHTML, /請先從本堂課新增考試/);
  values.handlers.click({ target: actionTarget('open-exam-group', { groupKey: 'junior:j8:理化' }) });
  assert.match(values.app.innerHTML, /這個年級與科目目前還沒有考試/);
  values.handlers.click({ target: actionTarget('add-common-exam') });
  assert.match(values.app.innerHTML, /新增考試/);
  assert.match(values.app.innerHTML, /data-action="save-exam"/);
  assert.equal((values.app.innerHTML.match(/data-action="toggle-exam-form-course"/g) || []).length, 3);
  assert.doesNotMatch(values.app.innerHTML, /加入其他班級/);
  assert.deepEqual([...values].sort(([left], [right]) => left.localeCompare(right)), before);
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
