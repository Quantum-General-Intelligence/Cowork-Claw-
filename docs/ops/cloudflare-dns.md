# Cloudflare DNS wiring for launch

This is a manual operator task, not code. Complete it at least 30 minutes before the launch post so propagation settles.

## What already works

- Traefik is terminating TLS on the VPS with LetsEncrypt (see `docker-compose.prod.yml`).
- The existing labels route three hostnames: `cowork-claw.ai`, `www.cowork-claw.ai`, `app.cowork-claw.ai`.

## What you do

1. In Cloudflare, for the zone `cowork-claw.ai`, set four A records pointing at your VPS IP (replace `203.0.113.10` with the real IP):

   | Name | Type | Content | Proxy |
   |---|---|---|---|
   | `@` | A | 203.0.113.10 | **DNS only (grey cloud)** |
   | `www` | A | 203.0.113.10 | **DNS only (grey cloud)** |
   | `app` | A | 203.0.113.10 | **DNS only (grey cloud)** |
   | `api` | A | 203.0.113.10 | **DNS only (grey cloud)** (reserved for v2) |

2. **Do NOT enable the Cloudflare orange-cloud proxy** on these records for the first launch. Reasons:
   - Traefik is already issuing LetsEncrypt certs via HTTP-01 challenge, which requires port 80 reach the VPS directly. Orange-clouding breaks this unless you switch to Full (strict) TLS with an origin cert.
   - Cloudflare rate-limiting can be configured post-launch as a cushion; adding it before launch is premature.

3. Verify:

   ```sh
   dig +short app.cowork-claw.ai
   dig +short cowork-claw.ai
   ```

   Both should return the VPS IP.

4. Watch Traefik's ACME logs when you first boot:

   ```sh
   docker logs -f traefik 2>&1 | grep -i acme
   ```

   First-time cert issuance takes ~30 seconds. If you see rate-limit errors from LetsEncrypt, wait and retry.

## Rollback

If DNS needs to be reverted, simply change the A records back to the previous IPs. No code change needed.

## Post-launch upgrades (v2, not tomorrow)

- Turn on orange-cloud with Full (strict), using a Cloudflare origin cert installed in Traefik
- Add Cloudflare rate-limit rules on `/api/tasks`
- Enable Cloudflare BotID / Turnstile on onboarding
