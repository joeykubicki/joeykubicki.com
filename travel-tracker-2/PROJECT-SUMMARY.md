# Expedition — Travel Atlas — Project Summary

## What this is
**Expedition** is a personal travel-tracking web app ("a travel atlas"). A user marks which
US **National Parks**, **US States**, and **Countries** they've visited on interactive maps,
and can save private **memories** per place (notes, favorite hikes for parks, favorite cities
for states/countries, and favorite memories). It started as a local-only single-page app and
has grown into a multi-user app with Google sign-in, cloud sync, and map sharing.

Lives at **joeykubicki.com/travel-tracker/** (a subfolder of the owner's personal site), hosted
as a static site on **Cloudflare**. The owner is Joey Kubicki; friends (target < 1000) each sign
in and keep their own private map.

## Tech stack (deliberately server-less)
- **Frontend:** vanilla HTML/CSS/JS, no framework, no build step. Three core files: `index.html`,
  `styles.css`, `app.js` (ES module). Plus `firebase-config.js`.
- **Maps:** [Leaflet](https://leafletjs.com) 1.9.4 (via unpkg CDN).
- **Auth:** Firebase Auth, **Google sign-in only** (no email/password by design — Google handles
  all password security).
- **Storage:** Cloud Firestore (free tier). localStorage is the signed-out fallback + GeoJSON cache.
- **Hosting:** Cloudflare static hosting. Firebase is a separate BaaS the client talks to directly.
- **No custom server anywhere.** This is a hard constraint the owner values.

## Data model (Firestore) — the important part
Three collections, all keyed by the user's Firebase `uid`:
- **`maps/{uid}`** — SHAREABLE. Visited parks/states/countries arrays + `shareEnabled` +
  `shareToken` + `displayName`. Readable by others only when `shareEnabled === true`.
- **`users/{uid}`** — PRIVATE, owner-only forever. `memories` + `savedFriends`. Never shared.
- **`shares/{token}`** — PUBLIC lookup `{ uid }`. Lets a share link resolve token → uid. Holds
  nothing personal.

The map/private split exists so sharing can NEVER leak private memories — they're in a different
document that no share rule touches. Map and memories stay paired because both use the same uid.

## Sharing / social features (v2, shipped)
- **Link sharing:** owner toggles sharing on → app mints a random `shareToken`, writes a public
  `shares/{token}` doc, flips `shareEnabled`. Link looks like `…/travel-tracker/?m=TOKEN`.
- **Guest view:** opening a `?m=token` link loads that person's map READ-ONLY into a separate
  `state.guest` object. The viewer's own data is never read into or written from this path
  (enforced in code AND by Firestore rules). A banner shows "Viewing [name]'s map — Exit".
- **Compare:** overlays own vs guest — Both / Only you / Only them, with a legend and an
  "in common" count.
- **Saved friends:** stores the friend's token (a POINTER, not a snapshot) in the private doc.
  Reopening re-fetches their CURRENT map live, so their updates always show. Dead links (sharing
  off / token regenerated) degrade to a friendly message.

## Revocation model (known tradeoff, by design)
- Turning sharing **OFF** = hard revoke (map unreadable immediately).
- **Regenerating** the token kills the old link, but someone who already resolved your uid could
  still read while sharing stays on. Acceptable for a friends-among-friends travel app.

## Migration
v1 stored everything in a single `users/{uid}` doc. On first v2 sign-in the app auto-splits it:
writes `maps/{uid}` first (data safety), then trims the arrays out of `users/{uid}`, preserving
memories. Runs once, silently.

## Deploy workflow
Files live in a `travel-tracker/` subfolder of the personal-site repo. Owner edits in Finder,
commits, pushes to GitHub → Cloudflare auto-deploys. **`firestore.rules` is separate** — it must
be pasted into the Firebase console (Firestore → Rules → Publish); pushing it to Git does nothing
on its own. Forgetting to publish rules is the #1 breakage (causes "Missing or insufficient
permissions" and a blank map).

## Firebase project specifics
- Project ID: `travel-tracker-ec6ad`. Web config lives in `firebase-config.js` (safe to commit —
  it's a public identifier, not a secret; real secrets would be service-account keys, which this
  app doesn't use).
- Authorized domains must include `joeykubicki.com` (and `localhost` for dev, already default).

## Known constraints / gotchas learned the hard way
- App is an ES **module** (`<script type="module">`) → can't be opened via `file://`; needs a
  local server (`npx serve .` or `python3 -m http.server`) for dev.
- Google sign-in is blocked inside in-app browsers (Messenger/Instagram/etc.) → app detects this
  and shows an "open in Safari/Chrome" note instead of a broken sign-in.
- On localhost, a harmless `Cross-Origin-Opener-Policy … window.close` console warning appears
  after sign-in; it does not break anything.

## Roadmap (not yet built)
Memories sharing, mutual friend invites/requests, and travel recommendations ("places they've
been that you haven't"). The v2 split model + share tokens + saved-friend pointers are the
foundation these build on — nothing gets thrown away.
