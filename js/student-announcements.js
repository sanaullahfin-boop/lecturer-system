// ==========================================================================
// STUDENT ANNOUNCEMENTS — "all" + my courses
// ==========================================================================

requireStudent(async (user, studentDoc) => {
  const d = studentDoc.data();
  setUserChip(d.name || studentDoc.id);
  const list = document.getElementById('list');
  try {
    const snap = await db.collection('announcements').orderBy('postedAt', 'desc').get();
    const enrolled = d.course || [];
    const mine = snap.docs.map(x => x.data()).filter(a => a.target === 'all' || enrolled.includes(a.target));
    document.getElementById('item-count').textContent = `${mine.length} announcement${mine.length === 1 ? '' : 's'}`;
    list.innerHTML = mine.length ? mine.map(a => `
      <div class="list-row" style="align-items:flex-start;">
        <div><div class="row-title">${h(a.title)} ${a.target !== 'all' ? `<span class="chip">${h(a.target)}</span>` : ''}</div>
        <div class="row-meta" style="white-space:pre-line;margin-top:4px;">${h(a.body)}</div></div>
        <div class="row-meta mono" style="white-space:nowrap;margin-left:12px;">${h(new Date(a.postedAt).toLocaleDateString('en-GB'))}</div>
      </div>`).join('') : `<div class="empty-state">Nothing posted yet.</div>`;
  } catch (e) {
    list.innerHTML = `<div class="empty-state">Could not load announcements: ${h(e.message)}</div>`;
  }
});
