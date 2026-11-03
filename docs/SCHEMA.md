# Firestore Data Model — v3

| Collection | Document ID | What it holds | Who can read |
|---|---|---|---|
| `admins` | Auth UID | `name`, `email` | that admin |
| `students` | Roll number | `authUid, name, fatherName, email, phone, program, semester, section, session, status (active/inactive/graduated), notes, course[], loginPassword` | admin, that student |
| `studentLogins` | Roll number | `authEmail` (hidden login email) | single lookup: anyone · listing: admin |
| `courses` | Course code | `term, className, title, creditHours, semester, section, teacher, outline, referenceBooks[], gradeWeights{}` (optional override) | signed-in users |
| **`coursePlans`** (new) | Course code | `startDate, weeks, midtermWeek, finalWeek, meetingDays[0-6], term, updatedAt, sessions[]` — each session `{id, week, session, plannedDate, type (lecture/revision/midterm/final/holiday/other), topic, details, covered, coveredOn}` | signed-in users |
| **`attendanceSummary`** (new) | `{COURSE}__{ROLL}` | `courseCode, rollNumber, days{ 'YYYY-MM-DD': present/absent/leave/late/excused }` | admin, that student |
| `attendance` | old v1 format | one doc per student per day — only read by the one-time upgrade | admin |
| `gradeItems` | auto | `type (assignment/quiz/task/presentation/exam), courseCode, title, dueDate, totalMarks, countInGrade, assignTo ('all' or [rolls]), description, instructions, attachmentUrl, allowSubmission (v3), online (v3, quizzes: status draft/open/closed, durationMin, opensAt/closesAt + …Ts, negativeMark, shuffleQuestions, shuffleOptions, showAnswers, published, questionCount), createdAt` | signed-in users |
| `gradeMarks` | `{itemId}__{ROLL}` | `itemId, type, courseCode, rollNumber, marksObtained, totalMarks, remarks, topic, status` | admin, that student |
| `gradebookAdjustments` | `{COURSE}__{ROLL}` | `bonusMarks, negativeMarks` (percentage points) | admin, that student |
| **`settings`** (new) | `app` | `institution{}, activeTerm, attendance{statuses[] {key,label,code,rule,color,enabled}, defaultStatus, warningThreshold, scoring, bands[]}, lists{examNames, fileCategories, presentationStatuses}, quiz{defaults}, grading{defaultWeights, missingComponent, blankMarks, aggregation, dropLowest, passMark, decimals, showStandingToStudents, scale[]}, whatsapp{}, plan{}, migration{}, lastBackupAt` | signed-in users |
| **`quizPapers`** (v3) | gradeItem id | `questions[]` `{id, type mcq/multi/tf/short, text, options[], marks}`, `answerKey` (only after results are published with answers) | admin; students only while the quiz is open/closed |
| **`quizKeys`** (v3) | gradeItem id | `answers{questionId: index / [indexes] / 'true'|'false' / [accepted strings]}` | admin only |
| **`quizAttempts`** (v3) | `{itemId}__{ROLL}` | `itemId, rollNumber, courseCode, status started/submitted, startedAt, submittedAt (server time), answers{}, tabSwitches, score, max, gradedAt` | admin, that student |
| **`submissions`** (v3) | `{itemId}__{ROLL}` | `itemId, rollNumber, courseCode, url, note, submittedAt (server time)` | admin, that student |
| **`checkins`** (v3) | `{COURSE}__{DATE}` | `code, expiresAt, courseCode, date` | admin only |
| **`checkinResponses`** (v3) | `{COURSE}__{DATE}__{ROLL}` | `code, at (server time)` — accepted only if the code matches and has not expired | admin, that student |
| `announcements` | auto | `title, body, target ('all' or course code), postedAt, postedBy` | signed-in users |
| `courseContent` | auto | `courseCode, category, fileName, url, addedAt`; uploaded files (v4) also have `storage:'app', fileId, chunkCount, size, mime, originalName` | signed-in users |
| `ebooks` | auto | `title, author, subject, url, addedAt` (+ the same upload fields) | signed-in users |
| **`fileChunks`** (v4) | `{fileId}__{n}` | `fileId, i, n, data (bytes, ≤ 900 KB)` — one piece of an uploaded file | signed-in users read; admin writes |
| **`leaveRequests`** (v4) | auto | `rollNumber, studentName, authUid, courseCode ('' = all), from, to, reason, status (pending/approved/rejected), createdAt (server time)`; admin adds `decidedAt, note, applied` | admin; that student (create pending, read own, withdraw while pending) |
| **`auditLog`** (v4) | auto | `at (server time), atLocal, by, byName, action, detail, page, changes[]` | admin only; entries can't be edited |

## How the gradebook is calculated
1. **Attendance %** = attended ÷ counted classes, using your status rules (Settings). The gradebook score is that %, or your band score.
2. **Each assessment type %** = average of item percentages (or total marks ÷ total possible), after "drop lowest". Only items with "count in gradebook" ticked and a total above 0 are used.
3. **Weighted total** = Σ(weight × component %) ÷ Σ(weights of components that have marks), when the rule is "rescale". With "zero", the denominator is always 100.
4. **Final** = weighted total + bonus − negative, kept between 0 and 100 → letter grade and grade points from your scale.

## Read cost (free plan: 50,000 reads/day)
- Admin dashboard ≈ students + courses + (students × courses) attendance docs + plans: a few hundred to ~2,000 reads, at any point in the semester.
- Student dashboard ≈ 20–60 reads.
- Opening an uploaded PDF = 1 read per 900 KB piece, only the first time on each device (then served from the device cache).
- Course Content page (admin) also counts used space: 1 read per content/ebook record.
- Gradebook for one course ≈ items + (students × items) marks + students: usually under 1,500 reads.
