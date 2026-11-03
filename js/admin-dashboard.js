// ==========================================================================
// ADMIN DASHBOARD
// ==========================================================================

document.getElementById('page-sub').textContent = todayLabel();

requireAdmin(async (user, adminData) => {
  setUserChip((adminData && adminData.name) || user.email);
  const settings = await loadSettings();
  const today = localToday();

  const [{ courses, students }, allAtt, plans, annSnap, itemsSnap] = await Promise.all([
    loadCoursesAndStudents(),
    loadAllAttendance().catch(() => ({})),
    loadPlans().catch(() => ({})),
    db.collection('announcements').orderBy('postedAt', 'desc').limit(5).get().catch(() => null),
    db.collection('gradeItems').where('dueDate', '>=', today).get().catch(() => null)
  ]);

  const termCourses = courses.filter(c => inActiveTerm(c, settings));
  const termCodes = new Set(termCourses.map(c => c.id));
  const active = students.filter(isActiveStudent);
  const threshold = Number(settings.attendance.warningThreshold);

  document.getElementById('stat-students').textContent = active.length;
  document.getElementById('stat-courses').textContent = termCourses.length;

  // ---------- Banners (one-time upgrade, attendance not marked, backup) ----------
  const banners = [];
  if (!settings.migration.attendanceV2) {
    try {
      const legacy = await db.collection('attendance').limit(1).get();
      if (!legacy.empty) {
        banners.push(`<div class="banner danger"><span><b>One-time upgrade needed:</b> your old attendance records need converting to the new faster format.</span><a href="settings.html#maintenance">Upgrade now →</a></div>`);
      } else {
        saveSettings({ migration: { attendanceV2: true } }).catch(() => {});
      }
    } catch (e) { /* no legacy collection access — ignore */ }
  }
  const lastBackup = settings.lastBackupAt ? settings.lastBackupAt.slice(0, 10) : null;
  if (students.length && (!lastBackup || daysBetween(lastBackup, today) > 14)) {
    banners.push(`<div class="banner"><span>${lastBackup ? `Last backup was on ${h(fmtDate(lastBackup))}.` : 'No backup downloaded yet.'} A quick backup keeps your records safe.</span><a href="backup.html">Back up now →</a></div>`);
  }
  if (settings.activeTerm) {
    banners.push(`<div class="banner ok"><span>Showing term <b>${h(settings.activeTerm)}</b>.</span><a href="settings.html#general">Change term</a></div>`);
  }
  document.getElementById('banners').innerHTML = banners.join('');
  db.collection('leaveRequests').where('status', '==', 'pending').get().then(snap => {
    if (snap.size) document.getElementById('banners').insertAdjacentHTML('afterbegin',
      `<div class="banner"><span><b>${snap.size}</b> leave request${snap.size === 1 ? '' : 's'} waiting for your decision.</span><a href="attendance.html?tab=leave">Review →</a></div>`);
  }).catch(() => {});

  // ---------- Today's attendance + warnings ----------
  let presentToday = 0, absentToday = 0;
  const risk = [];
  termCourses.forEach(c => {
    const byRoll = allAtt[c.id] || {};
    Object.entries(byRoll).forEach(([roll, days]) => {
      const st = days[today];
      if (st) {
        const rule = attRule(settings, st);
        if (rule === 'present' || rule === 'half') presentToday++;
        else if (rule === 'absent') absentToday++;
      }
      const stats = attendanceStats(days, settings);
      const s = students.find(x => x.id === roll);
      if (stats.pct !== null && stats.pct < threshold && s && isActiveStudent(s)) {
        risk.push({ s, course: c, pct: stats.pct });
      }
    });
  });
  const anyToday = termCourses.some(c => Object.values(allAtt[c.id] || {}).some(d => d[today]));
  document.getElementById('stat-present').textContent = anyToday ? presentToday : '—';
  document.getElementById('stat-absent').textContent = anyToday ? absentToday : '—';
  document.getElementById('stat-warnings').textContent = risk.length;

  // ---------- Course progress ----------
  const progress = termCourses.map(c => {
    const plan = plans[c.id];
    const stats = plan ? planStats(plan, today) : null;
    return { c, plan, stats };
  });
  const withPlans = progress.filter(p => p.stats && p.stats.total);
  document.getElementById('stat-coverage').textContent = withPlans.length
    ? Math.round(withPlans.reduce((a, p) => a + p.stats.pct, 0) / withPlans.length) + '%' : '—';

  document.getElementById('progress-list').innerHTML = progress.length ? progress.map(({ c, stats }) => {
    if (!stats || !stats.total) {
      return `<a class="progress-card" href="course-plan.html?course=${encodeURIComponent(c.id)}">
        ${ringHTML(0, 'sm', '—')}
        <div class="pc-body"><div class="pc-title">${h(c.id)} — ${h(c.title || '')}</div>
        <div class="pc-meta">No course plan yet · <span class="link-btn">Create one</span></div></div></a>`;
    }
    const pace = paceInfo(stats);
    return `<a class="progress-card" href="course-plan.html?course=${encodeURIComponent(c.id)}">
      ${ringHTML(stats.pct, 'sm ' + pace.cls)}
      <div class="pc-body">
        <div class="pc-title">${h(c.id)} — ${h(c.title || '')}</div>
        <div class="pc-meta">${stats.covered}/${stats.total} lectures · Week ${stats.currentWeek} of ${stats.weeks} · <span class="chip ${pace.cls}">${h(pace.label)}</span></div>
        ${barHTML(stats.pct, pace.cls, stats.expectedPct)}
      </div></a>`;
  }).join('') : `<div class="empty-state">No courses in this term yet. <a href="courses.html">Add a course</a>.</div>`;

  // ---------- Today: scheduled classes from plans ----------
  const todaysClasses = [];
  progress.forEach(({ c, plan }) => {
    if (!plan) return;
    (plan.sessions || []).filter(s => s.plannedDate === today).forEach(s => todaysClasses.push({ c, s }));
  });
  const todayEl = document.getElementById('today-list');
  if (todaysClasses.length) {
    todayEl.innerHTML = todaysClasses.map(({ c, s }) => {
      const marked = Object.values(allAtt[c.id] || {}).some(d => d[today]);
      const isExam = s.type === 'midterm' || s.type === 'final';
      return `<div class="list-row">
        <div><div class="row-title">${h(c.id)} — ${h(s.topic || PLAN_TYPE_LABEL[s.type])}</div>
        <div class="row-meta"><span class="chip ${s.type}">${h(PLAN_TYPE_LABEL[s.type])}</span> Week ${s.week}${s.covered ? ' · <span class="chip ok">Covered</span>' : ''}</div></div>
        <div>${isExam ? '' : marked ? '<span class="badge ok">Attendance ✓</span>'
          : `<a class="btn btn-primary-sm" style="text-decoration:none;font-size:12px;" href="attendance.html?course=${encodeURIComponent(c.id)}&date=${today}">Mark attendance</a>`}</div>
      </div>`;
    }).join('');
    const unmarked = todaysClasses.filter(({ c, s }) => !['midterm', 'final', 'holiday'].includes(s.type) && !Object.values(allAtt[c.id] || {}).some(d => d[today]));
    if (unmarked.length && new Date().getHours() >= 9) {
      document.getElementById('banners').insertAdjacentHTML('afterbegin',
        `<div class="banner"><span>Attendance not marked yet today for <b>${unmarked.map(u => h(u.c.id)).join(', ')}</b>.</span><a href="attendance.html?course=${encodeURIComponent(unmarked[0].c.id)}&date=${today}">Mark now →</a></div>`);
    }
  } else {
    todayEl.innerHTML = `<div class="empty-state">No classes planned for today${withPlans.length ? '' : ' — add course plans to see your daily schedule here'}.</div>
      <div class="gap-row" style="justify-content:center;"><a class="btn btn-outline" style="text-decoration:none;" href="attendance.html">Mark attendance</a></div>`;
  }

  // ---------- Attendance trend ----------
  const byDate = {};
  termCourses.forEach(c => Object.values(allAtt[c.id] || {}).forEach(days => {
    Object.entries(days).forEach(([d, st]) => {
      const rule = attRule(settings, st);
      if (rule === 'excluded') return;
      const e = byDate[d] = byDate[d] || { att: 0, n: 0 };
      e.n++; e.att += rule === 'present' ? 1 : rule === 'half' ? 0.5 : 0;
    });
  }));
  const dates = Object.keys(byDate).sort().slice(-30);
  if (dates.length >= 2) {
    document.getElementById('trend-chart').innerHTML = lineChartSVG({
      labels: dates.map(d => fmtDate(d, { day: 'numeric', month: 'short' })),
      series: [
        { name: 'Attendance %', color: 'var(--success)', values: dates.map(d => round(byDate[d].att / byDate[d].n * 100, 1)) },
        { name: `Warning line (${threshold}%)`, color: 'var(--danger)', values: dates.map(() => threshold), dashed: true }
      ],
      yMax: 100, ySuffix: '%', height: 210
    });
  } else if (dates.length === 1) {
    document.getElementById('trend-chart').innerHTML = `<div class="empty-state">One day recorded so far (${round(byDate[dates[0]].att / byDate[dates[0]].n * 100, 1)}%). The trend appears after a few class days.</div>`;
  }

  // ---------- Upcoming deadlines ----------
  const upcoming = [];
  if (itemsSnap) itemsSnap.forEach(doc => {
    const d = doc.data();
    if (termCodes.has(d.courseCode) && d.type !== 'task') upcoming.push(d);
  });
  progress.forEach(({ c, stats }) => {
    if (stats && stats.nextExam) upcoming.push({ title: PLAN_TYPE_LABEL[stats.nextExam.type] + ' exams', type: stats.nextExam.type, courseCode: c.id, dueDate: stats.nextExam.plannedDate, fromPlan: true });
  });
  upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const seen = new Set();
  const dl = upcoming.filter(u => { const k = u.courseCode + u.title + u.dueDate; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
  if (dl.length) {
    document.getElementById('deadlines-list').innerHTML = dl.map(d => {
      const days = daysBetween(today, d.dueDate);
      return `<div class="list-row">
        <div><div class="row-title">${h(d.title)}</div><div class="row-meta">${h(TYPE_LABEL[d.type] || PLAN_TYPE_LABEL[d.type] || d.type)} · ${h(d.courseCode)}</div></div>
        <div class="row-meta mono" style="text-align:right;">${h(fmtDate(d.dueDate))}<br><span class="chip ${days <= 2 ? 'danger' : days <= 7 ? 'warn' : ''}">${days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : 'in ' + days + ' days'}</span></div>
      </div>`;
    }).join('');
  }

  // ---------- Risk list ----------
  risk.sort((a, b) => a.pct - b.pct);
  if (risk.length) {
    document.getElementById('risk-list').innerHTML = risk.slice(0, 8).map(r => {
      const msg = fillTemplate(settings.whatsapp.attendanceTemplate, {
        name: r.s.name, roll: r.s.id, course: `${r.course.id} ${r.course.title || ''}`.trim(), pct: r.pct, threshold, teacher: settings.institution.teacher
      });
      return `<div class="list-row">
        <div><div class="row-title"><a href="student-profile.html?roll=${encodeURIComponent(r.s.id)}">${h(r.s.name || r.s.id)}</a></div>
        <div class="row-meta">${h(r.s.id)} · ${h(r.course.id)}</div></div>
        <div class="gap-row"><span class="badge danger">${r.pct}%</span>${waButtonHTML(r.s.phone, msg, settings)}</div>
      </div>`;
    }).join('') + (risk.length > 8 ? `<div class="row-meta" style="padding-top:8px;"><a href="attendance.html?tab=report">See all ${risk.length} warnings →</a></div>` : '');
  }

  // ---------- Announcements ----------
  if (annSnap && !annSnap.empty) {
    document.getElementById('announcements-list').innerHTML = annSnap.docs.map(doc => {
      const a = doc.data();
      return `<div class="list-row">
        <div><div class="row-title">${h(a.title)}</div><div class="row-meta">${a.target === 'all' ? 'All students' : h(a.target)}</div></div>
        <div class="row-meta mono">${h(new Date(a.postedAt).toLocaleDateString('en-GB'))}</div></div>`;
    }).join('');
  }
});
