# Testing Checklist

Work through this before relying on the app for a real class. Check off
each item as you confirm it.

## Auth & Access Control
- [ ] Admin can log in with email + password
- [ ] Admin login fails gracefully with a wrong password (friendly message, no crash)
- [ ] Student can log in with roll number + password
- [ ] A student cannot see another student's data by guessing a roll number
      (try opening `student-dashboard.html` as Student A right after Student B
      logged out — it should still only show Student A once Student A signs in)
- [ ] Logging out actually returns to the login page and blocks back-button access
      to the dashboard without logging in again

## Students
- [ ] **Before testing:** delete any students created with an older
      version of this app (Backup page → Reset All Data is the fastest way
      to clear everything and start fresh) — old students used a different,
      now-replaced login scheme and won't work correctly until re-added
- [ ] Add a student — record appears, and the student can log in with the
      password you set (**test this login immediately** — this is the bug
      that was just fixed, so confirm it end-to-end)
- [ ] Delete that student, then re-add them with the exact same roll
      number — confirm this now works with no error and no manual Firebase
      Console cleanup needed
- [ ] The password you set is visible on the Students list (click "Show")
      and in the Edit modal
- [ ] Change a student's password via the Edit modal, then confirm they can
      log in with the new one (and the old one no longer works)
- [ ] Click "Profile" next to a student — their info, attendance %, and
      full marks history all appear correctly
- [ ] Edit a student — changes save and persist after a page refresh
- [ ] Search filters the list correctly by roll number, name, and program
- [ ] Delete a student — record disappears, and that student can no longer
      access their dashboard
- [ ] Export to Excel — file downloads and opens correctly with all
      columns, including Password
- [ ] Import from Excel — a small test file (try `docs/sample-students.xlsx`)
      creates the expected number of students, and re-importing the same
      file doesn't create duplicates
- [ ] If you delete a student and then try to re-add the exact same roll
      number, confirm you get a clear message about deleting their old
      login in Firebase Console first (rather than a confusing failure)

## Courses
- [ ] Add, edit, and delete a course
- [ ] Duplicate course codes are rejected
- [ ] Export to Excel — file downloads with all columns
- [ ] Import from Excel — try `docs/sample-courses.xlsx`, confirm it
      creates the expected courses and skips duplicates on re-import

## Attendance
- [ ] Mark attendance for a course/date, save, and refresh — marks persist
- [ ] Re-marking the same course/date overwrites rather than duplicating
      (check the Firestore console — one doc per student per course per date)
- [ ] Report tab shows correct percentages and flags anyone under 75%
- [ ] Download the bulk monthly template, fill in a few cells, upload it
      back, and confirm the marks appear correctly
- [ ] Dashboard's "Present Today"/"Absent Today"/"Attendance Warnings" cards
      match what the Attendance page shows

## Gradebook (Assignments / Presentations / Quizzes / Tasks / Exams)
- [ ] Create one of each type, assign to "entire class", enter marks, confirm
      they save
- [ ] Create one assigned to "selected students" and confirm only those
      students appear in the marks grid
- [ ] Try "Download Template" / "Upload Filled Marks" on at least one grade
      item and confirm the marks land correctly
- [ ] Presentation topics and status save independently per student
- [ ] Gradebook tab: weights sum-to-100 validation blocks saving otherwise
- [ ] Gradebook percentages and grade letters look sensible for a student
      with known marks (sanity-check the math by hand for one student)
- [ ] Bonus/negative marks entered directly in the gradebook table save and
      affect the total immediately

## Announcements & Course Content
- [ ] Post an announcement targeted at "all" — appears on every student's
      dashboard
- [ ] Post one targeted at a specific course — only appears for students
      enrolled in that course
- [ ] Add a course file (Google Drive link) — appears in the list with a
      working link, and only shows to students enrolled in that course
- [ ] Add an ebook (Google Drive link) — appears for every student
      regardless of course

## Reports & Backup
- [ ] Each of the 7 reports downloads and opens correctly in Excel,
      including the new Daily Attendance Log (try both a single month and
      a longer custom date range)
- [ ] Full JSON backup downloads with all expected collections
- [ ] Full Excel backup downloads with one tab per collection
- [ ] Download the blank Excel template and confirm the column headers
      look right
- [ ] Restore a backup into a *test* Firebase project first, before ever
      trying it against your real one, to build confidence in the flow
- [ ] Try "Reset All Data," confirm it asks for typed confirmation, and
      confirm your own admin login still works afterward

## Security rules
- [ ] **After this update, re-paste `docs/firestore.rules` into Firebase
      Console → Firestore Database → Rules → Publish** — this is required
      for the student login fix to take effect, it will not work otherwise

## Cross-cutting
- [ ] Test on both desktop browser and a phone browser
- [ ] Test with a slow/interrupted network connection — errors should show
      friendly messages, not a blank crash
- [ ] If packaged as an APK, confirm the sideloaded app opens and logs in
      correctly on the actual phone
