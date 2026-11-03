// ==========================================================================
// STUDENT COURSE PROGRESS — read-only view of each course plan
// ==========================================================================

const want = new URLSearchParams(location.search).get('course');

requireStudent(async (user, studentDoc) => {
  const d = studentDoc.data();
  setUserChip(d.name || studentDoc.id);
  const enrolled = d.course || [];
  const area = document.getElementById('plan-area');
  if (!enrolled.length) {
    area.innerHTML = `<div class="empty-state">You're not enrolled in any course yet.</div>`;
    return;
  }
  const [plans, coursesSnap] = await Promise.all([loadPlans(enrolled).catch(() => ({})), db.collection('courses').get()]);
  const courseById = {};
  coursesSnap.forEach(c => { courseById[c.id] = { id: c.id, ...c.data() }; });

  const chips = document.getElementById('course-chips');
  chips.innerHTML = enrolled.map(code => `<button class="chip-btn" data-code="${h(code)}">${h(code)}</button>`).join('');
  chips.querySelectorAll('.chip-btn').forEach(b => b.addEventListener('click', () => show(b.dataset.code)));
  show(enrolled.includes(want) ? want : enrolled[0]);

  function show(code) {
    chips.querySelectorAll('.chip-btn').forEach(b => b.classList.toggle('active', b.dataset.code === code));
    history.replaceState(null, '', '?course=' + encodeURIComponent(code));
    const c = courseById[code] || { id: code };
    const plan = plans[code];
    if (!plan || !(plan.sessions || []).length) {
      area.innerHTML = `<div class="panel"><div class="empty-state">${h(code)} — ${h(c.title || '')}: your lecturer hasn't added a course plan yet.</div></div>`;
      return;
    }
    const today = localToday();
    const st = planStats(plan, today);
    const markers = [];
    if (st.midtermWeek) markers.push({ index: st.midtermWeek - 1, label: 'Mid' });
    if (st.finalWeek) markers.push({ index: st.finalWeek - 1, label: 'Final' });
    const byWeek = {};
    sortSessions(plan.sessions).forEach(s => (byWeek[s.week] = byWeek[s.week] || []).push(s));
    let lec = 0;
    area.innerHTML = `
      <div class="panel" style="margin-bottom:18px;">
        <div class="plan-hero">
          ${ringHTML(st.pct, 'lg ok')}
          <div>
            <h2 style="font-size:19px;margin-bottom:4px;">${h(code)} — ${h(c.title || '')}</h2>
            <div class="muted small" style="margin-bottom:12px;">Week ${st.currentWeek} of ${st.weeks}${c.teacher ? ' · ' + h(c.teacher) : ''}</div>
            <div class="plan-stats">
              <div class="plan-stat"><div class="k">Taught</div><div class="v">${st.covered} <small>/ ${st.total} lectures</small></div></div>
              <div class="plan-stat"><div class="k">Remaining</div><div class="v">${st.remaining}</div></div>
              <div class="plan-stat"><div class="k">Next topic</div><div class="v" style="font-family:var(--font-body);font-size:13.5px;">${st.next ? h(st.next.topic || '—') : '—'}</div></div>
              <div class="plan-stat"><div class="k">Next exam</div><div class="v" style="font-family:var(--font-body);font-size:13.5px;">${st.nextExam ? h(PLAN_TYPE_LABEL[st.nextExam.type]) + ' · ' + h(fmtDate(st.nextExam.plannedDate)) : '—'}</div></div>
            </div>
          </div>
        </div>
      </div>
      <div class="gap-row" style="justify-content:flex-end;margin:-6px 0 12px;"><button class="btn btn-outline" id="btn-ics">Add classes &amp; deadlines to my calendar</button></div>
      <div class="panel" style="margin-bottom:18px;"><h3>Course Progress by Week</h3>
        ${lineChartSVG({ labels: st.plannedCum.map((_, i) => 'W' + (i + 1)), series: [
          { name: 'Planned', color: 'var(--slate)', values: st.plannedCum, dashed: true },
          { name: 'Taught', color: 'var(--success)', values: st.actualCum }], yMax: 100, ySuffix: '%', markers, height: 200 })}
      </div>
      ${Object.keys(byWeek).map(Number).sort((a, b) => a - b).map(w => {
        const list = byWeek[w];
        const exam = list.some(s => s.type === 'midterm' || s.type === 'final');
        return `<div class="week-card${w === st.currentWeek ? ' current' : ''}${exam ? ' exam' : ''}">
          <div class="week-head"><div><strong>Week ${w}</strong>${w === st.currentWeek ? ' <span class="chip warn">This week</span>' : ''}</div>
            <div class="muted">${list.filter(s => TEACH_TYPES.includes(s.type) && s.covered).length}/${list.filter(s => TEACH_TYPES.includes(s.type)).length || '–'} taught</div></div>
          ${list.map(s => {
            const no = TEACH_TYPES.includes(s.type) ? ++lec : null;
            return `<div class="session-row${s.covered ? ' covered' : ''}" style="grid-template-columns:34px 92px 1fr;">
              <span class="tick ro${s.covered ? ' on' : ''}">✓</span>
              <div class="date">${s.plannedDate ? h(fmtDate(s.plannedDate)) : '—'}</div>
              <div><div class="topic">${no ? `<span class="muted mono small">L${no}</span> ` : ''}${h(s.topic || PLAN_TYPE_LABEL[s.type])}
                ${s.type !== 'lecture' ? `<span class="chip ${s.type}">${h(PLAN_TYPE_LABEL[s.type])}</span>` : ''}</div>
                ${s.details ? `<div class="details">${h(s.details)}</div>` : ''}
                ${s.covered && s.coveredOn ? `<div class="covered-on">Taught on ${h(fmtDate(s.coveredOn))}</div>` : ''}</div>
            </div>`;
          }).join('')}
        </div>`;
      }).join('')}`;
    document.getElementById('btn-ics').addEventListener('click', async () => {
      let items = [];
      try { items = (await getWhereIn('gradeItems', 'courseCode', [code])).map(x => ({ id: x.id, ...x.data() })).filter(x => appliesTo(x, studentDoc.id)); } catch (e) { }
      const ev = courseCalendarEvents(c, plan, items);
      downloadIcs(ev, `${sanitizeId(code)}-calendar.ics`, `${code} ${c.title || ''}`.trim());
      toast('Calendar file saved. Open it to add all class dates and deadlines to your phone calendar.', 'info', 6000);
    });
  }
});
