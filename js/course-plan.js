// ==========================================================================
// COURSE PLANS — week-by-week lecture plan, Excel in/out, coverage tracking
// Stored as ONE document per course: coursePlans/{COURSE_CODE}
// ==========================================================================

let courses = [], settings = null, plan = null, current = '', filter = 'all';
const params = new URLSearchParams(location.search);

requireAdmin(async (user, adminData) => {
  setUserChip((adminData && adminData.name) || user.email);
  settings = await loadSettings();
  courses = (await loadCoursesAndStudents()).courses;
  fillCourseSelect();
  buildDayChips('setup-days', settings.plan.meetingDays);
  document.getElementById('setup-weeks').value = settings.plan.weeks;
  document.getElementById('setup-mid').value = settings.plan.midtermWeek;
  document.getElementById('setup-final').value = settings.plan.finalWeek;
  document.getElementById('setup-start').value = localToday();
  document.getElementById('s-type').innerHTML = PLAN_TYPES.map(t => `<option value="${t}">${PLAN_TYPE_LABEL[t]}</option>`).join('');
  const want = params.get('course');
  if (want && courses.some(c => c.id === want)) {
    const sel = document.getElementById('plan-course');
    if (![...sel.options].some(o => o.value === want)) { document.getElementById('plan-all-terms').checked = true; fillCourseSelect(); }
    sel.value = want;
    await openCourse(want);
  }
});

function fillCourseSelect() {
  const all = document.getElementById('plan-all-terms').checked;
  const sel = document.getElementById('plan-course');
  const keep = sel.value;
  sel.innerHTML = '<option value="">Select a course…</option>' + courseOptionsHtml(courses, { settings, activeOnly: !all });
  if (keep) sel.value = keep;
}
document.getElementById('plan-all-terms').addEventListener('change', fillCourseSelect);
document.getElementById('plan-course').addEventListener('change', e => openCourse(e.target.value));

function buildDayChips(containerId, selected) {
  const set = new Set((selected || []).map(Number));
  const order = [1, 2, 3, 4, 5, 6, 0];
  document.getElementById(containerId).innerHTML = order.map(d =>
    `<button type="button" class="chip-btn${set.has(d) ? ' active' : ''}" data-day="${d}">${WEEKDAY_SHORT[d]}</button>`).join('');
  document.getElementById(containerId).querySelectorAll('.chip-btn').forEach(b => b.addEventListener('click', () => b.classList.toggle('active')));
}
function readDayChips(containerId) {
  return [...document.querySelectorAll(`#${containerId} .chip-btn.active`)].map(b => Number(b.dataset.day));
}

function courseById(code) { return courses.find(c => c.id === code) || { id: code }; }

async function openCourse(code) {
  current = code;
  history.replaceState(null, '', code ? `?course=${encodeURIComponent(code)}` : location.pathname);
  ['plan-empty', 'plan-setup', 'plan-view'].forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById('plan-actions').style.display = 'none';
  if (!code) { document.getElementById('plan-empty').classList.remove('hidden'); return; }
  try {
    const doc = await db.collection('coursePlans').doc(code).get();
    plan = doc.exists ? doc.data() : null;
  } catch (e) {
    toast('Could not load plan: ' + e.message, 'error');
    plan = null;
  }
  if (!plan) {
    document.getElementById('plan-setup').classList.remove('hidden');
    setMsg('setup-msg', '');
    return;
  }
  render();
}

/* ---------------- Setup ---------------- */

function setupConfig() {
  return {
    startDate: document.getElementById('setup-start').value,
    weeks: Number(document.getElementById('setup-weeks').value) || 16,
    midtermWeek: Number(document.getElementById('setup-mid').value) || 0,
    finalWeek: Number(document.getElementById('setup-final').value) || 0,
    meetingDays: readDayChips('setup-days')
  };
}
function validateConfig(cfg, msgId) {
  if (!cfg.startDate) { setMsg(msgId, 'Pick the date the semester starts.', 'error'); return false; }
  if (!cfg.meetingDays.length) { setMsg(msgId, 'Pick at least one class day.', 'error'); return false; }
  return true;
}

document.getElementById('btn-setup-create').addEventListener('click', async () => {
  const cfg = setupConfig();
  if (!validateConfig(cfg, 'setup-msg')) return;
  const newPlan = { courseCode: current, term: courseById(current).term || '', ...cfg, sessions: generatePlanSessions(cfg), updatedAt: new Date().toISOString() };
  await savePlan(newPlan, 'Plan created — now add your topics (click Edit on a session), or download it as Excel to fill topics there.');
});

document.getElementById('btn-setup-template').addEventListener('click', () => {
  const cfg = setupConfig();
  if (!validateConfig(cfg, 'setup-msg')) return;
  const tmp = { ...cfg, sessions: generatePlanSessions(cfg) };
  downloadWorkbook(planTemplateWorkbook(tmp, courseById(current)), `course-plan-${sanitizeId(current)}.xlsx`);
  setMsg('setup-msg', 'Template downloaded. Fill in the Topic column, then click "Upload Filled Excel".', 'info');
});
document.getElementById('btn-setup-upload').addEventListener('click', () => document.getElementById('plan-import-file').click());
document.getElementById('btn-plan-import').addEventListener('click', () => document.getElementById('plan-import-file').click());
document.getElementById('btn-setup-paste').addEventListener('click', () => openModal('paste-modal'));
document.getElementById('btn-plan-paste').addEventListener('click', () => openModal('paste-modal'));
wireModal('paste-modal', ['paste-cancel']);
document.getElementById('paste-go').addEventListener('click', () => {
  const text = document.getElementById('paste-text').value;
  if (!text.trim()) { toast('Paste some topics first.'); return; }
  closeModal('paste-modal');
  startImport({ text });
});

document.getElementById('plan-import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file && current) startImport(file);
});

/** Opens the import preview for a file or pasted text; saving builds the checklist. */
function startImport(source) {
  const cfg = plan
    ? { startDate: plan.startDate, meetingDays: plan.meetingDays, midtermWeek: plan.midtermWeek, finalWeek: plan.finalWeek }
    : setupConfig();
  if (!cfg.meetingDays || !cfg.meetingDays.length) cfg.meetingDays = settings.plan.meetingDays;
  PlanImport.start(source, {
    cfg, hasPlan: !!plan,
    onSave: async (items, c, mode) => {
      if (mode === 'append' && plan) items = items.filter(x => !(x._auto && plan.sessions.some(s => s.type === x.type)));  // don't add a 2nd mid/final
      const fresh = PlanImport.toSessions(items, mode === 'replace' && plan ? plan.sessions : []);
      const sessions = mode === 'append' && plan ? sortSessions([...plan.sessions, ...fresh]) : fresh;
      const newPlan = {
        ...(plan || {}), courseCode: current, term: (plan && plan.term) || courseById(current).term || '',
        startDate: c.startDate, meetingDays: c.meetingDays.length ? c.meetingDays : (plan ? plan.meetingDays : settings.plan.meetingDays),
        midtermWeek: c.midtermWeek, finalWeek: c.finalWeek,
        weeks: Math.max(Number(c.finalWeek) || 0, ...sessions.map(x => x.week), 1),
        sessions, updatedAt: new Date().toISOString()
      };
      await savePlan(newPlan, `Checklist ready: ${sessions.length} items (${sessions.filter(x => TEACH_TYPES.includes(x.type)).length} lectures). Tick each topic after you teach it.`);
      logChange('Course plan imported', `${current}: ${sessions.length} items (${mode})`);
    }
  });
}

async function savePlan(newPlan, okMsg) {
  plan = newPlan;
  render();
  try {
    const r = await commitSmart(db.collection('coursePlans').doc(current).set(newPlan));
    if (okMsg) toast(r.queued ? okMsg + ' (saved offline — will sync)' : okMsg, 'ok');
  } catch (e) {
    toast('Could not save the plan: ' + e.message, 'error');
  }
}

/* ---------------- Render ---------------- */

function render() {
  if (!plan) return;
  const course = courseById(current);
  const today = localToday();
  const stats = planStats(plan, today);
  const pace = paceInfo(stats);
  ['plan-empty', 'plan-setup'].forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById('plan-view').classList.remove('hidden');
  document.getElementById('plan-actions').style.display = '';

  document.getElementById('plan-ring').innerHTML = ringHTML(stats.pct, 'lg ' + pace.cls);
  document.getElementById('plan-title').textContent = `${course.id} — ${course.title || ''}`;
  const days = (plan.meetingDays || []).map(d => WEEKDAY_SHORT[d]).join(', ');
  document.getElementById('plan-subtitle').textContent =
    `Week ${stats.currentWeek} of ${stats.weeks} · starts ${fmtDate(plan.startDate)}${days ? ' · classes ' + days : ''}${course.term ? ' · ' + course.term : ''}`;
  const paceEl = document.getElementById('plan-pace');
  paceEl.className = 'badge ' + pace.cls; paceEl.textContent = pace.label;

  document.getElementById('plan-stats').innerHTML = `
    <div class="plan-stat"><div class="k">Covered</div><div class="v">${stats.covered} <small>/ ${stats.total} lectures</small></div></div>
    <div class="plan-stat"><div class="k">Planned by today</div><div class="v">${stats.expected} <small>(${stats.expectedPct}%)</small></div></div>
    <div class="plan-stat"><div class="k">Remaining</div><div class="v">${stats.remaining}</div></div>
    <div class="plan-stat"><div class="k">Next topic</div><div class="v" style="font-family:var(--font-body);font-size:13.5px;">${stats.next ? h(stats.next.topic || 'Untitled') : '—'}</div></div>
    <div class="plan-stat"><div class="k">Next exam</div><div class="v" style="font-family:var(--font-body);font-size:13.5px;">${stats.nextExam ? h(PLAN_TYPE_LABEL[stats.nextExam.type]) + ' · ' + h(fmtDate(stats.nextExam.plannedDate)) : '—'}</div></div>`;
  document.getElementById('plan-bar').innerHTML = barHTML(stats.pct, pace.cls, stats.expectedPct) +
    `<div class="muted small" style="margin-top:6px;">Bar = covered · thin line = where the plan expects you to be today</div>`;

  const markers = [];
  if (stats.midtermWeek) markers.push({ index: stats.midtermWeek - 1, label: 'Mid', color: 'var(--danger)' });
  if (stats.finalWeek) markers.push({ index: stats.finalWeek - 1, label: 'Final', color: 'var(--danger)' });
  document.getElementById('plan-chart').innerHTML = lineChartSVG({
    labels: stats.plannedCum.map((_, i) => 'W' + (i + 1)),
    series: [
      { name: 'Planned (cumulative %)', color: 'var(--slate)', values: stats.plannedCum, dashed: true },
      { name: 'Actually covered', color: 'var(--success)', values: stats.actualCum }
    ],
    yMax: 100, ySuffix: '%', markers, height: 220
  });

  document.getElementById('plan-print-head').innerHTML = `<h2>${h(settings.institution.name || '')}</h2>
    <div>${h(settings.institution.department || '')}</div>
    <h2 style="margin-top:6px;">Course Plan — ${h(course.id)} ${h(course.title || '')}</h2>
    <div>${h(settings.institution.teacher || '')} · Printed ${h(fmtDateLong(today))}</div><hr>`;

  renderWeeks(stats, today);
}

function renderWeeks(stats, today) {
  const sessions = sortSessions(plan.sessions || []);
  const byWeek = {};
  sessions.forEach(s => (byWeek[s.week] = byWeek[s.week] || []).push(s));
  let lec = 0;
  const lecNo = {};
  sessions.forEach(s => { if (TEACH_TYPES.includes(s.type)) lecNo[s.id] = ++lec; });

  const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b);
  const html = weeks.map(w => {
    let list = byWeek[w];
    if (filter === 'pending') list = list.filter(s => !s.covered && TEACH_TYPES.includes(s.type));
    if (filter === 'covered') list = list.filter(s => s.covered);
    if (filter === 'current' && w !== stats.currentWeek) list = [];
    if (!list.length) return '';
    const all = byWeek[w];
    const teach = all.filter(s => TEACH_TYPES.includes(s.type));
    const done = teach.filter(s => s.covered).length;
    const dates = all.map(s => s.plannedDate).filter(Boolean).sort();
    const isExam = all.some(s => s.type === 'midterm' || s.type === 'final');
    const range = dates.length ? (dates[0] === dates[dates.length - 1] ? fmtDate(dates[0], { day: 'numeric', month: 'short' })
      : `${fmtDate(dates[0], { day: 'numeric', month: 'short' })} – ${fmtDate(dates[dates.length - 1], { day: 'numeric', month: 'short' })}`) : '';
    return `<div class="week-card${w === stats.currentWeek ? ' current' : ''}${isExam ? ' exam' : ''}">
      <div class="week-head">
        <div><strong>Week ${w}</strong> <span class="muted">${h(range)}</span>${w === stats.currentWeek ? ' <span class="chip warn">This week</span>' : ''}</div>
        <div class="muted">${teach.length ? `${done}/${teach.length} covered` : (isExam ? 'Exams' : '')}</div>
      </div>
      ${list.map(s => sessionRow(s, lecNo[s.id], today)).join('')}
    </div>`;
  }).join('');
  document.getElementById('plan-weeks').innerHTML = html || `<div class="empty-state">Nothing matches this filter.</div>`;
}

function sessionRow(s, lecNo, today) {
  const canTick = s.type !== 'holiday';
  const overdue = !s.covered && TEACH_TYPES.includes(s.type) && s.plannedDate && s.plannedDate < today;
  return `<div class="session-row${s.covered ? ' covered' : ''}">
    <button class="tick${s.covered ? ' on' : ''}" ${canTick ? `onclick="toggleCovered('${jsArg(s.id)}')"` : 'disabled'} title="${s.covered ? 'Covered — click to undo' : 'Mark as covered'}" aria-label="Mark covered">✓</button>
    <div class="date">${s.plannedDate ? h(fmtDate(s.plannedDate)) : '—'}</div>
    <div>
      <div class="topic">${lecNo ? `<span class="muted mono small">L${lecNo}</span> ` : ''}${h(s.topic || (TEACH_TYPES.includes(s.type) ? 'Topic not set' : PLAN_TYPE_LABEL[s.type]))}
        ${s.type !== 'lecture' ? `<span class="chip ${s.type}">${h(PLAN_TYPE_LABEL[s.type])}</span>` : ''}
        ${overdue ? '<span class="chip warn">Pending</span>' : ''}</div>
      ${s.details ? `<div class="details">${h(s.details)}</div>` : ''}
      ${s.covered && s.coveredOn ? `<div class="covered-on">Covered on ${h(fmtDate(s.coveredOn))}</div>` : ''}
    </div>
    <div class="row-actions"><button class="icon-btn" onclick="editSession('${jsArg(s.id)}')">Edit</button></div>
  </div>`;
}

document.querySelectorAll('#plan-filter .chip-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#plan-filter .chip-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  filter = b.dataset.f;
  render();
}));

/* ---------------- Tick / edit ---------------- */

window.toggleCovered = async function (id) {
  const s = plan.sessions.find(x => x.id === id);
  if (!s) return;
  s.covered = !s.covered;
  s.coveredOn = s.covered ? localToday() : null;
  plan.updatedAt = new Date().toISOString();
  render();
  try {
    await commitSmart(db.collection('coursePlans').doc(current).update({ sessions: plan.sessions, updatedAt: plan.updatedAt }));
  } catch (e) { toast('Could not save: ' + e.message, 'error'); }
};

wireModal('session-modal', ['s-cancel']);
let editingNew = false;

window.editSession = function (id) {
  const s = plan.sessions.find(x => x.id === id);
  if (!s) return;
  editingNew = false;
  document.getElementById('session-modal-title').textContent = 'Edit Session';
  document.getElementById('s-id').value = s.id;
  document.getElementById('s-week').value = s.week;
  document.getElementById('s-date').value = s.plannedDate || '';
  document.getElementById('s-type').value = s.type;
  document.getElementById('s-topic').value = s.topic || '';
  document.getElementById('s-details').value = s.details || '';
  document.getElementById('s-covered-on').value = s.covered ? (s.coveredOn || '') : '';
  document.getElementById('s-delete').classList.remove('hidden');
  setMsg('s-msg', '');
  openModal('session-modal');
  document.getElementById('s-topic').focus();
};

document.getElementById('btn-add-session').addEventListener('click', () => {
  const stats = planStats(plan);
  editingNew = true;
  document.getElementById('session-modal-title').textContent = 'Add Session';
  document.getElementById('s-id').value = '';
  document.getElementById('s-week').value = stats.currentWeek;
  document.getElementById('s-date').value = '';
  document.getElementById('s-type').value = 'lecture';
  document.getElementById('s-topic').value = '';
  document.getElementById('s-details').value = '';
  document.getElementById('s-covered-on').value = '';
  document.getElementById('s-delete').classList.add('hidden');
  setMsg('s-msg', '');
  openModal('session-modal');
});

document.getElementById('session-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const week = Number(document.getElementById('s-week').value);
  if (!week) { setMsg('s-msg', 'Week is required.', 'error'); return; }
  const coveredOn = document.getElementById('s-covered-on').value;
  const data = {
    week, plannedDate: document.getElementById('s-date').value, type: document.getElementById('s-type').value,
    topic: document.getElementById('s-topic').value.trim(), details: document.getElementById('s-details').value.trim(),
    covered: !!coveredOn, coveredOn: coveredOn || null
  };
  if (editingNew) {
    const inWeek = plan.sessions.filter(s => s.week === week).length;
    plan.sessions.push({ id: uid(), session: inWeek + 1, ...data });
  } else {
    const s = plan.sessions.find(x => x.id === document.getElementById('s-id').value);
    if (s) Object.assign(s, data);
  }
  plan.sessions = sortSessions(plan.sessions);
  plan.weeks = Math.max(Number(plan.weeks || 0), week);
  closeModal('session-modal');
  await savePlan({ ...plan, updatedAt: new Date().toISOString() });
});

document.getElementById('s-delete').addEventListener('click', async () => {
  const id = document.getElementById('s-id').value;
  if (!confirm('Delete this session from the plan?')) return;
  plan.sessions = plan.sessions.filter(s => s.id !== id);
  closeModal('session-modal');
  await savePlan({ ...plan, updatedAt: new Date().toISOString() }, 'Session deleted.');
});

/* ---------------- Plan settings ---------------- */

wireModal('plan-settings-modal', ['ps-cancel']);
document.getElementById('btn-plan-settings').addEventListener('click', () => {
  document.getElementById('ps-start').value = plan.startDate || '';
  document.getElementById('ps-weeks').value = plan.weeks || 16;
  document.getElementById('ps-mid').value = plan.midtermWeek || 0;
  document.getElementById('ps-final').value = plan.finalWeek || 0;
  document.getElementById('ps-redate').checked = false;
  buildDayChips('ps-days', plan.meetingDays || []);
  setMsg('ps-msg', '');
  openModal('plan-settings-modal');
});

document.getElementById('ps-save').addEventListener('click', async () => {
  const cfg = {
    startDate: document.getElementById('ps-start').value,
    weeks: Number(document.getElementById('ps-weeks').value) || plan.weeks,
    midtermWeek: Number(document.getElementById('ps-mid').value) || 0,
    finalWeek: Number(document.getElementById('ps-final').value) || 0,
    meetingDays: readDayChips('ps-days')
  };
  if (!validateConfig(cfg, 'ps-msg')) return;
  const next = { ...plan, ...cfg };
  if (document.getElementById('ps-redate').checked) {
    const startDow = weekdayOf(cfg.startDate);
    const days = [...cfg.meetingDays].sort((a, b) => ((a - startDow + 7) % 7) - ((b - startDow + 7) % 7));
    const byWeek = {};
    sortSessions(next.sessions).forEach(s => (byWeek[s.week] = byWeek[s.week] || []).push(s));
    Object.entries(byWeek).forEach(([w, list]) => {
      const weekStart = addDays(cfg.startDate, (Number(w) - 1) * 7);
      list.forEach((s, i) => {
        const dow = days[Math.min(i, days.length - 1)];
        s.plannedDate = addDays(weekStart, (dow - startDow + 7) % 7);
        s.session = i + 1;
      });
    });
  }
  closeModal('plan-settings-modal');
  await savePlan({ ...next, updatedAt: new Date().toISOString() }, 'Plan settings saved.');
});

document.getElementById('ps-delete').addEventListener('click', async () => {
  if (!confirm(`Delete the whole course plan for ${current}? This cannot be undone (download Excel first if unsure).`)) return;
  try {
    await commitSmart(db.collection('coursePlans').doc(current).delete());
    closeModal('plan-settings-modal');
    plan = null;
    toast('Plan deleted.');
    openCourse(current);
  } catch (e) { setMsg('ps-msg', 'Could not delete: ' + e.message, 'error'); }
});

/* ---------------- Export / print ---------------- */

document.getElementById('btn-plan-export').addEventListener('click', () => {
  downloadWorkbook(planTemplateWorkbook(plan, courseById(current)), `course-plan-${sanitizeId(current)}-${localToday()}.xlsx`);
});
document.getElementById('btn-plan-ics').addEventListener('click', async () => {
  if (!plan) return;
  let items = [];
  try { items = (await db.collection('gradeItems').where('courseCode', '==', current).get()).docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { }
  const c = courseById(current) || { id: current };
  const ev = courseCalendarEvents(c, plan, items);
  downloadIcs(ev, `${sanitizeId(current)}-calendar.ics`, `${current} ${c.title || ''}`.trim());
  toast(`${ev.length} dates saved to a calendar file. Open it on your phone, or import it in Google Calendar → Settings → Import.`, 'info', 7000);
});
document.getElementById('btn-plan-print').addEventListener('click', () => {
  if (filter !== 'all') { filter = 'all'; document.querySelector('#plan-filter [data-f="all"]').click(); }
  setTimeout(() => window.print(), 100);
});
