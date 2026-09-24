# nginx for the single GCP VM (sslip.io host)

Used by `docker-compose.vm.yml` on `136.85.55.175` (see `.spec/spec.md` §I in the planning workspace).

- `00-http.conf` — ACME challenge + redirect everything else to HTTPS.
- `10-https.conf` — TLS termination for `136.85.55.175.sslip.io`, proxies to `api:8000`.
- `20-relay-https.conf` — TLS for `relay.136.85.55.175.sslip.io`, proxies to the KIRI relay (`kiri-relay:8010`).
  Issue its certificate (same certbot command with `-d relay.136.85.55.175.sslip.io`) before adding this file.

First certificate (HTTP-only bootstrap, then enable HTTPS):

```sh
docker compose -f docker-compose.prod.yml -f docker-compose.vm.yml run --rm --entrypoint certbot certbot \
  certonly --webroot -w /var/www/certbot -d 136.85.55.175.sslip.io \
  --register-unsafely-without-email --agree-tos --non-interactive
docker exec kusshoes_nginx nginx -s reload
```

Renewal: the `certbot` container renews every 12 h; the nginx container reloads every 6 h to pick it up.
