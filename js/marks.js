// ==========================================================================
// MARKS & GRADEBOOK
// ==========================================================================

const TYPE = 'exam';

document.getElementById('logout-btn').addEventListener('click', logout);

let courses = [], students = [], items = [];

requireAdmin(async (user, adminData) => {
  document.getElementById('admin-name').textContent = (adminData && adminData.name) || user.email;
  document.getElementById('admin-initial').textContent = ((adminData && adminData.name) || user.email).charAt(0).toUpperCase();
  const data = await loadCoursesAndStudents();
  courses = data.courses; students = data.students;
  document.getElementById('filter-course').insertAdjacentHTML('beforeend', courseOptionsHtml(courses));
  document.getElementById('f-course').innerHTML = courseOptionsHtml(courses);
  document.getElementById('gb-course').insertAdjacentHTML('beforeend', courseOptionsHtml(courses));
  await loadItems();
});

// ---------- Tabs ----------

document.getElementById('tab-exams').addEventListener('click', () => switchTab('exams'));
document.getElementById('tab-gradebook').addEventListener('click', () => switchTab('gradebook'));

function switchTab(which) {
  document.getElementById('tab-exams').classList.toggle('active', which === 'exams');
  document.getElementById('tab-gradebook').classList.toggle('active', which === 'gradebook');
  document.getElementById('panel-exams').style.display = which === 'exams' ? 'block' : 'none';
  document.getElementById('panel-gradebook').style.display = which === 'gradebook' ? 'block' : 'none';
}

// ---------- Internal Exams: CRUD ----------

document.getElementById('filter-course').addEventListener('change', loadItems);

async function loadItems() {
  const tbody = document.getElementById('table-body');
  const courseFilter = document.getElementById('filter-course').value;
  try {
    let query = db.collection('gradeItems').where('type', '==', TYPE);
    if (courseFilter) query = query.where('courseCode', '==', courseFilter);
    const snap = await query.get();
    items = [];
    snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
    items.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    renderTable();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">Could not load: ${escapeHtml(e.message)}</div></td></tr>`;
  }
}

function renderTable() {
  const tbody = document.getElementById('table-body');
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">No internal exams recorded yet.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(it => `
    <tr>
      <td>${escapeHtml(it.title)}</td>
      <td class="mono">${escapeHtml(it.courseCode)}</td>
      <td class="mono">${escapeHtml(it.dueDate || '—')}</td>
      <td class="num">${it.totalMarks}</td>
      <td>${it.assignTo === 'all' || !it.assignTo ? 'Entire class' : `${it.assignTo.length} student(s)`}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" onclick="openMarks('${escapeAttr(it.id)}')">Marks</button>
          <button class="icon-btn" onclick="openEdit('${escapeAttr(it.id)}')">Edit</button>
          <button class="icon-btn danger" onclick="removeItem('${escapeAttr(it.id)}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

const backdrop = document.getElementById('modal-backdrop');
const form = document.getElementById('item-form');

document.getElementById('btn-add').addEventListener('click', () => openModal());
document.getElementById('btn-cancel').addEventListener('click', () => backdrop.classList.remove('open'));
backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.remove('open'); });

document.querySelectorAll('input[name="assign-mode"]').forEach(r => {
  r.addEventListener('change', () => {
    document.getElementById('assignee-picker').style.display =
      document.querySelector('input[name="assign-mode"]:checked').value === 'selected' ? 'block' : 'none';
    renderAssigneePicker();
  });
});
document.getElementById('f-course').addEventListener('change', renderAssigneePicker);

function renderAssigneePicker(preselected) {
  const code = document.getElementById('f-course').value;
  const roster = rosterForCourse(students, code);
  const picker = document.getElementById('assignee-picker');
  const pre = new Set(preselected || []);
  if (roster.length === 0) {
    picker.innerHTML = `<div class="empty-state" style="padding:8px;">No students enrolled in this course yet.</div>`;
    return;
  }
  picker.innerHTML = roster.map(s => `
    <label><input type="checkbox" value="${escapeAttr(s.id)}" ${pre.has(s.id) ? 'checked' : ''}> ${escapeHtml(s.id)} — ${escapeHtml(s.name)}</label>
  `).join('');
}

function openModal() {
  document.getElementById('modal-title').textContent = 'New Internal Exam';
  document.getElementById('original-id').value = '';
  form.reset();
  document.querySelector('input[name="assign-mode"][value="all"]').checked = true;
  document.getElementById('assignee-picker').style.display = 'none';
  clearMsg('form-msg');
  backdrop.classList.add('open');
}

window.openEdit = function (id) {
  const it = items.find(x => x.id === id);
  if (!it) return;
  document.getElementById('modal-title').textContent = 'Edit Internal Exam';
  document.getElementById('original-id').value = id;
  document.getElementById('f-title').value = it.title || 'Midterm';
  document.getElementById('f-course').value = it.courseCode || '';
  document.getElementById('f-due').value = it.dueDate || '';
  document.getElementById('f-total').value = it.totalMarks || '';
  const mode = (it.assignTo === 'all' || !it.assignTo) ? 'all' : 'selected';
  document.querySelector(`input[name="assign-mode"][value="${mode}"]`).checked = true;
  document.getElementById('assignee-picker').style.display = mode === 'selected' ? 'block' : 'none';
  renderAssigneePicker(mode === 'selected' ? it.assignTo : []);
  clearMsg('form-msg');
  backdrop.classList.add('open');
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsg('form-msg');
  const id = document.getElementById('original-id').value;
  const mode = document.querySelector('input[name="assign-mode"]:checked').value;
  const assignTo = mode === 'all' ? 'all' :
    Array.from(document.querySelectorAll('#assignee-picker input:checked')).map(c => c.value);

  const payload = {
    type: TYPE,
    title: document.getElementById('f-title').value,
    courseCode: document.getElementById('f-course').value,
    dueDate: document.getElementById('f-due').value,
    totalMarks: Number(document.getElementById('f-total').value),
    assignTo
  };

  if (!payload.courseCode || !payload.dueDate || !payload.totalMarks) {
    showMsg('form-msg', 'Please fill in all required fields.', 'error');
    return;
  }

  const btn = document.getElementById('btn-save');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    if (id) await db.collection('gradeItems').doc(id).update(payload);
    else await db.collection('gradeItems').add({ ...payload, createdAt: new Date().toISOString() });
    backdrop.classList.remove('open');
    await loadItems();
  } catch (err) {
    showMsg('form-msg', 'Could not save: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
});

window.removeItem = async function (id) {
  if (!confirm('Delete this exam and all recorded marks for it?')) return;
  try {
    await db.collection('gradeItems').doc(id).delete();
    const marksSnap = await db.collection('gradeMarks').where('itemId', '==', id).get();
    const batch = db.batch();
    marksSnap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    await loadItems();
  } catch (e) {
    alert('Could not delete: ' + e.message);
  }
};

// ---------- Marks grid ----------

const marksBackdrop = document.getElementById('marks-backdrop');
let currentItem = null;
let currentAssignees = [];

window.openMarks = async function (id) {
  currentItem = items.find(x => x.id === id);
  if (!currentItem) return;
  document.getElementById('marks-title').textContent = `${currentItem.title} — Marks (out of ${currentItem.totalMarks})`;
  const roster = rosterForCourse(students, currentItem.courseCode);
  const assignees = resolveAssignees(currentItem, roster);
  currentAssignees = assignees;
  const tbody = document.getElementById('marks-body');
  tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><span class="loading-dot"></span> Loading…</div></td></tr>`;
  marksBackdrop.classList.add('open');

  const existingSnap = await db.collection('gradeMarks').where('itemId', '==', id).get();
  const existing = {};
  existingSnap.forEach(doc => { existing[doc.data().rollNumber] = doc.data(); });

  if (assignees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">No students assigned.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = assignees.map(s => {
    const ex = existing[s.id] || {};
    return `
      <tr>
        <td class="mono">${escapeHtml(s.id)}</td>
        <td>${escapeHtml(s.name)}</td>
        <td><input type="number" class="marks-input" data-roll="${escapeAttr(s.id)}" min="0" max="${currentItem.totalMarks}" value="${ex.marksObtained ?? ''}"></td>
        <td><input type="text" class="remarks-input" data-roll-remarks="${escapeAttr(s.id)}" value="${escapeHtml(ex.remarks || '')}"></td>
      </tr>
    `;
  }).join('');
};

document.getElementById('btn-marks-cancel').addEventListener('click', () => marksBackdrop.classList.remove('open'));
marksBackdrop.addEventListener('click', (e) => { if (e.target === marksBackdrop) marksBackdrop.classList.remove('open'); });

document.getElementById('btn-marks-template').addEventListener('click', () => {
  if (!currentItem || currentAssignees.length === 0) {
    alert('Open a grade item with at least one assigned student first.');
    return;
  }
  downloadMarksTemplate(currentItem, currentAssignees);
});

document.getElementById('btn-marks-import').addEventListener('click', () => {
  document.getElementById('marks-import-file').click();
});

document.getElementById('marks-import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !currentItem) { e.target.value = ''; return; }
  clearMsg('marks-msg');
  try {
    const written = await importMarksFile(file, currentItem);
    showMsg('marks-msg', `Imported ${written} mark(s). Reopening to show the update…`, 'info');
    await window.openMarks(currentItem.id);
  } catch (err) {
    showMsg('marks-msg', 'Could not import: ' + err.message, 'error');
  } finally {
    e.target.value = '';
  }
});

document.getElementById('btn-marks-save').addEventListener('click', async () => {
  if (!currentItem) return;
  const btn = document.getElementById('btn-marks-save');
  btn.disabled = true; btn.textContent = 'Saving…';
  clearMsg('marks-msg');
  try {
    const batch = db.batch();
    document.querySelectorAll('#marks-body input.marks-input').forEach(input => {
      const roll = input.dataset.roll;
      const remarksInput = document.querySelector(`[data-roll-remarks="${CSS.escape(roll)}"]`);
      const val = input.value === '' ? null : Number(input.value);
      const docId = `${currentItem.id}__${roll}`;
      const ref = db.collection('gradeMarks').doc(docId);
      batch.set(ref, {
        itemId: currentItem.id, type: TYPE, courseCode: currentItem.courseCode,
        rollNumber: roll, marksObtained: val, totalMarks: currentItem.totalMarks,
        remarks: remarksInput ? remarksInput.value.trim() : ''
      });
    });
    await batch.commit();
    showMsg('marks-msg', 'Marks saved.', 'info');
  } catch (e) {
    showMsg('marks-msg', 'Could not save: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Marks';
  }
});

// ==========================================================================
// GRADEBOOK
// ==========================================================================

let lastGradebookRows = [];
let lastGradebookCourse = '';

document.getElementById('gb-course').addEventListener('change', loadWeightsForCourse);

async function loadWeightsForCourse() {
  const code = document.getElementById('gb-course').value;
  if (!code) return;
  const course = courses.find(c => c.id === code);
  const w = (course && course.gradeWeights) || { attendance: 10, quiz: 15, assignment: 20, presentation: 10, task: 5, exam: 40 };
  document.getElementById('w-attendance').value = w.attendance;
  document.getElementById('w-quiz').value = w.quiz;
  document.getElementById('w-assignment').value = w.assignment;
  document.getElementById('w-presentation').value = w.presentation;
  document.getElementById('w-task').value = w.task;
  document.getElementById('w-exam').value = w.exam;
}

function readWeights() {
  return {
    attendance: Number(document.getElementById('w-attendance').value) || 0,
    quiz: Number(document.getElementById('w-quiz').value) || 0,
    assignment: Number(document.getElementById('w-assignment').value) || 0,
    presentation: Number(document.getElementById('w-presentation').value) || 0,
    task: Number(document.getElementById('w-task').value) || 0,
    exam: Number(document.getElementById('w-exam').value) || 0
  };
}

document.getElementById('btn-save-weights').addEventListener('click', async () => {
  const code = document.getElementById('gb-course').value;
  const msg = document.getElementById('weights-msg');
  if (!code) { msg.className = 'form-msg error'; msg.textContent = 'Pick a course first.'; return; }
  const weights = readWeights();
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (sum !== 100) {
    msg.className = 'form-msg error';
    msg.textContent = `Weights sum to ${sum}, not 100. Adjust before saving.`;
    return;
  }
  try {
    await db.collection('courses').doc(code).update({ gradeWeights: weights });
    const course = courses.find(c => c.id === code);
    if (course) course.gradeWeights = weights;
    msg.className = 'form-msg info';
    msg.textContent = 'Weights saved for this course.';
  } catch (e) {
    msg.className = 'form-msg error';
    msg.textContent = 'Could not save: ' + e.message;
  }
});

document.getElementById('btn-run-gb').addEventListener('click', runGradebook);

async function runGradebook() {
  const code = document.getElementById('gb-course').value;
  const tbody = document.getElementById('gb-body');
  if (!code) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state">Select a course first.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state"><span class="loading-dot"></span> Crunching the gradebook…</div></td></tr>`;
  lastGradebookCourse = code;

  const weights = readWeights();
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

  lastGradebookRows = roster.map(s => {
    const att = attendancePct[s.id] ?? null;
    const quiz = quizPct[s.id] ?? null;
    const assign = assignPct[s.id] ?? null;
    const pres = presPct[s.id] ?? null;
    const task = taskPct[s.id] ?? null;
    const exam = examPct[s.id] ?? null;
    const adj = adjustments[s.id] || { bonusMarks: 0, negativeMarks: 0 };

    const weighted =
      ((att ?? 0) * weights.attendance +
       (quiz ?? 0) * weights.quiz +
       (assign ?? 0) * weights.assignment +
       (pres ?? 0) * weights.presentation +
       (task ?? 0) * weights.task +
       (exam ?? 0) * weights.exam) / 100;

    const total = Math.max(0, Math.min(100, Math.round((weighted + (adj.bonusMarks || 0) - (adj.negativeMarks || 0)) * 10) / 10));

    return {
      roll: s.id, name: s.name, att, quiz, assign, pres, task, exam,
      bonus: adj.bonusMarks || 0, negative: adj.negativeMarks || 0,
      total, grade: letterGrade(total)
    };
  }).sort((a, b) => b.total - a.total);

  renderGradebook();
}

function renderGradebook() {
  const tbody = document.getElementById('gb-body');
  if (lastGradebookRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state">No students enrolled in this course yet.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = lastGradebookRows.map(r => `
    <tr>
      <td class="mono">${escapeHtml(r.roll)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td class="num">${r.att ?? '—'}</td>
      <td class="num">${r.quiz ?? '—'}</td>
      <td class="num">${r.assign ?? '—'}</td>
      <td class="num">${r.pres ?? '—'}</td>
      <td class="num">${r.task ?? '—'}</td>
      <td class="num">${r.exam ?? '—'}</td>
      <td><input type="number" class="adj-input" data-roll="${escapeAttr(r.roll)}" data-field="bonus" value="${r.bonus}"></td>
      <td><input type="number" class="adj-input" data-roll="${escapeAttr(r.roll)}" data-field="negative" value="${r.negative}"></td>
      <td class="num" style="font-weight:600;">${r.total}%</td>
      <td><span class="grade-pill">${r.grade}</span></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.adj-input').forEach(input => {
    input.addEventListener('change', () => saveAdjustment(input.dataset.roll));
  });
}

async function saveAdjustment(roll) {
  const bonusInput = document.querySelector(`.adj-input[data-roll="${CSS.escape(roll)}"][data-field="bonus"]`);
  const negInput = document.querySelector(`.adj-input[data-roll="${CSS.escape(roll)}"][data-field="negative"]`);
  const bonusMarks = Number(bonusInput.value) || 0;
  const negativeMarks = Number(negInput.value) || 0;
  const docId = `${lastGradebookCourse}__${roll}`.replace(/[^A-Za-z0-9_-]/g, '_');
  try {
    await db.collection('gradebookAdjustments').doc(docId).set({ courseCode: lastGradebookCourse, rollNumber: roll, bonusMarks, negativeMarks });
    await runGradebook(); // recompute totals with the new adjustment
  } catch (e) {
    alert('Could not save adjustment: ' + e.message);
  }
}

document.getElementById('btn-export-gb').addEventListener('click', () => {
  if (lastGradebookRows.length === 0) {
    alert('Run the gradebook first.');
    return;
  }
  const rows = lastGradebookRows.map(r => ({
    'Roll Number': r.roll, 'Name': r.name,
    'Attendance %': r.att ?? '', 'Quiz %': r.quiz ?? '', 'Assignment %': r.assign ?? '',
    'Presentation %': r.pres ?? '', 'Task %': r.task ?? '', 'Exam %': r.exam ?? '',
    'Bonus': r.bonus, 'Negative': r.negative, 'Total %': r.total, 'Grade': r.grade
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Gradebook');
  XLSX.writeFile(wb, `gradebook-${lastGradebookCourse}-${new Date().toISOString().slice(0,10)}.xlsx`);
});

function clearMsg(id) { const el = document.getElementById(id); el.textContent = ''; el.className = 'form-msg'; }
function showMsg(id, text, type) { const el = document.getElementById(id); el.textContent = text; el.className = 'form-msg ' + type; }
