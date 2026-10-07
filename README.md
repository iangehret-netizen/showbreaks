# Weigh-Break Recorder: GitHub Pages + Firebase sync

Static site (no build step). Shows sync across all your devices through Firebase (Google sign-in + Firestore).
Until you paste your Firebase config, the site runs in "this browser only" mode, so nothing breaks.

## Files
- `index.html`: the app
- `seed.js`: starting data (NAILE 2018-2025, Ohio State Fair 2026), loaded into Firebase once on first sign-in
- `firebase-config.js`: **you edit this** (your Firebase web config)
- `storage.js`: sign-in, cloud sync, offline cache, backup/restore
- `firestore.rules`: paste into Firebase to lock the data to your account(s)
- `.nojekyll`: tells GitHub Pages to serve the files as-is

## Setup (about 15 minutes, free Spark plan is plenty)
1. **Create the project.** Go to https://console.firebase.google.com > Add project (turn Analytics off).
2. **Add a web app.** Project overview > the `</>` icon > register the app (skip Hosting). Copy the `firebaseConfig`
   values it shows and paste them into `firebase-config.js`.
3. **Turn on Google sign-in.** Build > Authentication > Get started > Sign-in method > Google > Enable
   (choose a support email) > Save.
4. **Create the database.** Build > Firestore Database > Create database > pick a nearby region > start in
   **production mode**.
5. **Lock it down.** Firestore > Rules tab. Replace everything with the contents of `firestore.rules`, change
   `YOUR_EMAIL@gmail.com` to your Google account (add others as extra quoted, comma-separated emails), then **Publish**.
   Without this step the database would reject everyone, so don't skip it.
6. **Put the site on GitHub Pages.** New repo > upload all files from this folder (including `.nojekyll`) >
   Settings > Pages > Deploy from a branch > `main` / root.
7. **Authorize your site address.** Firebase > Authentication > Settings > Authorized domains > Add domain >
   `YOUR-USERNAME.github.io`.
8. Open your site, tap **Sign in with Google**. The starting NAILE and Ohio State Fair data loads automatically
   the first time. Sign in on your phone the same way and you'll see the same shows.

## Good to know
- The Firebase config values are not secrets. What protects your data is the sign-in plus the rules in step 5.
  Only the emails listed there can read or write.
- **Offline use:** after your first sign-in, the app keeps a local copy. At a fair with bad signal you can still
  view and enter shows; changes upload when you're back online.
- **Backup data / Restore backup** (bottom of the page) work in cloud mode too. Restore adds or overwrites records
  from the file; it doesn't delete anything.
- If you used the earlier browser-only version and entered data, an **Upload this browser's old data** button
  appears at the bottom after you sign in. Use it once, then it goes away.
- Excel/PDF export load their libraries from cdnjs.cloudflare.com, so they need an internet connection.
- Free-plan limits (50,000 reads/day, 20,000 writes/day) are far above what this app uses.

## Troubleshooting
- *"Not allowed"* after signing in: that Google account isn't in the rules list (step 5), or the rules weren't published.
- *"auth/unauthorized-domain"*: add your github.io address in step 7.
- Popup blocked on a phone: allow popups for the site, or tap the button again.
- Blank "Connecting..." screen: check the config values in `firebase-config.js` and your internet connection.
