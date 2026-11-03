// ==========================================================================
// REPORT BUILDER — choose a report, filter by term / course / student /
// dates, preview it, then Excel / CSV / Print-to-PDF.
// ==========================================================================

let settings, courses = [], students = [], current = null, lastOutput = null;
const params = new URLSearchParams(location.search);

const REPORTS = [
  { id: 'attendance', name: 'Attendance Summary', desc: 'P / A / L / Lt / E counts, % and warnings per student per course', filters: ['term', 'course', 'from', 'to', 'inactive'], courseAll: true },
  { id: 'attlog', name: 'Daily Attendance Log', desc: 'Day-by-day grid (students × dates) for one course', filters: ['course', 'from', 'to', 'inactive'] },
  { id: 'gradebook', name: 'Result Sheet (Gradebook)', desc: 'Weighted totals, grades, grade points, pass/fail for one course', filters: ['course', 'from', 'to', 'inactive'] },
  { id: 'marks', name: 'Marks Detail', desc: 'Every quiz / assignment / exam mark — one column per item', filters: ['course', 'itemtype', 'from', 'to', 'inactive'] },
  { id: 'coverage', name: 'Course Coverage', desc: 'How much of each course plan is taught, pace, next topics', filters: ['term', 'course'], courseAll: true },
  { id: 'atrisk', name: 'At-Risk Students', desc: 'Low attendance or below the pass mark, across courses', filters: ['term', 'course', 'inactive'], courseAll: true },
  { id: 'transcript', name: 'Student Result Card', desc: 'Printable result card for one student — all courses with GPA', filters: ['term', 'student'] },
  { id: 'presentations', name: 'Presentations', desc: 'Topic, status, marks and remarks for every round', filters: ['term', 'course', 'from', 'to'], courseAll: true },
  { id: 'students', name: 'Student List', desc: 'Roster with contacts, program and enrolled courses', filters: ['course', 'inactive'], courseAll: true },
  { id: 'courses', name: 'Course List', desc: 'Courses with term, credit hours, teacher and books', filters: ['term'] }
];

requireAdmin(async (user, adminData) => {
  setUserChip((adminData && adminData.name) || user.email);
  settings = await loadSettings();
  ({ courses, students } = await loadCoursesAndStudents());
  const terms = [...new Set(courses.map(c => c.term).filter(Boolean))].sort();
  document.getElementById('r-term').innerHTML = '<option value="">All terms</option>' + terms.map(t => `<option${t === settings.activeTerm ? ' selected' : ''}>${h(t)}</option>`).join('');
  document.getElementById('r-student-list').innerHTML = students.map(s => `<option value="${h(s.id)} — ${h(s.name || '')}">`).join('');
  document.getElementById('report-types').innerHTML = REPORTS.map(r =>
    `<button type="button" class="report-type" data-id="${r.id}"><b>${h(r.name)}</b><span>${h(r.desc)}</span></button>`).join('');
  document.querySelectorAll('.report-type').forEach(b => b.addEventListener('click', () => selectReport(b.dataset.id)));
  selectReport(params.get('type') || 'attendance');
  if (params.get('course')) document.getElementById('r-course').value = params.get('course');
  if (params.get('roll')) {
    const s = students.find(x => x.id === params.get('roll'));
    if (s) { document.getElementById('r-student').value = `${s.id} — ${s.name || ''}`; generate(); }
  }
});

function termCourses() {
  const t = document.getElementById('r-term').value;
  return courses.filter(c => !t || (c.term || '') === t);
}

function fillCourseSelect() {
  const sel = document.getElementById('r-course'), keep = sel.value;
  const list = current && current.filters.includes('term') ? termCourses() : courses;
  sel.innerHTML = (current && current.courseAll ? '<option value="">All courses</option>' : '<option value="">Select a course…</option>') + courseOptionsHtml(list);
  if (keep && [...sel.options].some(o => o.value === keep)) sel.value = keep;
}
document.getElementById('r-term').addEventListener('change', fillCourseSelect);

function selectReport(id) {
  current = REPORTS.find(r => r.id === id) || REPORTS[0];
  document.querySelectorAll('.report-type').forEach(b => b.classList.toggle('active', b.dataset.id === current.id));
  document.querySelectorAll('#report-filters [data-f]').forEach(el => el.classList.toggle('hidden', !current.filters.includes(el.dataset.f)));
  fillCourseSelect();
  document.getElementById('r-hint').textContent = current.desc;
  setMsg('report-msg', '');
}

function f() {
  const studentRaw = document.getElementById('r-student').value.trim();
  const roll = studentRaw.split(' — ')[0].trim();
  return {
    term: document.getElementById('r-term').value,
    course: document.getElementById('r-course').value,
    student: students.find(s => s.id === roll || s.id.toLowerCase() === roll.toLowerCase()) || null,
    itemType: document.getElementById('r-itemtype').value,
    from: document.getElementById('r-from').value,
    to: document.getElementById('r-to').value,
    inactive: document.getElementById('r-inactive').checked
  };
}

function scopeCourses(flt) {
  if (flt.course) return courses.filter(c => c.id === flt.course);
  return current.filters.includes('term') ? termCourses() : courses;
}
function rangeText(flt) {
  if (flt.from && flt.to) return `${fmtDate(flt.from)} – ${fmtDate(flt.to)}`;
  if (flt.from) return `from ${fmtDate(flt.from)}`;
  if (flt.to) return `up to ${fmtDate(flt.to)}`;
  return 'all dates';
}
function courseLabel(c) { return `${c.id} — ${c.title || ''}`; }

/* ---------------- Generate ---------------- */

document.getElementById('btn-generate').addEventListener('click', generate);

async function generate() {
  const flt = f();
  setMsg('report-msg', '');
  if (['attlog', 'gradebook', 'marks'].includes(current.id) && !flt.course) { setMsg('report-msg', 'Pick a course for this report.', 'error'); return; }
  if (current.id === 'transcript' && !flt.student) { setMsg('report-msg', 'Type or pick a student (roll number).', 'error'); return; }
  const btn = document.getElementById('btn-generate');
  btn.disabled = true; btn.textContent = 'Generating…';
  try {
    lastOutput = await GENERATORS[current.id](flt);
    renderOutput(lastOutput);
  } catch (e) {
    console.error(e);
    setMsg('report-msg', 'Could not generate: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Generate Report';
  }
}

function renderOutput(out) {
  document.getElementById('report-output').classList.remove('hidden');
  document.getElementById('out-title').textContent = out.title;
  document.getElementById('out-sub').textContent = out.sub || '';
  document.getElementById('out-print-head').innerHTML = `<div style="text-align:center;margin-bottom:10px;">
    <div style="font-family:var(--font-display);font-size:18px;">${h(settings.institution.name || '')}</div>
    <div>${h(settings.institution.department || '')}</div>
    <div style="font-size:12px;">${h(settings.institution.teacher || '')} · Printed ${h(fmtDateLong(localToday()))}</div></div>`;
  const body = document.getElementById('out-body');
  if (out.html) { body.innerHTML = out.html; }
  else {
    body.innerHTML = out.tables.map(t => `
      ${t.caption ? `<h3 style="font-size:15px;margin:16px 0 10px;">${h(t.caption)}</h3>` : ''}
      <div class="table-panel table-scroll"><table class="data-table compact">
        <thead><tr>${t.columns.map(c => `<th class="${c.cls || ''}">${h(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${t.rows.length ? t.rows.map(r => `<tr class="${r._cls || ''}">${t.columns.map(c => `<td class="${c.cls || ''}${c.cellCls ? ' ' + c.cellCls(r[c.k]) : ''}">${c.html ? (r[c.k] || '') : h(r[c.k] === null || r[c.k] === undefined ? '' : r[c.k])}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${t.columns.length}"><div class="empty-state">No data for these filters.</div></td></tr>`}</tbody>
      </table></div>`).join('');
  }
  document.getElementById('report-output').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exportTables(out) {
  const sheets = {};
  (out.tables || []).forEach((t, i) => {
    const cols = t.columns.filter(c => !c.noExport);
    let name = (t.sheet || t.caption || out.title || 'Sheet').slice(0, 28);
    if (sheets[name]) name += ' ' + (i + 1);
    const rows = t.rows.map(r => Object.fromEntries(cols.map(c => [c.label, r[c.k] === null || r[c.k] === undefined ? '' : r[c.k]])));
    sheets[name] = rows.length ? rows : { aoa: [cols.map(c => c.label)] };
  });
  return sheets;
}
document.getElementById('btn-out-excel').addEventListener('click', () => {
  if (!lastOutput) return;
  downloadWorkbook(lastOutput.excel || exportTables(lastOutput), `${sanitizeId(lastOutput.file || lastOutput.title)}-${localToday()}.xlsx`);
});
document.getElementById('btn-out-csv').addEventListener('click', () => {
  if (!lastOutput) return;
  const sheets = lastOutput.excel || exportTables(lastOutput);
  const first = Object.values(sheets)[0];
  const rows = Array.isArray(first) ? first : (first.aoa || []);
  const aoa = Array.isArray(first) ? (rows.length ? [Object.keys(rows[0]), ...rows.map(r => Object.values(r))] : []) : rows;
  const csv = aoa.map(r => r.map(v => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${sanitizeId(lastOutput.file || lastOutput.title)}-${localToday()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
});
document.getElementById('btn-out-print').addEventListener('click', () => window.print());

/* ---------------- Generators ---------------- */

const pctCell = v => v === null || v === undefined || v === '' ? '' : (Number(v) < Number(settings.attendance.warningThreshold) ? 'cell-A' : '');

const GENERATORS = {

  async attendance(flt) {
    const list = scopeCourses(flt);
    const all = flt.course ? { [flt.course]: await loadCourseAttendance(flt.course) } : await loadAllAttendance();
    const threshold = Number(settings.attendance.warningThreshold);
    const rows = [];
    list.forEach(c => {
      const byRoll = all[c.id] || {};
      const roster = rosterForCourse(students, c.id, { includeInactive: flt.inactive });
      const rolls = new Set([...roster.map(s => s.id), ...Object.keys(byRoll).filter(r => flt.inactive || isActiveStudent(students.find(s => s.id === r) || {}))]);
      rolls.forEach(roll => {
        const s = students.find(x => x.id === roll) || { id: roll, name: '(removed)' };
        const st = attendanceStats(byRoll[roll] || {}, settings, flt.from, flt.to);
        const msg = fillTemplate(settings.whatsapp.attendanceTemplate, { name: s.name, roll, course: courseLabel(c), pct: st.pct, threshold, teacher: settings.institution.teacher });
        rows.push({
          roll, name: s.name || '', course: c.id, ...Object.fromEntries(attStatuses(settings, false).map(x => ['st_' + x.key, st.counts[x.key] || 0])),
          counted: st.counted, pct: st.pct ?? '', warn: st.pct !== null && st.pct < threshold ? 'YES' : '',
          _cls: st.pct !== null && st.pct < threshold ? 'row-warn' : '', wa: st.pct !== null && st.pct < threshold ? waButtonHTML(s.phone, msg, settings) : ''
        });
      });
    });
    rows.sort((a, b) => a.course.localeCompare(b.course) || (a.pct === '' ? 999 : a.pct) - (b.pct === '' ? 999 : b.pct));
    return {
      title: 'Attendance Summary', file: 'attendance-summary',
      sub: `${flt.course ? courseLabel(list[0]) : list.length + ' course(s)' + (flt.term ? ' · ' + flt.term : '')} · ${rangeText(flt)} · warning below ${threshold}%`,
      tables: [{
        sheet: 'Attendance', columns: [
          { k: 'roll', label: 'Roll No.' }, { k: 'name', label: 'Name' }, { k: 'course', label: 'Course' },
          ...attStatuses(settings, false).filter(x => x.enabled !== false || rows.some(r => r['st_' + x.key])).map(x => ({ k: 'st_' + x.key, label: x.code, cls: 'c' })),
          { k: 'counted', label: 'Classes Counted', cls: 'c' }, { k: 'pct', label: 'Attendance %', cls: 'r', cellCls: pctCell }, { k: 'warn', label: `Below ${threshold}%`, cls: 'c' },
          { k: 'wa', label: '', html: true, noExport: true }
        ], rows
      }]
    };
  },

  async attlog(flt) {
    const c = courses.find(x => x.id === flt.course);
    const att = await loadCourseAttendance(c.id);
    const roster = rosterForCourse(students, c.id, { includeInactive: flt.inactive });
    const dates = [...new Set(Object.values(att).flatMap(d => Object.keys(d)))].filter(d => inRange(d, flt.from, flt.to)).sort();
    if (!dates.length) throw new Error('No attendance recorded for this course in that date range.');
    const cols = [{ k: 'roll', label: 'Roll No.' }, { k: 'name', label: 'Name' },
      ...dates.map(d => ({ k: d, label: fmtDate(d, { day: 'numeric', month: 'short' }), cls: 'c', cellCls: v => { const k = attFromCode(settings, v); return k ? 'cell-' + attColor(settings, k) : ''; } })),
      { k: 'pct', label: '%', cls: 'r', cellCls: pctCell }];
    const rows = roster.map(s => {
      const days = att[s.id] || {};
      const r = { roll: s.id, name: s.name || '', pct: attendanceStats(days, settings, flt.from, flt.to).pct ?? '' };
      dates.forEach(d => { r[d] = days[d] ? attCode(settings, days[d]) : ''; });
      return r;
    });
    const excelHeader = ['Roll Number', 'Name', ...dates, 'Attendance %'];
    return {
      title: 'Daily Attendance Log', file: `attendance-log-${c.id}`,
      sub: `${courseLabel(c)} · ${rangeText(flt)} · ${dates.length} class day(s) · ${attStatuses(settings, false).map(x => `${x.code} ${x.label}`).join(', ')}`,
      tables: [{ columns: cols, rows }],
      excel: { 'Daily Log': { aoa: [excelHeader, ...rows.map(r => [r.roll, r.name, ...dates.map(d => r[d]), r.pct])] } }
    };
  },

  async gradebook(flt) {
    const c = courses.find(x => x.id === flt.course);
    const data = await loadCourseGradeData(c.id);
    const roster = rosterForCourse(students, c.id, { includeInactive: flt.inactive });
    const w = weightsFor(c, settings);
    const res = computeGradebook({ course: c, roster, ...data, settings, from: flt.from, to: flt.to }).sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
    const rows = res.map((r, i) => ({
      pos: i + 1, roll: r.roll, name: r.name, att: r.attPct ?? '',
      quiz: round(r.comps.quiz, 1) ?? '', assignment: round(r.comps.assignment, 1) ?? '', presentation: round(r.comps.presentation, 1) ?? '',
      task: round(r.comps.task, 1) ?? '', exam: round(r.comps.exam, 1) ?? '',
      earned: r.possible ? `${r.earned} / ${r.possible}` : '', bonus: r.bonus || '', negative: r.negative || '',
      total: r.total ?? '', grade: r.grade, gp: r.gp ?? '', result: r.total === null ? '' : r.passed ? 'Pass' : 'Fail',
      _cls: r.total !== null && !r.passed ? 'row-warn' : ''
    }));
    const comp = k => w[k] > 0 ? [{ k, label: `${TYPE_LABEL[k]} % (${w[k]})`, cls: 'r' }] : [];
    const totals = res.map(r => r.total).filter(t => t !== null);
    return {
      title: 'Result Sheet', file: `result-sheet-${c.id}`,
      sub: `${courseLabel(c)}${c.term ? ' · ' + c.term : ''} · ${rangeText(flt)} · ${roster.length} students` + (totals.length ? ` · class average ${round(totals.reduce((a, b) => a + b, 0) / totals.length, 1)}%` : ''),
      tables: [{
        sheet: 'Result Sheet', columns: [
          { k: 'pos', label: '#', cls: 'c' }, { k: 'roll', label: 'Roll No.' }, { k: 'name', label: 'Name' },
          ...(w.attendance > 0 ? [{ k: 'att', label: `Attendance % (${w.attendance})`, cls: 'r', cellCls: pctCell }] : []),
          ...comp('quiz'), ...comp('assignment'), ...comp('presentation'), ...comp('task'), ...comp('exam'),
          { k: 'earned', label: 'Earned / Possible', cls: 'r' }, { k: 'bonus', label: 'Bonus', cls: 'r' }, { k: 'negative', label: 'Neg.', cls: 'r' },
          { k: 'total', label: 'Total %', cls: 'r' }, { k: 'grade', label: 'Grade', cls: 'c' }, { k: 'gp', label: 'GP', cls: 'c' }, { k: 'result', label: 'Result', cls: 'c' }
        ], rows
      }]
    };
  },

  async marks(flt) {
    const c = courses.find(x => x.id === flt.course);
    const data = await loadCourseGradeData(c.id);
    const items = data.items.filter(it => (!flt.itemType || it.type === flt.itemType) && inRange(it.dueDate, flt.from, flt.to) && Number(it.totalMarks) > 0)
      .sort((a, b) => (a.type.localeCompare(b.type)) || (a.dueDate || '').localeCompare(b.dueDate || ''));
    if (!items.length) throw new Error('No graded items match these filters.');
    const idx = {};
    data.marks.forEach(m => { idx[m.itemId + '|' + m.rollNumber] = m; });
    const roster = rosterForCourse(students, c.id, { includeInactive: flt.inactive });
    const rows = roster.map(s => {
      const r = { roll: s.id, name: s.name || '' };
      let sum = 0, n = 0;
      items.forEach(it => {
        const m = idx[it.id + '|' + s.id];
        const v = m && m.marksObtained !== null && m.marksObtained !== undefined ? Number(m.marksObtained) : null;
        r[it.id] = !appliesTo(it, s.id) ? 'n/a' : v === null ? '' : v;
        if (v !== null) { sum += v / Number(it.totalMarks) * 100; n++; }
      });
      r.avg = n ? round(sum / n, 1) : '';
      return r;
    });
    return {
      title: 'Marks Detail', file: `marks-${c.id}`,
      sub: `${courseLabel(c)} · ${flt.itemType ? TYPE_LABEL_PLURAL[flt.itemType] : 'all assessment types'} · ${rangeText(flt)} · ${items.length} item(s)`,
      tables: [{
        sheet: 'Marks', columns: [{ k: 'roll', label: 'Roll No.' }, { k: 'name', label: 'Name' },
          ...items.map(it => ({ k: it.id, label: `${TYPE_LABEL[it.type]}: ${it.title} (/${it.totalMarks})`, cls: 'c' })),
          { k: 'avg', label: 'Average %', cls: 'r' }], rows
      }]
    };
  },

  async coverage(flt) {
    const list = scopeCourses(flt);
    const plans = await loadPlans(list.map(c => c.id));
    const today = localToday();
    const rows = list.map(c => {
      const p = plans[c.id];
      if (!p) return { code: c.id, title: c.title || '', term: c.term || '', covered: '', pct: '', expected: '', pace: 'No plan', week: '', next: '', exam: '' };
      const s = planStats(p, today);
      const pace = paceInfo(s);
      return {
        code: c.id, title: c.title || '', term: c.term || '', covered: `${s.covered} / ${s.total}`, pct: s.pct, expected: s.expectedPct,
        pace: pace.label, week: `${s.currentWeek} / ${s.weeks}`, next: s.next ? s.next.topic : '',
        exam: s.nextExam ? `${PLAN_TYPE_LABEL[s.nextExam.type]} ${fmtDate(s.nextExam.plannedDate)}` : '', _cls: pace.cls === 'danger' ? 'row-warn' : ''
      };
    });
    const tables = [{
      sheet: 'Coverage', caption: list.length > 1 ? 'All courses' : '', columns: [
        { k: 'code', label: 'Code' }, { k: 'title', label: 'Course' }, { k: 'term', label: 'Term' }, { k: 'covered', label: 'Lectures Covered', cls: 'c' },
        { k: 'pct', label: 'Covered %', cls: 'r' }, { k: 'expected', label: 'Planned by Today %', cls: 'r' }, { k: 'pace', label: 'Pace' },
        { k: 'week', label: 'Week', cls: 'c' }, { k: 'next', label: 'Next Topic' }, { k: 'exam', label: 'Next Exam' }
      ], rows
    }];
    if (list.length === 1 && plans[list[0].id]) {
      let lec = 0;
      tables.push({
        sheet: 'Sessions', caption: 'Session by session', columns: [
          { k: 'week', label: 'Week', cls: 'c' }, { k: 'no', label: 'Lecture', cls: 'c' }, { k: 'date', label: 'Planned Date' }, { k: 'type', label: 'Type' },
          { k: 'topic', label: 'Topic' }, { k: 'status', label: 'Status' }, { k: 'on', label: 'Covered On' }
        ],
        rows: sortSessions(plans[list[0].id].sessions || []).map(s => ({
          week: s.week, no: TEACH_TYPES.includes(s.type) ? ++lec : '', date: s.plannedDate ? fmtDate(s.plannedDate) : '', type: PLAN_TYPE_LABEL[s.type],
          topic: s.topic || '', status: s.covered ? 'Covered' : (s.plannedDate && s.plannedDate < today && TEACH_TYPES.includes(s.type) ? 'Pending' : ''),
          on: s.coveredOn ? fmtDate(s.coveredOn) : '', _cls: !s.covered && s.plannedDate && s.plannedDate < today && TEACH_TYPES.includes(s.type) ? 'row-warn' : ''
        }))
      });
    }
    return { title: 'Course Coverage', file: 'course-coverage', sub: `${list.length} course(s)${flt.term ? ' · ' + flt.term : ''} · as of ${fmtDate(today)}`, tables };
  },

  async atrisk(flt) {
    const list = scopeCourses(flt);
    const rows = [];
    const threshold = Number(settings.attendance.warningThreshold);
    for (const c of list) {
      const data = await loadCourseGradeData(c.id);
      const res = computeGradebook({ course: c, roster: rosterForCourse(students, c.id, { includeInactive: flt.inactive }), ...data, settings });
      res.forEach(r => {
        const lowAtt = r.attWarn, failing = r.total !== null && !r.passed;
        if (!lowAtt && !failing) return;
        const tpl = lowAtt ? settings.whatsapp.attendanceTemplate : settings.whatsapp.resultTemplate;
        const msg = fillTemplate(tpl, { name: r.name, roll: r.roll, course: courseLabel(c), pct: r.attPct, threshold, total: r.total ?? '—', grade: r.grade, teacher: settings.institution.teacher });
        rows.push({
          roll: r.roll, name: r.name, phone: r.phone, course: c.id, att: r.attPct ?? '', total: r.total ?? '', grade: r.grade,
          reason: [lowAtt ? `Attendance below ${threshold}%` : '', failing ? `Below pass mark (${settings.grading.passMark}%)` : ''].filter(Boolean).join(' + '),
          wa: waButtonHTML(r.phone, msg, settings), _cls: 'row-warn'
        });
      });
    }
    rows.sort((a, b) => a.course.localeCompare(b.course) || (a.total === '' ? 999 : a.total) - (b.total === '' ? 999 : b.total));
    return {
      title: 'At-Risk Students', file: 'at-risk-students',
      sub: `${list.length} course(s)${flt.term ? ' · ' + flt.term : ''} · ${rows.length} flag(s) · based on current marks and your Settings`,
      tables: [{
        sheet: 'At Risk', columns: [
          { k: 'roll', label: 'Roll No.' }, { k: 'name', label: 'Name' }, { k: 'phone', label: 'Phone' }, { k: 'course', label: 'Course' },
          { k: 'att', label: 'Attendance %', cls: 'r', cellCls: pctCell }, { k: 'total', label: 'Current Total %', cls: 'r' }, { k: 'grade', label: 'Grade', cls: 'c' },
          { k: 'reason', label: 'Reason' }, { k: 'wa', label: '', html: true, noExport: true }
        ], rows
      }]
    };
  },

  async transcript(flt) {
    const s = flt.student;
    const att = await loadStudentAttendance(s.id);
    const codes = [...new Set([...(s.course || []), ...Object.keys(att)])];
    const list = courses.filter(c => codes.includes(c.id) && (!flt.term || (c.term || '') === flt.term));
    if (!list.length) throw new Error('This student has no courses' + (flt.term ? ' in ' + flt.term : '') + '.');
    const rows = [];
    for (const c of list) {
      const data = await loadCourseGradeData(c.id);
      const r = computeGradebook({ course: c, roster: [s], ...data, settings })[0];
      rows.push({ c, r });
    }
    let qp = 0, cr = 0;
    rows.forEach(({ c, r }) => { if (r.gp !== null && r.total !== null) { qp += r.gp * Number(c.creditHours || 0); cr += Number(c.creditHours || 0); } });
    const gpa = cr ? round(qp / cr, 2) : null;
    const inst = settings.institution;
    const html = `<div class="result-card">
      <div class="rc-head">
        <div><div style="font-family:var(--font-display);font-size:17px;color:var(--ink);">${h(inst.name || "Sanaullah's Classroom")}</div>
          <div class="muted small">${h(inst.department || '')}</div></div>
        <div style="text-align:right;"><h2>Result Card</h2><div class="muted small">${flt.term ? h(flt.term) + ' · ' : ''}${h(fmtDateLong(localToday()))}</div></div>
      </div>
      <div class="info-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:16px;font-size:13px;">
        <div><span class="muted">Name</span><br><b>${h(s.name || '')}</b></div>
        <div><span class="muted">Roll Number</span><br><b class="mono">${h(s.id)}</b></div>
        <div><span class="muted">Father's Name</span><br><b>${h(s.fatherName || '—')}</b></div>
        <div><span class="muted">Program / Semester</span><br><b>${h(s.program || '—')} / ${h(s.semester || '—')}${s.section ? ' (' + h(s.section) + ')' : ''}</b></div>
      </div>
      <table class="data-table compact">
        <thead><tr><th>Code</th><th>Course</th><th class="c">Cr. Hrs</th><th class="r">Attendance</th><th class="r">Total %</th><th class="c">Grade</th><th class="c">GP</th><th class="c">Result</th></tr></thead>
        <tbody>${rows.map(({ c, r }) => `<tr>
          <td class="mono">${h(c.id)}</td><td>${h(c.title || '')}</td><td class="c">${h(c.creditHours || '')}</td>
          <td class="r ${r.attWarn ? 'cell-A' : ''}">${fmtPct(r.attPct)}</td>
          <td class="r"><b>${r.total === null ? '—' : r.total + '%'}</b></td><td class="c"><b>${h(r.grade)}</b></td>
          <td class="c">${r.gp === null ? '—' : Number(r.gp).toFixed(2)}</td><td class="c">${r.total === null ? '—' : r.passed ? 'Pass' : '<span class="cell-A">Fail</span>'}</td></tr>`).join('')}</tbody>
      </table>
      <div class="gap-row" style="justify-content:flex-end;margin-top:14px;font-size:14px;">
        <span>Credit hours: <b>${cr}</b></span><span style="margin-left:18px;">GPA: <b style="font-size:17px;">${gpa === null ? '—' : gpa.toFixed(2)}</b></span>
      </div>
      <p class="muted small" style="margin-top:12px;">Component breakdown — ${rows.map(({ c, r }) => `${h(c.id)}: ${['attendance', ...GRADE_TYPES].filter(k => k === 'attendance' ? r.attScore !== null : r.comps[k] !== null).map(k => `${TYPE_LABEL[k]} ${round(k === 'attendance' ? r.attScore : r.comps[k], 1)}%`).join(', ') || 'no marks yet'}`).join(' · ')}</p>
      <div class="rc-sign"><div>${h(inst.teacher || '')}<br>Course Teacher</div><div>Head of Department</div></div>
    </div>`;
    return {
      title: `Result Card — ${s.name || s.id}`, file: `result-card-${s.id}`, sub: `${rows.length} course(s) · GPA ${gpa === null ? '—' : gpa.toFixed(2)}`, html,
      excel: {
        'Result Card': rows.map(({ c, r }) => ({
          'Roll Number': s.id, 'Name': s.name || '', 'Course Code': c.id, 'Course': c.title || '', 'Credit Hours': c.creditHours || '',
          'Attendance %': r.attPct ?? '', 'Total %': r.total ?? '', 'Grade': r.grade, 'Grade Points': r.gp ?? '', 'Result': r.total === null ? '' : r.passed ? 'Pass' : 'Fail'
        })).concat([{ 'Roll Number': '', 'Name': '', 'Course Code': '', 'Course': 'GPA', 'Credit Hours': cr, 'Attendance %': '', 'Total %': '', 'Grade': '', 'Grade Points': gpa ?? '', 'Result': '' }])
      }
    };
  },

  async presentations(flt) {
    const list = scopeCourses(flt);
    const codes = new Set(list.map(c => c.id));
    const itemsSnap = await db.collection('gradeItems').where('type', '==', 'presentation').get();
    const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(it => codes.has(it.courseCode) && inRange(it.dueDate, flt.from, flt.to));
    if (!items.length) throw new Error('No presentation rounds found for these filters.');
    const marksDocs = await getWhereIn('gradeMarks', 'itemId', items.map(i => i.id));
    const rows = [];
    items.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).forEach(it => {
      marksDocs.map(d => d.data()).filter(m => m.itemId === it.id).forEach(m => {
        const s = students.find(x => x.id === m.rollNumber) || {};
        rows.push({ round: it.title, course: it.courseCode, date: it.dueDate ? fmtDate(it.dueDate) : '', roll: m.rollNumber, name: s.name || '', topic: m.topic || '', status: m.status || '', marks: m.marksObtained ?? '', total: m.totalMarks ?? '', remarks: m.remarks || '' });
      });
    });
    return {
      title: 'Presentation Report', file: 'presentations', sub: `${items.length} round(s) · ${rangeText(flt)}`,
      tables: [{
        sheet: 'Presentations', columns: [
          { k: 'round', label: 'Round' }, { k: 'course', label: 'Course' }, { k: 'date', label: 'Date' }, { k: 'roll', label: 'Roll No.' }, { k: 'name', label: 'Name' },
          { k: 'topic', label: 'Topic' }, { k: 'status', label: 'Status' }, { k: 'marks', label: 'Marks', cls: 'r' }, { k: 'total', label: 'Out of', cls: 'r' }, { k: 'remarks', label: 'Remarks' }
        ], rows
      }]
    };
  },

  async students(flt) {
    const list = students.filter(s => (flt.inactive || isActiveStudent(s)) && (!flt.course || (s.course || []).includes(flt.course)));
    return {
      title: 'Student List', file: 'student-list', sub: `${list.length} student(s)${flt.course ? ' in ' + flt.course : ''}`,
      tables: [{
        sheet: 'Students', columns: [
          { k: 'id', label: 'Roll No.' }, { k: 'name', label: 'Name' }, { k: 'fatherName', label: "Father's Name" }, { k: 'phone', label: 'Phone' }, { k: 'email', label: 'Email' },
          { k: 'program', label: 'Program' }, { k: 'semester', label: 'Sem', cls: 'c' }, { k: 'section', label: 'Sec' }, { k: 'session', label: 'Session' }, { k: 'status', label: 'Status' }, { k: 'courses', label: 'Courses' }
        ], rows: list.map(s => ({ ...s, status: s.status || 'active', courses: (s.course || []).join(', ') }))
      }]
    };
  },

  async courses(flt) {
    const list = termCourses();
    return {
      title: 'Course List', file: 'course-list', sub: `${list.length} course(s)${flt.term ? ' · ' + flt.term : ''}`,
      tables: [{
        sheet: 'Courses', columns: [
          { k: 'id', label: 'Code' }, { k: 'title', label: 'Title' }, { k: 'term', label: 'Term' }, { k: 'className', label: 'Class' }, { k: 'creditHours', label: 'Cr. Hrs', cls: 'c' },
          { k: 'semester', label: 'Sem', cls: 'c' }, { k: 'section', label: 'Sec' }, { k: 'teacher', label: 'Teacher' }, { k: 'enrolled', label: 'Students', cls: 'c' }, { k: 'books', label: 'Reference Books' }
        ], rows: list.map(c => ({ ...c, enrolled: rosterForCourse(students, c.id).length, books: (c.referenceBooks || []).join('; ') }))
      }]
    };
  }
};
