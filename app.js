import { assignmentAppliesToCourse, calculateWeight, countSessionDraws, escapeHtml, getDrawPhase, getDrawRound, isUndoRevisionCurrent, monthKeyForDate, pickWeighted, rollMonthlyState, shouldSuppressSeatClick, updateCourseState } from './core.mjs';

const app = document.querySelector('#app');
const STORAGE_KEY = 'teacher-classroom-assistant-v03';
const disabledSeats = [4, 36];
const activeSeats = Array.from({ length: 52 }, (_, index) => index + 1).filter((seat) => !disabledSeats.includes(seat));

const classLabels = { '805': '805', '806': '806', '807': '807', h203: '高二3', h204: '高二4', h205: '高二5' };
const juniorPeers = ['805', '806', '807'];
const seniorPeers = ['h203', 'h204', 'h205'];
function makeCourseConfig({ id, classLabel, subject, subjectGroup, period, time, remaining, next, homework, exam, nextDue, peers }) {
  return { id, label: `${classLabel}・${subject}`, classLabel, subject, subjectGroup, period, time, remaining, next, homework, exam, nextDue, peers };
}
const courseConfigs = {
  '805': makeCourseConfig({ id: '805', classLabel: '805', subject: '理化', subjectGroup: 'junior-chem', period: '第 3 節', time: '10:10–11:00', remaining: '剩餘 24 分鐘', next: '高二3・物理　13:10', homework: '理化習作 p.34', exam: '第 1 章小考', nextDue: '第 2 章小考・8/28', peers: juniorPeers }),
  '806': makeCourseConfig({ id: '806', classLabel: '806', subject: '理化', subjectGroup: 'junior-chem', period: '第 2 節', time: '09:10–10:00', remaining: '下一堂課', next: '805・理化　10:10', homework: '理化習作 p.34', exam: '第 1 章小考', nextDue: '第 2 章小考・8/28', peers: juniorPeers }),
  '807': makeCourseConfig({ id: '807', classLabel: '807', subject: '理化', subjectGroup: 'junior-chem', period: '第 4 節', time: '11:10–12:00', remaining: '稍後課程', next: '高二3・物理　13:10', homework: '理化習作 p.34', exam: '第 1 章小考', nextDue: '第 2 章小考・8/28', peers: juniorPeers }),
  h203: makeCourseConfig({ id: 'h203', classLabel: '高二3', subject: '物理', subjectGroup: 'senior-physics', period: '第 5 節', time: '13:10–14:00', remaining: '下一堂課', next: '805・理化　明天 10:10', homework: '波動講義 p.8', exam: '牛頓運動小考', nextDue: '單擺實驗預習・下週', peers: seniorPeers }),
  h204: makeCourseConfig({ id: 'h204', classLabel: '高二4', subject: '物理', subjectGroup: 'senior-physics', period: '第 6 節', time: '14:10–15:00', remaining: '稍後課程', next: '高二5・物理　明天 09:10', homework: '波動講義 p.8', exam: '牛頓運動小考', nextDue: '單擺實驗預習・下週', peers: seniorPeers }),
  h205: makeCourseConfig({ id: 'h205', classLabel: '高二5', subject: '物理', subjectGroup: 'senior-physics', period: '第 1 節', time: '08:10–09:00', remaining: '明日課程', next: '高二4・物理　14:10', homework: '波動講義 p.8', exam: '牛頓運動小考', nextDue: '單擺實驗預習・下週', peers: seniorPeers })
};
const navItems = [['today', '今日'], ['records', '記錄'], ['draw', '抽籤'], ['pending', '待處理'], ['more', '更多']];

function makeCourseData(config, overrides = {}) {
  return {
    sessionActive: false, sessionStartIndex: null, activityRecords: [],
    homeworkMissing: [], leaveSeats: [], leaveMode: false, examAbsent: [], reminderSeats: [], reminderType: '',
    drawRepeat: false, drawExcluded: [], drawExcludeOpen: false, drawnSeats: [], drawnSeat: null, weightCap: 6,
    manualWeightOpen: false, manualSeat: 1, pendingHomework: [], pendingExams: [], monthKey: monthKeyForDate(), reminderCounts: {}, manualWeight: {},
    activeHomeworkItem: config.homework, activeExamItem: config.exam, ...overrides
  };
}

const initialCourseData = () => ({
  '805': makeCourseData(courseConfigs['805'], {
    pendingHomework: [
      { id: 'h1', seat: 12, item: '理化習作 p.32', date: '8/21' },
      { id: 'h2', seat: 12, item: '實驗紀錄單', date: '8/19' },
      { id: 'h3', seat: 27, item: '理化習作 p.30', date: '8/19' },
      { id: 'h4', seat: 41, item: '密度練習單', date: '8/14' }
    ],
    pendingExams: [{ id: 'e1', seat: 18, item: '第 1 章小考', date: '8/20' }],
    reminderCounts: { 2: 3, 7: 1, 12: 2, 29: 1 }, manualWeight: { 7: 2, 18: 1, 33: 2 }
  }),
  '806': makeCourseData(courseConfigs['806']),
  '807': makeCourseData(courseConfigs['807']),
  'h203': makeCourseData(courseConfigs.h203, {
    pendingHomework: [{ id: 'ph1', seat: 6, item: '波動講義 p.6', date: '8/22' }],
    pendingExams: [], reminderCounts: { 5: 3, 21: 1 }, manualWeight: { 11: 1, 24: 2 }
  }),
  'h204': makeCourseData(courseConfigs.h204),
  'h205': makeCourseData(courseConfigs.h205)
});

const initialState = () => ({
  page: 'today', course: '805', courseMenu: false, syncStatus: 'synced', nearEnd: false,
  detailMenu: null, createKind: null, createTitle: '', createDate: 'today', createClasses: ['805'], createSource: 'records',
  assignments: [
    { id: 'r1', title: '理化習作 p.34', kind: '作業', date: '今天', classes: ['805', '806', '807'], subjectGroup: 'junior-chem' },
    { id: 'r2', title: '第 2 章小考', kind: '考試', date: '8/28', classes: ['805', '806', '807'], subjectGroup: 'junior-chem' },
    { id: 'r3', title: '波動講義 p.8', kind: '作業', date: '今天', classes: ['h203', 'h204', 'h205'], subjectGroup: 'senior-physics' }
  ],
  courseData: initialCourseData(), toast: ''
});

function normalizeCourseData(savedCourseData = {}) {
  const monthKey = monthKeyForDate();
  return Object.fromEntries(Object.entries(courseConfigs).map(([courseId, config]) => {
    const merged = { ...makeCourseData(config), ...(savedCourseData[courseId] || {}) };
    return [courseId, rollMonthlyState(merged, monthKey).data];
  }));
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...initialState(), ...saved, courseData: normalizeCourseData(saved.courseData), toast: '', courseMenu: false, detailMenu: null } : initialState();
  } catch { return initialState(); }
}

let state = loadState();
let undoAction = null;
let toastTimer = null;
let longPressTimer = null;
let suppressSeatClick = null;
let suppressSeatClickTimer = null;
let pendingFocus = null;
let mutationRevision = 0;
let undoRevision = null;
let installPromptEvent = null;
let installState = window.matchMedia('(display-mode: standalone)').matches ? 'installed' : 'fallback';

const currentData = () => state.courseData[state.course];
const currentConfig = () => courseConfigs[state.course];
const clone = (value) => JSON.parse(JSON.stringify(value));

function persist() {
  const { toast, courseMenu, detailMenu, ...saved } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}
function invalidateUndo() {
  clearTimeout(toastTimer); undoAction = null; undoRevision = null;
  if (state.toast) state = { ...state, toast: '' };
}
function beginPersistentMutation() {
  invalidateUndo(); mutationRevision += 1;
}
function updateState(patch, shouldPersist = true, focus = null) {
  if (shouldPersist) beginPersistentMutation();
  state = { ...state, ...patch }; pendingFocus = focus;
  if (shouldPersist) persist();
  render();
}
function updateCourse(patch, shouldPersist = true, focus = null, courseId = state.course) {
  if (shouldPersist) beginPersistentMutation();
  state = { ...state, courseData: updateCourseState(state.courseData, courseId, patch) }; pendingFocus = focus;
  if (shouldPersist) persist();
  render();
}
function restoreCourse(courseId, snapshot, page = null) {
  beginPersistentMutation();
  state = { ...state, ...(page ? { page } : {}), courseData: { ...state.courseData, [courseId]: clone(snapshot) } };
  pendingFocus = page ? { type: 'heading' } : null;
  persist(); render();
}
function startSessionFields(data) {
  return data.sessionActive ? {} : { sessionActive: true, sessionStartIndex: data.activityRecords.length };
}
function toggleIn(list, value) { return list.includes(value) ? list.filter((item) => item !== value) : [...list, value].sort((a, b) => a - b); }
function listSeats(list, emptyCopy = '尚未選擇') { return list.length ? list.map((seat) => `${seat} 號`).join('、') : emptyCopy; }
function setToast(message, undo = null, focus = null) {
  clearTimeout(toastTimer); undoAction = undo; undoRevision = undo ? mutationRevision : null; state.toast = message; pendingFocus = focus; render();
  toastTimer = setTimeout(() => { state.toast = ''; undoAction = null; undoRevision = null; render(); }, 6500);
}
function syncCopy() {
  if (state.syncStatus === 'offline') return ['離線・3 筆待同步', 'offline'];
  if (state.syncStatus === 'failed') return ['同步失敗', 'failed'];
  return ['同步完成', 'synced'];
}
function pendingCountsFor(seat, data = currentData()) { return data.pendingHomework.filter((item) => item.seat === seat).length; }
function weightDetails(seat, data = currentData()) {
  const incomplete = pendingCountsFor(seat, data), reminders = Number(data.reminderCounts[seat] || 0), manual = Number(data.manualWeight[seat] || 0);
  return { incomplete, reminders, manual, total: calculateWeight({ incomplete, reminders, manual, cap: data.weightCap }) };
}

function applyPendingFocus() {
  const focus = pendingFocus; pendingFocus = null;
  if (!focus) return;
  const element = focus.type === 'seat'
    ? document.querySelector(`[data-seat="${focus.seat}"][data-context="${focus.context}"]`)
    : focus.type === 'selector' ? document.querySelector(focus.selector) : document.querySelector('main h1');
  if (element) {
    if (focus.type === 'heading') element.setAttribute('tabindex', '-1');
    element.focus({ preventScroll: focus.type === 'seat' });
  }
}

function headerTemplate() {
  const config = currentConfig(); const [syncText, syncClass] = syncCopy();
  return `<header class="topbar"><div class="topbar-inner"><div class="course-switch-wrap">
    <button class="course-switch" type="button" data-action="course-menu" aria-expanded="${state.courseMenu}" aria-haspopup="true"><span class="brand-mark" aria-hidden="true">課</span><span class="brand-copy"><strong>老師課堂助手</strong><span>${config.label}　⌄</span></span></button>
    ${state.courseMenu ? `<div class="course-menu" role="menu" aria-label="切換班級與科目">${Object.entries(courseConfigs).map(([id, item]) => `<button type="button" role="menuitemradio" aria-checked="${id === state.course}" data-action="switch-course" data-course="${id}">${item.label}${id === state.course ? '<span>目前</span>' : ''}</button>`).join('')}</div>` : ''}</div>
    <button class="sync-pill ${syncClass}" type="button" data-action="cycle-sync" aria-label="同步狀態：${syncText}。點擊切換示範狀態">${syncText}</button></div></header>`;
}
function bottomNavTemplate() {
  return `<nav class="bottom-nav" aria-label="主要導覽"><div class="bottom-nav-inner">${navItems.map(([id, label]) => `<button class="nav-button ${id === state.page ? 'active' : ''}" type="button" data-action="navigate" data-page="${id}" ${id === state.page ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</div></nav>`;
}
function pageHeader(kicker, title, description = '', back = 'today') {
  return `<div class="page-heading"><button class="back-button" type="button" data-action="navigate" data-page="${back}" aria-label="返回">‹</button><div><p class="eyebrow">${kicker}</p><h1>${title}</h1>${description ? `<p class="muted page-description">${description}</p>` : ''}</div></div>`;
}
function sessionQuickLink() {
  return currentData().sessionActive ? `<button class="session-quick-link" type="button" data-action="navigate" data-page="session"><span><strong>本節進行中</strong><small>查看摘要或結束本節</small></span><span aria-hidden="true">›</span></button>` : '';
}

function homePage() {
  const config = currentConfig(), data = currentData();
  const reminders = Object.values(data.reminderCounts).reduce((sum, value) => sum + Number(value), 0);
  return `<main id="main" class="content"><div class="home-grid"><div><section class="course-card" aria-labelledby="course-title">
    <p class="eyebrow">依課表自動選擇・${config.period}</p><h1 id="course-title">${config.label}</h1>
    <div class="course-meta"><strong>${config.time}</strong><span>${config.remaining}</span><span>${data.sessionActive ? '本節進行中' : '本節尚未記錄'}</span></div><div class="next-class"><span>下一堂</span><strong>${config.next}</strong></div>
    ${data.sessionActive ? '<button class="course-session-link" type="button" data-action="navigate" data-page="session">本節摘要／結束本節　›</button>' : ''}</section>${state.nearEnd ? nearEndCard() : ''}</div>
    <div class="home-side"><section class="due-section" aria-labelledby="due-title"><h2 id="due-title">本節／下次要處理</h2><div class="due-grid">
      <button class="due-card" type="button" data-action="open-workflow" data-page="homework"><span>本節作業</span><strong>${escapeHtml(data.activeHomeworkItem)}</strong><small>直接進入檢查</small></button>
      <button class="due-card" type="button" data-action="navigate" data-page="records"><span>下次要處理</span><strong>${escapeHtml(config.nextDue)}</strong><small>查看已建立項目</small></button></div></section>
      <section class="section" aria-labelledby="pending-title"><div class="section-title-row"><h2 id="pending-title">待處理摘要</h2><button class="text-button" type="button" data-action="navigate" data-page="pending">看明細</button></div><div class="summary-strip">
        <button class="summary-card" type="button" data-action="navigate" data-page="pending"><strong>${data.pendingHomework.length}</strong><span>待補交筆數</span></button><button class="summary-card" type="button" data-action="navigate" data-page="pending"><strong>${data.pendingExams.length}</strong><span>待補考筆數</span></button><button class="summary-card" type="button" data-action="navigate" data-page="pending"><strong>${reminders}</strong><span>本月提醒筆數</span></button></div></section>
      <section class="section" aria-labelledby="actions-title"><h2 id="actions-title">本節操作</h2><div class="action-grid"><button class="action-card" type="button" data-action="open-workflow" data-page="homework"><strong>檢查作業</strong><span>${escapeHtml(data.activeHomeworkItem)}</span></button><button class="action-card" type="button" data-action="open-workflow" data-page="exam"><strong>考試點名</strong><span>${escapeHtml(data.activeExamItem)}</span></button><button class="action-card" type="button" data-action="open-workflow" data-page="reminder"><strong>課堂提醒</strong><span>先選座號，再選提醒類型</span></button><button class="action-card featured" type="button" data-action="navigate" data-page="draw"><strong>加權抽籤</strong><span>預設不重複，可直接抽取</span></button></div></section></div></div></main>`;
}
function nearEndCard() {
  const data = currentData();
  const currentCount = data.sessionActive ? data.activityRecords.length - (data.sessionStartIndex ?? data.activityRecords.length) : 0;
  return `<section class="closing-card" aria-labelledby="closing-title"><div><p class="eyebrow">距下課約 5 分鐘</p><h2 id="closing-title">本節摘要</h2></div><div class="closing-stats"><span><strong>${currentCount}</strong> 筆操作</span><span><strong>${data.homeworkMissing.length}</strong> 位未儲存缺交</span><span><strong>${data.drawExcluded.length}</strong> 位暫不抽取</span></div><div class="stack-actions"><button class="primary-button" type="button" data-action="create" data-source="closing" data-kind="homework">交代／建立下次作業</button><button class="secondary-button" type="button" data-action="create" data-source="closing" data-kind="exam">建立未來考試</button></div></section>`;
}

function seatStatus(context, seat) {
  const data = currentData();
  if (context === 'homework') {
    if (data.leaveSeats.includes(seat)) return ['leave', '請假待確認'];
    if (data.homeworkMissing.includes(seat)) return ['selected', '缺交'];
    return ['', '已交'];
  }
  if (context === 'exam') return data.examAbsent.includes(seat) ? ['selected', '缺考'] : ['', '已考'];
  if (context === 'reminder') return data.reminderSeats.includes(seat) ? ['selected', '已選'] : ['', '未選'];
  if (context === 'exclude') return data.drawExcluded.includes(seat) ? ['selected', '暫不抽取'] : ['', '可抽取'];
  return ['', ''];
}
function seatGrid(context) {
  return `<div class="seat-grid" role="group" aria-label="座號 1 到 52">${Array.from({ length: 52 }, (_, index) => index + 1).map((seat) => {
    const disabled = disabledSeats.includes(seat); const [statusClass, statusLabel] = seatStatus(context, seat);
    return `<button class="seat ${statusClass} ${disabled ? 'disabled' : ''}" type="button" data-seat="${seat}" data-context="${context}" aria-pressed="${statusClass ? 'true' : 'false'}" aria-label="${seat} 號，${disabled ? '停用座號' : statusLabel}" ${disabled ? 'disabled' : ''}>${seat}</button>`;
  }).join('')}</div>`;
}
function homeworkPage() {
  const data = currentData();
  const selectedCount = data.homeworkMissing.length + data.leaveSeats.length;
  return `<main id="main" class="content narrow workflow-content">${pageHeader('本節操作', '檢查作業', `目前項目：${escapeHtml(data.activeHomeworkItem)}。點一下切換缺交；長按約 0.5 秒切換請假待確認。`)}${sessionQuickLink()}
    <section class="mode-panel" aria-label="目前選取模式"><div><strong>目前模式：${data.leaveMode ? '請假待確認' : '缺交'}</strong><span>${data.leaveMode ? '點座號標記請假' : '一般點擊標記缺交'}</span></div><button class="quiet-button" type="button" data-action="toggle-leave-mode" aria-pressed="${data.leaveMode}">${data.leaveMode ? '回到缺交模式' : '請假模式'}</button></section>${seatGrid('homework')}
    <section class="selection-summary" aria-live="polite"><div><span>已選缺交</span><strong>${listSeats(data.homeworkMissing)}</strong></div><div><span>請假待確認</span><strong>${listSeats(data.leaveSeats)}</strong></div></section><button class="primary-button sticky-action" type="button" data-action="save-homework">儲存本次選取（${selectedCount} 位）</button></main>`;
}
function examPage() {
  const data = currentData();
  return `<main id="main" class="content narrow workflow-content">${pageHeader('本節操作', '考試點名', `目前項目：${escapeHtml(data.activeExamItem)}。預設全班已考，只需點選缺考座號。`)}${sessionQuickLink()}<section class="mode-panel"><div><strong>目前模式：缺考</strong><span>已選座號會列在下方</span></div><span class="info-badge">不影響權重</span></section>${seatGrid('exam')}<section class="selection-summary" aria-live="polite"><div><span>已選缺考</span><strong>${listSeats(data.examAbsent)}</strong></div></section><button class="primary-button sticky-action" type="button" data-action="save-exam">儲存本次選取（${data.examAbsent.length} 位）</button></main>`;
}
function reminderPage() {
  const data = currentData(), types = ['趴睡', '聊天', '未依指示', '其他'];
  return `<main id="main" class="content narrow workflow-content">${pageHeader('本節操作', '課堂提醒', '先選一個或多個座號，再選提醒類型。儲存後可繼續登記下一批。')}${sessionQuickLink()}<section aria-labelledby="seat-step"><div class="step-title"><span>1</span><h2 id="seat-step">選擇座號</h2></div>${seatGrid('reminder')}</section><section class="section" aria-labelledby="type-step"><div class="step-title"><span>2</span><h2 id="type-step">選擇提醒</h2></div><div class="choice-grid">${types.map((type) => `<button class="choice-button ${data.reminderType === type ? 'selected' : ''}" type="button" data-action="reminder-type" data-type="${type}" aria-pressed="${data.reminderType === type}">${type}</button>`).join('')}</div></section><section class="selection-summary" aria-live="polite"><div><span>本批座號</span><strong>${listSeats(data.reminderSeats)}</strong></div><div><span>提醒類型</span><strong>${data.reminderType || '尚未選擇'}</strong></div></section><button class="primary-button sticky-action" type="button" data-action="save-reminder" ${!data.reminderSeats.length || !data.reminderType ? 'disabled' : ''}>儲存提醒（${data.reminderSeats.length} 位）</button></main>`;
}

function manualWeightPanel() {
  const data = currentData(), value = Number(data.manualWeight[data.manualSeat] || 0);
  return `<button class="disclosure-button" type="button" data-action="toggle-manual-weight" aria-expanded="${data.manualWeightOpen}"><span><strong>手動月加權</strong><small>選填・單一座號 +1／-1</small></span><span aria-hidden="true">${data.manualWeightOpen ? '−' : '＋'}</span></button>${data.manualWeightOpen ? `<div class="manual-weight-panel"><label for="manual-seat">座號</label><select id="manual-seat" data-action="manual-seat">${activeSeats.map((seat) => `<option value="${seat}" ${seat === data.manualSeat ? 'selected' : ''}>${seat} 號</option>`).join('')}</select><div class="manual-stepper"><button type="button" data-action="adjust-manual" data-delta="-1" aria-label="${data.manualSeat} 號手動月加權減一">−1</button><output aria-live="polite">目前 +${value}</output><button type="button" data-action="adjust-manual" data-delta="1" aria-label="${data.manualSeat} 號手動月加權加一">+1</button></div><p>只影響 ${currentConfig().label}，不公開全班排行。</p></div>` : ''}`;
}
function drawPage() {
  const data = currentData(), detail = data.drawnSeat ? weightDetails(data.drawnSeat) : null;
  const round = getDrawRound(activeSeats, data.drawExcluded, data.drawnSeats, data.drawRepeat);
  const phase = getDrawPhase(round, data.drawnSeat);
  return `<main id="main" class="content draw-layout"><div><div class="page-heading no-back"><div><p class="eyebrow">本節操作</p><h1>加權抽籤</h1><p class="muted page-description">目前課程：${currentConfig().label}。權重與本輪名單不會與其他課程共用。</p></div></div>${sessionQuickLink()}<div class="segmented" role="group" aria-label="抽籤模式"><button type="button" data-action="draw-mode" data-repeat="false" aria-pressed="${!data.drawRepeat}" class="${!data.drawRepeat ? 'active' : ''}">不重複</button><button type="button" data-action="draw-mode" data-repeat="true" aria-pressed="${data.drawRepeat}" class="${data.drawRepeat ? 'active' : ''}">可重複</button></div>
    <section class="draw-stage" aria-live="polite">${phase === 'empty' ? `<div class="round-complete"><p class="eyebrow">暫不抽取</p><h2>目前無人可抽</h2><p>請調整暫不抽取名單後再抽。</p><button class="secondary-button" type="button" data-action="toggle-exclude">調整暫不抽取</button></div>` : phase === 'complete' ? `<div class="round-complete"><p class="eyebrow">不重複抽籤</p><h2>本輪已完成</h2><p>已抽完 ${round.availableCount} 位可抽取座號。</p><button class="primary-button large" type="button" data-action="restart-draw-round">重新開始本輪</button></div>` : phase === 'result' || phase === 'final-result' ? `<p class="eyebrow">本次抽中</p><div class="draw-number">${data.drawnSeat}</div><p class="draw-label">號</p><div class="stack-actions"><button class="primary-button large" type="button" data-action="${phase === 'final-result' ? 'finish-draw-round' : 'draw'}">${phase === 'final-result' ? '完成本輪／下一步' : '下一位'}</button><button class="secondary-button" type="button" data-action="absent-redraw">不在場，排除並重抽</button></div>` : `<div class="draw-placeholder"><span>準備完成</span><strong>${round.candidates.length} 位可抽取</strong></div><button class="primary-button large" type="button" data-action="draw">抽一位</button>`}</section>
    ${detail ? `<details class="weight-detail"><summary>查看 ${data.drawnSeat} 號權重組成</summary><div class="formula"><span>基本 <strong>1</strong></span><span>未完成作業 <strong>+${detail.incomplete}</strong></span><span>提醒 ${detail.reminders} 次 <strong>+${Math.floor(detail.reminders / 3)}</strong></span><span>手動月加權 <strong>+${detail.manual}</strong></span><span class="formula-total">本次權重 <strong>${detail.total}</strong>／上限 ${data.weightCap}</span></div></details>` : ''}</div>
    <aside class="draw-settings"><button class="disclosure-button" type="button" data-action="toggle-exclude" aria-expanded="${data.drawExcludeOpen}"><span><strong>暫不抽取</strong><small>選填・${data.drawExcluded.length ? `${data.drawExcluded.length} 位` : '未設定'}</small></span><span aria-hidden="true">${data.drawExcludeOpen ? '−' : '＋'}</span></button>${data.drawExcludeOpen ? `<div class="exclude-panel">${seatGrid('exclude')}<p class="selected-line" aria-live="polite">暫不抽取：${listSeats(data.drawExcluded, '無')}</p></div>` : ''}${manualWeightPanel()}<label class="range-row" for="weight-cap"><span><strong>權重上限</strong><small>目前上限 ${data.weightCap}</small></span><input id="weight-cap" type="range" min="2" max="10" value="${data.weightCap}" data-action="weight-cap" /></label></aside></main>`;
}

function pendingPage() {
  const data = currentData();
  const homeworkStudents = new Set(data.pendingHomework.map((item) => item.seat)).size, examStudents = new Set(data.pendingExams.map((item) => item.seat)).size;
  const reminderStudents = Object.keys(data.reminderCounts).filter((seat) => data.reminderCounts[seat] > 0).length;
  const reminderRecords = Object.values(data.reminderCounts).reduce((sum, value) => sum + Number(value), 0);
  return `<main id="main" class="content"><div class="page-heading no-back"><div><p class="eyebrow">${currentConfig().label}・獨立資料</p><h1>待處理</h1><p class="muted page-description">切換課程後只顯示該班級＋科目的學生記錄。</p></div></div><div class="metric-grid"><article><span>待補交</span><strong>${data.pendingHomework.length}</strong><small>${homeworkStudents} 位學生・${new Set(data.pendingHomework.map((item) => item.item)).size} 個項目</small></article><article><span>待補考</span><strong>${data.pendingExams.length}</strong><small>${examStudents} 位學生・${data.pendingExams.length} 個項目</small></article><article><span>本月提醒</span><strong>${reminderRecords}</strong><small>${reminderStudents} 位學生・${reminderRecords} 筆記錄</small></article></div><div class="pending-columns">
    <section class="section" aria-labelledby="homework-pending"><h2 id="homework-pending">待補交明細</h2><div class="record-list">${data.pendingHomework.length ? data.pendingHomework.map((item) => `<article class="record-row"><div><strong>${item.seat} 號・${escapeHtml(item.item)}</strong><span>${escapeHtml(item.date)} 登記・目前權重 ${weightDetails(item.seat).total}</span></div><button class="small-button" type="button" data-action="makeup-homework" data-id="${escapeHtml(item.id)}">改為已補交</button></article>`).join('') : '<div class="empty-state">目前沒有待補交記錄</div>'}</div></section>
    <section class="section" aria-labelledby="exam-pending"><h2 id="exam-pending">待補考明細</h2><div class="record-list">${data.pendingExams.map((item) => `<article class="record-row"><div><strong>${item.seat} 號・${escapeHtml(item.item)}</strong><span>${escapeHtml(item.date)} 登記・不影響抽籤權重</span></div><button class="small-button" type="button" data-action="makeup-exam" data-id="${escapeHtml(item.id)}">改為已補考</button></article>`).join('') || '<div class="empty-state">目前沒有待補考記錄</div>'}</div></section></div></main>`;
}

function recordsPage() {
  if (state.createKind) return createPage();
  const assignments = state.assignments.filter((record) => assignmentAppliesToCourse(record, state.course));
  const activities = currentData().activityRecords;
  return `<main id="main" class="content"><div class="page-heading no-back"><div><p class="eyebrow">${currentConfig().label}</p><h1>記錄與建立</h1><p class="muted page-description">項目可分享給同年級同科班級；學生完成與課堂操作記錄仍各班獨立。</p></div></div><div class="create-entry-grid"><button class="create-entry" type="button" data-action="create" data-kind="homework"><span>＋</span><strong>建立作業</strong><small>日期與同科班級</small></button><button class="create-entry" type="button" data-action="create" data-kind="exam"><span>＋</span><strong>建立考試</strong><small>日期與同科班級</small></button></div><section class="section" aria-labelledby="recent-records"><h2 id="recent-records">最近項目</h2><div class="record-list">${assignments.map((record) => {
    const safeTitle = escapeHtml(record.title), safeId = escapeHtml(record.id), safeKind = escapeHtml(record.kind), safeDate = escapeHtml(record.date), safeClasses = record.classes.map((id) => escapeHtml(classLabels[id] || id)).join('、');
    return `<article class="record-row detailed"><div><span class="record-kind">${safeKind}</span><strong>${safeTitle}</strong><span>${safeDate}・${safeClasses}</span></div><div class="menu-wrap"><button class="icon-button" type="button" data-action="detail-menu" data-id="${safeId}" aria-label="${escapeHtml(`${record.title} 次要選單`)}" aria-expanded="${state.detailMenu === record.id}">•••</button>${state.detailMenu === record.id ? `<div class="detail-menu"><button type="button" data-action="postpone" data-id="${safeId}">延至下次上課</button></div>` : ''}</div></article>`;
  }).join('') || '<div class="empty-state">目前沒有已建立項目</div>'}</div></section><section class="section" aria-labelledby="activity-title"><h2 id="activity-title">已儲存課堂操作</h2><div class="record-list">${activities.slice().reverse().map((record) => `<article class="record-row"><div><strong>${escapeHtml(record.label)}</strong><span>${escapeHtml(record.kind)}・${escapeHtml(record.date)}</span></div></article>`).join('') || '<div class="empty-state">尚無課堂操作記錄</div>'}</div></section></main>`;
}
function createPage() {
  const config = currentConfig(), isHomework = state.createKind === 'homework';
  const dateOptions = [['today', '今天'], ['next', '下次上課'], ['nextweek', '下週同一堂'], ['custom', '指定日期'], ['tbd', '未定']];
  return `<main id="main" class="content narrow">${pageHeader('建立項目', isHomework ? '建立作業' : '建立考試', `目前：${config.label}。預設套用目前班級，僅共享項目，不共享學生完成記錄。`, 'records')}<form class="form-card" data-form="create"><label class="field"><span>${isHomework ? '作業名稱' : '考試名稱'}</span><input name="title" value="${escapeHtml(state.createTitle)}" placeholder="例如：${isHomework ? escapeHtml(config.homework) : escapeHtml(config.exam)}" required /></label><fieldset><legend>日期快捷</legend><div class="date-choices">${dateOptions.map(([id, label]) => `<button type="button" class="choice-button ${state.createDate === id ? 'selected' : ''}" data-action="create-date" data-date="${id}" aria-pressed="${state.createDate === id}">${label}</button>`).join('')}</div>${state.createDate === 'custom' ? '<label class="field compact"><span>指定日期</span><input name="customDate" type="date" value="2026-08-27" /></label>' : ''}</fieldset><fieldset><legend>套用班級</legend><p class="field-help">同部別＋同年級＋同科目；學生狀態各班獨立</p><div class="checkbox-list">${config.peers.map((id) => `<label><input type="checkbox" name="classes" value="${id}" ${state.createClasses.includes(id) ? 'checked' : ''} /><span>${classLabels[id]}${id === state.course ? '（目前）' : ''}</span></label>`).join('')}</div></fieldset><button class="primary-button" type="submit">儲存${isHomework ? '作業' : '考試'}</button></form></main>`;
}

function sessionPage() {
  const data = currentData(), start = data.sessionStartIndex ?? data.activityRecords.length, activities = data.activityRecords.slice(start);
  const drawCount = countSessionDraws(data.activityRecords, data.sessionStartIndex);
  return `<main id="main" class="content narrow">${pageHeader('本節進行中', '本節摘要', `${currentConfig().label} 的本節暫態與已儲存操作。`)}<section class="session-summary-card"><div class="metric-grid compact"><article><span>已儲存操作</span><strong>${activities.length}</strong><small>記錄會保留</small></article><article><span>暫不抽取</span><strong>${data.drawExcluded.length}</strong><small>結束後清除</small></article><article><span>本節抽籤</span><strong>${drawCount}</strong><small>含可重複抽籤</small></article></div><div class="record-list">${activities.map((record) => `<article class="record-row"><div><strong>${escapeHtml(record.label)}</strong><span>${escapeHtml(record.kind)}・${escapeHtml(record.date)}</span></div></article>`).join('') || '<div class="empty-state">本節由暫不抽取設定啟動，尚無已儲存操作。</div>'}</div><div class="stack-actions"><button class="primary-button" type="button" data-action="navigate" data-page="today">繼續本節</button><button class="secondary-button danger-text" type="button" data-action="end-session">結束本節</button></div></section></main>`;
}

function installCard() {
  if (installState === 'installed') return `<section class="settings-card"><h2>安裝到主畫面</h2><p class="muted">此 App 已以獨立模式開啟。</p></section>`;
  if (installState === 'prompt') return `<section class="settings-card install-card"><div><h2>安裝到主畫面</h2><p class="muted">安裝後可從主畫面開啟並使用離線 App Shell。</p></div><button class="primary-button compact-button" type="button" data-action="install-app">安裝到主畫面</button></section>`;
  return `<section class="settings-card"><h2>安裝到主畫面</h2><p class="muted">iPhone Safari：點「分享」→「加入主畫面」。<br />Android Chrome：點「選單」→「安裝應用程式」。</p></section>`;
}
function morePage() {
  const [syncText] = syncCopy();
  return `<main id="main" class="content narrow"><div class="page-heading no-back"><div><p class="eyebrow">原型控制</p><h1>更多</h1><p class="muted page-description">用假狀態檢查弱網路、下課前摘要與示範資料。</p></div></div>${sessionQuickLink()}${installCard()}<section class="settings-card" aria-labelledby="network-title"><h2 id="network-title">同步狀態示範</h2><p class="muted">目前：${syncText}</p><div class="choice-grid three">${[['synced','同步完成'],['offline','離線・3 筆待同步'],['failed','同步失敗']].map(([id,label]) => `<button type="button" class="choice-button ${state.syncStatus === id ? 'selected' : ''}" data-action="set-sync" data-sync="${id}" aria-pressed="${state.syncStatus === id}">${label}</button>`).join('')}</div></section><section class="settings-card"><label class="toggle-row"><span><strong>下課前 5 分鐘狀態</strong><small>在今日首頁顯示本節摘要與建立入口</small></span><input type="checkbox" data-action="near-end" ${state.nearEnd ? 'checked' : ''} /></label></section><section class="settings-card"><h2>建立項目</h2><div class="stack-actions"><button class="secondary-button" type="button" data-action="create" data-kind="homework">建立作業</button><button class="secondary-button" type="button" data-action="create" data-kind="exam">建立考試</button></div></section><section class="settings-card danger-zone"><div><h2>重設示範資料</h2><p class="muted">清除這台裝置上的 v0.3 原型操作，恢復初始假資料。</p></div><button class="quiet-button danger" type="button" data-action="reset">重設</button></section><p class="prototype-note">本原型只使用假資料與此裝置的瀏覽器儲存空間，未連接 Google 或任何真實帳號。</p></main>`;
}
function toastTemplate() { return state.toast ? `<div class="toast" role="status"><span>${escapeHtml(state.toast)}</span>${undoAction ? '<button type="button" data-action="undo">復原</button>' : ''}<button class="toast-close" type="button" data-action="dismiss-toast" aria-label="關閉提示">×</button></div>` : ''; }

function render() {
  let content;
  if (state.page === 'today') content = homePage(); else if (state.page === 'homework') content = homeworkPage(); else if (state.page === 'exam') content = examPage(); else if (state.page === 'reminder') content = reminderPage(); else if (state.page === 'draw') content = drawPage(); else if (state.page === 'pending') content = pendingPage(); else if (state.page === 'records') content = recordsPage(); else if (state.page === 'session') content = sessionPage(); else content = morePage();
  app.innerHTML = `<div class="app-shell">${headerTemplate()}${content}${bottomNavTemplate()}${toastTemplate()}</div>`;
  applyPendingFocus();
}

function handleSeat(seat, context) {
  if (disabledSeats.includes(seat)) return;
  const data = currentData(), focus = { type: 'seat', seat, context };
  if (context === 'homework') {
    if (data.leaveMode) updateCourse({ leaveSeats: toggleIn(data.leaveSeats, seat), homeworkMissing: data.homeworkMissing.filter((item) => item !== seat) }, true, focus);
    else updateCourse({ homeworkMissing: toggleIn(data.homeworkMissing, seat), leaveSeats: data.leaveSeats.filter((item) => item !== seat) }, true, focus);
  } else if (context === 'exam') updateCourse({ examAbsent: toggleIn(data.examAbsent, seat) }, true, focus);
  else if (context === 'reminder') updateCourse({ reminderSeats: toggleIn(data.reminderSeats, seat) }, true, focus);
  else if (context === 'exclude') {
    const wasExcluded = data.drawExcluded.includes(seat), nextExcluded = toggleIn(data.drawExcluded, seat);
    updateCourse({ drawExcluded: nextExcluded, ...(wasExcluded ? {} : startSessionFields(data)) }, true, focus);
  }
}
function drawNext() {
  const courseId = state.course, data = currentData(), round = getDrawRound(activeSeats, data.drawExcluded, data.drawnSeats, data.drawRepeat);
  if (round.exhausted) return;
  const picked = pickWeighted(round.candidates.map((seat) => ({ seat, weight: weightDetails(seat, data).total })), Math.random());
  if (!picked) return setToast('沒有可抽取的座號，請調整暫不抽取名單');
  const record = { id: `draw-${Date.now()}`, kind: '加權抽籤', label: `抽中 ${picked} 號`, date: '今天' };
  updateCourse({ ...startSessionFields(data), drawnSeat: picked, drawnSeats: data.drawRepeat ? data.drawnSeats : [...new Set([...data.drawnSeats, picked])], activityRecords: [...data.activityRecords, record] }, true, null, courseId);
}
function openCreate(kind, source = 'records') {
  const date = source === 'closing' ? (kind === 'homework' ? 'next' : 'tbd') : 'today';
  updateState({ page: 'records', createKind: kind, createDate: date, createTitle: '', createClasses: [state.course], createSource: source }, true, { type: 'heading' });
}
async function promptInstall() {
  if (!installPromptEvent) return;
  await installPromptEvent.prompt();
  const choice = await installPromptEvent.userChoice;
  installPromptEvent = null; installState = choice.outcome === 'accepted' ? 'installed' : 'fallback'; render();
}

app.addEventListener('pointerdown', (event) => {
  const seatButton = event.target.closest('[data-seat][data-context="homework"]');
  if (!seatButton || currentData().leaveMode || seatButton.disabled) return;
  const seat = Number(seatButton.dataset.seat), courseId = state.course, pointerId = event.pointerId;
  longPressTimer = setTimeout(() => {
    suppressSeatClick = { seat, context: 'homework', pointerId }; const data = state.courseData[courseId];
    updateCourse({ leaveSeats: toggleIn(data.leaveSeats, seat), homeworkMissing: data.homeworkMissing.filter((item) => item !== seat) }, true, { type: 'seat', seat, context: 'homework' }, courseId);
    setToast(`${seat} 號已切換為請假待確認`, null, { type: 'seat', seat, context: 'homework' });
  }, 500);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => app.addEventListener(type, () => {
  clearTimeout(longPressTimer);
  clearTimeout(suppressSeatClickTimer);
  suppressSeatClickTimer = setTimeout(() => { suppressSeatClick = null; }, 800);
}));

app.addEventListener('input', (event) => {
  if (event.target.matches('[data-action="weight-cap"]')) updateCourse({ weightCap: Number(event.target.value) }, true, { type: 'selector', selector: '#weight-cap' });
  else if (event.target.matches('input[name="title"]')) state.createTitle = event.target.value;
});
app.addEventListener('change', (event) => {
  if (event.target.matches('[data-action="near-end"]')) updateState({ nearEnd: event.target.checked });
  else if (event.target.matches('input[name="classes"]')) state.createClasses = [...document.querySelectorAll('input[name="classes"]:checked')].map((input) => input.value);
  else if (event.target.matches('[data-action="manual-seat"]')) updateCourse({ manualSeat: Number(event.target.value) }, true, { type: 'selector', selector: '#manual-seat' });
});
app.addEventListener('submit', (event) => {
  if (!event.target.matches('[data-form="create"]')) return;
  event.preventDefault(); const form = new FormData(event.target), title = String(form.get('title') || '').trim(), classes = form.getAll('classes');
  if (!title || !classes.length) return setToast('請輸入名稱並至少選一個班級');
  const dateLabels = { today: '今天', next: '下次上課', nextweek: '下週同一堂', custom: String(form.get('customDate') || '指定日期'), tbd: '未定' };
  const record = { id: `r${Date.now()}`, title, kind: state.createKind === 'homework' ? '作業' : '考試', date: dateLabels[state.createDate], classes, subjectGroup: currentConfig().subjectGroup };
  const previousAssignments = clone(state.assignments);
  updateState({ assignments: [record, ...state.assignments], createKind: null, createTitle: '', createDate: 'today', createClasses: [state.course], page: 'records' }, true, { type: 'heading' });
  setToast(`${record.kind}已建立；各班學生記錄維持獨立`, () => updateState({ assignments: previousAssignments }, true, { type: 'heading' }));
});

app.addEventListener('click', (event) => {
  const seatButton = event.target.closest('[data-seat]');
  if (seatButton) {
    const seat = Number(seatButton.dataset.seat), context = seatButton.dataset.context;
    if (shouldSuppressSeatClick(suppressSeatClick, seat, context, event.pointerId)) { suppressSeatClick = null; clearTimeout(suppressSeatClickTimer); return; }
    suppressSeatClick = null; clearTimeout(suppressSeatClickTimer); handleSeat(seat, context); return;
  }
  const target = event.target.closest('[data-action]'); if (!target) return; const action = target.dataset.action;
  if (action === 'navigate') updateState({ page: target.dataset.page, courseMenu: false, createKind: target.dataset.page === 'records' ? null : state.createKind }, false, { type: 'heading' });
  else if (action === 'open-workflow') updateState({ page: target.dataset.page, courseMenu: false }, false, { type: 'heading' });
  else if (action === 'course-menu') updateState({ courseMenu: !state.courseMenu }, false);
  else if (action === 'switch-course') { const previous = state.course, next = target.dataset.course; updateState({ course: next, page: 'today', courseMenu: false, createKind: null, createClasses: [next] }, true, { type: 'heading' }); setToast(`已切換至 ${courseConfigs[next].label}`, () => updateState({ course: previous, createClasses: [previous] }, true, { type: 'heading' }), { type: 'heading' }); }
  else if (action === 'cycle-sync') { const sequence = ['synced', 'offline', 'failed']; updateState({ syncStatus: sequence[(sequence.indexOf(state.syncStatus) + 1) % sequence.length] }); }
  else if (action === 'set-sync') updateState({ syncStatus: target.dataset.sync });
  else if (action === 'toggle-leave-mode') updateCourse({ leaveMode: !currentData().leaveMode });
  else if (action === 'save-homework') {
    const courseId = state.course, data = currentData(), before = clone(data), missing = [...data.homeworkMissing], leaves = [...data.leaveSeats], item = data.activeHomeworkItem;
    const additions = missing.map((seat) => ({ id: `new-h-${Date.now()}-${seat}`, seat, item, date: '今天' }));
    const record = { id: `activity-h-${Date.now()}`, kind: '作業檢查', label: `${item}：缺交 ${missing.length} 位、請假 ${leaves.length} 位`, date: '今天' };
    updateCourse({ ...startSessionFields(data), pendingHomework: [...data.pendingHomework, ...additions], activityRecords: [...data.activityRecords, record], homeworkMissing: [], leaveSeats: [], leaveMode: false }, true, null, courseId);
    setToast(`已儲存「${item}」：缺交 ${missing.length} 位、請假 ${leaves.length} 位`, () => restoreCourse(courseId, before));
  }
  else if (action === 'save-exam') {
    const courseId = state.course, data = currentData(), before = clone(data), absent = [...data.examAbsent], item = data.activeExamItem;
    const additions = absent.map((seat) => ({ id: `new-e-${Date.now()}-${seat}`, seat, item, date: '今天' }));
    const record = { id: `activity-e-${Date.now()}`, kind: '考試點名', label: `${item}：缺考 ${absent.length} 位`, date: '今天' };
    updateCourse({ ...startSessionFields(data), pendingExams: [...data.pendingExams, ...additions], activityRecords: [...data.activityRecords, record], examAbsent: [] }, true, null, courseId);
    setToast(`已儲存「${item}」缺考 ${absent.length} 位`, () => restoreCourse(courseId, before));
  }
  else if (action === 'reminder-type') updateCourse({ reminderType: target.dataset.type });
  else if (action === 'save-reminder') {
    const courseId = state.course, data = currentData(), before = clone(data), seats = [...data.reminderSeats], type = data.reminderType, counts = { ...data.reminderCounts };
    seats.forEach((seat) => { counts[seat] = Number(counts[seat] || 0) + 1; });
    const record = { id: `activity-r-${Date.now()}`, kind: '課堂提醒', label: `${type}：${seats.map((seat) => `${seat} 號`).join('、')}`, date: '今天' };
    updateCourse({ ...startSessionFields(data), reminderCounts: counts, activityRecords: [...data.activityRecords, record], reminderSeats: [], reminderType: '' }, true, null, courseId);
    setToast(`已儲存 ${seats.length} 位學生的「${type}」提醒`, () => restoreCourse(courseId, before));
  }
  else if (action === 'draw-mode') {
    const nextRepeat = target.dataset.repeat === 'true';
    if (nextRepeat !== currentData().drawRepeat) {
      updateCourse({ drawRepeat: nextRepeat, drawnSeats: [], drawnSeat: null });
      setToast(`已切換為${nextRepeat ? '可重複' : '不重複'}，本輪重新開始`);
    }
  }
  else if (action === 'toggle-exclude') updateCourse({ drawExcludeOpen: !currentData().drawExcludeOpen });
  else if (action === 'toggle-manual-weight') updateCourse({ manualWeightOpen: !currentData().manualWeightOpen });
  else if (action === 'adjust-manual') {
    const courseId = state.course, data = currentData(), seat = data.manualSeat, previous = Number(data.manualWeight[seat] || 0);
    const next = Math.max(0, Math.min(9, previous + Number(target.dataset.delta)));
    if (next === previous) return;
    updateCourse({ manualWeight: { ...data.manualWeight, [seat]: next } }, true, { type: 'selector', selector: `[data-action="adjust-manual"][data-delta="${target.dataset.delta}"]` }, courseId);
    setToast(`${seat} 號手動月加權已調整為 +${next}`, () => {
      const current = state.courseData[courseId];
      restoreCourse(courseId, { ...current, manualWeight: { ...current.manualWeight, [seat]: previous } });
    }, { type: 'selector', selector: `[data-action="adjust-manual"][data-delta="${target.dataset.delta}"]` });
  }
  else if (action === 'draw') drawNext();
  else if (action === 'finish-draw-round') updateCourse({ drawnSeat: null }, true, { type: 'selector', selector: '[data-action="restart-draw-round"]' });
  else if (action === 'restart-draw-round') updateCourse({ drawnSeats: [], drawnSeat: null }, true, { type: 'selector', selector: '[data-action="draw"]' });
  else if (action === 'absent-redraw') {
    const data = currentData(), absent = data.drawnSeat, nextExcluded = [...new Set([...data.drawExcluded, absent])];
    const nextRound = getDrawRound(activeSeats, nextExcluded, data.drawnSeats, data.drawRepeat);
    updateCourse({ drawExcluded: nextExcluded, drawnSeat: null });
    if (!nextRound.candidates.length) setToast(`${absent} 號已排除；本輪完成，沒有其他人可抽`);
    else { drawNext(); setToast(`${absent} 號已排除並重抽`); }
  }
  else if (action === 'makeup-homework') { const courseId = state.course, data = currentData(), before = clone(data), item = data.pendingHomework.find((entry) => entry.id === target.dataset.id), oldWeight = weightDetails(item.seat, data).total; updateCourse({ pendingHomework: data.pendingHomework.filter((entry) => entry.id !== item.id) }, true, null, courseId); const newWeight = weightDetails(item.seat, state.courseData[courseId]).total; setToast(`${item.seat} 號已補交，抽籤權重 ${oldWeight} → ${newWeight}`, () => restoreCourse(courseId, before)); }
  else if (action === 'makeup-exam') { const courseId = state.course, data = currentData(), before = clone(data), item = data.pendingExams.find((entry) => entry.id === target.dataset.id); updateCourse({ pendingExams: data.pendingExams.filter((entry) => entry.id !== item.id) }, true, null, courseId); setToast(`${item.seat} 號已改為已補考`, () => restoreCourse(courseId, before)); }
  else if (action === 'create') openCreate(target.dataset.kind, target.dataset.source || state.page);
  else if (action === 'create-date') updateState({ createDate: target.dataset.date });
  else if (action === 'detail-menu') updateState({ detailMenu: state.detailMenu === target.dataset.id ? null : target.dataset.id }, false);
  else if (action === 'postpone') { const previous = clone(state.assignments), id = target.dataset.id; updateState({ assignments: state.assignments.map((record) => record.id === id ? { ...record, date: '下次上課' } : record), detailMenu: null }); setToast('已延至下次上課', () => updateState({ assignments: previous })); }
  else if (action === 'end-session') { const courseId = state.course, data = currentData(), before = clone(data); updateCourse({ sessionActive: false, sessionStartIndex: null, homeworkMissing: [], leaveSeats: [], leaveMode: false, examAbsent: [], reminderSeats: [], reminderType: '', drawExcluded: [], drawExcludeOpen: false, drawnSeats: [], drawnSeat: null }, true, null, courseId); updateState({ page: 'today' }, true, { type: 'heading' }); setToast('本節已結束；已儲存記錄仍保留', () => restoreCourse(courseId, before, 'session'), { type: 'heading' }); }
  else if (action === 'install-app') promptInstall();
  else if (action === 'undo') { const restore = isUndoRevisionCurrent(undoRevision, mutationRevision) ? undoAction : null; undoAction = null; undoRevision = null; state.toast = ''; clearTimeout(toastTimer); if (restore) restore(); else render(); }
  else if (action === 'dismiss-toast') { clearTimeout(toastTimer); undoAction = null; undoRevision = null; updateState({ toast: '' }, false); }
  else if (action === 'reset') { if (window.confirm('確定要重設全部 v0.3 示範資料嗎？')) { localStorage.removeItem(STORAGE_KEY); state = initialState(); setToast('示範資料已重設'); } }
});

function refreshMonthlyBoundaries() {
  const monthKey = monthKeyForDate();
  let changed = false;
  const nextCourseData = Object.fromEntries(Object.entries(state.courseData).map(([courseId, data]) => {
    const rolled = rollMonthlyState(data, monthKey);
    if (rolled.data !== data) changed = true;
    return [courseId, rolled.data];
  }));
  if (changed) updateState({ courseData: nextCourseData }, true);
}

window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installPromptEvent = event; installState = 'prompt'; render(); });
window.addEventListener('appinstalled', () => { installPromptEvent = null; installState = 'installed'; render(); });
window.addEventListener('focus', refreshMonthlyBoundaries);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshMonthlyBoundaries(); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { type: 'module' }).then((registration) => registration.update()).catch(() => {}));
render();
