# LiftLog – PWA Workout Tracker

Track your lifts. Store everything in your own Google Drive.

---

## Setup: Google OAuth Credentials

You need a Google Cloud OAuth Client ID to let the app access your Drive.

### Step 1 — Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Click the project dropdown (top left) → **New Project**
3. Name it `LiftLog` (or anything you like) → **Create**

### Step 2 — Enable the Google Drive API

1. In the left sidebar: **APIs & Services → Library**
2. Search for **Google Drive API** → click it → **Enable**

### Step 3 — Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** → **Create**
3. Fill in:
   - App name: `LiftLog`
   - User support email: your email
   - Developer contact: your email
4. Click **Save and Continue** through the remaining steps (no scopes needed here)
5. On the final screen, click **Back to Dashboard**
6. Under **Test users**, click **+ Add Users** and add your own Google email

### Step 4 — Create OAuth credentials

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: `LiftLog Web`
5. Under **Authorised JavaScript origins**, add the origin where you'll serve the app.
   - For local development: `http://localhost:8080` (or whichever port you use)
   - For production: `https://yourdomain.com`
6. Leave **Authorised redirect URIs** empty (not needed for this flow)
7. Click **Create**
8. Copy the **Client ID** (looks like `xxxx.apps.googleusercontent.com`)

### Step 5 — Run the app

Serve the `workout-tracker/` folder over HTTP (it must be served, not opened as `file://`):

```bash
# Python
cd workout-tracker
python3 -m http.server 8080

# Or npx (if you have Node)
npx serve workout-tracker -p 8080
```

Open `http://localhost:8080` in your browser. Paste your Client ID when prompted.

### Step 6 — Install as PWA (iOS Safari)

1. Open the app in Safari on your iPhone/iPad
2. Tap the **Share** button → **Add to Home Screen**
3. Tap **Add** — it now works like a native app

---

## Features

| Feature | Details |
|---|---|
| **Workout logging** | Log sets, weight (kg), and reps per exercise |
| **Session timer** | Tracks elapsed time during a workout |
| **Last session reference** | Shows your previous sets while logging |
| **History** | All past sessions with duration and volume stats |
| **Personal bests** | Best weight × reps per exercise |
| **Estimated 1RM** | Epley formula: weight × (1 + reps/30) |
| **Progress chart** | Estimated 1RM over time per exercise |
| **Workout plan editor** | Rename days, add/remove/reorder exercises, add/remove days |
| **Google Drive sync** | All data in one JSON file in your Drive |
| **PWA / installable** | Add to home screen on iOS Safari and Android Chrome |
| **Offline shell** | App loads offline after first visit; sync resumes on reconnect |

---

## Data storage

Everything is stored in a single file called `workout-tracker-data.json` in your Google Drive. You can open, download, or delete it at any time from drive.google.com. The app only has access to files it created (`drive.file` scope) — it cannot read any other files in your Drive.

---

## Hosting on GitHub Pages

1. Push the `workout-tracker/` folder to a GitHub repo
2. Go to **Settings → Pages** → deploy from `main` branch, root folder
3. Add `https://yourusername.github.io` to the Authorised JavaScript origins in Google Cloud Console
4. Open `https://yourusername.github.io/workout-tracker/`

---

## Local development tips

- Changes to the workout plan auto-save to Drive after a 1.5-second debounce
- The sync indicator (dot in the header) shows: yellow = saving, green = saved, red = error
- If the token expires (after ~1 hour), the app will prompt you to sign in again
- To reset everything: sign out, delete `workout-tracker-data.json` from your Drive, clear `localStorage`
