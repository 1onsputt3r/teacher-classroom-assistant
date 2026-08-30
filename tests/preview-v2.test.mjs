import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACADEMIC_PERIOD_DEFINITIONS,
  CLASSROOM_REMINDER_CATEGORIES,
  COURSE_CATALOG,
  DATA_BACKUP_APP_ID,
  DATA_BACKUP_SCHEMA_VERSION,
  DEFAULT_MANAGED_SCHEDULE_TIMES,
  MANAGED_SCHEDULE_WEEKDAYS,
  activeAssignmentTargetCount,
  activeManagedScheduleVersion,
  addDaysToDateKey,
  addClassroomReminder,
  academicPeriodForLocalDate,
  applyAssignmentTimeResolution,
  assignmentClassDetail,
  assignmentCountsForSession,
  assignmentEditSharingNotice,
  assignmentSectionForSession,
  assignmentSharingLabel,
  applyHomeworkCheck,
  assignmentForSubject,
  bottomNavigationActiveTab,
  buildCommonAssignmentView,
  buildCommonExamView,
  calendarMonthDays,
  cancelAssignmentTarget,
  cancelExamTarget,
  canOpenScheduleRow,
  classroomReminderMonthlyCounts,
  classroomRemindersForSession,
  classroomReminderSessionKey,
  classroomReminderWeightsForMonth,
  calculateDrawWeight,
  clampManualDrawWeightsByMonth,
  createWeightedDrawPool,
  completeExamMakeup,
  completeHomeworkSubmission,
  courseFromSelection,
  courseFromTeachingClass,
  courseDataKey,
  createEmptyTeachingClassSettings,
  createEmptyManagedScheduleSlots,
  createEmptyScheduleManagementSettings,
  createDefaultManagedScheduleTimes,
  createDataBackupEnvelope,
  createSessionSnapshot,
  createDefaultAcademicPeriodSettings,
  createDemoWeekdayCourses,
  dateFromKey,
  dateRelation,
  deferAssignmentTarget,
  deferExamTarget,
  examEditSharingNotice,
  examClassDetail,
  examSharingLabel,
  findNextCourseOccurrence,
  getScheduleView,
  getScheduleViewForDate,
  groupTeachingClasses,
  groupPendingExamMakeups,
  homeworkCheckKey,
  homeworkTargetForSession,
  hasScheduleOverride,
  linkedCourseState,
  localDateKey,
  managedScheduleSlotsForDate,
  managedScheduleTimesForAcademicYear,
  managedScheduleVersionsForAcademicYear,
  managedScheduleVersionsWithRanges,
  normalizeHomeworkSubmissionRecords,
  normalizeAcademicPeriodSettings,
  normalizeClassroomRecords,
  normalizeTeachingClassSettings,
  parseTeachingClassSettings,
  parseScheduleManagementSettings,
  parseVacantSeatInput,
  pendingExamMakeupsForCourse,
  pendingHomeworkSubmissionsForCourse,
  pickWeightedDrawSeat,
  removeScheduleOverride,
  recordSectionsForSession,
  resolveExamAttendanceSession,
  resolveIndependentAssignmentTimes,
  resolveIndependentExamTimes,
  resolveExamTargets,
  resolveAssignmentTargets,
  resolveAssignmentCheckSession,
  resolveManualDrawWeight,
  saveExamCheck,
  saveAssignmentCheck,
  scheduleOverrideKey,
  scheduleSlotsForDate,
  selectedDateAfterEvent,
  seedDemoExamsOnce,
  setScheduleOverride,
  sessionScheduleState,
  shiftAcademicPeriodSettingsYear,
  shouldSuppressLongPressClick,
  shouldShowBottomNavigation,
  summarizeExamSeatStates,
  summarizeSeatStates,
  teachingClassDisplayLabel,
  teachingClassRoster,
  teachingClassesForAcademicYear,
  toggleSeatState,
  drawCandidateSeats,
  undoClassroomReminder,
  updateManagedScheduleCell,
  updateManagedScheduleTimesForAcademicYear,
  updateAssignmentTargetSchedule,
  updateExamTargetSchedule,
  upsertTeachingClassForAcademicYear,
  upsertManagedScheduleVersionForAcademicYear,
  upsertExamDefinition,
  upsertAssignmentDefinition,
  validateAcademicPeriodSettings,
  validateDataBackupEnvelope,
  validateManagedScheduleTimes,
  validateManagedScheduleVersionDraft,
  validateTeachingClassDraft
} from '../preview-v2/core.mjs';

test('本機備份使用固定應用程式、版本、模式與五個資料區塊', () => {
  const payload = {
    scheduleOverrides: {},
    academicPeriodSettings: null,
    teachingClassSettings: null,
    scheduleManagementSettings: null,
    classroomRecords: {
      assignments: {}, exams: {}, courses: {}, reminders: {}, drawSessions: {}, meta: {}
    }
  };
  const envelope = createDataBackupEnvelope({
    dataProfile: 'formal',
    exportedAt: '2026-08-29T08:00:00.000Z',
    payload
  });
  assert.equal(envelope.appId, DATA_BACKUP_APP_ID);
  assert.equal(envelope.schemaVersion, DATA_BACKUP_SCHEMA_VERSION);
  assert.equal(envelope.dataProfile, 'formal');
  assert.deepEqual(envelope.payload, payload);
  assert.equal(validateDataBackupEnvelope(envelope, 'formal').valid, true);
});

test('本機備份拒絕跨模式、錯誤版本與不完整資料，避免混入正式資料', () => {
  const valid = createDataBackupEnvelope({
    dataProfile: 'test',
    exportedAt: '2026-08-29T08:00:00.000Z',
    payload: {
      scheduleOverrides: {},
      academicPeriodSettings: null,
      teachingClassSettings: null,
      scheduleManagementSettings: null,
      classroomRecords: { assignments: {}, exams: {}, courses: {}, reminders: {}, drawSessions: {} }
    }
  });
  assert.equal(validateDataBackupEnvelope(valid, 'formal').code, 'profile-mismatch');
  assert.equal(validateDataBackupEnvelope({ ...valid, schemaVersion: 99 }, 'test').code, 'unsupported-version');
  const incomplete = structuredClone(valid);
  delete incomplete.payload.classroomRecords;
  assert.equal(validateDataBackupEnvelope(incomplete, 'test').code, 'missing-fields');

  const nestedDamage = structuredClone(valid);
  nestedDamage.payload.classroomRecords.assignments = { bad: null };
  assert.equal(validateDataBackupEnvelope(nestedDamage, 'test').code, 'invalid-classroom-records');

  const brokenTarget = structuredClone(valid);
  brokenTarget.payload.classroomRecords.assignments = {
    homework: { id: 'homework', title: '作業', targets: { course: { course: null, submissions: {} } } }
  };
  assert.equal(validateDataBackupEnvelope(brokenTarget, 'test').code, 'invalid-classroom-records');
});

test('學年期間固定依暑輔、上學期、寒輔、下學期排序', () => {
  assert.deepEqual(ACADEMIC_PERIOD_DEFINITIONS.map(({ id, label }) => [id, label]), [
    ['summer', '暑輔'],
    ['firstSemester', '上學期'],
    ['winter', '寒輔'],
    ['secondSemester', '下學期']
  ]);
  const settings = createDefaultAcademicPeriodSettings(115);
  assert.equal(settings.academicYear, 115);
  assert.deepEqual(settings.periods.map(({ id, enabled }) => [id, enabled]), [
    ['summer', true],
    ['firstSemester', true],
    ['winter', false],
    ['secondSemester', true]
  ]);
});

test('課表管理固定顯示星期一至五與第 1～8 節', () => {
  assert.deepEqual(MANAGED_SCHEDULE_WEEKDAYS.map((day) => day.id), ['1', '2', '3', '4', '5']);
  assert.deepEqual(DEFAULT_MANAGED_SCHEDULE_TIMES.map((period) => period.period), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(DEFAULT_MANAGED_SCHEDULE_TIMES.at(-1), { id: 'p8', period: 8, start: '16:10', end: '17:00' });
  const slots = createEmptyManagedScheduleSlots();
  assert.equal(Object.values(slots).flatMap((day) => Object.values(day)).length, 40);
  assert.equal(Object.values(slots).flatMap((day) => Object.values(day)).every((value) => value === null), true);
});

test('今日課表由授課班級與生效版本組合，保留八節與單日調課', () => {
  const class805 = { id: 'class-805-chem', system: 'junior', grade: 'j8', className: '5', subject: '理化', lastSeat: 52, vacantSeats: [4, 36] };
  const classA = { id: 'class-s2-a-physics', system: 'senior', grade: 's2', className: '甲', subject: '物理', lastSeat: 48, vacantSeats: [2, 11] };
  const slots = createEmptyManagedScheduleSlots();
  slots['1'].p1 = class805.id;
  slots['1'].p8 = classA.id;
  const version = { id: 'active-v1', periodId: 'firstSemester', startDate: '2026-08-31', title: '上學期版', times: createDefaultManagedScheduleTimes(), slots, createdAt: '2026-08-29T08:00:00' };
  const monday = managedScheduleSlotsForDate(version, [class805, classA], {}, '2026-08-31');
  assert.equal(monday.length, 8);
  assert.equal(monday[0].course.teachingClassId, class805.id);
  assert.equal(monday[0].course.classLabel, '805班');
  assert.equal(monday[7].course.teachingClassId, classA.id);
  assert.equal(monday[7].period, 8);
  const override = { [scheduleOverrideKey('2026-08-31', 'p2')]: { ...courseFromTeachingClass(classA), classLabel: '舊班級名稱', subject: '舊科目名稱' } };
  const adjusted = managedScheduleSlotsForDate(version, [class805, classA], override, '2026-08-31');
  assert.equal(adjusted[1].adjusted, true);
  assert.equal(adjusted[1].course.teachingClassId, classA.id);
  assert.equal(adjusted[1].course.classLabel, '高二甲班');
  assert.equal(adjusted[1].course.subject, '物理');
  assert.deepEqual(teachingClassRoster(class805), {
    lastSeat: 52,
    vacantSeats: [4, 36],
    allSeats: Array.from({ length: 52 }, (_, index) => index + 1),
    activeSeats: Array.from({ length: 52 }, (_, index) => index + 1).filter((seat) => ![4, 36].includes(seat))
  });
});

test('找下次上課會逐日切換生效版本，不沿用舊版整週課表', () => {
  const academic = createDefaultAcademicPeriodSettings(115);
  const teachingClass = { id: 'class-805-chem', system: 'junior', grade: 'j8', className: '5', subject: '理化', lastSeat: 52, vacantSeats: [4, 36] };
  const courseKey = courseDataKey(courseFromTeachingClass(teachingClass));
  const firstSlots = createEmptyManagedScheduleSlots();
  firstSlots['1'].p1 = teachingClass.id;
  const secondSlots = createEmptyManagedScheduleSlots();
  secondSlots['1'].p8 = teachingClass.id;
  let settings = createEmptyScheduleManagementSettings();
  settings = upsertManagedScheduleVersionForAcademicYear(settings, 115, { id: 'v1', periodId: 'firstSemester', startDate: '2026-08-31', title: '第一週', times: createDefaultManagedScheduleTimes(), slots: firstSlots, createdAt: '' });
  settings = upsertManagedScheduleVersionForAcademicYear(settings, 115, { id: 'v2', periodId: 'firstSemester', startDate: '2026-09-07', title: '第二週', times: createDefaultManagedScheduleTimes(), slots: secondSlots, createdAt: '' });
  const provider = (dateKey) => managedScheduleSlotsForDate(
    activeManagedScheduleVersion(settings, 115, dateFromKey(dateKey), academic),
    [teachingClass],
    {},
    dateKey
  );
  const next = findNextCourseOccurrence(provider, courseKey, '2026-09-05', null, 7);
  assert.deepEqual(next, { dateKey: '2026-09-07', slotId: 'p8', period: 8, start: '16:10', end: '17:00' });
});

test('八節時間可修改，但格式、先後與重疊都會被阻擋', () => {
  const valid = createDefaultManagedScheduleTimes();
  valid[7] = { ...valid[7], start: '16:20', end: '17:10' };
  assert.equal(validateManagedScheduleTimes(valid).valid, true);
  const reversed = valid.map((period) => ({ ...period }));
  reversed[1] = { ...reversed[1], start: '10:00', end: '09:10' };
  assert.equal(validateManagedScheduleTimes(reversed).errors.some((error) => error.code === 'time-order'), true);
  const overlap = createDefaultManagedScheduleTimes();
  overlap[1] = { ...overlap[1], start: '08:50' };
  assert.equal(validateManagedScheduleTimes(overlap).errors.some((error) => error.code === 'time-overlap'), true);
});

test('課表版本依學年度隔離，損壞或重複版本資料不會被採用', () => {
  const version = {
    id: 'schedule-115-first-1',
    periodId: 'firstSemester',
    startDate: '2026-08-31',
    title: '上學期・第1版',
    times: createDefaultManagedScheduleTimes(),
    slots: createEmptyManagedScheduleSlots(),
    createdAt: '2026-08-29T12:00:00.000Z'
  };
  const settings = upsertManagedScheduleVersionForAcademicYear(createEmptyScheduleManagementSettings(), 115, version);
  assert.equal(managedScheduleVersionsForAcademicYear(settings, 115).length, 1);
  assert.equal(managedScheduleVersionsForAcademicYear(settings, 116).length, 0);
  assert.equal(parseScheduleManagementSettings(settings).valid, true);
  const duplicate = structuredClone(settings);
  duplicate.byAcademicYear['115'].versions.push({ ...version });
  assert.equal(parseScheduleManagementSettings(duplicate).valid, false);
  assert.equal(parseScheduleManagementSettings({ version: 3, byAcademicYear: {} }).valid, false);
});

test('舊版各課表的節次時間會遷移成學年度共用設定，採用開始日期最新版本', () => {
  const earlyTimes = createDefaultManagedScheduleTimes();
  earlyTimes[0] = { ...earlyTimes[0], start: '08:00' };
  const latestTimes = createDefaultManagedScheduleTimes();
  latestTimes[0] = { ...latestTimes[0], start: '08:20', end: '09:05' };
  latestTimes[1] = { ...latestTimes[1], start: '09:15' };
  const legacy = {
    version: 1,
    byAcademicYear: {
      115: {
        versions: [
          { id: 'early', periodId: 'firstSemester', startDate: '2026-08-31', title: '第一週', times: earlyTimes, slots: createEmptyManagedScheduleSlots(), createdAt: '' },
          { id: 'latest', periodId: 'firstSemester', startDate: '2026-09-07', title: '第二週', times: latestTimes, slots: createEmptyManagedScheduleSlots(), createdAt: '' }
        ]
      }
    }
  };
  const parsed = parseScheduleManagementSettings(legacy);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.migrated, true);
  assert.equal(parsed.settings.version, 2);
  assert.deepEqual(parsed.settings.byAcademicYear['115'].times, latestTimes);
  assert.equal(parsed.settings.byAcademicYear['115'].versions.every((version) => !Object.hasOwn(version, 'times')), true);
  assert.deepEqual(managedScheduleVersionsForAcademicYear(parsed.settings, 115).map((version) => version.times), [latestTimes, latestTimes]);
});

test('新增或修改單一課表版本不會覆寫已存在的學年度節次時間', () => {
  const sharedTimes = createDefaultManagedScheduleTimes();
  sharedTimes[7] = { ...sharedTimes[7], start: '16:20', end: '17:10' };
  const ignoredTimes = createDefaultManagedScheduleTimes();
  ignoredTimes[0] = { ...ignoredTimes[0], start: '07:50' };
  let settings = createEmptyScheduleManagementSettings();
  settings = upsertManagedScheduleVersionForAcademicYear(settings, 115, {
    id: 'first', periodId: 'firstSemester', startDate: '2026-08-31', title: '第一週', times: sharedTimes, slots: createEmptyManagedScheduleSlots(), createdAt: ''
  });
  settings = upsertManagedScheduleVersionForAcademicYear(settings, 115, {
    id: 'second', periodId: 'firstSemester', startDate: '2026-09-07', title: '第二週', times: ignoredTimes, slots: createEmptyManagedScheduleSlots(), createdAt: ''
  });
  assert.deepEqual(managedScheduleTimesForAcademicYear(settings, 115), sharedTimes);
  assert.deepEqual(managedScheduleVersionsForAcademicYear(settings, 115).map((version) => version.times), [sharedTimes, sharedTimes]);
  assert.equal(settings.byAcademicYear['115'].versions.every((version) => !Object.hasOwn(version, 'times')), true);
});

test('節次時間可依學年度分開設定，更新一個學年度不影響其他學年度與課表版本', () => {
  const year115Times = createDefaultManagedScheduleTimes();
  year115Times[0] = { ...year115Times[0], start: '08:00' };
  const year116Times = createDefaultManagedScheduleTimes();
  year116Times[0] = { ...year116Times[0], start: '08:20', end: '09:05' };
  year116Times[1] = { ...year116Times[1], start: '09:15' };
  let settings = createEmptyScheduleManagementSettings();
  settings = upsertManagedScheduleVersionForAcademicYear(settings, 115, {
    id: 'year-115', periodId: 'firstSemester', startDate: '2026-08-31', title: '115 課表', times: year115Times, slots: createEmptyManagedScheduleSlots(), createdAt: ''
  });
  settings = upsertManagedScheduleVersionForAcademicYear(settings, 116, {
    id: 'year-116', periodId: 'firstSemester', startDate: '2027-08-30', title: '116 課表', times: year116Times, slots: createEmptyManagedScheduleSlots(), createdAt: ''
  });
  const updatedTimes = createDefaultManagedScheduleTimes();
  updatedTimes[7] = { ...updatedTimes[7], start: '16:30', end: '17:20' };
  const updated = updateManagedScheduleTimesForAcademicYear(settings, 115, updatedTimes);
  assert.deepEqual(managedScheduleTimesForAcademicYear(updated, 115), updatedTimes);
  assert.deepEqual(managedScheduleTimesForAcademicYear(updated, 116), year116Times);
  assert.deepEqual(managedScheduleVersionsForAcademicYear(updated, 115).map((version) => version.id), ['year-115']);
  assert.deepEqual(managedScheduleVersionsForAcademicYear(updated, 116).map((version) => version.id), ['year-116']);
});

test('損壞的舊版或新版節次資料會判定無效，不會用預設時間掩蓋', () => {
  const legacyTimes = createDefaultManagedScheduleTimes();
  legacyTimes[0] = { ...legacyTimes[0], start: '錯誤' };
  const legacy = {
    version: 1,
    byAcademicYear: {
      115: { versions: [{ id: 'bad-old', periodId: 'firstSemester', startDate: '2026-08-31', title: '舊版', times: legacyTimes, slots: createEmptyManagedScheduleSlots() }] }
    }
  };
  assert.equal(parseScheduleManagementSettings(legacy).valid, false);
  assert.equal(parseScheduleManagementSettings({
    version: 2,
    byAcademicYear: { 115: { times: createDefaultManagedScheduleTimes().slice(0, 7), versions: [] } }
  }).valid, false);
  assert.equal(parseScheduleManagementSettings({
    version: 2,
    byAcademicYear: {
      115: {
        times: createDefaultManagedScheduleTimes(),
        versions: [{ id: 'bad-new', periodId: 'firstSemester', startDate: '2026-08-31', title: '新版', times: createDefaultManagedScheduleTimes(), slots: createEmptyManagedScheduleSlots() }]
      }
    }
  }).valid, false);
});

test('同期間的新版本會結束上一版，手機日期只選取當日有效版本', () => {
  const academic = createDefaultAcademicPeriodSettings(115);
  const base = {
    periodId: 'firstSemester',
    times: createDefaultManagedScheduleTimes(),
    slots: createEmptyManagedScheduleSlots(),
    createdAt: '2026-08-29T12:00:00.000Z'
  };
  let settings = createEmptyScheduleManagementSettings();
  settings = upsertManagedScheduleVersionForAcademicYear(settings, 115, {
    ...base, id: 'first-week', startDate: '2026-08-31', title: '上學期・第1版'
  });
  settings = upsertManagedScheduleVersionForAcademicYear(settings, 115, {
    ...base, id: 'regular', startDate: '2026-09-07', title: '上學期・第2版'
  });
  const ranged = managedScheduleVersionsWithRanges(settings, 115, academic);
  assert.deepEqual(ranged.map(({ id, endDate }) => [id, endDate]), [
    ['first-week', '2026-09-06'],
    ['regular', '2027-01-20']
  ]);
  assert.equal(activeManagedScheduleVersion(settings, 115, new Date(2026, 8, 6, 12), academic)?.id, 'first-week');
  assert.equal(activeManagedScheduleVersion(settings, 115, new Date(2026, 8, 7, 12), academic)?.id, 'regular');
  assert.equal(activeManagedScheduleVersion(settings, 115, new Date(2026, 7, 29, 12), academic), null);
  const duplicateDate = validateManagedScheduleVersionDraft({ periodId: 'firstSemester', startDate: '2026-09-07' }, ranged, academic);
  assert.equal(duplicateDate.errors.some((error) => error.code === 'duplicate-start'), true);
});

test('修改整週課表只變更指定星期與節次，來源版本維持不變', () => {
  const version = {
    id: 'isolated-cell',
    periodId: 'firstSemester',
    startDate: '2026-08-31',
    title: '上學期・第1版',
    times: createDefaultManagedScheduleTimes(),
    slots: createEmptyManagedScheduleSlots()
  };
  const next = updateManagedScheduleCell(version, '3', 'p8', 'teaching-class-805-physics');
  assert.equal(next.slots['3'].p8, 'teaching-class-805-physics');
  assert.equal(next.slots['3'].p7, null);
  assert.equal(next.slots['2'].p8, null);
  assert.equal(version.slots['3'].p8, null);
});

test('依本地手機日期判斷目前期間，不使用 UTC 日期切片', () => {
  const settings = createDefaultAcademicPeriodSettings(115);
  const localMidnight = new Date(2026, 7, 31, 0, 5, 0, 0);
  assert.equal(academicPeriodForLocalDate(settings, localMidnight)?.id, 'firstSemester');
});

test('期間的開始與結束日期都包含在判斷範圍內', () => {
  const settings = createDefaultAcademicPeriodSettings(115);
  assert.equal(academicPeriodForLocalDate(settings, '2026-08-31')?.label, '上學期');
  assert.equal(academicPeriodForLocalDate(settings, '2027-01-20')?.label, '上學期');
});

test('關閉暑輔與寒輔後，日期草稿保留但不參與期間判斷', () => {
  const settings = createDefaultAcademicPeriodSettings(115);
  settings.periods.find((period) => period.id === 'summer').enabled = false;
  assert.equal(settings.periods.find((period) => period.id === 'summer').startDate, '2026-07-20');
  assert.equal(academicPeriodForLocalDate(settings, '2026-07-25'), null);
  assert.equal(academicPeriodForLocalDate(settings, '2027-01-28'), null);
});

test('日期落在期間空檔時明確回傳沒有目前期間', () => {
  const settings = createDefaultAcademicPeriodSettings(115);
  assert.equal(academicPeriodForLocalDate(settings, '2026-08-28'), null);
  assert.equal(academicPeriodForLocalDate(settings, '2027-02-10'), null);
});

test('學年期間驗證必填、日期順序與啟用期間重疊', () => {
  const missing = createDefaultAcademicPeriodSettings(115);
  missing.periods.find((period) => period.id === 'firstSemester').startDate = '';
  assert.equal(validateAcademicPeriodSettings(missing).fieldErrors['firstSemester.startDate'], '上學期需要開始日期。');

  const reversed = createDefaultAcademicPeriodSettings(115);
  reversed.periods.find((period) => period.id === 'secondSemester').startDate = '2027-07-01';
  assert.equal(validateAcademicPeriodSettings(reversed).errors.some((error) => error.code === 'reversed-range'), true);

  const overlapping = createDefaultAcademicPeriodSettings(115);
  overlapping.periods.find((period) => period.id === 'firstSemester').startDate = '2026-08-21';
  const overlapValidation = validateAcademicPeriodSettings(overlapping);
  assert.equal(overlapValidation.valid, false);
  assert.equal(overlapValidation.errors.some((error) => error.code === 'overlap'), true);
});

test('舊版物件格式會正規化為固定順序且不保存衍生的目前期間', () => {
  const legacy = {
    schoolYear: '116',
    currentPeriod: 'winter',
    periods: {
      summerBreak: { active: false, start: '2027-07-21', end: '2027-08-20' },
      first: { active: false, start: '2027-08-30', end: '2028-01-19' },
      winterBreak: { active: true, start: '2028-01-22', end: '2028-02-02' },
      second: { active: false, start: '2028-02-14', end: '2028-06-29' }
    }
  };
  assert.equal(validateAcademicPeriodSettings(legacy).valid, true);
  const normalized = normalizeAcademicPeriodSettings(legacy);
  assert.equal(normalized.version, 1);
  assert.equal(normalized.academicYear, 116);
  assert.deepEqual(normalized.periods.map(({ id, enabled }) => [id, enabled]), [
    ['summer', false],
    ['firstSemester', true],
    ['winter', true],
    ['secondSemester', true]
  ]);
  assert.equal(Object.hasOwn(normalized, 'currentPeriod'), false);
});

test('舊版選填期間 active 開啟但日期損壞時不可冒充有效設定', () => {
  const legacy = {
    schoolYear: '116',
    periods: {
      summerBreak: { active: true, start: '', end: '' },
      first: { start: '2027-08-30', end: '2028-01-19' },
      winterBreak: { active: false, start: '', end: '' },
      second: { start: '2028-02-14', end: '2028-06-29' }
    }
  };
  const validation = validateAcademicPeriodSettings(legacy);
  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some((error) => error.periodId === 'summer' && error.code === 'required-start'), true);
  assert.equal(validation.errors.some((error) => error.periodId === 'summer' && error.code === 'required-end'), true);
});

test('變更學年度會平移全部日期，閏日遇到非閏年安全調整', () => {
  const settings = createDefaultAcademicPeriodSettings(112);
  const secondSemester = settings.periods.find((period) => period.id === 'secondSemester');
  secondSemester.startDate = '2024-02-29';
  const shifted = shiftAcademicPeriodSettingsYear(settings, 113);
  assert.equal(shifted.academicYear, 113);
  assert.equal(shifted.periods.find((period) => period.id === 'summer').startDate, '2024-07-20');
  assert.equal(shifted.periods.find((period) => period.id === 'secondSemester').startDate, '2025-02-28');
  assert.equal(shifted.periods.find((period) => period.id === 'winter').enabled, false);
});

test('四鍵底部導覽將本堂課歸在今日，其餘主頁各自標示', () => {
  assert.equal(bottomNavigationActiveTab('today'), 'today');
  assert.equal(bottomNavigationActiveTab('course'), 'today');
  assert.equal(bottomNavigationActiveTab('assignment-hub'), 'assignment');
  assert.equal(bottomNavigationActiveTab('exam-hub'), 'exam');
  assert.equal(bottomNavigationActiveTab('settings'), 'settings');
  assert.equal(bottomNavigationActiveTab('draw'), '');
});

test('底部導覽只在五個主頁且沒有彈出視窗時顯示', () => {
  for (const page of ['today', 'course', 'assignment-hub', 'exam-hub', 'settings']) {
    assert.equal(shouldShowBottomNavigation(page), true);
    assert.equal(shouldShowBottomNavigation(page, true), false);
  }
  for (const page of ['homework', 'exam-attendance', 'reminders', 'draw', 'assignment-form', 'exam-form', 'academic-period-settings', 'teaching-classes', 'teaching-class-form', 'data-sync']) {
    assert.equal(shouldShowBottomNavigation(page), false);
  }
});

test('空號可混用常見分隔符、全形數字，並去重排序', () => {
  assert.deepEqual(parseVacantSeatInput('36、4, 4；１２ 5，8;7'), {
    seats: [4, 5, 7, 8, 12, 36],
    invalidTokens: []
  });
  assert.deepEqual(parseVacantSeatInput('4-6、2.5、甲'), {
    seats: [],
    invalidTokens: ['4-6', '2.5', '甲']
  });
});

test('授課班級驗證座號邊界、空號越界、全部空號與非法格式', () => {
  const validOne = validateTeachingClassDraft({ system: 'junior', grade: 'j8', className: '1', subject: '理化', lastSeat: 1, vacantSeatsInput: '' });
  const validSixty = validateTeachingClassDraft({ system: 'senior', grade: 's2', className: '99', subject: '自訂物理', lastSeat: 60, vacantSeatsInput: '4、36' });
  assert.equal(validOne.valid, true);
  assert.equal(validSixty.valid, true);
  assert.equal(validateTeachingClassDraft({ system: 'junior', grade: 'j8', className: '5', subject: '理化', lastSeat: 50, vacantSeatsInput: '51' }).errors.some((error) => error.code === 'vacant-range'), true);
  assert.equal(validateTeachingClassDraft({ system: 'junior', grade: 'j8', className: '5', subject: '理化', lastSeat: 2, vacantSeatsInput: '1、2' }).errors.some((error) => error.code === 'all-vacant'), true);
  assert.equal(validateTeachingClassDraft({ system: 'junior', grade: 'j8', className: '5', subject: '理化', lastSeat: 50, vacantSeatsInput: '4-6' }).errors.some((error) => error.code === 'vacant-format'), true);
});

test('班級名稱接受數字與文字，並正規化全形、空白和結尾班字', () => {
  const numeric = validateTeachingClassDraft({ system: 'junior', grade: 'j8', className: '０５班', subject: '理化', lastSeat: 50, vacantSeatsInput: '' });
  const letter = validateTeachingClassDraft({ system: 'junior', grade: 'j8', className: ' ａ 班 ', subject: '理化', lastSeat: 50, vacantSeatsInput: '' });
  const letters = validateTeachingClassDraft({ system: 'junior', grade: 'j8', className: ' ab班 ', subject: '理化', lastSeat: 50, vacantSeatsInput: '' });
  const named = validateTeachingClassDraft({ system: 'junior', grade: 'j8', className: ' 資優班班 ', subject: '理化', lastSeat: 50, vacantSeatsInput: '' });
  assert.equal(numeric.record.className, '5');
  assert.equal(letter.record.className, 'A');
  assert.equal(letters.record.className, 'AB');
  assert.equal(named.record.className, '資優');
  assert.equal(validateTeachingClassDraft({ system: 'junior', grade: 'j8', className: ' 班 ', subject: '理化', lastSeat: 50 }).errors.some((error) => error.code === 'class-required'), true);
  assert.equal(validateTeachingClassDraft({ system: 'junior', grade: 'j8', className: '123', subject: '理化', lastSeat: 50 }).errors.some((error) => error.code === 'class-number'), true);
  assert.equal(validateTeachingClassDraft({ system: 'junior', grade: 'j8', className: '甲'.repeat(21), subject: '理化', lastSeat: 50 }).errors.some((error) => error.code === 'class-length'), true);
});

test('同班同科阻擋重複，但科目正規化後同班不同科仍可保存', () => {
  const existing = [{ id: 'physics-lab', system: 'senior', grade: 's2', className: '5', subject: '物理 實驗', lastSeat: 50, vacantSeats: [4] }];
  const duplicate = validateTeachingClassDraft({ system: 'senior', grade: 's2', className: '5', subject: '物理　實驗', lastSeat: 50, vacantSeatsInput: '4' }, existing);
  const otherSubject = validateTeachingClassDraft({ system: 'senior', grade: 's2', className: '5', subject: '選修物理', lastSeat: 50, vacantSeatsInput: '4' }, existing);
  assert.equal(duplicate.valid, false);
  assert.equal(duplicate.errors.some((error) => error.code === 'duplicate'), true);
  assert.equal(otherSubject.valid, true);
  assert.equal(otherSubject.record.subject, '選修物理');

  const namedExisting = [{ id: 'named', system: 'junior', grade: 'j8', className: '甲', subject: '理化', lastSeat: 50, vacantSeats: [] }];
  const namedDuplicate = validateTeachingClassDraft({ system: 'junior', grade: 'j8', className: ' 甲班 ', subject: '理化', lastSeat: 50, vacantSeatsInput: '' }, namedExisting);
  assert.equal(namedDuplicate.errors.some((error) => error.code === 'duplicate'), true);
});

test('同一實體班的不同科目會共用更新後的座號範圍與空號', () => {
  let settings = createEmptyTeachingClassSettings();
  settings = upsertTeachingClassForAcademicYear(settings, 115, { id: 'a', system: 'junior', grade: 'j8', className: '5', subject: '理化', lastSeat: 50, vacantSeats: [4] });
  settings = upsertTeachingClassForAcademicYear(settings, 115, { id: 'b', system: 'junior', grade: 'j8', className: '5', subject: '自然探究', lastSeat: 52, vacantSeats: [4, 36] });
  const records = teachingClassesForAcademicYear(settings, 115);
  assert.equal(records.length, 2);
  assert.deepEqual(records.map(({ lastSeat, vacantSeats }) => [lastSeat, vacantSeats]), [[52, [4, 36]], [52, [4, 36]]]);

  settings = upsertTeachingClassForAcademicYear(settings, 115, { id: 'named-a', system: 'junior', grade: 'j8', className: '甲班', subject: '理化', lastSeat: 48, vacantSeats: [2] });
  settings = upsertTeachingClassForAcademicYear(settings, 115, { id: 'named-b', system: 'junior', grade: 'j8', className: ' 甲 ', subject: '自然探究', lastSeat: 49, vacantSeats: [3, 7] });
  const namedRecords = teachingClassesForAcademicYear(settings, 115).filter((record) => record.className === '甲');
  assert.equal(namedRecords.length, 2);
  assert.deepEqual(namedRecords.map(({ lastSeat, vacantSeats }) => [lastSeat, vacantSeats]), [[49, [3, 7]], [49, [3, 7]]]);
});

test('班級與科目的 tuple key 不會因冒號內容碰撞，HTML 文字只作一般資料保存', () => {
  let settings = createEmptyTeachingClassSettings();
  settings = upsertTeachingClassForAcademicYear(settings, 115, { id: 'tuple-a', system: 'junior', grade: 'j8', className: 'A:B', subject: 'C', lastSeat: 50, vacantSeats: [] });
  settings = upsertTeachingClassForAcademicYear(settings, 115, { id: 'tuple-b', system: 'junior', grade: 'j8', className: 'A', subject: 'B:C', lastSeat: 50, vacantSeats: [] });
  settings = upsertTeachingClassForAcademicYear(settings, 115, { id: 'html', system: 'junior', grade: 'j8', className: '<甲>', subject: '<理化>', lastSeat: 50, vacantSeats: [] });
  const records = teachingClassesForAcademicYear(settings, 115);
  assert.deepEqual(records.map((record) => record.id), ['tuple-a', 'tuple-b', 'html']);
  assert.equal(teachingClassDisplayLabel(records.find((record) => record.id === 'html')), '八年級<甲>班');
});

test('授課班級依學年度隔離，更新新年度不會刪除舊年度', () => {
  let settings = createEmptyTeachingClassSettings();
  settings = upsertTeachingClassForAcademicYear(settings, 115, { id: 'year-115', system: 'junior', grade: 'j8', className: '5', subject: '理化', lastSeat: 50, vacantSeats: [] });
  settings = upsertTeachingClassForAcademicYear(settings, 116, { id: 'year-116', system: 'senior', grade: 's2', className: '3', subject: '物理', lastSeat: 48, vacantSeats: [2] });
  assert.deepEqual(teachingClassesForAcademicYear(settings, 115).map((record) => record.id), ['year-115']);
  assert.deepEqual(teachingClassesForAcademicYear(settings, 116).map((record) => record.id), ['year-116']);
  assert.deepEqual(Object.keys(settings.byAcademicYear).sort(), ['115', '116']);
});

test('授課班級修改保留穩定 id，自訂科目可經儲存解析往返', () => {
  let settings = upsertTeachingClassForAcademicYear(createEmptyTeachingClassSettings(), 115, { id: 'stable-id', system: 'senior', grade: 's2', className: '5', subject: '量子 專題', lastSeat: 50, vacantSeats: [4] });
  settings = upsertTeachingClassForAcademicYear(settings, 115, { id: 'stable-id', system: 'senior', grade: 's2', className: '6', subject: '量子　專題', lastSeat: 49, vacantSeats: [3] });
  const parsed = parseTeachingClassSettings(JSON.parse(JSON.stringify(settings)));
  assert.equal(parsed.valid, true);
  assert.equal(parsed.settings.byAcademicYear['115'].length, 1);
  assert.deepEqual(parsed.settings.byAcademicYear['115'][0], { id: 'stable-id', system: 'senior', grade: 's2', className: '6', subject: '量子 專題', lastSeat: 49, vacantSeats: [3] });
});

test('舊版授課班級可安全遷移，損壞或缺少穩定 id 的新版資料回到空白', () => {
  const legacy = parseTeachingClassSettings({ schoolYear: 114, classes: [{ system: 'junior', grade: 'j8', classNo: 5, subject: '理化', seatCount: 50, disabledSeats: '36、4' }] });
  assert.equal(legacy.valid, true);
  assert.equal(legacy.migrated, true);
  assert.deepEqual(legacy.settings.byAcademicYear['114'][0].vacantSeats, [4, 36]);
  assert.match(legacy.settings.byAcademicYear['114'][0].id, /^class-/);

  const numericCurrent = parseTeachingClassSettings({ version: 1, byAcademicYear: { 115: [{ id: 'numeric-old', system: 'junior', grade: 'j8', className: 12, subject: '理化', lastSeat: 50, vacantSeats: [] }] } });
  assert.equal(numericCurrent.valid, true);
  assert.equal(numericCurrent.settings.byAcademicYear['115'][0].className, '12');
  assert.equal(teachingClassDisplayLabel(numericCurrent.settings.byAcademicYear['115'][0]), '812班');

  const missingId = parseTeachingClassSettings({ version: 1, byAcademicYear: { 115: [{ system: 'junior', grade: 'j8', className: '5', subject: '理化', lastSeat: 50, vacantSeats: [] }] } });
  const malformed = parseTeachingClassSettings({ version: 1, byAcademicYear: { 115: [{ id: 'bad', system: 'junior', grade: 'j8', className: '5', subject: '理化', lastSeat: 50, vacantSeats: [51] }] } });
  assert.deepEqual(missingId, { valid: false, migrated: false, settings: createEmptyTeachingClassSettings() });
  assert.deepEqual(malformed, { valid: false, migrated: false, settings: createEmptyTeachingClassSettings() });
  assert.deepEqual(normalizeTeachingClassSettings({ nonsense: true }), createEmptyTeachingClassSettings());
});

test('授課班級固定依學制、年級、科目與自然班名排序，數字與文字班顯示正確', () => {
  const records = [
    { id: 'senior', system: 'senior', grade: 's1', className: '2', subject: '物理', lastSeat: 50, vacantSeats: [] },
    { id: 'junior-12', system: 'junior', grade: 'j8', className: '12', subject: '理化', lastSeat: 50, vacantSeats: [] },
    { id: 'junior-5', system: 'junior', grade: 'j8', className: '5', subject: '理化', lastSeat: 50, vacantSeats: [] },
    { id: 'junior-a', system: 'junior', grade: 'j8', className: 'A班', subject: '理化', lastSeat: 50, vacantSeats: [] },
    { id: 'junior-gifted', system: 'junior', grade: 'j8', className: '資優', subject: '理化', lastSeat: 50, vacantSeats: [] },
    { id: 'junior-alpha', system: 'junior', grade: 'j8', className: '甲', subject: '理化', lastSeat: 50, vacantSeats: [] },
    { id: 'junior-bio', system: 'junior', grade: 'j7', className: '3', subject: '生物', lastSeat: 50, vacantSeats: [] }
  ];
  const groups = groupTeachingClasses(records);
  assert.deepEqual(groups.map((group) => `${group.system}:${group.grade}:${group.subject}`), ['junior:j7:生物', 'junior:j8:理化', 'senior:s1:物理']);
  assert.deepEqual(groups[1].records.map((record) => record.className), ['5', '12', '甲', '資優', 'A']);
  assert.equal(teachingClassDisplayLabel(groups[1].records[0]), '805班');
  assert.equal(teachingClassDisplayLabel(groups[1].records[1]), '812班');
  assert.equal(teachingClassDisplayLabel(groups[1].records[2]), '八年級甲班');
  assert.equal(teachingClassDisplayLabel(groups[1].records[3]), '八年級資優班');
  assert.equal(teachingClassDisplayLabel(groups[1].records[4]), '八年級A班');
  assert.equal(teachingClassDisplayLabel(groups[2].records[0]), '高一2班');
});

test('抽籤權重由基本、缺交、當月提醒與手動加權組成，並受上限限制', () => {
  assert.equal(calculateDrawWeight({ homework: 2, reminder: 2, manual: 1, cap: 6 }), 6);
  assert.equal(calculateDrawWeight({ homework: 1, reminder: 0, manual: 0, cap: 6 }), 2);
  assert.equal(calculateDrawWeight({ homework: -2, reminder: -1, manual: -3, cap: 6 }), 1);
});

test('手動月加權設定不超過總上限減一，實際套用會讓位給作業與提醒', () => {
  assert.deepEqual(resolveManualDrawWeight({ manual: 9, cap: 6 }), {
    requested: 5,
    applied: 5,
    maxRequested: 5,
    remaining: 5,
    limited: false,
    total: 6
  });
  assert.deepEqual(resolveManualDrawWeight({ homework: 2, reminder: 1, manual: 5, cap: 6 }), {
    requested: 5,
    applied: 2,
    maxRequested: 5,
    remaining: 2,
    limited: true,
    total: 6
  });
  assert.deepEqual(resolveManualDrawWeight({ homework: 4, reminder: 2, manual: 5, cap: 6 }), {
    requested: 5,
    applied: 0,
    maxRequested: 5,
    remaining: 0,
    limited: true,
    total: 6
  });
});

test('降低權重上限會正規化所有月份的手動設定且不修改原資料', () => {
  const original = {
    '2026-08': { 1: 9, 2: 4 },
    '2026-09': { 1: 7, 3: 0, 5: '無效' }
  };
  assert.deepEqual(clampManualDrawWeightsByMonth(original, 6), {
    '2026-08': { 1: 5, 2: 4 },
    '2026-09': { 1: 5 }
  });
  assert.deepEqual(original, {
    '2026-08': { 1: 9, 2: 4 },
    '2026-09': { 1: 7, 3: 0, 5: '無效' }
  });
});

test('不重複抽籤會排除本輪已抽與暫不抽取座號，可重複模式只套用暫不抽取', () => {
  const activeSeats = [1, 2, 3, 5];
  assert.deepEqual(drawCandidateSeats(activeSeats, [2], [3], false), [1, 5]);
  assert.deepEqual(drawCandidateSeats(activeSeats, [2], [3], true), [1, 3, 5]);
});

test('加權卡池保留各座號原因，固定亂數能落在正確權重區間', () => {
  const pool = createWeightedDrawPool({
    activeSeats: [1, 2, 3],
    excludedSeats: [3],
    homeworkWeights: { 2: 1 },
    reminderWeights: { 2: 1 },
    manualWeights: { 2: 1 },
    cap: 6
  });
  assert.deepEqual(pool, [
    { seat: 1, homework: 0, reminder: 0, manual: 0, manualRequested: 0, weight: 1 },
    { seat: 2, homework: 1, reminder: 1, manual: 1, manualRequested: 1, weight: 4 }
  ]);
  assert.equal(pickWeightedDrawSeat(pool, 0), 1);
  assert.equal(pickWeightedDrawSeat(pool, 0.2), 2);
  assert.equal(pickWeightedDrawSeat([], 0.5), null);
});

test('關閉本節加權後每位候選人都是一張，仍遵守排除與本輪不重複', () => {
  const pool = createWeightedDrawPool({
    activeSeats: [1, 2, 3, 5],
    excludedSeats: [3],
    drawnSeats: [5],
    allowRepeat: false,
    useWeighting: false,
    homeworkWeights: { 2: 3 },
    reminderWeights: { 2: 2 },
    manualWeights: { 2: 4 },
    cap: 10
  });
  assert.deepEqual(pool, [
    { seat: 1, homework: 0, reminder: 0, manual: 0, manualRequested: 0, weight: 1 },
    { seat: 2, homework: 3, reminder: 2, manual: 4, manualRequested: 4, weight: 1 }
  ]);
  assert.equal(pickWeightedDrawSeat(pool, 0.49), 1);
  assert.equal(pickWeightedDrawSeat(pool, 0.5), 2);
  assert.deepEqual(createWeightedDrawPool({
    activeSeats: [1, 2, 3],
    excludedSeats: [3],
    drawnSeats: [2],
    allowRepeat: true,
    useWeighting: false,
    homeworkWeights: { 2: 9 }
  }).map(({ seat, weight }) => ({ seat, weight })), [
    { seat: 1, weight: 1 },
    { seat: 2, weight: 1 }
  ]);
});

test('關閉本節加權不會改寫傳入的缺交、提醒或手動加權資料', () => {
  const homeworkWeights = { 12: 2 };
  const reminderWeights = { 12: 1 };
  const manualWeights = { 12: 3 };
  createWeightedDrawPool({ activeSeats: [12], useWeighting: false, homeworkWeights, reminderWeights, manualWeights, cap: 6 });
  assert.deepEqual(homeworkWeights, { 12: 2 });
  assert.deepEqual(reminderWeights, { 12: 1 });
  assert.deepEqual(manualWeights, { 12: 3 });
  assert.equal(createWeightedDrawPool({ activeSeats: [12], useWeighting: true, homeworkWeights, reminderWeights, manualWeights, cap: 6 })[0].weight, 6);
});

test('卡池只回傳實際套用的手動加權並保留設定值供畫面說明', () => {
  assert.deepEqual(createWeightedDrawPool({
    activeSeats: [8],
    homeworkWeights: { 8: 2 },
    reminderWeights: { 8: 1 },
    manualWeights: { 8: 9 },
    cap: 6
  }), [{ seat: 8, homework: 2, reminder: 1, manual: 2, manualRequested: 5, weight: 6 }]);
});

const slots = [
  { id: 'p1', period: 1, start: '08:10', end: '09:00', course: { classLabel: '805', subject: '理化' } },
  { id: 'p2', period: 2, start: '09:10', end: '10:00', course: null },
  { id: 'p3', period: 3, start: '10:10', end: '11:00', course: { classLabel: '806', subject: '理化' } }
];

function at(hours, minutes) {
  return new Date(2026, 7, 25, hours, minutes);
}

test('手機本地時間判定過去、目前與下一堂', () => {
  const active = getScheduleView(slots, at(8, 30), true);
  assert.equal(active.activeId, 'p1');
  assert.equal(active.rows[0].state, 'current');
  assert.equal(active.rows[1].state, 'empty');

  const between = getScheduleView(slots, at(9, 30), true);
  assert.equal(between.nextId, 'p3');
  assert.equal(between.rows[0].state, 'past');
  assert.equal(between.rows[1].state, 'empty');
  assert.equal(between.rows[2].state, 'next');
});

test('今天所有課程與空堂都能操作，只有 current 帶時間醒目狀態', () => {
  const actionSlots = [
    ...slots,
    { id: 'p4', period: 4, start: '11:10', end: '12:00', course: { classLabel: '807', subject: '理化' } }
  ];
  const duringClass = getScheduleView(actionSlots, at(8, 30), true);
  assert.equal(canOpenScheduleRow(duringClass.rows.find((row) => row.id === 'p1')), true);
  assert.equal(canOpenScheduleRow(duringClass.rows.find((row) => row.id === 'p2')), true);
  assert.equal(canOpenScheduleRow(duringClass.rows.find((row) => row.id === 'p3')), true);

  const betweenClasses = getScheduleView(actionSlots, at(9, 30), true);
  assert.equal(canOpenScheduleRow(betweenClasses.rows.find((row) => row.id === 'p1')), true);
  assert.equal(canOpenScheduleRow(betweenClasses.rows.find((row) => row.id === 'p2')), true);
  assert.equal(canOpenScheduleRow(betweenClasses.rows.find((row) => row.id === 'p3')), true);
  assert.equal(canOpenScheduleRow(betweenClasses.rows.find((row) => row.id === 'p4')), true);
  assert.equal(duringClass.activeId, 'p1');
  assert.equal(duringClass.rows.filter((row) => row.state === 'current').length, 1);
});

test('本地日期 helper 正確處理月年跨界與閏日，不經 UTC 字串解析', () => {
  const leapDay = dateFromKey('2028-02-29');
  assert.deepEqual([leapDay.getFullYear(), leapDay.getMonth(), leapDay.getDate(), leapDay.getHours()], [2028, 1, 29, 12]);
  assert.equal(localDateKey(leapDay), '2028-02-29');
  assert.equal(addDaysToDateKey('2028-02-28', 1), '2028-02-29');
  assert.equal(addDaysToDateKey('2028-02-29', 1), '2028-03-01');
  assert.equal(addDaysToDateKey('2026-12-31', 1), '2027-01-01');
  assert.equal(dateRelation('2026-12-31', dateFromKey('2027-01-01')), 'past');
  assert.equal(dateRelation('2027-01-02', dateFromKey('2027-01-01')), 'future');
});

test('月曆週一開始並正確跨月，今天與選取日分開標示', () => {
  const days = calendarMonthDays(2028, 1, '2028-02-29', '2028-03-01');
  assert.equal(days.length, 42);
  assert.equal(days[0].dateKey, '2028-01-31');
  assert.equal(dateFromKey(days[0].dateKey).getDay(), 1);
  assert.equal(days.find((day) => day.isToday).dateKey, '2028-02-29');
  assert.equal(days.find((day) => day.isSelected).dateKey, '2028-03-01');
  assert.equal(days.filter((day) => day.inMonth).length, 29);
});

test('selected date 只在 reload、選日期或回到今天時改變', () => {
  const now = dateFromKey('2026-08-26');
  assert.equal(selectedDateAfterEvent(null, now, 'reload'), '2026-08-26');
  assert.equal(selectedDateAfterEvent('2026-08-26', now, 'select-date', '2026-09-01'), '2026-09-01');
  for (const event of ['refresh', 'visibilitychange', 'back-schedule']) {
    assert.equal(selectedDateAfterEvent('2026-09-01', dateFromKey('2026-08-27'), event), '2026-09-01');
  }
  assert.equal(selectedDateAfterEvent('2026-09-01', dateFromKey('2026-08-27'), 'go-today'), '2026-08-27');
});

test('最後一堂後與非上課日有明確狀態', () => {
  assert.equal(getScheduleView(slots, at(16, 0), true).headline, '今日課程結束');
  assert.equal(getScheduleView(slots, at(9, 0), false).headline, '今日無課');
});

test('調課 key 只指向當日該節', () => {
  const date = new Date(2026, 7, 25, 23, 50);
  assert.equal(localDateKey(date), '2026-08-25');
  assert.equal(scheduleOverrideKey(date, 'p3'), '2026-08-25:p3');
});

test('未調課時沒有復原條件', () => {
  const targetKey = '2026-08-25:p3';
  assert.equal(hasScheduleOverride({}, targetKey), false);
  assert.equal(hasScheduleOverride({ '2026-08-25:p5': { classLabel: '高二3班' } }, targetKey), false);
});

test('只有 exact override 才具備復原條件', () => {
  const key = '2026-08-25:p3';
  assert.equal(hasScheduleOverride({ [key]: { classLabel: '803班' } }, key), true);
  assert.equal(hasScheduleOverride({ [key]: null }, key), true);
});

test('set override 只更新 exact key，其他日期節次不變', () => {
  const targetKey = '2026-08-25:p3';
  const original = { '2026-08-26:p3': { classLabel: '806班' }, '2026-08-25:p5': { classLabel: '高二3班' } };
  const changed = setScheduleOverride(original, targetKey, { classLabel: '803班', subject: '理化' });
  assert.deepEqual(changed, { ...original, [targetKey]: { classLabel: '803班', subject: '理化' } });
  assert.deepEqual(original, { '2026-08-26:p3': { classLabel: '806班' }, '2026-08-25:p5': { classLabel: '高二3班' } });
});

test('恢復原課表只刪指定 override，不觸碰作業與 session 資料', () => {
  const targetKey = '2026-08-25:p3';
  const overrides = { [targetKey]: { classLabel: '803班' }, '2026-08-25:p5': { classLabel: '高二3班' }, '2026-08-26:p3': { classLabel: '806班' } };
  const homework = { assignments: { a1: { title: '原作業' } }, courses: { '803班・理化': { homeworkWeights: { 8: 1 } } } };
  const session = Object.freeze({ dateKey: '2026-08-25', slotId: 'p3', course: Object.freeze({ classLabel: '805班', subject: '理化' }) });
  const model = { overrides, homework, session };
  const changed = { ...model, overrides: removeScheduleOverride(model.overrides, targetKey) };
  assert.deepEqual(changed.overrides, { '2026-08-25:p5': { classLabel: '高二3班' }, '2026-08-26:p3': { classLabel: '806班' } });
  assert.strictEqual(changed.homework, homework);
  assert.strictEqual(changed.session, session);
  assert.deepEqual(changed.homework, model.homework);
});

test('指定日期課表固定渲染完整節次，且不同日期 override 完全隔離', () => {
  const periods = [
    ['p1', 1, '08:10', '09:00'], ['p2', 2, '09:10', '10:00'], ['p3', 3, '10:10', '11:00'],
    ['p4', 4, '11:10', '12:00'], ['p5', 5, '13:10', '14:00'], ['p6', 6, '14:10', '15:00'], ['p7', 7, '15:10', '16:00']
  ];
  const fixed = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
  const adjustedA = courseFromSelection({ system: 'junior', grade: 'j8', className: '3', subject: '理化' });
  const adjustedB = courseFromSelection({ system: 'senior', grade: 's2', className: '6', subject: '物理' });
  const weekdays = { 2: [fixed, null, null, null, null, null, null] };
  const overrides = {
    '2026-08-25:p2': adjustedA,
    '2026-09-01:p3': adjustedB
  };
  const firstDate = scheduleSlotsForDate(periods, weekdays, overrides, '2026-08-25');
  const secondDate = scheduleSlotsForDate(periods, weekdays, overrides, '2026-09-01');
  assert.equal(firstDate.length, 7);
  assert.equal(firstDate[1].course.classLabel, '803班');
  assert.equal(firstDate[2].course, null);
  assert.equal(secondDate[1].course, null);
  assert.equal(secondDate[2].course.classLabel, '高二6班');
  assert.equal(firstDate[0].course.classLabel, secondDate[0].course.classLabel);
  const courseOverride = setScheduleOverride(overrides, '2026-08-25:p1', adjustedB);
  assert.equal(scheduleSlotsForDate(periods, weekdays, courseOverride, '2026-08-25')[0].course.classLabel, '高二6班');
  assert.equal(scheduleSlotsForDate(periods, weekdays, removeScheduleOverride(courseOverride, '2026-08-25:p1'), '2026-08-25')[0].course.classLabel, fixed.classLabel);
});

test('週末與無固定課表日期仍產生七節空堂，且可調課後精確復原', () => {
  const periods = Array.from({ length: 7 }, (_, index) => [`p${index + 1}`, index + 1, '08:10', '09:00']);
  const makeUpCourse = courseFromSelection({ system: 'senior', grade: 's2', className: '2', subject: '物理' });
  const saturday = '2026-08-29';
  const key = `${saturday}:p4`;
  const emptySlots = scheduleSlotsForDate(periods, {}, {}, saturday);
  assert.equal(emptySlots.length, 7);
  assert.equal(emptySlots.every((slot) => slot.course === null && canOpenScheduleRow(slot)), true);
  const adjusted = setScheduleOverride({}, key, makeUpCourse);
  const adjustedSlots = scheduleSlotsForDate(periods, {}, adjusted, saturday);
  assert.equal(adjustedSlots[3].adjusted, true);
  assert.equal(adjustedSlots[3].course.classLabel, '高二2班');
  const restoredSlots = scheduleSlotsForDate(periods, {}, removeScheduleOverride(adjusted, key), saturday);
  assert.equal(restoredSlots[3].course, null);
  assert.equal(restoredSlots[3].adjusted, false);
});

test('非今日課表不產生 current/next，所有課程與空堂仍可操作', () => {
  const past = getScheduleViewForDate(slots, '2026-08-24', at(8, 30));
  const future = getScheduleViewForDate(slots, '2026-08-26', at(8, 30));
  assert.equal(past.relation, 'past');
  assert.equal(future.relation, 'future');
  assert.equal(past.activeId, null);
  assert.equal(future.nextId, null);
  assert.deepEqual(past.rows.map((row) => row.state), ['past', 'empty-past', 'past']);
  assert.deepEqual(future.rows.map((row) => row.state), ['upcoming', 'empty', 'upcoming']);
  assert.equal([...past.rows, ...future.rows].every(canOpenScheduleRow), true);
  assert.equal([...past.rows, ...future.rows].some((row) => ['current', 'next'].includes(row.state)), false);
});

test('過去、未來與週末調課 session 都固定使用選取日期與原堂次', () => {
  const course = courseFromSelection({ system: 'junior', grade: 'j8', className: '3', subject: '理化' });
  for (const dateKey of ['2026-08-24', '2026-08-29', '2027-01-02']) {
    const session = createSessionSnapshot(dateFromKey(dateKey), { id: 'p4', period: 4, start: '11:10', end: '12:00', course, adjusted: true });
    assert.deepEqual({ dateKey: session.dateKey, slotId: session.slotId, period: session.period, course: session.course.classLabel }, { dateKey, slotId: 'p4', period: 4, course: '803班' });
    assert.equal(Object.isFrozen(session), true);
  }
  assert.equal(createSessionSnapshot(dateFromKey('2026-08-29'), { id: 'p4', period: 4, start: '11:10', end: '12:00', course: null }), null);
});

test('學制與年級改變時會重置下游連動選項', () => {
  const senior = linkedCourseState({ system: 'senior', grade: 's2', className: '3', subject: '物理' });
  assert.deepEqual(senior.selection, { system: 'senior', grade: 's2', className: '3', subject: '物理' });

  const changed = linkedCourseState({ ...senior.selection, system: 'junior' }, 'system');
  assert.deepEqual(changed.selection, { system: 'junior', grade: 'j7', className: '1', subject: '國文' });
  assert.deepEqual(changed.options.grades.map((item) => item.label), ['七年級', '八年級', '九年級']);

  const course = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' }, COURSE_CATALOG);
  assert.equal(course.classLabel, '805班');
  assert.equal(course.subject, '理化');
});

test('舊版作業資料補上 exams 時不重設 assignments 與 courses', () => {
  const assignments = { a1: { id: 'a1', title: '既有作業' } };
  const courses = { '805班・理化': { homeworkWeights: { 12: 2 } } };
  const normalized = normalizeClassroomRecords({ assignments, courses });
  assert.strictEqual(normalized.assignments, assignments);
  assert.strictEqual(normalized.courses, courses);
  assert.deepEqual(normalized.exams, {});
  assert.deepEqual(normalized.drawSessions, {});
});

test('本節抽籤狀態正規化會讓舊資料預設開啟加權，並保留明確關閉設定', () => {
  const drawSessions = {
    '2026-08-25:p3:805班・理化': {
      allowRepeat: false,
      currentSeat: 12,
      excludedSeats: [4],
      seatsThisRound: [12],
      history: [{ id: 'd1', seat: 12, time: '10:20', absent: false }]
    },
    '2026-08-25:p4:806班・理化': { useWeighting: false, history: [] }
  };
  const normalized = normalizeClassroomRecords({ assignments: {}, courses: {}, drawSessions });
  assert.equal(normalized.drawSessions['2026-08-25:p3:805班・理化'].currentSeat, 12);
  assert.equal(normalized.drawSessions['2026-08-25:p3:805班・理化'].useWeighting, true);
  assert.equal(normalized.drawSessions['2026-08-25:p4:806班・理化'].useWeighting, false);
  assert.equal(drawSessions['2026-08-25:p3:805班・理化'].useWeighting, undefined);
});

test('考試示範資料只加入一次，且不覆蓋既有資料', () => {
  const assignments = { a1: { id: 'a1' } };
  const courses = { c1: { homeworkWeights: { 7: 1 } } };
  const demoExams = { demo: { id: 'demo', title: '示範小考' } };
  const first = seedDemoExamsOnce({ assignments, exams: {}, courses }, demoExams);
  assert.equal(first.seeded, true);
  assert.equal(first.changed, true);
  assert.deepEqual(first.records.exams, demoExams);
  assert.strictEqual(first.records.assignments, assignments);
  assert.strictEqual(first.records.courses, courses);

  const repeated = seedDemoExamsOnce(first.records, demoExams);
  assert.equal(repeated.seeded, false);
  assert.equal(repeated.changed, false);
  assert.strictEqual(repeated.records, first.records);

  const existingExams = { real: { id: 'real', title: '既有考試' } };
  const preserved = seedDemoExamsOnce({ assignments, exams: existingExams, courses }, demoExams);
  assert.equal(preserved.seeded, true);
  assert.strictEqual(preserved.records.exams.real, existingExams.real);
  assert.deepEqual(preserved.records.exams.demo, demoExams.demo);
  assert.equal(preserved.records.meta.demoExamSeedVersion, 1);
});

test('考試排程沿用三種課堂解析，兩班各自保留 due', () => {
  const courseA = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
  const courseB = courseFromSelection({ system: 'junior', grade: 'j8', className: '6', subject: '理化' });
  const weeklySchedules = {
    1: [{ id: 'p1', period: 1, start: '08:10', end: '09:00', course: courseA }],
    2: [{ id: 'p3', period: 3, start: '10:10', end: '11:00', course: courseB }]
  };
  const session = createSessionSnapshot(dateFromKey('2026-08-24'), { id: 'p1', period: 1, start: '08:10', end: '09:00', course: courseA });
  const next = resolveExamTargets({ weeklySchedules, session, courses: [courseA, courseB], mode: 'next' });
  assert.equal(next.targets[courseDataKey(courseA)].due.dateKey, '2026-08-31');
  assert.equal(next.targets[courseDataKey(courseB)].due.dateKey, '2026-08-25');
  const nextWeek = resolveExamTargets({ weeklySchedules, session, courses: [courseA, courseB], mode: 'next-week' });
  assert.equal(nextWeek.targets[courseDataKey(courseA)].due.dateKey, '2026-08-31');
  assert.equal(nextWeek.targets[courseDataKey(courseB)].due.dateKey, '2026-09-01');
  const chosenDate = resolveExamTargets({ weeklySchedules, session, courses: [courseA, courseB], mode: 'date', selectedDate: '2026-08-25' });
  assert.equal(chosenDate.targets[courseDataKey(courseB)].due.slotId, 'p3');
  assert.equal(chosenDate.errors[0].courseKey, courseDataKey(courseA));
});

test('新增考試批次時間可解析各班下次課，或套用完全相同的共同時間', () => {
  const courseA = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
  const courseB = courseFromSelection({ system: 'junior', grade: 'j8', className: '6', subject: '理化' });
  const keyA = courseDataKey(courseA);
  const keyB = courseDataKey(courseB);
  const weeklySchedules = {
    1: [{ id: 'p1', period: 1, start: '08:10', end: '09:00', course: courseA }],
    2: [{ id: 'p3', period: 3, start: '10:10', end: '11:00', course: courseB }]
  };
  const session = createSessionSnapshot(dateFromKey('2026-08-24'), { id: 'p1', period: 1, start: '08:10', end: '09:00', course: courseA });
  const next = resolveIndependentExamTimes({ weeklySchedules, session, courses: [courseA, courseB], mode: 'next' });
  assert.equal(next.targets[keyA].due.dateKey, '2026-08-31');
  assert.equal(next.targets[keyB].due.dateKey, '2026-08-25');

  const common = resolveIndependentExamTimes({
    weeklySchedules,
    session,
    courses: [courseA, courseB],
    mode: 'common-time',
    dateKey: '2026-09-04',
    period: { id: 'p5', period: 5, start: '13:10', end: '14:00' }
  });
  assert.deepEqual(common.targets[keyA].due, { dateKey: '2026-09-04', slotId: 'p5', period: 5, start: '13:10', end: '14:00' });
  assert.deepEqual(common.targets[keyB].due, common.targets[keyA].due);
  assert.equal(common.errors.length, 0);
  const invalid = resolveIndependentExamTimes({ weeklySchedules, session, courses: [courseA, courseB], mode: 'common-time' });
  assert.deepEqual(invalid.errors.map((error) => error.courseKey), [keyA, keyB]);
  const past = resolveIndependentExamTimes({
    weeklySchedules,
    session,
    courses: [courseA, courseB],
    mode: 'common-time',
    dateKey: '2026-08-23',
    minDate: '2026-08-24',
    period: { id: 'p5', period: 5, start: '13:10', end: '14:00' }
  });
  assert.equal(Object.keys(past.targets).length, 0);
  assert.deepEqual(past.errors.map((error) => error.reason), ['考試日期不可早於可安排日期', '考試日期不可早於可安排日期']);
});

test('每班獨立考試時間可混用三種設定並保留各自模式', () => {
  const courseA = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
  const courseB = courseFromSelection({ system: 'junior', grade: 'j8', className: '6', subject: '理化' });
  const keyA = courseDataKey(courseA);
  const keyB = courseDataKey(courseB);
  const session = createSessionSnapshot(dateFromKey('2026-08-24'), { id: 'p1', period: 1, start: '08:10', end: '09:00', course: courseA });
  const weeklySchedules = {
    1: [{ id: 'p1', period: 1, start: '08:10', end: '09:00', course: courseA }],
    2: [{ id: 'p3', period: 3, start: '10:10', end: '11:00', course: courseB }]
  };
  const nextA = resolveIndependentExamTimes({ weeklySchedules, session, courses: [courseA], mode: 'next' }).targets[keyA];
  const commonB = resolveIndependentExamTimes({ weeklySchedules, session, courses: [courseB], mode: 'common-time', dateKey: '2026-09-04', period: { id: 'p5', period: 5, start: '13:10', end: '14:00' } }).targets[keyB];
  const exams = upsertExamDefinition({}, {
    id: 'mixed', title: '全年級週考', scheduleMode: 'independent', sessionDateKey: '2026-08-24',
    selectedCourseKeys: [keyA, keyB],
    resolvedTargets: {
      [keyA]: { ...nextA, scheduleMode: 'next' },
      [keyB]: { ...commonB, scheduleMode: 'common-time' }
    }
  });
  assert.equal(exams.mixed.targets[keyA].scheduleMode, 'next');
  assert.equal(exams.mixed.targets[keyB].scheduleMode, 'common-time');
  assert.notDeepEqual(exams.mixed.targets[keyA].due, exams.mixed.targets[keyB].due);
});

test('共用考試定義共享名稱，但每班 target 與紀錄獨立', () => {
  const courseA = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
  const courseB = courseFromSelection({ system: 'junior', grade: 'j8', className: '6', subject: '理化' });
  const keyA = courseDataKey(courseA);
  const keyB = courseDataKey(courseB);
  const resolvedTargets = {
    [keyA]: { course: courseA, due: { dateKey: '2026-08-31', slotId: 'p1', period: 1, start: '08:10', end: '09:00' } },
    [keyB]: { course: courseB, due: { dateKey: '2026-09-01', slotId: 'p3', period: 3, start: '10:10', end: '11:00' } }
  };
  const exams = upsertExamDefinition({}, {
    id: 'exam-1', title: '第一章小考', scheduleMode: 'next', sessionDateKey: '2026-08-24',
    selectedCourseKeys: [keyA, keyB], resolvedTargets
  });
  assert.equal(exams['exam-1'].title, '第一章小考');
  assert.notStrictEqual(exams['exam-1'].targets[keyA], exams['exam-1'].targets[keyB]);
  assert.equal(examSharingLabel(exams['exam-1'].targets), '共用考試・共 2 班');
  assert.match(examEditSharingNotice('exam-1', [keyA, keyB]), /點名與補考仍各班獨立/);
});

test('取消單班考試安排會保留該班點名與補考，且不影響共用考試其他班', () => {
  const keyA = '805班・理化';
  const keyB = '806班・理化';
  const checks = [{ id: 'check-1', summary: { absent: 1 } }];
  const makeups = { 12: { seat: 12, status: 'pending' } };
  const targetA = { status: 'active', checks, makeups };
  const targetB = { status: 'active', checks: [], makeups: {} };
  const exams = { e1: { id: 'e1', title: '第一章小考', targets: { [keyA]: targetA, [keyB]: targetB } } };
  const cancelled = cancelExamTarget(exams, 'e1', keyA, '2026-08-26');
  assert.equal(cancelled.e1.targets[keyA].status, 'cancelled');
  assert.equal(cancelled.e1.targets[keyA].cancelledAt, '2026-08-26');
  assert.strictEqual(cancelled.e1.targets[keyA].checks, checks);
  assert.strictEqual(cancelled.e1.targets[keyA].makeups, makeups);
  assert.strictEqual(cancelled.e1.targets[keyB], targetB);
  assert.equal(examSharingLabel(cancelled.e1.targets), '');
});

test('修改本班考試時間只更新指定 target，其他班與全部歷史紀錄保持原樣', () => {
  const keyA = '805班・理化';
  const keyB = '806班・理化';
  const checks = [{ id: 'check-1', dateKey: '2026-08-19' }];
  const lastCheck = checks[0];
  const makeups = { 12: { seat: 12, status: 'pending', absentDateKey: '2026-08-19' } };
  const targetA = { course: { classLabel: '805班', subject: '理化' }, due: { dateKey: '2026-08-19', slotId: 'p2', period: 2, start: '09:10', end: '10:00' }, scheduleMode: 'next', status: 'active', checks, lastCheck, makeups, createdAt: '2026-08-10' };
  const targetB = { course: { classLabel: '806班', subject: '理化' }, due: { dateKey: '2026-08-20', slotId: 'p4', period: 4, start: '11:10', end: '12:00' }, scheduleMode: 'next-week', status: 'active', checks: [], makeups: {} };
  const otherExam = { id: 'e2', title: '另一場考試', targets: {} };
  const exams = { e1: { id: 'e1', title: '第一章小考', scheduleMode: 'independent', createdAt: '2026-08-10', targets: { [keyA]: targetA, [keyB]: targetB } }, e2: otherExam };
  const due = { dateKey: '2026-09-04', slotId: 'p4', period: 4, start: '11:10', end: '12:00' };
  const updated = updateExamTargetSchedule(exams, { examId: 'e1', courseKey: keyA, due, scheduleMode: 'common-time' });

  assert.notStrictEqual(updated, exams);
  assert.equal(updated.e1.title, '第一章小考');
  assert.equal(updated.e1.scheduleMode, 'independent');
  assert.equal(updated.e1.createdAt, '2026-08-10');
  assert.strictEqual(updated.e1.targets[keyB], targetB);
  assert.strictEqual(updated.e2, otherExam);
  assert.strictEqual(updated.e1.targets[keyA].checks, checks);
  assert.strictEqual(updated.e1.targets[keyA].lastCheck, lastCheck);
  assert.strictEqual(updated.e1.targets[keyA].makeups, makeups);
  assert.equal(updated.e1.targets[keyA].status, 'active');
  assert.equal(updated.e1.targets[keyA].createdAt, '2026-08-10');
  assert.deepEqual(updated.e1.targets[keyA].due, due);
  assert.equal(updated.e1.targets[keyA].scheduleMode, 'common-time');
  due.dateKey = '2099-01-01';
  assert.equal(updated.e1.targets[keyA].due.dateKey, '2026-09-04');
  assert.equal(exams.e1.targets[keyA].due.dateKey, '2026-08-19');
});

test('修改本班時間遇到無效、相同或已取消資料時不擴大變更範圍', () => {
  const key = '805班・理化';
  const due = { dateKey: '2026-09-04', slotId: 'p4', period: 4, start: '11:10', end: '12:00' };
  const makeups = { 12: { seat: 12, status: 'pending' } };
  const exams = { e1: { id: 'e1', scheduleMode: 'independent', targets: { [key]: { due, scheduleMode: 'common-time', status: 'cancelled', cancelledAt: '2026-08-28', makeups } } } };

  assert.strictEqual(updateExamTargetSchedule(exams, { examId: 'missing', courseKey: key, due, scheduleMode: 'common-time' }), exams);
  assert.strictEqual(updateExamTargetSchedule(exams, { examId: 'e1', courseKey: 'missing', due, scheduleMode: 'common-time' }), exams);
  assert.strictEqual(updateExamTargetSchedule(exams, { examId: 'e1', courseKey: key, due: { ...due, dateKey: 'not-a-date' }, scheduleMode: 'common-time' }), exams);
  assert.strictEqual(updateExamTargetSchedule(exams, { examId: 'e1', courseKey: key, due, scheduleMode: 'unknown' }), exams);
  assert.strictEqual(updateExamTargetSchedule(exams, { examId: 'e1', courseKey: key, due, scheduleMode: 'common-time' }), exams);

  const changed = updateExamTargetSchedule(exams, { examId: 'e1', courseKey: key, due: { ...due, dateKey: '2026-09-11' }, scheduleMode: 'common-time' });
  assert.equal(changed.e1.targets[key].status, 'cancelled');
  assert.equal(changed.e1.targets[key].cancelledAt, '2026-08-28');
  assert.strictEqual(changed.e1.targets[key].makeups, makeups);
});

test('共用考試改期保留各班既有點名與補考紀錄', () => {
  const courseA = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
  const courseB = courseFromSelection({ system: 'junior', grade: 'j8', className: '6', subject: '理化' });
  const keyA = courseDataKey(courseA);
  const keyB = courseDataKey(courseB);
  const oldTargets = {
    [keyA]: { course: courseA, due: { dateKey: '2026-08-31', slotId: 'p1', period: 1, start: '08:10', end: '09:00' }, status: 'active', checks: [{ id: 'a-check' }], makeups: { 12: { seat: 12, status: 'pending' } } },
    [keyB]: { course: courseB, due: { dateKey: '2026-09-01', slotId: 'p3', period: 3, start: '10:10', end: '11:00' }, status: 'active', checks: [{ id: 'b-check' }], makeups: {} }
  };
  const exams = { e1: { id: 'e1', title: '第一章小考', scheduleMode: 'next', createdAt: '2026-08-24', targets: oldTargets } };
  const rescheduled = upsertExamDefinition(exams, {
    id: 'e1', title: '第一章小考（改期）', scheduleMode: 'date', sessionDateKey: '2026-08-24',
    selectedCourseKeys: [keyA, keyB], initialCourseKeys: [keyA, keyB], scheduleDirty: true,
    resolvedTargets: {
      [keyA]: { course: courseA, due: { dateKey: '2026-09-07', slotId: 'p1', period: 1, start: '08:10', end: '09:00' } },
      [keyB]: { course: courseB, due: { dateKey: '2026-09-08', slotId: 'p3', period: 3, start: '10:10', end: '11:00' } }
    }
  });
  assert.equal(rescheduled.e1.targets[keyA].due.dateKey, '2026-09-07');
  assert.strictEqual(rescheduled.e1.targets[keyA].checks, oldTargets[keyA].checks);
  assert.strictEqual(rescheduled.e1.targets[keyA].makeups, oldTargets[keyA].makeups);
  assert.strictEqual(rescheduled.e1.targets[keyB].checks, oldTargets[keyB].checks);
});

test('考試延期只移動目前班級，不影響共用考試其他班', () => {
  const courseA = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
  const courseB = courseFromSelection({ system: 'junior', grade: 'j8', className: '6', subject: '理化' });
  const keyA = courseDataKey(courseA);
  const keyB = courseDataKey(courseB);
  const targetB = { course: courseB, due: { dateKey: '2026-09-01', slotId: 'p3', period: 3, start: '10:10', end: '11:00' }, status: 'active', checks: [], makeups: {} };
  const exams = { e1: { id: 'e1', title: '第一章小考', targets: {
    [keyA]: { course: courseA, due: { dateKey: '2026-08-31', slotId: 'p1', period: 1, start: '08:10', end: '09:00' }, status: 'active', checks: [], makeups: {} },
    [keyB]: targetB
  } } };
  const weeklySchedules = {
    1: [{ id: 'p1', period: 1, start: '08:10', end: '09:00', course: courseA }],
    2: [{ id: 'p3', period: 3, start: '10:10', end: '11:00', course: courseB }]
  };
  const deferred = deferExamTarget(exams, 'e1', keyA, weeklySchedules, { dateKey: '2026-08-31', end: '09:00' });
  assert.equal(deferred.e1.targets[keyA].due.dateKey, '2026-09-07');
  assert.strictEqual(deferred.e1.targets[keyB], targetB);
});

test('缺考只建立 exact 班級待補考，不修改作業、權重或其他考試', () => {
  const courseA = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
  const courseB = courseFromSelection({ system: 'junior', grade: 'j8', className: '6', subject: '理化' });
  const keyA = courseDataKey(courseA);
  const keyB = courseDataKey(courseB);
  const target = (course) => ({ course, due: { dateKey: '2026-08-25', slotId: 'p3', period: 3, start: '10:10', end: '11:00' }, status: 'active', checks: [], makeups: {} });
  const assignments = { a1: { id: 'a1', title: '既有作業' } };
  const courses = { [keyA]: { pendingHomework: [{ seat: 7 }], homeworkWeights: { 7: 1 } } };
  const otherExam = { id: 'exam-2', title: '另一場考試', targets: { [keyA]: target(courseA) } };
  const records = {
    assignments,
    courses,
    exams: { 'exam-1': { id: 'exam-1', title: '第一章小考', targets: { [keyA]: target(courseA), [keyB]: target(courseB) } }, 'exam-2': otherExam }
  };
  const session = createSessionSnapshot(dateFromKey('2026-08-25'), { id: 'p3', period: 3, start: '10:10', end: '11:00', course: courseA });
  const saved = saveExamCheck(records, { examId: 'exam-1', courseKey: keyA, session, seatStates: { 4: 'absent', 12: 'absent', 18: 'absent' }, savedAt: '10:20' });
  assert.deepEqual(saved.summary, { absent: 2, complete: false, absentSeats: [12, 18] });
  assert.strictEqual(saved.records.assignments, assignments);
  assert.strictEqual(saved.records.courses, courses);
  assert.strictEqual(saved.records.exams['exam-2'], otherExam);
  assert.deepEqual(saved.records.exams['exam-1'].targets[keyB], records.exams['exam-1'].targets[keyB]);
  assert.deepEqual(pendingExamMakeupsForCourse(saved.records.exams, keyA).map((item) => item.seat), [12, 18]);
});

test('待補考依共用考試 ID 分組，學生資訊保留班級、座號與缺考日期', () => {
  const courseA = { classLabel: '805班', subject: '理化' };
  const courseB = { classLabel: '806班', subject: '理化' };
  const groups = groupPendingExamMakeups([
    { examId: 'shared', examTitle: '第一章小考', courseKey: '805班・理化', course: courseA, seat: 12, absentDateKey: '2026-08-19' },
    { examId: 'other', examTitle: '第一章小考', courseKey: '805班・理化', course: courseA, seat: 8, absentDateKey: '2026-08-20' },
    { examId: 'shared', examTitle: '第一章小考', courseKey: '806班・理化', course: courseB, seat: 7, absentDateKey: '2026-08-19' }
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].examId, 'shared');
  assert.deepEqual(groups[0].students.map((student) => [student.course.classLabel, student.seat]), [['805班', 12], ['806班', 7]]);
  assert.equal(groups[1].examId, 'other');
  assert.equal(groups[1].students[0].seat, 8);
});

test('共通考試依年級科目、考試與班級時間建立四層摘要', () => {
  const courseA = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
  const courseB = courseFromSelection({ system: 'junior', grade: 'j8', className: '6', subject: '理化' });
  const courseC = courseFromSelection({ system: 'junior', grade: 'j8', className: '7', subject: '理化' });
  const physics = courseFromSelection({ system: 'senior', grade: 's2', className: '3', subject: '物理' });
  const target = (course, dateKey, period, extra = {}) => ({
    course,
    due: { dateKey, slotId: `p${period}`, period, start: '10:10', end: '11:00' },
    status: 'active',
    checks: [],
    makeups: {},
    ...extra
  });
  const checked = (id, absentSeats) => ({ id, dateKey: '2026-08-25', savedAt: '10:20', seatStates: Object.fromEntries(absentSeats.map((seat) => [seat, 'absent'])), summary: { absent: absentSeats.length, complete: false, absentSeats } });
  const checkA = checked('check-a', [12, 18]);
  const checkB = checked('check-b', [7]);
  const exams = {
    shared: {
      id: 'shared', title: '第一章小考', scheduleMode: 'date', createdAt: '2026-08-20', targets: {
        [courseDataKey(courseC)]: target(courseC, '2026-08-27', 4),
        [courseDataKey(courseA)]: target(courseA, '2026-08-25', 3, { checks: [checkA], lastCheck: checkA, makeups: { 12: { seat: 12, status: 'pending', absentDateKey: '2026-08-25' }, 18: { seat: 18, status: 'completed', absentDateKey: '2026-08-25', completedAt: '2026-08-26 12:30' } } }),
        [courseDataKey(courseB)]: target(courseB, '2026-08-26', 2, { checks: [checkB], lastCheck: checkB, makeups: { 7: { seat: 7, status: 'pending', absentDateKey: '2026-08-26' } } })
      }
    },
    sameTitle: { id: 'sameTitle', title: '第一章小考', scheduleMode: 'next', createdAt: '2026-08-22', targets: { [courseDataKey(courseA)]: target(courseA, '2026-09-01', 1) } },
    physics: { id: 'physics', title: '力學小考', scheduleMode: 'date', createdAt: '2026-08-21', targets: { [courseDataKey(physics)]: target(physics, '2026-08-28', 5, { makeups: { 9: { seat: 9, status: 'pending', absentDateKey: '2026-08-28' } } }) } },
    cancelledEmpty: { id: 'cancelledEmpty', title: '取消考試', targets: { [courseDataKey(courseC)]: target(courseC, '2026-08-29', 2, { status: 'cancelled' }) } },
    legacy: { id: 'legacy', title: '舊資料小考', targets: { legacy: target({ classLabel: '舊班級', subject: '理化' }, '2026-08-24', 1) } }
  };
  const groups = buildCommonExamView(exams);
  assert.deepEqual(groups.map((group) => group.label), ['八年級・理化', '高二・物理', '未分類・理化']);
  const chemistry = groups[0];
  assert.equal(chemistry.examCount, 2);
  assert.equal(chemistry.classCount, 3);
  const shared = chemistry.exams.find((exam) => exam.examId === 'shared');
  assert.equal(shared.classCount, 3);
  assert.equal(shared.checkedClassCount, 2);
  assert.equal(shared.pendingMakeupCount, 2);
  assert.equal(shared.completedMakeupCount, 1);
  assert.deepEqual(shared.classes.map((item) => item.classLabel), [courseA.classLabel, courseB.classLabel, courseC.classLabel]);
  assert.equal(chemistry.exams.filter((exam) => exam.title === '第一章小考').length, 2);
  assert.equal(groups[1].pendingMakeupCount, 1);
  assert.equal(groups.some((group) => group.exams.some((exam) => exam.examId === 'cancelledEmpty')), false);
});

test('共通考試細節精確隔離班級，完成補考後各層統計同步', () => {
  const courseA = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
  const courseB = courseFromSelection({ system: 'junior', grade: 'j8', className: '6', subject: '理化' });
  const keyA = courseDataKey(courseA);
  const keyB = courseDataKey(courseB);
  const due = { dateKey: '2026-08-25', slotId: 'p3', period: 3, start: '10:10', end: '11:00' };
  const check = { id: 'check-a', dateKey: '2026-08-25', savedAt: '10:20', seatStates: { 12: 'absent', 18: 'absent' }, summary: { absent: 2, complete: false, absentSeats: [12, 18] } };
  const records = { assignments: {}, courses: {}, exams: { shared: { id: 'shared', title: '第一章小考', targets: {
    [keyA]: { course: courseA, due, status: 'active', checks: [check], lastCheck: check, makeups: { 12: { seat: 12, status: 'pending', absentDateKey: '2026-08-25' }, 18: { seat: 18, status: 'completed', absentDateKey: '2026-08-25', completedAt: '2026-08-26 12:30' } } },
    [keyB]: { course: courseB, due: { ...due, dateKey: '2026-08-26' }, status: 'active', checks: [], makeups: { 7: { seat: 7, status: 'pending', absentDateKey: '2026-08-26' } } }
  } } } };
  const detail = examClassDetail(records.exams, 'shared', keyA);
  assert.deepEqual(detail.absentSeats, [12, 18]);
  assert.deepEqual(detail.makeups.pending.map((item) => [item.courseKey, item.seat]), [[keyA, 12]]);
  assert.deepEqual(detail.makeups.completed.map((item) => item.seat), [18]);
  assert.equal(examClassDetail(records.exams, 'shared', '不存在'), null);

  const completed = completeExamMakeup(records, { examId: 'shared', courseKey: keyA, seat: 12, completedAt: '2026-08-28 12:30' });
  const nextDetail = examClassDetail(completed.exams, 'shared', keyA);
  assert.deepEqual(nextDetail.makeups.pending, []);
  assert.deepEqual(nextDetail.makeups.completed.map((item) => item.seat), [12, 18]);
  const summary = buildCommonExamView(completed.exams)[0].exams[0];
  assert.equal(summary.pendingMakeupCount, 1);
  assert.equal(summary.completedMakeupCount, 2);
  assert.strictEqual(completed.exams.shared.targets[keyB], records.exams.shared.targets[keyB]);
});

test('共通頁重新點名沿用上一筆實際日期與節次，首次點名才採原安排', () => {
  const course = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
  const detail = {
    course,
    due: { dateKey: '2026-08-25', slotId: 'p3', period: 3, start: '10:10', end: '11:00' },
    lastCheck: { dateKey: '2026-08-27', slotId: 'p5', savedAt: '13:30' }
  };
  const periods = [['p3', 3, '10:10', '11:00'], ['p5', 5, '13:10', '14:00']];
  assert.deepEqual(resolveExamAttendanceSession(detail, periods, false), {
    dateKey: '2026-08-25',
    slot: { id: 'p3', period: 3, start: '10:10', end: '11:00', course }
  });
  assert.deepEqual(resolveExamAttendanceSession(detail, periods, true), {
    dateKey: '2026-08-27',
    slot: { id: 'p5', period: 5, start: '13:10', end: '14:00', course }
  });
});

test('重存同次考試點名會校正 pending 且不重複，已完成補考歷史保留', () => {
  const course = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
  const courseKey = courseDataKey(course);
  const session = createSessionSnapshot(dateFromKey('2026-08-25'), { id: 'p3', period: 3, start: '10:10', end: '11:00', course });
  const records = { assignments: {}, courses: {}, exams: { e1: { id: 'e1', title: '理化小考', targets: { [courseKey]: { course, due: { dateKey: '2026-08-25', slotId: 'p3', period: 3, start: '10:10', end: '11:00' }, status: 'active', checks: [], makeups: {} } } } } };
  const first = saveExamCheck(records, { examId: 'e1', courseKey, session, seatStates: { 12: 'absent', 18: 'absent' }, savedAt: '10:20' }).records;
  const corrected = saveExamCheck(first, { examId: 'e1', courseKey, session, seatStates: { 18: 'absent' }, savedAt: '10:25' }).records;
  const target = corrected.exams.e1.targets[courseKey];
  assert.equal(target.checks.length, 1);
  assert.equal(target.makeups['12'].status, 'cancelled');
  assert.equal(target.makeups['18'].status, 'pending');
  assert.deepEqual(pendingExamMakeupsForCourse(corrected.exams, courseKey).map((item) => item.seat), [18]);

  const completed = completeExamMakeup(corrected, { examId: 'e1', courseKey, seat: 18, completedAt: '2026-09-01 10:00' });
  assert.equal(completed.exams.e1.targets[courseKey].makeups['18'].status, 'completed');
  assert.equal(completed.exams.e1.targets[courseKey].makeups['18'].completedAt, '2026-09-01 10:00');
  assert.equal(pendingExamMakeupsForCourse(completed.exams, courseKey).length, 0);
  assert.strictEqual(completeExamMakeup(completed, { examId: 'e1', courseKey, seat: 18, completedAt: 'later' }), completed);

  const rechecked = saveExamCheck(completed, { examId: 'e1', courseKey, session, seatStates: {}, savedAt: '10:30' }).records;
  assert.equal(rechecked.exams.e1.targets[courseKey].makeups['18'].status, 'completed');
  assert.equal(rechecked.exams.e1.targets[courseKey].makeups['18'].completedAt, '2026-09-01 10:00');
});

test('座號可切換未完成與請假，4、36 號始終停用', () => {
  let states = toggleSeatState({}, 12, 'incomplete');
  states = toggleSeatState(states, 18, 'leave');
  assert.deepEqual(summarizeSeatStates(states), { incomplete: 1, leave: 1, complete: false });
  assert.deepEqual(toggleSeatState(states, 4, 'incomplete'), states);
  assert.deepEqual(toggleSeatState(states, 36, 'leave'), states);
  assert.deepEqual(toggleSeatState(toggleSeatState(states, 12, 'incomplete'), 18, 'leave'), {});
});

test('長按後只壓掉同一座號的 click', () => {
  const suppressed = { seat: 12, pointerId: 8 };
  assert.equal(shouldSuppressLongPressClick(suppressed, 12, 8), true);
  assert.equal(shouldSuppressLongPressClick(suppressed, 12, 9), false);
  assert.equal(shouldSuppressLongPressClick(suppressed, 13, 8), false);
});

test('未完成會建立待補交並增加作業權重，請假只待確認', () => {
  const course = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
  const key = courseDataKey(course);
  const records = applyHomeworkCheck({}, {
    courseKey: key,
    checkId: '2026-08-25:p3:assignment',
    assignment: '理化習作 p.34',
    date: '2026-08-25',
    seatStates: { 12: 'incomplete', 18: 'leave' }
  });
  assert.equal(records[key].pendingHomework.length, 1);
  assert.equal(records[key].pendingHomework[0].seat, 12);
  assert.equal(records[key].homeworkWeights[12], 1);
  assert.equal(records[key].homeworkWeights[18], undefined);
  assert.equal(records[key].leaveConfirmations[0].seat, 18);
});

test('作業紀錄以班級加科目隔離，重存同次檢查不會重複加權', () => {
  const firstKey = '805班・理化';
  const otherKey = '805班・數學';
  const first = applyHomeworkCheck({ [otherKey]: { pendingHomework: [], leaveConfirmations: [], homeworkWeights: {} } }, {
    courseKey: firstKey, checkId: 'check-1', assignment: 'A', date: '2026-08-25', seatStates: { 7: 'incomplete' }
  });
  const savedAgain = applyHomeworkCheck(first, {
    courseKey: firstKey, checkId: 'check-1', assignment: 'A', date: '2026-08-25', seatStates: { 7: 'incomplete' }
  });
  assert.equal(savedAgain[firstKey].pendingHomework.length, 1);
  assert.equal(savedAgain[firstKey].homeworkWeights[7], 1);
  assert.deepEqual(savedAgain[otherKey], first[otherKey]);
});

test('同一日同一節調課前後的作業 check key 依班級與科目隔離', () => {
  const date = new Date(2026, 7, 25, 10, 20);
  const courseA = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
  const courseB = courseFromSelection({ system: 'senior', grade: 's2', className: '3', subject: '物理' });
  const keyA = homeworkCheckKey(date, 'p3', courseA);
  const keyB = homeworkCheckKey(date, 'p3', courseB);
  assert.notEqual(keyA, keyB);

  let checks = { [keyA]: { seatStates: { 12: 'incomplete' } } };
  checks = { ...checks, [keyB]: { seatStates: { 18: 'leave' } } };
  assert.deepEqual(checks[keyA].seatStates, { 12: 'incomplete' });
  assert.deepEqual(checks[keyB].seatStates, { 18: 'leave' });
});

test('作業名稱只對已排定科目安全對應', () => {
  assert.equal(assignmentForSubject('理化'), '理化習作 p.34');
  assert.equal(assignmentForSubject('物理'), '波動講義 p.8');
  assert.equal(assignmentForSubject('數學'), null);
  assert.equal(assignmentForSubject('英語'), null);
});

test('進入課堂後跨日儲存仍寫入原日期、原班級與原科目', () => {
  const tuesday = new Date(2026, 7, 25, 10, 20);
  const wednesday = new Date(2026, 7, 26, 10, 20);
  const course = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
  const session = createSessionSnapshot(tuesday, {
    id: 'p3', period: 3, start: '10:10', end: '11:00', course, adjusted: true
  });

  assert.equal(Object.isFrozen(session), true);
  assert.equal(Object.isFrozen(session.course), true);
  assert.equal(sessionScheduleState(session, new Date(2026, 7, 25, 10, 0)), 'next');
  assert.equal(sessionScheduleState(session, new Date(2026, 7, 25, 10, 20)), 'current');
  assert.equal(sessionScheduleState(session, new Date(2026, 7, 25, 11, 0)), 'past');
  assert.equal(sessionScheduleState(session, wednesday), 'past');
  assert.deepEqual(homeworkTargetForSession(session), {
    checkId: '2026-08-25:p3:805班・理化:assignment',
    courseKey: '805班・理化',
    date: '2026-08-25'
  });

  const target = homeworkTargetForSession(session);
  const records = applyHomeworkCheck({}, {
    ...target, assignment: '理化習作 p.34', seatStates: { 12: 'incomplete' }
  });
  assert.equal(records['805班・理化'].pendingHomework[0].date, '2026-08-25');
  assert.equal(createSessionSnapshot(wednesday, { id: 'p3', period: 3, start: '10:10', end: '11:00', course: null }), null);
  assert.equal(session.course.classLabel, '805班');
});

const assignmentCourseA = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '理化' });
const assignmentCourseB = courseFromSelection({ system: 'junior', grade: 'j8', className: '6', subject: '理化' });
const assignmentCourseAKey = courseDataKey(assignmentCourseA);
const assignmentCourseBKey = courseDataKey(assignmentCourseB);
const assignmentWeeklySchedules = {
  2: [
    { id: 'p2', period: 2, start: '09:10', end: '10:00', course: assignmentCourseA },
    { id: 'p3', period: 3, start: '10:10', end: '11:00', course: assignmentCourseB }
  ],
  3: [
    { id: 'p1', period: 1, start: '08:10', end: '09:00', course: assignmentCourseA },
    { id: 'p4', period: 4, start: '11:10', end: '12:00', course: assignmentCourseB }
  ]
};
const assignmentSession = createSessionSnapshot(new Date(2026, 7, 25, 8, 30), {
  id: 'p1', period: 1, start: '08:10', end: '09:00', course: assignmentCourseA, adjusted: false
});

test('本堂頁只把待處理、本堂剛記錄與未來安排分開，舊紀錄不會持續堆在本堂', () => {
  const due = { dateKey: '2026-08-25', slotId: 'p1', period: 1, start: '08:10', end: '09:00' };
  const future = { dateKey: '2026-08-25', slotId: 'p2', period: 2, start: '09:10', end: '10:00' };
  const target = (extra = {}) => ({ course: assignmentCourseA, due, status: 'active', ...extra });
  const records = [
    { id: 'pending', status: 'active', targets: { [assignmentCourseAKey]: target() } },
    { id: 'recorded', status: 'active', targets: { [assignmentCourseAKey]: target({ lastCheck: { dateKey: '2026-08-25', slotId: 'p1' } }) } },
    { id: 'old', status: 'active', targets: { [assignmentCourseAKey]: target({ lastCheck: { dateKey: '2026-08-18', slotId: 'p1' } }) } },
    { id: 'scheduled', status: 'active', targets: { [assignmentCourseAKey]: target({ due: future }) } },
    { id: 'cancelled', status: 'active', targets: { [assignmentCourseAKey]: target({ status: 'cancelled' }) } }
  ];
  const sections = recordSectionsForSession(records, assignmentCourseAKey, assignmentSession);
  assert.deepEqual(sections.pending.map((item) => item.id), ['pending']);
  assert.deepEqual(sections.recorded.map((item) => item.id), ['recorded']);
  assert.deepEqual(sections.scheduled.map((item) => item.id), ['scheduled']);
});

test('本堂後續處理的待補交筆數只計算目前班級與 pending 狀態', () => {
  const due = { dateKey: '2026-08-25', slotId: 'p1', period: 1, start: '08:10', end: '09:00' };
  const submissions = {
    s1: { id: 's1', seat: 12, status: 'pending', missingDateKey: '2026-08-25' },
    s2: { id: 's2', seat: 7, status: 'completed', missingDateKey: '2026-08-25' }
  };
  const assignments = {
    a1: { id: 'a1', title: '作業 A', targets: { [assignmentCourseAKey]: { course: assignmentCourseA, due, submissions }, [assignmentCourseBKey]: { course: assignmentCourseB, due, submissions: { s3: { id: 's3', seat: 9, status: 'pending' } } } } }
  };
  const pending = pendingHomeworkSubmissionsForCourse(assignments, assignmentCourseAKey);
  assert.deepEqual(pending.map((item) => [item.assignmentId, item.seat]), [['a1', 12]]);
});

test('16:00 後進入第 7 節，檢查仍寫入原日期、p7 與原課程', () => {
  const course = courseFromSelection({ system: 'senior', grade: 's2', className: '5', subject: '物理' });
  const courseKey = courseDataKey(course);
  const session = createSessionSnapshot(new Date(2026, 7, 25, 16, 5), {
    id: 'p7', period: 7, start: '15:10', end: '16:00', course
  });
  const records = {
    assignments: { after: { id: 'after', title: '課後更正', status: 'active', targets: { [courseKey]: { course, due: { dateKey: '2026-08-25', slotId: 'p7', period: 7, start: '15:10', end: '16:00' } } } } },
    courses: {}
  };
  const saved = saveAssignmentCheck(records, { assignmentId: 'after', courseKey, session, seatStates: { 8: 'incomplete' }, savedAt: '16:05' }).records;
  const check = saved.assignments.after.targets[courseKey].lastCheck;
  assert.equal(sessionScheduleState(session, new Date(2026, 7, 25, 16, 5)), 'past');
  assert.deepEqual({ dateKey: session.dateKey, slotId: session.slotId, period: session.period, courseKey }, { dateKey: '2026-08-25', slotId: 'p7', period: 7, courseKey: '高二5班・物理' });
  assert.equal(check.id, '2026-08-25:p7:after:高二5班・物理');
  assert.equal(check.dateKey, '2026-08-25');
  assert.equal(saved.courses[courseKey].pendingHomework[0].date, '2026-08-25');
});

test('多班作業會分別解析各班的下次上課節次', () => {
  const resolved = resolveAssignmentTargets({
    weeklySchedules: assignmentWeeklySchedules,
    session: assignmentSession,
    courses: [assignmentCourseA, assignmentCourseB],
    mode: 'next'
  });
  assert.deepEqual(resolved.errors, []);
  assert.deepEqual(resolved.targets[assignmentCourseAKey].due, { dateKey: '2026-08-25', slotId: 'p2', period: 2, start: '09:10', end: '10:00' });
  assert.deepEqual(resolved.targets[assignmentCourseBKey].due, { dateKey: '2026-08-25', slotId: 'p3', period: 3, start: '10:10', end: '11:00' });
  assert.equal(assignmentSectionForSession(resolved.targets[assignmentCourseAKey], assignmentSession), 'scheduled');
  assert.equal(findNextCourseOccurrence(assignmentWeeklySchedules, assignmentCourseAKey, '2026-08-26').period, 1);
});

test('作業逐班時間可混用三種設定，指定日期只接受該班當天實際課堂', () => {
  const nextA = resolveIndependentAssignmentTimes({
    weeklySchedules: assignmentWeeklySchedules,
    session: assignmentSession,
    courses: [assignmentCourseA],
    mode: 'next'
  });
  const nextWeekB = resolveIndependentAssignmentTimes({
    weeklySchedules: assignmentWeeklySchedules,
    session: assignmentSession,
    courses: [assignmentCourseB],
    mode: 'next-week'
  });
  const chosenB = resolveIndependentAssignmentTimes({
    weeklySchedules: assignmentWeeklySchedules,
    session: assignmentSession,
    courses: [assignmentCourseB],
    mode: 'date',
    selectedDate: '2026-08-26'
  });
  const noClassA = resolveIndependentAssignmentTimes({
    weeklySchedules: assignmentWeeklySchedules,
    session: assignmentSession,
    courses: [assignmentCourseA],
    mode: 'date',
    selectedDate: '2026-08-27'
  });

  assert.equal(nextA.targets[assignmentCourseAKey].scheduleMode, 'next');
  assert.equal(nextWeekB.targets[assignmentCourseBKey].scheduleMode, 'next-week');
  assert.equal(chosenB.targets[assignmentCourseBKey].due.period, 4);
  assert.equal(chosenB.targets[assignmentCourseBKey].scheduleMode, 'date');
  assert.deepEqual(noClassA.targets, {});
  assert.deepEqual(noClassA.errors, [{ courseKey: assignmentCourseAKey, classLabel: '805班', reason: '選擇日期當天沒有這門課' }]);
});

test('批次作業時間任一班解析失敗時保留全部原草稿與個別修改', () => {
  const originalDrafts = {
    [assignmentCourseAKey]: { course: assignmentCourseA, due: { dateKey: '2026-08-25', slotId: 'p2', period: 2, start: '09:10', end: '10:00' }, scheduleMode: 'next' },
    [assignmentCourseBKey]: { course: assignmentCourseB, due: { dateKey: '2026-08-26', slotId: 'p4', period: 4, start: '11:10', end: '12:00' }, scheduleMode: 'date' }
  };
  const partialResolution = {
    targets: {
      [assignmentCourseAKey]: { course: assignmentCourseA, due: { dateKey: '2026-09-01', slotId: 'p2', period: 2, start: '09:10', end: '10:00' }, scheduleMode: 'date' }
    },
    errors: [{ courseKey: assignmentCourseBKey, classLabel: '806班', reason: '選擇日期當天沒有這門課' }]
  };
  const result = applyAssignmentTimeResolution({
    targetDrafts: originalDrafts,
    targetErrors: {},
    individualizedCourseKeys: [assignmentCourseBKey],
    courseKeys: [assignmentCourseAKey, assignmentCourseBKey],
    resolution: partialResolution,
    batch: true
  });

  assert.equal(result.applied, false);
  assert.strictEqual(result.targetDrafts, originalDrafts);
  assert.deepEqual(result.individualizedCourseKeys, [assignmentCourseBKey]);
  assert.deepEqual(result.targetErrors, { [assignmentCourseBKey]: '選擇日期當天沒有這門課' });
});

test('成功批次作業時間只清除本次已選班級的個別標記', () => {
  const unrelatedKey = '高中部・二年級・1班・物理';
  const resolution = resolveIndependentAssignmentTimes({
    weeklySchedules: assignmentWeeklySchedules,
    session: assignmentSession,
    courses: [assignmentCourseA, assignmentCourseB],
    mode: 'next'
  });
  const result = applyAssignmentTimeResolution({
    targetDrafts: {},
    targetErrors: { [assignmentCourseAKey]: '舊錯誤' },
    individualizedCourseKeys: [assignmentCourseAKey, unrelatedKey],
    courseKeys: [assignmentCourseAKey, assignmentCourseBKey],
    resolution,
    batch: true
  });

  assert.equal(result.applied, true);
  assert.deepEqual(Object.keys(result.targetDrafts).sort(), [assignmentCourseAKey, assignmentCourseBKey].sort());
  assert.deepEqual(result.targetErrors, {});
  assert.deepEqual(result.individualizedCourseKeys, [unrelatedKey]);
});

test('儲存逐班作業時間會保留各班歷史，且不改動未變更班級資料', () => {
  const originalDueA = { dateKey: '2026-08-25', slotId: 'p2', period: 2, start: '09:10', end: '10:00' };
  const originalDueB = { dateKey: '2026-08-25', slotId: 'p3', period: 3, start: '10:10', end: '11:00' };
  const changedDueA = { dateKey: '2026-08-26', slotId: 'p1', period: 1, start: '08:10', end: '09:00' };
  const checks = [{ id: 'old-check', summary: { incomplete: 1 } }];
  const submissions = { s1: { id: 's1', seat: 12, status: 'pending' } };
  const targetB = { course: assignmentCourseB, due: originalDueB, status: 'active', checks: [], submissions: {} };
  const assignments = {
    shared: {
      id: 'shared', title: '共享作業', status: 'active', scheduleMode: 'independent', createdAt: '2026-08-20',
      targets: {
        [assignmentCourseAKey]: { course: assignmentCourseA, due: originalDueA, status: 'active', checks, submissions },
        [assignmentCourseBKey]: targetB
      }
    }
  };
  const updated = upsertAssignmentDefinition(assignments, {
    id: 'shared', title: '共享作業', scheduleMode: 'independent', sessionDateKey: assignmentSession.dateKey,
    selectedCourseKeys: [assignmentCourseAKey, assignmentCourseBKey],
    resolvedTargets: {
      [assignmentCourseAKey]: { course: assignmentCourseA, due: changedDueA, scheduleMode: 'date' },
      [assignmentCourseBKey]: { course: assignmentCourseB, due: originalDueB, scheduleMode: 'next' }
    },
    scheduleDirty: true,
    initialCourseKeys: [assignmentCourseAKey, assignmentCourseBKey]
  });

  assert.deepEqual(updated.shared.targets[assignmentCourseAKey].due, changedDueA);
  assert.strictEqual(updated.shared.targets[assignmentCourseAKey].checks, checks);
  assert.strictEqual(updated.shared.targets[assignmentCourseAKey].submissions, submissions);
  assert.deepEqual(updated.shared.targets[assignmentCourseBKey], { ...targetB, scheduleMode: 'next' });
});

test('共享作業的各班 target 與檢查紀錄保持隔離', () => {
  const resolved = resolveAssignmentTargets({ weeklySchedules: assignmentWeeklySchedules, session: assignmentSession, courses: [assignmentCourseA, assignmentCourseB], mode: 'next' });
  const records = {
    assignments: { shared: { id: 'shared', title: '共享習作', status: 'active', targets: resolved.targets } },
    courses: {}
  };
  const saved = saveAssignmentCheck(records, { assignmentId: 'shared', courseKey: assignmentCourseAKey, session: assignmentSession, seatStates: { 12: 'incomplete' }, savedAt: '10:30' }).records;
  assert.equal(saved.assignments.shared.targets[assignmentCourseAKey].lastCheck.summary.incomplete, 1);
  assert.equal(saved.assignments.shared.targets[assignmentCourseBKey].lastCheck, undefined);
  assert.equal(saved.courses[assignmentCourseAKey].homeworkWeights[12], 1);
  assert.equal(saved.courses[assignmentCourseBKey], undefined);
});

test('延至下次上課只改當前班級 target', () => {
  const resolved = resolveAssignmentTargets({ weeklySchedules: assignmentWeeklySchedules, session: assignmentSession, courses: [assignmentCourseA, assignmentCourseB], mode: 'next' });
  const assignments = { shared: { id: 'shared', title: '共享習作', status: 'active', targets: resolved.targets } };
  const deferred = deferAssignmentTarget(assignments, 'shared', assignmentCourseAKey, assignmentWeeklySchedules, assignmentSession);
  assert.deepEqual(deferred.shared.targets[assignmentCourseAKey].due, { dateKey: '2026-08-26', slotId: 'p1', period: 1, start: '08:10', end: '09:00' });
  assert.deepEqual(deferred.shared.targets[assignmentCourseBKey].due, assignments.shared.targets[assignmentCourseBKey].due);
});

test('逾期作業延期會從目前 session 之後解析，不會仍留在過去', () => {
  const oldDue = { dateKey: '2026-08-18', slotId: 'p2', period: 2, start: '09:10', end: '10:00' };
  const otherDue = { dateKey: '2026-08-25', slotId: 'p3', period: 3, start: '10:10', end: '11:00' };
  const assignments = { overdue: { id: 'overdue', title: '逾期作業', status: 'active', targets: { [assignmentCourseAKey]: { course: assignmentCourseA, due: oldDue }, [assignmentCourseBKey]: { course: assignmentCourseB, due: otherDue } } } };
  const deferred = deferAssignmentTarget(assignments, 'overdue', assignmentCourseAKey, assignmentWeeklySchedules, assignmentSession);
  assert.deepEqual(deferred.overdue.targets[assignmentCourseAKey].due, { dateKey: '2026-08-25', slotId: 'p2', period: 2, start: '09:10', end: '10:00' });
  assert.deepEqual(deferred.overdue.targets[assignmentCourseBKey].due, otherDue);
});

test('同堂多作業各自隔離，重存不重複且改回完成會移除對應權重', () => {
  const target = { course: assignmentCourseA, due: { dateKey: '2026-08-25', slotId: 'p1', period: 1, start: '08:10', end: '09:00' } };
  let records = {
    assignments: {
      a1: { id: 'a1', title: '作業 A', status: 'active', targets: { [assignmentCourseAKey]: target } },
      a2: { id: 'a2', title: '作業 B', status: 'active', targets: { [assignmentCourseAKey]: target } }
    },
    courses: {}
  };
  records = saveAssignmentCheck(records, { assignmentId: 'a1', courseKey: assignmentCourseAKey, session: assignmentSession, seatStates: { 7: 'incomplete' }, savedAt: '10:00' }).records;
  records = saveAssignmentCheck(records, { assignmentId: 'a1', courseKey: assignmentCourseAKey, session: assignmentSession, seatStates: { 7: 'incomplete' }, savedAt: '10:01' }).records;
  assert.equal(records.courses[assignmentCourseAKey].homeworkWeights[7], 1);
  records = saveAssignmentCheck(records, { assignmentId: 'a2', courseKey: assignmentCourseAKey, session: assignmentSession, seatStates: { 7: 'incomplete' }, savedAt: '10:02' }).records;
  assert.equal(records.courses[assignmentCourseAKey].homeworkWeights[7], 2);
  records = saveAssignmentCheck(records, { assignmentId: 'a1', courseKey: assignmentCourseAKey, session: assignmentSession, seatStates: {}, savedAt: '10:03' }).records;
  assert.equal(records.courses[assignmentCourseAKey].homeworkWeights[7], 1);
  assert.equal(records.courses[assignmentCourseAKey].pendingHomework.length, 1);
  assert.equal(records.assignments.a2.targets[assignmentCourseAKey].lastCheck.summary.incomplete, 1);
  assert.equal(records.assignments.a1.targets[assignmentCourseAKey].lastCheck.summary.complete, true);
});

test('共通作業依年級科目、作業與班級時間建立四層摘要', () => {
  const dueA = { dateKey: '2026-08-25', slotId: 'p1', period: 1, start: '08:10', end: '09:00' };
  const dueB = { dateKey: '2026-08-25', slotId: 'p3', period: 3, start: '10:10', end: '11:00' };
  const sessionB = createSessionSnapshot(new Date(2026, 7, 25, 10, 10), { ...dueB, id: dueB.slotId, course: assignmentCourseB });
  let records = {
    assignments: { shared: { id: 'shared', title: '酸鹼反應學習單', createdAt: '2026-08-20', status: 'active', targets: {
      [assignmentCourseAKey]: { course: assignmentCourseA, due: dueA, status: 'active', checks: [] },
      [assignmentCourseBKey]: { course: assignmentCourseB, due: dueB, status: 'active', checks: [] }
    } } },
    courses: {}
  };
  records = saveAssignmentCheck(records, { assignmentId: 'shared', courseKey: assignmentCourseAKey, session: assignmentSession, seatStates: { 12: 'incomplete', 18: 'incomplete' }, savedAt: '09:05' }).records;
  records = saveAssignmentCheck(records, { assignmentId: 'shared', courseKey: assignmentCourseBKey, session: sessionB, seatStates: { 7: 'incomplete' }, savedAt: '11:05' }).records;
  const groups = buildCommonAssignmentView(records.assignments);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, '八年級・理化');
  assert.equal(groups[0].assignmentCount, 1);
  assert.equal(groups[0].classCount, 2);
  assert.equal(groups[0].pendingSubmissionCount, 3);
  assert.deepEqual(groups[0].assignments[0].classes.map((item) => item.classLabel).sort(), ['805班', '806班']);
  const detail = assignmentClassDetail(records.assignments, 'shared', assignmentCourseAKey);
  assert.deepEqual(detail.submissions.pending.map((item) => item.seat), [12, 18]);
  assert.equal(detail.checks.length, 1);
});

test('逐人完成補交只移除精確一筆權重並保留原始檢查紀錄', () => {
  const target = { course: assignmentCourseA, due: { dateKey: '2026-08-25', slotId: 'p1', period: 1, start: '08:10', end: '09:00' } };
  let records = {
    assignments: {
      a1: { id: 'a1', title: '作業 A', status: 'active', targets: { [assignmentCourseAKey]: target } },
      a2: { id: 'a2', title: '作業 B', status: 'active', targets: { [assignmentCourseAKey]: target } }
    },
    courses: { [assignmentCourseAKey]: { manualDrawWeightsByMonth: { '2026-08': { 7: 2 } } } }
  };
  records = saveAssignmentCheck(records, { assignmentId: 'a1', courseKey: assignmentCourseAKey, session: assignmentSession, seatStates: { 7: 'incomplete' }, savedAt: '10:00' }).records;
  records = saveAssignmentCheck(records, { assignmentId: 'a2', courseKey: assignmentCourseAKey, session: assignmentSession, seatStates: { 7: 'incomplete' }, savedAt: '10:02' }).records;
  const originalCheck = records.assignments.a1.targets[assignmentCourseAKey].lastCheck;
  const submission = assignmentClassDetail(records.assignments, 'a1', assignmentCourseAKey).submissions.pending[0];
  const completed = completeHomeworkSubmission(records, {
    assignmentId: 'a1', courseKey: assignmentCourseAKey, submissionId: submission.id, seat: 7, completedAt: '2026-08-26 12:30'
  });
  assert.equal(completed.courses[assignmentCourseAKey].pendingHomework.length, 1);
  assert.equal(completed.courses[assignmentCourseAKey].homeworkWeights[7], 1);
  assert.deepEqual(completed.courses[assignmentCourseAKey].manualDrawWeightsByMonth, { '2026-08': { 7: 2 } });
  assert.strictEqual(completed.assignments.a1.targets[assignmentCourseAKey].lastCheck, originalCheck);
  assert.deepEqual(assignmentClassDetail(completed.assignments, 'a1', assignmentCourseAKey).submissions.completed.map((item) => item.seat), [7]);
  assert.deepEqual(assignmentClassDetail(completed.assignments, 'a2', assignmentCourseAKey).submissions.pending.map((item) => item.seat), [7]);
});

test('舊版待補交可遷移為精確 submission，完成後不會改寫歷史', () => {
  const check = { id: '2026-08-25:p1:legacy:805班・理化', dateKey: '2026-08-25', slotId: 'p1', seatStates: { 12: 'incomplete' }, savedAt: '09:05', summary: { incomplete: 1, leave: 0, complete: false } };
  const records = {
    assignments: { legacy: { id: 'legacy', title: '舊作業', targets: { [assignmentCourseAKey]: { course: assignmentCourseA, due: { dateKey: '2026-08-25', slotId: 'p1', period: 1, start: '08:10', end: '09:00' }, checks: [check], lastCheck: check } } } },
    courses: { [assignmentCourseAKey]: { pendingHomework: [{ seat: 12, assignment: '舊作業', date: '2026-08-25', sourceCheck: `assignment:legacy:${assignmentCourseAKey}` }], leaveConfirmations: [], homeworkWeights: { 12: 1 } } }
  };
  const normalized = normalizeHomeworkSubmissionRecords(records);
  const pending = assignmentClassDetail(normalized.assignments, 'legacy', assignmentCourseAKey).submissions.pending;
  assert.equal(pending.length, 1);
  assert.equal(pending[0].sourceCheckId, check.id);
  const completed = completeHomeworkSubmission(normalized, { assignmentId: 'legacy', courseKey: assignmentCourseAKey, submissionId: pending[0].id, seat: 12, completedAt: '2026-08-26 12:30' });
  assert.equal(completed.courses[assignmentCourseAKey].pendingHomework.length, 0);
  assert.deepEqual(completed.courses[assignmentCourseAKey].homeworkWeights, {});
  assert.strictEqual(completed.assignments.legacy.targets[assignmentCourseAKey].lastCheck, check);
});

test('共通作業單班改期與取消不影響其他班及既有補交資料', () => {
  const dueA = { dateKey: '2026-08-25', slotId: 'p1', period: 1, start: '08:10', end: '09:00' };
  const dueB = { dateKey: '2026-08-25', slotId: 'p3', period: 3, start: '10:10', end: '11:00' };
  const submission = { id: 'check:12', seat: 12, sourceCheckId: 'check', missingDateKey: '2026-08-25', status: 'pending' };
  const assignments = { shared: { id: 'shared', title: '共享作業', targets: {
    [assignmentCourseAKey]: { course: assignmentCourseA, due: dueA, status: 'active', checks: [{ id: 'check' }], submissions: { [submission.id]: submission } },
    [assignmentCourseBKey]: { course: assignmentCourseB, due: dueB, status: 'active', checks: [], submissions: {} }
  } } };
  const newDueA = { dateKey: '2026-08-26', slotId: 'p1', period: 1, start: '08:10', end: '09:00' };
  const updated = updateAssignmentTargetSchedule(assignments, { assignmentId: 'shared', courseKey: assignmentCourseAKey, due: newDueA, scheduleMode: 'date' });
  assert.deepEqual(updated.shared.targets[assignmentCourseAKey].due, newDueA);
  assert.strictEqual(updated.shared.targets[assignmentCourseAKey].submissions, assignments.shared.targets[assignmentCourseAKey].submissions);
  assert.strictEqual(updated.shared.targets[assignmentCourseBKey], assignments.shared.targets[assignmentCourseBKey]);
  const cancelled = cancelAssignmentTarget(updated, 'shared', assignmentCourseAKey, '2026-08-28');
  assert.equal(cancelled.shared.targets[assignmentCourseAKey].status, 'cancelled');
  assert.strictEqual(cancelled.shared.targets[assignmentCourseAKey].submissions, assignments.shared.targets[assignmentCourseAKey].submissions);
  assert.strictEqual(cancelled.shared.targets[assignmentCourseBKey], assignments.shared.targets[assignmentCourseBKey]);
  const detail = assignmentClassDetail(cancelled, 'shared', assignmentCourseAKey);
  const reopened = resolveAssignmentCheckSession({ ...detail, lastCheck: { dateKey: '2026-08-24', slotId: 'p7' } }, [['p7', 7, '15:10', '16:00']], true);
  assert.equal(reopened.dateKey, '2026-08-24');
  assert.equal(reopened.slot.period, 7);
});

test('新作業檢查流程跨日時仍使用 session snapshot 的原日期與課程', () => {
  const target = { course: assignmentCourseA, due: { dateKey: '2026-08-25', slotId: 'p1', period: 1, start: '08:10', end: '09:00' } };
  const records = { assignments: { cross: { id: 'cross', title: '跨日作業', status: 'active', targets: { [assignmentCourseAKey]: target } } }, courses: {} };
  const saved = saveAssignmentCheck(records, { assignmentId: 'cross', courseKey: assignmentCourseAKey, session: assignmentSession, seatStates: { 9: 'incomplete' }, savedAt: '00:01' }).records;
  assert.equal(saved.assignments.cross.targets[assignmentCourseAKey].lastCheck.dateKey, '2026-08-25');
  assert.equal(saved.courses[assignmentCourseAKey].pendingHomework[0].date, '2026-08-25');
  assert.match(saved.assignments.cross.targets[assignmentCourseAKey].lastCheck.id, /^2026-08-25:p1:/);
});

test('共享作業只改標題時保留各班既有 due，不覆寫 A 班獨立延期', () => {
  const deferredA = { dateKey: '2026-08-26', slotId: 'p1', period: 1, start: '08:10', end: '09:00' };
  const originalB = { dateKey: '2026-08-25', slotId: 'p3', period: 3, start: '10:10', end: '11:00' };
  const assignments = { shared: { id: 'shared', title: '舊標題', createdAt: '2026-08-20', scheduleMode: 'next', status: 'active', targets: { [assignmentCourseAKey]: { course: assignmentCourseA, due: deferredA, status: 'active', checks: [] }, [assignmentCourseBKey]: { course: assignmentCourseB, due: originalB, status: 'active', checks: [] } } } };
  const reResolved = resolveAssignmentTargets({ weeklySchedules: assignmentWeeklySchedules, session: assignmentSession, courses: [assignmentCourseA, assignmentCourseB], mode: 'next' }).targets;
  const updated = upsertAssignmentDefinition(assignments, {
    id: 'shared', title: '從 B 班更新的標題', scheduleMode: 'next', sessionDateKey: '2026-08-25',
    selectedCourseKeys: [assignmentCourseAKey, assignmentCourseBKey], resolvedTargets: reResolved,
    scheduleDirty: false, initialCourseKeys: [assignmentCourseAKey, assignmentCourseBKey]
  });
  assert.equal(updated.shared.title, '從 B 班更新的標題');
  assert.deepEqual(updated.shared.targets[assignmentCourseAKey].due, deferredA);
  assert.deepEqual(updated.shared.targets[assignmentCourseBKey].due, originalB);
  assert.equal(updated.shared.createdAt, '2026-08-20');
});

test('作業建立日期只使用表單 session dateKey', () => {
  const resolved = resolveAssignmentTargets({ weeklySchedules: assignmentWeeklySchedules, session: assignmentSession, courses: [assignmentCourseA], mode: 'next' }).targets;
  const assignments = upsertAssignmentDefinition({}, {
    id: 'new-one', title: '新作業', scheduleMode: 'next', sessionDateKey: assignmentSession.dateKey,
    selectedCourseKeys: [assignmentCourseAKey], resolvedTargets: resolved, initialCourseKeys: [assignmentCourseAKey]
  });
  assert.equal(assignments['new-one'].createdAt, '2026-08-25');
  assert.equal(assignments['new-one'].targets[assignmentCourseAKey].due.dateKey, '2026-08-25');
});

test('首次示範作業從目前時間之後找課，不會排入同日已結束課堂', () => {
  const due = findNextCourseOccurrence(assignmentWeeklySchedules, assignmentCourseAKey, '2026-08-25', '10:30', 35, true);
  assert.deepEqual(due, { dateKey: '2026-08-26', slotId: 'p1', period: 1, start: '08:10', end: '09:00' });
});

test('作業收合摘要分開未檢查、已檢查與未來安排數', () => {
  const due = { course: assignmentCourseA, due: { dateKey: '2026-08-25', slotId: 'p1', period: 1, start: '08:10', end: '09:00' }, status: 'active' };
  const checked = { ...due, lastCheck: { summary: { incomplete: 0, leave: 0, complete: true } } };
  const future = { course: assignmentCourseA, due: { dateKey: '2026-08-25', slotId: 'p2', period: 2, start: '09:10', end: '10:00' }, status: 'active' };
  const assignments = [
    { id: 'unchecked', targets: { [assignmentCourseAKey]: due } },
    { id: 'checked', targets: { [assignmentCourseAKey]: checked } },
    { id: 'future', targets: { [assignmentCourseAKey]: future } }
  ];
  assert.deepEqual(assignmentCountsForSession(assignments, assignmentCourseAKey, assignmentSession), { needsCheck: 1, checked: 1, scheduled: 1 });
});

test('共用作業標籤區分 1、2、6 班，且不計已取消 target', () => {
  const targets = Object.fromEntries(['高二1班', '高二2班', '高二3班', '高二4班', '高二5班', '高二6班'].map((classLabel, index) => [`course-${index + 1}`, { course: { classLabel }, status: 'active' }]));
  assert.equal(assignmentSharingLabel({ 'course-1': targets['course-1'] }), '');
  assert.equal(assignmentSharingLabel(Object.fromEntries(Object.entries(targets).slice(0, 2))), '共用作業・共 2 班');
  assert.equal(assignmentSharingLabel(targets), '共用作業・共 6 班');
  const withCancelled = { ...targets, 'course-7': { course: { classLabel: '高二7班' }, status: 'cancelled' } };
  assert.equal(activeAssignmentTargetCount(withCancelled), 6);
  assert.equal(assignmentSharingLabel(withCancelled), '共用作業・共 6 班');
});

test('修改頁共用提示只在編輯多班時顯示，且班數隨選取動態變更', () => {
  const sixKeys = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.equal(assignmentEditSharingNotice(null, sixKeys), '');
  assert.equal(assignmentEditSharingNotice('shared', ['a']), '');
  assert.equal(assignmentEditSharingNotice('shared', ['a', 'b']), '修改作業名稱會同步套用至 2 個班級；檢查與延期仍各班獨立。');
  assert.equal(assignmentEditSharingNotice('shared', sixKeys), '修改作業名稱會同步套用至 6 個班級；檢查與延期仍各班獨立。');
  assert.equal(assignmentEditSharingNotice('shared', sixKeys.slice(0, 4)), '修改作業名稱會同步套用至 4 個班級；檢查與延期仍各班獨立。');
});

test('高二物理假課表共有 6 班，每班至少安排兩堂', () => {
  const weekdayCourses = createDemoWeekdayCourses();
  const counts = {};
  for (const course of Object.values(weekdayCourses).flat().filter(Boolean)) {
    if (course.grade === 's2' && course.subject === '物理') counts[course.classLabel] = (counts[course.classLabel] || 0) + 1;
  }
  assert.deepEqual(Object.keys(counts).sort(), ['高二1班', '高二2班', '高二3班', '高二4班', '高二5班', '高二6班']);
  for (const count of Object.values(counts)) assert.ok(count >= 2);
});

test('高二物理 6 班皆能依假課表解析三種檢查時間', () => {
  const weekdayCourses = createDemoWeekdayCourses();
  const weeklySchedules = Object.fromEntries(Object.entries(weekdayCourses).map(([day, courses]) => [day, courses.map((course, index) => ({ id: `p${index + 1}`, period: index + 1, start: ['08:10', '09:10', '10:10', '11:10', '13:10', '14:10', '15:10'][index], end: ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00'][index], course }))]));
  const physicsCourses = [...new Map(Object.values(weekdayCourses).flat().filter((course) => course?.grade === 's2' && course.subject === '物理').map((course) => [courseDataKey(course), course])).values()];
  const session = createSessionSnapshot(new Date(2026, 7, 25, 8, 30), { id: 'p1', period: 1, start: '08:10', end: '09:00', course: physicsCourses.find((course) => course.classLabel === '高二3班') });
  assert.equal(physicsCourses.length, 6);
  for (const mode of ['next', 'next-week']) {
    const resolved = resolveAssignmentTargets({ weeklySchedules, session, courses: physicsCourses, mode });
    assert.deepEqual(resolved.errors, []);
    assert.equal(Object.keys(resolved.targets).length, 6);
  }

  const dateByWeekday = { 1: '2026-08-24', 2: '2026-08-25', 3: '2026-08-26', 4: '2026-08-27', 5: '2026-08-28' };
  for (const course of physicsCourses) {
    const courseKey = courseDataKey(course);
    const weekday = Object.keys(weeklySchedules).find((day) => weeklySchedules[day].some((slot) => slot.course && courseDataKey(slot.course) === courseKey));
    const resolved = resolveAssignmentTargets({ weeklySchedules, session, courses: [course], mode: 'date', selectedDate: dateByWeekday[weekday] });
    assert.deepEqual(resolved.errors, []);
    assert.equal(resolved.targets[courseKey].due.dateKey, dateByWeekday[weekday]);
  }
});

test('課堂提醒的四種類型固定，且 session 由日期、節次、班級與科目共同識別', () => {
  assert.deepEqual(CLASSROOM_REMINDER_CATEGORIES, ['趴睡', '聊天', '未依指示', '其他']);
  assert.equal(classroomReminderSessionKey(assignmentSession), `2026-08-25:p1:${assignmentCourseAKey}`);
});

test('同一堂可重複登記同一位學生，並依建立時間由新到舊顯示', () => {
  let records = { assignments: {}, exams: {}, courses: {}, reminders: {} };
  records = addClassroomReminder(records, {
    reminderId: 'r1', session: assignmentSession, seat: 12, category: '聊天', recordedTime: '10:20', createdAt: '2026-08-25T10:20:00+08:00'
  });
  records = addClassroomReminder(records, {
    reminderId: 'r2', session: assignmentSession, seat: 12, category: '聊天', recordedTime: '10:25', createdAt: '2026-08-25T10:20:00+08:00'
  });
  const reminders = classroomRemindersForSession(records.reminders, assignmentSession);
  assert.deepEqual(reminders.map((record) => [record.id, record.seat, record.category]), [['r2', 12, '聊天'], ['r1', 12, '聊天']]);
});

test('不同提醒類型合併計算，每三筆增加一個當月抽籤權重', () => {
  let records = { assignments: {}, exams: {}, courses: {}, reminders: {} };
  for (const [index, category] of ['趴睡', '聊天', '未依指示', '其他'].entries()) {
    records = addClassroomReminder(records, {
      reminderId: `combined-${index}`, session: assignmentSession, seat: 7, category, recordedTime: `10:2${index}`, createdAt: `2026-08-25T10:2${index}:00+08:00`
    });
  }
  assert.deepEqual(classroomReminderMonthlyCounts(records.reminders, assignmentCourseAKey, '2026-08'), { 7: 4 });
  assert.deepEqual(classroomReminderWeightsForMonth(records.reminders, assignmentCourseAKey, '2026-08'), { 7: 1 });
});

test('課堂提醒依班級加科目與月份隔離，換月不沿用有效權重', () => {
  const otherCourse = courseFromSelection({ system: 'junior', grade: 'j8', className: '5', subject: '數學' });
  const otherSession = { ...assignmentSession, course: otherCourse };
  const nextMonthSession = { ...assignmentSession, dateKey: '2026-09-01' };
  let records = { assignments: {}, exams: {}, courses: {}, reminders: {} };
  for (let index = 0; index < 3; index += 1) {
    records = addClassroomReminder(records, { reminderId: `base-${index}`, session: assignmentSession, seat: 9, category: '聊天', recordedTime: '10:20', createdAt: `2026-08-25T10:20:0${index}+08:00` });
    records = addClassroomReminder(records, { reminderId: `subject-${index}`, session: otherSession, seat: 9, category: '聊天', recordedTime: '10:20', createdAt: `2026-08-25T10:21:0${index}+08:00` });
    records = addClassroomReminder(records, { reminderId: `month-${index}`, session: nextMonthSession, seat: 9, category: '聊天', recordedTime: '10:20', createdAt: `2026-09-01T10:20:0${index}+08:00` });
  }
  assert.deepEqual(classroomReminderWeightsForMonth(records.reminders, assignmentCourseAKey, '2026-08'), { 9: 1 });
  assert.deepEqual(classroomReminderWeightsForMonth(records.reminders, assignmentCourseAKey, '2026-09'), { 9: 1 });
  assert.deepEqual(classroomReminderMonthlyCounts(records.reminders, courseDataKey(otherCourse), '2026-08'), { 9: 3 });
});

test('復原只撤回指定提醒，其他重複登記與歷史資料仍保留', () => {
  let records = { assignments: {}, exams: {}, courses: {}, reminders: {} };
  for (let index = 1; index <= 3; index += 1) {
    records = addClassroomReminder(records, { reminderId: `undo-${index}`, session: assignmentSession, seat: 18, category: '趴睡', recordedTime: `10:2${index}`, createdAt: `2026-08-25T10:2${index}:00+08:00` });
  }
  records = undoClassroomReminder(records, { reminderId: 'undo-2', reversedAt: '2026-08-25T10:30:00+08:00' });
  assert.equal(records.reminders['undo-2'].status, 'reversed');
  assert.deepEqual(classroomRemindersForSession(records.reminders, assignmentSession).map((record) => record.id), ['undo-3', 'undo-1']);
  assert.deepEqual(classroomReminderMonthlyCounts(records.reminders, assignmentCourseAKey, '2026-08'), { 18: 2 });
  assert.deepEqual(classroomReminderWeightsForMonth(records.reminders, assignmentCourseAKey, '2026-08'), {});
});

test('空號與不明提醒類型不會新增課堂提醒', () => {
  const records = { assignments: {}, exams: {}, courses: {}, reminders: {} };
  const disabled = addClassroomReminder(records, { reminderId: 'disabled', session: assignmentSession, seat: 4, category: '聊天', recordedTime: '10:20', createdAt: '2026-08-25T10:20:00+08:00' });
  const beyondRoster = addClassroomReminder(records, { reminderId: 'beyond', session: assignmentSession, seat: 53, category: '聊天', recordedTime: '10:20', createdAt: '2026-08-25T10:20:00+08:00' });
  const unknown = addClassroomReminder(records, { reminderId: 'unknown', session: assignmentSession, seat: 12, category: '未分類', recordedTime: '10:20', createdAt: '2026-08-25T10:20:00+08:00' });
  assert.strictEqual(disabled, records);
  assert.strictEqual(beyondRoster, records);
  assert.strictEqual(unknown, records);
});

test('班級最後座號與空號會限制作業、考試、提醒與抽籤候選人', () => {
  const teachingClass = { id: 'class-s2-a-physics', system: 'senior', grade: 's2', className: '甲', subject: '物理', lastSeat: 48, vacantSeats: [2, 11] };
  const course = courseFromTeachingClass(teachingClass);
  const courseKey = courseDataKey(course);
  const roster = teachingClassRoster(teachingClass);
  const session = { dateKey: '2026-09-07', slotId: 'p8', period: 8, start: '16:10', end: '17:00', course };
  const assignmentId = 'assignment-roster';
  const examId = 'exam-roster';
  const records = {
    assignments: { [assignmentId]: { id: assignmentId, title: '名冊測試作業', targets: { [courseKey]: { course, due: { dateKey: session.dateKey, slotId: session.slotId }, checks: [], submissions: {} } } } },
    exams: { [examId]: { id: examId, title: '名冊測試考試', targets: { [courseKey]: { course, due: { dateKey: session.dateKey, slotId: session.slotId }, checks: [], makeups: {} } } } },
    courses: {}, reminders: {}, drawSessions: {}
  };
  const assignmentResult = saveAssignmentCheck(records, {
    assignmentId,
    courseKey,
    session,
    seatStates: { 1: 'incomplete', 2: 'incomplete', 48: 'leave', 49: 'incomplete' },
    activeSeats: roster.activeSeats,
    savedAt: '17:01'
  });
  assert.deepEqual(assignmentResult.records.assignments[assignmentId].targets[courseKey].lastCheck.seatStates, { 1: 'incomplete', 48: 'leave' });
  const examResult = saveExamCheck(assignmentResult.records, {
    examId,
    courseKey,
    session,
    seatStates: { 2: 'absent', 11: 'absent', 48: 'absent', 49: 'absent' },
    disabledSeats: roster.vacantSeats,
    activeSeats: roster.activeSeats,
    savedAt: '17:02'
  });
  assert.deepEqual(examResult.summary.absentSeats, [48]);
  const rejectedReminder = addClassroomReminder(examResult.records, { reminderId: 'outside-roster', session, seat: 49, category: '聊天', activeSeats: roster.activeSeats, createdAt: '2026-09-07T17:03:00+08:00' });
  assert.strictEqual(rejectedReminder, examResult.records);
  const acceptedReminder = addClassroomReminder(examResult.records, { reminderId: 'inside-roster', session, seat: 48, category: '聊天', activeSeats: roster.activeSeats, createdAt: '2026-09-07T17:03:00+08:00' });
  assert.equal(acceptedReminder.reminders['inside-roster'].seat, 48);
  const pool = createWeightedDrawPool({ activeSeats: roster.activeSeats, excludedSeats: [], drawnSeats: [], allowRepeat: true });
  assert.equal(pool.some((entry) => [2, 11, 49].includes(entry.seat)), false);
  assert.equal(pool.at(-1).seat, 48);
});
