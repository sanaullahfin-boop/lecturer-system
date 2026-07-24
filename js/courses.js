// ==========================================================================
// COURSES — CRUD
// ==========================================================================

document.getElementById('logout-btn').addEventListener('click', logout);

let allCourses = [];

requireAdmin(async (user, adminData) => {
  document.getElementById('admin-name').textContent = (adminData && adminData.name) || user.email;
  document.getElementById('admin-initial').textContent = ((adminData && adminData.name) || user.email).charAt(0).toUpperCase();
  await loadCourses();
});

async function loadCourses() {
  const tbody = document.getElementById('table-body');
  try {
    const snap = await db.collection('courses').orderBy('title').get();
    allCourses = [];
    snap.forEach(doc => allCourses.push({ id: doc.id, ...doc.data() }));
    renderTable(allCourses);
    document.getElementById('course-count').textContent = `${allCourses.length} course${allCourses.length === 1 ? '' : 's'}`;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">Could not load courses: ${escapeHtml(e.message)}</div></td></tr>`;
  }
}

function renderTable(courses) {
  const tbody = document.getElementById('table-body');
  if (courses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">No courses yet. Click "+ Add Course" to create your first one.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = courses.map(c => `
    <tr>
      <td class="mono">${escapeHtml(c.id)}</td>
      <td>${escapeHtml(c.className || '—')}</td>
      <td>${escapeHtml(c.title || '')}</td>
      <td class="num">${c.creditHours ?? '—'}</td>
      <td class="num">${c.semester ?? '—'}</td>
      <td>${escapeHtml(c.section || '—')}</td>
      <td>${escapeHtml(c.teacher || '—')}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" onclick="openEdit('${escapeAttr(c.id)}')">Edit</button>
          <button class="icon-btn danger" onclick="confirmDelete('${escapeAttr(c.id)}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

document.getElementById('search-input').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  const filtered = allCourses.filter(c =>
    c.id.toLowerCase().includes(q) ||
    (c.title || '').toLowerCase().includes(q) ||
    (c.className || '').toLowerCase().includes(q) ||
    (c.teacher || '').toLowerCase().includes(q)
  );
  renderTable(filtered);
});

// ---------- Modal ----------

const backdrop = document.getElementById('modal-backdrop');
const form = document.getElementById('course-form');

document.getElementById('btn-add').addEventListener('click', () => openModal());
document.getElementById('btn-cancel').addEventListener('click', closeModal);
backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

function openModal() {
  document.getElementById('modal-title').textContent = 'Add Course';
  document.getElementById('original-code').value = '';
  form.reset();
  clearFormMsg();
  document.getElementById('f-code').disabled = false;
  backdrop.classList.add('open');
}

window.openEdit = function (code) {
  const c = allCourses.find(x => x.id === code);
  if (!c) return;
  document.getElementById('modal-title').textContent = 'Edit Course';
  document.getElementById('original-code').value = code;
  document.getElementById('f-code').value = code;
  document.getElementById('f-code').disabled = true; // course code is the doc ID — don't allow silent rename
  document.getElementById('f-class').value = c.className || '';
  document.getElementById('f-title').value = c.title || '';
  document.getElementById('f-credits').value = c.creditHours || '';
  document.getElementById('f-semester').value = c.semester || '';
  document.getElementById('f-section').value = c.section || '';
  document.getElementById('f-teacher').value = c.teacher || '';
  document.getElementById('f-books').value = (c.referenceBooks || []).join('; ');
  document.getElementById('f-outline').value = c.outline || '';
  clearFormMsg();
  backdrop.classList.add('open');
};

function closeModal() {
  backdrop.classList.remove('open');
}

function clearFormMsg() {
  const msg = document.getElementById('form-msg');
  msg.textContent = ''; msg.className = 'form-msg';
}
function showFormMsg(text, type) {
  const msg = document.getElementById('form-msg');
  msg.textContent = text; msg.className = 'form-msg ' + type;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFormMsg();

  const originalCode = document.getElementById('original-code').value;
  const code = document.getElementById('f-code').value.trim().toUpperCase();
  const className = document.getElementById('f-class').value.trim();
  const title = document.getElementById('f-title').value.trim();
  const creditHours = Number(document.getElementById('f-credits').value);
  const semester = Number(document.getElementById('f-semester').value);
  const section = document.getElementById('f-section').value.trim();
  const teacher = document.getElementById('f-teacher').value.trim();
  const referenceBooks = document.getElementById('f-books').value.split(';').map(s => s.trim()).filter(Boolean);
  const outline = document.getElementById('f-outline').value.trim();

  if (!code || !className || !title || !creditHours || !semester) {
    showFormMsg('Please fill in all required fields.', 'error');
    return;
  }

  const saveBtn = document.getElementById('btn-save');
  saveBtn.disabled = true; saveBtn.textContent = 'Saving…';

  try {
    if (!originalCode) {
      // Creating new — check for duplicate course code first
      const existing = await db.collection('courses').doc(code).get();
      if (existing.exists) {
        showFormMsg(`Course code "${code}" already exists.`, 'error');
        saveBtn.disabled = false; saveBtn.textContent = 'Save Course';
        return;
      }
    }
    await db.collection('courses').doc(originalCode || code).set({
      className, title, creditHours, semester, section, teacher, referenceBooks, outline
    });
    closeModal();
    await loadCourses();
  } catch (err) {
    showFormMsg('Could not save: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false; saveBtn.textContent = 'Save Course';
  }
});

window.confirmDelete = async function (code) {
  if (!confirm(`Delete course "${code}"? This cannot be undone.`)) return;
  try {
    await db.collection('courses').doc(code).delete();
    await loadCourses();
  } catch (e) {
    alert('Could not delete: ' + e.message);
  }
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'");
}

// ---------- Excel Export ----------

document.getElementById('btn-export').addEventListener('click', () => {
  const rows = allCourses.map(c => ({
    'Course Code': c.id,
    'Class / Program': c.className || '',
    'Subject / Title': c.title || '',
    'Credit Hours': c.creditHours || '',
    'Semester': c.semester || '',
    'Section': c.section || '',
    'Teacher': c.teacher || '',
    'Reference Books': (c.referenceBooks || []).join('; '),
    'Outline': c.outline || ''
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Courses');
  XLSX.writeFile(wb, `courses-export-${new Date().toISOString().slice(0,10)}.xlsx`);
});

// ---------- Excel Import ----------

document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const progress = document.getElementById('import-progress');
  progress.style.display = 'block';
  progress.className = 'form-msg info';
  progress.textContent = 'Reading file…';

  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
      progress.className = 'form-msg error';
      progress.textContent = 'That file has no rows to import.';
      return;
    }

    let created = 0, skipped = 0, failed = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const code = String(row['Course Code'] || row['Code'] || '').trim().toUpperCase();
      progress.textContent = `Importing row ${i + 1} of ${rows.length}… (${created} created, ${skipped} skipped)`;

      if (!code) { skipped++; continue; }

      try {
        const existing = await db.collection('courses').doc(code).get();
        if (existing.exists) { skipped++; continue; }

        const className = String(row['Class / Program'] || row['Class'] || row['Program'] || '').trim();
        const title = String(row['Subject / Title'] || row['Title'] || row['Subject'] || '').trim();
        const creditHours = Number(row['Credit Hours']) || 0;
        const semester = Number(row['Semester']) || 0;

        if (!className || !title || !creditHours || !semester) {
          failed++;
          errors.push(`${code}: missing a required field (Class/Program, Subject/Title, Credit Hours, or Semester)`);
          continue;
        }

        await db.collection('courses').doc(code).set({
          className, title, creditHours, semester,
          section: String(row['Section'] || ''),
          teacher: String(row['Teacher'] || ''),
          referenceBooks: String(row['Reference Books'] || '').split(';').map(s => s.trim()).filter(Boolean),
          outline: String(row['Outline'] || '')
        });
        created++;
      } catch (rowErr) {
        console.warn(`Row ${i + 1} (${code}) failed:`, rowErr.message);
        failed++;
        errors.push(`${code}: ${rowErr.message}`);
      }
    }

    let summary = `Import finished: ${created} created, ${skipped} skipped (already existed or missing course code).`;
    if (errors.length > 0) summary += ` ${failed} failed: ${errors.join('; ')}`;
    progress.className = errors.length > 0 ? 'form-msg error' : 'form-msg info';
    progress.textContent = summary;
    await loadCourses();
  } catch (err) {
    progress.className = 'form-msg error';
    progress.textContent = 'Could not read that file: ' + err.message;
  } finally {
    e.target.value = '';
  }
});
