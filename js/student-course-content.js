// ==========================================================================
// STUDENT COURSE CONTENT — files for my courses + ebook library
// ==========================================================================

document.querySelectorAll('.tabs .tab-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs .tab-btn').forEach(x => x.classList.toggle('active', x === b));
  ['files', 'ebooks'].forEach(t => document.getElementById('tab-' + t).classList.toggle('hidden', t !== b.dataset.tab));
}));

requireStudent(async (user, studentDoc) => {
  const d = studentDoc.data();
  setUserChip(d.name || studentDoc.id);
  const enrolled = d.course || [];
  const filesBody = document.getElementById('files-body');
  let files = [], ebooks = [], shownFiles = [], shownEbooks = [];
  window.openFile = i => openContentItem(shownFiles[i]);
  window.openEbook = i => openContentItem(shownEbooks[i]);

  const drawFiles = () => {
    const q = document.getElementById('file-search').value.toLowerCase();
    const list = files.filter(f => !q || [f.fileName, f.courseCode, f.category].some(v => (v || '').toLowerCase().includes(q)));
    shownFiles = list;
    filesBody.innerHTML = list.length ? list.map((f, i) => `<tr>
      <td>${contentLinkHTML(f, `openFile(${i})`)}</td>
      <td class="mono">${h(f.courseCode)}</td><td>${h(f.category)}</td>
      <td class="mono">${h(f.addedAt ? new Date(f.addedAt).toLocaleDateString('en-GB') : '')}</td></tr>`).join('')
      : `<tr><td colspan="4"><div class="empty-state">${files.length ? 'No files match.' : 'No files uploaded yet for your courses.'}</div></td></tr>`;
  };
  const drawEbooks = () => {
    const q = document.getElementById('ebook-search').value.toLowerCase();
    const list = ebooks.filter(e => !q || [e.title, e.author, e.subject].some(v => (v || '').toLowerCase().includes(q)));
    shownEbooks = list;
    document.getElementById('ebooks-body').innerHTML = list.length ? list.map((e, i) => `<tr>
      <td>${contentLinkHTML(e, `openEbook(${i})`)}</td>
      <td>${h(e.author || '—')}</td><td>${h(e.subject)}</td></tr>`).join('')
      : `<tr><td colspan="3"><div class="empty-state">${ebooks.length ? 'No ebooks match.' : 'No ebooks added yet.'}</div></td></tr>`;
  };
  document.getElementById('file-search').addEventListener('input', drawFiles);
  document.getElementById('ebook-search').addEventListener('input', drawEbooks);

  try {
    if (!enrolled.length) {
      filesBody.innerHTML = `<tr><td colspan="4"><div class="empty-state">You're not enrolled in any course yet.</div></td></tr>`;
    } else {
      files = (await getWhereIn('courseContent', 'courseCode', enrolled)).map(x => x.data()).sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
      document.getElementById('item-count').textContent = `${files.length} file${files.length === 1 ? '' : 's'}`;
      drawFiles();
    }
  } catch (e) { filesBody.innerHTML = `<tr><td colspan="4"><div class="empty-state">Could not load: ${h(e.message)}</div></td></tr>`; }
  try {
    ebooks = (await db.collection('ebooks').get()).docs.map(x => x.data()).sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));
    drawEbooks();
  } catch (e) { document.getElementById('ebooks-body').innerHTML = `<tr><td colspan="3"><div class="empty-state">Could not load: ${h(e.message)}</div></td></tr>`; }
});
