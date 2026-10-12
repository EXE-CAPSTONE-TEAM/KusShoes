# Feature & Project Specification — Admin finance dashboard + Reports hub

## 1. Executive Summary & Goal
- **What**: (a) Redesign `/admin` dashboard into ONE finance panel; (b) add a "Trung tâm báo cáo"
  (`/admin/reports`) that exports 30 report types, 6 domains x 5.
- **Why**: Finance team feedback (2026-10): the dashboard should show the overall financial picture
  only; deeper analysis belongs in Analytics / Reports / accounting software.

## 2. Requirements & Acceptance Criteria
### Finance panel (FD-1..FD-8)
- [ ] `GET /api/v1/admin/dashboard/finance` returns totals (to date), current month, 30 daily points,
      6 monthly points, maintenance config state.
- [ ] Dashboard shows only: banner, 4 cards (Tổng doanh thu, Tổng lợi nhuận, Chi phí duy trì web/API
      [CURRENT MONTH], Tỷ suất lợi nhuận biên), enlarged chart with 1 tháng / 6 tháng toggle, link to Analytics.
- [ ] All secondary KPIs, action center, user table, activity log, resources, CSV button removed.
- Formulas: revenue = SRS 5.4 (`analytics_service.build_payments`, GMT+7, internal accounts excluded,
  refunds netted); api_cost = `api_cost_entries`; maintenance accrues daily from monthly config;
  profit = revenue - api_cost - maintenance (operating profit; marketing cost is in sổ 08, BR-108);
  marginal profit rate = (revenue - api_cost) / revenue, null when revenue = 0.
- "1 tháng" = rolling 30 days (daily); "6 tháng" = last 6 calendar months incl. current (GMT+7).
- Unconfigured maintenance cost renders "Chưa cấu hình" — never an invented number.
### Reports hub (RP-1..RP-11)
- [ ] Registry-driven: 30 unique report ids, 6 domains, >= 5 each (catalogue in tasks.md).
- [ ] `GET /api/v1/admin/reports` (catalogue) and `GET /api/v1/admin/reports/{id}?format&date_from&date_to`
      (path kept). Unknown id -> 404; inverted/oversized range or too many rows -> 422 (never silent truncation).
- [ ] CSV (UTF-8 BOM) / XLSX for all; PDF only for summary reports (revenue, mrr-movement, api-budget,
      revenue-by-plan). XLSX has a "Thông tin" sheet (period, extraction time GMT+7, row count; CR-12).
- [ ] Formula-injection escaping for cells starting with `= + - @ \t \r` (numbers untouched).
- [ ] Sensitive reports (users, audit-log, login-history) admin-only; others use account_code, not email (BR-88).
- [ ] Every export writes an audit row (`report.export`).
- [ ] FE page `reports` + sidebar item; catalogue from server; Analytics reports tab and dashboard CSV removed.

## 3. Out of Scope (Boundaries)
- Scheduled emailing of reports (BR-82) — decided out of scope.
- Accounting-grade profit (marketing cost stays in sổ 08). GA4 traffic report, CAC.
- Removing legacy `/dashboard/revenue|user-growth|recent-users` endpoints; sidebar keeps `/dashboard/stats`.

## 4. Parameter & Data Provenance
| Parameter | Location | Value | Basis |
|---|---|---|---|
| OPERATING_COST_MONTHLY_VND | BE/app/config.py | None (unset) | Fixed website/API upkeep supplied by Finance (sổ 08); no default invented |
| OPERATING_COST_START_MONTH | BE/app/config.py | None (unset) | First month fixed costs accrue, supplied by Finance |
| FINANCE_SERIES_DAYS | BE/app/policy.py | 30 | Finance feedback 2026-10 "1 tháng"; same window as analytics default |
| FINANCE_SERIES_MONTHS | BE/app/policy.py | 6 | Finance feedback 2026-10 "6 tháng" |
| REPORT_MAX_RANGE_DAYS | BE/app/config.py | 366 | Conservative choice: one calendar year incl. leap day. NOT a measured value; measured run on seeded data pending (to record here) |
| REPORT_MAX_ROWS | BE/app/config.py | 100000 | Conservative choice: ~10% of the Excel 1,048,576-row sheet limit. NOT a measured value; memory/latency measured run pending (to record here) |
