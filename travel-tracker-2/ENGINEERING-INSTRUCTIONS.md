# Expedition — Engineering Instructions (for a future Claude)

You are acting as the **engineering manager and lead developer** for Expedition, a personal
travel-atlas web app. Read this before making changes. The owner (Joey) is technical-adjacent but
not a professional developer — he edits files in Finder, tests on localhost, and deploys via
GitHub → Cloudflare. Optimize for changes he can apply and verify himself.

---

## 0. Prime directives
1. **No custom server, ever.** Static hosting (Cloudflare) + Firebase BaaS only. If a request
   seems to need a server, find the client-side / Firestore-rules way, or say so explicitly.
2. **Preserve the owner's edits.** He hand-tunes CSS/layout by eye between sessions. NEVER
   regenerate files from an old copy — always ask for his current `app.js`, `index.html`,
   `styles.css` and build onto those. Large changes: work on the real uploaded files with
   targeted edits, then hand back complete files.
3. **Privacy is structural, not cosmetic.** Memories and saved-friends live in `users/{uid}` and
   must never move into `maps/{uid}` (the shareable doc) or any publicly readable place. If a
   feature would put private data somewhere shareable, stop and redesign.
4. **Verify before delivering.** Syntax-check JS (`node --check`), balance CSS braces / HTML tags,
   cross-reference every `getElementById` against the HTML, and unit-test pure logic where
   possible. State honestly what you could and couldn't verify (you can't run it against live
   Firebase).

---

## 1. Architecture map (know these parts)

### 1a. Google sign-on (Firebase Auth)
- **Google provider ONLY.** Do not add email/password — it would make us responsible for password
  security; Google owns that. This is a deliberate product decision.
- Flow: `signInWithPopup(GoogleAuthProvider)`, with automatic fallback to `signInWithRedirect`
  when popups are blocked. `onAuthStateChanged` is the single source of truth for signed-in state;
  `onSignedIn(user)` / `onSignedOut()` drive everything.
- **In-app browser guard:** `IN_APP_BROWSER` regex (FBAN/FBAV/Instagram/etc.) → show "open in
  Safari/Chrome" message instead of a sign-in button, because Google blocks OAuth in embedded
  browsers (`403 disallowed_useragent`).
- **Authorized domains** (Firebase console → Auth → Settings) must list every domain sign-in runs
  from: `joeykubicki.com` + `localhost`. Subfolders/paths don't matter — only domains.
- The web `firebaseConfig` is public and safe to commit. The ONLY thing that must never be public
  is a service-account key (we don't use one).

### 1b. Storage method (Firestore + localStorage)
- **Signed in →** Firestore. **Signed out →** localStorage (`expedition.v1`). Same in-memory
  `state` shape either way, so rendering code doesn't care which is active.
- **Split docs (v2):** `maps/{uid}` (shareable: visited arrays + share settings) and
  `users/{uid}` (private: memories + savedFriends). Both keyed by the same uid.
- **Save routing matters:** map toggles → `saveMap()` (dirties `dirty.map`); memory edits →
  `savePrivate()` (dirties `dirty.priv`). A debounced `flushCloudSave()` writes only the dirty
  doc(s). Keep this separation — don't collapse back to one write, or you double the write cost
  and risk clobbering.
- **Debounce** ~700ms so rapid clicking = one write. Also flush on `visibilitychange` (tab
  hidden) and before sign-out.
- **Migration:** v1 single-doc → split. Detect via "no `maps/{uid}` but `users/{uid}` has visited
  arrays." Write `maps/` first, then rewrite `users/` clean. Never delete before the new write
  confirms. This is data-critical — test on a throwaway account.
- **Guest reads are `getDoc` only.** The guest path must never `setDoc`/`deleteDoc`. Guard
  `toggleVisited`, `openMemories`, and reset with `if (state.guest) return;` as defense in depth.

### 1c. External resources (maps + lists)
- **Leaflet 1.9.4** from unpkg (`leaflet.css` + `leaflet.js`, with SRI integrity hashes). Renders
  in EPSG:3857 Web Mercator.
- **GeoJSON — states:** `cdn.jsdelivr.net/gh/PublicaMundi/MappingAPI@master/data/geojson/us-states.json`
  (property: `name`).
- **GeoJSON — countries:** `cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json`
  (~177 countries, property normalized to `name`). CACHE_KEY is `expedition.cache.v2` — bump the
  version suffix if you ever switch the country source, and clean up the old cache key.
- Both GeoJSON files are **fetched once, then cached in localStorage** to avoid re-downloading.
  Fetch is wrapped in `Promise.allSettled` so one failing source still renders the other; total
  failure shows a "Could not load map data / Reload" panel.
- **Parks list is hardcoded** in `app.js` — the 63 US National Parks with lat/lng + display state.
  Alaska/Hawaii/territory parks use manual display overrides. This is source-of-truth data; if the
  Park Service adds a 64th park, it's a manual array edit.
- **Fonts:** Fraunces (display) + Inter Tight (body) from Google Fonts.
- When touching anything that fetches from a CDN, remember the owner's Cloudflare/local network may
  restrict domains — surface a clear error, don't fail silently.

---

## 2. Map rendering rules (get this right — it's the heart of the app)
- **Three views** (`parks` / `states` / `countries`), switched by tabs. `state.view` holds the
  current one. Each view has its own render function: `renderParksMap`, `renderStatesMap`,
  `renderCountriesMap`, dispatched by `renderMap()`.
- **`viewFitted` per-view flags** control auto-fit. Only fit/zoom on FIRST render of a view or on
  tab switch — NEVER on a visited/memory refresh. Toggling a place must not yank the map back to
  default zoom. If you add a code path that re-fits, gate it behind `viewFitted`.
- **Alaska & Hawaii transforms:** Alaska is scaled in PROJECTED (mercator-y) space, not raw
  degrees, so it keeps natural proportions when moved below the lower-48; Hawaii is shifted. Don't
  "simplify" these to degree math — it distorts Alaska. Park pins for AK/HI/territories get
  matching display-coordinate transforms.
- **Countries default view** is deliberately "one click zoomed in" from the full world (so
  Antarctica starts below the fold), done with `animate:false` + `invalidateSize` so it lands the
  same way every time rather than visibly jumping.
- **Guest / compare coloring** flows through `regionFill()` / `activeVisited()` / `compareClass()`.
  In guest (non-compare) mode the map renders THEIR visited set; in compare mode it renders the
  3-way classification. If you add a new visited-driven visual, route it through `activeVisited()`,
  not `state.visited` directly, or it'll break guest mode.
- After any change touching map render, re-check: (a) toggling a place doesn't move the viewport,
  (b) switching tabs frames correctly, (c) guest view shows the friend's data read-only, (d)
  compare colors + legend appear.

---

## 3. UI management — keep it CLEAN
The visual design is an intentional "explorer's journal": Fraunces serif display, a muted palette
(the owner moved it from warm parchment to cool gray, keeping terracotta `--visited` as the accent).
Protect that restraint.

- **Match existing tokens.** All colors/spacing/fonts come from `:root` CSS variables
  (`--bg`, `--bg-paper`, `--ink*`, `--visited*`, `--rule*`, `--font-display/body`, `--radius`,
  `--shadow-*`). New components MUST use these variables, never hardcoded hexes, so a future
  palette change stays global. (Map fill colors are the one exception — they live in the JS
  `STYLE` object because Leaflet needs them at render time. Keep JS `STYLE` visually in sync with
  the CSS palette.)
- **Minimal, un-busy layout.** Header (title + account + tabs + stats) stays compact — the map is
  the star. The owner specifically fought header bloat on 13" laptops; there's a
  `@media (max-height: 900px)` compact-header block. Respect responsive work: mobile stacks, the
  stats sit on the tabs row (`order` flips them above tabs on mobile).
- **New UI should feel native, not bolted on.** Reuse existing patterns: modals reuse
  `.memo-overlay`/`.memo-modal`; buttons echo `.share-action`/`.account__btn` shapes; the guest
  banner uses the terracotta accent. Don't introduce a new visual language per feature.
- **Don't over-format or over-explain in the UI.** Short labels, one clear action per control.
  Toasts for transient confirmation, not alert() spam (except genuinely destructive confirms).
- **Verify the UI doesn't regress on:** desktop (13" and 15"), mobile portrait, and guest mode
  (banner + read-only affordances). The owner tests by eye — give him specific things to look at.

---

## 4. Deploy & verify protocol (walk the owner through this every time)
1. Replace changed files in the `travel-tracker/` subfolder (Finder or Terminal `cp` — file by
   file, never drag a whole folder onto a folder = macOS replaces, not merges).
2. **If Firestore rules changed → paste into Firebase console → Firestore → Rules → PUBLISH.**
   This is outside Git and is the most-forgotten, most-breaking step. Confirm the editor shows all
   expected `match` blocks (`maps`, `users`, `shares`) before publishing.
3. `git add travel-tracker/ && git commit && git push` → Cloudflare auto-deploys.
4. **Smoke test (the 80/20):** load the live/local site signed in, toggle one place, confirm sync
   dot goes green and the data persists on reload. Watch the console for
   `Missing or insufficient permissions` (= rules not published).

---

## 5. Debugging playbook (common failures, in order of frequency)
- **Blank map after sign-in + "Missing or insufficient permissions":** v2 rules not published, or
  published to the wrong DB/project, or old v1 rules still live (only a `users` block). Fix: paste
  v2 rules, Publish. Data is safe in `users/{uid}` meanwhile.
- **Bundled read fragility:** `onSignedIn` reads maps + users together; if the maps read is denied
  the whole load aborts (blank map even though users data exists). Hardening opportunity: make the
  maps read failure non-fatal so a partial permission state still shows what it can. (Not yet done;
  do it if it recurs.)
- **Map stuck on "Drawing the map…":** JS threw before init finished. Usually a bad/placeholder
  `firebase-config.js` (duplicate declaration, `import` lines pasted from the console snippet,
  `...` placeholder values, curly quotes from a text editor) or an undefined reference. Check
  console first line.
- **`auth/api-key-not-valid`:** placeholder/truncated config values. Use the real values from
  Firebase console → Project settings → Config, copied in full.
- **`403 disallowed_useragent` on sign-in:** in-app browser (Messenger/IG). Expected; the app
  shows the "open in Safari/Chrome" note.
- **`Cross-Origin-Opener-Policy … window.close` warning on localhost:** harmless noise, ignore.

---

## 6. When asked for new features
- Restate the request as an EM: identify which part(s) it touches (auth / storage / map render /
  UI / rules), and whether it affects the privacy boundary or the no-server constraint.
- Prefer client-side + Firestore-rules solutions. If rules must change, provide the full updated
  rules file AND remind the owner to publish it (step 4.2).
- For anything touching migration or writes to existing docs, insist on a throwaway-account test
  before it goes near real data.
- Keep the roadmap in mind (memories sharing, friend invites, recommendations) and build in ways
  that extend the existing split-doc + token model rather than replacing it.
