export const DISABLED_SEATS = [4, 36];
export const ROSTER_CAPACITY = 52;

export const CLASSROOM_REMINDER_CATEGORIES = ['趴睡', '聊天', '未依指示', '其他'];

export const DATA_BACKUP_APP_ID = 'teacher-classroom-assistant';
export const DATA_BACKUP_SCHEMA_VERSION = 1;
export const DATA_BACKUP_PAYLOAD_FIELDS = [
  'scheduleOverrides',
  'academicPeriodSettings',
  'teachingClassSettings',
  'scheduleManagementSettings',
  'classroomRecords'
];

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function dataBackupFailure(code, message) {
  return { valid: false, code, message, envelope: null };
}

function isRecordCollection(value) {
  return isRecord(value) && Object.values(value).every(isRecord);
}

function isOptionalRecord(value) {
  return value == null || isRecord(value);
}

function isOptionalRecordArray(value) {
  return value == null || (Array.isArray(value) && value.every(isRecord));
}

function isOptionalRecordCollection(value) {
  return value == null || isRecordCollection(value);
}

function validBackupCheck(check) {
  if (!isRecord(check)) return false;
  if (!isOptionalRecord(check.seatStates) || !isOptionalRecord(check.summary)) return false;
  const summary = check.summary;
  if (summary && ['incompleteSeats', 'leaveSeats', 'absentSeats'].some((field) => summary[field] != null && !Array.isArray(summary[field]))) return false;
  return true;
}

function validBackupTarget(target, childField) {
  if (!isRecord(target) || !isRecord(target.course) || !isOptionalRecord(target.due)) return false;
  if (!isOptionalRecordArray(target.checks) || !isOptionalRecord(target.lastCheck)) return false;
  if (target.checks && !target.checks.every(validBackupCheck)) return false;
  if (target.lastCheck && !validBackupCheck(target.lastCheck)) return false;
  if (!isOptionalRecordCollection(target[childField])) return false;
  return true;
}

function validClassroomBackupRecords(records) {
  if (records === null) return true;
  if (!isRecord(records)) return false;
  const collections = ['assignments', 'exams', 'courses', 'reminders', 'drawSessions'];
  if (!collections.every((field) => isRecordCollection(records[field]))) return false;
  if (!isOptionalRecord(records.meta)) return false;

  for (const [assignmentId, assignment] of Object.entries(records.assignments)) {
    if (typeof assignment.id !== 'string' || assignment.id !== assignmentId || typeof assignment.title !== 'string' || !isRecord(assignment.targets)) return false;
    if (!Object.values(assignment.targets).every((target) => validBackupTarget(target, 'submissions'))) return false;
  }
  for (const [examId, exam] of Object.entries(records.exams)) {
    if (typeof exam.id !== 'string' || exam.id !== examId || typeof exam.title !== 'string' || !isRecord(exam.targets)) return false;
    if (!Object.values(exam.targets).every((target) => validBackupTarget(target, 'makeups'))) return false;
    for (const target of Object.values(exam.targets)) {
      for (const makeup of Object.values(target.makeups || {})) {
        if (makeup.status === 'pending' && typeof makeup.absentDateKey !== 'string') return false;
      }
    }
  }
  for (const course of Object.values(records.courses)) {
    if (!isOptionalRecordArray(course.pendingHomework)
      || !isOptionalRecordArray(course.completedHomework)
      || !isOptionalRecordArray(course.leaveConfirmations)
      || !isOptionalRecord(course.homeworkWeights)
      || !isOptionalRecord(course.manualDrawWeightsByMonth)) return false;
    if (course.manualDrawWeightsByMonth && !Object.values(course.manualDrawWeightsByMonth).every(isRecord)) return false;
  }
  for (const reminder of Object.values(records.reminders)) {
    if (!Number.isInteger(Number(reminder.seat)) || !CLASSROOM_REMINDER_CATEGORIES.includes(reminder.category)) return false;
    if (reminder.course != null && !isRecord(reminder.course)) return false;
  }
  for (const session of Object.values(records.drawSessions)) {
    if (!isOptionalRecordArray(session.history)) return false;
    if (session.excludedSeats != null && !Array.isArray(session.excludedSeats)) return false;
    if (session.seatsThisRound != null && !Array.isArray(session.seatsThisRound)) return false;
  }

  try {
    const normalized = normalizeHomeworkSubmissionRecords(normalizeClassroomRecords(records));
    buildCommonAssignmentView(normalized.assignments);
    buildCommonExamView(normalized.exams);
    for (const courseKey of Object.keys(normalized.courses || {})) {
      pendingHomeworkSubmissionsForCourse(normalized.assignments, courseKey);
      pendingExamMakeupsForCourse(normalized.exams, courseKey);
    }
    const reminder = Object.values(normalized.reminders || {})[0];
    if (reminder) classroomReminderMonthlyCounts(normalized.reminders, reminder.courseKey, reminder.monthKey);
  } catch {
    return false;
  }
  return true;
}

export function createDataBackupEnvelope({ dataProfile, exportedAt, payload } = {}) {
  if (!['formal', 'test'].includes(dataProfile)) throw new TypeError('Unsupported data profile');
  if (!isRecord(payload)) throw new TypeError('Backup payload must be an object');
  const timestamp = String(exportedAt || new Date().toISOString());
  const normalizedPayload = Object.fromEntries(
    DATA_BACKUP_PAYLOAD_FIELDS.map((field) => [field, Object.prototype.hasOwnProperty.call(payload, field) ? payload[field] : null])
  );
  return {
    appId: DATA_BACKUP_APP_ID,
    schemaVersion: DATA_BACKUP_SCHEMA_VERSION,
    dataProfile,
    exportedAt: timestamp,
    payload: normalizedPayload
  };
}

export function validateDataBackupEnvelope(candidate, expectedProfile = null) {
  if (!isRecord(candidate)) return dataBackupFailure('invalid-file', '這不是可讀取的教師助手備份檔。');
  if (candidate.appId !== DATA_BACKUP_APP_ID) return dataBackupFailure('wrong-app', '這份檔案不是教師助手建立的備份。');
  if (Number(candidate.schemaVersion) !== DATA_BACKUP_SCHEMA_VERSION) return dataBackupFailure('unsupported-version', '這份備份使用目前不支援的資料版本。');
  if (!['formal', 'test'].includes(candidate.dataProfile)) return dataBackupFailure('invalid-profile', '這份備份沒有正確的資料模式標記。');
  if (expectedProfile && candidate.dataProfile !== expectedProfile) {
    const expected = expectedProfile === 'test' ? '測試資料' : '正式資料';
    const actual = candidate.dataProfile === 'test' ? '測試資料' : '正式資料';
    return dataBackupFailure('profile-mismatch', `目前是${expected}模式，不能匯入${actual}備份。`);
  }
  if (!candidate.exportedAt || Number.isNaN(new Date(candidate.exportedAt).getTime())) {
    return dataBackupFailure('invalid-date', '這份備份缺少有效的備份時間。');
  }
  if (!isRecord(candidate.payload)) return dataBackupFailure('invalid-payload', '這份備份沒有完整的資料內容。');
  if (!DATA_BACKUP_PAYLOAD_FIELDS.every((field) => Object.prototype.hasOwnProperty.call(candidate.payload, field))) {
    return dataBackupFailure('missing-fields', '這份備份缺少必要的資料區塊。');
  }

  const { scheduleOverrides, academicPeriodSettings, teachingClassSettings, scheduleManagementSettings, classroomRecords } = candidate.payload;
  if (scheduleOverrides !== null && (!isRecordCollection(scheduleOverrides)
    || !Object.keys(scheduleOverrides).every((key) => /^\d{4}-\d{2}-\d{2}:p[1-8]$/.test(key)))) {
    return dataBackupFailure('invalid-schedule-overrides', '這份備份的單日調課資料無法讀取。');
  }
  if (academicPeriodSettings !== null && !validateAcademicPeriodSettings(academicPeriodSettings).valid) {
    return dataBackupFailure('invalid-academic-periods', '這份備份的學年與期間資料無法讀取。');
  }
  if (teachingClassSettings !== null && !parseTeachingClassSettings(teachingClassSettings).valid) {
    return dataBackupFailure('invalid-teaching-classes', '這份備份的授課班級資料無法讀取。');
  }
  if (scheduleManagementSettings !== null && !parseScheduleManagementSettings(scheduleManagementSettings).valid) {
    return dataBackupFailure('invalid-managed-schedules', '這份備份的課表資料無法讀取。');
  }
  if (!validClassroomBackupRecords(classroomRecords)) return dataBackupFailure('invalid-classroom-records', '這份備份的課堂紀錄不完整或已損壞。');
  return { valid: true, code: null, message: '', envelope: candidate };
}

export const ACADEMIC_PERIOD_DEFINITIONS = [
  { id: 'summer', label: '暑輔', optional: true },
  { id: 'firstSemester', label: '上學期', optional: false },
  { id: 'winter', label: '寒輔', optional: true },
  { id: 'secondSemester', label: '下學期', optional: false }
];

const ACADEMIC_PERIOD_ALIASES = {
  summer: ['summer', 'summerBreak'],
  firstSemester: ['firstSemester', 'first', 'semester1', 'upper'],
  winter: ['winter', 'winterBreak'],
  secondSemester: ['secondSemester', 'second', 'semester2', 'lower']
};

function validCalendarDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function academicPeriodSource(periods, id) {
  const aliases = ACADEMIC_PERIOD_ALIASES[id] || [id];
  if (Array.isArray(periods)) return periods.find((period) => aliases.includes(period?.id)) || null;
  if (!periods || typeof periods !== 'object') return null;
  for (const alias of aliases) {
    if (periods[alias] && typeof periods[alias] === 'object') return periods[alias];
  }
  return null;
}

function canonicalAcademicYear(value, fallback = 115) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1 && year <= 999 ? year : fallback;
}

export function createDefaultAcademicPeriodSettings(academicYear = 115) {
  const normalizedYear = canonicalAcademicYear(academicYear);
  const gregorianYear = normalizedYear + 1911;
  return {
    version: 1,
    academicYear: normalizedYear,
    periods: [
      { id: 'summer', enabled: true, startDate: `${gregorianYear}-07-20`, endDate: `${gregorianYear}-08-21` },
      { id: 'firstSemester', enabled: true, startDate: `${gregorianYear}-08-31`, endDate: `${gregorianYear + 1}-01-20` },
      { id: 'winter', enabled: false, startDate: `${gregorianYear + 1}-01-25`, endDate: `${gregorianYear + 1}-02-05` },
      { id: 'secondSemester', enabled: true, startDate: `${gregorianYear + 1}-02-15`, endDate: `${gregorianYear + 1}-06-30` }
    ]
  };
}

export function normalizeAcademicPeriodSettings(stored, fallback = createDefaultAcademicPeriodSettings()) {
  const source = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  const fallbackSettings = fallback && typeof fallback === 'object' ? fallback : createDefaultAcademicPeriodSettings();
  const academicYear = canonicalAcademicYear(
    source.academicYear ?? source.schoolYear ?? source.rocYear,
    canonicalAcademicYear(fallbackSettings.academicYear)
  );
  const yearFallback = createDefaultAcademicPeriodSettings(academicYear);
  const fallbackPeriods = canonicalAcademicYear(fallbackSettings.academicYear) === academicYear && Array.isArray(fallbackSettings.periods)
    ? fallbackSettings.periods
    : yearFallback.periods;
  const periods = ACADEMIC_PERIOD_DEFINITIONS.map((definition) => {
    const storedPeriod = academicPeriodSource(source.periods, definition.id);
    const fallbackPeriod = academicPeriodSource(fallbackPeriods, definition.id)
      || academicPeriodSource(yearFallback.periods, definition.id);
    const rawStart = storedPeriod ? storedPeriod.startDate ?? storedPeriod.start : fallbackPeriod?.startDate;
    const rawEnd = storedPeriod ? storedPeriod.endDate ?? storedPeriod.end : fallbackPeriod?.endDate;
    const storedEnabled = storedPeriod ? storedPeriod.enabled ?? storedPeriod.active : undefined;
    return {
      id: definition.id,
      enabled: definition.optional
        ? (typeof storedEnabled === 'boolean' ? storedEnabled : Boolean(fallbackPeriod?.enabled))
        : true,
      startDate: validCalendarDateKey(rawStart) ? rawStart : '',
      endDate: validCalendarDateKey(rawEnd) ? rawEnd : ''
    };
  });
  return { version: 1, academicYear, periods };
}

function shiftCalendarDateKeyYear(dateKey, yearDelta) {
  if (!validCalendarDateKey(dateKey) || !Number.isInteger(yearDelta)) return dateKey;
  const [year, month, day] = dateKey.split('-').map(Number);
  const targetYear = year + yearDelta;
  const lastDay = new Date(targetYear, month, 0, 12, 0, 0, 0).getDate();
  return `${String(targetYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function shiftAcademicPeriodSettingsYear(settings, nextAcademicYear) {
  const current = normalizeAcademicPeriodSettings(settings);
  const previousYear = Number(settings?.academicYear);
  const requestedYear = Number(nextAcademicYear);
  if (!Number.isInteger(requestedYear) || requestedYear < 1 || requestedYear > 999) {
    return { ...current, academicYear: nextAcademicYear };
  }
  const yearDelta = Number.isInteger(previousYear) ? requestedYear - previousYear : 0;
  return {
    ...current,
    academicYear: requestedYear,
    periods: current.periods.map((period) => ({
      ...period,
      startDate: shiftCalendarDateKeyYear(period.startDate, yearDelta),
      endDate: shiftCalendarDateKeyYear(period.endDate, yearDelta)
    }))
  };
}

export function validateAcademicPeriodSettings(settings) {
  const source = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  const errors = [];
  const fieldErrors = {};
  const academicYear = Number(source.academicYear ?? source.schoolYear ?? source.rocYear);
  if (!Number.isInteger(academicYear) || academicYear < 1 || academicYear > 999) {
    const message = '請輸入 1～999 的民國學年度。';
    errors.push({ code: 'academic-year', field: 'academicYear', message });
    fieldErrors.academicYear = message;
  }
  const defaultPeriods = createDefaultAcademicPeriodSettings(
    Number.isInteger(academicYear) && academicYear >= 1 && academicYear <= 999 ? academicYear : 115
  ).periods;

  const enabledIntervals = [];
  for (const definition of ACADEMIC_PERIOD_DEFINITIONS) {
    const period = academicPeriodSource(source.periods, definition.id) || {};
    const rawEnabled = period.enabled ?? period.active;
    const defaultPeriod = academicPeriodSource(defaultPeriods, definition.id);
    const enabled = definition.optional
      ? (typeof rawEnabled === 'boolean' ? rawEnabled : defaultPeriod?.enabled === true)
      : true;
    if (!enabled) continue;
    const startDate = String(period.startDate ?? period.start ?? '');
    const endDate = String(period.endDate ?? period.end ?? '');
    const startField = `${definition.id}.startDate`;
    const endField = `${definition.id}.endDate`;
    if (!validCalendarDateKey(startDate)) {
      const message = `${definition.label}需要開始日期。`;
      errors.push({ code: 'required-start', periodId: definition.id, field: startField, message });
      fieldErrors[startField] = message;
    }
    if (!validCalendarDateKey(endDate)) {
      const message = `${definition.label}需要結束日期。`;
      errors.push({ code: 'required-end', periodId: definition.id, field: endField, message });
      fieldErrors[endField] = message;
    }
    if (validCalendarDateKey(startDate) && validCalendarDateKey(endDate)) {
      if (startDate > endDate) {
        const message = `${definition.label}的開始日期不能晚於結束日期。`;
        errors.push({ code: 'reversed-range', periodId: definition.id, field: endField, message });
        fieldErrors[endField] = message;
      } else {
        enabledIntervals.push({ id: definition.id, label: definition.label, startDate, endDate });
      }
    }
  }

  for (let leftIndex = 0; leftIndex < enabledIntervals.length; leftIndex += 1) {
    const left = enabledIntervals[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < enabledIntervals.length; rightIndex += 1) {
      const right = enabledIntervals[rightIndex];
      if (left.startDate <= right.endDate && right.startDate <= left.endDate) {
        const message = `${left.label}與${right.label}的日期不能重疊。`;
        errors.push({ code: 'overlap', periodIds: [left.id, right.id], field: `${left.id}.startDate`, message });
        for (const period of [left, right]) {
          fieldErrors[`${period.id}.startDate`] ||= message;
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, fieldErrors };
}

export function academicPeriodForLocalDate(settings, date = new Date()) {
  const dateKey = typeof date === 'string' ? date : localDateKey(date);
  if (!validCalendarDateKey(dateKey)) return null;
  const normalized = normalizeAcademicPeriodSettings(settings);
  for (const definition of ACADEMIC_PERIOD_DEFINITIONS) {
    const period = academicPeriodSource(normalized.periods, definition.id);
    if (!period?.enabled || !validCalendarDateKey(period.startDate) || !validCalendarDateKey(period.endDate)) continue;
    if (period.startDate <= dateKey && dateKey <= period.endDate) {
      return { id: definition.id, label: definition.label, startDate: period.startDate, endDate: period.endDate };
    }
  }
  return null;
}

const BOTTOM_NAVIGATION_PAGE_TABS = {
  today: 'today',
  course: 'today',
  'assignment-hub': 'assignment',
  'exam-hub': 'exam',
  settings: 'settings'
};

export function bottomNavigationActiveTab(page) {
  return BOTTOM_NAVIGATION_PAGE_TABS[page] || '';
}

export function shouldShowBottomNavigation(page, hasModal = false) {
  return !hasModal && Boolean(bottomNavigationActiveTab(page));
}

export const COURSE_CATALOG = {
  junior: {
    label: '國中部',
    grades: {
      j7: { label: '七年級', classes: ['1', '2', '3', '4', '5', '6', '7'], subjects: ['國文', '英語', '數學', '自然', '生物'] },
      j8: { label: '八年級', classes: ['1', '2', '3', '4', '5', '6', '7'], subjects: ['國文', '英語', '數學', '理化', '地理'] },
      j9: { label: '九年級', classes: ['1', '2', '3', '4', '5', '6', '7'], subjects: ['國文', '英語', '數學', '理化', '公民'] }
    }
  },
  senior: {
    label: '高中部',
    grades: {
      s1: { label: '高一', classes: ['1', '2', '3', '4', '5', '6'], subjects: ['國文', '英語', '數學', '物理', '化學'] },
      s2: { label: '高二', classes: ['1', '2', '3', '4', '5', '6'], subjects: ['國文', '英語', '數學', '物理', '化學'] },
      s3: { label: '高三', classes: ['1', '2', '3', '4', '5', '6'], subjects: ['國文', '英語', '數學', '物理', '化學'] }
    }
  }
};

export function createEmptyTeachingClassSettings() {
  return { version: 1, byAcademicYear: {} };
}

function validTeachingAcademicYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1 && year <= 999 ? year : null;
}

function vacantSeatTokens(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).normalize('NFKC').trim()).filter(Boolean);
  const text = String(value ?? '').normalize('NFKC').trim();
  return text ? text.split(/[\s,，、;；]+/).filter(Boolean) : [];
}

export function parseVacantSeatInput(value) {
  const invalidTokens = [];
  const seats = [];
  for (const token of vacantSeatTokens(value)) {
    if (!/^\d+$/.test(token)) {
      invalidTokens.push(token);
      continue;
    }
    const seat = Number(token);
    if (!Number.isSafeInteger(seat)) invalidTokens.push(token);
    else seats.push(seat);
  }
  return {
    seats: [...new Set(seats)].sort((left, right) => left - right),
    invalidTokens: [...new Set(invalidTokens)]
  };
}

function normalizeTeachingSubject(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function normalizeTeachingClassName(value) {
  let className = String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  className = className.replace(/(?:\s*班)+$/u, '').trim();
  if (/^\d+$/.test(className) && Number.isSafeInteger(Number(className))) className = String(Number(className));
  else if (/^[a-z]+$/i.test(className)) className = className.toUpperCase();
  return className;
}

function teachingClassCompositeKey(record) {
  return JSON.stringify([record.system, record.grade, record.className, record.subject]);
}

function physicalClassKey(record) {
  return JSON.stringify([record.system, record.grade, record.className]);
}

function fallbackTeachingClassId(record) {
  const source = teachingClassCompositeKey(record);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `class-${(hash >>> 0).toString(36)}`;
}

function normalizedTeachingClassRecord(raw, catalog = COURSE_CATALOG) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const system = String(raw.system ?? raw.schoolSystem ?? '');
  const grade = String(raw.grade ?? raw.gradeId ?? '');
  const className = normalizeTeachingClassName(raw.className ?? raw.classNumber ?? raw.classNo);
  const subject = normalizeTeachingSubject(raw.subject);
  const lastSeat = Number(raw.lastSeat ?? raw.seatCount ?? raw.rosterCapacity);
  const vacantSource = raw.vacantSeats ?? raw.disabledSeats ?? [];
  const vacant = parseVacantSeatInput(vacantSource);
  if (!catalog[system]?.grades?.[grade]) return null;
  if (!className || className.length > 20 || (/^\d+$/.test(className) && (Number(className) < 1 || Number(className) > 99))) return null;
  if (!subject || subject.length > 40 || !Number.isInteger(lastSeat) || lastSeat < 1 || lastSeat > 60) return null;
  if (vacant.invalidTokens.length || vacant.seats.some((seat) => seat < 1 || seat > lastSeat) || vacant.seats.length >= lastSeat) return null;
  const record = {
    id: String(raw.id ?? '').trim(),
    system,
    grade,
    className,
    subject,
    lastSeat,
    vacantSeats: vacant.seats
  };
  if (!record.id) record.id = fallbackTeachingClassId(record);
  return record;
}

function normalizedTeachingYearRecords(records, catalog = COURSE_CATALOG) {
  if (!Array.isArray(records)) return [];
  const normalized = [];
  const ids = new Set();
  const composites = new Set();
  const rosters = new Map();
  for (const raw of records) {
    const record = normalizedTeachingClassRecord(raw, catalog);
    if (!record) continue;
    const composite = teachingClassCompositeKey(record);
    if (ids.has(record.id) || composites.has(composite)) continue;
    const classKey = physicalClassKey(record);
    const sharedRoster = rosters.get(classKey);
    if (sharedRoster) {
      record.lastSeat = sharedRoster.lastSeat;
      record.vacantSeats = [...sharedRoster.vacantSeats];
    } else {
      rosters.set(classKey, { lastSeat: record.lastSeat, vacantSeats: [...record.vacantSeats] });
    }
    ids.add(record.id);
    composites.add(composite);
    normalized.push(record);
  }
  return normalized;
}

export function normalizeTeachingClassSettings(stored, catalog = COURSE_CATALOG) {
  const result = createEmptyTeachingClassSettings();
  if (!stored || typeof stored !== 'object') return result;
  let source = stored.byAcademicYear;
  if (!source && !Array.isArray(stored)) {
    const legacyYear = validTeachingAcademicYear(stored.academicYear ?? stored.schoolYear);
    const legacyRecords = stored.records ?? stored.classes ?? stored.teachingClasses;
    if (legacyYear && Array.isArray(legacyRecords)) source = { [legacyYear]: legacyRecords };
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return result;
  for (const [rawYear, records] of Object.entries(source)) {
    const year = validTeachingAcademicYear(rawYear);
    if (!year || !Array.isArray(records)) continue;
    result.byAcademicYear[String(year)] = normalizedTeachingYearRecords(records, catalog);
  }
  return result;
}

export function parseTeachingClassSettings(stored, catalog = COURSE_CATALOG) {
  const empty = createEmptyTeachingClassSettings();
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return { valid: false, migrated: false, settings: empty };
  const isCurrent = stored.version === 1 && stored.byAcademicYear && typeof stored.byAcademicYear === 'object' && !Array.isArray(stored.byAcademicYear);
  const legacyYear = validTeachingAcademicYear(stored.academicYear ?? stored.schoolYear);
  const legacyRecords = stored.records ?? stored.classes ?? stored.teachingClasses;
  const isLegacy = !isCurrent && Boolean(legacyYear && Array.isArray(legacyRecords));
  if (!isCurrent && !isLegacy) return { valid: false, migrated: false, settings: empty };
  const source = isCurrent ? stored.byAcademicYear : { [legacyYear]: legacyRecords };
  const seenIds = new Set();
  for (const [rawYear, records] of Object.entries(source)) {
    if (!validTeachingAcademicYear(rawYear) || !Array.isArray(records)) return { valid: false, migrated: false, settings: empty };
    const seenComposites = new Set();
    const rosters = new Map();
    for (const raw of records) {
      if (isCurrent && !String(raw?.id ?? '').trim()) return { valid: false, migrated: false, settings: empty };
      const record = normalizedTeachingClassRecord(raw, catalog);
      if (!record) return { valid: false, migrated: false, settings: empty };
      const composite = teachingClassCompositeKey(record);
      if (seenIds.has(record.id) || seenComposites.has(composite)) return { valid: false, migrated: false, settings: empty };
      const classKey = physicalClassKey(record);
      const roster = `${record.lastSeat}:${record.vacantSeats.join(',')}`;
      if (rosters.has(classKey) && rosters.get(classKey) !== roster) return { valid: false, migrated: false, settings: empty };
      rosters.set(classKey, roster);
      seenIds.add(record.id);
      seenComposites.add(composite);
    }
  }
  return { valid: true, migrated: isLegacy, settings: normalizeTeachingClassSettings(isLegacy ? { academicYear: legacyYear, records: legacyRecords } : stored, catalog) };
}

export function teachingClassesForAcademicYear(settings, academicYear, catalog = COURSE_CATALOG) {
  const year = validTeachingAcademicYear(academicYear);
  if (!year) return [];
  return normalizeTeachingClassSettings(settings, catalog).byAcademicYear[String(year)] || [];
}

export function validateTeachingClassDraft(draft, existingRecords = [], catalog = COURSE_CATALOG) {
  const source = draft && typeof draft === 'object' && !Array.isArray(draft) ? draft : {};
  const errors = [];
  const fieldErrors = {};
  const addError = (field, code, message) => {
    errors.push({ field, code, message });
    fieldErrors[field] ||= message;
  };
  const system = String(source.system ?? '');
  const grade = String(source.grade ?? '');
  const className = normalizeTeachingClassName(source.className);
  const subject = normalizeTeachingSubject(source.subject);
  const lastSeatText = String(source.lastSeat ?? '').trim();
  const lastSeat = Number(lastSeatText);
  const vacantInput = source.vacantSeatsInput ?? source.vacantSeats ?? '';
  const vacant = parseVacantSeatInput(vacantInput);

  if (!catalog[system]) addError('system', 'system', '請選擇學制。');
  if (!catalog[system]?.grades?.[grade]) addError('grade', 'grade', '請選擇符合學制的年級。');
  if (!className) addError('className', 'class-required', '請輸入班級。');
  else if (className.length > 20) addError('className', 'class-length', '班級最多輸入 20 個字。');
  else if (/^\d+$/.test(className) && (Number(className) < 1 || Number(className) > 99)) addError('className', 'class-number', '數字班級請輸入 1～99。');
  if (!subject) addError('subject', 'subject', '請輸入科目。');
  else if (subject.length > 40) addError('subject', 'subject-length', '科目最多輸入 40 個字。');
  if (!/^\d+$/.test(lastSeatText) || !Number.isInteger(lastSeat) || lastSeat < 1 || lastSeat > 60) addError('lastSeat', 'last-seat', '最後座號請輸入 1～60 的正整數。');
  if (vacant.invalidTokens.length) addError('vacantSeats', 'vacant-format', `空號請只輸入座號；無法辨識：${vacant.invalidTokens.join('、')}。`);
  if (Number.isInteger(lastSeat) && vacant.seats.some((seat) => seat < 1 || seat > lastSeat)) addError('vacantSeats', 'vacant-range', `空號必須介於 1～${lastSeat}。`);
  if (Number.isInteger(lastSeat) && lastSeat > 0 && vacant.seats.length >= lastSeat) addError('vacantSeats', 'all-vacant', '空號不能包含全部座號。');

  const candidate = {
    id: String(source.id ?? '').trim(),
    system,
    grade,
    className,
    subject,
    lastSeat,
    vacantSeats: vacant.seats
  };
  if (!errors.length) {
    const duplicate = normalizedTeachingYearRecords(existingRecords, catalog).find((record) => (
      record.id !== candidate.id && teachingClassCompositeKey(record) === teachingClassCompositeKey(candidate)
    ));
    if (duplicate) {
      const message = '這個班級與科目已經設定過了。';
      addError('className', 'duplicate', message);
      fieldErrors.subject ||= message;
    }
  }
  return { valid: errors.length === 0, errors, fieldErrors, record: errors.length ? null : candidate };
}

export function upsertTeachingClassForAcademicYear(settings, academicYear, record, catalog = COURSE_CATALOG) {
  const year = validTeachingAcademicYear(academicYear);
  const normalizedRecord = normalizedTeachingClassRecord(record, catalog);
  if (!year || !normalizedRecord) return normalizeTeachingClassSettings(settings, catalog);
  const result = normalizeTeachingClassSettings(settings, catalog);
  const yearKey = String(year);
  const current = result.byAcademicYear[yearKey] || [];
  const index = current.findIndex((item) => item.id === normalizedRecord.id);
  const next = current.map((item) => physicalClassKey(item) === physicalClassKey(normalizedRecord)
    ? { ...item, lastSeat: normalizedRecord.lastSeat, vacantSeats: [...normalizedRecord.vacantSeats] }
    : item);
  if (index >= 0) next[index] = normalizedRecord;
  else next.push(normalizedRecord);
  result.byAcademicYear[yearKey] = normalizedTeachingYearRecords(next, catalog);
  return result;
}

export function teachingClassDisplayLabel(record, catalog = COURSE_CATALOG) {
  const className = normalizeTeachingClassName(record?.className);
  const grade = catalog[record?.system]?.grades?.[record?.grade];
  if (!grade || !className) return '';
  if (/^\d+$/.test(className) && record.system === 'junior') return `${String(record.grade).replace(/^j/, '')}${className.padStart(2, '0')}班`;
  return `${grade.label}${className}班`;
}

function compareTeachingClassNames(left, right) {
  const leftIsNumber = /^\d+$/.test(left);
  const rightIsNumber = /^\d+$/.test(right);
  if (leftIsNumber && rightIsNumber) return Number(left) - Number(right);
  if (leftIsNumber !== rightIsNumber) return leftIsNumber ? -1 : 1;
  return left.localeCompare(right, 'zh-Hant', { numeric: true, sensitivity: 'base' });
}

export function groupTeachingClasses(records, catalog = COURSE_CATALOG) {
  const systemOrder = new Map(Object.keys(catalog).map((value, index) => [value, index]));
  const gradeOrder = new Map();
  for (const [system, systemData] of Object.entries(catalog)) {
    Object.keys(systemData.grades).forEach((grade, index) => gradeOrder.set(`${system}:${grade}`, index));
  }
  const normalized = normalizedTeachingYearRecords(records, catalog).sort((left, right) => (
    (systemOrder.get(left.system) ?? 999) - (systemOrder.get(right.system) ?? 999)
    || (gradeOrder.get(`${left.system}:${left.grade}`) ?? 999) - (gradeOrder.get(`${right.system}:${right.grade}`) ?? 999)
    || left.subject.localeCompare(right.subject, 'zh-Hant')
    || compareTeachingClassNames(left.className, right.className)
  ));
  const groups = [];
  for (const record of normalized) {
    const key = JSON.stringify([record.system, record.grade, record.subject]);
    let group = groups.find((item) => item.key === key);
    if (!group) {
      group = {
        key,
        system: record.system,
        systemLabel: catalog[record.system].label,
        grade: record.grade,
        gradeLabel: catalog[record.system].grades[record.grade].label,
        subject: record.subject,
        records: []
      };
      groups.push(group);
    }
    group.records.push(record);
  }
  return groups;
}

export const MANAGED_SCHEDULE_WEEKDAYS = [
  { id: '1', label: '一', fullLabel: '星期一' },
  { id: '2', label: '二', fullLabel: '星期二' },
  { id: '3', label: '三', fullLabel: '星期三' },
  { id: '4', label: '四', fullLabel: '星期四' },
  { id: '5', label: '五', fullLabel: '星期五' }
];

export const DEFAULT_MANAGED_SCHEDULE_TIMES = [
  { id: 'p1', period: 1, start: '08:10', end: '09:00' },
  { id: 'p2', period: 2, start: '09:10', end: '10:00' },
  { id: 'p3', period: 3, start: '10:10', end: '11:00' },
  { id: 'p4', period: 4, start: '11:10', end: '12:00' },
  { id: 'p5', period: 5, start: '13:10', end: '14:00' },
  { id: 'p6', period: 6, start: '14:10', end: '15:00' },
  { id: 'p7', period: 7, start: '15:10', end: '16:00' },
  { id: 'p8', period: 8, start: '16:10', end: '17:00' }
];

const MANAGED_SCHEDULE_PERIOD_IDS = DEFAULT_MANAGED_SCHEDULE_TIMES.map((period) => period.id);

export function createDefaultManagedScheduleTimes() {
  return DEFAULT_MANAGED_SCHEDULE_TIMES.map((period) => ({ ...period }));
}

export function createEmptyManagedScheduleSlots() {
  return Object.fromEntries(MANAGED_SCHEDULE_WEEKDAYS.map((weekday) => [
    weekday.id,
    Object.fromEntries(MANAGED_SCHEDULE_PERIOD_IDS.map((periodId) => [periodId, null]))
  ]));
}

export function createEmptyScheduleManagementSettings() {
  return { version: 2, byAcademicYear: {} };
}

function normalizeManagedScheduleTitle(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function validManagedScheduleTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function normalizeManagedScheduleTimes(times) {
  if (!Array.isArray(times)) return createDefaultManagedScheduleTimes();
  const byId = new Map(times.map((period) => [String(period?.id || ''), period]));
  return DEFAULT_MANAGED_SCHEDULE_TIMES.map((fallback) => {
    const source = byId.get(fallback.id) || {};
    return {
      id: fallback.id,
      period: fallback.period,
      start: String(source.start ?? fallback.start),
      end: String(source.end ?? fallback.end)
    };
  });
}

function hasCompleteManagedScheduleTimes(times) {
  if (!Array.isArray(times) || times.length !== DEFAULT_MANAGED_SCHEDULE_TIMES.length) return false;
  const byId = new Map();
  for (const period of times) {
    if (!period || typeof period !== 'object' || Array.isArray(period)) return false;
    const id = String(period.id ?? '');
    if (!MANAGED_SCHEDULE_PERIOD_IDS.includes(id) || byId.has(id)) return false;
    byId.set(id, period);
  }
  for (const expected of DEFAULT_MANAGED_SCHEDULE_TIMES) {
    const period = byId.get(expected.id);
    if (!period || Number(period.period) !== expected.period) return false;
    if (!validManagedScheduleTime(period.start) || !validManagedScheduleTime(period.end)) return false;
  }
  return validateManagedScheduleTimes(times).valid;
}

export function validateManagedScheduleTimes(times) {
  const normalized = normalizeManagedScheduleTimes(times);
  const errors = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const period = normalized[index];
    if (!validManagedScheduleTime(period.start) || !validManagedScheduleTime(period.end)) {
      errors.push({ code: 'time-format', periodId: period.id, message: `第 ${period.period} 節需要有效的上下課時間。` });
      continue;
    }
    if (timeToMinutes(period.start) >= timeToMinutes(period.end)) {
      errors.push({ code: 'time-order', periodId: period.id, message: `第 ${period.period} 節的上課時間必須早於下課時間。` });
    }
    const previous = normalized[index - 1];
    if (previous && validManagedScheduleTime(previous.end) && timeToMinutes(period.start) < timeToMinutes(previous.end)) {
      errors.push({ code: 'time-overlap', periodId: period.id, message: `第 ${period.period - 1} 節與第 ${period.period} 節時間不能重疊。` });
    }
  }
  return { valid: errors.length === 0, errors, times: normalized };
}

function normalizeManagedScheduleSlots(slots) {
  const empty = createEmptyManagedScheduleSlots();
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) return empty;
  for (const weekday of MANAGED_SCHEDULE_WEEKDAYS) {
    const sourceDay = slots[weekday.id];
    if (!sourceDay || typeof sourceDay !== 'object' || Array.isArray(sourceDay)) continue;
    for (const periodId of MANAGED_SCHEDULE_PERIOD_IDS) {
      const teachingClassId = String(sourceDay[periodId] ?? '').trim();
      empty[weekday.id][periodId] = teachingClassId && teachingClassId.length <= 200 ? teachingClassId : null;
    }
  }
  return empty;
}

function normalizedManagedScheduleVersion(raw, sharedTimes = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = String(raw.id ?? '').trim();
  const periodId = String(raw.periodId ?? raw.academicPeriodId ?? '');
  const startDate = String(raw.startDate ?? raw.effectiveDate ?? '');
  const title = normalizeManagedScheduleTitle(raw.title ?? raw.name);
  const times = normalizeManagedScheduleTimes(Array.isArray(raw.times) ? raw.times : sharedTimes);
  if (!id || id.length > 200) return null;
  if (!ACADEMIC_PERIOD_DEFINITIONS.some((period) => period.id === periodId)) return null;
  if (!validCalendarDateKey(startDate)) return null;
  if (!title || title.length > 40) return null;
  if (!validateManagedScheduleTimes(times).valid) return null;
  return {
    id,
    periodId,
    startDate,
    title,
    times,
    slots: normalizeManagedScheduleSlots(raw.slots),
    createdAt: String(raw.createdAt ?? '')
  };
}

function managedScheduleVersionRecord(raw, sharedTimes = null) {
  const version = normalizedManagedScheduleVersion(raw, sharedTimes);
  if (!version) return null;
  const { times: _times, ...record } = version;
  return record;
}

function latestValidLegacyManagedScheduleTimes(versions) {
  if (!Array.isArray(versions)) return null;
  const latest = versions
    .filter((version) => version && typeof version === 'object' && !Array.isArray(version)
      && validCalendarDateKey(String(version.startDate ?? version.effectiveDate ?? ''))
      && hasCompleteManagedScheduleTimes(version.times))
    .sort((left, right) => {
      const dateOrder = String(right.startDate ?? right.effectiveDate).localeCompare(String(left.startDate ?? left.effectiveDate));
      if (dateOrder) return dateOrder;
      return String(right.id ?? '').localeCompare(String(left.id ?? ''));
    })[0];
  return latest?.times || null;
}

function normalizedManagedScheduleYear(value) {
  const versions = Array.isArray(value?.versions) ? value.versions : [];
  const yearTimes = normalizeManagedScheduleTimes(
    Array.isArray(value?.times) ? value.times : latestValidLegacyManagedScheduleTimes(versions)
  );
  const normalized = [];
  const ids = new Set();
  const starts = new Set();
  for (const raw of versions) {
    const version = managedScheduleVersionRecord(raw, yearTimes);
    if (!version) continue;
    const startKey = JSON.stringify([version.periodId, version.startDate]);
    if (ids.has(version.id) || starts.has(startKey)) continue;
    ids.add(version.id);
    starts.add(startKey);
    normalized.push(version);
  }
  normalized.sort((left, right) => left.startDate.localeCompare(right.startDate) || left.id.localeCompare(right.id));
  return { times: yearTimes, versions: normalized };
}

export function normalizeScheduleManagementSettings(stored) {
  const result = createEmptyScheduleManagementSettings();
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return result;
  const source = stored.byAcademicYear;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return result;
  for (const [rawYear, value] of Object.entries(source)) {
    const year = validTeachingAcademicYear(rawYear);
    if (!year || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    result.byAcademicYear[String(year)] = normalizedManagedScheduleYear(value);
  }
  return result;
}

export function parseScheduleManagementSettings(stored) {
  const empty = createEmptyScheduleManagementSettings();
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return { valid: false, settings: empty };
  const legacy = stored.version === 1;
  if ((!legacy && stored.version !== 2) || !stored.byAcademicYear || typeof stored.byAcademicYear !== 'object' || Array.isArray(stored.byAcademicYear)) {
    return { valid: false, settings: empty };
  }
  const ids = new Set();
  for (const [rawYear, value] of Object.entries(stored.byAcademicYear)) {
    if (!validTeachingAcademicYear(rawYear) || !value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.versions)) {
      return { valid: false, settings: empty };
    }
    if (!legacy && !hasCompleteManagedScheduleTimes(value.times)) return { valid: false, settings: empty };
    const starts = new Set();
    for (const raw of value.versions) {
      if (!legacy && Object.prototype.hasOwnProperty.call(raw || {}, 'times')) return { valid: false, settings: empty };
      if (legacy && !hasCompleteManagedScheduleTimes(raw?.times)) return { valid: false, settings: empty };
      const version = normalizedManagedScheduleVersion(raw, legacy ? null : value.times);
      if (!version || version.id !== String(raw.id ?? '').trim()) return { valid: false, settings: empty };
      const startKey = JSON.stringify([version.periodId, version.startDate]);
      if (ids.has(version.id) || starts.has(startKey)) return { valid: false, settings: empty };
      ids.add(version.id);
      starts.add(startKey);
    }
  }
  return { valid: true, migrated: legacy, settings: normalizeScheduleManagementSettings(stored) };
}

export function managedScheduleTimesForAcademicYear(settings, academicYear) {
  const year = validTeachingAcademicYear(academicYear);
  if (!year) return createDefaultManagedScheduleTimes();
  const times = normalizeScheduleManagementSettings(settings).byAcademicYear[String(year)]?.times;
  return (times || createDefaultManagedScheduleTimes()).map((period) => ({ ...period }));
}

export function managedScheduleVersionsForAcademicYear(settings, academicYear) {
  const year = validTeachingAcademicYear(academicYear);
  if (!year) return [];
  const group = normalizeScheduleManagementSettings(settings).byAcademicYear[String(year)];
  if (!group) return [];
  return group.versions.map((version) => ({
    ...version,
    times: group.times.map((period) => ({ ...period }))
  }));
}

function managedSchedulePeriodSettings(academicSettings, periodId) {
  return academicPeriodSource(normalizeAcademicPeriodSettings(academicSettings).periods, periodId);
}

export function managedScheduleVersionsWithRanges(settings, academicYear, academicSettings) {
  const versions = managedScheduleVersionsForAcademicYear(settings, academicYear);
  const definitions = new Map(ACADEMIC_PERIOD_DEFINITIONS.map((period, index) => [period.id, { ...period, index }]));
  const ranged = [];
  for (const version of versions) {
    const definition = definitions.get(version.periodId);
    const period = managedSchedulePeriodSettings(academicSettings, version.periodId);
    const peers = versions.filter((item) => item.periodId === version.periodId && item.startDate > version.startDate)
      .sort((left, right) => left.startDate.localeCompare(right.startDate));
    const nextEnd = peers[0] ? addDaysToDateKey(peers[0].startDate, -1) : period?.endDate || version.startDate;
    const endDate = period?.endDate && nextEnd > period.endDate ? period.endDate : nextEnd;
    const validRange = Boolean(period?.enabled && validCalendarDateKey(period.startDate) && validCalendarDateKey(period.endDate)
      && version.startDate >= period.startDate && version.startDate <= period.endDate && endDate >= version.startDate);
    ranged.push({
      ...version,
      periodLabel: definition?.label || version.periodId,
      periodOrder: definition?.index ?? 999,
      endDate,
      validRange
    });
  }
  return ranged.sort((left, right) => left.periodOrder - right.periodOrder || left.startDate.localeCompare(right.startDate));
}

export function activeManagedScheduleVersion(settings, academicYear, date, academicSettings) {
  const dateKey = localDateKey(date);
  return managedScheduleVersionsWithRanges(settings, academicYear, academicSettings)
    .find((version) => version.validRange && version.startDate <= dateKey && dateKey <= version.endDate) || null;
}

export function previousManagedScheduleVersion(settings, academicYear, startDate) {
  return managedScheduleVersionsForAcademicYear(settings, academicYear)
    .filter((version) => version.startDate < startDate)
    .sort((left, right) => right.startDate.localeCompare(left.startDate))[0] || null;
}

export function validateManagedScheduleVersionDraft(draft, existingVersions, academicSettings) {
  const source = draft && typeof draft === 'object' && !Array.isArray(draft) ? draft : {};
  const errors = [];
  const fieldErrors = {};
  const addError = (field, code, message) => {
    errors.push({ field, code, message });
    fieldErrors[field] ||= message;
  };
  const periodId = String(source.periodId ?? '');
  const startDate = String(source.startDate ?? '');
  const period = managedSchedulePeriodSettings(academicSettings, periodId);
  if (!period) addError('periodId', 'period', '請選擇課表所屬期間。');
  else if (!period.enabled) addError('periodId', 'period-disabled', '這個期間目前沒有啟用。');
  if (!validCalendarDateKey(startDate)) addError('startDate', 'start-date', '請選擇開始生效日期。');
  else if (period?.enabled && (startDate < period.startDate || startDate > period.endDate)) {
    addError('startDate', 'start-range', `生效日期必須介於 ${period.startDate}～${period.endDate}。`);
  }
  const id = String(source.id ?? '').trim();
  if (Array.isArray(existingVersions) && existingVersions.some((version) => (
    version.id !== id && version.periodId === periodId && version.startDate === startDate
  ))) addError('startDate', 'duplicate-start', '這個期間已經有相同生效日期的課表版本。');
  return { valid: errors.length === 0, errors, fieldErrors, periodId, startDate };
}

export function nextManagedScheduleVersionTitle(existingVersions, periodId) {
  const label = ACADEMIC_PERIOD_DEFINITIONS.find((period) => period.id === periodId)?.label || '課表';
  const count = Array.isArray(existingVersions) ? existingVersions.filter((version) => version.periodId === periodId).length : 0;
  return `${label}・第${count + 1}版`;
}

export function upsertManagedScheduleVersionForAcademicYear(settings, academicYear, record) {
  const year = validTeachingAcademicYear(academicYear);
  const version = normalizedManagedScheduleVersion(record);
  if (!year || !version) return normalizeScheduleManagementSettings(settings);
  const result = normalizeScheduleManagementSettings(settings);
  const yearKey = String(year);
  const existingYear = result.byAcademicYear[yearKey] || null;
  const yearTimes = existingYear?.times || version.times;
  const current = existingYear?.versions || [];
  const index = current.findIndex((item) => item.id === version.id);
  const next = [...current];
  const canonicalVersion = managedScheduleVersionRecord(version, yearTimes);
  if (index >= 0) next[index] = canonicalVersion;
  else next.push(canonicalVersion);
  result.byAcademicYear[yearKey] = normalizedManagedScheduleYear({ times: yearTimes, versions: next });
  return result;
}

export function updateManagedScheduleTimesForAcademicYear(settings, academicYear, times) {
  const year = validTeachingAcademicYear(academicYear);
  if (!year || !hasCompleteManagedScheduleTimes(times)) return normalizeScheduleManagementSettings(settings);
  const result = normalizeScheduleManagementSettings(settings);
  const yearKey = String(year);
  const current = result.byAcademicYear[yearKey] || { versions: [] };
  result.byAcademicYear[yearKey] = normalizedManagedScheduleYear({
    times,
    versions: current.versions
  });
  return result;
}

export function updateManagedScheduleCell(version, weekdayId, periodId, teachingClassId) {
  if (!MANAGED_SCHEDULE_WEEKDAYS.some((weekday) => weekday.id === String(weekdayId)) || !MANAGED_SCHEDULE_PERIOD_IDS.includes(periodId)) return version;
  const slots = normalizeManagedScheduleSlots(version?.slots);
  slots[String(weekdayId)][periodId] = String(teachingClassId ?? '').trim() || null;
  return { ...version, slots };
}

export function courseFromTeachingClass(record) {
  const teachingClassId = String(record?.id || '').trim();
  const classLabel = teachingClassDisplayLabel(record);
  const subject = normalizeTeachingSubject(record?.subject);
  if (!teachingClassId || !classLabel || !subject) return null;
  return {
    teachingClassId,
    system: record.system,
    grade: record.grade,
    className: normalizeTeachingClassName(record.className),
    subject,
    classLabel
  };
}

export function teachingClassRoster(record) {
  const rawLastSeat = Number(record?.lastSeat);
  const lastSeat = Number.isInteger(rawLastSeat) && rawLastSeat >= 1 && rawLastSeat <= 60
    ? rawLastSeat
    : ROSTER_CAPACITY;
  const fallbackVacant = record ? [] : DISABLED_SEATS;
  const vacantSeats = [...new Set((Array.isArray(record?.vacantSeats) ? record.vacantSeats : fallbackVacant)
    .map(Number)
    .filter((seat) => Number.isInteger(seat) && seat >= 1 && seat <= lastSeat))]
    .sort((left, right) => left - right);
  const vacant = new Set(vacantSeats);
  const allSeats = Array.from({ length: lastSeat }, (_, index) => index + 1);
  return { lastSeat, vacantSeats, allSeats, activeSeats: allSeats.filter((seat) => !vacant.has(seat)) };
}

export function managedScheduleWeeklySchedules(version, teachingClasses = []) {
  const normalized = normalizedManagedScheduleVersion(version);
  const classMap = new Map((Array.isArray(teachingClasses) ? teachingClasses : [])
    .map((record) => [String(record?.id || ''), courseFromTeachingClass(record)]));
  const times = normalized?.times || createDefaultManagedScheduleTimes();
  const slots = normalized?.slots || createEmptyManagedScheduleSlots();
  return Object.fromEntries(MANAGED_SCHEDULE_WEEKDAYS.map((weekday) => [
    Number(weekday.id),
    times.map((period) => ({
      ...period,
      course: classMap.get(slots[weekday.id]?.[period.id]) || null
    }))
  ]));
}

export function managedScheduleSlotsForDate(version, teachingClasses = [], overrides = {}, date = new Date()) {
  const weeklySchedules = managedScheduleWeeklySchedules(version, teachingClasses);
  const currentCourses = new Map((Array.isArray(teachingClasses) ? teachingClasses : [])
    .map((record) => [String(record?.id || ''), courseFromTeachingClass(record)]));
  const resolvedOverrides = Object.fromEntries(Object.entries(overrides || {}).map(([key, course]) => [
    key,
    currentCourses.get(String(course?.teachingClassId || '')) || course
  ]));
  const times = normalizedManagedScheduleVersion(version)?.times || createDefaultManagedScheduleTimes();
  const periods = times.map(({ id, period, start, end }) => [id, period, start, end]);
  const weekdayCourses = Object.fromEntries(Object.entries(weeklySchedules).map(([weekday, slots]) => [
    weekday,
    slots.map((slot) => slot.course)
  ]));
  return scheduleSlotsForDate(periods, weekdayCourses, resolvedOverrides, date);
}

export function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
}

export function localDateKey(date = new Date()) {
  if (typeof date === 'string') return date;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateFromKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function dateRelation(date, today = new Date()) {
  const dateKey = localDateKey(date);
  const todayKey = localDateKey(today);
  return dateKey === todayKey ? 'today' : dateKey < todayKey ? 'past' : 'future';
}

export function selectedDateAfterEvent(currentDateKey, now = new Date(), event = 'retain', candidateDate = null) {
  if (event === 'select-date' && candidateDate) return localDateKey(candidateDate);
  if (event === 'reload' || event === 'go-today' || !currentDateKey) return localDateKey(now);
  return currentDateKey;
}

export function calendarMonthDays(year, monthIndex, today = new Date(), selectedDate = today) {
  const first = new Date(year, monthIndex, 1, 12, 0, 0, 0);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - mondayOffset, 12, 0, 0, 0);
  const todayKey = localDateKey(today);
  const selectedKey = localDateKey(selectedDate);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateKey = localDateKey(date);
    return {
      dateKey,
      day: date.getDate(),
      inMonth: date.getMonth() === monthIndex,
      isToday: dateKey === todayKey,
      isSelected: dateKey === selectedKey
    };
  });
}

export function scheduleOverrideKey(date, periodId) {
  return `${localDateKey(date)}:${periodId}`;
}

export function hasScheduleOverride(overrides = {}, key) {
  return Object.prototype.hasOwnProperty.call(overrides, key);
}

export function setScheduleOverride(overrides = {}, key, course) {
  return { ...overrides, [key]: { ...course } };
}

export function removeScheduleOverride(overrides = {}, key) {
  return Object.fromEntries(Object.entries(overrides).filter(([entryKey]) => entryKey !== key));
}

export function scheduleSlotsForDate(periods, weekdayCourses, overrides, date) {
  const targetDate = typeof date === 'string' ? dateFromKey(date) : date;
  const courses = weekdayCourses[targetDate.getDay()] || [];
  return periods.map(([id, period, start, end], index) => {
    const key = scheduleOverrideKey(targetDate, id);
    const adjusted = hasScheduleOverride(overrides, key);
    return { id, period, start, end, course: adjusted ? overrides[key] : courses[index] || null, adjusted };
  });
}

export function homeworkCheckKey(date, periodId, course) {
  const dateKey = typeof date === 'string' ? date : localDateKey(date);
  return `${dateKey}:${periodId}:${courseDataKey(course)}:assignment`;
}

export function normalizeDrawSessionState(session = {}) {
  const source = session && typeof session === 'object' && !Array.isArray(session) ? session : {};
  return { ...source, useWeighting: source.useWeighting !== false };
}

function normalizeDrawSessions(drawSessions = {}) {
  if (!drawSessions || typeof drawSessions !== 'object' || Array.isArray(drawSessions)) return {};
  return Object.fromEntries(Object.entries(drawSessions).map(([sessionKey, session]) => [
    sessionKey,
    normalizeDrawSessionState(session)
  ]));
}

export function normalizeClassroomRecords(stored, fallback = { assignments: {}, exams: {}, courses: {}, reminders: {}, drawSessions: {} }) {
  if (!stored?.assignments) return { ...fallback, exams: fallback.exams || {}, reminders: fallback.reminders || {}, drawSessions: normalizeDrawSessions(fallback.drawSessions) };
  return {
    ...stored,
    assignments: stored.assignments,
    exams: stored.exams || {},
    courses: stored.courses || {},
    reminders: stored.reminders || {},
    drawSessions: normalizeDrawSessions(stored.drawSessions)
  };
}

export function seedDemoExamsOnce(records, demoExams, version = 1) {
  const currentVersion = Number(records.meta?.demoExamSeedVersion || 0);
  if (currentVersion >= version) return { records, seeded: false, changed: false };
  const existingExams = records.exams || {};
  const seeded = Object.keys(demoExams).some((examId) => !existingExams[examId]);
  const next = {
    ...records,
    exams: { ...demoExams, ...existingExams },
    meta: { ...(records.meta || {}), demoExamSeedVersion: version }
  };
  return { records: next, seeded, changed: true };
}

export function seedDemoAssignmentsOnce(records, demoAssignments, version = 1) {
  const currentVersion = Number(records.meta?.demoAssignmentSeedVersion || 0);
  if (currentVersion >= version) return { records, seeded: false, changed: false };
  const existingAssignments = records.assignments || {};
  const seeded = Object.keys(demoAssignments).some((assignmentId) => !existingAssignments[assignmentId]);
  const next = {
    ...records,
    assignments: { ...demoAssignments, ...existingAssignments },
    meta: { ...(records.meta || {}), demoAssignmentSeedVersion: version }
  };
  return { records: next, seeded, changed: true };
}

export function getScheduleView(slots, now = new Date(), teachingDay = true) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const courses = slots.filter((slot) => slot.course);
  if (!teachingDay || courses.length === 0) {
    return { headline: '今日無課', activeId: null, nextId: null, rows: slots.map((slot) => ({ ...slot, state: 'empty' })) };
  }

  const active = courses.find((slot) => minutes >= timeToMinutes(slot.start) && minutes < timeToMinutes(slot.end));
  const next = active ? null : courses.find((slot) => timeToMinutes(slot.start) > minutes);
  const lastCourseEnd = Math.max(...courses.map((slot) => timeToMinutes(slot.end)));
  const headline = active
    ? `正在上第 ${active.period} 節`
    : next
      ? `下一堂 ${next.start}`
      : minutes >= lastCourseEnd
        ? '今日課程結束'
        : '目前空堂';

  return {
    headline,
    activeId: active?.id || null,
    nextId: next?.id || null,
    rows: slots.map((slot) => {
      if (!slot.course) return { ...slot, state: timeToMinutes(slot.end) <= minutes ? 'empty-past' : 'empty' };
      if (slot.id === active?.id) return { ...slot, state: 'current' };
      if (slot.id === next?.id) return { ...slot, state: 'next' };
      if (timeToMinutes(slot.end) <= minutes) return { ...slot, state: 'past' };
      return { ...slot, state: 'upcoming' };
    })
  };
}

export function getScheduleViewForDate(slots, selectedDate, now = new Date()) {
  const relation = dateRelation(selectedDate, now);
  if (relation === 'today') return { ...getScheduleView(slots, now, true), relation };
  const isPast = relation === 'past';
  return {
    headline: isPast ? '過去日期' : '未來日期',
    activeId: null,
    nextId: null,
    relation,
    rows: slots.map((slot) => ({ ...slot, state: slot.course ? (isPast ? 'past' : 'upcoming') : (isPast ? 'empty-past' : 'empty') }))
  };
}

export function canOpenScheduleRow(row) {
  return Boolean(row);
}

export function linkedCourseState(selection = {}, changedField = null, catalog = COURSE_CATALOG) {
  const systemKeys = Object.keys(catalog);
  const system = catalog[selection.system] ? selection.system : systemKeys[0];
  const gradeKeys = Object.keys(catalog[system].grades);
  const grade = gradeKeys.includes(selection.grade) && changedField !== 'system' ? selection.grade : gradeKeys[0];
  const gradeData = catalog[system].grades[grade];
  const className = gradeData.classes.includes(String(selection.className)) && !['system', 'grade'].includes(changedField)
    ? String(selection.className)
    : gradeData.classes[0];
  const subject = gradeData.subjects.includes(selection.subject) && !['system', 'grade'].includes(changedField)
    ? selection.subject
    : gradeData.subjects[0];
  return {
    selection: { system, grade, className, subject },
    options: {
      systems: systemKeys.map((value) => ({ value, label: catalog[value].label })),
      grades: gradeKeys.map((value) => ({ value, label: catalog[system].grades[value].label })),
      classes: gradeData.classes,
      subjects: gradeData.subjects
    }
  };
}

export function courseFromSelection(selection, catalog = COURSE_CATALOG) {
  const normalized = linkedCourseState(selection, null, catalog).selection;
  const grade = catalog[normalized.system].grades[normalized.grade];
  return {
    system: normalized.system,
    grade: normalized.grade,
    className: normalized.className,
    subject: normalized.subject,
    classLabel: normalized.system === 'junior'
      ? `${normalized.grade.slice(1)}0${normalized.className}班`
      : `${grade.label}${normalized.className}班`
  };
}

export function createDemoWeekdayCourses() {
  const make = (system, grade, className, subject) => courseFromSelection({ system, grade, className, subject });
  return {
    1: [make('junior', 'j8', '5', '理化'), make('senior', 's2', '1', '物理'), make('junior', 'j8', '6', '理化'), make('junior', 'j8', '7', '理化'), make('senior', 's2', '2', '物理'), make('senior', 's2', '3', '物理'), make('senior', 's2', '4', '物理')],
    2: [make('senior', 's2', '3', '物理'), make('junior', 'j8', '6', '理化'), make('junior', 'j8', '5', '理化'), null, make('senior', 's2', '4', '物理'), make('junior', 'j8', '7', '理化'), make('senior', 's2', '5', '物理')],
    3: [make('junior', 'j8', '7', '理化'), make('junior', 'j8', '5', '理化'), make('senior', 's2', '6', '物理'), make('junior', 'j8', '6', '理化'), make('senior', 's2', '5', '物理'), null, make('senior', 's2', '3', '物理')],
    4: [make('senior', 's2', '1', '物理'), make('senior', 's2', '4', '物理'), make('junior', 'j8', '5', '理化'), make('junior', 'j8', '7', '理化'), make('senior', 's2', '2', '物理'), make('junior', 'j8', '6', '理化'), make('senior', 's2', '3', '物理')],
    5: [make('junior', 'j8', '6', '理化'), make('senior', 's2', '6', '物理'), make('senior', 's2', '5', '物理'), make('junior', 'j8', '5', '理化'), make('senior', 's2', '3', '物理'), make('junior', 'j8', '7', '理化'), null]
  };
}

export function courseDataKey(course) {
  if (course?.teachingClassId) return `teaching-class:${course.teachingClassId}`;
  return `${course.classLabel}・${course.subject}`;
}

export function assignmentForSubject(subject) {
  return ({ '理化': '理化習作 p.34', '物理': '波動講義 p.8' })[subject] || null;
}

export function createSessionSnapshot(date, slot) {
  if (!slot?.course) return null;
  const course = Object.freeze({ ...slot.course });
  return Object.freeze({
    dateKey: localDateKey(date),
    slotId: slot.id,
    period: slot.period,
    start: slot.start,
    end: slot.end,
    course,
    adjusted: Boolean(slot.adjusted)
  });
}

export function sessionScheduleState(session, now = new Date()) {
  const todayKey = localDateKey(now);
  if (todayKey < session.dateKey) return 'next';
  if (todayKey > session.dateKey) return 'past';
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < timeToMinutes(session.start)) return 'next';
  if (minutes < timeToMinutes(session.end)) return 'current';
  return 'past';
}

export function homeworkTargetForSession(session) {
  return {
    checkId: homeworkCheckKey(session.dateKey, session.slotId, session.course),
    courseKey: courseDataKey(session.course),
    date: session.dateKey
  };
}

export function addDaysToDateKey(dateKey, days) {
  const date = dateFromKey(dateKey);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export function findNextCourseOccurrence(weeklySchedules, courseKey, startDateKey, afterTime = null, maxDays = 35, strictAfter = false) {
  for (let offset = 0; offset <= maxDays; offset += 1) {
    const dateKey = addDaysToDateKey(startDateKey, offset);
    const day = dateFromKey(dateKey).getDay();
    const slots = typeof weeklySchedules === 'function'
      ? weeklySchedules(dateKey) || []
      : weeklySchedules?.[day] || [];
    const match = slots.find((slot) => {
      if (!slot.course || courseDataKey(slot.course) !== courseKey) return false;
      return offset > 0 || !afterTime || (strictAfter ? timeToMinutes(slot.start) > timeToMinutes(afterTime) : timeToMinutes(slot.start) >= timeToMinutes(afterTime));
    });
    if (match) {
      return { dateKey, slotId: match.id, period: match.period, start: match.start, end: match.end };
    }
  }
  return null;
}

export function resolveAssignmentTargets({ weeklySchedules, session, courses, mode, selectedDate = '' }) {
  const targets = {};
  const errors = [];
  for (const course of courses) {
    const courseKey = courseDataKey(course);
    let due = null;
    if (mode === 'next') {
      due = findNextCourseOccurrence(weeklySchedules, courseKey, session.dateKey, session.end, 35, true);
    } else if (mode === 'next-week') {
      due = findNextCourseOccurrence(weeklySchedules, courseKey, addDaysToDateKey(session.dateKey, 7));
    } else if (mode === 'date' && selectedDate) {
      due = findNextCourseOccurrence(weeklySchedules, courseKey, selectedDate, null, 0);
    }
    if (due) targets[courseKey] = { course: { ...course }, due };
    else errors.push({ courseKey, classLabel: course.classLabel, reason: mode === 'date' ? '選擇日期當天沒有這門課' : '找不到下一堂課' });
  }
  return { targets, errors };
}

export function resolveIndependentAssignmentTimes({ weeklySchedules, session, courses = [], mode, selectedDate = '' }) {
  const resolution = resolveAssignmentTargets({ weeklySchedules, session, courses, mode, selectedDate });
  return {
    targets: Object.fromEntries(Object.entries(resolution.targets).map(([courseKey, target]) => [courseKey, { ...target, scheduleMode: mode }])),
    errors: resolution.errors
  };
}

export function applyAssignmentTimeResolution({
  targetDrafts = {},
  targetErrors = {},
  individualizedCourseKeys = [],
  courseKeys = [],
  resolution = { targets: {}, errors: [] },
  batch = false
}) {
  const nextErrors = { ...targetErrors };
  for (const courseKey of courseKeys) delete nextErrors[courseKey];
  for (const error of resolution.errors || []) nextErrors[error.courseKey] = error.reason;

  // A batch choice represents one decision. If any selected class cannot be
  // resolved, keep every existing draft so the teacher can correct the choice
  // without silently losing earlier per-class adjustments.
  if (batch && resolution.errors?.length) {
    return {
      targetDrafts,
      targetErrors: nextErrors,
      individualizedCourseKeys: [...individualizedCourseKeys],
      applied: false
    };
  }

  const nextDrafts = { ...targetDrafts };
  if (batch) for (const courseKey of courseKeys) delete nextDrafts[courseKey];
  Object.assign(nextDrafts, resolution.targets || {});
  const affectedKeys = new Set(courseKeys);
  return {
    targetDrafts: nextDrafts,
    targetErrors: nextErrors,
    individualizedCourseKeys: batch
      ? individualizedCourseKeys.filter((courseKey) => !affectedKeys.has(courseKey))
      : [...individualizedCourseKeys],
    applied: !(resolution.errors?.length)
  };
}

export function assignmentSectionForSession(target, session) {
  if (target.due.dateKey < session.dateKey) return 'due';
  if (target.due.dateKey > session.dateKey) return 'scheduled';
  return target.due.period <= session.period ? 'due' : 'scheduled';
}

export function deferAssignmentTarget(assignments, assignmentId, courseKey, weeklySchedules, baseline) {
  const assignment = assignments[assignmentId];
  const target = assignment?.targets?.[courseKey];
  if (!assignment || !target || target.status === 'cancelled') return assignments;
  const dueIsLater = target.due.dateKey > baseline.dateKey || (target.due.dateKey === baseline.dateKey && timeToMinutes(target.due.end) > timeToMinutes(baseline.end));
  const startDateKey = dueIsLater ? target.due.dateKey : baseline.dateKey;
  const afterTime = dueIsLater ? target.due.end : baseline.end;
  const due = findNextCourseOccurrence(weeklySchedules, courseKey, startDateKey, afterTime, 35, true);
  if (!due) return assignments;
  return {
    ...assignments,
    [assignmentId]: {
      ...assignment,
      targets: { ...assignment.targets, [courseKey]: { ...target, due } }
    }
  };
}

export function mergeAssignmentTargets(existingTargets = {}, resolvedTargets = {}, selectedCourseKeys = [], { scheduleDirty = false, initialCourseKeys = [] } = {}) {
  const selected = new Set(selectedCourseKeys);
  const initial = new Set(initialCourseKeys);
  const targets = Object.fromEntries(Object.entries(existingTargets).map(([key, target]) => [key, { ...target, status: 'cancelled' }]));
  for (const courseKey of selected) {
    const existing = existingTargets[courseKey];
    const shouldResolve = !existing || scheduleDirty || !initial.has(courseKey);
    const source = shouldResolve ? resolvedTargets[courseKey] : existing;
    if (!source) continue;
    targets[courseKey] = { ...existing, ...source, status: 'active', checks: existing?.checks || [] };
  }
  return targets;
}

export function upsertAssignmentDefinition(assignments, { id, title, scheduleMode, sessionDateKey, selectedCourseKeys, resolvedTargets, scheduleDirty = false, initialCourseKeys = [] }) {
  const previous = assignments[id];
  return {
    ...assignments,
    [id]: {
      ...previous,
      id,
      title,
      status: 'active',
      scheduleMode,
      createdAt: previous?.createdAt || sessionDateKey,
      targets: mergeAssignmentTargets(previous?.targets || {}, resolvedTargets, selectedCourseKeys, { scheduleDirty, initialCourseKeys })
    }
  };
}

export function assignmentCountsForSession(assignments, courseKey, session) {
  const counts = { needsCheck: 0, checked: 0, scheduled: 0 };
  for (const assignment of assignments) {
    const target = assignment.targets[courseKey];
    if (assignmentSectionForSession(target, session) === 'scheduled') counts.scheduled += 1;
    else if (target.lastCheck) counts.checked += 1;
    else counts.needsCheck += 1;
  }
  return counts;
}

export function recordSectionsForSession(records = [], courseKey, session) {
  const sections = { pending: [], recorded: [], scheduled: [] };
  if (!courseKey || !session) return sections;
  for (const record of records || []) {
    const target = record?.targets?.[courseKey];
    if (!target?.due || record.status === 'cancelled' || target.status === 'cancelled') continue;
    if (assignmentSectionForSession(target, session) === 'scheduled') {
      sections.scheduled.push(record);
    } else if (!target.lastCheck) {
      sections.pending.push(record);
    } else if (target.lastCheck.dateKey === session.dateKey && target.lastCheck.slotId === session.slotId) {
      sections.recorded.push(record);
    }
  }
  return sections;
}

export function pendingHomeworkSubmissionsForCourse(assignments = {}, courseKey) {
  const pending = [];
  for (const assignment of Object.values(assignments || {})) {
    const target = assignment?.targets?.[courseKey];
    if (!target) continue;
    for (const submission of Object.values(target.submissions || {})) {
      if (submission.status !== 'pending') continue;
      pending.push({
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        courseKey,
        course: target.course,
        ...submission,
        seat: Number(submission.seat)
      });
    }
  }
  return pending.sort((left, right) => String(left.missingDateKey || '').localeCompare(String(right.missingDateKey || ''))
    || left.assignmentTitle.localeCompare(right.assignmentTitle, 'zh-Hant')
    || left.seat - right.seat);
}

export function activeAssignmentTargetCount(targets = {}) {
  return Object.values(targets).filter((target) => target.status !== 'cancelled').length;
}

export function assignmentSharingLabel(targets = {}) {
  const count = activeAssignmentTargetCount(targets);
  return count >= 2 ? `共用作業・共 ${count} 班` : '';
}

export function assignmentEditSharingNotice(assignmentId, selectedCourseKeys = []) {
  const count = new Set(selectedCourseKeys).size;
  return assignmentId && count >= 2
    ? `修改作業名稱會同步套用至 ${count} 個班級；檢查與延期仍各班獨立。`
    : '';
}

export function cancelAssignmentTarget(assignments, assignmentId, courseKey, cancelledAt) {
  const assignment = assignments?.[assignmentId];
  const target = assignment?.targets?.[courseKey];
  if (!assignment || !target || target.status === 'cancelled') return assignments;
  return {
    ...assignments,
    [assignmentId]: {
      ...assignment,
      targets: {
        ...assignment.targets,
        [courseKey]: { ...target, status: 'cancelled', cancelledAt }
      }
    }
  };
}

const ASSIGNMENT_TARGET_SCHEDULE_MODES = new Set(['next', 'next-week', 'date', 'exact']);

export function updateAssignmentTargetSchedule(assignments, { assignmentId, courseKey, due, scheduleMode }) {
  const assignment = assignments?.[assignmentId];
  const target = assignment?.targets?.[courseKey];
  const normalizedDue = normalizeExamDue(due);
  if (!assignment || !target || !normalizedDue || !ASSIGNMENT_TARGET_SCHEDULE_MODES.has(scheduleMode)) return assignments;
  if (sameExamDue(target.due, normalizedDue) && target.scheduleMode === scheduleMode) return assignments;
  return {
    ...assignments,
    [assignmentId]: {
      ...assignment,
      targets: {
        ...assignment.targets,
        [courseKey]: { ...target, due: normalizedDue, scheduleMode }
      }
    }
  };
}

export function resolveExamTargets(options) {
  return resolveAssignmentTargets(options);
}

function isValidDateKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  return localDateKey(dateFromKey(dateKey)) === dateKey;
}

export function resolveIndependentExamTimes({ weeklySchedules, session, courses = [], mode, dateKey = '', period = null, minDate = '' }) {
  if (mode !== 'common-time') {
    return resolveExamTargets({ weeklySchedules, session, courses, mode });
  }
  const targets = {};
  const errors = [];
  for (const course of courses) {
    const courseKey = courseDataKey(course);
    if (!isValidDateKey(dateKey) || !period) {
      errors.push({ courseKey, classLabel: course.classLabel, reason: '尚未選擇共同日期與節次' });
      continue;
    }
    if (minDate && dateKey < minDate) {
      errors.push({ courseKey, classLabel: course.classLabel, reason: '考試日期不可早於可安排日期' });
      continue;
    }
    targets[courseKey] = {
      course: { ...course },
      due: {
        dateKey,
        slotId: period.id,
        period: period.period,
        start: period.start,
        end: period.end
      }
    };
  }
  return { targets, errors };
}

export function deferExamTarget(exams, examId, courseKey, weeklySchedules, baseline) {
  return deferAssignmentTarget(exams, examId, courseKey, weeklySchedules, baseline);
}

export function examSectionForSession(target, session) {
  return assignmentSectionForSession(target, session);
}

export function mergeExamTargets(existingTargets = {}, resolvedTargets = {}, selectedCourseKeys = [], options = {}) {
  return mergeAssignmentTargets(existingTargets, resolvedTargets, selectedCourseKeys, options);
}

export function upsertExamDefinition(exams, { id, title, scheduleMode, sessionDateKey, selectedCourseKeys, resolvedTargets, scheduleDirty = false, initialCourseKeys = [] }) {
  const previous = exams[id];
  return {
    ...exams,
    [id]: {
      ...previous,
      id,
      title,
      status: 'active',
      scheduleMode,
      createdAt: previous?.createdAt || sessionDateKey,
      targets: mergeExamTargets(previous?.targets || {}, resolvedTargets, selectedCourseKeys, { scheduleDirty, initialCourseKeys })
    }
  };
}

export function examSharingLabel(targets = {}) {
  const count = activeAssignmentTargetCount(targets);
  return count >= 2 ? `共用考試・共 ${count} 班` : '';
}

export function examEditSharingNotice(examId, selectedCourseKeys = []) {
  const count = new Set(selectedCourseKeys).size;
  return examId && count >= 2
    ? `修改考試名稱會同步套用至 ${count} 個班級；點名與補考仍各班獨立。`
    : '';
}

export function cancelExamTarget(exams, examId, courseKey, cancelledAt) {
  const exam = exams[examId];
  const target = exam?.targets?.[courseKey];
  if (!exam || !target || target.status === 'cancelled') return exams;
  return {
    ...exams,
    [examId]: {
      ...exam,
      targets: {
        ...exam.targets,
        [courseKey]: { ...target, status: 'cancelled', cancelledAt }
      }
    }
  };
}

const EXAM_TARGET_SCHEDULE_MODES = new Set(['next', 'next-week', 'common-time', 'exact']);

function normalizeExamDue(due) {
  if (!due || !isValidDateKey(due.dateKey)) return null;
  const slotId = String(due.slotId || '');
  const period = Number(due.period);
  const start = String(due.start || '');
  const end = String(due.end || '');
  const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!slotId || !Number.isInteger(period) || period < 1 || !validTime.test(start) || !validTime.test(end) || timeToMinutes(start) >= timeToMinutes(end)) return null;
  return { dateKey: due.dateKey, slotId, period, start, end };
}

function sameExamDue(left, right) {
  return ['dateKey', 'slotId', 'period', 'start', 'end'].every((field) => left?.[field] === right?.[field]);
}

export function updateExamTargetSchedule(exams, { examId, courseKey, due, scheduleMode }) {
  const exam = exams?.[examId];
  const target = exam?.targets?.[courseKey];
  const normalizedDue = normalizeExamDue(due);
  if (!exam || !target || !normalizedDue || !EXAM_TARGET_SCHEDULE_MODES.has(scheduleMode)) return exams;
  if (sameExamDue(target.due, normalizedDue) && target.scheduleMode === scheduleMode) return exams;
  return {
    ...exams,
    [examId]: {
      ...exam,
      targets: {
        ...exam.targets,
        [courseKey]: { ...target, due: normalizedDue, scheduleMode }
      }
    }
  };
}

export function summarizeExamSeatStates(seatStates = {}, disabledSeats = DISABLED_SEATS) {
  const disabled = new Set(disabledSeats.map(Number));
  const absentSeats = Object.entries(seatStates)
    .filter(([seat, state]) => state === 'absent' && !disabled.has(Number(seat)))
    .map(([seat]) => Number(seat))
    .sort((left, right) => left - right);
  return { absent: absentSeats.length, complete: absentSeats.length === 0, absentSeats };
}

export function saveExamCheck(records, { examId, courseKey, session, seatStates, savedAt, disabledSeats = DISABLED_SEATS, activeSeats = null }) {
  const exam = records.exams?.[examId];
  const target = exam?.targets?.[courseKey];
  const allowed = Array.isArray(activeSeats) ? new Set(activeSeats.map(Number)) : null;
  const validSeatStates = allowed
    ? Object.fromEntries(Object.entries(seatStates || {}).filter(([seat]) => allowed.has(Number(seat))))
    : seatStates;
  const summary = summarizeExamSeatStates(validSeatStates, disabledSeats);
  if (!exam || !target) return { records, summary };

  const checkId = `${session.dateKey}:${session.slotId}:${examId}:${courseKey}`;
  const check = {
    id: checkId,
    dateKey: session.dateKey,
    slotId: session.slotId,
    seatStates: Object.fromEntries(summary.absentSeats.map((seat) => [seat, 'absent'])),
    savedAt,
    summary
  };
  const checks = [...(target.checks || []).filter((item) => item.id !== checkId), check];
  const absentSet = new Set(summary.absentSeats);
  const makeups = Object.fromEntries(Object.entries(target.makeups || {}).map(([seat, makeup]) => {
    if (makeup.status === 'pending' && makeup.sourceCheckId === checkId && !absentSet.has(Number(seat))) {
      return [seat, { ...makeup, status: 'cancelled', cancelledAt: savedAt }];
    }
    return [seat, makeup];
  }));

  for (const seat of summary.absentSeats) {
    const key = String(seat);
    const existing = makeups[key];
    if (!existing || existing.status === 'cancelled') {
      makeups[key] = {
        seat,
        sourceCheckId: checkId,
        absentDateKey: session.dateKey,
        status: 'pending',
        recordedAt: savedAt
      };
    }
  }

  return {
    records: {
      ...records,
      exams: {
        ...records.exams,
        [examId]: {
          ...exam,
          targets: {
            ...exam.targets,
            [courseKey]: { ...target, checks, lastCheck: check, makeups }
          }
        }
      }
    },
    summary
  };
}

export function completeExamMakeup(records, { examId, courseKey, seat, completedAt }) {
  const exam = records.exams?.[examId];
  const target = exam?.targets?.[courseKey];
  const key = String(Number(seat));
  const makeup = target?.makeups?.[key];
  if (!exam || !target || !makeup || makeup.status !== 'pending') return records;
  return {
    ...records,
    exams: {
      ...records.exams,
      [examId]: {
        ...exam,
        targets: {
          ...exam.targets,
          [courseKey]: {
            ...target,
            makeups: {
              ...target.makeups,
              [key]: { ...makeup, status: 'completed', completedAt }
            }
          }
        }
      }
    }
  };
}

export function pendingExamMakeupsForCourse(exams = {}, courseKey) {
  const pending = [];
  for (const exam of Object.values(exams)) {
    const target = exam.targets?.[courseKey];
    if (!target) continue;
    for (const makeup of Object.values(target.makeups || {})) {
      if (makeup.status !== 'pending') continue;
      pending.push({
        examId: exam.id,
        examTitle: exam.title,
        courseKey,
        course: target.course,
        due: target.due,
        ...makeup
      });
    }
  }
  return pending.sort((left, right) => left.absentDateKey.localeCompare(right.absentDateKey) || left.seat - right.seat);
}

export function groupPendingExamMakeups(makeups = []) {
  const groups = new Map();
  for (const makeup of makeups) {
    if (!groups.has(makeup.examId)) {
      groups.set(makeup.examId, { examId: makeup.examId, examTitle: makeup.examTitle, students: [] });
    }
    groups.get(makeup.examId).students.push({
      courseKey: makeup.courseKey,
      course: makeup.course,
      seat: makeup.seat,
      absentDateKey: makeup.absentDateKey
    });
  }
  return [...groups.values()].map((group) => ({
    ...group,
    students: group.students.sort((left, right) => left.absentDateKey.localeCompare(right.absentDateKey)
      || String(left.course?.classLabel || left.courseKey).localeCompare(String(right.course?.classLabel || right.courseKey), 'zh-Hant')
      || left.seat - right.seat)
  })).sort((left, right) => left.students[0].absentDateKey.localeCompare(right.students[0].absentDateKey)
    || left.examTitle.localeCompare(right.examTitle, 'zh-Hant'));
}

function commonRecordGroup(course = {}, catalog = COURSE_CATALOG) {
  const subject = String(course.subject || '未指定科目');
  const gradeDefinition = catalog[course.system]?.grades?.[course.grade];
  if (!gradeDefinition) {
    return {
      groupKey: `unknown:unknown:${subject}`,
      system: course.system || 'unknown',
      grade: course.grade || 'unknown',
      gradeLabel: '未分類',
      subject,
      label: `未分類・${subject}`
    };
  }
  return {
    groupKey: `${course.system}:${course.grade}:${subject}`,
    system: course.system,
    grade: course.grade,
    gradeLabel: gradeDefinition.label,
    subject,
    label: `${gradeDefinition.label}・${subject}`
  };
}

function makeupStatusCounts(makeups = {}) {
  const values = Object.values(makeups || {});
  return {
    pending: values.filter((makeup) => makeup.status === 'pending').length,
    completed: values.filter((makeup) => makeup.status === 'completed').length,
    cancelled: values.filter((makeup) => makeup.status === 'cancelled').length
  };
}

function homeworkSubmissionStatusCounts(submissions = {}) {
  const values = Object.values(submissions || {});
  return {
    pending: values.filter((submission) => submission.status === 'pending').length,
    completed: values.filter((submission) => submission.status === 'completed').length,
    cancelled: values.filter((submission) => submission.status === 'cancelled').length
  };
}

export function buildCommonAssignmentView(assignments = {}, catalog = COURSE_CATALOG) {
  const groups = new Map();
  for (const assignment of Object.values(assignments || {})) {
    for (const [courseKey, target] of Object.entries(assignment.targets || {})) {
      const hasHistory = Boolean((target.checks || []).length || Object.keys(target.submissions || {}).length);
      if (target.status === 'cancelled' && !hasHistory) continue;
      const groupMeta = commonRecordGroup(target.course, catalog);
      if (!groups.has(groupMeta.groupKey)) groups.set(groupMeta.groupKey, { ...groupMeta, assignmentMap: new Map() });
      const group = groups.get(groupMeta.groupKey);
      if (!group.assignmentMap.has(assignment.id)) {
        group.assignmentMap.set(assignment.id, {
          assignmentId: assignment.id,
          title: assignment.title,
          scheduleMode: assignment.scheduleMode,
          createdAt: assignment.createdAt,
          isDemo: Boolean(assignment.isDemo),
          classes: []
        });
      }
      const counts = homeworkSubmissionStatusCounts(target.submissions);
      const incompleteSeats = target.lastCheck?.summary?.incompleteSeats
        || Object.entries(target.lastCheck?.seatStates || {}).filter(([, value]) => value === 'incomplete').map(([seat]) => Number(seat));
      group.assignmentMap.get(assignment.id).classes.push({
        assignmentId: assignment.id,
        courseKey,
        course: target.course,
        classLabel: target.course?.classLabel || courseKey,
        due: target.due || null,
        targetStatus: target.status || 'active',
        checkStatus: target.lastCheck ? 'checked' : 'unchecked',
        checkCount: (target.checks || []).length,
        incompleteCount: incompleteSeats.length,
        pendingSubmissionCount: counts.pending,
        completedSubmissionCount: counts.completed
      });
    }
  }

  const systemOrder = new Map(Object.keys(catalog).map((system, index) => [system, index]));
  const gradeOrder = new Map();
  for (const [system, definition] of Object.entries(catalog)) {
    Object.keys(definition.grades || {}).forEach((grade, index) => gradeOrder.set(`${system}:${grade}`, index));
  }

  return [...groups.values()].map((group) => {
    const assignmentsInGroup = [...group.assignmentMap.values()].map((assignment) => {
      const classes = assignment.classes.sort((left, right) => right.pendingSubmissionCount - left.pendingSubmissionCount
        || (left.checkStatus === 'unchecked' ? 0 : 1) - (right.checkStatus === 'unchecked' ? 0 : 1)
        || String(left.due?.dateKey || '9999-12-31').localeCompare(String(right.due?.dateKey || '9999-12-31'))
        || Number(left.due?.period || 99) - Number(right.due?.period || 99)
        || left.classLabel.localeCompare(right.classLabel, 'zh-Hant'));
      const dateKeys = [...new Set(classes.map((item) => item.due?.dateKey).filter(Boolean))].sort();
      return {
        ...assignment,
        classes,
        classCount: new Set(classes.map((item) => item.courseKey)).size,
        activeClassCount: classes.filter((item) => item.targetStatus !== 'cancelled').length,
        checkedClassCount: classes.filter((item) => item.checkStatus === 'checked').length,
        pendingSubmissionCount: classes.reduce((sum, item) => sum + item.pendingSubmissionCount, 0),
        completedSubmissionCount: classes.reduce((sum, item) => sum + item.completedSubmissionCount, 0),
        dateKeys,
        firstDateKey: dateKeys[0] || '',
        lastDateKey: dateKeys.at(-1) || ''
      };
    }).sort((left, right) => right.pendingSubmissionCount - left.pendingSubmissionCount
      || right.lastDateKey.localeCompare(left.lastDateKey)
      || left.title.localeCompare(right.title, 'zh-Hant')
      || left.assignmentId.localeCompare(right.assignmentId));
    return {
      groupKey: group.groupKey,
      system: group.system,
      grade: group.grade,
      gradeLabel: group.gradeLabel,
      subject: group.subject,
      label: group.label,
      assignmentCount: assignmentsInGroup.length,
      classCount: new Set(assignmentsInGroup.flatMap((assignment) => assignment.classes.map((item) => item.courseKey))).size,
      pendingSubmissionCount: assignmentsInGroup.reduce((sum, assignment) => sum + assignment.pendingSubmissionCount, 0),
      completedSubmissionCount: assignmentsInGroup.reduce((sum, assignment) => sum + assignment.completedSubmissionCount, 0),
      assignments: assignmentsInGroup
    };
  }).sort((left, right) => (systemOrder.get(left.system) ?? 99) - (systemOrder.get(right.system) ?? 99)
    || (gradeOrder.get(`${left.system}:${left.grade}`) ?? 99) - (gradeOrder.get(`${right.system}:${right.grade}`) ?? 99)
    || left.subject.localeCompare(right.subject, 'zh-Hant'));
}

export function assignmentClassDetail(assignments = {}, assignmentId, courseKey) {
  const assignment = assignments?.[assignmentId];
  const target = assignment?.targets?.[courseKey];
  if (!assignment || !target) return null;
  const sortSubmissions = (status) => Object.values(target.submissions || {})
    .filter((submission) => submission.status === status)
    .map((submission) => ({ assignmentId, courseKey, ...submission, seat: Number(submission.seat) }))
    .sort((left, right) => left.seat - right.seat || String(left.missingDateKey || '').localeCompare(String(right.missingDateKey || '')));
  const checks = [...(target.checks || [])].sort((left, right) => String(right.dateKey || '').localeCompare(String(left.dateKey || ''))
    || String(right.savedAt || '').localeCompare(String(left.savedAt || '')));
  const incompleteSeats = target.lastCheck?.summary?.incompleteSeats
    || Object.entries(target.lastCheck?.seatStates || {}).filter(([, value]) => value === 'incomplete').map(([seat]) => Number(seat));
  const leaveSeats = target.lastCheck?.summary?.leaveSeats
    || Object.entries(target.lastCheck?.seatStates || {}).filter(([, value]) => value === 'leave').map(([seat]) => Number(seat));
  return {
    assignmentId,
    title: assignment.title,
    scheduleMode: assignment.scheduleMode,
    createdAt: assignment.createdAt,
    isDemo: Boolean(assignment.isDemo),
    courseKey,
    course: target.course,
    due: target.due || null,
    targetStatus: target.status || 'active',
    cancelledAt: target.cancelledAt || null,
    checks,
    lastCheck: target.lastCheck || null,
    incompleteSeats: [...incompleteSeats].map(Number).sort((left, right) => left - right),
    leaveSeats: [...leaveSeats].map(Number).sort((left, right) => left - right),
    submissions: {
      pending: sortSubmissions('pending'),
      completed: sortSubmissions('completed'),
      cancelled: sortSubmissions('cancelled')
    }
  };
}

export function resolveAssignmentCheckSession(detail, periods = [], preferLastCheck = false) {
  if (!detail?.course || !detail.due) return null;
  const previousCheck = preferLastCheck ? detail.lastCheck : null;
  const previousPeriod = previousCheck ? periods.find(([id]) => id === previousCheck.slotId) : null;
  return {
    dateKey: previousCheck?.dateKey || detail.due.dateKey,
    slot: {
      id: previousCheck?.slotId || detail.due.slotId,
      period: previousPeriod?.[1] || detail.due.period,
      start: previousPeriod?.[2] || detail.due.start,
      end: previousPeriod?.[3] || detail.due.end,
      course: detail.course
    }
  };
}

export function buildCommonExamView(exams = {}, catalog = COURSE_CATALOG) {
  const groups = new Map();
  for (const exam of Object.values(exams || {})) {
    for (const [courseKey, target] of Object.entries(exam.targets || {})) {
      const hasHistory = Boolean((target.checks || []).length || Object.keys(target.makeups || {}).length);
      if (target.status === 'cancelled' && !hasHistory) continue;
      const groupMeta = commonRecordGroup(target.course, catalog);
      if (!groups.has(groupMeta.groupKey)) groups.set(groupMeta.groupKey, { ...groupMeta, examMap: new Map() });
      const group = groups.get(groupMeta.groupKey);
      if (!group.examMap.has(exam.id)) {
        group.examMap.set(exam.id, {
          examId: exam.id,
          title: exam.title,
          scheduleMode: exam.scheduleMode,
          createdAt: exam.createdAt,
          isDemo: Boolean(exam.isDemo),
          classes: []
        });
      }
      const counts = makeupStatusCounts(target.makeups);
      const absentSeats = target.lastCheck?.summary?.absentSeats
        || Object.entries(target.lastCheck?.seatStates || {}).filter(([, value]) => value === 'absent').map(([seat]) => Number(seat));
      group.examMap.get(exam.id).classes.push({
        examId: exam.id,
        courseKey,
        course: target.course,
        classLabel: target.course?.classLabel || courseKey,
        due: target.due || null,
        targetStatus: target.status || 'active',
        attendanceStatus: target.lastCheck ? 'checked' : 'unchecked',
        checkCount: (target.checks || []).length,
        absentCount: absentSeats.length,
        pendingMakeupCount: counts.pending,
        completedMakeupCount: counts.completed
      });
    }
  }

  const systemOrder = new Map(Object.keys(catalog).map((system, index) => [system, index]));
  const gradeOrder = new Map();
  for (const [system, definition] of Object.entries(catalog)) {
    Object.keys(definition.grades || {}).forEach((grade, index) => gradeOrder.set(`${system}:${grade}`, index));
  }

  return [...groups.values()].map((group) => {
    const examsInGroup = [...group.examMap.values()].map((exam) => {
      const classes = exam.classes.sort((left, right) => String(left.due?.dateKey || '9999-12-31').localeCompare(String(right.due?.dateKey || '9999-12-31'))
        || Number(left.due?.period || 99) - Number(right.due?.period || 99)
        || left.classLabel.localeCompare(right.classLabel, 'zh-Hant'));
      const dateKeys = [...new Set(classes.map((item) => item.due?.dateKey).filter(Boolean))].sort();
      return {
        ...exam,
        classes,
        classCount: new Set(classes.map((item) => item.courseKey)).size,
        activeClassCount: classes.filter((item) => item.targetStatus !== 'cancelled').length,
        checkedClassCount: classes.filter((item) => item.attendanceStatus === 'checked').length,
        pendingMakeupCount: classes.reduce((sum, item) => sum + item.pendingMakeupCount, 0),
        completedMakeupCount: classes.reduce((sum, item) => sum + item.completedMakeupCount, 0),
        dateKeys,
        firstDateKey: dateKeys[0] || '',
        lastDateKey: dateKeys.at(-1) || ''
      };
    }).sort((left, right) => right.pendingMakeupCount - left.pendingMakeupCount
      || right.lastDateKey.localeCompare(left.lastDateKey)
      || left.title.localeCompare(right.title, 'zh-Hant')
      || left.examId.localeCompare(right.examId));
    return {
      groupKey: group.groupKey,
      system: group.system,
      grade: group.grade,
      gradeLabel: group.gradeLabel,
      subject: group.subject,
      label: group.label,
      examCount: examsInGroup.length,
      classCount: new Set(examsInGroup.flatMap((exam) => exam.classes.map((item) => item.courseKey))).size,
      pendingMakeupCount: examsInGroup.reduce((sum, exam) => sum + exam.pendingMakeupCount, 0),
      completedMakeupCount: examsInGroup.reduce((sum, exam) => sum + exam.completedMakeupCount, 0),
      exams: examsInGroup
    };
  }).sort((left, right) => (systemOrder.get(left.system) ?? 99) - (systemOrder.get(right.system) ?? 99)
    || (gradeOrder.get(`${left.system}:${left.grade}`) ?? 99) - (gradeOrder.get(`${right.system}:${right.grade}`) ?? 99)
    || left.subject.localeCompare(right.subject, 'zh-Hant'));
}

export function examClassDetail(exams = {}, examId, courseKey) {
  const exam = exams?.[examId];
  const target = exam?.targets?.[courseKey];
  if (!exam || !target) return null;
  const sortMakeups = (status) => Object.values(target.makeups || {})
    .filter((makeup) => makeup.status === status)
    .map((makeup) => ({ examId, courseKey, ...makeup, seat: Number(makeup.seat) }))
    .sort((left, right) => left.seat - right.seat);
  const checks = [...(target.checks || [])].sort((left, right) => String(right.dateKey || '').localeCompare(String(left.dateKey || ''))
    || String(right.savedAt || '').localeCompare(String(left.savedAt || '')));
  const absentSeats = target.lastCheck?.summary?.absentSeats
    || Object.entries(target.lastCheck?.seatStates || {}).filter(([, value]) => value === 'absent').map(([seat]) => Number(seat));
  return {
    examId,
    title: exam.title,
    scheduleMode: exam.scheduleMode,
    createdAt: exam.createdAt,
    isDemo: Boolean(exam.isDemo),
    courseKey,
    course: target.course,
    due: target.due || null,
    targetStatus: target.status || 'active',
    cancelledAt: target.cancelledAt || null,
    checks,
    lastCheck: target.lastCheck || null,
    absentSeats: [...absentSeats].map(Number).sort((left, right) => left - right),
    makeups: {
      pending: sortMakeups('pending'),
      completed: sortMakeups('completed'),
      cancelled: sortMakeups('cancelled')
    }
  };
}

export function resolveExamAttendanceSession(detail, periods = [], preferLastCheck = false) {
  if (!detail?.course || !detail.due) return null;
  const previousCheck = preferLastCheck ? detail.lastCheck : null;
  const previousPeriod = previousCheck ? periods.find(([id]) => id === previousCheck.slotId) : null;
  return {
    dateKey: previousCheck?.dateKey || detail.due.dateKey,
    slot: {
      id: previousCheck?.slotId || detail.due.slotId,
      period: previousPeriod?.[1] || detail.due.period,
      start: previousPeriod?.[2] || detail.due.start,
      end: previousPeriod?.[3] || detail.due.end,
      course: detail.course
    }
  };
}

export function examCountsForSession(exams, courseKey, session) {
  const examList = Array.isArray(exams) ? exams : Object.values(exams || {});
  const examMap = Array.isArray(exams) ? Object.fromEntries(exams.map((exam) => [exam.id, exam])) : exams || {};
  const base = assignmentCountsForSession(examList, courseKey, session);
  return { ...base, pendingMakeups: pendingExamMakeupsForCourse(examMap, courseKey).length };
}

function assignmentIdFromHomeworkItem(item, courseKey, assignments = {}) {
  if (item?.assignmentId && assignments[item.assignmentId]?.targets?.[courseKey]) return item.assignmentId;
  const sourceCheck = String(item?.sourceCheck || '');
  return Object.keys(assignments).find((assignmentId) => sourceCheck === `assignment:${assignmentId}:${courseKey}` && assignments[assignmentId]?.targets?.[courseKey]) || null;
}

function homeworkProjectionEntry(assignment, courseKey, submission) {
  return {
    id: submission.id,
    submissionId: submission.id,
    seat: Number(submission.seat),
    assignmentId: assignment.id,
    courseKey,
    assignment: assignment.title,
    date: submission.missingDateKey,
    missingDateKey: submission.missingDateKey,
    sourceCheck: `assignment:${assignment.id}:${courseKey}`,
    sourceCheckId: submission.sourceCheckId,
    status: submission.status,
    recordedAt: submission.recordedAt,
    completedAt: submission.completedAt
  };
}

export function syncHomeworkCourseProjection(records, courseKey) {
  const previous = records.courses?.[courseKey] || { pendingHomework: [], completedHomework: [], leaveConfirmations: [], homeworkWeights: {} };
  const linked = (item) => Boolean(assignmentIdFromHomeworkItem(item, courseKey, records.assignments));
  const pendingHomework = (previous.pendingHomework || []).filter((item) => !linked(item));
  const completedHomework = (previous.completedHomework || []).filter((item) => !linked(item));

  for (const assignment of Object.values(records.assignments || {})) {
    const target = assignment.targets?.[courseKey];
    if (!target) continue;
    for (const submission of Object.values(target.submissions || {})) {
      if (submission.status === 'pending') pendingHomework.push(homeworkProjectionEntry(assignment, courseKey, submission));
      if (submission.status === 'completed') completedHomework.push(homeworkProjectionEntry(assignment, courseKey, submission));
    }
  }

  const sortEntries = (left, right) => String(left.missingDateKey || left.date || '').localeCompare(String(right.missingDateKey || right.date || ''))
    || String(left.assignment || '').localeCompare(String(right.assignment || ''), 'zh-Hant')
    || Number(left.seat) - Number(right.seat);
  pendingHomework.sort(sortEntries);
  completedHomework.sort(sortEntries);
  const homeworkWeights = pendingHomework.reduce((weights, item) => ({ ...weights, [item.seat]: (weights[item.seat] || 0) + 1 }), {});
  return {
    ...records,
    courses: {
      ...(records.courses || {}),
      [courseKey]: { ...previous, pendingHomework, completedHomework, homeworkWeights }
    }
  };
}

export function normalizeHomeworkSubmissionRecords(records) {
  let assignments = records.assignments || {};
  let changed = false;
  const courseKeys = new Set(Object.keys(records.courses || {}));
  for (const assignment of Object.values(assignments)) {
    Object.keys(assignment.targets || {}).forEach((courseKey) => courseKeys.add(courseKey));
  }

  for (const [courseKey, courseRecord] of Object.entries(records.courses || {})) {
    const sourceEntries = [
      ...(courseRecord.pendingHomework || []).map((item) => ({ item, status: 'pending' })),
      ...(courseRecord.completedHomework || []).map((item) => ({ item, status: 'completed' }))
    ];
    for (const { item, status } of sourceEntries) {
      const assignmentId = assignmentIdFromHomeworkItem(item, courseKey, assignments);
      const assignment = assignmentId ? assignments[assignmentId] : null;
      const target = assignment?.targets?.[courseKey];
      const seat = Number(item.seat);
      if (!assignment || !target || !Number.isInteger(seat)) continue;
      const sourceCheckId = item.sourceCheckId || target.lastCheck?.id || item.sourceCheck || `legacy:${assignmentId}:${courseKey}`;
      const submissionId = item.submissionId || item.id || `${sourceCheckId}:${seat}`;
      const existing = target.submissions?.[submissionId]
        || Object.values(target.submissions || {}).find((submission) => Number(submission.seat) === seat && submission.status === status);
      if (existing) continue;
      const submissions = {
        ...(target.submissions || {}),
        [submissionId]: {
          id: submissionId,
          seat,
          sourceCheckId,
          missingDateKey: item.missingDateKey || item.date || target.lastCheck?.dateKey || target.due?.dateKey,
          status,
          recordedAt: item.recordedAt || item.date || target.lastCheck?.savedAt || '',
          ...(status === 'completed' ? { completedAt: item.completedAt || '' } : {})
        }
      };
      assignments = {
        ...assignments,
        [assignmentId]: {
          ...assignment,
          targets: { ...assignment.targets, [courseKey]: { ...target, submissions } }
        }
      };
      changed = true;
    }
  }

  let normalized = changed ? { ...records, assignments } : records;
  for (const courseKey of courseKeys) normalized = syncHomeworkCourseProjection(normalized, courseKey);
  return normalized;
}

export function completeHomeworkSubmission(records, { assignmentId, courseKey, submissionId, seat, completedAt }) {
  const assignment = records.assignments?.[assignmentId];
  const target = assignment?.targets?.[courseKey];
  const pending = submissionId
    ? target?.submissions?.[submissionId]
    : Object.values(target?.submissions || {}).find((submission) => submission.status === 'pending' && Number(submission.seat) === Number(seat));
  if (!assignment || !target || !pending || pending.status !== 'pending') return records;
  const id = pending.id || submissionId;
  const next = {
    ...records,
    assignments: {
      ...records.assignments,
      [assignmentId]: {
        ...assignment,
        targets: {
          ...assignment.targets,
          [courseKey]: {
            ...target,
            submissions: {
              ...target.submissions,
              [id]: { ...pending, id, status: 'completed', completedAt }
            }
          }
        }
      }
    }
  };
  return syncHomeworkCourseProjection(next, courseKey);
}

export function saveAssignmentCheck(records, { assignmentId, courseKey, session, seatStates, savedAt, activeSeats = null }) {
  const assignment = records.assignments[assignmentId];
  const target = assignment?.targets?.[courseKey];
  const allowed = Array.isArray(activeSeats) ? new Set(activeSeats.map(Number)) : null;
  const validSeatStates = allowed
    ? Object.fromEntries(Object.entries(seatStates || {}).filter(([seat]) => allowed.has(Number(seat))))
    : seatStates;
  if (!assignment || !target) return { records, summary: summarizeSeatStates(validSeatStates) };
  const checkId = `${session.dateKey}:${session.slotId}:${assignmentId}:${courseKey}`;
  const sourceCheck = `assignment:${assignmentId}:${courseKey}`;
  const summary = summarizeSeatStates(validSeatStates);
  const check = { id: checkId, dateKey: session.dateKey, slotId: session.slotId, seatStates: { ...validSeatStates }, savedAt, summary };
  const checks = [...(target.checks || []).filter((item) => item.id !== checkId), check];
  const incompleteSeats = new Set(Object.entries(validSeatStates).filter(([, status]) => status === 'incomplete').map(([seat]) => Number(seat)));
  const submissions = Object.fromEntries(Object.entries(target.submissions || {}).map(([id, submission]) => {
    if (submission.status === 'pending' && !incompleteSeats.has(Number(submission.seat))) {
      return [id, { ...submission, status: 'cancelled', cancelledAt: savedAt }];
    }
    return [id, submission];
  }));
  for (const seat of incompleteSeats) {
    const existing = Object.values(submissions).find((submission) => Number(submission.seat) === seat && ['pending', 'completed'].includes(submission.status));
    if (existing) continue;
    const submissionId = `${checkId}:${seat}`;
    submissions[submissionId] = {
      id: submissionId,
      seat,
      sourceCheckId: checkId,
      missingDateKey: session.dateKey,
      status: 'pending',
      recordedAt: savedAt
    };
  }
  const assignments = {
    ...records.assignments,
    [assignmentId]: {
      ...assignment,
      targets: {
        ...assignment.targets,
        [courseKey]: { ...target, checks, lastCheck: check, submissions }
      }
    }
  };
  let next = syncHomeworkCourseProjection({ ...records, assignments }, courseKey);
  const previousCourse = next.courses[courseKey] || {};
  const leaveConfirmations = (previousCourse.leaveConfirmations || []).filter((item) => item.sourceCheck !== sourceCheck && item.assignmentId !== assignmentId);
  for (const [seatText, status] of Object.entries(validSeatStates)) {
    if (status !== 'leave') continue;
    const seat = Number(seatText);
    leaveConfirmations.push({ seat, assignmentId, courseKey, assignment: assignment.title, date: session.dateKey, sourceCheck, sourceCheckId: checkId });
  }
  next = { ...next, courses: { ...next.courses, [courseKey]: { ...previousCourse, leaveConfirmations } } };
  return { records: next, summary };
}

export function applyHomeworkCheck(courseRecords = {}, { courseKey, checkId, assignment, seatStates, date }) {
  const previous = courseRecords[courseKey] || { pendingHomework: [], leaveConfirmations: [], homeworkWeights: {} };
  const pendingHomework = (previous.pendingHomework || []).filter((item) => item.sourceCheck !== checkId);
  const leaveConfirmations = (previous.leaveConfirmations || []).filter((item) => item.sourceCheck !== checkId);

  for (const [seatText, status] of Object.entries(seatStates)) {
    const seat = Number(seatText);
    if (status === 'incomplete') pendingHomework.push({ seat, assignment, date, sourceCheck: checkId });
    if (status === 'leave') leaveConfirmations.push({ seat, assignment, date, sourceCheck: checkId });
  }

  const homeworkWeights = pendingHomework.reduce((weights, item) => ({ ...weights, [item.seat]: (weights[item.seat] || 0) + 1 }), {});
  return {
    ...courseRecords,
    [courseKey]: { ...previous, pendingHomework, leaveConfirmations, homeworkWeights }
  };
}

export function toggleSeatState(seatStates, seat, mode = 'incomplete', disabledSeats = DISABLED_SEATS) {
  if (disabledSeats.includes(seat)) return { ...seatStates };
  const next = { ...seatStates };
  if (mode === 'complete') {
    delete next[seat];
    return next;
  }
  next[seat] = next[seat] === mode ? undefined : mode;
  if (next[seat] === undefined) delete next[seat];
  return next;
}

export function summarizeSeatStates(seatStates = {}) {
  const values = Object.values(seatStates);
  return {
    incomplete: values.filter((value) => value === 'incomplete').length,
    leave: values.filter((value) => value === 'leave').length,
    complete: values.length === 0
  };
}

export function shouldSuppressLongPressClick(suppressed, seat, pointerId = null) {
  if (!suppressed || suppressed.seat !== seat) return false;
  return pointerId == null || suppressed.pointerId == null || suppressed.pointerId === pointerId;
}

export function classroomReminderSessionKey(session) {
  if (!session?.course || !session.dateKey || !session.slotId) return '';
  return `${session.dateKey}:${session.slotId}:${courseDataKey(session.course)}`;
}

export function classroomRemindersForSession(reminders = {}, session) {
  const sessionKey = classroomReminderSessionKey(session);
  if (!sessionKey) return [];
  return Object.values(reminders)
    .filter((record) => record.status !== 'reversed' && record.sessionKey === sessionKey)
    .sort((left, right) => Number(right.sequence || 0) - Number(left.sequence || 0)
      || String(right.createdAt).localeCompare(String(left.createdAt)));
}

export function addClassroomReminder(records, {
  reminderId,
  session,
  seat,
  category,
  recordedTime,
  createdAt,
  activeSeats = null
}) {
  const normalizedSeat = Number(seat);
  const sessionKey = classroomReminderSessionKey(session);
  const allowedSeats = Array.isArray(activeSeats) ? new Set(activeSeats.map(Number)) : null;
  if (!sessionKey
    || !Number.isInteger(normalizedSeat)
    || normalizedSeat < 1
    || (allowedSeats ? !allowedSeats.has(normalizedSeat) : normalizedSeat > ROSTER_CAPACITY || DISABLED_SEATS.includes(normalizedSeat))
    || !CLASSROOM_REMINDER_CATEGORIES.includes(category)) return records;

  const reminders = records.reminders || {};
  const normalizedCreatedAt = createdAt || new Date().toISOString();
  const normalizedRecordedTime = recordedTime || normalizedCreatedAt.slice(11, 16);
  const id = reminderId || `reminder-${normalizedCreatedAt}-${normalizedSeat}-${Object.keys(reminders).length}`;
  if (reminders[id]) return records;
  const courseKey = courseDataKey(session.course);
  const record = {
    id,
    sequence: Object.keys(reminders).length + 1,
    sessionKey,
    courseKey,
    course: { ...session.course },
    dateKey: session.dateKey,
    monthKey: session.dateKey.slice(0, 7),
    slotId: session.slotId,
    period: session.period,
    seat: normalizedSeat,
    category,
    recordedTime: normalizedRecordedTime,
    createdAt: normalizedCreatedAt,
    status: 'active'
  };
  return { ...records, reminders: { ...reminders, [id]: record } };
}

export function undoClassroomReminder(records, { reminderId, reversedAt }) {
  const reminders = records.reminders || {};
  const record = reminders[reminderId];
  if (!record || record.status === 'reversed') return records;
  return {
    ...records,
    reminders: {
      ...reminders,
      [reminderId]: { ...record, status: 'reversed', reversedAt }
    }
  };
}

export function classroomReminderMonthlyCounts(reminders = {}, courseKey, monthKey) {
  return Object.values(reminders).reduce((counts, record) => {
    if (record.status === 'reversed' || record.courseKey !== courseKey || record.monthKey !== monthKey) return counts;
    return { ...counts, [record.seat]: (counts[record.seat] || 0) + 1 };
  }, {});
}

export function classroomReminderWeightsForMonth(reminders = {}, courseKey, monthKey) {
  return Object.fromEntries(Object.entries(classroomReminderMonthlyCounts(reminders, courseKey, monthKey))
    .map(([seat, count]) => [seat, Math.floor(count / 3)])
    .filter(([, weight]) => weight > 0));
}

export function calculateDrawWeight({ homework = 0, reminder = 0, manual = 0, cap = 6 } = {}) {
  const normalizedCap = Math.max(1, Math.floor(Number(cap) || 6));
  const additions = [homework, reminder, manual]
    .map((value) => Math.max(0, Math.floor(Number(value) || 0)))
    .reduce((sum, value) => sum + value, 0);
  return Math.min(normalizedCap, 1 + additions);
}

export function resolveManualDrawWeight({ homework = 0, reminder = 0, manual = 0, cap = 6 } = {}) {
  const normalizedCap = Math.max(1, Math.floor(Number(cap) || 6));
  const normalizedHomework = Math.max(0, Math.floor(Number(homework) || 0));
  const normalizedReminder = Math.max(0, Math.floor(Number(reminder) || 0));
  const maxRequested = Math.max(0, normalizedCap - 1);
  const requested = Math.min(maxRequested, Math.max(0, Math.floor(Number(manual) || 0)));
  const remaining = Math.max(0, normalizedCap - 1 - normalizedHomework - normalizedReminder);
  const applied = Math.min(requested, remaining);
  return {
    requested,
    applied,
    maxRequested,
    remaining,
    limited: applied < requested,
    total: Math.min(normalizedCap, 1 + normalizedHomework + normalizedReminder + applied)
  };
}

export function clampManualDrawWeightsByMonth(weightsByMonth = {}, cap = 6) {
  const maxRequested = Math.max(0, Math.max(1, Math.floor(Number(cap) || 6)) - 1);
  return Object.fromEntries(Object.entries(weightsByMonth || {}).map(([monthKey, weights]) => [
    monthKey,
    Object.fromEntries(Object.entries(weights || {})
      .map(([seat, value]) => [seat, Math.min(maxRequested, Math.max(0, Math.floor(Number(value) || 0)))])
      .filter(([, value]) => value > 0))
  ]));
}

export function drawCandidateSeats(activeSeats = [], excludedSeats = [], drawnSeats = [], allowRepeat = false) {
  const excluded = new Set(excludedSeats.map(Number));
  const drawn = new Set(drawnSeats.map(Number));
  return activeSeats
    .map(Number)
    .filter((seat) => Number.isInteger(seat) && !excluded.has(seat) && (allowRepeat || !drawn.has(seat)));
}

export function createWeightedDrawPool({
  activeSeats = [],
  excludedSeats = [],
  drawnSeats = [],
  allowRepeat = false,
  useWeighting = true,
  homeworkWeights = {},
  reminderWeights = {},
  manualWeights = {},
  cap = 6
} = {}) {
  return drawCandidateSeats(activeSeats, excludedSeats, drawnSeats, allowRepeat).map((seat) => {
    const homework = Math.max(0, Number(homeworkWeights[seat] || 0));
    const reminder = Math.max(0, Number(reminderWeights[seat] || 0));
    const manualResolution = resolveManualDrawWeight({
      homework,
      reminder,
      manual: manualWeights[seat],
      cap
    });
    return {
      seat,
      homework,
      reminder,
      manual: manualResolution.applied,
      manualRequested: manualResolution.requested,
      weight: useWeighting ? manualResolution.total : 1
    };
  });
}

export function pickWeightedDrawSeat(pool = [], randomValue = Math.random()) {
  if (!pool.length) return null;
  const total = pool.reduce((sum, entry) => sum + Math.max(0, Number(entry.weight) || 0), 0);
  if (total <= 0) return null;
  let cursor = Math.max(0, Math.min(0.999999999, Number(randomValue) || 0)) * total;
  for (const entry of pool) {
    cursor -= Math.max(0, Number(entry.weight) || 0);
    if (cursor < 0) return entry.seat;
  }
  return pool.at(-1).seat;
}
