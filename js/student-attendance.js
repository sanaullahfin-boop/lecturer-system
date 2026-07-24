// ==========================================================================
// STUDENT ATTENDANCE — own records only
// ==========================================================================

document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('today-label').textContent = new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

requireStudent(async (user, studentDoc) => {
  const d = studentDoc.data();
  document.getElementById('student-name').textContent = d.name || user.email;
  document.getElementById('student-initial').textContent = (d.name || '?').charAt(0).toUpperCase();

  const roll = studentDoc.id;
  const statsEl = document.getElementById('course-stats');
  const logBody = document.getElementById('log-body');

  try {
    const [attSnap, coursesSnap] = await Promise.all([
      db.collection('attendance').where('rollNumber', '==', roll).get(),
      db.collection('courses').get()
    ]);

    const coursesById = {};
    coursesSnap.forEach(doc => { coursesById[doc.id] = doc.data(); });

    const records = [];
    attSnap.forEach(doc => records.push(doc.data()));
    records.sort((a, b) => b.date.localeCompare(a.date));

    if (records.length === 0) {
      statsEl.innerHTML = `<div class="empty-state">No attendance recorded yet.</div>`;
      logBody.innerHTML = `<tr><td colspan="3"><div class="empty-state">Nothing to show yet.</div></td></tr>`;
      return;
    }

    const tally = {};
    records.forEach(r => {
      if (!tally[r.courseCode]) tally[r.courseCode] = { present: 0, total: 0 };
      tally[r.courseCode].total++;
      if (r.status === 'present' || r.status === 'late') tally[r.courseCode].present++;
    });

    statsEl.innerHTML = Object.entries(tally).map(([code, t]) => {
      const pct = Math.round((t.present / t.total) * 100);
      const courseName = coursesById[code] ? coursesById[code].title : code;
      return `
        <div class="stat-card">
          <div class="stat-label">${escapeHtml(code)} — ${escapeHtml(courseName)}</div>
          <div class="stat-value ${pct < 75 ? 'danger' : 'ok'}">${pct}%</div>
        </div>
      `;
    }).join('');

    const statusLabel = { present: 'Present', absent: 'Absent', leave: 'Leave', late: 'Late', excused: 'Excused' };
    logBody.innerHTML = records.map(r => `
      <tr>
        <td class="mono">${escapeHtml(r.date)}</td>
        <td class="mono">${escapeHtml(r.courseCode)} — ${escapeHtml(coursesById[r.courseCode] ? coursesById[r.courseCode].title : '')}</td>
        <td><span class="badge ${r.status === 'absent' ? 'danger' : (r.status === 'present' || r.status === 'late') ? 'ok' : 'warn'}">${escapeHtml(statusLabel[r.status] || r.status)}</span></td>
      </tr>
    `).join('');
  } catch (e) {
    statsEl.innerHTML = `<div class="empty-state">Could not load attendance: ${escapeHtml(e.message)}</div>`;
    logBody.innerHTML = '';
  }
});
