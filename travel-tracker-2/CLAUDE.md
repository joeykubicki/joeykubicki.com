# CLAUDE.md — Expedition (Travel Atlas)

This file orients Claude Code at the start of every session. Read it before making changes. For deeper detail see `PROJECT-SUMMARY.md` and `ENGINEERING-INSTRUCTIONS.md` in this repo.

---

## What this is

A personal travel-tracking web app. Users mark visited US National Parks, US states, and countries on interactive maps and save private memories per place. Multi-user via Google sign-in, with cloud sync and read-only map sharing. Deployed as a static site on Cloudflare at **joeykubicki.com/travel-tracker/**.

## Hard constraints (do not violate)

- **No custom server, ever.** Static hosting \+ Firebase (Auth \+ Firestore) only. If something seems to need a backend, solve it client-side or via Firestore rules, or say so explicitly.  
- **Privacy is structural.** Memories and saved-friends live in `users/{uid}` (private) and must NEVER move into `maps/{uid}` (shareable) or any publicly readable location.  
- **Preserve hand-tuned edits.** The owner adjusts CSS/layout by eye. Prefer targeted edits over regenerating whole files. Don't "clean up" or restyle things that aren't part of the task.  
- **Google sign-in only.** Never add email/password auth — Google owns password security.

## Tech stack

Vanilla HTML/CSS/JS, no framework, no build step. ES modules. Leaflet 1.9.4 (CDN) for maps. Firebase Auth (Google) \+ Cloud Firestore. localStorage as signed-out fallback \+ GeoJSON cache.

## Files

- `index.html` — markup. `styles.css` — all styles (token-driven). `app.js` — the whole app (ES module).  
- `firebase-config.js` — public Firebase config (safe to commit; NOT a secret).  
- `firestore.rules` — security rules. **Lives in the repo for versioning but is applied by pasting into the Firebase console → Firestore → Rules → Publish. Pushing to git does nothing on its own.**

## Data model (Firestore, keyed by uid)

- `maps/{uid}` — SHAREABLE: visited parks/states/countries \+ `shareEnabled` \+ `shareToken` \+ `displayName`. Readable by others only when `shareEnabled === true`.  
- `users/{uid}` — PRIVATE, owner-only: `memories` \+ `savedFriends`. Never shared.  
- `shares/{token}` — PUBLIC lookup `{ uid }` so a share link resolves. No personal data. Map and memories share the uid key so they stay paired.

## Storage / save routing (keep this separation)

- Signed in → Firestore; signed out → localStorage (`expedition.v1`). Same in-memory `state` shape.  
- Map toggles → `saveMap()` (dirties `dirty.map`). Memory edits → `savePrivate()` (dirties `dirty.priv`). Debounced `flushCloudSave()` writes only the dirty doc(s). Don't collapse to one write.  
- Guest mode (`state.guest`) is READ-ONLY: `getDoc` only, never `setDoc`/`deleteDoc`. `toggleVisited`, `openMemories`, and reset are guarded with `if (state.guest) return;`.

## Map rendering rules (the heart of the app)

- Three views (`parks`/`states`/`countries`) via `renderParksMap`/`renderStatesMap`/`renderCountriesMap`.  
- `viewFitted` per-view flags: auto-fit/zoom ONLY on first render or tab switch — NEVER on a visited/memory refresh (toggling a place must not move the viewport). Gate any re-fit behind these.  
- Alaska is scaled in PROJECTED mercator-y space (not raw degrees) to keep its shape; Hawaii is shifted. Don't simplify these to degree math. Park pins for AK/HI/territories have matching transforms.  
- Countries default view is deliberately one zoom step in from the full world (Antarctica below fold), done with `animate:false` so it lands identically every time.  
- Visited-driven visuals must route through `activeVisited()` / `regionFill()` / `compareClass()`, not `state.visited` directly, or guest/compare modes break.

## External data sources

- States GeoJSON: `cdn.jsdelivr.net/gh/PublicaMundi/MappingAPI@master/data/geojson/us-states.json`  
- Countries GeoJSON: `cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json`  
- Cached in localStorage under `expedition.cache.v2` (bump the suffix \+ clean old key if source changes).  
- The 63 National Parks are a hardcoded array in `app.js` (source of truth; manual edit to change).

## UI / design principles

- "Explorer's journal" aesthetic: Fraunces (display) \+ Inter Tight (body), cool-gray palette with terracotta `--visited` accent. Keep it restrained and uncluttered — the map is the star.  
- Use `:root` CSS variables for all colors/spacing/fonts — never hardcoded hexes. (Exception: map fill colors live in the JS `STYLE` object because Leaflet needs them at render; keep it in sync with the CSS palette.)  
- Reuse existing patterns for new UI (modals reuse `.memo-overlay`/`.memo-modal`; buttons echo `.share-action`/`.account__btn`). Don't invent a new visual language per feature.  
- Respect responsive work: compact-header `@media (max-height: 900px)` block for 13" laptops; mobile stacks and moves stats above tabs. Verify desktop (13"/15"), mobile portrait, and guest mode.

## Dev & deploy

- ES module → must be served over HTTP for local dev (`npx serve .` or `python3 -m http.server`), not opened via `file://`.  
- Deploy: edit files → (if rules changed) publish rules in Firebase console → `git push` → Cloudflare auto-deploys. **Publishing rules is the most-forgotten, most-breaking step.**  
- Smoke test after deploy: signed in, toggle one place, confirm it saves (sync dot green) and persists on reload. Watch console for `Missing or insufficient permissions` (= rules not published).

## Known gotchas

- Blank map \+ "Missing or insufficient permissions" → v2 rules not published (or wrong project/DB).  
- Stuck on "Drawing the map…" → JS threw early; usually bad `firebase-config.js` (placeholder values, pasted `import` lines, curly quotes) or an undefined reference. Check console line 1\.  
- `403 disallowed_useragent` on sign-in → in-app browser (Messenger/IG); app shows an "open in Safari/Chrome" note. Expected.  
- `Cross-Origin-Opener-Policy … window.close` warning on localhost → harmless, ignore.

## Verify before finishing (do this on every change)

- `node --check` the JS (module: copy to a `.mjs` or check syntax).  
- Balance CSS braces and HTML tags; cross-check every `getElementById` against the HTML.  
- For map changes, confirm: toggling doesn't move the viewport; tab switches frame correctly; guest view is read-only; compare colors \+ legend appear.  
- For anything touching migration or writes to existing docs, recommend a throwaway-account test before it goes near real data.

## Roadmap (build on the existing model, don't replace it)

Memories sharing (finer-grained than map sharing), mutual friend invites/requests, and recommendations ("places they've been that you haven't"). The split-doc \+ share-token \+ saved-friend-pointer design is the foundation for all three.  
