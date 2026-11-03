// ==========================================================================
// STUDENT ACCOUNT — my details + change my own password
// ==========================================================================

let me = null;

requireStudent(async (user, studentDoc) => {
  const d = studentDoc.data();
  me = { roll: studentDoc.id, ...d };
  setUserChip(d.name || studentDoc.id);
  const rows = [['Name', d.name], ['Roll Number', studentDoc.id], ["Father's Name", d.fatherName], ['Program', d.program],
    ['Semester', d.semester], ['Section', d.section], ['Session', d.session], ['Phone', d.phone], ['Email', d.email], ['Courses', (d.course || []).join(', ')]];
  document.getElementById('details').innerHTML = rows.map(([k, v]) =>
    `<div class="list-row"><span class="muted">${h(k)}</span><span class="row-title">${h(v === undefined || v === null || v === '' ? '—' : v)}</span></div>`).join('');
});

document.getElementById('pw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cur = document.getElementById('pw-current').value;
  const n1 = document.getElementById('pw-new').value;
  const n2 = document.getElementById('pw-new2').value;
  if (n1.length < 6) { setMsg('pw-msg', 'New password must be at least 6 characters.', 'error'); return; }
  if (n1 !== n2) { setMsg('pw-msg', 'The two new passwords do not match.', 'error'); return; }
  if (!navigator.onLine) { setMsg('pw-msg', 'You need to be online to change your password.', 'error'); return; }
  const btn = document.getElementById('pw-save');
  btn.disabled = true; btn.textContent = 'Changing…';
  try {
    const user = auth.currentUser;
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, cur);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(n1);
    document.getElementById('pw-form').reset();
    // keep the lecturer's copy in sync so "Show password" / admin reset keep working
    try {
      await db.collection('students').doc(me.roll).update({ loginPassword: n1 });
      setMsg('pw-msg', 'Password changed. Use the new one next time you sign in.', 'info');
    } catch (syncErr) {
      setMsg('pw-msg', 'Password changed — but please tell your lecturer your new password, because their copy could not be updated.', 'info');
    }
  } catch (err) {
    const code = err && err.code;
    setMsg('pw-msg', code === 'auth/wrong-password' || code === 'auth/invalid-credential' ? 'Your current password is not correct.'
      : code === 'auth/too-many-requests' ? 'Too many attempts — wait a few minutes and try again.'
      : 'Could not change password: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Change Password';
  }
});
