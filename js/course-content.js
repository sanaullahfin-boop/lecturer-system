// ==========================================================================
// COURSE CONTENT + EBOOK LIBRARY
// Upload PDFs/files straight into the app (free — see js/files.js), or add a
// Google Drive / YouTube / any https link. Students open PDFs in a built-in
// reader that works on phones and in the Android app.
// ==========================================================================

let courses = [], settings, files = [], ebooks = [], mode = 'upload', picked = null;

requireAdmin(async (user, adminData) => {
  setUserChip((adminData && adminData.name) || user.email);
  settings = await loadSettings();
  courses = (await loadCoursesAndStudents()).courses;
  document.getElementById('upload-course').innerHTML = courseOptionsHtml(courses, { settings, activeOnly: true });
  document.getElementById('upload-category').innerHTML = listOf(settings, 'fileCategories').map(c => `<option>${h(c)}</option>`).join('');
  document.getElementById('filter-course').insertAdjacentHTML('beforeend', courseOptionsHtml(courses));
  await Promise.all([loadFiles(), loadEbooks()]);
  refreshUsage();
});

document.querySelectorAll('.tabs .tab-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs .tab-btn').forEach(x => x.classList.toggle('active', x === b));
  ['files', 'ebooks'].forEach(t => document.getElementById('tab-' + t).classList.toggle('hidden', t !== b.dataset.tab));
}));

function validLink(url) { return /^https:\/\/\S+$/i.test(url); }

async function refreshUsage() {
  try {
    const u = await storageUsage();
    const pct = Math.round(u.used / u.budget * 100);
    document.getElementById('storage-used').textContent = `${fmtBytes(u.used)} of ${fmtBytes(u.budget)} (${pct}%) in ${u.count} file${u.count === 1 ? '' : 's'}`;
  } catch (e) { document.getElementById('storage-used').textContent = '—'; }
}

/* ---------- Upload / link mode ---------- */

document.querySelectorAll('#file-mode button').forEach(b => b.addEventListener('click', () => {
  mode = b.dataset.mode;
  document.querySelectorAll('#file-mode button').forEach(x => x.classList.toggle('active', x === b));
  document.getElementById('upload-file-wrap').classList.toggle('hidden', mode !== 'upload');
  document.getElementById('upload-link-wrap').classList.toggle('hidden', mode !== 'link');
  document.getElementById('btn-upload').textContent = mode === 'upload' ? 'Upload' : 'Add Link';
  setMsg('upload-msg', '');
}));

const dz = document.getElementById('drop-zone'), fileInput = document.getElementById('upload-file');
dz.addEventListener('click', () => fileInput.click());
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', () => { if (fileInput.files[0]) pick(fileInput.files[0]); fileInput.value = ''; });

function pick(file) {
  picked = file;
  document.getElementById('drop-name').textContent = `${file.name} · ${fmtBytes(file.size)}${file.size > FILE_MAX ? ' — too big (limit 10 MB)' : ''}`;
  const nameBox = document.getElementById('upload-filename');
  if (!nameBox.value.trim()) nameBox.value = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');
  setMsg('upload-msg', '');
}

function progressBar(id, done, total) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  el.innerHTML = barHTML(Math.round(done / total * 100), 'ok');
}

document.getElementById('btn-upload').addEventListener('click', async () => {
  const courseCode = document.getElementById('upload-course').value;
  const category = document.getElementById('upload-category').value;
  const fileName = document.getElementById('upload-filename').value.trim();
  if (!courseCode || !fileName) { setMsg('upload-msg', 'Choose a course and type the name students will see.', 'error'); return; }
  const btn = document.getElementById('btn-upload');
  try {
    let record = { courseCode, category, fileName, addedAt: new Date().toISOString() };
    if (mode === 'upload') {
      if (!picked) { setMsg('upload-msg', 'Choose a file first.', 'error'); return; }
      const u = await storageUsage();
      if (u.used + picked.size > u.budget) { setMsg('upload-msg', 'The free storage space is full. Remove old files, or use a Google Drive link.', 'error'); return; }
      btn.disabled = true; btn.textContent = 'Uploading…';
      const meta = await uploadFileToApp(picked, (d, t) => progressBar('upload-progress', d, t));
      record = { ...record, ...meta, url: '' };
    } else {
      const url = document.getElementById('upload-link').value.trim();
      if (!validLink(url)) { setMsg('upload-msg', 'The link must start with https:// — copy the full share link.', 'error'); return; }
      btn.disabled = true; btn.textContent = 'Adding…';
      record.url = url;
    }
    await db.collection('courseContent').add(record);
    logChange('Course content added', `${courseCode}: ${fileName}${record.storage === 'app' ? ` (${fmtBytes(record.size)})` : ''}`);
    setMsg('upload-msg', mode === 'upload' ? `Uploaded "${fileName}". Students of ${courseCode} can open it now.` : 'Link added.', 'info');
    document.getElementById('upload-filename').value = '';
    document.getElementById('upload-link').value = '';
    document.getElementById('drop-name').textContent = '';
    picked = null;
    await loadFiles();
    refreshUsage();
  } catch (e) {
    setMsg('upload-msg', 'Could not add: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = mode === 'upload' ? 'Upload' : 'Add Link';
    setTimeout(() => document.getElementById('upload-progress').classList.add('hidden'), 1500);
  }
});

/* ---------- Files list ---------- */

document.getElementById('filter-course').addEventListener('change', loadFiles);

async function loadFiles() {
  const tbody = document.getElementById('files-body');
  const f = document.getElementById('filter-course').value;
  try {
    let q = db.collection('courseContent');
    if (f) q = q.where('courseCode', '==', f);
    const snap = await q.get();
    files = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
    document.getElementById('item-count').textContent = `${files.length} file${files.length === 1 ? '' : 's'}`;
    tbody.innerHTML = files.length ? files.map((x, i) => `<tr>
      <td>${contentLinkHTML(x, `openFile(${i})`)}</td>
      <td class="mono">${h(x.courseCode)}</td><td>${h(x.category)}</td>
      <td class="mono">${h(x.addedAt ? new Date(x.addedAt).toLocaleDateString('en-GB') : '')}</td>
      <td><button class="icon-btn danger" onclick="removeFile('${jsArg(x.id)}')">Remove</button></td>
    </tr>`).join('') : `<tr><td colspan="5"><div class="empty-state">No files added yet.</div></td></tr>`;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">Could not load: ${h(e.message)}</div></td></tr>`;
  }
}

window.openFile = i => openContentItem(files[i]);
window.openEbook = i => openContentItem(ebooks[i]);

window.removeFile = async function (id) {
  const item = files.find(x => x.id === id);
  if (!item) return;
  const msg = item.storage === 'app'
    ? `Remove "${item.fileName}"? The uploaded file is deleted from the app (keep your own copy).`
    : 'Remove this link from the list? (The file itself stays safe in your Google Drive.)';
  if (!confirm(msg)) return;
  try {
    await deleteStoredFile(item);
    await db.collection('courseContent').doc(id).delete();
    logChange('Course content removed', `${item.courseCode}: ${item.fileName}`);
    await loadFiles();
    refreshUsage();
  } catch (e) { toast('Could not remove: ' + e.message, 'error'); }
};

/* ---------- Ebooks ---------- */

async function loadEbooks() {
  const tbody = document.getElementById('ebooks-body');
  try {
    const snap = await db.collection('ebooks').get();
    ebooks = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.subject || '').localeCompare(b.subject || '') || (a.title || '').localeCompare(b.title || ''));
    tbody.innerHTML = ebooks.length ? ebooks.map((e, i) => `<tr>
      <td>${contentLinkHTML(e, `openEbook(${i})`)}</td>
      <td>${h(e.author || '—')}</td><td>${h(e.subject)}</td>
      <td><button class="icon-btn danger" onclick="removeEbook('${jsArg(e.id)}')">Remove</button></td>
    </tr>`).join('') : `<tr><td colspan="4"><div class="empty-state">No ebooks added yet.</div></td></tr>`;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">Could not load: ${h(e.message)}</div></td></tr>`;
  }
}

document.getElementById('btn-ebook-upload').addEventListener('click', async () => {
  const title = document.getElementById('ebook-title').value.trim();
  const author = document.getElementById('ebook-author').value.trim();
  const subject = document.getElementById('ebook-subject').value.trim();
  const url = document.getElementById('ebook-link').value.trim();
  const file = document.getElementById('ebook-file').files[0];
  if (!title || !subject) { setMsg('ebook-msg', 'Title and subject are required.', 'error'); return; }
  if (!file && !validLink(url)) { setMsg('ebook-msg', 'Choose a PDF file, or paste a link starting with https://', 'error'); return; }
  const btn = document.getElementById('btn-ebook-upload');
  btn.disabled = true; btn.textContent = file ? 'Uploading…' : 'Adding…';
  try {
    let rec = { title, author, subject, url: file ? '' : url, addedAt: new Date().toISOString() };
    if (file) {
      const u = await storageUsage();
      if (u.used + file.size > u.budget) throw new Error('The free storage space is full. Use a Google Drive link instead.');
      rec = { ...rec, ...(await uploadFileToApp(file, (d, t) => { btn.textContent = `Uploading ${Math.round(d / t * 100)}%`; })) };
    }
    await db.collection('ebooks').add(rec);
    logChange('Ebook added', title);
    setMsg('ebook-msg', 'Added.', 'info');
    ['ebook-title', 'ebook-author', 'ebook-subject', 'ebook-link', 'ebook-file'].forEach(id => { document.getElementById(id).value = ''; });
    await loadEbooks();
    refreshUsage();
  } catch (e) { setMsg('ebook-msg', 'Could not add: ' + e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Add Ebook'; }
});

window.removeEbook = async function (id) {
  const item = ebooks.find(x => x.id === id);
  if (!item || !confirm(`Remove "${item.title}"?${item.storage === 'app' ? ' The uploaded file is deleted from the app.' : ''}`)) return;
  try {
    await deleteStoredFile(item);
    await db.collection('ebooks').doc(id).delete();
    logChange('Ebook removed', item.title);
    await loadEbooks();
    refreshUsage();
  } catch (e) { toast('Could not remove: ' + e.message, 'error'); }
};
