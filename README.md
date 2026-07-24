# Sanaullah's Classroom — Complete

**Status:** All planned modules are built: Auth, Students, Courses,
Attendance (with a monthly bulk-upload template), the full Gradebook
system (with bulk mark upload on Assignments/Presentations/Quizzes/Tasks/
Exams), Announcements, Course Content/Ebook Library (via Google Drive
links), Reports, and Backup/Restore (including a one-click full data reset).

Everything here runs on Firebase's free **Spark** plan. Nothing requires
Cloud Functions or the paid Blaze plan.

## ⚠️ IMPORTANT — the setup file changed. Read this before anything else.

Two rounds of bugs came from the same root problem: you were asked to
paste your Firebase keys into a file that *also* contained app logic, so
each update risked overwriting logic fixes with an older copy of that file.
**That's fixed now, permanently:**

- **`js/firebase-keys.js`** — a brand new, tiny file containing ONLY your
  5 Firebase values. **This is the only file you will ever need to edit,
  from now on, forever.**
- **`js/firebase-config.js`** — now contains ONLY logic, no keys. You never
  need to open this file again.

### What to do right now

1. Open `js/firebase-keys.js` (not `firebase-config.js` — that's a
   different, new file) and paste your 5 Firebase values into it, exactly
   like before.
2. Re-publish `docs/firestore.rules` in Firebase Console → Firestore
   Database → Rules → Publish (unchanged step from before, still needed).
3. Go to **Backup** → **Reset All Data**, type `DELETE ALL DATA`, confirm.
   This really does clear everything — if an import still says "already
   exists" afterward, check the Firestore Console directly under the
   `students` collection to confirm it's empty; if it somehow isn't, that's
   worth reporting back specifically, since it would point to something
   deeper than what's described here.
4. Re-upload every file in your `lms` folder to GitHub (the new
   `firebase-keys.js` file needs to be uploaded too — it doesn't exist in
   your repo yet).
5. Also fixed: the sample student template had a stray instructional row
   that was accidentally being read as a fake student record during import
   (visible as "generateUniqueStudentEmail is not defined" noise mixed into
   real errors). That row is gone — instructions now live on a separate
   "Instructions" tab in the spreadsheet that's never read during import.

## What was fixed in this update

- **Student login permission bug** — the security rule for the `students`
  collection was written in a way that broke specifically for the query
  student login runs (find my own record by authUid). Fixed by checking
  the record directly instead of doing an indirect lookup. **Requires
  re-publishing rules — see above.**
- **Passwords are now visible and changeable.** The Students list has a
  Password column (masked, click "Show" to reveal). Opening Edit on any
  student shows their current password and lets you set a new one anytime,
  without needing their old one on hand. New students get a "Generate"
  button next to the password field. Passwords are also included in Excel
  export/import now.
- **Re-importing after a Reset/delete no longer silently fails.** Since
  the free plan can't delete Firebase Auth accounts from the browser,
  reusing a roll number whose login still exists from before used to just
  say "3 failed" with no explanation. Now it tells you exactly which roll
  numbers are blocked and exactly what to do (delete that specific login
  in Firebase Console → Authentication → Users, then re-import).
- **Courses now has Import/Export Excel**, matching `docs/sample-courses.xlsx`
  — this was completely missing before.
- **New "Daily Attendance Log" report** on the Reports page — a day-by-day
  grid (rows = students, columns = dates) showing exactly who was present/
  absent/late/etc. on every date in a range you choose (a month, a whole
  semester, whatever you need).
- **New Student Profile page** — click "Profile" next to any student on
  the Students page for one complete view: their info, attendance % per
  enrolled course, and every mark they've ever been given, all in one place.
- **New icon** — redesigned to look like a proper app icon (gradient
  background, soft shadow, glossy highlight) instead of the flatter
  version before.
- **Excel-format backup/restore**, alongside the existing JSON version —
  one workbook, one tab per collection, readable directly in Excel/Google
  Sheets. A blank template (headers only, no data) is also downloadable if
  you want to see the exact expected layout before you have real data.
- Fixed several sidebar navigation links (Announcements, Course Content)
  that were pointing nowhere on a few pages even though those pages existed.

## Bulk upload templates

Two places support "fill in a spreadsheet, upload it back" instead of
clicking through every student one at a time:

- **Attendance** (`attendance.html`, Mark Attendance tab): pick a course
  and a month, download a template with one column per day, fill in P/A/L/
  Lt/E for each student/day, upload it back.
- **Any grade item** (Assignments, Presentations, Quizzes, Tasks, Internal
  Exams): open the **Marks** grid for any item, click **Download Template**
  for a Roll Number/Name/Marks/Remarks spreadsheet pre-filled with that
  item's roster, fill in the Marks and Remarks columns, then **Upload
  Filled Marks**. (For Presentations specifically, this only covers Marks
  and Remarks — Topic and Status still need to be set in the grid itself.)



## 1. Create your Firebase project

1. Go to https://console.firebase.google.com → **Add project** (free, no
   card required).
2. Project settings (gear icon) → **General** → scroll to "Your apps" →
   click the **Web** icon (`</>`) → register an app (nickname anything).
3. Copy the `firebaseConfig` object it shows you.
4. Paste those values into `js/firebase-keys.js` (replace the
   `PASTE_YOUR_...` placeholders). This is the only file you'll ever need
   to edit — every other file, including `js/firebase-config.js`, stays
   exactly as delivered.

## 2. Enable Authentication

Firebase Console → **Authentication** → Sign-in method → enable
**Email/Password**.

## 3. Create Firestore Database

Firebase Console → **Firestore Database** → Create database → start in
**Production mode** (not test mode — the security rules below take over).

## 4. Publish the security rules

Firebase Console → Firestore Database → **Rules** tab → paste the entire
contents of `docs/firestore.rules` → **Publish**.

**Note:** this app deliberately does not use Firebase Storage. Since
February 2026, Google requires a linked credit card (the Blaze plan) to
use Storage at all, even for $0 actual usage — so Course Content and the
Ebook Library instead work with Google Drive share links (see the section
below), keeping the whole system genuinely free with no card, ever.

## 5. Create your own admin (lecturer) login

1. Firebase Console → **Authentication** → Users → **Add user** →
   enter your real email + a password.
2. Copy the **User UID** shown for that new user.
3. Firestore Database → **Start collection** → collection ID: `admins` →
   Document ID: paste the UID you copied → add fields:
   - `name` (string) → your display name, e.g. `Dr. Sanaullah`
   - `email` (string) → the same email you signed up with

That's it — you can now log in as administrator from `index.html`.

## 6. Create a test student login

1. Authentication → Add user → email can be anything
   (e.g. `bsf21014@students.lms-kust.local` — matches the pattern the app
   generates automatically from a roll number) + a password.
2. Copy that user's UID.
3. Firestore → `students` collection → new document, **Document ID =
   the roll number** (e.g. `BSF-21-014`, case doesn't matter) → fields:
   - `authUid` → the UID you copied
   - `name`, `program`, `semester`, `section`, `status` → whatever test values

Log in on the Student tab with that roll number + the password you set.

## 7. Run it locally / deploy to GitHub Pages

- **Locally:** just open `index.html` in a browser (Firebase's SDKs work
  over `file://`, though for testing service-worker/PWA install behavior
  later you'll want a local server — `python3 -m http.server` is enough).
- **GitHub Pages:** push this whole folder to a repo, then Settings →
  Pages → Deploy from branch → `main` → `/ (root)`. Same pipeline you
  already used for the expense tracker.

## What's new in Phase 2

### Courses (`courses.html`)
Add/edit/delete courses — code, title, credit hours, semester, section,
teacher, reference books, outline. Course code is the document ID, so it
can't be silently renamed after creation (delete and recreate if you need
to change a code).

### Students (`students.html`)
Full CRUD, live search, and:
- **Excel export** — downloads an `.xlsx` with every student field,
  including their enrolled course codes.
- **Excel import** — upload an `.xlsx`/`.xls` with a header row using any
  of: `Roll Number`, `Name`, `Father's Name`, `Email`, `Phone`, `Program`,
  `Semester`, `Section`, `Session`, `Status`, `Notes`, `Courses` (comma-
  separated codes), and optionally `Password`. Rows without a Roll Number
  are skipped; existing roll numbers are skipped (not overwritten) so
  re-importing the same file twice is safe. If no `Password` column is
  given, a default password is generated from the roll number — tell
  students their initial password so they can log in (a self-service
  "change password" screen isn't built yet).
- When you **add** a student, the app also creates their login (Firebase
  Auth account) automatically using a roll-number-derived email behind the
  scenes — you never see or manage that email directly.
- **Known free-tier limitation:** deleting a student removes their record
  and dashboard access immediately, but the browser-only Firebase SDK can't
  delete someone else's Auth account (that needs a paid Cloud Function).
  The orphaned login becomes permanently unusable since its linked student
  record is gone — harmless, and it doesn't consume meaningful quota.

### Attendance (`attendance.html`)
- **Mark Attendance tab:** pick a course + date, and the roster (any
  student whose `Courses` field includes that course code) appears with
  Present/Absent/Leave/Late/Excused buttons per student. Save writes/
  updates one record per student for that exact course+date — re-marking
  the same day overwrites rather than duplicating.
- **Report & Warnings tab:** pick a course (or "All courses") and run the
  report to see each student's attendance percentage, sorted lowest first,
  with anything under 75% flagged as a warning. The same 75% calculation
  feeds the "Attendance Warnings" stat card on the main dashboard.
- A student only ever needs to add a course code to their profile once
  (Students page) to start appearing on that course's attendance roster.

## What's new in Phase 3

All four new pages share one underlying model: a `gradeItems` definition
(what/when/how much) plus per-student `gradeMarks` (who got what). This
means Assignments, Presentations, Quizzes, Tasks, and Internal Exams all
work the same way once you've used one of them.

### Assignments (`assignments.html`)
Define an assignment (title, course, due date, total marks, description,
instructions, an optional attachment link) assigned to the entire class or
selected students, then click **Marks** on any assignment to open a roster
grid and enter marks + remarks per student.

### Presentations (`presentations.html`)
Schedule a "round" (e.g. "Presentation Round 1") with a date and total
marks, choose presenters, then open **Topics & Marks** to assign each
student's individual topic, mark their status (scheduled/completed/
no-show), and record marks + remarks once they've presented.

### Quizzes & Tasks (`quizzes-tasks.html`)
Two tabs on one page. **Quizzes** work like assignments (title, course,
date, total marks, roster marks entry). **Classroom Tasks** are similar but
total marks are optional — leave it blank for a task that's just tracked,
not graded; fill it in if you want it to feed into the gradebook.

### Marks & Gradebook (`marks.html`)
- **Internal Exams tab:** define Midterm / Sessional / Final Internal exams
  per course and enter marks the same roster-grid way.
- **Gradebook tab:** pick a course, set the weightage (Attendance / Quiz /
  Assignment / Presentation / Task / Internal Exams — must total 100, saved
  per-course), then **Run Gradebook**. It pulls live attendance %, and
  average % from every quiz/assignment/presentation/task/exam recorded for
  that course, applies your weights, adds any manual **Bonus**/**Negative**
  marks you type directly into the table (saved automatically on change),
  and shows a final weighted percentage + letter grade per student. **Export
  Excel** downloads the exact table you're looking at.
- The letter-grade scale (A/A-/B+/B/B-/C+/C/C-/D/F) is a common HEC-style
  cutoff set — easy to adjust in `js/gradebook-common.js` (`letterGrade()`)
  if KUST uses a different scale.

## What's new in Phase 4

### Announcements (`announcements.html` / student: `student-announcements.html`)
Post a title + message to **all students** or to one specific course.
Students see the 5 most recent on their dashboard, and the full list on
their own Announcements page — filtered to "all" plus whatever courses
they're enrolled in.

### Course Content (`course-content.html` / student: `student-course-content.html`)
Two tabs, both working the same way: **upload your file to Google Drive
first, share it as "Anyone with the link," then paste that link into the
app** along with a display name/category (or title/author/subject for
ebooks). This app deliberately avoids Firebase Storage — since February
2026 Google requires a linked credit card to use it at all, even for $0
actual usage — so Drive links keep the whole system free with no card.
- **Lecture Notes & Files:** tag each link with a course + category
  (Lecture Notes / Course Outline / Reference Material / Other). Students
  see only files for courses they're enrolled in.
- **Ebook Library:** title/author/subject + link. Visible to every
  signed-in student (not course-scoped, since your ebook collection spans
  subjects rather than specific course sections).

Deleting a file from the app only removes it from this list — the actual
file stays completely safe in your Google Drive.

## What's new in Phase 5

### Reports (`reports.html`)
Six one-click reports, each downloading a standalone `.xlsx`:
- **Student Report** — full roster with all profile fields
- **Course Report** — every course with credit hours, teacher, reference books
- **Attendance Report** — per-student present/absent/leave/late/excused
  counts + percentage, filterable by course, warnings flagged
- **Marks & Gradebook Report** — the same weighted computation as the
  Gradebook tab, exported per-course
- **Assignment Report** — a Summary sheet (per assignment: graded vs.
  assigned) plus a Detail sheet (every student's marks on every assignment)
- **Presentation Report** — every student's topic, status, marks, and
  remarks across all presentation rounds

### Backup & Restore (`backup.html`)
- **Download Backup** — one click exports every collection (students,
  courses, attendance, assignments/presentations/quizzes/tasks/exams and
  their marks, gradebook adjustments, announcements, course content and
  ebook metadata) into a single dated `.json` file.
- **Restore** — upload a backup file and it's merged back in: matching
  records (by roll number / course code / etc.) are overwritten, everything
  else is left untouched. Nothing is deleted by a restore.
- Lecturer login accounts (`admins` collection) are intentionally excluded
  from backups — those are set up manually per the README and don't need
  to travel with your data.
- **Note:** backups capture data records including the Google Drive links
  you've added — the actual files live safely in your own Google Drive and
  are unaffected either way.
- **Reset All Data (Danger Zone):** a third section on this page lets you
  wipe every collection at once — useful for clearing out test data before
  real classroom use, without manually deleting each Firestore collection
  by hand. It requires typing `DELETE ALL DATA` to confirm, and never
  touches your own admin login. Student login accounts aren't deleted by
  this either (same browser-only limitation as deleting individual
  students) — they just become unused. **Always download a backup first**
  unless you're certain you want to lose the data permanently.

## Deploying as an Android APK

See `docs/APK_GUIDE.md` for the full free pipeline (GitHub Pages →
PWABuilder → sideload) — the same process you used for the expense tracker.

## Before real classroom use

Work through `docs/TESTING_CHECKLIST.md`. Two ready-to-import sample files
are included if you want to test the Students/Courses import feature
without using real class data first: `docs/sample-students.xlsx` and
`docs/sample-courses.xlsx` (their course codes match each other, so
importing both together demonstrates enrollment-linked attendance/grading
correctly).

## License

MIT — see `LICENSE.md`. Every third-party library used (Firebase, SheetJS,
Google Fonts) is free/open-source and loaded via CDN, nothing paid or
bundled.

## Everything is now built

Auth (admin + student), Students, Courses, Attendance with warnings, the
full Gradebook (Assignments, Presentations, Quizzes, Tasks, Internal Exams,
weighted totals + letter grades), Announcements, Course Content + Ebook
Library, Reports, and Backup/Restore — all running on Firebase's free
Spark plan with no Cloud Functions anywhere.

If you want to keep going from here, natural next additions would be: a
password-reset flow for students, in-app file preview instead of
opening a new tab, and the email-warning feature from the original spec
(that one needs a transactional email service like EmailJS's free tier,
since Firebase Auth's built-in emails only cover its own account-management
flows) — happy to build any of those whenever you're ready.

## Files in this folder

```
lms/
├── index.html                   Login (admin/student toggle)
├── admin-dashboard.html          Lecturer dashboard shell
├── student-dashboard.html        Student read-only dashboard shell
├── students.html                 Student management (CRUD + Excel import/export + passwords)
├── student-profile.html           Complete one-page view of a single student (admin)
├── courses.html                   Course management (CRUD + Excel import/export)
├── attendance.html                Mark attendance + bulk monthly upload + % report with warnings
├── assignments.html               Assignments (CRUD + marks entry + bulk upload)
├── presentations.html             Presentation rounds (topics + marks + bulk upload)
├── quizzes-tasks.html             Quizzes + classroom tasks (tabbed + bulk upload)
├── marks.html                     Internal exams + computed Gradebook + bulk upload
├── announcements.html             Post announcements (admin)
├── student-announcements.html     Read announcements (student)
├── course-content.html            Add course files + ebooks via Google Drive links (admin)
├── student-course-content.html    Browse course files + ebooks (student)
├── student-attendance.html        My attendance — per-course % + day-by-day log (student)
├── student-marks.html             My marks across every grade item (student)
├── student-assignments.html       My assignments + own grades (student)
├── student-presentations.html     My presentation rounds — topic/status/marks (student)
├── reports.html                   Seven one-click Excel reports, including the Daily Attendance Log
├── backup.html                    Full backup download (JSON + Excel) + restore + blank template + Reset All Data
├── LICENSE.md                    MIT license + third-party notices
├── manifest.json                 PWA manifest (for the APK pipeline later)
├── icons/                        App icons (192px, 512px)
├── css/style.css                 Full design system
├── js/firebase-keys.js            ← put your Firebase keys here (ONLY file you edit)
├── js/firebase-config.js         Logic only — never needs editing
├── js/auth.js                    Login + route-guard logic + secondary-app helper
├── js/gradebook-common.js        Shared helpers for Phase 3+ pages + bulk marks upload
├── js/admin-dashboard.js
├── js/student-dashboard.js
├── js/student-attendance.js
├── js/student-marks.js
├── js/student-assignments.js
├── js/student-presentations.js
├── js/students.js
├── js/student-profile.js
├── js/courses.js
├── js/attendance.js
├── js/assignments.js
├── js/presentations.js
├── js/quizzes-tasks.js
├── js/marks.js
├── js/announcements.js
├── js/course-content.js
├── js/reports.js
├── js/backup.js
├── js/mobile-nav.js
└── docs/
    ├── firestore.rules           Paste into Firebase Console → Firestore → Rules (RE-PASTE after this update!)
    ├── SCHEMA.md                 Data model reference
    ├── APK_GUIDE.md               PWABuilder → Android APK walkthrough
    ├── TESTING_CHECKLIST.md      Full pre-launch checklist
    ├── sample-students.xlsx      Ready-to-import test data (includes Password column)
    └── sample-courses.xlsx       Ready-to-import test data
```

## Known limitations (by design, given the free/no-server constraint)

- **Deleted student logins can't be auto-removed.** The free client SDK
  can't delete another user's Firebase Auth account — only that user or a
  paid server-side Admin SDK can. Deleting a student removes their data and
  access, but their login technically still exists, unused, in Firebase
  Authentication. If you ever reuse that same roll number later, you'll
  need to manually delete the old login first (Firebase Console →
  Authentication → Users → find it → delete), otherwise re-adding that
  roll number will tell you the login already exists.
- **Passwords are stored in plain text in Firestore**, visible only to you
  (the admin) and to that one student's own account — nobody else can read
  them, and Firestore itself is encrypted at rest. This is a deliberate
  trade-off for a personal single-lecturer tool with no paid backend: it's
  what makes "show me the password" and "change a student's password"
  possible at all without a server. If this ever needs to meet a stricter
  security bar, that would require a paid backend (Cloud Functions) to hash
  and manage passwords properly instead.
- **Presentation bulk-upload only covers Marks and Remarks** — Topic and
  Status (scheduled/completed/no-show) still need to be set per-student
  in the in-app grid, since those aren't part of the standard bulk format.

## Ideas for later (all still free)

Things worth considering if you keep using this and want more:

- **Dark mode toggle** — a light lift given the CSS is already
  variable-based.
- **CSV export alongside Excel** — trivial to add, useful for anyone who
  wants to open exports in tools other than Excel/Sheets.
- **Attendance reminders** — a "haven't marked attendance today" banner on
  the dashboard if it's a weekday and nothing's been marked yet for any
  course.
- **Email notifications** — the original spec mentioned emailing
  attendance warnings; a free service like EmailJS's free tier could add
  this without needing a paid backend, at the cost of a monthly send limit.
- **Bulk internal-exam upload** — the same template pattern already used
  for assignments/quizzes/etc. would work for internal exams too (it
  actually already does, since Internal Exams shares the same Marks
  modal as the others).
