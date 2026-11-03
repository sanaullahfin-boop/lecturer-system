// ==========================================================================
// ONLINE QUIZ CORE — shared by the teacher's builder and the student page.
//
// Where things are stored (all free Firestore):
//   gradeItems/{id}.online  → settings: status draft|open|closed, time limit,
//                             window, shuffle, negative marking, published
//   quizPapers/{id}         → the questions (NO answers). Students can read it
//                             only while the quiz is open or closed.
//   quizKeys/{id}           → the answer key. Teacher only, never students.
//   quizAttempts/{id}__{roll} → one student's answers + start/submit time.
// Scores are worked out on the teacher's side and saved into gradeMarks,
// so the gradebook, reports and student pages all pick them up as usual.
// ==========================================================================

const Q_TYPES = { mcq: 'Single answer (MCQ)', multi: 'Multiple answers', tf: 'True / False', short: 'Short answer' };
const Q_STATUS_LABEL = { draft: 'Draft', open: 'Open', closed: 'Closed' };
const LETTERS = 'ABCDEFGHIJ';

/** Firestore Timestamp / {seconds} / ISO string → milliseconds */
function tsMillis(v) {
  if (!v) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v.seconds !== undefined) return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  const t = Date.parse(v);
  return isNaN(t) ? null : t;
}
function fmtDateTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtDuration(ms) {
  if (ms === null || ms === undefined || ms < 0) return '—';
  const s = Math.round(ms / 1000), m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${pad2(s % 60)}s`;
}

/* ---------- deterministic shuffle (same order every time for the same student) ---------- */
function hashStr(str) {
  let x = 2166136261;
  for (const ch of String(str)) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); }
  return x >>> 0;
}
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, seed) {
  const r = seededRandom(seed), a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** The order a given student sees: [{q, optionOrder:[originalIndex…]}] */
function studentView(questions, online, roll, itemId) {
  const seed = hashStr(roll + '|' + itemId);
  const qs = online.shuffleQuestions ? seededShuffle(questions, seed) : [...questions];
  return qs.map((q, i) => {
    const idx = (q.options || []).map((_, k) => k);
    return { q, optionOrder: online.shuffleOptions && (q.type === 'mcq' || q.type === 'multi') ? seededShuffle(idx, seed + i + 1) : idx };
  });
}

/* ---------- marking ---------- */
function normAns(s) { return String(s === undefined || s === null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }
function isAnswered(ans) { return !(ans === undefined || ans === null || ans === '' || (Array.isArray(ans) && !ans.length)); }

/** true / false / null (= not answered) */
function isCorrect(q, key, ans) {
  if (!isAnswered(ans)) return null;
  if (key === undefined || key === null) return false;
  switch (q.type) {
    case 'mcq': return Number(ans) === Number(key);
    case 'tf': return String(ans) === String(key);
    case 'multi': {
      const a = [...new Set((ans || []).map(Number))].sort().join(','), k = [...new Set((key || []).map(Number))].sort().join(',');
      return a === k;
    }
    case 'short': return (key || []).some(k => normAns(k) === normAns(ans));
    default: return false;
  }
}

function scoreAttempt(questions, keys, answers, negative) {
  let score = 0, max = 0;
  const per = questions.map(q => {
    const m = Number(q.marks) || 1;
    max += m;
    const c = isCorrect(q, (keys || {})[q.id], (answers || {})[q.id]);
    const earned = c === true ? m : c === false ? -m * (Number(negative) || 0) : 0;
    score += earned;
    return { id: q.id, correct: c, earned };
  });
  return { score: Math.max(0, round(score, 2)), max: round(max, 2), per };
}

function answerText(q, ans) {
  if (!isAnswered(ans)) return '—';
  if (q.type === 'mcq') return `${LETTERS[Number(ans)] || '?'}. ${(q.options || [])[Number(ans)] || ''}`;
  if (q.type === 'multi') return [...ans].map(Number).sort().map(i => `${LETTERS[i]}. ${(q.options || [])[i] || ''}`).join('; ');
  if (q.type === 'tf') return String(ans) === 'true' ? 'True' : 'False';
  return String(ans);
}
function keyText(q, key) {
  if (key === undefined || key === null) return '—';
  if (q.type === 'short') return (key || []).join(' / ');
  return answerText(q, key);
}

/* ---------- Excel questions ---------- */

function questionTemplateRows() {
  return [
    ['Type', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Option E', 'Option F', 'Correct', 'Marks'],
    ['MCQ', 'Which ratio measures liquidity?', 'Debt ratio', 'Current ratio', 'ROE', 'P/E ratio', '', '', 'B', 1],
    ['Multiple', 'Which of these are capital budgeting methods? (choose all)', 'NPV', 'IRR', 'Current ratio', 'Payback period', '', '', 'A,B,D', 2],
    ['TrueFalse', 'The time value of money says a rupee today is worth more than a rupee tomorrow.', '', '', '', '', '', '', 'True', 1],
    ['Short', 'What does NPV stand for?', '', '', '', '', '', '', 'Net Present Value|Net present value', 1]
  ];
}

function parseTypeCell(v, row) {
  const s = String(v || '').toLowerCase().replace(/[^a-z]/g, '');
  if (s.startsWith('multi') || s === 'msq' || s === 'checkbox') return 'multi';
  if (s.startsWith('true') || s === 'tf' || s === 'tfq' || s === 'boolean') return 'tf';
  if (s.startsWith('short') || s === 'text' || s === 'fill' || s.startsWith('fillin')) return 'short';
  if (s.startsWith('mcq') || s.startsWith('single') || s === 'choice') return 'mcq';
  // infer
  const correct = String(row.correct || '').trim();
  if (!row.options.length) return /^(t|f|true|false|yes|no)$/i.test(correct) ? 'tf' : 'short';
  return correct.includes(',') ? 'multi' : 'mcq';
}
function letterIndex(x) {
  const t = String(x).trim().toUpperCase();
  if (/^[A-J]$/.test(t)) return LETTERS.indexOf(t);
  if (/^\d+$/.test(t)) return Number(t) - 1;
  return -1;
}

/** Excel rows (objects) → { questions, answers, errors } */
function parseQuestionRows(rows) {
  const questions = [], answers = {}, errors = [];
  rows.forEach((r, i) => {
    const text = String(pickCol(r, ['Question', 'Question Text', 'Statement']) || '').trim();
    if (!text) return;
    const options = ['A', 'B', 'C', 'D', 'E', 'F'].map(L => String(pickCol(r, ['Option ' + L, L, 'Opt ' + L]) || '').trim()).filter(Boolean);
    const correct = String(pickCol(r, ['Correct', 'Answer', 'Correct Answer', 'Key']) || '').trim();
    const type = parseTypeCell(pickCol(r, ['Type', 'Question Type']), { options, correct });
    const marks = Number(pickCol(r, ['Marks', 'Mark', 'Points'])) || 1;
    const id = uid();
    let key = null;
    if (type === 'mcq') {
      const k = letterIndex(correct);
      if (k < 0 || k >= options.length) errors.push(`Row ${i + 2}: correct answer "${correct}" is not one of the options`);
      if (options.length < 2) errors.push(`Row ${i + 2}: an MCQ needs at least 2 options`);
      key = k;
    } else if (type === 'multi') {
      key = correct.split(/[,;\s]+/).filter(Boolean).map(letterIndex);
      if (!key.length || key.some(k => k < 0 || k >= options.length)) errors.push(`Row ${i + 2}: correct answers "${correct}" must be option letters like A,C`);
    } else if (type === 'tf') {
      key = /^(t|true|yes|y|1)$/i.test(correct) ? 'true' : 'false';
    } else {
      key = correct.split('|').map(x => x.trim()).filter(Boolean);
      if (!key.length) errors.push(`Row ${i + 2}: a short-answer question needs an accepted answer`);
    }
    questions.push({ id, type, text, options: type === 'mcq' || type === 'multi' ? options : [], marks });
    answers[id] = key;
  });
  return { questions, answers, errors };
}

/** Is the quiz currently accepting new attempts (per its settings)? */
function quizWindow(online, now) {
  const t = now || Date.now();
  const opens = tsMillis(online.opensAtTs || online.opensAt), closes = tsMillis(online.closesAtTs || online.closesAt);
  if (!online || online.status === 'draft') return { state: 'draft', opens, closes };
  if (online.status === 'closed') return { state: 'closed', opens, closes };
  if (opens && t < opens) return { state: 'upcoming', opens, closes };
  if (closes && t >= closes) return { state: 'closed', opens, closes };
  return { state: 'open', opens, closes };
}

/** Shared by preview + answers modal */
function renderQuestionForStudent(q, order, i, answer, disabled, key) {
  const showKey = key !== undefined;
  let body = '';
  if (q.type === 'mcq' || q.type === 'multi') {
    body = order.map((k, pos) => {
      const chosen = q.type === 'multi' ? (answer || []).map(Number).includes(k) : Number(answer) === k && isAnswered(answer);
      const right = showKey && (q.type === 'multi' ? (key || []).map(Number).includes(k) : Number(key) === k);
      return `<label class="q-opt${showKey && right ? ' right' : ''}${showKey && chosen && !right ? ' wrong' : ''}"><input type="${q.type === 'multi' ? 'checkbox' : 'radio'}" ${chosen ? 'checked' : ''} ${disabled ? 'disabled' : ''}> <span><b>${LETTERS[pos]}.</b> ${h(q.options[k])}</span></label>`;
    }).join('');
  } else if (q.type === 'tf') {
    body = ['true', 'false'].map(v => {
      const chosen = String(answer) === v, right = showKey && String(key) === v;
      return `<label class="q-opt${showKey && right ? ' right' : ''}${showKey && chosen && !right ? ' wrong' : ''}"><input type="radio" ${chosen ? 'checked' : ''} disabled> ${v === 'true' ? 'True' : 'False'}</label>`;
    }).join('');
  } else {
    body = `<input type="text" class="search-input" style="max-width:100%;" value="${h(answer || '')}" disabled placeholder="Student types the answer">` +
      (showKey ? `<div class="small" style="margin-top:6px;color:var(--success);">Accepted: ${h((key || []).join(' / '))}</div>` : '');
  }
  return `<div class="q-card"><div class="q-head"><span class="q-num">Question ${i + 1}</span><span class="muted small">${h(q.marks)} mark${Number(q.marks) === 1 ? '' : 's'}${q.type === 'multi' ? ' · choose all that apply' : ''}</span></div>
    <div class="q-text">${h(q.text)}</div>${body}</div>`;
}

