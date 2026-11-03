// ==========================================================================
// ONLINE QUIZ BUILDER (teacher) — questions, settings, open/close, results,
// auto-marking into the gradebook, publishing results to students.
// ==========================================================================

let settings, courses = [], students = [];
let itemId = new URLSearchParams(location.search).get('item');
let item = null, paper = { questions: [] }, keyDoc = { answers: {} };
let draft = [];          // [{id,type,text,options,marks,key}]
let dirty = false;
let attempts = [], resultRows = [];

requireAdmin(async (user, adminData) => {
  setUserChip((adminData && adminData.name) || user.email);
  settings = await loadSettings();
  ({ courses, students } = await loadCoursesAndStudents());
  if (itemId) await openQuiz(itemId);
  else await showList();
});

window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

function courseOf(code) { return courses.find(c => c.id === code) || { id: code, title: '' }; }
function onlineDefaults() {
  const q = settings.quiz;
  return { enabled: true, status: 'draft', durationMin: Math.round(q.defaultDuration) || 20, negativeMark: Number(q.negativeMark) || 0,
    shuffleQuestions: !!q.shuffleQuestions, shuffleOptions: !!q.shuffleOptions, showAnswers: !!q.showAnswers, published: false, questionCount: 0 };
}
function statusBadge(online) {
  if (!online || !online.enabled) return '<span class="chip">Not online</span>';
  if (online.published) return '<span class="chip ok">Results published</span>';
  const w = quizWindow(online);
  const cls = { draft: '', open: 'ok', upcoming: 'warn', closed: 'danger' }[w.state];
  const label = { draft: 'Draft', open: 'Open now', upcoming: 'Opens ' + fmtDateTime(w.opens), closed: 'Closed' }[w.state];
  return `<span class="chip ${cls}">${h(label)}</span>`;
}

/* ======================= LIST ======================= */

async function showList() {
  document.getElementById('list-view').classList.remove('hidden');
  const fill = () => {
    const all = document.getElementById('ql-all-terms').checked;
    const sel = document.getElementById('ql-course'), keep = sel.value;
    sel.innerHTML = '<option value="">All courses</option>' + courseOptionsHtml(courses, { settings, activeOnly: !all });
    if (keep) sel.value = keep;
    document.getElementById('nq-course').innerHTML = courseOptionsHtml(courses, { settings, activeOnly: true });
  };
  fill();
  document.getElementById('ql-all-terms').addEventListener('change', () => { fill(); renderList(); });
  document.getElementById('ql-course').addEventListener('change', renderList);
  await renderList();

  wireModal('new-quiz-modal', ['nq-cancel']);
  document.getElementById('btn-new-quiz').addEventListener('click', () => {
    document.getElementById('nq-title').value = '';
    document.getElementById('nq-date').value = localToday();
    setMsg('nq-msg', '');
    openModal('new-quiz-modal');
  });
  document.getElementById('nq-create').addEventListener('click', async () => {
    const title = document.getElementById('nq-title').value.trim();
    const courseCode = document.getElementById('nq-course').value;
    const dueDate = document.getElementById('nq-date').value;
    if (!title || !courseCode || !dueDate) { setMsg('nq-msg', 'Title, course and date are required.', 'error'); return; }
    try {
      const ref = db.collection('gradeItems').doc();
      const batch = db.batch();
      batch.set(ref, { type: 'quiz', title, courseCode, dueDate, totalMarks: null, countInGrade: document.getElementById('nq-count').checked,
        assignTo: 'all', description: '', createdAt: new Date().toISOString(), online: onlineDefaults() });
      batch.set(db.collection('quizPapers').doc(ref.id), { questions: [], updatedAt: new Date().toISOString() });
      batch.set(db.collection('quizKeys').doc(ref.id), { answers: {} });
      await batch.commit();
      location.href = 'quiz-builder.html?item=' + encodeURIComponent(ref.id);
    } catch (e) { setMsg('nq-msg', 'Could not create: ' + e.message, 'error'); }
  });
}

async function renderList() {
  const body = document.getElementById('ql-body');
  const f = document.getElementById('ql-course').value;
  const all = document.getElementById('ql-all-terms').checked;
  try {
    let q = db.collection('gradeItems').where('type', '==', 'quiz');
    if (f) q = q.where('courseCode', '==', f);
    const snap = await q.get();
    const codes = new Set(courses.filter(c => all || inActiveTerm(c, settings)).map(c => c.id));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(it => f || codes.has(it.courseCode))
      .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));
    body.innerHTML = list.length ? list.map(it => `<tr>
      <td><b>${h(it.title)}</b></td><td class="mono">${h(it.courseCode)}</td><td class="mono">${h(it.dueDate ? fmtDate(it.dueDate) : '—')}</td>
      <td class="c">${it.online ? (it.online.questionCount || 0) : '—'}</td><td class="r">${it.totalMarks ?? '—'}</td>
      <td>${statusBadge(it.online)}</td>
      <td><a class="btn btn-${it.online ? 'outline' : 'primary-sm'}" style="text-decoration:none;font-size:12px;" href="quiz-builder.html?item=${encodeURIComponent(it.id)}">${it.online ? 'Manage' : 'Build online'}</a></td>
    </tr>`).join('') : `<tr><td colspan="7"><div class="empty-state">No quizzes yet. Click "+ New Online Quiz".</div></td></tr>`;
  } catch (e) { body.innerHTML = `<tr><td colspan="7"><div class="empty-state">Could not load: ${h(e.message)}</div></td></tr>`; }
}

/* ======================= ONE QUIZ ======================= */

async function openQuiz(id) {
  const doc = await db.collection('gradeItems').doc(id).get();
  if (!doc.exists || doc.data().type !== 'quiz') {
    document.getElementById('list-view').classList.remove('hidden');
    document.getElementById('ql-body').innerHTML = `<tr><td colspan="7"><div class="empty-state">That quiz was not found. <a href="quiz-builder.html">Back to the list</a>.</div></td></tr>`;
    return;
  }
  item = { id, ...doc.data() };
  if (!item.online) {
    item.online = onlineDefaults();
    await db.collection('gradeItems').doc(id).update({ online: item.online });
  }
  const [p, k] = await Promise.all([db.collection('quizPapers').doc(id).get(), db.collection('quizKeys').doc(id).get()]);
  paper = p.exists ? p.data() : { questions: [] };
  keyDoc = k.exists ? k.data() : { answers: {} };
  draft = (paper.questions || []).map(q => ({ ...q, options: [...(q.options || [])], key: clone(keyDoc.answers[q.id]) }));
  document.getElementById('quiz-view').classList.remove('hidden');
  wireQuizPage();
  renderHeader();
  renderQuestions();
  fillSettings();
}

/** Firestore rejects `undefined` values — drop them before writing. */
function defined(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)); }

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

function renderHeader() {
  const c = courseOf(item.courseCode);
  document.getElementById('qz-title').textContent = item.title;
  const o = item.online;
  document.getElementById('qz-sub').textContent =
    `${c.id} — ${c.title || ''} · ${item.dueDate ? fmtDate(item.dueDate) : ''} · ${o.durationMin} min · ${o.questionCount || 0} questions · ${item.totalMarks ?? 0} marks${item.countInGrade === false ? ' · not counted in gradebook' : ''}`;
  const st = document.getElementById('qz-status');
  st.outerHTML = `<span id="qz-status">${statusBadge(o)}</span>`;
  document.getElementById('btn-qz-open').classList.toggle('hidden', o.status === 'open');
  document.getElementById('btn-qz-close').classList.toggle('hidden', o.status !== 'open');
  document.getElementById('btn-qz-draft').classList.toggle('hidden', o.status === 'draft');
  document.getElementById('btn-r-unpublish').classList.toggle('hidden', !o.published);
  document.getElementById('q-warning').innerHTML = o.status !== 'draft'
    ? `<div class="banner danger"><span>This quiz is <b>${o.status}</b>. Changing questions now changes the scores of students who already answered. Prefer fixing only typos, or move it Back to Draft first.</span></div>` : '';
}

let wired = false;
function wireQuizPage() {
  if (wired) return; wired = true;
  document.querySelectorAll('.tabs .tab-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs .tab-btn').forEach(x => x.classList.toggle('active', x === b));
    ['questions', 'qsettings', 'results'].forEach(t => document.getElementById('tab-' + t).classList.toggle('hidden', t !== b.dataset.tab));
    if (b.dataset.tab === 'results') loadResults();
  }));
  document.getElementById('btn-q-add').addEventListener('click', () => {
    const type = document.getElementById('q-new-type').value;
    draft.push({ id: uid(), type, text: '', options: type === 'mcq' || type === 'multi' ? ['', '', '', ''] : [], marks: 1, key: type === 'multi' ? [] : type === 'tf' ? 'true' : type === 'short' ? [] : null });
    dirty = true;
    renderQuestions();
    const cards = document.querySelectorAll('#q-list .q-card');
    cards[cards.length - 1].querySelector('textarea').focus();
  });
  document.getElementById('btn-q-save').addEventListener('click', saveQuestions);
  document.getElementById('btn-q-template').addEventListener('click', () => downloadWorkbook({
    Questions: { aoa: questionTemplateRows() },
    Instructions: { aoa: [
      ['How to fill this sheet'], [''],
      ['Type: MCQ (one correct), Multiple (several correct), TrueFalse, Short (typed answer). Leave blank and the app guesses.'],
      ['Options: fill Option A, B, C... for MCQ/Multiple. Leave empty for TrueFalse and Short.'],
      ['Correct: MCQ → one letter (B). Multiple → letters with commas (A,C). TrueFalse → True or False. Short → accepted answers separated by | (case does not matter).'],
      ['Marks: marks for that question (default 1).'],
      ['Then: Online Quizzes → open the quiz → Import from Excel.']
    ] }
  }, 'quiz-questions-template.xlsx'));
  document.getElementById('btn-q-import').addEventListener('click', () => document.getElementById('q-import-file').click());
  document.getElementById('q-import-file').addEventListener('change', importQuestions);
  document.getElementById('btn-q-preview').addEventListener('click', preview);
  wireModal('preview-modal', ['pv-close']);
  wireModal('answers-modal', ['am-close']);
  document.getElementById('btn-qs-save').addEventListener('click', saveSettingsTab);
  document.getElementById('btn-qz-open').addEventListener('click', () => setStatus('open'));
  document.getElementById('btn-qz-close').addEventListener('click', () => setStatus('closed'));
  document.getElementById('btn-qz-draft').addEventListener('click', () => setStatus('draft'));
  document.getElementById('btn-r-refresh').addEventListener('click', loadResults);
  document.getElementById('btn-r-save').addEventListener('click', () => saveMarks(false));
  document.getElementById('btn-r-publish').addEventListener('click', publish);
  document.getElementById('btn-r-unpublish').addEventListener('click', unpublish);
  document.getElementById('btn-r-export').addEventListener('click', exportResults);
  document.getElementById('r-zero').addEventListener('change', renderResults);
}

/* ---------------- Question editor ---------------- */

function renderQuestions() {
  const list = document.getElementById('q-list');
  document.getElementById('q-count').textContent = draft.length;
  document.getElementById('q-total').textContent = round(draft.reduce((a, q) => a + (Number(q.marks) || 0), 0), 2);
  if (!draft.length) {
    list.innerHTML = `<div class="panel"><div class="empty-state">No questions yet. Add them one by one with <b>+ Add Question</b>, or fill the <b>Excel Template</b> and <b>Import</b> it — fastest for 10+ questions.</div></div>`;
    return;
  }
  list.innerHTML = draft.map((q, i) => `<div class="q-card" data-i="${i}">
    <div class="q-head">
      <div class="gap-row"><span class="q-num">Q${i + 1}</span>
        <select class="q-type">${Object.entries(Q_TYPES).map(([v, l]) => `<option value="${v}"${q.type === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <span class="muted small">Marks</span><input type="number" class="marks-input q-marks" min="0" step="any" value="${h(q.marks)}"></div>
      <div class="row-actions">
        <button type="button" class="icon-btn q-up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="icon-btn q-down" ${i === draft.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="icon-btn q-dup">Duplicate</button>
        <button type="button" class="icon-btn danger q-del">Delete</button>
      </div>
    </div>
    <textarea class="q-text-in" rows="2" placeholder="Type the question…">${h(q.text)}</textarea>
    <div class="q-body" style="margin-top:10px;">${questionBody(q, i)}</div>
  </div>`).join('');
  list.querySelectorAll('.q-card').forEach(card => wireCard(card, Number(card.dataset.i)));
}

function questionBody(q, i) {
  if (q.type === 'mcq' || q.type === 'multi') {
    const multi = q.type === 'multi';
    const keys = multi ? new Set((q.key || []).map(Number)) : null;
    return `<div class="muted small" style="margin-bottom:6px;">Tick the correct ${multi ? 'answers (all that apply)' : 'answer'}:</div>` +
      q.options.map((o, k) => `<div class="q-edit-opt" data-k="${k}">
        <input type="${multi ? 'checkbox' : 'radio'}" name="corr-${i}" class="q-corr" ${multi ? (keys.has(k) ? 'checked' : '') : (Number(q.key) === k && q.key !== null && q.key !== undefined ? 'checked' : '')} title="Correct">
        <input type="text" class="q-opt-in" value="${h(o)}" placeholder="Option ${LETTERS[k]}">
        <button type="button" class="icon-btn danger q-opt-del" title="Remove option">✕</button></div>`).join('') +
      (q.options.length < 10 ? `<button type="button" class="link-btn small q-opt-add">+ Add option</button>` : '');
  }
  if (q.type === 'tf') {
    return `<div class="radio-row"><span class="muted small">Correct answer:</span>
      <label><input type="radio" name="tf-${i}" class="q-tf" value="true" ${String(q.key) !== 'false' ? 'checked' : ''}> True</label>
      <label><input type="radio" name="tf-${i}" class="q-tf" value="false" ${String(q.key) === 'false' ? 'checked' : ''}> False</label></div>`;
  }
  return `<div class="field" style="margin:0;"><label>Accepted answers — separate several with |  (capital letters and extra spaces are ignored)</label>
    <input type="text" class="q-short" value="${h((q.key || []).join(' | '))}" placeholder="e.g. Net Present Value | NPV"></div>`;
}

function wireCard(card, i) {
  const q = draft[i];
  const mark = () => { dirty = true; };
  card.querySelector('.q-text-in').addEventListener('input', e => { q.text = e.target.value; mark(); });
  card.querySelector('.q-marks').addEventListener('input', e => { q.marks = Number(e.target.value) || 0; mark(); document.getElementById('q-total').textContent = round(draft.reduce((a, x) => a + (Number(x.marks) || 0), 0), 2); });
  card.querySelector('.q-type').addEventListener('change', e => {
    q.type = e.target.value;
    if ((q.type === 'mcq' || q.type === 'multi') && q.options.length < 2) q.options = ['', '', '', ''];
    if (q.type === 'tf' || q.type === 'short') q.options = [];
    q.key = q.type === 'multi' ? [] : q.type === 'tf' ? 'true' : q.type === 'short' ? [] : null;
    mark(); renderQuestions();
  });
  card.querySelector('.q-up').addEventListener('click', () => { draft.splice(i - 1, 0, draft.splice(i, 1)[0]); mark(); renderQuestions(); });
  card.querySelector('.q-down').addEventListener('click', () => { draft.splice(i + 1, 0, draft.splice(i, 1)[0]); mark(); renderQuestions(); });
  card.querySelector('.q-dup').addEventListener('click', () => { draft.splice(i + 1, 0, { ...clone(q), id: uid() }); mark(); renderQuestions(); });
  card.querySelector('.q-del').addEventListener('click', () => { if (!q.text || confirm('Delete this question?')) { draft.splice(i, 1); mark(); renderQuestions(); } });
  card.querySelectorAll('.q-opt-in').forEach(inp => inp.addEventListener('input', e => { q.options[Number(e.target.closest('.q-edit-opt').dataset.k)] = e.target.value; mark(); }));
  card.querySelectorAll('.q-corr').forEach(inp => inp.addEventListener('change', () => {
    const picked = [...card.querySelectorAll('.q-corr')].map((c, k) => c.checked ? k : -1).filter(k => k >= 0);
    q.key = q.type === 'multi' ? picked : (picked.length ? picked[0] : null);
    mark();
  }));
  card.querySelectorAll('.q-opt-del').forEach(btn => btn.addEventListener('click', e => {
    const k = Number(e.target.closest('.q-edit-opt').dataset.k);
    if (q.options.length <= 2) { toast('A choice question needs at least 2 options.'); return; }
    q.options.splice(k, 1);
    if (q.type === 'multi') q.key = (q.key || []).filter(x => x !== k).map(x => x > k ? x - 1 : x);
    else if (q.key === k) q.key = null; else if (q.key > k) q.key--;
    mark(); renderQuestions();
  }));
  const add = card.querySelector('.q-opt-add');
  if (add) add.addEventListener('click', () => { q.options.push(''); mark(); renderQuestions(); });
  card.querySelectorAll('.q-tf').forEach(r => r.addEventListener('change', e => { q.key = e.target.value; mark(); }));
  const sh = card.querySelector('.q-short');
  if (sh) sh.addEventListener('input', e => { q.key = e.target.value.split('|').map(x => x.trim()).filter(Boolean); mark(); });
}

function validateDraft() {
  const errs = [];
  draft.forEach((q, i) => {
    const n = `Q${i + 1}`;
    if (!String(q.text).trim()) errs.push(`${n}: question text is empty`);
    if (!(Number(q.marks) > 0)) errs.push(`${n}: marks must be more than 0`);
    if (q.type === 'mcq' || q.type === 'multi') {
      const filled = q.options.filter(o => String(o).trim());
      if (filled.length < 2) errs.push(`${n}: fill at least 2 options`);
      if (q.options.some(o => !String(o).trim())) errs.push(`${n}: remove or fill the empty option`);
      if (q.type === 'mcq' && (q.key === null || q.key === undefined)) errs.push(`${n}: tick the correct option`);
      if (q.type === 'multi' && !(q.key || []).length) errs.push(`${n}: tick at least one correct option`);
    }
    if (q.type === 'short' && !(q.key || []).length) errs.push(`${n}: type at least one accepted answer`);
  });
  return errs;
}

async function saveQuestions() {
  const errs = validateDraft();
  if (errs.length) { setMsg('q-save-msg', errs.slice(0, 4).join(' · ') + (errs.length > 4 ? ` (+${errs.length - 4} more)` : ''), 'error'); return; }
  const btn = document.getElementById('btn-q-save');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const questions = draft.map(q => ({ id: q.id, type: q.type, text: q.text.trim(), options: q.options.map(o => String(o).trim()), marks: Number(q.marks) }));
    const answers = Object.fromEntries(draft.map(q => [q.id, q.key]));
    const total = round(questions.reduce((a, q) => a + q.marks, 0), 2);
    const online = { ...item.online, questionCount: questions.length };
    const batch = db.batch();
    batch.set(db.collection('quizPapers').doc(item.id), { questions, updatedAt: new Date().toISOString() }, { merge: true });
    batch.set(db.collection('quizKeys').doc(item.id), { answers });
    batch.update(db.collection('gradeItems').doc(item.id), { totalMarks: total || null, online: defined(online) });
    await batch.commit();
    paper.questions = questions; keyDoc.answers = answers; item.totalMarks = total; item.online = online;
    dirty = false;
    setMsg('q-save-msg', `Saved ${questions.length} question(s), ${total} marks.`, 'info');
    renderHeader();
  } catch (e) {
    setMsg('q-save-msg', 'Could not save: ' + e.message, 'error');
  } finally { btn.disabled = false; btn.textContent = 'Save Questions'; }
}

async function importQuestions(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const rows = await readSheet(file, { sheet: 'Questions' });
    const res = parseQuestionRows(rows);
    if (!res.questions.length) { toast('No questions found. Use the Excel Template (a "Question" column is required).', 'error'); return; }
    if (res.errors.length) { setMsg('q-save-msg', 'Not imported — fix these rows first: ' + res.errors.slice(0, 5).join(' · '), 'error'); return; }
    let replace = false;
    if (draft.length) replace = confirm(`Import ${res.questions.length} questions.\n\nOK = REPLACE the current ${draft.length} questions\nCancel = ADD them after the current ones`);
    const incoming = res.questions.map(q => ({ ...q, key: res.answers[q.id] }));
    draft = replace ? incoming : [...draft, ...incoming];
    dirty = true;
    renderQuestions();
    setMsg('q-save-msg', `${res.questions.length} question(s) imported — review them, then click Save Questions.`, 'info');
  } catch (err) { toast('Could not read that file: ' + err.message, 'error'); }
}

function preview() {
  const view = studentView(draft, item.online, 'PREVIEW', item.id);
  document.getElementById('pv-body').innerHTML = view.length ? view.map(({ q, optionOrder }, i) => renderQuestionForStudent(q, optionOrder, i, null, true)).join('')
    : '<div class="empty-state">No questions yet.</div>';
  openModal('preview-modal');
}

/* ---------------- Quiz settings + status ---------------- */

function toLocalInput(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${toLocalISO(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fillSettings() {
  const o = item.online;
  document.getElementById('qs-duration').value = o.durationMin;
  document.getElementById('qs-opens').value = toLocalInput(tsMillis(o.opensAtTs || o.opensAt));
  document.getElementById('qs-closes').value = toLocalInput(tsMillis(o.closesAtTs || o.closesAt));
  const neg = document.getElementById('qs-negative');
  if (![...neg.options].some(x => Number(x.value) === Number(o.negativeMark))) neg.insertAdjacentHTML('beforeend', `<option value="${o.negativeMark}">${o.negativeMark}</option>`);
  neg.value = [...neg.options].find(x => Number(x.value) === Number(o.negativeMark || 0)).value;
  document.getElementById('qs-shuffle-q').value = String(!!o.shuffleQuestions);
  document.getElementById('qs-shuffle-o').value = String(!!o.shuffleOptions);
  document.getElementById('qs-show').value = String(o.showAnswers !== false);
}

async function saveSettingsTab() {
  const dur = Math.round(Number(document.getElementById('qs-duration').value));
  if (!(dur >= 1 && dur <= 600)) { setMsg('qs-msg', 'Time limit must be between 1 and 600 minutes.', 'error'); return; }
  const opens = document.getElementById('qs-opens').value, closes = document.getElementById('qs-closes').value;
  const oMs = opens ? new Date(opens).getTime() : null, cMs = closes ? new Date(closes).getTime() : null;
  if (oMs && cMs && cMs <= oMs) { setMsg('qs-msg', 'Closing time must be after opening time.', 'error'); return; }
  const TS = firebase.firestore.Timestamp, DEL = firebase.firestore.FieldValue.delete();
  const online = {
    ...item.online, durationMin: dur, negativeMark: Number(document.getElementById('qs-negative').value) || 0,
    shuffleQuestions: document.getElementById('qs-shuffle-q').value === 'true', shuffleOptions: document.getElementById('qs-shuffle-o').value === 'true',
    showAnswers: document.getElementById('qs-show').value === 'true',
    opensAt: oMs ? new Date(oMs).toISOString() : '', closesAt: cMs ? new Date(cMs).toISOString() : ''
  };
  const write = { ...defined(online), opensAtTs: oMs ? TS.fromDate(new Date(oMs)) : DEL, closesAtTs: cMs ? TS.fromDate(new Date(cMs)) : DEL };
  try {
    await db.collection('gradeItems').doc(item.id).set({ online: write }, { merge: true });
    item.online = { ...online, opensAtTs: oMs ? { seconds: Math.floor(oMs / 1000) } : undefined, closesAtTs: cMs ? { seconds: Math.floor(cMs / 1000) } : undefined };
    setMsg('qs-msg', 'Saved.', 'info');
    renderHeader();
  } catch (e) { setMsg('qs-msg', 'Could not save: ' + e.message, 'error'); }
}

async function setStatus(status) {
  if (dirty && !confirm('You have unsaved question changes. Continue without saving them?')) return;
  if (status === 'open') {
    if (!(paper.questions || []).length) { setMsg('qz-msg', 'Add and save at least one question before opening the quiz.', 'error'); return; }
    const errs = validateDraft();
    if (errs.length) { setMsg('qz-msg', 'Fix the questions first: ' + errs.slice(0, 3).join(' · '), 'error'); return; }
    if (!confirm(`Open "${item.title}" now? Students of ${item.courseCode} will be able to start it${item.online.closesAt ? ' until ' + fmtDateTime(Date.parse(item.online.closesAt)) : ''}.`)) return;
  }
  if (status === 'closed' && !confirm('Close the quiz? Students who have not started cannot start any more. Students already inside can still submit until their own time runs out.')) return;
  try {
    const upd = { ...item.online, status };
    const batch = db.batch();
    if (status !== 'closed' && item.online.published) {
      upd.published = false; // re-opening hides results and the answer key again
      batch.set(db.collection('quizPapers').doc(item.id), { answerKey: firebase.firestore.FieldValue.delete() }, { merge: true });
    }
    batch.set(db.collection('gradeItems').doc(item.id), { online: { status, published: !!upd.published } }, { merge: true });
    await batch.commit();
    item.online = upd;
    setMsg('qz-msg', status === 'open' ? 'The quiz is open. Students see it under Online Quizzes and on their dashboard.' : status === 'closed' ? 'Quiz closed.' : 'Back to draft — students cannot see it.', 'info');
    renderHeader();
  } catch (e) { setMsg('qz-msg', 'Could not change status: ' + e.message, 'error'); }
}

/* ---------------- Results ---------------- */

async function loadResults() {
  const body = document.getElementById('r-body');
  body.innerHTML = `<tr><td colspan="9"><div class="empty-state"><span class="loading-dot"></span> Loading attempts…</div></td></tr>`;
  try {
    const snap = await db.collection('quizAttempts').where('itemId', '==', item.id).get();
    attempts = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
    renderResults();
  } catch (e) { body.innerHTML = `<tr><td colspan="9"><div class="empty-state">Could not load: ${h(e.message)}</div></td></tr>`; }
}

function attemptState(a) {
  if (!a) return { label: 'Not started', cls: '' };
  if (a.status === 'submitted') return { label: 'Submitted', cls: 'ok' };
  const end = tsMillis(a.startedAt) + item.online.durationMin * 60000;
  if (Date.now() > end + 120000) return { label: 'Time over (saved answers used)', cls: 'warn' };
  return { label: 'In progress', cls: 'warn' };
}

function renderResults() {
  const roster = resolveAssignees(item, rosterForCourse(students, item.courseCode));
  const byRoll = {};
  attempts.forEach(a => { byRoll[a.rollNumber] = a; });
  const rolls = [...new Set([...roster.map(s => s.id), ...attempts.map(a => a.rollNumber)])];
  const zero = document.getElementById('r-zero').checked;
  const qs = paper.questions || [];
  resultRows = rolls.map(roll => {
    const s = students.find(x => x.id === roll) || { id: roll, name: '(not on roster)' };
    const a = byRoll[roll];
    const sc = a ? scoreAttempt(qs, keyDoc.answers, a.answers, item.online.negativeMark) : null;
    const start = a ? tsMillis(a.startedAt) : null, sub = a ? tsMillis(a.submittedAt) : null;
    return { s, a, sc, state: attemptState(a), taken: start && sub ? sub - start : null, start,
      marks: sc ? sc.score : zero ? 0 : null, max: sc ? sc.max : round(qs.reduce((x, q) => x + (Number(q.marks) || 0), 0), 2) };
  }).sort((x, y) => (y.marks ?? -1) - (x.marks ?? -1));

  const done = resultRows.filter(r => r.a);
  const scores = done.map(r => r.sc.score);
  const max = resultRows.length ? resultRows[0].max : 0;
  document.getElementById('r-kpis').innerHTML = `<span>Attempted <b>${done.length}</b> / ${roster.length}</span>
    <span>Submitted <b>${done.filter(r => r.a.status === 'submitted').length}</b></span>
    ${scores.length ? `<span>Average <b>${round(scores.reduce((a, b) => a + b, 0) / scores.length, 1)}</b> / ${max}</span><span>Highest <b>${Math.max(...scores)}</b></span><span>Lowest <b>${Math.min(...scores)}</b></span>` : ''}
    <span>${item.online.published ? '<span class="chip ok">Results published</span>' : '<span class="chip">Results not published yet</span>'}</span>`;

  document.getElementById('r-body').innerHTML = resultRows.length ? resultRows.map(r => `<tr>
    <td class="mono">${h(r.s.id)}</td><td>${h(r.s.name || '')}</td>
    <td><span class="chip ${r.state.cls}">${h(r.state.label)}</span></td>
    <td class="mono small">${r.start ? h(fmtDateTime(r.start)) : '—'}</td>
    <td class="mono small">${r.taken !== null ? h(fmtDuration(r.taken)) : '—'}</td>
    <td class="c">${r.a ? (r.a.tabSwitches || 0) : '—'}</td>
    <td class="r num"><b>${r.marks === null ? '—' : r.marks}</b> / ${r.max}</td>
    <td class="r num">${r.marks === null || !r.max ? '' : round(r.marks / r.max * 100, 0) + '%'}</td>
    <td><div class="row-actions">${r.a ? `<button class="icon-btn" onclick="showAnswers('${jsArg(r.s.id)}')">Answers</button><button class="icon-btn danger" onclick="resetAttempt('${jsArg(r.s.id)}')" title="Delete this attempt so the student can start again">Reset</button>` : ''}</div></td>
  </tr>`).join('') : `<tr><td colspan="9"><div class="empty-state">No students are assigned to this quiz.</div></td></tr>`;

  // Question analysis
  const an = document.getElementById('r-analysis');
  if (!done.length || !qs.length) { an.innerHTML = '<div class="empty-state">Appears once students submit.</div>'; return; }
  an.innerHTML = qs.map((q, i) => {
    const right = done.filter(r => r.sc.per[i] && r.sc.per[i].correct === true).length;
    const pct = round(right / done.length * 100, 0);
    return `<div class="gap-row" style="margin-bottom:6px;" title="${h(q.text)}"><span class="mono small" style="width:34px;">Q${i + 1}</span>
      <div style="flex:1;min-width:60px;">${barHTML(pct, pct < 40 ? 'danger' : pct < 70 ? 'warn' : 'ok')}</div><span class="mono small" style="width:40px;text-align:right;">${pct}%</span></div>`;
  }).join('') + '<p class="help" style="margin:8px 0 0;">Red questions (under 40%) are worth revising in class — or checking the answer key.</p>';
}

window.showAnswers = function (roll) {
  const r = resultRows.find(x => x.s.id === roll);
  if (!r || !r.a) return;
  document.getElementById('am-title').textContent = `${r.s.name || roll} — ${r.marks} / ${r.max}`;
  const view = studentView(paper.questions || [], item.online, roll, item.id);
  document.getElementById('am-body').innerHTML = view.map(({ q, optionOrder }, i) =>
    renderQuestionForStudent(q, optionOrder, i, (r.a.answers || {})[q.id], true, keyDoc.answers[q.id])).join('');
  openModal('answers-modal');
};

window.resetAttempt = async function (roll) {
  if (!confirm(`Delete ${roll}'s attempt so they can take the quiz again? Their answers are removed. (Their gradebook mark, if already saved, stays until you save marks again.)`)) return;
  try {
    await db.collection('quizAttempts').doc(`${item.id}__${roll}`).delete();
    toast('Attempt reset.', 'ok');
    logChange('Quiz attempt reset', `${item.title} · ${roll}`);
    loadResults();
  } catch (e) { toast('Could not reset: ' + e.message, 'error'); }
};

async function saveMarks(silent) {
  if (!resultRows.length) await loadResults();
  const rows = resultRows.filter(r => r.marks !== null);
  if (!rows.length) { setMsg('r-msg', 'No attempts to mark yet.', 'error'); return false; }
  const max = rows[0].max;
  const ops = rows.map(r => b => b.set(db.collection('gradeMarks').doc(`${item.id}__${r.s.id}`), {
    itemId: item.id, type: 'quiz', courseCode: item.courseCode, rollNumber: r.s.id,
    marksObtained: r.marks, totalMarks: max, remarks: r.a ? 'Online quiz' : 'Online quiz — not attempted'
  }, { merge: true }));
  rows.filter(r => r.a).forEach(r => ops.push(b => b.update(db.collection('quizAttempts').doc(`${item.id}__${r.s.id}`), { score: r.marks, max, gradedAt: new Date().toISOString() })));
  ops.push(b => b.update(db.collection('gradeItems').doc(item.id), { totalMarks: max }));
  try {
    await writeInBatches(ops);
    item.totalMarks = max;
    if (!silent) setMsg('r-msg', `Saved marks for ${rows.length} student(s) to the gradebook.`, 'info');
    return true;
  } catch (e) { setMsg('r-msg', 'Could not save marks: ' + e.message, 'error'); return false; }
}

async function publish() {
  if (item.online.status === 'open' && !confirm('Publishing closes the quiz first (no new starts). Continue?')) return;
  const ok = await saveMarks(true);
  if (!ok) return;
  try {
    const batch = db.batch();
    batch.set(db.collection('gradeItems').doc(item.id), { online: { status: 'closed', published: true, publishedAt: new Date().toISOString() } }, { merge: true });
    batch.set(db.collection('quizPapers').doc(item.id), { answerKey: item.online.showAnswers !== false ? keyDoc.answers : firebase.firestore.FieldValue.delete() }, { merge: true });
    await batch.commit();
    item.online = { ...item.online, status: 'closed', published: true };
    logChange('Quiz results published', `${item.courseCode} · ${item.title}`);
    setMsg('r-msg', 'Marks saved and results published. Students now see their score' + (item.online.showAnswers !== false ? ' and the correct answers.' : '.'), 'info');
    renderHeader(); renderResults();
  } catch (e) { setMsg('r-msg', 'Could not publish: ' + e.message, 'error'); }
}

async function unpublish() {
  try {
    const batch = db.batch();
    batch.set(db.collection('gradeItems').doc(item.id), { online: { published: false } }, { merge: true });
    batch.set(db.collection('quizPapers').doc(item.id), { answerKey: firebase.firestore.FieldValue.delete() }, { merge: true });
    await batch.commit();
    item.online.published = false;
    setMsg('r-msg', 'Results hidden from students (marks stay in the gradebook).', 'info');
    renderHeader(); renderResults();
  } catch (e) { setMsg('r-msg', 'Could not hide: ' + e.message, 'error'); }
}

function exportResults() {
  if (!resultRows.length) { toast('Open the results first.'); return; }
  const qs = paper.questions || [];
  downloadWorkbook({
    Results: resultRows.map(r => ({
      'Roll Number': r.s.id, 'Name': r.s.name || '', 'Status': r.state.label, 'Started': r.start ? fmtDateTime(r.start) : '',
      'Time Taken': r.taken !== null ? fmtDuration(r.taken) : '', 'Left Screen': r.a ? (r.a.tabSwitches || 0) : '',
      'Score': r.marks ?? '', 'Out Of': r.max, ...Object.fromEntries(qs.map((q, i) => [`Q${i + 1}`, r.sc ? (r.sc.per[i].correct === true ? '✓' : r.sc.per[i].correct === false ? '✗' : '–') : '']))
    })),
    Questions: qs.map((q, i) => ({ 'No.': i + 1, 'Type': Q_TYPES[q.type], 'Question': q.text, 'Correct Answer': keyText(q, keyDoc.answers[q.id]), 'Marks': q.marks }))
  }, `quiz-results-${sanitizeId(item.title)}-${localToday()}.xlsx`);
}
