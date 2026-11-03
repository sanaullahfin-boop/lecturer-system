// ==========================================================================
// ANNOUNCEMENTS — post to everyone or one course; optional WhatsApp forward
// ==========================================================================

let courses = [], allAnnouncements = [], settings;

requireAdmin(async (user, adminData) => {
  setUserChip((adminData && adminData.name) || user.email);
  settings = await loadSettings();
  courses = (await loadCoursesAndStudents()).courses;
  document.getElementById('f-target').insertAdjacentHTML('beforeend', courseOptionsHtml(courses, { settings, activeOnly: true }));
  await loadAnnouncements();
});

async function loadAnnouncements() {
  const tbody = document.getElementById('table-body');
  try {
    const snap = await db.collection('announcements').orderBy('postedAt', 'desc').get();
    allAnnouncements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    document.getElementById('item-count').textContent = `${allAnnouncements.length} posted`;
    if (!allAnnouncements.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">Nothing posted yet.</div></td></tr>`;
      return;
    }
    tbody.innerHTML = allAnnouncements.map(a => `<tr>
      <td><b>${h(a.title)}</b></td>
      <td style="white-space:pre-line;">${h(a.body)}</td>
      <td>${a.target === 'all' ? 'All students' : `<span class="mono">${h(a.target)}</span>`}</td>
      <td class="mono">${h(new Date(a.postedAt).toLocaleDateString('en-GB'))}</td>
      <td><div class="row-actions">
        <a class="icon-btn" style="text-decoration:none;" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(waText(a))}">WhatsApp</a>
        <button class="icon-btn danger" onclick="removeAnnouncement('${jsArg(a.id)}')">Delete</button>
      </div></td>
    </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">Could not load: ${h(e.message)}</div></td></tr>`;
  }
}

function waText(a) {
  return `*${a.title}*\n${a.body}${a.target && a.target !== 'all' ? `\n(${a.target})` : ''}\n— ${settings.institution.teacher || ''}`;
}

document.getElementById('announce-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('f-title').value.trim();
  const body = document.getElementById('f-body').value.trim();
  const target = document.getElementById('f-target').value;
  if (!title || !body) { setMsg('form-msg', 'Please fill in both title and message.', 'error'); return; }
  const btn = document.getElementById('btn-save');
  btn.disabled = true; btn.textContent = 'Posting…';
  const ann = { title, body, target, postedAt: new Date().toISOString(), postedBy: auth.currentUser.uid };
  // open WhatsApp synchronously (inside the click) so pop-up blockers allow it
  const wantWa = document.getElementById('f-wa').checked;
  const waWin = wantWa ? window.open(`https://wa.me/?text=${encodeURIComponent(waText(ann))}`, '_blank') : null;
  try {
    await commitSmart(db.collection('announcements').add(ann));
    document.getElementById('announce-form').reset();
    setMsg('form-msg', 'Posted.', 'info');
    await loadAnnouncements();
  } catch (err) {
    if (waWin) waWin.close();
    setMsg('form-msg', 'Could not post: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Post Announcement';
  }
});

window.removeAnnouncement = async function (id) {
  if (!confirm('Delete this announcement?')) return;
  try {
    await commitSmart(db.collection('announcements').doc(id).delete());
    await loadAnnouncements();
  } catch (e) { toast('Could not delete: ' + e.message, 'error'); }
};
