import test from 'node:test';
import assert from 'node:assert/strict';

function installBrowserStubs(search = '') {
  const values = new Map();
  const handlers = {};
  let reloadCount = 0;
  const app = {
    innerHTML: '',
    addEventListener(type, handler) { handlers[type] = handler; },
    querySelector() { return null; }
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
    scrollTo() {}
  };
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate: null }, configurable: true });
  globalThis.CSS = { escape: (value) => String(value) };
  Object.defineProperties(values, {
    app: { value: app },
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

function shiftDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day + days, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
