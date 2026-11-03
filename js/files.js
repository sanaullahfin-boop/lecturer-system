// ==========================================================================
// FILES — upload PDFs (and other files) straight into the app, free.
//
// Firebase Storage needs a credit card, so files are stored inside the free
// Firestore database instead: each file is cut into pieces of 900 KB
// (fileChunks/{fileId}__{n}) and put back together when someone opens it.
// Free space: 1 GB in total for data + files, so files are limited to 10 MB
// each and the page shows how much space is used.
//
// Also: an in-app PDF viewer (pdf.js, bundled — works on phones and inside
// the Android app) and a Google Drive preview for link-based files.
// ==========================================================================

const FILE_CHUNK = 900 * 1024;
const FILE_MAX = 10 * 1024 * 1024;
const FILE_BUDGET = 900 * 1024 * 1024;   // leave ~100 MB of the free 1 GB for records

function fmtBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
}
function newFileId() {
  const a = new Uint32Array(2); crypto.getRandomValues(a);
  return 'f' + Date.now().toString(36) + a[0].toString(36) + a[1].toString(36);
}
function isPdfItem(item) {
  return (item.mime || '').includes('pdf') || /\.pdf$/i.test(item.originalName || item.fileName || item.title || '');
}

/** Uploads a File into Firestore chunks. Returns metadata to store on the content record. */
async function uploadFileToApp(file, onProgress) {
  if (!navigator.onLine) throw new Error('You need internet to upload a file.');
  if (file.size > FILE_MAX) throw new Error(`This file is ${fmtBytes(file.size)}. The limit is ${fmtBytes(FILE_MAX)} — compress the PDF (free: ilovepdf.com → Compress PDF) or share it as a Google Drive link instead.`);
  if (!file.size) throw new Error('This file is empty.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileId = newFileId();
  const n = Math.ceil(bytes.length / FILE_CHUNK);
  for (let i = 0; i < n; i++) {
    const part = bytes.subarray(i * FILE_CHUNK, Math.min(bytes.length, (i + 1) * FILE_CHUNK));
    await db.collection('fileChunks').doc(`${fileId}__${i}`).set({
      fileId, i, n, data: firebase.firestore.Blob.fromUint8Array(part)
    });
    if (onProgress) onProgress(i + 1, n);
  }
  return { storage: 'app', fileId, chunkCount: n, size: bytes.length, mime: file.type || '', originalName: file.name };
}

/** Rebuilds a stored file (cache first, so re-opening costs nothing). */
async function fetchStoredFile(item, onProgress) {
  const parts = [];
  for (let i = 0; i < item.chunkCount; i++) {
    const ref = db.collection('fileChunks').doc(`${item.fileId}__${i}`);
    let snap = null;
    try { snap = await ref.get({ source: 'cache' }); } catch (e) { snap = null; }
    if (!snap || !snap.exists) snap = await ref.get();
    if (!snap.exists) throw new Error('Part of this file is missing. Ask your lecturer to upload it again.');
    parts.push(snap.data().data.toUint8Array());
    if (onProgress) onProgress(i + 1, item.chunkCount);
  }
  return new Blob(parts, { type: item.mime || (isPdfItem(item) ? 'application/pdf' : 'application/octet-stream') });
}

/** Deletes a stored file's pieces (call when removing the content record). */
async function deleteStoredFile(item) {
  if (!item || item.storage !== 'app' || !item.fileId) return;
  const ops = [];
  for (let i = 0; i < item.chunkCount; i++) ops.push(b => b.delete(db.collection('fileChunks').doc(`${item.fileId}__${i}`)));
  await writeInBatches(ops);
}

/** Total size of files stored in the app (from content + ebook records). */
async function storageUsage() {
  const [a, b] = await Promise.all([db.collection('courseContent').get(), db.collection('ebooks').get()]);
  let used = 0, count = 0;
  [...a.docs, ...b.docs].forEach(d => { const x = d.data(); if (x.storage === 'app') { used += x.size || 0; count++; } });
  return { used, count, budget: FILE_BUDGET };
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name || 'file';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ---------------- pdf.js (bundled) ---------------- */

let _pdfjs = null;
async function loadPdfJs() {
  if (_pdfjs) return _pdfjs;
  const base = new URL('js/vendor/', document.baseURI).href;
  _pdfjs = await import(base + 'pdf.min.js');
  _pdfjs.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
  return _pdfjs;
}

/* ---------------- Viewer modal ---------------- */

function ensureViewer() {
  let m = document.getElementById('file-viewer');
  if (m) return m;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="file-viewer">
      <div class="modal viewer-modal">
        <div class="viewer-bar">
          <div class="viewer-title" id="fv-title"></div>
          <div class="gap-row">
            <span class="muted small" id="fv-pages"></span>
            <button class="btn btn-outline" id="fv-zoom-out" title="Smaller">−</button>
            <button class="btn btn-outline" id="fv-zoom-in" title="Bigger">+</button>
            <button class="btn btn-outline" id="fv-download">Download</button>
            <a class="btn btn-outline hidden" id="fv-external" target="_blank" rel="noopener" style="text-decoration:none;">Open in Drive</a>
            <button class="btn btn-primary-sm" id="fv-close">Close</button>
          </div>
        </div>
        <div class="viewer-body" id="fv-body"></div>
      </div>
    </div>`);
  m = document.getElementById('file-viewer');
  const close = () => { m.classList.remove('open'); document.getElementById('fv-body').innerHTML = ''; viewerState.doc = null; };
  document.getElementById('fv-close').addEventListener('click', close);
  m.addEventListener('click', e => { if (e.target === m) close(); });
  document.getElementById('fv-zoom-in').addEventListener('click', () => { viewerState.zoom = Math.min(3, viewerState.zoom * 1.25); renderPdfPages(); });
  document.getElementById('fv-zoom-out').addEventListener('click', () => { viewerState.zoom = Math.max(0.5, viewerState.zoom / 1.25); renderPdfPages(); });
  document.getElementById('fv-download').addEventListener('click', () => { if (viewerState.blob) downloadBlob(viewerState.blob, viewerState.name); });
  return m;
}
const viewerState = { doc: null, zoom: 1, blob: null, name: '', token: 0 };

async function renderPdfPages() {
  const body = document.getElementById('fv-body');
  const doc = viewerState.doc;
  if (!doc) return;
  const token = ++viewerState.token;
  body.innerHTML = '';
  const width = Math.max(280, body.clientWidth - 24);
  const ratio = window.devicePixelRatio || 1;
  for (let p = 1; p <= doc.numPages; p++) {
    if (token !== viewerState.token) return;
    const page = await doc.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const scale = width / base.width * viewerState.zoom;
    const vp = page.getViewport({ scale: scale * ratio });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    canvas.style.width = (vp.width / ratio) + 'px'; canvas.style.height = (vp.height / ratio) + 'px';
    canvas.className = 'viewer-page';
    canvas.setAttribute('aria-label', `Page ${p}`);
    body.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  }
}

/** Opens a PDF Blob in the in-app viewer. */
async function openPdfViewer(blob, name) {
  const m = ensureViewer();
  document.getElementById('fv-title').textContent = name || 'Document';
  document.getElementById('fv-external').classList.add('hidden');
  document.getElementById('fv-download').classList.remove('hidden');
  document.getElementById('fv-zoom-in').classList.remove('hidden');
  document.getElementById('fv-zoom-out').classList.remove('hidden');
  const body = document.getElementById('fv-body');
  body.innerHTML = '<div class="empty-state"><span class="loading-dot"></span> Opening…</div>';
  m.classList.add('open');
  viewerState.blob = blob; viewerState.name = name; viewerState.zoom = 1;
  try {
    const pdfjs = await loadPdfJs();
    viewerState.doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    document.getElementById('fv-pages').textContent = `${viewerState.doc.numPages} page${viewerState.doc.numPages === 1 ? '' : 's'}`;
    await renderPdfPages();
  } catch (e) {
    body.innerHTML = `<div class="empty-state">This PDF could not be shown here (${h(e.message)}). Use Download to open it on your device.</div>`;
  }
}

/** Google Drive file link → its in-app preview URL (or null). */
function drivePreviewUrl(url) {
  const m = String(url || '').match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{10,})/);
  return m ? `https://drive.google.com/file/d/${m[1]}/preview` : null;
}

function openDrivePreview(url, name) {
  const m = ensureViewer();
  document.getElementById('fv-title').textContent = name || 'Document';
  document.getElementById('fv-pages').textContent = '';
  ['fv-download', 'fv-zoom-in', 'fv-zoom-out'].forEach(id => document.getElementById(id).classList.add('hidden'));
  const ext = document.getElementById('fv-external');
  ext.href = url; ext.classList.remove('hidden');
  document.getElementById('fv-body').innerHTML = `<iframe class="viewer-frame" src="${h(drivePreviewUrl(url))}" allow="autoplay" title="${h(name || 'Document')}"></iframe>`;
  viewerState.doc = null; viewerState.blob = null;
  m.classList.add('open');
}

/** Opens any content/ebook record the best way: in-app viewer, Drive preview, or new tab. */
async function openContentItem(item) {
  const name = item.fileName || item.title || item.originalName || 'file';
  if (item.storage === 'app') {
    try {
      const blob = await fetchStoredFile(item);
      if (isPdfItem(item)) await openPdfViewer(blob, name);
      else downloadBlob(blob, item.originalName || name);
    } catch (e) {
      (typeof toast === 'function' ? toast : alert)('Could not open the file: ' + e.message, 'error');
    }
    return;
  }
  if (drivePreviewUrl(item.url)) { openDrivePreview(item.url, name); return; }
  if (/^https?:\/\//i.test(item.url || '')) window.open(item.url, '_blank', 'noopener');
}

/** Small HTML for a content row's "open" link. idx = position in the caller's list. */
function contentLinkHTML(item, onclickJs) {
  const name = item.fileName || item.title || '';
  const badge = item.storage === 'app'
    ? `<span class="chip ok" title="Stored in the app">${isPdfItem(item) ? 'PDF' : 'File'} · ${h(fmtBytes(item.size))}</span>`
    : drivePreviewUrl(item.url) ? '<span class="chip">Drive</span>' : '<span class="chip">Link</span>';
  return `<a href="#" onclick="${onclickJs};return false;">${h(name)}</a> ${badge}`;
}
