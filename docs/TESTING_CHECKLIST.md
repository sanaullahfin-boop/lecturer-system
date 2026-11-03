# After-Upgrade Checklist

## Version 3 (quick)
- [ ] Published the new `docs/firestore.rules`
- [ ] Settings → Attendance Options: add a test option (e.g. Medical, M), save, and see it on the Attendance page; then switch it off
- [ ] Online Quizzes → New → add 2 questions → Open → as a test student take it → Close → Publish → the student sees the score
- [ ] Attendance → today → Live Check-in → a student checks in from their phone → Apply → Save
- [ ] Assignments → Edit → tick "Students submit online" → a student submits a Drive link → it shows in the Marks grid
- [ ] Help & Guide page opens (admin) and Help (student)

# Version 2 checklist

## Setup
- [ ] Published `docs/firestore.rules` (Firestore → Rules → Publish)
- [ ] Ran Settings → Maintenance → **Upgrade Attendance Now**
- [ ] Checked 2–3 students' attendance % look the same as before. Leave/Excused are now "not counted" by default; change this in Settings if you want them charged.
- [ ] Deleted old-format attendance records
- [ ] Settings: name, department, active term, rules saved
- [ ] Every course has its Term filled in

## Course plans
- [ ] Create a plan (start date + class days) → 16 weeks with Mid (8) and Final (16) marked
- [ ] Download Excel → type a few topics → upload → topics appear
- [ ] Tick a topic → ring and graph move; the student sees it on **Course Progress**
- [ ] Mark attendance and tick "topic taught" in the same screen

## Attendance
- [ ] Mark → Save → refresh → still saved
- [ ] Turn phone data off → mark & save → "offline — will sync" → turn data on → record appears in the report
- [ ] Monthly template shows only class days; upload works
- [ ] Report → WhatsApp button opens with the message filled in

## Marks & gradebook
- [ ] Enter marks (a value above the total is blocked)
- [ ] Untick "Count in gradebook" on an item → total changes
- [ ] Change a weight to 0 → that column shows "·"
- [ ] Bonus in table → total updates
- [ ] Hand-check one student's total

## Reports
- [ ] Generate each report type; Excel opens; Print → Save as PDF looks clean
- [ ] Student Result Card shows GPA

## Students
- [ ] Student signs in, sees dashboard rings, course progress, attendance, marks
- [ ] Student changes their own password on **My Account**; your Students list shows the new one
- [ ] (Optional) Settings → "Students can see their running total" → Yes → it appears on the student's Marks page

## Phone app
- [ ] Open the installed app → new design appears (close/reopen once if needed)
- [ ] Dark mode toggle works

## Version 4 checks (after publishing the v4 rules)

- [ ] Course Content → Upload a file → pick a PDF under 10 MB → Upload. The list shows a green **PDF · size** tag and the space meter goes up.
- [ ] Click the file name: the reader opens with every page; + / − zoom; Download saves the PDF.
- [ ] Sign in as a test student on a phone → Course Content → open the same PDF.
- [ ] Course Plans → a course → **Upload My Plan** → choose your own Excel, PDF or Word plan. Check the preview (weeks, dates, Mid/Final), then **Create checklist**. Tick a topic.
- [ ] Upload the same file again with *Replace*: the tick is kept.
- [ ] **Add to Calendar** downloads a .ics file that opens in your phone's calendar.
- [ ] Attendance → today → **Live Check-in** → Show Code: a QR code appears. Scan it with a student's phone camera: it checks in (after sign-in).
- [ ] Student → My Attendance → **Request Leave** → Send. Admin dashboard shows "1 leave request waiting"; Attendance → **Leave Requests** → Approve. An Absent in those dates becomes Leave; the student sees Approved.
- [ ] **Change History** lists what you just did (upload, plan import, leave approval, attendance changes with before → after).
- [ ] Backup → tick *Include uploaded PDFs/files* → Download Backup (.json). Keep it private.
