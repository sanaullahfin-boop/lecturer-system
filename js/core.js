// ==========================================================================
// CORE — shared by every page (admin + student). Load after auth.js.
//   • safe-HTML helpers, local-time date helpers (Pakistan time, not UTC)
//   • app Settings (grading/attendance rules you control from Settings page)
//   • sidebar + theme toggle + online/offline indicator + toasts
//   • offline-aware saving, small SVG charts, WhatsApp links, Excel helper
// ==========================================================================

/* ---------------- Escaping ---------------- */

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
const h = escapeHtml;

/** For a value placed inside a single-quoted JS string inside an onclick="..." attribute. */
function escapeAttr(str) {
  return escapeHtml(String(str === null || str === undefined ? '' : str).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}
const jsArg = escapeAttr;

/** Only allow http(s) links (blocks javascript: and similar). */
function safeUrl(url) {
  const u = String(url || '').trim();
  return /^https?:\/\//i.test(u) ? escapeHtml(u) : '#';
}

function sanitizeId(str) {
  return String(str).replace(/[^A-Za-z0-9_-]/g, '_');
}

/* ---------------- Dates (local time) ---------------- */

function pad2(n) { return String(n).padStart(2, '0'); }

/** YYYY-MM-DD in the device's local time zone (fixes the old UTC bug). */
function toLocalISO(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function localToday() { return toLocalISO(new Date()); }

/** Parse "YYYY-MM-DD" as a local date (midday, so DST/zone shifts never change the day). */
function parseISODate(str) {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}
function addDays(iso, n) {
  const d = parseISODate(iso); if (!d) return iso;
  d.setDate(d.getDate() + n);
  return toLocalISO(d);
}
function daysBetween(a, b) {
  const da = parseISODate(a), db_ = parseISODate(b);
  if (!da || !db_) return 0;
  return Math.round((db_ - da) / 86400000);
}
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function weekdayOf(iso) { const d = parseISODate(iso); return d ? d.getDay() : -1; }
function fmtDate(iso, opts) {
  const d = parseISODate(iso); if (!d) return iso || '—';
  return d.toLocaleDateString('en-GB', opts || { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtDateLong(iso) { return fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
function todayLabel() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/** Converts whatever Excel hands us (serial number, Date, "YYYY-MM-DD", "DD/MM/YYYY") into YYYY-MM-DD. */
function excelToISODate(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && isFinite(v)) {
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }
  if (v instanceof Date && !isNaN(v)) {
    const d = new Date(v.getTime() + 12 * 3600000);
    return toLocalISO(d);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/); // DD/MM/YYYY (Pakistan style)
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${pad2(m[2])}-${pad2(m[1])}`;
  }
  const d = new Date(s);
  return isNaN(d) ? '' : toLocalISO(d);
}

/* ---------------- Settings ---------------- */

const DEFAULT_SETTINGS = {
  institution: { name: '', department: '', teacher: 'Dr. Sanaullah' },
  activeTerm: '',
  attendance: {
    // What each status means for attendance %:
    //   'present'  → counts as attended      'half' → counts as half attended
    //   'absent'   → counts as missed        'excluded' → not counted at all
    // Your attendance options. Each one: what it is called, its Excel code,
    // how it counts ('present' | 'half' | 'absent' | 'excluded' = not counted),
    // its colour, and whether it is switched on (shown when marking).
    // Switched-off options stay valid for records already marked with them.
    statuses: [
      { key: 'present', label: 'Present', code: 'P', rule: 'present', color: 'ok', enabled: true },
      { key: 'absent', label: 'Absent', code: 'A', rule: 'absent', color: 'danger', enabled: true },
      { key: 'leave', label: 'Leave', code: 'L', rule: 'excluded', color: 'brass', enabled: true },
      { key: 'late', label: 'Late', code: 'Lt', rule: 'present', color: 'warn', enabled: true },
      { key: 'excused', label: 'Excused', code: 'E', rule: 'excluded', color: 'neutral', enabled: true }
    ],
    defaultStatus: 'present',
    warningThreshold: 75,
    scoring: 'proportional', // or 'bands'
    bands: [
      { min: 90, score: 100 }, { min: 85, score: 90 }, { min: 80, score: 80 },
      { min: 75, score: 60 }, { min: 0, score: 0 }
    ]
  },
  grading: {
    defaultWeights: { attendance: 10, quiz: 15, assignment: 20, presentation: 10, task: 5, exam: 40 },
    missingComponent: 'rescale', // 'rescale' (fair: ignore components with no marks yet) or 'zero'
    blankMarks: 'ignore',        // 'ignore' (blank = not graded yet) or 'zero' (blank after due date = 0)
    aggregation: 'average',      // 'average' of percentages, or 'sum' of marks
    dropLowest: { quiz: 0, assignment: 0, presentation: 0, task: 0, exam: 0 },
    passMark: 45,
    decimals: 1,
    showStandingToStudents: false,
    scale: [
      { min: 85, grade: 'A', gp: 4.0 }, { min: 80, grade: 'A-', gp: 3.7 }, { min: 75, grade: 'B+', gp: 3.3 },
      { min: 70, grade: 'B', gp: 3.0 }, { min: 65, grade: 'B-', gp: 2.7 }, { min: 60, grade: 'C+', gp: 2.3 },
      { min: 55, grade: 'C', gp: 2.0 }, { min: 50, grade: 'C-', gp: 1.7 }, { min: 45, grade: 'D', gp: 1.0 },
      { min: 0, grade: 'F', gp: 0 }
    ]
  },
  whatsapp: {
    countryCode: '92',
    attendanceTemplate: 'Dear {name} ({roll}), your attendance in {course} is {pct}%, which is below the required {threshold}%. Please attend classes regularly. — {teacher}',
    resultTemplate: 'Dear {name} ({roll}), your current standing in {course} is {total}% (Grade {grade}). — {teacher}'
  },
  plan: { weeks: 16, midtermWeek: 8, finalWeek: 16, meetingDays: [1, 3, 5] },
  lists: {
    examNames: ['Midterm', 'Sessional I', 'Sessional II', 'Final Internal'],
    fileCategories: ['Lecture Notes', 'Slides', 'Course Outline', 'Reference Material', 'Video', 'Past Paper', 'Other'],
    presentationStatuses: ['scheduled', 'completed', 'no-show']
  },
  quiz: { defaultDuration: 20, negativeMark: 0, shuffleQuestions: true, shuffleOptions: true, showAnswers: true },
  migration: { attendanceV2: false }
};

const GRADE_TYPES = ['quiz', 'assignment', 'presentation', 'task', 'exam'];
const TYPE_LABEL = { attendance: 'Attendance', quiz: 'Quiz', assignment: 'Assignment', presentation: 'Presentation', task: 'Task', exam: 'Internal Exam' };
const TYPE_LABEL_PLURAL = { attendance: 'Attendance', quiz: 'Quizzes', assignment: 'Assignments', presentation: 'Presentations', task: 'Tasks', exam: 'Internal Exams' };
// Built-in option keys (kept for old data; the live list is settings.attendance.statuses)
const ATT_STATUSES = ['present', 'absent', 'leave', 'late', 'excused'];
const ATT_LABEL = { present: 'Present', absent: 'Absent', leave: 'Leave', late: 'Late', excused: 'Excused' };
const ATT_CODE = { present: 'P', absent: 'A', leave: 'L', late: 'Lt', excused: 'E' };
const ATT_FROM_CODE = { P: 'present', A: 'absent', L: 'leave', LT: 'late', E: 'excused' };

function deepMerge(base, extra) {
  if (Array.isArray(base)) return Array.isArray(extra) && extra.length ? extra : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach(k => {
        out[k] = (k in base) ? deepMerge(base[k], extra[k]) : extra[k];
      });
    }
    return out;
  }
  return extra === undefined || extra === null ? base : extra;
}

/** Upgrades settings saved by older versions (e.g. v2 statusRules) without losing anything. */
function normalizeSettings(merged, stored) {
  const sa = (stored && stored.attendance) || {};
  if (!(Array.isArray(sa.statuses) && sa.statuses.length) && sa.statusRules) {
    merged.attendance.statuses = merged.attendance.statuses.map(st => sa.statusRules[st.key] ? { ...st, rule: sa.statusRules[st.key] } : st);
  }
  if (!merged.attendance.statuses.some(st => st.key === merged.attendance.defaultStatus && st.enabled !== false)) {
    const first = merged.attendance.statuses.find(st => st.enabled !== false);
    merged.attendance.defaultStatus = first ? first.key : 'present';
  }
  return merged;
}

/* ---------------- Attendance options (from Settings) ---------------- */

const STATUS_COLORS = { ok: 'Green', danger: 'Red', warn: 'Orange', brass: 'Gold', info: 'Blue', neutral: 'Grey' };
const LEGACY_CODES = { P: 'present', A: 'absent', L: 'leave', LT: 'late', E: 'excused' };

function attStatuses(settings, enabledOnly) {
  return settings.attendance.statuses.filter(s => !enabledOnly || s.enabled !== false);
}
function attDef(settings, key) {
  return settings.attendance.statuses.find(s => s.key === key) ||
    { key, label: String(key || '?'), code: String(key || '?'), rule: 'excluded', color: 'neutral', enabled: false, unknown: true };
}
function attLabel(settings, key) { return attDef(settings, key).label; }
function attCode(settings, key) { return attDef(settings, key).code; }
function attRule(settings, key) { return attDef(settings, key).rule || 'excluded'; }
function attColor(settings, key) { return attDef(settings, key).color || 'neutral'; }
/** Excel code / label → status key (case-insensitive). */
function attFromCode(settings, raw) {
  const c = String(raw || '').trim().toUpperCase();
  if (!c) return null;
  const hit = settings.attendance.statuses.find(s => String(s.code).toUpperCase() === c || String(s.label).toUpperCase() === c);
  if (hit) return hit.key;
  const legacy = LEGACY_CODES[c] || LEGACY_CODES[c.replace(/[^A-Z]/g, '')];
  return legacy && settings.attendance.statuses.some(s => s.key === legacy) ? legacy : null;
}
/** The status meaning "absent" for the All Absent button. */
function attAbsentKey(settings) {
  const on = attStatuses(settings, true);
  return (on.find(s => s.key === 'absent') || on.find(s => s.rule === 'absent') || on[0] || { key: 'absent' }).key;
}
function attCountsAsPresent(settings, key) { const r = attRule(settings, key); return r === 'present' || r === 'half'; }

/** Editable lists (exam names, file categories, presentation statuses). */
function listOf(settings, name) {
  const l = (settings.lists || {})[name];
  return Array.isArray(l) && l.length ? l : DEFAULT_SETTINGS.lists[name];
}

let _settingsCache = null;
const SETTINGS_CACHE_KEY = 'sc_settings_v2';

/** Loads app settings (cached for the browser session; ~1 read per session). */
async function loadSettings(force) {
  if (_settingsCache && !force) return _settingsCache;
  if (!force) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(SETTINGS_CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.t < 10 * 60 * 1000) {
        _settingsCache = normalizeSettings(deepMerge(DEFAULT_SETTINGS, cached.v), cached.v);
        return _settingsCache;
      }
    } catch (e) { /* ignore */ }
  }
  let stored = {};
  try {
    const doc = await db.collection('settings').doc('app').get();
    if (doc.exists) stored = doc.data();
  } catch (e) { console.warn('Settings not readable yet, using defaults:', e.message); }
  _settingsCache = normalizeSettings(deepMerge(DEFAULT_SETTINGS, stored), stored);
  try { sessionStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({ t: Date.now(), v: stored })); } catch (e) { }
  return _settingsCache;
}

async function saveSettings(partial) {
  await db.collection('settings').doc('app').set(partial, { merge: true });
  try { sessionStorage.removeItem(SETTINGS_CACHE_KEY); } catch (e) { }
  return loadSettings(true);
}

/** Is this course part of the active term? (Blank term on either side = always shown.) */
function inActiveTerm(course, settings) {
  const t = (settings && settings.activeTerm || '').trim();
  if (!t) return true;
  const ct = (course.term || '').trim();
  return !ct || ct === t;
}

function weightsFor(course, settings) {
  return deepMerge(settings.grading.defaultWeights, (course && course.gradeWeights) || {});
}

/* ---------------- Toast ---------------- */

function toast(message, type, ms) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.setAttribute('role', 'status');
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), ms || (type === 'error' ? 6500 : 3200));
}

function setMsg(id, text, type) {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  if (!el) return;
  el.textContent = text || '';
  el.className = 'form-msg' + (text ? ' ' + (type || 'info') : '');
}

/* ---------------- Offline-aware saving ---------------- */

/**
 * Commits a batch (or awaits a write promise). When the device is offline,
 * Firestore queues the write locally and only resolves after reconnecting —
 * so instead of spinning forever we resolve quickly with {queued:true}.
 */
async function commitSmart(batchOrPromise) {
  const p = (batchOrPromise && typeof batchOrPromise.commit === 'function') ? batchOrPromise.commit() : batchOrPromise;
  if (navigator.onLine) { await p; return { queued: false }; }
  p.catch(e => toast('A change saved offline could not sync: ' + e.message, 'error'));
  await new Promise(r => setTimeout(r, 400));
  return { queued: true };
}

/** Runs many writes in batches of 400 (Firestore's cap is 500 per batch). */
async function writeInBatches(ops, onProgress) {
  let done = 0, queued = false;
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach(op => op(batch));
    const r = await commitSmart(batch);
    queued = queued || r.queued;
    done += Math.min(400, ops.length - i);
    if (onProgress) onProgress(done, ops.length);
  }
  return { count: done, queued };
}

/** Query helper for "field in [many values]" — splits into chunks of 10. */
async function getWhereIn(collection, field, values, extra) {
  const uniq = [...new Set(values)].filter(v => v !== undefined && v !== null && v !== '');
  const docs = [];
  for (let i = 0; i < uniq.length; i += 10) {
    let q = db.collection(collection).where(field, 'in', uniq.slice(i, i + 10));
    if (extra) q = extra(q);
    const snap = await q.get();
    snap.forEach(d => docs.push(d));
  }
  return docs;
}

/* ---------------- Sidebar, theme, network ---------------- */

const ADMIN_NAV = [
  ['Overview', [['dashboard', 'admin-dashboard.html', 'Dashboard']]],
  ['Teaching', [
    ['plans', 'course-plan.html', 'Course Plans'],
    ['attendance', 'attendance.html', 'Attendance'],
    ['students', 'students.html', 'Students'],
    ['courses', 'courses.html', 'Courses']
  ]],
  ['Assessment', [
    ['assignments', 'assignments.html', 'Assignments'],
    ['quizzes', 'quizzes-tasks.html', 'Quizzes & Tasks'],
    ['onlinequiz', 'quiz-builder.html', 'Online Quizzes'],
    ['presentations', 'presentations.html', 'Presentations'],
    ['marks', 'marks.html', 'Exams & Gradebook']
  ]],
  ['Communication', [
    ['announcements', 'announcements.html', 'Announcements'],
    ['content', 'course-content.html', 'Course Content']
  ]],
  ['System', [
    ['reports', 'reports.html', 'Reports'],
    ['settings', 'settings.html', 'Settings'],
    ['backup', 'backup.html', 'Backup'],
    ['history', 'history.html', 'Change History'],
    ['help', 'help.html', 'Help & Guide']
  ]]
];
const STUDENT_NAV = [
  ['My Classes', [
    ['dashboard', 'student-dashboard.html', 'Dashboard'],
    ['plan', 'student-course-plan.html', 'Course Progress'],
    ['attendance', 'student-attendance.html', 'Attendance'],
    ['marks', 'student-marks.html', 'Marks & Result'],
    ['quizzes', 'student-quizzes.html', 'Online Quizzes'],
    ['assignments', 'student-assignments.html', 'Assignments'],
    ['presentations', 'student-presentations.html', 'Presentations']
  ]],
  ['Resources', [
    ['content', 'student-course-content.html', 'Course Content'],
    ['announcements', 'student-announcements.html', 'Announcements'],
    ['account', 'student-account.html', 'My Account'],
    ['help', 'student-help.html', 'Help']
  ]]
];

function themePref() { try { return localStorage.getItem('sc_theme') || 'auto'; } catch (e) { return 'auto'; } }
function applyTheme(pref) {
  try { localStorage.setItem('sc_theme', pref); } catch (e) { }
  const dark = pref === 'dark' || (pref === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}
function themeLabel(p) { return p === 'dark' ? '☾ Dark' : p === 'light' ? '☀ Light' : '◐ Auto'; }

function renderSidebar() {
  const aside = document.querySelector('aside.sidebar[data-role]');
  if (!aside) return;
  const role = aside.dataset.role;
  const active = aside.dataset.active;
  const nav = role === 'student' ? STUDENT_NAV : ADMIN_NAV;
  let html = `<div class="brand"><div class="seal">SC</div><div class="brand-name">Sanaullah's Classroom<small>${role === 'student' ? 'Student Portal' : 'Admin Console'}</small></div></div>`;
  nav.forEach(([group, links]) => {
    html += `<div class="nav-group-label">${h(group)}</div>`;
    links.forEach(([key, href, label]) => {
      html += `<a class="nav-link${key === active ? ' active' : ''}" href="${href}">${h(label)}</a>`;
    });
  });
  html += `<div class="nav-spacer"></div>
    <div class="sidebar-footer">
      <span id="net-status"><span class="net-dot"></span>Online</span>
      <button type="button" class="theme-toggle" id="theme-toggle" title="Switch light / dark mode">${themeLabel(themePref())}</button>
    </div>`;
  aside.innerHTML = html;
  document.getElementById('theme-toggle').addEventListener('click', (e) => {
    const order = ['auto', 'light', 'dark'];
    const next = order[(order.indexOf(themePref()) + 1) % 3];
    applyTheme(next);
    e.currentTarget.textContent = themeLabel(next);
  });
  updateNetStatus();
}

function updateNetStatus() {
  const el = document.getElementById('net-status');
  if (!el) return;
  el.innerHTML = navigator.onLine
    ? '<span class="net-dot"></span>Online'
    : '<span class="net-dot off"></span>Offline — changes will sync';
}
window.addEventListener('online', () => { updateNetStatus(); toast('Back online — syncing your changes.', 'ok'); });
window.addEventListener('offline', () => { updateNetStatus(); toast('You are offline. You can keep working; changes will sync later.'); });

/** Fills the top-right name chip and wires Sign out. */
var _chipName = '';
function setUserChip(name) {
  _chipName = name || '';
  const n = name || '?';
  const nameEl = document.getElementById('admin-name') || document.getElementById('student-name');
  const initEl = document.getElementById('admin-initial') || document.getElementById('student-initial');
  if (nameEl) nameEl.textContent = n;
  if (initEl) initEl.textContent = n.charAt(0).toUpperCase();
}

function wireLogout() {
  const btn = document.getElementById('logout-btn');
  if (btn) btn.addEventListener('click', logout);
}

/* ---------------- Modals ---------------- */

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function wireModal(id, closeBtnIds) {
  const el = document.getElementById(id);
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
  (closeBtnIds || []).forEach(b => { const btn = document.getElementById(b); if (btn) btn.addEventListener('click', () => el.classList.remove('open')); });
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
});

/* ---------------- Small SVG charts (no library needed, works offline) ---------------- */

/**
 * Line chart. opts: { labels:[], series:[{name, color, values:[], dashed}], yMax, ySuffix, height }
 */
function lineChartSVG(opts) {
  const W = 640, H = opts.height || 230, L = 38, R = 12, T = 12, B = 30;
  const n = opts.labels.length;
  const yMax = opts.yMax || Math.max(1, ...opts.series.flatMap(s => s.values.filter(v => v !== null && v !== undefined)));
  const x = i => L + (n <= 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1));
  const y = v => T + (H - T - B) * (1 - v / yMax);
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const val = yMax * k / 4, yy = y(val);
    g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" style="stroke:var(--hairline)" />`;
    g += `<text x="${L - 6}" y="${yy + 4}" text-anchor="end" font-size="10" style="fill:var(--slate)">${Math.round(val)}${opts.ySuffix || ''}</text>`;
  }
  const step = Math.max(1, Math.ceil(n / 10));
  opts.labels.forEach((lab, i) => {
    const isLast = i === n - 1;
    if (isLast || (i % step === 0 && n - 1 - i >= Math.ceil(step / 2))) {
      const anchor = isLast && n > 1 ? 'end' : i === 0 && n > 1 ? 'start' : 'middle';
      g += `<text x="${x(i)}" y="${H - 10}" text-anchor="${anchor}" font-size="10" style="fill:var(--slate)">${h(lab)}</text>`;
    }
  });
  if (opts.markers) opts.markers.forEach(m => {
    if (m.index < 0 || m.index >= n) return;
    g += `<line x1="${x(m.index)}" x2="${x(m.index)}" y1="${T}" y2="${H - B}" style="stroke:${m.color || 'var(--danger)'};stroke-dasharray:3 3;opacity:.7" />`;
    const nearRight = x(m.index) > W - R - 40;
    g += `<text x="${x(m.index) + (nearRight ? -3 : 3)}" y="${T + 10}" text-anchor="${nearRight ? 'end' : 'start'}" font-size="10" style="fill:${m.color || 'var(--danger)'}">${h(m.label)}</text>`;
  });
  opts.series.forEach(s => {
    const pts = s.values.map((v, i) => (v === null || v === undefined) ? null : `${x(i)},${y(v)}`).filter(Boolean);
    if (!pts.length) return;
    g += `<polyline fill="none" points="${pts.join(' ')}" style="stroke:${s.color};stroke-width:2.4;${s.dashed ? 'stroke-dasharray:6 5;' : ''}" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (!s.dashed) s.values.forEach((v, i) => {
      if (v === null || v === undefined) return;
      g += `<circle cx="${x(i)}" cy="${y(v)}" r="2.8" style="fill:${s.color}"><title>${h(opts.labels[i])}: ${v}${opts.ySuffix || ''}</title></circle>`;
    });
  });
  const legend = `<div class="chart-legend">${opts.series.map(s => `<span><i style="background:${s.color}"></i>${h(s.name)}</span>`).join('')}</div>`;
  return `<div class="chart-box"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${h(opts.title || 'chart')}">${g}</svg>${legend}</div>`;
}

/** Column chart. opts: { labels:[], values:[], colors:[] (optional), height } */
function columnChartSVG(opts) {
  const W = 640, H = opts.height || 200, L = 30, R = 10, T = 14, B = 28;
  const n = opts.values.length || 1;
  const max = Math.max(4, Math.ceil(Math.max(1, ...opts.values) / 4) * 4);
  const bw = (W - L - R) / n;
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const yy = T + (H - T - B) * (1 - k / 4);
    g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" style="stroke:var(--hairline)" />`;
    g += `<text x="${L - 5}" y="${yy + 4}" text-anchor="end" font-size="10" style="fill:var(--slate)">${Math.round(max * k / 4)}</text>`;
  }
  opts.values.forEach((v, i) => {
    const bh = (H - T - B) * v / max;
    const xx = L + i * bw + bw * 0.15;
    const color = (opts.colors && opts.colors[i]) || 'var(--brass)';
    g += `<rect x="${xx}" y="${H - B - bh}" width="${bw * 0.7}" height="${bh}" rx="3" style="fill:${color}"><title>${h(opts.labels[i])}: ${v}</title></rect>`;
    if (v > 0) g += `<text x="${xx + bw * 0.35}" y="${H - B - bh - 4}" text-anchor="middle" font-size="10" style="fill:var(--ink)">${v}</text>`;
    g += `<text x="${xx + bw * 0.35}" y="${H - 10}" text-anchor="middle" font-size="10.5" style="fill:var(--slate)">${h(opts.labels[i])}</text>`;
  });
  return `<div class="chart-box"><svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg></div>`;
}

function ringHTML(pct, cls, label) {
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return `<div class="ring ${cls || ''}" style="--pct:${p}"><span>${label !== undefined ? h(label) : p + '%'}</span></div>`;
}
function barHTML(pct, cls, markerPct) {
  const p = Math.max(0, Math.min(100, pct || 0));
  return `<div class="bar"><i class="${cls || ''}" style="width:${p}%"></i>${markerPct !== undefined && markerPct !== null ? `<span class="marker" style="left:${Math.max(0, Math.min(100, markerPct))}%" title="Expected by today"></span>` : ''}</div>`;
}

/* ---------------- WhatsApp ---------------- */

/** Normalises Pakistani-style numbers: 0300-1234567 → 923001234567. */
function normalizePhone(phone, countryCode) {
  let p = String(phone || '').replace(/[^\d+]/g, '');
  if (!p) return '';
  const cc = String(countryCode || '92').replace(/\D/g, '');
  if (p.startsWith('+')) return p.slice(1);
  if (p.startsWith('00')) return p.slice(2);
  if (p.startsWith('0')) return cc + p.slice(1);
  if (p.length === 10 && cc === '92') return cc + p;
  return p;
}
function fillTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? vars[k] : m));
}
function waLink(phone, text, settings) {
  const num = normalizePhone(phone, settings && settings.whatsapp && settings.whatsapp.countryCode);
  return num ? `https://wa.me/${num}?text=${encodeURIComponent(text)}` : '';
}
function waButtonHTML(phone, text, settings, label) {
  const link = waLink(phone, text, settings);
  if (!link) return `<span class="wa-btn disabled" title="No phone number on file">${label || 'WhatsApp'}</span>`;
  return `<a class="wa-btn" href="${h(link)}" target="_blank" rel="noopener" title="Open WhatsApp with this message ready to send">${label || 'WhatsApp'}</a>`;
}

/* ---------------- Excel helper ---------------- */

/** sheets: { 'Sheet Name': arrayOfRowObjects | {aoa: [[...]]} } */
function downloadWorkbook(sheets, filename) {
  const wb = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, data]) => {
    let ws, aoa;
    if (data && data.aoa) { aoa = data.aoa; ws = XLSX.utils.aoa_to_sheet(aoa); }
    else {
      const rows = data || [];
      ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['(no rows)']]);
      aoa = rows.length ? [Object.keys(rows[0]), ...rows.map(r => Object.values(r))] : [];
    }
    if (aoa.length) {
      const widths = aoa[0].map((_, c) => Math.min(60, Math.max(8, ...aoa.slice(0, 200).map(r => String(r[c] === undefined || r[c] === null ? '' : r[c]).length + 2))));
      ws['!cols'] = widths.map(w => ({ wch: w }));
    }
    XLSX.utils.book_append_sheet(wb, ws, name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

/** Reads the first (or named) sheet of an uploaded Excel file as row objects or arrays. */
async function readSheet(file, opts) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const name = (opts && opts.sheet && wb.SheetNames.find(n => n.toLowerCase() === opts.sheet.toLowerCase())) || wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  return XLSX.utils.sheet_to_json(sheet, opts && opts.header ? { header: 1, defval: '' } : { defval: '' });
}

/** Case/spacing-insensitive column lookup in an imported row. */
function pickCol(row, names) {
  const keys = Object.keys(row);
  for (const n of names) {
    const want = n.toLowerCase().replace(/[^a-z0-9]/g, '');
    const k = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === want);
    if (k !== undefined && row[k] !== '' && row[k] !== null && row[k] !== undefined) return row[k];
  }
  return '';
}

/* ---------------- Numbers ---------------- */

function round(v, d) {
  if (v === null || v === undefined || isNaN(v)) return null;
  const f = Math.pow(10, d === undefined ? 1 : d);
  return Math.round(v * f) / f;
}
function fmtPct(v, d) { return v === null || v === undefined ? '—' : round(v, d) + '%'; }

/* ---------------- Service worker (offline app shell) ---------------- */

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker not registered:', e.message));
  });
}

/* ---------------- Boot ---------------- */

renderSidebar();
wireLogout();

/* ---------------- Change history (audit log) ---------------- */


/**
 * Records who changed what (admin pages only; students' writes are blocked by
 * the rules). Never blocks the page: failures are ignored.
 */
function logChange(action, detail, changes) {
  try {
    if (!auth.currentUser) return;
    const entry = {
      at: firebase.firestore.FieldValue.serverTimestamp(), atLocal: new Date().toISOString(),
      by: auth.currentUser.uid, byName: _chipName || auth.currentUser.email || '',
      action: String(action).slice(0, 80), detail: String(detail || '').slice(0, 500), page: location.pathname.split('/').pop()
    };
    if (changes && changes.length) entry.changes = changes.slice(0, 200).map(c => String(c).slice(0, 120));
    db.collection('auditLog').add(entry).catch(() => {});
  } catch (e) { /* never block the page */ }
}

/* ---------------- Calendar (.ics) export ---------------- */

function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
/** events: [{date:'YYYY-MM-DD', title, description, uid}] → downloads an all-day calendar file */
function downloadIcs(events, filename, calName) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sanaullahs Classroom//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(calName || 'Classes')}`];
  events.filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date || '')).forEach(e => {
    const d = e.date.replace(/-/g, ''), next = addDays(e.date, 1).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${icsEscape(e.uid)}@sanaullahs-classroom`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${icsEscape(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  // fold long lines (RFC 5545: 75 octets)
  const enc = new TextEncoder();
  const folded = lines.map(l => {   // keep each line under 75 bytes without splitting a character (Urdu etc.)
    const parts = []; let cur = '', bytes = 0;
    for (const ch of l) { const b = enc.encode(ch).length; if (bytes + b > 73) { parts.push(cur); cur = ''; bytes = 1; } cur += ch; bytes += b; }
    parts.push(cur); return parts.join('\r\n ');
  });
  const blob = new Blob([folded.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

/** Calendar events for one course: plan sessions + dated assessments. */
function courseCalendarEvents(course, plan, items) {
  const ev = [];
  let lec = 0;
  sortSessions((plan && plan.sessions) || []).forEach(s => {
    if (!s.plannedDate || s.type === 'holiday') return;
    const isTeach = TEACH_TYPES.includes(s.type);
    if (isTeach) lec++;
    ev.push({ uid: `${course.id}-${s.id}`, date: s.plannedDate,
      title: `${course.id}: ${isTeach ? 'L' + lec + ' ' : ''}${s.topic || PLAN_TYPE_LABEL[s.type]}`,
      description: [course.title, `Week ${s.week}`, s.details].filter(Boolean).join(' · ') });
  });
  (items || []).forEach(it => {
    if (!it.dueDate) return;
    ev.push({ uid: `${course.id}-item-${it.id}`, date: it.dueDate, title: `${course.id}: ${TYPE_LABEL[it.type] || it.type} — ${it.title}`,
      description: `${course.title || ''}${it.totalMarks ? ' · ' + it.totalMarks + ' marks' : ''}` });
  });
  return ev;
}
