// ==========================================================================
// FIREBASE LOGIC — you should never need to edit this file. Your keys live
// in js/firebase-keys.js instead, which is loaded before this file.
// ==========================================================================

const auth = firebase.auth();
const db = firebase.firestore();

// Domain used for student login emails. Students never see this — they
// only ever type their roll number.
const STUDENT_EMAIL_DOMAIN = "students.sanaullah-classroom.local";

// --------------------------------------------------------------------------
// Student login emails are NOT simply "rollnumber@domain". Why: if a
// student is ever deleted and the same roll number reused later, the free
// Firebase plan can't delete the old Auth account from the browser — so a
// deterministic email would collide with that orphaned old account every
// time, causing a confusing "email already in use" failure.
//
// Instead, each student gets a unique, randomly-suffixed login email at
// creation time (e.g. "fin22001.k3n9p2@students...") that can never repeat.
// The mapping from roll number -> actual login email lives in a small,
// publicly-readable (but admin-only-writable) `studentLogins` collection,
// so the login page can look up the right email BEFORE the student is
// authenticated (which is required — you can't query your own data until
// you're already signed in).
// --------------------------------------------------------------------------

function generateUniqueStudentEmail(rollNumber) {
  const safeRoll = rollNumber.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${safeRoll}.${suffix}@${STUDENT_EMAIL_DOMAIN}`;
}

// Legacy fallback — how emails used to be generated, before the fix above.
// Kept only so any student created before this update can still log in.
function rollNumberToEmail(rollNumber) {
  return `${rollNumber.trim().toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`;
}

/**
 * Looks up the real login email for a roll number: the unique generated
 * one if this student was created after this fix, or the old deterministic
 * one as a fallback for students created before it.
 */
async function getStudentAuthEmail(rollNumber) {
  const roll = rollNumber.trim();
  try {
    const doc = await db.collection('studentLogins').doc(roll).get();
    if (doc.exists && doc.data().authEmail) return doc.data().authEmail;
  } catch (e) {
    // fall through to the legacy scheme below
  }
  return rollNumberToEmail(roll);
}

// --------------------------------------------------------------------------
// Secondary app instance — used ONLY to create student Auth accounts.
// Firebase's client SDK automatically signs you in as any user you create
// with createUserWithEmailAndPassword(). Doing that on the *primary* app
// would kick the lecturer out of their own admin session. Running it on a
// second, throwaway app instance avoids that, with zero extra cost.
// --------------------------------------------------------------------------
function getSecondaryAuth() {
  let secondaryApp;
  try {
    secondaryApp = firebase.app("Secondary");
  } catch (e) {
    secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
  }
  return secondaryApp.auth();
}

/**
 * Creates a Firebase Auth login for a student without disturbing the
 * currently signed-in admin session. Returns the new user's uid.
 */
async function createStudentAuthAccount(email, password) {
  const secondaryAuth = getSecondaryAuth();
  const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
  const uid = cred.user.uid;
  await secondaryAuth.signOut();
  return uid;
}
