# Payment Transparency Plan: PayOS transfer details, checkout review, bill page

Status: ready for implementation · Author: Claude (analysis) · Date: 2026-10-05
Scope: `BE/` (FastAPI + SQLAlchemy + Alembic) and `FE/` (React + Vite + i18next).

## 0. Context the implementer must know (verified in code, do not re-derive)

| Fact | Where |
|---|---|
| PayOS webhook verifies HMAC, then calls `_activate_paid_invoice(... gateway_metadata_patch={"payos": data})`. **The whole verified `data` object is already persisted** in `invoices.gateway_metadata["payos"]` (JSONB). No migration is needed to read transfer details. | `BE/app/services/billing_service.py` `handle_payos_webhook`, `BE/app/repositories/invoice_repo.py` `mark_paid` |
| `paid_at` is set to the **server's** `datetime.now(UTC)` at webhook time, not the bank's transfer time. | `billing_service._activate_paid_invoice` |
| `payment_reference` = PayOS `reference` (bank transaction ref). | same |
| Admin invoice API (`GET /api/v1/admin/billing/invoices`) returns `AdminInvoiceResponse`. It has **no** transfer details: no sender name, sender account or bank, and no bank transaction time. | `BE/app/schemas/subscription.py`, `billing_service.to_admin_invoice` |
| Admin invoice table shows User, Plan, Cycle, Amount, Method, Status, Paid date, Refund. There is **no row detail view**, and `order_code`/`payment_reference` are not shown. | `FE/src/pages/Admin/Billing/AdminBilling.tsx` (~L274–310) |
| Customer checkout: in the "Compare plans" modal, the customer clicks **PayOS** or **MoMo**, which immediately calls `POST /subscription/checkout` and redirects with `window.location.assign`. **There is no review/confirm step.** A prorated upgrade amount (BR-24) is never shown before the redirect. | `FE/src/pages/Billing/Billing.tsx` `handleChoosePlan`; same for `handleBuyCredit` |
| PayOS return URL is `/billing/success` and cancel URL is `/billing/cancel` (env `PAYOS_RETURN_URL`/`PAYOS_CANCEL_URL`). Both routes render the normal `Billing` page with a banner. The banner polls `api.listInvoices()[0]` (the **latest** invoice, not the one in the URL) every 3 s, up to 20 times. **There is no bill/receipt page.** | `FE/src/App.tsx` L125–128, `Billing.tsx` L179–257 |
| BE already has `GET /subscription/invoices/{invoice_id}` (owner-checked) and `GET /subscription/invoices/{id}/receipt` (signed URL to the immutable KUS-xxxxx PDF, BR-31). | `BE/app/routers/subscriptions.py` |

### Answer: does the customer page have a payment history?
**Partially, yes.** `Billing.tsx` has an invoice history table with these columns: receipt number (or the first 8 characters of the id), **created** date, amount + VAT note, status, and a "Receipt" PDF button. Credit purchases also have a ledger table. Gaps:
- It loads only the first 20 invoices (`list_invoices` default `limit=20`) with **no "load more"**.
- It doesn't show the payment method, the **paid** date and time, the plan or cycle, the order code, or the bank reference.
- Rows don't open a detail view, and nothing links a row to a bill page.

The plan below closes these gaps (Task C3).

---

## 1. Goals

1. **Admin (financial transparency):** for every PayOS-paid invoice, the admin sees the bank transfer date and time, the sender's name, bank and account number, the bank reference, the PayOS payment link id, and the transfer description. All values come from the stored PayOS webhook payload.
2. **Customer: review before pay:** a confirmation step shows the plan, cycle, listed price, discount (coupon or prorated upgrade), final amount, VAT breakdown, buyer name and email, gateway, and new expiry date. The customer must confirm explicitly before the redirect to PayOS.
3. **Customer: bill after pay:** a dedicated bill page at `/billing/success` resolves **the invoice from the URL's `orderCode`**, polls until it is settled, then shows a bill. The bill shows the receipt number, order code, paid time, amount breakdown, method, bank reference and new subscription period, with a PDF download.
4. **Customer: history:** complete and paginated, with each row linking to its bill.

Non-goals: changing the payment state machine, adding refunds to the customer UI, enabling MoMo, or changing the receipt PDF layout.

## 2. Key decisions (follow these and don't re-decide them)

- **D1: No DB migration.** Transfer details are derived at read time from `gateway_metadata["payos"]`. They are not promoted to columns. Older paid invoices then work automatically (backfill for free). If filtering by sender is needed later, that's a separate task.
- **D2: Treat the PayOS fields as optional.** PayOS webhook `data` documents `transactionDateTime` (format `"YYYY-MM-DD HH:mm:ss"`, Vietnam local time, UTC+7), `accountNumber`, `reference`, `description`, `paymentLinkId`, `currency`, `counterAccountBankId`, `counterAccountBankName`, `counterAccountName`, `counterAccountNumber`, `virtualAccountName`, `virtualAccountNumber`. The `counter*` fields are often `null` or `""` (it depends on the bank). The parser must return `None` for missing or empty values and **never raise**. **Verify the field list against https://payos.vn/docs/ (webhook section) before coding. If it differs, follow the docs and note the difference in the PR.**
- **D3: Two timestamps, both shown, never merged.** `paid_at` = when KusShoes confirmed the payment (the existing behavior, unchanged). `transferred_at` = the bank's `transactionDateTime`, parsed as `Asia/Ho_Chi_Minh` and returned as an ISO-8601 string with an offset. Label them "Thời điểm chuyển khoản (ngân hàng)" and "Thời điểm hệ thống xác nhận".
- **D4: Privacy split.** Admin sees the full sender name and account number. The customer bill shows the sender name and a **masked** account number (`••••1234`). The customer is the sender, but the bill may be shared or printed.
- **D5: One pricing function.** The amount shown on the review page must be the amount actually charged. Extract the pricing logic out of `create_checkout_session` into a pure `quote_checkout(...)`. Both the new quote endpoint and checkout call it. Never duplicate the math in the FE.
- **D6: Look up the bill by order code.** PayOS appends `?code=..&id=..&cancel=..&status=..&orderCode=..` to the return URL. The bill page uses `orderCode`, not "latest invoice". Fallback: the latest invoice if `orderCode` is absent (MoMo, or old links).

## 3. Tasks (vertical slices, in order; each one ends green)

### A. Shared backend: transfer-detail parser
**A1.** Create `BE/app/services/payment_details.py`:
```python
def payos_transfer_details(invoice) -> dict | None
```
- Returns `None` unless `invoice.payment_method == "payos"` and `gateway_metadata.get("payos")` is a dict.
- Returns the keys `transferred_at` (aware datetime or None), `sender_name`, `sender_account_number`, `sender_bank_id`, `sender_bank_name`, `receiver_account_number` (`accountNumber`), `virtual_account_name`, `virtual_account_number`, `bank_reference` (`reference`), `payment_link_id`, `transfer_description` (`description`), `currency`.
- Normalizes `""` to `None`. Bad datetime strings become `None` plus a `logger.warning`, never an exception.
- Add `def mask_account(number: str | None) -> str | None` (keeps the last 4 digits).

**A2.** Add a pydantic schema `PaymentTransferDetails` to `BE/app/schemas/subscription.py` with the fields above, all optional.

**A3.** Tests in `BE/tests/test_payment_details.py`: a full payload, a payload with null or empty `counter*` fields, a missing `transactionDateTime`, a malformed datetime, a non-payos invoice that returns None, and masking.

### B. Admin: transfer details in Plans & Subscription / Billing
**B1. BE.** Add `transfer: PaymentTransferDetails | None = None` to `AdminInvoiceResponse`, filled in `billing_service.to_admin_invoice` via A1 (full, unmasked).

**B2. BE.** Add `GET /api/v1/admin/billing/invoices/{invoice_id}` (`get_current_admin`), which returns `AdminInvoiceResponse` with the user email. Add `invoice_repo.get_with_user_email` if needed. 404 uses the existing `InvoiceNotFound`.

**B3. BE (optional search, recommended).** Add a `q: str | None` filter to the admin invoice list that matches `order_code` (exact, if numeric), `payment_reference` (ilike), or `gateway_metadata['payos']['counterAccountName'].astext` (ilike). Keep cursor pagination unchanged.

**B4. FE.** In `FE/src/types/admin.ts` add `transfer?: AdminPaymentTransfer | null` to `AdminInvoice`, and in `adminClient.ts` add `adminBilling.invoice(id)`.

**B5. FE.** In `AdminBilling.tsx`, change the Invoices tab:
- Add the columns **Mã đơn** (`order_code`), **Người chuyển** (`transfer.sender_name` or "—"), and **Thời điểm CK** (`transfer.transferred_at`, formatted `dd/MM/yyyy HH:mm:ss`).
- Make each row clickable, or add an "eye" icon button. It opens a **detail drawer/modal**, `InvoiceDetailDrawer.tsx` in the same folder, with three sections:
  1. *Đơn hàng*: order code, receipt number, user email + id, plan/cycle, listed/discount/amount/VAT, coupon, status, created_at, paid_at (system).
  2. *Chuyển khoản (PayOS webhook)*: bank transfer time, sender name, sender bank (name + id), sender account, receiver account / virtual account, bank reference, payment link id, transfer description. Add an empty-state line "Cổng thanh toán không gửi thông tin người chuyển" when everything is null.
  3. *Thủ công* (only when `is_manual`): collected_by, created_by, approved_by.
- Reuse the existing modal and drawer styles in `admin-shared.module.css`. Match the surrounding Vietnamese copy.
- If B3 is done, add a search input next to the user-ID filter.

**B6. Plans & Subscriptions tab.** The subscriptions table (`AdminBilling.tsx` ~L194) shows no payment. Add a "Thanh toán gần nhất" action that opens the same drawer for the subscription's `last_invoice_id`. This needs `last_invoice_id: uuid | None` added to `AdminSubscriptionResponse` (BE + FE type). Disable the action when it is null (free or comp).

**B7. Tests.**
- BE: the admin list and detail include `transfer` for a payos-paid invoice whose webhook payload has `counterAccountName` etc. (extend `test_billing.py`, which already signs payloads via `_payos_signature`). Also test that non-admins get 401/403 on the detail endpoint.
- FE: a vitest for the drawer rendering with a full payload and with null transfer details.

### C. Customer: review page, bill page, history
**C1. BE: quote endpoint.**
- Refactor: move the pricing in `create_checkout_session` (plan lookup, sellable check, already-active check, `_is_midcycle_upgrade`, coupon evaluation, proration) into `async def quote_checkout(db, user, *, tier, billing_cycle, coupon_code) -> CheckoutQuote`. `create_checkout_session` must call it. Behavior must stay byte-identical, and the existing tests must pass unchanged.
- `CheckoutQuote` fields: `plan` (tier, billing_cycle, price_vnd, key limits), `listed_price_vnd`, `discount_vnd`, `discount_reason` (`"coupon" | "upgrade_proration" | None`), `coupon_code`, `amount_vnd`, `vat` (`tax_service.vat_breakdown(amount)`), `is_upgrade`, `current_tier`, `new_period_start`, `new_expires_at` (the same rule `activate_invoice` applies: an upgrade keeps `current.expires_at`, otherwise now + cycle), and `buyer` (`full_name`, `email`).
- Route: `POST /api/v1/subscription/checkout/quote` (body = `CouponPreviewRequest`-like, with an optional coupon). Apply the same Redis rate limit as the coupon preview.
- Credits: add a `POST /api/v1/subscription/credits/quote` → quantity, unit price, total, VAT, and `can_purchase`, reusing `credit_service.assert_can_purchase`.
- Tests: the quote equals the invoice actually created by checkout for (a) a plain purchase, (b) a coupon, (c) a mid-cycle upgrade with prorated pricing, and (d) the already-active error.

**C2. FE: checkout review page `/billing/checkout`.**
- Routing: add `case '/billing/checkout'` to `FE/src/App.tsx` (path → page map ~L125, and page → path ~L173). Render a new lazy page `FE/src/pages/Billing/CheckoutReview.tsx` inside the portal shell, the same way `billing` is wrapped with `withPortalShell`.
- Entry: in `Billing.tsx`, the plan cards' PayOS and MoMo buttons and the Buy Credit modal no longer call checkout. They navigate to `/billing/checkout?type=plan&tier=..&cycle=..&gateway=..&coupon=..` (or `type=credit&qty=..`).
- The page calls the quote endpoint and shows:
  - Buyer: full name and email from `api.profile()`, with a link to Settings to fix them.
  - Order: plan name + cycle (or "N Credit"), key features, and the new validity period (`new_period_start` → `new_expires_at`). For an upgrade, add a note explaining the proration.
  - Price table: listed, discount (with its reason), **total payable**, and "đã bao gồm VAT x%" when enabled.
  - Gateway: show the selected one, and allow switching if `getPaymentGateways` permits.
  - A required checkbox: "Tôi đã kiểm tra thông tin và đồng ý với Điều khoản" (link to the existing Legal page). Add the no-auto-renew note (BR-25).
  - Buttons: "Quay lại" (back to `/billing`) and "Xác nhận & thanh toán". The second is disabled until the box is checked, and while the request is in flight it is disabled and shows a spinner (no double submit). It calls the existing checkout API and then `window.location.assign`.
- Move the existing `begin_checkout` analytics push and the `sessionStorage` write here, triggered on confirm.
- Error states: a 409 already-active goes back to `/billing` with a toast, an invalid coupon shows inline, and a quote failure offers a retry.
- i18n: add the keys to **both** `FE/src/i18n/locales/vi/billing.json` and `en/billing.json`.

**C3. BE: bill data + history.**
- Add `transfer: PaymentTransferDetails | None` (masked per D4) and `subscription_period: {start, end} | None` to `InvoiceResponse` for the customer. Derive the period from `receipt_snapshot` if present. Otherwise use the current subscription when `last_invoice_id == invoice.id`. Otherwise use None. **Do not** expose `gateway_metadata` raw.
- Add `GET /api/v1/subscription/invoices/by-order/{order_code}` (owner-checked, same 404 for "not mine" and "missing").
- Make `GET /subscription/invoices` return a cursor (`before` + `before_id`, as the repo already supports) and cap `limit` at 100 via `Query(ge=1, le=100)`. Keep the response a list, and have the FE paginate with `before=<last.created_at>&before_id=<last.id>`. Changing it to `CursorPage` is a breaking change, so don't.

**C4. FE: bill page `/billing/success` (and `/billing/invoices/:id`).**
- New page `FE/src/pages/Billing/BillPage.tsx`. `/billing/success` and `/billing/invoices/<uuid>` both render it. Update the App path map so `/billing/success` no longer renders the plain `Billing` page. `/billing/cancel` keeps the current banner behavior.
- Resolve the invoice: if the path has an id, use it. Otherwise read `orderCode` from `location.search` and use `by-order`. Otherwise fall back to the latest invoice.
- Poll the **resolved** invoice (keep 3 s × 20). States:
  - Checking: spinner + order code.
  - Paid: the bill.
  - Failed or cancelled: an explanation + "Thử lại" (back to `/billing/checkout` with the same params) + support contact.
  - Timeout: "Đang chờ ngân hàng xác nhận", a manual refresh button, and a note that the confirmation email will arrive (BR-30 late payment still activates).
- The bill (paid) shows: a success header, the receipt number `KUS-…`, order code, paid time (system), bank transfer time, plan/cycle or credit qty, the new subscription period, the listed/discount/total/VAT table, method, bank reference, and sender name + masked account. Buttons: "Tải hoá đơn PDF" (existing `billingApi.getReceipt`), "In" (`window.print()` + a `@media print` stylesheet), and "Về trang thanh toán".
- Move the `purchase` analytics push (currently in `Billing.tsx` L216–237) here, pushing once per order code. Dedupe with `sessionStorage` key `kusshoes_purchase_pushed_<orderCode>` so a refresh doesn't double count.
- Delete the now-dead polling `useEffect` and the `paymentCheck` banners from `Billing.tsx`.

**C5. FE: history table upgrades (`Billing.tsx`).**
- Columns: receipt number, **paid at** (fall back to created_at with a muted "tạo lúc" label), plan + cycle (or "Credit"), amount + VAT, method, status, and actions (view bill → `/billing/invoices/<id>`, PDF).
- Add a "Xem thêm" button using the C3 cursor.
- Mobile: the table already lives in `tableScroll`. Make sure the new columns don't break widths of 360 px or more.

**C6. Tests.**
- vitest `CheckoutReview.test.tsx`: renders the quote, confirm is disabled until the box is checked, and confirm calls checkout once.
- vitest `BillPage.test.tsx`: `orderCode` → by-order call, pending → paid transition, failed state, analytics pushed once.
- Update `Billing.test.tsx` and `src/pages/backendFlows.test.tsx` for the moved buttons and polling.
- BE: a by-order owner check, and masking in the customer response.

## 4. Verification (required before claiming done)

```bash
# Backend
cd BE && pytest -q tests/test_billing.py tests/test_subscription_lifecycle.py tests/test_payment_details.py
cd BE && ruff check app tests   # if ruff is configured; otherwise skip and say so

# Frontend
cd FE && npx tsc -b && npm run lint && npm run test:run

# Workspace harness (from the KusShoes project root)
../harness/verify.sh --strict
```
Manual check against the PayOS **sandbox**:
1. Buy Basic monthly → review page amounts equal the PayOS page amount.
2. Pay → land on `/billing/success?...&orderCode=X` → the bill shows the same X and the bank reference.
3. Admin → Billing → Invoices → open X → sender name and transfer time match the PayOS dashboard.

Record the observed values in the PR description (no fabricated screenshots or numbers).

## 5. Acceptance criteria

- [ ] Admin invoice list shows order code, sender, and bank transfer time. The detail drawer shows all PayOS transfer fields, with graceful "—" for null values.
- [ ] The admin subscription row can open its last payment.
- [ ] No customer flow reaches PayOS without passing the review page and ticking the confirmation box.
- [ ] The review page total equals the created invoice's `amount_vnd` in all four C1 test cases.
- [ ] `/billing/success` shows the invoice from `orderCode`, not just the latest one. The paid bill has a receipt number, both timestamps, the amount breakdown, the reference, and a working PDF download and print.
- [ ] The customer history paginates past 20 rows, shows the method and paid time, and links each row to its bill.
- [ ] The customer API never returns the raw `gateway_metadata` or an unmasked sender account.
- [ ] The `purchase` analytics event fires exactly once per order.
- [ ] All the commands in §4 pass, and the existing billing tests pass unchanged.

## 6. Risks / watch-outs

- **Real PayOS payload shape.** Check one real stored payload first, from a dev or staging DB: `SELECT gateway_metadata->'payos' FROM invoices WHERE payment_method='payos' AND status='paid' LIMIT 3;`. Adapt the parser to what is actually stored.
- **Timezone.** `transactionDateTime` has no offset. Treat it as UTC+7, never as UTC.
- **Return-URL query.** PayOS appends `orderCode` to the return URL. Confirm this in the sandbox. MoMo uses `orderId` on its redirect, so read both.
- **Don't change `PAYOS_RETURN_URL`.** Keep `/billing/success` so no env or ops change is needed (prod BE runs on a GCP VM that Claude can't SSH into).
- **i18n.** Every new string goes in both `vi` and `en` billing.json. Admin pages are Vietnamese-only (match the existing ones).
