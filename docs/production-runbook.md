# KusShoes Production Runbook

## Required Secrets

- `SECRET_KEY`: at least 32 bytes, unique per environment.
- `SERVICE_TOKEN`: shared only with trusted editor/worker integrations.
- `DATABASE_URL`: production PostgreSQL DSN.
- `REDIS_URL`: production Redis DSN.
- `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET`.
- `SMTP_*` or the selected transactional email provider credentials.
- `SENTRY_DSN` and `VITE_SENTRY_DSN` when error tracking is enabled.
- `POLAR_*` only after billing hardening is complete.

## Release Checks

1. Backend image builds successfully.
2. Frontend `npm run lint`, `npm run test:run`, and `npm run build` pass.
3. Backend non-Polar suite passes:
   `pytest tests/test_auth.py tests/test_account_security.py tests/test_assets.py tests/test_projects.py tests/test_users.py tests/test_user_p0.py tests/test_architecture.py tests/test_admin.py -q -k "not refund"`
4. Database migrations apply cleanly against staging.
5. `/health` returns `{"status":"ok"}`.
6. `/health/ready` returns `status=ok`; `degraded` blocks promotion unless the failed dependency is intentionally disabled.
7. `/metrics` is scrapeable by Prometheus or the chosen metrics collector.

## Rollback

1. Stop traffic to the new backend version at the load balancer or platform router.
2. Redeploy the previous known-good image tag.
3. If migrations are not backward-compatible, restore the database snapshot taken before migration.
4. Verify `/health`, `/health/ready`, login, project list, upload URL creation, and desktop SSO launch.
5. Keep the failed image and logs for incident review.

## Incident Triage

- Authentication failures: inspect `AUTH_*` error codes, Redis health, and `kusshoes_refresh_token` cookie settings.
- Upload failures: inspect storage readiness and MinIO/S3 object permissions.
- Desktop launch failures: inspect `/api/v1/auth/sso-token`, `/api/v1/auth/desktop-session`, and `/api/v1/editor/projects/{project_id}/context`.
- Background job failures: inspect Celery worker logs, Redis queues, and bake job status.

## Current Known Scope

- Polar refund/payment production hardening is intentionally excluded until billing integration is finalized.
- Registry/CDN deployment requires GitHub secrets and target infrastructure to be configured outside the repository.
