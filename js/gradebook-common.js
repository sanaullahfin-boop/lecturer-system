// ==========================================================================
// SHARED HELPERS — used by assignments.js, presentations.js, quizzes.js,
// tasks.js, exams.js, and gradebook.js
// ==========================================================================

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'");
}

/** Loads all courses and students once; used by every grading page. */
async function loadCoursesAndStudents() {
  const [coursesSnap, studentsSnap] = await Promise.all([
    db.collection('courses').orderBy('title').get(),
    db.collection('students').orderBy('name').get()
  ]);
  const courses = [];
  coursesSnap.forEach(doc => courses.push({ id: doc.id, ...doc.data() }));
  const students = [];
  studentsSnap.forEach(doc => students.push({ id: doc.id, ...doc.data() }));
  return { courses, students };
}

function courseOptionsHtml(courses) {
  return courses.map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.id)} — ${escapeHtml(c.title)}</option>`).join('');
}

/** Students enrolled in a given course code (via their `course` array field). */
function rosterForCourse(students, courseCode) {
  return students.filter(s => (s.course || []).includes(courseCode));
}

/** Which students a grade item applies to: 'all' or an explicit roll-number array. */
function resolveAssignees(item, roster) {
  if (!item.assignTo || item.assignTo === 'all') return roster;
  const set = new Set(item.assignTo);
  return roster.filter(s => set.has(s.id));
}

function pct(obtained, total) {
  if (!total) return null;
  return Math.round((obtained / total) * 1000) / 10;
}

/** Letter grade from a percentage — a common HEC-style scale, easy to adjust later. */
function letterGrade(percentage) {
  if (percentage === null || percentage === undefined) return '—';
  if (percentage >= 85) return 'A';
  if (percentage >= 80) return 'A-';
  if (percentage >= 75) return 'B+';
  if (percentage >= 70) return 'B';
  if (percentage >= 65) return 'B-';
  if (percentage >= 60) return 'C+';
  if (percentage >= 55) return 'C';
  if (percentage >= 50) return 'C-';
  if (percentage >= 45) return 'D';
  return 'F';
}

/** Computes a student's attendance % for a course from the attendance collection. */
async function computeAttendancePercentages(courseCode) {
  let query = db.collection('attendance');
  if (courseCode) query = query.where('courseCode', '==', courseCode);
  const snap = await query.get();
  const tally = {};
  snap.forEach(doc => {
    const d = doc.data();
    if (!tally[d.rollNumber]) tally[d.rollNumber] = { present: 0, total: 0 };
    tally[d.rollNumber].total++;
    if (d.status === 'present' || d.status === 'late') tally[d.rollNumber].present++;
  });
  const result = {};
  Object.entries(tally).forEach(([roll, t]) => { result[roll] = pct(t.present, t.total); });
  return result;
}

/**
 * Average percentage per student for a given grade-item type + course, from
 * `gradeMarks`. Returns { rollNumber: avgPercentage }.
 */
async function computeAveragePercentages(type, courseCode) {
  let query = db.collection('gradeMarks').where('type', '==', type);
  if (courseCode) query = query.where('courseCode', '==', courseCode);
  const snap = await query.get();
  const tally = {}; // roll -> {sumPct, count}
  snap.forEach(doc => {
    const d = doc.data();
    if (d.marksObtained === null || d.marksObtained === undefined || !d.totalMarks) return;
    const p = pct(d.marksObtained, d.totalMarks);
    if (!tally[d.rollNumber]) tally[d.rollNumber] = { sum: 0, count: 0 };
    tally[d.rollNumber].sum += p;
    tally[d.rollNumber].count++;
  });
  const result = {};
  Object.entries(tally).forEach(([roll, t]) => { result[roll] = Math.round((t.sum / t.count) * 10) / 10; });
  return result;
}

// --------------------------------------------------------------------------
// Bulk marks template download/import — shared by Assignments, Presentations,
// Quizzes & Tasks, and Internal Exams. Downloads a simple Roll Number / Name /
// Marks / Remarks spreadsheet for one grade item's roster, and imports one
// back the same way the manual marks-grid modal saves.
// --------------------------------------------------------------------------

function downloadMarksTemplate(item, assignees) {
  const header = ['Roll Number', 'Name', `Marks (out of ${item.totalMarks})`, 'Remarks'];
  const rows = assignees.map(s => [s.id, s.name || '', '', '']);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Marks');
  const safeTitle = (item.title || 'marks').replace(/[^A-Za-z0-9_-]/g, '_');
  XLSX.writeFile(wb, `marks-template-${safeTitle}.xlsx`);
}

/** Reads an uploaded marks file and writes gradeMarks docs for the given item. Returns count written. */
async function importMarksFile(file, item) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  let written = 0;
  for (let i = 1; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const batch = db.batch();
    let count = 0;
    chunk.forEach(row => {
      const roll = String(row[0] || '').trim();
      if (!roll) return;
      const marksRaw = row[2];
      const remarks = String(row[3] || '').trim();
      const marksObtained = (marksRaw === '' || marksRaw === undefined) ? null : Number(marksRaw);
      const docId = `${item.id}__${roll}`;
      batch.set(db.collection('gradeMarks').doc(docId), {
        itemId: item.id, type: item.type, courseCode: item.courseCode,
        rollNumber: roll, marksObtained, totalMarks: item.totalMarks, remarks
      }, { merge: true });
      count++;
    });
    if (count > 0) { await batch.commit(); written += count; }
  }
  return written;
}
