// ==========================================================================
// ANNOUNCEMENTS
// ==========================================================================

document.getElementById('logout-btn').addEventListener('click', logout);

let courses = [], allAnnouncements = [];

requireAdmin(async (user, adminData) => {
  document.getElementById('admin-name').textContent = (adminData && adminData.name) || user.email;
  document.getElementById('admin-initial').textContent = ((adminData && adminData.name) || user.email).charAt(0).toUpperCase();
  const data = await loadCoursesAndStudents();
  courses = data.courses;
  document.getElementById('f-target').insertAdjacentHTML('beforeend', courseOptionsHtml(courses));
  await loadAnnouncements();
});

async function loadAnnouncements() {
  const tbody = document.getElementById('table-body');
  try {
    const snap = await db.collection('announcements').orderBy('postedAt', 'desc').get();
    allAnnouncements = [];
    snap.forEach(doc => allAnnouncements.push({ id: doc.id, ...doc.data() }));
    renderTable();
    document.getElementById('item-count').textContent = `${allAnnouncements.length} posted`;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">Could not load: ${escapeHtml(e.message)}</div></td></tr>`;
  }
}

function renderTable() {
  const tbody = document.getElementById('table-body');
  if (allAnnouncements.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">Nothing posted yet.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = allAnnouncements.map(a => `
    <tr>
      <td>${escapeHtml(a.title)}</td>
      <td>${escapeHtml(a.body)}</td>
      <td>${a.target === 'all' ? 'All students' : `<span class="mono">${escapeHtml(a.target)}</span>`}</td>
      <td class="mono">${new Date(a.postedAt).toLocaleDateString()}</td>
      <td><button class="icon-btn danger" onclick="removeAnnouncement('${escapeAttr(a.id)}')">Delete</button></td>
    </tr>
  `).join('');
}

document.getElementById('announce-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('form-msg');
  msg.textContent = ''; msg.className = 'form-msg';

  const title = document.getElementById('f-title').value.trim();
  const body = document.getElementById('f-body').value.trim();
  const target = document.getElementById('f-target').value;

  if (!title || !body) {
    msg.textContent = 'Please fill in both title and message.';
    msg.className = 'form-msg error';
    return;
  }

  const btn = document.getElementById('btn-save');
  btn.disabled = true; btn.textContent = 'Posting…';
  try {
    await db.collection('announcements').add({
      title, body, target, postedAt: new Date().toISOString(), postedBy: auth.currentUser.uid
    });
    document.getElementById('announce-form').reset();
    await loadAnnouncements();
  } catch (err) {
    msg.textContent = 'Could not post: ' + err.message;
    msg.className = 'form-msg error';
  } finally {
    btn.disabled = false; btn.textContent = 'Post Announcement';
  }
});

window.removeAnnouncement = async function (id) {
  if (!confirm('Delete this announcement?')) return;
  try {
    await db.collection('announcements').doc(id).delete();
    await loadAnnouncements();
  } catch (e) {
    alert('Could not delete: ' + e.message);
  }
};
