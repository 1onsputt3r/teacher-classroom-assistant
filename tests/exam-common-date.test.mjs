import test from 'node:test';
import assert from 'node:assert/strict';
import {
  courseDataKey,
  courseFromSelection,
  resolveIndependentExamTimes
} from '../preview-v2/core.mjs';

const courseA = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
const courseB = courseFromSelection({ system: 'junior', grade: 'j8', className: '6', subject: '理化' });
const keyA = courseDataKey(courseA);
const keyB = courseDataKey(courseB);
const selectedDate = '2026-09-07';
const schedulesByDate = {
  [selectedDate]: [
    { id: 'p1', period: 1, start: '08:10', end: '09:00', course: courseA },
    { id: 'p3', period: 3, start: '10:10', end: '11:00', course: courseB },
    { id: 'p4', period: 4, start: '11:10', end: '12:00', course: courseA }
  ]
};
const weeklySchedules = (dateKey) => schedulesByDate[dateKey] || [];
const session = {
  dateKey: '2026-09-01',
  end: '09:00',
  course: courseA
};

test('共同日期未選節次時，各班使用當日課表的第一堂課', () => {
  const result = resolveIndependentExamTimes({
    weeklySchedules,
    session,
    courses: [courseA, courseB],
    mode: 'date',
    dateKey: selectedDate,
    minDate: '2026-09-01'
  });

  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.targets[keyA].due, {
    dateKey: selectedDate,
    slotId: 'p1',
    period: 1,
    start: '08:10',
    end: '09:00'
  });
  assert.deepEqual(result.targets[keyB].due, {
    dateKey: selectedDate,
    slotId: 'p3',
    period: 3,
    start: '10:10',
    end: '11:00'
  });
});

test('共同日期有選節次時，全部班級使用相同日期與節次', () => {
  const commonPeriod = { id: 'p6', period: 6, start: '14:10', end: '15:00' };
  const result = resolveIndependentExamTimes({
    weeklySchedules,
    session,
    courses: [courseA, courseB],
    mode: 'date',
    dateKey: selectedDate,
    period: commonPeriod,
    minDate: '2026-09-01'
  });

  const expected = { dateKey: selectedDate, slotId: 'p6', period: 6, start: '14:10', end: '15:00' };
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.targets[keyA].due, expected);
  assert.deepEqual(result.targets[keyB].due, expected);
});

test('共同日期拒絕空白、無效與早於可安排日期的值', () => {
  for (const dateKey of ['', '2026-02-30', 'not-a-date']) {
    const invalid = resolveIndependentExamTimes({
      weeklySchedules,
      session,
      courses: [courseA, courseB],
      mode: 'date',
      dateKey,
      minDate: '2026-09-01'
    });
    assert.deepEqual(Object.keys(invalid.targets), []);
    assert.deepEqual(invalid.errors.map((error) => error.reason), ['尚未選擇共同日期', '尚未選擇共同日期']);
  }

  const tooEarly = resolveIndependentExamTimes({
    weeklySchedules,
    session,
    courses: [courseA, courseB],
    mode: 'date',
    dateKey: '2026-08-31',
    minDate: '2026-09-01'
  });
  assert.deepEqual(Object.keys(tooEarly.targets), []);
  assert.deepEqual(tooEarly.errors.map((error) => error.reason), [
    '考試日期不可早於可安排日期',
    '考試日期不可早於可安排日期'
  ]);
});

test('共同日期完整回報當日無課的班級，並保留其他可解析 target', () => {
  const onlyCourseA = (dateKey) => dateKey === selectedDate
    ? schedulesByDate[selectedDate].filter((slot) => courseDataKey(slot.course) === keyA)
    : [];
  const result = resolveIndependentExamTimes({
    weeklySchedules: onlyCourseA,
    session,
    courses: [courseA, courseB],
    mode: 'date',
    dateKey: selectedDate,
    minDate: '2026-09-01'
  });

  assert.deepEqual(Object.keys(result.targets), [keyA]);
  assert.equal(result.targets[keyA].due.slotId, 'p1');
  assert.deepEqual(result.errors, [{
    courseKey: keyB,
    classLabel: courseB.classLabel,
    reason: '選擇日期當天沒有這門課'
  }]);
});
