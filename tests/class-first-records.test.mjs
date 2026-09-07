import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClassFirstRecordView,
  buildCommonAssignmentView,
  buildCommonExamView,
  courseDataKey,
  courseFromSelection
} from '../preview-v2/core.mjs';

const courseA = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
const courseB = courseFromSelection({ system: 'junior', grade: 'j8', className: '6', subject: '理化' });
const keyA = courseDataKey(courseA);
const keyB = courseDataKey(courseB);
const due = (dateKey, period = 1) => ({ dateKey, period, slotId: `p${period}`, start: '08:10', end: '09:00' });

function freezeDeep(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') freezeDeep(child);
  }
  return Object.freeze(value);
}

for (const kind of ['assignment', 'exam']) {
  const buildCommon = kind === 'exam' ? buildCommonExamView : buildCommonAssignmentView;
  const followupField = kind === 'exam' ? 'makeups' : 'submissions';

  test(`${kind}: each class keeps its own status, due date, pending count and record identity`, () => {
    const records = {
      shared: {
        id: 'shared', title: '同一份項目', isDemo: true,
        targets: {
          [keyA]: { course: courseA, due: due('2026-09-01'), lastCheck: { dateKey: '2026-09-02' }, [followupField]: {
            one: { seat: 1, status: 'pending' }
          } },
          [keyB]: { course: courseB, due: due('2026-09-08', 4), checks: [] }
        }
      }
    };
    const groups = buildCommon(records);
    const [grade] = buildClassFirstRecordView(groups, kind);
    assert.equal(grade.label, '國中部・八年級');
    assert.equal(grade.classes.length, 2);
    const classA = grade.classes.find((entry) => entry.courseKeys.includes(keyA));
    const classB = grade.classes.find((entry) => entry.courseKeys.includes(keyB));
    assert.equal(classA.pendingCount, 1);
    assert.equal(classB.pendingCount, 0);
    assert.equal(classA.records[0].processed, true);
    assert.equal(classB.records[0].processed, false);
    assert.deepEqual(classA.records[0].due, due('2026-09-01'));
    assert.deepEqual(classB.records[0].due, due('2026-09-08', 4));
    assert.equal(classA.records[0].recordId, 'shared');
    assert.equal(classA.records[0].courseKey, keyA);
    assert.equal(classB.records[0].courseKey, keyB);
    assert.equal(classA.records[0].groupKey, groups[0].groupKey);
    assert.equal(classA.records[0].isDemo, true);
    assert.equal(classA.records[0].subject, '理化');
  });

  test(`${kind}: checked first, pending by recency rather than count, then unchecked by date and period`, () => {
    const target = (dateKey, extra = {}, period = 1) => ({ course: courseA, due: due(dateKey, period), ...extra });
    const pending = (count) => ({ [followupField]: Object.fromEntries(Array.from({ length: count }, (_, index) => [index, { status: 'pending' }])) });
    const records = Object.fromEntries([
      ['future', target('2026-10-01')],
      ['earlier', target('2026-09-11', {}, 1)],
      ['later-period', target('2026-09-11', {}, 6)],
      ['old-many-pending', target('2026-08-01', { ...pending(3), lastCheck: { dateKey: '2026-08-02' } })],
      ['recent-one-pending', target('2026-09-01', { ...pending(1), lastCheck: { dateKey: '2026-09-03' } })],
      ['checked-recent', target('2026-09-10', { lastCheck: { dateKey: '2026-09-10' } })],
      ['checked-date-fallback', target('2026-09-09', { checks: [{ id: 'legacy-no-date' }] })],
      ['checked-old', target('2026-09-08', { lastCheck: { dateKey: '2026-09-08' } })],
      ['no-date', { course: courseA }]
    ].map(([id, value]) => [id, { id, title: id, targets: { [keyA]: value } }]));
    const [grade] = buildClassFirstRecordView(buildCommon(records), kind);
    assert.deepEqual(grade.classes[0].records.map((record) => record.recordId), [
      'recent-one-pending', 'old-many-pending', 'checked-recent', 'checked-date-fallback', 'checked-old',
      'earlier', 'later-period', 'future', 'no-date'
    ]);
    assert.equal(grade.classes[0].recordCount, 9);
    assert.equal(grade.classes[0].pendingCount, 4);
  });

  test(`${kind}: cancelled targets with history remain reachable, cancelled empty targets stay absent`, () => {
    const records = {
      old: { id: 'old', title: '已取消有歷史', targets: {
        [keyA]: { course: courseA, status: 'cancelled', lastCheck: { dateKey: '2026-09-01' } }
      } },
      removed: { id: 'removed', title: '已取消無歷史', targets: {
        [keyB]: { course: courseB, status: 'cancelled' }
      } }
    };
    const groups = buildCommon(records);
    const [grade] = buildClassFirstRecordView(groups, kind);
    assert.equal(grade.classes.length, 1);
    assert.deepEqual(grade.classes[0].availableCourses, []);
    assert.equal(grade.classes[0].records[0].targetStatus, 'cancelled');
    assert.equal(grade.classes[0].records[0].processed, true);
  });
}

test('physical class merges multiple subjects and normalized names into one tile without merging target identities', () => {
  const chemistry = { ...courseA, teachingClassId: 'chemistry', className: '０５班', subject: '理化' };
  const physics = { ...courseA, teachingClassId: 'physics', className: undefined, subject: '物理' };
  const chemistryKey = courseDataKey(chemistry);
  const physicsKey = courseDataKey(physics);
  const assignments = {
    shared: { id: 'shared', title: '共用標題', targets: {
      [chemistryKey]: { course: chemistry, due: due('2026-09-01') },
      [physicsKey]: { course: physics, due: due('2026-09-02') }
    } }
  };
  const groups = buildCommonAssignmentView(assignments, undefined, [chemistry, physics]);
  const [grade] = buildClassFirstRecordView(groups);
  assert.equal(grade.classes.length, 1);
  const entry = grade.classes[0];
  assert.equal(entry.classKey, JSON.stringify(['junior', 'j8', '5']));
  assert.deepEqual(new Set(entry.subjects), new Set(['理化', '物理']));
  assert.equal(entry.availableCourses.length, 2);
  assert.equal(entry.recordCount, 2);
  assert.deepEqual(entry.records.map((record) => [record.recordId, record.courseKey]), [
    ['shared', chemistryKey], ['shared', physicsKey]
  ]);
  const duplicateGroups = [...groups, ...groups];
  assert.equal(buildClassFirstRecordView(duplicateGroups)[0].classes[0].recordCount, 2);
});

test('empty available classes appear, ordered by system and grade, with identical names kept separate', () => {
  const available = [
    { system: 'senior', grade: 's2', className: 'A', classLabel: 'A班', subject: '物理', teachingClassId: 'senior-a' },
    { system: 'junior', grade: 'j9', className: 'a班', classLabel: 'A班', subject: '理化', teachingClassId: 'junior9-a' },
    { system: 'junior', grade: 'j7', className: 'Ａ', classLabel: 'A班', subject: '自然', teachingClassId: 'junior7-a' },
    { system: 'junior', grade: 'j7', className: 'B', classLabel: 'B班', subject: '自然', teachingClassId: 'junior7-b' }
  ];
  const view = buildClassFirstRecordView(buildCommonAssignmentView({}, undefined, available));
  assert.deepEqual(view.map(({ system, grade }) => [system, grade]), [['junior', 'j7'], ['junior', 'j9'], ['senior', 's2']]);
  assert.deepEqual(view[0].classes.map((entry) => entry.classLabel), ['A班', 'B班']);
  const allClasses = view.flatMap((grade) => grade.classes);
  assert.equal(new Set(allClasses.map((entry) => entry.classKey)).size, 4);
  assert.ok(allClasses.every((entry) => entry.recordCount === 0 && entry.pendingCount === 0 && entry.availableCourses.length === 1));
});

test('unclassified history keeps course metadata boundaries and anonymous course keys without mutating input', () => {
  const assignments = {
    legacy: { id: 'legacy', title: '舊資料', targets: {
      'old-one': { course: { system: 'old-system-a', grade: 'old-grade', classLabel: '甲班', subject: '理化' }, lastCheck: { dateKey: '2026-08-01' } },
      'old-two': { course: { system: 'old-system-b', grade: 'old-grade', classLabel: '甲班', subject: '理化' }, lastCheck: { dateKey: '2026-08-01' } },
      'anonymous-one': { lastCheck: { dateKey: '2026-08-01' } },
      'anonymous-two': { lastCheck: { dateKey: '2026-08-01' } }
    } }
  };
  const groups = buildCommonAssignmentView(assignments);
  const snapshot = structuredClone(groups);
  freezeDeep(groups);
  const view = buildClassFirstRecordView(groups);
  assert.equal(view.flatMap((grade) => grade.classes).length, 4);
  assert.deepEqual(new Set(view.map((grade) => grade.system)), new Set(['old-system-a', 'old-system-b', 'unknown']));
  assert.equal(view.find((grade) => grade.system === 'unknown').classes.length, 2);
  assert.deepEqual(groups, snapshot);
  assert.deepEqual(buildClassFirstRecordView(null), []);
});
