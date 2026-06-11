# Leave Tracker — Backend setup (click-by-click)

This connects the website to a Google Sheet so the whole team shares one set of
data (instead of each browser keeping its own copy). ~10 minutes, all clicking.

## 1. Make the Sheet + Apps Script

1. Go to **https://sheets.google.com** and create a **blank spreadsheet**.
   Name it **"CabGlass Leave Tracker"**.
2. In that sheet, menu **Extensions → Apps Script**. A code editor opens in a new tab.
3. Delete whatever is in the `Code.gs` box, then **paste the entire contents of
   `apps-script/Code.gs`** from this project.
4. Click the **Save** icon (💾).

## 2. Set the secret

1. In the Apps Script editor, left sidebar → **Project Settings** (the ⚙️ gear).
2. Scroll to **Script Properties → Add script property**.
3. Property = `DASHBOARD_SECRET`, Value = a long random string of your choice.
   Example: `LeaveTracker-2026-CHANGE-ME-9f3k2`. **Write it down** — you'll paste
   the same value into Vercel in step 5. (Don't reuse the courier app's secret.)
4. **Save script properties.**

## 3. Create the tabs + seed the logins

1. Back in the **Editor** (`< >` icon). In the function dropdown at the top,
   choose **`setup`**, then click **Run**.
2. First run asks for permission — **Review permissions → pick your Google
   account → Allow.** (It only touches this one spreadsheet.)
3. Switch to the spreadsheet tab: you should now see **Users** and
   **LeaveRequests** tabs, with the 8 staff seeded in Users.

## 4. Publish the API (Deploy)

1. In the Apps Script editor, top right **Deploy → New deployment**.
2. Click the ⚙️ next to "Select type" → **Web app**.
3. Set **Execute as: Me**, **Who has access: Anyone**. (Access is still
   protected by the secret — "Anyone" just lets the website reach it.)
4. **Deploy** → Authorize if asked → **copy the Web app URL**. It looks like
   `https://script.google.com/macros/s/AKfy.....X/exec`. Keep it for step 5.

> ⚠️ **Every time you edit Code.gs later:** Save → **Deploy → Manage deployments
> → edit ✏️ → Version: "New version" → Deploy.** If you skip "New version" the
> old code stays live. Confirm by opening `<your URL>?action=ping` — it should
> show the version string in `Code.gs` (currently `2026-06-leave-v1`).

## 5. Point the website at it (Vercel)

1. Go to **https://vercel.com**, open the **leave-tracker** project.
2. **Settings → Environment Variables → Add** two variables (Production):
   - `VITE_API_URL` = the Web app URL from step 4
   - `VITE_API_SECRET` = the exact secret from step 2
3. **Save.** Then **Deployments → … on the latest → Redeploy** (env vars only
   take effect on a fresh build).
4. Open the site. Log in with `admin` / `admin123`. You're now on shared data —
   anything you change shows up for everyone.

## Quick checks if something's off
- **`?action=ping` in the browser** shows the version → Code.gs is live.
- Login fails for everyone → `VITE_API_SECRET` (Vercel) must equal
  `DASHBOARD_SECRET` (Apps Script) exactly; redeploy after changing either.
- Site loads but shows the old demo data → env vars not set, or you didn't
  Redeploy after adding them (it's still on local mock data).

## First thing to do once live
Log in and change everyone's seed passwords (they're all `<username>123`).
Note: passwords are stored in plain text in the Sheet — fine for an internal
8-person tool, but move to Google sign-in before any wider rollout.
