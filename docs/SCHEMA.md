# Firestore Schema — Phase 1

This is the data model built so far. Later phases add collections for
assignments, presentations, quizzes, tasks, exams, marks, announcements,
and course content — each following the same admin-writes / student-reads-
own-data pattern already established here.

## `admins` (collection)
Document ID = Firebase Auth `uid` of the lecturer.

| Field | Type   | Notes                          |
|-------|--------|---------------------------------|
| name  | string | Displayed in the dashboard topbar |
| email | string | For reference only               |

> Created manually: Firebase Console → Authentication → Add user (email +
> password) → copy the generated UID → Firestore → `admins` collection →
> new document with that UID as the Document ID.

## `students` (collection)
Document ID = **Roll Number** (e.g. `BSF-21-014`). Using the roll number as
the ID makes lookups and Excel import/export trivial in later phases.

| Field       | Type      | Notes                                             |
|-------------|-----------|----------------------------------------------------|
| authUid     | string    | Firebase Auth uid, links this doc to a login       |
| name        | string    |                                                     |
| fatherName  | string    |                                                     |
| email       | string    | Real personal email (for the future email module)  |
| phone       | string    |                                                     |
| program     | string    | e.g. "BS Finance"                                  |
| semester    | number    | 1–8                                                 |
| section     | string    | e.g. "A"                                           |
| course      | array     | Course codes this student is enrolled in — drives which attendance rosters they appear on |
| session     | string    | e.g. "Fall 2023 – 2027"                            |
| status      | string    | "active" / "inactive" / "graduated"                |
| notes       | string    | Free-text lecturer notes                           |
| loginPassword | string  | The student's current login password, stored so the lecturer can look it up or change it later. Only ever readable by the admin or by that one student's own account (same access rule as the rest of the document) — never exposed to anyone else. |

Student login: Firebase's free Email/Password auth is reused under the
hood, but students never see or need a real email address — see
`studentLogins` below for how the roll number maps to an actual login
email.

## `studentLogins` (collection)
Document ID = **Roll Number** (same ID as the matching `students` doc).
Maps a roll number to that student's actual, randomly-generated Firebase
Auth login email — e.g. `fin22001.k3n9p2@students.sanaullah-classroom.local`.

| Field     | Type   | Notes                                                |
|-----------|--------|--------------------------------------------------------|
| authEmail | string | The real login email used behind the scenes for this student |

**Why this exists:** early versions of this app derived the login email
directly and deterministically from the roll number
(`rollnumber@students...`). That caused a real problem: the free Firebase
plan can't delete a Firebase Auth account from the browser, so deleting a
student and later reusing the same roll number would collide with the old,
still-existing login and fail with "email already in use." Generating a
random, never-repeated email per student — and keeping this small lookup
table to translate "roll number typed at login" into "the right email to
authenticate with" — makes that collision impossible going forward.

This collection is deliberately **readable by anyone, even signed out**
(`allow read: if true` in the security rules) because the login page needs
to look up the right email *before* the student is authenticated — there's
no way around that without a paid server. It only ever exposes a
meaningless generated email address, nothing sensitive.

## `courses` (collection)
Document ID = **Course Code** (e.g. `FIN301`).

| Field         | Type   | Notes                        |
|---------------|--------|-------------------------------|
| className     | string | Program/class this course belongs to — e.g. "BS Finance", "BBA", "MBA" (freely typed, not a fixed list) |
| title         | string | Subject name, e.g. "Financial Management" |
| creditHours   | number |                                |
| semester      | number |                                |
| section       | string |                                |
| teacher       | string |                                |
| outline       | string | Text or link to uploaded file  |
| referenceBooks| array  |                                |

## `attendance` (collection)
Document ID = `{courseCode}__{date}__{rollNumber}` (deterministic, so
re-marking the same student/course/date overwrites instead of duplicating).

| Field       | Type   | Notes                                             |
|-------------|--------|-----------------------------------------------------|
| rollNumber  | string | Links to `students/{rollNumber}`                    |
| courseCode  | string | Links to `courses/{courseCode}`                     |
| date        | string | `YYYY-MM-DD`                                        |
| status      | string | "present" / "absent" / "leave" / "late" / "excused" |
| markedBy    | string | Admin uid                                           |

## `gradeItems` (collection)
Document ID = auto-generated. One doc per assignment / presentation round /
quiz / task / internal exam definition. The `type` field is what
distinguishes them, so all four modules (Assignments, Presentations,
Quizzes & Tasks, Internal Exams) share this single collection.

| Field       | Type          | Notes                                              |
|-------------|---------------|-----------------------------------------------------|
| type        | string        | "assignment" / "presentation" / "quiz" / "task" / "exam" |
| courseCode  | string        | Links to `courses/{courseCode}`                     |
| title       | string        | Assignment title / round name / quiz name / "Midterm" etc. |
| dueDate     | string        | `YYYY-MM-DD` — due date, presentation date, quiz/exam date |
| totalMarks  | number\|null  | Null allowed for tasks (marks are optional there)   |
| description | string        | Assignments/tasks only                              |
| instructions| string        | Assignments only                                    |
| attachmentUrl | string      | Assignments only — link to an uploaded file          |
| assignTo    | "all" \| array| "all" = entire class, or an explicit roll-number array |

## `gradeMarks` (collection)
Document ID = `{itemId}__{rollNumber}`. One doc per student per grade item.

| Field        | Type         | Notes                                        |
|--------------|--------------|-----------------------------------------------|
| itemId       | string       | Links to `gradeItems/{itemId}`                |
| type         | string       | Mirrors the parent item's type                |
| courseCode   | string       |                                                 |
| rollNumber   | string       | Links to `students/{rollNumber}`               |
| marksObtained| number\|null | Null = not yet graded                          |
| totalMarks   | number       | Copied from the item at save time              |
| remarks      | string       |                                                 |
| topic        | string       | Presentations only — the individual student's topic |
| status       | string       | Presentations only — "scheduled" / "completed" / "no-show" |

## `gradebookAdjustments` (collection)
Document ID = `{courseCode}__{rollNumber}`. Manual bonus/negative marks a
lecturer applies on top of the computed gradebook total.

| Field         | Type   | Notes |
|---------------|--------|-------|
| courseCode    | string |       |
| rollNumber    | string |       |
| bonusMarks    | number | Added to the final percentage      |
| negativeMarks | number | Subtracted from the final percentage |

`courses/{courseCode}` also gained an optional `gradeWeights` field once a
lecturer saves weightage on the Gradebook tab:
`{ attendance, quiz, assignment, presentation, task, exam }` (percentages
summing to 100). Defaults to `10/15/20/10/5/40` if never set.

## `announcements` (collection)
Document ID = auto-generated.

| Field     | Type   | Notes                                              |
|-----------|--------|------------------------------------------------------|
| title     | string |                                                        |
| body      | string |                                                        |
| target    | string | "all" or a specific course code                       |
| postedAt  | string | ISO datetime                                          |
| postedBy  | string | Admin uid                                             |

## `courseContent` (collection)
No file is actually stored by this app — `url` is a Google Drive share
link the lecturer pastes in after uploading the file to their own Drive.
(This app doesn't use Firebase Storage: since February 2026 Google requires
a linked credit card — the Blaze plan — to use Storage at all, even for
$0 actual usage, so Drive links keep the whole system genuinely free.)

| Field       | Type   | Notes                                    |
|-------------|--------|---------------------------------------------|
| courseCode  | string | Links to `courses/{courseCode}`             |
| category    | string | "Lecture Notes" / "Course Outline" / "Reference Material" / "Other" |
| fileName    | string | Display name shown to students        |
| url         | string | Google Drive share link ("Anyone with the link" access) |
| addedAt     | string | ISO datetime                                 |

## `ebooks` (collection)
Same pattern as `courseContent` — `url` is a Google Drive share link, not
an uploaded file.

| Field       | Type   | Notes                          |
|-------------|--------|----------------------------------|
| title       | string |                                    |
| author      | string | Optional                          |
| subject     | string | Free text, used for organization  |
| url         | string | Google Drive share link           |
| addedAt     | string | ISO datetime                      |

## Collections planned for later phases
None — Reports (Phase 5) reads from the collections above rather than
storing anything new. Backup (Phase 5) is a JSON snapshot/restore tool over
the same collections, not a new collection itself.
