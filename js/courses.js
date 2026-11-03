// ==========================================================================
// COURSES — add/edit/delete (with optional clean-up), term, Excel import/export
// ==========================================================================

let allCourses = [], students = [], plans = {}, settings;

requireAdmin(async (user, adminData) => {
  setUserChip((adminData && adminData.name) || user.email);
  settings = await loadSettings();
  await loadCourses();
});

async function loadCourses() {
  const tbody = document.getElementById('table-body');
  try {
    const data = await loadCoursesAndStudents();
    allCourses = data.courses; students = data.students;
    plans = await loadPlans().catch(() => ({}));
    const terms = [...new Set(allCourses.map(c => c.term).filter(Boolean))].sort();
    const ft = document.getElementById('filter-term'), keep = ft.value;
    ft.innerHTML = '<option value="">All terms</option>' + terms.map(t => `<option${t === keep ? ' selected' : ''}>${h(t)}</option>`).join('');
    if (!keep && settings.activeTerm && terms.includes(settings.activeTerm)) ft.value = settings.activeTerm;
    document.getElementById('term-list').innerHTML = terms.map(t => `<option value="${h(t)}">`).join('');
    applyFilters();
    document.getElementById('course-count').textContent = `${allCourses.length} course${allCourses.length === 1 ? '' : 's'}`;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state">Could not load courses: ${h(e.message)}</div></td></tr>`;
  }
}

function applyFilters() {
  const q = document.getElementById('search-input').value.toLowerCase().trim();
  const term = document.getElementById('filter-term').value;
  renderTable(allCourses.filter(c =>
    (!term || (c.term || '') === term) &&
    (!q || [c.id, c.title, c.className, c.teacher].some(v => (v || '').toLowerCase().includes(q)))));
}
document.getElementById('search-input').addEventListener('input', applyFilters);
document.getElementById('filter-term').addEventListener('change', applyFilters);

function renderTable(list) {
  const tbody = document.getElementById('table-body');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state">${allCourses.length ? 'No courses match.' : 'No courses yet. Click "+ Add Course" to create your first one.'}</div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(c => {
    const enrolled = rosterForCourse(students, c.id).length;
    const p = plans[c.id];
    const ps = p ? planStats(p) : null;
    return `<tr>
      <td class="mono">${h(c.id)}</td>
      <td>${h(c.title || '')}</td>
      <td>${h(c.className || '—')}</td>
      <td>${c.term ? `<span class="chip${c.term === settings.activeTerm ? ' ok' : ''}">${h(c.term)}</span>` : '<span class="muted">—</span>'}</td>
      <td class="c num">${c.creditHours ?? '—'}</td>
      <td class="c num">${c.semester ?? '—'}</td>
      <td>${h(c.section || '—')}</td>
      <td class="c num">${enrolled}</td>
      <td><a href="course-plan.html?course=${encodeURIComponent(c.id)}">${ps ? `${ps.pct}% covered` : 'Create plan'}</a></td>
      <td><div class="row-actions">
        <button class="icon-btn" onclick="openEdit('${jsArg(c.id)}')">Edit</button>
        <a class="icon-btn" href="marks.html?course=${encodeURIComponent(c.id)}">Gradebook</a>
        <button class="icon-btn danger" onclick="confirmDelete('${jsArg(c.id)}')">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

/* ---------------- Add / edit ---------------- */

const form = document.getElementById('course-form');
wireModal('modal-backdrop', ['btn-cancel']);

document.getElementById('btn-add').addEventListener('click', () => {
  document.getElementById('modal-title').textContent = 'Add Course';
  document.getElementById('original-code').value = '';
  form.reset();
  document.getElementById('f-term').value = settings.activeTerm || '';
  document.getElementById('f-teacher').value = settings.institution.teacher || '';
  document.getElementById('f-code').disabled = false;
  setMsg('form-msg', '');
  openModal('modal-backdrop');
});

window.openEdit = function (code) {
  const c = allCourses.find(x => x.id === code);
  if (!c) return;
  document.getElementById('modal-title').textContent = 'Edit Course';
  document.getElementById('original-code').value = code;
  document.getElementById('f-code').value = code;
  document.getElementById('f-code').disabled = true; // course code is the document ID
  document.getElementById('f-term').value = c.term || '';
  document.getElementById('f-class').value = c.className || '';
  document.getElementById('f-title').value = c.title || '';
  document.getElementById('f-credits').value = c.creditHours || '';
  document.getElementById('f-semester').value = c.semester || '';
  document.getElementById('f-section').value = c.section || '';
  document.getElementById('f-teacher').value = c.teacher || '';
  document.getElementById('f-books').value = (c.referenceBooks || []).join('; ');
  document.getElementById('f-outline').value = c.outline || '';
  setMsg('form-msg', '');
  openModal('modal-backdrop');
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const originalCode = document.getElementById('original-code').value;
  const code = document.getElementById('f-code').value.trim().toUpperCase();
  const data = {
    term: document.getElementById('f-term').value.trim(),
    className: document.getElementById('f-class').value.trim(),
    title: document.getElementById('f-title').value.trim(),
    creditHours: Number(document.getElementById('f-credits').value),
    semester: Number(document.getElementById('f-semester').value),
    section: document.getElementById('f-section').value.trim(),
    teacher: document.getElementById('f-teacher').value.trim(),
    referenceBooks: document.getElementById('f-books').value.split(';').map(s => s.trim()).filter(Boolean),
    outline: document.getElementById('f-outline').value.trim()
  };
  if (!code || !data.className || !data.title || !data.creditHours || !data.semester) {
    setMsg('form-msg', 'Please fill in all required fields.', 'error'); return;
  }
  const btn = document.getElementById('btn-save');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    if (!originalCode) {
      const existing = await db.collection('courses').doc(code).get();
      if (existing.exists) { setMsg('form-msg', `Course code "${code}" already exists.`, 'error'); return; }
      await commitSmart(db.collection('courses').doc(code).set(data));
    } else {
      await commitSmart(db.collection('courses').doc(originalCode).update(data)); // keeps gradeWeights
    }
    closeModal('modal-backdrop');
    toast('Course saved.', 'ok');
    await loadCourses();
  } catch (err) {
    setMsg('form-msg', 'Could not save: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Course';
  }
});

/* ---------------- Delete (with clean-up) ---------------- */

let deleting = null;
wireModal('delete-modal', ['delete-cancel']);

window.confirmDelete = function (code) {
  deleting = code;
  const n = rosterForCourse(students, code, { includeInactive: true }).length;
  document.getElementById('delete-text').innerHTML = `Delete course <b>${h(code)}</b>? ${n} student(s) are enrolled in it.`;
  document.getElementById('delete-cascade').checked = true;
  setMsg('delete-msg', '');
  openModal('delete-modal');
};

document.getElementById('delete-confirm').addEventListener('click', async () => {
  const code = deleting;
  if (!code) return;
  const cascade = document.getElementById('delete-cascade').checked;
  const btn = document.getElementById('delete-confirm');
  btn.disabled = true; btn.textContent = 'Deleting…';
  try {
    const ops = [b => b.delete(db.collection('courses').doc(code))];
    // remove the code from students' enrolment
    students.filter(s => (s.course || []).includes(code)).forEach(s => {
      ops.push(b => b.update(db.collection('students').doc(s.id), { course: firebase.firestore.FieldValue.arrayRemove(code) }));
    });
    if (cascade) {
      const cols = ['gradeItems', 'gradeMarks', ATT_COL, 'gradebookAdjustments', 'courseContent', 'quizAttempts', 'submissions', 'checkins', 'checkinResponses'];
      for (const col of cols) {
        const snap = await db.collection(col).where('courseCode', '==', code).get();
        snap.forEach(d => {
          ops.push(b => b.delete(d.ref));
          if (col === 'gradeItems' && d.data().online) ops.push(b => b.delete(db.collection('quizPapers').doc(d.id)), b => b.delete(db.collection('quizKeys').doc(d.id)));
          const x = d.data();
          if (col === 'courseContent' && x.storage === 'app' && x.fileId) for (let i = 0; i < (x.chunkCount || 0); i++) ops.push(b => b.delete(db.collection('fileChunks').doc(`${x.fileId}__${i}`)));
        });
      }
      ops.push(b => b.delete(db.collection('coursePlans').doc(code)));
    }
    await writeInBatches(ops, (d, t) => { setMsg('delete-msg', `Deleting… ${d}/${t}`, 'info'); });
    closeModal('delete-modal');
    toast(`Deleted ${code}${cascade ? ' and its records' : ''}.`, 'ok');
    logChange('Course deleted', `${code}${cascade ? ' (with its records)' : ''}`);
    await loadCourses();
  } catch (e) {
    setMsg('delete-msg', 'Could not delete: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Delete';
  }
});

/* ---------------- Excel ---------------- */

document.getElementById('btn-export').addEventListener('click', () => {
  downloadWorkbook({
    Courses: allCourses.map(c => ({
      'Course Code': c.id, 'Term': c.term || '', 'Class / Program': c.className || '', 'Subject / Title': c.title || '',
      'Credit Hours': c.creditHours || '', 'Semester': c.semester || '', 'Section': c.section || '', 'Teacher': c.teacher || '',
      'Reference Books': (c.referenceBooks || []).join('; '), 'Outline': c.outline || ''
    }))
  }, `courses-export-${localToday()}.xlsx`);
});

document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file').click());

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const progress = document.getElementById('import-progress');
  progress.style.display = 'block'; progress.className = 'form-msg info'; progress.textContent = 'Reading file…';
  try {
    const rows = await readSheet(file, { sheet: 'Courses' });
    if (!rows.length) { progress.className = 'form-msg error'; progress.textContent = 'That file has no rows to import.'; return; }
    let created = 0, skipped = 0;
    const errors = [];
    const existing = new Set(allCourses.map(c => c.id));
    const ops = [];
    rows.forEach(row => {
      const code = String(pickCol(row, ['Course Code', 'Code'])).trim().toUpperCase();
      if (!code || existing.has(code)) { skipped++; return; }
      const data = {
        term: String(pickCol(row, ['Term', 'Session Term']) || settings.activeTerm || '').trim(),
        className: String(pickCol(row, ['Class / Program', 'Class', 'Program'])).trim(),
        title: String(pickCol(row, ['Subject / Title', 'Title', 'Subject'])).trim(),
        creditHours: Number(pickCol(row, ['Credit Hours', 'Credits'])) || 0,
        semester: Number(pickCol(row, ['Semester'])) || 0,
        section: String(pickCol(row, ['Section'])),
        teacher: String(pickCol(row, ['Teacher']) || settings.institution.teacher || ''),
        referenceBooks: String(pickCol(row, ['Reference Books', 'Books'])).split(';').map(s => s.trim()).filter(Boolean),
        outline: String(pickCol(row, ['Outline']))
      };
      if (!data.className || !data.title || !data.creditHours || !data.semester) {
        errors.push(`${code}: missing Class/Program, Title, Credit Hours or Semester`); return;
      }
      existing.add(code);
      ops.push(b => b.set(db.collection('courses').doc(code), data));
      created++;
    });
    await writeInBatches(ops);
    progress.className = errors.length ? 'form-msg error' : 'form-msg info';
    progress.textContent = `Import finished: ${created} created, ${skipped} skipped (already existed or no code).` + (errors.length ? ` ${errors.length} failed: ${errors.join('; ')}` : '');
    await loadCourses();
  } catch (err) {
    progress.className = 'form-msg error'; progress.textContent = 'Could not read that file: ' + err.message;
  }
});
