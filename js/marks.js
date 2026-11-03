// ==========================================================================
// EXAMS & GRADEBOOK — weighted gradebook driven by Settings rules, plus
// Internal Exams (shared grade-items module).
// ==========================================================================

const examItems = GradeItems({
  types: [{ type: 'exam', label: 'Internal Exam', plural: 'Internal Exams', add: '+ New Internal Exam', dateLabel: 'Date *' }],
  examTitle: true,
  updateSubtitle: false
});
document.getElementById('page-sub').textContent = 'Weighted totals, letter grades and internal exams';

let settings, courses = [], students = [];
let gbData = null, gbRows = [], gbCourse = '';
const W_KEYS = ['attendance', 'quiz', 'assignment', 'presentation', 'task', 'exam'];
const params = new URLSearchParams(location.search);

requireAdmin(async (user, adminData) => {
  setUserChip((adminData && adminData.name) || user.email);
  settings = await loadSettings();
  ({ courses, students } = await loadCoursesAndStudents());
  document.getElementById('gb-course').insertAdjacentHTML('beforeend', courseOptionsHtml(courses, { settings, activeOnly: false }));
  await examItems.init(settings, courses, students);
  const want = params.get('course');
  if (want) { document.getElementById('gb-course').value = want; loadWeights(); runGradebook(); }
  else loadWeights();
});

/* ---------------- Tabs ---------------- */

document.querySelectorAll('.tabs > .tab-btn[data-tab]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs > .tab-btn[data-tab]').forEach(x => x.classList.toggle('active', x === b));
  ['gradebook', 'exams'].forEach(t => document.getElementById('tab-' + t).classList.toggle('hidden', t !== b.dataset.tab));
}));

/* ---------------- Weights ---------------- */

function loadWeights() {
  const code = document.getElementById('gb-course').value;
  const course = courses.find(c => c.id === code);
  const w = weightsFor(course, settings);
  W_KEYS.forEach(k => { document.getElementById('w-' + k).value = w[k]; });
  updateWeightSum();
}
function readWeights() {
  const w = {};
  W_KEYS.forEach(k => { w[k] = Number(document.getElementById('w-' + k).value) || 0; });
  return w;
}
function updateWeightSum() {
  const sum = round(Object.values(readWeights()).reduce((a, b) => a + b, 0), 2);
  const el = document.getElementById('w-sum');
  el.textContent = sum;
  el.style.color = sum === 100 ? 'var(--success)' : 'var(--danger)';
}
W_KEYS.forEach(k => document.getElementById('w-' + k).addEventListener('input', updateWeightSum));

document.getElementById('gb-course').addEventListener('change', () => {
  loadWeights();
  gbData = null;
  document.getElementById('gb-summary').classList.add('hidden');
  document.getElementById('gb-body').innerHTML = `<tr><td colspan="14"><div class="empty-state">Click "Run Gradebook".</div></td></tr>`;
});

document.getElementById('btn-save-weights').addEventListener('click', async () => {
  const code = document.getElementById('gb-course').value;
  if (!code) { setMsg('weights-msg', 'Pick a course first.', 'error'); return; }
  const w = readWeights();
  const sum = round(Object.values(w).reduce((a, b) => a + b, 0), 2);
  if (sum !== 100) { setMsg('weights-msg', `Weights add up to ${sum}, not 100.`, 'error'); return; }
  try {
    await commitSmart(db.collection('courses').doc(code).update({ gradeWeights: w }));
    const c = courses.find(x => x.id === code); if (c) c.gradeWeights = w;
    setMsg('weights-msg', 'Saved for ' + code + '.', 'info');
    if (gbData) recompute();
  } catch (e) { setMsg('weights-msg', 'Could not save: ' + e.message, 'error'); }
});

document.getElementById('btn-default-weights').addEventListener('click', async () => {
  const code = document.getElementById('gb-course').value;
  W_KEYS.forEach(k => { document.getElementById('w-' + k).value = settings.grading.defaultWeights[k]; });
  updateWeightSum();
  if (code) {
    try {
      await commitSmart(db.collection('courses').doc(code).update({ gradeWeights: firebase.firestore.FieldValue.delete() }));
      const c = courses.find(x => x.id === code); if (c) delete c.gradeWeights;
      setMsg('weights-msg', 'Using the default weights from Settings.', 'info');
      if (gbData) recompute();
    } catch (e) { setMsg('weights-msg', 'Could not reset: ' + e.message, 'error'); }
  }
});

/* ---------------- Gradebook ---------------- */

document.getElementById('btn-run-gb').addEventListener('click', runGradebook);

async function runGradebook() {
  const code = document.getElementById('gb-course').value;
  const body = document.getElementById('gb-body');
  if (!code) { body.innerHTML = `<tr><td colspan="14"><div class="empty-state">Select a course first.</div></td></tr>`; return; }
  body.innerHTML = `<tr><td colspan="14"><div class="empty-state"><span class="loading-dot"></span> Crunching the gradebook…</div></td></tr>`;
  try {
    gbCourse = code;
    gbData = await loadCourseGradeData(code);
    recompute();
  } catch (e) {
    body.innerHTML = `<tr><td colspan="14"><div class="empty-state">Could not run: ${h(e.message)}</div></td></tr>`;
  }
}

function recompute() {
  const course = { ...(courses.find(c => c.id === gbCourse) || { id: gbCourse }) };
  const typed = readWeights();
  if (round(Object.values(typed).reduce((a, b) => a + b, 0), 2) === 100) course.gradeWeights = typed; // preview unsaved weights
  const roster = rosterForCourse(students, gbCourse, { includeInactive: document.getElementById('gb-inactive').checked });
  gbRows = computeGradebook({
    course, roster, ...gbData, settings,
    from: document.getElementById('gb-from').value, to: document.getElementById('gb-to').value
  }).sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  renderGradebook(course);
}

function renderGradebook(course) {
  const body = document.getElementById('gb-body');
  if (!gbRows.length) {
    body.innerHTML = `<tr><td colspan="14"><div class="empty-state">No students enrolled in this course.</div></td></tr>`;
    document.getElementById('gb-summary').classList.add('hidden');
    return;
  }
  const w = weightsFor(course, settings);
  const cell = (v, k) => w[k] > 0 ? `<td class="r num" title="${TYPE_LABEL[k]} — weight ${w[k]}">${v === null || v === undefined ? '—' : round(v, 1)}</td>` : `<td class="r muted" title="Not charged (weight 0)">·</td>`;
  const threshold = Number(settings.attendance.warningThreshold);
  body.innerHTML = gbRows.map(r => {
    const msg = fillTemplate(settings.whatsapp.resultTemplate, {
      name: r.name, roll: r.roll, course: `${course.id} ${course.title || ''}`.trim(), total: r.total ?? '—', grade: r.grade, teacher: settings.institution.teacher, pct: r.attPct, threshold
    });
    return `<tr class="${r.total !== null && !r.passed ? 'fail' : ''}">
      <td class="mono"><a href="student-profile.html?roll=${encodeURIComponent(r.roll)}">${h(r.roll)}</a></td>
      <td>${h(r.name)}</td>
      ${w.attendance > 0 ? `<td class="r num" title="Attendance ${fmtPct(r.attPct)} → score ${fmtPct(r.attScore)}">${r.attPct === null ? '—' : `<span class="${r.attWarn ? 'cell-A' : ''}">${round(r.attPct, 1)}</span>`}</td>` : '<td class="r muted">·</td>'}
      ${cell(r.comps.quiz, 'quiz')}${cell(r.comps.assignment, 'assignment')}${cell(r.comps.presentation, 'presentation')}${cell(r.comps.task, 'task')}${cell(r.comps.exam, 'exam')}
      <td class="r num" title="Marks earned out of the weight that has been assessed so far">${r.possible ? `${r.earned} / ${r.possible}` : '—'}</td>
      <td><input type="number" class="adj-input" data-roll="${h(r.roll)}" data-field="bonus" value="${r.bonus}" step="any"></td>
      <td><input type="number" class="adj-input" data-roll="${h(r.roll)}" data-field="negative" value="${r.negative}" step="any"></td>
      <td class="r num" style="font-weight:700;">${r.total === null ? '—' : r.total + '%'}</td>
      <td><span class="grade-pill">${h(r.grade)}</span></td>
      <td>${waButtonHTML(r.phone, msg, settings, 'Send')}</td>
    </tr>`;
  }).join('');
  body.querySelectorAll('.adj-input').forEach(i => i.addEventListener('change', () => saveAdjustment(i.dataset.roll)));

  // Summary
  const totals = gbRows.map(r => r.total).filter(t => t !== null);
  document.getElementById('gb-summary').classList.toggle('hidden', !totals.length);
  if (totals.length) {
    const avg = round(totals.reduce((a, b) => a + b, 0) / totals.length, 1);
    const passed = gbRows.filter(r => r.passed).length;
    const atWarn = gbRows.filter(r => r.attWarn).length;
    document.getElementById('gb-kpis').innerHTML = `
      <span>Students <b>${gbRows.length}</b></span><span>Class average <b>${avg}%</b></span>
      <span>Highest <b>${Math.max(...totals)}%</b></span><span>Lowest <b>${Math.min(...totals)}%</b></span>
      <span>Passing (≥${settings.grading.passMark}%) <b>${passed}</b></span><span>Attendance below ${threshold}% <b>${atWarn}</b></span>
      <span class="muted" style="width:100%;">Weights: ${W_KEYS.filter(k => w[k] > 0).map(k => `${TYPE_LABEL[k]} ${w[k]}`).join(' · ')} · Missing components: ${settings.grading.missingComponent === 'rescale' ? 'rescaled' : 'zero'}</span>`;
    const scale = [...settings.grading.scale].sort((a, b) => b.min - a.min);
    const counts = scale.map(s => gbRows.filter(r => r.grade === s.grade).length);
    document.getElementById('gb-dist').innerHTML = columnChartSVG({
      labels: scale.map(s => s.grade), values: counts,
      colors: scale.map(s => Number(s.gp) === 0 ? 'var(--danger)' : 'var(--brass)'), height: 180
    });
  }
}

async function saveAdjustment(roll) {
  const bonus = Number(document.querySelector(`.adj-input[data-roll="${CSS.escape(roll)}"][data-field="bonus"]`).value) || 0;
  const negative = Number(document.querySelector(`.adj-input[data-roll="${CSS.escape(roll)}"][data-field="negative"]`).value) || 0;
  try {
    await commitSmart(db.collection('gradebookAdjustments').doc(sanitizeId(`${gbCourse}__${roll}`))
      .set({ courseCode: gbCourse, rollNumber: roll, bonusMarks: bonus, negativeMarks: negative }));
    gbData.adjustments[roll] = { courseCode: gbCourse, rollNumber: roll, bonusMarks: bonus, negativeMarks: negative };
    recompute();
    toast(`Adjustment saved for ${roll}.`, 'ok');
    logChange('Bonus / negative changed', `${gbCourse} · ${roll}: bonus ${bonus}, negative ${negative}`);
  } catch (e) { toast('Could not save adjustment: ' + e.message, 'error'); }
}

['gb-from', 'gb-to', 'gb-inactive'].forEach(id => document.getElementById(id).addEventListener('change', () => { if (gbData) recompute(); }));

document.getElementById('btn-export-gb').addEventListener('click', () => {
  if (!gbRows.length) { toast('Run the gradebook first.'); return; }
  const course = courses.find(c => c.id === gbCourse) || { id: gbCourse };
  const w = weightsFor(course, settings);
  downloadWorkbook({
    Gradebook: gbRows.map(r => ({
      'Roll Number': r.roll, 'Name': r.name,
      'Attendance %': r.attPct ?? '', 'Attendance Score %': r.attScore ?? '',
      'Quiz %': round(r.comps.quiz, 1) ?? '', 'Assignment %': round(r.comps.assignment, 1) ?? '',
      'Presentation %': round(r.comps.presentation, 1) ?? '', 'Task %': round(r.comps.task, 1) ?? '', 'Exam %': round(r.comps.exam, 1) ?? '',
      'Marks Earned': r.earned, 'Marks Possible': r.possible,
      'Bonus': r.bonus, 'Negative': r.negative, 'Total %': r.total ?? '', 'Grade': r.grade, 'Grade Points': r.gp ?? '',
      'Result': r.total === null ? '' : r.passed ? 'Pass' : 'Fail'
    })),
    Weights: W_KEYS.map(k => ({ Component: TYPE_LABEL[k], Weight: w[k] }))
  }, `gradebook-${sanitizeId(gbCourse)}-${localToday()}.xlsx`);
});

document.getElementById('btn-print-gb').addEventListener('click', () => {
  if (!gbRows.length) { toast('Run the gradebook first.'); return; }
  window.print();
});
