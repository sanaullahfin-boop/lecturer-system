// ==========================================================================
// STUDENT PROFILE — a complete, one-page view of a single student
// ==========================================================================

document.getElementById('logout-btn').addEventListener('click', logout);

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

const params = new URLSearchParams(window.location.search);
const roll = params.get('roll');

requireAdmin(async (user, adminData) => {
  document.getElementById('admin-name').textContent = (adminData && adminData.name) || user.email;
  document.getElementById('admin-initial').textContent = ((adminData && adminData.name) || user.email).charAt(0).toUpperCase();

  const content = document.getElementById('content');

  if (!roll) {
    content.innerHTML = `<div class="empty-state">No student specified. Go back to the Students page and click "Profile" next to a student.</div>`;
    return;
  }

  try {
    const [studentDoc, coursesSnap] = await Promise.all([
      db.collection('students').doc(roll).get(),
      db.collection('courses').get()
    ]);

    if (!studentDoc.exists) {
      content.innerHTML = `<div class="empty-state">No student found with roll number "${escapeHtml(roll)}".</div>`;
      return;
    }

    const s = studentDoc.data();
    const allCourses = [];
    coursesSnap.forEach(doc => allCourses.push({ id: doc.id, ...doc.data() }));
    const myCourses = allCourses.filter(c => (s.course || []).includes(c.id));

    // Attendance % per enrolled course
    const attendanceByCourse = {};
    for (const c of myCourses) {
      const pctMap = await computeAttendancePercentages(c.id);
      attendanceByCourse[c.id] = pctMap[roll] ?? null;
    }

    // Every grade item + mark this student has, across all their courses
    const marksSnap = await db.collection('gradeMarks').where('rollNumber', '==', roll).get();
    const marks = [];
    marksSnap.forEach(doc => marks.push({ id: doc.id, ...doc.data() }));

    const itemIds = [...new Set(marks.map(m => m.itemId))];
    const itemsById = {};
    for (let i = 0; i < itemIds.length; i += 10) {
      const chunk = itemIds.slice(i, i + 10);
      if (chunk.length === 0) continue;
      const itemsSnap = await db.collection('gradeItems').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
      itemsSnap.forEach(doc => { itemsById[doc.id] = { id: doc.id, ...doc.data() }; });
    }

    renderProfile(s, myCourses, attendanceByCourse, marks, itemsById);
  } catch (e) {
    content.innerHTML = `<div class="empty-state">Could not load this profile: ${escapeHtml(e.message)}</div>`;
  }
});

function renderProfile(s, myCourses, attendanceByCourse, marks, itemsById) {
  const content = document.getElementById('content');

  const infoItems = [
    ['Program', s.program || '—'],
    ['Semester', s.semester ?? '—'],
    ['Section', s.section || '—'],
    ['Session', s.session || '—'],
    ['Status', s.status || 'active'],
    ["Father's Name", s.fatherName || '—'],
    ['Email', s.email || '—'],
    ['Phone', s.phone || '—'],
  ];

  const attendanceRows = myCourses.map(c => {
    const pct = attendanceByCourse[c.id];
    return `
      <div class="list-row">
        <div class="row-title">${escapeHtml(c.id)} — ${escapeHtml(c.title || '')}</div>
        <div class="row-meta ${pct !== null && pct < 75 ? '' : ''}">${pct === null ? 'No attendance yet' : pct + '%' + (pct < 75 ? ' — Warning' : '')}</div>
      </div>
    `;
  }).join('') || '<div class="empty-state">Not enrolled in any course yet.</div>';

  const typeLabel = { assignment: 'Assignment', presentation: 'Presentation', quiz: 'Quiz', task: 'Task', exam: 'Internal Exam' };
  const marksRows = marks
    .map(m => ({ ...m, item: itemsById[m.itemId] }))
    .filter(m => m.item)
    .sort((a, b) => (b.item.dueDate || '').localeCompare(a.item.dueDate || ''))
    .map(m => `
      <div class="list-row">
        <div>
          <div class="row-title">${escapeHtml(m.item.title)}</div>
          <div class="row-meta">${escapeHtml(typeLabel[m.type] || m.type)} · ${escapeHtml(m.item.courseCode)} · ${escapeHtml(m.item.dueDate || '')}</div>
        </div>
        <div class="row-meta mono">${m.marksObtained ?? '—'} / ${m.totalMarks ?? '—'}</div>
      </div>
    `).join('') || '<div class="empty-state">No marks recorded yet.</div>';

  content.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${escapeHtml((s.name || '?').charAt(0).toUpperCase())}</div>
      <div>
        <div class="profile-name">${escapeHtml(s.name || '(no name)')}</div>
        <div class="profile-meta">Roll Number: <span class="mono">${escapeHtml(roll)}</span></div>
      </div>
    </div>

    <div class="info-grid">
      ${infoItems.map(([label, value]) => `
        <div class="info-item">
          <div class="label">${escapeHtml(label)}</div>
          <div class="value">${escapeHtml(String(value))}</div>
        </div>
      `).join('')}
    </div>

    <h3 class="section-title">Attendance by Course</h3>
    <div class="panel">${attendanceRows}</div>

    <h3 class="section-title">All Recorded Marks</h3>
    <div class="panel">${marksRows}</div>
  `;
}
