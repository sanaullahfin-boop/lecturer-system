// ==========================================================================
// AUTH — shared by index.html (login) and both dashboard pages
// ==========================================================================
// Design decision: no Cloud Functions and no Firebase custom claims, because
// custom claims require an Admin SDK call from a server/Cloud Function, and
// Cloud Functions require the paid Blaze plan even for free-tier usage.
// Instead, role is looked up directly in Firestore:
//   /admins/{uid}        -> exists only for lecturer accounts
//   /students/{rollNo}    -> has a field `authUid` matching the logged-in uid
// Firestore Security Rules (see docs/firestore.rules) enforce that a student
// can only ever read their own /students/{rollNo} document and nothing else.
//
// IMPORTANT: student lookups use a direct get() by roll number wherever
// possible (never a where()-query) — the roll number is either typed by the
// student at login, or cached in localStorage afterward. A direct get() by
// document ID is evaluated unambiguously by Firestore's security rules; a
// where() query asking "which document has this authUid?" can, in some
// situations, be denied by rules that would allow the equivalent direct
// get() just fine. The where() query is kept only as a last-resort fallback
// (e.g. a new device with no cached roll number yet).
// ==========================================================================

const STUDENT_ROLL_CACHE_KEY = "lms_student_roll";

/**
 * Logs the lecturer/administrator in with email + password.
 */
async function loginAsAdmin(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email.trim(), password);
  const adminDoc = await db.collection("admins").doc(cred.user.uid).get();
  if (!adminDoc.exists) {
    await auth.signOut();
    throw new Error("This account is not registered as an administrator.");
  }
  return cred.user;
}

/**
 * Logs a student in with Roll Number + Password.
 * The roll number is translated into a hidden internal email address so we
 * can reuse Firebase's free Email/Password auth without students ever
 * needing a real email account.
 */
async function loginAsStudent(rollNumber, password) {
  const roll = rollNumber.trim();
  const email = await getStudentAuthEmail(roll);
  const cred = await auth.signInWithEmailAndPassword(email, password);

  // Direct get() by roll number (the document's own ID) — not a query.
  const studentDoc = await db.collection("students").doc(roll).get();

  if (!studentDoc.exists || studentDoc.data().authUid !== cred.user.uid) {
    await auth.signOut();
    throw new Error("This account is not linked to a student record.");
  }

  localStorage.setItem(STUDENT_ROLL_CACHE_KEY, roll);
  return { user: cred.user, studentDoc };
}

function logout() {
  localStorage.removeItem(STUDENT_ROLL_CACHE_KEY);
  return auth.signOut().then(() => {
    window.location.href = "index.html";
  });
}

/**
 * Route guard: call at the top of admin-dashboard.html's script.
 * Redirects to login if not authenticated as an admin.
 */
function requireAdmin(onReady) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    const adminDoc = await db.collection("admins").doc(user.uid).get();
    if (!adminDoc.exists) {
      window.location.href = "index.html";
      return;
    }
    onReady(user, adminDoc.data());
  });
}

/**
 * Route guard: call at the top of student-dashboard.html's script.
 * Redirects to login if not authenticated as the owning student.
 *
 * Tries the cached roll number first (a direct, unambiguous get()). Only
 * falls back to the where()-query lookup if there's no cached roll number
 * yet (e.g. first visit on a new device/browser).
 */
function requireStudent(onReady) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }

    const cachedRoll = localStorage.getItem(STUDENT_ROLL_CACHE_KEY);
    if (cachedRoll) {
      try {
        const doc = await db.collection("students").doc(cachedRoll).get();
        if (doc.exists && doc.data().authUid === user.uid) {
          onReady(user, doc);
          return;
        }
      } catch (e) {
        // Cached roll number didn't pan out — fall through to the query below.
      }
    }

    try {
      const studentQuery = await db.collection("students")
        .where("authUid", "==", user.uid)
        .limit(1)
        .get();
      if (studentQuery.empty) {
        window.location.href = "index.html";
        return;
      }
      localStorage.setItem(STUDENT_ROLL_CACHE_KEY, studentQuery.docs[0].id);
      onReady(user, studentQuery.docs[0]);
    } catch (e) {
      window.location.href = "index.html";
    }
  });
}
