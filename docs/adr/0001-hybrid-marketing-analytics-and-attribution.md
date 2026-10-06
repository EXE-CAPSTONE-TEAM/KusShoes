# Hybrid Marketing Analytics and Attribution Architecture

## Context & Decision
To deliver end-to-end marketing visibility from top-of-funnel web traffic to bottom-of-funnel customer revenue, we decided on a hybrid architecture:
1. **Google Analytics 4 (Data API v1beta)** is queried by the backend service account for anonymous traffic, geolocation (city/country), session engagement, referral channels, and realtime active visitors. Responses are cached in Redis (TTL 15–30 minutes) to respect Google API quota limits.
2. **PostgreSQL (`user_attributions` + `invoices`)** provides first-touch attribution, user registrations, and verified financial revenue per marketing source.

## Considered Options
- **Pure GA4 E-commerce Tracking:** Send all invoice and subscription events to GA4. *Rejected* because client-side ad-blockers drop 15–30% of events, GA4 does not reconcile with accounting ledgers (BR-105/106), and user privacy consents (Google Consent Mode v2) create data gaps for financial reporting.
- **Pure In-house Traffic Logging:** Log all HTTP requests and page views in PostgreSQL. *Rejected* because high-volume anonymous web traffic would bloat database storage, require complex IP-to-city databases, and re-implement bot filtering that GA4 already handles.

## Consequences
- The admin frontend receives a single, reconciled data model from `/api/v1/admin/analytics/marketing` that joins GA4 acquisition with internal conversion metrics.
- When GA4 credentials are not yet provisioned, the admin UI displays a step-by-step setup guide rather than failing or showing corrupt state.
