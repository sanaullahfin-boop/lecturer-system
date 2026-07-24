// ==========================================================================
// COURSE CONTENT + EBOOK LIBRARY  (Google Drive links + Firestore metadata —
// no Firebase Storage, so no billing/credit card is ever required)
// ==========================================================================

document.getElementById('logout-btn').addEventListener('click', logout);

let courses = [];

requireAdmin(async (user, adminData) => {
  document.getElementById('admin-name').textContent = (adminData && adminData.name) || user.email;
  document.getElementById('admin-initial').textContent = ((adminData && adminData.name) || user.email).charAt(0).toUpperCase();
  const data = await loadCoursesAndStudents();
  courses = data.courses;
  document.getElementById('upload-course').innerHTML = courseOptionsHtml(courses);
  document.getElementById('filter-course').insertAdjacentHTML('beforeend', courseOptionsHtml(courses));
  await loadFiles();
  await loadEbooks();
});

// ---------- Tabs ----------

document.getElementById('tab-files').addEventListener('click', () => switchTab('files'));
document.getElementById('tab-ebooks').addEventListener('click', () => switchTab('ebooks'));

function switchTab(which) {
  document.getElementById('tab-files').classList.toggle('active', which === 'files');
  document.getElementById('tab-ebooks').classList.toggle('active', which === 'ebooks');
  document.getElementById('panel-files').style.display = which === 'files' ? 'block' : 'none';
  document.getElementById('panel-ebooks').style.display = which === 'ebooks' ? 'block' : 'none';
}

// ---------- Course Files ----------

document.getElementById('filter-course').addEventListener('change', loadFiles);

async function loadFiles() {
  const tbody = document.getElementById('files-body');
  const courseFilter = document.getElementById('filter-course').value;
  try {
    let query = db.collection('courseContent');
    if (courseFilter) query = query.where('courseCode', '==', courseFilter);
    const snap = await query.get();
    const files = [];
    snap.forEach(doc => files.push({ id: doc.id, ...doc.data() }));
    files.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));

    if (files.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">No files added yet.</div></td></tr>`;
    } else {
      tbody.innerHTML = files.map(f => `
        <tr>
          <td><a href="${escapeAttr(f.url)}" target="_blank" rel="noopener">${escapeHtml(f.fileName)}</a></td>
          <td class="mono">${escapeHtml(f.courseCode)}</td>
          <td>${escapeHtml(f.category)}</td>
          <td class="mono">${new Date(f.addedAt).toLocaleDateString()}</td>
          <td><button class="icon-btn danger" onclick="removeFile('${escapeAttr(f.id)}')">Delete</button></td>
        </tr>
      `).join('');
    }
    document.getElementById('item-count').textContent = `${files.length} file${files.length === 1 ? '' : 's'}`;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">Could not load: ${escapeHtml(e.message)}</div></td></tr>`;
  }
}

document.getElementById('btn-upload').addEventListener('click', async () => {
  const courseCode = document.getElementById('upload-course').value;
  const category = document.getElementById('upload-category').value;
  const fileName = document.getElementById('upload-filename').value.trim();
  const url = document.getElementById('upload-link').value.trim();
  const msg = document.getElementById('upload-msg');
  msg.textContent = ''; msg.className = 'form-msg';

  if (!courseCode || !fileName || !url) {
    msg.textContent = 'Course, file name, and a Google Drive link are all required.';
    msg.className = 'form-msg error';
    return;
  }
  if (!url.includes('drive.google.com') && !url.startsWith('https://')) {
    msg.textContent = 'That doesn\'t look like a valid link — make sure you copied the full Google Drive share URL.';
    msg.className = 'form-msg error';
    return;
  }

  const btn = document.getElementById('btn-upload');
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    await db.collection('courseContent').add({
      courseCode, category, fileName, url, addedAt: new Date().toISOString()
    });
    msg.textContent = 'Added.';
    msg.className = 'form-msg info';
    document.getElementById('upload-filename').value = '';
    document.getElementById('upload-link').value = '';
    await loadFiles();
  } catch (e) {
    msg.textContent = 'Could not add: ' + e.message;
    msg.className = 'form-msg error';
  } finally {
    btn.disabled = false; btn.textContent = 'Add File';
  }
});

window.removeFile = async function (id) {
  if (!confirm('Remove this file from the list? (The file itself stays safe in your Google Drive — this only removes it from the app.)')) return;
  try {
    await db.collection('courseContent').doc(id).delete();
    await loadFiles();
  } catch (e) {
    alert('Could not remove: ' + e.message);
  }
};

// ---------- Ebooks ----------

async function loadEbooks() {
  const tbody = document.getElementById('ebooks-body');
  try {
    const snap = await db.collection('ebooks').get();
    const ebooks = [];
    snap.forEach(doc => ebooks.push({ id: doc.id, ...doc.data() }));
    ebooks.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));

    if (ebooks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">No ebooks added yet.</div></td></tr>`;
      return;
    }
    tbody.innerHTML = ebooks.map(e => `
      <tr>
        <td><a href="${escapeAttr(e.url)}" target="_blank" rel="noopener">${escapeHtml(e.title)}</a></td>
        <td>${escapeHtml(e.author || '—')}</td>
        <td>${escapeHtml(e.subject)}</td>
        <td><button class="icon-btn danger" onclick="removeEbook('${escapeAttr(e.id)}')">Delete</button></td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">Could not load: ${escapeHtml(e.message)}</div></td></tr>`;
  }
}

document.getElementById('btn-ebook-upload').addEventListener('click', async () => {
  const title = document.getElementById('ebook-title').value.trim();
  const author = document.getElementById('ebook-author').value.trim();
  const subject = document.getElementById('ebook-subject').value.trim();
  const url = document.getElementById('ebook-link').value.trim();
  const msg = document.getElementById('ebook-msg');
  msg.textContent = ''; msg.className = 'form-msg';

  if (!title || !subject || !url) {
    msg.textContent = 'Title, subject, and a Google Drive link are all required.';
    msg.className = 'form-msg error';
    return;
  }
  if (!url.includes('drive.google.com') && !url.startsWith('https://')) {
    msg.textContent = 'That doesn\'t look like a valid link — make sure you copied the full Google Drive share URL.';
    msg.className = 'form-msg error';
    return;
  }

  const btn = document.getElementById('btn-ebook-upload');
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    await db.collection('ebooks').add({
      title, author, subject, url, addedAt: new Date().toISOString()
    });
    msg.textContent = 'Added.';
    msg.className = 'form-msg info';
    document.getElementById('ebook-title').value = '';
    document.getElementById('ebook-author').value = '';
    document.getElementById('ebook-subject').value = '';
    document.getElementById('ebook-link').value = '';
    await loadEbooks();
  } catch (e) {
    msg.textContent = 'Could not add: ' + e.message;
    msg.className = 'form-msg error';
  } finally {
    btn.disabled = false; btn.textContent = 'Add Ebook';
  }
});

window.removeEbook = async function (id) {
  if (!confirm('Remove this ebook from the list? (The file itself stays safe in your Google Drive.)')) return;
  try {
    await db.collection('ebooks').doc(id).delete();
    await loadEbooks();
  } catch (e) {
    alert('Could not remove: ' + e.message);
  }
};
