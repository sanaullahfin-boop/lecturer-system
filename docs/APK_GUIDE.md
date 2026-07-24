# Converting to an Android APK (Free, via PWABuilder)

This uses the same free pipeline as your expense tracker app: GitHub Pages
→ PWABuilder → sideload. No app store account, no paid tooling.

## 1. Deploy to GitHub Pages first

The app needs to be live at a `https://` URL before PWABuilder can package
it (it can't package `file://` or `localhost` URLs).

1. Push this whole `lms/` folder to a GitHub repository.
2. Repo → **Settings** → **Pages** → Source: Deploy from branch → Branch:
   `main` → Folder: `/ (root)` → **Save**.
3. Wait a minute or two, then note the URL GitHub gives you, e.g.
   `https://yourusername.github.io/your-repo-name/`.
4. Open that URL and confirm the login page loads correctly and your
   Firebase config is working (try logging in).

## 2. Generate icons (if you haven't already)

`manifest.json` expects two icon files:
- `icons/icon-192.png` (192×192px)
- `icons/icon-512.png` (512×512px)

Any square PNG works — a simple logo, your institute's crest, or even just
initials on a navy background matching the app's theme. Add an `icons/`
folder with both files, commit, and push.

## 3. Run PWABuilder

1. Go to https://www.pwabuilder.com
2. Paste your GitHub Pages URL and click **Start**.
3. PWABuilder scores your manifest and service worker. You may see a note
   that there's no service worker yet — that's fine for Phase 1; it just
   means the app won't work fully offline yet (everything still works fine
   online, which is the normal case for a Firebase-backed app).
4. Click **Package for Stores** → choose **Android**.
5. Keep the defaults (Package ID can be something like
   `com.kust.lecturerms`) → **Generate**.
6. Download the generated `.zip` — it contains a signed `.apk` (and an
   `.aab` for Play Store submission, which you won't need).

## 4. Install on your phone

1. Extract the `.zip` and locate the `.apk` file.
2. Transfer it to your Android phone (email it to yourself, use Google
   Drive, or a USB cable).
3. On the phone, open the file — Android will prompt to allow installing
   from this source the first time. Approve it.
4. The app installs like any other Android app, with its own icon on your
   home screen, launching straight into the login page.

## 5. Updating the app later

Every time you push changes to GitHub Pages, anyone who opened the app
through a normal browser sees the update immediately. The sideloaded APK,
however, is a snapshot — if you want the phone-installed icon to reflect
big changes, regenerate and reinstall the APK the same way. For small
day-to-day changes this usually isn't necessary, since the APK is really
just a wrapper that loads your live GitHub Pages URL.
