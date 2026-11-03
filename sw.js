// ==========================================================================
// SERVICE WORKER — makes the app open and work offline.
//   • Your own pages/scripts: network first (you always get the latest
//     version when online), falling back to the saved copy when offline.
//   • Firebase / Excel libraries / fonts from CDNs: cached after first use.
//   • Firestore data itself is cached separately by Firebase (see
//     enablePersistence in js/firebase-config.js), not here.
// Bump VERSION when you change files and want old caches cleared.
// ==========================================================================

const VERSION = 'sc-v4.0.0';
const APP_FILES = [
  './',
  'admin-dashboard.html',
  'announcements.html',
  'assignments.html',
  'attendance.html',
  'backup.html',
  'course-content.html',
  'course-plan.html',
  'courses.html',
  'help.html',
  'history.html',
  'index.html',
  'marks.html',
  'presentations.html',
  'quiz-builder.html',
  'quizzes-tasks.html',
  'reports.html',
  'settings.html',
  'student-account.html',
  'student-announcements.html',
  'student-assignments.html',
  'student-attendance.html',
  'student-course-content.html',
  'student-course-plan.html',
  'student-dashboard.html',
  'student-help.html',
  'student-marks.html',
  'student-presentations.html',
  'student-profile.html',
  'student-quizzes.html',
  'students.html',
  'css/style.css',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/admin-dashboard.js',
  'js/announcements.js',
  'js/assignments.js',
  'js/attendance.js',
  'js/auth.js',
  'js/backup.js',
  'js/core.js',
  'js/course-content.js',
  'js/course-plan.js',
  'js/courses.js',
  'js/files.js',
  'js/firebase-config.js',
  'js/firebase-keys.js',
  'js/grade-items.js',
  'js/grading.js',
  'js/help.js',
  'js/history.js',
  'js/marks.js',
  'js/mobile-nav.js',
  'js/plan-import.js',
  'js/presentations.js',
  'js/qr.js',
  'js/quiz-builder.js',
  'js/quiz-core.js',
  'js/quizzes-tasks.js',
  'js/reports.js',
  'js/settings.js',
  'js/student-account.js',
  'js/student-announcements.js',
  'js/student-assignments.js',
  'js/student-attendance.js',
  'js/student-course-content.js',
  'js/student-course-plan.js',
  'js/student-dashboard.js',
  'js/student-marks.js',
  'js/student-presentations.js',
  'js/student-profile.js',
  'js/student-quizzes.js',
  'js/students.js',
  'js/theme.js',
  'js/vendor/jszip.min.js',
  'js/vendor/pdf.min.js',
  'js/vendor/pdf.worker.min.js'
];
const CDN_HOSTS = ['www.gstatic.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache =>
    Promise.all(APP_FILES.map(f => cache.add(f).catch(() => null)))
  ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CDN_HOSTS.includes(url.hostname)) return; // Firestore/Auth traffic goes straight through

  event.respondWith(
    fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: sameOrigin }).then(hit =>
      hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())
    ))
  );
});
