import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCommonAssignmentView,
  buildCommonExamView,
  courseDataKey,
  courseFromSelection
} from '../preview-v2/core.mjs';

const courseA = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
const courseB = courseFromSelection({ system: 'junior', grade: 'j8', className: '6', subject: '理化' });
const keyA = courseDataKey(courseA);
const keyB = courseDataKey(courseB);

function due(dateKey, period = 1) {
  return { dateKey, slotId: `p${period}`, period, start: '08:10', end: '09:00' };
}

function assignment(id, title, targets) {
  return { id, title, status: 'active', targets };
}

function exam(id, title, targets) {
  return { id, title, status: 'active', targets };
}

test('共同作業 view-model 將任一班有歷史者歸入已處理區，並依日期與待補交排序', () => {
  const assignments = {
    noDate: assignment('no-date', '無日期', { [keyA]: { course: courseA, checks: [] } }),
    later: assignment('later', '較晚未檢查', { [keyA]: { course: courseA, due: due('2026-09-12'), checks: [] } }),
    earlier: assignment('earlier', '同日較晚節次', { [keyA]: { course: courseA, due: due('2026-09-05', 3), checks: [] } }),
    sameDayEarlier: assignment('same-day-earlier', '同日較早節次', { [keyA]: { course: courseA, due: due('2026-09-05', 1), checks: [] } }),
    partial: assignment('partial', '部分班級已檢查', {
      [keyA]: { course: courseA, due: due('2026-09-03'), checks: [{ id: 'old-check', dateKey: '2026-09-03' }] },
      [keyB]: { course: courseB, due: due('2026-09-04'), checks: [] }
    }),
    pendingTwo: assignment('pending-two', '兩人待補交', { [keyA]: { course: courseA, due: due('2026-08-20'), submissions: {
      one: { seat: 1, status: 'pending', missingDateKey: '2026-08-20' },
      two: { seat: 2, status: 'pending', missingDateKey: '2026-08-20' }
    } } }),
    pendingOne: assignment('pending-one', '一人待補交', { [keyA]: { course: courseA, due: due('2026-09-01'), submissions: {
      one: { seat: 1, status: 'pending', missingDateKey: '2026-09-01' }
    } } }),
    completedNew: assignment('completed-new', '最近完成', { [keyA]: { course: courseA, due: due('2026-08-01'), submissions: {
      one: { seat: 1, status: 'completed', missingDateKey: '2026-08-01', completedAt: '2026-09-10 12:30' }
    } } }),
    completedOld: assignment('completed-old', '較早完成', { [keyA]: { course: courseA, due: due('2026-08-02'), lastCheck: { id: 'check', dateKey: '2026-09-02' } } }),
    cancelledLegacy: assignment('cancelled-legacy', '舊版取消紀錄', { [keyA]: { course: courseA, due: due('2026-08-01'), status: 'cancelled', lastCheck: { id: 'legacy-check', dateKey: '2026-09-20' } } })
  };
  const snapshot = structuredClone(assignments);

  const items = buildCommonAssignmentView(assignments)[0].assignments;

  assert.deepEqual(items.map((item) => item.assignmentId), [
    'same-day-earlier', 'earlier', 'later', 'no-date',
    'pending-two', 'pending-one', 'cancelled-legacy', 'completed-new', 'partial', 'completed-old'
  ]);
  assert.deepEqual(items.slice(0, 4).map((item) => item.progressStatus), ['unprocessed', 'unprocessed', 'unprocessed', 'unprocessed']);
  assert.equal(items[0].firstPeriod, 1);
  assert.equal(items[1].firstPeriod, 3);
  const partial = items.find((item) => item.assignmentId === 'partial');
  assert.equal(partial.progressStatus, 'processed');
  assert.equal(partial.processedClassCount, 1);
  assert.equal(partial.classCount, 2);
  assert.equal(partial.latestProcessedDateKey, '2026-09-03');
  assert.equal(items.find((item) => item.assignmentId === 'completed-new').latestProcessedDateKey, '2026-09-10');
  assert.deepEqual(assignments, snapshot);
});

test('共同考試 view-model 相容只有補考紀錄的舊資料，已處理區待補考優先', () => {
  const exams = {
    noDate: exam('no-date', '無日期', { [keyA]: { course: courseA, checks: [] } }),
    later: exam('later', '較晚未考試', { [keyA]: { course: courseA, due: due('2026-09-15'), checks: [] } }),
    earlier: exam('earlier', '同日較晚節次', { [keyA]: { course: courseA, due: due('2026-09-06', 4), checks: [] } }),
    sameDayEarlier: exam('same-day-earlier', '同日較早節次', { [keyA]: { course: courseA, due: due('2026-09-06', 2), checks: [] } }),
    partial: exam('partial', '部分班級已考試', {
      [keyA]: { course: courseA, due: due('2026-09-03'), lastCheck: { id: 'check', dateKey: '2026-09-03' } },
      [keyB]: { course: courseB, due: due('2026-09-04'), checks: [] }
    }),
    pending: exam('pending', '待補考', { [keyA]: { course: courseA, due: due('2026-08-20'), makeups: {
      one: { seat: 1, status: 'pending', absentDateKey: '2026-08-20' }
    } } }),
    completed: exam('completed', '已完成補考', { [keyA]: { course: courseA, due: due('2026-08-01'), makeups: {
      one: { seat: 1, status: 'completed', absentDateKey: '2026-08-01', completedAt: '2026-09-11 12:30' }
    } } }),
    cancelledLegacy: exam('cancelled-legacy', '舊版取消紀錄', { [keyA]: { course: courseA, due: due('2026-08-01'), status: 'cancelled', lastCheck: { id: 'legacy-check', dateKey: '2026-09-20' } } })
  };
  const snapshot = structuredClone(exams);

  const items = buildCommonExamView(exams)[0].exams;

  assert.deepEqual(items.map((item) => item.examId), [
    'same-day-earlier', 'earlier', 'later', 'no-date', 'pending', 'cancelled-legacy', 'completed', 'partial'
  ]);
  assert.equal(items[0].firstPeriod, 2);
  assert.equal(items[1].firstPeriod, 4);
  const partial = items.find((item) => item.examId === 'partial');
  assert.equal(partial.progressStatus, 'processed');
  assert.equal(partial.processedClassCount, 1);
  assert.equal(partial.classCount, 2);
  assert.equal(items.find((item) => item.examId === 'pending').pendingMakeupCount, 1);
  assert.equal(items.find((item) => item.examId === 'completed').latestProcessedDateKey, '2026-09-11');
  assert.deepEqual(exams, snapshot);
});
