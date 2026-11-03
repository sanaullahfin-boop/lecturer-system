// ==========================================================================
// STUDENT PROFILE (admin) — one complete view of a student: details,
// per-course attendance, current standing, course coverage, every mark.
// ==========================================================================

const roll = new URLSearchParams(location.search).get('roll');

requireAdmin(async (user, adminData) => {
  setUserChip((adminData && adminData.name) || user.email);
  const content = document.getElementById('content');
  if (!roll) {
    content.innerHTML = `<div class="empty-state">No student specified. Go back to Students and click "Profile".</div>`;
    return;
  }
  const settings = await loadSettings();
  try {
    const [studentDoc, coursesSnap, att, marksSnap] = await Promise.all([
      db.collection('students').doc(roll).get(),
      db.collection('courses').get(),
      loadStudentAttendance(roll),
      db.collection('gradeMarks').where('rollNumber', '==', roll).get()
    ]);
    if (!studentDoc.exists) {
      content.innerHTML = `<div class="empty-state">No student found with roll number "${h(roll)}".</div>`;
      return;
    }
    const s = { id: roll, ...studentDoc.data() };
    const allCourses = coursesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const codes = [...new Set([...(s.course || []), ...Object.keys(att)])];
    const myCourses = codes.map(c => allCourses.find(x => x.id === c) || { id: c, title: '(course removed)' });
    const plans = codes.length ? await loadPlans(codes) : {};

    // Standing per course (uses the same engine as the Gradebook)
    const standing = {};
    for (const c of myCourses) {
      if (!allCourses.some(x => x.id === c.id)) continue;
      const data = await loadCourseGradeData(c.id);
      standing[c.id] = computeGradebook({ course: c, roster: [s], ...data, settings })[0];
    }

    const marks = marksSnap.docs.map(d => d.data());
    const itemIds = [...new Set(marks.map(m => m.itemId))];
    const itemsById = {};
    (await getWhereIn('gradeItems', firebase.firestore.FieldPath.documentId(), itemIds)).forEach(d => { itemsById[d.id] = d.data(); });

    render(s, myCourses, att, standing, plans, marks, itemsById, settings);
  } catch (e) {
    content.innerHTML = `<div class="empty-state">Could not load this profile: ${h(e.message)}</div>`;
  }
});

function render(s, myCourses, att, standing, plans, marks, itemsById, settings) {
  const threshold = Number(settings.attendance.warningThreshold);
  const info = [
    ['Program', s.program || '—'], ['Semester', s.semester ?? '—'], ['Section', s.section || '—'], ['Session', s.session || '—'],
    ['Status', s.status || 'active'], ["Father's Name", s.fatherName || '—'], ['Email', s.email || '—'], ['Phone', s.phone || '—']
  ];

  const courseCards = myCourses.map(c => {
    const st = attendanceStats(att[c.id] || {}, settings);
    const row = standing[c.id];
    const plan = plans[c.id];
    const ps = plan ? planStats(plan) : null;
    const attMsg = fillTemplate(settings.whatsapp.attendanceTemplate, { name: s.name, roll: s.id, course: `${c.id} ${c.title || ''}`.trim(), pct: st.pct, threshold, teacher: settings.institution.teacher });
    const resMsg = row ? fillTemplate(settings.whatsapp.resultTemplate, { name: s.name, roll: s.id, course: `${c.id} ${c.title || ''}`.trim(), total: row.total ?? '—', grade: row.grade, teacher: settings.institution.teacher }) : '';
    const warn = st.pct !== null && st.pct < threshold;
    return `<div class="panel">
      <div class="gap-row" style="justify-content:space-between;margin-bottom:10px;">
        <div><b>${h(c.id)}</b> — ${h(c.title || '')} ${c.term ? `<span class="chip">${h(c.term)}</span>` : ''}</div>
        <div class="gap-row">
          ${warn ? waButtonHTML(s.phone, attMsg, settings, 'Attendance warning') : ''}
          ${row && row.total !== null ? waButtonHTML(s.phone, resMsg, settings, 'Send result') : ''}
          <a class="icon-btn" href="marks.html?course=${encodeURIComponent(c.id)}">Gradebook</a>
        </div>
      </div>
      <div class="plan-stats">
        <div class="plan-stat"><div class="k">Attendance</div><div class="v ${warn ? 'cell-A' : ''}">${fmtPct(st.pct)} <small>${st.attended}/${st.counted}</small></div>
          <div class="muted small">${h(attCountsText(st, settings))}</div></div>
        <div class="plan-stat"><div class="k">Current total</div><div class="v">${row && row.total !== null ? row.total + '%' : '—'} <small>${row ? h(row.grade) : ''}</small></div>
          <div class="muted small">${row && row.possible ? `${row.earned} of ${row.possible} marks assessed so far` : 'No marks yet'}</div></div>
        <div class="plan-stat"><div class="k">Course covered</div><div class="v">${ps ? ps.pct + '%' : '—'}</div>
          <div class="muted small">${ps ? `${ps.covered}/${ps.total} lectures` : 'No plan'}</div></div>
        <div class="plan-stat"><div class="k">Components</div><div class="muted small" style="margin-top:4px;line-height:1.6;">${row ? GRADE_TYPES.filter(t => row.comps[t] !== null).map(t => `${TYPE_LABEL[t]} ${round(row.comps[t], 1)}%`).join('<br>') || '—' : '—'}</div></div>
      </div>
    </div>`;
  }).join('') || '<div class="empty-state">Not enrolled in any course yet.</div>';

  const marksRows = marks
    .map(m => ({ ...m, item: itemsById[m.itemId] }))
    .filter(m => m.item)
    .sort((a, b) => (b.item.dueDate || '').localeCompare(a.item.dueDate || ''))
    .map(m => `<tr>
        <td>${h(m.item.title)}</td><td>${h(TYPE_LABEL[m.type] || m.type)}</td><td class="mono">${h(m.item.courseCode)}</td>
        <td class="mono">${h(m.item.dueDate ? fmtDate(m.item.dueDate) : '')}</td>
        <td class="r num">${m.marksObtained ?? '—'} / ${m.totalMarks ?? '—'}</td>
        <td class="r num">${m.marksObtained !== null && m.marksObtained !== undefined && m.totalMarks ? round(m.marksObtained / m.totalMarks * 100, 0) + '%' : ''}</td>
        <td>${h(m.remarks || '')}${m.item.countInGrade === false ? ' <span class="chip">not counted</span>' : ''}</td>
      </tr>`).join('');

  document.getElementById('content').innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${h((s.name || '?').charAt(0).toUpperCase())}</div>
      <div style="flex:1;">
        <div class="profile-name">${h(s.name || '(no name)')}</div>
        <div class="profile-meta">Roll Number: <span class="mono">${h(s.id)}</span></div>
      </div>
      <div class="gap-row no-print">
        <a class="btn btn-outline" style="text-decoration:none;" href="reports.html?type=transcript&roll=${encodeURIComponent(s.id)}">Result Card / Transcript</a>
        <a class="btn btn-outline" style="text-decoration:none;" href="students.html">Edit in Students</a>
      </div>
    </div>
    <div class="info-grid">${info.map(([l, v]) => `<div class="info-item"><div class="label">${h(l)}</div><div class="value">${h(String(v))}</div></div>`).join('')}</div>
    <h3 class="section-title">Courses</h3>
    <div class="stack">${courseCards}</div>
    <h3 class="section-title">All Recorded Marks</h3>
    <div class="table-panel">${marksRows ? `<table class="data-table compact"><thead><tr><th>Title</th><th>Type</th><th>Course</th><th>Date</th><th class="r">Marks</th><th class="r">%</th><th>Remarks</th></tr></thead><tbody>${marksRows}</tbody></table>` : '<div class="empty-state">No marks recorded yet.</div>'}</div>`;
}
