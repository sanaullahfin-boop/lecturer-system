// ==========================================================================
// STUDENT PRESENTATIONS — rounds for enrolled courses, own topic/status/marks
// ==========================================================================

document.getElementById('logout-btn').addEventListener('click', logout);

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

requireStudent(async (user, studentDoc) => {
  const d = studentDoc.data();
  document.getElementById('student-name').textContent = d.name || user.email;
  document.getElementById('student-initial').textContent = (d.name || '?').charAt(0).toUpperCase();

  const roll = studentDoc.id;
  const enrolledCourses = d.course || [];
  const list = document.getElementById('list');

  if (enrolledCourses.length === 0) {
    list.innerHTML = `<div class="empty-state">You're not enrolled in any course yet — ask your lecturer to add course codes to your profile.</div>`;
    return;
  }

  try {
    const [itemsSnap, marksSnap] = await Promise.all([
      db.collection('gradeItems').where('type', '==', 'presentation').where('courseCode', 'in', enrolledCourses.slice(0, 10)).get(),
      db.collection('gradeMarks').where('rollNumber', '==', roll).get()
    ]);

    const marksByItemId = {};
    marksSnap.forEach(doc => { marksByItemId[doc.data().itemId] = doc.data(); });

    const items = [];
    itemsSnap.forEach(doc => {
      const it = { id: doc.id, ...doc.data() };
      const appliesToMe = it.assignTo === 'all' || !it.assignTo || (Array.isArray(it.assignTo) && it.assignTo.includes(roll));
      if (appliesToMe) items.push(it);
    });
    items.sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));

    document.getElementById('item-count').textContent = `${items.length} round${items.length === 1 ? '' : 's'}`;

    if (items.length === 0) {
      list.innerHTML = `<div class="empty-state">No presentation rounds yet.</div>`;
      return;
    }

    const statusBadge = { scheduled: 'warn', completed: 'ok', 'no-show': 'danger' };
    list.innerHTML = items.map(it => {
      const mark = marksByItemId[it.id];
      const graded = mark && mark.marksObtained !== null && mark.marksObtained !== undefined;
      return `
        <div class="panel" style="margin-bottom:14px;">
          <h3 style="margin-bottom:8px;">${escapeHtml(it.title)}</h3>
          <div class="row-meta" style="margin-bottom:8px;">${escapeHtml(it.courseCode)} · ${escapeHtml(it.dueDate || '—')} · Total Marks: ${it.totalMarks ?? '—'}</div>
          <div style="margin-bottom:8px;">
            <strong>My Topic:</strong> ${escapeHtml(mark && mark.topic ? mark.topic : 'Not assigned yet')}
          </div>
          <div>
            <span class="badge ${statusBadge[mark && mark.status] || 'warn'}">${escapeHtml((mark && mark.status) || 'scheduled')}</span>
            ${graded ? `<span class="badge ok" style="margin-left:6px;">Graded: ${mark.marksObtained} / ${mark.totalMarks}</span>` : ''}
            ${mark && mark.remarks ? `<span class="row-meta" style="margin-left:10px;">${escapeHtml(mark.remarks)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div class="empty-state">Could not load presentations: ${escapeHtml(e.message)}</div>`;
  }
});
