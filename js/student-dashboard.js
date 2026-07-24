// ==========================================================================
// STUDENT DASHBOARD — read-only, scoped to the signed-in student only
// ==========================================================================

document.getElementById('today-label').textContent = new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

document.getElementById('logout-btn').addEventListener('click', logout);

requireStudent(async (user, studentDoc) => {
  const data = studentDoc.data();
  document.getElementById('student-name').textContent = data.name || user.email;
  document.getElementById('student-initial').textContent = (data.name || '?').charAt(0).toUpperCase();
  document.getElementById('stat-roll').textContent = studentDoc.id;
  document.getElementById('stat-program').textContent = `${data.program || '—'} / Sem ${data.semester || '—'}`;
  document.getElementById('stat-section').textContent = data.section || '—';

  await loadMyAttendance(studentDoc.id);
  await loadMyDeadlines(studentDoc.id, data.course || []);
  await loadMyAnnouncements(data.course || []);
});

async function loadMyAnnouncements(enrolledCourses) {
  const list = document.getElementById('announcements-list');
  try {
    const snap = await db.collection('announcements').orderBy('postedAt', 'desc').limit(20).get();
    const mine = snap.docs
      .map(doc => doc.data())
      .filter(a => a.target === 'all' || enrolledCourses.includes(a.target))
      .slice(0, 5);
    if (mine.length === 0) {
      list.innerHTML = `<div class="empty-state">Nothing posted yet.</div>`;
      return;
    }
    list.innerHTML = mine.map(a => `
      <div class="list-row">
        <div>
          <div class="row-title">${escapeHtml(a.title)}</div>
          <div class="row-meta">${escapeHtml(a.body)}</div>
        </div>
        <div class="row-meta mono">${new Date(a.postedAt).toLocaleDateString()}</div>
      </div>
    `).join('');
  } catch (e) {
    console.warn('Could not load announcements:', e.message);
  }
}

async function loadMyDeadlines(rollNumber, enrolledCourses) {
  const list = document.getElementById('tasks-list');
  if (enrolledCourses.length === 0) return;
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const snap = await db.collection('gradeItems')
      .where('courseCode', 'in', enrolledCourses.slice(0, 10)) // Firestore 'in' caps at 10
      .get();
    const upcoming = [];
    snap.forEach(doc => {
      const d = doc.data();
      const appliesToMe = d.assignTo === 'all' || !d.assignTo || (Array.isArray(d.assignTo) && d.assignTo.includes(rollNumber));
      if (appliesToMe && d.dueDate && d.dueDate >= todayStr && d.type !== 'task') {
        upcoming.push(d);
      }
    });
    upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    if (upcoming.length === 0) {
      list.innerHTML = `<div class="empty-state">Nothing due right now.</div>`;
      return;
    }
    const typeLabel = { assignment: 'Assignment', presentation: 'Presentation', quiz: 'Quiz', exam: 'Exam' };
    list.innerHTML = upcoming.slice(0, 8).map(d => `
      <div class="list-row">
        <div>
          <div class="row-title">${escapeHtml(d.title)}</div>
          <div class="row-meta">${escapeHtml(typeLabel[d.type] || d.type)} · ${escapeHtml(d.courseCode)}</div>
        </div>
        <div class="row-meta mono">${escapeHtml(d.dueDate)}</div>
      </div>
    `).join('');
  } catch (e) {
    console.warn('Could not load deadlines:', e.message);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function loadMyAttendance(rollNumber) {
  try {
    const snap = await db.collection('attendance').where('rollNumber', '==', rollNumber).get();
    if (snap.empty) {
      document.getElementById('stat-attendance').textContent = '—';
      return;
    }
    let present = 0;
    snap.forEach(doc => {
      const status = doc.data().status;
      if (status === 'present' || status === 'late') present++;
    });
    const pct = Math.round((present / snap.size) * 100);
    const el = document.getElementById('stat-attendance');
    el.textContent = pct + '%';
    el.className = 'stat-value ' + (pct < 75 ? 'danger' : 'ok');
  } catch (e) {
    console.warn('Attendance collection not available yet:', e.message);
  }
}
