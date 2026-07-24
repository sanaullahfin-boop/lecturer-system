// ==========================================================================
// BACKUP & RESTORE
// ==========================================================================

document.getElementById('logout-btn').addEventListener('click', logout);

// Every collection built so far, except `admins` (lecturer login accounts
// are set up manually via the Firebase Console per the README, and are
// deliberately excluded from backups for that reason).
const BACKUP_COLLECTIONS = [
  'students', 'studentLogins', 'courses', 'attendance', 'gradeItems', 'gradeMarks',
  'gradebookAdjustments', 'announcements', 'courseContent', 'ebooks'
];

requireAdmin(async (user, adminData) => {
  document.getElementById('admin-name').textContent = (adminData && adminData.name) || user.email;
  document.getElementById('admin-initial').textContent = ((adminData && adminData.name) || user.email).charAt(0).toUpperCase();
});

// ---------- Backup ----------

document.getElementById('btn-backup').addEventListener('click', async () => {
  const btn = document.getElementById('btn-backup');
  const msg = document.getElementById('backup-msg');
  btn.disabled = true; btn.textContent = 'Preparing backup…';
  msg.textContent = ''; msg.className = 'form-msg';

  try {
    const payload = { exportedAt: new Date().toISOString(), collections: {} };
    for (const name of BACKUP_COLLECTIONS) {
      const snap = await db.collection(name).get();
      payload.collections[name] = snap.docs.map(doc => ({ id: doc.id, data: doc.data() }));
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lms-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    const counts = Object.entries(payload.collections).map(([k, v]) => `${k}: ${v.length}`).join(', ');
    msg.className = 'form-msg info';
    msg.textContent = `Backup downloaded. (${counts})`;
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
  courses: ['_id', 'className', 'title', 'creditHours', 'semester', 'section', 'teacher', 'outline', 'referenceBooks', 'gradeWeights'],
  attendance: ['_id', 'rollNumber', 'courseCode', 'date', 'status', 'markedBy'],
  gradeItems: ['_id', 'type', 'courseCode', 'title', 'dueDate', 'totalMarks', 'description', 'instructions', 'attachmentUrl', 'assignTo'],
  gradeMarks: ['_id', 'itemId', 'type', 'courseCode', 'rollNumber', 'marksObtained', 'totalMarks', 'remarks', 'topic', 'status'],
  gradebookAdjustments: ['_id', 'courseCode', 'rollNumber', 'bonusMarks', 'negativeMarks'],
  announcements: ['_id', 'title', 'body', 'target', 'postedAt', 'postedBy'],
  courseContent: ['_id', 'courseCode', 'category', 'fileName', 'url', 'addedAt'],
  ebooks: ['_id', 'title', 'author', 'subject', 'url', 'addedAt']
};

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

    XLSX.writeFile(wb, `lms-backup-${new Date().toISOString().slice(0, 10)}.xlsx`);
    msg.className = 'form-msg info';
    msg.textContent = `Excel backup downloaded. (${counts.join(', ')})`;
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
  const track = document.getElementById('restore-progress-track');
  const fill = document.getElementById('restore-progress-fill');
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
  track.style.display = 'block'; fill.style.width = '0%';

  try {
    let done = 0;
    for (const [collectionName, docs] of Object.entries(collections)) {
      if (!BACKUP_COLLECTIONS.includes(collectionName)) continue;

      for (let i = 0; i < docs.length; i += 400) {
        const chunk = docs.slice(i, i + 400);
        const batch = db.batch();
        chunk.forEach(({ id, data }) => {
          batch.set(db.collection(collectionName).doc(id), data, { merge: true });
        });
        await batch.commit();
        done += chunk.length;
        fill.style.width = Math.round((done / totalDocs) * 100) + '%';
      }
    }
    msg.className = 'form-msg info';
    msg.textContent = `Restore complete. ${done} record(s) written.`;
  } catch (e) {
    msg.className = 'form-msg error';
    msg.textContent = 'Restore failed partway through: ' + e.message + ' — some records may already be written; you can safely re-run restore, it will just overwrite the same records again.';
  } finally {
    btn.disabled = false; btn.textContent = 'Restore from File';
    track.style.display = 'none';
    fileInput.value = '';
  }
});

// ---------- Reset All Data (Danger Zone) ----------

document.getElementById('btn-reset').addEventListener('click', async () => {
  const msg = document.getElementById('reset-msg');
  msg.textContent = ''; msg.className = 'form-msg';

  const typed = prompt(
    'This will permanently delete every student, course, attendance record, assignment, ' +
    'presentation, quiz, task, exam, mark, gradebook adjustment, announcement, and course ' +
    'file/ebook link. This cannot be undone.\n\n' +
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
    for (const name of BACKUP_COLLECTIONS) {
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
    msg.textContent = `Done. ${totalDeleted} record(s) deleted across every collection. Your admin login was not touched.`;
  } catch (e) {
    msg.className = 'form-msg error';
    msg.textContent = 'Reset failed partway through: ' + e.message + ' — you can safely click Reset again to finish clearing what remains.';
  } finally {
    btn.disabled = false; btn.textContent = 'Reset All Data';
  }
});
