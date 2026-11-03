// ==========================================================================
// STUDENT ONLINE QUIZZES — list, take (timer + autosave), review results
// ==========================================================================

const params = new URLSearchParams(location.search);
let me = null, settings = null, items = [], attempts = {}, marks = {};
const area = () => document.getElementById('sq-area');

requireStudent(async (user, studentDoc) => {
  me = { roll: studentDoc.id, ...studentDoc.data() };
  setUserChip(me.name || me.roll);
  settings = await loadSettings();
  await loadData();
  if (params.get('take')) return takeView(params.get('take'));
  if (params.get('review')) return reviewView(params.get('review'));
  listView();
});

async function loadData() {
  const enrolled = me.course || [];
  const [itemDocs, attSnap, markSnap] = await Promise.all([
    enrolled.length ? getWhereIn('gradeItems', 'courseCode', enrolled, q => q.where('type', '==', 'quiz')) : [],
    db.collection('quizAttempts').where('rollNumber', '==', me.roll).get().catch(() => null),
    db.collection('gradeMarks').where('rollNumber', '==', me.roll).get().catch(() => null)
  ]);
  items = itemDocs.map(d => ({ id: d.id, ...d.data() }))
    .filter(it => it.online && it.online.enabled && it.online.status !== 'draft' && appliesTo(it, me.roll));
  attempts = {};
  if (attSnap) attSnap.forEach(d => { attempts[d.data().itemId] = d.data(); });
  marks = {};
  if (markSnap) markSnap.forEach(d => { marks[d.data().itemId] = d.data(); });
}

function attemptOver(it, a) {
  if (!a) return false;
  if (a.status === 'submitted') return true;
  return Date.now() > tsMillis(a.startedAt) + it.online.durationMin * 60000 + 120000;
}

/* ---------------- List ---------------- */

function listView() {
  document.getElementById('page-sub').textContent = `${items.length} quiz${items.length === 1 ? '' : 'zes'}`;
  if (!items.length) {
    area().innerHTML = `<div class="panel"><div class="empty-state">No online quizzes yet. When your lecturer opens one, it appears here and on your dashboard.</div></div>`;
    return;
  }
  const cards = items.map(it => {
    const a = attempts[it.id], w = quizWindow(it.online), o = it.online, m = marks[it.id];
    let state, action = '', order;
    if (a && !attemptOver(it, a)) {
      const left = tsMillis(a.startedAt) + o.durationMin * 60000 - Date.now();
      state = `<span class="chip warn">In progress · ${fmtDuration(Math.max(0, left))} left</span>`;
      action = `<a class="btn btn-primary-sm" style="text-decoration:none;" href="?take=${encodeURIComponent(it.id)}">Continue</a>`; order = 0;
    } else if (a) {
      state = o.published && m ? `<span class="chip ok">Score ${m.marksObtained} / ${m.totalMarks}</span>` : `<span class="chip">Submitted — waiting for results</span>`;
      action = o.published ? `<a class="btn btn-outline" style="text-decoration:none;" href="?review=${encodeURIComponent(it.id)}">View result</a>` : ''; order = 3;
    } else if (w.state === 'open') {
      state = `<span class="chip ok">Open now${w.closes ? ' · closes ' + fmtDateTime(w.closes) : ''}</span>`;
      action = `<a class="btn btn-primary-sm" style="text-decoration:none;" href="?take=${encodeURIComponent(it.id)}">Start quiz</a>`; order = 1;
    } else if (w.state === 'upcoming') {
      state = `<span class="chip warn">Opens ${fmtDateTime(w.opens)}</span>`; order = 2;
    } else {
      state = o.published && m ? `<span class="chip danger">Not attempted · ${m.marksObtained} / ${m.totalMarks}</span>` : `<span class="chip">Closed — not attempted</span>`; order = 4;
    }
    return { order, html: `<div class="panel" style="margin-bottom:14px;">
      <div class="gap-row" style="justify-content:space-between;">
        <div><h3 style="margin:0 0 4px;border:none;padding:0;">${h(it.title)}</h3>
          <div class="row-meta">${h(it.courseCode)} · ${o.questionCount || 0} questions · ${it.totalMarks ?? 0} marks · ${o.durationMin} minutes${o.negativeMark ? ' · negative marking' : ''}</div></div>
        <div class="gap-row">${state}${action}</div>
      </div></div>` };
  }).sort((x, y) => x.order - y.order);
  area().innerHTML = cards.map(c => c.html).join('');
}

/* ---------------- Take ---------------- */

let it = null, attempt = null, paper = null, answers = {}, tabSwitches = 0, offset = 0, timerId = null, saveTimer = null, submitting = false, finished = false;
const attemptRef = id => db.collection('quizAttempts').doc(`${id}__${me.roll}`);

function back(msg) {
  area().innerHTML = `<div class="panel"><div class="empty-state">${msg}<br><br><a class="btn btn-outline" style="text-decoration:none;" href="student-quizzes.html">Back to quizzes</a></div></div>`;
}

async function takeView(id) {
  it = items.find(x => x.id === id);
  if (!it) return back('This quiz is not available to you.');
  document.getElementById('page-sub').textContent = `${it.title} · ${it.courseCode}`;
  attempt = attempts[id] || null;
  if (attempt && attemptOver(it, attempt)) return back('You have already completed this quiz.' + (it.online.published ? ` <a href="?review=${encodeURIComponent(id)}">See your result</a>.` : ' Results appear here once your lecturer publishes them.'));
  if (!attempt) {
    const w = quizWindow(it.online);
    if (w.state !== 'open') return back(w.state === 'upcoming' ? `This quiz opens at ${fmtDateTime(w.opens)}.` : 'This quiz is closed.');
    const o = it.online;
    area().innerHTML = `<div class="panel" style="max-width:640px;">
      <h3>${h(it.title)}</h3>
      <div class="plan-stats" style="margin-bottom:16px;">
        <div class="plan-stat"><div class="k">Questions</div><div class="v">${o.questionCount || 0}</div></div>
        <div class="plan-stat"><div class="k">Total marks</div><div class="v">${it.totalMarks ?? 0}</div></div>
        <div class="plan-stat"><div class="k">Time limit</div><div class="v">${o.durationMin} <small>min</small></div></div>
      </div>
      <ul style="font-size:13.5px;line-height:1.7;padding-left:18px;margin:0 0 16px;">
        <li>You get <b>one attempt</b>. The timer starts when you press Start and does not stop.</li>
        <li>Your answers are <b>saved automatically</b> as you go — if your internet or phone drops, open the quiz again and continue.</li>
        <li>When time runs out, your saved answers are submitted automatically.</li>
        ${o.negativeMark ? `<li><b>Negative marking:</b> each wrong answer loses ${o.negativeMark === 1 ? 'its full marks' : o.negativeMark + ' of its marks'}. Unanswered questions lose nothing.</li>` : ''}
        <li>Leaving the quiz screen (switching apps or tabs) is recorded for your lecturer.</li>
      </ul>
      <button class="btn btn-primary-sm" id="btn-start" style="font-size:15px;padding:12px 22px;">Start quiz</button>
      <div class="form-msg" id="start-msg"></div>
    </div>`;
    document.getElementById('btn-start').addEventListener('click', startAttempt);
    return;
  }
  await enterQuiz();
}

async function startAttempt() {
  const btn = document.getElementById('btn-start');
  if (!navigator.onLine) { setMsg('start-msg', 'You need internet to start the quiz.', 'error'); return; }
  btn.disabled = true; btn.textContent = 'Starting…';
  try {
    const localStart = Date.now();
    await attemptRef(it.id).set({
      itemId: it.id, rollNumber: me.roll, courseCode: it.courseCode, status: 'started',
      startedAt: firebase.firestore.FieldValue.serverTimestamp(), answers: {}, tabSwitches: 0
    });
    const fresh = await attemptRef(it.id).get();
    attempt = fresh.data();
    const serverStart = tsMillis(attempt.startedAt);
    offset = serverStart ? serverStart - localStart : 0;
    await enterQuiz();
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Start quiz';
    setMsg('start-msg', e.code === 'permission-denied' ? 'The quiz is not open right now (or you already started it). Refresh the page.' : 'Could not start: ' + e.message, 'error');
  }
}

async function enterQuiz() {
  try {
    const p = await db.collection('quizPapers').doc(it.id).get();
    paper = p.data();
  } catch (e) { return back('Could not load the questions: ' + h(e.message)); }
  answers = { ...(attempt.answers || {}) };
  tabSwitches = attempt.tabSwitches || 0;
  const view = studentView(paper.questions || [], it.online, me.roll, it.id);
  area().innerHTML = `
    <div class="quiz-timer" id="quiz-timer">
      <div><div style="font-weight:600;">${h(it.title)}</div><div class="small" id="save-state" style="opacity:.8;">Answers save automatically</div></div>
      <div class="q-progress" id="q-progress">${view.map((_, i) => `<span data-i="${i}">${i + 1}</span>`).join('')}</div>
      <div class="t" id="time-left">--:--</div>
    </div>
    <div id="q-area">${view.map(({ q, optionOrder }, i) => takeCard(q, optionOrder, i)).join('')}</div>
    <div class="panel"><div class="gap-row" style="justify-content:space-between;">
      <span class="muted" id="answered-count"></span>
      <button class="btn btn-primary-sm" id="btn-submit" style="font-size:15px;padding:12px 22px;">Submit quiz</button></div>
      <div class="form-msg" id="submit-msg"></div></div>`;
  wireTaking(view);
  updateProgress(view);
  tick();
  timerId = setInterval(tick, 1000);
  window.addEventListener('beforeunload', warnLeave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && !finished) { tabSwitches++; scheduleSave(); }
  });
}

function warnLeave(e) { if (!finished) { e.preventDefault(); e.returnValue = ''; } }

function takeCard(q, order, i) {
  const a = answers[q.id];
  let body = '';
  if (q.type === 'mcq' || q.type === 'multi') {
    body = order.map((k, pos) => {
      const checked = q.type === 'multi' ? (a || []).map(Number).includes(k) : isAnswered(a) && Number(a) === k;
      return `<label class="q-opt"><input type="${q.type === 'multi' ? 'checkbox' : 'radio'}" name="q-${h(q.id)}" value="${k}" data-q="${h(q.id)}" ${checked ? 'checked' : ''}> <span><b>${LETTERS[pos]}.</b> ${h(q.options[k])}</span></label>`;
    }).join('');
  } else if (q.type === 'tf') {
    body = ['true', 'false'].map(v => `<label class="q-opt"><input type="radio" name="q-${h(q.id)}" value="${v}" data-q="${h(q.id)}" ${String(a) === v ? 'checked' : ''}> ${v === 'true' ? 'True' : 'False'}</label>`).join('');
  } else {
    body = `<input type="text" class="search-input q-short-ans" style="max-width:100%;" data-q="${h(q.id)}" value="${h(a || '')}" placeholder="Type your answer" autocomplete="off">`;
  }
  return `<div class="q-card" id="qc-${i}"><div class="q-head"><span class="q-num">Question ${i + 1}</span>
    <span class="muted small">${h(q.marks)} mark${Number(q.marks) === 1 ? '' : 's'}${q.type === 'multi' ? ' · choose all that apply' : ''}</span></div>
    <div class="q-text">${h(q.text)}</div>${body}
    ${q.type !== 'short' ? `<button type="button" class="link-btn small q-clear" data-q="${h(q.id)}" style="margin-top:4px;">Clear my answer</button>` : ''}</div>`;
}

function wireTaking(view) {
  const qa = document.getElementById('q-area');
  qa.addEventListener('change', e => {
    const t = e.target, qid = t.dataset.q;
    if (!qid) return;
    const q = paper.questions.find(x => x.id === qid);
    if (q.type === 'multi') answers[qid] = [...qa.querySelectorAll(`input[data-q="${CSS.escape(qid)}"]:checked`)].map(x => Number(x.value));
    else if (q.type === 'mcq') answers[qid] = Number(t.value);
    else if (q.type === 'tf') answers[qid] = t.value;
    updateProgress(view); scheduleSave();
  });
  qa.addEventListener('input', e => {
    if (!e.target.classList.contains('q-short-ans')) return;
    answers[e.target.dataset.q] = e.target.value;
    updateProgress(view); scheduleSave();
  });
  qa.addEventListener('click', e => {
    if (!e.target.classList.contains('q-clear')) return;
    const qid = e.target.dataset.q;
    delete answers[qid];
    qa.querySelectorAll(`input[data-q="${CSS.escape(qid)}"]`).forEach(x => { x.checked = false; });
    updateProgress(view); scheduleSave();
  });
  document.getElementById('q-progress').addEventListener('click', e => {
    const i = e.target.dataset.i;
    if (i !== undefined) document.getElementById('qc-' + i).scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.getElementById('btn-submit').addEventListener('click', () => submitQuiz(false));
}

function updateProgress(view) {
  let n = 0;
  view.forEach(({ q }, i) => {
    const done = isAnswered(answers[q.id]);
    if (done) n++;
    const sq = document.querySelector(`#q-progress span[data-i="${i}"]`);
    if (sq) sq.classList.toggle('done', done);
  });
  document.getElementById('answered-count').textContent = `${n} of ${view.length} answered`;
}

function remainingMs() {
  return tsMillis(attempt.startedAt) + it.online.durationMin * 60000 - (Date.now() + offset);
}

function tick() {
  const left = remainingMs();
  const el = document.getElementById('time-left');
  if (!el) return;
  const s = Math.max(0, Math.floor(left / 1000));
  el.textContent = `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
  document.getElementById('quiz-timer').classList.toggle('low', s <= 60);
  if (left <= 0 && !finished) submitQuiz(true);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  document.getElementById('save-state').textContent = 'Saving…';
  saveTimer = setTimeout(saveNow, 1500);
}

async function saveNow() {
  if (finished) return;
  try {
    await attemptRef(it.id).update({ answers, tabSwitches });
    document.getElementById('save-state').textContent = `Saved ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  } catch (e) {
    document.getElementById('save-state').textContent = navigator.onLine ? 'Could not save — check your connection' : 'Offline — answers kept on this phone, will upload when online';
  }
}

async function submitQuiz(auto) {
  if (submitting || finished) return;
  if (!auto) {
    const unanswered = (paper.questions || []).filter(q => !isAnswered(answers[q.id])).length;
    if (!confirm(unanswered ? `You have ${unanswered} unanswered question(s). Submit anyway? You cannot change answers after submitting.` : 'Submit your quiz? You cannot change answers after submitting.')) return;
  }
  submitting = true;
  clearTimeout(saveTimer);
  const btn = document.getElementById('btn-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
  try {
    await attemptRef(it.id).update({ answers, tabSwitches, status: 'submitted', submittedAt: firebase.firestore.FieldValue.serverTimestamp() });
    finish(auto ? 'Time is up — your quiz was submitted automatically.' : 'Your quiz has been submitted.');
  } catch (e) {
    if (auto || remainingMs() < 0) finish('Time is up. Your last saved answers have been recorded for marking.');
    else { submitting = false; if (btn) { btn.disabled = false; btn.textContent = 'Submit quiz'; } setMsg('submit-msg', 'Could not submit: ' + e.message + ' — check your internet and press Submit again.', 'error'); }
  }
}

function finish(msg) {
  finished = true;
  clearInterval(timerId);
  window.removeEventListener('beforeunload', warnLeave);
  const n = (paper.questions || []).filter(q => isAnswered(answers[q.id])).length;
  area().innerHTML = `<div class="panel" style="max-width:640px;"><h3>✓ ${h(msg)}</h3>
    <p style="font-size:14px;">You answered <b>${n}</b> of <b>${(paper.questions || []).length}</b> questions. Your result will appear under <b>Online Quizzes</b> and <b>Marks &amp; Result</b> once your lecturer publishes it.</p>
    <a class="btn btn-outline" style="text-decoration:none;" href="student-quizzes.html">Back to quizzes</a></div>`;
}

/* ---------------- Review ---------------- */

async function reviewView(id) {
  const q = items.find(x => x.id === id);
  if (!q || !q.online.published) return back('Results for this quiz are not published yet.');
  document.getElementById('page-sub').textContent = `${q.title} · result`;
  const a = attempts[id] || { answers: {} };
  const m = marks[id];
  let p;
  try { p = (await db.collection('quizPapers').doc(id).get()).data(); } catch (e) { return back('Could not load the quiz: ' + h(e.message)); }
  const showKey = q.online.showAnswers !== false && p.answerKey;
  const view = studentView(p.questions || [], q.online, me.roll, id);
  const sc = showKey ? scoreAttempt(p.questions || [], p.answerKey, a.answers, q.online.negativeMark) : null;
  area().innerHTML = `<div class="panel" style="margin-bottom:16px;"><div class="plan-hero">
      ${ringHTML(m && m.totalMarks ? m.marksObtained / m.totalMarks * 100 : 0, 'lg ok', m ? `${m.marksObtained}/${m.totalMarks}` : '—')}
      <div><h3 style="border:none;padding:0;margin:0 0 6px;">${h(q.title)}</h3>
      <div class="muted">${h(q.courseCode)}${sc ? ` · ${sc.per.filter(x => x.correct === true).length} correct, ${sc.per.filter(x => x.correct === false).length} wrong, ${sc.per.filter(x => x.correct === null).length} unanswered` : ''}</div>
      <div style="margin-top:10px;"><a class="link-btn" href="student-quizzes.html">&larr; Back to quizzes</a></div></div></div></div>
    ${showKey ? view.map(({ q: qq, optionOrder }, i) => renderQuestionForStudent(qq, optionOrder, i, (a.answers || {})[qq.id], true, p.answerKey[qq.id])).join('')
      : '<div class="panel"><div class="empty-state">Your lecturer chose to share scores only, not the answers.</div></div>'}`;
}
