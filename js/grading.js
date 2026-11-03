// ==========================================================================
// GRADING + DATA ENGINE — shared by admin and student pages. Load after core.js.
//
//   • Attendance storage (v2): ONE document per student per course
//       attendanceSummary/{COURSE}__{ROLL} = { courseCode, rollNumber,
//                                              days: { 'YYYY-MM-DD': 'present' | ... } }
//     A whole semester of a student's attendance in a course is 1 read
//     instead of ~60 — this is what keeps the app inside Firebase's free
//     50,000-reads/day limit no matter how much data builds up.
//   • Gradebook engine driven by the rules on the Settings page.
//   • Course plan helpers (generate, stats, Excel in/out).
// ==========================================================================

const ATT_COL = 'attendanceSummary';

/* ---------------- Courses & students ---------------- */

async function loadCoursesAndStudents() {
  const [coursesSnap, studentsSnap] = await Promise.all([
    db.collection('courses').get(),
    db.collection('students').get()
  ]);
  const courses = [];
  coursesSnap.forEach(doc => courses.push({ id: doc.id, ...doc.data() }));
  courses.sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id));
  const students = [];
  studentsSnap.forEach(doc => students.push({ id: doc.id, ...doc.data() }));
  students.sort((a, b) => (a.name || '').localeCompare(b.name || '') || a.id.localeCompare(b.id));
  return { courses, students };
}

/** <option>s for a course <select>. opts: { settings, activeOnly, selected } */
function courseOptionsHtml(courses, opts) {
  const o = opts || {};
  let list = courses;
  if (o.activeOnly && o.settings) list = courses.filter(c => inActiveTerm(c, o.settings));
  return list.map(c => `<option value="${h(c.id)}"${o.selected === c.id ? ' selected' : ''}>${h(c.id)} — ${h(c.title || '')}${c.term ? ' (' + h(c.term) + ')' : ''}</option>`).join('');
}

function isActiveStudent(s) { return !s.status || s.status === 'active'; }

/** Students enrolled in a course. Inactive/graduated students are left out unless includeInactive. */
function rosterForCourse(students, courseCode, opts) {
  const inc = opts && opts.includeInactive;
  return students.filter(s => (s.course || []).includes(courseCode) && (inc || isActiveStudent(s)));
}

function appliesTo(item, roll) {
  return !item.assignTo || item.assignTo === 'all' || (Array.isArray(item.assignTo) && item.assignTo.includes(roll));
}
function resolveAssignees(item, roster) {
  return roster.filter(s => appliesTo(item, s.id));
}

/* ---------------- Attendance (v2 storage) ---------------- */

function attDocId(courseCode, roll) { return sanitizeId(`${courseCode}__${roll}`); }

/** { roll: {date: status} } for one course */
async function loadCourseAttendance(courseCode) {
  const snap = await db.collection(ATT_COL).where('courseCode', '==', courseCode).get();
  const out = {};
  snap.forEach(doc => { const d = doc.data(); out[d.rollNumber] = d.days || {}; });
  return out;
}

/** { courseCode: { roll: {date: status} } } for everything (admin dashboard / reports) */
async function loadAllAttendance() {
  const snap = await db.collection(ATT_COL).get();
  const out = {};
  snap.forEach(doc => {
    const d = doc.data();
    (out[d.courseCode] = out[d.courseCode] || {})[d.rollNumber] = d.days || {};
  });
  return out;
}

/** { courseCode: {date: status} } for one student (student pages) */
async function loadStudentAttendance(roll) {
  const snap = await db.collection(ATT_COL).where('rollNumber', '==', roll).get();
  const out = {};
  snap.forEach(doc => { const d = doc.data(); out[d.courseCode] = d.days || {}; });
  return out;
}

function inRange(date, from, to) {
  if (!date) return !from && !to;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

/** Applies your Settings rules to a {date: status} map. */
function attendanceStats(days, settings, from, to) {
  const st = { present: 0, absent: 0, leave: 0, late: 0, excused: 0, counts: {}, total: 0, counted: 0, attended: 0, pct: null };
  Object.entries(days || {}).forEach(([date, status]) => {
    if (!status || typeof status !== 'string' || !inRange(date, from, to)) return;
    st.counts[status] = (st.counts[status] || 0) + 1;
    if (ATT_STATUSES.includes(status)) st[status]++;
    st.total++;
    const rule = attRule(settings, status);
    if (rule === 'excluded') return;
    st.counted++;
    if (rule === 'present') st.attended += 1;
    else if (rule === 'half') st.attended += 0.5;
  });
  st.pct = st.counted ? round(st.attended / st.counted * 100, 1) : null;
  return st;
}

/** "P 12 · A 2 · L 1" using your option codes (only options that occur, plus switched-on ones). */
function attCountsText(st, settings) {
  const keys = new Set([...attStatuses(settings, true).map(s => s.key), ...Object.keys(st.counts || {})]);
  return [...keys].map(k => `${attCode(settings, k)} ${(st.counts || {})[k] || 0}`).join(' · ');
}

/** Turns attendance % into the score used by the gradebook (proportional or your bands). */
function attendanceScore(pct, settings) {
  if (pct === null || pct === undefined) return null;
  const a = settings.attendance;
  if (a.scoring !== 'bands') return pct;
  const bands = [...(a.bands || [])].sort((x, y) => y.min - x.min);
  const b = bands.find(b => pct >= Number(b.min));
  return b ? Number(b.score) : 0;
}

/** Firestore write ops for one course/date: statusByRoll = { roll: status | null(remove) } */
function attendanceWriteOps(courseCode, date, statusByRoll) {
  const del = firebase.firestore.FieldValue.delete();
  return Object.entries(statusByRoll).map(([roll, status]) => batch => {
    batch.set(db.collection(ATT_COL).doc(attDocId(courseCode, roll)), {
      courseCode, rollNumber: roll, days: { [date]: status ? status : del }
    }, { merge: true });
  });
}

/** Write ops for many dates of one student (bulk monthly upload). daysMap = {date: status} */
function attendanceWriteOpsForStudent(courseCode, roll, daysMap) {
  return batch => batch.set(db.collection(ATT_COL).doc(attDocId(courseCode, roll)), {
    courseCode, rollNumber: roll, days: daysMap
  }, { merge: true });
}

/* ---------------- Letter grades ---------------- */

function gradeFor(pct, settings) {
  if (pct === null || pct === undefined || isNaN(pct)) return { grade: '—', gp: null };
  const scale = [...settings.grading.scale].sort((a, b) => b.min - a.min);
  const row = scale.find(r => pct >= Number(r.min)) || scale[scale.length - 1];
  return { grade: row ? row.grade : '—', gp: row ? Number(row.gp) : null };
}
function letterGrade(pct, settings) { return gradeFor(pct, settings || (typeof _settingsCache !== 'undefined' && _settingsCache) || DEFAULT_SETTINGS).grade; }

/* ---------------- Gradebook engine ---------------- */

/** Everything needed to grade one course (4 queries). */
async function loadCourseGradeData(courseCode) {
  const [itemsSnap, marksSnap, adjSnap, attendance] = await Promise.all([
    db.collection('gradeItems').where('courseCode', '==', courseCode).get(),
    db.collection('gradeMarks').where('courseCode', '==', courseCode).get(),
    db.collection('gradebookAdjustments').where('courseCode', '==', courseCode).get(),
    loadCourseAttendance(courseCode)
  ]);
  const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const marks = marksSnap.docs.map(d => d.data());
  const adjustments = {};
  adjSnap.forEach(d => { adjustments[d.data().rollNumber] = d.data(); });
  return { items, marks, adjustments, attendance };
}

function countsInGrade(item) { return item.countInGrade !== false && Number(item.totalMarks) > 0; }

/**
 * Computes gradebook rows.
 * args: { course, roster, items, marks, adjustments, attendance:{roll:days}, settings, from, to, today }
 */
function computeGradebook(args) {
  const { course, roster, items, marks, settings } = args;
  const adjustments = args.adjustments || {};
  const attendance = args.attendance || {};
  const today = args.today || localToday();
  const from = args.from || '', to = args.to || '';
  const g = settings.grading;
  const weights = weightsFor(course, settings);
  const dec = Number(g.decimals ?? 1);

  const counted = items.filter(it => countsInGrade(it) && inRange(it.dueDate, from, to));
  const itemsByType = {};
  GRADE_TYPES.forEach(t => { itemsByType[t] = counted.filter(it => it.type === t); });
  const markIndex = {};
  marks.forEach(m => { markIndex[m.itemId + '|' + m.rollNumber] = m; });

  // A component is "available" once at least one counted item of that type has a mark.
  const available = { attendance: false };
  GRADE_TYPES.forEach(t => {
    available[t] = itemsByType[t].some(it => marks.some(m => m.itemId === it.id && m.marksObtained !== null && m.marksObtained !== undefined));
  });
  available.attendance = Object.values(attendance).some(days => attendanceStats(days, settings, from, to).counted > 0);

  return roster.map(s => {
    const att = attendanceStats(attendance[s.id] || {}, settings, from, to);
    const comps = { attendance: attendanceScore(att.pct, settings) };
    const counts = {};
    GRADE_TYPES.forEach(t => {
      let entries = [];
      itemsByType[t].forEach(it => {
        if (!appliesTo(it, s.id)) return;
        const m = markIndex[it.id + '|' + s.id];
        const total = Number((m && m.totalMarks) || it.totalMarks);
        if (m && m.marksObtained !== null && m.marksObtained !== undefined && total > 0) {
          entries.push({ obt: Number(m.marksObtained), total });
        } else if (g.blankMarks === 'zero' && it.dueDate && it.dueDate < today && total > 0) {
          entries.push({ obt: 0, total });
        }
      });
      const drop = Number((g.dropLowest || {})[t] || 0);
      if (drop > 0 && entries.length > drop) {
        entries = entries.sort((a, b) => a.obt / a.total - b.obt / b.total).slice(drop);
      }
      counts[t] = entries.length;
      if (!entries.length) { comps[t] = null; return; }
      comps[t] = g.aggregation === 'sum'
        ? entries.reduce((a, e) => a + e.obt, 0) / entries.reduce((a, e) => a + e.total, 0) * 100
        : entries.reduce((a, e) => a + e.obt / e.total * 100, 0) / entries.length;
    });

    let earned = 0, possible = 0;
    ['attendance', ...GRADE_TYPES].forEach(k => {
      const w = Number(weights[k] || 0);
      if (w <= 0) return;
      const v = comps[k];
      if (g.missingComponent === 'zero') {
        possible += w; earned += w * (v || 0) / 100;
      } else if (available[k] && v !== null && v !== undefined) {
        possible += w; earned += w * v / 100;
      }
    });
    const weighted = possible > 0 ? earned / possible * 100 : null;
    const adj = adjustments[s.id] || {};
    const bonus = Number(adj.bonusMarks || 0), negative = Number(adj.negativeMarks || 0);
    const total = weighted === null && !bonus && !negative ? null
      : Math.max(0, Math.min(100, round((weighted || 0) + bonus - negative, dec)));
    const gr = gradeFor(total, settings);
    return {
      roll: s.id, name: s.name || '', phone: s.phone || '', student: s,
      att, attPct: att.pct, attScore: comps.attendance,
      comps, counts,
      earned: round(earned, dec), possible: round(possible, dec),
      weighted: round(weighted, dec), bonus, negative,
      total, grade: gr.grade, gp: gr.gp,
      passed: total !== null && total >= Number(g.passMark),
      attWarn: att.pct !== null && att.pct < Number(settings.attendance.warningThreshold)
    };
  });
}

/* ---------------- Bulk marks template ---------------- */

function downloadMarksTemplate(item, assignees) {
  const header = ['Roll Number', 'Name', `Marks (out of ${item.totalMarks})`, 'Remarks'];
  const rows = assignees.map(s => [s.id, s.name || '', '', '']);
  downloadWorkbook({ Marks: { aoa: [header, ...rows] } }, `marks-template-${sanitizeId(item.title || 'marks')}.xlsx`);
}

async function importMarksFile(file, item) {
  const rows = await readSheet(file, { header: true });
  const ops = [];
  rows.slice(1).forEach(row => {
    const roll = String(row[0] || '').trim();
    if (!roll) return;
    const marksRaw = row[2];
    const remarks = String(row[3] || '').trim();
    const marksObtained = (marksRaw === '' || marksRaw === undefined) ? null : Number(marksRaw);
    if (marksObtained !== null && isNaN(marksObtained)) return;
    ops.push(batch => batch.set(db.collection('gradeMarks').doc(`${item.id}__${roll}`), {
      itemId: item.id, type: item.type, courseCode: item.courseCode,
      rollNumber: roll, marksObtained, totalMarks: item.totalMarks, remarks
    }, { merge: true }));
  });
  const r = await writeInBatches(ops);
  return r.count;
}

/* ---------------- Course plans ---------------- */

const PLAN_TYPES = ['lecture', 'revision', 'midterm', 'final', 'holiday', 'other'];
const PLAN_TYPE_LABEL = { lecture: 'Lecture', revision: 'Revision', midterm: 'Mid-Term', final: 'Final', holiday: 'Holiday', other: 'Other' };
const TEACH_TYPES = ['lecture', 'revision'];

function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); }

/** Builds an empty semester skeleton: weeks × meeting days, with exam weeks marked. */
function generatePlanSessions(cfg) {
  const start = cfg.startDate;
  const startDow = weekdayOf(start);
  const days = [...(cfg.meetingDays || [])].map(Number)
    .sort((a, b) => ((a - startDow + 7) % 7) - ((b - startDow + 7) % 7));
  const sessions = [];
  for (let w = 1; w <= Number(cfg.weeks); w++) {
    const weekStart = addDays(start, (w - 1) * 7);
    days.forEach((dow, i) => {
      const date = addDays(weekStart, (dow - startDow + 7) % 7);
      let type = 'lecture', topic = '';
      if (w === Number(cfg.midtermWeek)) { type = 'midterm'; topic = 'Mid-Semester Examination'; }
      if (w === Number(cfg.finalWeek)) { type = 'final'; topic = 'Final-Semester Examination'; }
      sessions.push({ id: uid(), week: w, session: i + 1, plannedDate: date, type, topic, details: '', covered: false, coveredOn: null });
    });
  }
  return sessions;
}

function sortSessions(sessions) {
  return [...sessions].sort((a, b) => (a.week - b.week) || ((a.plannedDate || '').localeCompare(b.plannedDate || '')) || ((a.session || 0) - (b.session || 0)));
}

/** Coverage numbers for meters/graphs. */
function planStats(plan, today) {
  const t = today || localToday();
  const sessions = sortSessions(plan.sessions || []);
  const teach = sessions.filter(s => TEACH_TYPES.includes(s.type));
  const covered = teach.filter(s => s.covered).length;
  const expected = teach.filter(s => s.plannedDate && s.plannedDate <= t).length;
  const total = teach.length;
  const weeks = Math.max(Number(plan.weeks || 0), ...sessions.map(s => s.week || 0), 1);
  const next = teach.find(s => !s.covered) || null;
  const upcoming = sessions.find(s => s.plannedDate && s.plannedDate >= t);
  const currentWeek = upcoming ? upcoming.week : (sessions.length ? sessions[sessions.length - 1].week : 1);
  const exams = sessions.filter(s => s.type === 'midterm' || s.type === 'final');
  const nextExam = exams.find(s => s.plannedDate && s.plannedDate >= t) || null;

  // Burn-up: cumulative % planned vs actually covered, per week
  const plannedCum = [], actualCum = [];
  const startDate = plan.startDate || (sessions[0] && sessions[0].plannedDate);
  const weekOfDate = d => startDate && d ? Math.floor(daysBetween(startDate, d) / 7) + 1 : null;
  for (let w = 1; w <= weeks; w++) {
    const p = teach.filter(s => s.week <= w).length;
    plannedCum.push(total ? round(p / total * 100, 1) : 0);
  }
  const lastActualWeek = Math.min(weeks, Math.max(1, weekOfDate(t) || currentWeek));
  for (let w = 1; w <= weeks; w++) {
    if (w > lastActualWeek) { actualCum.push(null); continue; }
    const c = teach.filter(s => s.covered && (weekOfDate(s.coveredOn) || s.week) <= w).length;
    actualCum.push(total ? round(c / total * 100, 1) : 0);
  }
  return {
    total, covered, expected, remaining: total - covered,
    pct: total ? round(covered / total * 100, 1) : 0,
    expectedPct: total ? round(expected / total * 100, 1) : 0,
    pace: covered - expected,
    next, nextExam, currentWeek, weeks, plannedCum, actualCum,
    midtermWeek: Number(plan.midtermWeek) || null, finalWeek: Number(plan.finalWeek) || null
  };
}

function paceInfo(stats) {
  if (!stats.total) return { label: 'No topics yet', cls: 'neutral' };
  if (stats.covered >= stats.total) return { label: 'Course complete', cls: 'ok' };
  if (stats.pace >= 0) return { label: stats.pace === 0 ? 'On track' : `${stats.pace} ahead`, cls: 'ok' };
  if (stats.pace >= -2) return { label: `${-stats.pace} behind`, cls: 'warn' };
  return { label: `${-stats.pace} behind`, cls: 'danger' };
}

async function loadPlans(codes) {
  const out = {};
  if (codes) {
    const docs = await getWhereIn('coursePlans', firebase.firestore.FieldPath.documentId(), codes);
    docs.forEach(d => { out[d.id] = { id: d.id, ...d.data() }; });
  } else {
    const snap = await db.collection('coursePlans').get();
    snap.forEach(d => { out[d.id] = { id: d.id, ...d.data() }; });
  }
  return out;
}

function planToSheetRows(plan) {
  let lec = 0;
  return sortSessions(plan.sessions || []).map(s => {
    const isTeach = TEACH_TYPES.includes(s.type);
    if (isTeach) lec++;
    return {
      'Week': s.week, 'Session': s.session || '', 'Lecture No.': isTeach ? lec : '',
      'Date': s.plannedDate || '', 'Day': s.plannedDate ? WEEKDAY_SHORT[weekdayOf(s.plannedDate)] : '',
      'Type': PLAN_TYPE_LABEL[s.type] || s.type, 'Topic': s.topic || '', 'Details': s.details || '',
      'Covered': s.covered ? 'Yes' : 'No', 'Covered On': s.coveredOn || ''
    };
  });
}

function parsePlanType(v) {
  const s = String(v || '').toLowerCase();
  if (!s) return 'lecture';
  if (s.includes('mid')) return 'midterm';
  if (s.includes('final')) return 'final';
  if (s.includes('holi') || s.includes('off') || s.includes('break') || s.includes('vacat')) return 'holiday';
  if (s.includes('revis') || s.includes('review')) return 'revision';
  if (s.includes('lect') || s.includes('class') || s.includes('teach')) return 'lecture';
  return 'other';
}
function parseYes(v) { return /^(y|yes|true|1|✓|✔|done|covered|taught)$/i.test(String(v || '').trim()); }

/** Rows from an uploaded Excel plan → sessions (keeps coverage of matching old topics). */
function sheetRowsToSessions(rows, oldSessions) {
  const old = oldSessions || [];
  const sessions = [];
  const perWeek = {};
  rows.forEach(r => {
    const topic = String(pickCol(r, ['Topic', 'Topics', 'Lecture Topic', 'Content', 'Title']) || '').trim();
    const week = Number(pickCol(r, ['Week', 'Week No', 'Week #', 'Wk'])) || 0;
    const date = excelToISODate(pickCol(r, ['Date', 'Planned Date', 'Lecture Date']));
    const type = parsePlanType(pickCol(r, ['Type', 'Kind', 'Category']));
    const details = String(pickCol(r, ['Details', 'Subtopics', 'Sub Topics', 'Description', 'Notes', 'Reading']) || '').trim();
    if (!topic && !date && !week) return;
    const w = week || (sessions.length ? sessions[sessions.length - 1].week : 1);
    perWeek[w] = (perWeek[w] || 0) + 1;
    const sess = Number(pickCol(r, ['Session', 'Day No', 'Class', 'Lecture in Week'])) || perWeek[w];
    const coveredRaw = pickCol(r, ['Covered', 'Done', 'Taught', 'Status']);
    let covered = parseYes(coveredRaw);
    let coveredOn = excelToISODate(pickCol(r, ['Covered On', 'Taught On', 'Completed On'])) || null;
    if (coveredRaw === '' && topic) {
      const match = old.find(o => o.covered && o.week === w && (o.topic || '').trim().toLowerCase() === topic.toLowerCase());
      if (match) { covered = true; coveredOn = coveredOn || match.coveredOn; }
    }
    if (covered && !coveredOn) coveredOn = date || localToday();
    sessions.push({ id: uid(), week: w, session: sess, plannedDate: date, type, topic, details, covered, coveredOn: covered ? coveredOn : null });
  });
  return sortSessions(sessions);
}

function planTemplateWorkbook(plan, course) {
  const rows = planToSheetRows(plan);
  const info = [
    ['How to use this course plan template'],
    [''],
    ['1. Fill the "Topic" column for every Lecture row (and "Details" for subtopics/readings if you like).'],
    ['2. Type can be: Lecture, Revision, Mid-Term, Final, Holiday, Other. Only Lecture and Revision rows count toward "% course covered".'],
    ['3. You can change Dates, add rows, delete rows, or move topics between weeks — the app re-reads everything on upload.'],
    ['4. Dates can be typed as YYYY-MM-DD or DD/MM/YYYY.'],
    ['5. "Covered" = Yes/No. Usually leave it — you will tick topics in the app after each lecture.'],
    ['6. Upload this file back on the Course Plans page → "Upload Excel".'],
    [''],
    ['Course', `${course.id} — ${course.title || ''}`],
    ['Semester start', plan.startDate || ''],
    ['Mid-term week', plan.midtermWeek || ''],
    ['Final week', plan.finalWeek || '']
  ];
  return { 'Course Plan': rows, 'Instructions': { aoa: info } };
}
