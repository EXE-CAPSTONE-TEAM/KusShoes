# KusShoes — SRS v2.2 Backend Implementation Checklist

Scope: backend (`BE/`) plus the minimum frontend changes needed to keep the app compiling. Mobile (scan pipeline) is out of scope.

Legend: `[x]` done · `[~]` partial · `[ ]` not done · `[-]` out of scope

## Verification status

- Code compiles, lints (ruff) and type-checks (`tsc --noEmit`) on both sides.
- Tests have **not** been run (Docker was not available).
- Migrations `017`–`022` are written but **not applied** to the Neon database. `021`/`022` were only checked by compiling and by rendering the model DDL.
- Everything added after the first push (receipts, coupons, manual transactions, period lock, version history, guardrail, templates, artisan links, feedback, analytics, reports, impersonation, account restore, retention) has **never run against a database**; only the pure metric functions and the PDF/CSV/XLSX renderers were executed.
- PayOS / MoMo clients follow the public specs; they have not been tried against a real sandbox.
- TOTP is a from-scratch RFC 6238 implementation (stdlib only, no new dependency) — not tried against a real authenticator app.

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
- [ ] Credit ledger and Credit purchase (BR-94, UC-27)
- [ ] Plan-first-then-Credit deduction order (BR-23 detail)

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
- [ ] VAT toggle (BR-28)
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
- [ ] Free-tier watermark (BR-65)

## Account and security (UC-01 to UC-07)

- [x] 2FA (BR-12/13): TOTP (RFC 6238, stdlib-only) and Email methods; setup/enable/disable; 10 one-time recovery codes; login gate via a short-lived challenge token (`/auth/2fa/verify`); recovery email required before enabling Email-method 2FA
- [~] Admin 2FA is not force-enforced (BR-12 says mandatory for Admin) — admins have no route to enable it yet since `/users/me/2fa/*` sits behind the customer auth gate, not the admin one
- [x] New-device login alert (BR-14): email sent when a login's (IP, user-agent) pair has no prior successful login on record
- [x] BR-86 lockout: 5 wrong passwords / 15 min, tracked per-account and per-IP (distinct from the existing generic rate limiter), with an email alert on lockout
- [x] Login history (BR-18): every login attempt (success/fail) recorded; user-facing IP is last-octet-masked; 90-day purge job added to the daily beat schedule
- [x] Privacy settings (BR-15): public profile / show designs / searchable / analytics / ads-personalization, all off by default
- [x] Consent records (BR-89): ToS + privacy-policy + age-confirmation written at registration; opt-in/revocable marketing-content, academic-report and cookie consents via `/users/me/consents`
- [x] Data export (SF-11, BR-19): zips profile + project metadata + consents + login history, 1/24h, 15-min signed URL — binary assets (GLB/textures) are **not** bundled (simplification)
- [ ] Data import from backup (BR-20) — not built
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
- [~] Reports (SF-16, UC-22): revenue, users, `Sổ giao dịch EXE201` (BR-106 column order) and channel funnel by week (BR-107) as CSV / XLSX / PDF on demand; **not** built: scheduled reports with email delivery, design / plan / export-activity / moderation reports, API cost by day (BR-108)
- [x] Feedback module (UC-25, BR-109): rating 1–5, one form per 14 days, 4P group, admin triage NEW → REVIEWED → PLANNED → DONE / WONT_DO with a public "what changed" note, internal accounts excluded, XLSX export, summary
- [ ] Content moderation (BR-77)
- [ ] API cost tracker (SF-14)
- [~] Data retention (SF-10): trashed projects now kept 30 days then purged (BR-47, was 7), deleted accounts purged after 30 days, login history 90 days; other retention classes not covered
- [-] Scan pipeline (SF-01/02, UC-10/11, BR-33–42) — mobile is out of scope

## Supporting changes

- [x] Frontend updated to the new API: PayOS/MoMo pay buttons in `Billing.tsx`, Polar portal removed, `AdminBilling`, `AdminPlans`, `PricingPage`, `client.ts` and admin types aligned
- [x] Registration form now sends `age_confirmed` (BR-02) — the existing "I agree to ToS" checkbox in `Login.tsx` was relabeled to also cover the age confirmation, since the backend now rejects registration without it
- [x] New `tests/test_subscription_lifecycle.py` (layer cap, project lock, grace export block, grace → downgrade → lock flow, proration); `test_billing.py` rewritten for PayOS/MoMo
- [x] New `tests/test_account_security_features.py` (lockout, new-device email, privacy defaults, username cooldown/reserved words, consent grant/revoke, masked login history, data export, TOTP setup/enable/login/recovery-code, 2FA disable, admin internal-flag toggle)
- [~] No frontend UI for locked projects (no badge, edit buttons not disabled); locked projects only fail with a 403 from the API
- [~] No frontend UI for 2FA setup/login or privacy settings — the backend endpoints exist and are tested, but nothing in the FE calls them yet. `client.ts`'s `login()` would need updating to handle the new `mfa_required` response shape before a 2FA UI could be built on top of it.

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
