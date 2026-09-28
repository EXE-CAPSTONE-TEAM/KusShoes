# KusShoes — Wire mocked FE flows to the backend

Source: FE mock/hardcode audit, 2026-09-29 (branch `feat/wire-mocked-fe-flows`).
Legend: `[ ]` open · `[x]` done · **Lane**: FE = frontend only (BE endpoint exists) ·
BE+FE = needs backend work · DECISION = blocked on a product decision from T AK.

## Batch 1 — FE only, backend already exists

- [x] **T01 — Create-project wizard: real GLB upload + real editor launch**
  Lane: FE. Files: `FE/src/pages/Projects/Projects.tsx`, `FE/src/api/studio.ts`,
  `FE/src/pages/ProjectDetails/ModelPanel.tsx`.
  Today step 3 waits a 2 s `setTimeout`, shows "App launched!" and never opens KusStudio; the
  "Upload custom .GLB" file is never uploaded (only its name is used).
  Acceptance:
  - Upload source: after `createProject`, the file goes through `assets/upload-url` → PUT →
    `assets/confirm` (same flow as ModelPanel, extracted into one shared helper).
  - Then `createEditorLaunch(projectId)` is called and `desktopUrl` opened.
  - Status lines show the real step (creating / uploading / launching) — no fake
    "daemon ping (Port 8421)" text.
  - If upload or launch fails after the project was created, the project stays in the list and
    the error names which step failed.

- [x] **T02 — Project-card "Share" opens the real share panel**
  Lane: FE. Files: `Projects.tsx`, `ProjectDetails.tsx`, `App.tsx`.
  Today the Share modal says "Share links are not exposed by the backend yet", but artisan links
  exist (`ArtisanSharePanel`). Acceptance: Share navigates to `/project-details?id=…&tab=share`
  and ProjectDetails opens on that tab.

- [x] **T03 — Landing pricing reads plans from the API**
  Lane: FE. File: `FE/src/pages/Landing/Landing.tsx`.
  Today prices are hardcoded (259k / 649k, yearly = monthly × 12). Acceptance: uses
  `api.listPlans()` like `PricingPage.tsx`; yearly price is the real yearly plan; loading/error
  state rendered; plan names/features keep the i18n copy.

- [x] **T04 — Delete dead `FE/src/components/site/*`**
  Lane: FE. Nothing imports this folder; it contains a fake "Try Demo" auth and stale prices
  (199k / 499k). Acceptance: folder removed, `npm run build` and tests pass.

- [x] **T05 — Project list follows the cursor**
  Lane: FE. File: `FE/src/api/client.ts` (`listProjects`), `App.tsx`.
  Today only the first 100 projects are loaded. Acceptance: all pages are fetched.

- [x] **T06 — Settings exposes the profile fields BE already stores**
  Lane: FE. File: `FE/src/pages/Settings/Settings.tsx`, `LanguageSwitcher.tsx`.
  `PATCH /users/me` accepts `username`, `phone_number`, `language`; the UI has no input for them
  and the language switcher only saves locally. Acceptance: username + phone editable and saved;
  language switch is persisted to the profile when signed in; BE validation errors surface.

- [x] **T07 — "My exports" list**
  Lane: FE. `GET /api/v1/exports` (all exports of the user) is unused. Acceptance: a list with
  project, format, date and a download button (`/exports/{id}/download-url`).

- [x] **T08 — Admin: mark a user as internal**
  Lane: FE. `POST /api/v1/admin/users/{id}/internal` has no button in `UserSupportActions`.

## Batch 2 — needs backend work

- [ ] **T09 — Real storage usage** (Sidebar + Dashboard show a fixed "1.4 GB of 5 GB")
  Lane: BE+FE + DECISION. BE `UsageResponse` has no storage fields.
  Decision needed: what counts toward storage (assets? exports? scans?) and the per-plan limit.

- [ ] **T10 — Profile fields with no BE column**
  Lane: BE+FE + DECISION. Settings accepts Primary Role, Studio Name, Studio Location, Instagram,
  Behance, TikTok but never saves them. Decision: add columns (migration) or remove the inputs.
  Preset avatars are preview-only for the same reason.

- [ ] **T11 — Project visibility (Private / Link / Public)**
  Lane: BE+FE + DECISION. The wizard's visibility choice and the card menu do nothing
  ("not exposed by the backend yet"). Decision: build visibility in BE, or remove the controls.

- [ ] **T12 — "Cloud Synced Scans" in the wizard**
  Lane: BE+FE + DECISION. The list is the user's existing projects, not mobile scans; picking one
  creates an empty project named "… Remix". Decision: add a user-facing scans endpoint, turn it
  into a real "duplicate project", or remove the tab.

- [ ] **T13 — MoMo button**
  Lane: BE+FE. BE has MoMo behind `MOMO_ENABLED`; FE hardcodes "Coming Soon". Acceptance: BE
  exposes enabled gateways (e.g. on `/plans` or a config endpoint), FE enables MoMo from that.

- [ ] **T14 — Landing newsletter form**
  Lane: DECISION. The form fakes success for 3 s; there is no BE endpoint. Build one or remove it.

- [ ] **T15 — Landing stat counters (12 400+, 3 150+, …)**
  Lane: DECISION. Fixed marketing numbers. Keep, or back them with a public stats endpoint.

- [ ] **T16 — Trigger a bake/export from the web**
  Lane: DECISION. `POST /projects/{id}/bake` (+ status/retry/cancel) is unused by the web.
  Decide whether web users may start exports or it stays desktop-only.
