// ==========================================================================
// STUDENT ASSIGNMENTS — assignments for enrolled courses, own marks shown
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
      db.collection('gradeItems').where('type', '==', 'assignment').where('courseCode', 'in', enrolledCourses.slice(0, 10)).get(),
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

    document.getElementById('item-count').textContent = `${items.length} assignment${items.length === 1 ? '' : 's'}`;

    if (items.length === 0) {
      list.innerHTML = `<div class="empty-state">No assignments yet.</div>`;
      return;
    }

    list.innerHTML = items.map(it => {
      const mark = marksByItemId[it.id];
      const graded = mark && mark.marksObtained !== null && mark.marksObtained !== undefined;
      return `
        <div class="panel" style="margin-bottom:14px;">
          <h3 style="margin-bottom:8px;">${escapeHtml(it.title)}</h3>
          <div class="row-meta" style="margin-bottom:8px;">${escapeHtml(it.courseCode)} · Due ${escapeHtml(it.dueDate || '—')} · Total Marks: ${it.totalMarks ?? '—'}</div>
          ${it.description ? `<p style="font-size:13.5px;margin:0 0 8px;">${escapeHtml(it.description)}</p>` : ''}
          ${it.instructions ? `<p style="font-size:13px;color:var(--slate);margin:0 0 8px;"><strong>Instructions:</strong> ${escapeHtml(it.instructions)}</p>` : ''}
          ${it.attachmentUrl ? `<p style="font-size:13px;margin:0 0 8px;"><a href="${escapeHtml(it.attachmentUrl)}" target="_blank" rel="noopener">View attachment</a></p>` : ''}
          <div>
            ${graded
              ? `<span class="badge ok">Graded: ${mark.marksObtained} / ${mark.totalMarks}</span>`
              : `<span class="badge warn">Not yet graded</span>`}
            ${mark && mark.remarks ? `<span class="row-meta" style="margin-left:10px;">${escapeHtml(mark.remarks)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div class="empty-state">Could not load assignments: ${escapeHtml(e.message)}</div>`;
  }
});
