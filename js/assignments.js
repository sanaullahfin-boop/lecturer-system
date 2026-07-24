// ==========================================================================
// ASSIGNMENTS  (gradeItems type = 'assignment')
// ==========================================================================

const TYPE = 'assignment';

document.getElementById('logout-btn').addEventListener('click', logout);

let courses = [], students = [], items = [];

requireAdmin(async (user, adminData) => {
  document.getElementById('admin-name').textContent = (adminData && adminData.name) || user.email;
  document.getElementById('admin-initial').textContent = ((adminData && adminData.name) || user.email).charAt(0).toUpperCase();
  const data = await loadCoursesAndStudents();
  courses = data.courses; students = data.students;
  document.getElementById('filter-course').insertAdjacentHTML('beforeend', courseOptionsHtml(courses));
  document.getElementById('f-course').innerHTML = courseOptionsHtml(courses);
  await loadItems();
});

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
    document.getElementById('item-count').textContent = `${items.length} assignment${items.length === 1 ? '' : 's'}`;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">Could not load: ${escapeHtml(e.message)}</div></td></tr>`;
  }
}

function renderTable() {
  const tbody = document.getElementById('table-body');
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">No assignments yet.</div></td></tr>`;
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

// ---------- Add/Edit modal ----------

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
  document.getElementById('modal-title').textContent = 'New Assignment';
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
  document.getElementById('modal-title').textContent = 'Edit Assignment';
  document.getElementById('original-id').value = id;
  document.getElementById('f-title').value = it.title || '';
  document.getElementById('f-course').value = it.courseCode || '';
  document.getElementById('f-due').value = it.dueDate || '';
  document.getElementById('f-total').value = it.totalMarks || '';
  document.getElementById('f-desc').value = it.description || '';
  document.getElementById('f-instructions').value = it.instructions || '';
  document.getElementById('f-attachment').value = it.attachmentUrl || '';
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
    title: document.getElementById('f-title').value.trim(),
    courseCode: document.getElementById('f-course').value,
    dueDate: document.getElementById('f-due').value,
    totalMarks: Number(document.getElementById('f-total').value),
    description: document.getElementById('f-desc').value.trim(),
    instructions: document.getElementById('f-instructions').value.trim(),
    attachmentUrl: document.getElementById('f-attachment').value.trim(),
    assignTo
  };

  if (!payload.title || !payload.courseCode || !payload.dueDate || !payload.totalMarks) {
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
    btn.disabled = false; btn.textContent = 'Save Assignment';
  }
});

window.removeItem = async function (id) {
  if (!confirm('Delete this assignment and all recorded marks for it?')) return;
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
  document.getElementById('marks-title').textContent = `Marks — ${currentItem.title} (out of ${currentItem.totalMarks})`;
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

function clearMsg(id) { const el = document.getElementById(id); el.textContent = ''; el.className = 'form-msg'; }
function showMsg(id, text, type) { const el = document.getElementById(id); el.textContent = text; el.className = 'form-msg ' + type; }
