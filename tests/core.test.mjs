import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentAppliesToCourse, calculateWeight, cachesToDelete, countSessionDraws, escapeHtml, getDrawPhase, getDrawRound, isUndoRevisionCurrent, monthKeyForDate, pickWeighted, rollMonthlyState, shouldSuppressSeatClick, updateCourseState } from '../core.mjs';

test('權重依公式計算並套用上限', () => {
  assert.equal(calculateWeight({ incomplete: 2, reminders: 7, manual: 1, cap: 6 }), 6);
  assert.equal(calculateWeight({ incomplete: 1, reminders: 2, manual: 0, cap: 6 }), 2);
});

test('加權抽籤依累積權重選取', () => {
  const pool = [{ seat: 1, weight: 1 }, { seat: 2, weight: 3 }];
  assert.equal(pickWeighted(pool, 0), 1);
  assert.equal(pickWeighted(pool, 0.26), 2);
  assert.equal(pickWeighted([], 0.5), null);
});

test('不重複抽籤耗盡後明確回報本輪完成', () => {
  const active = [1, 2, 3];
  assert.deepEqual(getDrawRound(active, [3], [1], false), { candidates: [2], availableCount: 2, exhausted: false });
  assert.deepEqual(getDrawRound(active, [3], [1, 2], false), { candidates: [], availableCount: 2, exhausted: true });
  assert.deepEqual(getDrawRound(active, [3], [1, 2], true), { candidates: [1, 2], availableCount: 2, exhausted: false });
});

test('不重複最後一位先顯示結果，確認後才進完成畫面', () => {
  const exhausted = getDrawRound([1, 2], [], [1, 2], false);
  assert.equal(getDrawPhase(exhausted, 2), 'final-result');
  assert.equal(getDrawPhase(exhausted, null), 'complete');
});

test('已抽座號暫時排除再解除仍保留在同輪歷史', () => {
  const drawnHistory = [2];
  assert.deepEqual(getDrawRound([1, 2, 3], [2], drawnHistory, false).candidates, [1, 3]);
  assert.deepEqual(getDrawRound([1, 2, 3], [], drawnHistory, false).candidates, [1, 3]);
});

test('本節抽籤次數由活動記錄計算，可重複抽籤也逐筆計入', () => {
  const records = [{ kind: '作業檢查' }, { kind: '加權抽籤' }, { kind: '加權抽籤' }];
  assert.equal(countSessionDraws(records, 1), 2);
  assert.equal(countSessionDraws(records, null), 0);
});

test('舊復原只能對緊接的持久操作生效', () => {
  assert.equal(isUndoRevisionCurrent(4, 4), true);
  assert.equal(isUndoRevisionCurrent(4, 5), false);
  assert.equal(isUndoRevisionCurrent(null, 5), false);
});

test('長按 click 抑制只對同一座號與同一操作生效', () => {
  const suppressed = { seat: 12, context: 'homework', pointerId: 7 };
  assert.equal(shouldSuppressSeatClick(suppressed, 12, 'homework', 7), true);
  assert.equal(shouldSuppressSeatClick(suppressed, 13, 'homework', 7), false);
  assert.equal(shouldSuppressSeatClick(suppressed, 12, 'exclude', 7), false);
  assert.equal(shouldSuppressSeatClick(suppressed, 12, 'homework', 8), false);
});

test('換月只重置提醒與手動月加權並保留活動記錄', () => {
  const activityRecords = [{ id: 'a1', kind: '課堂提醒' }];
  const course = { monthKey: '2026-08', reminderCounts: { 2: 3 }, manualWeight: { 7: 2 }, pendingHomework: [{ id: 'h1' }], activityRecords };
  const rolled = rollMonthlyState(course, '2026-09');
  assert.equal(rolled.reset, true);
  assert.equal(rolled.data.monthKey, '2026-09');
  assert.deepEqual(rolled.data.reminderCounts, {});
  assert.deepEqual(rolled.data.manualWeight, {});
  assert.equal(rolled.data.activityRecords, activityRecords);
  assert.equal(rolled.data.pendingHomework, course.pendingHomework);
  assert.equal(monthKeyForDate(new Date(2026, 8, 1)), '2026-09');
});

test('更新單一班級科目不會修改其他課程資料', () => {
  const original = { '805': { sessionActive: false, pendingHomework: [1] }, h203: { sessionActive: false, pendingHomework: [9] } };
  const next = updateCourseState(original, '805', { sessionActive: true, pendingHomework: [1, 2] });
  assert.deepEqual(next['805'], { sessionActive: true, pendingHomework: [1, 2] });
  assert.deepEqual(next.h203, original.h203);
  assert.notEqual(next['805'], original['805']);
});

test('使用者標題在文字與 aria-label 中安全 escaping', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escapeHtml(`作業' aria-label='惡意`), '作業&#39; aria-label=&#39;惡意');
});

test('PWA 只清除本 App 專用前綴的舊快取', () => {
  const keys = ['teacher-classroom-assistant-v02', 'teacher-classroom-assistant-v03', 'teacher-classroom-assistant-v031', 'another-repo-v9'];
  assert.deepEqual(cachesToDelete(keys, 'teacher-classroom-assistant-', 'teacher-classroom-assistant-v031'), ['teacher-classroom-assistant-v02', 'teacher-classroom-assistant-v03']);
});

test('同科作業項目可共享，但各班學生資料仍獨立', () => {
  const assignment = { title: '理化習作 p.40', classes: ['805', '806', '807'] };
  assert.equal(assignmentAppliesToCourse(assignment, '805'), true);
  assert.equal(assignmentAppliesToCourse(assignment, '806'), true);
  assert.equal(assignmentAppliesToCourse(assignment, '807'), true);
  assert.equal(assignmentAppliesToCourse(assignment, 'h203'), false);
  const courseData = { '805': { pendingHomework: [] }, '806': { pendingHomework: [] } };
  const next = updateCourseState(courseData, '806', { pendingHomework: [{ seat: 3, item: assignment.title }] });
  assert.deepEqual(next['805'].pendingHomework, []);
  assert.equal(next['806'].pendingHomework.length, 1);
});

test('高中物理共享項目可由三班開啟，學生狀態仍按課程 key 隔離', () => {
  const assignment = { title: '單擺實驗預習', classes: ['h203', 'h204', 'h205'] };
  for (const courseId of ['h203', 'h204', 'h205']) assert.equal(assignmentAppliesToCourse(assignment, courseId), true);
  const original = { h203: { sessionActive: true }, h204: { sessionActive: false }, h205: { sessionActive: false } };
  const next = updateCourseState(original, 'h204', { sessionActive: true });
  assert.equal(next.h203.sessionActive, true);
  assert.equal(next.h204.sessionActive, true);
  assert.equal(next.h205.sessionActive, false);
});
