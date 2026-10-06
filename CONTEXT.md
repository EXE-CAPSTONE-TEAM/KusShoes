# KusShoes Marketing & Traffic Analytics

Domain model for marketing attribution, web traffic analytics, and visitor conversion tracking within the KusShoes platform.

## Language

### Traffic & Identity

**Web Visitor**:
An anonymous individual browsing the KusShoes web application before authentication, identified in GA4 via Client ID and in browser storage via session tokens.
_Avoid_: User, Member, Guest

**Registered User**:
An authenticated account holder in the system with an email and profile who can create 3D projects and save designs.
_Avoid_: Visitor, Client

**Paying Customer**:
A registered user who has completed at least one paid invoice for a subscription tier or 3D scan credits.
_Avoid_: Buyer, Purchaser

### Attribution & Marketing

**Traffic Source**:
The originating platform or protocol through which a Web Visitor landed on KusShoes (e.g., TikTok, Facebook, Google Organic, Zalo, Direct).
_Avoid_: Medium, Channel, Referral Link

**Campaign**:
A specific, named marketing initiative tagged via `utm_campaign` (e.g. `tet-2026-shoes`, `kol-review`).
_Avoid_: Promotion, Ad Set

**First-Touch Attribution**:
The historical record capturing the exact Traffic Source, Campaign, and Ad Click ID (fbclid, gclid, ttclid) from the visitor's very first visit, permanently linked to the user upon account registration.
_Avoid_: Last-touch, Session attribution

### Geography & Performance

**Geographic Region**:
The physical city and country from which a visitor accesses KusShoes, resolved via IP geolocation in GA4 and correlated with regional campaign spend.
_Avoid_: IP location, Address, Delivery location

**Engagement Rate**:
The percentage of sessions that lasted longer than 10 seconds, had a conversion event, or had two or more page views.
_Avoid_: Bounce inverse, Active rate

**Platform Performance Scorecard**:
A multi-tier evaluation aggregating top-of-funnel traffic quality from GA4 with bottom-of-funnel account creations and transaction revenue from internal databases per Traffic Source.
_Avoid_: Channel report, Source list

**Conversion Funnel**:
The progressive pipeline tracking drop-offs from initial Web Visitor landing to 3D feature interaction, Registered User creation, and ultimate Paying Customer conversion.
_Avoid_: Sales pipeline, User flow

**Active Realtime Visitors**:
The count of active Web Visitors browsing the site within the trailing 30-minute window, queried via the GA4 Realtime API.
_Avoid_: Online users, Current traffic

**Reporting Cache**:
A short-lived Redis cache layer (15–30 minutes) safeguarding Google Analytics Data API token quotas from exhaustion during concurrent admin access.
_Avoid_: In-memory state, Static storage


