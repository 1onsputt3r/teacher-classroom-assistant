import {
  ACADEMIC_PERIOD_DEFINITIONS,
  CLASSROOM_REMINDER_CATEGORIES,
  COURSE_CATALOG,
  DATA_BACKUP_PAYLOAD_FIELDS,
  DEFAULT_MANAGED_SCHEDULE_TIMES,
  MANAGED_SCHEDULE_WEEKDAYS,
  addClassroomReminder,
  addDaysToDateKey,
  activeManagedScheduleVersion,
  academicPeriodForLocalDate,
  applyAssignmentTimeResolution,
  applyWeeklyDrawAdjustment,
  assignmentClassDetail,
  assignmentEditSharingNotice,
  buildCommonAssignmentView,
  buildCommonExamView,
  buildClassFirstRecordView,
  bottomNavigationActiveTab,
  calendarMonthDays,
  classroomReminderMonthlyCounts,
  cancelExamTarget,
  canOpenScheduleRow,
  classroomRemindersForSession,
  classroomReminderSessionKey,
  classroomReminderWeightsForMonth,
  clampManualDrawWeightsByMonth,
  completeHomeworkSubmission,
  completeExamMakeup,
  courseFromTeachingClass,
  courseDataKey,
  createDefaultManagedScheduleTimes,
  createDataBackupEnvelope,
  createEmptyManagedScheduleSlots,
  createEmptyScheduleManagementSettings,
  createEmptyTeachingClassSettings,
  createDefaultAcademicPeriodSettings,
  createSessionSnapshot,
  createWeightedDrawPool,
  dateFromKey,
  dateRelation,
  drawWeekRange,
  cancelAssignmentTarget,
  deferAssignmentTarget,
  deferExamTarget,
  examEditSharingNotice,
  examClassDetail,
  resolveExamAttendanceSession,
  findNextCourseOccurrence,
  getScheduleViewForDate,
  groupTeachingClasses,
  hasScheduleOverride,
  localDateKey,
  managedScheduleTimesForAcademicYear,
  managedScheduleVersionsForAcademicYear,
  managedScheduleVersionsWithRanges,
  managedScheduleSlotsForDate,
  nextManagedScheduleVersionTitle,
  normalizeHomeworkSubmissionRecords,
  normalizeAcademicPeriodSettings,
  normalizeClassroomRecords,
  parseScheduleManagementSettings,
  parseTeachingClassSettings,
  pendingExamMakeupsForCourse,
  pendingHomeworkSubmissionsForCourse,
  pickWeightedDrawSeat,
  removeScheduleOverride,
  recordSectionsForSession,
  resolveIndependentExamTimes,
  resolveIndependentAssignmentTimes,
  resolveExamTargets,
  resolveAssignmentTargets,
  resolveAssignmentCheckSession,
  resolveManualDrawWeight,
  saveExamCheck,
  saveAssignmentCheck,
  scheduleOverrideKey,
  selectedDateAfterEvent,
  setScheduleOverride,
  sessionScheduleState,
  shouldSuppressLongPressClick,
  shouldShowBottomNavigation,
  shiftAcademicPeriodSettingsYear,
  summarizeExamSeatStates,
  summarizeSeatStates,
  teachingClassDisplayLabel,
  teachingClassRoster,
  teachingClassesForAcademicYear,
  toggleSeatState,
  undoClassroomReminder,
  updateManagedScheduleCell,
  updateManagedScheduleTimesForAcademicYear,
  updateAssignmentTargetSchedule,
  updateExamTargetSchedule,
  upsertTeachingClassForAcademicYear,
  upsertTeachingClassesForAcademicYear,
  upsertManagedScheduleVersionForAcademicYear,
  upsertExamDefinition,
  upsertAssignmentDefinition,
  validateAcademicPeriodSettings,
  validateDataBackupEnvelope,
  validateManagedScheduleTimes,
  validateManagedScheduleVersionDraft,
  validateTeachingClassBatchDraft,
  validateTeachingClassDraft,
  weeklyDrawCounts
} from './core.mjs?v=20260909-draw-timer-1';
import { bindTimerWheels, createCountdown, formatTimerTime, renderCountdownContents, timerDurationSeconds } from './timer.mjs?v=20260909-draw-timer-1';

const app = document.querySelector('#app');
const TEST_DATA_PROFILE = 'integration-v1';
const dataProfile = new URLSearchParams(window.location.search).get('data-profile');
// The ordinary URL always opens formal data. Test data is available only from
// the dedicated developer URL; the legacy integration-v1 value remains valid
// so existing saved test bookmarks do not break.
const isIntegrationTestData = dataProfile === 'test' || dataProfile === TEST_DATA_PROFILE;
const activeDataProfile = isIntegrationTestData ? 'test' : 'formal';
const storageKey = (base) => isIntegrationTestData ? `${base}::test::${TEST_DATA_PROFILE}` : base;
const SCHEDULE_STORAGE_KEY = storageKey('teacher-assistant-preview-v2-schedule-v2');
const HOMEWORK_STORAGE_KEY = storageKey('teacher-assistant-preview-v2-homework-v4');
const ACADEMIC_PERIOD_STORAGE_KEY = storageKey('teacher-assistant-preview-v2-academic-period-v1');
const TEACHING_CLASSES_STORAGE_KEY = storageKey('teacher-assistant-preview-v2-teaching-classes-v1');
const MANAGED_SCHEDULE_STORAGE_KEY = storageKey('teacher-assistant-preview-v2-managed-schedules-v1');
const DATA_SYNC_STORAGE_KEY = storageKey('teacher-assistant-preview-v2-data-sync-v1');
const PROFILE_STORAGE_ENTRIES = [
  ['scheduleOverrides', SCHEDULE_STORAGE_KEY],
  ['academicPeriodSettings', ACADEMIC_PERIOD_STORAGE_KEY],
  ['teachingClassSettings', TEACHING_CLASSES_STORAGE_KEY],
  ['scheduleManagementSettings', MANAGED_SCHEDULE_STORAGE_KEY],
  ['classroomRecords', HOMEWORK_STORAGE_KEY]
];
const formatter = new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' });
const monthFormatter = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long' });
const calendarDayFormatter = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
const initialNow = new Date();
const defaultAcademicYear = initialNow.getMonth() >= 6 ? initialNow.getFullYear() - 1911 : initialNow.getFullYear() - 1912;

function readStorage(key, fallback) {
  const result = readStorageResult(key);
  return result.status === 'valid' ? (result.value || fallback) : fallback;
}

function readStorageResult(key) {
  let raw = null;
  try { raw = localStorage.getItem(key); }
  catch { return { status: 'unavailable', value: null }; }
  if (raw == null) return { status: 'missing', value: null };
  try { return { status: 'valid', value: JSON.parse(raw) }; }
  catch { return { status: 'invalid', value: null, raw }; }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function replaceStorageValues(nextValues) {
  const previous = new Map();
  try {
    for (const key of nextValues.keys()) previous.set(key, localStorage.getItem(key));
    for (const [key, value] of nextValues) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    return { ok: true, rollbackOk: true };
  } catch {
    let rollbackOk = true;
    for (const [key, value] of previous) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        rollbackOk = false;
      }
    }
    return { ok: false, rollbackOk };
  }
}

function readProfilePayload() {
  const payload = {};
  for (const [field, key] of PROFILE_STORAGE_ENTRIES) {
    const result = readStorageResult(key);
    if (result.status === 'unavailable') return { valid: false, message: '瀏覽器目前不允許讀取這個網站的本機資料。' };
    if (result.status === 'invalid') return { valid: false, message: '偵測到無法讀取的本機資料，尚未建立備份。請先保留目前裝置，不要清除網站資料。' };
    payload[field] = result.status === 'missing' ? null : result.value;
  }
  return { valid: true, payload };
}

function profilePayloadStorageValues(payload, metadata = undefined) {
  const values = new Map();
  try {
    for (const [field, key] of PROFILE_STORAGE_ENTRIES) {
      const value = payload[field];
      values.set(key, value === null ? null : JSON.stringify(value));
    }
    if (metadata !== undefined) values.set(DATA_SYNC_STORAGE_KEY, JSON.stringify(metadata));
  } catch {
    return null;
  }
  return values;
}

function replaceProfilePayload(payload, metadata = undefined) {
  const values = profilePayloadStorageValues(payload, metadata);
  return values ? replaceStorageValues(values) : { ok: false, rollbackOk: true };
}

function emptyProfilePayload() {
  return Object.fromEntries(DATA_BACKUP_PAYLOAD_FIELDS.map((field) => [field, null]));
}

function createIntegrationTestData(now = new Date()) {
  const todayKey = localDateKey(now);
  const academicYear = now.getMonth() >= 6 ? now.getFullYear() - 1911 : now.getFullYear() - 1912;
  const classes = [
    { id: 'test-int-v1-j8-805-chem', system: 'junior', grade: 'j8', className: '5', subject: '理化', lastSeat: 52, vacantSeats: [4, 36] },
    { id: 'test-int-v1-j8-806-chem', system: 'junior', grade: 'j8', className: '6', subject: '理化', lastSeat: 50, vacantSeats: [7] },
    { id: 'test-int-v1-j8-807-chem', system: 'junior', grade: 'j8', className: '7', subject: '理化', lastSeat: 48, vacantSeats: [] },
    { id: 'test-int-v1-s2-a-physics', system: 'senior', grade: 's2', className: '甲', subject: '物理', lastSeat: 48, vacantSeats: [2, 11] },
    { id: 'test-int-v1-s2-a-inquiry', system: 'senior', grade: 's2', className: '甲', subject: '物理探究', lastSeat: 48, vacantSeats: [2, 11] }
  ];
  const courses = Object.fromEntries(classes.map((record) => [record.id, courseFromTeachingClass(record)]));
  const versionSlots = createEmptyManagedScheduleSlots();
  const place = (weekday, periodId, classId) => { versionSlots[String(weekday)][periodId] = classId; };
  place(1, 'p1', classes[0].id); place(1, 'p3', classes[1].id); place(1, 'p8', classes[3].id);
  place(2, 'p2', classes[2].id); place(2, 'p4', classes[0].id); place(2, 'p7', classes[4].id);
  place(3, 'p1', classes[3].id); place(3, 'p5', classes[1].id);
  place(4, 'p3', classes[0].id); place(4, 'p6', classes[2].id);
  place(5, 'p2', classes[1].id); place(5, 'p4', classes[3].id); place(5, 'p8', classes[0].id);
  const earlierSlots = createEmptyManagedScheduleSlots();
  earlierSlots['1'].p1 = classes[1].id;
  earlierSlots['2'].p2 = classes[0].id;
  earlierSlots['3'].p3 = classes[2].id;
  earlierSlots['4'].p4 = classes[3].id;
  earlierSlots['5'].p7 = classes[0].id;
  const academic = {
    version: 1,
    academicYear,
    periods: [
      { id: 'summer', enabled: true, startDate: addDaysToDateKey(todayKey, -60), endDate: addDaysToDateKey(todayKey, -31) },
      { id: 'firstSemester', enabled: true, startDate: addDaysToDateKey(todayKey, -30), endDate: addDaysToDateKey(todayKey, 120) },
      { id: 'winter', enabled: false, startDate: addDaysToDateKey(todayKey, 121), endDate: addDaysToDateKey(todayKey, 130) },
      { id: 'secondSemester', enabled: true, startDate: addDaysToDateKey(todayKey, 131), endDate: addDaysToDateKey(todayKey, 300) }
    ]
  };
  const teaching = { version: 1, byAcademicYear: { [academicYear]: classes } };
  const schedules = {
    version: 2,
    byAcademicYear: {
      [academicYear]: {
        times: createDefaultManagedScheduleTimes(),
        versions: [
          { id: 'test-int-v1-first-a', periodId: 'firstSemester', startDate: addDaysToDateKey(todayKey, -30), title: '上學期・開學版', slots: earlierSlots, createdAt: `${todayKey}T08:00:00` },
          { id: 'test-int-v1-first-b', periodId: 'firstSemester', startDate: addDaysToDateKey(todayKey, -7), title: '上學期・第二週版', slots: versionSlots, createdAt: `${todayKey}T08:05:00` }
        ]
      }
    }
  };
  const testCourse = courses[classes[0].id];
  const testCourseKey = courseDataKey(testCourse);
  const secondCourse = courses[classes[1].id];
  const secondCourseKey = courseDataKey(secondCourse);
  const nextMondayOffset = (1 - dateFromKey(todayKey).getDay() + 7) % 7;
  const nextMondayKey = addDaysToDateKey(todayKey, nextMondayOffset);
  const firstDue = { dateKey: todayKey, slotId: 'p2', period: 2, start: '09:10', end: '10:00' };
  const secondDue = { dateKey: nextMondayKey, slotId: 'p3', period: 3, start: '10:10', end: '11:00' };
  const todaySession = { dateKey: todayKey, slotId: 'p2', period: 2, start: '09:10', end: '10:00', course: testCourse, adjusted: true };
  const previousCheckDate = addDaysToDateKey(todayKey, -7);
  const assignmentTarget = (assignmentId, course, due, pendingSeats, completedSeats = []) => {
    const courseKey = courseDataKey(course);
    const checkDate = addDaysToDateKey(due.dateKey, -7);
    const checkId = `${checkDate}:${due.slotId}:${assignmentId}:${courseKey}`;
    const missingSeats = [...pendingSeats, ...completedSeats];
    const check = {
      id: checkId,
      dateKey: checkDate,
      slotId: due.slotId,
      seatStates: Object.fromEntries(missingSeats.map((seat) => [seat, 'incomplete'])),
      savedAt: '10:02',
      summary: { incomplete: missingSeats.length, leave: 0, complete: missingSeats.length === 0 }
    };
    const submissions = {};
    for (const seat of pendingSeats) {
      const id = `${checkId}:${seat}`;
      submissions[id] = { id, seat, sourceCheckId: checkId, missingDateKey: checkDate, status: 'pending', recordedAt: '10:02' };
    }
    for (const seat of completedSeats) {
      const id = `${checkId}:${seat}`;
      submissions[id] = { id, seat, sourceCheckId: checkId, missingDateKey: checkDate, status: 'completed', recordedAt: '10:02', completedAt: `${todayKey} 12:20` };
    }
    return { course, due, status: 'active', checks: [check], lastCheck: check, submissions };
  };
  const assignmentOneId = 'test-int-v1-assignment-density';
  const assignmentTwoId = 'test-int-v1-assignment-workbook';
  const examId = 'test-int-v1-exam-weekly';
  const examTarget = (course, due, pendingSeats, completedSeats = []) => {
    const courseKey = courseDataKey(course);
    const checkDate = addDaysToDateKey(due.dateKey, -7);
    const absentSeats = [...pendingSeats, ...completedSeats];
    const checkId = `${checkDate}:${due.slotId}:${examId}:${courseKey}`;
    const check = { id: checkId, dateKey: checkDate, slotId: due.slotId, seatStates: Object.fromEntries(absentSeats.map((seat) => [seat, 'absent'])), savedAt: '10:03', summary: { absent: absentSeats.length, complete: absentSeats.length === 0, absentSeats } };
    const makeups = {};
    for (const seat of pendingSeats) makeups[seat] = { seat, sourceCheckId: checkId, absentDateKey: checkDate, status: 'pending', recordedAt: '10:03' };
    for (const seat of completedSeats) makeups[seat] = { seat, sourceCheckId: checkId, absentDateKey: checkDate, status: 'completed', recordedAt: '10:03', completedAt: `${todayKey} 12:30` };
    return { course, due, status: 'active', checks: [check], lastCheck: check, makeups };
  };
  let classroom = {
    assignments: {
      [assignmentOneId]: { id: assignmentOneId, title: '密度實驗學習單', status: 'active', scheduleMode: 'date', createdAt: previousCheckDate, targets: {
        [testCourseKey]: assignmentTarget(assignmentOneId, testCourse, firstDue, [12, 27], [18]),
        [secondCourseKey]: assignmentTarget(assignmentOneId, secondCourse, secondDue, [15])
      } },
      [assignmentTwoId]: { id: assignmentTwoId, title: '理化習作 p.40', status: 'active', scheduleMode: 'date', createdAt: previousCheckDate, targets: { [testCourseKey]: assignmentTarget(assignmentTwoId, testCourse, firstDue, [12]) } }
    },
    exams: {
      [examId]: {
        id: examId,
        title: '第一次週考',
        status: 'active',
        scheduleMode: 'date',
        createdAt: previousCheckDate,
        targets: {
          [testCourseKey]: examTarget(testCourse, firstDue, [15], [19]),
          [secondCourseKey]: examTarget(secondCourse, secondDue, [3])
        }
      }
    },
    courses: {
      [testCourseKey]: { manualDrawWeightsByMonth: { [todayKey.slice(0, 7)]: { 8: 2, 12: 1 } }, drawWeightCap: 6 }
    },
    reminders: {},
    drawSessions: {
      [`${todayKey}:p2:${testCourseKey}`]: { useWeighting: true, allowRepeat: false, currentSeat: null, excludedSeats: [6], seatsThisRound: [8], history: [{ id: 'test-int-v1-draw-1', seat: 8, time: '09:28', absent: false }], updatedAt: `${todayKey}T09:28:00` }
    },
    meta: { dataProfile: TEST_DATA_PROFILE, schemaVersion: 1, referenceDateKey: todayKey }
  };
  const roster = teachingClassRoster(classes[0]);
  [
    [12, '趴睡', '09:18'], [12, '聊天', '09:24'], [12, '未依指示', '09:31'],
    [8, '聊天', '09:35'], [8, '其他', '09:42']
  ].forEach(([seat, category, recordedTime], index) => {
    classroom = addClassroomReminder(classroom, {
      reminderId: `test-int-v1-reminder-${index + 1}`,
      session: todaySession,
      seat,
      category,
      recordedTime,
      createdAt: `${todayKey}T${recordedTime}:00`,
      activeSeats: roster.activeSeats
    });
  });
  classroom = normalizeHomeworkSubmissionRecords(normalizeClassroomRecords(classroom));
  return {
    scheduleOverrides: { [scheduleOverrideKey(todayKey, 'p2')]: testCourse },
    academic,
    teaching,
    schedules,
    homework: classroom
  };
}

const storedDataSyncMetadata = readStorage(DATA_SYNC_STORAGE_KEY, {});
let dataSyncMetadata = storedDataSyncMetadata && typeof storedDataSyncMetadata === 'object' && !Array.isArray(storedDataSyncMetadata)
  ? storedDataSyncMetadata
  : {};
const preserveTestProfileData = Boolean(isIntegrationTestData && ['cleared', 'custom', 'imported'].includes(dataSyncMetadata.testDataState));
const integrationTestData = isIntegrationTestData && !preserveTestProfileData ? createIntegrationTestData(initialNow) : null;
const integrationHomeworkProbe = isIntegrationTestData ? readStorageResult(HOMEWORK_STORAGE_KEY) : null;
const resetIntegrationTestData = Boolean(isIntegrationTestData && !preserveTestProfileData && (
  integrationHomeworkProbe.status !== 'valid'
  || integrationHomeworkProbe.value?.meta?.dataProfile !== TEST_DATA_PROFILE
  || Number(integrationHomeworkProbe.value?.meta?.schemaVersion) !== 1
  || integrationHomeworkProbe.value?.meta?.referenceDateKey !== localDateKey(initialNow)
));
const readInitialStorage = (key, fallback) => resetIntegrationTestData ? fallback : readStorage(key, fallback);
let scheduleOverrides = readInitialStorage(SCHEDULE_STORAGE_KEY, integrationTestData?.scheduleOverrides || {});
const storedAcademicPeriodSettings = readInitialStorage(ACADEMIC_PERIOD_STORAGE_KEY, integrationTestData?.academic || null);
const storedAcademicPeriodValidation = validateAcademicPeriodSettings(storedAcademicPeriodSettings);
let hasSavedAcademicPeriodSettings = Boolean(
  storedAcademicPeriodSettings
  && typeof storedAcademicPeriodSettings === 'object'
  && storedAcademicPeriodValidation.valid
);
let academicPeriodSettings = hasSavedAcademicPeriodSettings
  ? normalizeAcademicPeriodSettings(storedAcademicPeriodSettings, createDefaultAcademicPeriodSettings(defaultAcademicYear))
  : createDefaultAcademicPeriodSettings(integrationTestData?.academic.academicYear || defaultAcademicYear);
if (hasSavedAcademicPeriodSettings) {
  // Keep using a valid stored value even if migration cannot be rewritten.
  writeStorage(ACADEMIC_PERIOD_STORAGE_KEY, academicPeriodSettings);
}
const storedTeachingClassSettings = readInitialStorage(TEACHING_CLASSES_STORAGE_KEY, null);
const parsedTeachingClassSettings = parseTeachingClassSettings(storedTeachingClassSettings);
let teachingClassSettings = parsedTeachingClassSettings.valid
  ? parsedTeachingClassSettings.settings
  : (integrationTestData?.teaching || createEmptyTeachingClassSettings());
if (parsedTeachingClassSettings.valid && parsedTeachingClassSettings.migrated) {
  // A readable legacy value remains usable even if the optional migration rewrite fails.
  writeStorage(TEACHING_CLASSES_STORAGE_KEY, teachingClassSettings);
}
const storedScheduleManagementSettings = readInitialStorage(MANAGED_SCHEDULE_STORAGE_KEY, null);
const parsedScheduleManagementSettings = parseScheduleManagementSettings(storedScheduleManagementSettings);
let scheduleManagementSettings = parsedScheduleManagementSettings.valid
  ? parsedScheduleManagementSettings.settings
  : (integrationTestData?.schedules || createEmptyScheduleManagementSettings());
if (parsedScheduleManagementSettings.valid || isIntegrationTestData) {
  writeStorage(MANAGED_SCHEDULE_STORAGE_KEY, scheduleManagementSettings);
}
if (isIntegrationTestData && !preserveTestProfileData) {
  writeStorage(SCHEDULE_STORAGE_KEY, scheduleOverrides);
  writeStorage(ACADEMIC_PERIOD_STORAGE_KEY, academicPeriodSettings);
  writeStorage(TEACHING_CLASSES_STORAGE_KEY, teachingClassSettings);
  writeStorage(MANAGED_SCHEDULE_STORAGE_KEY, scheduleManagementSettings);
}
const emptyClassroomRecords = { assignments: {}, exams: {}, courses: {}, reminders: {}, drawSessions: {}, meta: {} };
const homeworkStorageResult = resetIntegrationTestData ? { status: 'missing', value: null } : readStorageResult(HOMEWORK_STORAGE_KEY);
const storedHomework = homeworkStorageResult.status === 'valid'
  ? homeworkStorageResult.value
  : (integrationTestData?.homework || emptyClassroomRecords);
const storedHomeworkShapeValid = Boolean(storedHomework && typeof storedHomework === 'object' && !Array.isArray(storedHomework)
  && storedHomework.assignments && typeof storedHomework.assignments === 'object' && !Array.isArray(storedHomework.assignments));
const homeworkStorageNeedsAttention = Boolean(!isIntegrationTestData
  && homeworkStorageResult.status !== 'missing'
  && (homeworkStorageResult.status !== 'valid' || !storedHomeworkShapeValid));
let homeworkRecords = normalizeHomeworkSubmissionRecords(normalizeClassroomRecords(storedHomework, integrationTestData?.homework || emptyClassroomRecords));
if (!homeworkStorageNeedsAttention) writeStorage(HOMEWORK_STORAGE_KEY, homeworkRecords);
let longPressTimer = null;
let pressStart = null;
let suppressedClick = null;
let suppressedClickTimer = null;
let lastTodayEmphasisId = null;
let todayScrollRequested = true;
let hasPositionedToday = false;
let modalReturnSlotId = null;
let toastTimer = null;
let toastGeneration = 0;
let reminderFlashTimer = null;
let reminderPageScrollY = 0;
let reminderSheetScrollTop = 0;
let drawSheetReturnAction = null;
let drawSheetEntering = false;
let installPromptEvent = null;
let installState = Boolean(
  window.matchMedia?.('(display-mode: standalone)')?.matches
  || navigator.standalone === true
) ? 'installed' : 'instructions';

const state = {
  page: 'today',
  now: initialNow,
  selectedDateKey: selectedDateAfterEvent(null, initialNow, 'reload'),
  selectedSlotId: null,
  session: null,
  activeAssignment: null,
  assignmentForm: null,
  assignmentHub: { groupKey: null, assignmentId: null, courseKey: null },
  recordHubCollapsedGrades: { assignment: [], exam: [] },
  assignmentHubReturnPage: 'today',
  submissionCompleteTarget: null,
  assignmentHubCancelTarget: null,
  activeExam: null,
  examForm: null,
  examHub: { groupKey: null, examId: null, courseKey: null },
  examHubReturnPage: 'today',
  academicPeriodDraft: null,
  academicPeriodValidation: null,
  academicPeriodLastValidYear: null,
  teachingClassDraft: null,
  teachingClassValidation: null,
  teachingClassBatchDraft: null,
  teachingClassBatchValidation: null,
  teachingClassReturnId: null,
  scheduleExpandedPeriods: [],
  scheduleVersionForm: null,
  scheduleVersionValidation: null,
  scheduleEditor: null,
  scheduleEditorValidation: null,
  scheduleReturnVersionId: null,
  dataSyncNotice: null,
  pendingBackupImport: null,
  makeupCompleteTarget: null,
  cancelTarget: null,
  examCancelTarget: null,
  modal: null,
  accordion: null,
  leaveMode: false,
  reminderCategory: null,
  reminderFlashSeat: null,
  reminderAnnouncement: '',
  reminderSheetOpen: false,
  drawUseWeighting: true,
  drawAllowRepeat: false,
  drawSessionKey: '',
  drawCurrentSeat: null,
  drawExcludedSeats: [],
  drawHistory: [],
  drawSeatsThisRound: [],
  drawSheet: null,
  drawManualSeat: null,
  drawAnnouncement: '',
  draftSeatStates: {},
  draftExamSeatStates: {},
  toast: ''
};

const drawTimer = createCountdown();
let drawTimerInterval = null;
let drawTimerSessionKey = '';
let drawTimerCustomOpen = false;
let drawTimerLastPhase = 'idle';
let drawTimerAnnouncement = '';
const drawTimerDuration = { minutes: 1, seconds: 0 };
let releaseDrawTimerWheels = () => {};

function stopDrawTimer() {
  if (drawTimerInterval !== null) window.clearInterval(drawTimerInterval);
  drawTimerInterval = null;
  releaseDrawTimerWheels();
  releaseDrawTimerWheels = () => {};
  drawTimer.stop();
  drawTimerCustomOpen = false;
  drawTimerSessionKey = '';
  drawTimerLastPhase = 'idle';
  drawTimerAnnouncement = '';
}

function readDrawTimer() {
  const snapshot = drawTimer.snapshot();
  if (snapshot.phase === 'done' && drawTimerLastPhase !== 'done') {
    drawTimerAnnouncement = '時間到，可以抽一位同學。';
  }
  if (snapshot.phase !== 'running' && drawTimerInterval !== null) {
    window.clearInterval(drawTimerInterval);
    drawTimerInterval = null;
  }
  drawTimerLastPhase = snapshot.phase;
  return snapshot;
}

function drawTimerContents(snapshot = readDrawTimer()) {
  return renderCountdownContents(snapshot, { ...drawTimerDuration, customOpen: drawTimerCustomOpen });
}

function renderDrawTimer() {
  const snapshot = readDrawTimer();
  return `<section class="draw-timer" data-draw-timer data-phase="${snapshot.phase}" aria-labelledby="draw-timer-title"><div data-timer-content>${drawTimerContents(snapshot)}</div><span class="visually-hidden" role="status" aria-live="polite" data-timer-announcement>${escapeHtml(drawTimerAnnouncement)}</span></section>`;
}

function mountDrawTimerWheels() {
  releaseDrawTimerWheels();
  releaseDrawTimerWheels = bindTimerWheels(app.querySelector('[data-draw-timer]'), {
    values: drawTimerDuration,
    onChange() {
      const button = app.querySelector('[data-action="timer-start"]');
      if (button) button.disabled = timerDurationSeconds(drawTimerDuration.minutes, drawTimerDuration.seconds) == null;
    }
  });
}

function syncDrawTimer() {
  if (state.page !== 'draw' || (drawTimerSessionKey && drawTimerSessionKey !== classroomReminderSessionKey(state.session))) { stopDrawTimer(); return; }
  const snapshot = readDrawTimer();
  const panel = app.querySelector('[data-draw-timer]');
  if (!panel) return;
  if (panel.dataset.phase !== snapshot.phase) {
    const restoreFocus = panel.contains(document.activeElement);
    panel.dataset.phase = snapshot.phase;
    panel.querySelector('[data-timer-content]').innerHTML = drawTimerContents(snapshot);
    const announcement = panel.querySelector('[data-timer-announcement]');
    if (announcement) announcement.textContent = drawTimerAnnouncement;
    mountDrawTimerWheels();
    if (restoreFocus) panel.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
  } else {
    const value = panel.querySelector('[data-timer-value]');
    const label = formatTimerTime(snapshot.remainingMs);
    if (value && value.textContent !== label) value.textContent = label;
  }
}

function handleDrawTimerAction(action, target) {
  if (state.page !== 'draw' || !state.session || target.disabled) return;
  let focusAction = '';
  if (action === 'timer-preset' || action === 'timer-start') {
    const seconds = action === 'timer-preset' ? Number(target.dataset.seconds) : timerDurationSeconds(drawTimerDuration.minutes, drawTimerDuration.seconds);
    if (seconds == null || !drawTimer.start(seconds)) return;
    if (drawTimerInterval !== null) window.clearInterval(drawTimerInterval);
    drawTimerSessionKey = classroomReminderSessionKey(state.session);
    drawTimerInterval = window.setInterval(syncDrawTimer, 200);
    drawTimerCustomOpen = false;
    drawTimerAnnouncement = '開始計時';
    focusAction = 'timer-pause';
  } else if (action === 'timer-custom') {
    if (!['idle', 'done'].includes(drawTimer.snapshot().phase)) return;
    drawTimerCustomOpen = !drawTimerCustomOpen;
    drawTimerAnnouncement = '';
    focusAction = 'timer-custom';
  } else if (action === 'timer-cancel') {
    drawTimerCustomOpen = false;
    focusAction = 'timer-custom';
  } else if (action === 'timer-pause') {
    const snapshot = drawTimer.pause();
    drawTimerAnnouncement = snapshot.phase === 'paused' ? '計時已暫停' : '時間到，可以抽一位同學。';
    focusAction = snapshot.phase === 'paused' ? 'timer-resume' : 'timer-preset';
  } else if (action === 'timer-resume') {
    if (drawTimer.resume().phase !== 'running') return;
    if (drawTimerInterval !== null) window.clearInterval(drawTimerInterval);
    drawTimerInterval = window.setInterval(syncDrawTimer, 200);
    drawTimerAnnouncement = '繼續計時';
    focusAction = 'timer-pause';
  } else if (action === 'timer-end') {
    stopDrawTimer();
    drawTimerAnnouncement = '計時已結束';
    focusAction = 'timer-preset';
  } else return;
  render();
  window.requestAnimationFrame(() => app.querySelector(`[data-action="${focusAction}"]`)?.focus({ preventScroll: true }));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function selectedDate() {
  return dateFromKey(state.selectedDateKey);
}

function managedScheduleVersionForDate(date) {
  if (!hasSavedAcademicPeriodSettings) return null;
  const target = typeof date === 'string' ? dateFromKey(date) : date;
  return activeManagedScheduleVersion(
    scheduleManagementSettings,
    currentTeachingAcademicYear(),
    target,
    academicPeriodSettings
  );
}

function scheduleTimesForDate(date) {
  return (managedScheduleVersionForDate(date)?.times || createDefaultManagedScheduleTimes())
    .map((period) => ({ ...period }));
}

function periodTuplesForDate(date) {
  return scheduleTimesForDate(date).map(({ id, period, start, end }) => [id, period, start, end]);
}

function scheduleSlots(date = selectedDate()) {
  return managedScheduleSlotsForDate(
    managedScheduleVersionForDate(date),
    teachingClassesThisYear(),
    scheduleOverrides,
    date
  );
}

function scheduleSlotsProvider(dateKey) {
  return scheduleSlots(dateFromKey(dateKey));
}

function selectedSlot(date = state.modal?.entryDate || selectedDate()) {
  return scheduleSlots(date).find((slot) => slot.id === state.selectedSlotId) || null;
}

function checkSummary(target) {
  const summary = target.lastCheck?.summary;
  if (!summary) return '尚未檢查';
  if (summary.complete) return '已檢查｜全員完成';
  const parts = [];
  if (summary.incomplete) parts.push(`${summary.incomplete} 人未完成`);
  if (summary.leave) parts.push(`${summary.leave} 人請假`);
  return `已檢查｜${parts.join('・')}`;
}

function sessionCourseKey(session = state.session) {
  return session ? courseDataKey(session.course) : '';
}

function teachingClassForCourse(course) {
  if (!course) return null;
  const records = teachingClassesThisYear();
  if (course.teachingClassId) {
    const exact = records.find((record) => record.id === course.teachingClassId);
    if (exact) return exact;
  }
  return records.find((record) => (
    record.system === course.system
    && record.grade === course.grade
    && record.className === course.className
    && record.subject === course.subject
  )) || null;
}

function rosterForSession(session = state.session) {
  const record = teachingClassForCourse(session?.course);
  return record
    ? { ...teachingClassRoster(record), missing: false }
    : { lastSeat: 0, vacantSeats: [], allSeats: [], activeSeats: [], missing: true };
}

function activeRosterSeats(session = state.session) {
  return rosterForSession(session).activeSeats;
}

function sanitizeSeatStatesForSession(seatStates, session = state.session) {
  const active = new Set(activeRosterSeats(session));
  return Object.fromEntries(Object.entries(seatStates || {})
    .filter(([seat]) => active.has(Number(seat))));
}

function vacantSeatDescription(roster) {
  return roster.vacantSeats.length ? `${roster.vacantSeats.join('、')} 號為空號` : '本班沒有空號';
}

function renderMissingRosterNotice(roster = rosterForSession()) {
  return roster?.missing
    ? '<section class="common-empty" role="alert">找不到這堂課對應的授課班級名冊。請先到設定檢查授課班級與課表，再重新進入課堂。</section>'
    : '';
}

function sessionRecordGroupKey(session = state.session) {
  const course = session?.course;
  return course ? `${course.system}:${course.grade}:${course.subject}` : '';
}

function assignmentsForSession() {
  const courseKey = sessionCourseKey();
  return Object.values(homeworkRecords.assignments).filter((assignment) => assignment.status === 'active' && assignment.targets?.[courseKey]?.status !== 'cancelled' && assignment.targets?.[courseKey]);
}

function examCheckSummary(target) {
  const summary = target.lastCheck?.summary;
  if (!summary) return '尚未點名';
  return summary.complete ? '已點名｜全員到考' : `已點名｜${summary.absent} 人缺考`;
}

function examsForSession() {
  const courseKey = sessionCourseKey();
  return Object.values(homeworkRecords.exams).filter((exam) => exam.status === 'active' && exam.targets?.[courseKey]?.status !== 'cancelled' && exam.targets?.[courseKey]);
}

function persistProfileValue(key, value) {
  if (!isIntegrationTestData) return writeStorage(key, value);
  const nextMetadata = { ...dataSyncMetadata, testDataState: 'custom' };
  const values = new Map();
  try {
    values.set(key, JSON.stringify(value));
    values.set(DATA_SYNC_STORAGE_KEY, JSON.stringify(nextMetadata));
  } catch {
    return false;
  }
  const result = replaceStorageValues(values);
  if (result.ok) dataSyncMetadata = nextMetadata;
  return result.ok;
}

function persistHomework() {
  if (homeworkStorageNeedsAttention) return false;
  return persistProfileValue(HOMEWORK_STORAGE_KEY, homeworkRecords);
}

function persistScheduleOverrides() {
  return persistProfileValue(SCHEDULE_STORAGE_KEY, scheduleOverrides);
}

function persistAcademicPeriodSettings(settings) {
  return persistProfileValue(ACADEMIC_PERIOD_STORAGE_KEY, settings);
}

function currentTeachingAcademicYear() {
  return Number(academicPeriodSettings.academicYear) || defaultAcademicYear;
}

function teachingClassesThisYear() {
  return teachingClassesForAcademicYear(teachingClassSettings, currentTeachingAcademicYear());
}

function persistTeachingClassSettings(settings) {
  return persistProfileValue(TEACHING_CLASSES_STORAGE_KEY, settings);
}

function persistScheduleManagementSettings(settings) {
  return persistProfileValue(MANAGED_SCHEDULE_STORAGE_KEY, settings);
}

function scheduleVersionsThisYear() {
  return managedScheduleVersionsForAcademicYear(scheduleManagementSettings, currentTeachingAcademicYear());
}

function scheduleTimesThisYear() {
  return managedScheduleTimesForAcademicYear(scheduleManagementSettings, currentTeachingAcademicYear());
}

function scheduleVersionsWithRangesThisYear() {
  return managedScheduleVersionsWithRanges(
    scheduleManagementSettings,
    currentTeachingAcademicYear(),
    academicPeriodSettings
  );
}

function activeScheduleVersion(now = state.now) {
  if (!hasSavedAcademicPeriodSettings) return null;
  return activeManagedScheduleVersion(
    scheduleManagementSettings,
    currentTeachingAcademicYear(),
    now,
    academicPeriodSettings
  );
}

function schedulePeriodSetting(periodId) {
  return academicPeriodSettings.periods.find((period) => period.id === periodId) || null;
}

function firstEnabledSchedulePeriodId() {
  return ACADEMIC_PERIOD_DEFINITIONS.find((definition) => schedulePeriodSetting(definition.id)?.enabled)?.id || 'firstSemester';
}

function scheduleVersionId() {
  return globalThis.crypto?.randomUUID?.() || `schedule-version-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function scheduleVersionClone(version) {
  return {
    ...version,
    times: (version?.times || createDefaultManagedScheduleTimes()).map((period) => ({ ...period })),
    slots: Object.fromEntries(MANAGED_SCHEDULE_WEEKDAYS.map((weekday) => [
      weekday.id,
      { ...(version?.slots?.[weekday.id] || createEmptyManagedScheduleSlots()[weekday.id]) }
    ]))
  };
}

function scheduleVersionsBefore(periodId, startDate) {
  return scheduleVersionsThisYear()
    .filter((version) => version.periodId === periodId && version.startDate < startDate)
    .sort((left, right) => right.startDate.localeCompare(left.startDate));
}

function defaultScheduleVersionStartDate(periodId) {
  const period = schedulePeriodSetting(periodId);
  if (!period) return '';
  const todayKey = localDateKey(state.now);
  let candidate = period.startDate <= todayKey && todayKey <= period.endDate ? todayKey : period.startDate;
  const existingDates = new Set(scheduleVersionsThisYear()
    .filter((version) => version.periodId === periodId)
    .map((version) => version.startDate));
  if (!existingDates.has(candidate)) return candidate;
  const latest = [...existingDates].sort().at(-1);
  const afterLatest = latest ? addDaysToDateKey(latest, 1) : candidate;
  if (afterLatest && afterLatest <= period.endDate) candidate = afterLatest;
  return candidate;
}

function newScheduleVersionForm(periodId = '') {
  const currentPeriod = hasSavedAcademicPeriodSettings
    ? academicPeriodForLocalDate(academicPeriodSettings, state.now)
    : null;
  const selectedPeriodId = periodId || currentPeriod?.id || firstEnabledSchedulePeriodId();
  const startDate = defaultScheduleVersionStartDate(selectedPeriodId);
  return {
    id: '',
    periodId: selectedPeriodId,
    startDate,
    sourceMode: scheduleVersionsBefore(selectedPeriodId, startDate).length ? 'copy' : 'blank'
  };
}

function scheduleTeachingClassMap() {
  return new Map(teachingClassesThisYear().map((record) => [record.id, record]));
}

function scheduleCellLabel(teachingClassId) {
  if (!teachingClassId) return { classLabel: '空堂', subject: '', full: '空堂' };
  const record = scheduleTeachingClassMap().get(teachingClassId);
  if (!record) return { classLabel: '已移除', subject: '', full: '授課班級已不存在' };
  const classLabel = teachingClassDisplayLabel(record);
  return { classLabel, subject: record.subject, full: `${classLabel}・${record.subject}` };
}

function managedScheduleFilledCount(version) {
  return MANAGED_SCHEDULE_WEEKDAYS.reduce((count, weekday) => (
    count + DEFAULT_MANAGED_SCHEDULE_TIMES.filter((period) => version?.slots?.[weekday.id]?.[period.id]).length
  ), 0);
}

function startScheduleEditor(version, isNew = false) {
  const draft = scheduleVersionClone(version);
  state.scheduleEditor = {
    version: draft,
    isNew,
    originalSignature: isNew ? '' : JSON.stringify(draft)
  };
  state.scheduleEditorValidation = null;
  state.scheduleReturnVersionId = isNew ? null : version.id;
  state.page = 'schedule-editor';
}

function scheduleEditorHasChanges() {
  if (!state.scheduleEditor) return false;
  return state.scheduleEditor.isNew
    || JSON.stringify(state.scheduleEditor.version) !== state.scheduleEditor.originalSignature;
}

function validateScheduleEditor(version, validateMetadata = true) {
  const meta = validateMetadata
    ? validateManagedScheduleVersionDraft(version, scheduleVersionsThisYear(), academicPeriodSettings)
    : { errors: [], fieldErrors: {} };
  const timeValidation = validateManagedScheduleTimes(version?.times);
  const validClassIds = new Set(teachingClassesThisYear().map((record) => record.id));
  const missingClassIds = new Set();
  for (const weekday of MANAGED_SCHEDULE_WEEKDAYS) {
    for (const period of DEFAULT_MANAGED_SCHEDULE_TIMES) {
      const classId = version?.slots?.[weekday.id]?.[period.id];
      if (classId && !validClassIds.has(classId)) missingClassIds.add(classId);
    }
  }
  const errors = [
    ...meta.errors,
    ...timeValidation.errors.map((error) => ({ ...error, field: 'times' })),
    ...(missingClassIds.size ? [{ field: 'slots', code: 'missing-class', message: '課表中有已不存在的授課班級，請重新選擇或改為空堂。' }] : [])
  ];
  return { valid: errors.length === 0, errors, fieldErrors: meta.fieldErrors };
}

function newTeachingClassDraft(record = null) {
  if (record) {
    return {
      ...record,
      vacantSeatsInput: record.vacantSeats.join('、')
    };
  }
  return {
    id: '',
    system: 'junior',
    grade: Object.keys(COURSE_CATALOG.junior.grades)[0],
    className: '',
    subject: '',
    lastSeat: 50,
    vacantSeatsInput: ''
  };
}

function newTeachingClassBatchRow() {
  return {
    className: '',
    lastSeat: 50,
    vacantSeatsInput: ''
  };
}

function newTeachingClassBatchDraft() {
  const system = 'junior';
  return {
    system,
    grade: Object.keys(COURSE_CATALOG[system].grades)[0],
    subject: '',
    rows: [newTeachingClassBatchRow()]
  };
}

function createTeachingClassId() {
  return globalThis.crypto?.randomUUID?.() || `teaching-class-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function focusTeachingClassError(validation) {
  const firstField = validation?.errors?.[0]?.field || '';
  const target = firstField
    ? app.querySelector(`[data-teaching-class-field="${firstField}"]`)
    : null;
  (target || app.querySelector('#teaching-class-errors'))?.focus({ preventScroll: false });
}

function focusTeachingClassBatchError(validation) {
  const firstError = validation?.errors?.[0];
  const rowSelector = Number.isInteger(firstError?.rowIndex)
    ? `[data-teaching-class-row-index="${firstError.rowIndex}"]`
    : '';
  const target = firstError?.field && firstError.field !== 'rows'
    ? app.querySelector(`${rowSelector}[data-teaching-class-field="${firstError.field}"]`)
    : null;
  (target || app.querySelector('#teaching-class-errors'))?.focus({ preventScroll: false });
}

function clearTeachingClassErrorsInPlace() {
  state.teachingClassValidation = null;
  app.querySelector('#teaching-class-errors')?.remove();
  for (const element of app.querySelectorAll('[data-teaching-class-field][aria-invalid="true"]')) {
    element.removeAttribute('aria-invalid');
    const helpId = element.dataset.teachingClassField === 'className'
      ? 'teaching-class-name-help'
      : element.dataset.teachingClassField === 'subject'
        ? 'teaching-class-subject-help'
        : element.dataset.teachingClassField === 'lastSeat'
          ? 'teaching-class-last-seat-help'
          : element.dataset.teachingClassField === 'vacantSeats'
            ? 'teaching-class-vacant-help'
            : '';
    if (helpId) element.setAttribute('aria-describedby', helpId);
    else element.removeAttribute('aria-describedby');
  }
  for (const error of app.querySelectorAll('.teaching-class-field-error')) error.remove();
}

function clearTeachingClassBatchErrorsInPlace() {
  state.teachingClassBatchValidation = null;
  app.querySelector('#teaching-class-errors')?.remove();
  for (const element of app.querySelectorAll('[data-teaching-class-field][aria-invalid="true"]')) {
    element.removeAttribute('aria-invalid');
    const helpId = element.dataset.teachingClassHelpId;
    if (helpId) element.setAttribute('aria-describedby', helpId);
    else element.removeAttribute('aria-describedby');
  }
  for (const error of app.querySelectorAll('.teaching-class-field-error')) error.remove();
}

function updateTeachingClassDraftField(field, value) {
  if (!state.teachingClassDraft) return;
  if (field === 'system') {
    const system = COURSE_CATALOG[value] ? value : Object.keys(COURSE_CATALOG)[0];
    const grades = Object.keys(COURSE_CATALOG[system].grades);
    state.teachingClassDraft = { ...state.teachingClassDraft, system, grade: grades[0] };
  } else if (field === 'grade') {
    const grades = COURSE_CATALOG[state.teachingClassDraft.system]?.grades || {};
    state.teachingClassDraft = { ...state.teachingClassDraft, grade: grades[value] ? value : Object.keys(grades)[0] };
  } else if (field === 'vacantSeats') {
    state.teachingClassDraft = { ...state.teachingClassDraft, vacantSeatsInput: value };
  } else {
    state.teachingClassDraft = { ...state.teachingClassDraft, [field]: value };
  }
  clearTeachingClassErrorsInPlace();
}

function updateTeachingClassBatchDraftField(field, value, rowIndex = null) {
  if (!state.teachingClassBatchDraft) return;
  if (Number.isInteger(rowIndex)) {
    if (!state.teachingClassBatchDraft.rows[rowIndex]) return;
    state.teachingClassBatchDraft = {
      ...state.teachingClassBatchDraft,
      rows: state.teachingClassBatchDraft.rows.map((row, index) => index === rowIndex
        ? { ...row, [field === 'vacantSeats' ? 'vacantSeatsInput' : field]: value }
        : row)
    };
  } else if (field === 'system') {
    const system = COURSE_CATALOG[value] ? value : Object.keys(COURSE_CATALOG)[0];
    state.teachingClassBatchDraft = {
      ...state.teachingClassBatchDraft,
      system,
      grade: Object.keys(COURSE_CATALOG[system].grades)[0]
    };
  } else if (field === 'grade') {
    const grades = COURSE_CATALOG[state.teachingClassBatchDraft.system]?.grades || {};
    state.teachingClassBatchDraft = {
      ...state.teachingClassBatchDraft,
      grade: grades[value] ? value : Object.keys(grades)[0]
    };
  } else {
    state.teachingClassBatchDraft = { ...state.teachingClassBatchDraft, [field]: value };
  }
  clearTeachingClassBatchErrorsInPlace();
}

function clearAcademicPeriodErrorsInPlace() {
  state.academicPeriodValidation = null;
  app.querySelector('#academic-period-errors')?.remove();
  for (const element of app.querySelectorAll('[aria-invalid="true"]')) {
    element.removeAttribute('aria-invalid');
    element.removeAttribute('aria-describedby');
  }
  for (const error of app.querySelectorAll('.academic-field-error')) error.remove();
  for (const card of app.querySelectorAll('.academic-period-card.has-error')) card.classList.remove('has-error');
}

function updateAcademicPeriodPreviewInPlace() {
  if (!state.academicPeriodDraft) return;
  const currentPeriod = academicPeriodForLocalDate(state.academicPeriodDraft, state.now);
  const label = app.querySelector('[data-academic-current-label]');
  const detail = app.querySelector('[data-academic-current-detail]');
  if (label) label.textContent = currentPeriod?.label || '非教學期間';
  if (detail) detail.textContent = `${calendarDayFormatter.format(state.now)}${currentPeriod ? `・${academicPeriodDateRange(currentPeriod)}` : '・不在任何啟用期間內'}`;
}

function updateAcademicPeriodYearDraft(rawYear) {
  if (!state.academicPeriodDraft) return;
  const requestedYear = Number(rawYear);
  if (Number.isInteger(requestedYear) && requestedYear >= 1 && requestedYear <= 999) {
    const previousYear = state.academicPeriodLastValidYear ?? state.academicPeriodDraft.academicYear;
    state.academicPeriodDraft = shiftAcademicPeriodSettingsYear(
      { ...state.academicPeriodDraft, academicYear: previousYear },
      requestedYear
    );
    state.academicPeriodLastValidYear = requestedYear;
    for (const period of state.academicPeriodDraft.periods) {
      for (const field of ['startDate', 'endDate']) {
        const input = app.querySelector(`[data-action="academic-period-date"][data-period-id="${period.id}"][data-field="${field}"]`);
        if (input) input.value = period[field];
      }
      const disabledNote = app.querySelector(`[data-academic-disabled-note="${period.id}"]`);
      if (disabledNote) {
        disabledNote.textContent = `目前不使用；日期草稿 ${period.startDate && period.endDate ? `${formatAcademicDate(period.startDate)}～${formatAcademicDate(period.endDate)}` : '尚未填寫'}，重新開啟時會保留。`;
      }
    }
  } else {
    state.academicPeriodDraft = { ...state.academicPeriodDraft, academicYear: rawYear };
  }
  clearAcademicPeriodErrorsInPlace();
  updateAcademicPeriodPreviewInPlace();
}

function focusAcademicPeriodError(validation) {
  const firstField = validation?.errors?.[0]?.field || '';
  const fieldTarget = firstField === 'academicYear'
    ? app.querySelector('#academic-year-input')
    : firstField.includes('.')
      ? app.querySelector(`[data-action="academic-period-date"][data-period-id="${firstField.split('.')[0]}"][data-field="${firstField.split('.')[1]}"]`)
      : null;
  (fieldTarget || app.querySelector('#academic-period-errors'))?.focus({ preventScroll: false });
}

function clearTimedToast() {
  toastGeneration += 1;
  window.clearTimeout(toastTimer);
  toastTimer = null;
  state.toast = '';
}

function showTimedToast(message, duration = 2200) {
  clearTimedToast();
  const token = toastGeneration;
  state.toast = message;
  render();
  toastTimer = window.setTimeout(() => {
    if (token !== toastGeneration) return;
    const toast = app.querySelector(`[data-toast-token="${token}"]`);
    state.toast = '';
    toastTimer = null;
    toast?.remove();
  }, duration);
}

function todayEmphasisId(now = state.now) {
  if (dateRelation(state.selectedDateKey, now) !== 'today') return null;
  const view = getScheduleViewForDate(scheduleSlots(selectedDate()), selectedDate(), now);
  return view.activeId || view.nextId;
}

function minuteStamp(date) {
  return `${localDateKey(date)}:${date.getHours()}:${date.getMinutes()}`;
}

function positionTodaySchedule() {
  if (state.page !== 'today') return;
  const emphasisId = todayEmphasisId();
  if (emphasisId !== lastTodayEmphasisId) todayScrollRequested = true;
  lastTodayEmphasisId = emphasisId;
  if (!todayScrollRequested || !emphasisId) return;
  todayScrollRequested = false;
  window.requestAnimationFrame(() => {
    const row = app.querySelector(`[data-slot="${emphasisId}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: hasPositionedToday ? 'smooth' : 'auto' });
    hasPositionedToday = true;
  });
}

function refreshDeviceTime(force = false) {
  const previous = state.now;
  const previousEmphasisId = todayEmphasisId(previous);
  const previousCourseState = state.session ? sessionScheduleState(state.session, previous) : null;
  const next = new Date();
  state.now = next;
  state.selectedDateKey = selectedDateAfterEvent(state.selectedDateKey, next, 'refresh');
  if (state.modal) return;
  if (state.page === 'homework' || state.page === 'exam-attendance') return;
  if (state.page === 'today') {
    const nextEmphasisId = todayEmphasisId(next);
    if (nextEmphasisId !== previousEmphasisId) todayScrollRequested = true;
    if (force || minuteStamp(previous) !== minuteStamp(next) || nextEmphasisId !== previousEmphasisId) render();
    return;
  }
  if (state.page === 'course' && state.session) {
    const nextCourseState = sessionScheduleState(state.session, next);
    if (force || minuteStamp(previous) !== minuteStamp(next) || nextCourseState !== previousCourseState) render();
    return;
  }
  if (state.page === 'weekly-schedule') {
    if (force || localDateKey(previous) !== localDateKey(next)) render();
    return;
  }
  if (state.page === 'settings' || state.page === 'academic-period-settings' || state.page === 'schedule-management') {
    if (force || localDateKey(previous) !== localDateKey(next)) {
      if (state.page === 'schedule-management') {
        const activeVersion = activeScheduleVersion(next);
        state.scheduleExpandedPeriods = activeVersion ? [activeVersion.periodId] : [];
      }
      render();
    }
  }
}

function pageHeader(title, subtitle, backAction = null, dateAction = null, trailing = '', backLabel = '返回') {
  const copy = dateAction
    ? `<button class="topbar-copy date-button" data-action="${dateAction}" aria-label="選擇日期，目前是${escapeHtml(subtitle)}" aria-haspopup="dialog" aria-expanded="${state.modal?.mode === 'calendar'}"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></button>`
    : `<div class="topbar-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div>`;
  return `
    <header class="topbar">
      <div class="topbar-inner">
        ${backAction ? `<button class="icon-button" data-action="${backAction}" aria-label="${escapeHtml(backLabel)}">←</button>` : '<span class="brand-mark" aria-hidden="true">師</span>'}
        ${copy}
        ${trailing || '<span class="prototype-chip">V2 原型</span>'}
      </div>
    </header>`;
}

function renderToday() {
  const date = selectedDate();
  const activeVersion = managedScheduleVersionForDate(date);
  const slots = scheduleSlots(date);
  const view = getScheduleViewForDate(slots, date, state.now);
  const currentTime = state.now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  const rows = view.rows.map((slot) => {
    const isEmphasis = slot.state === 'current' || slot.state === 'next';
    const isPast = slot.state === 'past';
    const badge = slot.course ? (isPast ? '更正' : '進入') : '調課';
    const action = ` data-action="open-course" data-slot="${slot.id}"${slot.state === 'current' ? ' aria-current="time"' : ''}`;
    if (!slot.course) {
      return `<button class="schedule-row empty-row ${slot.state}"${action}>
        <span class="period-time"><strong>${slot.period}</strong><span>${slot.start}<br>${slot.end}</span></span>
        <span class="course-copy"><strong>空堂</strong><span>第 ${slot.period} 節・空堂，可安排調課</span></span>
        <span class="row-badge">${badge}</span>
      </button>`;
    }
    const status = view.relation === 'past' || isPast
      ? `第 ${slot.period} 節・已下課，可查看更正${slot.adjusted ? '・僅今日調課' : ''}`
      : `第 ${slot.period} 節・${slot.adjusted ? '僅今日調課' : slot.state === 'current' ? '上課中' : slot.state === 'next' ? '下一堂' : view.relation === 'future' ? '未來課程' : isEmphasis ? '點進入上課' : '稍後課程'}`;
    return `<button class="schedule-row ${slot.state}"${action}>
      <span class="period-time"><strong>${slot.period}</strong><span>${slot.start}<br>${slot.end}</span></span>
      <span class="course-copy"><strong>${escapeHtml(slot.course.classLabel)}　${escapeHtml(slot.course.subject)}</strong><span>${status}</span></span>
      <span class="row-badge">${badge}</span>
    </button>`;
  }).join('');
  const relationLabel = view.relation === 'today' ? '今日課表' : view.relation === 'past' ? '過去日期' : '未來日期';

  return `
    ${pageHeader('教師助手', formatter.format(date), null, 'open-calendar')}
    <main id="main" class="content today-content" tabindex="-1">
      <section class="day-hero">
        <div><p class="eyebrow">${relationLabel}</p><h1>${escapeHtml(view.headline)}</h1></div>
        ${view.relation === 'today' ? `<div class="clock"><span>手機時間</span><strong>${currentTime}</strong></div>` : '<button class="return-today-button" data-action="go-today">回到今天</button>'}
      </section>
      <div class="today-schedule-source-row">
        <p class="today-schedule-source ${activeVersion ? '' : 'missing'}">${activeVersion ? `使用課表：${escapeHtml(activeVersion.title)}・第 1～8 節` : '這一天沒有生效中的課表版本；目前顯示 1～8 節空堂，仍可單日調課。'}</p>
        <button type="button" class="weekly-schedule-link" data-action="open-weekly-schedule"><span>查看完整每週課表</span><i aria-hidden="true">›</i></button>
      </div>
      <section class="schedule-list" aria-label="${escapeHtml(formatter.format(date))}課表">${rows}</section>
    </main>`;
}

function renderWeeklySchedule() {
  const date = selectedDate();
  const version = managedScheduleVersionForDate(date);
  const selectedDateLabel = formatter.format(date);
  if (!version) {
    return `${pageHeader('每週課表', selectedDateLabel, 'back-weekly-schedule', 'open-calendar', '', '返回今日課表')}
      <main id="main" class="content weekly-schedule-content" tabindex="-1">
        <section class="common-empty weekly-schedule-empty" role="status">這個日期沒有生效中的課表版本。可點上方日期切換到其他日期查看。</section>
      </main>`;
  }
  const range = version.validRange && version.endDate
    ? `${formatAcademicDate(version.startDate)}～${formatAcademicDate(version.endDate)}`
    : `${formatAcademicDate(version.startDate)} 起`;
  return `${pageHeader('每週課表', selectedDateLabel, 'back-weekly-schedule', 'open-calendar', '', '返回今日課表')}
    <main id="main" class="content weekly-schedule-content" tabindex="-1">
      <section class="weekly-schedule-heading">
        <div><p class="eyebrow">${escapeHtml(version.periodLabel || '生效課表')}</p><h1>星期一到星期五</h1><p>${escapeHtml(selectedDateLabel)}使用這份課表・${escapeHtml(range)}</p></div>
        <span>1～8 節</span>
      </section>
      <section class="managed-schedule-grid-card weekly-schedule-grid-card" aria-labelledby="weekly-schedule-grid-title">
        <div class="managed-schedule-grid-heading"><div><p class="eyebrow">完整課表</p><h2 id="weekly-schedule-grid-title">${escapeHtml(version.title)}</h2></div><span>唯讀</span></div>
        ${renderManagedScheduleGrid(version, false)}
        <p class="managed-schedule-grid-help">這裡顯示課表版本中的固定安排；單日調課仍會顯示在對應日期的今日頁。</p>
      </section>
    </main>`;
}

function commonAssignmentGroups() {
  const availableCourses = teachingClassesThisYear().map(courseFromTeachingClass).filter(Boolean);
  return buildCommonAssignmentView(homeworkRecords.assignments, COURSE_CATALOG, availableCourses);
}

function commonExamGroups() {
  const availableCourses = teachingClassesThisYear().map(courseFromTeachingClass).filter(Boolean);
  return buildCommonExamView(homeworkRecords.exams, COURSE_CATALOG, availableCourses);
}

function commonRecordHubContext(kind) {
  const groups = kind === 'assignment' ? commonAssignmentGroups() : commonExamGroups();
  const grades = buildClassFirstRecordView(groups, kind);
  const hub = state[`${kind}Hub`];
  const idField = `${kind}Id`;
  const collection = kind === 'assignment' ? 'assignments' : 'exams';
  const selectedClass = grades.flatMap((grade) => grade.classes).find((item) => item.classKey === hub.classKey) || null;
  if (hub.classKey && !selectedClass) {
    state[`${kind}Hub`] = { groupKey: null, [idField]: null, courseKey: null };
    return { groups, grades, selectedClass: null, group: null, [kind]: null, detail: null };
  }
  const group = groups.find((item) => item.groupKey === hub.groupKey) || null;
  const record = group?.[collection].find((item) => item[idField] === hub[idField]) || null;
  if (hub[idField] && !record) {
    state[`${kind}Hub`] = { classKey: hub.classKey, groupKey: null, [idField]: null, courseKey: null };
    return { groups, grades, selectedClass, group: null, [kind]: null, detail: null };
  }
  const getDetail = kind === 'assignment' ? assignmentClassDetail : examClassDetail;
  const detail = record && hub.courseKey
    ? getDetail(homeworkRecords[collection], record[idField], hub.courseKey) : null;
  if (hub.courseKey && !detail) hub.courseKey = null;
  return { groups, grades, selectedClass, group, [kind]: record, detail };
}

function renderRecordClassDirectory(grades, kind) {
  const noun = kind === 'assignment' ? '作業' : '考試';
  const followup = kind === 'assignment' ? '待補交' : '待補考';
  const theme = kind === 'assignment' ? 'homework-hub-card' : '';
  const collapsed = state.recordHubCollapsedGrades[kind];
  const sections = grades.map((grade, index) => {
    const expanded = !collapsed.includes(grade.gradeKey);
    const panelId = `${kind}-grade-classes-${index}`;
    return `<section class="record-grade-section">
      <h2><button type="button" class="record-grade-toggle" data-action="toggle-record-grade" data-kind="${kind}" data-grade-key="${escapeHtml(grade.gradeKey)}" aria-expanded="${expanded}" aria-controls="${panelId}"><span>${escapeHtml(grade.label)}</span><small>${grade.classes.length} 班</small><span aria-hidden="true">${expanded ? '⌃' : '⌄'}</span></button></h2>
      <div id="${panelId}" class="record-class-grid" ${expanded ? '' : 'hidden'}>${grade.classes.map((item) => `<button type="button" class="exam-hub-card record-class-card ${theme}" data-action="open-record-class" data-kind="${kind}" data-class-key="${escapeHtml(item.classKey)}"><span class="exam-hub-card-copy"><strong>${escapeHtml(item.classLabel)}</strong><small>${escapeHtml(item.subjects.join('・'))}</small></span><span class="exam-hub-card-meta">${item.pendingCount ? `<em>${followup} ${item.pendingCount} 筆</em>` : `<em class="quiet">${item.recordCount} 份${noun}</em>`}<i aria-hidden="true">›</i></span></button>`).join('')}</div>
    </section>`;
  }).join('');
  return `<div class="record-grade-list">${sections || '<p class="common-empty">目前沒有授課班級，請先到設定新增。</p>'}</div>
    <button type="button" class="common-add-button ${kind === 'assignment' ? 'homework-add-button' : ''}" data-action="add-common-${kind}">＋ 新增${noun}</button>`;
}

function renderClassRecordList(selectedClass, kind) {
  const noun = kind === 'assignment' ? '作業' : '考試';
  const completedLabel = kind === 'assignment' ? '已檢查' : '已考試';
  const pendingLabel = kind === 'assignment' ? '未檢查' : '未考試';
  const followup = kind === 'assignment' ? '待補交' : '待補考';
  const section = (processed, title) => {
    const records = selectedClass.records.filter((record) => record.processed === processed);
    const id = `${kind}-class-section-${processed ? 'checked' : 'pending'}`;
    return `<section class="common-record-section" aria-labelledby="${id}"><div class="common-record-section-heading"><h2 id="${id}">${title}</h2><span>${records.length}</span></div>${records.length ? `<div class="exam-hub-list">${records.map((record) => {
      const status = record.pendingCount ? `${followup} ${record.pendingCount} 人` : record.targetStatus === 'cancelled' ? '已取消安排' : processed ? completedLabel : pendingLabel;
      const date = record.due ? `${formatDate(record.due.dateKey)}・第 ${record.due.period} 節` : '尚未設定時間';
      return `<button type="button" class="exam-hub-card exam-definition-card class-record-card ${kind === 'assignment' ? 'homework-hub-card' : ''}" data-action="open-class-record" data-kind="${kind}" data-record-id="${escapeHtml(record.recordId)}" data-group-key="${escapeHtml(record.groupKey)}" data-course-key="${escapeHtml(record.courseKey)}"><span class="exam-hub-card-copy"><strong>${escapeHtml(record.title)}</strong><small>${escapeHtml(record.subject)}・${date}</small></span><span class="exam-hub-card-meta"><em class="${record.pendingCount ? '' : 'quiet'}">${status}</em><i aria-hidden="true">›</i></span></button>`;
    }).join('')}</div>` : `<p class="common-section-empty">目前沒有${title}的${noun}。</p>`}</section>`;
  };
  return `<div class="common-record-sections" aria-label="${escapeHtml(selectedClass.classLabel)}的${noun}">${section(true, completedLabel)}${section(false, pendingLabel)}</div>
    <button type="button" class="common-add-button ${kind === 'assignment' ? 'homework-add-button' : ''}" data-action="add-common-${kind}">＋ 新增${noun}</button>`;
}

function openCommonRecordForm(kind, groupKey) {
  const { groups, selectedClass } = commonRecordHubContext(kind);
  const group = groups.find((item) => item.groupKey === groupKey);
  if (!group?.availableCourses.length) return;
  const classCourses = group.availableCourses.filter((course) => selectedClass?.courseKeys.includes(courseDataKey(course)));
  const session = commonHubSchedulingSession(classCourses.length ? { ...group, availableCourses: classCourses } : group);
  if (!session) return;
  state.modal = null;
  const openForm = kind === 'assignment' ? openAssignmentForm : openExamForm;
  openForm(null, { session, returnPage: `${kind}-hub`, availableCourses: group.availableCourses, showPeers: true });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function openCommonRecordCreatePicker(kind) {
  const { groups, group, selectedClass } = commonRecordHubContext(kind);
  const availableGroups = groups.filter((item) => item.availableCourses.length && (!selectedClass || item.availableCourses.some((course) => selectedClass.courseKeys.includes(courseDataKey(course)))));
  if (selectedClass && availableGroups.length === 1) return openCommonRecordForm(kind, availableGroups[0].groupKey);
  if (!selectedClass && group?.availableCourses.length) return openCommonRecordForm(kind, group.groupKey);
  state.modal = { mode: 'common-record-create', kind };
  render();
  window.requestAnimationFrame(() => app.querySelector('[data-action="choose-record-create-group"]')?.focus({ preventScroll: true }));
}

function renderCommonRecordCreatePicker() {
  const kind = state.modal.kind;
  const noun = kind === 'assignment' ? '作業' : '考試';
  const { groups, selectedClass } = commonRecordHubContext(kind);
  const availableGroups = groups.filter((group) => group.availableCourses.length && (!selectedClass || group.availableCourses.some((course) => selectedClass.courseKeys.includes(courseDataKey(course)))));
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal-card record-create-picker" role="dialog" aria-modal="true" aria-labelledby="record-create-title" data-modal-card><div class="modal-heading"><h2 id="record-create-title">新增${noun}</h2><button type="button" class="icon-button" data-action="close-modal" aria-label="關閉">×</button></div><p>${selectedClass ? `${escapeHtml(selectedClass.classLabel)}・選擇科目` : '選擇年級與科目'}</p><div class="exam-hub-list">${availableGroups.map((group) => `<button type="button" class="exam-hub-card record-create-choice ${kind === 'assignment' ? 'homework-hub-card' : ''}" data-action="choose-record-create-group" data-kind="${kind}" data-group-key="${escapeHtml(group.groupKey)}"><span class="exam-hub-card-copy"><strong>${escapeHtml(group.label)}</strong><small>${escapeHtml(COURSE_CATALOG[group.system]?.label || '')}</small></span><span aria-hidden="true">›</span></button>`).join('') || '<p class="common-empty">請先到設定新增授課班級，再安排作業或考試。</p>'}</div></section></div>`;
}

function returnToSavedClassRecord(kind, recordId, preferredCourseKey) {
  const hub = state[`${kind}Hub`];
  if (hub[`${kind}Id`]) return;
  const { grades, selectedClass } = commonRecordHubContext(kind);
  const matches = grades.flatMap((grade) => grade.classes).flatMap((item) => item.records.filter((record) => record.recordId === recordId).map((record) => ({ item, record })));
  const match = matches.find(({ item, record }) => item.classKey === selectedClass?.classKey && record.courseKey === preferredCourseKey)
    || matches.find(({ item }) => item.classKey === selectedClass?.classKey)
    || matches.find(({ record }) => record.courseKey === preferredCourseKey) || matches[0];
  if (match) state[`${kind}Hub`] = { classKey: match.item.classKey, groupKey: match.record.groupKey, [`${kind}Id`]: recordId, courseKey: match.record.courseKey };
}

function commonHubSchedulingSession(group, fallbackSession = null) {
  const courses = Array.isArray(group?.availableCourses) ? group.availableCourses : [];
  if (!courses.length) return fallbackSession;
  const dateKey = localDateKey(state.now);
  const currentTime = `${String(state.now.getHours()).padStart(2, '0')}:${String(state.now.getMinutes()).padStart(2, '0')}`;
  const scheduled = courses.map((course) => ({
    course,
    occurrence: findNextCourseOccurrence(scheduleSlotsProvider, courseDataKey(course), dateKey, currentTime, 35, true)
  })).filter((item) => item.occurrence).sort((left, right) => (
    left.occurrence.dateKey.localeCompare(right.occurrence.dateKey)
    || left.occurrence.start.localeCompare(right.occurrence.start)
    || left.course.classLabel.localeCompare(right.course.classLabel, 'zh-Hant')
  ));
  const course = scheduled[0]?.course || courses[0];
  return createSessionSnapshot(state.now, {
    id: 'common-hub',
    period: 0,
    start: currentTime,
    end: currentTime,
    course
  });
}

function renderBottomNavigation(active = bottomNavigationActiveTab(state.page)) {
  const items = [
    { id: 'today', label: '今日', symbol: '今', action: 'open-today-tab' },
    { id: 'assignment', label: '作業', symbol: '作', action: 'open-assignment-hub' },
    { id: 'exam', label: '考試', symbol: '考', action: 'open-exam-hub' },
    { id: 'settings', label: '設定', symbol: '設', action: 'open-settings-tab' }
  ];
  return `<nav class="bottom-navigation" aria-label="主要導覽">
    <div class="bottom-navigation-inner">
      ${items.map((item) => `<button type="button" class="bottom-navigation-button ${item.id === active ? 'active' : ''}" data-action="${item.action}"${item.id === active ? ' aria-current="page"' : ''}><span aria-hidden="true">${item.symbol}</span><strong>${item.label}</strong></button>`).join('')}
    </div>
  </nav>`;
}

function assignmentHubContext() {
  return commonRecordHubContext('assignment');
}

function commonAssignmentClassStatus(item) {
  if (item.targetStatus === 'cancelled') return item.pendingSubmissionCount ? `已取消・待補交 ${item.pendingSubmissionCount} 人` : '已取消安排';
  if (item.pendingSubmissionCount) return `待補交 ${item.pendingSubmissionCount} 人`;
  if (item.checkStatus === 'checked') return item.incompleteCount ? `已檢查・原有 ${item.incompleteCount} 人缺交` : '已檢查・全員完成';
  if (item.due?.dateKey < localDateKey(state.now)) return '逾期待檢查';
  if (item.due?.dateKey === localDateKey(state.now)) return '今日檢查';
  return '尚未檢查';
}

function renderAssignmentGroupCards(groups) {
  if (!groups.length) return '<p class="common-empty">目前沒有可用的年級與科目。請先到設定新增授課班級。</p>';
  return groups.map((group) => `<button type="button" class="exam-hub-card exam-group-card homework-hub-card" data-action="open-assignment-group" data-group-key="${escapeHtml(group.groupKey)}">
    <span class="exam-hub-symbol" aria-hidden="true">${escapeHtml(group.gradeLabel.slice(0, 1))}</span>
    <span class="exam-hub-card-copy"><strong>${escapeHtml(group.label)}</strong><small>${group.assignmentCount} 份作業・${group.classCount} 個班級</small></span>
    <span class="exam-hub-card-meta">${group.pendingSubmissionCount ? `<em>待補交 ${group.pendingSubmissionCount}</em>` : '<em class="quiet">查看</em>'}<i aria-hidden="true">›</i></span>
  </button>`).join('');
}

function renderCommonAssignmentList(group) {
  const renderCards = (assignments) => assignments.map((assignment) => {
    const status = assignment.pendingSubmissionCount
      ? `待補交 ${assignment.pendingSubmissionCount} 人`
      : assignment.progressStatus === 'unprocessed'
        ? '尚未檢查'
        : assignment.processedClassCount === assignment.classCount
        ? '各班均已檢查'
        : `${assignment.processedClassCount}/${assignment.classCount} 班已檢查`;
    return `<button type="button" class="exam-hub-card exam-definition-card homework-hub-card" data-action="open-common-assignment" data-assignment-id="${escapeHtml(assignment.assignmentId)}">
      <span class="exam-hub-card-copy"><strong>${escapeHtml(assignment.title)}</strong><small>${examDateRange(assignment)}・共 ${assignment.classCount} 班${assignment.isDemo ? '・示範資料' : ''}</small></span>
      <span class="exam-hub-card-meta"><em class="${assignment.pendingSubmissionCount ? '' : 'quiet'}">${status}</em><i aria-hidden="true">›</i></span>
    </button>`;
  }).join('');
  const unprocessed = group.assignments.filter((assignment) => assignment.progressStatus === 'unprocessed');
  const processed = group.assignments.filter((assignment) => assignment.progressStatus === 'processed');
  const section = (title, assignments, emptyMessage) => `<section class="common-record-section" aria-labelledby="assignment-section-${title === '未檢查' ? 'pending' : 'checked'}">
    <div class="common-record-section-heading"><h2 id="assignment-section-${title === '未檢查' ? 'pending' : 'checked'}">${title}</h2><span>${assignments.length}</span></div>
    ${assignments.length ? `<div class="exam-hub-list">${renderCards(assignments)}</div>` : `<p class="common-section-empty">${emptyMessage}</p>`}
  </section>`;
  const list = group.assignments.length
    ? `<div class="common-record-sections" aria-label="${escapeHtml(group.label)}作業">${section('未檢查', unprocessed, '目前沒有尚未檢查的作業。')}${section('已檢查', processed, '目前還沒有已檢查的作業。')}</div>`
    : '<p class="common-empty">這個年級與科目目前還沒有作業。</p>';
  return `${list}
    <button type="button" class="common-add-button homework-add-button" data-action="add-common-assignment">＋ 新增作業</button>`;
}

function commonAssignmentPendingStudents(assignment) {
  return assignment.classes.flatMap((item) => {
    const detail = assignmentClassDetail(homeworkRecords.assignments, assignment.assignmentId, item.courseKey);
    return (detail?.submissions.pending || []).map((submission) => ({ ...submission, classLabel: item.classLabel }));
  });
}

function renderCommonAssignmentClasses(assignment) {
  const pending = commonAssignmentPendingStudents(assignment);
  const pendingSection = pending.length ? `<section class="cross-class-makeup homework-cross-class" aria-labelledby="cross-class-homework-title">
    <div><p class="eyebrow">跨班整理</p><h2 id="cross-class-homework-title">待補交 ${pending.length} 人</h2></div>
    <div class="cross-class-chips">${pending.map((student) => `<span>${escapeHtml(student.classLabel)}・${student.seat}號</span>`).join('')}</div>
  </section>` : '';
  const rows = assignment.classes.map((item) => `<button type="button" class="exam-class-row homework-class-row" data-action="open-common-assignment-class" data-course-key="${escapeHtml(item.courseKey)}">
    <span class="exam-class-date"><strong>${item.due ? formatDate(item.due.dateKey) : '未定'}</strong><small>${item.due ? `第 ${item.due.period} 節` : '尚未排程'}</small></span>
    <span class="exam-class-copy"><strong>${escapeHtml(item.classLabel)}</strong><small>${escapeHtml(commonAssignmentClassStatus(item))}</small></span>
    <span aria-hidden="true">›</span>
  </button>`).join('');
  return `${pendingSection}<section class="exam-class-list homework-class-list" aria-label="班級與作業檢查時間">${rows}</section>
    <section class="common-definition-control" aria-label="共用作業設定"><div><strong>共用作業設定</strong><small>作業名稱與套用班級會一起調整</small></div><button type="button" data-action="edit-common-assignment">修改作業設定</button></section>`;
}

function assignmentTargetSession(detail, preferLastCheck = false) {
  const sourceDate = preferLastCheck && detail?.lastCheck?.dateKey ? detail.lastCheck.dateKey : detail?.due?.dateKey;
  const source = resolveAssignmentCheckSession(detail, periodTuplesForDate(sourceDate), preferLastCheck);
  return source ? createSessionSnapshot(dateFromKey(source.dateKey), source.slot) : null;
}

function assignmentClassTimeTarget(editor = state.modal) {
  return homeworkRecords.assignments?.[editor?.assignmentId]?.targets?.[editor?.courseKey] || null;
}

function resolveAssignmentClassTimeDraft(editor = state.modal) {
  const target = assignmentClassTimeTarget(editor);
  if (!target?.course || !editor?.selectedMode) return { due: null, error: '' };
  const nowTime = `${String(state.now.getHours()).padStart(2, '0')}:${String(state.now.getMinutes()).padStart(2, '0')}`;
  const resolution = resolveAssignmentTargets({
    weeklySchedules: scheduleSlotsProvider,
    session: { dateKey: localDateKey(state.now), end: nowTime, course: target.course },
    courses: [target.course],
    mode: editor.selectedMode,
    selectedDate: editor.selectedMode === 'date' ? editor.dateKey : ''
  });
  return { due: resolution.targets?.[editor.courseKey]?.due || null, error: resolution.errors?.[0]?.reason || '' };
}

function applyAssignmentClassTimeDraft() {
  const resolution = resolveAssignmentClassTimeDraft();
  state.modal.draftDue = resolution.due;
  state.modal.error = resolution.error;
}

function renderAssignmentClassTimeModal() {
  const editor = state.modal;
  const assignment = homeworkRecords.assignments?.[editor.assignmentId];
  const target = assignmentClassTimeTarget(editor);
  if (!assignment || !target?.due || target.status === 'cancelled') return '';
  const classLabel = target.course?.classLabel || editor.courseKey;
  const unchanged = editor.draftDue ? sameExamDue(target.due, editor.draftDue) : false;
  const canSave = Boolean(editor.draftDue && !editor.error && !unchanged);
  const preview = editor.error || !editor.selectedMode ? '尚未設定' : unchanged ? '與目前相同' : fullExamDueText(editor.draftDue);
  const modeButton = (value, label) => `<button type="button" data-action="select-assignment-class-time-mode" data-mode="${value}" aria-pressed="${editor.selectedMode === value}" class="${editor.selectedMode === value ? 'selected' : ''}">${label}</button>`;
  return `<div class="modal-backdrop" data-action="close-modal">
    <section class="modal-card exam-time-editor exam-class-time-editor assignment-class-time-editor" role="dialog" aria-modal="true" aria-labelledby="assignment-class-time-title" data-modal-card>
      <div class="modal-heading"><div><p class="eyebrow">${escapeHtml(classLabel)}・${escapeHtml(target.course?.subject || '')}</p><h2 id="assignment-class-time-title">修改本班時間</h2></div><button type="button" class="icon-button" data-action="close-modal" aria-label="關閉">×</button></div>
      <p class="exam-class-time-name">${escapeHtml(assignment.title)}</p>
      <div class="exam-class-current-time"><span>目前</span><strong>${escapeHtml(fullExamDueText(target.due))}</strong><small>其他班級的時間不會改變</small></div>
      <div class="exam-single-time-actions exam-class-time-actions" role="group" aria-label="新的檢查時間">${modeButton('next', '下次上課')}${modeButton('next-week', '下週同堂')}${modeButton('date', '選擇日期')}</div>
      ${editor.selectedMode === 'date' ? `<div class="exam-time-fields"><label>日期<input type="date" data-action="assignment-class-time-date" min="${escapeHtml(editor.minDate)}" value="${escapeHtml(editor.dateKey)}" /></label></div>` : ''}
      <div class="exam-class-time-preview" aria-live="polite"><span>新時間</span><strong>${escapeHtml(preview)}</strong></div>
      ${editor.error ? `<p class="exam-time-editor-error" role="alert">${escapeHtml(editor.error)}</p>` : ''}
      <div class="modal-actions exam-time-editor-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button type="button" class="primary-button" data-action="save-assignment-class-time" ${canSave ? '' : 'disabled'}>儲存</button></div>
    </section>
  </div>`;
}

function renderSubmissionDetailList(items, type) {
  if (!items.length) return `<p class="common-compact-empty">${type === 'pending' ? '目前沒有待補交學生。' : '尚無完成補交紀錄。'}</p>`;
  return `<ul class="common-makeup-list common-submission-list">${items.map((item) => {
    const confirming = type === 'pending'
      && state.submissionCompleteTarget?.assignmentId === item.assignmentId
      && state.submissionCompleteTarget?.courseKey === item.courseKey
      && state.submissionCompleteTarget?.submissionId === item.id;
    return `<li><span class="common-seat-chip">${item.seat}號</span><div><strong>${type === 'pending' ? '待補交' : '已完成補交'}</strong><small>${type === 'pending' ? `缺交 ${item.missingDateKey ? formatDate(item.missingDateKey) : '日期未記錄'}` : escapeHtml(item.completedAt || '已完成')}</small></div>${type === 'pending' ? `<button type="button" data-action="request-complete-common-submission" data-assignment-id="${escapeHtml(item.assignmentId)}" data-course-key="${escapeHtml(item.courseKey)}" data-submission-id="${escapeHtml(item.id)}" data-seat="${item.seat}">完成補交</button>` : ''}${confirming ? `<div class="common-makeup-confirm" role="alertdialog" aria-labelledby="submission-confirm-${item.seat}"><p id="submission-confirm-${item.seat}">確認 ${item.seat} 號已完成補交？</p><div><button type="button" data-action="dismiss-complete-common-submission">先不要</button><button type="button" data-action="confirm-complete-common-submission">確認完成</button></div></div>` : ''}</li>`;
  }).join('')}</ul>`;
}

function renderCommonAssignmentDetail(group, assignment, detail) {
  const classLabel = detail.course?.classLabel || detail.courseKey;
  const dueText = detail.due ? `${formatDate(detail.due.dateKey)}・第 ${detail.due.period} 節・${detail.due.start}～${detail.due.end}` : '尚未設定時間';
  const checkText = detail.lastCheck
    ? detail.incompleteSeats.length || detail.leaveSeats.length
      ? `已檢查・${detail.incompleteSeats.length} 人缺交${detail.leaveSeats.length ? `・${detail.leaveSeats.length} 人請假` : ''}`
      : '已檢查・全員完成'
    : detail.targetStatus === 'cancelled' ? '已取消安排' : '尚未檢查';
  const cancelling = state.assignmentHubCancelTarget?.assignmentId === assignment.assignmentId && state.assignmentHubCancelTarget?.courseKey === detail.courseKey;
  return `<section class="common-detail-hero">
      <p class="eyebrow">班級作業資訊</p><h1>${escapeHtml(assignment.title)}</h1>
      <div class="common-detail-tags"><span>${escapeHtml(group.label)}</span><span>${escapeHtml(classLabel)}</span>${detail.isDemo ? '<span>示範資料</span>' : ''}</div>
    </section>
    <section class="common-detail-card"><div class="common-detail-card-head"><h2>作業安排</h2>${detail.targetStatus !== 'cancelled' ? '<button type="button" class="common-edit-time-button" data-action="open-assignment-class-time">修改本班時間</button>' : ''}</div><dl>
      <div><dt>班級</dt><dd>${escapeHtml(classLabel)}</dd></div>
      <div><dt>檢查時間</dt><dd>${escapeHtml(dueText)}</dd></div>
      <div><dt>檢查狀態</dt><dd>${escapeHtml(checkText)}</dd></div>
      <div><dt>建立日期</dt><dd>${detail.createdAt ? formatDate(detail.createdAt) : '未記錄'}</dd></div>
    </dl>${detail.targetStatus !== 'cancelled' ? `<button type="button" class="primary-button common-detail-primary" data-action="start-common-assignment-check">${detail.lastCheck ? '重新檢查' : '開始檢查'}</button>` : ''}</section>
    <section class="common-detail-card"><h2>待補交 <span>${detail.submissions.pending.length}</span></h2>${renderSubmissionDetailList(detail.submissions.pending, 'pending')}</section>
    <section class="common-detail-card"><h2>已完成補交 <span>${detail.submissions.completed.length}</span></h2>${renderSubmissionDetailList(detail.submissions.completed, 'completed')}</section>
    <section class="common-detail-card common-history-card"><h2>檢查紀錄</h2>${detail.checks.length ? `<ul>${detail.checks.map((check) => `<li><span>${formatDate(check.dateKey)}・${escapeHtml(check.savedAt || '')}</span><strong>${check.summary?.complete ? '全員完成' : `${check.summary?.incomplete || 0} 人缺交${check.summary?.leave ? `・${check.summary.leave} 人請假` : ''}`}</strong></li>`).join('')}</ul>` : '<p class="common-compact-empty">尚無檢查紀錄。</p>'}</section>
    <div class="common-detail-actions">${detail.targetStatus !== 'cancelled' ? `<button type="button" class="common-danger-button" data-action="request-common-assignment-cancel">取消這個班的安排</button>` : '<span class="common-cancelled-note">這個班的安排已取消，既有紀錄仍保留。</span>'}</div>
    ${cancelling ? '<div class="common-cancel-confirm" role="alertdialog" aria-labelledby="common-assignment-cancel-title"><p id="common-assignment-cancel-title">取消這個班的作業安排？既有檢查與補交紀錄會保留。</p><div><button type="button" data-action="dismiss-common-assignment-cancel">保留安排</button><button type="button" data-action="confirm-common-assignment-cancel">確認取消</button></div></div>' : ''}`;
}

function renderAssignmentHub() {
  const { grades, selectedClass, group, assignment, detail } = assignmentHubContext();
  let title = '作業';
  let subtitle = '共通管理';
  let headline = '選擇班級';
  let eyebrow = '共通作業';
  let body = renderRecordClassDirectory(grades, 'assignment');
  if (selectedClass) {
    title = selectedClass.classLabel;
    subtitle = `${selectedClass.gradeLabel}・作業`;
    headline = `${selectedClass.classLabel}的作業`;
    eyebrow = `${selectedClass.recordCount} 份作業`;
    body = renderClassRecordList(selectedClass, 'assignment');
  } else if (group) {
    title = group.label;
    subtitle = '作業分類';
    headline = '選擇作業';
    eyebrow = `${group.assignmentCount} 份作業`;
    body = renderCommonAssignmentList(group);
  }
  if (assignment && (!selectedClass || state.assignmentHub.sharedOverview)) {
    title = assignment.title;
    subtitle = group.label;
    headline = '選擇班級與時間';
    eyebrow = `共 ${assignment.classCount} 個班級`;
    body = renderCommonAssignmentClasses(assignment);
  }
  if (detail) {
    title = detail.course?.classLabel || detail.courseKey;
    subtitle = `${assignment.title}・${group.label}`;
    body = renderCommonAssignmentDetail(group, assignment, detail);
    if (selectedClass && !state.assignmentHub.sharedOverview) body += '<button type="button" class="record-shared-link" data-action="open-record-shared-overview" data-kind="assignment">其他班級與共用設定 ›</button>';
  }
  const backLabel = detail
    ? selectedClass && !state.assignmentHub.sharedOverview ? '返回本班作業' : '返回班級與時間'
    : state.assignmentHub.sharedOverview ? '返回班級作業資訊'
    : selectedClass ? state.assignmentHubReturnPage === 'course' ? '返回本堂課' : '返回年級與班級'
    : assignment
      ? '返回作業清單'
      : group
        ? state.assignmentHubReturnPage === 'course' ? '返回本堂課' : '返回年級與科目'
        : state.assignmentHubReturnPage === 'course' ? '返回本堂課' : '返回今日課表';
  return `${pageHeader(title, subtitle, 'back-assignment-hub', null, '', backLabel)}
    <main id="main" class="content common-exam-content common-homework-content records-page-content" tabindex="-1">
      ${detail ? body : `<section class="common-page-hero"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(headline)}</h1>${!group && !selectedClass ? '<p>先選班級，再找到要補交的作業。</p>' : ''}</section>${body}`}
    </main>`;
}

function examHubContext() {
  return commonRecordHubContext('exam');
}

function examDateRange(exam) {
  if (!exam.firstDateKey) return '尚未設定時間';
  if (exam.firstDateKey === exam.lastDateKey) return formatDate(exam.firstDateKey);
  return `${formatDate(exam.firstDateKey)}～${formatDate(exam.lastDateKey)}`;
}

function commonExamClassStatus(item) {
  if (item.targetStatus === 'cancelled') return item.pendingMakeupCount ? `已取消・待補考 ${item.pendingMakeupCount} 人` : '已取消安排';
  if (item.pendingMakeupCount) return `待補考 ${item.pendingMakeupCount} 人`;
  if (item.attendanceStatus === 'checked') return item.absentCount ? `已點名・${item.absentCount} 人缺考` : '已點名・全員到考';
  if (item.due?.dateKey < localDateKey(state.now)) return '逾期待點名';
  if (item.due?.dateKey === localDateKey(state.now)) return '今日考試';
  return '尚未考試';
}

function renderExamGroupCards(groups) {
  if (!groups.length) return '<p class="common-empty">目前沒有可用的年級與科目。請先到設定新增授課班級。</p>';
  return groups.map((group) => `<button type="button" class="exam-hub-card exam-group-card" data-action="open-exam-group" data-group-key="${escapeHtml(group.groupKey)}">
    <span class="exam-hub-symbol" aria-hidden="true">${escapeHtml(group.gradeLabel.slice(0, 1))}</span>
    <span class="exam-hub-card-copy"><strong>${escapeHtml(group.label)}</strong><small>${group.examCount} 份考試・${group.classCount} 個班級</small></span>
    <span class="exam-hub-card-meta">${group.pendingMakeupCount ? `<em>待補考 ${group.pendingMakeupCount}</em>` : '<em class="quiet">查看</em>'}<i aria-hidden="true">›</i></span>
  </button>`).join('');
}

function renderCommonExamList(group) {
  const renderCards = (exams) => exams.map((exam) => {
    const status = exam.pendingMakeupCount
      ? `待補考 ${exam.pendingMakeupCount} 人`
      : exam.progressStatus === 'unprocessed'
        ? '尚未考試'
        : exam.processedClassCount === exam.classCount
          ? '各班均已考試'
          : `${exam.processedClassCount}/${exam.classCount} 班已考試`;
    return `<button type="button" class="exam-hub-card exam-definition-card" data-action="open-common-exam" data-exam-id="${escapeHtml(exam.examId)}">
      <span class="exam-hub-card-copy"><strong>${escapeHtml(exam.title)}</strong><small>${examDateRange(exam)}・共 ${exam.classCount} 班${exam.isDemo ? '・示範資料' : ''}</small></span>
      <span class="exam-hub-card-meta"><em class="${exam.pendingMakeupCount ? '' : 'quiet'}">${status}</em><i aria-hidden="true">›</i></span>
    </button>`;
  }).join('');
  const unprocessed = group.exams.filter((exam) => exam.progressStatus === 'unprocessed');
  const processed = group.exams.filter((exam) => exam.progressStatus === 'processed');
  const section = (title, exams, emptyMessage) => `<section class="common-record-section" aria-labelledby="exam-section-${title === '未考試' ? 'pending' : 'checked'}">
    <div class="common-record-section-heading"><h2 id="exam-section-${title === '未考試' ? 'pending' : 'checked'}">${title}</h2><span>${exams.length}</span></div>
    ${exams.length ? `<div class="exam-hub-list">${renderCards(exams)}</div>` : `<p class="common-section-empty">${emptyMessage}</p>`}
  </section>`;
  const list = group.exams.length
    ? `<div class="common-record-sections" aria-label="${escapeHtml(group.label)}考試">${section('未考試', unprocessed, '目前沒有尚未考試的項目。')}${section('已考試', processed, '目前還沒有已考試的項目。')}</div>`
    : '<p class="common-empty">這個年級與科目目前還沒有考試。</p>';
  return `${list}
    <button type="button" class="common-add-button" data-action="add-common-exam">＋ 新增考試</button>`;
}

function commonExamPendingStudents(exam) {
  return exam.classes.flatMap((item) => {
    const detail = examClassDetail(homeworkRecords.exams, exam.examId, item.courseKey);
    return (detail?.makeups.pending || []).map((makeup) => ({ ...makeup, classLabel: item.classLabel }));
  });
}

function renderCommonExamClasses(exam) {
  const pending = commonExamPendingStudents(exam);
  const pendingSection = pending.length ? `<section class="cross-class-makeup" aria-labelledby="cross-class-title">
    <div><p class="eyebrow">跨班整理</p><h2 id="cross-class-title">待補考 ${pending.length} 人</h2></div>
    <div class="cross-class-chips">${pending.map((student) => `<span>${escapeHtml(student.classLabel)}・${student.seat}號</span>`).join('')}</div>
  </section>` : '';
  const rows = exam.classes.map((item) => `<button type="button" class="exam-class-row" data-action="open-common-exam-class" data-course-key="${escapeHtml(item.courseKey)}">
    <span class="exam-class-date"><strong>${item.due ? formatDate(item.due.dateKey) : '未定'}</strong><small>${item.due ? `第 ${item.due.period} 節` : '尚未排程'}</small></span>
    <span class="exam-class-copy"><strong>${escapeHtml(item.classLabel)}</strong><small>${escapeHtml(commonExamClassStatus(item))}</small></span>
    <span aria-hidden="true">›</span>
  </button>`).join('');
  return `${pendingSection}<section class="exam-class-list" aria-label="班級與考試時間">${rows}</section>
    <section class="common-definition-control exam-definition-control" aria-label="共用考試設定"><div><strong>共用考試設定</strong><small>考試名稱與套用班級會一起調整</small></div><button type="button" data-action="edit-common-exam">修改考試設定</button></section>`;
}

function examTargetSession(detail, preferLastCheck = false) {
  const sourceDate = preferLastCheck && detail?.lastCheck?.dateKey ? detail.lastCheck.dateKey : detail?.due?.dateKey;
  const source = resolveExamAttendanceSession(detail, periodTuplesForDate(sourceDate), preferLastCheck);
  return source ? createSessionSnapshot(dateFromKey(source.dateKey), source.slot) : null;
}

function sameExamDue(left, right) {
  return ['dateKey', 'slotId', 'period', 'start', 'end'].every((field) => left?.[field] === right?.[field]);
}

function fullExamDueText(due) {
  return due ? `${formatDate(due.dateKey)}・第 ${due.period} 節　${due.start}～${due.end}` : '尚未設定';
}

function examClassTimeTarget(editor = state.modal) {
  return homeworkRecords.exams?.[editor?.examId]?.targets?.[editor?.courseKey] || null;
}

function resolveExamClassTimeDraft(editor = state.modal) {
  const target = examClassTimeTarget(editor);
  if (!target?.course || !editor?.selectedMode) return { due: null, error: '' };
  const nowTime = `${String(state.now.getHours()).padStart(2, '0')}:${String(state.now.getMinutes()).padStart(2, '0')}`;
  const resolution = resolveIndependentExamTimes({
    weeklySchedules: scheduleSlotsProvider,
    session: { dateKey: localDateKey(state.now), end: nowTime, course: target.course },
    courses: [target.course],
    mode: editor.selectedMode,
    dateKey: editor.dateKey,
    period: editor.selectedMode === 'common-time' ? periodDefinition(editor.periodId, editor.dateKey) : null,
    minDate: editor.minDate
  });
  return {
    due: resolution.targets?.[editor.courseKey]?.due || null,
    error: resolution.errors?.[0]?.reason || ''
  };
}

function applyExamClassTimeDraft() {
  const resolution = resolveExamClassTimeDraft();
  state.modal.draftDue = resolution.due;
  state.modal.error = resolution.error;
}

function renderExamClassTimeModal() {
  const editor = state.modal;
  const exam = homeworkRecords.exams?.[editor.examId];
  const target = examClassTimeTarget(editor);
  if (!exam || !target?.due || target.status === 'cancelled') return '';
  const classLabel = target.course?.classLabel || editor.courseKey;
  const subject = target.course?.subject || '';
  const hasRecords = Boolean((target.checks || []).length || target.lastCheck || Object.keys(target.makeups || {}).length);
  const unchanged = editor.draftDue ? sameExamDue(target.due, editor.draftDue) : false;
  const canSave = Boolean(editor.draftDue && !editor.error && !unchanged);
  const preview = editor.error || !editor.selectedMode
    ? '尚未設定'
    : unchanged
      ? '與目前相同'
      : fullExamDueText(editor.draftDue);
  const periodOptions = periodTuplesForDate(editor.dateKey).map(([id, period, start, end]) => `<option value="${id}" ${editor.periodId === id ? 'selected' : ''}>第 ${period} 節　${start}～${end}</option>`).join('');
  const modeButton = (value, label) => `<button type="button" data-action="select-exam-class-time-mode" data-mode="${value}" aria-pressed="${editor.selectedMode === value}" class="${editor.selectedMode === value ? 'selected' : ''}">${label}</button>`;
  return `<div class="modal-backdrop" data-action="close-modal">
    <section class="modal-card exam-time-editor exam-class-time-editor" role="dialog" aria-modal="true" aria-labelledby="exam-class-time-title" data-modal-card>
      <div class="modal-heading"><div><p class="eyebrow">${escapeHtml(classLabel)}・${escapeHtml(subject)}</p><h2 id="exam-class-time-title">修改本班時間</h2></div><button type="button" class="icon-button" data-action="close-modal" aria-label="關閉">×</button></div>
      <p class="exam-class-time-name">${escapeHtml(exam.title)}</p>
      <div class="exam-class-current-time"><span>目前</span><strong>${escapeHtml(fullExamDueText(target.due))}</strong><small>其他班級的時間不會改變</small></div>
      <div class="exam-single-time-actions exam-class-time-actions" role="group" aria-label="新的考試時間">${modeButton('next', '下次上課')}${modeButton('next-week', '下週同堂')}${modeButton('common-time', '指定時間')}</div>
      ${editor.selectedMode === 'common-time' ? `<div class="exam-time-fields"><label>日期<input type="date" data-action="exam-class-time-date" min="${escapeHtml(editor.minDate)}" value="${escapeHtml(editor.dateKey)}" /></label><label>節次<select data-action="exam-class-time-period">${periodOptions}</select></label></div>` : ''}
      <div class="exam-class-time-preview" aria-live="polite"><span>新時間</span><strong>${escapeHtml(preview)}</strong></div>
      ${editor.error ? `<p class="exam-time-editor-error" role="alert">${escapeHtml(editor.error)}</p>` : ''}
      ${hasRecords ? '<p class="exam-class-time-warning">這個班已有點名或補考紀錄。修改只會變更考試安排時間，既有缺考、補考與完成日期都會保留。</p>' : ''}
      <div class="modal-actions exam-time-editor-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button type="button" class="primary-button exam-primary-button" data-action="save-exam-class-time" ${canSave ? '' : 'disabled'}>儲存</button></div>
    </section>
  </div>`;
}

function renderMakeupDetailList(items, type) {
  if (!items.length) return `<p class="common-compact-empty">${type === 'pending' ? '目前沒有待補考學生。' : '尚無完成補考紀錄。'}</p>`;
  return `<ul class="common-makeup-list">${items.map((item) => {
    const confirming = type === 'pending'
      && state.makeupCompleteTarget?.examId === item.examId
      && state.makeupCompleteTarget?.courseKey === item.courseKey
      && state.makeupCompleteTarget?.seat === item.seat;
    return `<li><span class="common-seat-chip">${item.seat}號</span><div><strong>${type === 'pending' ? '待補考' : '已完成補考'}</strong><small>${type === 'pending' ? `缺考 ${item.absentDateKey ? formatDate(item.absentDateKey) : '日期未記錄'}` : escapeHtml(item.completedAt || '已完成')}</small></div>${type === 'pending' ? `<button type="button" data-action="request-complete-common-makeup" data-exam-id="${escapeHtml(item.examId)}" data-course-key="${escapeHtml(item.courseKey)}" data-seat="${item.seat}">完成補考</button>` : ''}${confirming ? `<div class="common-makeup-confirm" role="alertdialog" aria-labelledby="makeup-confirm-${item.seat}"><p id="makeup-confirm-${item.seat}">確認 ${item.seat} 號已完成補考？</p><div><button type="button" data-action="dismiss-complete-common-makeup">先不要</button><button type="button" data-action="confirm-complete-common-makeup">確認完成</button></div></div>` : ''}</li>`;
  }).join('')}</ul>`;
}

function renderCommonExamDetail(group, exam, detail) {
  const classLabel = detail.course?.classLabel || detail.courseKey;
  const dueText = detail.due ? `${formatDate(detail.due.dateKey)}・第 ${detail.due.period} 節・${detail.due.start}～${detail.due.end}` : '尚未設定時間';
  const attendanceText = detail.lastCheck
    ? detail.absentSeats.length ? `已點名・${detail.absentSeats.length} 人缺考` : '已點名・全員到考'
    : detail.targetStatus === 'cancelled' ? '已取消安排' : '尚未點名';
  const cancelling = state.examCancelTarget?.examId === exam.examId && state.examCancelTarget?.courseKey === detail.courseKey;
  return `<section class="common-detail-hero">
      <p class="eyebrow">班級考試資訊</p><h1>${escapeHtml(exam.title)}</h1>
      <div class="common-detail-tags"><span>${escapeHtml(group.label)}</span><span>${escapeHtml(classLabel)}</span>${detail.isDemo ? '<span>示範資料</span>' : ''}</div>
    </section>
    <section class="common-detail-card"><div class="common-detail-card-head"><h2>考試安排</h2>${detail.targetStatus !== 'cancelled' ? '<button type="button" class="common-edit-time-button" data-action="open-exam-class-time">修改本班時間</button>' : ''}</div><dl>
      <div><dt>班級</dt><dd>${escapeHtml(classLabel)}</dd></div>
      <div><dt>考試時間</dt><dd>${escapeHtml(dueText)}</dd></div>
      <div><dt>點名狀態</dt><dd>${escapeHtml(attendanceText)}</dd></div>
      <div><dt>建立日期</dt><dd>${detail.createdAt ? formatDate(detail.createdAt) : '未記錄'}</dd></div>
    </dl>${detail.targetStatus !== 'cancelled' ? `<button type="button" class="primary-button common-detail-primary" data-action="start-common-exam-check">${detail.lastCheck ? '重新點名' : '開始點名'}</button>` : ''}</section>
    <section class="common-detail-card"><h2>待補考 <span>${detail.makeups.pending.length}</span></h2>${renderMakeupDetailList(detail.makeups.pending, 'pending')}</section>
    <section class="common-detail-card"><h2>已完成補考 <span>${detail.makeups.completed.length}</span></h2>${renderMakeupDetailList(detail.makeups.completed, 'completed')}</section>
    <section class="common-detail-card common-history-card"><h2>點名紀錄</h2>${detail.checks.length ? `<ul>${detail.checks.map((check) => `<li><span>${formatDate(check.dateKey)}・${escapeHtml(check.savedAt || '')}</span><strong>${check.summary?.complete ? '全員到考' : `${check.summary?.absent || 0} 人缺考`}</strong></li>`).join('')}</ul>` : '<p class="common-compact-empty">尚無點名紀錄。</p>'}</section>
    <div class="common-detail-actions">${detail.targetStatus !== 'cancelled' ? `<button type="button" class="common-danger-button" data-action="request-common-exam-cancel">取消這個班的安排</button>` : '<span class="common-cancelled-note">這個班的安排已取消，既有紀錄仍保留。</span>'}</div>
    ${cancelling ? '<div class="common-cancel-confirm" role="alertdialog" aria-labelledby="common-cancel-title"><p id="common-cancel-title">取消這個班的考試安排？既有點名與補考紀錄會保留。</p><div><button type="button" data-action="dismiss-common-exam-cancel">保留安排</button><button type="button" data-action="confirm-common-exam-cancel">確認取消</button></div></div>' : ''}`;
}

function renderExamHub() {
  const { grades, selectedClass, group, exam, detail } = examHubContext();
  let title = '考試';
  let subtitle = '共通管理';
  let headline = '選擇班級';
  let eyebrow = '共通考試';
  let body = renderRecordClassDirectory(grades, 'exam');
  if (selectedClass) {
    title = selectedClass.classLabel;
    subtitle = `${selectedClass.gradeLabel}・考試`;
    headline = `${selectedClass.classLabel}的考試`;
    eyebrow = `${selectedClass.recordCount} 份考試`;
    body = renderClassRecordList(selectedClass, 'exam');
  } else if (group) {
    title = group.label;
    subtitle = '考試分類';
    headline = '選擇考試';
    eyebrow = `${group.examCount} 份考試`;
    body = renderCommonExamList(group);
  }
  if (exam && (!selectedClass || state.examHub.sharedOverview)) {
    title = exam.title;
    subtitle = group.label;
    headline = '選擇班級與時間';
    eyebrow = `共 ${exam.classCount} 個班級`;
    body = renderCommonExamClasses(exam);
  }
  if (detail) {
    title = detail.course?.classLabel || detail.courseKey;
    subtitle = `${exam.title}・${group.label}`;
    body = renderCommonExamDetail(group, exam, detail);
    if (selectedClass && !state.examHub.sharedOverview) body += '<button type="button" class="record-shared-link" data-action="open-record-shared-overview" data-kind="exam">其他班級與共用設定 ›</button>';
  }
  const backLabel = detail
    ? selectedClass && !state.examHub.sharedOverview ? '返回本班考試' : '返回班級與時間'
    : state.examHub.sharedOverview ? '返回班級考試資訊'
    : selectedClass ? state.examHubReturnPage === 'course' ? '返回本堂課' : '返回年級與班級'
    : exam
      ? '返回考試清單'
      : group
        ? state.examHubReturnPage === 'course' ? '返回本堂課' : '返回年級與科目'
        : state.examHubReturnPage === 'course' ? '返回本堂課' : '返回今日課表';
  return `${pageHeader(title, subtitle, 'back-exam-hub', null, '', backLabel)}
    <main id="main" class="content common-exam-content records-page-content" tabindex="-1">
      ${detail ? body : `<section class="common-page-hero"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(headline)}</h1>${!group && !selectedClass ? '<p>先選班級，再找到要補考的考試。</p>' : ''}</section>${body}`}
    </main>`;
}

function renderModal() {
  if (!state.modal) return '';
  if (state.modal.mode === 'common-record-create') return renderCommonRecordCreatePicker();
  if (state.modal.mode === 'install-help') {
    return `<div class="modal-backdrop" data-action="close-modal">
      <section class="modal-card confirm-card install-help-card" role="dialog" aria-modal="true" aria-labelledby="install-help-title" data-modal-card>
        <h2 id="install-help-title">安裝到主畫面</h2>
        <div class="install-help-list">
          <p><strong>iPhone／iPad Safari</strong><span>點瀏覽器的「分享」，再選「加入主畫面」並確認加入。</span></p>
          <p><strong>Android Chrome</strong><span>點右上角選單，再選「安裝應用程式」或「加到主畫面」。</span></p>
        </div>
        <p class="restore-confirm-copy">從主畫面開啟時會進入正式資料；測試資料仍只會從測試網址開啟。</p>
        <div class="modal-actions single-action"><button type="button" class="primary-button" data-action="close-modal">知道了</button></div>
      </section>
    </div>`;
  }
  if (state.modal.mode === 'import-backup-confirm' && state.pendingBackupImport) {
    const envelope = state.pendingBackupImport;
    const profileLabel = envelope.dataProfile === 'test' ? '測試資料' : '正式資料';
    return `<div class="modal-backdrop" data-action="cancel-import-backup">
      <section class="modal-card confirm-card data-sync-confirm-card" role="dialog" aria-modal="true" aria-labelledby="import-backup-title" data-modal-card>
        <h2 id="import-backup-title">匯入這份${profileLabel}備份？</h2>
        <p class="restore-confirm-copy">備份時間：${escapeHtml(formatDataSyncTimestamp(envelope.exportedAt))}</p>
        <p class="restore-confirm-copy">匯入會完整取代目前模式中的班級、課表與全部課堂紀錄。其他資料模式不受影響。</p>
        <div class="modal-actions"><button type="button" class="secondary-button" data-action="cancel-import-backup">取消</button><button type="button" class="primary-button" data-action="confirm-import-backup">確認匯入</button></div>
      </section>
    </div>`;
  }
  if (state.modal.mode === 'clear-profile-confirm') {
    const title = isIntegrationTestData ? '清除測試資料？' : '清除我的資料？';
    const copy = isIntegrationTestData
      ? '測試模式會變成空白，重新整理後也不會自動恢復；之後仍可按「恢復預設測試資料」重新建立。正式資料不受影響。'
      : '這台裝置中的學年、班級、課表、作業、考試、提醒與抽籤資料都會移除，而且無法復原。建議先匯出備份。';
    return `<div class="modal-backdrop" data-action="close-modal">
      <section class="modal-card confirm-card data-sync-confirm-card" role="dialog" aria-modal="true" aria-labelledby="clear-profile-title" data-modal-card>
        <h2 id="clear-profile-title">${title}</h2>
        <p class="restore-confirm-copy">${copy}</p>
        <div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button type="button" class="data-sync-confirm-danger" data-action="confirm-clear-profile">確認清除</button></div>
      </section>
    </div>`;
  }
  if (state.modal.mode === 'restore-test-data-confirm' && isIntegrationTestData) {
    return `<div class="modal-backdrop" data-action="close-modal">
      <section class="modal-card confirm-card data-sync-confirm-card" role="dialog" aria-modal="true" aria-labelledby="restore-test-data-title" data-modal-card>
        <h2 id="restore-test-data-title">恢復預設測試資料？</h2>
        <p class="restore-confirm-copy">目前測試資料會被整套假班級、課表、作業、考試、提醒與抽籤紀錄取代。正式資料不受影響。</p>
        <div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button type="button" class="primary-button" data-action="confirm-restore-test-data">確認恢復</button></div>
      </section>
    </div>`;
  }
  if (state.modal.mode === 'managed-schedule-discard') {
    return `<div class="modal-backdrop" data-action="close-modal">
      <section class="modal-card confirm-card" role="dialog" aria-modal="true" aria-labelledby="managed-schedule-discard-title" data-modal-card>
        <h2 id="managed-schedule-discard-title">放棄尚未儲存的課表？</h2>
        <p class="restore-confirm-copy">這次在整週課表中的安排不會保留。</p>
        <div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">繼續編輯</button><button type="button" class="primary-button" data-action="confirm-discard-managed-schedule">放棄並返回</button></div>
      </section>
    </div>`;
  }
  if (state.modal.mode === 'managed-schedule-cell' && state.scheduleEditor) {
    const weekday = MANAGED_SCHEDULE_WEEKDAYS.find((item) => item.id === state.modal.weekdayId);
    const period = state.scheduleEditor.version.times.find((item) => item.id === state.modal.periodId);
    const groups = groupTeachingClasses(teachingClassesThisYear());
    const options = groups.map((group) => `<optgroup label="${escapeHtml(`${group.systemLabel}・${group.gradeLabel}・${group.subject}`)}">${group.records.map((record) => {
      const value = record.id;
      const label = `${teachingClassDisplayLabel(record)}・${record.subject}`;
      return `<option value="${escapeHtml(value)}"${state.modal.teachingClassId === value ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('')}</optgroup>`).join('');
    return `<div class="modal-backdrop" data-action="close-modal">
      <section class="modal-card managed-schedule-cell-modal" role="dialog" aria-modal="true" aria-labelledby="managed-schedule-cell-title" data-modal-card>
        <div class="modal-heading"><div><h2 id="managed-schedule-cell-title">${escapeHtml(weekday?.fullLabel || '')}・第 ${period?.period || ''} 節</h2><p>${escapeHtml(period?.start || '')}～${escapeHtml(period?.end || '')}</p></div></div>
        <label class="managed-schedule-cell-select"><span>授課班級</span><select data-action="managed-schedule-cell-select"><option value=""${state.modal.teachingClassId ? '' : ' selected'}>空堂</option>${options}</select></label>
        <div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button type="button" class="primary-button" data-action="save-managed-schedule-cell">套用</button></div>
      </section>
    </div>`;
  }
  if (state.modal.mode === 'managed-schedule-times') {
    const errors = state.modal.validation?.errors || [];
    const rows = state.modal.times.map((period) => {
      const error = errors.find((item) => item.periodId === period.id);
      return `<div class="managed-schedule-time-row${error ? ' has-error' : ''}">
        <strong>第 ${period.period} 節</strong>
        <label><span>上課</span><input type="time" value="${escapeHtml(period.start)}" data-action="managed-schedule-time-input" data-period-id="${period.id}" data-field="start"${error ? ' aria-invalid="true"' : ''}></label>
        <label><span>下課</span><input type="time" value="${escapeHtml(period.end)}" data-action="managed-schedule-time-input" data-period-id="${period.id}" data-field="end"${error ? ' aria-invalid="true"' : ''}></label>
        ${error ? `<small>${escapeHtml(error.message)}</small>` : ''}
      </div>`;
    }).join('');
    return `<div class="modal-backdrop" data-action="close-modal">
      <section class="modal-card managed-schedule-times-modal" role="dialog" aria-modal="true" aria-labelledby="managed-schedule-times-title" data-modal-card>
        <div class="modal-heading"><div><h2 id="managed-schedule-times-title">節次時間</h2><p>${currentTeachingAcademicYear()}學年度所有課表版本共用</p></div></div>
        ${state.modal.storageError ? `<p class="managed-schedule-time-error" role="alert" tabindex="-1">${escapeHtml(state.modal.storageError)}</p>` : ''}
        <div class="managed-schedule-time-list">${rows}</div>
        <div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button type="button" class="primary-button" data-action="save-managed-schedule-times">儲存時間</button></div>
      </section>
    </div>`;
  }
  if (state.modal.mode === 'assignment-class-time') return renderAssignmentClassTimeModal();
  if (state.modal.mode === 'exam-class-time') return renderExamClassTimeModal();
  if (state.modal.mode === 'calendar') {
    const { year, month } = state.modal;
    const days = calendarMonthDays(year, month, state.now, state.selectedDateKey);
    return `<div class="modal-backdrop" data-action="close-modal">
      <section class="modal-card calendar-card" role="dialog" aria-modal="true" aria-labelledby="calendar-title" data-modal-card>
        <div class="calendar-heading">
          <button class="calendar-nav" data-action="previous-month" aria-label="上個月">‹</button>
          <h2 id="calendar-title">${escapeHtml(monthFormatter.format(new Date(year, month, 1, 12)))}</h2>
          <button class="calendar-nav" data-action="next-month" aria-label="下個月">›</button>
        </div>
        <div class="calendar-weekdays" aria-hidden="true">${['一', '二', '三', '四', '五', '六', '日'].map((day) => `<span>${day}</span>`).join('')}</div>
        <div class="calendar-grid">${days.map((day) => {
          const date = dateFromKey(day.dateKey);
          return `<button class="calendar-day${day.inMonth ? '' : ' outside'}${day.isToday ? ' today' : ''}${day.isSelected ? ' selected' : ''}" data-action="select-calendar-date" data-date="${day.dateKey}" aria-label="${escapeHtml(calendarDayFormatter.format(date))}${day.isToday ? '，今天' : ''}${day.isSelected ? '，目前選取' : ''}" aria-pressed="${day.isSelected}"${day.isToday ? ' aria-current="date"' : ''}>${day.day}</button>`;
        }).join('')}</div>
        <button class="text-button calendar-close" data-action="close-modal">取消</button>
      </section>
    </div>`;
  }
  const slot = selectedSlot();
  if (!slot) return '';
  const overrideKey = scheduleOverrideKey(state.modal.entryDate, slot.id);
  const hasOverride = hasScheduleOverride(scheduleOverrides, overrideKey);
  if (state.modal.mode === 'restore-confirm') {
    return `<div class="modal-backdrop" data-action="close-modal">
      <section class="modal-card confirm-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-card>
        <h2 id="modal-title">恢復第 ${slot.period} 節原課表？</h2>
        <p class="restore-confirm-copy">只會恢復這一節的原課表。已建立的作業與考試不會移動或刪除，若安排錯誤請另外取消。</p>
        <div class="modal-actions"><button class="secondary-button" data-action="keep-adjustment">保留調課</button><button class="primary-button" data-action="confirm-restore-schedule">確認恢復</button></div>
      </section>
    </div>`;
  }
  if (state.modal.mode === 'adjust') {
    const groups = groupTeachingClasses(teachingClassesThisYear());
    const options = groups.map((group) => `<optgroup label="${escapeHtml(`${group.systemLabel}・${group.gradeLabel}・${group.subject}`)}">${group.records.map((record) => {
      const label = `${teachingClassDisplayLabel(record)}・${record.subject}`;
      return `<option value="${escapeHtml(record.id)}"${state.modal.teachingClassId === record.id ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('')}</optgroup>`).join('');
    const hasClasses = groups.some((group) => group.records.length);
    return `<div class="modal-backdrop" data-action="close-modal">
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-card>
        <h2 id="modal-title">調整 ${escapeHtml(formatter.format(state.modal.entryDate))}・第 ${slot.period} 節</h2>
        ${hasClasses ? `<label class="managed-schedule-cell-select"><span>改為哪個授課班級</span><select data-action="adjust-teaching-class">${options}</select></label>` : '<p class="restore-confirm-copy">目前沒有授課班級，請先到「設定 → 授課班級」新增。</p>'}
        <div class="modal-actions"><button class="secondary-button" data-action="cancel-adjust">取消</button><button class="primary-button" data-action="save-adjustment" ${hasClasses ? '' : 'disabled'}>確認</button></div>
      </section>
    </div>`;
  }
  if (!slot.course) {
    return `<div class="modal-backdrop" data-action="close-modal">
      <section class="modal-card confirm-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-card>
        <h2 id="modal-title">第 ${slot.period} 節・空堂</h2>
        <p class="confirm-line">${slot.start}～${slot.end}</p>
        <div class="modal-actions"><button class="secondary-button" data-action="close-modal">取消</button><button class="primary-button" data-action="show-adjust">調課</button></div>
      </section>
    </div>`;
  }
  const isPastEntry = dateRelation(state.modal.entryDate, state.now) === 'past' || ['past', 'empty-past'].includes(state.modal.entryState);
  const enterLabel = isPastEntry ? '查看／更正' : '確認進入';
  return `<div class="modal-backdrop" data-action="close-modal">
    <section class="modal-card confirm-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-card>
      <h2 id="modal-title">${escapeHtml(slot.course.classLabel)}・${escapeHtml(slot.course.subject)}</h2>
      <p class="confirm-line">第 ${slot.period} 節　${slot.start}～${slot.end}${slot.adjusted ? '　已調課' : ''}</p>
      <div class="modal-actions"><button class="secondary-button" data-action="show-adjust">調課</button><button class="primary-button" data-action="enter-course">${enterLabel}</button></div>
      ${hasOverride ? '<button class="secondary-button restore-schedule-button" type="button" data-action="request-restore-schedule">復原</button>' : ''}
    </section>
  </div>`;
}

function formatDate(dateKey) {
  const [, month, day] = dateKey.split('-');
  return `${Number(month)}/${Number(day)}`;
}

function peerCourses(session = state.session) {
  if (!session) return [];
  const current = session.course;
  const version = managedScheduleVersionForDate(session.dateKey);
  const scheduledClassIds = new Set(MANAGED_SCHEDULE_WEEKDAYS.flatMap((weekday) => (
    DEFAULT_MANAGED_SCHEDULE_TIMES.map((period) => version?.slots?.[weekday.id]?.[period.id]).filter(Boolean)
  )));
  const courses = teachingClassesThisYear()
    .filter((record) => scheduledClassIds.has(record.id))
    .map(courseFromTeachingClass)
    .filter((course) => course && course.system === current.system && course.grade === current.grade && course.subject === current.subject);
  const unique = new Map([[courseDataKey(current), current]]);
  for (const course of courses) unique.set(courseDataKey(course), course);
  return [...unique.values()];
}

function assignmentTargetCard(assignment, recorded = false) {
  const courseKey = sessionCourseKey();
  const target = assignment.targets[courseKey];
  const isOverdue = !recorded && (target.due.dateKey < state.session.dateKey || target.due.period < state.session.period);
  const status = recorded ? checkSummary(target) : isOverdue ? '逾期待檢查' : '本堂待檢查';
  return `<article class="assignment-item">
    <div class="assignment-item-head"><div><strong>${escapeHtml(assignment.title)}</strong><span>${escapeHtml(status)}</span></div><span class="assignment-status ${recorded ? 'checked' : 'due'}">${recorded ? '已記錄' : isOverdue ? '逾期' : '待檢查'}</span></div>
    <p class="assignment-due">${escapeHtml(target.course.classLabel)}｜${formatDate(target.due.dateKey)}｜第 ${target.due.period} 節</p>
    <div class="assignment-primary-actions ${recorded ? 'single' : ''}"><button class="primary-button" data-action="start-homework" data-assignment="${assignment.id}">${recorded ? '重新檢查' : '開始檢查'}</button>${recorded ? '' : `<button class="secondary-button" data-action="defer-assignment" data-assignment="${assignment.id}">延至下次上課</button>`}</div>
  </article>`;
}

function renderAssignmentPanel(assignments) {
  const courseKey = sessionCourseKey();
  const sections = recordSectionsForSession(assignments, courseKey, state.session);
  const pendingSubmissions = pendingHomeworkSubmissionsForCourse(homeworkRecords.assignments, courseKey);
  return `<div class="assignment-panel">
    <section class="assignment-group"><h3>本堂待處理 <span>${sections.pending.length}</span></h3>${sections.pending.length ? sections.pending.map((assignment) => assignmentTargetCard(assignment)).join('') : '<p class="compact-empty">這堂沒有待檢查作業。</p>'}</section>
    <section class="assignment-group"><h3>本堂已記錄 <span>${sections.recorded.length}</span></h3>${sections.recorded.length ? sections.recorded.map((assignment) => assignmentTargetCard(assignment, true)).join('') : '<p class="compact-empty">這堂尚未留下作業檢查紀錄。</p>'}</section>
    <section class="assignment-group course-followup-group"><h3>後續處理</h3>
      <button type="button" class="course-followup-row" data-action="open-course-assignment-hub" data-scope="pending" ${pendingSubmissions.length ? '' : 'disabled'}><span><strong>待補交</strong><small>${pendingSubmissions.length ? '到共同作業頁處理' : '目前沒有待補交'}</small></span><em>${pendingSubmissions.length} 筆</em><i aria-hidden="true">›</i></button>
      <button type="button" class="course-followup-row" data-action="open-course-assignment-hub" data-scope="scheduled" ${sections.scheduled.length ? '' : 'disabled'}><span><strong>未來已安排</strong><small>${sections.scheduled.length ? '查看班級與時間' : '目前沒有未來安排'}</small></span><em>${sections.scheduled.length} 項</em><i aria-hidden="true">›</i></button>
    </section>
    <button class="add-assignment-button" data-action="add-assignment">＋ 新增作業</button>
  </div>`;
}

function examTargetCard(exam, recorded = false) {
  const courseKey = sessionCourseKey();
  const target = exam.targets[courseKey];
  const isOverdue = !recorded && (target.due.dateKey < state.session.dateKey || target.due.period < state.session.period);
  const status = recorded ? examCheckSummary(target) : isOverdue ? '逾期待點名' : '本堂待點名';
  const meta = [exam.isDemo ? '示範資料' : '', status].filter(Boolean).join('・');
  return `<article class="assignment-item exam-item">
    <div class="assignment-item-head"><div><strong>${escapeHtml(exam.title)}</strong><span>${escapeHtml(meta)}</span></div><span class="assignment-status exam-status ${recorded ? 'checked' : 'due'}">${recorded ? '已記錄' : isOverdue ? '逾期' : '待點名'}</span></div>
    <p class="assignment-due">${escapeHtml(target.course.classLabel)}｜${formatDate(target.due.dateKey)}｜第 ${target.due.period} 節</p>
    <div class="assignment-primary-actions ${recorded ? 'single' : ''}"><button class="primary-button exam-primary-button" data-action="start-exam-check" data-exam="${escapeHtml(exam.id)}">${recorded ? '重新點名' : '開始點名'}</button>${recorded ? '' : `<button class="secondary-button" data-action="defer-exam" data-exam="${escapeHtml(exam.id)}">延至下次上課</button>`}</div>
  </article>`;
}

function renderExamPanel(exams) {
  const courseKey = sessionCourseKey();
  const sections = recordSectionsForSession(exams, courseKey, state.session);
  const pendingMakeups = pendingExamMakeupsForCourse(homeworkRecords.exams, courseKey);
  return `<div class="assignment-panel exam-panel">
    <section class="assignment-group"><h3>本堂待處理 <span>${sections.pending.length}</span></h3>${sections.pending.length ? sections.pending.map((exam) => examTargetCard(exam)).join('') : '<p class="compact-empty">這堂沒有要點名的考試。</p>'}</section>
    <section class="assignment-group"><h3>本堂已記錄 <span>${sections.recorded.length}</span></h3>${sections.recorded.length ? sections.recorded.map((exam) => examTargetCard(exam, true)).join('') : '<p class="compact-empty">這堂尚未留下考試點名紀錄。</p>'}</section>
    <section class="assignment-group course-followup-group"><h3>後續處理</h3>
      <button type="button" class="course-followup-row exam-followup-row" data-action="open-course-exam-hub" data-scope="pending" ${pendingMakeups.length ? '' : 'disabled'}><span><strong>待補考</strong><small>${pendingMakeups.length ? '到共同考試頁處理' : '目前沒有待補考'}</small></span><em>${pendingMakeups.length} 筆</em><i aria-hidden="true">›</i></button>
      <button type="button" class="course-followup-row exam-followup-row" data-action="open-course-exam-hub" data-scope="scheduled" ${sections.scheduled.length ? '' : 'disabled'}><span><strong>未來已安排</strong><small>${sections.scheduled.length ? '查看班級與時間' : '目前沒有未來安排'}</small></span><em>${sections.scheduled.length} 場</em><i aria-hidden="true">›</i></button>
    </section>
    <button class="add-assignment-button add-exam-button" data-action="add-exam">＋ 新增考試</button>
  </div>`;
}

function renderCourse() {
  const session = state.session;
  if (!session) { state.page = 'today'; return renderToday(); }
  const reminderCount = classroomRemindersForSession(homeworkRecords.reminders, session).length;
  const courseKey = sessionCourseKey();
  const assignments = assignmentsForSession();
  const assignmentSections = recordSectionsForSession(assignments, courseKey, session);
  const pendingSubmissionCount = pendingHomeworkSubmissionsForCourse(homeworkRecords.assignments, courseKey).length;
  const assignmentPrimaryLabel = assignmentSections.pending.length
    ? `${assignmentSections.pending.length} 項待處理`
    : assignmentSections.recorded.length
      ? `本堂 ${assignmentSections.recorded.length} 項已記錄`
      : assignmentSections.scheduled.length
        ? `${assignmentSections.scheduled.length} 項已安排`
        : '';
  const assignmentLabel = [assignmentPrimaryLabel, pendingSubmissionCount ? `待補交 ${pendingSubmissionCount} 筆` : ''].filter(Boolean).join('・') || '尚無作業';
  const exams = examsForSession();
  const examSections = recordSectionsForSession(exams, courseKey, session);
  const pendingMakeupCount = pendingExamMakeupsForCourse(homeworkRecords.exams, courseKey).length;
  const examPrimaryLabel = examSections.pending.length
    ? `${examSections.pending.length} 場待處理`
    : examSections.recorded.length
      ? `本堂 ${examSections.recorded.length} 場已記錄`
      : examSections.scheduled.length
        ? `${examSections.scheduled.length} 場已安排`
        : '';
  const examLabel = [examPrimaryLabel, pendingMakeupCount ? `待補考 ${pendingMakeupCount} 筆` : ''].filter(Boolean).join('・') || '尚無考試';
  const scheduleState = sessionScheduleState(session, state.now);
  const sessionDateRelation = dateRelation(session.dateKey, state.now);
  const courseStatus = scheduleState === 'current'
    ? '上課中'
    : scheduleState === 'past'
      ? '已下課'
      : sessionDateRelation === 'future'
        ? '未來課程'
        : '尚未開始';
  const assignmentOpen = state.accordion === 'assignment';
  const examOpen = state.accordion === 'exam';
  return `
    ${pageHeader(`${session.course.classLabel}・${session.course.subject}`, `${courseStatus}・第 ${session.period} 節　${session.start}～${session.end}${session.adjusted ? '・已調課' : ''}`, 'back-today')}
    <main id="main" class="content course-content" tabindex="-1">
      <section class="course-hero"><p class="eyebrow">本堂課</p><h1>${escapeHtml(session.course.classLabel)} <span>${escapeHtml(session.course.subject)}</span></h1><div class="course-meta"><span>${courseStatus}</span><span>第 ${session.period} 節　${session.start}～${session.end}</span>${session.adjusted ? '<span>已調課</span>' : ''}</div></section>
      <section class="course-section"><h2>檢查與記錄</h2>
        <div class="accordion assignment-accordion"><button class="accordion-trigger" data-action="toggle-accordion" data-panel="assignment" aria-expanded="${assignmentOpen}"><span class="type-icon assignment-icon" aria-hidden="true">作</span><span class="accordion-title"><small>作業</small><strong>檢查與安排</strong><em>${assignmentLabel}</em></span><span class="chevron">⌄</span></button>${assignmentOpen ? renderAssignmentPanel(assignments) : ''}</div>
        <div class="accordion exam-accordion"><button class="accordion-trigger" data-action="toggle-accordion" data-panel="exam" aria-expanded="${examOpen}"><span class="type-icon exam-icon" aria-hidden="true">考</span><span class="accordion-title"><small>考試</small><strong>點名與安排</strong><em>${examLabel}</em></span><span class="chevron">⌄</span></button>${examOpen ? renderExamPanel(exams) : ''}</div>
      </section>
      <section class="course-section"><h2>課堂工具</h2><div class="tool-grid"><button type="button" class="tool-card available" data-action="open-reminders"><span aria-hidden="true">!</span><div><strong>課堂提醒</strong><small>${reminderCount ? `本堂已登記 ${reminderCount} 次` : '快速登記座號'}</small></div></button><button type="button" class="tool-card available draw-tool-card" data-action="open-draw"><span aria-hidden="true">#</span><div><strong>抽籤</strong><small>本週抽過會降低權重</small></div></button></div></section>
    </main>`;
}

function formatAcademicDate(dateKey) {
  if (!dateKey) return '未設定';
  const [year, month, day] = dateKey.split('-').map(Number);
  return `${year}/${month}/${day}`;
}

function academicPeriodDateRange(period) {
  return period ? `${formatAcademicDate(period.startDate)}～${formatAcademicDate(period.endDate)}` : '';
}

function renderSettings() {
  const currentPeriod = hasSavedAcademicPeriodSettings
    ? academicPeriodForLocalDate(academicPeriodSettings, state.now)
    : null;
  const currentTitle = hasSavedAcademicPeriodSettings
    ? `${academicPeriodSettings.academicYear}學年度・${currentPeriod?.label || '非教學期間'}`
    : '尚未設定學年與期間';
  const currentBadge = isIntegrationTestData ? '測試資料' : hasSavedAcademicPeriodSettings ? '本機設定' : '我的資料';
  const currentNote = hasSavedAcademicPeriodSettings
    ? `依手機日期判斷${currentPeriod ? `為${currentPeriod.label}（${academicPeriodDateRange(currentPeriod)}）` : '目前不在任何啟用期間'}。授課班級與生效課表會同步套用到今日頁及各項課堂功能。`
    : '尚未在這台裝置儲存學年與期間。完成設定後，授課班級與生效課表會套用到今日頁及各項課堂功能。';
  const teachingClassCount = teachingClassesThisYear().length;
  const scheduleVersionCount = scheduleVersionsThisYear().length;
  const currentScheduleVersion = activeScheduleVersion();
  const installSection = installState === 'installed'
    ? { symbol: '裝', title: '安裝到主畫面', description: '目前已從主畫面以 App 模式開啟。', status: '已安裝', action: null }
    : installState === 'available'
      ? { symbol: '裝', title: '安裝到主畫面', description: '安裝後可從手機主畫面直接開啟，並保留離線使用所需的程式。', status: '可以安裝', action: 'install-app' }
      : { symbol: '裝', title: '安裝到主畫面', description: '查看 iPhone、iPad 或 Android 的加入主畫面方式。', status: '查看方式', action: 'install-app' };
  const sections = [
    { symbol: '學', title: '學年與期間', description: '設定學年，並管理暑輔、上學期、寒輔與下學期。', status: hasSavedAcademicPeriodSettings ? '本機設定' : '開始設定', action: 'open-academic-period-settings' },
    { symbol: '班', title: '授課班級', description: '管理學制、年級、班級、科目、最後座號與空號。', status: teachingClassCount ? '本機設定' : '尚未設定', action: 'open-teaching-classes' },
    { symbol: '課', title: '課表管理', description: '設定學年度共用節次時間，並管理有生效日期的整週課表版本。', status: currentScheduleVersion ? '目前生效' : scheduleVersionCount ? `${scheduleVersionCount} 個版本` : '尚未設定', action: 'open-schedule-management' },
    { symbol: '資', title: '資料與同步', description: '備份、匯入或清除目前資料；Google 試算表同步會在後續版本加入。', status: '本機模式', action: 'open-data-sync' },
    installSection
  ];
  return `${pageHeader('設定', '資料與課表')}
    <main id="main" class="content settings-content" tabindex="-1">
      <section class="settings-current" aria-labelledby="settings-current-title">
        <div class="settings-current-heading"><div><p class="eyebrow">目前使用</p><h1 id="settings-current-title">${escapeHtml(currentTitle)}</h1></div><span>${currentBadge}</span></div>
        <dl class="settings-current-details">
          <div><dt>資料儲存</dt><dd>本機</dd></div>
          <div><dt>雲端連線</dt><dd>未連接</dd></div>
        </dl>
        <p class="settings-demo-note">${escapeHtml(currentNote)}</p>
      </section>
      <section class="settings-section-heading" aria-labelledby="settings-sections-title"><div><p class="eyebrow">設定項目</p><h2 id="settings-sections-title">逐項準備教學資料</h2></div><p>學年、期間、授課班級與課表版本都可先保存在這台裝置。</p></section>
      <section class="settings-section-list" aria-label="設定項目">
        ${sections.map((section) => section.action
          ? `<button type="button" class="settings-section-card settings-section-link" data-action="${section.action}"><span aria-hidden="true">${section.symbol}</span><div><h2>${section.title}</h2><p>${section.description}</p></div><em>${section.status}<i aria-hidden="true">›</i></em></button>`
          : `<article class="settings-section-card"><span aria-hidden="true">${section.symbol}</span><div><h2>${section.title}</h2><p>${section.description}</p></div><em>${section.status}</em></article>`).join('')}
      </section>
    </main>`;
}

function formatDataSyncTimestamp(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return '尚未備份';
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(value));
}

function renderDataSync() {
  const profileTitle = isIntegrationTestData ? '測試資料' : '我的資料';
  const profileDescription = isIntegrationTestData
    ? dataSyncMetadata.testDataState === 'cleared'
      ? '目前為空白測試環境，可恢復預設測試資料。'
      : '與正式資料分開儲存，只用於功能測試。'
    : '目前資料只保存在這台裝置，尚未連接雲端。';
  const lastBackup = formatDataSyncTimestamp(dataSyncMetadata.lastExportedAt);
  const lastImport = dataSyncMetadata.lastImportedAt ? formatDataSyncTimestamp(dataSyncMetadata.lastImportedAt) : '尚未匯入';
  const notice = state.dataSyncNotice
    ? `<p class="data-sync-notice ${state.dataSyncNotice.type === 'error' ? 'error' : 'success'}" role="${state.dataSyncNotice.type === 'error' ? 'alert' : 'status'}" tabindex="-1">${escapeHtml(state.dataSyncNotice.message)}</p>`
    : '';
  const advanced = isIntegrationTestData
    ? `<section class="data-sync-card data-sync-test-card" aria-labelledby="data-sync-test-title">
        <div class="data-sync-card-heading"><div><p class="eyebrow">開發工具</p><h2 id="data-sync-test-title">測試資料管理</h2></div><span>只影響測試模式</span></div>
        <p>清除後可檢查空白狀態；恢復時會重新建立班級、課表、作業、考試、提醒與抽籤假資料。</p>
        <div class="data-sync-actions"><button type="button" class="secondary-button" data-action="request-restore-test-data">恢復預設測試資料</button><button type="button" class="data-sync-danger-button" data-action="request-clear-profile">清除測試資料</button></div>
        <a class="data-sync-formal-link" href="./">返回正式資料</a>
      </section>`
    : `<section class="data-sync-card data-sync-danger-card" aria-labelledby="data-sync-danger-title">
        <div class="data-sync-card-heading"><div><p class="eyebrow">進階操作</p><h2 id="data-sync-danger-title">清除我的資料</h2></div></div>
        <p>會移除這台裝置中的學年、班級、課表與全部課堂紀錄。建議先匯出備份。</p>
        <button type="button" class="data-sync-danger-button" data-action="request-clear-profile">清除我的資料</button>
      </section>`;
  return `${pageHeader('資料與同步', profileTitle, 'back-settings-from-data-sync')}
    <main id="main" class="content data-sync-content" tabindex="-1">
      <section class="data-sync-status" aria-labelledby="data-sync-status-title">
        <div><p class="eyebrow">目前使用</p><h1 id="data-sync-status-title">${profileTitle}</h1><p>${profileDescription}</p></div>
        <dl><div><dt>儲存位置</dt><dd>這台裝置</dd></div><div><dt>Google 試算表</dt><dd>尚未連接</dd></div></dl>
      </section>
      ${notice}
      <section class="data-sync-card" aria-labelledby="data-sync-backup-title">
        <div class="data-sync-card-heading"><div><p class="eyebrow">本機備份</p><h2 id="data-sync-backup-title">匯出與匯入</h2></div><span>完整取代</span></div>
        <p>備份包含目前模式的學年、班級、課表、作業、考試、課堂提醒與抽籤資料。</p>
        <div class="data-sync-backup-times"><span>最近匯出<strong>${escapeHtml(lastBackup)}</strong></span><span>最近匯入<strong>${escapeHtml(lastImport)}</strong></span></div>
        <div class="data-sync-actions"><button type="button" class="primary-button" data-action="export-backup">匯出備份</button><button type="button" class="secondary-button" data-action="choose-import-backup">匯入備份</button></div>
        <input class="visually-hidden" type="file" accept="application/json,.json" data-action="import-backup-file" aria-label="選擇教師助手備份檔">
        <p class="data-sync-help">匯入前會先檢查檔案，並要求再次確認；正式資料與測試資料不能互相匯入。</p>
      </section>
      <section class="data-sync-card data-sync-cloud-card" aria-labelledby="data-sync-cloud-title">
        <div class="data-sync-card-heading"><div><p class="eyebrow">雲端</p><h2 id="data-sync-cloud-title">Google 試算表</h2></div><span>尚未連接</span></div>
        <p>目前不會將任何資料傳送到網路。後續接上 Apps Script 後，只有正式模式能啟用同步。</p>
      </section>
      ${advanced}
    </main>`;
}

function integrationTestProfilePayload(data = createIntegrationTestData(new Date())) {
  return {
    scheduleOverrides: data.scheduleOverrides,
    academicPeriodSettings: data.academic,
    teachingClassSettings: data.teaching,
    scheduleManagementSettings: data.schedules,
    classroomRecords: data.homework
  };
}

function dataBackupFilename(date = new Date()) {
  const timestamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
  return `teacher-assistant-${activeDataProfile}-${timestamp}.json`;
}

function showDataSyncNotice(type, message) {
  state.dataSyncNotice = { type, message };
  render();
  window.requestAnimationFrame(() => app.querySelector('.data-sync-notice')?.focus({ preventScroll: true }));
}

function exportCurrentProfileBackup() {
  const result = readProfilePayload();
  if (!result.valid) {
    showDataSyncNotice('error', result.message);
    return;
  }
  let envelope;
  try {
    envelope = createDataBackupEnvelope({
      dataProfile: activeDataProfile,
      exportedAt: new Date().toISOString(),
      payload: result.payload
    });
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = dataBackupFilename(new Date(envelope.exportedAt));
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    showDataSyncNotice('error', '目前無法建立備份檔，原本資料沒有變更。');
    return;
  }
  const nextMetadata = { ...dataSyncMetadata, lastExportedAt: envelope.exportedAt };
  if (writeStorage(DATA_SYNC_STORAGE_KEY, nextMetadata)) dataSyncMetadata = nextMetadata;
  showDataSyncNotice('success', '備份檔已建立，請確認手機或電腦的下載項目。');
}

async function prepareBackupImport(file) {
  if (!file) return;
  if (Number(file.size || 0) > 10 * 1024 * 1024) {
    showDataSyncNotice('error', '備份檔超過 10 MB，為了安全沒有讀取。');
    return;
  }
  let candidate;
  try {
    candidate = JSON.parse(await file.text());
  } catch {
    showDataSyncNotice('error', '無法讀取這份檔案，請選擇教師助手建立的 JSON 備份。');
    return;
  }
  const validation = validateDataBackupEnvelope(candidate, activeDataProfile);
  if (!validation.valid) {
    showDataSyncNotice('error', validation.message);
    return;
  }
  state.dataSyncNotice = null;
  state.pendingBackupImport = validation.envelope;
  state.modal = { mode: 'import-backup-confirm' };
  render();
  window.requestAnimationFrame(() => app.querySelector('[data-action="confirm-import-backup"]')?.focus());
}

function confirmBackupImport() {
  const envelope = state.pendingBackupImport;
  if (!envelope) return;
  const importedAt = new Date().toISOString();
  const nextMetadata = {
    ...dataSyncMetadata,
    lastImportedAt: importedAt,
    ...(isIntegrationTestData ? { testDataState: 'imported' } : {})
  };
  const result = replaceProfilePayload(envelope.payload, nextMetadata);
  if (!result.ok) {
    state.pendingBackupImport = null;
    state.modal = null;
    showDataSyncNotice('error', result.rollbackOk
      ? '匯入時無法寫入這台裝置，已保留匯入前的資料。'
      : '匯入與復原都遇到儲存錯誤，資料可能不完整。請先保留這個頁面，並檢查瀏覽器可用空間。');
    return;
  }
  dataSyncMetadata = nextMetadata;
  window.location.reload();
}

function confirmClearProfile() {
  const nextMetadata = isIntegrationTestData
    ? { ...dataSyncMetadata, testDataState: 'cleared' }
    : undefined;
  const result = replaceProfilePayload(emptyProfilePayload(), nextMetadata);
  if (!result.ok) {
    state.modal = null;
    showDataSyncNotice('error', result.rollbackOk
      ? '無法清除這台裝置的資料，原本資料已保留。'
      : '清除與復原都遇到儲存錯誤，資料可能不完整。請先保留這個頁面，並檢查瀏覽器可用空間。');
    return;
  }
  if (nextMetadata) dataSyncMetadata = nextMetadata;
  window.location.reload();
}

function confirmRestoreTestData() {
  if (!isIntegrationTestData) return;
  const nextMetadata = { ...dataSyncMetadata, testDataState: 'default' };
  const result = replaceProfilePayload(integrationTestProfilePayload(), nextMetadata);
  if (!result.ok) {
    state.modal = null;
    showDataSyncNotice('error', result.rollbackOk
      ? '無法恢復預設測試資料，原本測試資料已保留。'
      : '恢復與回復原資料都遇到儲存錯誤，測試資料可能不完整。請先保留這個頁面，並檢查瀏覽器可用空間。');
    return;
  }
  dataSyncMetadata = nextMetadata;
  window.location.reload();
}

function renderTeachingClasses() {
  const academicYear = currentTeachingAcademicYear();
  const records = teachingClassesThisYear();
  const groups = groupTeachingClasses(records);
  const groupCards = groups.map((group, groupIndex) => `<section class="teaching-class-group" aria-labelledby="teaching-group-${groupIndex}">
    <div class="teaching-class-group-heading"><div><p>${escapeHtml(group.systemLabel)}</p><h2 id="teaching-group-${groupIndex}">${escapeHtml(group.gradeLabel)}・${escapeHtml(group.subject)}</h2></div><span>${group.records.length} 班</span></div>
    <div class="teaching-class-card-list">${group.records.map((record) => {
      const vacantLabel = record.vacantSeats.length ? `空號 ${record.vacantSeats.join('、')}` : '沒有空號';
      return `<button type="button" class="teaching-class-card" data-action="edit-teaching-class" data-class-id="${escapeHtml(record.id)}">
        <span class="teaching-class-card-label">${escapeHtml(teachingClassDisplayLabel(record))}</span>
        <span class="teaching-class-card-copy"><strong>${escapeHtml(record.subject)}</strong><small>${record.lastSeat - record.vacantSeats.length} 位・座號 1～${record.lastSeat}・${escapeHtml(vacantLabel)}</small></span>
        <span class="teaching-class-card-action">修改<span aria-hidden="true">›</span></span>
      </button>`;
    }).join('')}</div>
  </section>`).join('');
  const content = records.length
    ? `<section class="teaching-class-groups" aria-label="已設定的授課班級">${groupCards}</section>`
    : `<section class="teaching-class-empty" aria-labelledby="teaching-class-empty-title"><span aria-hidden="true">班</span><h2 id="teaching-class-empty-title">尚未設定授課班級</h2><p>新增後會依「年級＋科目」整理在這裡，並可安排進課表。</p><button type="button" class="primary-button" data-action="new-teaching-class">新增第一個班級</button></section>`;
  return `${pageHeader('授課班級', `${academicYear}學年度`, 'back-settings-from-teaching-classes', null, '', '返回設定')}
    <main id="main" class="content teaching-classes-content" tabindex="-1">
      <section class="teaching-classes-intro" aria-labelledby="teaching-classes-title">
        <div><p class="eyebrow">本學年度</p><h1 id="teaching-classes-title">${academicYear}學年度授課班級</h1><p>${hasSavedAcademicPeriodSettings ? '依已儲存的學年設定顯示。' : '學年尚未正式設定，目前新增內容會寫入 115 示範學年度。'}</p></div>
        <span>${records.length ? `${records.length} 個授課項目` : '尚未設定'}</span>
      </section>
      <p class="teaching-classes-scope-note">這裡保存整個學年度的授課班級聯集，不需要再選暑輔或學期；各期間實際上哪些班由課表決定。最後座號與空號會同步套用到作業、考試、課堂提醒及抽籤。</p>
      ${records.length ? `<button type="button" class="secondary-button teaching-class-add" data-action="new-teaching-class"><span aria-hidden="true">＋</span> 新增授課班級</button>` : ''}
      ${content}
    </main>`;
}

function teachingClassFieldAttributes(field, fieldErrors, helpId = '') {
  const error = fieldErrors[field];
  const describedBy = [helpId, error ? `teaching-class-${field}-error` : ''].filter(Boolean).join(' ');
  return `${error ? ' aria-invalid="true"' : ''}${describedBy ? ` aria-describedby="${describedBy}"` : ''}`;
}

function teachingClassFieldError(field, fieldErrors) {
  return fieldErrors[field] ? `<small class="teaching-class-field-error" id="teaching-class-${field}-error">${escapeHtml(fieldErrors[field])}</small>` : '';
}

function teachingClassBatchFieldAttributes(field, fieldErrors, helpId = '', rowIndex = null) {
  const error = fieldErrors[field];
  const scope = Number.isInteger(rowIndex) ? `row-${rowIndex}` : 'shared';
  const errorId = `teaching-class-batch-${scope}-${field}-error`;
  const describedBy = [helpId, error ? errorId : ''].filter(Boolean).join(' ');
  return `${helpId ? ` data-teaching-class-help-id="${helpId}"` : ''}${error ? ' aria-invalid="true"' : ''}${describedBy ? ` aria-describedby="${describedBy}"` : ''}`;
}

function teachingClassBatchFieldError(field, fieldErrors, rowIndex = null) {
  if (!fieldErrors[field]) return '';
  const scope = Number.isInteger(rowIndex) ? `row-${rowIndex}` : 'shared';
  return `<small class="teaching-class-field-error" id="teaching-class-batch-${scope}-${field}-error">${escapeHtml(fieldErrors[field])}</small>`;
}

function renderTeachingClassBatchForm() {
  const academicYear = currentTeachingAcademicYear();
  const draft = state.teachingClassBatchDraft || newTeachingClassBatchDraft();
  const validation = state.teachingClassBatchValidation;
  const sharedFieldErrors = validation?.sharedFieldErrors || {};
  const rowFieldErrors = validation?.rowFieldErrors || [];
  const systemOptions = Object.entries(COURSE_CATALOG).map(([value, system]) => `<option value="${value}"${draft.system === value ? ' selected' : ''}>${escapeHtml(system.label)}</option>`).join('');
  const gradeOptions = Object.entries(COURSE_CATALOG[draft.system]?.grades || {}).map(([value, grade]) => `<option value="${value}"${draft.grade === value ? ' selected' : ''}>${escapeHtml(grade.label)}</option>`).join('');
  const subjectSuggestions = [...new Set(Object.values(COURSE_CATALOG[draft.system]?.grades?.[draft.grade]?.subjects || []))];
  const messages = validation?.errors.map((error) => error.message).filter((message, index, list) => list.indexOf(message) === index) || [];
  const rows = draft.rows.map((row, rowIndex) => {
    const fieldErrors = rowFieldErrors[rowIndex] || {};
    const rowHelpId = `teaching-class-batch-row-help-${rowIndex}`;
    return `<section class="teaching-class-batch-row" data-teaching-class-row="${rowIndex}" aria-labelledby="teaching-class-batch-row-title-${rowIndex}">
      <div class="teaching-class-batch-row-heading"><strong id="teaching-class-batch-row-title-${rowIndex}">班級 ${rowIndex + 1}</strong>${draft.rows.length > 1 ? `<button type="button" data-action="remove-teaching-class-row" data-teaching-class-row-index="${rowIndex}" aria-label="移除班級 ${rowIndex + 1}">移除</button>` : ''}</div>
      <div class="teaching-class-batch-fields">
        <label><span>班級</span><input type="text" maxlength="20" inputmode="text" value="${escapeHtml(row.className)}" placeholder="5、甲、A" autocomplete="off" data-action="teaching-class-field" data-teaching-class-field="className" data-teaching-class-row-index="${rowIndex}"${teachingClassBatchFieldAttributes('className', fieldErrors, rowHelpId, rowIndex)} />${teachingClassBatchFieldError('className', fieldErrors, rowIndex)}</label>
        <label><span>最後座號</span><input type="number" min="1" max="60" step="1" inputmode="numeric" value="${escapeHtml(row.lastSeat)}" placeholder="50" data-action="teaching-class-field" data-teaching-class-field="lastSeat" data-teaching-class-row-index="${rowIndex}"${teachingClassBatchFieldAttributes('lastSeat', fieldErrors, rowHelpId, rowIndex)} />${teachingClassBatchFieldError('lastSeat', fieldErrors, rowIndex)}</label>
        <label><span>空號（選填）</span><input type="text" inputmode="text" value="${escapeHtml(row.vacantSeatsInput)}" placeholder="4、36" autocomplete="off" data-action="teaching-class-field" data-teaching-class-field="vacantSeats" data-teaching-class-row-index="${rowIndex}"${teachingClassBatchFieldAttributes('vacantSeats', fieldErrors, rowHelpId, rowIndex)} />${teachingClassBatchFieldError('vacantSeats', fieldErrors, rowIndex)}</label>
      </div>
      <small class="teaching-class-field-help" id="${rowHelpId}">班級不用輸入「班」；最後座號最多 60；多個空號可用頓號或逗號分隔。</small>
    </section>`;
  }).join('');
  return `${pageHeader('新增授課班級', `${academicYear}學年度`, 'back-teaching-classes', null, '', '返回授課班級')}
    <main id="main" class="content teaching-class-form-content" tabindex="-1">
      <section class="teaching-class-form-intro"><p class="eyebrow">批次新增</p><h1>${academicYear}學年度</h1><p>先選擇這批班級共用的學制、年級與科目，再逐列填寫各班座號設定；最後會一次儲存全部班級。</p></section>
      ${messages.length ? `<section class="teaching-class-error-summary" id="teaching-class-errors" role="alert" tabindex="-1"><strong>請先修正以下內容</strong>${messages.map((message) => `<span>${escapeHtml(message)}</span>`).join('')}</section>` : ''}
      <form class="teaching-class-form" data-teaching-class-form novalidate>
        <div class="teaching-class-form-grid two-columns">
          <label><span>學制（共用）</span><select data-action="teaching-class-field" data-teaching-class-field="system"${teachingClassBatchFieldAttributes('system', sharedFieldErrors)}>${systemOptions}</select>${teachingClassBatchFieldError('system', sharedFieldErrors)}</label>
          <label><span>年級（共用）</span><select data-action="teaching-class-field" data-teaching-class-field="grade"${teachingClassBatchFieldAttributes('grade', sharedFieldErrors)}>${gradeOptions}</select>${teachingClassBatchFieldError('grade', sharedFieldErrors)}</label>
        </div>
        <label><span>科目（共用）</span><input type="text" maxlength="40" value="${escapeHtml(draft.subject)}" list="teaching-class-subjects" placeholder="例如 理化" autocomplete="off" data-action="teaching-class-field" data-teaching-class-field="subject"${teachingClassBatchFieldAttributes('subject', sharedFieldErrors, 'teaching-class-subject-help')} /><datalist id="teaching-class-subjects">${subjectSuggestions.map((subject) => `<option value="${escapeHtml(subject)}"></option>`).join('')}</datalist><small class="teaching-class-field-help" id="teaching-class-subject-help">可選提示，也可以直接輸入其他科目。</small>${teachingClassBatchFieldError('subject', sharedFieldErrors)}</label>
        ${rows}
        <button type="button" class="secondary-button" data-action="add-teaching-class-row"><span aria-hidden="true">＋</span> 新增班級</button>
        <aside class="teaching-class-roster-note"><strong>一次儲存全部班級</strong><p>每列會保存成獨立的授課班級；若任何一列有誤，這一批都不會寫入。</p></aside>
        <button type="button" class="primary-button large teaching-class-save" data-action="save-teaching-class-batch">儲存全部班級</button>
      </form>
    </main>`;
}

function renderTeachingClassForm() {
  if (state.teachingClassBatchDraft) return renderTeachingClassBatchForm();
  const academicYear = currentTeachingAcademicYear();
  const draft = state.teachingClassDraft || newTeachingClassDraft();
  const validation = state.teachingClassValidation;
  const fieldErrors = validation?.fieldErrors || {};
  const isEditing = Boolean(draft.id);
  const systemOptions = Object.entries(COURSE_CATALOG).map(([value, system]) => `<option value="${value}"${draft.system === value ? ' selected' : ''}>${escapeHtml(system.label)}</option>`).join('');
  const gradeOptions = Object.entries(COURSE_CATALOG[draft.system]?.grades || {}).map(([value, grade]) => `<option value="${value}"${draft.grade === value ? ' selected' : ''}>${escapeHtml(grade.label)}</option>`).join('');
  const subjectSuggestions = [...new Set(Object.values(COURSE_CATALOG[draft.system]?.grades?.[draft.grade]?.subjects || []))];
  const messages = validation?.errors.map((error) => error.message).filter((message, index, list) => list.indexOf(message) === index) || [];
  return `${pageHeader(isEditing ? '修改授課班級' : '新增授課班級', `${academicYear}學年度`, 'back-teaching-classes', null, '', '返回授課班級')}
    <main id="main" class="content teaching-class-form-content" tabindex="-1">
      <section class="teaching-class-form-intro"><p class="eyebrow">${isEditing ? '修改設定' : '新增設定'}</p><h1>${academicYear}學年度</h1><p>只記錄座號，不記錄學生姓名。儲存後會提供課表選用，座號設定也會套用到各項課堂紀錄。</p></section>
      ${messages.length ? `<section class="teaching-class-error-summary" id="teaching-class-errors" role="alert" tabindex="-1"><strong>請先修正以下內容</strong>${messages.map((message) => `<span>${escapeHtml(message)}</span>`).join('')}</section>` : ''}
      <form class="teaching-class-form" data-teaching-class-form novalidate>
        <div class="teaching-class-form-grid two-columns">
          <label><span>學制</span><select data-action="teaching-class-field" data-teaching-class-field="system"${teachingClassFieldAttributes('system', fieldErrors)}>${systemOptions}</select>${teachingClassFieldError('system', fieldErrors)}</label>
          <label><span>年級</span><select data-action="teaching-class-field" data-teaching-class-field="grade"${teachingClassFieldAttributes('grade', fieldErrors)}>${gradeOptions}</select>${teachingClassFieldError('grade', fieldErrors)}</label>
        </div>
        <div class="teaching-class-form-grid two-columns">
          <label><span>班級</span><input type="text" maxlength="20" inputmode="text" value="${escapeHtml(draft.className)}" placeholder="例如 5、甲、A 或資優" autocomplete="off" data-action="teaching-class-field" data-teaching-class-field="className"${teachingClassFieldAttributes('className', fieldErrors, 'teaching-class-name-help')} /><small class="teaching-class-field-help" id="teaching-class-name-help">數字班會顯示為 805 班；文字班會連同年級顯示。不用輸入結尾的「班」。</small>${teachingClassFieldError('className', fieldErrors)}</label>
          <label><span>科目</span><input type="text" maxlength="40" value="${escapeHtml(draft.subject)}" list="teaching-class-subjects" placeholder="例如 理化" autocomplete="off" data-action="teaching-class-field" data-teaching-class-field="subject"${teachingClassFieldAttributes('subject', fieldErrors, 'teaching-class-subject-help')} /><datalist id="teaching-class-subjects">${subjectSuggestions.map((subject) => `<option value="${escapeHtml(subject)}"></option>`).join('')}</datalist><small class="teaching-class-field-help" id="teaching-class-subject-help">可選提示，也可以直接輸入其他科目。</small>${teachingClassFieldError('subject', fieldErrors)}</label>
        </div>
        <label><span>最後座號</span><input type="number" min="1" max="60" step="1" inputmode="numeric" value="${escapeHtml(draft.lastSeat)}" data-action="teaching-class-field" data-teaching-class-field="lastSeat"${teachingClassFieldAttributes('lastSeat', fieldErrors, 'teaching-class-last-seat-help')} /><small class="teaching-class-field-help" id="teaching-class-last-seat-help">座號範圍為 1～最後座號，最多 60 號。</small>${teachingClassFieldError('lastSeat', fieldErrors)}</label>
        <label><span>空號（選填）</span><input type="text" inputmode="text" value="${escapeHtml(draft.vacantSeatsInput)}" placeholder="例如 4、36" autocomplete="off" data-action="teaching-class-field" data-teaching-class-field="vacantSeats"${teachingClassFieldAttributes('vacantSeats', fieldErrors, 'teaching-class-vacant-help')} /><small class="teaching-class-field-help" id="teaching-class-vacant-help">可用頓號、逗號、空白或分號分隔；系統會去重並依座號排序。</small>${teachingClassFieldError('vacantSeats', fieldErrors)}</label>
        <aside class="teaching-class-roster-note"><strong>同班名冊共用</strong><p>同一個班級若設定不同科目，最後座號與空號會一起更新；作業、提醒與抽籤資料仍會依班級＋科目分開。</p></aside>
        <button type="button" class="primary-button large teaching-class-save" data-action="save-teaching-class">${isEditing ? '儲存修改' : '儲存授課班級'}</button>
      </form>
    </main>`;
}

function renderSchedulePrerequisites() {
  const missingAcademic = !hasSavedAcademicPeriodSettings;
  const missingClasses = !teachingClassesThisYear().length;
  if (!missingAcademic && !missingClasses) return '';
  return `<section class="schedule-prerequisite" aria-labelledby="schedule-prerequisite-title">
    <span aria-hidden="true">準備</span>
    <h2 id="schedule-prerequisite-title">先完成基本設定</h2>
    <p>${missingAcademic ? '請先儲存學年與期間，課表版本才能判斷生效日期。' : ''}${missingAcademic && missingClasses ? '<br>' : ''}${missingClasses ? '請先新增授課班級，編輯課表時才有課程可以選擇。' : ''}</p>
    <div>${missingAcademic ? '<button type="button" class="secondary-button" data-action="open-academic-period-settings">設定學年與期間</button>' : ''}${missingClasses ? '<button type="button" class="secondary-button" data-action="open-teaching-classes">設定授課班級</button>' : ''}</div>
  </section>`;
}

function renderScheduleManagement() {
  const academicYear = currentTeachingAcademicYear();
  const activeVersion = activeScheduleVersion();
  const rangedVersions = scheduleVersionsWithRangesThisYear();
  const ready = hasSavedAcademicPeriodSettings && teachingClassesThisYear().length > 0;
  const sharedTimes = scheduleTimesThisYear();
  const firstTime = sharedTimes[0];
  const lastTime = sharedTimes.at(-1);
  const todayDescription = escapeHtml(calendarDayFormatter.format(state.now));
  const activeCopy = activeVersion
    ? `<h1 id="schedule-management-title">${escapeHtml(activeVersion.title)}</h1><p>${todayDescription}・${escapeHtml(activeVersion.periodLabel)}・${escapeHtml(formatAcademicDate(activeVersion.startDate))} 起</p>`
    : `<h1 id="schedule-management-title">目前沒有生效課表</h1><p>${todayDescription}・不在任何已建立版本的生效範圍內</p>`;
  const sections = ACADEMIC_PERIOD_DEFINITIONS.map((definition) => {
    const period = schedulePeriodSetting(definition.id);
    const versions = rangedVersions.filter((version) => version.periodId === definition.id);
    const expanded = state.scheduleExpandedPeriods.includes(definition.id);
    const isCurrent = activeVersion?.periodId === definition.id;
    const range = period?.enabled ? academicPeriodDateRange(period) : '目前不使用';
    const versionCards = versions.map((version) => {
      const isActive = activeVersion?.id === version.id;
      const filled = managedScheduleFilledCount(version);
      const endCopy = version.validRange ? `${formatAcademicDate(version.startDate)}～${formatAcademicDate(version.endDate)}` : `${formatAcademicDate(version.startDate)} 起・日期需調整`;
      return `<button type="button" class="managed-schedule-version-card${isActive ? ' is-active' : ''}${version.validRange ? '' : ' has-warning'}" data-action="edit-managed-schedule" data-version-id="${escapeHtml(version.id)}"${isActive ? ' aria-current="true"' : ''}>
        <span><strong>${escapeHtml(version.title)}</strong><small>${escapeHtml(endCopy)}・已排 ${filled}/40 格</small></span>
        <em>${isActive ? '生效中' : version.validRange ? '查看' : '需調整'}<i aria-hidden="true">›</i></em>
      </button>`;
    }).join('');
    const body = `<div class="managed-schedule-period-body" id="schedule-period-${definition.id}"${expanded ? '' : ' hidden'}>${versionCards || '<p class="managed-schedule-period-empty">這個期間還沒有課表版本。</p>'}${ready && period?.enabled ? `<button type="button" class="managed-schedule-add-period" data-action="new-managed-schedule" data-period-id="${definition.id}">＋ 新增${definition.label}課表版本</button>` : ''}</div>`;
    return `<section class="managed-schedule-period${expanded ? ' is-expanded' : ''}${isCurrent ? ' is-current' : ''}${period?.enabled ? '' : ' is-disabled'}">
      <button type="button" class="managed-schedule-period-toggle" data-action="toggle-managed-schedule-period" data-period-id="${definition.id}" aria-expanded="${expanded}" aria-controls="schedule-period-${definition.id}">
        <span><strong>${definition.label}</strong><small>${escapeHtml(range)}</small></span>
        <em>${versions.length ? `${versions.length} 個版本` : '尚無版本'}${isCurrent ? '<b>目前</b>' : ''}<i aria-hidden="true">⌄</i></em>
      </button>${body}
    </section>`;
  }).join('');
  return `${pageHeader('課表管理', `${academicYear}學年度`, 'back-settings-from-schedules', null, '', '返回設定')}
    <main id="main" class="content schedule-management-content" tabindex="-1">
      <section class="managed-schedule-current" aria-labelledby="schedule-management-title">
        <div><p class="eyebrow">依手機日期自動判斷</p>${activeCopy}</div>
        <span>${activeVersion ? '目前生效' : '尚未生效'}</span>
      </section>
      <p class="managed-schedule-scope-note">只會自動展開目前生效版本所在的期間；其他期間仍可手動打開。今日頁會依選取日期讀取當天生效的 1～8 節課表。</p>
      ${renderSchedulePrerequisites()}
      ${hasSavedAcademicPeriodSettings ? `<button type="button" class="schedule-time-settings management-time-settings" data-action="open-managed-schedule-times"><span><strong>節次時間</strong><small>${academicYear}學年度共用・第 1 節 ${escapeHtml(firstTime.start)}～${escapeHtml(firstTime.end)}・第 8 節 ${escapeHtml(lastTime.start)}～${escapeHtml(lastTime.end)}</small></span><em>調整 <i aria-hidden="true">›</i></em></button>` : ''}
      ${ready ? '<button type="button" class="secondary-button managed-schedule-add" data-action="new-managed-schedule"><span aria-hidden="true">＋</span> 新增課表版本</button>' : ''}
      <section class="managed-schedule-period-list" aria-label="課表期間與版本">${sections}</section>
    </main>`;
}

function renderScheduleVersionForm() {
  const draft = state.scheduleVersionForm || newScheduleVersionForm();
  const validation = state.scheduleVersionValidation;
  const fieldErrors = validation?.fieldErrors || {};
  const enabledPeriods = ACADEMIC_PERIOD_DEFINITIONS.filter((definition) => schedulePeriodSetting(definition.id)?.enabled);
  const period = schedulePeriodSetting(draft.periodId);
  const copySource = scheduleVersionsBefore(draft.periodId, draft.startDate)[0] || null;
  const automaticTitle = nextManagedScheduleVersionTitle(scheduleVersionsThisYear(), draft.periodId);
  const messages = validation?.errors?.map((error) => error.message).filter((message, index, list) => list.indexOf(message) === index) || [];
  const describedPeriod = fieldErrors.periodId ? ' aria-invalid="true" aria-describedby="schedule-version-period-error"' : '';
  const describedDate = fieldErrors.startDate ? ' aria-invalid="true" aria-describedby="schedule-version-date-error"' : '';
  return `${pageHeader('新增課表版本', `${currentTeachingAcademicYear()}學年度`, 'back-schedule-management', null, '', '返回課表管理')}
    <main id="main" class="content schedule-version-form-content" tabindex="-1">
      <section class="schedule-form-intro"><p class="eyebrow">版本資料</p><h1>${escapeHtml(automaticTitle)}</h1><p>先決定所屬期間與開始日期，再進入五天 × 8 節的整週課表。</p></section>
      ${messages.length ? `<section class="teaching-class-error-summary" id="schedule-version-errors" role="alert" tabindex="-1"><strong>請先修正以下內容</strong>${messages.map((message) => `<span>${escapeHtml(message)}</span>`).join('')}</section>` : ''}
      <section class="schedule-version-form-card">
        <label><span>所屬期間</span><select data-action="managed-schedule-form-period"${describedPeriod}>${enabledPeriods.map((definition) => `<option value="${definition.id}"${definition.id === draft.periodId ? ' selected' : ''}>${definition.label}</option>`).join('')}</select>${fieldErrors.periodId ? `<small class="teaching-class-field-error" id="schedule-version-period-error">${escapeHtml(fieldErrors.periodId)}</small>` : ''}</label>
        <label><span>開始生效日期</span><input type="date" value="${escapeHtml(draft.startDate)}" min="${escapeHtml(period?.startDate || '')}" max="${escapeHtml(period?.endDate || '')}" data-action="managed-schedule-form-date"${describedDate} /><small class="teaching-class-field-help">${period ? `${formatAcademicDate(period.startDate)}～${formatAcademicDate(period.endDate)} 之內` : '請先選擇期間'}</small>${fieldErrors.startDate ? `<small class="teaching-class-field-error" id="schedule-version-date-error">${escapeHtml(fieldErrors.startDate)}</small>` : ''}</label>
        <fieldset class="schedule-version-source"><legend>課表內容</legend>
          <button type="button" class="schedule-source-choice${draft.sourceMode === 'blank' ? ' selected' : ''}" data-action="select-managed-schedule-source" data-source-mode="blank" aria-pressed="${draft.sourceMode === 'blank'}"><strong>建立空白課表</strong><small>從 40 個空堂開始安排</small></button>
          <button type="button" class="schedule-source-choice${draft.sourceMode === 'copy' ? ' selected' : ''}" data-action="select-managed-schedule-source" data-source-mode="copy" aria-pressed="${draft.sourceMode === 'copy'}"${copySource ? '' : ' disabled'}><strong>複製上一版</strong><small>${copySource ? `複製「${escapeHtml(copySource.title)}」再調整` : '此日期前沒有同期間版本'}</small></button>
        </fieldset>
        <button type="button" class="primary-button large" data-action="continue-managed-schedule">進入整週課表</button>
      </section>
    </main>`;
}

function renderManagedScheduleGrid(version, editable = true) {
  const classMap = scheduleTeachingClassMap();
  const headers = MANAGED_SCHEDULE_WEEKDAYS.map((weekday) => `<div class="managed-schedule-grid-header" role="columnheader" aria-label="${weekday.fullLabel}">${weekday.label}</div>`).join('');
  const rows = version.times.map((period) => {
    const cells = MANAGED_SCHEDULE_WEEKDAYS.map((weekday) => {
      const classId = version.slots?.[weekday.id]?.[period.id] || null;
      const label = scheduleCellLabel(classId);
      const missing = Boolean(classId && !classMap.has(classId));
      const cellClass = `managed-schedule-cell${editable ? '' : ' weekly-schedule-cell'}${classId ? ' has-course' : ''}${missing ? ' is-missing' : ''}`;
      const content = `<strong>${escapeHtml(label.classLabel)}</strong>${label.subject ? `<small>${escapeHtml(label.subject)}</small>` : ''}`;
      return editable
        ? `<button type="button" class="${cellClass}" role="gridcell" data-action="open-managed-schedule-cell" data-weekday-id="${weekday.id}" data-period-id="${period.id}" aria-label="${weekday.fullLabel}第 ${period.period} 節，${escapeHtml(label.full)}">${content}</button>`
        : `<div class="${cellClass}" role="gridcell" aria-label="${weekday.fullLabel}第 ${period.period} 節，${escapeHtml(label.full)}">${content}</div>`;
    }).join('');
    return `<div class="managed-schedule-grid-row" role="row"><div class="managed-schedule-period-label" role="rowheader"><strong>${period.period}</strong><small>${escapeHtml(period.start)}</small></div>${cells}</div>`;
  }).join('');
  return `<div class="managed-schedule-grid" role="grid" aria-label="星期一至星期五，第 1 節至第 8 節整週課表">
    <div class="managed-schedule-grid-row" role="row"><div class="managed-schedule-grid-corner" aria-hidden="true">節</div>${headers}</div>${rows}
  </div>`;
}

function renderScheduleEditor() {
  const editor = state.scheduleEditor;
  if (!editor) return '';
  const version = editor.version;
  const definition = ACADEMIC_PERIOD_DEFINITIONS.find((period) => period.id === version.periodId);
  const validationMessages = state.scheduleEditorValidation?.errors?.map((error) => error.message)
    .filter((message, index, list) => list.indexOf(message) === index) || [];
  return `${pageHeader(editor.isNew ? '新增課表' : '修改課表', version.title, 'back-schedule-editor', null, '', '返回課表管理')}
    <main id="main" class="content schedule-editor-content" tabindex="-1">
      <section class="schedule-editor-heading">
        <div><p class="eyebrow">${escapeHtml(definition?.label || version.periodId)}・${escapeHtml(formatAcademicDate(version.startDate))} 起</p><h1>${escapeHtml(version.title)}</h1><p>點選任一格安排授課班級，或改回空堂。</p></div>
        <span>已排 ${managedScheduleFilledCount(version)}/40</span>
      </section>
      ${validationMessages.length ? `<section class="teaching-class-error-summary" id="schedule-editor-errors" role="alert" tabindex="-1"><strong>課表尚未儲存</strong>${validationMessages.map((message) => `<span>${escapeHtml(message)}</span>`).join('')}</section>` : ''}
      <section class="managed-schedule-grid-card" aria-labelledby="managed-schedule-grid-title">
        <div class="managed-schedule-grid-heading"><div><p class="eyebrow">整週課表</p><h2 id="managed-schedule-grid-title">星期一到星期五</h2></div><span>1～8 節</span></div>
        ${renderManagedScheduleGrid(version)}
        <p class="managed-schedule-grid-help">每一格都是可點選按鈕；班級或科目較長時會縮短顯示，點開仍可查看完整內容。</p>
      </section>
      <button type="button" class="primary-button large schedule-editor-save" data-action="save-managed-schedule">${editor.isNew ? '儲存課表版本' : '儲存修改'}</button>
    </main>`;
}

function renderAcademicPeriodSettings() {
  const draft = state.academicPeriodDraft || normalizeAcademicPeriodSettings(academicPeriodSettings);
  const validation = state.academicPeriodValidation;
  const fieldErrors = validation?.fieldErrors || {};
  const currentPeriod = academicPeriodForLocalDate(draft, state.now);
  const validationMessages = validation?.errors.map((error) => error.message)
    .filter((message, index, messages) => messages.indexOf(message) === index) || [];
  const periodCards = ACADEMIC_PERIOD_DEFINITIONS.map((definition) => {
    const period = draft.periods.find((item) => item.id === definition.id);
    const enabled = definition.optional ? period?.enabled === true : true;
    const startError = fieldErrors[`${definition.id}.startDate`] || '';
    const endError = fieldErrors[`${definition.id}.endDate`] || '';
    const hasError = Boolean(startError || endError);
    const control = definition.optional
      ? `<button type="button" class="draw-switch academic-period-switch" role="switch" aria-checked="${enabled}" aria-label="使用${definition.label}" data-action="toggle-academic-period" data-period-id="${definition.id}"><span></span></button>`
      : '<span class="academic-period-fixed">固定使用</span>';
    const fields = enabled
      ? `<div class="academic-period-date-fields">
          <label for="academic-${definition.id}-start"><span>開始日期</span><input id="academic-${definition.id}-start" type="date" value="${escapeHtml(period?.startDate || '')}" data-action="academic-period-date" data-period-id="${definition.id}" data-field="startDate"${startError ? ` aria-invalid="true" aria-describedby="academic-${definition.id}-start-error"` : ''} />${startError ? `<small class="academic-field-error" id="academic-${definition.id}-start-error">${escapeHtml(startError)}</small>` : ''}</label>
          <label for="academic-${definition.id}-end"><span>結束日期</span><input id="academic-${definition.id}-end" type="date" value="${escapeHtml(period?.endDate || '')}" data-action="academic-period-date" data-period-id="${definition.id}" data-field="endDate"${endError ? ` aria-invalid="true" aria-describedby="academic-${definition.id}-end-error"` : ''} />${endError ? `<small class="academic-field-error" id="academic-${definition.id}-end-error">${escapeHtml(endError)}</small>` : ''}</label>
        </div>`
      : `<p class="academic-period-disabled-note" data-academic-disabled-note="${definition.id}">目前不使用；日期草稿 ${period?.startDate && period?.endDate ? `${escapeHtml(formatAcademicDate(period.startDate))}～${escapeHtml(formatAcademicDate(period.endDate))}` : '尚未填寫'}，重新開啟時會保留。</p>`;
    return `<section class="academic-period-card${enabled ? '' : ' is-disabled'}${hasError ? ' has-error' : ''}" aria-labelledby="academic-${definition.id}-title">
      <div class="academic-period-card-heading"><div><h2 id="academic-${definition.id}-title">${definition.label}</h2><p>${definition.optional ? (enabled ? '目前使用' : '目前不使用') : '此期間固定使用'}</p></div>${control}</div>
      ${fields}
    </section>`;
  }).join('');
  return `${pageHeader('學年與期間', '設定日期範圍', 'back-settings', null, '', '返回設定')}
    <main id="main" class="content academic-period-content" tabindex="-1">
      <section class="academic-period-current" aria-labelledby="academic-period-current-title">
        <div><p class="eyebrow">依手機日期判斷</p><h1 id="academic-period-current-title" data-academic-current-label>${currentPeriod?.label || '非教學期間'}</h1><p data-academic-current-detail>${escapeHtml(calendarDayFormatter.format(state.now))}${currentPeriod ? `・${escapeHtml(academicPeriodDateRange(currentPeriod))}` : '・不在任何啟用期間內'}</p></div><span>草稿預覽</span>
      </section>
      <p class="academic-period-scope-note">這一版只儲存學年與期間設定；課表、作業及考試尚未依期間分區。</p>
      ${validationMessages.length ? `<section class="academic-period-error-summary" id="academic-period-errors" role="alert" tabindex="-1" aria-labelledby="academic-period-errors-title"><strong id="academic-period-errors-title">請先修正以下設定</strong>${validationMessages.map((message) => `<span>${escapeHtml(message)}</span>`).join('')}</section>` : ''}
      <section class="academic-year-card" aria-labelledby="academic-year-title">
        <div><h2 id="academic-year-title">學年度</h2><p>變更學年度時，所有期間日期會一起平移年份。</p></div>
        <label for="academic-year-input"><span>民國</span><input id="academic-year-input" type="number" min="1" max="999" inputmode="numeric" value="${escapeHtml(draft.academicYear)}" data-action="academic-year"${fieldErrors.academicYear ? ' aria-invalid="true" aria-describedby="academic-year-error"' : ''} /><span>學年度</span></label>
        ${fieldErrors.academicYear ? `<small class="academic-field-error" id="academic-year-error">${escapeHtml(fieldErrors.academicYear)}</small>` : ''}
      </section>
      <section class="academic-period-list" aria-label="教學期間">
        ${periodCards}
      </section>
      <button type="button" class="primary-button large academic-period-save" data-action="save-academic-period-settings">儲存學年設定</button>
    </main>`;
}

function assignmentFormCourses() {
  const session = state.assignmentForm?.session || state.session;
  const courses = new Map(peerCourses(session).map((course) => [courseDataKey(course), course]));
  for (const course of state.assignmentForm?.availableCourses || []) courses.set(courseDataKey(course), course);
  const assignment = state.assignmentForm?.assignmentId ? homeworkRecords.assignments[state.assignmentForm.assignmentId] : null;
  for (const target of Object.values(assignment?.targets || {})) courses.set(courseDataKey(target.course), target.course);
  return [...courses.values()];
}

function assignmentFormResolution() {
  const form = state.assignmentForm;
  if (!form) return { targets: {}, errors: [] };
  const courses = new Map(assignmentFormCourses().map((course) => [courseDataKey(course), course]));
  const targets = {};
  const errors = [];
  for (const courseKey of form.selectedCourseKeys) {
    const target = form.targetDrafts?.[courseKey];
    const targetError = form.targetErrors?.[courseKey];
    if (targetError) errors.push({ courseKey, classLabel: courses.get(courseKey)?.classLabel || courseKey, reason: targetError });
    else if (target?.due) targets[courseKey] = { course: target.course, due: target.due, scheduleMode: target.scheduleMode || 'exact' };
    else errors.push({ courseKey, classLabel: courses.get(courseKey)?.classLabel || courseKey, reason: '尚未設定檢查時間' });
  }
  return { targets, errors };
}

function assignmentFormValidation(form, resolution) {
  const validation = [];
  if (!form.title.trim()) validation.push('請輸入作業名稱。');
  if (!form.selectedCourseKeys.length) validation.push('請至少選擇一個班級。');
  for (const error of resolution.errors) validation.push(`${error.classLabel}：${error.reason}。`);
  return validation;
}

function assignmentSchedulingSession(form = state.assignmentForm) {
  const session = form?.session || state.session;
  if (!session) return null;
  const todayKey = localDateKey(state.now);
  if (session.dateKey > todayKey) return session;
  const currentTime = `${String(state.now.getHours()).padStart(2, '0')}:${String(state.now.getMinutes()).padStart(2, '0')}`;
  if (session.dateKey === todayKey && session.end >= currentTime) return session;
  return { ...session, dateKey: todayKey, end: currentTime };
}

function applyIndependentAssignmentTimes(mode, courseKeys, { selectedDate = '', batch = false, notice = true } = {}) {
  const form = state.assignmentForm;
  const session = assignmentSchedulingSession(form);
  if (!form || !session) return;
  const courseMap = new Map(assignmentFormCourses().map((course) => [courseDataKey(course), course]));
  const courses = courseKeys.map((courseKey) => courseMap.get(courseKey)).filter(Boolean);
  const resolution = resolveIndependentAssignmentTimes({
    weeklySchedules: scheduleSlotsProvider,
    session,
    courses,
    mode,
    selectedDate
  });
  const transition = applyAssignmentTimeResolution({
    targetDrafts: form.targetDrafts,
    targetErrors: form.targetErrors,
    individualizedCourseKeys: form.individualizedCourseKeys,
    courseKeys,
    resolution,
    batch
  });
  form.targetDrafts = transition.targetDrafts;
  form.targetErrors = transition.targetErrors;
  form.individualizedCourseKeys = transition.individualizedCourseKeys;
  if (transition.applied) form.scheduleDirty = true;
  if (batch && transition.applied) {
    form.recentlyEditedCourseKey = '';
  }
  if (notice) {
    const modeLabel = mode === 'next' ? '下次上課' : mode === 'next-week' ? '下週同一堂' : '選擇日期';
    const successCount = Object.keys(resolution.targets).length;
    form.timeNotice = batch && !transition.applied
      ? `${resolution.errors.length} 個班級無法使用這個時間，尚未套用任何班級。`
      : successCount
        ? `已將${modeLabel}套用至 ${successCount} 個班級。`
        : `無法套用${modeLabel}。`;
  }
  return { ...resolution, applied: transition.applied };
}

function assignmentHasSelectedIndividualizedTimes(form = state.assignmentForm) {
  if (!form) return false;
  const selected = new Set(form.selectedCourseKeys);
  return form.individualizedCourseKeys.some((courseKey) => selected.has(courseKey));
}

function applyAssignmentBatchMode(mode) {
  const form = state.assignmentForm;
  if (!form) return;
  form.scheduleMode = mode;
  applyIndependentAssignmentTimes(mode, form.selectedCourseKeys, { selectedDate: mode === 'date' ? form.selectedDate : '', batch: true });
}

function applySingleAssignmentTime(mode, courseKey, selectedDate = '') {
  const form = state.assignmentForm;
  const session = assignmentSchedulingSession(form);
  const course = assignmentFormCourses().find((item) => courseDataKey(item) === courseKey);
  if (!form || !session || !course) return null;
  const resolution = resolveIndependentAssignmentTimes({
    weeklySchedules: scheduleSlotsProvider,
    session,
    courses: [course],
    mode,
    selectedDate
  });
  if (resolution?.errors.length) return resolution;
  form.targetDrafts = { ...(form.targetDrafts || {}), ...resolution.targets };
  const nextErrors = { ...(form.targetErrors || {}) };
  delete nextErrors[courseKey];
  form.targetErrors = nextErrors;
  form.scheduleDirty = true;
  form.individualizedCourseKeys = [...new Set([...(form.individualizedCourseKeys || []), courseKey])];
  form.recentlyEditedCourseKey = courseKey;
  form.timeNotice = '';
  return resolution;
}

function assignmentTimeEditor(form) {
  if (form.batchConfirmMode) {
    const modeLabel = form.batchConfirmMode === 'next' ? '下次上課' : form.batchConfirmMode === 'next-week' ? '下週同一堂' : '選擇日期';
    return `<div class="modal-backdrop" data-action="close-assignment-batch-confirm">
      <section class="modal-card assignment-time-editor" role="dialog" aria-modal="true" aria-labelledby="assignment-batch-confirm-title">
        <div class="modal-heading"><div><p class="eyebrow">批次套用</p><h2 id="assignment-batch-confirm-title">覆蓋個別修改？</h2></div><button type="button" class="icon-button" data-action="close-assignment-batch-confirm" aria-label="關閉">×</button></div>
        <p class="modal-note">改用「${modeLabel}」會重新設定所有已選班級，先前逐班修改的時間會被覆蓋。</p>
        <div class="modal-actions"><button type="button" class="secondary-button" data-action="close-assignment-batch-confirm">取消</button><button type="button" class="primary-button" data-action="confirm-assignment-batch-time">確認套用</button></div>
      </section>
    </div>`;
  }
  const editor = form.timeEditor;
  if (!editor) return '';
  const course = assignmentFormCourses().find((item) => courseDataKey(item) === editor.courseKey);
  const currentDue = form.targetDrafts?.[editor.courseKey]?.due;
  const customFields = editor.custom
    ? `<div class="exam-time-fields"><label>日期<input type="date" data-action="assignment-time-date" min="${escapeHtml(editor.minDate)}" value="${escapeHtml(editor.dateKey)}" /></label></div>`
    : '';
  return `<div class="modal-backdrop" data-action="close-assignment-time-editor">
    <section class="modal-card exam-time-editor assignment-time-editor" role="dialog" aria-modal="true" aria-labelledby="assignment-time-editor-title">
      <div class="modal-heading"><div><p class="eyebrow">只修改這個班級</p><h2 id="assignment-time-editor-title">${escapeHtml(course?.classLabel || '單班')}檢查時間</h2></div><button type="button" class="icon-button" data-action="close-assignment-time-editor" aria-label="關閉">×</button></div>
      <div class="assignment-current-draft"><span>目前草稿</span><strong>${currentDue ? `${formatDate(currentDue.dateKey)}・第 ${currentDue.period} 節` : '尚未設定'}</strong></div>
      <div class="exam-single-time-actions assignment-single-time-actions"><button type="button" data-action="apply-single-assignment-time" data-mode="next">下次上課</button><button type="button" data-action="apply-single-assignment-time" data-mode="next-week">下週同一堂</button><button type="button" class="${editor.custom ? 'selected' : ''}" data-action="show-single-assignment-date">選擇日期</button></div>
      ${customFields}
      ${editor.error ? `<p class="exam-time-editor-error" role="alert">${escapeHtml(editor.error)}</p>` : ''}
      <div class="modal-actions exam-time-editor-actions"><button type="button" class="secondary-button" data-action="close-assignment-time-editor">取消</button>${customFields ? '<button type="button" class="primary-button" data-action="apply-custom-assignment-time">套用時間</button>' : ''}</div>
    </section>
  </div>`;
}

function renderAssignmentForm() {
  const form = state.assignmentForm;
  const session = form?.session || state.session;
  if (!session || !form) { state.page = 'today'; return renderToday(); }
  const courses = assignmentFormCourses();
  const currentKey = sessionCourseKey(session);
  const visibleCourses = form.showPeers ? courses : courses.filter((course) => courseDataKey(course) === currentKey);
  const resolution = assignmentFormResolution();
  const selected = new Set(form.selectedCourseKeys);
  const errorMap = new Map(resolution.errors.map((error) => [error.courseKey, error]));
  const validation = assignmentFormValidation(form, resolution);
  const editSharingNotice = assignmentEditSharingNotice(form.assignmentId, form.selectedCourseKeys);
  const previews = courses.filter((course) => selected.has(courseDataKey(course))).map((course) => {
    const courseKey = courseDataKey(course);
    const due = resolution.targets[courseKey]?.due;
    const error = errorMap.get(courseKey);
    const individualized = form.individualizedCourseKeys.includes(courseKey);
    return `<li class="exam-time-row assignment-time-row ${error ? 'error' : ''} ${individualized ? 'individualized' : ''}"><div><strong>${escapeHtml(course.classLabel)}</strong><span>${due ? `${formatDate(due.dateKey)}・第 ${due.period} 節` : escapeHtml(error?.reason || '尚未設定')}</span>${due ? `<small>${escapeHtml(due.start)}～${escapeHtml(due.end)}</small>` : ''}</div><button type="button" data-action="open-single-assignment-time" data-course-key="${escapeHtml(courseKey)}">修改時間</button></li>`;
  }).join('');
  const classButtons = visibleCourses.map((course) => {
    const key = courseDataKey(course);
    const isSelected = selected.has(key);
    return `<button type="button" class="class-choice ${isSelected ? 'selected' : ''}" data-action="toggle-form-course" data-course-key="${escapeHtml(key)}" aria-pressed="${isSelected}">${escapeHtml(course.classLabel)}</button>`;
  }).join('');
  const modeButton = (value, label) => `<button type="button" class="schedule-choice ${form.scheduleMode === value ? 'selected' : ''}" data-action="set-schedule-mode" data-mode="${value}" aria-pressed="${form.scheduleMode === value}">${label}</button>`;
  return `
    ${pageHeader(form.assignmentId ? '修改作業' : '新增作業', `${session.course.classLabel}・${session.course.subject}`, 'back-assignment-form')}
    <main id="main" class="content assignment-form-content" tabindex="-1">
      <section class="form-section"><label class="form-label" for="assignment-title">作業名稱</label><input id="assignment-title" class="title-input" data-action="assignment-title" maxlength="60" value="${escapeHtml(form.title)}" placeholder="例如：理化習作 p.36" /></section>
      <section class="form-section"><div class="form-section-title"><div><strong>套用班級</strong><span>顯示同年級、同科目的授課班級</span></div></div><div class="class-choice-grid">${classButtons}</div>${!form.showPeers && courses.length > 1 ? '<button class="expand-classes" data-action="show-peer-classes">＋ 加入其他班級</button>' : ''}${editSharingNotice ? `<p class="edit-sharing-notice">${escapeHtml(editSharingNotice)}</p>` : ''}</section>
      <section class="form-section assignment-batch-time"><div class="form-section-title"><div><strong>批次套用時間</strong><span>可先套用全部班級，再逐班修改</span></div></div><div class="schedule-choice-grid">${modeButton('next', '下次上課')}${modeButton('next-week', '下週同一堂')}${modeButton('date', '選擇日期')}</div>${form.scheduleMode === 'date' ? `<div class="assignment-batch-date"><label class="date-field">檢查日期<input type="date" data-action="assignment-date" min="${assignmentSchedulingSession(form).dateKey}" value="${escapeHtml(form.selectedDate)}" /></label></div>` : ''}${form.timeNotice ? `<p class="assignment-time-notice" aria-live="polite">${escapeHtml(form.timeNotice)}</p>` : ''}</section>
      <section class="form-section"><div class="form-section-title"><div><strong>各班檢查課堂</strong><span>每個班級都能單獨修改時間</span></div></div>${previews ? `<ul class="schedule-preview-list exam-time-list assignment-time-list">${previews}</ul>` : '<p class="compact-empty">尚未選擇班級。</p>'}<div class="form-validation" role="status" ${validation.length ? '' : 'hidden'}>${validation.map((message) => `<span>${escapeHtml(message)}</span>`).join('')}</div></section>
      <div class="form-fixed-action"><button class="primary-button" data-action="save-assignment" ${validation.length ? 'disabled' : ''}>${form.assignmentId ? '儲存修改' : '確認新增'}</button></div>
    </main>${assignmentTimeEditor(form)}`;
}

function openAssignmentForm(assignmentId = null, options = {}) {
  const session = options.session || state.session;
  if (!session) return;
  const assignment = assignmentId ? homeworkRecords.assignments[assignmentId] : null;
  const activeKeys = assignment ? Object.entries(assignment.targets).filter(([, target]) => target.status !== 'cancelled').map(([key]) => key) : [sessionCourseKey(session)];
  const selectedDate = assignment?.scheduleMode === 'date' ? Object.values(assignment.targets).find((target) => target.status !== 'cancelled')?.due.dateKey || session.dateKey : session.dateKey;
  const targetDrafts = assignment
    ? Object.fromEntries(Object.entries(assignment.targets).filter(([, target]) => target.status !== 'cancelled').map(([courseKey, target]) => [courseKey, { course: target.course, due: target.due, scheduleMode: target.scheduleMode || assignment.scheduleMode || 'exact' }]))
    : {};
  const initialMode = ['next', 'next-week', 'date'].includes(assignment?.scheduleMode) ? assignment.scheduleMode : 'next';
  state.assignmentForm = {
    assignmentId,
    session,
    returnPage: options.returnPage || 'course',
    title: assignment?.title || '',
    selectedCourseKeys: activeKeys,
    initialCourseKeys: [...activeKeys],
    availableCourses: Array.isArray(options.availableCourses) ? options.availableCourses : [],
    showPeers: Boolean(options.showPeers || (assignment && activeKeys.length > 1)),
    scheduleMode: initialMode,
    selectedDate,
    scheduleDirty: false,
    targetDrafts,
    targetErrors: {},
    individualizedCourseKeys: [],
    recentlyEditedCourseKey: '',
    timeNotice: '',
    timeEditor: null,
    batchConfirmMode: '',
    batchConfirmPreviousDate: null
  };
  if (!assignment) applyIndependentAssignmentTimes('next', activeKeys, { batch: true, notice: false });
  state.page = 'assignment-form';
  render();
}

function saveAssignmentForm() {
  const form = state.assignmentForm;
  const session = form?.session || state.session;
  const resolution = assignmentFormResolution();
  if (!session || !form.title.trim() || !form.selectedCourseKeys.length || resolution.errors.length) return;
  const id = form.assignmentId || globalThis.crypto?.randomUUID?.() || `assignment-${Date.now()}`;
  homeworkRecords = normalizeHomeworkSubmissionRecords({
    ...homeworkRecords,
    assignments: upsertAssignmentDefinition(homeworkRecords.assignments, {
      id,
      title: form.title.trim(),
      scheduleMode: 'independent',
      sessionDateKey: session.dateKey,
      selectedCourseKeys: form.selectedCourseKeys,
      resolvedTargets: resolution.targets,
      scheduleDirty: true,
      initialCourseKeys: form.initialCourseKeys
    })
  });
  persistHomework();
  const returnPage = form.returnPage;
  state.assignmentForm = null;
  state.page = returnPage === 'assignment-hub' ? 'assignment-hub' : 'course';
  if (state.page === 'course') state.accordion = 'assignment';
  if (state.page === 'assignment-hub') returnToSavedClassRecord('assignment', id, sessionCourseKey(session));
  showTimedToast(form.assignmentId ? '已更新作業' : '已建立作業');
}

function examFormCourses() {
  const session = state.examForm?.session || state.session;
  const courses = new Map(peerCourses(session).map((course) => [courseDataKey(course), course]));
  for (const course of state.examForm?.availableCourses || []) courses.set(courseDataKey(course), course);
  const exam = state.examForm?.examId ? homeworkRecords.exams[state.examForm.examId] : null;
  for (const target of Object.values(exam?.targets || {})) courses.set(courseDataKey(target.course), target.course);
  return [...courses.values()];
}

function examFormResolution() {
  const form = state.examForm;
  if (form.independentSchedule) {
    const courses = new Map(examFormCourses().map((course) => [courseDataKey(course), course]));
    const targets = {};
    const errors = [];
    for (const courseKey of form.selectedCourseKeys) {
      const target = form.targetDrafts?.[courseKey];
      const targetError = form.targetErrors?.[courseKey];
      if (targetError) errors.push({ courseKey, classLabel: courses.get(courseKey)?.classLabel || courseKey, reason: targetError });
      else if (target?.due) targets[courseKey] = { course: target.course, due: target.due, scheduleMode: target.scheduleMode || 'exact' };
      else errors.push({ courseKey, classLabel: courses.get(courseKey)?.classLabel || courseKey, reason: '尚未設定考試時間' });
    }
    return { targets, errors };
  }
  const selected = new Set(form.selectedCourseKeys);
  const exam = form.examId ? homeworkRecords.exams[form.examId] : null;
  const initial = new Set(form.initialCourseKeys);
  const courses = examFormCourses().filter((course) => selected.has(courseDataKey(course)) && (!exam || form.scheduleDirty || !initial.has(courseDataKey(course))));
  const resolved = resolveExamTargets({ weeklySchedules: scheduleSlotsProvider, session: form.session || state.session, courses, mode: form.scheduleMode, selectedDate: form.selectedDate });
  if (!exam || form.scheduleDirty) return resolved;
  const preserved = Object.fromEntries(form.selectedCourseKeys.filter((key) => initial.has(key) && exam.targets[key]).map((key) => [key, { course: exam.targets[key].course, due: exam.targets[key].due }]));
  return { targets: { ...preserved, ...resolved.targets }, errors: resolved.errors };
}

function updateExamScheduleDirty() {
  const form = state.examForm;
  form.scheduleDirty = form.scheduleMode !== form.originalScheduleMode || (form.scheduleMode === 'date' && form.selectedDate !== form.originalSelectedDate);
}

function examFormValidation(form, resolution) {
  const validation = [];
  if (!form.title.trim()) validation.push('請輸入考試名稱。');
  if (!form.selectedCourseKeys.length) validation.push('請至少選擇一個班級。');
  if (!form.independentSchedule && form.scheduleMode === 'date' && !form.selectedDate) validation.push('請選擇考試日期。');
  for (const error of resolution.errors) validation.push(`${error.classLabel}：${error.reason}。`);
  return validation;
}

function examSchedulingSession(form = state.examForm) {
  const session = form?.session || state.session;
  if (!session) return null;
  const todayKey = localDateKey(state.now);
  if (session.dateKey > todayKey) return session;
  const currentTime = `${String(state.now.getHours()).padStart(2, '0')}:${String(state.now.getMinutes()).padStart(2, '0')}`;
  if (session.dateKey === todayKey && session.end >= currentTime) return session;
  return { ...session, dateKey: todayKey, end: currentTime };
}

function periodDefinition(periodId, date = state.examForm?.commonDate || state.examForm?.selectedDate || state.session?.dateKey || localDateKey(state.now)) {
  const definition = periodTuplesForDate(date).find(([id]) => id === periodId);
  if (!definition) return null;
  return { id: definition[0], period: definition[1], start: definition[2], end: definition[3] };
}

function applyIndependentExamTimes(mode, courseKeys, { dateKey = '', periodId = '' } = {}) {
  const form = state.examForm;
  const session = examSchedulingSession(form);
  if (!form?.independentSchedule || !session) return;
  const courseMap = new Map(examFormCourses().map((course) => [courseDataKey(course), course]));
  const courses = courseKeys.map((courseKey) => courseMap.get(courseKey)).filter(Boolean);
  const resolution = resolveIndependentExamTimes({
    weeklySchedules: scheduleSlotsProvider,
    session,
    courses,
    mode,
    dateKey,
    period: mode === 'common-time' ? periodDefinition(periodId, dateKey) : null,
    minDate: mode === 'common-time' || mode === 'date' ? session.dateKey : ''
  });
  if (mode === 'common-time' && resolution.errors.length) return resolution;
  const nextErrors = { ...(form.targetErrors || {}) };
  for (const courseKey of courseKeys) delete nextErrors[courseKey];
  for (const error of resolution.errors) nextErrors[error.courseKey] = error.reason;
  const scheduledTargets = Object.fromEntries(Object.entries(resolution.targets).map(([courseKey, target]) => [courseKey, { ...target, scheduleMode: mode }]));
  form.targetDrafts = { ...(form.targetDrafts || {}), ...scheduledTargets };
  form.targetErrors = nextErrors;
  form.scheduleDirty = true;
  const successCount = Object.keys(scheduledTargets).length;
  const modeLabel = mode === 'next'
    ? '下次上課'
    : mode === 'next-week'
      ? '下週同一堂'
      : mode === 'date'
        ? '共同日期'
        : '共同日期與節次';
  form.timeNotice = successCount ? `已將${modeLabel}套用至 ${successCount} 個班級，可再逐班修改。` : `無法套用${modeLabel}。`;
  return resolution;
}

function applyExamBatchDate(courseKeys = state.examForm?.selectedCourseKeys || []) {
  const form = state.examForm;
  if (!form?.independentSchedule || !form.commonDateKey) return null;
  const mode = form.commonPeriodId ? 'common-time' : 'date';
  return applyIndependentExamTimes(mode, courseKeys, {
    dateKey: form.commonDateKey,
    periodId: form.commonPeriodId
  });
}

function examTimeEditor(form) {
  const editor = form.timeEditor;
  if (!editor) return '';
  const course = editor.courseKey ? examFormCourses().find((item) => courseDataKey(item) === editor.courseKey) : null;
  const isBatch = editor.scope === 'batch';
  const title = isBatch ? '共同考試時間' : `${course?.classLabel || '單班'}考試時間`;
  const periodOptions = periodTuplesForDate(editor.dateKey).map(([id, period, start, end]) => `<option value="${id}" ${editor.periodId === id ? 'selected' : ''}>第 ${period} 節　${start}～${end}</option>`).join('');
  const customFields = isBatch || editor.custom
    ? `<div class="exam-time-fields"><label>日期<input type="date" data-action="exam-time-date" min="${escapeHtml(editor.minDate)}" value="${escapeHtml(editor.dateKey)}" /></label><label>節次<select data-action="exam-time-period">${periodOptions}</select></label></div>`
    : '';
  return `<div class="modal-backdrop" data-action="close-exam-time-editor">
    <section class="modal-card exam-time-editor" role="dialog" aria-modal="true" aria-labelledby="exam-time-editor-title" data-exam-time-editor>
      <div class="modal-heading"><div><p class="eyebrow">${isBatch ? `套用至 ${form.selectedCourseKeys.length} 個班級` : '只設定這個班級'}</p><h2 id="exam-time-editor-title">${escapeHtml(title)}</h2></div><button type="button" class="icon-button" data-action="close-exam-time-editor" aria-label="關閉">×</button></div>
      ${isBatch ? '<p class="modal-note">所有已選班級會使用完全相同的日期與節次。</p>' : `<div class="exam-single-time-actions"><button type="button" data-action="apply-single-exam-time" data-mode="next">下次上課</button><button type="button" data-action="apply-single-exam-time" data-mode="next-week">下週同一堂</button><button type="button" class="${editor.custom ? 'selected' : ''}" data-action="show-single-exam-custom">指定日期／節次</button></div>`}
      ${customFields}
      ${editor.error ? `<p class="exam-time-editor-error" role="alert">${escapeHtml(editor.error)}</p>` : ''}
      <div class="modal-actions exam-time-editor-actions"><button type="button" class="secondary-button" data-action="close-exam-time-editor">取消</button>${customFields ? '<button type="button" class="primary-button exam-primary-button" data-action="apply-custom-exam-time">套用時間</button>' : ''}</div>
    </section>
  </div>`;
}

function renderExamForm() {
  const form = state.examForm;
  const session = form?.session || state.session;
  if (!session || !form) { state.page = 'today'; return renderToday(); }
  const courses = examFormCourses();
  const currentKey = sessionCourseKey(session);
  const visibleCourses = form.showPeers ? courses : courses.filter((course) => courseDataKey(course) === currentKey);
  const resolution = examFormResolution();
  const selected = new Set(form.selectedCourseKeys);
  const errorMap = new Map(resolution.errors.map((error) => [error.courseKey, error]));
  const validation = examFormValidation(form, resolution);
  const editSharingNotice = examEditSharingNotice(form.examId, form.selectedCourseKeys);
  const selectedCourses = courses.filter((course) => selected.has(courseDataKey(course)));
  const previews = selectedCourses.map((course) => {
    const courseKey = courseDataKey(course);
    const due = resolution.targets[courseKey]?.due;
    const error = errorMap.get(courseKey);
    if (form.independentSchedule) {
      return `<li class="exam-time-row ${error ? 'error' : ''}"><div><strong>${escapeHtml(course.classLabel)}</strong><span>${due ? `${formatDate(due.dateKey)}・第 ${due.period} 節` : escapeHtml(error?.reason || '尚未設定')}</span>${due ? `<small>${escapeHtml(due.start)}～${escapeHtml(due.end)}</small>` : ''}</div><button type="button" data-action="open-single-exam-time" data-course-key="${escapeHtml(courseKey)}">${due ? '修改' : '設定'}</button></li>`;
    }
    return `<li class="schedule-preview ${error ? 'error' : ''}"><strong>${escapeHtml(course.classLabel)}</strong><span>${due ? `${formatDate(due.dateKey)}｜第 ${due.period} 節` : escapeHtml(error?.reason || '待解析')}</span></li>`;
  }).join('');
  const classButtons = visibleCourses.map((course) => {
    const key = courseDataKey(course);
    const isSelected = selected.has(key);
    return `<button type="button" class="class-choice exam-choice ${isSelected ? 'selected' : ''}" data-action="toggle-exam-form-course" data-course-key="${escapeHtml(key)}" aria-pressed="${isSelected}">${escapeHtml(course.classLabel)}</button>`;
  }).join('');
  const modeButton = (value, label) => `<button type="button" class="schedule-choice exam-choice ${form.scheduleMode === value ? 'selected' : ''}" data-action="set-exam-schedule-mode" data-mode="${value}" aria-pressed="${form.scheduleMode === value}">${label}</button>`;
  const batchDateKey = form.commonDateKey || examSchedulingSession(form).dateKey;
  const commonPeriodOptions = `<option value="">依各班當日課表</option>${periodTuplesForDate(batchDateKey).map(([id, period, start, end]) => `<option value="${id}"${form.commonPeriodId === id ? ' selected' : ''}>第 ${period} 節　${start}～${end}</option>`).join('')}`;
  const examBatchDateFields = form.batchDateVisible
    ? `<div class="exam-batch-date-fields"><label class="date-field">考試日期<input type="date" data-action="exam-batch-date" min="${escapeHtml(examSchedulingSession(form).dateKey)}" value="${escapeHtml(form.commonDateKey)}" /></label><label>共同節次（選填）<select data-action="exam-batch-period">${commonPeriodOptions}</select></label><small>未指定共同節次時，各班使用這一天自己的上課節次。</small></div>`
    : '';
  const timingSection = form.independentSchedule
    ? `<section class="form-section exam-independent-time-section"><div class="form-section-title"><div><strong>各班考試時間</strong><span>可先批次套用，再逐班修改；套用後各班時間仍然獨立</span></div></div><div class="exam-batch-time"><strong>批次套用時間</strong><div class="exam-batch-choice-grid"><button type="button" data-action="apply-exam-batch-time" data-mode="next" ${selectedCourses.length ? '' : 'disabled'}>下次上課</button><button type="button" data-action="apply-exam-batch-time" data-mode="next-week" ${selectedCourses.length ? '' : 'disabled'}>下週同堂</button><button type="button" class="${form.batchDateVisible ? 'selected' : ''}" data-action="open-exam-common-time" ${selectedCourses.length ? '' : 'disabled'}>選擇日期</button></div>${examBatchDateFields}${form.timeNotice ? `<p>${escapeHtml(form.timeNotice)}</p>` : ''}</div><div class="exam-time-list-heading"><strong>實際時間</strong><span>${selectedCourses.length} 個班級</span></div>${previews ? `<ul class="schedule-preview-list exam-time-list">${previews}</ul>` : '<p class="compact-empty">請先選擇套用班級。</p>'}<div class="form-validation" role="status" ${validation.length ? '' : 'hidden'}>${validation.map((message) => `<span>${escapeHtml(message)}</span>`).join('')}</div></section>`
    : `<section class="form-section"><div class="form-section-title"><div><strong>考試時間</strong><span>每班會依自己的課表解析</span></div></div><div class="schedule-choice-grid">${modeButton('next', '下次上課')}${modeButton('next-week', '下週同一堂')}${modeButton('date', '選擇日期')}</div>${form.scheduleMode === 'date' ? `<label class="date-field">考試日期<input type="date" data-action="exam-date" min="${session.dateKey}" value="${escapeHtml(form.selectedDate)}" /></label>` : ''}</section><section class="form-section"><div class="form-section-title"><div><strong>各班考試課堂</strong><span>建立前確認實際日期與節次</span></div></div>${previews ? `<ul class="schedule-preview-list">${previews}</ul>` : '<p class="compact-empty">尚未選擇班級。</p>'}<div class="form-validation" role="status" ${validation.length ? '' : 'hidden'}>${validation.map((message) => `<span>${escapeHtml(message)}</span>`).join('')}</div></section>`;
  return `
    ${pageHeader(form.examId ? '修改考試' : '新增考試', `${session.course.classLabel}・${session.course.subject}`, 'back-exam-form')}
    <main id="main" class="content assignment-form-content exam-form-content" tabindex="-1">
      <section class="form-section"><label class="form-label" for="exam-title">考試名稱</label><input id="exam-title" class="title-input" data-action="exam-title" maxlength="60" value="${escapeHtml(form.title)}" placeholder="例如：第一章小考" /></section>
      <section class="form-section"><div class="form-section-title"><div><strong>套用班級</strong><span>顯示同年級、同科目的授課班級</span></div></div><div class="class-choice-grid">${classButtons}</div>${!form.showPeers && courses.length > 1 ? '<button class="expand-classes" data-action="show-exam-peer-classes">＋ 加入其他班級</button>' : ''}${editSharingNotice ? `<p class="edit-sharing-notice exam-sharing-notice">${escapeHtml(editSharingNotice)}</p>` : ''}</section>
      ${timingSection}
      <div class="form-fixed-action"><button class="primary-button exam-primary-button" data-action="save-exam" ${validation.length ? 'disabled' : ''}>${form.examId ? '儲存修改' : '確認新增'}</button></div>
    </main>${form.independentSchedule ? examTimeEditor(form) : ''}`;
}

function openExamForm(examId = null, options = {}) {
  const session = options.session || state.session;
  if (!session) return;
  const exam = examId ? homeworkRecords.exams[examId] : null;
  const activeKeys = exam ? Object.entries(exam.targets).filter(([, target]) => target.status !== 'cancelled').map(([key]) => key) : [sessionCourseKey(session)];
  const selectedDate = exam?.scheduleMode === 'date' ? Object.values(exam.targets).find((target) => target.status !== 'cancelled')?.due.dateKey || session.dateKey : session.dateKey;
  const independentSchedule = !exam || exam.scheduleMode === 'independent';
  const targetDrafts = exam && independentSchedule
    ? Object.fromEntries(Object.entries(exam.targets).filter(([, target]) => target.status !== 'cancelled').map(([courseKey, target]) => [courseKey, { course: target.course, due: target.due, scheduleMode: target.scheduleMode || 'exact' }]))
    : {};
  const baselineDate = session.dateKey > localDateKey(state.now) ? session.dateKey : localDateKey(state.now);
  state.examForm = {
    examId,
    session,
    returnPage: options.returnPage || 'course',
    independentSchedule,
    title: exam?.title || '',
    selectedCourseKeys: activeKeys,
    initialCourseKeys: [...activeKeys],
    availableCourses: Array.isArray(options.availableCourses) ? options.availableCourses : [],
    showPeers: Boolean(options.showPeers || (exam && activeKeys.length > 1)),
    scheduleMode: independentSchedule ? 'independent' : exam?.scheduleMode || 'next',
    originalScheduleMode: independentSchedule ? 'independent' : exam?.scheduleMode || 'next',
    selectedDate,
    originalSelectedDate: selectedDate,
    scheduleDirty: false,
    targetDrafts,
    targetErrors: {},
    timeNotice: '',
    timeEditor: null,
    batchDateVisible: false,
    commonDateKey: '',
    commonPeriodId: ''
  };
  state.page = 'exam-form';
  render();
  window.requestAnimationFrame(() => app.querySelector('[data-action="exam-title"]')?.focus());
}

function saveExamForm() {
  const form = state.examForm;
  const session = form?.session || state.session;
  const resolution = examFormResolution();
  if (!session || !form.title.trim() || !form.selectedCourseKeys.length || resolution.errors.length) return;
  const id = form.examId || globalThis.crypto?.randomUUID?.() || `exam-${Date.now()}`;
  homeworkRecords = {
    ...homeworkRecords,
    exams: upsertExamDefinition(homeworkRecords.exams, {
      id,
      title: form.title.trim(),
      scheduleMode: form.independentSchedule ? 'independent' : form.scheduleMode,
      sessionDateKey: session.dateKey,
      selectedCourseKeys: form.selectedCourseKeys,
      resolvedTargets: resolution.targets,
      scheduleDirty: form.scheduleDirty,
      initialCourseKeys: form.initialCourseKeys
    })
  };
  persistHomework();
  const returnPage = form.returnPage;
  state.examForm = null;
  state.page = returnPage === 'exam-hub' ? 'exam-hub' : 'course';
  if (state.page === 'course') state.accordion = 'exam';
  if (state.page === 'exam-hub') returnToSavedClassRecord('exam', id, sessionCourseKey(session));
  showTimedToast(form.examId ? '已更新考試' : '已建立考試');
}

function seatButton(seat, roster) {
  const disabled = roster.vacantSeats.includes(seat);
  const seatState = state.draftSeatStates[seat];
  const label = disabled ? `${seat} 號空號` : seatState === 'leave' ? `${seat} 號請假` : seatState === 'incomplete' ? `${seat} 號未完成` : `${seat} 號完成`;
  return `<button class="seat ${seatState || ''} ${disabled ? 'disabled' : ''}" data-action="seat" data-seat="${seat}" ${disabled ? 'disabled' : ''} aria-label="${label}" aria-pressed="${Boolean(seatState)}"><span>${seat}</span></button>`;
}

function renderHomework() {
  const context = state.activeAssignment;
  const session = context?.session || state.session;
  if (!session || !context) { state.page = 'today'; return renderToday(); }
  const assignment = context ? homeworkRecords.assignments[context.assignmentId] : null;
  const target = assignment?.targets?.[context?.courseKey];
  if (!assignment || !target) { state.page = 'course'; return renderCourse(); }
  const roster = rosterForSession(session);
  const validSeatStates = sanitizeSeatStatesForSession(state.draftSeatStates, session);
  state.draftSeatStates = validSeatStates;
  const summary = summarizeSeatStates(validSeatStates);
  const incompleteSeats = Object.keys(validSeatStates).filter((seat) => validSeatStates[seat] === 'incomplete');
  const leaveSeats = Object.keys(validSeatStates).filter((seat) => validSeatStates[seat] === 'leave');
  const selectedCount = summary.incomplete + summary.leave;
  return `
    ${pageHeader('作業檢查', `${session.course.classLabel}・${session.course.subject}`, 'back-course')}
    <main id="main" class="content homework-content" tabindex="-1">
      <section class="homework-heading">
        <div><p class="eyebrow">本次作業</p><h1>${escapeHtml(assignment.title)}</h1></div>
        <button class="mode-button ${state.leaveMode ? 'active' : ''}" data-action="toggle-leave-mode" aria-pressed="${state.leaveMode}"><span>請假模式</span><strong>${state.leaveMode ? '已開啟' : '關閉'}</strong></button>
      </section>
      <div class="instruction ${state.leaveMode ? 'leave-active' : ''}">${state.leaveMode ? '請假模式已開啟：點座號可標記或取消請假。' : '點一下標記未完成；長按座號標記請假。'}</div>
      ${roster.missing ? renderMissingRosterNotice() : `<section class="seat-grid" aria-label="${roster.lastSeat} 號以內名冊座號">${roster.allSeats.map((seat) => seatButton(seat, roster)).join('')}</section>`}

      <section class="live-summary" aria-live="polite">
        <div><span>未完成</span><strong>${summary.incomplete}</strong><small>${incompleteSeats.length ? incompleteSeats.join('、') + ' 號' : '無'}</small></div>
        <div><span>請假</span><strong>${summary.leave}</strong><small>${leaveSeats.length ? leaveSeats.join('、') + ' 號' : '無'}</small></div>
      </section>
      <div class="legend"><span><i class="dot incomplete-dot"></i>未完成</span><span><i class="dot leave-dot"></i>請假</span>${roster.missing ? '' : `<span><i class="dot disabled-dot"></i>${vacantSeatDescription(roster)}</span>`}</div>
      <div class="homework-actions">
        <button class="primary-button" data-action="save-homework"${roster.missing ? ' disabled' : ''}>${selectedCount ? `儲存檢查（共 ${selectedCount} 人）` : '全員完成，儲存檢查'}</button>
      </div>
    </main>`;
}

function examSeatButton(seat, roster) {
  const disabled = roster.vacantSeats.includes(seat);
  const absent = state.draftExamSeatStates[seat] === 'absent';
  const label = disabled ? `${seat} 號空號` : absent ? `${seat} 號缺考` : `${seat} 號到考`;
  return `<button class="seat exam-seat ${absent ? 'absent' : ''} ${disabled ? 'disabled' : ''}" data-action="exam-seat" data-seat="${seat}" ${disabled ? 'disabled' : ''} aria-label="${label}" aria-pressed="${absent}"><span>${seat}</span></button>`;
}

function renderExamAttendance() {
  const context = state.activeExam;
  const session = context?.session || state.session;
  if (!session) { state.page = 'today'; return renderToday(); }
  const exam = context ? homeworkRecords.exams[context.examId] : null;
  const examTarget = exam?.targets?.[context?.courseKey];
  if (!exam || !examTarget) {
    state.page = context?.returnPage === 'exam-hub' ? 'exam-hub' : 'course';
    return state.page === 'exam-hub' ? renderExamHub() : renderCourse();
  }
  const roster = rosterForSession(session);
  const validSeatStates = sanitizeSeatStatesForSession(state.draftExamSeatStates, session);
  state.draftExamSeatStates = validSeatStates;
  const summary = summarizeExamSeatStates(validSeatStates, roster.vacantSeats);
  return `
    ${pageHeader('考試點名', `${session.course.classLabel}・${session.course.subject}`, 'back-exam-attendance')}
    <main id="main" class="content homework-content exam-attendance-content" tabindex="-1">
      <section class="homework-heading exam-attendance-heading">
        <div><p class="eyebrow">本次考試</p><h1>${escapeHtml(exam.title)}</h1></div>
      </section>
      <div class="instruction exam-instruction">預設為全員到考。點一下座號標記缺考，再點一次可取消。</div>
      ${roster.missing ? renderMissingRosterNotice() : `<section class="seat-grid" aria-label="${roster.lastSeat} 號以內考試點名座號">${roster.allSeats.map((seat) => examSeatButton(seat, roster)).join('')}</section>`}
      <section class="live-summary exam-live-summary" aria-live="polite">
        <div><span>缺考</span><strong>${summary.absent}</strong><small>${summary.absentSeats.length ? `${summary.absentSeats.join('、')} 號` : '無'}</small></div>
      </section>
      <div class="legend"><span><i class="dot absent-dot"></i>缺考</span>${roster.missing ? '' : `<span><i class="dot disabled-dot"></i>${vacantSeatDescription(roster)}</span>`}</div>
      <div class="homework-actions exam-actions">
        <button class="primary-button exam-primary-button" data-action="save-exam-check"${roster.missing ? ' disabled' : ''}>${summary.absent ? `儲存點名（${summary.absent} 人缺考）` : '全員到考，儲存點名'}</button>
      </div>
    </main>`;
}

function reminderSeatButton(seat, roster) {
  const emptySeat = roster.vacantSeats.includes(seat);
  const categorySelected = Boolean(state.reminderCategory);
  const disabled = emptySeat || !categorySelected;
  const justRecorded = state.reminderFlashSeat === seat;
  const label = emptySeat
    ? `${seat} 號空號`
    : categorySelected
      ? `登記 ${seat} 號，${state.reminderCategory}`
      : `${seat} 號，請先選擇提醒類型`;
  return `<button class="seat reminder-seat ${justRecorded ? 'just-recorded' : ''} ${emptySeat ? 'disabled' : ''}" data-action="reminder-seat" data-seat="${seat}" ${disabled ? 'disabled' : ''} aria-label="${escapeHtml(label)}"><span>${seat}</span></button>`;
}

function renderReminderRecord(record) {
  return `<li class="reminder-record">
    <span class="reminder-record-seat">${record.seat}號</span>
    <strong>${escapeHtml(record.category)}</strong>
    <time datetime="${escapeHtml(record.createdAt)}">${escapeHtml(record.recordedTime)}</time>
    <button type="button" data-action="undo-reminder" data-reminder-id="${escapeHtml(record.id)}" data-seat="${record.seat}">復原</button>
  </li>`;
}

function renderReminderDock(records) {
  const latest = records[0] || null;
  const latestLabel = latest ? `${latest.seat} 號，${latest.category}` : '尚無登記';
  return `<aside class="reminder-dock" aria-label="本堂登記摘要">
    <div class="reminder-dock-inner ${latest ? 'has-records' : ''} ${state.reminderFlashSeat ? 'just-recorded' : ''}">
      <button type="button" class="reminder-dock-open" data-action="open-reminder-sheet" aria-haspopup="dialog" aria-expanded="${state.reminderSheetOpen}" aria-label="查看本堂登記，共 ${records.length} 次，${escapeHtml(latestLabel)}">
        <span class="reminder-dock-heading"><strong>本堂登記</strong><em>${records.length} 次</em><span>查看</span></span>
        <span class="reminder-dock-latest">${latest
          ? `最新：<strong>${latest.seat}號・${escapeHtml(latest.category)}</strong><time datetime="${escapeHtml(latest.createdAt)}">${escapeHtml(latest.recordedTime)}</time>`
          : '尚無登記，點此查看'}</span>
      </button>
      ${latest ? `<button type="button" class="reminder-dock-undo" data-action="undo-reminder" data-reminder-id="${escapeHtml(latest.id)}" aria-label="復原最新登記，${latest.seat} 號，${escapeHtml(latest.category)}">復原</button>` : ''}
    </div>
  </aside>`;
}

function renderReminderSheet(records) {
  if (!state.reminderSheetOpen) return '';
  return `<div class="reminder-sheet-backdrop" data-action="close-reminder-sheet">
    <section class="reminder-sheet" role="dialog" aria-modal="true" aria-labelledby="reminder-sheet-title" data-reminder-sheet>
      <header class="reminder-sheet-heading">
        <div><p>${escapeHtml(state.session.course.classLabel)}・${escapeHtml(state.session.course.subject)}</p><h2 id="reminder-sheet-title" tabindex="-1">本堂登記 <span>${records.length} 次</span></h2></div>
        <button type="button" data-action="close-reminder-sheet">關閉</button>
      </header>
      <div class="reminder-sheet-body" data-reminder-sheet-body>
        ${records.length
          ? `<ol class="reminder-records">${records.map(renderReminderRecord).join('')}</ol>`
          : '<p class="reminder-empty">本堂尚無登記。</p>'}
      </div>
    </section>
  </div>`;
}

function renderReminders() {
  const session = state.session;
  if (!session) { state.page = 'today'; return renderToday(); }
  const records = classroomRemindersForSession(homeworkRecords.reminders, session);
  const roster = rosterForSession(session);
  const categoryButtons = CLASSROOM_REMINDER_CATEGORIES.map((category) => {
    const selected = state.reminderCategory === category;
    return `<button type="button" class="reminder-category ${selected ? 'selected' : ''}" data-action="select-reminder-category" data-category="${escapeHtml(category)}" aria-pressed="${selected}">${escapeHtml(category)}</button>`;
  }).join('');
  const instruction = state.reminderCategory
    ? `目前登記：${state.reminderCategory}。點座號會立即新增一筆，可連續登記。`
    : '先選擇提醒類型，再點座號登記。';
  return `
    ${pageHeader('課堂提醒', `${session.course.classLabel}・${session.course.subject}`, 'back-reminders')}
    <main id="main" class="content reminder-content" tabindex="-1">
      <section class="reminder-heading">
        <p class="eyebrow">本堂課</p>
        <h1>課堂提醒</h1>
        <p>四種類型合併計算；每月每累積 3 次，抽籤權重增加 1。</p>
      </section>

      <section class="reminder-category-section" aria-labelledby="reminder-category-title">
        <h2 id="reminder-category-title">提醒類型</h2>
        <div class="reminder-category-grid">${categoryButtons}</div>
      </section>

      <p class="reminder-instruction ${state.reminderCategory ? 'active' : ''}">${escapeHtml(instruction)}</p>
      ${roster.missing ? renderMissingRosterNotice() : `<section class="seat-grid reminder-seat-grid ${state.reminderCategory ? '' : 'waiting'}" aria-label="${roster.lastSeat} 號以內名冊座號">${roster.allSeats.map((seat) => reminderSeatButton(seat, roster)).join('')}</section>`}
      ${roster.missing ? '' : `<div class="legend reminder-legend"><span><i class="dot disabled-dot"></i>${vacantSeatDescription(roster)}</span></div>`}
      <p class="visually-hidden" role="status" aria-live="polite">${escapeHtml(state.reminderAnnouncement)}</p>
    </main>
    ${renderReminderDock(records)}
    ${renderReminderSheet(records)}`;
}

function drawMonthKey() {
  return state.session?.dateKey?.slice(0, 7) || localDateKey(state.now).slice(0, 7);
}

function drawCourseRecord() {
  return homeworkRecords.courses?.[sessionCourseKey()] || {};
}

function drawWeightSources() {
  const courseKey = sessionCourseKey();
  const monthKey = drawMonthKey();
  const course = drawCourseRecord();
  return {
    homeworkWeights: course.homeworkWeights || {},
    reminderCounts: classroomReminderMonthlyCounts(homeworkRecords.reminders, courseKey, monthKey),
    reminderWeights: classroomReminderWeightsForMonth(homeworkRecords.reminders, courseKey, monthKey),
    manualWeights: course.manualDrawWeightsByMonth?.[monthKey] || {},
    cap: Math.max(2, Math.min(10, Number(course.drawWeightCap || 6)))
  };
}

function manualDrawResolutionForSeat(seat, sources = drawWeightSources()) {
  return resolveManualDrawWeight({
    homework: sources.homeworkWeights[seat],
    reminder: sources.reminderWeights[seat],
    manual: sources.manualWeights[seat],
    cap: sources.cap
  });
}

function normalizeStoredManualDrawWeights(cap = drawWeightSources().cap) {
  const course = drawCourseRecord();
  const previous = course.manualDrawWeightsByMonth || {};
  const normalized = clampManualDrawWeightsByMonth(previous, cap);
  if (JSON.stringify(normalized) === JSON.stringify(previous)) return;
  updateDrawCourseRecord({ manualDrawWeightsByMonth: normalized });
}

function currentWeekDrawCounts() {
  const sessionKey = classroomReminderSessionKey(state.session);
  if (!sessionKey) return {};
  // The active history may already mark an absent result before the redraw is saved.
  // Replace this session's snapshot so it is counted once, using its latest state.
  const sessions = state.drawSessionKey === sessionKey
    ? { ...(homeworkRecords.drawSessions || {}), [sessionKey]: { history: state.drawHistory } }
    : homeworkRecords.drawSessions || {};
  return weeklyDrawCounts(sessions, sessionCourseKey(), state.session.dateKey);
}

function displayDrawWeight(weight) {
  return weight > 0 && weight < 0.01 ? '小於 0.01' : String(Number(weight.toFixed(2)));
}

function currentDrawPool(includeEntireClass = false, useWeighting = state.drawUseWeighting) {
  const sources = drawWeightSources();
  const pool = createWeightedDrawPool({
    activeSeats: activeRosterSeats(state.session),
    excludedSeats: includeEntireClass ? [] : state.drawExcludedSeats,
    drawnSeats: includeEntireClass ? [] : state.drawSeatsThisRound,
    allowRepeat: includeEntireClass || state.drawAllowRepeat,
    useWeighting,
    homeworkWeights: sources.homeworkWeights,
    reminderWeights: sources.reminderWeights,
    manualWeights: sources.manualWeights,
    cap: sources.cap
  });
  return applyWeeklyDrawAdjustment(pool, currentWeekDrawCounts());
}

function drawPreviousSummary() {
  const previous = state.drawCurrentSeat == null ? state.drawHistory : state.drawHistory.slice(1);
  const counts = new Map();
  for (const record of previous) {
    const summary = counts.get(record.seat) || { count: 0, absent: 0 };
    counts.set(record.seat, { count: summary.count + 1, absent: summary.absent + (record.absent ? 1 : 0) });
  }
  const seats = [...counts.keys()];
  return {
    total: previous.length,
    rows: seats.slice(0, 5).map((seat) => ({ seat, ...counts.get(seat) })),
    overflow: Math.max(0, seats.length - 5)
  };
}

function renderDrawRecent() {
  const summary = drawPreviousSummary();
  const rows = summary.rows.map(({ seat, count, absent }) => {
    const meta = [count > 1 ? `×${count}` : '', absent ? '未到' : ''].filter(Boolean).join('・');
    return `<span class="draw-recent-row ${absent ? 'has-absent' : ''}" aria-label="${seat} 號，共 ${count} 次${absent ? `，其中 ${absent} 次不在場` : ''}"><span>${String(seat).padStart(2, '0')}號</span>${meta ? `<small>${meta}</small>` : ''}</span>`;
  }).join('');
  return `<button type="button" class="draw-recent" data-action="open-draw-sheet" data-sheet="history" aria-haspopup="dialog" aria-label="查看本節抽籤紀錄，共 ${state.drawHistory.length} 次">
    <span class="draw-recent-heading"><strong>之前抽中</strong><span class="draw-recent-count">${state.drawHistory.length} 次 ›</span></span>
    <span class="draw-recent-list">${rows || '<span class="draw-recent-empty">尚無先前紀錄</span>'}${summary.overflow ? `<span class="draw-recent-overflow">另 ${summary.overflow} 位</span>` : ''}</span>
  </button>`;
}

function renderDrawFocus(pool, participantCount) {
  const currentSeat = state.drawCurrentSeat;
  const roundComplete = !state.drawAllowRepeat && participantCount > 0 && !pool.length && currentSeat == null && state.drawSeatsThisRound.length > 0;
  if (currentSeat != null) {
    return `<section class="draw-focus" aria-labelledby="draw-result-label">
      <p id="draw-result-label" class="draw-result-label">本次抽中</p>
      <div class="draw-result-number is-seat" aria-label="抽中 ${currentSeat} 號">${String(currentSeat).padStart(2, '0')}</div>
      <p class="draw-result-caption">結果不顯示權重與原因</p>
    </section>`;
  }
  if (!participantCount) {
    return `<section class="draw-focus" aria-labelledby="draw-result-label"><p id="draw-result-label" class="draw-result-label">暫不抽取</p><div class="draw-result-number">0</div><p class="draw-result-caption">目前沒有可抽取座號</p></section>`;
  }
  if (roundComplete) {
    const uniqueDrawn = new Set(state.drawSeatsThisRound).size;
    return `<section class="draw-focus" aria-labelledby="draw-result-label"><p id="draw-result-label" class="draw-result-label">本輪完成</p><div class="draw-result-number">${uniqueDrawn}</div><p class="draw-result-caption">位同學已完成本輪抽籤</p></section>`;
  }
  return `<section class="draw-focus" aria-labelledby="draw-result-label"><p id="draw-result-label" class="draw-result-label">準備完成</p><div class="draw-result-number" aria-label="${participantCount} 位同學參與">${participantCount}</div><p class="draw-result-caption">位同學已進入卡池</p></section>`;
}

function renderDraw() {
  const session = state.session;
  if (!session) { state.page = 'today'; return renderToday(); }
  const roster = rosterForSession(session);
  const active = new Set(roster.activeSeats);
  const participantCount = roster.activeSeats.length - state.drawExcludedSeats.filter((seat) => active.has(seat)).length;
  const pool = currentDrawPool();
  const currentSeat = state.drawCurrentSeat;
  const noCandidates = participantCount === 0;
  const lastResultInRound = currentSeat != null && !state.drawAllowRepeat && pool.length === 0;
  const roundComplete = currentSeat == null && !state.drawAllowRepeat && pool.length === 0 && state.drawSeatsThisRound.length > 0;
  const primaryAction = lastResultInRound || roundComplete ? 'restart-draw-round' : 'draw-one';
  const primaryLabel = lastResultInRound || roundComplete ? '開始新一輪' : currentSeat != null ? '再抽一位' : '抽一位';
  return `
    ${pageHeader('抽籤', `${session.course.classLabel}・${session.course.subject}｜第 ${session.period} 節`, 'back-draw')}
    <main id="main" class="content draw-content" tabindex="-1">
      ${renderMissingRosterNotice(roster)}
      <div class="draw-title-row"><div><p class="eyebrow">抽籤</p><h1>抽一位同學</h1></div><span class="draw-participants">${participantCount} 人參與</span></div>
      ${renderDrawTimer()}
      <div class="draw-stage">${renderDrawFocus(pool, participantCount)}${renderDrawRecent()}</div>
      <div class="draw-actions ${currentSeat != null ? 'has-result' : ''}">
        <button type="button" class="primary-button draw-primary" data-action="${primaryAction}" ${noCandidates ? 'disabled' : ''}>${noCandidates ? '目前無人可抽' : primaryLabel}</button>
        ${currentSeat != null ? '<button type="button" class="secondary-button draw-absent" data-action="absent-redraw">不在場，重抽</button>' : ''}
      </div>
      <section class="draw-options" aria-label="本節抽籤選項">
        <div class="draw-option draw-switch-option draw-weight-option ${state.drawUseWeighting ? '' : 'is-off'}"><div><strong>使用額外加權</strong><span>${state.drawUseWeighting ? '目前開啟・作業、提醒與手動加權' : '目前關閉・仍套用本週次數調整'}</span></div><button type="button" class="draw-switch" role="switch" aria-checked="${state.drawUseWeighting}" aria-label="使用額外加權" data-action="toggle-draw-weighting"><span></span></button></div>
        <div class="draw-option draw-switch-option"><div><strong>同一人可再抽中</strong><span>${state.drawAllowRepeat ? '目前開啟・本節可能重複抽中' : '目前關閉・本節每人最多一次'}</span></div><button type="button" class="draw-switch" role="switch" aria-checked="${state.drawAllowRepeat}" aria-label="同一人可再抽中" data-action="toggle-draw-repeat"><span></span></button></div>
        <button type="button" class="draw-option draw-option-button" data-action="open-draw-sheet" data-sheet="exclusion" aria-haspopup="dialog"><div><strong>暫不抽取</strong><span>選填・目前 ${state.drawExcludedSeats.length} 人</span></div><span aria-hidden="true">›</span></button>
        <button type="button" class="draw-option draw-option-button" data-action="open-draw-sheet" data-sheet="pool" aria-haspopup="dialog"><div><strong>查看卡池內容</strong><span>本週次數與權重只顯示給老師</span></div><span aria-hidden="true">›</span></button>
      </section>
      <p class="draw-weekly-note">本週抽過會降低權重・每週一重新計算</p>
      <p class="visually-hidden" role="status" aria-live="polite">${escapeHtml(state.drawAnnouncement)}</p>
    </main>
    ${renderDrawSheet()}`;
}

function renderDrawSheet() {
  if (state.page !== 'draw' || !state.drawSheet) return '';
  const roster = rosterForSession(state.session);
  const closeButton = '<button type="button" data-action="close-draw-sheet">完成</button>';
  const enteringClass = drawSheetEntering ? ' is-entering' : '';
  if (state.drawSheet === 'exclusion') {
    const excluded = new Set(state.drawExcludedSeats);
    const vacant = new Set(roster.vacantSeats);
    const seats = roster.allSeats.map((seat) => {
      const disabled = vacant.has(seat);
      const selected = excluded.has(seat);
      return `<button type="button" class="draw-sheet-seat ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}" data-action="toggle-draw-exclusion" data-seat="${seat}" aria-pressed="${selected}" ${disabled ? 'disabled' : ''}>${String(seat).padStart(2, '0')}</button>`;
    }).join('');
    return `<div class="draw-sheet-backdrop" data-action="close-draw-sheet"><section class="draw-sheet${enteringClass}" role="dialog" aria-modal="true" aria-labelledby="draw-sheet-title" data-draw-sheet><div class="draw-sheet-heading"><div><h2 id="draw-sheet-title">暫不抽取</h2><p>只影響目前這一堂課</p></div>${closeButton}</div><div class="draw-sheet-body"><div class="draw-sheet-seat-grid">${seats}</div><p class="draw-sheet-note">已選 ${state.drawExcludedSeats.length} 人；${escapeHtml(vacantSeatDescription(roster))}。</p></div></section></div>`;
  }
  if (state.drawSheet === 'pool') {
    const sources = drawWeightSources();
    const pool = currentDrawPool(true).map((entry) => ({ ...entry, configuredWeight: manualDrawResolutionForSeat(entry.seat, sources).total })).sort((left, right) => right.weight - left.weight || left.seat - right.seat);
    const detailed = pool.filter((entry) => entry.configuredWeight > 1 || entry.weeklyCount > 0);
    const baseCount = pool.length - detailed.length;
    const rows = detailed.map((entry) => {
      const reasons = ['基本 1'];
      if (state.drawUseWeighting) {
        if (entry.homework) reasons.push(`待補交 +${entry.homework}`);
        if (entry.reminder) reasons.push(`本月提醒 ${sources.reminderCounts[entry.seat] || 0} 次 → +${entry.reminder}`);
        if (entry.manualRequested) reasons.push(entry.manual < entry.manualRequested ? `手動目前 +${entry.manual}（設定 +${entry.manualRequested}）` : `手動 +${entry.manual}`);
        if (entry.configuredWeight === sources.cap) reasons.push(`上限 ${sources.cap} 張`);
      } else if (entry.configuredWeight > 1) reasons.push(`原設定 ${entry.configuredWeight} 張（本節未套用）`);
      if (entry.weeklyCount) reasons.push(`本週抽中 ${entry.weeklyCount} 次 → ÷${entry.weeklyCount + 1}`);
      return `<article class="draw-pool-row" data-draw-pool-seat="${entry.seat}" data-effective-weight="${entry.weight}"><strong>${String(entry.seat).padStart(2, '0')}號</strong><span>${displayDrawWeight(entry.weight)} 張</span><small>${reasons.join('・')}</small></article>`;
    }).join('');
    if (!roster.activeSeats.includes(state.drawManualSeat)) state.drawManualSeat = roster.activeSeats[0] || null;
    const manualResolution = manualDrawResolutionForSeat(state.drawManualSeat, sources);
    const manualValue = manualResolution.requested;
    const manualStatus = !state.drawUseWeighting
      ? manualResolution.limited
        ? `本節未套用；原設定 +${manualValue}，若重新開啟會受上限限制為 +${manualResolution.applied}。`
        : `本節未套用；原設定手動 +${manualValue}，重新開啟後恢復。`
      : manualResolution.limited
      ? `設定 +${manualValue}，目前實際套用 +${manualResolution.applied}；作業與提醒已占用部分上限。`
      : `目前實際套用 +${manualResolution.applied}。`;
    const seatOptions = roster.activeSeats.map((seat) => `<option value="${seat}" ${seat === state.drawManualSeat ? 'selected' : ''}>${String(seat).padStart(2, '0')}號</option>`).join('');
    const capOptions = Array.from({ length: 9 }, (_, index) => index + 2).map((cap) => `<option value="${cap}" ${cap === sources.cap ? 'selected' : ''}>最多 ${cap} 張</option>`).join('');
    const modeNotice = state.drawUseWeighting ? '' : '<p class="draw-pool-mode-note"><strong>本節未使用額外加權</strong><span>作業、提醒與手動設定保留；仍依本週抽中次數降低權重。</span></p>';
    const week = drawWeekRange(state.session.dateKey);
    const weekLabel = week ? `${formatDate(week.startDateKey)}～${formatDate(week.endDateKey)}` : '';
    const weeklyNotice = `<p class="draw-pool-mode-note"><strong>本週 ${weekLabel}・同班同科</strong><span>原權重 ÷（本週抽中次數＋1）；不在場不計次。顯示值取小數兩位，抽籤使用完整精度。</span></p>`;
    return `<div class="draw-sheet-backdrop" data-action="close-draw-sheet"><section class="draw-sheet draw-pool-sheet${enteringClass}" role="dialog" aria-modal="true" aria-labelledby="draw-sheet-title" data-draw-sheet><div class="draw-sheet-heading"><div><h2 id="draw-sheet-title">卡池內容</h2><p>全班權重・仍依本堂參與設定抽取</p></div>${closeButton}</div><div class="draw-sheet-body">${modeNotice}${weeklyNotice}<section class="draw-manual-panel" aria-labelledby="manual-draw-title"><div class="draw-manual-heading"><div><strong id="manual-draw-title">手動月加權</strong><small>${drawMonthKey().replace('-', ' 年 ')} 月・選填</small></div><select data-action="draw-weight-cap" aria-label="每人權重上限">${capOptions}</select></div><div class="draw-manual-controls"><select data-action="draw-manual-seat" aria-label="選擇座號" ${state.drawManualSeat == null ? 'disabled' : ''}>${seatOptions}</select><button type="button" data-action="adjust-draw-manual" data-delta="-1" aria-label="${state.drawManualSeat || ''} 號手動加權減一" ${state.drawManualSeat == null || manualValue === 0 ? 'disabled' : ''}>−1</button><output aria-live="polite">+${manualValue}</output><button type="button" data-action="adjust-draw-manual" data-delta="1" aria-label="${state.drawManualSeat || ''} 號手動加權加一" ${state.drawManualSeat == null || manualValue >= manualResolution.maxRequested ? 'disabled' : ''}>+1</button></div><p class="draw-manual-status">${manualStatus}</p></section><div class="draw-pool-list">${rows}${baseCount ? `<article class="draw-pool-row base-row"><strong>其他座號</strong><span>1 張</span><small>${baseCount} 位・本週未抽中且無額外加權</small></article>` : ''}</div></div></section></div>`;
  }
  const records = state.drawHistory.map((record) => `<li class="draw-history-record"><span>${String(record.seat).padStart(2, '0')}號</span><strong>${record.absent ? '不在場' : '抽中'}</strong><time>${escapeHtml(record.time)}</time></li>`).join('');
  return `<div class="draw-sheet-backdrop" data-action="close-draw-sheet"><section class="draw-sheet${enteringClass}" role="dialog" aria-modal="true" aria-labelledby="draw-sheet-title" data-draw-sheet><div class="draw-sheet-heading"><div><h2 id="draw-sheet-title">本節已抽</h2><p>最新結果排在最上面</p></div>${closeButton}</div><div class="draw-sheet-body">${records ? `<ol class="draw-history-records">${records}</ol>` : '<p class="draw-history-empty">尚未抽籤</p>'}</div></section></div>`;
}

function render() {
  if (state.page !== 'draw' || (drawTimerSessionKey && drawTimerSessionKey !== classroomReminderSessionKey(state.session))) stopDrawTimer();
  const page = state.page === 'course'
    ? renderCourse()
    : state.page === 'homework'
      ? renderHomework()
      : state.page === 'assignment-form'
        ? renderAssignmentForm()
        : state.page === 'exam-form'
          ? renderExamForm()
          : state.page === 'exam-attendance'
            ? renderExamAttendance()
            : state.page === 'assignment-hub'
              ? renderAssignmentHub()
            : state.page === 'exam-hub'
              ? renderExamHub()
            : state.page === 'settings'
              ? renderSettings()
            : state.page === 'data-sync'
              ? renderDataSync()
            : state.page === 'academic-period-settings'
              ? renderAcademicPeriodSettings()
            : state.page === 'teaching-classes'
              ? renderTeachingClasses()
            : state.page === 'teaching-class-form'
              ? renderTeachingClassForm()
            : state.page === 'schedule-management'
              ? renderScheduleManagement()
            : state.page === 'schedule-version-form'
              ? renderScheduleVersionForm()
            : state.page === 'schedule-editor'
              ? renderScheduleEditor()
            : state.page === 'weekly-schedule'
              ? renderWeeklySchedule()
            : state.page === 'reminders'
              ? renderReminders()
              : state.page === 'draw'
                ? renderDraw()
            : renderToday();
  const hasBottomNavigation = shouldShowBottomNavigation(state.page, Boolean(state.modal));
  const bottomNavigation = hasBottomNavigation ? renderBottomNavigation() : '';
  const modal = renderModal();
  const toast = state.toast ? `<div class="toast" role="status" aria-live="polite" data-toast-token="${toastGeneration}">${escapeHtml(state.toast)}</div>` : '';
  const shellClass = ['app-shell', hasBottomNavigation ? 'has-bottom-navigation' : '', isIntegrationTestData ? 'test-data-profile' : ''].filter(Boolean).join(' ');
  const profileBanner = isIntegrationTestData ? '<div class="test-data-banner" role="status">測試資料｜與正式資料分開儲存</div>' : '';
  const storageWarning = homeworkStorageNeedsAttention ? '<div class="storage-warning-banner" role="alert">偵測到無法讀取的本機教學資料；系統沒有覆寫原內容，也不會儲存新的課堂紀錄。請先備份資料，再進行修復。</div>' : '';
  app.innerHTML = `<div class="${shellClass}">${profileBanner}${storageWarning}${page}${bottomNavigation}${modal}${toast}</div>`;
  mountDrawTimerWheels();
  positionTodaySchedule();
}

function renderExamHubTransition() {
  render();
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    app.querySelector('#main')?.focus({ preventScroll: true });
  });
}

function renderAssignmentHubTransition() {
  render();
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    app.querySelector('#main')?.focus({ preventScroll: true });
  });
}

function returnToTodaySchedule(forceToday = false) {
  state.now = new Date();
  state.selectedDateKey = selectedDateAfterEvent(state.selectedDateKey, state.now, forceToday ? 'go-today' : 'back-schedule');
  state.session = null;
  state.activeAssignment = null;
  state.assignmentForm = null;
  state.assignmentHub = { groupKey: null, assignmentId: null, courseKey: null };
  state.assignmentHubReturnPage = 'today';
  state.assignmentHubCancelTarget = null;
  state.submissionCompleteTarget = null;
  state.cancelTarget = null;
  state.activeExam = null;
  state.examForm = null;
  state.examHub = { groupKey: null, examId: null, courseKey: null };
  state.examHubReturnPage = 'today';
  state.examCancelTarget = null;
  state.makeupCompleteTarget = null;
  state.draftSeatStates = {};
  state.draftExamSeatStates = {};
  state.modal = null;
  modalReturnSlotId = null;
  clearReminderInteraction();
  clearDrawInteraction();
  state.selectedSlotId = null;
  state.accordion = null;
  state.page = 'today';
  clearTimedToast();
  lastTodayEmphasisId = null;
  todayScrollRequested = true;
  renderAssignmentHubTransition();
}

function openCourseModal(slotId) {
  const entryDate = selectedDate();
  const slots = scheduleSlots(entryDate);
  const row = getScheduleViewForDate(slots, entryDate, state.now).rows.find((slot) => slot.id === slotId);
  if (!canOpenScheduleRow(row)) return;
  state.selectedSlotId = slotId;
  modalReturnSlotId = slotId;
  state.modal = {
    mode: row.course ? 'confirm' : 'empty',
    teachingClassId: row.course?.teachingClassId || null,
    entryDate: new Date(entryDate),
    entryState: row.state
  };
  render();
  window.requestAnimationFrame(() => app.querySelector(row.course ? '[data-action="enter-course"]' : '[data-action="show-adjust"]')?.focus({ preventScroll: true }));
}

function closeModalAndRestoreFocus() {
  const modalSnapshot = state.modal;
  const modalMode = modalSnapshot?.mode;
  const slotId = modalReturnSlotId;
  state.modal = null;
  render();
  window.requestAnimationFrame(() => {
    if (modalMode === 'calendar') app.querySelector('[data-action="open-calendar"]')?.focus();
    else if (modalMode === 'assignment-class-time') app.querySelector('[data-action="open-assignment-class-time"]')?.focus({ preventScroll: true });
    else if (modalMode === 'exam-class-time') app.querySelector('[data-action="open-exam-class-time"]')?.focus({ preventScroll: true });
    else if (modalMode === 'managed-schedule-cell') app.querySelector(`[data-action="open-managed-schedule-cell"][data-weekday-id="${CSS.escape(modalSnapshot.weekdayId)}"][data-period-id="${CSS.escape(modalSnapshot.periodId)}"]`)?.focus({ preventScroll: true });
    else if (modalMode === 'managed-schedule-times') app.querySelector('[data-action="open-managed-schedule-times"]')?.focus({ preventScroll: true });
    else if (modalMode === 'managed-schedule-discard') app.querySelector('[data-action="back-schedule-editor"]')?.focus({ preventScroll: true });
    else (app.querySelector(`[data-slot="${slotId}"]`) || app.querySelector('#main'))?.focus();
  });
}

function saveHomework(seatStates) {
  const savedAt = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  const context = state.activeAssignment;
  const session = context?.session || state.session;
  if (!session || !context) return;
  const validSeatStates = sanitizeSeatStatesForSession(seatStates, session);
  homeworkRecords = saveAssignmentCheck(homeworkRecords, {
    assignmentId: context.assignmentId,
    courseKey: context.courseKey,
    session,
    seatStates: validSeatStates,
    activeSeats: activeRosterSeats(session),
    savedAt
  }).records;
  persistHomework();
  state.draftSeatStates = { ...validSeatStates };
  state.page = context.returnPage === 'assignment-hub' ? 'assignment-hub' : 'course';
  if (state.page === 'course') state.accordion = 'assignment';
  state.leaveMode = false;
  state.activeAssignment = null;
  showTimedToast(summarizeSeatStates(validSeatStates).complete ? '已儲存：全員完成' : '作業檢查已儲存');
}

function saveExamAttendance(seatStates) {
  const context = state.activeExam;
  const session = context?.session || state.session;
  if (!session || !context) return;
  const roster = rosterForSession(session);
  const validSeatStates = sanitizeSeatStatesForSession(seatStates, session);
  const savedAt = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  const result = saveExamCheck(homeworkRecords, {
    examId: context.examId,
    courseKey: context.courseKey,
    session,
    seatStates: validSeatStates,
    disabledSeats: roster.vacantSeats,
    activeSeats: roster.activeSeats,
    savedAt
  });
  homeworkRecords = result.records;
  persistHomework();
  state.draftExamSeatStates = { ...validSeatStates };
  state.page = context.returnPage === 'exam-hub' ? 'exam-hub' : 'course';
  if (state.page === 'course') state.accordion = 'exam';
  state.activeExam = null;
  showTimedToast(result.summary.complete ? '已儲存：全員到考' : `已儲存：${result.summary.absent} 人缺考`);
}

function clearReminderInteraction() {
  window.clearTimeout(reminderFlashTimer);
  reminderFlashTimer = null;
  reminderSheetScrollTop = 0;
  state.reminderCategory = null;
  state.reminderFlashSeat = null;
  state.reminderAnnouncement = '';
  state.reminderSheetOpen = false;
}

function clearDrawInteraction(sessionKey = '', session = state.session) {
  stopDrawTimer();
  const activeSeats = activeRosterSeats(session);
  state.drawUseWeighting = true;
  state.drawAllowRepeat = false;
  state.drawSessionKey = sessionKey;
  state.drawCurrentSeat = null;
  state.drawExcludedSeats = [];
  state.drawHistory = [];
  state.drawSeatsThisRound = [];
  state.drawSheet = null;
  state.drawManualSeat = activeSeats[0] || null;
  state.drawAnnouncement = '';
  drawSheetReturnAction = null;
}

function drawInteractionSnapshot() {
  return {
    useWeighting: state.drawUseWeighting,
    allowRepeat: state.drawAllowRepeat,
    currentSeat: state.drawCurrentSeat,
    excludedSeats: [...state.drawExcludedSeats],
    history: state.drawHistory.map((record) => ({ ...record })),
    seatsThisRound: [...state.drawSeatsThisRound],
    updatedAt: new Date().toISOString()
  };
}

function persistDrawInteraction() {
  const sessionKey = classroomReminderSessionKey(state.session);
  if (!sessionKey) return;
  state.drawSessionKey = sessionKey;
  homeworkRecords = {
    ...homeworkRecords,
    drawSessions: {
      ...(homeworkRecords.drawSessions || {}),
      [sessionKey]: drawInteractionSnapshot()
    }
  };
  persistHomework();
}

function loadDrawInteraction(session = state.session) {
  const sessionKey = classroomReminderSessionKey(session);
  if (!sessionKey) { clearDrawInteraction(); return; }
  const saved = homeworkRecords.drawSessions?.[sessionKey];
  clearDrawInteraction(sessionKey, session);
  if (!saved) return;
  const active = new Set(activeRosterSeats(session));
  const seatList = (value) => Array.isArray(value) ? value.map(Number).filter((seat) => active.has(seat)) : [];
  const history = Array.isArray(saved.history)
    ? saved.history.filter((record) => active.has(Number(record?.seat))).map((record) => ({
      id: String(record.id || `draw-restored-${record.seat}-${record.time || ''}`),
      seat: Number(record.seat),
      time: String(record.time || ''),
      absent: Boolean(record.absent)
    }))
    : [];
  state.drawUseWeighting = saved.useWeighting !== false;
  state.drawAllowRepeat = Boolean(saved.allowRepeat);
  state.drawCurrentSeat = active.has(Number(saved.currentSeat)) ? Number(saved.currentSeat) : null;
  state.drawExcludedSeats = [...new Set(seatList(saved.excludedSeats))].sort((left, right) => left - right);
  state.drawHistory = history;
  state.drawSeatsThisRound = seatList(saved.seatsThisRound);
  if (!active.has(state.drawManualSeat)) state.drawManualSeat = [...active][0] || null;
}

function updateDrawCourseRecord(patch) {
  const courseKey = sessionCourseKey();
  const previous = homeworkRecords.courses?.[courseKey] || {};
  homeworkRecords = {
    ...homeworkRecords,
    courses: {
      ...(homeworkRecords.courses || {}),
      [courseKey]: { ...previous, ...patch }
    }
  };
  persistHomework();
}

function openDrawSheet(sheet, returnAction) {
  if (state.page !== 'draw') return;
  if (sheet === 'pool') normalizeStoredManualDrawWeights();
  state.drawSheet = sheet;
  drawSheetReturnAction = returnAction;
  drawSheetEntering = true;
  render();
  drawSheetEntering = false;
  window.requestAnimationFrame(() => app.querySelector('[data-draw-sheet] [data-action="close-draw-sheet"]')?.focus());
}

function rerenderDrawSheet({ focusSelector, fallbackSelector } = {}) {
  const scrollTop = app.querySelector('.draw-sheet-body')?.scrollTop || 0;
  render();
  window.requestAnimationFrame(() => {
    const body = app.querySelector('.draw-sheet-body');
    if (body) body.scrollTop = Math.min(scrollTop, Math.max(0, body.scrollHeight - body.clientHeight));
    const preferred = focusSelector ? app.querySelector(focusSelector) : null;
    const fallback = fallbackSelector ? app.querySelector(fallbackSelector) : null;
    const focusTarget = preferred && !preferred.disabled ? preferred : fallback;
    focusTarget?.focus({ preventScroll: true });
  });
}

function closeDrawSheet() {
  if (!state.drawSheet) return;
  const returnAction = drawSheetReturnAction;
  const sheet = state.drawSheet;
  state.drawSheet = null;
  drawSheetReturnAction = null;
  render();
  window.requestAnimationFrame(() => {
    const selector = returnAction === 'history'
      ? '[data-action="open-draw-sheet"][data-sheet="history"]'
      : `[data-action="open-draw-sheet"][data-sheet="${sheet}"]`;
    app.querySelector(selector)?.focus({ preventScroll: true });
  });
}

function drawOne(announcementPrefix = '') {
  stopDrawTimer();
  const pool = currentDrawPool();
  const seat = pickWeightedDrawSeat(pool);
  if (seat == null) {
    state.drawCurrentSeat = null;
    state.drawAnnouncement = '目前沒有可抽取的同學。';
    render();
    return;
  }
  const now = new Date();
  const record = {
    id: globalThis.crypto?.randomUUID?.() || `draw-${Date.now()}-${seat}-${state.drawHistory.length}`,
    seat,
    time: now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }),
    absent: false
  };
  state.drawCurrentSeat = seat;
  state.drawSeatsThisRound = [...state.drawSeatsThisRound, seat];
  state.drawHistory = [record, ...state.drawHistory];
  state.drawAnnouncement = `${announcementPrefix ? `${announcementPrefix}，` : ''}抽中 ${seat} 號。`;
  persistDrawInteraction();
  render();
  if (navigator.vibrate) navigator.vibrate(16);
  window.requestAnimationFrame(() => app.querySelector('[data-action="draw-one"], [data-action="restart-draw-round"]')?.focus({ preventScroll: true }));
}

function absentAndRedraw() {
  stopDrawTimer();
  const absentSeat = state.drawCurrentSeat;
  if (absentSeat == null) return;
  state.drawHistory = state.drawHistory.map((record, index) => index === 0 ? { ...record, absent: true } : record);
  state.drawExcludedSeats = [...new Set([...state.drawExcludedSeats, absentSeat])].sort((left, right) => left - right);
  state.drawCurrentSeat = null;
  const pool = currentDrawPool();
  if (!pool.length) {
    state.drawAnnouncement = `${absentSeat} 號不在場，已暫不抽取；目前沒有其他人可抽。`;
    persistDrawInteraction();
    render();
    return;
  }
  drawOne(`${absentSeat} 號不在場，已暫不抽取`);
}

function openReminderSheet() {
  if (state.page !== 'reminders') return;
  reminderPageScrollY = window.scrollY;
  reminderSheetScrollTop = 0;
  state.reminderSheetOpen = true;
  render();
  window.requestAnimationFrame(() => app.querySelector('.reminder-sheet [data-action="close-reminder-sheet"]')?.focus());
}

function closeReminderSheet() {
  if (!state.reminderSheetOpen) return;
  state.reminderSheetOpen = false;
  reminderSheetScrollTop = 0;
  render();
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: reminderPageScrollY, behavior: 'auto' });
    app.querySelector('[data-action="open-reminder-sheet"]')?.focus({ preventScroll: true });
  });
}

function recordClassroomReminder(seat) {
  if (!state.session || !state.reminderCategory) return;
  const activeSeats = activeRosterSeats(state.session);
  if (!activeSeats.includes(Number(seat))) return;
  const now = new Date();
  const nextRecords = addClassroomReminder(homeworkRecords, {
    reminderId: globalThis.crypto?.randomUUID?.() || `reminder-${Date.now()}-${seat}-${Object.keys(homeworkRecords.reminders || {}).length}`,
    session: state.session,
    seat,
    category: state.reminderCategory,
    recordedTime: now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }),
    createdAt: now.toISOString(),
    activeSeats
  });
  if (nextRecords === homeworkRecords) return;
  homeworkRecords = nextRecords;
  persistHomework();
  state.reminderFlashSeat = seat;
  const sessionReminderCount = classroomRemindersForSession(homeworkRecords.reminders, state.session).length;
  state.reminderAnnouncement = `已登記 ${seat} 號，${state.reminderCategory}。本堂共 ${sessionReminderCount} 次。`;
  render();
  if (navigator.vibrate) navigator.vibrate(18);
  window.requestAnimationFrame(() => app.querySelector(`[data-action="reminder-seat"][data-seat="${seat}"]`)?.focus({ preventScroll: true }));
  window.clearTimeout(reminderFlashTimer);
  reminderFlashTimer = window.setTimeout(() => {
    state.reminderFlashSeat = null;
    reminderFlashTimer = null;
    app.querySelector(`[data-action="reminder-seat"][data-seat="${seat}"]`)?.classList.remove('just-recorded');
    app.querySelector('.reminder-dock-inner')?.classList.remove('just-recorded');
  }, 420);
}

app.addEventListener('click', (event) => {
  if (pendingNativeDateControl && event.target !== pendingNativeDateControl) {
    if (finalizePendingNativeDateControl(event.target.closest('[data-action]'))) return;
  }
  if (suppressDateTriggeredClick) {
    event.preventDefault();
    suppressDateTriggeredClick = false;
    return;
  }
  const target = event.target.closest('[data-action]');
  if (!target) return;
  if (target.hasAttribute('data-modal-card')) return;
  const action = target.dataset.action;
  if (action.startsWith('timer-')) { handleDrawTimerAction(action, target); return; }

  if (action === 'toggle-record-grade') {
    const { kind, gradeKey } = target.dataset;
    if (!['assignment', 'exam'].includes(kind)) return;
    const collapsed = state.recordHubCollapsedGrades[kind];
    state.recordHubCollapsedGrades[kind] = collapsed.includes(gradeKey) ? collapsed.filter((key) => key !== gradeKey) : [...collapsed, gradeKey];
    render();
    window.requestAnimationFrame(() => app.querySelector(`[data-action="toggle-record-grade"][data-kind="${kind}"][data-grade-key="${CSS.escape(gradeKey)}"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'open-record-class') {
    const { kind, classKey } = target.dataset;
    if (!['assignment', 'exam'].includes(kind)) return;
    state[`${kind}Hub`] = { classKey, groupKey: null, [`${kind}Id`]: null, courseKey: null };
    renderAssignmentHubTransition();
  }
  if (action === 'open-class-record') {
    const { kind, recordId, groupKey, courseKey } = target.dataset;
    if (!['assignment', 'exam'].includes(kind)) return;
    const { selectedClass } = commonRecordHubContext(kind);
    if (!selectedClass?.records.some((record) => record.recordId === recordId && record.courseKey === courseKey && record.groupKey === groupKey)) return;
    state[`${kind}Hub`] = { classKey: selectedClass.classKey, groupKey, [`${kind}Id`]: recordId, courseKey };
    state.submissionCompleteTarget = null;
    state.makeupCompleteTarget = null;
    renderAssignmentHubTransition();
  }
  if (action === 'open-record-shared-overview') {
    const { kind } = target.dataset;
    if (!['assignment', 'exam'].includes(kind)) return;
    const hub = state[`${kind}Hub`];
    state[`${kind}Hub`] = { ...hub, sharedOverview: true, sharedReturnCourseKey: hub.courseKey, courseKey: null };
    renderAssignmentHubTransition();
  }
  if (action === 'choose-record-create-group') {
    const { kind, groupKey } = target.dataset;
    if (state.modal?.mode !== 'common-record-create' || state.modal.kind !== kind) return;
    openCommonRecordForm(kind, groupKey);
  }

  if (action === 'install-app') requestAppInstall();
  if (action === 'open-course') openCourseModal(target.dataset.slot);
  if (action === 'open-calendar') {
    const date = selectedDate();
    state.modal = { mode: 'calendar', year: date.getFullYear(), month: date.getMonth() };
    render();
    window.requestAnimationFrame(() => (app.querySelector('.calendar-day.selected') || app.querySelector('.calendar-day.today') || app.querySelector('.calendar-day'))?.focus());
  }
  if (action === 'previous-month' || action === 'next-month') {
    const month = new Date(state.modal.year, state.modal.month + (action === 'next-month' ? 1 : -1), 1, 12);
    state.modal = { ...state.modal, year: month.getFullYear(), month: month.getMonth() };
    render();
    window.requestAnimationFrame(() => app.querySelector(action === 'next-month' ? '[data-action="next-month"]' : '[data-action="previous-month"]')?.focus());
  }
  if (action === 'select-calendar-date') {
    state.selectedDateKey = selectedDateAfterEvent(state.selectedDateKey, state.now, 'select-date', target.dataset.date);
    state.modal = null;
    state.selectedSlotId = null;
    modalReturnSlotId = null;
    lastTodayEmphasisId = null;
    todayScrollRequested = true;
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="open-calendar"]')?.focus());
  }
  if (action === 'go-today') {
    state.selectedDateKey = selectedDateAfterEvent(state.selectedDateKey, state.now, 'go-today');
    lastTodayEmphasisId = null;
    todayScrollRequested = true;
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="open-calendar"]')?.focus());
  }
  if (action === 'close-modal' && (event.target === target || target.closest('button'))) closeModalAndRestoreFocus();
  if (action === 'cancel-import-backup' && (event.target === target || target.closest('button'))) {
    state.pendingBackupImport = null;
    state.modal = null;
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="choose-import-backup"]')?.focus({ preventScroll: true }));
  }
  if (action === 'confirm-import-backup') confirmBackupImport();
  if (action === 'request-clear-profile') {
    state.modal = { mode: 'clear-profile-confirm' };
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="confirm-clear-profile"]')?.focus());
  }
  if (action === 'confirm-clear-profile') confirmClearProfile();
  if (action === 'request-restore-test-data' && isIntegrationTestData) {
    state.modal = { mode: 'restore-test-data-confirm' };
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="confirm-restore-test-data"]')?.focus());
  }
  if (action === 'confirm-restore-test-data') confirmRestoreTestData();
  if (action === 'export-backup') exportCurrentProfileBackup();
  if (action === 'choose-import-backup') app.querySelector('[data-action="import-backup-file"]')?.click();
  if (action === 'show-adjust') {
    const slot = selectedSlot();
    const classes = teachingClassesThisYear();
    const currentId = slot.course?.teachingClassId;
    const teachingClassId = classes.some((record) => record.id === currentId) ? currentId : classes[0]?.id || null;
    state.modal = { ...state.modal, mode: 'adjust', teachingClassId };
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="adjust-teaching-class"]')?.focus({ preventScroll: true }));
  }
  if (action === 'cancel-adjust') {
    const slot = selectedSlot();
    state.modal = { ...state.modal, mode: slot.course ? 'confirm' : 'empty', teachingClassId: slot.course?.teachingClassId || null };
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="show-adjust"]')?.focus({ preventScroll: true }));
  }
  if (action === 'save-adjustment') {
    const slot = selectedSlot();
    const record = teachingClassesThisYear().find((item) => item.id === state.modal.teachingClassId);
    const course = courseFromTeachingClass(record);
    if (!course) return;
    const entryDate = state.modal.entryDate;
    const key = scheduleOverrideKey(entryDate, slot.id);
    scheduleOverrides = setScheduleOverride(scheduleOverrides, key, course);
    persistScheduleOverrides();
    state.modal = { ...state.modal, mode: 'confirm', teachingClassId: course.teachingClassId };
    showTimedToast('已儲存這一天這一節調課');
    window.requestAnimationFrame(() => app.querySelector('[data-action="enter-course"]')?.focus({ preventScroll: true }));
  }
  if (action === 'request-restore-schedule') {
    state.modal = { ...state.modal, mode: 'restore-confirm' };
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="confirm-restore-schedule"]')?.focus({ preventScroll: true }));
  }
  if (action === 'keep-adjustment') {
    const slot = selectedSlot();
    state.modal = { ...state.modal, mode: 'confirm', teachingClassId: slot.course?.teachingClassId || null };
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="request-restore-schedule"]')?.focus({ preventScroll: true }));
  }
  if (action === 'confirm-restore-schedule') {
    const entryDate = state.modal.entryDate;
    const slot = selectedSlot(entryDate);
    const key = scheduleOverrideKey(entryDate, slot.id);
    scheduleOverrides = removeScheduleOverride(scheduleOverrides, key);
    persistScheduleOverrides();
    const restoredSlot = scheduleSlots(entryDate).find((item) => item.id === slot.id) || null;
    if (restoredSlot?.course) state.modal = { ...state.modal, mode: 'confirm', teachingClassId: restoredSlot.course.teachingClassId || null };
    else {
      state.modal = { ...state.modal, mode: 'empty', teachingClassId: null };
    }
    showTimedToast(`已恢復第 ${slot.period} 節原課表`);
    window.requestAnimationFrame(() => {
      app.querySelector(restoredSlot?.course ? '[data-action="enter-course"]' : '[data-action="show-adjust"]')?.focus({ preventScroll: true });
    });
  }
  if (action === 'enter-course') {
    const entryDate = state.modal?.entryDate || selectedDate();
    const slot = selectedSlot(entryDate);
    const session = createSessionSnapshot(entryDate, slot);
    state.now = new Date();
    if (!session) {
      state.modal = null;
      state.page = 'today';
      todayScrollRequested = true;
      render();
      return;
    }
    state.session = session;
    clearReminderInteraction();
    loadDrawInteraction(session);
    state.modal = null;
    modalReturnSlotId = null;
    state.page = 'course';
    state.accordion = null;
    render();
  }
  if (action === 'back-today') returnToTodaySchedule();
  if (action === 'open-today-tab') returnToTodaySchedule(true);
  if (action === 'open-weekly-schedule') {
    state.page = 'weekly-schedule';
    clearTimedToast();
    renderAssignmentHubTransition();
  }
  if (action === 'back-weekly-schedule') {
    state.page = 'today';
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="open-weekly-schedule"]')?.focus({ preventScroll: true }));
  }
  if (action === 'toggle-accordion') { state.accordion = state.accordion === target.dataset.panel ? null : target.dataset.panel; render(); }
  if (action === 'open-reminders') {
    clearReminderInteraction();
    state.page = 'reminders';
    render();
  }
  if (action === 'back-reminders') {
    clearReminderInteraction();
    state.page = 'course';
    render();
  }
  if (action === 'open-draw') {
    const sessionKey = classroomReminderSessionKey(state.session);
    if (state.drawSessionKey !== sessionKey) loadDrawInteraction(state.session);
    state.page = 'draw';
    state.drawSheet = null;
    render();
  }
  if (action === 'back-draw') {
    state.drawSheet = null;
    drawSheetReturnAction = null;
    state.page = 'course';
    render();
  }
  if (action === 'open-draw-sheet') openDrawSheet(target.dataset.sheet, target.dataset.sheet === 'history' ? 'history' : target.dataset.sheet);
  if (action === 'close-draw-sheet' && (target.matches('button') || event.target === target)) closeDrawSheet();
  if (action === 'toggle-draw-weighting') {
    state.drawUseWeighting = !state.drawUseWeighting;
    state.drawAnnouncement = state.drawUseWeighting ? '本節已開啟額外加權，仍套用本週次數調整。' : '本節已關閉額外加權，仍依本週抽中次數降低權重。';
    persistDrawInteraction();
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="toggle-draw-weighting"]')?.focus({ preventScroll: true }));
  }
  if (action === 'toggle-draw-repeat') {
    state.drawAllowRepeat = !state.drawAllowRepeat;
    state.drawAnnouncement = state.drawAllowRepeat ? '已開啟同一人可再抽中。' : '已關閉重複抽中。';
    persistDrawInteraction();
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="toggle-draw-repeat"]')?.focus({ preventScroll: true }));
  }
  if (action === 'draw-one') drawOne();
  if (action === 'restart-draw-round') {
    state.drawCurrentSeat = null;
    state.drawSeatsThisRound = [];
    drawOne('已開始新一輪');
  }
  if (action === 'absent-redraw') absentAndRedraw();
  if (action === 'toggle-draw-exclusion') {
    const seat = Number(target.dataset.seat);
    if (activeRosterSeats(state.session).includes(seat)) {
      const wasExcluded = state.drawExcludedSeats.includes(seat);
      state.drawExcludedSeats = wasExcluded
        ? state.drawExcludedSeats.filter((item) => item !== seat)
        : [...state.drawExcludedSeats, seat].sort((left, right) => left - right);
      state.drawAnnouncement = !wasExcluded
        ? `${seat} 號已設為暫不抽取。`
        : !state.drawAllowRepeat && state.drawSeatsThisRound.includes(seat)
          ? `${seat} 號已取消暫不抽取；本輪已抽過，下一輪恢復。`
          : `${seat} 號已恢復抽取。`;
      persistDrawInteraction();
      rerenderDrawSheet({ focusSelector: `[data-action="toggle-draw-exclusion"][data-seat="${seat}"]` });
    }
  }
  if (action === 'adjust-draw-manual') {
    if (!activeRosterSeats(state.session).includes(state.drawManualSeat)) return;
    const sources = drawWeightSources();
    const monthKey = drawMonthKey();
    const previousResolution = manualDrawResolutionForSeat(state.drawManualSeat, sources);
    const previous = previousResolution.requested;
    const next = Math.max(0, Math.min(previousResolution.maxRequested, previous + Number(target.dataset.delta || 0)));
    if (next !== previous) {
      const monthWeights = { ...sources.manualWeights };
      if (next) monthWeights[state.drawManualSeat] = next;
      else delete monthWeights[state.drawManualSeat];
      updateDrawCourseRecord({
        manualDrawWeightsByMonth: {
          ...(drawCourseRecord().manualDrawWeightsByMonth || {}),
          [monthKey]: monthWeights
        }
      });
      const nextResolution = resolveManualDrawWeight({
        homework: sources.homeworkWeights[state.drawManualSeat],
        reminder: sources.reminderWeights[state.drawManualSeat],
        manual: next,
        cap: sources.cap
      });
      state.drawAnnouncement = state.drawUseWeighting
        ? `${state.drawManualSeat} 號手動月加權設定為加 ${next}，目前實際套用加 ${nextResolution.applied}。`
        : `${state.drawManualSeat} 號手動月加權原設定為加 ${next}；本節未套用。`;
      const delta = Number(target.dataset.delta || 0);
      rerenderDrawSheet({
        focusSelector: `[data-action="adjust-draw-manual"][data-delta="${delta}"]`,
        fallbackSelector: `[data-action="adjust-draw-manual"][data-delta="${delta > 0 ? -1 : 1}"]`
      });
    }
  }
  if (action === 'open-reminder-sheet') openReminderSheet();
  if (action === 'close-reminder-sheet' && (target.matches('button') || event.target === target)) closeReminderSheet();
  if (action === 'select-reminder-category') {
    state.reminderCategory = target.dataset.category;
    state.reminderAnnouncement = '';
    render();
    window.requestAnimationFrame(() => app.querySelector(`[data-action="select-reminder-category"][data-category="${CSS.escape(state.reminderCategory)}"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'reminder-seat') recordClassroomReminder(Number(target.dataset.seat));
  if (action === 'undo-reminder') {
    const sheetWasOpen = state.reminderSheetOpen;
    const sheetBody = app.querySelector('[data-reminder-sheet-body]');
    if (sheetBody) reminderSheetScrollTop = sheetBody.scrollTop;
    const sheetUndoButtons = sheetWasOpen ? [...app.querySelectorAll('.reminder-sheet [data-action="undo-reminder"]')] : [];
    const sheetUndoIndex = sheetUndoButtons.indexOf(target);
    const reminder = homeworkRecords.reminders?.[target.dataset.reminderId];
    homeworkRecords = undoClassroomReminder(homeworkRecords, { reminderId: target.dataset.reminderId, reversedAt: new Date().toISOString() });
    persistHomework();
    const remainingCount = classroomRemindersForSession(homeworkRecords.reminders, state.session).length;
    state.reminderAnnouncement = reminder ? `已復原 ${reminder.seat} 號，${reminder.category}。本堂剩下 ${remainingCount} 次。` : '';
    render();
    window.requestAnimationFrame(() => {
      if (sheetWasOpen) {
        const nextBody = app.querySelector('[data-reminder-sheet-body]');
        if (nextBody) nextBody.scrollTop = reminderSheetScrollTop;
        const nextButtons = [...app.querySelectorAll('.reminder-sheet [data-action="undo-reminder"]')];
        (nextButtons[Math.min(Math.max(sheetUndoIndex, 0), nextButtons.length - 1)] || app.querySelector('.reminder-sheet [data-action="close-reminder-sheet"]') || app.querySelector('#reminder-sheet-title'))?.focus({ preventScroll: true });
      } else {
        app.querySelector('[data-action="open-reminder-sheet"]')?.focus({ preventScroll: true });
      }
    });
  }
  if (action === 'open-data-sync') {
    state.dataSyncNotice = null;
    state.pendingBackupImport = null;
    state.modal = null;
    state.page = 'data-sync';
    clearTimedToast();
    renderAssignmentHubTransition();
  }
  if (action === 'back-settings-from-data-sync') {
    state.dataSyncNotice = null;
    state.pendingBackupImport = null;
    state.modal = null;
    state.page = 'settings';
    clearTimedToast();
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="open-data-sync"]')?.focus({ preventScroll: true }));
  }
  if (action === 'open-schedule-management') {
    const activeVersion = activeScheduleVersion();
    state.scheduleExpandedPeriods = activeVersion ? [activeVersion.periodId] : [];
    state.scheduleVersionForm = null;
    state.scheduleVersionValidation = null;
    state.scheduleEditor = null;
    state.scheduleEditorValidation = null;
    state.scheduleReturnVersionId = null;
    state.page = 'schedule-management';
    clearTimedToast();
    renderAssignmentHubTransition();
  }
  if (action === 'back-settings-from-schedules') {
    state.scheduleVersionForm = null;
    state.scheduleVersionValidation = null;
    state.scheduleEditor = null;
    state.scheduleEditorValidation = null;
    state.scheduleReturnVersionId = null;
    state.page = 'settings';
    clearTimedToast();
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="open-schedule-management"]')?.focus({ preventScroll: true }));
  }
  if (action === 'toggle-managed-schedule-period') {
    const periodId = target.dataset.periodId;
    const expanded = state.scheduleExpandedPeriods.includes(periodId);
    state.scheduleExpandedPeriods = expanded
      ? state.scheduleExpandedPeriods.filter((id) => id !== periodId)
      : [...state.scheduleExpandedPeriods, periodId];
    render();
    window.requestAnimationFrame(() => app.querySelector(`[data-action="toggle-managed-schedule-period"][data-period-id="${CSS.escape(periodId)}"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'new-managed-schedule') {
    if (!hasSavedAcademicPeriodSettings || !teachingClassesThisYear().length) return;
    state.scheduleVersionForm = newScheduleVersionForm(target.dataset.periodId || '');
    state.scheduleVersionValidation = null;
    state.scheduleReturnVersionId = null;
    state.page = 'schedule-version-form';
    clearTimedToast();
    renderAssignmentHubTransition();
  }
  if (action === 'back-schedule-management') {
    const periodId = state.scheduleVersionForm?.periodId;
    state.scheduleVersionForm = null;
    state.scheduleVersionValidation = null;
    state.page = 'schedule-management';
    clearTimedToast();
    render();
    window.requestAnimationFrame(() => {
      const selector = periodId
        ? `[data-action="new-managed-schedule"][data-period-id="${CSS.escape(periodId)}"]`
        : '[data-action="new-managed-schedule"]';
      (app.querySelector(selector) || app.querySelector('#main'))?.focus({ preventScroll: true });
    });
  }
  if (action === 'select-managed-schedule-source' && state.scheduleVersionForm) {
    if (target.disabled) return;
    state.scheduleVersionForm = { ...state.scheduleVersionForm, sourceMode: target.dataset.sourceMode };
    state.scheduleVersionValidation = null;
    render();
    window.requestAnimationFrame(() => app.querySelector(`[data-action="select-managed-schedule-source"][data-source-mode="${CSS.escape(target.dataset.sourceMode)}"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'continue-managed-schedule' && state.scheduleVersionForm) {
    const form = state.scheduleVersionForm;
    const validation = validateManagedScheduleVersionDraft(form, scheduleVersionsThisYear(), academicPeriodSettings);
    if (!validation.valid) {
      state.scheduleVersionValidation = validation;
      render();
      window.requestAnimationFrame(() => {
        const field = validation.errors[0]?.field;
        (app.querySelector(field === 'periodId' ? '[data-action="managed-schedule-form-period"]' : '[data-action="managed-schedule-form-date"]') || app.querySelector('#schedule-version-errors'))?.focus();
      });
      return;
    }
    const source = form.sourceMode === 'copy' ? scheduleVersionsBefore(form.periodId, form.startDate)[0] : null;
    const sourceContent = source ? scheduleVersionClone(source) : {
      times: scheduleTimesThisYear(),
      slots: createEmptyManagedScheduleSlots()
    };
    const version = {
      id: scheduleVersionId(),
      periodId: form.periodId,
      startDate: form.startDate,
      title: nextManagedScheduleVersionTitle(scheduleVersionsThisYear(), form.periodId),
      times: sourceContent.times.map((period) => ({ ...period })),
      slots: Object.fromEntries(MANAGED_SCHEDULE_WEEKDAYS.map((weekday) => [weekday.id, { ...sourceContent.slots[weekday.id] }])),
      createdAt: new Date().toISOString()
    };
    state.scheduleVersionForm = null;
    state.scheduleVersionValidation = null;
    startScheduleEditor(version, true);
    renderAssignmentHubTransition();
  }
  if (action === 'edit-managed-schedule') {
    const version = scheduleVersionsThisYear().find((item) => item.id === target.dataset.versionId);
    if (!version) return;
    startScheduleEditor(version, false);
    clearTimedToast();
    renderAssignmentHubTransition();
  }
  if (action === 'back-schedule-editor') {
    if (scheduleEditorHasChanges()) {
      state.modal = { mode: 'managed-schedule-discard' };
      render();
      window.requestAnimationFrame(() => app.querySelector('.modal-card button[data-action="close-modal"]')?.focus());
      return;
    }
    state.scheduleEditor = null;
    state.scheduleEditorValidation = null;
    state.page = 'schedule-management';
    render();
  }
  if (action === 'confirm-discard-managed-schedule') {
    const returnId = state.scheduleReturnVersionId;
    state.modal = null;
    state.scheduleEditor = null;
    state.scheduleEditorValidation = null;
    state.scheduleReturnVersionId = null;
    state.page = 'schedule-management';
    render();
    window.requestAnimationFrame(() => {
      const selector = returnId
        ? `[data-action="edit-managed-schedule"][data-version-id="${CSS.escape(returnId)}"]`
        : '[data-action="new-managed-schedule"]';
      (app.querySelector(selector) || app.querySelector('#main'))?.focus({ preventScroll: true });
    });
  }
  if (action === 'open-managed-schedule-cell' && state.scheduleEditor) {
    const { weekdayId, periodId } = target.dataset;
    state.modal = {
      mode: 'managed-schedule-cell',
      weekdayId,
      periodId,
      teachingClassId: state.scheduleEditor.version.slots?.[weekdayId]?.[periodId] || ''
    };
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="managed-schedule-cell-select"]')?.focus());
  }
  if (action === 'save-managed-schedule-cell' && state.modal?.mode === 'managed-schedule-cell' && state.scheduleEditor) {
    const modal = state.modal;
    state.scheduleEditor = {
      ...state.scheduleEditor,
      version: updateManagedScheduleCell(state.scheduleEditor.version, modal.weekdayId, modal.periodId, modal.teachingClassId)
    };
    state.scheduleEditorValidation = null;
    state.modal = null;
    render();
    window.requestAnimationFrame(() => app.querySelector(`[data-action="open-managed-schedule-cell"][data-weekday-id="${CSS.escape(modal.weekdayId)}"][data-period-id="${CSS.escape(modal.periodId)}"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'open-managed-schedule-times' && state.page === 'schedule-management' && hasSavedAcademicPeriodSettings) {
    state.modal = {
      mode: 'managed-schedule-times',
      times: scheduleTimesThisYear().map((period) => ({ ...period })),
      validation: null,
      storageError: ''
    };
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="managed-schedule-time-input"]')?.focus());
  }
  if (action === 'save-managed-schedule-times' && state.modal?.mode === 'managed-schedule-times') {
    const validation = validateManagedScheduleTimes(state.modal.times);
    if (!validation.valid) {
      state.modal = { ...state.modal, validation };
      render();
      window.requestAnimationFrame(() => app.querySelector('[data-action="managed-schedule-time-input"][aria-invalid="true"]')?.focus());
      return;
    }
    const nextSettings = updateManagedScheduleTimesForAcademicYear(
      scheduleManagementSettings,
      currentTeachingAcademicYear(),
      validation.times
    );
    if (!persistScheduleManagementSettings(nextSettings)) {
      state.modal = { ...state.modal, validation: null, storageError: '無法儲存到這台裝置，原本節次時間沒有變更。請確認瀏覽器允許網站儲存資料後再試一次。' };
      render();
      window.requestAnimationFrame(() => app.querySelector('.managed-schedule-time-error')?.focus?.());
      return;
    }
    scheduleManagementSettings = nextSettings;
    state.modal = null;
    showTimedToast(`${currentTeachingAcademicYear()}學年度節次時間已儲存`);
    window.requestAnimationFrame(() => app.querySelector('[data-action="open-managed-schedule-times"]')?.focus({ preventScroll: true }));
  }
  if (action === 'save-managed-schedule' && state.scheduleEditor) {
    const version = state.scheduleEditor.version;
    const validation = validateScheduleEditor(version, state.scheduleEditor.isNew);
    if (!validation.valid) {
      state.scheduleEditorValidation = validation;
      render();
      window.requestAnimationFrame(() => app.querySelector('#schedule-editor-errors')?.focus());
      return;
    }
    const nextSettings = upsertManagedScheduleVersionForAcademicYear(
      scheduleManagementSettings,
      currentTeachingAcademicYear(),
      version
    );
    if (!persistScheduleManagementSettings(nextSettings)) {
      state.scheduleEditorValidation = {
        valid: false,
        errors: [{ field: 'storage', code: 'storage', message: '無法儲存到這台裝置，原本課表沒有變更。請確認瀏覽器允許網站儲存資料後再試一次。' }],
        fieldErrors: {}
      };
      render();
      window.requestAnimationFrame(() => app.querySelector('#schedule-editor-errors')?.focus());
      return;
    }
    const wasNew = state.scheduleEditor.isNew;
    scheduleManagementSettings = nextSettings;
    state.scheduleEditor = null;
    state.scheduleEditorValidation = null;
    state.scheduleReturnVersionId = version.id;
    state.scheduleExpandedPeriods = [...new Set([...state.scheduleExpandedPeriods, version.periodId])];
    state.page = 'schedule-management';
    showTimedToast(wasNew ? '課表版本已儲存在這台裝置' : '課表修改已儲存');
    window.requestAnimationFrame(() => app.querySelector(`[data-action="edit-managed-schedule"][data-version-id="${CSS.escape(version.id)}"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'open-academic-period-settings') {
    state.academicPeriodDraft = normalizeAcademicPeriodSettings(academicPeriodSettings);
    state.academicPeriodValidation = null;
    state.academicPeriodLastValidYear = state.academicPeriodDraft.academicYear;
    state.page = 'academic-period-settings';
    clearTimedToast();
    renderAssignmentHubTransition();
  }
  if (action === 'open-teaching-classes') {
    state.teachingClassDraft = null;
    state.teachingClassValidation = null;
    state.teachingClassBatchDraft = null;
    state.teachingClassBatchValidation = null;
    state.teachingClassReturnId = null;
    state.page = 'teaching-classes';
    clearTimedToast();
    renderAssignmentHubTransition();
  }
  if (action === 'back-settings-from-teaching-classes') {
    state.teachingClassDraft = null;
    state.teachingClassValidation = null;
    state.teachingClassBatchDraft = null;
    state.teachingClassBatchValidation = null;
    state.teachingClassReturnId = null;
    state.page = 'settings';
    clearTimedToast();
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="open-teaching-classes"]')?.focus({ preventScroll: true }));
  }
  if (action === 'new-teaching-class') {
    state.teachingClassDraft = null;
    state.teachingClassValidation = null;
    state.teachingClassBatchDraft = newTeachingClassBatchDraft();
    state.teachingClassBatchValidation = null;
    state.teachingClassReturnId = null;
    state.page = 'teaching-class-form';
    clearTimedToast();
    renderAssignmentHubTransition();
  }
  if (action === 'edit-teaching-class') {
    const record = teachingClassesThisYear().find((item) => item.id === target.dataset.classId);
    if (!record) return;
    state.teachingClassDraft = newTeachingClassDraft(record);
    state.teachingClassValidation = null;
    state.teachingClassBatchDraft = null;
    state.teachingClassBatchValidation = null;
    state.teachingClassReturnId = record.id;
    state.page = 'teaching-class-form';
    clearTimedToast();
    renderAssignmentHubTransition();
  }
  if (action === 'back-teaching-classes') {
    const returnId = state.teachingClassReturnId;
    state.teachingClassDraft = null;
    state.teachingClassValidation = null;
    state.teachingClassBatchDraft = null;
    state.teachingClassBatchValidation = null;
    state.teachingClassReturnId = null;
    state.page = 'teaching-classes';
    clearTimedToast();
    render();
    window.requestAnimationFrame(() => {
      const selector = returnId
        ? `[data-action="edit-teaching-class"][data-class-id="${CSS.escape(returnId)}"]`
        : '[data-action="new-teaching-class"]';
      (app.querySelector(selector) || app.querySelector('#main'))?.focus({ preventScroll: true });
    });
  }
  if (action === 'add-teaching-class-row' && state.teachingClassBatchDraft) {
    const rowIndex = state.teachingClassBatchDraft.rows.length;
    state.teachingClassBatchDraft = {
      ...state.teachingClassBatchDraft,
      rows: [...state.teachingClassBatchDraft.rows, newTeachingClassBatchRow()]
    };
    state.teachingClassBatchValidation = null;
    render();
    window.requestAnimationFrame(() => app.querySelector(`[data-teaching-class-row-index="${rowIndex}"][data-teaching-class-field="className"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'remove-teaching-class-row' && state.teachingClassBatchDraft?.rows.length > 1) {
    const rowIndex = Number(target.dataset.teachingClassRowIndex);
    if (!Number.isInteger(rowIndex) || !state.teachingClassBatchDraft.rows[rowIndex]) return;
    state.teachingClassBatchDraft = {
      ...state.teachingClassBatchDraft,
      rows: state.teachingClassBatchDraft.rows.filter((_, index) => index !== rowIndex)
    };
    state.teachingClassBatchValidation = null;
    const focusIndex = Math.min(rowIndex, state.teachingClassBatchDraft.rows.length - 1);
    render();
    window.requestAnimationFrame(() => app.querySelector(`[data-teaching-class-row-index="${focusIndex}"][data-teaching-class-field="className"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'save-teaching-class-batch' && state.teachingClassBatchDraft) {
    const academicYear = currentTeachingAcademicYear();
    const validation = validateTeachingClassBatchDraft(state.teachingClassBatchDraft, teachingClassesThisYear());
    if (!validation.valid) {
      state.teachingClassBatchValidation = validation;
      render();
      window.requestAnimationFrame(() => focusTeachingClassBatchError(validation));
      return;
    }
    const records = validation.records.map((record) => ({ ...record, id: createTeachingClassId() }));
    const nextSettings = upsertTeachingClassesForAcademicYear(teachingClassSettings, academicYear, records);
    if (!persistTeachingClassSettings(nextSettings)) {
      const storageValidation = {
        valid: false,
        errors: [{ field: 'storage', code: 'storage', message: '無法儲存到這台裝置，這批班級都沒有變更。請確認瀏覽器允許網站儲存資料後再試一次。' }],
        sharedFieldErrors: {},
        rowFieldErrors: state.teachingClassBatchDraft.rows.map(() => ({})),
        records: []
      };
      state.teachingClassBatchValidation = storageValidation;
      render();
      window.requestAnimationFrame(() => focusTeachingClassBatchError(storageValidation));
      return;
    }
    teachingClassSettings = nextSettings;
    state.teachingClassDraft = null;
    state.teachingClassValidation = null;
    state.teachingClassBatchDraft = null;
    state.teachingClassBatchValidation = null;
    state.teachingClassReturnId = null;
    state.page = 'teaching-classes';
    const yearWording = hasSavedAcademicPeriodSettings ? `${academicYear}學年度` : `${academicYear}示範學年度`;
    showTimedToast(`${records.length} 個授課班級已新增到${yearWording}`);
    window.requestAnimationFrame(() => app.querySelector(`[data-action="edit-teaching-class"][data-class-id="${CSS.escape(records[0].id)}"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'save-teaching-class' && state.teachingClassDraft) {
    const academicYear = currentTeachingAcademicYear();
    const existing = teachingClassesThisYear();
    const validation = validateTeachingClassDraft(state.teachingClassDraft, existing);
    if (!validation.valid) {
      state.teachingClassValidation = validation;
      render();
      window.requestAnimationFrame(() => focusTeachingClassError(validation));
      return;
    }
    const isEditing = Boolean(state.teachingClassDraft.id);
    const record = { ...validation.record, id: validation.record.id || createTeachingClassId() };
    const nextSettings = upsertTeachingClassForAcademicYear(teachingClassSettings, academicYear, record);
    if (!persistTeachingClassSettings(nextSettings)) {
      const storageValidation = {
        valid: false,
        errors: [{ code: 'storage', message: '無法儲存到這台裝置，原本班級設定沒有變更。請確認瀏覽器允許網站儲存資料後再試一次。' }],
        fieldErrors: {}
      };
      state.teachingClassValidation = storageValidation;
      render();
      window.requestAnimationFrame(() => focusTeachingClassError(storageValidation));
      return;
    }
    teachingClassSettings = nextSettings;
    state.teachingClassDraft = null;
    state.teachingClassValidation = null;
    state.teachingClassBatchDraft = null;
    state.teachingClassBatchValidation = null;
    state.teachingClassReturnId = null;
    state.page = 'teaching-classes';
    const yearWording = hasSavedAcademicPeriodSettings ? `${academicYear}學年度` : `${academicYear}示範學年度`;
    showTimedToast(`${isEditing ? '授課班級已更新' : '授課班級已新增'}到${yearWording}`);
    window.requestAnimationFrame(() => app.querySelector(`[data-action="edit-teaching-class"][data-class-id="${CSS.escape(record.id)}"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'back-settings') {
    state.academicPeriodDraft = null;
    state.academicPeriodValidation = null;
    state.academicPeriodLastValidYear = null;
    state.page = 'settings';
    clearTimedToast();
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="open-academic-period-settings"]')?.focus({ preventScroll: true }));
  }
  if (action === 'toggle-academic-period' && state.academicPeriodDraft) {
    const definition = ACADEMIC_PERIOD_DEFINITIONS.find((item) => item.id === target.dataset.periodId);
    if (!definition?.optional) return;
    state.academicPeriodDraft = {
      ...state.academicPeriodDraft,
      periods: state.academicPeriodDraft.periods.map((period) => period.id === definition.id
        ? { ...period, enabled: !period.enabled }
        : period)
    };
    state.academicPeriodValidation = null;
    render();
    window.requestAnimationFrame(() => app.querySelector(`[data-action="toggle-academic-period"][data-period-id="${definition.id}"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'save-academic-period-settings' && state.academicPeriodDraft) {
    const validation = validateAcademicPeriodSettings(state.academicPeriodDraft);
    if (!validation.valid) {
      state.academicPeriodValidation = validation;
      render();
      window.requestAnimationFrame(() => focusAcademicPeriodError(validation));
      return;
    }
    const nextSettings = normalizeAcademicPeriodSettings(state.academicPeriodDraft);
    if (!persistAcademicPeriodSettings(nextSettings)) {
      const storageValidation = {
        valid: false,
        errors: [{ code: 'storage', message: '無法儲存到這台裝置，原本設定沒有變更。請確認瀏覽器允許網站儲存資料後再試一次。' }],
        fieldErrors: {}
      };
      state.academicPeriodValidation = storageValidation;
      render();
      window.requestAnimationFrame(() => focusAcademicPeriodError(storageValidation));
      return;
    }
    academicPeriodSettings = nextSettings;
    hasSavedAcademicPeriodSettings = true;
    state.academicPeriodDraft = null;
    state.academicPeriodValidation = null;
    state.academicPeriodLastValidYear = null;
    state.page = 'settings';
    showTimedToast('學年與期間已儲存在這台裝置');
    window.requestAnimationFrame(() => app.querySelector('[data-action="open-academic-period-settings"]')?.focus({ preventScroll: true }));
  }
  if (action === 'open-settings-tab') {
    state.assignmentHubCancelTarget = null;
    state.submissionCompleteTarget = null;
    state.examCancelTarget = null;
    state.makeupCompleteTarget = null;
    state.modal = null;
    state.page = 'settings';
    clearTimedToast();
    renderAssignmentHubTransition();
  }
  if (action === 'open-assignment-hub') {
    const returnPage = state.session && (state.page === 'course' || (state.page === 'assignment-hub' && state.assignmentHubReturnPage === 'course')) ? 'course' : 'today';
    state.assignmentHub = { groupKey: null, assignmentId: null, courseKey: null };
    state.assignmentHubReturnPage = returnPage;
    state.assignmentHubCancelTarget = null;
    state.submissionCompleteTarget = null;
    state.examCancelTarget = null;
    state.makeupCompleteTarget = null;
    state.modal = null;
    state.page = 'assignment-hub';
    clearTimedToast();
    renderAssignmentHubTransition();
  }
  if (action === 'back-assignment-hub') {
    state.assignmentHubCancelTarget = null;
    state.submissionCompleteTarget = null;
    if (state.assignmentHub.classKey && !state.assignmentHub.sharedOverview && state.assignmentHub.assignmentId) state.assignmentHub = { classKey: state.assignmentHub.classKey, groupKey: null, assignmentId: null, courseKey: null };
    else if (state.assignmentHub.sharedOverview && !state.assignmentHub.courseKey) state.assignmentHub = { ...state.assignmentHub, sharedOverview: false, courseKey: state.assignmentHub.sharedReturnCourseKey };
    else if (state.assignmentHub.courseKey) state.assignmentHub = { ...state.assignmentHub, courseKey: null };
    else if (state.assignmentHub.classKey && state.assignmentHubReturnPage !== 'course') state.assignmentHub = { groupKey: null, assignmentId: null, courseKey: null };
    else if (state.assignmentHub.assignmentId) state.assignmentHub = { ...state.assignmentHub, assignmentId: null, courseKey: null };
    else if (state.assignmentHub.groupKey && state.assignmentHubReturnPage !== 'course') state.assignmentHub = { groupKey: null, assignmentId: null, courseKey: null };
    else {
      state.page = state.assignmentHubReturnPage === 'course' && state.session ? 'course' : 'today';
      if (state.page === 'course') state.accordion = 'assignment';
      state.assignmentHub = { groupKey: null, assignmentId: null, courseKey: null };
    }
    renderAssignmentHubTransition();
  }
  if (action === 'open-course-assignment-hub') {
    const courseKey = sessionCourseKey();
    const selectedClass = buildClassFirstRecordView(commonAssignmentGroups(), 'assignment').flatMap((grade) => grade.classes).find((item) => item.courseKeys.includes(courseKey));
    if (!selectedClass) return;
    state.assignmentHub = { classKey: selectedClass.classKey, groupKey: null, assignmentId: null, courseKey: null };
    state.assignmentHubReturnPage = 'course';
    state.assignmentHubCancelTarget = null;
    state.submissionCompleteTarget = null;
    state.page = 'assignment-hub';
    clearTimedToast();
    renderAssignmentHubTransition();
  }
  if (action === 'open-assignment-group') {
    state.assignmentHub = { groupKey: target.dataset.groupKey, assignmentId: null, courseKey: null };
    state.assignmentHubCancelTarget = null;
    state.submissionCompleteTarget = null;
    renderAssignmentHubTransition();
  }
  if (action === 'open-common-assignment') {
    state.assignmentHub = { ...state.assignmentHub, assignmentId: target.dataset.assignmentId, courseKey: null };
    state.assignmentHubCancelTarget = null;
    state.submissionCompleteTarget = null;
    renderAssignmentHubTransition();
  }
  if (action === 'open-common-assignment-class') {
    state.assignmentHub = { ...state.assignmentHub, courseKey: target.dataset.courseKey };
    state.assignmentHubCancelTarget = null;
    state.submissionCompleteTarget = null;
    renderAssignmentHubTransition();
  }
  if (action === 'add-common-assignment') {
    openCommonRecordCreatePicker('assignment');
  }
  if (action === 'edit-common-assignment') {
    const { assignment } = assignmentHubContext();
    const sourceClass = assignment?.classes.find((item) => item.targetStatus !== 'cancelled') || assignment?.classes[0];
    const detail = sourceClass ? assignmentClassDetail(homeworkRecords.assignments, assignment.assignmentId, sourceClass.courseKey) : null;
    const session = assignmentTargetSession(detail);
    if (assignment && session) openAssignmentForm(assignment.assignmentId, { session, returnPage: 'assignment-hub' });
    else showTimedToast('目前無法修改這份作業');
  }
  if (action === 'start-common-assignment-check') {
    const { assignment, detail } = assignmentHubContext();
    const session = assignmentTargetSession(detail, true);
    if (!assignment || !detail || detail.targetStatus === 'cancelled' || !session) {
      showTimedToast('這個班目前無法進行檢查');
    } else {
      state.activeAssignment = { assignmentId: assignment.assignmentId, courseKey: detail.courseKey, session, returnPage: 'assignment-hub' };
      state.draftSeatStates = sanitizeSeatStatesForSession(detail.lastCheck?.seatStates || {}, session);
      state.leaveMode = false;
      state.page = 'homework';
      render();
    }
  }
  if (action === 'request-complete-common-submission') {
    state.submissionCompleteTarget = {
      assignmentId: target.dataset.assignmentId,
      courseKey: target.dataset.courseKey,
      submissionId: target.dataset.submissionId,
      seat: Number(target.dataset.seat)
    };
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="dismiss-complete-common-submission"]')?.focus({ preventScroll: true }));
  }
  if (action === 'dismiss-complete-common-submission') {
    const completion = state.submissionCompleteTarget;
    state.submissionCompleteTarget = null;
    render();
    window.requestAnimationFrame(() => app.querySelector(`[data-action="request-complete-common-submission"][data-submission-id="${CSS.escape(completion?.submissionId || '')}"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'confirm-complete-common-submission') {
    const completion = state.submissionCompleteTarget;
    if (!completion) return;
    const now = new Date();
    homeworkRecords = completeHomeworkSubmission(homeworkRecords, {
      assignmentId: completion.assignmentId,
      courseKey: completion.courseKey,
      submissionId: completion.submissionId,
      seat: completion.seat,
      completedAt: `${localDateKey(now)} ${now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}`
    });
    persistHomework();
    state.submissionCompleteTarget = null;
    showTimedToast(`${completion.seat} 號已完成補交`);
  }
  if (action === 'open-assignment-class-time') {
    const { assignment, detail } = assignmentHubContext();
    const targetRecord = assignment && detail ? homeworkRecords.assignments?.[assignment.assignmentId]?.targets?.[detail.courseKey] : null;
    if (!assignment || !detail || !targetRecord?.due || targetRecord.status === 'cancelled') {
      showTimedToast('目前無法修改這個班的時間');
    } else {
      state.now = new Date();
      const minDate = localDateKey(state.now);
      state.modal = {
        mode: 'assignment-class-time',
        assignmentId: assignment.assignmentId,
        courseKey: detail.courseKey,
        selectedMode: '',
        dateKey: targetRecord.due.dateKey >= minDate ? targetRecord.due.dateKey : minDate,
        minDate,
        draftDue: null,
        error: ''
      };
      render();
      window.requestAnimationFrame(() => app.querySelector('[data-action="select-assignment-class-time-mode"]')?.focus());
    }
  }
  if (action === 'select-assignment-class-time-mode' && state.modal?.mode === 'assignment-class-time') {
    state.modal.selectedMode = target.dataset.mode;
    applyAssignmentClassTimeDraft();
    render();
    window.requestAnimationFrame(() => app.querySelector(`[data-action="select-assignment-class-time-mode"][data-mode="${target.dataset.mode}"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'save-assignment-class-time' && state.modal?.mode === 'assignment-class-time') {
    const editor = state.modal;
    const targetRecord = assignmentClassTimeTarget(editor);
    if (!targetRecord || !editor.draftDue || editor.error || sameExamDue(targetRecord.due, editor.draftDue)) return;
    const nextAssignments = updateAssignmentTargetSchedule(homeworkRecords.assignments, {
      assignmentId: editor.assignmentId,
      courseKey: editor.courseKey,
      due: editor.draftDue,
      scheduleMode: editor.selectedMode
    });
    if (nextAssignments === homeworkRecords.assignments) return;
    const classLabel = targetRecord.course?.classLabel || editor.courseKey;
    homeworkRecords = { ...homeworkRecords, assignments: nextAssignments };
    persistHomework();
    state.modal = null;
    showTimedToast(`已更新${classLabel}作業時間`);
    window.requestAnimationFrame(() => app.querySelector('[data-action="open-assignment-class-time"]')?.focus({ preventScroll: true }));
  }
  if (action === 'request-common-assignment-cancel') {
    const { assignment, detail } = assignmentHubContext();
    if (assignment && detail) state.assignmentHubCancelTarget = { assignmentId: assignment.assignmentId, courseKey: detail.courseKey };
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="dismiss-common-assignment-cancel"]')?.focus({ preventScroll: true }));
  }
  if (action === 'dismiss-common-assignment-cancel') {
    state.assignmentHubCancelTarget = null;
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="request-common-assignment-cancel"]')?.focus({ preventScroll: true }));
  }
  if (action === 'confirm-common-assignment-cancel') {
    const { assignment, detail } = assignmentHubContext();
    if (!assignment || !detail) return;
    homeworkRecords = { ...homeworkRecords, assignments: cancelAssignmentTarget(homeworkRecords.assignments, assignment.assignmentId, detail.courseKey, localDateKey(state.now)) };
    persistHomework();
    state.assignmentHubCancelTarget = null;
    showTimedToast('已取消這個班的作業安排');
  }
  if (action === 'open-exam-hub') {
    const returnPage = state.session && (state.page === 'course' || (state.page === 'exam-hub' && state.examHubReturnPage === 'course')) ? 'course' : 'today';
    state.examHub = { groupKey: null, examId: null, courseKey: null };
    state.examHubReturnPage = returnPage;
    state.examCancelTarget = null;
    state.makeupCompleteTarget = null;
    state.assignmentHubCancelTarget = null;
    state.submissionCompleteTarget = null;
    state.modal = null;
    state.page = 'exam-hub';
    clearTimedToast();
    renderExamHubTransition();
  }
  if (action === 'back-exam-hub') {
    state.examCancelTarget = null;
    state.makeupCompleteTarget = null;
    if (state.examHub.classKey && !state.examHub.sharedOverview && state.examHub.examId) state.examHub = { classKey: state.examHub.classKey, groupKey: null, examId: null, courseKey: null };
    else if (state.examHub.sharedOverview && !state.examHub.courseKey) state.examHub = { ...state.examHub, sharedOverview: false, courseKey: state.examHub.sharedReturnCourseKey };
    else if (state.examHub.courseKey) state.examHub = { ...state.examHub, courseKey: null };
    else if (state.examHub.classKey && state.examHubReturnPage !== 'course') state.examHub = { groupKey: null, examId: null, courseKey: null };
    else if (state.examHub.examId) state.examHub = { ...state.examHub, examId: null, courseKey: null };
    else if (state.examHub.groupKey && state.examHubReturnPage !== 'course') state.examHub = { groupKey: null, examId: null, courseKey: null };
    else {
      state.page = state.examHubReturnPage === 'course' && state.session ? 'course' : 'today';
      if (state.page === 'course') state.accordion = 'exam';
      state.examHub = { groupKey: null, examId: null, courseKey: null };
    }
    renderExamHubTransition();
  }
  if (action === 'open-course-exam-hub') {
    const courseKey = sessionCourseKey();
    const selectedClass = buildClassFirstRecordView(commonExamGroups(), 'exam').flatMap((grade) => grade.classes).find((item) => item.courseKeys.includes(courseKey));
    if (!selectedClass) return;
    state.examHub = { classKey: selectedClass.classKey, groupKey: null, examId: null, courseKey: null };
    state.examHubReturnPage = 'course';
    state.examCancelTarget = null;
    state.makeupCompleteTarget = null;
    state.page = 'exam-hub';
    clearTimedToast();
    renderExamHubTransition();
  }
  if (action === 'open-exam-group') {
    state.examHub = { groupKey: target.dataset.groupKey, examId: null, courseKey: null };
    state.examCancelTarget = null;
    state.makeupCompleteTarget = null;
    renderExamHubTransition();
  }
  if (action === 'open-common-exam') {
    state.examHub = { ...state.examHub, examId: target.dataset.examId, courseKey: null };
    state.examCancelTarget = null;
    state.makeupCompleteTarget = null;
    renderExamHubTransition();
  }
  if (action === 'open-common-exam-class') {
    state.examHub = { ...state.examHub, courseKey: target.dataset.courseKey };
    state.examCancelTarget = null;
    state.makeupCompleteTarget = null;
    renderExamHubTransition();
  }
  if (action === 'add-common-exam') {
    openCommonRecordCreatePicker('exam');
  }
  if (action === 'edit-common-exam') {
    const { exam } = examHubContext();
    const sourceClass = exam?.classes.find((item) => item.targetStatus !== 'cancelled') || exam?.classes[0];
    const detail = sourceClass ? examClassDetail(homeworkRecords.exams, exam.examId, sourceClass.courseKey) : null;
    const session = examTargetSession(detail);
    if (exam && session) openExamForm(exam.examId, { session, returnPage: 'exam-hub' });
    else showTimedToast('目前無法修改這份考試');
  }
  if (action === 'start-common-exam-check') {
    const { exam, detail } = examHubContext();
    const session = examTargetSession(detail, true);
    if (!exam || !detail || detail.targetStatus === 'cancelled' || !session) {
      showTimedToast('這個班目前無法進行點名');
    } else {
      state.activeExam = { examId: exam.examId, courseKey: detail.courseKey, session, returnPage: 'exam-hub' };
      state.draftExamSeatStates = sanitizeSeatStatesForSession(detail.lastCheck?.seatStates || {}, session);
      state.page = 'exam-attendance';
      render();
    }
  }
  if (action === 'request-complete-common-makeup') {
    state.makeupCompleteTarget = {
      examId: target.dataset.examId,
      courseKey: target.dataset.courseKey,
      seat: Number(target.dataset.seat)
    };
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="dismiss-complete-common-makeup"]')?.focus({ preventScroll: true }));
  }
  if (action === 'dismiss-complete-common-makeup') {
    const completion = state.makeupCompleteTarget;
    state.makeupCompleteTarget = null;
    render();
    window.requestAnimationFrame(() => app.querySelector(`[data-action="request-complete-common-makeup"][data-seat="${completion?.seat}"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'confirm-complete-common-makeup') {
    const completion = state.makeupCompleteTarget;
    if (!completion) return;
    const now = new Date();
    homeworkRecords = completeExamMakeup(homeworkRecords, {
      examId: completion.examId,
      courseKey: completion.courseKey,
      seat: completion.seat,
      completedAt: `${localDateKey(now)} ${now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}`
    });
    persistHomework();
    state.makeupCompleteTarget = null;
    showTimedToast(`${completion.seat} 號已完成補考`);
  }
  if (action === 'open-exam-class-time') {
    const { exam, detail } = examHubContext();
    const targetRecord = exam && detail ? homeworkRecords.exams?.[exam.examId]?.targets?.[detail.courseKey] : null;
    if (!exam || !detail || !targetRecord?.due || targetRecord.status === 'cancelled') {
      showTimedToast('目前無法修改這個班的時間');
    } else {
      state.now = new Date();
      const minDate = localDateKey(state.now);
      const availablePeriods = periodTuplesForDate(minDate);
      const periodId = availablePeriods.some(([id]) => id === targetRecord.due.slotId) ? targetRecord.due.slotId : availablePeriods[0][0];
      state.modal = {
        mode: 'exam-class-time',
        examId: exam.examId,
        courseKey: detail.courseKey,
        selectedMode: '',
        dateKey: targetRecord.due.dateKey >= minDate ? targetRecord.due.dateKey : minDate,
        periodId,
        minDate,
        draftDue: null,
        error: ''
      };
      render();
      window.requestAnimationFrame(() => app.querySelector('[data-action="select-exam-class-time-mode"]')?.focus());
    }
  }
  if (action === 'select-exam-class-time-mode' && state.modal?.mode === 'exam-class-time') {
    state.modal.selectedMode = target.dataset.mode;
    applyExamClassTimeDraft();
    render();
    window.requestAnimationFrame(() => app.querySelector(`[data-action="select-exam-class-time-mode"][data-mode="${target.dataset.mode}"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'save-exam-class-time' && state.modal?.mode === 'exam-class-time') {
    const editor = state.modal;
    const targetRecord = examClassTimeTarget(editor);
    if (!targetRecord || !editor.draftDue || editor.error || sameExamDue(targetRecord.due, editor.draftDue)) return;
    const nextExams = updateExamTargetSchedule(homeworkRecords.exams, {
      examId: editor.examId,
      courseKey: editor.courseKey,
      due: editor.draftDue,
      scheduleMode: editor.selectedMode
    });
    if (nextExams === homeworkRecords.exams) return;
    const classLabel = targetRecord.course?.classLabel || editor.courseKey;
    homeworkRecords = { ...homeworkRecords, exams: nextExams };
    persistHomework();
    state.modal = null;
    showTimedToast(`已更新${classLabel}考試時間`);
    window.requestAnimationFrame(() => app.querySelector('[data-action="open-exam-class-time"]')?.focus({ preventScroll: true }));
  }
  if (action === 'request-common-exam-cancel') {
    const { exam, detail } = examHubContext();
    if (exam && detail) state.examCancelTarget = { examId: exam.examId, courseKey: detail.courseKey };
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="dismiss-common-exam-cancel"]')?.focus({ preventScroll: true }));
  }
  if (action === 'dismiss-common-exam-cancel') {
    state.examCancelTarget = null;
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="request-common-exam-cancel"]')?.focus({ preventScroll: true }));
  }
  if (action === 'confirm-common-exam-cancel') {
    const { exam, detail } = examHubContext();
    if (!exam || !detail) return;
    homeworkRecords = { ...homeworkRecords, exams: cancelExamTarget(homeworkRecords.exams, exam.examId, detail.courseKey, localDateKey(state.now)) };
    persistHomework();
    state.examCancelTarget = null;
    showTimedToast('已取消這個班的考試安排');
  }
  if (action === 'add-assignment') openAssignmentForm();
  if (action === 'edit-assignment') openAssignmentForm(target.dataset.assignment);
  if (action === 'back-assignment-form') {
    const returnPage = state.assignmentForm?.returnPage;
    state.assignmentForm = null;
    state.page = returnPage === 'assignment-hub' ? 'assignment-hub' : 'course';
    if (state.page === 'course') state.accordion = 'assignment';
    render();
  }
  if (action === 'show-peer-classes') { state.assignmentForm.showPeers = true; render(); }
  if (action === 'toggle-form-course') {
    const courseKey = target.dataset.courseKey;
    const selected = new Set(state.assignmentForm.selectedCourseKeys);
    const wasSelected = selected.has(courseKey);
    if (wasSelected) selected.delete(courseKey); else selected.add(courseKey);
    state.assignmentForm.selectedCourseKeys = [...selected];
    if (!wasSelected) {
      const nextErrors = { ...(state.assignmentForm.targetErrors || {}) };
      delete nextErrors[courseKey];
      state.assignmentForm.targetErrors = nextErrors;
      if (!state.assignmentForm.targetDrafts?.[courseKey]?.due) {
        applyIndependentAssignmentTimes(state.assignmentForm.scheduleMode, [courseKey], {
          selectedDate: state.assignmentForm.scheduleMode === 'date' ? state.assignmentForm.selectedDate : '',
          notice: false
        });
      }
    }
    state.assignmentForm.scheduleDirty = true;
    render();
  }
  if (action === 'set-schedule-mode' && state.assignmentForm) {
    const mode = target.dataset.mode;
    if (mode === 'date') {
      state.assignmentForm.scheduleMode = 'date';
      state.assignmentForm.selectedDate = '';
      state.assignmentForm.batchConfirmPreviousDate = null;
      state.assignmentForm.timeNotice = '';
    } else if (assignmentHasSelectedIndividualizedTimes()) state.assignmentForm.batchConfirmMode = mode;
    else applyAssignmentBatchMode(mode);
    render();
    window.requestAnimationFrame(() => app.querySelector(state.assignmentForm?.batchConfirmMode ? '[data-action="confirm-assignment-batch-time"]' : `[data-action="set-schedule-mode"][data-mode="${mode}"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'close-assignment-batch-confirm' && state.assignmentForm?.batchConfirmMode && (target.matches('button') || event.target === target)) {
    const mode = state.assignmentForm.batchConfirmMode;
    if (mode === 'date' && state.assignmentForm.batchConfirmPreviousDate !== null) {
      state.assignmentForm.selectedDate = state.assignmentForm.batchConfirmPreviousDate;
    }
    state.assignmentForm.batchConfirmMode = '';
    state.assignmentForm.batchConfirmPreviousDate = null;
    render();
    const selector = `[data-action="set-schedule-mode"][data-mode="${mode}"]`;
    window.requestAnimationFrame(() => app.querySelector(selector)?.focus({ preventScroll: true }));
  }
  if (action === 'confirm-assignment-batch-time' && state.assignmentForm?.batchConfirmMode) {
    const mode = state.assignmentForm.batchConfirmMode;
    state.assignmentForm.batchConfirmMode = '';
    applyAssignmentBatchMode(mode);
    state.assignmentForm.batchConfirmPreviousDate = null;
    render();
    const selector = `[data-action="set-schedule-mode"][data-mode="${mode}"]`;
    window.requestAnimationFrame(() => app.querySelector(selector)?.focus({ preventScroll: true }));
  }
  if (action === 'open-single-assignment-time' && state.assignmentForm) {
    const session = assignmentSchedulingSession(state.assignmentForm);
    const courseKey = target.dataset.courseKey;
    const currentDue = state.assignmentForm.targetDrafts?.[courseKey]?.due;
    state.assignmentForm.timeEditor = {
      courseKey,
      custom: false,
      dateKey: currentDue?.dateKey >= session.dateKey ? currentDue.dateKey : session.dateKey,
      minDate: session.dateKey,
      error: ''
    };
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="apply-single-assignment-time"]')?.focus());
  }
  if (action === 'close-assignment-time-editor' && state.assignmentForm?.timeEditor && (target.matches('button') || event.target === target)) {
    const courseKey = state.assignmentForm.timeEditor.courseKey;
    state.assignmentForm.timeEditor = null;
    render();
    window.requestAnimationFrame(() => app.querySelector(`[data-action="open-single-assignment-time"][data-course-key="${CSS.escape(courseKey)}"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'apply-single-assignment-time' && state.assignmentForm?.timeEditor) {
    const courseKey = state.assignmentForm.timeEditor.courseKey;
    const resolution = applySingleAssignmentTime(target.dataset.mode, courseKey);
    if (resolution?.errors.length) {
      state.assignmentForm.timeEditor.error = resolution.errors[0].reason;
      render();
      window.requestAnimationFrame(() => app.querySelector(`[data-action="apply-single-assignment-time"][data-mode="${target.dataset.mode}"]`)?.focus({ preventScroll: true }));
    } else {
      state.assignmentForm.timeEditor = null;
      render();
      window.requestAnimationFrame(() => app.querySelector(`[data-action="open-single-assignment-time"][data-course-key="${CSS.escape(courseKey)}"]`)?.focus({ preventScroll: true }));
    }
  }
  if (action === 'show-single-assignment-date' && state.assignmentForm?.timeEditor) {
    state.assignmentForm.timeEditor.custom = true;
    state.assignmentForm.timeEditor.error = '';
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="assignment-time-date"]')?.focus());
  }
  if (action === 'apply-custom-assignment-time' && state.assignmentForm?.timeEditor) {
    const editor = state.assignmentForm.timeEditor;
    const resolution = applySingleAssignmentTime('date', editor.courseKey, editor.dateKey);
    if (resolution?.errors.length) {
      editor.error = resolution.errors[0].reason;
      render();
      window.requestAnimationFrame(() => app.querySelector('[data-action="assignment-time-date"]')?.focus({ preventScroll: true }));
    } else {
      const courseKey = editor.courseKey;
      state.assignmentForm.timeEditor = null;
      render();
      window.requestAnimationFrame(() => app.querySelector(`[data-action="open-single-assignment-time"][data-course-key="${CSS.escape(courseKey)}"]`)?.focus({ preventScroll: true }));
    }
  }
  if (action === 'save-assignment') saveAssignmentForm();
  if (action === 'add-exam') openExamForm();
  if (action === 'edit-exam') openExamForm(target.dataset.exam);
  if (action === 'back-exam-form') {
    const returnPage = state.examForm?.returnPage;
    state.examForm = null;
    state.page = returnPage === 'exam-hub' ? 'exam-hub' : 'course';
    if (state.page === 'course') state.accordion = 'exam';
    render();
  }
  if (action === 'show-exam-peer-classes' && state.examForm) { state.examForm.showPeers = true; render(); }
  if (action === 'toggle-exam-form-course' && state.examForm) {
    const courseKey = target.dataset.courseKey;
    const selected = new Set(state.examForm.selectedCourseKeys);
    const wasSelected = selected.has(courseKey);
    if (wasSelected) selected.delete(courseKey); else selected.add(courseKey);
    state.examForm.selectedCourseKeys = [...selected];
    if (state.examForm.independentSchedule) {
      state.examForm.timeNotice = '';
      if (!wasSelected && state.examForm.batchDateVisible && state.examForm.commonDateKey) applyExamBatchDate([courseKey]);
    }
    render();
  }
  if (action === 'apply-exam-batch-time' && state.examForm?.independentSchedule) {
    applyIndependentExamTimes(target.dataset.mode, state.examForm.selectedCourseKeys);
    render();
    window.requestAnimationFrame(() => app.querySelector(`[data-action="apply-exam-batch-time"][data-mode="${target.dataset.mode}"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'open-exam-common-time' && state.examForm?.independentSchedule) {
    state.examForm.batchDateVisible = true;
    state.examForm.timeNotice = '';
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="open-exam-common-time"]')?.focus({ preventScroll: true }));
  }
  if (action === 'open-single-exam-time' && state.examForm?.independentSchedule) {
    const session = examSchedulingSession(state.examForm);
    const courseKey = target.dataset.courseKey;
    const currentDue = state.examForm.targetDrafts?.[courseKey]?.due;
    state.examForm.timeEditor = {
      scope: 'single',
      courseKey,
      custom: false,
      dateKey: currentDue?.dateKey || session.dateKey,
      periodId: currentDue?.slotId || state.examForm.commonPeriodId || periodTuplesForDate(currentDue?.dateKey || localDateKey(state.now))[0][0],
      minDate: session.dateKey
    };
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="apply-single-exam-time"]')?.focus());
  }
  if (action === 'close-exam-time-editor' && state.examForm?.timeEditor && (target.matches('button') || event.target === target)) {
    const editor = state.examForm.timeEditor;
    state.examForm.timeEditor = null;
    render();
    const selector = editor.scope === 'batch' ? '[data-action="open-exam-common-time"]' : `[data-action="open-single-exam-time"][data-course-key="${CSS.escape(editor.courseKey)}"]`;
    window.requestAnimationFrame(() => app.querySelector(selector)?.focus({ preventScroll: true }));
  }
  if (action === 'apply-single-exam-time' && state.examForm?.timeEditor?.scope === 'single') {
    const courseKey = state.examForm.timeEditor.courseKey;
    applyIndependentExamTimes(target.dataset.mode, [courseKey]);
    state.examForm.timeEditor = null;
    render();
    window.requestAnimationFrame(() => app.querySelector(`[data-action="open-single-exam-time"][data-course-key="${CSS.escape(courseKey)}"]`)?.focus({ preventScroll: true }));
  }
  if (action === 'show-single-exam-custom' && state.examForm?.timeEditor?.scope === 'single') {
    state.examForm.timeEditor.custom = true;
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="exam-time-date"]')?.focus());
  }
  if (action === 'apply-custom-exam-time' && state.examForm?.timeEditor) {
    const editor = state.examForm.timeEditor;
    const courseKeys = editor.scope === 'batch' ? state.examForm.selectedCourseKeys : [editor.courseKey];
    const resolution = applyIndependentExamTimes('common-time', courseKeys, { dateKey: editor.dateKey, periodId: editor.periodId });
    if (resolution?.errors.length) {
      editor.error = resolution.errors[0].reason;
      render();
      window.requestAnimationFrame(() => app.querySelector('[data-action="exam-time-date"]')?.focus());
      return;
    }
    if (editor.scope === 'batch') {
      state.examForm.commonDateKey = editor.dateKey;
      state.examForm.commonPeriodId = editor.periodId;
    }
    state.examForm.timeEditor = null;
    render();
    const selector = editor.scope === 'batch' ? '[data-action="open-exam-common-time"]' : `[data-action="open-single-exam-time"][data-course-key="${CSS.escape(editor.courseKey)}"]`;
    window.requestAnimationFrame(() => app.querySelector(selector)?.focus({ preventScroll: true }));
  }
  if (action === 'set-exam-schedule-mode' && state.examForm) {
    state.examForm.scheduleMode = target.dataset.mode;
    updateExamScheduleDirty();
    render();
  }
  if (action === 'save-exam') saveExamForm();
  if (action === 'start-homework') {
    const assignmentId = target.dataset.assignment;
    const courseKey = sessionCourseKey();
    const assignmentTarget = homeworkRecords.assignments[assignmentId]?.targets?.[courseKey];
    state.activeAssignment = { assignmentId, courseKey, session: state.session, returnPage: 'course' };
    state.draftSeatStates = sanitizeSeatStatesForSession(assignmentTarget?.lastCheck?.seatStates || {}, state.session);
    state.leaveMode = false;
    state.page = 'homework';
    render();
  }
  if (action === 'defer-assignment') {
    const nowKey = localDateKey(state.now);
    const nowTime = `${String(state.now.getHours()).padStart(2, '0')}:${String(state.now.getMinutes()).padStart(2, '0')}`;
    const baseline = nowKey > state.session.dateKey
      ? { dateKey: nowKey, end: nowTime }
      : { dateKey: state.session.dateKey, end: nowKey === state.session.dateKey && nowTime > state.session.end ? nowTime : state.session.end };
    homeworkRecords = { ...homeworkRecords, assignments: deferAssignmentTarget(homeworkRecords.assignments, target.dataset.assignment, sessionCourseKey(), scheduleSlotsProvider, baseline) };
    persistHomework();
    showTimedToast('已延至下次上課');
  }
  if (action === 'start-exam-check') {
    const examId = target.dataset.exam;
    const courseKey = sessionCourseKey();
    const examTarget = homeworkRecords.exams[examId]?.targets?.[courseKey];
    if (!examTarget || examTarget.status === 'cancelled') return;
    state.activeExam = { examId, courseKey, session: state.session, returnPage: 'course' };
    state.draftExamSeatStates = sanitizeSeatStatesForSession(examTarget.lastCheck?.seatStates || {}, state.session);
    state.page = 'exam-attendance';
    render();
  }
  if (action === 'defer-exam') {
    const nowKey = localDateKey(state.now);
    const nowTime = `${String(state.now.getHours()).padStart(2, '0')}:${String(state.now.getMinutes()).padStart(2, '0')}`;
    const baseline = nowKey > state.session.dateKey
      ? { dateKey: nowKey, end: nowTime }
      : { dateKey: state.session.dateKey, end: nowKey === state.session.dateKey && nowTime > state.session.end ? nowTime : state.session.end };
    homeworkRecords = { ...homeworkRecords, exams: deferExamTarget(homeworkRecords.exams, target.dataset.exam, sessionCourseKey(), scheduleSlotsProvider, baseline) };
    persistHomework();
    showTimedToast('考試已延至下次上課');
  }
  if (action === 'request-cancel-target') { state.cancelTarget = { assignmentId: target.dataset.assignment, courseKey: sessionCourseKey() }; render(); }
  if (action === 'dismiss-cancel-target') { state.cancelTarget = null; render(); }
  if (action === 'confirm-cancel-target') {
    const assignmentId = target.dataset.assignment;
    const courseKey = sessionCourseKey();
    const assignment = homeworkRecords.assignments[assignmentId];
    homeworkRecords = { ...homeworkRecords, assignments: { ...homeworkRecords.assignments, [assignmentId]: { ...assignment, targets: { ...assignment.targets, [courseKey]: { ...assignment.targets[courseKey], status: 'cancelled', cancelledAt: localDateKey(state.now) } } } } };
    persistHomework();
    state.cancelTarget = null;
    showTimedToast('已取消這個班的作業安排');
  }
  if (action === 'request-cancel-exam-target') { state.examCancelTarget = { examId: target.dataset.exam, courseKey: sessionCourseKey() }; render(); }
  if (action === 'dismiss-cancel-exam-target') { state.examCancelTarget = null; render(); }
  if (action === 'confirm-cancel-exam-target') {
    const examId = target.dataset.exam;
    const courseKey = sessionCourseKey();
    homeworkRecords = { ...homeworkRecords, exams: cancelExamTarget(homeworkRecords.exams, examId, courseKey, localDateKey(state.now)) };
    persistHomework();
    state.examCancelTarget = null;
    showTimedToast('已取消這個班的考試安排');
  }
  if (action === 'back-course') {
    const assignmentReturnPage = state.activeAssignment?.returnPage;
    state.page = assignmentReturnPage === 'assignment-hub' ? 'assignment-hub' : 'course';
    state.activeAssignment = null;
    state.activeExam = null;
    state.leaveMode = false;
    state.draftExamSeatStates = {};
    clearReminderInteraction();
    render();
  }
  if (action === 'back-exam-attendance') {
    const returnPage = state.activeExam?.returnPage;
    state.activeExam = null;
    state.draftExamSeatStates = {};
    state.page = returnPage === 'exam-hub' ? 'exam-hub' : 'course';
    if (state.page === 'course') state.accordion = 'exam';
    render();
  }
  if (action === 'toggle-leave-mode') { state.leaveMode = !state.leaveMode; render(); }
  if (action === 'seat') {
    const seat = Number(target.dataset.seat);
    if (shouldSuppressLongPressClick(suppressedClick, seat, null)) {
      window.clearTimeout(suppressedClickTimer);
      suppressedClick = null;
      suppressedClickTimer = null;
      return;
    }
    const session = state.activeAssignment?.session || state.session;
    state.draftSeatStates = toggleSeatState(state.draftSeatStates, seat, state.leaveMode ? 'leave' : 'incomplete', rosterForSession(session).vacantSeats);
    render();
  }
  if (action === 'save-homework') saveHomework(state.draftSeatStates);
  if (action === 'exam-seat') {
    const seat = Number(target.dataset.seat);
    const session = state.activeExam?.session || state.session;
    state.draftExamSeatStates = toggleSeatState(state.draftExamSeatStates, seat, 'absent', rosterForSession(session).vacantSeats);
    render();
  }
  if (action === 'save-exam-check') saveExamAttendance(state.draftExamSeatStates);
});

const NATIVE_DATE_ACTIONS = new Set([
  'managed-schedule-form-date',
  'academic-period-date',
  'assignment-date',
  'assignment-time-date',
  'exam-date',
  'assignment-class-time-date',
  'exam-class-time-date',
  'exam-time-date',
  'exam-batch-date'
]);
let pendingNativeDateControl = null;
let pendingDatePointerTarget = null;
let suppressDateTriggeredClick = false;
const DATE_ACTIONS_REQUIRING_RENDER = new Set([
  'managed-schedule-form-date',
  'assignment-date',
  'exam-date',
  'assignment-class-time-date',
  'exam-class-time-date',
  'exam-batch-date'
]);

function shouldDeferNativeDateCommit() {
  try { return Boolean(window.matchMedia?.('(pointer: coarse)').matches); }
  catch { return false; }
}

function finishDateControlRender(renderMode) {
  if (renderMode === 'none') return;
  if (renderMode === 'defer') window.setTimeout(render, 0);
  else render();
}

function commitDateControl(dateControl, renderMode = 'immediate') {
  const action = dateControl?.dataset?.action;
  if (!NATIVE_DATE_ACTIONS.has(action)) return false;

  if (action === 'managed-schedule-form-date' && state.scheduleVersionForm) {
    const startDate = dateControl.value;
    const canCopy = scheduleVersionsBefore(state.scheduleVersionForm.periodId, startDate).length > 0;
    state.scheduleVersionForm = {
      ...state.scheduleVersionForm,
      startDate,
      sourceMode: canCopy ? state.scheduleVersionForm.sourceMode : 'blank'
    };
    state.scheduleVersionValidation = null;
    finishDateControlRender(renderMode);
    return true;
  }

  if (action === 'academic-period-date' && state.academicPeriodDraft) {
    const { periodId, field } = dateControl.dataset;
    state.academicPeriodDraft = {
      ...state.academicPeriodDraft,
      periods: state.academicPeriodDraft.periods.map((period) => period.id === periodId
        ? { ...period, [field]: dateControl.value }
        : period)
    };
    clearAcademicPeriodErrorsInPlace();
    updateAcademicPeriodPreviewInPlace();
    return true;
  }

  if (action === 'assignment-date' && state.assignmentForm) {
    const previousDate = state.assignmentForm.selectedDate;
    state.assignmentForm.selectedDate = dateControl.value;
    state.assignmentForm.timeNotice = '';
    if (dateControl.value) {
      if (assignmentHasSelectedIndividualizedTimes()) {
        state.assignmentForm.batchConfirmPreviousDate = previousDate;
        state.assignmentForm.batchConfirmMode = 'date';
      } else {
        state.assignmentForm.batchConfirmPreviousDate = null;
        applyAssignmentBatchMode('date');
      }
    }
    finishDateControlRender(renderMode);
    if (renderMode === 'immediate' && state.assignmentForm?.batchConfirmMode) {
      window.requestAnimationFrame(() => app.querySelector('[data-action="confirm-assignment-batch-time"]')?.focus({ preventScroll: true }));
    }
    return true;
  }

  if (action === 'assignment-time-date' && state.assignmentForm?.timeEditor) {
    state.assignmentForm.timeEditor.dateKey = dateControl.value;
    state.assignmentForm.timeEditor.error = '';
    app.querySelector('.assignment-time-editor .exam-time-editor-error')?.remove();
    return true;
  }

  if (action === 'exam-date' && state.examForm) {
    state.examForm.selectedDate = dateControl.value;
    updateExamScheduleDirty();
    finishDateControlRender(renderMode);
    return true;
  }

  if (action === 'assignment-class-time-date' && state.modal?.mode === 'assignment-class-time') {
    state.modal.dateKey = dateControl.value;
    state.modal.error = '';
    applyAssignmentClassTimeDraft();
    finishDateControlRender(renderMode);
    return true;
  }

  if (action === 'exam-class-time-date' && state.modal?.mode === 'exam-class-time') {
    state.modal.dateKey = dateControl.value;
    state.modal.error = '';
    applyExamClassTimeDraft();
    finishDateControlRender(renderMode);
    return true;
  }

  if (action === 'exam-time-date' && state.examForm?.timeEditor) {
    state.examForm.timeEditor.dateKey = dateControl.value;
    state.examForm.timeEditor.error = '';
    return true;
  }

  if (action === 'exam-batch-date' && state.examForm?.independentSchedule) {
    state.examForm.commonDateKey = dateControl.value;
    const availablePeriodIds = new Set(periodTuplesForDate(dateControl.value).map(([id]) => id));
    if (!availablePeriodIds.has(state.examForm.commonPeriodId)) state.examForm.commonPeriodId = '';
    state.examForm.timeNotice = '';
    if (dateControl.value) applyExamBatchDate();
    finishDateControlRender(renderMode);
    return true;
  }

  return false;
}

function finalizePendingNativeDateControl(nextActionTarget = null) {
  const dateControl = pendingNativeDateControl;
  if (!dateControl) return false;
  pendingNativeDateControl = null;
  const action = dateControl.dataset?.action;
  commitDateControl(dateControl, 'none');
  if (action === 'assignment-date' && state.assignmentForm?.batchConfirmMode) {
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="confirm-assignment-batch-time"]')?.focus({ preventScroll: true }));
    return true;
  }
  if (!nextActionTarget && DATE_ACTIONS_REQUIRING_RENDER.has(action)) window.setTimeout(render, 0);
  return false;
}

app.addEventListener('pointerdown', (event) => {
  const actionTarget = event.target.closest?.('[data-action]') || null;
  pendingDatePointerTarget = actionTarget;
  window.setTimeout(() => {
    if (pendingDatePointerTarget === actionTarget) pendingDatePointerTarget = null;
  }, 0);
});

app.addEventListener('focusout', (event) => {
  const dateControl = event.target;
  if (dateControl !== pendingNativeDateControl) return;
  const nextActionTarget = pendingDatePointerTarget || event.relatedTarget?.closest?.('[data-action]') || null;
  const shouldSuppressClick = finalizePendingNativeDateControl(nextActionTarget);
  if (shouldSuppressClick && nextActionTarget) {
    suppressDateTriggeredClick = true;
    window.setTimeout(() => { suppressDateTriggeredClick = false; }, 0);
  }
});

app.addEventListener('change', async (event) => {
  if (NATIVE_DATE_ACTIONS.has(event.target?.dataset?.action)) {
    if (shouldDeferNativeDateCommit()) {
      pendingNativeDateControl = event.target;
      return;
    }
    if (commitDateControl(event.target)) return;
  }
  const backupFileInput = event.target.closest('[data-action="import-backup-file"]');
  if (backupFileInput) {
    const [file] = backupFileInput.files || [];
    await prepareBackupImport(file);
    backupFileInput.value = '';
    return;
  }
  const scheduleFormPeriod = event.target.closest('[data-action="managed-schedule-form-period"]');
  if (scheduleFormPeriod && state.scheduleVersionForm) {
    const periodId = scheduleFormPeriod.value;
    const startDate = defaultScheduleVersionStartDate(periodId);
    state.scheduleVersionForm = {
      ...state.scheduleVersionForm,
      periodId,
      startDate,
      sourceMode: scheduleVersionsBefore(periodId, startDate).length ? 'copy' : 'blank'
    };
    state.scheduleVersionValidation = null;
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="managed-schedule-form-period"]')?.focus({ preventScroll: true }));
    return;
  }
  const scheduleCellSelect = event.target.closest('[data-action="managed-schedule-cell-select"]');
  if (scheduleCellSelect && state.modal?.mode === 'managed-schedule-cell') {
    state.modal.teachingClassId = scheduleCellSelect.value;
    return;
  }
  const scheduleTimeInput = event.target.closest('[data-action="managed-schedule-time-input"]');
  if (scheduleTimeInput && state.modal?.mode === 'managed-schedule-times') {
    const { periodId, field } = scheduleTimeInput.dataset;
    state.modal.times = state.modal.times.map((period) => period.id === periodId
      ? { ...period, [field]: scheduleTimeInput.value }
      : period);
    state.modal.validation = null;
    return;
  }
  const teachingClassSelect = event.target.closest('select[data-action="teaching-class-field"]');
  if (teachingClassSelect && (state.teachingClassDraft || state.teachingClassBatchDraft)) {
    const field = teachingClassSelect.dataset.teachingClassField;
    if (state.teachingClassBatchDraft) updateTeachingClassBatchDraftField(field, teachingClassSelect.value);
    else updateTeachingClassDraftField(field, teachingClassSelect.value);
    render();
    window.requestAnimationFrame(() => app.querySelector(`select[data-teaching-class-field="${field}"]`)?.focus({ preventScroll: true }));
    return;
  }
  const drawManualSeat = event.target.closest('[data-action="draw-manual-seat"]');
  if (drawManualSeat) {
    state.drawManualSeat = Number(drawManualSeat.value);
    rerenderDrawSheet({ focusSelector: '[data-action="draw-manual-seat"]' });
    return;
  }
  const drawWeightCap = event.target.closest('[data-action="draw-weight-cap"]');
  if (drawWeightCap) {
    const cap = Math.max(2, Math.min(10, Number(drawWeightCap.value) || 6));
    updateDrawCourseRecord({
      drawWeightCap: cap,
      manualDrawWeightsByMonth: clampManualDrawWeightsByMonth(drawCourseRecord().manualDrawWeightsByMonth || {}, cap)
    });
    state.drawAnnouncement = `每位同學的權重上限已調整為 ${cap} 張。`;
    rerenderDrawSheet({ focusSelector: '[data-action="draw-weight-cap"]' });
    return;
  }
  const select = event.target.closest('[data-action="adjust-teaching-class"]');
  if (select && state.modal) {
    state.modal.teachingClassId = select.value;
    return;
  }
  const examBatchPeriod = event.target.closest('[data-action="exam-batch-period"]');
  if (examBatchPeriod && state.examForm?.independentSchedule) {
    state.examForm.commonPeriodId = examBatchPeriod.value;
    state.examForm.timeNotice = '';
    if (state.examForm.commonDateKey) applyExamBatchDate();
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="exam-batch-period"]')?.focus({ preventScroll: true }));
    return;
  }
  const examClassTimePeriod = event.target.closest('[data-action="exam-class-time-period"]');
  if (examClassTimePeriod && state.modal?.mode === 'exam-class-time') {
    state.modal.periodId = examClassTimePeriod.value;
    state.modal.error = '';
    applyExamClassTimeDraft();
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="exam-class-time-period"]')?.focus({ preventScroll: true }));
    return;
  }
  const examTimePeriod = event.target.closest('[data-action="exam-time-period"]');
  if (examTimePeriod && state.examForm?.timeEditor) {
    state.examForm.timeEditor.periodId = examTimePeriod.value;
    state.examForm.timeEditor.error = '';
  }
});

app.addEventListener('input', (event) => {
  const teachingClassInput = event.target.closest('input[data-action="teaching-class-field"]');
  if (teachingClassInput && (state.teachingClassDraft || state.teachingClassBatchDraft)) {
    const rawRowIndex = teachingClassInput.dataset.teachingClassRowIndex;
    const rowIndex = rawRowIndex === undefined ? null : Number(rawRowIndex);
    if (state.teachingClassBatchDraft) {
      updateTeachingClassBatchDraftField(teachingClassInput.dataset.teachingClassField, teachingClassInput.value, rowIndex);
    } else {
      updateTeachingClassDraftField(teachingClassInput.dataset.teachingClassField, teachingClassInput.value);
    }
    return;
  }
  const academicYearInput = event.target.closest('[data-action="academic-year"]');
  if (academicYearInput && state.academicPeriodDraft) {
    updateAcademicPeriodYearDraft(academicYearInput.value);
    return;
  }
  const titleInput = event.target.closest('[data-action="assignment-title"]');
  if (titleInput && state.assignmentForm) {
    state.assignmentForm.title = titleInput.value;
    const saveButton = app.querySelector('[data-action="save-assignment"]');
    const resolution = assignmentFormResolution();
    const validation = assignmentFormValidation(state.assignmentForm, resolution);
    if (saveButton) saveButton.disabled = Boolean(validation.length);
    const validationBox = app.querySelector('.form-validation');
    if (validationBox) {
      validationBox.hidden = !validation.length;
      validationBox.innerHTML = validation.map((message) => `<span>${escapeHtml(message)}</span>`).join('');
    }
    return;
  }
  const examTitleInput = event.target.closest('[data-action="exam-title"]');
  if (examTitleInput && state.examForm) {
    state.examForm.title = examTitleInput.value;
    const saveButton = app.querySelector('[data-action="save-exam"]');
    const resolution = examFormResolution();
    const validation = examFormValidation(state.examForm, resolution);
    if (saveButton) saveButton.disabled = Boolean(validation.length);
    const validationBox = app.querySelector('.form-validation');
    if (validationBox) {
      validationBox.hidden = !validation.length;
      validationBox.innerHTML = validation.map((message) => `<span>${escapeHtml(message)}</span>`).join('');
    }
  }
});

app.addEventListener('submit', (event) => {
  if (!event.target.matches('[data-teaching-class-form]')) return;
  event.preventDefault();
  app.querySelector(state.teachingClassBatchDraft
    ? '[data-action="save-teaching-class-batch"]'
    : '[data-action="save-teaching-class"]')?.click();
});

app.addEventListener('pointerdown', (event) => {
  const seatButtonElement = event.target.closest('[data-action="seat"]');
  if (!seatButtonElement || seatButtonElement.disabled) return;
  const seat = Number(seatButtonElement.dataset.seat);
  pressStart = { seat, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  longPressTimer = window.setTimeout(() => {
    const session = state.activeAssignment?.session || state.session;
    state.draftSeatStates = toggleSeatState(state.draftSeatStates, seat, 'leave', rosterForSession(session).vacantSeats);
    suppressedClick = { seat, pointerId: event.pointerId };
    window.clearTimeout(suppressedClickTimer);
    suppressedClickTimer = window.setTimeout(() => { suppressedClick = null; suppressedClickTimer = null; }, 1200);
    longPressTimer = null;
    if (navigator.vibrate) navigator.vibrate(25);
    render();
  }, 560);
});

app.addEventListener('pointermove', (event) => {
  if (!pressStart || event.pointerId !== pressStart.pointerId) return;
  if (Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 10) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
    pressStart = null;
  }
});

function endPress() {
  window.clearTimeout(longPressTimer);
  longPressTimer = null;
  pressStart = null;
}
app.addEventListener('pointerup', endPress);
app.addEventListener('pointercancel', endPress);
app.addEventListener('contextmenu', (event) => {
  if (event.target.closest('[data-action="seat"]')) event.preventDefault();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && (state.modal || state.reminderSheetOpen || state.drawSheet)) {
    const dialog = state.modal
      ? app.querySelector('[data-modal-card]')
      : state.reminderSheetOpen
        ? app.querySelector('[data-reminder-sheet]')
        : app.querySelector('[data-draw-sheet]');
    const focusable = dialog ? [...dialog.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length) : [];
    if (focusable.length) {
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeOutsideDialog = !dialog.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || activeOutsideDialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || activeOutsideDialog)) {
        event.preventDefault();
        first.focus();
      }
    }
  }
  if (event.key === 'Escape' && state.modal) closeModalAndRestoreFocus();
  else if (event.key === 'Escape' && state.reminderSheetOpen) closeReminderSheet();
  else if (event.key === 'Escape' && state.drawSheet) closeDrawSheet();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { refreshDeviceTime(true); if (state.page === 'draw') syncDrawTimer(); }
});
window.addEventListener('pagehide', stopDrawTimer);
window.addEventListener('pageshow', () => { if (state.page === 'draw') render(); });
window.setInterval(() => refreshDeviceTime(false), 60_000);

async function requestAppInstall() {
  if (!installPromptEvent) {
    state.modal = { mode: 'install-help' };
    render();
    window.requestAnimationFrame(() => app.querySelector('[data-action="close-modal"]')?.focus());
    return;
  }
  const promptEvent = installPromptEvent;
  installPromptEvent = null;
  try {
    const choice = await promptEvent.prompt();
    if (choice?.outcome !== 'accepted') {
      installState = 'instructions';
      if (state.page === 'settings') render();
    }
  } catch {
    installState = 'instructions';
    state.modal = { mode: 'install-help' };
    render();
  }
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPromptEvent = event;
  installState = 'available';
  if (state.page === 'settings') render();
});
window.addEventListener('appinstalled', () => {
  installPromptEvent = null;
  installState = 'installed';
  if (state.page === 'settings') render();
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { type: 'module' })
      .then((registration) => registration.update())
      .catch(() => {});
  });
}

render();
