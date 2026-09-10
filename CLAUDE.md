# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev          # electron-vite dev (app + HMR renderer)
npm run typecheck    # both TS projects; run this — `build` runs it too
npm run build        # typecheck + bundle to out/
npm run format       # prettier --write .
npm run package      # build + electron-builder --win --publish always
```

There is no test suite and no linter beyond `tsc` + prettier. Verification is
typecheck plus running the app.

Typechecking is split into two projects with different globals, and a change can
pass one while breaking the other:

- `tsconfig.node.json` — `src/main`, `src/preload`, `src/scraper`, `src/shared` (`types: ["node"]`)
- `tsconfig.web.json` — `src/renderer/src`, `src/shared` (`types: []`, no Node globals)

## Architecture

Electron app (main / preload / renderer) that renews avto.net classifieds by
driving a real Chrome over CDP with `puppeteer-core`.

### The IPC contract

`src/shared/api.ts` declares `interface Api` — the single source of truth for
`window.api`. It is deliberately *not* derived from the preload module, so the
renderer never imports Electron types. `src/preload/index.ts` ends with
`api satisfies Api`, so the compiler proves the two agree.

Adding a channel means editing three files together: the method on `Api`, the
`ipcRenderer.invoke` wrapper in preload, and the `ipcMain.handle` in
`src/main/index.ts`. Miss one and only the typecheck catches it.

Aliases: `@shared/*` everywhere, `@/*` only in the renderer.

### Main process

`src/main/index.ts` is the whole IPC surface plus the batch loop
(`handleRenewAds`): it iterates ads, pushes `RenewProgress` events on
`renew-progress`, sleeps `pause` minutes between ads, and closes the browser in
a `finally`. `src/main/store.ts` wraps electron-store — the store name and
`userData` key are inherited from the previous app version and must not change.
`src/main/ad-images.ts` owns the saved-photo library and the `adimg://` protocol
handler (registered as privileged before `app.whenReady`).

### Scraper (`src/scraper/`, bundled into main, imports `electron`)

`browser/` owns one shared Chrome:

- Chrome 136+ refuses `--remote-debugging-port` on the default profile
  directory, so the app copies the user's chosen Chrome profile into
  `<userData>/ChromeProfile` (`browser/profile.ts`) and launches on that.
- Windows Chrome 127+ seals cookies with app-bound encryption, so the copy does
  **not** carry the avto.net session. `signInManually()` is the real login path:
  it opens the bot's Chrome on avto.net and polls every tab until one lands on
  `LOGIN_SUCCESS_URL`. `renew-ad/login-to-avtonet.ts` is only the fallback.
- Sessions are refcounted (`activeSessions` / `startedByUs`). Use
  `setupBrowser()` + `endSession(session)`; calling `closeBrowser()` directly
  while another session is driving a page produces "Navigating frame was
  detached".

`renew-ad.ts` renews one ad, and the order is destructive and irreversible:
scrape the edit form → `detectAdType` from the page heading → rewrite the *old*
ad's identifying fields (price, registration year, mileage, VIN, description)
and verify the save landed → download photos → **delete the original** →
recreate it from the originally scraped values → re-upload photos.

That rewrite is what stops avto.net matching the new ad against the archived
copy and offering to restore it instead of publishing. It belongs on the doomed
ad only — the replacement has to stay accurate for buyers. A full pre-mutation
snapshot goes to `<userData>/AdBackups/<adId>.json`, and the archived ad's
description is replaced with its own original values. `testMode` skips the mutation and the delete.
Everything that can fail is deliberately placed before `deleteOldAd`, so
throwing up to that point leaves the ad intact.

Ad type comes from the edit page's `<h1>`, not from the results list the ad was
scraped from (`ActiveAd.sourceType` is only a fallback). The three types
(`car`, `dostavna`, `platisca`) each have their own results URL and new-ad URL
in `constants.ts`.

Form data is a flat `CarField[]` of name/value pairs, not an object, because
avto.net reuses field names (all brand-compat checkboxes are `opombeznamka`,
disambiguated as `opombeznamka|BMW`). Use the helpers in `utils/car-fields.ts`.

Photos are cached under `<userData>/AdImages/<hash>` so the next renewal reuses
them. `utils/ad-images.ts` computes the directory name under four historical
naming schemes and prefers whichever already exists on disk — do not "clean
this up" without migrating users' existing directories.

### Anti-detection

`utils/human.ts` shapes *timing and pointer paths only* (log-normal delays,
Bézier mouse moves, per-character typing). Fingerprint values are intentionally
left untouched: this is the user's real Chrome and real profile, so
`navigator.webdriver` is already false and overriding anything would swap
consistent facts for detectable lies. Keep it that way. The batch's inter-ad
pause serves the same purpose.

### Renderer

React 18 + react-router `MemoryRouter` + Tailwind v4 + shadcn/ui (new-york).
Four pages: `Pregled` (overview/readiness), `ObnoviOglase` (batch),
`SlikeOglasov` (photo editor), `Konfiguracija`.

Four nested context providers in `App.tsx` — `Account` → `Update` → `Browser` →
`Renew`. `RenewProvider` lives above the router because a batch runs for hours
and must survive navigation. `lib/readiness.ts` composes them into the four
gates that must all pass before a renewal may start (renewal deletes the ad
first, so the gate is not cosmetic).

`src/renderer/src/config.ts` holds `MAINTENANCE_MODE` — flipping it to `true`
replaces the entire UI with a notice — and the licence server URL.

## Conventions

- **All user-facing text and thrown error messages are in Slovenian.** Errors
  from main/scraper surface verbatim in the UI, so they must say what the user
  should do. Code, comments and identifiers are English.
- Comments explain *why*, usually recording a failure that motivated the code
  (a Chrome behaviour, an avto.net quirk, a legacy-compat constraint). Match
  that; don't add comments restating what the line does.
- `src/renderer/src/components/ui` and `hooks` are shadcn CLI output and are
  prettier-ignored on purpose. Note the generated files import `cn` from the
  `cn` **npm package**, not from `@/lib/utils` (which does not exist despite
  what `components.json` claims) — fix the import after `shadcn add`.
- Prettier: single quotes, 100 columns.

## Releasing

Every push to `master` runs `.github/workflows/release.yml`, which bumps the
patch version, builds, commits `chore: release vX.Y.Z [skip release]`, tags and
publishes a Windows NSIS installer to GitHub Releases. Do not bump `version` in
`package.json` by hand. Put `[skip release]` in a commit message to skip it
(docs-only pushes are already ignored via `paths-ignore`).

`electron-builder.yml`'s `appId`, `productName`, the absent `nsis:` block and
the `publish:` block are pinned to what shipped to existing installs — changing
any of them breaks upgrades or the update feed for users already out there.
