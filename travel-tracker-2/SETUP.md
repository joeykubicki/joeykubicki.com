# Expedition — Cloud Sync Setup Guide

Your travel atlas now supports **Google sign-in** with each person's selections and
memories stored in their own private cloud profile (Firebase Auth + Firestore).
The app still works without signing in — it just falls back to that browser's
local storage like before.

This guide takes about 15–20 minutes. You only do it once.

---

## What's in this folder

| File | What it is |
|---|---|
| `index.html` | Updated page — adds the account area in the header, loads `app.js` as a module |
| `app.js` | Updated app — sign-in flow, cloud save/load, sync indicator; all map/list/memories logic unchanged |
| `styles.css` | Your stylesheet plus a new "Account / Sign-in" section at the bottom |
| `firebase-config.js` | **You edit this one** — paste your Firebase project config here (Step 4) |
| `firestore.rules` | Security rules — paste into the Firebase console (Step 5) |

---

## Step 1 — Create a Firebase project

1. Go to https://console.firebase.google.com and sign in with your Google account.
2. Click **Create a project** (it may say "Add project").
3. Name it something like `expedition-travel` → Continue.
4. **Google Analytics:** turn it **off** (you don't need it) → Create project.
5. Wait for it to finish, then click **Continue** to land on the project dashboard.

## Step 2 — Register a web app

1. On the project dashboard, click the **`</>` (Web)** icon under "Get started by adding Firebase to your app."
2. App nickname: `expedition` → click **Register app**.
   (Leave "Firebase Hosting" **unchecked** — you're hosting on Cloudflare.)
3. You'll be shown a `firebaseConfig` code block. **Keep this tab open** — you'll copy these values in Step 4. (You can always find them again later under ⚙️ **Project settings → General → Your apps**.)

## Step 3 — Turn on Google sign-in

1. In the left sidebar: **Build → Authentication** → click **Get started**.
2. Under **Sign-in method**, click **Google** → toggle **Enable**.
3. Set the **public-facing project name** (e.g. "Expedition Travel Atlas") and pick your email as the **support email**. This is what friends see on the Google consent popup.
4. Click **Save**.

### Authorize your domain

1. Still in Authentication, go to the **Settings** tab → **Authorized domains**.
2. Click **Add domain** and add: `joeykubicki.com`
   (`localhost` is already on the list for local testing. Subfolders like
   `/travel-tracker` don't matter — only the domain does.)

## Step 4 — Paste your config into `firebase-config.js`

1. Open `firebase-config.js` in this folder.
2. Replace the placeholder values with the ones from Step 2 (Project settings → General → Your apps → **Config**). It should end up looking like:

```js
export const firebaseConfig = {
  apiKey:            "AIzaSyB...",
  authDomain:        "expedition-travel.firebaseapp.com",
  projectId:         "expedition-travel",
  storageBucket:     "expedition-travel.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId:             "1:1234567890:web:abc123..."
};
```

> These values are **not secrets** — they just identify your project. Anyone can
> see them in your page source and that's fine. Access control comes from the
> security rules (Step 5) and the authorized-domains list (Step 3), not from
> hiding the config.

## Step 5 — Create the Firestore database + apply security rules

1. Left sidebar: **Build → Firestore Database** → **Create database**.
2. Location: pick a US region (e.g. `nam5 (United States)` or `us-east1`) → Next.
3. Choose **Start in production mode** → **Create**. (Production mode = locked down by default; our rules open exactly what's needed.)
4. Once created, open the **Rules** tab.
5. Delete what's there and paste the entire contents of `firestore.rules` from this folder.
6. Click **Publish**.

What the rules do: each signed-in user can read/write **only** the document
`users/{their-own-uid}` — nobody can read anyone else's memories, and
signed-out visitors can't touch the database at all.

## Step 6 — Test locally

Because `app.js` is now a JavaScript **module**, you can't just double-click
`index.html` from your file system (browsers block module imports on `file://`).
Run any tiny local server from this folder instead:

```bash
# pick whichever you have:
npx serve .
# or
python3 -m http.server 8000
```

Then open `http://localhost:8000` (or whatever port it prints) and:

1. The app should load exactly like before (signed out = local mode, "Local only" indicator).
2. Click **Sign in with Google** in the header → pick your account.
3. Your existing local data (everything you've already marked) gets **migrated to your cloud profile automatically** on first sign-in.
4. Toggle a park — you should see the indicator flick to "Saving…" then "Synced."
5. Confirm in the console: **Firestore Database → Data** — you'll see a `users` collection with one document (your UID) containing your parks/states/countries/memories.
6. Open the site in a different browser or incognito window, sign in with the same account — your map should appear. That's the cloud sync working.

## Step 7 — Deploy to Cloudflare

Since you're already deploying a static site to Cloudflare, this is just adding a folder:

1. In your site's repo/project, create a `travel-tracker/` folder.
2. Put these five files in it: `index.html`, `app.js`, `styles.css`, `firebase-config.js`, `firestore.rules`*.
3. Deploy the way you normally do.
4. Visit `https://joeykubicki.com/travel-tracker/` and sign in to confirm it works in production.

\* `firestore.rules` doesn't need to be deployed (it lives in the Firebase console) — it's just good to keep in the repo so the rules are version-controlled alongside the app.

## Step 8 — Share with friends

Send them the link. Each friend signs in with their own Google account and gets
their own private map. Nothing else required on your end — no invites, no user
management.

---

## How the data flows (for reference)

- **Signed out:** saves go to that browser's `localStorage` (`expedition.v1`), exactly like the original app.
- **Signed in:** saves go to Firestore at `users/{uid}` — debounced ~0.7s so rapid clicking is one write. The header indicator shows Saving… / Synced / Offline.
- **First sign-in for an account:** if no cloud profile exists yet, whatever is in that browser's localStorage is uploaded as the starting profile (this is how *your* existing data survives the upgrade).
- **Sign out:** the view returns to the browser's local data. One person signing in on a friend's laptop never mixes data with the laptop owner's.
- The GeoJSON map cache stays in localStorage regardless — it's shared map geometry, not personal data.

## Cost / limits sanity check

Firestore free tier (no card required): 1 GB storage, 50,000 reads + 20,000 writes **per day**.
A user profile here is a few KB. Even 1,000 active friends clicking around daily
would use a small fraction of that. You will almost certainly never pay anything.

## Troubleshooting

**"This domain is not authorized" popup / `auth/unauthorized-domain` in console**
→ Step 3's "Authorize your domain" wasn't done, or you're testing from a domain not on the list. Add the exact domain (no path) under Authentication → Settings → Authorized domains.

**Sign-in popup opens then immediately closes, or nothing happens**
→ Popup blocker. The app automatically falls back to a full-page redirect; if that also fails, check the browser console for the error code.

**`Missing or insufficient permissions` in console**
→ The security rules weren't published (Step 5), or were pasted with a typo. Re-paste `firestore.rules` and Publish.

**App loads but the Sign in button never appears**
→ `firebase-config.js` still has the `YOUR_API_KEY` placeholders — the app detects this and hides sign-in (check the console for the warning message).

**Blank page when opening index.html directly from your file system**
→ Modules require a server. Use `npx serve .` or `python3 -m http.server` (Step 6).

## Nice-to-haves for later (just ask)

- **Export/Import JSON button** — personal backups, plus a way to move data between accounts.
- **Live sync across open tabs** — Firestore's `onSnapshot` makes the map update in real time if you have it open on two devices.
- **Public share links** — a read-only view of someone's map (`?u=...`) so friends can compare. Needs a small rules change.
- **App Check** — extra abuse protection for the Firestore API; overkill at this scale but easy to add.
