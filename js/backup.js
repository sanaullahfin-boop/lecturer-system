// ==========================================================================
// BACKUP & RESTORE
// ==========================================================================

// Every collection, except `admins` (lecturer logins are set up manually in
// the Firebase Console). `attendance` is the old (v1) format — still backed
// up so nothing is ever lost, even before the one-time upgrade.
const BACKUP_COLLECTIONS = [
  'students', 'studentLogins', 'courses', 'attendanceSummary', 'coursePlans', 'gradeItems', 'gradeMarks',
  'gradebookAdjustments', 'announcements', 'courseContent', 'ebooks', 'quizPapers', 'quizKeys', 'quizAttempts', 'submissions', 'checkins', 'checkinResponses', 'leaveRequests', 'auditLog', 'settings', 'attendance'
];
// Reset All Data keeps your settings.
// Reset keeps your settings and the change history; uploaded file pieces are removed too.
const RESET_COLLECTIONS = BACKUP_COLLECTIONS.filter(c => c !== 'settings' && c !== 'auditLog');

/** Firestore binary (uploaded file pieces) ⇄ text, so the .json backup can carry files. */
function bytesToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function b64ToBytes(b64) { const s = atob(b64), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; }
function packBinary(v) {
  if (v && typeof v.toUint8Array === 'function') return { __bytes: bytesToB64(v.toUint8Array()) };
  if (Array.isArray(v)) return v.map(packBinary);
  if (v && typeof v === 'object' && !(typeof v.toMillis === 'function')) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, packBinary(x)]));
  return v;
}
function unpackBinary(v) {
  if (v && typeof v === 'object' && typeof v.__bytes === 'string') return firebase.firestore.Blob.fromUint8Array(b64ToBytes(v.__bytes));
  if (Array.isArray(v)) return v.map(unpackBinary);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unpackBinary(x)]));
  return v;
}

requireAdmin(async (user, adminData) => {
  setUserChip((adminData && adminData.name) || user.email);
  const settings = await loadSettings(true);
  document.getElementById('last-backup').textContent = settings.lastBackupAt
    ? `Last backup downloaded: ${new Date(settings.lastBackupAt).toLocaleString('en-GB')}`
    : 'No backup downloaded yet from this app.';
});

function markBackupDone() {
  saveSettings({ lastBackupAt: new Date().toISOString() }).then(s => {
    document.getElementById('last-backup').textContent = `Last backup downloaded: ${new Date(s.lastBackupAt).toLocaleString('en-GB')}`;
  }).catch(() => {});
}

// ---------- Backup ----------

document.getElementById('btn-backup').addEventListener('click', async () => {
  const btn = document.getElementById('btn-backup');
  const msg = document.getElementById('backup-msg');
  btn.disabled = true; btn.textContent = 'Preparing backup…';
  msg.textContent = ''; msg.className = 'form-msg';

  try {
    const payload = { exportedAt: new Date().toISOString(), collections: {} };
    const withFiles = document.getElementById('backup-files').checked;
    for (const name of withFiles ? [...BACKUP_COLLECTIONS, 'fileChunks'] : BACKUP_COLLECTIONS) {
      const snap = await db.collection(name).get();
      payload.collections[name] = snap.docs.map(doc => ({ id: doc.id, data: packBinary(doc.data()) }));
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lms-backup-${localToday()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    const counts = Object.entries(payload.collections).filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.length}`).join(', ');
    msg.className = 'form-msg info';
    msg.textContent = `Backup downloaded. (${counts})`;
    markBackupDone();
  } catch (e) {
    msg.className = 'form-msg error';
    msg.textContent = 'Could not create backup: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Download Backup (.json)';
  }
});

// ---------- Excel Backup ----------

// Reasonable header sets per collection, used both for the blank template
// and to make sure every sheet has a consistent column order on backup.
const COLLECTION_HEADERS = {
  students: ['_id', 'authUid', 'name', 'fatherName', 'email', 'phone', 'program', 'semester', 'section', 'course', 'session', 'status', 'notes', 'loginPassword'],
  studentLogins: ['_id', 'authEmail'],
  courses: ['_id', 'term', 'className', 'title', 'creditHours', 'semester', 'section', 'teacher', 'outline', 'referenceBooks', 'gradeWeights'],
  attendance: ['_id', 'rollNumber', 'courseCode', 'date', 'status', 'markedBy'],
  attendanceSummary: ['_id', 'courseCode', 'rollNumber', 'days'],
  coursePlans: ['_id', 'courseCode', 'term', 'startDate', 'weeks', 'midtermWeek', 'finalWeek', 'meetingDays', 'sessions', 'updatedAt'],
  quizPapers: ['_id', 'questions', 'answerKey', 'updatedAt'],
  quizKeys: ['_id', 'answers'],
  submissions: ['_id', 'itemId', 'rollNumber', 'courseCode', 'url', 'note', 'submittedAt'],
  checkins: ['_id', 'courseCode', 'date', 'code', 'createdAt', 'expiresAt'],
  checkinResponses: ['_id', 'courseCode', 'date', 'rollNumber', 'code', 'at'],
  quizAttempts: ['_id', 'itemId', 'rollNumber', 'courseCode', 'status', 'startedAt', 'submittedAt', 'answers', 'tabSwitches', 'score', 'max', 'gradedAt'],
  settings: ['_id', 'institution', 'activeTerm', 'attendance', 'grading', 'whatsapp', 'plan', 'lists', 'quiz', 'migration', 'lastBackupAt'],
  gradeItems: ['_id', 'type', 'courseCode', 'title', 'dueDate', 'totalMarks', 'countInGrade', 'allowSubmission', 'online', 'description', 'instructions', 'attachmentUrl', 'assignTo', 'createdAt'],
  gradeMarks: ['_id', 'itemId', 'type', 'courseCode', 'rollNumber', 'marksObtained', 'totalMarks', 'remarks', 'topic', 'status'],
  gradebookAdjustments: ['_id', 'courseCode', 'rollNumber', 'bonusMarks', 'negativeMarks'],
  announcements: ['_id', 'title', 'body', 'target', 'postedAt', 'postedBy'],
  courseContent: ['_id', 'courseCode', 'category', 'fileName', 'url', 'addedAt'],
  ebooks: ['_id', 'title', 'author', 'subject', 'url', 'addedAt']
};

/** Dates saved by Firestore come back from a file as {seconds, nanoseconds}; turn them back into real timestamps. */
function reviveTimestamps(v) {
  if (Array.isArray(v)) return v.map(reviveTimestamps);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 2 && keys.includes('seconds') && keys.includes('nanoseconds') && typeof v.seconds === 'number') {
      return new firebase.firestore.Timestamp(v.seconds, v.nanoseconds || 0);
    }
    return Object.fromEntries(keys.map(k => [k, reviveTimestamps(v[k])]));
  }
  return v;
}

// Fields that must stay text even if they look like numbers (e.g. roll "2021").
const TEXT_FIELDS = new Set(['rollNumber', 'courseCode', 'itemId', 'authUid', 'phone', 'section', 'password', 'loginPassword', 'title', 'name', 'remarks', 'topic', 'term', 'date', 'dueDate', 'postedBy', 'markedBy', 'target']);

/** Arrays/objects get JSON-stringified so they fit in a single Excel cell. */
function flattenValue(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v) || (typeof v === 'object')) return JSON.stringify(v);
  return v;
}

/** Reverses flattenValue: JSON-looking strings get parsed back, numeric strings become numbers. */
function unflattenValue(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try { return JSON.parse(trimmed); } catch (e) { /* fall through, keep as string */ }
    }
    if (trimmed !== '' && !isNaN(Number(trimmed)) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
  }
  return v;
}

document.getElementById('btn-backup-excel').addEventListener('click', async () => {
  const btn = document.getElementById('btn-backup-excel');
  const msg = document.getElementById('backup-msg');
  btn.disabled = true; btn.textContent = 'Preparing backup…';
  msg.textContent = ''; msg.className = 'form-msg';

  try {
    const wb = XLSX.utils.book_new();
    const counts = [];

    for (const name of BACKUP_COLLECTIONS) {
      const snap = await db.collection(name).get();
      const headers = COLLECTION_HEADERS[name] || ['_id'];

      // Include any extra fields present in the data that aren't in our
      // predefined header list, so nothing is ever silently dropped.
      const extraFields = new Set();
      snap.forEach(doc => {
        Object.keys(doc.data()).forEach(k => { if (!headers.includes(k)) extraFields.add(k); });
      });
      const allHeaders = [...headers, ...extraFields];

      const rows = snap.docs.map(doc => {
        const data = doc.data();
        const row = {};
        allHeaders.forEach(h => {
          row[h] = h === '_id' ? doc.id : flattenValue(data[h]);
        });
        return row;
      });

      const ws = rows.length > 0
        ? XLSX.utils.json_to_sheet(rows, { header: allHeaders })
        : XLSX.utils.aoa_to_sheet([allHeaders]);
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
      counts.push(`${name}: ${rows.length}`);
    }

    XLSX.writeFile(wb, `lms-backup-${localToday()}.xlsx`);
    msg.className = 'form-msg info';
    msg.textContent = `Excel backup downloaded. (${counts.join(', ')})`;
    markBackupDone();
  } catch (e) {
    msg.className = 'form-msg error';
    msg.textContent = 'Could not create Excel backup: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Download Backup (Excel)';
  }
});

document.getElementById('btn-blank-template').addEventListener('click', () => {
  const wb = XLSX.utils.book_new();
  for (const name of BACKUP_COLLECTIONS) {
    const headers = COLLECTION_HEADERS[name] || ['_id'];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, 'lms-blank-backup-template.xlsx');
});

// ---------- Restore ----------

document.getElementById('btn-restore').addEventListener('click', async () => {
  const fileInput = document.getElementById('restore-file');
  const msg = document.getElementById('restore-msg');
  const prog = document.getElementById('restore-progress');
  msg.textContent = ''; msg.className = 'form-msg';

  if (!fileInput.files[0]) {
    msg.className = 'form-msg error';
    msg.textContent = 'Choose a backup file first (.json or .xlsx).';
    return;
  }

  const file = fileInput.files[0];
  const isExcel = /\.xlsx?$/i.test(file.name);

  let collections; // { collectionName: [{id, data}] }
  let exportedAt = null;

  try {
    if (isExcel) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      collections = {};
      wb.SheetNames.forEach(sheetName => {
        const matched = BACKUP_COLLECTIONS.find(c => c.toLowerCase() === sheetName.toLowerCase());
        if (!matched) return; // ignore sheets that don't match a known collection
        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        collections[matched] = rows
          .filter(row => String(row['_id'] || '').trim() !== '')
          .map(row => {
            const id = String(row['_id']).trim();
            const data = {};
            Object.keys(row).forEach(k => {
              if (k === '_id') return;
              if (row[k] === '' || row[k] === null || row[k] === undefined) return; // empty cell = field not present
              if (TEXT_FIELDS.has(k)) { data[k] = String(row[k]); return; } // keep leading zeros etc.
              data[k] = unflattenValue(row[k]);
            });
            return { id, data };
          });
      });
    } else {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload.collections) throw new Error('This file does not look like a valid backup.');
      collections = payload.collections;
      exportedAt = payload.exportedAt;
    }
  } catch (e) {
    msg.className = 'form-msg error';
    msg.textContent = 'Could not read that file: ' + e.message;
    return;
  }

  const totalDocs = Object.values(collections).reduce((sum, arr) => sum + arr.length, 0);
  if (totalDocs === 0) {
    msg.className = 'form-msg error';
    msg.textContent = 'No recognizable data found in that file.';
    return;
  }

  const whenText = exportedAt ? `taken on ${new Date(exportedAt).toLocaleString()}` : 'from this Excel file';
  if (!confirm(`This will restore ${totalDocs} record(s) ${whenText}. Matching records will be overwritten. Continue?`)) {
    return;
  }

  const btn = document.getElementById('btn-restore');
  btn.disabled = true; btn.textContent = 'Restoring…';
  prog.classList.remove('hidden'); prog.innerHTML = barHTML(0);

  try {
    let done = 0;
    for (const [collectionName, docs] of Object.entries(collections)) {
      if (!BACKUP_COLLECTIONS.includes(collectionName) && collectionName !== 'fileChunks') continue;
      const per = collectionName === 'fileChunks' ? 8 : 400; // file pieces are ~900 KB each; a write is limited to 10 MB

      for (let i = 0; i < docs.length; i += per) {
        const chunk = docs.slice(i, i + per);
        const batch = db.batch();
        chunk.forEach(({ id, data }) => {
          batch.set(db.collection(collectionName).doc(id), unpackBinary(reviveTimestamps(data)), { merge: true });
        });
        await batch.commit();
        done += chunk.length;
        prog.innerHTML = barHTML(Math.round((done / totalDocs) * 100));
      }
    }
    msg.className = 'form-msg info';
    msg.textContent = `Restore complete. ${done} record(s) written.`;
    logChange('Backup restored', `${done} records from ${file.name}`);
  } catch (e) {
    msg.className = 'form-msg error';
    msg.textContent = 'Restore failed partway through: ' + e.message + ' — some records may already be written; you can safely re-run restore, it will just overwrite the same records again.';
  } finally {
    btn.disabled = false; btn.textContent = 'Restore from File';
    prog.classList.add('hidden');
    fileInput.value = '';
  }
});

// ---------- Reset All Data (Danger Zone) ----------

document.getElementById('btn-reset').addEventListener('click', async () => {
  const msg = document.getElementById('reset-msg');
  msg.textContent = ''; msg.className = 'form-msg';

  const typed = prompt(
    'This will permanently delete every student, course, course plan, attendance record, assignment, ' +
    'presentation, quiz, task, exam, mark, gradebook adjustment, announcement, and course ' +
    'file/ebook link. Your settings are kept. This cannot be undone.\n\n' +
    'Type DELETE ALL DATA (in capitals) below to confirm:'
  );

  if (typed === null) return; // user clicked Cancel
  if (typed !== 'DELETE ALL DATA') {
    msg.className = 'form-msg error';
    msg.textContent = 'Text didn\'t match exactly, so nothing was deleted. Try again if you\'re sure.';
    return;
  }

  const btn = document.getElementById('btn-reset');
  btn.disabled = true; btn.textContent = 'Deleting…';

  try {
    let totalDeleted = 0;
    // uploaded file pieces first (found from their records, without downloading them)
    const pieceOps = [];
    for (const col of ['courseContent', 'ebooks']) {
      (await db.collection(col).get()).forEach(d => {
        const x = d.data();
        if (x.storage === 'app' && x.fileId) for (let i = 0; i < (x.chunkCount || 0); i++) pieceOps.push(b => b.delete(db.collection('fileChunks').doc(`${x.fileId}__${i}`)));
      });
    }
    if (pieceOps.length) { await writeInBatches(pieceOps); totalDeleted += pieceOps.length; }
    for (const name of RESET_COLLECTIONS) {
      const snap = await db.collection(name).get();
      const docs = snap.docs;
      // Firestore batches cap at 500 writes — chunk conservatively at 400.
      for (let i = 0; i < docs.length; i += 400) {
        const chunk = docs.slice(i, i + 400);
        const batch = db.batch();
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        totalDeleted += chunk.length;
      }
    }
    msg.className = 'form-msg info';
    msg.textContent = `Done. ${totalDeleted} record(s) deleted. Your admin login and settings were not touched.`;
    logChange('ALL DATA RESET', `${totalDeleted} records deleted`);
    try { sessionStorage.clear(); } catch (e) { }
  } catch (e) {
    msg.className = 'form-msg error';
    msg.textContent = 'Reset failed partway through: ' + e.message + ' — you can safely click Reset again to finish clearing what remains.';
  } finally {
    btn.disabled = false; btn.textContent = 'Reset All Data';
  }
});
