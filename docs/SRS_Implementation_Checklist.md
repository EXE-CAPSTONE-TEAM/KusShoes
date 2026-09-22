# KusShoes — SRS v2.2 Backend Implementation Checklist

Scope: backend (`BE/`) plus the minimum frontend changes needed to keep the app compiling. Mobile (scan pipeline) is out of scope.

Legend: `[x]` done · `[~]` partial · `[ ]` not done · `[-]` out of scope

## Verification status

- Backend: ruff clean apart from one pre-existing `UP046` in `app/schemas/admin.py`; the full pytest suite (321 tests) plus `unit_tests` (35) pass in Docker against a throwaway Postgres, and the whole migration chain (`001` → `026`) applies cleanly to an empty database and downgrades back to `023` without leftovers.
- Frontend: `tsc`, `oxlint` and the production build are clean; 35 vitest tests pass (13 more live-contract tests run only with `KUS_LIVE_API`, and were run once against a real local backend).
- The Neon database has **not** been touched: migrations `017`–`026` are not applied there. Revision `016` exists twice in the history of some environments, so check `alembic_version` before upgrading (the plan-sync migration is now `016b`, and `023` re-creates `design_revisions` idempotently).
- PayOS / MoMo clients follow the public specs; they have not been tried against a real sandbox.
- TOTP is a from-scratch RFC 6238 implementation (stdlib only) — checked with a computed code in the live-contract test, not with a real authenticator app.
- Browser pass: the Landing page was opened in headless Edge at iPhone width (390×844); the other screens were verified through component tests, not visually in a browser.

## §3.2.8 / UC-08 — Plans and subscription

- [x] Plan table matches §3.2.8 (BR-92): tiers Free/Basic/Pro, quotas, AI credits, layer caps and Draw Artwork flag stored on the plan; editable in the admin plans UI
- [x] Yearly plans hidden, rows kept but inactive (BR-93)
- [x] Free tier has 0 exports (BR-99)
- [x] Upgrade proration (BR-24): `(new − old) × days left ÷ cycle`, rounded up to 1,000đ; applied at checkout; expiry date and usage window kept on activation
- [x] No auto-renewal (BR-25): cancel only changes domain state, never calls a gateway
- [x] Grace state (BR-90): 3 days view/edit/save after expiry, exports blocked, then automatic downgrade to Free (SF-09)
- [x] Renewal reminders (SF-17): T-3 and T-1 emails, plus a notice on entering grace (T0)
- [x] Downgrade over the project limit (BR-27): most recently edited projects stay editable, the rest go read-only; a payment unlocks them
- [x] Cycle-anchored quota (BR-23, SF-08), computed on demand: Free rolls every 30 days from signup, paid moves only on payment
- [x] Project cap (BR-46) checks the live project count (previously a monthly-resetting counter that allowed exceeding the limit)
- [~] AI credits: limit is shown correctly, but nothing consumes credits (AI background removal does not exist)
- [~] Layer cap (BR-52/58): only the project-wide total (stickers + texts) is enforced
  - the studio has no zones, so the 5-per-zone rule cannot apply
  - there is no Draw Artwork tool, so BR-57 has nothing to gate
- [x] Credit ledger and Credit purchase (BR-94, UC-27): `scan_credits` ledger; checkout for an ACTIVE Basic/Pro plan only (GRACE refused), at most `CREDIT_MAX_PER_CYCLE` per cycle including pending checkouts (MSG51), 12-month expiry, credits survive the cycle reset, used credits are non-refundable (a refund revokes only the available ones), idempotent webhook minting, a "Credit quét × n" receipt line, daily expiry task. Credit purchases count as revenue but never as MRR / churn
- [x] Plan-first-then-Credit deduction order (BR-23 detail): intake gates on mobile bootstrap (MSG28 with the reset date; SF-14 budget suspension MSG43; GRACE refused per BR-90), charge on scan completion (`confirm_output` → `consume_scan`: plan scans first, then the oldest-expiring Credit), safe against replayed and concurrent completions; internal consume/status endpoints for the scan service. Note: there is no intake reservation (BR-35 is out of scope), so scans started in parallel before any of them completes are all delivered, but only charged while quota remains

## UC-09 — Payment (PayOS / MoMo, Polar removed)

- [x] Checkout creates a pending invoice and returns the gateway link (PayOS or MoMo)
- [x] Webhook / IPN handling (SF-05, BR-29): signature verified, amount matched, idempotent; subscription activates only from a verified webhook
- [x] No card fields on our pages (BR-96)
- [x] Invoice stores list price, discount, amount paid, gateway reference and order code (BR-31 data)
- [x] Refund ledger entry created by an admin; original invoice stays unchanged (BR-97)
- [x] Refund policy (BR-97): automatic only within 7 days and with no export since payment; otherwise needs an explicit admin override; a full refund of the current plan downgrades to Free
- [x] Receipt PDF (SF-18, BR-31): immutable `KUS-00001` number from a DB sequence, content frozen in `receipt_snapshot`, bundled Roboto font for Vietnamese, name shortened only with academic-report consent (BR-88), masked email, file name `KUS-{n}-{slug}-{ddmmyy}.pdf`, 15-min signed download
- [x] PENDING-over-30-minutes cancel job (SF-06, BR-30), every 5 minutes; a late webhook on a cancelled invoice still activates and is logged
- [x] "Đang xác nhận" (MSG29): `GET /subscription/invoices/{id}` for the success page to poll; receipt returns 409 until issued
- [x] Coupons (BR-26): percent / fixed / fixed-price, plan filter, validity window, use cap, 1 use per account, 1,000đ minimum charge, no stacking with proration; Early Bird (BR-91) is a first-payment-only fixed-price coupon
- [x] VAT toggle (BR-28): `VAT_ENABLED` (default off until there is a legal entity, SRS :2782); VAT is extracted from the listed price, never added; shown on the invoice, coupon preview and receipt only when on; frozen in the receipt snapshot; admin tax-config endpoint
- [x] Manual transactions (BR-95, UC-28): maker/checker (self-approval blocked), proof-image upload, approve → activates plan + receipt, reject; audited
- [x] Reporting-period lock (BR-98, UC-29): open/lock periods; manual transactions and refunds dated inside a locked period are rejected
- [x] COMP grants (BR-103): flagged on the subscription, no invoice, excluded from revenue metrics

## Studio, export and content

- [x] Locked projects cannot be edited, deleted or baked (BR-27)
- [x] Content guardrail (SF-04, BR-54): text ≤ 20 chars; banned terms block the save; trademark terms need `copyrightConfirmed`; whole-word, accent-insensitive matching; admin CRUD with audit; also applied to templates and on bake
- [ ] AI background removal (SF-03)
- [x] Template gallery (UC-15): approved templates listed, applied to a project with the layer cap, guardrail and edit lock; admin create / approve / reject
- [x] Version history (BR-46): a version per distinct save, restore writes a new latest version, unpinned versions capped per plan (20 / 20 / 50), the config sent to a bake is pinned and never pruned
- [~] Export locks editing (BR-45): saves are rejected (`PROJECT_EXPORTING`) while a bake queued < 5 min ago is still active; the two-device lock (BR-100) is not built
- [~] Reference-pack PDF (SF-07, BR-71): disclaimer, colours, text/fonts, layer list, version and date, QR; **no** 4-angle renders or flattened zone images (there is no server-side renderer)
- [x] Artisan links (UC-26, SF-20, BR-101): paid plan and not in grace, from an export, only the SHA-256 of the token is stored, 30 days / 20 downloads, revoke and renew, public no-auth endpoints with IP rate limit, signed URLs ≤ 15 min, every failure answers the same 410 (MSG48)
- [~] Free-tier watermark (BR-65): policy from the subscription tier, `GET /projects/{id}/preview-image` stamps the image and caps the long edge at 1080px for Free (BR-67), `export_records.is_watermarked`, a watermark block in the bake payload. **Gaps:** no renderer/worker reads the payload flag yet, client-side render downloads are not routed through the stamped endpoint, and meshes/video are not watermarked

## Account and security (UC-01 to UC-07)

- [x] 2FA (BR-12/13): TOTP (RFC 6238, stdlib-only) and Email methods; setup/enable/disable; 10 one-time recovery codes; login gate via a short-lived challenge token (`/auth/2fa/verify`); recovery email required before enabling Email-method 2FA
- [~] Admin 2FA is not force-enforced (BR-12 says mandatory for Admin) — admins have no route to enable it yet since `/users/me/2fa/*` sits behind the customer auth gate, not the admin one
- [x] New-device login alert (BR-14): email sent when a login's (IP, user-agent) pair has no prior successful login on record
- [x] BR-86 lockout: 5 wrong passwords / 15 min, tracked per-account and per-IP (distinct from the existing generic rate limiter), with an email alert on lockout
- [x] Login history (BR-18): every login attempt (success/fail) recorded; user-facing IP is last-octet-masked; 90-day purge job added to the daily beat schedule
- [x] Privacy settings (BR-15): public profile / show designs / searchable / analytics / ads-personalization, all off by default
- [x] Consent records (BR-89): ToS + privacy-policy + age-confirmation written at registration; opt-in/revocable marketing-content, academic-report and cookie consents via `/users/me/consents`
- [x] Data export (SF-11, BR-19): zips profile + project metadata + consents + login history, 1/24h, 15-min signed URL — binary assets (GLB/textures) are **not** bundled (simplification)
- [x] Data import from backup (BR-20): the BR-19 export now carries an HMAC-signed manifest; upload-url / confirm / history endpoints; checksum and signature verified; imported as new copies (" (nhập lại)"), never overwriting, and counted against the BR-46 project cap (MSG08 on rejection). Binary assets are not part of the backup. A backup is not bound to the exporting account
- [x] Delete-account recovery and purge (BR-06): restore by emailed 6-digit code within 30 days (uniform answer, no enumeration, 5 attempts); after 30 days the row is anonymised (invoices kept for accounting) and files/projects removed; a stale scheduled task can never purge a restored account
- [x] Username rules (BR-10): reserved-word blocklist, case-insensitive uniqueness (functional index), 30-day change cooldown
- [x] Age check (BR-02): required `age_confirmed` flag on registration (schema-validated) + FE checkbox now sends it; a consent record is written
- [x] Unverified accounts blocked from paying and exporting (BR-03): payment was already covered by the existing global email-verification gate on `get_current_user`; added an explicit check to the export/bake path, which runs behind the service token and previously bypassed that gate entirely
- [~] UTM/referral attribution (BR-84/85): captured and stored on the user at registration; no sales-rep ref-code admin management, no 30-day first-touch cookie capture (inherently a frontend concern), and it isn't locked at first payment
- [x] Internal-account flag (BR-83): `User.is_internal` + admin toggle endpoint; now excluded from analytics, reports and feedback statistics

Already present before this work and untouched: register, login, Google OAuth, OTP verification, password reset, listing and revoking sessions.

## Admin, reporting and other

- [x] Impersonation (BR-80): admin with 2FA only, reason required, 30-minute token with no refresh, blocked from payment / password / account deletion / 2FA settings, audited start and end, customer emailed afterwards; the response carries the banner text
- [x] Admin-initiated password reset: the customer is emailed the usual recovery code, the admin never sees or sets a password; audited
- [x] Analytics (§5.4, BR-83/103/104/105): MRR, ARR, ARPU, paying customers, recognised revenue (paid − refunds) with previous-period comparison, churn (EXE201 definition), NRR/GRR, Free→paid, repeat rate with the not-yet-due group split out, failed payments (30 d), revenue by plan, monthly series, revenue movement, top customers. Movement and NRR/GRR are cash-based approximations because there is no MRR history table
- [~] Reports (SF-16, UC-22): revenue, users, `Sổ giao dịch EXE201` (BR-106 column order) and channel funnel by week (BR-107) as CSV / XLSX / PDF on demand; **not** built: scheduled reports with email delivery, design / plan / export-activity / moderation reports. API cost by day (BR-108) is now built (see SF-14)
- [x] Feedback module (UC-25, BR-109): rating 1–5, one form per 14 days, 4P group, admin triage NEW → REVIEWED → PLANNED → DONE / WONT_DO with a public "what changed" note, internal accounts excluded, XLSX export, summary
- [x] Content moderation (BR-77, UC-24): public copyright/trademark report intake (IP rate-limited), admin triage, 3-level ladder: warning → 30-day public-sharing restriction (new artisan links refused, existing links answer MSG48 410) → account suspension (its artisan links also stop working, SRS :1171); decisions are audited; `/moderation/me`
- [~] API cost tracker (SF-14): per-call cost ledger including failed calls (GMT+7 business day), admin monthly budget with a one-time admin email at 80% and scan-intake suspension at 100% (MSG43, customer quota untouched, enforced on mobile bootstrap), internal-account cap of 10 scans, daily check task, BR-108 daily CSV report. **Gap:** nothing records calls yet (the scan/Kiri pipeline does not POST `/internal/api-cost/calls`), so spend stays at 0 and the thresholds and internal cap never trigger in practice
- [~] Data retention (SF-10): trashed projects now kept 30 days then purged (BR-47, was 7), deleted accounts purged after 30 days, login history 90 days; other retention classes not covered
- [-] Scan pipeline (SF-01/02, UC-10/11, BR-33–42) — mobile is out of scope

## Supporting changes

- [x] Frontend updated to the new API: PayOS/MoMo pay buttons in `Billing.tsx`, Polar portal removed, `AdminBilling`, `AdminPlans`, `PricingPage`, `client.ts` and admin types aligned
- [x] Registration form now sends `age_confirmed` (BR-02) — the existing "I agree to ToS" checkbox in `Login.tsx` was relabeled to also cover the age confirmation, since the backend now rejects registration without it
- [x] New `tests/test_subscription_lifecycle.py` (layer cap, project lock, grace export block, grace → downgrade → lock flow, proration); `test_billing.py` rewritten for PayOS/MoMo
- [x] New `tests/test_account_security_features.py` (lockout, new-device email, privacy defaults, username cooldown/reserved words, consent grant/revoke, masked login history, data export, TOTP setup/enable/login/recovery-code, 2FA disable, admin internal-flag toggle)
- [x] Locked projects (BR-27) show a "Read-only" badge; rename and delete are disabled, restore/apply-template are disabled on the detail page
- [x] 2FA setup / enable / disable / recovery codes, the two-step login (authenticator, email, recovery code), active sessions, sign-in history, privacy toggles, consents, data export, account deletion with password, forgot-password and deleted-account restore are all wired to the API (Settings → Security / Privacy and the Login page)

## Files added or changed (main ones)

- Migrations: `017_rebuild_payment_gateway.py`, `018_subscription_grace_and_quota_anchor.py`, `019_account_security.py`, `020_finance_receipts_coupons_periods.py`, `021_studio_versions_guardrail_templates_artisan.py`, `022_feedback.py`
- New (finance): `receipt_service`, `coupon_service`, `finance_service`, `period_service`, `app/assets/fonts`
- New (studio): `version_service`, `guardrail_service`, `template_service`, `artisan_service`, `reference_pack_service`
- New (admin): `feedback_service`, `analytics_service`, `report_service`; impersonation in `admin_service`
- New tests: `test_finance.py`, `test_studio.py`, `test_retention.py`, `test_feedback.py`, `test_analytics.py`, `test_impersonation.py`
- New (billing): `payos_client.py`, `momo_client.py`, `quota_service.py`, `refund.py` (model), `refund_repo.py`
- New (account/security): `totp.py`, `twofa_store.py`, `login_guard.py`, `twofa_service.py`, `consent_record.py`/`login_history.py`/`recovery_code.py` (models) + matching repos
- Rewritten: `billing_service.py`, `maintenance_service.py`
- Heavily extended: `auth_service.py` (login flow: lockout, 2FA gate, login history, new-device email), `user_service.py` (privacy, consents, username change, data export)
- Removed: `polar_client.py`

## Frontend for the backend flows (portal and admin)

Portal (English, same glass-panel layout as the existing pages):
- [x] Billing: promo code on the plan comparison, receipt download (KUS-xxxxx), grace-period banner, and the PayOS/MoMo return pages (`/billing/success`, `/billing/cancel`) that poll until the webhook settles the invoice (MSG29)
- [x] Project detail: version history with restore, template gallery, artisan share links (create once / renew / revoke) and the PDF reference pack; the earlier placeholder collaborator-invite UI was removed because the backend has no such feature
- [x] Feedback page (rating, 4P group, cooldown notice, the team's "what we changed" reply)
- [x] Impersonation banner with a countdown and an "end session" button

Admin (Vietnamese, same tables/dialogs as the existing admin pages):
- [x] Analytics: KPI tiles with previous-period comparison, revenue series and by plan, movement, top customers, and report downloads (CSV / XLSX / PDF)
- [x] Content: guardrail rules and template review
- [x] Feedback triage with XLSX export
- [x] Billing: manual transactions (proof upload, approve / reject), reporting-period lock, coupons, refund with a reason and BR-97 override
- [x] Users: grant a complimentary plan, act as the customer (BR-80), send a password-reset code

How it is verified: `tsc`, `oxlint`, the production build, component tests with the API mocked, and `src/api/liveContract.test.ts`, which runs the same API layer against a real backend (2FA lifecycle with a computed TOTP code, studio flows including the PDF, admin analytics, impersonation). The live suite is skipped unless `KUS_LIVE_API` is set.

Not done in the frontend: an admin 2FA setup screen (the backend only exposes 2FA to customers, so impersonation cannot be used until an admin has 2FA enabled), scheduled reports, and a screenshot/browser pass — the screens were not opened in a real browser.

## Landing, theme and layout polish (FE)

- [x] SC-01 Landing is responsive for phones, using the iPhone (390×844) as the reference: hamburger menu with Products / Workflow / Features / Pricing and Sign In / Register, safe-area insets (`viewport-fit=cover`), 44px tap targets, full-width hero buttons, one-column cards and pricing; the mouse-trail particle effect is skipped on touch screens
- [x] Dark / Light theme switches with a smooth View Transition (class fallback when unsupported)
- [x] SC-09…SC-15 Settings re-laid out with horizontal tabs and a header banner; Projects has a proper empty state (first-run welcome, "no match" for filters, loading skeleton) and smaller project-card corners
- [ ] SC-05 About and SC-33 legal pages (ToS / Privacy / Refund with version numbers, NFR-LEG-06) — not built
- [ ] Landing content from SC-01 that is not there yet: team section and FAQ

## Coverage by use case (SRS §2.2)

| UC | Topic | Status |
| :-- | :-- | :-- |
| UC-01 | Register / login, Google OAuth | [x] existing; age confirmation, lockout and 2FA step added. Mobile guest mode is out of scope |
| UC-02 | Dashboard | [x] existing page (plan, quota, recent projects); not re-audited against SC-06 |
| UC-03 | Profile | [~] existing profile fields; username rules and cooldown added; avatar / favourite styles not re-audited |
| UC-04 | Password and 2FA | [x] Authenticator and Email 2FA with recovery codes; [ ] SMS 2FA |
| UC-05 | Privacy | [x] toggles and consents (BR-15, BR-89) |
| UC-06 | Devices and login history | [x] sessions list / revoke, masked login history; location is not resolved |
| UC-07 | Export / import / delete data | [x] export .zip, deletion with 30-day restore, import from backup (BR-20); [ ] clear cache |
| UC-08 | Plans and upgrade | [x] see §3.2.8 |
| UC-09 | Payment | [x] PayOS and MoMo; [ ] VNPay |
| UC-10, UC-11 | Scan and export raw scan | [-] mobile pipeline out of scope |
| UC-12 | Base models | [x] existing model picker on project creation |
| UC-13 | My Designs | [x] status filters, rename, delete, restore; lock badge |
| UC-14 | Kus Studio tools | [~] text, images, stickers exist; [ ] AI background removal, [ ] Draw Artwork |
| UC-15 | Templates | [x] gallery and apply, admin review |
| UC-16 | Preview and Bake | [x] bake with export lock; the 3D viewer needs a running backend |
| UC-17 | Export and reference pack | [~] GLB/OBJ export and PDF pack; no 4-angle renders |
| UC-18 | Team workspace | [-] Phase 2 |
| UC-19 | Admin dashboard | [x] existing |
| UC-20 | Manage users | [x] list, filters, plan grant, password-reset code, internal flag, impersonation; [ ] admin 2FA setup screen |
| UC-21 | Revenue analytics | [x] |
| UC-22 | Reports | [~] on-demand CSV / XLSX / PDF for revenue, users, ledger, funnel; [ ] scheduled email reports, design / plan / export / moderation reports |
| UC-23 | Plans and guardrail config | [x] |
| UC-24 | Moderation | [x] template review, copyright-complaint handling with the BR-77 ladder |
| UC-25 | Feedback | [x] portal form and admin triage |
| UC-26 | Artisan links | [x] creation and revoke in the portal; public viewer endpoints (SC-34 has no dedicated FE page yet) |
| UC-27 | Buy scan Credit | [x] purchase via PayOS/MoMo, ledger, cap, expiry, spent on scan completion |
| UC-28 | Manual transactions and refunds | [x] |
| UC-29 | Period lock | [x] |

## Coverage by non-screen function (SRS §3.1.3)

| SF | Status |
| :-- | :-- |
| SF-01 Scan worker, SF-02 Scan timeout | [-] mobile scan out of scope |
| SF-03 AI background removal | [ ] |
| SF-04 Guardrail | [x] |
| SF-05 Payment webhook, SF-06 Payment timeout | [x] |
| SF-07 Reference pack | [~] |
| SF-08 Quota reset, SF-09 Expiry job, SF-17 Renewal reminders | [x] |
| SF-10 Data retention | [~] |
| SF-11 Data export | [x] |
| SF-12 Session manager | [x] |
| SF-13 Notification dispatcher | [~] emails only, no push |
| SF-14 API cost tracker | [~] ledger, budget, 80%/100% states, internal cap, BR-108 CSV; no producer records calls yet |
| SF-15 Audit logger | [x] admin actions and impersonation |
| SF-16 Report generator | [~] |
| SF-18 Receipt generator | [x] |
| SF-19 Attribution tracker | [~] |
| SF-20 Artisan link service | [x] |

## Non-functional requirements

- [x] NFR-SEC-01..05, 08, 10, 11: TLS is a deployment concern; password hashing, server-side RBAC, no card data, signed URLs ≤ 15 min, audit log, hashed artisan tokens, short access tokens
- [ ] NFR-SEC-07 virus scan of uploads; [~] NFR-SEC-06 rate limiting (login, artisan links, exports; not scan/AI)
- [x] NFR-USA-03 Vietnamese / English UI via the language switch; [~] NFR-USA-04 WCAG AA (focus states, labels and dialogs done, no formal audit)
- [ ] NFR-MNT-04 coverage measurement (tests exist for subscription, quota and guardrail, but no coverage report)
- [-] NFR-PER, NFR-REL: infrastructure targets, not measured here
