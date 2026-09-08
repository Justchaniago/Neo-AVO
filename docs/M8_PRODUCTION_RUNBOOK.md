# M8 Production Runbook

## Topology and deploy

V1 uses one VPS/Lightsail host: Cloudflare DNS → Nginx/Caddy → `127.0.0.1:3000`, with PostgreSQL bound privately on the host. Only ports 80/443 and restricted SSH are public; PostgreSQL and port 3000 are not exposed.

Create a dedicated `neo-avo` OS user and application database/user. Install a supported Node.js runtime, PostgreSQL client tools, Nginx, AWS CLI (or another S3-compatible CLI), clone the repository at `/opt/neo-avo`, and create `/etc/neo-avo/neo-avo.env` mode `0600` owned by root/`neo-avo`.

Deploy order:

```sh
git fetch --tags origin
git checkout <known-good-commit>
npm ci
npm run build
npm run production:check
npm run db:migrate
sudo systemctl restart neo-avo-web
sudo systemctl restart neo-avo-worker
curl --fail https://neo-avo.chaniago.me/api/health
sudo systemctl --no-pager --full status neo-avo-web neo-avo-worker
```

Run migration once, before restarting either service. Do not run migrations from both services. A failed migration stops the deploy and must be investigated before restart.

The supplied systemd units are `ops/systemd/neo-avo-web.service` and `ops/systemd/neo-avo-worker.service`. Web and worker are separate lifecycles; either can restart without embedding one in the other. Both receive SIGTERM and have bounded stop timeouts.

Rollback the application by checking out the previous known-good commit, running `npm ci` and `npm run build`, then restarting both services. Do not pretend schema changes are automatically reversible. If the older binary is incompatible with the current schema, restore a backup into a clean database and point a controlled maintenance deployment at it.

## Environment and secrets

Base runtime requires `DATABASE_URL`. `DATABASE_SSL=require` is the production default. Telegram variables (`TELEGRAM_BOT_TOKEN`, `NEO_AVO_TELEGRAM_ALLOWED_CHAT_ID`) are required when immediate Telegram delivery is part of the deployment; set `REQUIRE_TELEGRAM=1` for the production check. Vertex variables (`GOOGLE_CLOUD_PROJECT`, optional location/model) are required only when enabling Ops Analyst; set `REQUIRE_VERTEX=1` for that check. `COMMAND_ENCRYPTION_KEY` is required before configuring any PUSH project, but is not a global dependency for PULL-only deployments.

Generate the command key with cryptographically secure randomness, for example `openssl rand -hex 32`. Never commit it, print it, or include it in events, logs, prompts, or backups as a separate artifact. The encrypted PUSH secrets in PostgreSQL cannot be decrypted after restore without the exact corresponding key; preserve the key in the operator’s restricted secret backup alongside the database backup.

Rotate M1 project credentials through the existing credential rotation endpoint and update the project adapter immediately. Rotate Telegram by replacing the bot token in the environment file and restarting worker. Rotate a PUSH secret by updating project configuration with a new outbound secret and restarting/reloading the worker. `COMMAND_ENCRYPTION_KEY` is not transparently rotatable in V1: planned rotation requires re-encrypting each PUSH secret under a new key in a controlled maintenance operation, or retaining the old key until all ciphertext has been migrated. Vertex production uses a Neo AVO-owned service account/workload identity with only the minimum Vertex AI invocation permissions; never use Keymax, Tele Auto, or a personal developer identity.

## Health, logs, and recovery

`GET /api/health` is a minimal readiness check: it verifies the web route and `select 1` against PostgreSQL. It returns HTTP 200 with `database: ok` or HTTP 503 with `database: unavailable`; it never returns secrets. Use `systemctl status` and `journalctl -u neo-avo-worker` to verify worker start/stop, processing failures, quarantine, Telegram/Vertex/PUSH failures. Logs are JSON and deliberately omit payloads, credentials, tokens, and authorization headers.

Daily backup uses `scripts/backup-postgres.sh` with `DATABASE_URL`, a restricted temporary `BACKUP_DIR`, and an off-host `BACKUP_S3_URI`. The script emits a UTC filename `neo-avo-YYYYMMDDTHHMMSSZ.dump.gz`, uploads it to S3-compatible storage, and removes the local copy. Configure bucket lifecycle retention (recommended 30 daily copies) and alert on the cron/systemd timer failure. Target planning assumptions are RPO approximately 24 hours and manual RTO within hours; these are not HA guarantees.

Restore only into a clean, non-production database:

```sh
DATABASE_URL=postgresql://neo_avo_restore@127.0.0.1/neo_avo_restore \
BACKUP_FILE=/secure/backup/neo-avo-YYYYMMDDTHHMMSSZ.dump.gz \
./scripts/restore-postgres.sh
npm run db:migrate
```

Then read `/api/health` and verify projects, credentials, events, incidents, notifications, analyses, and commands with read-only queries. Never restore over production during a drill.

## Failure expectations

- PostgreSQL unavailable: readiness is 503; web request operations fail visibly; raw state is not silently fabricated.
- Worker killed mid-event: claim lease expires, raw event remains, and another worker can retry it.
- Web restart: worker state remains in PostgreSQL; no in-process worker is hidden in Next.js.
- Telegram unavailable: notification delivery retries independently; incidents/events/projections remain valid.
- Vertex unavailable or malformed: analysis records failure; deterministic incident severity/state and Telegram remain authoritative.
- PUSH target unavailable: command remains durable with bounded delivery attempts; project core operation is independent.
- Invalid command key: PUSH configuration/delivery fails visibly; PULL and deterministic M0–M5 paths remain available.

Retention remains manual in V1. Do not delete events or incident evidence until production volume and retention requirements are measured.

The current dependency audit reports advisories in `drizzle-orm` and transitive `postcss`/Next.js versions. Automatic force-upgrade was deliberately not applied because the available fixes include breaking upgrades; review and schedule those upgrades before public production exposure.

Do not cut over `office.chaniago.me` yet. Validate first on `neo-avo.chaniago.me`; keep the old AVO available until staging and first integration acceptance are complete.
