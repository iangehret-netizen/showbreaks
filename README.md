# Weigh-Break Recorder (static site)

Records weigh breaks by class for each show, averages them across years, and exports to Excel or PDF.
Pure static files: no server, no database, no build step.

## Put it on GitHub Pages
1. Create a new repository on github.com (for example `weigh-breaks`).
2. Click **Add file > Upload files** and drag in everything from this folder
   (`index.html`, `seed.js`, `storage.js`, `.nojekyll`, `README.md`). Commit.
3. Go to **Settings > Pages**. Under **Build and deployment** choose **Deploy from a branch**,
   branch `main`, folder `/ (root)`, then Save.
4. After a minute the site is live at `https://YOUR-USERNAME.github.io/weigh-breaks/`.

Note: GitHub Pages sites are public to anyone with the link (unless you are on GitHub Enterprise).

## Where the data lives
- Everything you enter is saved in the browser you use (localStorage). There is no shared database.
  Another phone, computer, or browser starts with only the starting data in `seed.js`.
- Use **Backup data** (bottom of the page) to download a `.json` file, and **Restore backup** to load it
  on another device. Do a backup after each show you enter.
- Clearing browser data for the site erases it, so keep a backup.

## Starting data
`seed.js` holds NAILE 2018-2025 and Ohio State Fair 2026. It is only loaded the first time the site is
opened in a browser. Editing `seed.js` later will not change browsers that have already loaded it.

## Excel / PDF export
These load their libraries from cdnjs.cloudflare.com, so they need an internet connection.
