export function calculateWeight({ incomplete = 0, reminders = 0, manual = 0, cap = 6 }) {
  return Math.min(cap, 1 + Number(incomplete) + Math.floor(Number(reminders) / 3) + Number(manual));
}
export function pickWeighted(entries, randomValue = Math.random()) {
  if (!entries.length) return null;
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = Math.max(0, Math.min(0.999999999, randomValue)) * total;
  for (const entry of entries) { cursor -= entry.weight; if (cursor < 0) return entry.seat; }
  return entries.at(-1).seat;
}

export function getDrawRound(activeSeats, excludedSeats = [], drawnSeats = [], repeat = false) {
  const available = activeSeats.filter((seat) => !excludedSeats.includes(seat));
  const candidates = repeat ? available : available.filter((seat) => !drawnSeats.includes(seat));
  return { candidates, availableCount: available.length, exhausted: !repeat && available.length > 0 && candidates.length === 0 };
}

export function getDrawPhase(round, drawnSeat) {
  if (round.availableCount === 0) return 'empty';
  if (drawnSeat != null) return round.exhausted ? 'final-result' : 'result';
  return round.exhausted ? 'complete' : 'ready';
}

export function countSessionDraws(activityRecords = [], sessionStartIndex = null) {
  const start = sessionStartIndex == null ? activityRecords.length : sessionStartIndex;
  return activityRecords.slice(start).filter((record) => record.kind === '加權抽籤').length;
}

export function monthKeyForDate(date = new Date()) {
  const year = date.getFullYear();
  return `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function rollMonthlyState(courseData, currentMonthKey) {
  if (!courseData.monthKey) return { data: { ...courseData, monthKey: currentMonthKey }, reset: false };
  if (courseData.monthKey === currentMonthKey) return { data: courseData, reset: false };
  return { data: { ...courseData, monthKey: currentMonthKey, reminderCounts: {}, manualWeight: {} }, reset: true };
}

export function shouldSuppressSeatClick(suppressedClick, seat, context, pointerId = null) {
  if (!suppressedClick || suppressedClick.seat !== seat || suppressedClick.context !== context) return false;
  if (pointerId == null || suppressedClick.pointerId == null) return true;
  return suppressedClick.pointerId === pointerId;
}

export function isUndoRevisionCurrent(undoRevision, mutationRevision) {
  return undoRevision != null && undoRevision === mutationRevision;
}

export function updateCourseState(courseData, courseId, patch) {
  return { ...courseData, [courseId]: { ...courseData[courseId], ...patch } };
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

export function cachesToDelete(keys, prefix, currentName) {
  return keys.filter((key) => key.startsWith(prefix) && key !== currentName);
}

export function assignmentAppliesToCourse(assignment, courseId) {
  return Array.isArray(assignment.classes) && assignment.classes.includes(courseId);
}
