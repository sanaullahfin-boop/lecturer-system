// ==========================================================================
// STUDENT ASSIGNMENTS — assignments for my courses, with my marks
// ==========================================================================

requireStudent(async (user, studentDoc) => {
  const d = studentDoc.data();
  const roll = studentDoc.id;
  setUserChip(d.name || roll);
  const enrolled = d.course || [];
  const list = document.getElementById('list');
  if (!enrolled.length) { list.innerHTML = `<div class="empty-state">You're not enrolled in any course yet — ask your lecturer to add course codes to your profile.</div>`; return; }
  try {
    const [itemDocs, marksSnap, subSnap] = await Promise.all([
      getWhereIn('gradeItems', 'courseCode', enrolled, q => q.where('type', '==', 'assignment')),
      db.collection('gradeMarks').where('rollNumber', '==', roll).get(),
      db.collection('submissions').where('rollNumber', '==', roll).get().catch(() => null)
    ]);
    const subs = {};
    if (subSnap) subSnap.forEach(x => { subs[x.data().itemId] = x.data(); });
    const marks = {};
    marksSnap.forEach(x => { marks[x.data().itemId] = x.data(); });
    const items = itemDocs.map(x => ({ id: x.id, ...x.data() })).filter(it => appliesTo(it, roll))
      .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));
    document.getElementById('item-count').textContent = `${items.length} assignment${items.length === 1 ? '' : 's'}`;
    if (!items.length) { list.innerHTML = `<div class="empty-state">No assignments yet.</div>`; return; }
    const today = localToday();
    list.innerHTML = items.map(it => {
      const m = marks[it.id];
      const graded = m && m.marksObtained !== null && m.marksObtained !== undefined;
      const days = it.dueDate ? daysBetween(today, it.dueDate) : null;
      return `<div class="panel" style="margin-bottom:14px;">
        <h3 style="margin-bottom:8px;">${h(it.title)}</h3>
        <div class="row-meta" style="margin-bottom:8px;">${h(it.courseCode)} · Due ${h(it.dueDate ? fmtDate(it.dueDate) : '—')}${days !== null && days >= 0 && !graded ? ` <span class="chip ${days <= 2 ? 'danger' : 'warn'}">${days === 0 ? 'due today' : 'in ' + days + ' day' + (days === 1 ? '' : 's')}</span>` : ''} · Total Marks: ${it.totalMarks ?? '—'}</div>
        ${it.description ? `<p style="font-size:13.5px;margin:0 0 8px;white-space:pre-line;">${h(it.description)}</p>` : ''}
        ${it.instructions ? `<p style="font-size:13px;color:var(--slate);margin:0 0 8px;white-space:pre-line;"><strong>Instructions:</strong> ${h(it.instructions)}</p>` : ''}
        ${it.attachmentUrl ? `<p style="font-size:13px;margin:0 0 8px;"><a href="${safeUrl(it.attachmentUrl)}" target="_blank" rel="noopener">View attachment</a></p>` : ''}
        <div>${graded ? `<span class="badge ok">Graded: ${m.marksObtained} / ${m.totalMarks}</span>` : `<span class="badge warn">Not yet graded</span>`}
          ${m && m.remarks ? `<span class="row-meta" style="margin-left:10px;">${h(m.remarks)}</span>` : ''}</div>
        ${it.allowSubmission ? submissionBox(it, subs[it.id]) : ''}
      </div>`;
    }).join('');
    list.querySelectorAll('.sub-form').forEach(f => f.addEventListener('submit', submitWork));
  } catch (e) {
    list.innerHTML = `<div class="empty-state">Could not load assignments: ${h(e.message)}</div>`;
  }
});

function submissionBox(it, sub) {
  const ms = sub && sub.submittedAt ? (sub.submittedAt.toMillis ? sub.submittedAt.toMillis() : sub.submittedAt.seconds * 1000) : null;
  const late = ms && it.dueDate && toLocalISO(new Date(ms)) > it.dueDate;
  return `<form class="sub-form" data-item="${h(it.id)}" data-course="${h(it.courseCode)}" style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--hairline);">
    <div class="small" style="margin-bottom:6px;"><b>My submission</b> ${sub ? `· <a href="${safeUrl(sub.url)}" target="_blank" rel="noopener">open</a> · submitted ${h(new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} <span class="chip ${late ? 'danger' : 'ok'}">${late ? 'Late' : 'On time'}</span>` : '<span class="chip warn">Not submitted yet</span>'}</div>
    <div class="gap-row">
      <input type="url" class="search-input sub-url" style="max-width:none;flex:2;" placeholder="Paste your Google Drive link (Share → Anyone with the link)" value="${h(sub ? sub.url : '')}" required>
      <input type="text" class="search-input sub-note" style="max-width:none;flex:1;" placeholder="Note (optional)" value="${h(sub ? sub.note : '')}" maxlength="300">
      <button type="submit" class="btn btn-primary-sm">${sub ? 'Update' : 'Submit'}</button>
    </div>
    <div class="form-msg sub-msg"></div>
  </form>`;
}

async function submitWork(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const url = f.querySelector('.sub-url').value.trim(), note = f.querySelector('.sub-note').value.trim();
  const msg = f.querySelector('.sub-msg');
  if (!/^https:\/\/\S+$/i.test(url)) { setMsg(msg, 'Paste a full link starting with https://', 'error'); return; }
  const roll = localStorage.getItem('lms_student_roll');
  const btn = f.querySelector('button');
  btn.disabled = true;
  try {
    await db.collection('submissions').doc(`${f.dataset.item}__${roll}`).set({
      itemId: f.dataset.item, rollNumber: roll, courseCode: f.dataset.course, url, note,
      submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    setMsg(msg, 'Submitted. Make sure the link is shared as "Anyone with the link" so your lecturer can open it.', 'info');
    btn.textContent = 'Update';
  } catch (err) {
    setMsg(msg, err.code === 'permission-denied' ? 'Online submission is closed for this assignment.' : 'Could not submit: ' + err.message, 'error');
  } finally { btn.disabled = false; }
}
