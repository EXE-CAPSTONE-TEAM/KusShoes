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

- [x] **T09 — Real storage usage** (Sidebar + Dashboard show a fixed "1.4 GB of 5 GB")
  Lane: BE+FE + DECISION. BE `UsageResponse` has no storage fields.
  **Decided 2026-09-29: show used storage only** (sum of the user's project assets + exports), no
  per-plan limit, no upload enforcement. Widget shows "X used" without a bar denominator.

- [x] **T10 — Profile fields with no BE column**
  Lane: BE+FE + DECISION. Settings accepts Primary Role, Studio Name, Studio Location, Instagram,
  Behance, TikTok but never saves them. **Decided 2026-09-29: add DB columns and save them**
  (migration + `UpdateProfileRequest` + `UserDetailResponse`). Preset avatars stay preview-only.

- [x] **T11 — Project visibility (Private / Link / Public)**
  Lane: BE+FE + DECISION. The wizard's visibility choice and the card menu do nothing
  ("not exposed by the backend yet"). **Decided 2026-09-29: hide the visibility controls** —
  sharing goes through artisan links (T02).

- [x] **T12 — "Cloud Synced Scans" in the wizard**
  Lane: BE+FE + DECISION. The list is the user's existing projects, not mobile scans; picking one
  creates an empty project named "… Remix". **Decided 2026-09-29: remove the tab** — mobile scans
  already create their own project; the wizard offers "start empty" or "upload a model".

- [x] **T13 — MoMo button**
  Lane: BE+FE. BE has MoMo behind `MOMO_ENABLED`; FE hardcodes "Coming Soon". Acceptance: BE
  exposes enabled gateways (e.g. on `/plans` or a config endpoint), FE enables MoMo from that.

- [x] **T14 — Landing newsletter form**
  The form fakes success for 3 s; there is no BE endpoint.
  **Decided 2026-09-29: remove the signup form.** Newsletters will be posted by admin later
  (separate ticket when needed); no public subscription for now.

- [x] **T15 — Landing stat counters (12 400+, 3 150+, …)**
  **Decided 2026-09-29: keep the marketing numbers for now.** No change.

- [x] **T16 — Trigger a bake/export from the web**
  Lane: DECISION. `POST /projects/{id}/bake` (+ status/retry/cancel) is unused by the web.
  **Decided 2026-09-29: no web bake; web may only export — and only if an export does not
  push server RAM/CPU into overload.**
  Findings (code): bake *is* the export. Since migration 028 the 3D work runs on KusStudio
  Desktop; the file goes desktop → R2 via a presigned URL and never passes through the API. Per
  output the API only does DB writes + HEAD + a 512-byte ranged GET + an R2-side CopyObject.
  Downloads are presigned R2 URLs too. The web already downloads exports (T07, project page) and
  cannot start a bake (service/editor token only) — i.e. the decision is already the current
  behaviour; no code change.
  Measurement (`BE/scripts/bench/export_path_*.py`, commit c0cf3f1, AMD Ryzen 7 7735HS, single
  uvicorn worker like prod, APP_ENV=production, local Postgres 16, storage stubbed because prod
  storage is R2 off the VM; 2 runs × 284 export flows = trigger + claim + complete, glb+obj):
  | phase | server CPU per op (run 1 / run 2) | p95 latency | server RSS after |
  |---|---|---|---|
  | GET /users/me (baseline) | 6.3 / 6.0 ms | 31 ms | 163 / 169 MiB |
  | export, sequential | 55.3 / 31.0 ms | 111 / 104 ms | 163 / 169 MiB |
  | export, 10 parallel | 56.5 / 46.3 ms | 1.3 s / 0.8 s | 166 / 169 MiB |
  | export, 20 parallel | 63.1 / 59.6 ms | 2.5 s / 2.4 s | 169 / 170 MiB |
  RAM stayed flat (156 MiB idle → 170 MiB after 568 exports; peak = final). CPU is the only
  cost: ~5–10× an ordinary GET, and parallel exports queue (latency grows) rather than use more
  memory. Not measured on the prod VM (GCP e2-small, 2 vCPU / 2 GB; SSH không có sẵn ở đây), whose
  shared vCPUs are slower than this machine, so absolute ms there will be higher.

## Batch 3 — Marketing & Google Analytics 4 (GA4) Dashboard

- [x] **T17 — BE: GA4 Service & Marketing Analytics Service (Hybrid Top/Bottom-of-funnel)**
  Lane: BE. Files: `BE/app/services/ga4_service.py`, `BE/app/services/marketing_analytics_service.py`, `BE/app/config.py`.
  Acceptance:
  - `ga4_service.py`: Queries GA4 Data API v1beta for active users, new users, sessions, pageviews, engagement rate, avg duration, geography (city/country), and sources. Supports realtime active visitors (30-min window). Graceful unconfigured state if credentials missing.
  - `marketing_analytics_service.py`: Aggregates GA4 traffic with PostgreSQL `user_attributions` + `invoices` for end-to-end platform scorecard and conversion funnel.

- [x] **T18 — BE: Marketing Analytics Router, Schemas & Redis Caching**
  Lane: BE. Files: `BE/app/schemas/analytics.py`, `BE/app/routers/admin_analytics.py`.
  Acceptance:
  - `GET /api/v1/admin/analytics/marketing` (date_from, date_to, country) cached in Redis for 15 minutes.
  - `GET /api/v1/admin/analytics/marketing/realtime` cached for 30s.
  - `POST /api/v1/admin/analytics/marketing/test-connection` verifies GA4 credentials and reports status.

- [x] **T19 — FE: Marketing Analytics API Client & TypeScript Types**
  Lane: FE. Files: `FE/src/types/admin.ts`, `FE/src/api/adminClient.ts`.
  Acceptance:
  - Type definitions for `MarketingAnalyticsResponse`, `PlatformScorecardItem`, `GeoLocationItem`, `MarketingFunnelStep`.
  - Methods in `adminAnalytics` client to query marketing report, realtime, and test connection.

- [x] **T20 — FE: Marketing Tab UI on /admin/analytics**
  Lane: FE. Files: `FE/src/pages/Admin/Analytics/AdminAnalytics.tsx`, `FE/src/pages/Admin/Analytics/Marketing/*`.
  Acceptance:
  - New tab "Marketing & Lưu lượng" in `AdminAnalytics.tsx`.
  - 4 Hero KPI cards + Realtime active visitor indicator.
  - Multi-tier Platform Performance Scorecard table.
  - Geographic distribution by City and Country filter.
  - Marketing Conversion Funnel visualization.
  - Fallback Setup Guide modal/card when GA4 credentials are not configured.

- [x] **T21 — FE: Admin Dashboard Marketing Summary Widget**
  Lane: FE. File: `FE/src/pages/Admin/Dashboard/AdminDashboard.tsx`.
  Acceptance:
  - Summary widget displaying new visitors, top referral channel, and realtime online count.
  - Direct navigation link to `/admin/analytics?tab=marketing`.

- [x] **T22 — Verification & Harness Testing**
  Lane: BE+FE. Files: Tests in `BE/tests/` and `./harness/verify.sh`.
  Acceptance:
  - Tests covering marketing analytics service & router.
  - `./harness/verify.sh` passes with Exit Code 0.

- [x] **T23 — GA4 sign-off gaps (T21 widget, deep-link, router tests)**
  Lane: BE+FE (SMALL, ≤3 files). Files: `FE/src/pages/Admin/Dashboard/AdminDashboard.tsx`, `FE/src/pages/Admin/Analytics/AdminAnalytics.tsx`, `BE/unit_tests/test_marketing_analytics.py`.
  Found by Stage 5.5 audit of PR #68 (T17–T22 were merged as PENDING_REVIEW):
  - T21: the marketing widget shows realtime count + top channel only; add **new visitors** (from `getMarketing()` response, no fabricated fallback — show "—" when GA4 unconfigured).
  - T21: widget click only calls `navigate('analytics')`; it must land on the Marketing tab. Admin nav is pathname-based (`AdminApp.tsx`), so `history.pushState` to `/admin/analytics?tab=marketing` before `navigate('analytics')`, and `AdminAnalytics` must initialise `activeTab` from `?tab=` (valid `ActiveTab` values only, default `'all'`).
  - T22: no router-level tests. Add tests for `GET /analytics/marketing` (cache hit skips GA4 call; miss writes with ex=900), `/marketing/realtime` (ex=30), `POST /marketing/test-connection` (unconfigured → reports status, not 500), reusing existing fakes in the file.
  Acceptance: `npx tsc -b` clean, `npx oxlint` clean on touched files, `pytest BE/unit_tests/test_marketing_analytics.py` green, `./harness/verify.sh --strict` exit 0.

