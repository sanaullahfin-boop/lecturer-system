// ==========================================================================
// ATTENDANCE — mark per course/date, and % report with warnings
// ==========================================================================

document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('today-label').textContent = new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});
document.getElementById('mark-date').value = new Date().toISOString().slice(0, 10);

const WARNING_THRESHOLD = 75; // percent

let allCourses = [];
let allStudents = [];
let markState = {}; // rollNumber -> status, for the currently loaded roster

requireAdmin(async (user, adminData) => {
  document.getElementById('admin-name').textContent = (adminData && adminData.name) || user.email;
  document.getElementById('admin-initial').textContent = ((adminData && adminData.name) || user.email).charAt(0).toUpperCase();
  await loadCoursesAndStudents();
});

async function loadCoursesAndStudents() {
  const [coursesSnap, studentsSnap] = await Promise.all([
    db.collection('courses').orderBy('title').get(),
    db.collection('students').orderBy('name').get()
  ]);
  allCourses = [];
  coursesSnap.forEach(doc => allCourses.push({ id: doc.id, ...doc.data() }));
  allStudents = [];
  studentsSnap.forEach(doc => allStudents.push({ id: doc.id, ...doc.data() }));

  const courseOptions = allCourses.map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.id)} — ${escapeHtml(c.title)}</option>`).join('');
  document.getElementById('mark-course').insertAdjacentHTML('beforeend', courseOptions);
  document.getElementById('report-course').insertAdjacentHTML('beforeend', courseOptions);

  if (allCourses.length === 0) {
    document.getElementById('mark-body').innerHTML = `<tr><td colspan="3"><div class="empty-state">No courses yet — add one on the Courses page first.</div></td></tr>`;
  }
}

// ---------- Tabs ----------

document.getElementById('tab-mark').addEventListener('click', () => switchTab('mark'));
document.getElementById('tab-report').addEventListener('click', () => switchTab('report'));

function switchTab(which) {
  document.getElementById('tab-mark').classList.toggle('active', which === 'mark');
  document.getElementById('tab-report').classList.toggle('active', which === 'report');
  document.getElementById('panel-mark').style.display = which === 'mark' ? 'block' : 'none';
  document.getElementById('panel-report').style.display = which === 'report' ? 'block' : 'none';
}

// ---------- Mark Attendance ----------

document.getElementById('mark-course').addEventListener('change', loadRoster);
document.getElementById('mark-date').addEventListener('change', loadRoster);

async function loadRoster() {
  const code = document.getElementById('mark-course').value;
  const date = document.getElementById('mark-date').value;
  const tbody = document.getElementById('mark-body');
  const saveBtn = document.getElementById('btn-save-attendance');

  if (!code) {
    tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state">Select a course to load its roster.</div></td></tr>`;
    saveBtn.disabled = true;
    return;
  }

  const roster = allStudents.filter(s => (s.course || []).includes(code));
  if (roster.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state">No students are enrolled in this course yet. Add courses to a student's profile on the Students page.</div></td></tr>`;
    saveBtn.disabled = true;
    return;
  }

  tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state"><span class="loading-dot"></span> Loading existing marks…</div></td></tr>`;

  // Pre-fill with any existing marks for this course + date
  markState = {};
  try {
    const existingSnap = await db.collection('attendance')
      .where('courseCode', '==', code)
      .where('date', '==', date)
      .get();
    existingSnap.forEach(doc => { markState[doc.data().rollNumber] = doc.data().status; });
  } catch (e) {
    console.warn('Could not pre-load existing marks:', e.message);
  }

  tbody.innerHTML = roster.map(s => renderRosterRow(s)).join('');
  saveBtn.disabled = false;
}

function renderRosterRow(s) {
  const statuses = ['present', 'absent', 'leave', 'late', 'excused'];
  const current = markState[s.id] || 'present';
  markState[s.id] = current;
  const buttons = statuses.map(st => `
    <button type="button" class="status-btn ${st} ${st === current ? 'selected' : ''}"
      onclick="setMark('${escapeAttr(s.id)}', '${st}', this)">${st.charAt(0).toUpperCase() + st.slice(1)}</button>
  `).join('');
  return `
    <tr>
      <td class="mono">${escapeHtml(s.id)}</td>
      <td>${escapeHtml(s.name || '')}</td>
      <td><div class="status-btn-group">${buttons}</div></td>
    </tr>
  `;
}

window.setMark = function (roll, status, btnEl) {
  markState[roll] = status;
  const row = btnEl.closest('tr');
  row.querySelectorAll('.status-btn').forEach(b => b.classList.remove('selected'));
  btnEl.classList.add('selected');
};

document.getElementById('btn-save-attendance').addEventListener('click', async () => {
  const code = document.getElementById('mark-course').value;
  const date = document.getElementById('mark-date').value;
  const msg = document.getElementById('mark-msg');
  const btn = document.getElementById('btn-save-attendance');

  if (!code || !date) return;

  btn.disabled = true; btn.textContent = 'Saving…';
  msg.className = 'form-msg';

  try {
    const batch = db.batch();
    Object.entries(markState).forEach(([roll, status]) => {
      const docId = `${code}__${date}__${roll}`.replace(/[^A-Za-z0-9_-]/g, '_');
      const ref = db.collection('attendance').doc(docId);
      batch.set(ref, { rollNumber: roll, courseCode: code, date, status, markedBy: auth.currentUser.uid });
    });
    await batch.commit();
    msg.className = 'form-msg info';
    msg.textContent = `Saved attendance for ${Object.keys(markState).length} student(s) on ${date}.`;
  } catch (e) {
    msg.className = 'form-msg error';
    msg.textContent = 'Could not save: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Save Attendance';
  }
});

// ---------- Report ----------

document.getElementById('btn-run-report').addEventListener('click', runReport);

async function runReport() {
  const code = document.getElementById('report-course').value;
  const tbody = document.getElementById('report-body');
  tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><span class="loading-dot"></span> Crunching attendance…</div></td></tr>`;

  try {
    let query = db.collection('attendance');
    if (code) query = query.where('courseCode', '==', code);
    const snap = await query.get();

    const tally = {}; // rollNumber -> {present, total}
    snap.forEach(doc => {
      const d = doc.data();
      if (!tally[d.rollNumber]) tally[d.rollNumber] = { present: 0, total: 0 };
      tally[d.rollNumber].total++;
      if (d.status === 'present' || d.status === 'late') tally[d.rollNumber].present++;
    });

    const rows = Object.entries(tally).map(([roll, t]) => {
      const student = allStudents.find(s => s.id === roll);
      const pct = Math.round((t.present / t.total) * 100);
      return { roll, name: student ? student.name : '(unknown student)', pct };
    }).sort((a, b) => a.pct - b.pct);

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">No attendance has been marked yet${code ? ' for this course' : ''}.</div></td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td class="mono">${escapeHtml(r.roll)}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>
          <span class="pct-bar-track"><span class="pct-bar-fill ${r.pct < WARNING_THRESHOLD ? 'low' : ''}" style="width:${r.pct}%;"></span></span>
          <span class="mono">${r.pct}%</span>
        </td>
        <td>${r.pct < WARNING_THRESHOLD ? '<span class="badge danger">Warning</span>' : '<span class="badge ok">OK</span>'}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">Could not run report: ${escapeHtml(e.message)}</div></td></tr>`;
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'");
}

// ---------- Bulk Attendance (monthly template) ----------

const ATT_CODE_TO_STATUS = { P: 'present', A: 'absent', L: 'leave', LT: 'late', E: 'excused' };

document.getElementById('btn-download-template').addEventListener('click', async () => {
  const code = document.getElementById('mark-course').value;
  const month = document.getElementById('bulk-month').value; // "YYYY-MM"
  const msg = document.getElementById('bulk-msg');
  msg.textContent = ''; msg.className = 'form-msg';

  if (!code || !month) {
    msg.textContent = 'Pick a course and a month first.';
    msg.className = 'form-msg error';
    return;
  }

  const roster = allStudents.filter(s => (s.course || []).includes(code));
  if (roster.length === 0) {
    msg.textContent = 'No students are enrolled in this course yet.';
    msg.className = 'form-msg error';
    return;
  }

  const [year, monthNum] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const dateColumns = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dateColumns.push(`${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  const header = ['Roll Number', 'Name', ...dateColumns];
  const rows = roster.map(s => [s.id, s.name || '', ...dateColumns.map(() => '')]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

  const legendWs = XLSX.utils.aoa_to_sheet([
    ['Code', 'Meaning'],
    ['P', 'Present'], ['A', 'Absent'], ['L', 'Leave'], ['Lt', 'Late'], ['E', 'Excused'],
    ['(blank)', 'No class that day / not marked']
  ]);
  XLSX.utils.book_append_sheet(wb, legendWs, 'Legend');

  XLSX.writeFile(wb, `attendance-template-${code}-${month}.xlsx`);
  msg.textContent = 'Template downloaded.';
  msg.className = 'form-msg info';
});

document.getElementById('btn-import-bulk').addEventListener('click', () => {
  document.getElementById('bulk-file').click();
});

document.getElementById('bulk-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const msg = document.getElementById('bulk-msg');
  msg.className = 'form-msg info';
  msg.textContent = 'Reading file…';

  const code = document.getElementById('mark-course').value;
  if (!code) {
    msg.className = 'form-msg error';
    msg.textContent = 'Select the course this template belongs to before importing.';
    e.target.value = '';
    return;
  }

  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (rows.length < 2) {
      msg.className = 'form-msg error';
      msg.textContent = 'That file has no data rows.';
      return;
    }

    const header = rows[0];
    const dateColumns = header.slice(2);

    let written = 0, skippedCells = 0;
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const roll = String(row[0] || '').trim();
      if (!roll) continue;

      msg.textContent = `Importing row ${r} of ${rows.length - 1}…`;

      const batch = db.batch();
      let batchCount = 0;
      for (let c = 0; c < dateColumns.length; c++) {
        const dateStr = String(dateColumns[c]).trim();
        const rawCode = String(row[c + 2] || '').trim().toUpperCase();
        if (!rawCode) { continue; }
        const status = ATT_CODE_TO_STATUS[rawCode];
        if (!status) { skippedCells++; continue; }

        const docId = `${code}__${dateStr}__${roll}`.replace(/[^A-Za-z0-9_-]/g, '_');
        batch.set(db.collection('attendance').doc(docId), {
          rollNumber: roll, courseCode: code, date: dateStr, status, markedBy: auth.currentUser.uid
        });
        batchCount++;
        written++;
      }
      if (batchCount > 0) await batch.commit();
    }

    msg.className = 'form-msg info';
    msg.textContent = `Import finished: ${written} attendance mark(s) saved.` +
      (skippedCells > 0 ? ` ${skippedCells} cell(s) had an unrecognized code and were skipped.` : '');
  } catch (err) {
    msg.className = 'form-msg error';
    msg.textContent = 'Could not read that file: ' + err.message;
  } finally {
    e.target.value = '';
  }
});
