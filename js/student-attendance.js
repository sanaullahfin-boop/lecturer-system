// ==========================================================================
// STUDENT ATTENDANCE — own records, using the lecturer's attendance rules
// ==========================================================================

document.getElementById('page-sub').textContent = todayLabel();

requireStudent(async (user, studentDoc) => {
  const d = studentDoc.data();
  const roll = studentDoc.id;
  setUserChip(d.name || roll);
  const settings = await loadSettings();
  const threshold = Number(settings.attendance.warningThreshold);
  setupLeave(roll, d, settings);
  const statsEl = document.getElementById('course-stats');
  const logBody = document.getElementById('log-body');
  try {
    const [att, coursesSnap] = await Promise.all([loadStudentAttendance(roll), db.collection('courses').get()]);
    const title = {};
    coursesSnap.forEach(c => { title[c.id] = c.data().title || ''; });
    const codes = [...new Set([...(d.course || []), ...Object.keys(att)])].filter(c => att[c]);
    if (!codes.length) {
      statsEl.innerHTML = `<div class="empty-state">No attendance recorded yet.</div>`;
      logBody.innerHTML = `<tr><td colspan="3"><div class="empty-state">Nothing to show yet.</div></td></tr>`;
      return;
    }
    statsEl.innerHTML = codes.map(code => {
      const st = attendanceStats(att[code], settings);
      const warn = st.pct !== null && st.pct < threshold;
      const needed = warn && st.counted && threshold < 100 ? Math.max(0, Math.ceil((threshold / 100 * st.counted - st.attended) / (1 - threshold / 100))) : 0;
      return `<div class="stat-card">
        <div class="stat-label">${h(code)} — ${h(title[code] || '')}</div>
        <div class="stat-value ${warn ? 'danger' : 'ok'}">${fmtPct(st.pct)}</div>
        <div class="muted small" style="margin-top:6px;">${h(attCountsText(st, settings))}</div>
        ${warn ? `<div class="small cell-A" style="margin-top:6px;">Below ${threshold}%. Attend the next ${needed} class${needed === 1 ? '' : 'es'} in a row to reach ${threshold}%.</div>` : ''}
      </div>`;
    }).join('');
    const sel = document.getElementById('log-course');
    sel.insertAdjacentHTML('beforeend', codes.map(c => `<option value="${h(c)}">${h(c)}</option>`).join(''));
    const all = [];
    codes.forEach(code => Object.entries(att[code]).forEach(([date, status]) => all.push({ date, code, status })));
    all.sort((a, b) => b.date.localeCompare(a.date));
    const draw = () => {
      const f = sel.value;
      const rows = all.filter(r => !f || r.code === f);
      logBody.innerHTML = rows.map(r => `<tr>
        <td class="mono">${h(fmtDate(r.date))}</td>
        <td class="mono">${h(r.code)} — ${h(title[r.code] || '')}</td>
        <td><span class="badge ${h(attColor(settings, r.status))}">${h(attLabel(settings, r.status))}</span></td>
      </tr>`).join('');
    };
    sel.addEventListener('change', draw);
    draw();
  } catch (e) {
    statsEl.innerHTML = `<div class="empty-state">Could not load attendance: ${h(e.message)}</div>`;
    logBody.innerHTML = '';
  }
});


/* ---------------- Leave requests ---------------- */
function setupLeave(roll, stu, settings) {
  const sel = document.getElementById('lv-course');
  sel.insertAdjacentHTML('beforeend', (stu.course || []).map(c => `<option value="${h(c)}">${h(c)}</option>`).join(''));
  const today = localToday();
  document.getElementById('lv-from').value = today;
  document.getElementById('lv-to').value = today;
  document.getElementById('lv-from').addEventListener('change', e => {
    const to = document.getElementById('lv-to');
    if (to.value < e.target.value) to.value = e.target.value;
  });
  const cls = { pending: 'warn', approved: 'ok', rejected: 'danger' };
  const word = { pending: 'Waiting', approved: 'Approved', rejected: 'Not approved' };
  let mine = [];
  async function load() {
    const box = document.getElementById('lv-list');
    try {
      mine = (await db.collection('leaveRequests').where('authUid', '==', auth.currentUser.uid).get()).docs
        .map(x => ({ id: x.id, ...x.data() })).sort((a, b) => b.from.localeCompare(a.from));
      box.innerHTML = mine.length ? mine.map(l => `<div class="list-row" style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);">
        <div><div><b class="mono">${h(fmtDate(l.from))}${l.to !== l.from ? ' – ' + h(fmtDate(l.to)) : ''}</b> · ${h(l.courseCode || 'All courses')}</div>
          <div class="small muted" style="white-space:pre-wrap;">${h(l.reason)}</div>
          ${l.note ? `<div class="small">Lecturer: ${h(l.note)}</div>` : ''}</div>
        <div style="text-align:right;"><span class="badge ${cls[l.status] || ''}">${h(word[l.status] || l.status)}</span>
          ${l.status === 'pending' ? `<div><button class="link-btn small" data-wd="${h(l.id)}">Withdraw</button></div>` : ''}</div>
      </div>`).join('') : '<div class="empty-state">No requests yet.</div>';
      box.querySelectorAll('[data-wd]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Withdraw this leave request?')) return;
        try { await db.collection('leaveRequests').doc(b.dataset.wd).delete(); load(); }
        catch (e) { toast('Could not withdraw: ' + e.message, 'error'); }
      }));
    } catch (e) {
      box.innerHTML = `<div class="empty-state">Could not load your requests${e.code === 'permission-denied' ? ' (your lecturer needs to update the app’s security rules)' : ': ' + h(e.message)}.</div>`;
    }
  }
  document.getElementById('lv-send').addEventListener('click', async () => {
    const from = document.getElementById('lv-from').value, to = document.getElementById('lv-to').value;
    const reason = document.getElementById('lv-reason').value.trim();
    if (!from || !to || to < from) { setMsg('lv-msg', 'Choose the dates (the "To" date cannot be before "From").', 'error'); return; }
    if (daysBetween(from, to) > 60) { setMsg('lv-msg', 'A leave request can be for at most 60 days.', 'error'); return; }
    if (reason.length < 3) { setMsg('lv-msg', 'Write the reason for the leave.', 'error'); return; }
    if (!navigator.onLine) { setMsg('lv-msg', 'You need internet to send a request.', 'error'); return; }
    const courseCode = document.getElementById('lv-course').value;
    if (mine.some(l => l.status !== 'rejected' && l.from === from && l.to === to && (l.courseCode || '') === courseCode)) { setMsg('lv-msg', 'You already sent a request for these dates.', 'error'); return; }
    const btn = document.getElementById('lv-send');
    btn.disabled = true;
    try {
      await db.collection('leaveRequests').add({
        rollNumber: roll, studentName: String(stu.name || '').slice(0, 119), authUid: auth.currentUser.uid, courseCode,
        from, to, reason: reason.slice(0, 600), status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      setMsg('lv-msg', 'Sent. Your lecturer will approve or reject it — check back here.', 'info');
      document.getElementById('lv-reason').value = '';
      load();
    } catch (e) {
      setMsg('lv-msg', e.code === 'permission-denied' ? 'Could not send — ask your lecturer to update the app (security rules v4).' : 'Could not send: ' + e.message, 'error');
    } finally { btn.disabled = false; }
  });
  load();
}
