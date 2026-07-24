// ==========================================================================
// ADMIN DASHBOARD
// ==========================================================================

document.getElementById('today-label').textContent = new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

document.getElementById('logout-btn').addEventListener('click', logout);

requireAdmin(async (user, adminData) => {
  const name = (adminData && adminData.name) || user.email;
  document.getElementById('admin-name').textContent = name;
  document.getElementById('admin-initial').textContent = name.charAt(0).toUpperCase();

  await loadStats();
  await loadRecentAnnouncements();
});

async function loadRecentAnnouncements() {
  const list = document.getElementById('announcements-list');
  try {
    const snap = await db.collection('announcements').orderBy('postedAt', 'desc').limit(5).get();
    if (snap.empty) {
      list.innerHTML = `<div class="empty-state">No announcements yet. Post one from the Announcements page.</div>`;
      return;
    }
    list.innerHTML = snap.docs.map(doc => {
      const a = doc.data();
      return `
        <div class="list-row">
          <div>
            <div class="row-title">${escapeHtmlLocal(a.title)}</div>
            <div class="row-meta">${a.target === 'all' ? 'All students' : escapeHtmlLocal(a.target)}</div>
          </div>
          <div class="row-meta mono">${new Date(a.postedAt).toLocaleDateString()}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.warn('Could not load announcements:', e.message);
  }
}

function escapeHtmlLocal(str) {
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function loadStats() {
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Total students
  try {
    const studentsSnap = await db.collection('students').get();
    document.getElementById('stat-total-students').textContent = studentsSnap.size;
  } catch (e) {
    document.getElementById('stat-total-students').textContent = '0';
    console.warn('Could not load students count:', e.message);
  }

  // Active courses
  try {
    const coursesSnap = await db.collection('courses').get();
    document.getElementById('stat-courses').textContent = coursesSnap.size;
  } catch (e) {
    document.getElementById('stat-courses').textContent = '0';
    console.warn('Could not load courses count:', e.message);
  }

  // Today's attendance + overall attendance warnings, both computed from
  // the same attendance collection (Phase 2 module).
  try {
    const attSnap = await db.collection('attendance').get();
    let presentToday = 0, absentToday = 0;
    const tally = {}; // rollNumber -> {present, total}

    attSnap.forEach(doc => {
      const d = doc.data();
      if (!tally[d.rollNumber]) tally[d.rollNumber] = { present: 0, total: 0 };
      tally[d.rollNumber].total++;
      const isPresent = d.status === 'present' || d.status === 'late';
      if (isPresent) tally[d.rollNumber].present++;

      if (d.date === todayStr) {
        if (isPresent) presentToday++;
        else if (d.status === 'absent') absentToday++;
      }
    });

    document.getElementById('stat-present-today').textContent = attSnap.empty ? '—' : presentToday;
    document.getElementById('stat-absent-today').textContent = attSnap.empty ? '—' : absentToday;

    const warningCount = Object.values(tally).filter(t => (t.present / t.total) * 100 < 75).length;
    document.getElementById('stat-warnings').textContent = attSnap.empty ? '—' : warningCount;
  } catch (e) {
    console.warn('Attendance collection not available yet:', e.message);
  }
}
