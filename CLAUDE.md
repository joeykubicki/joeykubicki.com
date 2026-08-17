# CLAUDE.md — joeykubicki.com

This file orients Claude Code at the start of every session. Read it before making changes.

---

## What this is

Joey Kubicki's personal website — a personal/professional hybrid that doubles as a resume artifact. The point is not just the content; **the site itself is the portfolio piece.** It exists to demonstrate the owner's ability to build real, working software with AI assistance. Judge changes by that standard: things should look intentional and work correctly, because visitors are evaluating the builder, not just reading the page.

Live at **joeykubicki.com**, hosted as a static site on Cloudflare Pages.

The repo holds three things:
1. The **root site** — a single-page, four-tab personal site (About / Travel / Projects / Resume).
2. **Nested project apps** in subfolders, each deployed at `joeykubicki.com/<folder>/`.
3. The **assets** — `photos/` and the resume PDF — served from this same deploy.

## Hard constraints (do not violate)

- **No build step at the root. No framework, no bundler, no npm.** The root site is three hand-written files (`index.html`, `styles.css`, `main.js`) plus a `<script>` tag. Adding tooling defeats the point.
- **No custom server.** Static hosting only. If something appears to need a backend, say so explicitly rather than inventing one (see *Backends* below).
- **Preserve hand-tuned work.** The owner adjusts copy, spacing, and layout by eye across many small commits. Make targeted edits. Never regenerate a whole file, never "clean up" or restyle anything outside the task, and never rewrite the owner's prose voice.
- **Don't touch the nested projects from the root.** `travel-tracker-2/` has its own `CLAUDE.md` and its own rules — read that file before editing anything in it. `math-counts/` is a vendored build artifact (see below).

## Root site architecture

Three files, no dependencies beyond Google Fonts:

- **`index.html`** (~800 lines) — all four sections live in this one file, inline. Each is a `<section id="…" class="section">`; exactly one carries `.active` at a time.
- **`styles.css`** (~800 lines) — every style. `:root` CSS variables at the top for the palette (navy sidebar gradient `--blue-dark/mid/light`, newsprint `--page-bg: #f4f1ec`, `--ink`, `--rule`). Section dividers are `/* ── NAME ── */` comments. One `@media` block at the bottom handles all mobile.
- **`main.js`** (~80 lines) — three responsibilities only: tab nav, the mobile hamburger drawer, and the carousel registry.

**Design language:** an editorial / newspaper aesthetic. Playfair Display for headlines, Lato for body. White tiles with soft shadows on a warm off-white page, thin rules as separators. Keep it restrained.

**Use the `:root` variables for color** — don't hardcode new hexes.

### Navigation

`.nav-btn[data-target="X"]` shows `#X` and hides the rest. The four targets are `about`, `travel`, `projects`, `resume`. It's pure class toggling — no router, no URL hash, so **you cannot deep-link to a tab.** Adding a section means adding both a nav button and a matching `<section id>`.

### The carousel system (the one abstraction worth understanding)

Every photo carousel on the site runs through the registry in `main.js`. A carousel needs three things wired together by a short **id**:

1. A track element with `id="track-<id>"` containing N sibling slide `<div>`s.
2. Prev/next buttons and a `<div id="dots-<id>">` with one `.carousel-dot` per slide.
3. A registration line at the bottom of `main.js`: `initCarousel('<id>', N)`.

**N is the number of slides, not the number of photos.** A slide can hold one, two, or three images:

| Slide class | Inner wrapper | Photos per slide | Used by |
| --- | --- | --- | --- |
| `.carousel-slide` | *(bare `<img>`)* | 1 | trip tiles, Food Recs |
| `.carousel-slide-pair` | `.pair-photo` | 2 | Bandit tile |
| `.carousel-slide-triple` | `.triple-photo` | 3 | Math Flashcards |

The buttons call `slide(id, ±1)` / `goTo(id, i)`. `slidePair` / `goToPair` are **aliases of the same two functions** — the distinction is purely historical. Either name works on any carousel type; match whatever the surrounding tile already uses. (`pairState` in `main.js` is dead code — an empty object nothing reads.)

**The most common failure is a count mismatch:** N in `initCarousel` disagreeing with the number of slides or dots. Then the carousel scrolls into empty space or a dot never lights up. Always verify all three agree.

## Common tasks

### Add a project tile

Projects live in `#projects` inside `.newspaper-grid`. Copy an existing `.news-tile`:

```html
<div class="news-tile">
  <div class="tile-photo"><img src="https://joeykubicki.com/photos/NAME.png" alt="…" /></div>
  <div class="tile-body">
    <div class="tile-kicker">Tech / Stack / Tags</div>
    <div class="tile-headline">Project Name</div>
    <p class="tile-copy">What it is and why you built it, in the owner's first-person voice.</p>
    <a href="/folder-name/" target="_blank" rel="noopener" class="tile-cta">Give it a try!</a>
  </div>
</div>
```

The `.tile-cta` link is optional — omit it for projects that aren't live yet (Food Recs currently has none). For a carousel instead of a single photo, swap `.tile-photo` for `.tile-photo.tile-carousel` and follow the carousel rules above.

### Add a trip tile

Trips live in `#travel` inside `.trip-tiles`. Each `.trip-tile` is `.trip-left` (title, subtitle, `.trip-rule`, `.trip-text`) beside a `.carousel` with `id="carousel-<id>"`. Trip copy conventionally ends with a `<strong>Highlights:</strong>` line. Register the carousel in `main.js`.

### Add a new nested project app

1. Drop the app in a top-level folder (kebab-case, matching the URL you want).
2. Link it from a Projects tile with a root-relative `/folder-name/` href.
3. If it's a real app with its own rules, give it **its own `CLAUDE.md`** — follow the pattern in `travel-tracker-2/`.
4. Push to `main`. Cloudflare Pages picks up the new path automatically; no config to change.

## Assets and images

- **All images live in `photos/` in this repo** and deploy with the site.
- Markup references them by **absolute URL**: `https://joeykubicki.com/photos/name.jpg`. This is the established convention — match it for new images. Note the tradeoff it creates: **local preview loads production images**, so a newly added photo shows as broken until it's pushed. (Functionally, `/photos/name.jpg` would resolve to the identical file on the same deploy — the absolute form is a stylistic choice, not a hosting requirement.)
- `photos/` is ~63 MB. Compress before adding; don't let it balloon.
- Naming convention: `<short-id>-<n>.jpg` matching the carousel id (`nz-1.jpg`, `bandit-3.jpeg`, `mc-4.png`). Extensions are inconsistent (`.jpg`/`.jpeg`/`.png`) — **always check the real filename**, don't assume `.jpg`.
- `Joey_Kubicki_Resume.pdf` sits at the root and is linked from the Resume tab's download button. Replacing it is a straight file swap, same filename.

## Nested projects

### `travel-tracker-2/` — "Expedition" travel atlas

The most substantial project here. Vanilla ES-module app: Leaflet maps + Firebase Auth (Google) + Firestore, with private memories and read-only map sharing.

**Read `travel-tracker-2/CLAUDE.md` before touching anything in that folder.** It has real constraints (privacy-critical data model, map viewport rules, Firestore rules that must be published by hand in the Firebase console). Deeper detail in its `PROJECT-SUMMARY.md`, `ENGINEERING-INSTRUCTIONS.md`, and `SETUP.md`.

> **Path discrepancy:** those docs say the app lives at `/travel-tracker/`, but the folder and the live link are `/travel-tracker-2/`. The folder name is the truth. Worth reconciling one day.

### `math-counts/` — Math Flashcards web app

**A vendored build artifact — do not hand-edit.** The folder holds a compiled Vite/React bundle (`assets/index-<hash>.js` + `.css`) with no source in this repo. **The source lives in a separate local project folder on the owner's machine.**

To change this app: edit the source project, rebuild, and copy the fresh `dist/` contents into `math-counts/`. Two things to check on every copy:
- `math-counts/index.html` must reference the assets with the `/math-counts/` path prefix (Vite needs `base: '/math-counts/'`, or the paths need fixing after the fact). Getting this wrong is what the "fix url path" commit fixed.
- Asset filenames are content-hashed, so old files must be deleted, not left alongside.

## Deploy

**Cloudflare Pages, git-connected to `main`.** Push to `main` → Pages builds and deploys. There is no build command, no CI, no manual step.

- The GitHub remote is `github.com/joeykubicki/joeykubicki.com`.
- **`git push` is the deploy.** Treat every push to `main` as publishing to a live public site that the owner links from a resume. Don't push unasked.
- There's an unmerged `origin/cloudflare/workers-autoconfig` branch (a bot-generated `wrangler.jsonc` + `.gitignore`). **It is not in use** — the site is on Pages, not Workers. Ignore it unless the owner decides to migrate.
- Cloudflare Web Analytics runs via a beacon `<script>` at the bottom of `index.html`. Leave it in place when editing that region.

## Local dev

- The **root site** is plain HTML — open `index.html` directly in a browser, no server needed.
- **`travel-tracker-2/` is an ES module** and must be served over HTTP (`npx serve .` from the repo root, then visit `/travel-tracker-2/`). It will not work over `file://`.
- Remember: images load from production regardless of how you preview.

## Backends (the live open question)

The site is entirely static today and the owner wants to keep it that way where possible. But the **Food Recs** project (Google Maps/Places + OpenAI APIs) can't ship as a static page without exposing API keys in the client — that's why it has no live link.

**Never put an API key in client-side code in this repo.** When a project needs secrets or server-side work, the natural fit is **Cloudflare Pages Functions** (a `functions/` directory in this repo, deployed by the same push, with secrets set in the Cloudflare dashboard) — it keeps the "no server to run" property intact. Raise this explicitly as a decision for the owner rather than assuming it.

Note that `travel-tracker-2` solves the same problem differently — Firebase as a BaaS the client talks to directly, with security enforced by Firestore rules. Both patterns are acceptable; don't mix them into one project.

## Known gotchas

- Carousel count mismatches (see above) are the single most likely bug when adding photos.
- A missing tile link or a typo'd `/folder/` path fails silently as a 404 — verify paths against the actual folder names.
- **Never silently rewrite the owner's prose.** Copy is in a deliberate first-person voice with intentional informality (`iykyk`, trailing `~~`, em-dash asides). A spelling pass was done in Aug 2026; flag anything new you spot and let the owner decide rather than editing voice.
- **An unterminated attribute quote is silent and destructive.** A missing closing `"` (this bit the Taiwan tile once) makes the browser swallow following markup into the attribute value, collapsing the tile with no error anywhere. When markup goes strangely blank, check quotes before anything else.

## Verify before finishing

- `node --check main.js` for any JS change.
- Confirm HTML tags balance and CSS braces balance — one unclosed `<div>` in a 800-line file collapses the layout. The tile markup uses closing comments (`<!-- closes carousel-track -->`); keep them accurate.
- Every `getElementById` / `id=` pair must match: `track-<id>`, `dots-<id>`, `carousel-<id>`.
- For carousels: slide count == dot count == the N in `initCarousel`.
- Load the page and click through **all four tabs**, then check **mobile** (the hamburger drawer, and the single-column stacking in the `@media` block). The owner checks mobile.
- Confirm new image filenames and extensions match exactly what's in `photos/`.
