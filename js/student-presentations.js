// ==========================================================================
// STUDENT PRESENTATIONS — my rounds: topic, status, marks
// ==========================================================================

requireStudent(async (user, studentDoc) => {
  const d = studentDoc.data();
  const roll = studentDoc.id;
  setUserChip(d.name || roll);
  const enrolled = d.course || [];
  const list = document.getElementById('list');
  if (!enrolled.length) { list.innerHTML = `<div class="empty-state">You're not enrolled in any course yet — ask your lecturer to add course codes to your profile.</div>`; return; }
  try {
    const [itemDocs, marksSnap] = await Promise.all([
      getWhereIn('gradeItems', 'courseCode', enrolled, q => q.where('type', '==', 'presentation')),
      db.collection('gradeMarks').where('rollNumber', '==', roll).get()
    ]);
    const marks = {};
    marksSnap.forEach(x => { marks[x.data().itemId] = x.data(); });
    const items = itemDocs.map(x => ({ id: x.id, ...x.data() })).filter(it => appliesTo(it, roll))
      .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));
    document.getElementById('item-count').textContent = `${items.length} round${items.length === 1 ? '' : 's'}`;
    if (!items.length) { list.innerHTML = `<div class="empty-state">No presentation rounds yet.</div>`; return; }
    const badge = { scheduled: 'warn', completed: 'ok', 'no-show': 'danger' };
    list.innerHTML = items.map(it => {
      const m = marks[it.id];
      const graded = m && m.marksObtained !== null && m.marksObtained !== undefined;
      return `<div class="panel" style="margin-bottom:14px;">
        <h3 style="margin-bottom:8px;">${h(it.title)}</h3>
        <div class="row-meta" style="margin-bottom:8px;">${h(it.courseCode)} · ${h(it.dueDate ? fmtDate(it.dueDate) : '—')} · Total Marks: ${it.totalMarks ?? '—'}</div>
        ${it.description ? `<p style="font-size:13px;margin:0 0 8px;white-space:pre-line;">${h(it.description)}</p>` : ''}
        <div style="margin-bottom:8px;"><strong>My Topic:</strong> ${h(m && m.topic ? m.topic : 'Not assigned yet')}</div>
        <div><span class="badge ${badge[m && m.status] || 'warn'}">${h((m && m.status) || 'scheduled')}</span>
          ${graded ? `<span class="badge ok" style="margin-left:6px;">Graded: ${m.marksObtained} / ${m.totalMarks}</span>` : ''}
          ${m && m.remarks ? `<span class="row-meta" style="margin-left:10px;">${h(m.remarks)}</span>` : ''}</div>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div class="empty-state">Could not load presentations: ${h(e.message)}</div>`;
  }
});
