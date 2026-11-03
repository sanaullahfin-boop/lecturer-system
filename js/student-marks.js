// ==========================================================================
// STUDENT MARKS — every mark + (if the lecturer allows it) running standing
// ==========================================================================

requireStudent(async (user, studentDoc) => {
  const d = studentDoc.data();
  const roll = studentDoc.id;
  setUserChip(d.name || roll);
  const settings = await loadSettings();
  const tbody = document.getElementById('table-body');
  const enrolled = d.course || [];
  try {
    const marksSnap = await db.collection('gradeMarks').where('rollNumber', '==', roll).get();
    const marks = marksSnap.docs.map(x => x.data());
    const codes = [...new Set([...enrolled, ...marks.map(m => m.courseCode)])];
    const itemDocs = codes.length ? await getWhereIn('gradeItems', 'courseCode', codes) : [];
    const itemsById = {};
    itemDocs.forEach(x => { itemsById[x.id] = { id: x.id, ...x.data() }; });

    const rows = marks.map(m => ({ ...m, item: itemsById[m.itemId] })).filter(m => m.item)
      .sort((a, b) => (b.item.dueDate || '').localeCompare(a.item.dueDate || ''));
    document.getElementById('item-count').textContent = `${rows.length} item${rows.length === 1 ? '' : 's'}`;
    tbody.innerHTML = rows.length ? rows.map(m => `<tr>
      <td>${h(m.item.title)}</td><td>${h(TYPE_LABEL[m.type] || m.type)}</td><td class="mono">${h(m.item.courseCode)}</td>
      <td class="mono">${h(m.item.dueDate ? fmtDate(m.item.dueDate) : '—')}</td>
      <td class="r num">${m.marksObtained ?? '—'} / ${m.totalMarks ?? '—'}</td>
      <td>${h(m.remarks || '—')}</td></tr>`).join('')
      : `<tr><td colspan="6"><div class="empty-state">No marks recorded yet.</div></td></tr>`;

    if (settings.grading.showStandingToStudents && enrolled.length) {
      const [att, adjSnap, coursesSnap] = await Promise.all([
        loadStudentAttendance(roll),
        db.collection('gradebookAdjustments').where('rollNumber', '==', roll).get(),
        db.collection('courses').get()
      ]);
      const adj = {};
      adjSnap.forEach(x => { adj[x.data().courseCode] = x.data(); });
      const cards = [];
      coursesSnap.forEach(cd => {
        if (!enrolled.includes(cd.id)) return;
        const c = { id: cd.id, ...cd.data() };
        const r = computeGradebook({
          course: c, roster: [{ id: roll, ...d }], settings,
          items: Object.values(itemsById).filter(it => it.courseCode === c.id),
          marks: marks.filter(m => m.courseCode === c.id),
          adjustments: adj[c.id] ? { [roll]: adj[c.id] } : {},
          attendance: { [roll]: att[c.id] || {} }
        })[0];
        cards.push(`<div class="progress-card">
          ${ringHTML(r.total || 0, 'sm ' + (r.total === null ? '' : r.passed ? 'ok' : 'danger'), r.total === null ? '—' : r.grade)}
          <div class="pc-body"><div class="pc-title">${h(c.id)} — ${h(c.title || '')}</div>
          <div class="pc-meta">${r.total === null ? 'No marks yet' : `Current total <b>${r.total}%</b> · Grade <b>${h(r.grade)}</b> · based on ${r.possible} of 100 marks assessed so far`}</div></div></div>`);
      });
      const el = document.getElementById('standing');
      el.innerHTML = `<div class="panel"><h3>My Current Standing</h3><div class="progress-list">${cards.join('')}</div>
        <p class="help" style="margin:10px 0 0;">This is a running estimate and can change as more work is graded.</p></div>`;
      el.classList.remove('hidden');
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">Could not load marks: ${h(e.message)}</div></td></tr>`;
  }
});
