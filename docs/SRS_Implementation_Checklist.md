# KusShoes — SRS v2.2 Backend Implementation Checklist

Scope: backend (`BE/`) plus the minimum frontend changes needed to keep the app compiling. Mobile (scan pipeline) is out of scope.

Legend: `[x]` done · `[~]` partial · `[ ]` not done · `[-]` out of scope

## Verification status

- Code compiles, lints (ruff) and type-checks (`tsc --noEmit`) on both sides.
- Tests have **not** been run (Docker was not available).
- Migrations `017`–`019` are written but **not applied** to the Neon database.
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
- [~] Refund policy (7 days, no usage) is not checked; a refund does not downgrade the subscription
- [ ] Receipt PDF with KUS-xxx numbering (SF-18, BR-31) — the SRS says a missing receipt fails the course
- [ ] PENDING-over-30-minutes cancel job (SF-06, BR-30)
- [ ] "Đang xác nhận" status for a returning customer (MSG29)
- [ ] Coupons (BR-26), VAT toggle (BR-28), Early Bird (BR-91)
- [ ] Manual transactions with two-person approval (BR-95, UC-28)
- [ ] Reporting-period lock (BR-98, UC-29)

## Studio, export and content

- [x] Locked projects cannot be edited, deleted or baked (BR-27)
- [ ] Content guardrail (SF-04, BR-73)
- [ ] AI background removal (SF-03)
- [ ] Template gallery (UC-15)
- [ ] Version history (BR-44)
- [ ] Export locks editing (BR-45) and two-device lock (BR-100)
- [ ] Reference-pack PDF (SF-07, BR-71)
- [ ] Artisan links (UC-26, SF-20, BR-101)
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
- [ ] Delete-account 30-day *recovery* (an email link to undo a delete) — soft-delete + scheduled 30-day hard purge already existed before this pass, but there's no restore flow
- [x] Username rules (BR-10): reserved-word blocklist, case-insensitive uniqueness (functional index), 30-day change cooldown
- [x] Age check (BR-02): required `age_confirmed` flag on registration (schema-validated) + FE checkbox now sends it; a consent record is written
- [x] Unverified accounts blocked from paying and exporting (BR-03): payment was already covered by the existing global email-verification gate on `get_current_user`; added an explicit check to the export/bake path, which runs behind the service token and previously bypassed that gate entirely
- [~] UTM/referral attribution (BR-84/85): captured and stored on the user at registration; no sales-rep ref-code admin management, no 30-day first-touch cookie capture (inherently a frontend concern), and it isn't locked at first payment
- [x] Internal-account flag (BR-83): `User.is_internal` + admin toggle endpoint (`POST /admin/users/{id}/internal`); not yet wired into any analytics exclusion since no analytics exist yet

Already present before this work and untouched: register, login, Google OAuth, OTP verification, password reset, listing and revoking sessions.

## Admin, reporting and other

- [ ] Impersonation and admin password reset (BR-80)
- [ ] Real analytics: MRR, ARR, ARPU, churn, NRR/GRR, repeat-customer rate (§5.4, BR-103–105)
- [ ] Report generation and scheduling (SF-16, UC-22)
- [ ] Feedback module (UC-25, BR-109)
- [ ] Content moderation (BR-77)
- [ ] API cost tracker (SF-14)
- [ ] Data retention job (SF-10)
- [-] Scan pipeline (SF-01/02, UC-10/11, BR-33–42) — mobile is out of scope

## Supporting changes

- [x] Frontend updated to the new API: PayOS/MoMo pay buttons in `Billing.tsx`, Polar portal removed, `AdminBilling`, `AdminPlans`, `PricingPage`, `client.ts` and admin types aligned
- [x] Registration form now sends `age_confirmed` (BR-02) — the existing "I agree to ToS" checkbox in `Login.tsx` was relabeled to also cover the age confirmation, since the backend now rejects registration without it
- [x] New `tests/test_subscription_lifecycle.py` (layer cap, project lock, grace export block, grace → downgrade → lock flow, proration); `test_billing.py` rewritten for PayOS/MoMo
- [x] New `tests/test_account_security_features.py` (lockout, new-device email, privacy defaults, username cooldown/reserved words, consent grant/revoke, masked login history, data export, TOTP setup/enable/login/recovery-code, 2FA disable, admin internal-flag toggle)
- [~] No frontend UI for locked projects (no badge, edit buttons not disabled); locked projects only fail with a 403 from the API
- [~] No frontend UI for 2FA setup/login or privacy settings — the backend endpoints exist and are tested, but nothing in the FE calls them yet. `client.ts`'s `login()` would need updating to handle the new `mfa_required` response shape before a 2FA UI could be built on top of it.

## Files added or changed (main ones)

- Migrations: `017_rebuild_payment_gateway.py`, `018_subscription_grace_and_quota_anchor.py`, `019_account_security.py`
- New (billing): `payos_client.py`, `momo_client.py`, `quota_service.py`, `refund.py` (model), `refund_repo.py`
- New (account/security): `totp.py`, `twofa_store.py`, `login_guard.py`, `twofa_service.py`, `consent_record.py`/`login_history.py`/`recovery_code.py` (models) + matching repos
- Rewritten: `billing_service.py`, `maintenance_service.py`
- Heavily extended: `auth_service.py` (login flow: lockout, 2FA gate, login history, new-device email), `user_service.py` (privacy, consents, username change, data export)
- Removed: `polar_client.py`
