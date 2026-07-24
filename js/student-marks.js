// ==========================================================================
// STUDENT MARKS — own records only, across every grade item type
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
  const tbody = document.getElementById('table-body');

  try {
    const marksSnap = await db.collection('gradeMarks').where('rollNumber', '==', roll).get();
    const marks = [];
    marksSnap.forEach(doc => marks.push(doc.data()));

    if (marks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">No marks recorded yet.</div></td></tr>`;
      document.getElementById('item-count').textContent = '0 items';
      return;
    }

    const itemIds = [...new Set(marks.map(m => m.itemId))];
    const itemsById = {};
    for (let i = 0; i < itemIds.length; i += 10) {
      const chunk = itemIds.slice(i, i + 10);
      const itemsSnap = await db.collection('gradeItems').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
      itemsSnap.forEach(doc => { itemsById[doc.id] = doc.data(); });
    }

    const typeLabel = { assignment: 'Assignment', presentation: 'Presentation', quiz: 'Quiz', task: 'Task', exam: 'Internal Exam' };
    const rows = marks
      .map(m => ({ ...m, item: itemsById[m.itemId] }))
      .filter(m => m.item)
      .sort((a, b) => (b.item.dueDate || '').localeCompare(a.item.dueDate || ''));

    document.getElementById('item-count').textContent = `${rows.length} item${rows.length === 1 ? '' : 's'}`;

    tbody.innerHTML = rows.map(m => `
      <tr>
        <td>${escapeHtml(m.item.title)}</td>
        <td>${escapeHtml(typeLabel[m.type] || m.type)}</td>
        <td class="mono">${escapeHtml(m.item.courseCode)}</td>
        <td class="mono">${escapeHtml(m.item.dueDate || '—')}</td>
        <td class="num">${m.marksObtained ?? '—'} / ${m.totalMarks ?? '—'}</td>
        <td>${escapeHtml(m.remarks || '—')}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">Could not load marks: ${escapeHtml(e.message)}</div></td></tr>`;
  }
});
