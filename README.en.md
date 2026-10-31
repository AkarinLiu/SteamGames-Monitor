# SteamGames-Monitor

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Italiano](README.it.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [조선어](README.ko-KP.md) | [Nederlands](README.nl.md) | [Русский](README.ru.md)

The interface is available in Simplified Chinese, Traditional Chinese, English, German, French, Italian, Japanese, Korean, North Korean, Dutch, and Russian. Switch it from the top-right selector; this setting is independent of the Steam content language.

A self-hosted, multi-user monitoring system for Steam game / DLC sales status. Data is stored in SQLite; the system monitors **upcoming delistings / removals, discounts, and releases**, and sends notifications through WeCom group bots, Feishu bots, DingTalk bots, or SMTP email.
A single process serves the web UI, REST API, Steam polling scheduler, notification delivery queue, Feishu / Lark / DingTalk callbacks, and Feishu, DingTalk Stream, and WeCom long connections at the same time, making it suitable for single-host Docker Compose deployments.

## Features

- **Independent multi-user accounts**: admins create accounts, and each user has their own monitors, events, notification channels, and command bots, with strict data isolation.
- **Monitors**: appid, store link, or name search; bulk-import all DLC for a base game.
- **Status changes**: release (coming soon flips), release date announced / changed, sale start / change / end, base price change, unavailable (delisted), and restored.
- **Delisting detection**: the store purchasability state must flip twice in a row before a delisting is confirmed; Steam news keywords provide early warning (heuristic, for reference only).
- **Notification channels**: WeCom group bot, Feishu custom bot, DingTalk custom bot, custom WebHook, SMTP email; failed deliveries are retried automatically.
- **Command bots**: Feishu / Lark app bot (one-click QR creation, HTTP callback or WebSocket long connection), DingTalk bot (one-click QR creation, HTTP callback or Stream long connection), WeCom intelligent bot long connection, with QR creation, web authorization for unauthorized users, and event notifications; supports `/add`, `/list`, `/price`, `/check`, `/pause`, `/resume`, `/remove`, `/adddlc`, `/events`, `/cancel`; WeChat ClawBot and QQ Bot are being integrated following the platforms' official protocols.
- **Operations friendly**: health checks, Docker image, online database backup, configurable data retention policy.

## Tech stack

- Node.js 24 + TypeScript (ESM), Hono, `node:sqlite` (WAL), Zod, Nodemailer
- Vue 3 + Vite + Pinia + Vue Router (build output served directly by the Node process)
- Testing: Vitest (unit), Playwright (end-to-end)

## Quick start (local development)

Requires Node.js `^22.18 || >=24.12` and pnpm.

```bash
pnpm install
cp .env.example .env
# Edit .env: set at least APP_SECRET (>= 32 characters)
openssl rand -base64 48
pnpm dev
```

- Web UI: http://localhost:5173
- Backend API: http://localhost:8787

On first start, open the web UI directly to create the first admin account and choose region, language, and time zone. **Region has no default value**; accounts that have not completed initialization cannot add monitors. The initialization endpoint is disabled automatically once the first admin is created; since an initialization token is no longer required, do not expose an uninitialized instance to the public internet — complete initialization right after deployment.

### Production build

```bash
pnpm build   # type check + build frontend dist/ + server dist-server/index.js
pnpm start   # requires a prior build; Node serves both the API and the static frontend
```

## Environment variables

| Variable | Description |
| --- | --- |
| `NODE_ENV` | When set to `production`, `APP_SECRET` is strictly validated |
| `HOST` / `PORT` | Listen address and port, defaults to `0.0.0.0:8787` |
| `DATA_DIR` | Data directory, defaults to `./data` (`/data` in Docker) |
| `DATABASE_PATH` | SQLite file path, defaults to `${DATA_DIR}/steam-monitor.db` |
| `APP_SECRET` | Required, >= 32 characters. Used to derive the key that encrypts channel / bot credentials; **saved secrets cannot be decrypted after it is lost** |
| `PUBLIC_BASE_URL` | Public access address, used to generate Feishu / Lark / DingTalk callback URLs, WeCom web authorization links, and CSRF checks; long connections do not need a public callback address |
| `TRUSTED_ORIGINS` | Additional allowed origins, comma-separated (include `http://localhost:5173` during development) |
| `COOKIE_SECURE` | Set to `1` for HTTPS deployments |
| `TRUST_PROXY` | Number of reverse proxy hops |
| `MAX_TOTAL_MONITORS` | Global monitor limit, defaults to 2000 |
| `ALLOW_INSECURE_WEBHOOKS` | Set to `1` for testing only; allows http / intranet Webhooks |
| `ENABLE_DEV_COMMANDS` / `DEV_COMMAND_TOKEN` | Development-only `/api/dev/command` for simulating commands |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error`; file logs are written to `${DATA_DIR}/logs/app-YYYY-MM-DD.log` |
| `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL` | Optional overrides for Steam endpoints (for testing / proxying) |

In proxy environments you can use `HTTPS_PROXY`, `NODE_USE_ENV_PROXY=1`, and `NO_PROXY`. If Node does not recognize the system certificate chain, the service merges the system CAs at startup (`lib/tls.ts`).

## Docker Compose deployment

GitHub Actions publishes snapshot images (`dev`) on pushes to the `main` branch, and on stable version tags (e.g. `v1.1.1`) publishes a semantic version and points `latest` at that stable version:

```bash
# Latest stable
docker pull akarinliu2000/steamgames-monitor:latest
# Current 1.1.1 stable
docker pull akarinliu2000/steamgames-monitor:1.1.1
# Latest snapshot from the main branch
docker pull akarinliu2000/steamgames-monitor:dev
```

Images support `linux/amd64` and `linux/arm64`; Docker selects the right one for the host architecture. Two base images are provided:

| Tag | Base image | Description |
| --- | --- | --- |
| `latest` / `1.1.1` / `1.1` | Debian slim (`node:24-bookworm-slim`) | Latest stable |
| `latest-alpine` / `1.1.1-alpine` / `1.1-alpine` | Alpine (`node:24-alpine`) | Latest stable, Alpine |
| `dev` | Debian slim | Latest snapshot from the `main` branch |
| `dev-alpine` | Alpine | Latest Alpine snapshot from the `main` branch |

`latest` only moves on non-prerelease tags (e.g. `v1.1.1`); tags with `-rc` / `-beta` do not overwrite `latest`. Regular commits to the `main` branch only update `dev` / `dev-alpine` and `sha-*` tags.

```bash
docker pull akarinliu2000/steamgames-monitor:latest-alpine
# Build the Alpine variant locally
docker build --build-arg BASE_IMAGE=node:24-alpine -t steam-monitor:alpine .
```

Run the image directly:

```bash
cp .env.example .env
# Fill in APP_SECRET, PUBLIC_BASE_URL (public HTTPS address), COOKIE_SECURE=1, TRUST_PROXY=1
docker run -d --name steam-monitor \
  --env-file .env \
  -p 8787:8787 \
  -v "$(pwd)/data:/data" \
  --restart unless-stopped \
  akarinliu2000/steamgames-monitor:latest
```

View container logs:

```bash
# docker run
docker logs -f steam-monitor

# docker compose
docker compose logs -f steam-monitor
```

If `docker ps` shows a random container name (e.g. `nervous_roentgen`), `--name steam-monitor` was not passed at startup; in that case `docker compose logs` will not show the container, so use `docker logs -f <actual container name>`. With a standalone `docker run`, settings such as `LOG_LEVEL` and `PUBLIC_BASE_URL` are loaded only when `--env-file .env` is passed; without it the log level defaults to `info` and `PUBLIC_BASE_URL` defaults to `http://localhost:8787`.

Application logs are also written by UTC date to `${DATA_DIR}/logs/app-YYYY-MM-DD.log`; Docker maps this to the host `./data/logs/` by default. Container stdout is still kept and can be viewed with `docker logs`. Log files are not deleted automatically, so archive or clean them up as needed.

Start Compose with the Docker Hub image:

```bash
docker compose pull
docker compose up -d
```

Rebuild locally after changing code (this overwrites the local image with the same Docker Hub tag):

```bash
docker compose up -d --build
```

### Publishing to Docker Hub

Docker Hub: <https://hub.docker.com/r/akarinliu2000/steamgames-monitor> (`akarinliu2000/steamgames-monitor`)

`.github/workflows/dockerhub.yml` publishes a `dev` snapshot on pushes to the `main` branch, and on stable version tag pushes publishes a semantic version and updates `latest`:

- The repository secrets must define `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (a Docker Hub access token with Read & Write permission).
- Current images: `docker.io/akarinliu2000/steamgames-monitor:latest`, `:1.1.1`, `:dev` (Debian), plus the corresponding `-alpine` variants, all multi-arch amd64/arm64.
- The Docker Hub repository is public and can be pulled anonymously.
- To use an organization namespace, add the repository variable `DOCKERHUB_REPOSITORY` (e.g. `myorg/steamgames-monitor`).

```bash
docker pull akarinliu2000/steamgames-monitor:latest
```

```bash
gh secret set DOCKERHUB_USERNAME --repo AkarinLiu/SteamGames-Monitor
gh secret set DOCKERHUB_TOKEN --repo AkarinLiu/SteamGames-Monitor
```

- Data is persisted on the host in `./data` (mounted to `/data` in the container); the database, backups, and `logs/` logs are all written there.
- The image entrypoint fixes the permissions of `./data` and then drops privileges to the `node` user inside the container to run the app; on Linux you can also run `sudo chown -R 1000:1000 data` manually.
- The entrypoint maps a relative `DATA_DIR` / `DATABASE_PATH` from `.env` to `/data` automatically, so a standalone `docker run --env-file .env` also reaches the initialization wizard correctly.
- The container always uses `/data` as the data directory; Compose overrides `DATA_DIR` / `DATABASE_PATH` from `.env`, so do not change them to relative paths inside the container.
- `PUBLIC_BASE_URL` must match the address browsers actually use (e.g. `http://192.168.1.10:8787`); update it as well when using a domain / HTTPS reverse proxy.
- `APP_SECRET` is required; the container exits if it is missing. Run `docker compose logs -f steam-monitor` to see startup errors.
- After editing `.env`, run `docker compose up -d` to recreate the container and apply the changes.
- The application process runs as a non-root user, with a built-in `HEALTHCHECK` that calls `/api/health`.
- Updating the image: `docker compose pull && docker compose up -d`; local build: `docker compose up -d --build`; stop: `docker compose down` (data is preserved).
- Reverse proxy notes:
  - The **raw request body** of `/webhooks/*` must be forwarded unchanged (do not rewrite or re-serialize it).
  - `client_max_body_size 1m`, read timeout >= 10s.
  - Feishu / Lark / DingTalk endpoints that use HTTP callbacks must be reachable over public HTTPS; no callback URL is needed when Feishu / Lark, DingTalk Stream, or WeCom intelligent bots use outbound long connections.

## Notification channel configuration

Add a channel on the "Notification channels" page:

- **WeCom group bot**: group settings → group bots → add bot, then copy the Webhook.
- **Feishu custom bot**: group settings → group bots → custom bot; if signature verification is enabled, also fill in the signing secret.
- **DingTalk custom bot**: group settings → smart group assistant → add bot; if signing is enabled, also fill in the signing secret.
- **Custom WebHook**: any HTTPS endpoint; the system POSTs JSON events, with optional HMAC signing secret and Authorization header.
- **SMTP**: server, port, SSL/TLS, sender, and recipients (separate multiple addresses with commas).

Secrets are stored encrypted with AES-256-GCM using a key derived from `APP_SECRET`; the API never returns plaintext, and leaving a field empty when editing keeps the existing value.

For the request format, payload fields, and signing algorithm of custom WebHooks, see [docs/CUSTOM_WEBHOOK.en.md](docs/CUSTOM_WEBHOOK.en.md).

If no events are selected under "Subscribed events", the channel receives all events except "check error".

## Command bot integration

Create a bot on the "Command bots" page:

| Platform | Connection method | Description |
| --- | --- | --- |
| Feishu / Lark | HTTP callback or WebSocket long connection | One-click QR app creation, or enter the App ID / App Secret manually; for long connections, select "Receive events via long connection" in the open platform and subscribe to `im.message.receive_v1` |
| DingTalk | HTTP callback or Stream long connection | One-click QR bot creation, or enter the Client ID / Secret manually; HTTP callbacks use the App Secret to verify the signature, and Stream mode needs no public address |
| WeCom | WebSocket long connection (no callback URL required) | Create an intelligent bot in the admin console, choose API mode → long connection, and enter the Bot ID / Secret; the service connects to `wss://openws.work.weixin.qq.com` |

For Feishu / Lark, the HTTP callback URL is `POST /webhooks/feishu/<slug>`; callback mode supports Encrypt Key / Verification Token, and long connection mode needs no public callback address. The "version" setting switches between Feishu (`open.feishu.cn`) and Lark international (`open.larksuite.com`).

**Feishu / Lark QR setup (recommended)**: on the "Command bots" page, click **Feishu / Lark QR**, choose "Feishu" or "Lark international", scan with the corresponding client, and create the app following the page prompts. The system retrieves the App ID / App Secret automatically and records the scanner's `open_id` as the owner identifier; the QR code is valid for 10 minutes. The app created by scanning is a `PersonalAgent` app with bot capability and message event subscription preconfigured; after creation you can search for the app name in Feishu / Lark to start a chat, or add it to a group.

**DingTalk QR setup (recommended)**: click **Add DingTalk bot by QR**, scan with the DingTalk mobile app, and follow the page prompts to choose an organization and fill in the bot information. The system retrieves the Client ID / Client Secret automatically, uses the Client ID as the Robot Code, and enables the Stream long connection; the QR code is valid for 10 minutes. After creation you can search for the bot in DingTalk to start a one-to-one chat, or add it to a group. Members receive a web authorization link the first time they send a command; the account that owns the bot must log in to the web page and approve it before use.

The WeCom long connection is established outbound by the service and needs no public IP, Token, or EncodingAESKey. Only one valid connection is allowed per bot at a time, so multiple instances will kick each other offline. The legacy WeCom custom app callback configuration is deprecated; use the intelligent bot's Bot ID / Secret instead.

You can also click **Add WeCom bot by QR** and scan with a WeCom account that has creation permission; the system retrieves the Bot ID / Secret automatically, creates the bot, and establishes the long connection. The QR code is valid for 5 minutes. Members receive a web authorization link the first time they send a command; the account that owns the bot must log in to the web page and approve, or add them to the allowlist directly.

When unauthorized Feishu / Lark, DingTalk, or WeCom users send commands, the bot replies with a one-time web authorization link and does not execute the command. After the account that owns the bot logs in to the web page from that link, it can choose the read-only or admin role for that platform user and approve; the link is valid for 30 minutes. `PUBLIC_BASE_URL` must be reachable from the browser, otherwise the link will not open.

Command bots can also enable **Receive event notifications** on the edit page: once enabled, events such as releases, discounts, and delistings are pushed to the conversation used by the most recently authorized user of that bot. The system records a notification target only after an authorized user has sent at least one command in the chat; nothing is pushed when there is no recent conversation. DingTalk event notifications also require the App Key, App Secret, and Robot Code.

Bot commands always operate on the data of the **account that owns the bot**. All platform users (including the owner ID detected during QR scanning) must first pass web authorization or be added to the allowlist; otherwise the bot only returns a one-time authorization link and does not execute commands. When approving, you can choose `viewer` (read-only) or `admin`. The owner ID is now used for identification only. For detailed steps see [docs/BOT_INTEGRATION.en.md](docs/BOT_INTEGRATION.en.md).

WeChat ClawBot (iLink) and QQ Bot integration is being built following the platforms' official protocols and will appear on the same page once complete.

### Commands

```
/help
/add <appid | store link | name> [--discount N] [--note text] [--force]
/adddlc <base game> [--max 50]
/remove <id | appid>
/pause <id | appid>
/resume <id | appid>
/check <id | appid | name>
/price <id | appid | name>
/list [--all] [--sale] [--paused] [--page N]
/events [--item id] [--limit 10]
/cancel
```

Full-width `／`, `/add@bot`, quoted arguments, and `--flag=value` are supported.

## Region and re-baselining

Region is a user-level setting. Changing the region re-baselines all existing monitors of that user: sale anchors are cleared, states are reset, and the first check only records a snapshot without producing events, avoiding false positives caused by price differences between regions. Other users are unaffected.

## Resetting passwords

Run on the server terminal (no web login required):

```bash
pnpm reset-password <username>
pnpm reset-password <username> --password 'new-password-123'
pnpm reset-password <username> --enable
```

Docker deployment:

```bash
docker compose exec steam-monitor node dist-server/reset-password.js <username>
```

- Without `--password`, a random temporary password is generated and printed to the terminal.
- After a reset, `must_change_password=1` and the user must change the password at the next login; all existing sessions of that user are invalidated.
- Disabled accounts stay disabled by default; add `--enable` to enable them at the same time.
- The command operates directly on SQLite and does not depend on `APP_SECRET`; it locates the database through `DATA_DIR` / `DATABASE_PATH`.

## Backup and restore

```bash
pnpm backup
```

The script uses `VACUUM INTO` to create `steam-monitor-YYYYMMDD-HHmm.db` in `${DATA_DIR}/backups/`, keeping the most recent 14 copies by default. In Docker you can run:

```bash
docker compose exec steam-monitor node_modules/.bin/tsx scripts/backup.ts
```

Restore steps: stop the container → replace `steam-monitor.db` with the backup file → delete the `-wal` / `-shm` files in the same directory → start the container. **Back up the `APP_SECRET` in `.env` as well**, otherwise encrypted channel and bot secrets cannot be recovered and must be re-entered.

## Testing

```bash
pnpm type-check
pnpm lint
pnpm test:unit
pnpm test:e2e   # requires Playwright browsers first: pnpm exec playwright install chromium
```

The end-to-end tests will:

1. Create a fresh database in `data/e2e` and start the backend (4180), Vite (4181), and the mock services (9998);
2. Drive the full release, discount, delisting, and restore flows against mock Steam endpoints;
3. Verify WeCom notifications, custom WebHook, SMTP email, Feishu / Lark / DingTalk callbacks and QR configuration, Feishu / DingTalk / WeCom long connections, and multi-user isolation.

`scripts/mock-receiver.ts` can also be run standalone for local integration testing:

```bash
pnpm mock:receiver
# Notification Webhook: http://127.0.0.1:9999/<any path>
# SMTP sink: 127.0.0.1:1025
# Captured requests: GET http://127.0.0.1:9999/_requests
# Mock Steam: http://127.0.0.1:9999/steam-store and /steam-api
```

Combined with `ALLOW_INSECURE_WEBHOOKS=1` and `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL`, you can test fully offline.

## Known limitations

- The Steam store interface is unofficial and may change or rate-limit; it cannot distinguish "delisted / not sellable in this region / invalid appid", so the system requires "was purchasable before + two consecutive unavailable checks" to reduce false positives.
- News keyword warnings only cover Steam news / announcements and are heuristic hints that need human confirmation.
- The exact sale end time is unknown; `sale_end` depends on the next poll discovering that the discount has dropped to zero.
- WeCom group bots can only send; use the WeCom intelligent bot long connection for in-group commands. A long connection supports only one valid connection per bot, so multiple instances will kick each other offline.
- WeChat ClawBot (iLink) and QQ Bot are being integrated following the platforms' official protocols.
- Single-instance deployment, single SQLite writer; no high availability.
- Different user regions cause the same game to be cached and fetched separately per region.

## Directory structure

```
server/            Hono app, SQLite, Steam collection, scheduling, notifications, platform callbacks / long connections, commands
shared/            Types, constants, and Zod schemas shared by frontend and backend
src/               Vue frontend
scripts/           Mock services, backup, E2E startup scripts
e2e/               Playwright end-to-end tests
Dockerfile         Multi-stage build (build frontend and server -> production dependencies only at runtime)
docker-compose.yml Single-service deployment, bind-mounts host ./data
data/              Host data directory (SQLite, backups, logs/ application logs)
```
