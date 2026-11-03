# Sanaullah's Classroom — Complete User Guide

Version 3 · October 2026. This guide covers installing, updating, daily use, every setting, and fixing problems. The same guide is inside the app under **Help & Guide**.

## 1. What the app is and where it lives

Sanaullah's Classroom is a free web app for one lecturer and their students. It runs entirely on free services: no server, no monthly fee, no credit card.

There are two portals behind one sign-in page:

- **Admin console** (the lecturer). Plan courses, take attendance, run quizzes, enter marks, run the gradebook, print reports, change every rule.
- **Student portal.** Each student signs in with roll number + password and sees only their own attendance, marks, quizzes, deadlines, course progress, files and announcements.

The app is made of six separate pieces. Knowing where each one is lets you fix almost any problem.

| Piece | What it is | Where it is | Who controls it |
| --- | --- | --- | --- |
| Code | The app's files (pages, styles, scripts) | A GitHub repository under the account `sanaullahfin-boop` | You, by uploading files on github.com |
| Website | The live app people open | GitHub Pages: `https://sanaullahfin-boop.github.io/<your-repo-name>/` | Built automatically from the repository |
| Data | Students, courses, attendance, marks, plans, quizzes, settings | Firebase project `lecturer-system-2d6d9` → Firestore Database | You, at console.firebase.google.com |
| Logins | Your admin login and every student's login | Same Firebase project → Authentication | You, in the Firebase Console |
| Files and ebooks | Lecture notes, slides, PDFs, student submissions | Google Drive (the app stores only the share links) | You and your students |
| Phone app | The Android app icon (APK) | Installed on phones; it opens the live website | You hold `signing.keystore` and its password, which must stay private |

The file `js/firebase-keys.js` connects the code to the Firebase project. It is the only file you ever edit by hand.

The Firebase web keys in that file are not secret. They only identify the project; the security rules (`docs/firestore.rules`) decide who can read or change data.

## 2. First-time installation (from scratch)

Follow this only for a brand-new copy, for example when handing the app to another lecturer. It takes about 30 minutes and needs a free Google account and a free GitHub account. Your existing app is already installed; to update it, go to section 3.

### A. Create the Firebase project (database and logins)

1. Open [console.firebase.google.com](https://console.firebase.google.com) and sign in with a Google account.
2. Click **Add project** and give it a name (e.g. `lecturer-system`). Turn Google Analytics off and click **Create project**. No card is asked for; stay on the free **Spark** plan.
3. Click the gear icon → **Project settings** → **General**. Scroll to **Your apps** and click the **Web** icon `</>`. Type any nickname, leave Hosting unticked, and click **Register app**.
4. Firebase shows a block called `firebaseConfig`. Keep this page open; you need five of its values in step C.
5. Open **Build → Authentication** → **Get started** → **Sign-in method** → **Email/Password** → **Enable** → **Save**.
6. Open **Build → Firestore Database** → **Create database**. Choose a location close to you (e.g. `asia-south1`, Mumbai), then **Start in production mode** → **Create**. The location cannot be changed later.
7. In Firestore open the **Rules** tab. Delete everything there, paste the whole of `docs/firestore.rules` from the app folder, and click **Publish**.

### B. Create your admin login

1. In **Authentication → Users** click **Add user**. Enter your real email and a strong password.
2. Copy the long **User UID** shown in the new row.
3. In **Firestore Database → Data** click **Start collection**. Collection ID: `admins`. Document ID: paste the UID.
4. Add two fields, both of type *string*: `name` = your display name (e.g. `Dr. Sanaullah`) and `email` = the same email. Click **Save**.

### C. Put your keys into the app

1. Unzip the app folder on your computer.
2. Open `js/firebase-keys.js` in Notepad.
3. Replace each value inside the quotes with the matching value from step A4: `apiKey`, `authDomain`, `projectId`, `messagingSenderId`, `appId`. Keep the quotes and commas, then save.

### D. Put the app online with GitHub Pages

1. Sign in at [github.com](https://github.com) → **New repository**. Name it (e.g. `classroom`) and choose **Public**; GitHub Pages is free only for public repositories. Click **Create repository**.
2. Click **uploading an existing file**. Drag in **everything inside** the app folder: all `.html` files, `manifest.json`, `sw.js`, and the `css`, `js`, `icons`, `docs` folders. Click **Commit changes**. Upload the folder contents, not a zip file.
3. Open **Settings → Pages**. Under **Build and deployment** choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
4. After one to two minutes the page shows your address, e.g. `https://yourname.github.io/classroom/`. Open it; you should see the sign-in page.
5. Sign in on the **Administrator** tab with the email and password from step B.

### E. First things to do inside the app

1. **Settings.** Enter your name, department, institution and the active term (e.g. `Fall 2026`). Review the attendance options and grading rules, then click **Save Settings**.
2. **Courses → + Add Course**, or **Import Excel** using `docs/sample-courses.xlsx` as the layout. Fill in the Term for every course.
3. **Students → + Add Student**, or **Import Excel** using `docs/sample-students.xlsx`. Put each student's course codes in *Enrolled Courses*. The app creates their login automatically and shows the password.
4. **Course Plans:** create a plan for each course.
5. Give each student the website address, their roll number and their password.

## 3. Updating to a new version without losing data

Updating replaces only the code on GitHub. Your data lives in Firebase and is never touched by uploading files, so students, attendance and marks stay exactly as they are.

1. **Back up first.** In the app open **Backup**, click **Download Backup (.json)** and **Download Backup (Excel)**, and save both to Google Drive. This is your safety net if anything goes wrong.
2. **Keep your key file.** New versions come with your `js/firebase-keys.js` already inside. If a new zip ever has an empty key file, copy your old one over it before uploading.
3. **Upload the new files.** On github.com open your repository → **Add file → Upload files**. Drag in everything from the new folder and click **Commit changes**. Files with the same name are replaced; old extra files can stay.
4. **Publish the rules.** Firebase Console → Firestore Database → **Rules** → paste the new `docs/firestore.rules` → **Publish**. Do this every update, even if you think the rules did not change. Skipping it is the most common cause of "Missing or insufficient permissions".
5. **Wait two minutes.** Open the website and press **Ctrl+F5**; on a phone, close and reopen the app. This makes the browser fetch the new version.
6. **Follow the version's notes.** If the dashboard shows a banner such as "One-time upgrade needed", click it and follow the steps. These upgrades only add or convert data. Nothing is deleted until you press a separate, clearly-labelled delete button.

### Version history

| Version | Date | Main changes | One-time step |
| --- | --- | --- | --- |
| 4 | Nov 2026 | PDF upload + in-app reader, course plan from Excel/PDF/Word, QR check-in, leave requests, calendar export, Change History | Publish new rules (no data changes) |
| 3 | Oct 2026 | Online quizzes, live check-in, online assignment submission, your own attendance options, editable lists, in-app Help | Publish new rules (no data changes) |
| 2 | Oct 2026 | Course plans, Settings rules, report builder, offline mode, WhatsApp, dark mode | Upgrade attendance (Settings → Maintenance) |
| 1 | 2026 | Students, courses, attendance, gradebook, reports, backup | First setup |

### Handing the app to someone else

- **Same data, new person running it** (e.g. a colleague takes over):
    1. Firebase Console → **Project settings → Users and permissions** → **Add member**, with their Google email as *Owner*.
    2. GitHub → repository **Settings → Collaborators** → add them.
    3. Create their admin login (section 2, step B).
- **A fresh copy for another lecturer with their own students:** give them the app zip and this guide. They follow section 2 with their own Firebase and GitHub accounts. Remove `signing.keystore` and your key values from the copy you hand over; they create their own.

## 4. Installing on phones

The app works in any phone browser, but an icon on the home screen is quicker. There are two free ways.

**Option 1: Add to Home Screen (anyone, 30 seconds).** Best for students.

1. Open the website address in **Chrome** on Android, or **Safari** on iPhone.
2. Android: tap **⋮ → Add to Home screen → Install**. iPhone: tap **Share → Add to Home Screen**.
3. The app now opens full-screen from its icon. Pages you have already opened also work offline.

**Option 2: Your Android APK (already built).** Your file `Sanaullah_s_Classroom.apk` was made with PWABuilder.

1. Send the APK to the phone (WhatsApp to yourself, Google Drive, or USB).
2. Tap it. The first time, Android asks to allow installs from this source; allow it.
3. The APK simply opens your live website, so every update you upload appears in it automatically. You only rebuild an APK to change its name or icon.
4. To rebuild, open [pwabuilder.com](https://www.pwabuilder.com), paste your website address, then **Package for stores → Android**. Under signing choose **Use mine** and upload your existing `signing.keystore` with the alias and passwords from `signing-key-info.txt`. Using the same key lets the new APK install over the old one.

Keep `signing.keystore` and `signing-key-info.txt` somewhere private, such as your own Google Drive. Never upload them to the public GitHub repository.

## 5. Daily use: every admin page

The left menu groups pages by job. Every page shows today's date, and the bottom of the menu shows **Online/Offline** and the light/dark switch.

### Dashboard

Your one-screen summary for the active term.

- **Banners** at the top tell you what needs attention: attendance not yet marked today, backup older than 14 days, the active term.
- **Stat cards:** active students, courses this term, present/absent today, attendance warnings, average course covered.
- **Course Progress:** a ring per course showing how much of the course plan is taught. The thin line on the bar shows where the plan expects you to be today. Click a card to open that plan.
- **Today:** classes planned for today, with a **Mark attendance** button for each.
- **Attendance Trend:** the class attendance % for the last 30 class days, with your warning line.
- **Upcoming Deadlines, students below the threshold** (with WhatsApp buttons), and **Recent Announcements**.

### Course Plans

Plan every lecture of the semester, then tick topics as you teach them.

1. Choose a course. If it has no plan, enter the **semester start date**, **total weeks** (16), **mid-term week** (8), **final week** (16) and your **class days** (e.g. Mon, Wed, Fri).
2. Then do one of these:
    - **Upload my plan (Excel / PDF / Word)** — use the file you already have, in any layout (see *Making a checklist from your own file* below);
    - **Paste a list** — copy topics from anywhere, one per line, with "Week 1", "Week 2" lines between weeks if you like;
    - **Create empty plan** and type topics in the app (click **Edit** on a session), or
    - **Download Excel Template**, fill the **Topic** column, and upload it.
3. After each lecture, click the **✓ box** beside the topic. You can also tick it on the Attendance page while marking.

**Making a checklist from your own file**

The app reads these layouts (and mixtures of them):

| Your file looks like | Example |
| --- | --- |
| One row per lecture | Week · Date · Topic · Reading |
| One row per week, a column per lecture | Week · Lecture 1 · Lecture 2 · Lecture 3 (or Monday · Wednesday) |
| One row per week, several topics in one cell | Each topic on its own line, or separated by ; |
| Plain text / PDF with headings | "Week 1" then the topics under it |
| Just a list of topics | The app spreads them over your class days, skipping exam weeks |

1. Click **Upload My Plan** (or **Paste a List**) and choose the file: .xlsx, .xls, .csv, .pdf, .docx or .txt.
2. A preview opens with every row it found: week, date, type (lecture, revision, mid-term…), topic and details. Title rows, headings and page numbers are skipped.
3. Check it. You can change any cell, delete a row (✕), or **+ Add a row**. If dates were not in your file, they are filled from the start date and class days; change those and click **Re-arrange dates**. Tick *Put each line of a cell as its own item* if a cell holds several topics. Mid-term/Final rows are added if your file has none.
4. Choose **Replace the current plan** (ticks on topics with the same name are kept) or **Add to the end**, then click **Create checklist**.

Scanned PDFs (photos of paper) have no text to read: use Word/Excel, or type the topics with **Paste a List**. Old .doc files: open in Word and *Save As* .docx first.

**Add to Calendar** downloads every class date, exam and deadline as a `.ics` file. On a phone, open it to add the dates to your calendar; on a computer, Google Calendar → ⚙ Settings → **Import & export** → Import.

The page shows a coverage ring, a "planned vs covered" graph, and a pace badge (*On track*, *2 behind*, *1 ahead*). Filters show *Not yet covered*, *Covered* or *This week*. **Plan Settings** changes dates and class days; tick *Re-calculate dates* to move every session (topics and ticks are kept). **Print** gives a clean printout of the plan.

### Attendance

**Mark Attendance tab**

1. Pick the course and date. Everyone starts on your default option (usually Present).
2. Click a student's option to change it, or use **All Present** / **All Absent**.
3. Tick the topics taught in this lecture (top panel); this updates the course coverage.
4. Click **Save Attendance**. A second Save button is at the bottom for long classes on phones.

**Clear This Day** removes that date's attendance, for a cancelled class or a wrong date. Without internet, saving still works and syncs later.

**Live Check-in** lets students mark themselves present:

1. Open the class for **today** and click **Live Check-in**.
2. Choose how long the code lasts (2–10 minutes) and click **Show Code**. A **QR code** and a 6-digit code appear; show them on the projector.
3. Students **scan the QR code with their phone camera** (it opens the app and checks them in — after signing in if needed), or open their dashboard → **Class Check-in**, pick the course, and type the code. The counter rises as they check in.
4. Click **Apply to Attendance**. Checked-in students get your default option and everyone else is marked absent. Adjust anyone (e.g. Late or Leave), then click **Save Attendance**.

The code expires quickly, so only students in the room can use it. **New Code** makes a fresh one, and **Stop** ends it early. Reopening Live Check-in during the same class continues where you left off.

**Report & Warnings tab:** choose a course (or all) and a date range, then **Run Report**. Students below your threshold are flagged and get a WhatsApp button. **Export Excel** downloads the table.

**Leave Requests tab:** students ask for leave from *My Attendance* (dates, course or all courses, reason). The tab shows a count of requests waiting. Type an optional note to the student, then **Approve** or **Reject**. Approving changes any *Absent* marks already saved in those dates to *Leave*, and when you later mark attendance on those dates the student is already set to Leave (shown with an "Approved leave" tag). **Undo** moves a request back to waiting; marks already changed stay as they are. The dashboard shows a banner when requests are waiting.

**Monthly Excel Upload tab:** pick a course and month, then **Download Template**. It has one column per class day, taken from your course plan, with existing marks filled in. Type your codes (P, A, L…), save, and **Upload Filled Template**. Blank cells are ignored.

### Students

- **+ Add Student** creates the student and their login together. Click **Generate** for a password and note it down; you can always see it later with **Show**.
- **Edit** changes details or the password. **Profile** shows everything about one student, including a result card link.
- **Enrolled Courses:** click course chips or type codes separated by commas. A student appears on a course's roster only when its code is here.
- **Status:** *Inactive* or *Graduated* students disappear from new rosters but keep their history.
- **Import / Export Excel:** use `docs/sample-students.xlsx` as the layout. Existing roll numbers are skipped, never overwritten.
- **Filters:** search box, course, and status.

### Courses

- **+ Add Course:** code (cannot be changed later), term, subject, class, credit hours, semester, section, teacher, reference books.
- The list shows how many students are enrolled and how much of the plan is covered.
- **Delete** offers to clean up the course's attendance, marks, quizzes, plan and files. Back up first if you might need them.

### Assignments, Quizzes & Tasks, Presentations, Internal Exams

All four work the same way:

1. **+ New…** → title, course, date, total marks, assign to the whole class or selected students. Untick **Count this in the gradebook** for practice work.
2. Click **Marks** to enter marks and remarks. You can also **Download Template** → fill in Excel → **Upload Filled Marks**. Live average/highest/lowest are shown; marks above the total are blocked.

Extra options:

- **Assignments:** description, instructions, an attachment link, and **Students submit their work online**. With that ticked, students paste a Google Drive link before the due date. The Marks grid shows each submission with an **On time** or **Late** label.
- **Presentations:** each student gets a topic and a status (from your list in Settings).
- **Tasks:** marks are optional.
- **Internal Exams** (on the Exams & Gradebook page): the exam name comes from your list in Settings.

### Online Quizzes

See section 7.

### Exams & Gradebook

1. Choose a course and click **Run Gradebook**. Optionally limit it to a date range, e.g. only up to the midterm.
2. Check the **weightage**. It must total 100; set any component to 0 to not charge it. **Save for this Course** keeps a course-specific weightage; **Reset to Default** goes back to Settings.
3. The table shows each component %, *earned / possible* marks so far, total %, grade and grade points. **Bonus** and **Neg.** are extra percentage points you type directly into the table.
4. A summary card shows class average, highest, lowest and passing count, plus a grade distribution chart.
5. Use **Export Excel**, **Print**, or the green **Send** button to WhatsApp a student their result.

### Announcements

Post a title and message to everyone or to one course. Students see it on their dashboard. Tick *Also open WhatsApp* to forward it to your class group in one tap.

### Course Content

Add lecture notes, slides, past papers or videos in one of two ways (switch with **Upload a file / Add a link**):

**Upload a file (PDF, Word, PowerPoint, images — up to 10 MB each)**

1. Choose the course and category.
2. Click the box (or drag the file onto it) and pick the file. The name students see is filled in; change it if you like.
3. Click **Upload**. A bar shows progress.

Students open PDFs inside the app in a reader with zoom (+/−) and **Download**; it works on phones and in the Android app. Other file types download to open in their own app. The line under the box shows how much free file space is used (about 900 MB in total). If a PDF is bigger than 10 MB, compress it for free (ilovepdf.com → Compress PDF) or use a link.

**Add a link** (Google Drive, YouTube or any https link)

1. Upload the file to Google Drive → **Share → Anyone with the link → Copy link**.
2. Paste it with a name and category, and click **Add Link**.

Google Drive files open inside the app too. Students see only files for their courses. The **Ebook Library** tab is shared with all students and also accepts a PDF file or a link. **Remove** deletes an uploaded file from the app (keep your own copy); for a link, the file in your Drive stays safe.

### Reports

1. Pick a report card.
2. Set the filters: term, course, student, assessment type, dates.
3. Click **Generate Report**.
4. Download **Excel** or **CSV**, or **Print / Save PDF**.

| Report | Use it for |
| --- | --- |
| Attendance Summary | Counts per option and % per student per course |
| Daily Attendance Log | A students × dates grid with codes, colour-coded |
| Result Sheet | Final weighted result, grades, GP, pass/fail for one course |
| Marks Detail | Every assessment mark, one column per item |
| Course Coverage | Plan progress for every course, or session-by-session for one |
| At-Risk Students | Low attendance or below the pass mark, with WhatsApp buttons |
| Student Result Card | A printable card for one student with all courses and GPA |
| Presentations | Topic, status, marks per round |
| Student List / Course List | Rosters and course details |

### Backup

- **Download Backup (.json)** is the exact copy, best for restoring. Tick **Include uploaded PDFs/files** to put your uploaded files inside it too (the backup becomes bigger, about 1.4× the size of the files). Without the tick, the backup has the file list but not the files. **(Excel)** opens in Excel, with one tab per collection.
- **Restore** merges a backup back in: matching records are overwritten and nothing else is deleted.
- **Reset All Data** deletes everything except your settings and admin login. You must type `DELETE ALL DATA`.

Backups contain student passwords; keep them private.

### Change History

Every change you make is recorded: attendance marked or changed (with each student's *before → after*), marks and bonus changes, settings saved, students added or deleted, course plans imported, files added or removed, leave decisions, quiz results published, restores and resets. Search by roll number or course, filter by type, and **Export Excel**. Entries cannot be edited. Use **Delete entries older than 1 year** to save space; each entry is tiny.

## 6. Settings, option by option

Every rule the app uses lives here. Click **Save Settings** at the bottom after changing anything. Changes apply everywhere immediately: attendance %, gradebook, reports, warnings and student pages.

### General

| Setting | What it does |
| --- | --- |
| Your name, Department, Institution | Printed on reports, result cards, plans and WhatsApp messages |
| Active term | Dashboards and course pickers show only that term's courses (courses with no term always show). Leave blank to show everything. |

### Attendance Options (your own buttons)

Each row is one button on the Attendance page.

| Column | Meaning |
| --- | --- |
| On | Unticked = hidden when marking. Records already marked with it are kept and still counted. |
| Name | What the button says (e.g. *Medical*) |
| Code | What you type in the monthly Excel sheet (e.g. *M*). Codes must all be different. |
| Counts as | *Counts as present*, *Counts as half*, *Counts as absent*, or *Not counted* (removes that class from the total, so it neither helps nor hurts) |
| Colour | Button and report colour |
| Default | Pre-selected for every student when you open a class |
| Order ↑ ↓ | Button order |

- **Add an attendance option** creates your own, e.g. *Medical — M — Not counted* or *Official duty — OD — Counts as present*.
- Built-in options (Present, Absent, Leave, Late, Excused) can be renamed or switched off but not deleted.
- Your own options can be deleted. Switching off is safer, because records already marked with a deleted option show its raw name and stop counting.

Other attendance settings:

- **Warning below (%):** the threshold for warnings, the dashboard and the At-Risk report.
- **Attendance marks in gradebook:**
    - *Proportional:* 80% attendance earns 80% of the attendance weight.
    - *Bands:* fixed scores per range, e.g. ≥90% → 100, ≥80% → 80. Highest matching band wins.

### Gradebook Rules

| Setting | Choices |
| --- | --- |
| Default weightage | Used by courses without their own. *Apply to ALL courses* makes every course use it. |
| Components with no marks yet | *Leave out & rescale* (fair during the semester) or *Count as zero* (strict, for final results) |
| Blank mark for a student | *Ignore* (not graded yet) or *Zero once the due date has passed* |
| Combine several items by | *Average of percentages* (each quiz equal) or *Total marks* (bigger items count more) |
| Pass mark, Decimal places | As named |
| Students can see their running total | Shows a live total and grade on the student's Marks page |
| Drop Lowest | e.g. drop each student's lowest 1 quiz (only when they have more than one) |
| Grading Scale | Minimum % for each letter grade and its grade points (used for GPA). Must include a row starting at 0. |

### WhatsApp Messages

Set the country code (92 for Pakistan) and the text of the warning and result messages. You can use these placeholders: `{name}` `{roll}` `{course}` `{pct}` `{threshold}` `{total}` `{grade}` `{teacher}`. Nothing is sent automatically; the button opens WhatsApp with the message ready.

### Your Lists

Type one item per line:

- internal exam names;
- course file categories;
- presentation statuses.

Changing a list never changes records already saved.

### Online Quiz Defaults

These are the starting values for each new quiz, and each quiz can still be changed on its own:

- time limit;
- negative marking;
- shuffle questions and options;
- whether students see the correct answers.

### Course Plan Defaults

Usual weeks, mid-term week, final week and class days, pre-filled when you create a plan.

### Maintenance

One-time upgrades appear here (e.g. the version 2 attendance upgrade). They never delete anything except through a separate, clearly-labelled button.

## 7. Online quizzes

Students take a timed quiz on their phones. The app marks it, puts the marks in the gradebook, and can show each student their answers.

### Build a quiz

1. **Online Quizzes → + New Online Quiz** (title, course, date). Or click **Make online** next to any quiz on the Quizzes & Tasks page.
2. Add questions in either of two ways:
    - **One by one:** pick a type → **+ Add Question**, type the question, fill the options, tick the correct one(s), and set marks.
    - **From Excel (fastest):** click **Excel Template**, fill one row per question, then **Import from Excel**. Choose OK to replace or Cancel to add.
3. Click **Save Questions**. The total marks update automatically.
4. Click **Preview as Student** to check it.

| Type | Excel "Correct" column | Marked as |
| --- | --- | --- |
| MCQ (one correct) | One letter, e.g. `B` | Right or wrong |
| Multiple correct | Letters with commas, e.g. `A,C` | Right only if exactly those are chosen |
| True / False | `True` or `False` | Right or wrong |
| Short answer | Accepted answers separated by `|`, e.g. `Net Present Value|NPV` | Right if it matches any (capitals and extra spaces ignored) |

### Quiz Settings tab

- **Time limit (minutes).** Each student's clock starts when they press Start.
- **Opens at / Closes at** (optional). Students can only start inside this window.
- **Negative marking:** none, ¼, ⅓, ½ or full marks lost per wrong answer. Unanswered questions lose nothing, and a total never goes below 0.
- **Shuffle questions / options.** Each student gets a different but fixed order, so neighbours see different screens.
- **Show correct answers** when results are published, or the score only.

### Run it

1. Click **Open Quiz Now**. Students see it under **Online Quizzes** and as a green banner on their dashboard.
2. Students get one attempt. Answers save automatically every few seconds, so a dropped connection is fine: they reopen and continue. When time runs out, the saved answers are submitted.
3. Watch **Results & Marking**: who has started or submitted, time taken, how often they left the quiz screen, and the score.
4. Click **Close Quiz** when done. Students who are already inside can finish their own time.

### Mark and publish

1. On **Results & Marking**, optionally tick **Give 0 to students who did not attempt**.
2. **Save Marks to Gradebook** writes every score as that quiz's marks. They appear in the gradebook and reports.
3. **Publish Results to Students** saves marks, closes the quiz, and lets students see their score and (if allowed) the correct answers. **Hide Results** undoes this.
4. **Question Analysis** shows the % who got each question right. Red questions (under 40%) are worth re-teaching, or checking the answer key.
5. **Answers** shows one student's paper; **Reset** deletes an attempt so the student can retake it (e.g. after a phone problem).

### How answers stay safe

- The answer key is stored where only you can read it.
- Questions are hidden from students until you open the quiz.
- Start and submit times come from Google's server clock, so a student cannot change their phone's time to get more minutes.

## 8. Student portal guide (share this with students)

1. **Sign in.** Open the class website or app → **Student** tab → your roll number (e.g. `BSF-23-014`) and the password your lecturer gave you.
2. **Change your password:** **My Account → Change My Password**. You need your current password.
3. **Dashboard:**
    - green banners for quizzes open now;
    - **Class Check-in** (type the code shown in class);
    - your overall attendance;
    - each course's progress ring and attendance bar;
    - deadlines and announcements.
4. **Class Check-in:** **scan the QR code** on the board with your phone camera and open the link — you are checked in (sign in first if asked; it finishes by itself). Or choose the course, type the 6-digit code, and tap **Check in** during the time your lecturer allows. "Wrong or expired" means the code is mistyped, expired, or you already checked in.
5. **Course Progress:** what has been taught each week, what's next, and when exams are. **Add classes & deadlines to my calendar** saves a calendar file — open it on your phone to add every class, exam and deadline.
6. **Attendance:** your % per course, counts per option, and every day's record. If you are below the required %, it tells you how many classes in a row you need to recover. **Request Leave:** pick the course (or all), the dates and the reason, then **Send Request**. *My Leave Requests* shows Waiting / Approved / Not approved and your lecturer's note; you can **Withdraw** a request while it is waiting.
7. **Online Quizzes:**
    - Tap **Start quiz** only when ready; the timer does not stop.
    - Answers save automatically. If your internet drops, reopen the quiz and tap **Continue**.
    - Tap **Submit quiz** when done; you cannot change answers afterwards.
    - Leaving the quiz screen is recorded.
    - After your lecturer publishes results, tap **View result** to see your score and the correct answers.
8. **Assignments:** read the instructions. If online submission is on:
    1. Upload your file to Google Drive → **Share → Anyone with the link → Copy link**.
    2. Paste the link → **Submit**.
    3. You can update it later; the latest time is what your lecturer sees, and after the due date it shows as **Late**.
9. **Marks & Result:** every mark with remarks. Your running total appears too if your lecturer has turned it on.
10. **Course Content / Announcements:** files for your courses, the ebook library, and messages from your lecturer. PDFs open inside the app — use **+ / −** to zoom and **Download** to keep a copy. Once opened, a PDF opens again without using more internet.
11. **Install on your phone:** open the website in Chrome → **⋮ → Add to Home screen**.

## 9. How marks, attendance and coverage are calculated

**Attendance %.** Classes counted are those whose option is not "Not counted":

```latex
\text{Attendance \%} = \frac{\text{present} + 0.5 \times \text{half}}{\text{classes counted}} \times 100
```

**Each assessment type** (quizzes, assignments, presentations, tasks, internal exams) works like this:

- Only items with "Count in gradebook" ticked and a total above 0 are used, inside the chosen date range.
- Each student's lowest N are dropped if set.
- The rest are combined by average of percentages, or total marks, as chosen in Settings.

**Weighted total.** With *Leave out & rescale*, only components that already have marks are used:

```latex
\text{Total \%} = \frac{\sum (\text{weight} \times \text{component \%})}{\sum \text{weights of components with marks}} + \text{bonus} - \text{negative}
```

With *Count as zero*, the bottom of that fraction is always 100. The total is kept between 0 and 100, then the grading scale gives the letter and grade points.

**GPA** on the result card is the credit-hour weighted average of grade points.

**Course coverage** = lectures and revisions ticked ÷ all lectures and revisions in the plan. Exams and holidays are left out. *Pace* compares ticks with the number of lectures planned up to today.

**Online quiz score** = sum of marks for right answers − (negative fraction × marks) for wrong answers, never below 0.

## 10. Backup and safety routine

| When | Do this |
| --- | --- |
| Every 2 weeks (the dashboard reminds you) | Backup → Download Backup (.json) → save to Google Drive |
| Before every update or big import | Same, plus the Excel backup |
| End of each semester | Excel backup + export each course's Result Sheet and Daily Attendance Log; keep them with your records |
| Always | Keep backups, `signing.keystore` and `signing-key-info.txt` private |

To recover from a mistake, go to **Backup → Restore from File** and choose the latest .json file. This puts back the records in the file and leaves everything else as it is.

## 11. Troubleshooting: errors and fixes

| What you see | Why | Fix |
| --- | --- | --- |
| "Missing or insufficient permissions" | The security rules on Firebase are older than the app | Firebase Console → Firestore → Rules → paste `docs/firestore.rules` → Publish. Wait 1 minute, reload. |
| "Incorrect credentials" at sign-in | Wrong password, or the admin/student tab is wrong | Check the tab. Admin: reset the password in Firebase → Authentication → Users → ⋮ → Reset password. Student: Students → Edit → Change Password. |
| "This account is not registered as an administrator" | The `admins` document is missing or has the wrong UID | Firestore → `admins` → the document ID must be exactly the User UID from Authentication |
| "This account is not linked to a student record" | The student record was deleted or re-created | Delete and re-add the student, or check their `authUid` matches the login's UID |
| Re-adding a deleted roll number fails | The old login still exists in Authentication | Usually handled automatically. If not: Firebase → Authentication → find the old login → Delete, then re-add. |
| Page stuck on "Loading…" or blank | Old cached version, or no internet on first visit | Press Ctrl+F5 (phone: close and reopen). Check the address and your internet. |
| New version not showing after upload | GitHub Pages still publishing, or browser cache | Wait 2 minutes; check the repository's **Actions** tab shows a green tick; then Ctrl+F5 |
| Sidebar says "Offline — changes will sync" | No internet | Keep working; saves upload when you reconnect. Don't clear browser data while offline. |
| "Quota exceeded" / "resource-exhausted" | The free daily limit was reached (50,000 reads or 20,000 writes per day) | Wait until the next day (resets at about 12:00–13:00 Pakistan time). Avoid repeatedly re-running big reports. |
| Excel import says rows failed | Missing required columns, or wrong codes | Use the templates from the app; check the message, which lists each failed row |
| Attendance % looks different from before | Your Settings decide what counts (e.g. Leave = Not counted) | Settings → Attendance Options → Counts as |
| A student can't see a course's files or quizzes | The course code is missing from their Enrolled Courses | Students → Edit → add the course code |
| WhatsApp button is grey | No phone number on file | Students → Edit → Phone |
| A Drive link won't open for students | The file isn't shared publicly | In Drive: Share → General access → Anyone with the link |
| Student: "That code is wrong, has expired…" (check-in) | Typo, expired code, wrong course selected, or already checked in | Check the course and code. The lecturer can press New Code. |
| Student can't start a quiz | The quiz isn't open, is outside its window, or the student already submitted | Online Quizzes → open the quiz → check status and times; **Reset** the attempt if a retake is fair |
| A student's quiz shows "Time over" | Time ran out before they pressed Submit | Their saved answers are marked normally — nothing to do |
| Phone app shows a URL bar at the top | The Digital Asset Links file isn't published at the site root | Optional; the app still works. The PWABuilder docs explain `assetlinks.json`. |
| "The limit is 10 MB" when uploading | The file is too big for one upload | Compress it free at ilovepdf.com → Compress PDF, split it into parts, or add it as a Google Drive link |
| "The free storage space is full" | Uploaded files reached about 900 MB | Remove old files (Course Content → Remove), or use Drive links for big files |
| Plan import: "no text could be read" / few topics found | Scanned PDF (a photo), or an unusual layout | Use the Word/Excel version, or **Paste a List**; fix rows in the preview before saving |
| Plan import put topics in the wrong weeks | The file had no week numbers or dates | In the preview, type the weeks, or set the start date and class days and press **Re-arrange dates** |
| ".doc files can't be read" | Old Word format | Open it in Word → Save As → .docx |
| QR scan opens the website but asks to sign in | The phone's browser isn't signed in | Sign in once; the check-in then finishes by itself (within 15 minutes of scanning) |
| Leave requests / Change History say "permission" | v4 security rules not published | Publish `docs/firestore.rules` (section 3, step 4) |
| PDF says "could not be shown here" | The file is damaged or protected | Use **Download** to open it on the device, or upload a fresh copy |
| Something else | — | Note the exact message, the page, and the time. Export a backup before trying fixes. |

## 12. Free-plan limits, glossary and quick reference

### Everything is free

| Service | What it's used for | Free limit | Cost |
| --- | --- | --- | --- |
| Firebase Firestore (Spark) | All data, uploaded PDFs, change history | 1 GB storage, 50,000 reads + 20,000 writes per day | Free, no card |
| Firebase Authentication | Logins | Email/password sign-in for normal class sizes | Free |
| GitHub Pages | The website | 1 GB site, 100 GB traffic per month | Free |
| Google Drive | Files, ebooks, submissions | 15 GB per Google account | Free |
| WhatsApp links, PWABuilder, SheetJS, pdf.js, JSZip, Google Fonts | Messages, APK, Excel, PDF reader, Word reader, fonts | — | Free (open source, bundled in the app) |

A class of 300 students using the app every day stays well inside these limits.

**Uploaded files and the free limits.** Each PDF is stored in pieces of 900 KB, so a 3 MB PDF is 4 pieces: uploading it costs 4 writes and each student's first opening costs 4 reads (re-opening on the same phone is free — it is kept on the device). 150 students opening one 3 MB PDF = 600 reads, about 1% of the daily 50,000. Files share the 1 GB with your data; the app stops uploads at 900 MB so your records always have room. Big videos or many large books → use Google Drive links instead.

### Glossary

| Word | Meaning |
| --- | --- |
| Active term | The term whose courses are shown by default |
| Roster | The active students enrolled in a course |
| Weightage | How many of the 100 marks each component carries |
| Rescale | Ignore components with no marks yet, so early totals are fair |
| Course plan / session | The week-by-week list of lectures; one row = one session |
| Coverage / pace | How much of the plan is taught / ahead or behind the plan |
| Check-in code | A 6-digit code shown in class that students type to mark themselves present |
| Publish (quiz) | Let students see their quiz score and answers |
| Firestore rules | The security file that decides who can read or change what |
| Service worker | The part that makes the app open offline (`sw.js`) |

### Quick reference

| I want to… | Go to |
| --- | --- |
| Take attendance | Attendance → course + date → mark → Save (or Live Check-in) |
| Tick today's topic | Attendance (topics panel) or Course Plans → ✓ |
| Run a quiz | Online Quizzes → New → questions → Open → later Close → Publish |
| Collect assignments online | Assignments → Edit → tick "Students submit online" |
| Enter marks | Assignments / Quizzes / Presentations / Exams → Marks |
| See final results | Exams & Gradebook → Run Gradebook |
| Print a result card | Reports → Student Result Card, or a student's Profile |
| Warn a student | Dashboard / Attendance report / At-Risk report → WhatsApp |
| Add or hide an attendance option | Settings → Attendance Options |
| Back up | Backup → Download Backup (.json) |
| Update the app | Section 3 of this guide |
