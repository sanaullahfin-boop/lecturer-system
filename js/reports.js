// ==========================================================================
// REPORTS — each button generates and downloads a standalone .xlsx
// ==========================================================================

document.getElementById('logout-btn').addEventListener('click', logout);

let courses = [], students = [];

requireAdmin(async (user, adminData) => {
  document.getElementById('admin-name').textContent = (adminData && adminData.name) || user.email;
  document.getElementById('admin-initial').textContent = ((adminData && adminData.name) || user.email).charAt(0).toUpperCase();
  const data = await loadCoursesAndStudents();
  courses = data.courses; students = data.students;
  ['att-course', 'log-course', 'marks-course', 'assign-course', 'pres-course'].forEach(id => {
    document.getElementById(id).insertAdjacentHTML('beforeend', courseOptionsHtml(courses));
  });
});

function downloadWorkbook(sheets, filename) {
  const wb = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); // sheet name limit
  });
  XLSX.writeFile(wb, filename);
}

function reportMsg(text, type) {
  const el = document.getElementById('report-msg');
  el.textContent = text; el.className = 'form-msg ' + type;
}

// ---------- Student Report ----------

document.getElementById('btn-student-report').addEventListener('click', () => {
  const rows = students.map(s => ({
    'Roll Number': s.id, 'Name': s.name || '', "Father's Name": s.fatherName || '',
    'Email': s.email || '', 'Phone': s.phone || '', 'Program': s.program || '',
    'Semester': s.semester || '', 'Section': s.section || '', 'Session': s.session || '',
    'Status': s.status || '', 'Courses': (s.course || []).join(', '), 'Notes': s.notes || ''
  }));
  downloadWorkbook({ Students: rows }, `student-report-${today()}.xlsx`);
});

// ---------- Course Report ----------

document.getElementById('btn-course-report').addEventListener('click', () => {
  const rows = courses.map(c => ({
    'Course Code': c.id, 'Title': c.title || '', 'Credit Hours': c.creditHours || '',
    'Semester': c.semester || '', 'Section': c.section || '', 'Teacher': c.teacher || '',
    'Reference Books': (c.referenceBooks || []).join('; '), 'Outline': c.outline || ''
  }));
  downloadWorkbook({ Courses: rows }, `course-report-${today()}.xlsx`);
});

// ---------- Attendance Report ----------

document.getElementById('btn-attendance-report').addEventListener('click', async () => {
  const code = document.getElementById('att-course').value;
  reportMsg('Generating attendance report…', 'info');
  try {
    let query = db.collection('attendance');
    if (code) query = query.where('courseCode', '==', code);
    const snap = await query.get();

    const tally = {}; // roll -> {present, absent, leave, late, excused, total}
    snap.forEach(doc => {
      const d = doc.data();
      if (!tally[d.rollNumber]) tally[d.rollNumber] = { present: 0, absent: 0, leave: 0, late: 0, excused: 0, total: 0 };
      tally[d.rollNumber].total++;
      if (tally[d.rollNumber][d.status] !== undefined) tally[d.rollNumber][d.status]++;
    });

    const rows = Object.entries(tally).map(([roll, t]) => {
      const student = students.find(s => s.id === roll);
      const attended = t.present + t.late;
      const pct = t.total ? Math.round((attended / t.total) * 1000) / 10 : 0;
      return {
        'Roll Number': roll, 'Name': student ? student.name : '(unknown)',
        'Present': t.present, 'Absent': t.absent, 'Leave': t.leave, 'Late': t.late, 'Excused': t.excused,
        'Total Classes': t.total, 'Attendance %': pct, 'Warning (<75%)': pct < 75 ? 'YES' : ''
      };
    }).sort((a, b) => a['Attendance %'] - b['Attendance %']);

    if (rows.length === 0) {
      reportMsg('No attendance records found for that filter.', 'error');
      return;
    }
    downloadWorkbook({ Attendance: rows }, `attendance-report${code ? '-' + code : ''}-${today()}.xlsx`);
    reportMsg('Downloaded.', 'info');
  } catch (e) {
    reportMsg('Could not generate report: ' + e.message, 'error');
  }
});

// ---------- Daily Attendance Log (day-by-day matrix) ----------

document.getElementById('btn-log-report').addEventListener('click', async () => {
  const code = document.getElementById('log-course').value;
  const startDate = document.getElementById('log-start').value;
  const endDate = document.getElementById('log-end').value;

  if (!code) { reportMsg('Pick a course first.', 'error'); return; }
  if (!startDate || !endDate) { reportMsg('Pick both a start and end date.', 'error'); return; }
  if (startDate > endDate) { reportMsg('Start date must be before the end date.', 'error'); return; }

  reportMsg('Building the daily attendance log…', 'info');
  try {
    const roster = rosterForCourse(students, code);
    if (roster.length === 0) { reportMsg('No students are enrolled in this course.', 'error'); return; }

    const snap = await db.collection('attendance').where('courseCode', '==', code).get();
    const byRollAndDate = {}; // roll -> { date -> status }
    snap.forEach(doc => {
      const d = doc.data();
      if (d.date < startDate || d.date > endDate) return;
      if (!byRollAndDate[d.rollNumber]) byRollAndDate[d.rollNumber] = {};
      byRollAndDate[d.rollNumber][d.date] = d.status;
    });

    // Build the list of dates actually present in the data within range,
    // so the sheet doesn't include a column for every day of the year —
    // just the days attendance was actually taken.
    const dateSet = new Set();
    Object.values(byRollAndDate).forEach(dateMap => Object.keys(dateMap).forEach(d => dateSet.add(d)));
    const dates = Array.from(dateSet).sort();

    if (dates.length === 0) {
      reportMsg('No attendance was recorded for this course in that date range.', 'error');
      return;
    }

    const statusCode = { present: 'P', absent: 'A', leave: 'L', late: 'Lt', excused: 'E' };
    const rows = roster.map(s => {
      const row = { 'Roll Number': s.id, 'Name': s.name || '' };
      dates.forEach(date => {
        const status = (byRollAndDate[s.id] || {})[date];
        row[date] = status ? (statusCode[status] || status) : '';
      });
      return row;
    });

    downloadWorkbook({ 'Daily Log': rows }, `daily-attendance-log-${code}-${startDate}_to_${endDate}.xlsx`);
    reportMsg('Downloaded.', 'info');
  } catch (e) {
    reportMsg('Could not generate report: ' + e.message, 'error');
  }
});

// ---------- Marks & Gradebook Report ----------

document.getElementById('btn-marks-report').addEventListener('click', async () => {
  const code = document.getElementById('marks-course').value;
  if (!code) { reportMsg('Pick a course for the gradebook report.', 'error'); return; }
  reportMsg('Crunching the gradebook…', 'info');
  try {
    const course = courses.find(c => c.id === code);
    const weights = (course && course.gradeWeights) || { attendance: 10, quiz: 15, assignment: 20, presentation: 10, task: 5, exam: 40 };
    const roster = rosterForCourse(students, code);

    const [attendancePct, quizPct, assignPct, presPct, taskPct, examPct, adjustmentsSnap] = await Promise.all([
      computeAttendancePercentages(code),
      computeAveragePercentages('quiz', code),
      computeAveragePercentages('assignment', code),
      computeAveragePercentages('presentation', code),
      computeAveragePercentages('task', code),
      computeAveragePercentages('exam', code),
      db.collection('gradebookAdjustments').where('courseCode', '==', code).get()
    ]);
    const adjustments = {};
    adjustmentsSnap.forEach(doc => { adjustments[doc.data().rollNumber] = doc.data(); });

    const rows = roster.map(s => {
      const att = attendancePct[s.id] ?? null, quiz = quizPct[s.id] ?? null, assign = assignPct[s.id] ?? null;
      const pres = presPct[s.id] ?? null, task = taskPct[s.id] ?? null, exam = examPct[s.id] ?? null;
      const adj = adjustments[s.id] || { bonusMarks: 0, negativeMarks: 0 };
      const weighted = ((att ?? 0) * weights.attendance + (quiz ?? 0) * weights.quiz + (assign ?? 0) * weights.assignment +
        (pres ?? 0) * weights.presentation + (task ?? 0) * weights.task + (exam ?? 0) * weights.exam) / 100;
      const total = Math.max(0, Math.min(100, Math.round((weighted + (adj.bonusMarks || 0) - (adj.negativeMarks || 0)) * 10) / 10));
      return {
        'Roll Number': s.id, 'Name': s.name, 'Attendance %': att ?? '', 'Quiz %': quiz ?? '',
        'Assignment %': assign ?? '', 'Presentation %': pres ?? '', 'Task %': task ?? '', 'Exam %': exam ?? '',
        'Bonus': adj.bonusMarks || 0, 'Negative': adj.negativeMarks || 0, 'Total %': total, 'Grade': letterGrade(total)
      };
    }).sort((a, b) => b['Total %'] - a['Total %']);

    if (rows.length === 0) { reportMsg('No students enrolled in that course.', 'error'); return; }
    downloadWorkbook({ Gradebook: rows }, `gradebook-report-${code}-${today()}.xlsx`);
    reportMsg('Downloaded.', 'info');
  } catch (e) {
    reportMsg('Could not generate report: ' + e.message, 'error');
  }
});

// ---------- Assignment Report ----------

document.getElementById('btn-assignment-report').addEventListener('click', async () => {
  const code = document.getElementById('assign-course').value;
  reportMsg('Generating assignment report…', 'info');
  try {
    let itemQuery = db.collection('gradeItems').where('type', '==', 'assignment');
    if (code) itemQuery = itemQuery.where('courseCode', '==', code);
    const itemsSnap = await itemQuery.get();
    const items = itemsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (items.length === 0) { reportMsg('No assignments found for that filter.', 'error'); return; }

    const marksSnap = await db.collection('gradeMarks').where('type', '==', 'assignment').get();
    const marksByItem = {};
    marksSnap.forEach(doc => {
      const d = doc.data();
      if (!marksByItem[d.itemId]) marksByItem[d.itemId] = [];
      marksByItem[d.itemId].push(d);
    });

    const summaryRows = items.map(it => {
      const marks = marksByItem[it.id] || [];
      const graded = marks.filter(m => m.marksObtained !== null && m.marksObtained !== undefined).length;
      return {
        'Title': it.title, 'Course': it.courseCode, 'Due Date': it.dueDate, 'Total Marks': it.totalMarks,
        'Assigned To': it.assignTo === 'all' || !it.assignTo ? 'Entire class' : `${it.assignTo.length} students`,
        'Graded': graded, 'Total Assigned': marks.length
      };
    });

    const detailRows = [];
    items.forEach(it => {
      (marksByItem[it.id] || []).forEach(m => {
        const student = students.find(s => s.id === m.rollNumber);
        detailRows.push({
          'Assignment': it.title, 'Course': it.courseCode, 'Roll Number': m.rollNumber,
          'Name': student ? student.name : '(unknown)', 'Marks Obtained': m.marksObtained ?? '',
          'Total Marks': m.totalMarks, 'Remarks': m.remarks || ''
        });
      });
    });

    downloadWorkbook({ Summary: summaryRows, Detail: detailRows }, `assignment-report${code ? '-' + code : ''}-${today()}.xlsx`);
    reportMsg('Downloaded.', 'info');
  } catch (e) {
    reportMsg('Could not generate report: ' + e.message, 'error');
  }
});

// ---------- Presentation Report ----------

document.getElementById('btn-presentation-report').addEventListener('click', async () => {
  const code = document.getElementById('pres-course').value;
  reportMsg('Generating presentation report…', 'info');
  try {
    let itemQuery = db.collection('gradeItems').where('type', '==', 'presentation');
    if (code) itemQuery = itemQuery.where('courseCode', '==', code);
    const itemsSnap = await itemQuery.get();
    const items = itemsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (items.length === 0) { reportMsg('No presentation rounds found for that filter.', 'error'); return; }

    const marksSnap = await db.collection('gradeMarks').where('type', '==', 'presentation').get();
    const marksByItem = {};
    marksSnap.forEach(doc => {
      const d = doc.data();
      if (!marksByItem[d.itemId]) marksByItem[d.itemId] = [];
      marksByItem[d.itemId].push(d);
    });

    const detailRows = [];
    items.forEach(it => {
      (marksByItem[it.id] || []).forEach(m => {
        const student = students.find(s => s.id === m.rollNumber);
        detailRows.push({
          'Round': it.title, 'Course': it.courseCode, 'Date': it.dueDate,
          'Roll Number': m.rollNumber, 'Name': student ? student.name : '(unknown)',
          'Topic': m.topic || '', 'Status': m.status || '', 'Marks Obtained': m.marksObtained ?? '',
          'Total Marks': m.totalMarks, 'Remarks': m.remarks || ''
        });
      });
    });

    downloadWorkbook({ Presentations: detailRows }, `presentation-report${code ? '-' + code : ''}-${today()}.xlsx`);
    reportMsg('Downloaded.', 'info');
  } catch (e) {
    reportMsg('Could not generate report: ' + e.message, 'error');
  }
});

function today() { return new Date().toISOString().slice(0, 10); }
