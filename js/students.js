// ==========================================================================
// STUDENTS — CRUD + Excel import/export + password visibility/change
// ==========================================================================

let allStudents = [], allCourses = [], settings;

requireAdmin(async (user, adminData) => {
  setUserChip((adminData && adminData.name) || user.email);
  settings = await loadSettings();
  const cs = await db.collection('courses').get();
  allCourses = cs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id));
  document.getElementById('filter-course').insertAdjacentHTML('beforeend', courseOptionsHtml(allCourses));
  document.getElementById('course-codes').innerHTML = allCourses.map(c => `<option value="${h(c.id)}">${h(c.title || '')}</option>`).join('');
  await loadStudents();
});

async function loadStudents() {
  const tbody = document.getElementById('table-body');
  try {
    const snap = await db.collection('students').get();
    allStudents = [];
    snap.forEach(doc => allStudents.push({ id: doc.id, ...doc.data() }));
    allStudents.sort((a, b) => (a.name || '').localeCompare(b.name || '') || a.id.localeCompare(b.id));
    applyFilters();
    const active = allStudents.filter(isActiveStudent).length;
    document.getElementById('student-count').textContent = `${allStudents.length} student${allStudents.length === 1 ? '' : 's'} · ${active} active`;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">Could not load students: ${escapeHtml(e.message)}</div></td></tr>`;
  }
}

function renderTable(students) {
  const tbody = document.getElementById('table-body');
  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">${allStudents.length ? 'No students match the filters.' : 'No students yet. Add one, or import from Excel.'}</div></td></tr>`;
    return;
  }
  tbody.innerHTML = students.map(s => `
    <tr>
      <td class="mono">${h(s.id)}</td>
      <td><a href="student-profile.html?roll=${encodeURIComponent(s.id)}">${h(s.name || '')}</a></td>
      <td>${h(s.program || '—')}</td>
      <td class="c num">${s.semester ?? '—'}</td>
      <td>${h(s.section || '—')}</td>
      <td class="mono small">${h((s.course || []).join(', ') || '—')}</td>
      <td><span class="badge ${statusBadgeClass(s.status)}">${h(s.status || 'active')}</span></td>
      <td>
        ${s.loginPassword
          ? `<span class="mono row-password" data-password="${h(s.loginPassword)}" data-visible="false">••••••••</span>
             <button class="icon-btn" onclick="togglePasswordInRow(this)" style="margin-left:4px;">Show</button>`
          : '<span class="row-meta">—</span>'}
      </td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" onclick="openEdit('${jsArg(s.id)}')">Edit</button>
          <button class="icon-btn" onclick="viewProfile('${jsArg(s.id)}')">Profile</button>
          ${s.phone ? `<a class="icon-btn" style="text-decoration:none;" target="_blank" rel="noopener" href="${h(waLink(s.phone, 'Dear ' + (s.name || '') + ', ', settings))}">WhatsApp</a>` : ''}
          <button class="icon-btn danger" onclick="confirmDelete('${jsArg(s.id)}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function applyFilters() {
  const q = document.getElementById('search-input').value.toLowerCase().trim();
  const course = document.getElementById('filter-course').value;
  const status = document.getElementById('filter-status').value;
  renderTable(allStudents.filter(s =>
    (!q || s.id.toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q) ||
      (s.program || '').toLowerCase().includes(q) || (s.phone || '').includes(q)) &&
    (!course || (s.course || []).includes(course)) &&
    (!status || (s.status || 'active') === status)
  ));
}
['filter-course', 'filter-status'].forEach(id => document.getElementById(id).addEventListener('change', applyFilters));

window.togglePasswordInRow = function (btn) {
  const span = btn.previousElementSibling;
  const visible = span.dataset.visible === 'true';
  if (visible) {
    span.textContent = '••••••••';
    span.dataset.visible = 'false';
    btn.textContent = 'Show';
  } else {
    span.textContent = span.dataset.password;
    span.dataset.visible = 'true';
    btn.textContent = 'Hide';
  }
};

window.viewProfile = function (roll) {
  window.location.href = `student-profile.html?roll=${encodeURIComponent(roll)}`;
};

function statusBadgeClass(status) {
  if (status === 'inactive') return 'warn';
  if (status === 'graduated') return 'neutral';
  return 'ok';
}

document.getElementById('search-input').addEventListener('input', applyFilters);

// ---------- Modal ----------

const backdrop = document.getElementById('modal-backdrop');
const form = document.getElementById('student-form');

document.getElementById('btn-add').addEventListener('click', () => openModal());
document.getElementById('btn-cancel').addEventListener('click', closeModal);
backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

function openModal() {
  document.getElementById('modal-title').textContent = 'Add Student';
  document.getElementById('original-roll').value = '';
  form.reset();
  document.getElementById('f-roll').disabled = false;
  document.getElementById('password-field').classList.remove('hidden');
  document.getElementById('f-password').required = true;
  document.getElementById('password-view-field').classList.add('hidden');
  clearFormMsg();
  renderCourseChips();
  backdrop.classList.add('open');
}

window.openEdit = function (roll) {
  const s = allStudents.find(x => x.id === roll);
  if (!s) return;
  document.getElementById('modal-title').textContent = 'Edit Student';
  document.getElementById('original-roll').value = roll;
  document.getElementById('f-roll').value = roll;
  document.getElementById('f-roll').disabled = true;
  document.getElementById('f-name').value = s.name || '';
  document.getElementById('f-father').value = s.fatherName || '';
  document.getElementById('f-email').value = s.email || '';
  document.getElementById('f-phone').value = s.phone || '';
  document.getElementById('f-program').value = s.program || '';
  document.getElementById('f-semester').value = s.semester || '';
  document.getElementById('f-section').value = s.section || '';
  document.getElementById('f-session').value = s.session || '';
  document.getElementById('f-status').value = s.status || 'active';
  document.getElementById('f-notes').value = s.notes || '';
  document.getElementById('f-courses').value = (s.course || []).join(', ');

  document.getElementById('password-field').classList.add('hidden');
  document.getElementById('f-password').required = false;
  document.getElementById('password-view-field').classList.remove('hidden');
  document.getElementById('f-password-view').value = s.loginPassword || '(not on file — set one below)';
  document.getElementById('f-password-view').type = 'password';
  document.getElementById('btn-toggle-password-visibility').textContent = 'Show';
  document.getElementById('f-password-new').value = '';
  clearMsg('password-change-msg');

  clearFormMsg();
  renderCourseChips();
  backdrop.classList.add('open');
};

// Clickable chips for quick enrolment
function renderCourseChips() {
  const cur = new Set(document.getElementById('f-courses').value.split(',').map(x => x.trim().toUpperCase()).filter(Boolean));
  const list = allCourses.filter(c => inActiveTerm(c, settings) || cur.has(c.id));
  document.getElementById('course-chips').innerHTML = list.map(c =>
    `<button type="button" class="chip-btn${cur.has(c.id) ? ' active' : ''}" data-code="${h(c.id)}" title="${h(c.title || '')}">${h(c.id)}</button>`).join('');
  document.querySelectorAll('#course-chips .chip-btn').forEach(b => b.addEventListener('click', () => {
    const set = new Set(document.getElementById('f-courses').value.split(',').map(x => x.trim().toUpperCase()).filter(Boolean));
    if (set.has(b.dataset.code)) set.delete(b.dataset.code); else set.add(b.dataset.code);
    document.getElementById('f-courses').value = [...set].join(', ');
    renderCourseChips();
  }));
}
document.getElementById('f-courses').addEventListener('change', renderCourseChips);

function closeModal() { backdrop.classList.remove('open'); }

function clearFormMsg() {
  const msg = document.getElementById('form-msg');
  msg.textContent = ''; msg.className = 'form-msg';
}
function showFormMsg(text, type) {
  const msg = document.getElementById('form-msg');
  msg.textContent = text; msg.className = 'form-msg ' + type;
}
function clearMsg(id) { const el = document.getElementById(id); el.textContent = ''; el.className = 'form-msg'; }
function showMsg(id, text, type) { const el = document.getElementById(id); el.textContent = text; el.className = 'form-msg ' + type; }

document.getElementById('btn-toggle-password-visibility').addEventListener('click', () => {
  const input = document.getElementById('f-password-view');
  const btn = document.getElementById('btn-toggle-password-visibility');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
  }
});

if (document.getElementById('btn-generate-password')) {
  document.getElementById('btn-generate-password').addEventListener('click', () => {
    document.getElementById('f-password').value = generatePassword();
  });
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// ---------- Change Password (existing students) ----------

document.getElementById('btn-change-password').addEventListener('click', async () => {
  const roll = document.getElementById('original-roll').value;
  const student = allStudents.find(x => x.id === roll);
  const newPassword = document.getElementById('f-password-new').value;
  clearMsg('password-change-msg');

  if (!student) return;
  if (!newPassword || newPassword.length < 6) {
    showMsg('password-change-msg', 'New password must be at least 6 characters.', 'error');
    return;
  }
  if (!student.loginPassword) {
    showMsg('password-change-msg', 'No password is on file for this student to change from. Delete this student\'s login in Firebase Console → Authentication, then re-add them here instead.', 'error');
    return;
  }

  const btn = document.getElementById('btn-change-password');
  btn.disabled = true; btn.textContent = 'Changing…';

  try {
    const secondaryAuth = getSecondaryAuth();
    const authEmail = await getStudentAuthEmail(roll);
    const cred = await secondaryAuth.signInWithEmailAndPassword(authEmail, student.loginPassword);
    await cred.user.updatePassword(newPassword);
    await secondaryAuth.signOut();

    await db.collection('students').doc(roll).update({ loginPassword: newPassword });
    student.loginPassword = newPassword;

    document.getElementById('f-password-view').value = newPassword;
    document.getElementById('f-password-new').value = '';
    showMsg('password-change-msg', 'Password changed successfully.', 'info');
    logChange('Student password changed', roll);
    await loadStudents();
  } catch (err) {
    showMsg('password-change-msg', 'Could not change password: ' + friendlyError(err), 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Change Password';
  }
});

// ---------- Save (Add / Edit) ----------

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFormMsg();

  const originalRoll = document.getElementById('original-roll').value;
  const roll = document.getElementById('f-roll').value.trim();
  const name = document.getElementById('f-name').value.trim();
  const fatherName = document.getElementById('f-father').value.trim();
  const email = document.getElementById('f-email').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  const program = document.getElementById('f-program').value.trim();
  const semester = Number(document.getElementById('f-semester').value);
  const section = document.getElementById('f-section').value.trim();
  const session = document.getElementById('f-session').value.trim();
  const status = document.getElementById('f-status').value;
  const notes = document.getElementById('f-notes').value.trim();
  const course = document.getElementById('f-courses').value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const password = document.getElementById('f-password').value;

  if (!roll || !name || !program || !semester) {
    showFormMsg('Please fill in all required fields.', 'error');
    return;
  }

  const saveBtn = document.getElementById('btn-save');
  saveBtn.disabled = true; saveBtn.textContent = 'Saving…';

  try {
    if (!originalRoll) {
      const existing = await db.collection('students').doc(roll).get();
      if (existing.exists) {
        showFormMsg(`Roll number "${roll}" already exists.`, 'error');
        saveBtn.disabled = false; saveBtn.textContent = 'Save Student';
        return;
      }
      if (!password || password.length < 6) {
        showFormMsg('Password must be at least 6 characters.', 'error');
        saveBtn.disabled = false; saveBtn.textContent = 'Save Student';
        return;
      }

      const authEmail = generateUniqueStudentEmail(roll);
      const authUid = await createStudentAuthAccount(authEmail, password);
      await db.collection('studentLogins').doc(roll).set({ authEmail });
      await db.collection('students').doc(roll).set({
        authUid, name, fatherName, email, phone, program, semester, section, session, status, notes, course,
        loginPassword: password
      });
      logChange('Student added', `${roll} · ${name}`);
      showFormMsg(`Student saved. Their login password is: ${password} — write this down now, it's also visible anytime from the Students list.`, 'info');
      await loadStudents();
      setTimeout(() => { closeModal(); }, 2800);
      saveBtn.disabled = false; saveBtn.textContent = 'Save Student';
      return;
    } else {
      await db.collection('students').doc(originalRoll).update({
        name, fatherName, email, phone, program, semester, section, session, status, notes, course
      });
    }
    closeModal();
    await loadStudents();
  } catch (err) {
    showFormMsg('Could not save: ' + friendlyError(err), 'error');
  } finally {
    saveBtn.disabled = false; saveBtn.textContent = 'Save Student';
  }
});

function friendlyError(err) {
  if (err.code === 'auth/email-already-in-use') return 'An unlikely random collision happened generating this student\'s login — just try saving again.';
  if (err.code === 'auth/weak-password') return 'Password is too weak — use at least 6 characters.';
  if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') return 'The password on file no longer matches this student\'s actual login — it may have been changed elsewhere. Delete the student\'s login in Firebase Console → Authentication and re-add them.';
  if (err.code === 'auth/user-not-found') return 'No login exists for this student anymore — delete and re-add them.';
  return err.message;
}

window.confirmDelete = async function (roll) {
  if (!confirm(`Delete student "${roll}"? Their record and dashboard access will be removed. (Note: on the free Firebase plan, their underlying login account can't be auto-deleted from the browser — it stays in Firebase Authentication, unused and harmless. You can safely re-add the same roll number later; a fresh, unique login will be created for it automatically.)`)) return;
  try {
    await db.collection('students').doc(roll).delete();
    await db.collection('studentLogins').doc(roll).delete().catch(() => {}); // harmless if it doesn't exist
    logChange('Student deleted', roll);
    await loadStudents();
  } catch (e) {
    alert('Could not delete: ' + e.message);
  }
};

// ---------- Excel Export ----------

document.getElementById('btn-export').addEventListener('click', () => {
  const rows = allStudents.map(s => ({
    'Roll Number': s.id,
    'Name': s.name || '',
    "Father's Name": s.fatherName || '',
    'Email': s.email || '',
    'Phone': s.phone || '',
    'Program': s.program || '',
    'Semester': s.semester || '',
    'Section': s.section || '',
    'Session': s.session || '',
    'Status': s.status || '',
    'Notes': s.notes || '',
    'Courses': (s.course || []).join(', '),
    'Password': s.loginPassword || ''
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  XLSX.writeFile(wb, `students-export-${new Date().toISOString().slice(0,10)}.xlsx`);
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

    let created = 0, skipped = 0;
    const otherErrors = [];
    const generatedPasswords = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const roll = String(row['Roll Number'] || row['Roll No'] || row['RollNumber'] || '').trim();
      progress.textContent = `Importing row ${i + 1} of ${rows.length}… (${created} created, ${skipped} skipped)`;

      if (!roll) { skipped++; continue; }

      try {
        const existing = await db.collection('students').doc(roll).get();
        if (existing.exists) { skipped++; continue; }

        const providedPassword = String(row['Password'] || '').trim();
        const password = providedPassword || (roll.replace(/[^A-Za-z0-9]/g, '') + Math.floor(1000 + Math.random() * 9000));
        if (!providedPassword) generatedPasswords.push(`${roll}: ${password}`);

        const authEmail = generateUniqueStudentEmail(roll);
        const authUid = await createStudentAuthAccount(authEmail, password);
        await db.collection('studentLogins').doc(roll).set({ authEmail });

        await db.collection('students').doc(roll).set({
          authUid,
          name: String(row['Name'] || ''),
          fatherName: String(row["Father's Name"] || row['Father Name'] || ''),
          email: String(row['Email'] || ''),
          phone: String(row['Phone'] || ''),
          program: String(row['Program'] || ''),
          semester: Number(row['Semester']) || 1,
          section: String(row['Section'] || ''),
          session: String(row['Session'] || ''),
          status: String(row['Status'] || 'active'),
          notes: String(row['Notes'] || ''),
          course: String(row['Courses'] || row['Course'] || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
          loginPassword: password
        });
        created++;
      } catch (rowErr) {
        console.warn(`Row ${i + 1} (${roll}) failed:`, rowErr.message);
        otherErrors.push(`${roll}: ${rowErr.message}`);
      }
    }

    let summary = `Import finished: ${created} created, ${skipped} skipped (already existed or missing roll number).`;
    if (generatedPasswords.length > 0) {
      summary += ` Auto-generated passwords (also saved — visible anytime from this list): ${generatedPasswords.join(', ')}.`;
    }
    if (otherErrors.length > 0) {
      summary += ` ${otherErrors.length} failed with an error: ${otherErrors.join('; ')}`;
    }
    progress.className = otherErrors.length > 0 ? 'form-msg error' : 'form-msg info';
    progress.textContent = summary;
    await loadStudents();
  } catch (err) {
    progress.className = 'form-msg error';
    progress.textContent = 'Could not read that file: ' + err.message;
  } finally {
    e.target.value = '';
  }
});
