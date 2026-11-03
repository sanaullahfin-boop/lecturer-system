// ==========================================================================
// ATTENDANCE — mark per course/date (+ tick topics taught), report with
// warnings & WhatsApp, monthly Excel upload. Uses v2 storage (grading.js).
// ==========================================================================

let settings, courses = [], students = [];
const RULE_WORDS = { present: 'Present', half: 'Half present', absent: 'Absent', excluded: 'Not counted' };
const attCache = {};   // courseCode -> { roll: {date: status} }
const planCache = {};  // courseCode -> plan | null
let markState = {}, savedState = {}, topicRows = [], onLeave = {};
const params = new URLSearchParams(location.search);

document.getElementById('page-sub').textContent = todayLabel();
document.getElementById('mark-date').value = params.get('date') || localToday();
document.getElementById('bulk-month').value = localToday().slice(0, 7);

requireAdmin(async (user, adminData) => {
  setUserChip((adminData && adminData.name) || user.email);
  settings = await loadSettings();
  ({ courses, students } = await loadCoursesAndStudents());
  document.getElementById('threshold-label').textContent = settings.attendance.warningThreshold;
  document.getElementById('code-legend').textContent = attStatuses(settings, true).map(x => `${x.code} = ${x.label}`).join(', ');
  document.getElementById('report-head').innerHTML = `<tr><th>Roll No.</th><th>Name</th><th>Course</th>${attStatuses(settings, true).map(x => `<th class="c" title="${h(x.label)}">${h(x.code)}</th>`).join('')}<th class="c">Counted</th><th>Attendance</th><th></th></tr>`;
  fillCourseSelects();
  await loadLeaves();
  const want = params.get('course');
  if (want) {
    const sel = document.getElementById('mark-course');
    if (![...sel.options].some(o => o.value === want)) { document.getElementById('mark-all-terms').checked = true; fillCourseSelects(); }
    sel.value = want;
    document.getElementById('bulk-course').value = want;
    loadRoster();
  }
  if (params.get('tab')) switchTab(params.get('tab'));
  if (params.get('tab') === 'report') runReport();
});

function fillCourseSelects() {
  const all = document.getElementById('mark-all-terms').checked;
  const opts = courseOptionsHtml(courses, { settings, activeOnly: !all });
  ['mark-course', 'bulk-course'].forEach(id => {
    const sel = document.getElementById(id), keep = sel.value;
    sel.innerHTML = '<option value="">Select a course…</option>' + opts;
    if (keep) sel.value = keep;
  });
  const r = document.getElementById('report-course'), keepR = r.value;
  r.innerHTML = `<option value="">All courses${all ? '' : ' (this term)'}</option>` + opts;
  if (keepR) r.value = keepR;
}
document.getElementById('mark-all-terms').addEventListener('change', fillCourseSelects);

/* ---------------- Tabs ---------------- */

document.querySelectorAll('.tabs .tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
function switchTab(tab) {
  document.querySelectorAll('.tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  ['mark', 'report', 'bulk', 'leave'].forEach(t => document.getElementById('tab-' + t).classList.toggle('hidden', t !== tab));
  if (tab === 'leave') renderLeave();
}

/* ---------------- Data ---------------- */

async function getCourseAtt(code, force) {
  if (!attCache[code] || force) attCache[code] = await loadCourseAttendance(code);
  return attCache[code];
}
async function getPlan(code) {
  if (planCache[code] === undefined) {
    try {
      const d = await db.collection('coursePlans').doc(code).get();
      planCache[code] = d.exists ? d.data() : null;
    } catch (e) { planCache[code] = null; }
  }
  return planCache[code];
}

/* ---------------- Mark attendance ---------------- */

document.getElementById('mark-course').addEventListener('change', loadRoster);
document.getElementById('mark-date').addEventListener('change', loadRoster);

let currentRoster = [];

async function loadRoster() {
  const code = document.getElementById('mark-course').value;
  const date = document.getElementById('mark-date').value;
  const area = document.getElementById('mark-area'), empty = document.getElementById('mark-empty');
  setMsg('mark-msg', '');
  if (!code || !date) { area.classList.add('hidden'); empty.classList.remove('hidden'); return; }
  empty.innerHTML = '<div class="empty-state"><span class="loading-dot"></span> Loading roster…</div>';

  const [att, plan] = await Promise.all([getCourseAtt(code).catch(e => { toast(e.message, 'error'); return {}; }), getPlan(code)]);
  const roster = rosterForCourse(students, code);
  // keep anyone who already has a mark on this date even if now inactive
  Object.keys(att).forEach(roll => {
    if (att[roll][date] && !roster.some(s => s.id === roll)) {
      const s = students.find(x => x.id === roll);
      if (s) roster.push(s);
    }
  });
  currentRoster = roster;

  if (!roster.length) {
    area.classList.add('hidden'); empty.classList.remove('hidden');
    empty.innerHTML = `<div class="empty-state">No active students are enrolled in ${h(code)}. Add the course code to students on the <a href="students.html">Students</a> page.</div>`;
    return;
  }
  empty.classList.add('hidden'); area.classList.remove('hidden');

  savedState = {}; markState = {}; onLeave = {};
  const lk = leaveKey();
  roster.forEach(s => {
    const st = (att[s.id] || {})[date];
    if (st) savedState[s.id] = st;
    const lv = approvedLeaveFor(s.id, code, date);
    if (lv) onLeave[s.id] = lv;
    markState[s.id] = st || (lv && lk) || settings.attendance.defaultStatus;
  });
  renderRoster();
  const lvNames = roster.filter(s => onLeave[s.id] && !savedState[s.id]).map(s => s.name || s.id);
  if (lvNames.length && lk) setMsg('mark-msg', `Approved leave today: ${lvNames.join(', ')} — already set to ${attLabel(settings, lk)}.`, 'info');
  renderTopics(plan, date);
}

function renderRoster() {
  document.getElementById('mark-body').innerHTML = currentRoster.map(s => {
    const cur = markState[s.id];
    const opts = attStatuses(settings, true).map(x => x.key);
    if (cur && !opts.includes(cur)) opts.push(cur); // keep a switched-off option visible where it was used
    return `<tr>
      <td class="mono">${h(s.id)}</td>
      <td>${h(s.name || '')}${isActiveStudent(s) ? '' : ' <span class="chip">' + h(s.status) + '</span>'}${onLeave[s.id] ? ` <span class="chip info" title="${h(onLeave[s.id].reason || '')}">Approved leave</span>` : ''}</td>
      <td><div class="status-btn-group">${opts.map(st =>
        `<button type="button" data-status="${h(st)}" class="status-btn c-${h(attColor(settings, st))}${st === cur ? ' selected' : ''}" onclick="setMark('${jsArg(s.id)}','${jsArg(st)}')" title="${h(attLabel(settings, st))} (${h(attCode(settings, st))})">${h(attLabel(settings, st))}</button>`).join('')}</div></td>
    </tr>`;
  }).join('');
  renderSummary();
}

function renderSummary() {
  const counts = {};
  attStatuses(settings, true).forEach(x => counts[x.key] = 0);
  Object.values(markState).forEach(k => counts[k] = (counts[k] || 0) + 1);
  const saved = Object.keys(savedState).length;
  const changed = Object.keys(markState).some(r => savedState[r] !== markState[r]);
  const badge = saved === 0 ? '<span class="chip warn">Not saved yet</span>' : changed ? '<span class="chip warn">Unsaved changes</span>' : '<span class="chip ok">Saved</span>';
  document.getElementById('att-summary').innerHTML =
    Object.keys(counts).map(k => `<span>${h(attLabel(settings, k))} <b>${counts[k]}</b></span>`).join(' · ') + ` &nbsp; ${badge}`;
  const here = Object.values(markState).filter(k => attCountsAsPresent(settings, k)).length;
  document.getElementById('att-summary-2').innerHTML = `<span>Present <b>${here}</b> / ${Object.keys(markState).length}</span> ${badge}`;
}

document.getElementById('btn-save-attendance-2').addEventListener('click', () => document.getElementById('btn-save-attendance').click());

window.setMark = function (roll, status) {
  markState[roll] = status;
  renderRoster();
};
document.getElementById('btn-all-present').addEventListener('click', () => { Object.keys(markState).forEach(r => markState[r] = settings.attendance.defaultStatus); renderRoster(); });
document.getElementById('btn-all-absent').addEventListener('click', () => { const a = attAbsentKey(settings); Object.keys(markState).forEach(r => markState[r] = a); renderRoster(); });

function renderTopics(plan, date) {
  const body = document.getElementById('topics-body');
  const code = document.getElementById('mark-course').value;
  if (!plan) {
    topicRows = [];
    body.innerHTML = `<p class="help" style="margin:0;">No course plan for this course yet. <a href="course-plan.html?course=${encodeURIComponent(code)}">Create one</a> to tick topics here as you mark attendance, and track how much of the course you've covered.</p>`;
    return;
  }
  const sessions = sortSessions(plan.sessions || []);
  const picks = [];
  const add = s => { if (s && !picks.some(p => p.id === s.id)) picks.push(s); };
  sessions.filter(s => s.coveredOn === date).forEach(add);
  sessions.filter(s => s.plannedDate === date && s.type !== 'holiday').forEach(add);
  sessions.filter(s => !s.covered && TEACH_TYPES.includes(s.type)).slice(0, 4).forEach(add);
  topicRows = picks;
  if (!picks.length) {
    body.innerHTML = `<p class="help" style="margin:0;">Every planned topic is covered. 🎉 <a href="course-plan.html?course=${encodeURIComponent(code)}">Open plan</a></p>`;
    return;
  }
  const stats = planStats(plan);
  body.innerHTML = `<p class="help">Tick what you taught today — it updates the course coverage meter for you and your students. Currently <b>${stats.pct}%</b> covered.</p>
    <div class="topic-pick">${picks.map(s => `
      <label><input type="checkbox" data-sid="${h(s.id)}" ${s.coveredOn === date ? 'checked' : ''}>
        <span><b>${h(s.topic || 'Untitled topic')}</b>${s.plannedDate === date ? ' <span class="chip warn">Planned for this date</span>' : ''}
        <span class="tp-meta"><br>Week ${s.week}${s.plannedDate ? ' · planned ' + h(fmtDate(s.plannedDate)) : ''}${s.covered && s.coveredOn !== date ? ' · already covered on ' + h(fmtDate(s.coveredOn)) : ''}</span></span>
      </label>`).join('')}</div>
    <div style="margin-top:8px;"><a class="small" href="course-plan.html?course=${encodeURIComponent(code)}">Open full course plan →</a></div>`;
}

document.getElementById('btn-save-attendance').addEventListener('click', async () => {
  const code = document.getElementById('mark-course').value;
  const date = document.getElementById('mark-date').value;
  if (!code || !date) return;
  const btn = document.getElementById('btn-save-attendance');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const changes = Object.keys(markState).filter(r => savedState[r] && savedState[r] !== markState[r])
      .map(r => `${r}: ${attLabel(settings, savedState[r])} → ${attLabel(settings, markState[r])}`);
    const isNew = !Object.keys(savedState).length;
    const res = await writeInBatches(attendanceWriteOps(code, date, markState));
    if (isNew || changes.length) logChange(isNew ? 'Attendance marked' : 'Attendance changed', `${code} · ${date} · ${Object.keys(markState).length} students`, changes);
    const att = attCache[code] || (attCache[code] = {});
    Object.entries(markState).forEach(([roll, st]) => { (att[roll] = att[roll] || {})[date] = st; });
    savedState = { ...markState };

    // Topics taught
    const plan = planCache[code];
    let topicMsg = '';
    if (plan && topicRows.length) {
      let changed = 0;
      document.querySelectorAll('#topics-body input[data-sid]').forEach(cb => {
        const s = plan.sessions.find(x => x.id === cb.dataset.sid);
        if (!s) return;
        if (cb.checked && !s.covered) { s.covered = true; s.coveredOn = date; changed++; }
        if (!cb.checked && s.covered && s.coveredOn === date) { s.covered = false; s.coveredOn = null; changed++; }
      });
      if (changed) {
        plan.updatedAt = new Date().toISOString();
        await commitSmart(db.collection('coursePlans').doc(code).update({ sessions: plan.sessions, updatedAt: plan.updatedAt }));
        topicMsg = ` Course plan updated (${planStats(plan).pct}% covered).`;
      }
    }
    setMsg('mark-msg', `Saved attendance for ${Object.keys(markState).length} student(s) on ${fmtDate(date)}.${topicMsg}${res.queued ? ' You are offline — it will sync automatically.' : ''}`, 'info');
    renderSummary();
    renderTopics(plan, date);
  } catch (e) {
    setMsg('mark-msg', 'Could not save: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Attendance';
  }
});

document.getElementById('btn-clear-day').addEventListener('click', async () => {
  const code = document.getElementById('mark-course').value;
  const date = document.getElementById('mark-date').value;
  const rolls = Object.keys(savedState);
  if (!rolls.length) { toast('Nothing saved for this date yet.'); return; }
  if (!confirm(`Remove all attendance for ${code} on ${fmtDate(date)} (${rolls.length} students)? Use this if the class was cancelled or you picked the wrong date.`)) return;
  try {
    const ops = attendanceWriteOps(code, date, Object.fromEntries(rolls.map(r => [r, null])));
    await writeInBatches(ops);
    rolls.forEach(r => { if (attCache[code] && attCache[code][r]) delete attCache[code][r][date]; });
    toast('Attendance for that day removed.', 'ok');
    logChange('Attendance day cleared', `${code} · ${date} · ${rolls.length} students`);
    loadRoster();
  } catch (e) { toast('Could not remove: ' + e.message, 'error'); }
});

/* ---------------- Report ---------------- */

let reportRows = [];
document.getElementById('btn-run-report').addEventListener('click', runReport);

async function runReport() {
  const code = document.getElementById('report-course').value;
  const from = document.getElementById('report-from').value, to = document.getElementById('report-to').value;
  const warnOnly = document.getElementById('report-warn-only').checked;
  const tbody = document.getElementById('report-body');
  tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><span class="loading-dot"></span> Crunching attendance…</div></td></tr>`;
  try {
    let byCourse;
    if (code) byCourse = { [code]: await getCourseAtt(code, true) };
    else {
      const all = await loadAllAttendance();
      const allTerms = document.getElementById('mark-all-terms').checked;
      byCourse = {};
      courses.filter(c => allTerms || inActiveTerm(c, settings)).forEach(c => { if (all[c.id]) byCourse[c.id] = all[c.id]; });
    }
    const threshold = Number(settings.attendance.warningThreshold);
    reportRows = [];
    Object.entries(byCourse).forEach(([cc, byRoll]) => {
      const course = courses.find(c => c.id === cc) || { id: cc };
      Object.entries(byRoll).forEach(([roll, days]) => {
        const st = attendanceStats(days, settings, from, to);
        if (!st.total) return;
        const s = students.find(x => x.id === roll) || { id: roll, name: '(removed student)' };
        reportRows.push({ s, course, st, warn: st.pct !== null && st.pct < threshold });
      });
    });
    reportRows.sort((a, b) => (a.st.pct ?? 101) - (b.st.pct ?? 101));
    const rows = warnOnly ? reportRows.filter(r => r.warn) : reportRows;
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state">${warnOnly ? 'No one is below the threshold. 👍' : 'No attendance found for this filter.'}</div></td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const msg = fillTemplate(settings.whatsapp.attendanceTemplate, {
        name: r.s.name, roll: r.s.id, course: `${r.course.id} ${r.course.title || ''}`.trim(), pct: r.st.pct, threshold, teacher: settings.institution.teacher
      });
      const cls = r.st.pct === null ? '' : r.warn ? 'danger' : 'ok';
      return `<tr class="${r.warn ? 'row-warn' : ''}">
        <td class="mono"><a href="student-profile.html?roll=${encodeURIComponent(r.s.id)}">${h(r.s.id)}</a></td>
        <td>${h(r.s.name || '')}</td><td class="mono">${h(r.course.id)}</td>
        ${attStatuses(settings, true).map(x => `<td class="c">${r.st.counts[x.key] || 0}</td>`).join('')}
        <td class="c">${r.st.counted}</td>
        <td style="min-width:150px;"><div class="gap-row"><div style="flex:1;min-width:70px;">${barHTML(r.st.pct || 0, cls)}</div><span class="mono">${fmtPct(r.st.pct)}</span></div></td>
        <td>${r.warn ? waButtonHTML(r.s.phone, msg, settings) : ''}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state">Could not run report: ${h(e.message)}</div></td></tr>`;
  }
}

document.getElementById('btn-export-report').addEventListener('click', () => {
  if (!reportRows.length) { toast('Run the report first.'); return; }
  const threshold = Number(settings.attendance.warningThreshold);
  downloadWorkbook({
    Attendance: reportRows.map(r => ({
      'Roll Number': r.s.id, 'Name': r.s.name || '', 'Phone': r.s.phone || '', 'Course': r.course.id, 'Course Title': r.course.title || '',
      ...Object.fromEntries(attStatuses(settings, false).filter(x => x.enabled !== false || reportRows.some(rr => rr.st.counts[x.key])).map(x => [x.label, r.st.counts[x.key] || 0])),
      'Classes Counted': r.st.counted, 'Attendance %': r.st.pct ?? '', [`Below ${threshold}%`]: r.warn ? 'YES' : ''
    }))
  }, `attendance-report-${localToday()}.xlsx`);
});

/* ---------------- Monthly Excel upload ---------------- */

async function monthDates(code, month, allDays) {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  const every = Array.from({ length: n }, (_, i) => `${month}-${pad2(i + 1)}`);
  if (allDays) return every;
  const set = new Set();
  const plan = await getPlan(code);
  if (plan) (plan.sessions || []).forEach(s => {
    if (s.plannedDate && s.plannedDate.startsWith(month) && !['holiday', 'midterm', 'final'].includes(s.type)) set.add(s.plannedDate);
  });
  const att = await getCourseAtt(code);
  Object.values(att).forEach(days => Object.keys(days).forEach(d => { if (d.startsWith(month)) set.add(d); }));
  return set.size ? [...set].sort() : every;
}

document.getElementById('btn-download-template').addEventListener('click', async () => {
  const code = document.getElementById('bulk-course').value;
  const month = document.getElementById('bulk-month').value;
  if (!code || !month) { setMsg('bulk-msg', 'Pick a course and a month first.', 'error'); return; }
  const roster = rosterForCourse(students, code);
  if (!roster.length) { setMsg('bulk-msg', 'No active students are enrolled in this course.', 'error'); return; }
  const dates = await monthDates(code, month, document.getElementById('bulk-all-days').checked);
  const att = await getCourseAtt(code);
  const header = ['Roll Number', 'Name', ...dates];
  const dayRow = ['', '', ...dates.map(d => WEEKDAY_SHORT[weekdayOf(d)])];
  const rows = roster.map(s => [s.id, s.name || '', ...dates.map(d => { const st = (att[s.id] || {})[d]; return st ? attCode(settings, st) : ''; })]);
  downloadWorkbook({
    Attendance: { aoa: [header, ...rows] },
    Legend: { aoa: [['Code', 'Meaning', 'Counts as'], ...attStatuses(settings, true).map(x => [x.code, x.label, RULE_WORDS[x.rule]]), ['(blank)', 'Not marked / no class', ''], [''], ['Day of week for each date:'], dayRow] }
  }, `attendance-${sanitizeId(code)}-${month}.xlsx`);
  setMsg('bulk-msg', `Template downloaded with ${dates.length} class day(s).`, 'info');
});

document.getElementById('btn-import-bulk').addEventListener('click', () => {
  if (!document.getElementById('bulk-course').value) { setMsg('bulk-msg', 'Select the course this file belongs to first.', 'error'); return; }
  document.getElementById('bulk-file').click();
});

document.getElementById('bulk-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const code = document.getElementById('bulk-course').value;
  setMsg('bulk-msg', 'Reading file…', 'info');
  try {
    const rows = await readSheet(file, { header: true, sheet: 'Attendance' });
    if (rows.length < 2) { setMsg('bulk-msg', 'That file has no data rows.', 'error'); return; }
    const dates = rows[0].slice(2).map(excelToISODate);
    const known = new Set(students.map(s => s.id));
    const ops = [];
    let marks = 0, skipped = 0;
    const unknown = [];
    rows.slice(1).forEach(row => {
      const roll = String(row[0] || '').trim();
      if (!roll) return;
      if (!known.has(roll)) { unknown.push(roll); return; }
      const days = {};
      dates.forEach((d, i) => {
        const raw = String(row[i + 2] || '').trim().toUpperCase();
        if (!raw || !d) return;
        const st = attFromCode(settings, raw);
        if (!st) { skipped++; return; }
        days[d] = st; marks++;
      });
      if (Object.keys(days).length) ops.push(attendanceWriteOpsForStudent(code, roll, days));
    });
    if (!ops.length) { setMsg('bulk-msg', 'No P/A/L/Lt/E codes found in the file.', 'error'); return; }
    const r = await writeInBatches(ops);
    delete attCache[code];
    setMsg('bulk-msg', `Import finished: ${marks} attendance mark(s) saved for ${ops.length} student(s).` +
      (skipped ? ` ${skipped} cell(s) had an unrecognised code and were skipped.` : '') +
      (unknown.length ? ` Unknown roll numbers ignored: ${unknown.join(', ')}.` : '') +
      (r.queued ? ' (Offline — will sync.)' : ''), unknown.length || skipped ? 'error' : 'info');
  } catch (err) {
    setMsg('bulk-msg', 'Could not read that file: ' + err.message, 'error');
  }
});

/* ---------------- Live check-in (students type a short-lived code) ---------------- */
// checkins/{COURSE}__{DATE}          → the code + expiry (teacher only — students can never read it)
// checkinResponses/{COURSE}__{DATE}__{ROLL} → written by a student; the security rules accept it
//                                       only if the code matches and has not expired.

let ciTimer = null, ciPoll = null, ciExpires = 0, ciResponders = new Set();
wireModal('checkin-modal', ['ci-close']);

function ciIds() {
  const code = document.getElementById('mark-course').value, date = document.getElementById('mark-date').value;
  return { code, date, id: `${code}__${date}` };
}
function newCode() {
  const a = new Uint32Array(1); crypto.getRandomValues(a);
  return String(100000 + (a[0] % 900000));
}

document.getElementById('btn-checkin').addEventListener('click', async () => {
  const { code, date, id } = ciIds();
  if (!code || !date) return;
  document.getElementById('ci-setup').classList.remove('hidden');
  document.getElementById('ci-live').classList.add('hidden');
  document.getElementById('ci-course').textContent = `${code} · ${fmtDateLong(date)}`;
  setMsg('ci-msg', date !== localToday() ? 'Note: check-in only works for today\'s date. Change the date above to today.' : '', 'error');
  openModal('checkin-modal');
  // Resume a check-in already running (or recently run) for this class today
  try {
    const doc = await db.collection('checkins').doc(id).get();
    if (doc.exists && date === localToday()) {
      const c = doc.data();
      ciExpires = c.expiresAt && c.expiresAt.toMillis ? c.expiresAt.toMillis() : (c.expiresAt ? c.expiresAt.seconds * 1000 : 0);
      showLive(c.code);
    }
  } catch (e) { /* none yet */ }
});

function showLive(pin) {
  document.getElementById('ci-setup').classList.add('hidden');
  document.getElementById('ci-live').classList.remove('hidden');
  document.getElementById('ci-code').textContent = pin;
  document.getElementById('ci-total').textContent = currentRoster.length;
  try {
    const { code } = ciIds();
    const link = new URL(`student-dashboard.html?ci=${encodeURIComponent(code)}&code=${pin}`, location.href).href;
    document.getElementById('ci-qr').innerHTML = qrSvg(link, { margin: 2 });
    document.getElementById('ci-qr').title = link;
  } catch (e) { document.getElementById('ci-qr').innerHTML = ''; }
  clearInterval(ciTimer); clearInterval(ciPoll);
  const tickCi = () => {
    const left = Math.max(0, ciExpires - Date.now());
    document.getElementById('ci-timer').textContent = left ? `Expires in ${pad2(Math.floor(left / 60000))}:${pad2(Math.floor(left / 1000) % 60)}` : 'Code expired — press New Code to reopen';
    document.getElementById('ci-code').style.opacity = left ? 1 : 0.35;
    document.getElementById('ci-qr').style.opacity = left ? 1 : 0.15;
  };
  tickCi();
  ciTimer = setInterval(tickCi, 1000);
  pollCheckins();
  ciPoll = setInterval(pollCheckins, 4000);
}

async function startCheckin() {
  const { code, date, id } = ciIds();
  if (date !== localToday()) { setMsg('ci-msg', 'Check-in only works for today. Set the date to today first.', 'error'); return; }
  if (!navigator.onLine) { setMsg('ci-msg', 'Check-in needs internet.', 'error'); return; }
  const minutes = Number(document.getElementById('ci-minutes').value) || 3;
  const pin = newCode();
  ciExpires = Date.now() + minutes * 60000;
  try {
    await db.collection('checkins').doc(id).set({
      courseCode: code, date, code: pin, createdAt: new Date().toISOString(),
      expiresAt: firebase.firestore.Timestamp.fromDate(new Date(ciExpires))
    });
  } catch (e) { setMsg('ci-msg', 'Could not start check-in: ' + e.message, 'error'); return; }
  setMsg('ci-msg', '');
  showLive(pin);
}

async function pollCheckins() {
  const { code, date } = ciIds();
  try {
    const snap = await db.collection('checkinResponses').where('courseCode', '==', code).where('date', '==', date).get();
    ciResponders = new Set(snap.docs.map(d => d.data().rollNumber));
    document.getElementById('ci-count').textContent = ciResponders.size;
    document.getElementById('ci-names').textContent = currentRoster.filter(s => ciResponders.has(s.id)).map(s => s.name || s.id).join(', ');
  } catch (e) { /* keep polling */ }
  if (Date.now() > ciExpires + 15000) clearInterval(ciPoll);
}

async function stopCheckin() {
  clearInterval(ciTimer); clearInterval(ciPoll);
  const { id } = ciIds();
  try { await db.collection('checkins').doc(id).set({ expiresAt: firebase.firestore.Timestamp.fromDate(new Date()) }, { merge: true }); } catch (e) { }
  ciExpires = Date.now();
  document.getElementById('ci-timer').textContent = 'Stopped';
  document.getElementById('ci-code').style.opacity = 0.35;
  document.getElementById('ci-qr').style.opacity = 0.15;
}

document.getElementById('ci-start').addEventListener('click', startCheckin);
document.getElementById('ci-new').addEventListener('click', startCheckin);
document.getElementById('ci-stop').addEventListener('click', stopCheckin);
document.getElementById('ci-apply').addEventListener('click', async () => {
  await pollCheckins();
  const absent = attAbsentKey(settings);
  currentRoster.forEach(s => { markState[s.id] = ciResponders.has(s.id) ? settings.attendance.defaultStatus : absent; });
  renderRoster();
  closeModal('checkin-modal');
  setMsg('mark-msg', `${ciResponders.size} student(s) checked in and are marked ${attLabel(settings, settings.attendance.defaultStatus)}; the rest are ${attLabel(settings, absent)}. Adjust anyone (e.g. Late or Leave), then press Save Attendance.`, 'info');
});


/* ---------------- Leave requests ----------------
// Students ask for leave from their Attendance page (leaveRequests). Approving
// a request turns any Absent marks in those dates into Leave, and on the
// marking screen those students are pre-set to Leave.
*/
let leaves = [];
function leaveKey() {
  const st = attStatuses(settings, true);
  const k = st.find(x => x.key === 'leave') || st.find(x => /leave/i.test(x.label));
  return k ? k.key : null;
}
function approvedLeaveFor(roll, code, date) {
  return leaves.find(l => l.status === 'approved' && l.rollNumber === roll && (!l.courseCode || l.courseCode === code) && l.from <= date && l.to >= date) || null;
}
function leaveDays(l) { return daysBetween(l.from, l.to) + 1; }
async function loadLeaves() {
  try {
    leaves = (await db.collection('leaveRequests').get()).docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { leaves = []; }
  const n = leaves.filter(l => l.status === 'pending').length;
  const pill = document.getElementById('leave-count');
  pill.textContent = n || '';
  pill.classList.toggle('hidden', !n);
}
document.getElementById('leave-filter').addEventListener('change', renderLeave);
function renderLeave() {
  const f = document.getElementById('leave-filter').value;
  const list = leaves.filter(l => f === 'all' || l.status === f)
    .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.from.localeCompare(a.from));
  const cls = { pending: 'warn', approved: 'ok', rejected: 'danger' };
  document.getElementById('leave-body').innerHTML = list.length ? list.map(l => {
    const stu = students.find(s => s.id === l.rollNumber);
    return `<tr>
      <td><div>${h((stu && stu.name) || l.studentName || '')}</div><div class="mono small muted">${h(l.rollNumber)}</div></td>
      <td class="mono">${h(l.courseCode || 'All my courses')}</td>
      <td class="mono">${h(fmtDate(l.from))}${l.to !== l.from ? ' – ' + h(fmtDate(l.to)) : ''}<div class="small muted">${leaveDays(l)} day${leaveDays(l) === 1 ? '' : 's'}</div></td>
      <td style="max-width:320px;white-space:pre-wrap;">${h(l.reason)}${l.note ? `<div class="small muted">Your note: ${h(l.note)}</div>` : ''}</td>
      <td><span class="badge ${cls[l.status] || ''}">${h(l.status)}</span>${l.applied ? `<div class="small muted">${l.applied} absent mark${l.applied === 1 ? '' : 's'} → leave</div>` : ''}</td>
      <td class="nowrap">${l.status === 'pending'
        ? `<button class="btn btn-primary-sm" onclick="decideLeave('${jsArg(l.id)}','approved')">Approve</button> <button class="btn btn-outline" onclick="decideLeave('${jsArg(l.id)}','rejected')">Reject</button>`
        : `<button class="icon-btn" onclick="decideLeave('${jsArg(l.id)}','pending')" title="Undo the decision">Undo</button> <button class="icon-btn danger" onclick="deleteLeave('${jsArg(l.id)}')">Delete</button>`}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="6"><div class="empty-state">No ${f === 'all' ? '' : h(f) + ' '}leave requests.</div></td></tr>`;
}

window.decideLeave = async function (id, status) {
  const l = leaves.find(x => x.id === id);
  if (!l) return;
  const note = (document.getElementById('leave-note').value || '').trim().slice(0, 300);
  try {
    let applied = 0;
    const lk = leaveKey(), absent = attAbsentKey(settings);
    if (status === 'approved' && lk) {
      // turn existing Absent marks in the leave dates into Leave
      const stu = students.find(s => s.id === l.rollNumber);
      const codes = l.courseCode ? [l.courseCode] : ((stu && stu.course) || []);
      const ops = [];
      for (const code of codes) {
        const att = await getCourseAtt(code, true);
        const days = att[l.rollNumber] || {};
        const change = {};
        Object.keys(days).forEach(d => { if (d >= l.from && d <= l.to && days[d] === absent) change[d] = lk; });
        if (Object.keys(change).length) {
          applied += Object.keys(change).length;
          ops.push(attendanceWriteOpsForStudent(code, l.rollNumber, change));
          Object.assign(days, change);
        }
      }
      if (ops.length) await writeInBatches(ops);
    }
    const upd = { status, decidedAt: new Date().toISOString(), note };
    if (status === 'approved') upd.applied = applied;
    await db.collection('leaveRequests').doc(id).update(upd);
    Object.assign(l, upd);
    logChange(status === 'pending' ? 'Leave decision undone' : `Leave ${status}`, `${l.rollNumber} · ${l.courseCode || 'all courses'} · ${l.from} to ${l.to}${applied ? ` · ${applied} absent → leave` : ''}`);
    document.getElementById('leave-note').value = '';
    toast(status === 'approved' ? `Approved${applied ? ` — ${applied} absent mark${applied === 1 ? '' : 's'} changed to ${attLabel(settings, lk)}` : ''}.` : status === 'rejected' ? 'Rejected.' : 'Moved back to pending.', 'info');
    await loadLeaves();
    renderLeave();
    if (document.getElementById('mark-course').value) loadRoster();
  } catch (e) { toast('Could not save: ' + e.message, 'error'); }
};
window.deleteLeave = async function (id) {
  if (!confirm('Delete this leave request? (Attendance marks are not changed.)')) return;
  try { await db.collection('leaveRequests').doc(id).delete(); await loadLeaves(); renderLeave(); }
  catch (e) { toast('Could not delete: ' + e.message, 'error'); }
};
