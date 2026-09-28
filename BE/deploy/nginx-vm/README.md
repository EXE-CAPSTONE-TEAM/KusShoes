# nginx for the single GCP VM

Used by `docker-compose.vm.yml` on `136.85.55.175` (see `.spec/spec.md` §I in the planning workspace).

| Host | Upstream | Files |
|---|---|---|
| `api.kusshoes.kietta.me` (primary) | `api:8000` | `11-https-kietta.conf` |
| `relay.kusshoes.kietta.me` (primary) | `kiri-relay:8010` | `21-relay-https-kietta.conf` |
| `136.85.55.175.sslip.io` (legacy) | `api:8000` | `10-https.conf` |
| `relay.136.85.55.175.sslip.io` (legacy) | `kiri-relay:8010` | `20-relay-https.conf` |

- `00-http.conf` — ACME challenge + redirect everything else to HTTPS, for every host.
- The sslip.io hosts stay until every client has moved off them: released mobile APKs have the
  sslip.io URLs baked in, so delete `10-https.conf` / `20-relay-https.conf` only after the APKs
  in use point at the kietta.me hosts.
- DNS (Namecheap, `kietta.me` → Advanced DNS): A records `api.kusshoes` and `relay.kusshoes` →
  `136.85.55.175`.

## Certificates

nginx refuses to (re)load while a `*-https*.conf` points at a certificate that does not exist, so
issue a host's certificate **right after** pulling the file that references it, then reload. Until
the reload succeeds nginx keeps serving the previous config (a failed `nginx -s reload` is harmless),
but a container restart in that window would fail.

```sh
for host in api.kusshoes.kietta.me relay.kusshoes.kietta.me; do
  docker compose -f docker-compose.prod.yml -f docker-compose.vm.yml run --rm --entrypoint certbot certbot \
    certonly --webroot -w /var/www/certbot -d "$host" \
    --register-unsafely-without-email --agree-tos --non-interactive
done
docker exec kusshoes_nginx nginx -t && docker exec kusshoes_nginx nginx -s reload
```

The ACME challenge is answered by `00-http.conf` (default server on :80), so a certificate can be
issued as soon as the DNS record resolves to the VM.

Renewal: the `certbot` container renews every 12 h; the nginx container reloads every 6 h to pick it up.
