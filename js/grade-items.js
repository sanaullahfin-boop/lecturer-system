// ==========================================================================
// GRADE ITEMS — one shared module for Assignments, Quizzes & Tasks,
// Presentations and Internal Exams (all stored in `gradeItems`, marks in
// `gradeMarks`). Each page passes a small config.
// ==========================================================================

function GradeItems(cfg) {
  const $ = id => document.getElementById(id);
  let activeType = cfg.types[0].type;
  let items = [], currentItem = null, currentAssignees = [], currentExisting = {};
  const ctx = { settings: null, courses: [], students: [] };

  const typeCfg = () => cfg.types.find(t => t.type === activeType);
  const isPres = () => activeType === 'presentation';
  const totalOptional = () => (cfg.totalOptional || []).includes(activeType);

  function fillLists() {
    const ex = $('gi-exam-title');
    if (ex) ex.innerHTML = listOf(ctx.settings, 'examNames').map(n => `<option>${h(n)}</option>`).join('');
  }

  function fillCourseSelects() {
    const all = $('gi-all-terms').checked;
    const opts = courseOptionsHtml(ctx.courses, { settings: ctx.settings, activeOnly: !all });
    const f = $('gi-filter-course'), keep = f.value;
    f.innerHTML = '<option value="">All courses</option>' + opts;
    if (keep) f.value = keep;
    $('gi-course').innerHTML = opts;
  }

  function applyTypeLabels() {
    const t = typeCfg();
    $('gi-add').textContent = t.add;
    $('gi-title-label').textContent = (t.label + ' Title *');
    $('gi-date-label').textContent = t.dateLabel || 'Date *';
    $('gi-total-label').textContent = totalOptional() ? 'Total Marks (optional)' : 'Total Marks *';
    $('gi-title-wrap').classList.toggle('hidden', !!cfg.examTitle);
    $('gi-exam-wrap').classList.toggle('hidden', !cfg.examTitle);
    const f = cfg.fields || {};
    $('gi-desc-wrap').classList.toggle('hidden', !(f.description || (f.descriptionFor || []).includes(activeType)));
    $('gi-instr-wrap').classList.toggle('hidden', !f.instructions);
    $('gi-attach-wrap').classList.toggle('hidden', !f.attachment);
    $('gi-sub-wrap').classList.toggle('hidden', !f.submission);
  }

  async function load() {
    const body = $('gi-body');
    const courseFilter = $('gi-filter-course').value;
    const all = $('gi-all-terms').checked;
    try {
      let q = db.collection('gradeItems').where('type', '==', activeType);
      if (courseFilter) q = q.where('courseCode', '==', courseFilter);
      const snap = await q.get();
      const termCodes = new Set(ctx.courses.filter(c => all || inActiveTerm(c, ctx.settings)).map(c => c.id));
      items = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(it => courseFilter || termCodes.has(it.courseCode));
      items.sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));
      const sub = cfg.updateSubtitle === false ? null : document.getElementById('page-sub');
      if (sub) sub.textContent = `${items.length} ${items.length === 1 ? typeCfg().label.toLowerCase() : typeCfg().plural.toLowerCase()}`;
      render();
    } catch (e) {
      body.innerHTML = `<tr><td colspan="7"><div class="empty-state">Could not load: ${h(e.message)}</div></td></tr>`;
    }
  }

  function render() {
    const body = $('gi-body');
    if (!items.length) {
      body.innerHTML = `<tr><td colspan="7"><div class="empty-state">No ${h(typeCfg().plural.toLowerCase())} yet. Click "${h(typeCfg().add)}" to create one.</div></td></tr>`;
      return;
    }
    const today = localToday();
    body.innerHTML = items.map(it => {
      const graded = Number(it.totalMarks) > 0;
      return `<tr>
        <td>${h(it.title)}${it.dueDate && it.dueDate >= today ? ' <span class="chip warn">Upcoming</span>' : ''}${it.online && it.online.enabled ? ` <span class="chip ${it.online.status === 'open' ? 'ok' : ''}">Online · ${h(it.online.published ? 'results published' : it.online.status)}</span>` : ''}</td>
        <td class="mono">${h(it.courseCode)}</td>
        <td class="mono">${h(it.dueDate ? fmtDate(it.dueDate) : '—')}</td>
        <td class="r num">${it.totalMarks ?? '—'}</td>
        <td>${!it.assignTo || it.assignTo === 'all' ? 'Entire class' : `${it.assignTo.length} student(s)`}</td>
        <td>${it.allowSubmission ? '<span class="chip ok" title="Students submit online">Online submission</span> ' : ''}${!graded ? '<span class="chip">Not graded</span>' : it.countInGrade === false ? '<span class="chip">Not counted</span>' : '<span class="chip ok">Counted</span>'}</td>
        <td><div class="row-actions">
          ${graded || isPres() ? `<button class="icon-btn" onclick="giOpenMarks('${jsArg(it.id)}')">${isPres() ? 'Topics &amp; Marks' : 'Marks'}</button>` : ''}
          ${activeType === 'quiz' ? `<a class="icon-btn" href="quiz-builder.html?item=${encodeURIComponent(it.id)}">${it.online && it.online.enabled ? 'Online quiz' : 'Make online'}</a>` : ''}
          <button class="icon-btn" onclick="giEdit('${jsArg(it.id)}')">Edit</button>
          <button class="icon-btn danger" onclick="giRemove('${jsArg(it.id)}')">Delete</button>
        </div></td>
      </tr>`;
    }).join('');
  }

  /* ---------- Add / edit ---------- */

  function renderPicker(preselected) {
    const roster = rosterForCourse(ctx.students, $('gi-course').value);
    const pre = new Set(preselected || []);
    $('gi-picker').innerHTML = roster.length ? roster.map(s =>
      `<label><input type="checkbox" value="${h(s.id)}" ${pre.has(s.id) ? 'checked' : ''}> ${h(s.id)} — ${h(s.name)}</label>`).join('')
      : `<div class="empty-state" style="padding:8px;">No students enrolled in this course yet.</div>`;
  }
  function setMode(mode) {
    document.querySelector(`input[name="gi-mode"][value="${mode}"]`).checked = true;
    $('gi-picker').classList.toggle('hidden', mode !== 'selected');
  }

  function openNew() {
    $('gi-modal-title').textContent = 'New ' + typeCfg().label;
    $('gi-form').reset();
    $('gi-id').value = '';
    $('gi-count').checked = true;
    const f = $('gi-filter-course').value;
    if (f) $('gi-course').value = f;
    setMode('all');
    setMsg('gi-form-msg', '');
    openModal('gi-modal');
  }

  window.giEdit = function (id) {
    const it = items.find(x => x.id === id);
    if (!it) return;
    $('gi-modal-title').textContent = 'Edit ' + typeCfg().label;
    $('gi-id').value = id;
    $('gi-title').value = it.title || '';
    if (cfg.examTitle) {
      const sel = $('gi-exam-title');
      if (![...sel.options].some(o => o.value === it.title)) sel.insertAdjacentHTML('beforeend', `<option>${h(it.title)}</option>`);
      sel.value = it.title;
    }
    $('gi-course').value = it.courseCode || '';
    $('gi-due').value = it.dueDate || '';
    $('gi-total').value = it.totalMarks ?? '';
    $('gi-desc').value = it.description || '';
    $('gi-instructions').value = it.instructions || '';
    $('gi-attachment').value = it.attachmentUrl || '';
    $('gi-count').checked = it.countInGrade !== false;
    $('gi-allow-sub').checked = !!it.allowSubmission;
    const mode = (!it.assignTo || it.assignTo === 'all') ? 'all' : 'selected';
    setMode(mode);
    renderPicker(mode === 'selected' ? it.assignTo : []);
    setMsg('gi-form-msg', '');
    openModal('gi-modal');
  };

  async function save(e) {
    e.preventDefault();
    const id = $('gi-id').value;
    const mode = document.querySelector('input[name="gi-mode"]:checked').value;
    const assignTo = mode === 'all' ? 'all' : [...document.querySelectorAll('#gi-picker input:checked')].map(c => c.value);
    const totalRaw = $('gi-total').value;
    const payload = {
      type: activeType,
      title: cfg.examTitle ? $('gi-exam-title').value : $('gi-title').value.trim(),
      courseCode: $('gi-course').value,
      dueDate: $('gi-due').value,
      totalMarks: totalRaw === '' ? null : Number(totalRaw),
      countInGrade: $('gi-count').checked,
      assignTo
    };
    const f = cfg.fields || {};
    if (f.description || (f.descriptionFor || []).includes(activeType)) payload.description = $('gi-desc').value.trim();
    if (f.instructions) payload.instructions = $('gi-instructions').value.trim();
    if (f.attachment) payload.attachmentUrl = $('gi-attachment').value.trim();
    if (f.submission) payload.allowSubmission = $('gi-allow-sub').checked;

    if (!payload.title || !payload.courseCode || !payload.dueDate || (!totalOptional() && !(payload.totalMarks > 0))) {
      setMsg('gi-form-msg', 'Please fill in title, course, date and total marks.', 'error'); return;
    }
    if (mode === 'selected' && !assignTo.length) { setMsg('gi-form-msg', 'Select at least one student, or choose "Entire class".', 'error'); return; }
    const btn = $('gi-save');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      if (id) {
        await commitSmart(db.collection('gradeItems').doc(id).update(payload));
        // keep each mark's stored total in sync if total marks changed
        const old = items.find(x => x.id === id);
        if (old && old.totalMarks !== payload.totalMarks && payload.totalMarks > 0) {
          const ms = await db.collection('gradeMarks').where('itemId', '==', id).get();
          await writeInBatches(ms.docs.map(d => b => b.update(d.ref, { totalMarks: payload.totalMarks, courseCode: payload.courseCode })));
        }
      } else {
        await commitSmart(db.collection('gradeItems').add({ ...payload, createdAt: new Date().toISOString() }));
      }
      closeModal('gi-modal');
      toast('Saved.', 'ok');
      await load();
    } catch (err) {
      setMsg('gi-form-msg', 'Could not save: ' + err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Save';
    }
  }

  window.giRemove = async function (id) {
    const it = items.find(x => x.id === id);
    if (!it || !confirm(`Delete "${it.title}" and all marks recorded for it?`)) return;
    try {
      const ms = await db.collection('gradeMarks').where('itemId', '==', id).get();
      const ops = [...ms.docs.map(d => b => b.delete(d.ref)), b => b.delete(db.collection('gradeItems').doc(id))];
      if (it.online) {
        const at = await db.collection('quizAttempts').where('itemId', '==', id).get();
        at.forEach(d => ops.push(b => b.delete(d.ref)));
        ops.push(b => b.delete(db.collection('quizPapers').doc(id)), b => b.delete(db.collection('quizKeys').doc(id)));
      }
      await writeInBatches(ops);
      toast('Deleted.', 'ok');
      await load();
    } catch (e) { toast('Could not delete: ' + e.message, 'error'); }
  };

  /* ---------- Marks grid ---------- */

  window.giOpenMarks = async function (id) {
    currentItem = items.find(x => x.id === id);
    if (!currentItem) return;
    const total = Number(currentItem.totalMarks) || 0;
    $('gi-marks-title').textContent = `${currentItem.title} — ${currentItem.courseCode}${total ? ` (out of ${total})` : ''}`;
    currentAssignees = resolveAssignees(currentItem, rosterForCourse(ctx.students, currentItem.courseCode, { includeInactive: true }));
    const subs = !!currentItem.allowSubmission;
    $('gi-marks-head').innerHTML = `<tr><th>Roll No.</th><th>Name</th>${subs ? '<th>Submission</th>' : ''}${isPres() ? '<th>Topic</th><th>Status</th>' : ''}<th>Marks</th><th class="r">%</th><th>Remarks</th></tr>`;
    const body = $('gi-marks-body');
    const cols = (isPres() ? 7 : 5) + (subs ? 1 : 0);
    body.innerHTML = `<tr><td colspan="${cols}"><div class="empty-state"><span class="loading-dot"></span> Loading…</div></td></tr>`;
    setMsg('gi-marks-msg', '');
    $('gi-template').disabled = $('gi-import').disabled = !total;
    openModal('gi-marks-modal');

    const [snap, subSnap] = await Promise.all([
      db.collection('gradeMarks').where('itemId', '==', id).get(),
      subs ? db.collection('submissions').where('itemId', '==', id).get() : Promise.resolve(null)
    ]);
    const subBy = {};
    if (subSnap) subSnap.forEach(d => { subBy[d.data().rollNumber] = d.data(); });
    const existing = {};
    snap.forEach(d => { existing[d.data().rollNumber] = d.data(); });
    currentExisting = existing;
    if (!currentAssignees.length) {
      body.innerHTML = `<tr><td colspan="${cols}"><div class="empty-state">No students assigned / enrolled.</div></td></tr>`;
      return;
    }
    body.innerHTML = currentAssignees.map(s => {
      const ex = existing[s.id] || {};
      const pres = listOf(ctx.settings, 'presentationStatuses');
      const statusOpts = (ex.status && !pres.includes(ex.status) ? [...pres, ex.status] : pres).map(st => `<option value="${h(st)}"${(ex.status || pres[0]) === st ? ' selected' : ''}>${h(st)}</option>`).join('');
      return `<tr data-roll="${h(s.id)}">
        <td class="mono">${h(s.id)}</td><td>${h(s.name)}</td>
        ${subs ? `<td>${subCell(subBy[s.id], currentItem)}</td>` : ''}
        ${isPres() ? `<td><input type="text" class="remarks-input m-topic" value="${h(ex.topic || '')}" placeholder="Topic"></td>
          <td><select class="remarks-input m-status" style="min-width:110px;">${statusOpts}</select></td>` : ''}
        <td><input type="number" class="marks-input m-marks" min="0" ${total ? `max="${total}"` : ''} step="any" value="${ex.marksObtained ?? ''}" ${total ? '' : 'disabled'}></td>
        <td class="r mono m-pct"></td>
        <td><input type="text" class="remarks-input m-remarks" value="${h(ex.remarks || '')}"></td>
      </tr>`;
    }).join('');
    body.querySelectorAll('.m-marks').forEach(i => i.addEventListener('input', updateMarksStats));
    updateMarksStats();
  };

  function subCell(sub, item) {
    if (!sub) return '<span class="chip">Not submitted</span>';
    const ms = sub.submittedAt && (sub.submittedAt.toMillis ? sub.submittedAt.toMillis() : sub.submittedAt.seconds * 1000);
    const late = ms && item.dueDate && toLocalISO(new Date(ms)) > item.dueDate;
    return `<a href="${safeUrl(sub.url)}" target="_blank" rel="noopener">Open</a> <span class="chip ${late ? 'danger' : 'ok'}">${late ? 'Late' : 'On time'}</span>
      <div class="muted small">${ms ? h(new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : ''}${sub.note ? ' · ' + h(sub.note) : ''}</div>`;
  }

  function updateMarksStats() {
    const total = Number(currentItem.totalMarks) || 0;
    const vals = [];
    document.querySelectorAll('#gi-marks-body tr[data-roll]').forEach(tr => {
      const inp = tr.querySelector('.m-marks');
      const v = inp.value === '' ? null : Number(inp.value);
      const bad = v !== null && (v < 0 || (total && v > total));
      inp.style.borderColor = bad ? 'var(--danger)' : '';
      tr.querySelector('.m-pct').textContent = v !== null && total ? round(v / total * 100, 0) + '%' : '';
      if (v !== null && !bad) vals.push(v);
    });
    const n = currentAssignees.length;
    $('gi-marks-stats').innerHTML = !vals.length ? `<span>Graded <b>0</b> / ${n}</span>` :
      `<span>Graded <b>${vals.length}</b> / ${n}</span><span>Average <b>${round(vals.reduce((a, b) => a + b, 0) / vals.length, 1)}</b></span>
       <span>Highest <b>${Math.max(...vals)}</b></span><span>Lowest <b>${Math.min(...vals)}</b></span>`;
  }

  async function saveMarks() {
    if (!currentItem) return;
    const total = Number(currentItem.totalMarks) || 0;
    const ops = [];
    let bad = 0;
    document.querySelectorAll('#gi-marks-body tr[data-roll]').forEach(tr => {
      const roll = tr.dataset.roll;
      const raw = tr.querySelector('.m-marks').value;
      const val = raw === '' ? null : Number(raw);
      if (val !== null && (val < 0 || (total && val > total))) { bad++; return; }
      const data = {
        itemId: currentItem.id, type: currentItem.type, courseCode: currentItem.courseCode,
        rollNumber: roll, marksObtained: val, totalMarks: currentItem.totalMarks ?? null,
        remarks: tr.querySelector('.m-remarks').value.trim()
      };
      if (isPres()) { data.topic = tr.querySelector('.m-topic').value.trim(); data.status = tr.querySelector('.m-status').value; }
      ops.push(b => b.set(db.collection('gradeMarks').doc(`${currentItem.id}__${roll}`), data, { merge: true }));
    });
    if (bad) { setMsg('gi-marks-msg', `${bad} mark(s) are below 0 or above ${total} — fix the red boxes first.`, 'error'); return; }
    const btn = $('gi-marks-save');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const r = await writeInBatches(ops);
      const changes = [];
      document.querySelectorAll('#gi-marks-body tr[data-roll]').forEach(tr => {
        const roll = tr.dataset.roll, raw = tr.querySelector('.m-marks').value;
        const nv = raw === '' ? null : Number(raw), ov = currentExisting[roll] ? currentExisting[roll].marksObtained : null;
        if ((ov ?? null) !== nv && ov !== undefined && ov !== null) changes.push(`${roll}: ${ov} → ${nv === null ? 'blank' : nv}`);
      });
      logChange(changes.length ? 'Marks changed' : 'Marks saved', `${currentItem.courseCode} · ${TYPE_LABEL[currentItem.type]} · ${currentItem.title}`, changes);
      setMsg('gi-marks-msg', r.queued ? 'Saved offline — will sync when you reconnect.' : `Saved ${r.count} record(s).`, 'info');
    } catch (e) {
      setMsg('gi-marks-msg', 'Could not save: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Save Marks';
    }
  }

  /* ---------- Wiring ---------- */

  $('gi-add').addEventListener('click', openNew);
  $('gi-form').addEventListener('submit', save);
  $('gi-course').addEventListener('change', () => renderPicker());
  document.querySelectorAll('input[name="gi-mode"]').forEach(r => r.addEventListener('change', () => {
    setMode(document.querySelector('input[name="gi-mode"]:checked').value);
    renderPicker();
  }));
  wireModal('gi-modal', ['gi-cancel']);
  wireModal('gi-marks-modal', ['gi-marks-close']);
  $('gi-filter-course').addEventListener('change', load);
  $('gi-all-terms').addEventListener('change', () => { fillCourseSelects(); load(); });
  $('gi-marks-save').addEventListener('click', saveMarks);
  $('gi-fill').addEventListener('click', () => {
    const v = $('gi-fill-value').value;
    if (v === '') return;
    document.querySelectorAll('#gi-marks-body .m-marks').forEach(i => { if (i.value === '') i.value = v; });
    updateMarksStats();
  });
  $('gi-template').addEventListener('click', () => {
    if (!currentItem || !currentAssignees.length) return;
    downloadMarksTemplate(currentItem, currentAssignees);
  });
  $('gi-import').addEventListener('click', () => $('gi-import-file').click());
  $('gi-import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !currentItem) return;
    try {
      const n = await importMarksFile(file, currentItem);
      toast(`Imported ${n} mark(s).`, 'ok');
      await window.giOpenMarks(currentItem.id);
      if (isPres()) setMsg('gi-marks-msg', 'Imported marks & remarks. Topic and status are set here in the grid.', 'info');
    } catch (err) { setMsg('gi-marks-msg', 'Could not import: ' + err.message, 'error'); }
  });
  const tabs = $('gi-tabs');
  if (tabs) tabs.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => {
    tabs.querySelectorAll('.tab-btn').forEach(x => x.classList.toggle('active', x === b));
    activeType = b.dataset.type;
    applyTypeLabels();
    load();
  }));

  return {
    async init(settings, courses, students) {
      Object.assign(ctx, { settings, courses, students });
      fillLists();
      fillCourseSelects();
      applyTypeLabels();
      await load();
    },
    reload: load
  };
}

/** Standard boot for a page that is only a grade-items list. */
function bootGradeItemsPage(cfg) {
  const gi = GradeItems(cfg);
  requireAdmin(async (user, adminData) => {
    setUserChip((adminData && adminData.name) || user.email);
    const settings = await loadSettings();
    const { courses, students } = await loadCoursesAndStudents();
    await gi.init(settings, courses, students);
  });
  return gi;
}
