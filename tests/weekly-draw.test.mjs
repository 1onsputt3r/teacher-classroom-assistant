import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWeeklyDrawAdjustment,
  courseDataKey,
  createWeightedDrawPool,
  drawWeekRange,
  pickWeightedDrawSeat,
  weeklyDrawCounts
} from '../preview-v2/core.mjs';

const courseKey = '805班・理化';
const sessionKey = (dateKey, slotId = 'p1', key = courseKey) => `${dateKey}:${slotId}:${key}`;
const history = (...seats) => ({ history: seats.map((seat) => ({ seat, absent: false })) });

test('每週固定由星期一開始、星期日結束，星期日仍屬同一週', () => {
  for (const dateKey of ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']) {
    assert.deepEqual(drawWeekRange(dateKey), { startDateKey: '2026-09-07', endDateKey: '2026-09-13' });
  }
  assert.deepEqual(drawWeekRange('2026-09-14'), { startDateKey: '2026-09-14', endDateKey: '2026-09-20' });
});

test('每週日期範圍正確跨月、跨年及閏日，不依賴月份重置', () => {
  assert.deepEqual(drawWeekRange('2026-09-01'), { startDateKey: '2026-08-31', endDateKey: '2026-09-06' });
  assert.deepEqual(drawWeekRange('2026-12-31'), { startDateKey: '2026-12-28', endDateKey: '2027-01-03' });
  assert.deepEqual(drawWeekRange('2027-01-03'), { startDateKey: '2026-12-28', endDateKey: '2027-01-03' });
  assert.deepEqual(drawWeekRange('2027-01-04'), { startDateKey: '2027-01-04', endDateKey: '2027-01-10' });
  assert.deepEqual(drawWeekRange('2028-02-29'), { startDateKey: '2028-02-28', endDateKey: '2028-03-05' });
  assert.deepEqual(drawWeekRange('2026-03-08'), { startDateKey: '2026-03-02', endDateKey: '2026-03-08' });
});

test('每週日期範圍拒絕無效日期與非標準日期鍵', () => {
  for (const dateKey of [undefined, null, '', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-9-01', '2026-09-01T00:00:00Z', 20260901, new Date(2026, 8, 1), {}]) {
    assert.equal(drawWeekRange(dateKey), null);
  }
});

test('每週有效抽中次數包含同班同科所有節次及重複抽中，不重複加計當前結果與本輪座號', () => {
  const sessions = {
    [sessionKey('2026-09-07')]: {
      history: [{ seat: 1 }, { seat: 1, absent: false }, { seat: 2, absent: true }, { seat: '3' }],
      currentSeat: 1,
      seatsThisRound: [1, 1, 2, 3, 4],
      excludedSeats: [3]
    },
    [sessionKey('2026-09-07', 'p8')]: history(1, 2),
    [sessionKey('2026-09-09', 'p3')]: history(2, 3),
    [sessionKey('2026-09-13')]: history(3),
    [sessionKey('2026-09-06')]: history(1, 4),
    [sessionKey('2026-09-14')]: history(1, 4),
    [sessionKey('2026-09-08', 'p1', '806班・理化')]: history(4),
    [sessionKey('2026-09-08', 'p2', '805班・生物')]: history(4)
  };
  assert.deepEqual(weeklyDrawCounts(sessions, courseKey, '2026-09-10'), { 1: 3, 2: 2, 3: 3 });
  assert.deepEqual(weeklyDrawCounts(sessions, courseKey, '2026-09-13'), { 1: 3, 2: 2, 3: 3 });
  assert.deepEqual(weeklyDrawCounts(sessions, courseKey, '2026-09-14'), { 1: 1, 4: 1 });
});

test('新授課班級的冒號課程鍵完整比對，不混用其他班級或前綴相近的課程', () => {
  const key = courseDataKey({ teachingClassId: 'class:805:chemistry' });
  const sessions = {
    [sessionKey('2026-09-07', 'p1', key)]: history(12),
    [sessionKey('2026-09-10', 'p2', key)]: history(12, 18),
    [sessionKey('2026-09-08', 'p1', `${key}:extra`)]: history(9),
    [sessionKey('2026-09-08', 'p2', 'teaching-class:class:806:chemistry')]: history(9),
    [sessionKey('2026-09-08', 'p3', 'teaching-class:class:805:biology')]: history(9),
    [sessionKey('2026-09-08', 'p4')]: history(9)
  };
  assert.deepEqual(weeklyDrawCounts(sessions, key, '2026-09-09'), { 12: 2, 18: 1 });
});

test('跨月與跨年仍計入同週紀錄，換週只改變計算範圍而保留舊歷史', () => {
  const sessions = {
    [sessionKey('2026-08-30')]: history(1),
    [sessionKey('2026-08-31')]: history(2),
    [sessionKey('2026-09-06')]: history(2),
    [sessionKey('2026-09-07')]: history(3),
    [sessionKey('2026-12-27')]: history(1),
    [sessionKey('2026-12-28')]: history(2),
    [sessionKey('2027-01-03')]: history(2),
    [sessionKey('2027-01-04')]: history(3)
  };
  const before = structuredClone(sessions);
  assert.deepEqual(weeklyDrawCounts(sessions, courseKey, '2026-09-01'), { 2: 2 });
  assert.deepEqual(weeklyDrawCounts(sessions, courseKey, '2027-01-01'), { 2: 2 });
  assert.deepEqual(weeklyDrawCounts(sessions, courseKey, '2027-01-04'), { 3: 1 });
  assert.deepEqual(sessions, before);
});

test('缺席重抽即時扣除該筆有效次數，但相同座號其他有效抽中仍保留', () => {
  const key = sessionKey('2026-09-07');
  const sessions = { [key]: history(12, 12, 18) };
  assert.deepEqual(weeklyDrawCounts(sessions, courseKey, '2026-09-07'), { 12: 2, 18: 1 });
  const next = { [key]: { ...sessions[key], history: sessions[key].history.map((record, index) => index === 0 ? { ...record, absent: true } : record) } };
  assert.deepEqual(weeklyDrawCounts(next, courseKey, '2026-09-07'), { 12: 1, 18: 1 });
  assert.deepEqual(weeklyDrawCounts(sessions, courseKey, '2026-09-07'), { 12: 2, 18: 1 });
});

test('忽略損壞的節次或歷史，不從不存在的歷史猜測抽中次數', () => {
  const sessions = {
    [sessionKey('2026-09-07')]: { history: [null, [], {}, '1', { seat: 0 }, { seat: -1 }, { seat: 1.5 }, { seat: NaN }, { seat: Infinity }, { seat: Number.MAX_SAFE_INTEGER + 1 }, { seat: true }, { seat: null }, { seat: [] }, { seat: {} }, { seat: 'not-a-seat' }, { seat: '' }, { seat: 1, absent: true }, { seat: 7 }] },
    [sessionKey('2026-09-08')]: null,
    [sessionKey('2026-09-08', 'p2')]: [],
    [sessionKey('2026-09-09')]: { history: {}, currentSeat: 2, seatsThisRound: [2] },
    [sessionKey('2026-09-09', 'p2')]: { currentSeat: 2, seatsThisRound: [2] },
    [sessionKey('2026-09-10')]: { history: null },
    [sessionKey('2026-09-11', '')]: history(2),
    [sessionKey('2026-09-11', ' ')]: history(2),
    [sessionKey('2026-09-00')]: history(2),
    [sessionKey('2026-09-31')]: history(2),
    [`2026-09-07:${courseKey}`]: history(2),
    invalid: history(2)
  };
  assert.deepEqual(weeklyDrawCounts(sessions, courseKey, '2026-09-07'), { 7: 1 });
  for (const input of [null, [], false, 'invalid']) assert.deepEqual(weeklyDrawCounts(input, courseKey, '2026-09-07'), {});
  assert.deepEqual(weeklyDrawCounts(sessions, courseKey, '2026-09-31'), {});
  assert.deepEqual(weeklyDrawCounts(sessions, null, '2026-09-07'), {});
  assert.deepEqual(weeklyDrawCounts(sessions, '', '2026-09-07'), {});
});

test('週調整在原始權重上限之後除以一加本週次數，不永久改寫各項加權來源', () => {
  const homeworkWeights = Object.freeze({ 1: 4 });
  const reminderWeights = Object.freeze({ 1: 2 });
  const manualWeights = Object.freeze({ 1: 5 });
  const pool = Object.freeze(createWeightedDrawPool({
    activeSeats: [1, 2, 3], homeworkWeights, reminderWeights, manualWeights, cap: 6
  }).map(Object.freeze));
  const counts = Object.freeze({ 1: 2, 2: 1 });
  const adjusted = applyWeeklyDrawAdjustment(pool, counts);
  assert.deepEqual(adjusted.map(({ seat, baseWeight, weeklyCount, weight }) => ({ seat, baseWeight, weeklyCount, weight })), [
    { seat: 1, baseWeight: 6, weeklyCount: 2, weight: 2 },
    { seat: 2, baseWeight: 1, weeklyCount: 1, weight: 0.5 },
    { seat: 3, baseWeight: 1, weeklyCount: 0, weight: 1 }
  ]);
  assert.notEqual(adjusted, pool);
  for (const [index, entry] of adjusted.entries()) {
    assert.notEqual(entry, pool[index]);
    const { baseWeight, weeklyCount, weight, ...sources } = entry;
    const { weight: originalWeight, ...originalSources } = pool[index];
    assert.deepEqual(sources, originalSources);
    assert.equal(baseWeight, originalWeight);
    assert.equal('baseWeight' in pool[index], false);
  }
  assert.deepEqual(homeworkWeights, { 1: 4 });
  assert.deepEqual(reminderWeights, { 1: 2 });
  assert.deepEqual(manualWeights, { 1: 5 });
  assert.deepEqual(counts, { 1: 2, 2: 1 });
  assert.deepEqual(applyWeeklyDrawAdjustment(pool, {}).map(({ weight }) => weight), [6, 1, 1]);
});

test('關閉額外加權仍從基本一套用本週遞減，且不改變本輪不重複與暫不抽取排除', () => {
  const options = { activeSeats: [1, 2, 3, 5], excludedSeats: [3], drawnSeats: [5], useWeighting: false, homeworkWeights: { 1: 9 } };
  const counts = { 1: 3, 2: 1, 3: 2, 5: 4 };
  assert.deepEqual(applyWeeklyDrawAdjustment(createWeightedDrawPool(options), counts).map(({ seat, baseWeight, weight }) => ({ seat, baseWeight, weight })), [
    { seat: 1, baseWeight: 1, weight: 0.25 },
    { seat: 2, baseWeight: 1, weight: 0.5 }
  ]);
  assert.deepEqual(applyWeeklyDrawAdjustment(createWeightedDrawPool({ ...options, allowRepeat: true }), counts).map(({ seat, weight }) => ({ seat, weight })), [
    { seat: 1, weight: 0.25 }, { seat: 2, weight: 0.5 }, { seat: 5, weight: 0.2 }
  ]);
});

test('週次數正規化為非負整數，保留額外卡池欄位且空卡池不報錯', () => {
  const pool = [1, 2, 3, 4, 5, 6, 7].map((seat) => ({ seat, weight: 1, label: `${seat} 號` }));
  const counts = { 1: -2, 2: '2', 3: 2.9, 4: Infinity, 5: NaN, 6: 'invalid', 7: true };
  const adjusted = applyWeeklyDrawAdjustment(pool, counts);
  assert.deepEqual(adjusted.map(({ weeklyCount }) => weeklyCount), [0, 2, 2, 0, 0, 0, 0]);
  assert.deepEqual(adjusted.map(({ label }) => label), pool.map(({ label }) => label));
  assert.deepEqual(applyWeeklyDrawAdjustment(), []);
  assert.deepEqual(applyWeeklyDrawAdjustment(pool, null).map(({ weeklyCount }) => weeklyCount), [0, 0, 0, 0, 0, 0, 0]);
});

test('抽籤器以小數有效權重選取，權重低於一不會四捨五入或失去機會', () => {
  const pool = applyWeeklyDrawAdjustment([{ seat: 1, weight: 1 }, { seat: 2, weight: 1 }], { 1: 3, 2: 1 });
  assert.equal(pickWeightedDrawSeat(pool, 0), 1);
  assert.equal(pickWeightedDrawSeat(pool, 1 / 3 - 1e-10), 1);
  assert.equal(pickWeightedDrawSeat(pool, 1 / 3), 2);
  assert.equal(pickWeightedDrawSeat(pool, 0.999999), 2);
  const tinyPool = applyWeeklyDrawAdjustment([{ seat: 1, weight: 1 }, { seat: 2, weight: 1 }], { 1: 999, 2: 999 });
  assert.equal(pickWeightedDrawSeat(tinyPool, 0.49), 1);
  assert.equal(pickWeightedDrawSeat(tinyPool, 0.5), 2);
  assert.equal(pickWeightedDrawSeat(applyWeeklyDrawAdjustment([], {})), null);
});
