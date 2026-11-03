// ==========================================================================
// STUDENT DASHBOARD — own data only: attendance, course coverage, deadlines
// ==========================================================================

document.getElementById('page-sub').textContent = todayLabel();

// Scanned the class QR code? (student-dashboard.html?ci=COURSE&code=123456)
// Keep it for a few minutes so it survives the sign-in page.
(function () {
  const p = new URLSearchParams(location.search);
  if (p.get('ci') && /^\d{6}$/.test(p.get('code') || '')) {
    try { localStorage.setItem('sc_pending_checkin', JSON.stringify({ course: p.get('ci'), code: p.get('code'), at: Date.now() })); } catch (e) { }
    history.replaceState(null, '', location.pathname);
  }
})();
function takePendingCheckin() {
  try {
    const x = JSON.parse(localStorage.getItem('sc_pending_checkin') || 'null');
    localStorage.removeItem('sc_pending_checkin');
    return x && Date.now() - x.at < 15 * 60000 ? x : null;
  } catch (e) { return null; }
}

requireStudent(async (user, studentDoc) => {
  const d = studentDoc.data();
  const roll = studentDoc.id;
  const enrolled = d.course || [];
  setUserChip(d.name || roll);
  document.getElementById('stat-roll').textContent = roll;
  document.getElementById('stat-program').textContent = `${d.program || '—'} / Sem ${d.semester || '—'}`;
  document.getElementById('stat-section').textContent = d.section || '—';

  const settings = await loadSettings();
  const today = localToday();
  const [att, coursesSnap, plans, items, annSnap] = await Promise.all([
    loadStudentAttendance(roll).catch(() => ({})),
    db.collection('courses').get().catch(() => null),
    enrolled.length ? loadPlans(enrolled).catch(() => ({})) : {},
    enrolled.length ? getWhereIn('gradeItems', 'courseCode', enrolled).catch(() => []) : [],
    db.collection('announcements').orderBy('postedAt', 'desc').limit(30).get().catch(() => null)
  ]);
  const courseById = {};
  if (coursesSnap) coursesSnap.forEach(c => { courseById[c.id] = { id: c.id, ...c.data() }; });
  const threshold = Number(settings.attendance.warningThreshold);

  // Class check-in
  const ciSel = document.getElementById('ci-course-sel');
  ciSel.innerHTML = enrolled.map(c => `<option value="${h(c)}">${h(c)}${courseById[c] ? ' — ' + h(courseById[c].title || '') : ''}</option>`).join('');
  if (!enrolled.length) document.getElementById('checkin-panel').classList.add('hidden');
  document.getElementById('ci-submit').addEventListener('click', async () => {
    const course = ciSel.value, pin = document.getElementById('ci-code-in').value.replace(/\D/g, '');
    if (pin.length !== 6) { setMsg('ci-result', 'Type the 6-digit code shown in class.', 'error'); return; }
    if (!navigator.onLine) { setMsg('ci-result', 'You need internet to check in.', 'error'); return; }
    const date = localToday();
    const btn = document.getElementById('ci-submit');
    btn.disabled = true; btn.textContent = 'Checking…';
    try {
      await db.collection('checkinResponses').doc(`${course}__${date}__${roll}`).set({
        courseCode: course, date, rollNumber: roll, code: pin, at: firebase.firestore.FieldValue.serverTimestamp()
      });
      setMsg('ci-result', `✓ Checked in for ${course} at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`, 'info');
      document.getElementById('ci-code-in').value = '';
    } catch (e) {
      setMsg('ci-result', e.code === 'permission-denied'
        ? 'That code is wrong, has expired, or you already checked in for this class. Check the board and try again.'
        : 'Could not check in: ' + e.message, 'error');
    } finally { btn.disabled = false; btn.textContent = 'Check in'; }
  });
  const pending = takePendingCheckin();
  if (pending && enrolled.includes(pending.course)) {
    ciSel.value = pending.course;
    document.getElementById('ci-code-in').value = pending.code;
    document.getElementById('checkin-panel').scrollIntoView({ block: 'center' });
    document.getElementById('ci-submit').click();
  } else if (pending) {
    setMsg('ci-result', `This check-in is for ${pending.course}, which is not in your course list. Ask your lecturer.`, 'error');
  }

  // Online quiz banner (open now and not yet done)
  try {
    const att2 = await db.collection('quizAttempts').where('rollNumber', '==', roll).get();
    const done = new Set(att2.docs.map(x => x.data().status === 'submitted' ? x.data().itemId : null));
    const live = items.map(x => ({ id: x.id, ...x.data() })).filter(q => q.type === 'quiz' && q.online && q.online.enabled && appliesTo(q, roll) && !done.has(q.id) &&
      q.online.status === 'open' && (!q.online.opensAt || Date.parse(q.online.opensAt) <= Date.now()) && (!q.online.closesAt || Date.parse(q.online.closesAt) > Date.now()));
    if (live.length) document.getElementById('quiz-banner').innerHTML = live.map(q =>
      `<div class="banner ok"><span><b>Online quiz open:</b> ${h(q.title)} (${h(q.courseCode)}) · ${q.online.durationMin} min</span><a href="student-quizzes.html?take=${encodeURIComponent(q.id)}">Start →</a></div>`).join('');
  } catch (e) { /* quizzes optional */ }

  // Overall attendance
  let attended = 0, counted = 0;
  enrolled.forEach(code => { const st = attendanceStats(att[code] || {}, settings); attended += st.attended; counted += st.counted; });
  const overall = counted ? round(attended / counted * 100, 1) : null;
  const el = document.getElementById('stat-attendance');
  el.textContent = overall === null ? '—' : overall + '%';
  el.className = 'stat-value ' + (overall === null ? '' : overall < threshold ? 'danger' : 'ok');

  // Course cards
  document.getElementById('courses-list').innerHTML = enrolled.length ? enrolled.map(code => {
    const c = courseById[code] || { id: code, title: '' };
    const st = attendanceStats(att[code] || {}, settings);
    const plan = plans[code];
    const ps = plan ? planStats(plan, today) : null;
    const warn = st.pct !== null && st.pct < threshold;
    return `<a class="progress-card" href="student-course-plan.html?course=${encodeURIComponent(code)}">
      ${ps && ps.total ? ringHTML(ps.pct, 'sm ok') : ringHTML(0, 'sm', '—')}
      <div class="pc-body">
        <div class="pc-title">${h(code)} — ${h(c.title || '')}</div>
        <div class="pc-meta">${ps && ps.total ? `${ps.covered} of ${ps.total} lectures taught · Week ${ps.currentWeek}` : 'Course plan not shared yet'}
          ${ps && ps.next ? ` · Next: ${h(ps.next.topic || '')}` : ''}</div>
        <div class="gap-row" style="margin-top:8px;">
          <span class="muted small" style="min-width:86px;">Attendance</span>
          <div style="flex:1;min-width:80px;">${barHTML(st.pct || 0, warn ? 'danger' : 'ok')}</div>
          <span class="mono small ${warn ? 'cell-A' : ''}">${fmtPct(st.pct)}</span>
        </div>
      </div></a>`;
  }).join('') : `<div class="empty-state">You're not enrolled in any course yet — ask your lecturer to add course codes to your profile.</div>`;

  // Deadlines (assessments + exams from course plans)
  const upcoming = items.map(x => x.data()).filter(it => it.dueDate && it.dueDate >= today && appliesTo(it, roll));
  enrolled.forEach(code => {
    const ps = plans[code] ? planStats(plans[code], today) : null;
    if (ps && ps.nextExam) upcoming.push({ title: PLAN_TYPE_LABEL[ps.nextExam.type] + ' exams', type: ps.nextExam.type, courseCode: code, dueDate: ps.nextExam.plannedDate });
  });
  upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (upcoming.length) {
    document.getElementById('tasks-list').innerHTML = upcoming.slice(0, 8).map(it => {
      const days = daysBetween(today, it.dueDate);
      return `<div class="list-row">
        <div><div class="row-title">${h(it.title)}</div><div class="row-meta">${h(TYPE_LABEL[it.type] || PLAN_TYPE_LABEL[it.type] || it.type)} · ${h(it.courseCode)}</div></div>
        <div class="row-meta mono" style="text-align:right;">${h(fmtDate(it.dueDate))}<br><span class="chip ${days <= 2 ? 'danger' : days <= 7 ? 'warn' : ''}">${days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : 'in ' + days + ' days'}</span></div>
      </div>`;
    }).join('');
  }

  // Announcements
  if (annSnap) {
    const mine = annSnap.docs.map(x => x.data()).filter(a => a.target === 'all' || enrolled.includes(a.target)).slice(0, 5);
    if (mine.length) document.getElementById('announcements-list').innerHTML = mine.map(a => `
      <div class="list-row"><div><div class="row-title">${h(a.title)}</div><div class="row-meta" style="white-space:pre-line;">${h(a.body)}</div></div>
      <div class="row-meta mono">${h(new Date(a.postedAt).toLocaleDateString('en-GB'))}</div></div>`).join('');
  }
});
