// ==========================================================================
// SETTINGS — every grading/attendance rule the app follows, plus the
// one-time attendance upgrade (Maintenance).
// ==========================================================================

let settings, courses = [];
const RULE_OPTIONS = [['present', 'Counts as present'], ['half', 'Counts as half'], ['absent', 'Counts as absent'], ['excluded', 'Not counted']];
const W_KEYS = ['attendance', 'quiz', 'assignment', 'presentation', 'task', 'exam'];

requireAdmin(async (user, adminData) => {
  setUserChip((adminData && adminData.name) || user.email);
  settings = await loadSettings(true);
  courses = (await loadCoursesAndStudents()).courses;
  fill(settings);
  renderMigration();
  if (location.hash) setTimeout(() => { const el = document.querySelector(location.hash); if (el) el.scrollIntoView(); }, 50);
});

function fill(s) {
  const $ = id => document.getElementById(id);
  $('s-teacher').value = s.institution.teacher || '';
  $('s-department').value = s.institution.department || '';
  $('s-institution').value = s.institution.name || '';
  $('s-term').value = s.activeTerm || '';
  $('s-term-list').innerHTML = [...new Set(courses.map(c => c.term).filter(Boolean))].map(t => `<option value="${h(t)}">`).join('');

  statusDraft = s.attendance.statuses.map(x => ({ ...x }));
  defaultStatus = s.attendance.defaultStatus;
  renderStatuses();
  $('s-threshold').value = s.attendance.warningThreshold;
  $('s-att-scoring').value = s.attendance.scoring;
  renderBands(s.attendance.bands);
  toggleBands();

  $('default-weights').innerHTML = W_KEYS.map(k => `<div class="field"><label>${TYPE_LABEL_PLURAL[k]}</label><input type="number" min="0" step="any" data-w="${k}" value="${s.grading.defaultWeights[k]}"></div>`).join('');
  document.querySelectorAll('[data-w]').forEach(i => i.addEventListener('input', sumWeights));
  sumWeights();
  $('s-missing').value = s.grading.missingComponent;
  $('s-blank').value = s.grading.blankMarks;
  $('s-aggregation').value = s.grading.aggregation;
  $('s-pass').value = s.grading.passMark;
  $('s-decimals').value = String(s.grading.decimals);
  $('s-show-standing').value = String(!!s.grading.showStandingToStudents);
  $('drop-lowest').innerHTML = GRADE_TYPES.map(t => `<div class="field"><label>${TYPE_LABEL_PLURAL[t]}</label><input type="number" min="0" max="10" data-drop="${t}" value="${s.grading.dropLowest[t] || 0}"></div>`).join('');
  renderScale(s.grading.scale);

  $('s-cc').value = s.whatsapp.countryCode;
  $('s-wa-att').value = s.whatsapp.attendanceTemplate;
  $('s-wa-result').value = s.whatsapp.resultTemplate;

  $('l-exams').value = listOf(s, 'examNames').join('\n');
  $('l-cats').value = listOf(s, 'fileCategories').join('\n');
  $('l-pres').value = listOf(s, 'presentationStatuses').join('\n');
  $('qz-duration').value = s.quiz.defaultDuration;
  $('qz-negative').value = s.quiz.negativeMark;
  $('qz-shuffle-q').value = String(!!s.quiz.shuffleQuestions);
  $('qz-shuffle-o').value = String(!!s.quiz.shuffleOptions);
  $('qz-show').value = String(!!s.quiz.showAnswers);

  $('s-weeks').value = s.plan.weeks;
  $('s-mid').value = s.plan.midtermWeek;
  $('s-final').value = s.plan.finalWeek;
  const days = new Set(s.plan.meetingDays);
  $('s-days').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" class="chip-btn${days.has(d) ? ' active' : ''}" data-day="${d}">${WEEKDAY_SHORT[d]}</button>`).join('');
  document.querySelectorAll('#s-days .chip-btn').forEach(b => b.addEventListener('click', () => b.classList.toggle('active')));
}

function sumWeights() {
  const sum = round([...document.querySelectorAll('[data-w]')].reduce((a, i) => a + (Number(i.value) || 0), 0), 2);
  const el = document.getElementById('dw-sum');
  el.textContent = sum; el.style.color = sum === 100 ? 'var(--success)' : 'var(--danger)';
  return sum;
}

/* ---------- Attendance options editor ---------- */
let statusDraft = [], defaultStatus = 'present';
const BUILT_IN = ['present', 'absent', 'leave', 'late', 'excused'];

function renderStatuses() {
  document.getElementById('status-body').innerHTML = statusDraft.map((x, i) => `<tr class="${x.enabled === false ? 'off' : ''}" data-i="${i}">
    <td><input type="checkbox" class="st-on" ${x.enabled !== false ? 'checked' : ''} title="Show this option when marking"></td>
    <td><input type="text" class="st-label" value="${h(x.label)}" maxlength="24"></td>
    <td><input type="text" class="st-code code" value="${h(x.code)}" maxlength="4"></td>
    <td><select class="st-rule">${RULE_OPTIONS.map(([v, l]) => `<option value="${v}"${x.rule === v ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
    <td><span class="swatch ${h(x.color)}"></span> <select class="st-color">${Object.entries(STATUS_COLORS).map(([v, l]) => `<option value="${v}"${x.color === v ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
    <td class="c"><input type="radio" name="st-default" class="st-default" ${x.key === defaultStatus ? 'checked' : ''} title="Pre-selected when you open a class"></td>
    <td><button type="button" class="icon-btn st-up" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button><button type="button" class="icon-btn st-down" ${i === statusDraft.length - 1 ? 'disabled' : ''} title="Move down">↓</button></td>
    <td>${BUILT_IN.includes(x.key) ? '<span class="muted small" title="Built-in options can be switched off but not deleted">built-in</span>' : '<button type="button" class="icon-btn danger st-del">Delete</button>'}</td>
  </tr>`).join('');
  document.querySelectorAll('#status-body tr').forEach(tr => {
    const i = Number(tr.dataset.i), x = statusDraft[i];
    tr.querySelector('.st-on').addEventListener('change', e => { x.enabled = e.target.checked; tr.classList.toggle('off', !x.enabled); });
    tr.querySelector('.st-label').addEventListener('input', e => { x.label = e.target.value; });
    tr.querySelector('.st-code').addEventListener('input', e => { x.code = e.target.value.trim(); });
    tr.querySelector('.st-rule').addEventListener('change', e => { x.rule = e.target.value; });
    tr.querySelector('.st-color').addEventListener('change', e => { x.color = e.target.value; tr.querySelector('.swatch').className = 'swatch ' + x.color; });
    tr.querySelector('.st-default').addEventListener('change', () => { defaultStatus = x.key; });
    tr.querySelector('.st-up').addEventListener('click', () => { statusDraft.splice(i - 1, 0, statusDraft.splice(i, 1)[0]); renderStatuses(); });
    tr.querySelector('.st-down').addEventListener('click', () => { statusDraft.splice(i + 1, 0, statusDraft.splice(i, 1)[0]); renderStatuses(); });
    const del = tr.querySelector('.st-del');
    if (del) del.addEventListener('click', () => {
      if (!confirm(`Delete "${x.label}"?\n\nTip: unticking "On" is safer — it hides the option but keeps it meaningful for records already marked with it. If you delete it, those records will show its raw name and will not be counted.`)) return;
      statusDraft.splice(i, 1);
      if (defaultStatus === x.key) defaultStatus = (statusDraft[0] || {}).key;
      renderStatuses();
    });
  });
}

document.getElementById('btn-add-status').addEventListener('click', () => {
  statusDraft.push({ key: 'c_' + Math.random().toString(36).slice(2, 8), label: 'New option', code: 'N', rule: 'excluded', color: 'info', enabled: true });
  renderStatuses();
  const inputs = document.querySelectorAll('#status-body .st-label');
  inputs[inputs.length - 1].select();
});

function validateStatuses() {
  const on = statusDraft.filter(x => x.enabled !== false);
  if (!on.length) return 'Keep at least one attendance option switched on.';
  if (statusDraft.some(x => !String(x.label).trim())) return 'Every attendance option needs a name.';
  const codes = statusDraft.map(x => String(x.code).trim().toUpperCase());
  if (codes.some(c => !c)) return 'Every attendance option needs a code (used in the Excel sheet).';
  const dup = codes.find((c, i) => codes.indexOf(c) !== i);
  if (dup) return `Two options share the code "${dup}" — codes must be different.`;
  if (!on.some(x => x.key === defaultStatus)) return 'The Default option must be switched on.';
  return null;
}

/* ---------- Bands ---------- */
function renderBands(bands) {
  document.getElementById('bands-body').innerHTML = [...bands].sort((a, b) => b.min - a.min).map(b => `<tr>
    <td><input type="number" class="band-min" min="0" max="100" value="${b.min}"></td>
    <td><input type="number" class="band-score" min="0" max="100" value="${b.score}"></td>
    <td><button type="button" class="icon-btn danger" onclick="this.closest('tr').remove()">Remove</button></td></tr>`).join('');
}
function toggleBands() { document.getElementById('bands-wrap').classList.toggle('hidden', document.getElementById('s-att-scoring').value !== 'bands'); }
document.getElementById('s-att-scoring').addEventListener('change', toggleBands);
document.getElementById('btn-add-band').addEventListener('click', () => {
  document.getElementById('bands-body').insertAdjacentHTML('beforeend', `<tr><td><input type="number" class="band-min" min="0" max="100" value="0"></td><td><input type="number" class="band-score" min="0" max="100" value="0"></td><td><button type="button" class="icon-btn danger" onclick="this.closest('tr').remove()">Remove</button></td></tr>`);
});

/* ---------- Scale ---------- */
function renderScale(scale) {
  document.getElementById('scale-body').innerHTML = [...scale].sort((a, b) => b.min - a.min).map(r => `<tr>
    <td><input type="number" class="sc-min" min="0" max="100" step="any" value="${r.min}"></td>
    <td><input type="text" class="sc-grade" value="${h(r.grade)}" style="width:70px;"></td>
    <td><input type="number" class="sc-gp" min="0" max="5" step="0.01" value="${r.gp}"></td>
    <td><button type="button" class="icon-btn danger" onclick="this.closest('tr').remove()">Remove</button></td></tr>`).join('');
}
document.getElementById('btn-add-grade').addEventListener('click', () => {
  document.getElementById('scale-body').insertAdjacentHTML('beforeend', `<tr><td><input type="number" class="sc-min" min="0" max="100" step="any" value=""></td><td><input type="text" class="sc-grade" style="width:70px;"></td><td><input type="number" class="sc-gp" min="0" max="5" step="0.01" value="0"></td><td><button type="button" class="icon-btn danger" onclick="this.closest('tr').remove()">Remove</button></td></tr>`);
});

/* ---------- Save ---------- */

function collect() {
  const $ = id => document.getElementById(id);
  const lines = id => $(id).value.split('\n').map(x => x.trim()).filter(Boolean);
  const bands = [...document.querySelectorAll('#bands-body tr')].map(tr => ({ min: Number(tr.querySelector('.band-min').value), score: Number(tr.querySelector('.band-score').value) }))
    .filter(b => !isNaN(b.min) && !isNaN(b.score));
  const defaultWeights = {};
  document.querySelectorAll('[data-w]').forEach(i => { defaultWeights[i.dataset.w] = Number(i.value) || 0; });
  const dropLowest = {};
  document.querySelectorAll('[data-drop]').forEach(i => { dropLowest[i.dataset.drop] = Math.max(0, Number(i.value) || 0); });
  const scale = [...document.querySelectorAll('#scale-body tr')].map(tr => ({
    min: Number(tr.querySelector('.sc-min').value), grade: tr.querySelector('.sc-grade').value.trim(), gp: Number(tr.querySelector('.sc-gp').value) || 0
  })).filter(r => r.grade && tr_ok(r.min)).sort((a, b) => b.min - a.min);
  return {
    institution: { teacher: $('s-teacher').value.trim(), department: $('s-department').value.trim(), name: $('s-institution').value.trim() },
    activeTerm: $('s-term').value.trim(),
    attendance: { statuses: statusDraft.map(x => ({ key: x.key, label: String(x.label).trim(), code: String(x.code).trim(), rule: x.rule, color: x.color, enabled: x.enabled !== false })),
      defaultStatus, statusRules: firebase.firestore.FieldValue.delete(), warningThreshold: Number($('s-threshold').value) || 0, scoring: $('s-att-scoring').value, bands },
    grading: {
      defaultWeights, missingComponent: $('s-missing').value, blankMarks: $('s-blank').value, aggregation: $('s-aggregation').value,
      dropLowest, passMark: Number($('s-pass').value) || 0, decimals: Number($('s-decimals').value),
      showStandingToStudents: $('s-show-standing').value === 'true', scale
    },
    whatsapp: { countryCode: $('s-cc').value.replace(/\D/g, '') || '92', attendanceTemplate: $('s-wa-att').value, resultTemplate: $('s-wa-result').value },
    lists: { examNames: lines('l-exams'), fileCategories: lines('l-cats'), presentationStatuses: lines('l-pres') },
    quiz: {
      defaultDuration: Math.max(1, Math.round(Number($('qz-duration').value) || 20)), negativeMark: Math.min(1, Math.max(0, Number($('qz-negative').value) || 0)),
      shuffleQuestions: $('qz-shuffle-q').value === 'true', shuffleOptions: $('qz-shuffle-o').value === 'true', showAnswers: $('qz-show').value === 'true'
    },
    plan: {
      weeks: Number($('s-weeks').value) || 16, midtermWeek: Number($('s-mid').value) || 0, finalWeek: Number($('s-final').value) || 0,
      meetingDays: [...document.querySelectorAll('#s-days .chip-btn.active')].map(b => Number(b.dataset.day))
    }
  };
}
function tr_ok(v) { return !isNaN(v) && v >= 0 && v <= 100; }

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  const s = collect();
  const stErr = validateStatuses();
  if (stErr) { setMsg('settings-msg', stErr, 'error'); document.getElementById('attendance').scrollIntoView(); return; }
  if (!s.lists.examNames.length || !s.lists.fileCategories.length || !s.lists.presentationStatuses.length) { setMsg('settings-msg', 'Each list needs at least one line.', 'error'); return; }
  if (sumWeights() !== 100) { setMsg('settings-msg', 'Default weights must add up to 100.', 'error'); return; }
  if (!s.grading.scale.length) { setMsg('settings-msg', 'The grading scale needs at least one grade.', 'error'); return; }
  if (!s.grading.scale.some(r => r.min === 0)) { setMsg('settings-msg', 'Add a grade starting at 0% (usually F) so every score gets a grade.', 'error'); return; }
  if (s.attendance.scoring === 'bands' && !s.attendance.bands.some(b => b.min === 0)) s.attendance.bands.push({ min: 0, score: 0 });
  const btn = document.getElementById('btn-save-settings');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    settings = await saveSettings(s);
    logChange('Settings saved', 'Rules updated on the Settings page');
    setMsg('settings-msg', 'Saved. Every page now uses these rules.', 'info');
    toast('Settings saved.', 'ok');
  } catch (e) { setMsg('settings-msg', 'Could not save: ' + e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Save Settings'; }
});

document.getElementById('btn-reset-defaults').addEventListener('click', () => {
  if (!confirm('Fill the form with the original default rules? (Nothing is saved until you click Save.)')) return;
  fill(deepMerge(DEFAULT_SETTINGS, { migration: settings.migration }));
  setMsg('settings-msg', 'Defaults loaded — click Save Settings to keep them.', 'info');
});

document.getElementById('btn-apply-weights-all').addEventListener('click', async () => {
  if (sumWeights() !== 100) { toast('Default weights must add up to 100 first.', 'error'); return; }
  if (!confirm(`Use these default weights for all ${courses.length} courses? Any course-specific weightage will be removed.`)) return;
  try {
    const s = collect();
    settings = await saveSettings({ grading: { defaultWeights: s.grading.defaultWeights } });
    await writeInBatches(courses.filter(c => c.gradeWeights).map(c => b => b.update(db.collection('courses').doc(c.id), { gradeWeights: firebase.firestore.FieldValue.delete() })));
    toast('All courses now use the default weights.', 'ok');
  } catch (e) { toast('Could not apply: ' + e.message, 'error'); }
});

/* ---------- Maintenance: one-time attendance upgrade ---------- */

async function renderMigration() {
  const box = document.getElementById('migration-box');
  let legacy = false;
  try { legacy = !(await db.collection('attendance').limit(1).get()).empty; } catch (e) { legacy = false; }
  const done = settings.migration && settings.migration.attendanceV2;
  box.innerHTML = `
    <p class="help" style="margin-top:0;"><b>Attendance storage upgrade.</b> The new version keeps one record per student per course (instead of one per student per day), which makes every page dramatically lighter on Firebase's free daily limit.</p>
    ${legacy ? `
      <div class="banner ${done ? 'ok' : 'danger'}"><span>${done ? 'Upgrade done. Old-format records are still stored (they are no longer used).' : 'You have attendance in the old format. Run the upgrade once — it is safe to run again.'}</span></div>
      <div class="gap-row">
        <button class="btn btn-primary-sm" id="btn-migrate">${done ? 'Run Upgrade Again' : 'Upgrade Attendance Now'}</button>
        ${done ? '<button class="btn btn-outline" id="btn-delete-legacy">Delete Old-Format Records</button>' : ''}
      </div>`
      : `<div class="banner ok"><span>${done ? 'Upgrade complete — nothing left to do.' : 'No old-format attendance found — nothing to upgrade.'}</span></div>`}
    <div class="form-msg" id="migrate-msg"></div>
    <p class="help" style="margin-top:14px;">Tip: download a <a href="backup.html">backup</a> before maintenance actions.</p>`;
  if (!legacy && !done) saveSettings({ migration: { attendanceV2: true } }).then(s => { settings = s; }).catch(() => {});
  const m = document.getElementById('btn-migrate');
  if (m) m.addEventListener('click', migrate);
  const d = document.getElementById('btn-delete-legacy');
  if (d) d.addEventListener('click', deleteLegacy);
}

async function migrate() {
  const btn = document.getElementById('btn-migrate');
  btn.disabled = true; btn.textContent = 'Upgrading…';
  setMsg('migrate-msg', 'Reading old attendance records…', 'info');
  try {
    const snap = await db.collection('attendance').get();
    const grouped = {};
    snap.forEach(doc => {
      const d = doc.data();
      if (!d.courseCode || !d.rollNumber || !d.date || !d.status) return;
      const key = d.courseCode + '\u0000' + d.rollNumber;
      (grouped[key] = grouped[key] || { courseCode: d.courseCode, rollNumber: d.rollNumber, days: {} }).days[d.date] = d.status;
    });
    const ops = Object.values(grouped).map(g => attendanceWriteOpsForStudent(g.courseCode, g.rollNumber, g.days));
    await writeInBatches(ops, (done, total) => setMsg('migrate-msg', `Writing… ${done} / ${total}`, 'info'));
    settings = await saveSettings({ migration: { attendanceV2: true, migratedAt: new Date().toISOString(), migratedRecords: snap.size } });
    setMsg('migrate-msg', `Done: ${snap.size} old daily records combined into ${ops.length} student-course records. Check a few students' attendance, then you can delete the old-format records.`, 'info');
    toast('Attendance upgraded.', 'ok');
    renderMigration();
  } catch (e) {
    setMsg('migrate-msg', 'Upgrade stopped: ' + e.message + ' — it is safe to click again.', 'error');
    btn.disabled = false; btn.textContent = 'Upgrade Attendance Now';
  }
}

async function deleteLegacy() {
  if (!confirm('Delete all old-format attendance records? The upgraded records are kept. Make sure you checked attendance looks right (and ideally downloaded a backup).')) return;
  setMsg('migrate-msg', 'Deleting old records…', 'info');
  try {
    let total = 0;
    for (;;) {
      const snap = await db.collection('attendance').limit(400).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.forEach(d => batch.delete(d.ref));
      await batch.commit();
      total += snap.size;
      setMsg('migrate-msg', `Deleted ${total}…`, 'info');
    }
    setMsg('migrate-msg', `Deleted ${total} old-format records.`, 'info');
    renderMigration();
  } catch (e) { setMsg('migrate-msg', 'Could not finish: ' + e.message + ' — click again to continue.', 'error'); }
}
