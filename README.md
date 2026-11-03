# Sanaullah's Classroom — Version 4

**The complete step-by-step guide is in `docs/USER_GUIDE.md`, and inside the app under Help & Guide.** It covers setup, updates, every page and setting, and troubleshooting.

## ⬆️ Upgrading from version 3 (5 minutes, no data changes)

1. **Back up.** Backup → Download Backup (.json), and save it to Google Drive.
2. **Upload everything** in this folder to your GitHub repository, replacing the old files (including the new `js/vendor/` folder and `history.html`). `js/firebase-keys.js` already has your keys.
3. **Publish the new rules.** Firebase Console → Firestore → Rules → paste `docs/firestore.rules` → **Publish**. This is required: PDF upload, leave requests and Change History are blocked until you do.
4. **Reload.** Wait 2 minutes, then press Ctrl+F5. On phones, close and reopen the app.

Nothing is converted or deleted. Coming from version 2? Follow these same four steps; the v3 notes below are included.

## What's new in version 4

- **Upload PDFs directly** (Course Content and Ebook Library): pick or drag a file, up to 10 MB each. Students open it in a built-in reader that works on phones and in the Android app, with zoom and download. Still free: files are kept inside your free database, and a meter shows how much of the free space is used (about 900 MB for files). Google Drive links still work, and now open in the same reader.
- **Course plan from your own file:** upload your plan as **Excel, PDF or Word** in whatever layout you already use, or paste a list. The app finds weeks, dates and topics, shows them in an editable preview, adds mid-term and final rows if missing, and makes a tick-list checklist. Re-uploading keeps the ticks of topics you already covered.
- **QR check-in:** the Live Check-in screen now shows a QR code. Students scan it with their phone camera and are checked in automatically after signing in.
- **Online leave requests:** students request leave from My Attendance; you approve or reject on Attendance → Leave Requests. Approving turns their Absent marks in those dates into Leave, and pre-sets Leave on the marking screen.
- **Add to Calendar:** download every class date, exam and deadline as a calendar file for Google Calendar or your phone (students have the same button on Course Progress).
- **Change History:** every change to marks, attendance, settings, students, plans and files is recorded with before → after values.
- **Backup with files:** the .json backup can include uploaded PDFs, so a restore brings them back too.

## Version 3 features

- **Online quizzes:** MCQ, multiple-correct, true/false and short-answer questions, typed in or imported from Excel. Each quiz has a timer, an optional opening window, shuffling and negative marking. Answers autosave, the app auto-marks into the gradebook, and you can publish results with the correct answers.
- **Live class check-in**, **online assignment submission**, **your own attendance options**, **your own lists**, **quiz defaults** and an **in-app Help & Guide**.

---

# Version 2 notes (already applied)

A free, personal classroom manager for Dr. Sanaullah, built on Firebase's free **Spark** plan and GitHub Pages. No credit card, no paid services, no Cloud Functions.

---

## ⬆️ Upgrading from version 1 (do this once, ~10 minutes)

Your data, Firebase project, logins and APK all stay the same.

1. **Keep your keys.** `js/firebase-keys.js` in this folder already has your keys. If you ever swap projects, that is still the only file you edit.
2. **Upload everything to GitHub.** Upload every file and folder in this `lms` folder to your repository, replacing the old ones. Old files that no longer exist here (like `js/gradebook-common.js`) can stay; nothing uses them.
3. **Publish the new rules.** Go to Firebase Console → Firestore Database → **Rules**. Paste all of `docs/firestore.rules` and click **Publish**. The new pages will not work until you do this.
4. **Run the one-time upgrade.** Sign in as admin. The dashboard shows a red banner "One-time upgrade needed". Click **Upgrade now**, then **Upgrade Attendance Now** in Settings → Maintenance. This converts your old attendance into the new, much lighter format. It's safe to run twice.
5. **Check, then tidy up.** Check a few students' attendance. Then click **Delete Old-Format Records** in the same Maintenance box.
6. **Set your rules.** Open **Settings**. Set your name, department, institution and **active term** (e.g. `Fall 2026`), and review the attendance and grading rules. Then edit each course and fill in its **Term**.
7. **The Android app** needs no rebuild. It loads your live GitHub Pages site, so it shows version 2 as soon as GitHub finishes publishing (1–2 minutes). If a phone still shows the old screens, close and reopen the app once.

---

## What's new in version 2

### Course Plans & coverage (new)
- **Plan your semester.** Pick the start date, your class days (e.g. Mon/Wed/Fri), total weeks, and the Mid-term (week 8) and Final (week 16) weeks. The app builds every session for you.
- **Excel in and out.**
  - Download the plan (or a blank template), fill in topics in Excel, then upload it back.
  - Dates can be `YYYY-MM-DD` or `DD/MM/YYYY`.
  - Re-uploading keeps the ticks on topics you have already covered.
- **Tick topics as you teach them.** Tick them on the plan page, or right inside **Attendance** when you mark a lecture.
- **Meters and graphs.** Each course shows:
  - a coverage ring (% covered) and a bar with an "expected by today" marker;
  - a pace badge ("On track", "3 behind", "2 ahead");
  - a **planned vs. actually covered** graph with the Mid and Final weeks marked.
- **Students see it too.** They get a **Course Progress** page and progress rings on their dashboard.
- **Dashboard "Today" panel.** Shows today's classes from your plans, with a reminder if attendance isn't marked yet.

### Your rules, everywhere (Settings page)
- **Attendance:** decide whether Leave, Excused or Late count as present, half, absent or not counted. Set the warning % and choose proportional or **band** scoring (e.g. ≥90% → full marks).
- **Gradebook:**
  - default weightage, with each course able to override it; set any weight to 0 to not charge that component;
  - per item, a "count this in the gradebook" switch;
  - **rescale or zero** for components with no marks yet, and **ignore or zero** for blank marks after the due date;
  - average-of-% or total-marks aggregation, and **drop lowest N** quizzes or assignments;
  - pass mark, decimals, and an editable **grading scale with grade points**.
- **Student view:** choose whether students can see their running total and grade.

### Reports (rebuilt)
Pick a report, filter by **term, course, student, assessment type and date range**, and preview it on screen. Then **Excel**, **CSV** or **Print / Save as PDF**. Available reports:
- Attendance Summary
- Daily Attendance Log
- Result Sheet (gradebook)
- Marks Detail
- Course Coverage
- At-Risk Students
- **Student Result Card** (with GPA)
- Presentations
- Student List
- Course List

### Faster and lighter (fits the free plan)
- **New attendance storage.** One record per student per course, instead of one per student per day. The dashboard, gradebook and reports now read roughly **50× less** data, so the 50,000-reads/day free limit is no longer a concern.
- **Correct dates.** "Today" uses Pakistan time. The old version used UTC, which showed yesterday's date before 5 AM.

### Works offline
- Pages open without internet, and data you've already viewed is available.
- You can **mark attendance in a classroom with no signal**; it syncs automatically when you reconnect. The sidebar shows Online or Offline.

### Also new
- **WhatsApp buttons.** Ready-to-send messages for attendance warnings and results, using templates you edit in Settings. Free; nothing is sent automatically.
- **Dark mode.** Toggle it at the bottom of the sidebar.
- **Students change their own password** on a new **My Account** page. Your copy stays in sync.
- **Gradebook:**
  - class summary and a grade-distribution chart;
  - "earned / possible" marks;
  - instant bonus/negative edits;
  - preview of unsaved weights;
  - print.
- **Attendance:**
  - All Present / All Absent buttons;
  - "Clear this day" (wrong date or cancelled class);
  - live counts;
  - the monthly template only shows your real class days and comes pre-filled.
- **Marks grids:** live average, highest and lowest; "fill blanks" helper; marks above the total are blocked.
- **Students:** filter by course or status, click course chips to enrol, WhatsApp link.
- **Inactive/graduated students** stay out of new rosters, but their history remains.
- **Courses:**
  - Term field and term filter;
  - enrolment count and plan % in the list;
  - deleting a course can also clean up its records and removes the code from students.
- **Student profile:** attendance, current standing and coverage per course, plus a link to their result card.
- **Backup:** includes plans, settings and new attendance, and remembers when you last backed up (the dashboard reminds you after 14 days). Excel restore keeps leading zeros in phone numbers.
- **Security:**
  - signed-out visitors can no longer list all roll numbers;
  - only https links are allowed for course files.

---

## First-time setup (new Firebase project only)

1. Go to https://console.firebase.google.com → **Add project** (free).
2. Project settings → General → Your apps → **Web** (`</>`) → copy the config into `js/firebase-keys.js`.
3. **Authentication** → Sign-in method → enable **Email/Password**.
4. **Firestore Database** → Create database → **Production mode**.
5. **Rules:** paste `docs/firestore.rules` and click **Publish**.
6. Create your admin login:
   - Authentication → Users → **Add user** → copy the **User UID**.
   - Firestore → start collection `admins`, with document ID = that UID.
   - Add the fields `name` and `email`.
7. Push the folder to GitHub, then Settings → Pages → Deploy from branch `main` / root.

The app deliberately does **not** use Firebase Storage, which now needs a card on file. Uploaded PDFs are stored inside the free Firestore database in 900 KB pieces (up to 10 MB per file, about 900 MB in total); Google Drive or any https link also works.

## Using it day to day

| I want to… | Go to |
|---|---|
| Plan the semester | **Course Plans** → pick course → Create Plan (or Download Excel Template → fill → Upload) |
| Take attendance + tick today's topic | **Attendance** → course + date → mark → tick topic → Save |
| Enter marks | **Assignments / Quizzes & Tasks / Presentations / Exams & Gradebook** → Marks (or Excel template) |
| See final totals & grades | **Exams & Gradebook** → Gradebook tab → Run |
| Change how anything is calculated | **Settings** |
| Print a result card | **Reports** → Student Result Card, or a student's **Profile** → Result Card |
| Warn a student on WhatsApp | Dashboard / Attendance report / Gradebook → green WhatsApp button |

## Files

```
index.html                 Login (admin / student)
admin-dashboard.html       Dashboard: stats, course progress, today, trend, deadlines, warnings
course-plan.html     NEW   Course plans + coverage meter + Excel in/out
attendance.html            Mark (+ topics taught), report & warnings, monthly Excel upload
students.html              Students (CRUD, Excel, passwords, filters)
student-profile.html       One student, everything
courses.html               Courses (term, clean-up delete, Excel)
assignments.html           Assignments       ┐
quizzes-tasks.html         Quizzes & tasks   ├ shared module js/grade-items.js
presentations.html         Presentations     │
marks.html                 Exams + Gradebook ┘
announcements.html         Announcements (+ WhatsApp forward)
course-content.html        Files & ebooks (upload PDFs or add links)
history.html         v4    Change History (who changed what)
reports.html               Report builder (Excel / CSV / PDF)
settings.html        NEW   All rules + one-time upgrade
backup.html                Backup / restore / reset
student-*.html             Student portal (dashboard, course progress NEW, attendance,
                           marks & result, assignments, presentations, content,
                           announcements, my account NEW)
sw.js                NEW   Offline support
js/core.js           NEW   Shared helpers, settings, sidebar, charts, WhatsApp
js/grading.js        NEW   Attendance storage, gradebook engine, course-plan logic
js/theme.js          NEW   Light/dark mode
js/files.js          v4    PDF upload in pieces + in-app PDF reader
js/plan-import.js    v4    Course plan from Excel / PDF / Word / pasted text
js/qr.js             v4    QR code maker (check-in)
js/vendor/           v4    pdf.js and JSZip (open source, bundled — no internet needed)
docs/firestore.rules       Security rules (publish after every upgrade)
docs/SCHEMA.md             Data model
docs/TESTING_CHECKLIST.md  What to check after upgrading
```

## Known limits (free plan)
- Deleting a student can't delete their Firebase login from the browser; it simply becomes unused.
- Student passwords are stored so you can view and reset them. Only you and that student can read them. Treat backups and exports as private.
- WhatsApp messages open ready to send; they are not sent automatically. Automatic sending would need a paid service.

## License
MIT — see `LICENSE.md`. Libraries: Firebase JS SDK, SheetJS, pdf.js (Apache 2.0); JSZip (MIT); Google Fonts (OFL).
