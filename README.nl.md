# SteamGames-Monitor

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Italiano](README.it.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [조선어](README.ko-KP.md) | [Nederlands](README.nl.md) | [Русский](README.ru.md)

De interface is beschikbaar in Vereenvoudigd Chinees, Traditioneel Chinees, Engels, Duits, Frans, Italiaans, Japans, Koreaans, Noord-Koreaans, Nederlands en Russisch. Wissel via de selector rechtsboven; deze instelling staat los van de Steam-inhoudstaal.

Zelfgehost multiuser-systeem voor het monitoren van de verkoopstatus van Steam-games en -DLC. De gegevens worden opgeslagen in SQLite. Het systeem monitort **aanstaande stopzetting van de verkoop / delisting, kortingen en releases** en verstuurt meldingen via WeCom-groepsbots, Feishu-bots, DingTalk-bots of SMTP-e-mail.
Hetzelfde proces levert tegelijk de webinterface, de REST API, de Steam-pollingscheduler, de afleverwachtrij voor notificaties, de callbacks van Feishu / Lark / DingTalk en de langdurige verbindingen van Feishu, DingTalk Stream en WeCom. Daarmee is het geschikt voor Docker Compose-deployment op één machine.

## Functies

- **Onafhankelijke accounts per gebruiker**: de beheerder maakt accounts aan; elke gebruiker heeft eigen monitoritems, gebeurtenissen, notificatiekanalen en commando-bots, met strikte gegevensisolatie.
- **Monitoritems**: ondersteuning voor appid, winkel-URL en zoeken op naam; u kunt in één keer alle DLC van een basisgame importeren.
- **Statuswijzigingen**: release (het omklappen van "coming soon"), begin / wijziging / einde van een actie, wijziging van de oorspronkelijke prijs, niet beschikbaar (delisting) en herstel.
- **Delistingdetectie**: een delisting wordt pas bevestigd nadat de aankoopstatus in de winkel twee keer achter elkaar is omgeslagen; in combinatie met trefwoorden uit Steam-nieuws wordt een vroege waarschuwing gegeven (heuristisch, alleen ter indicatie).
- **Notificatiekanalen**: WeCom-groepsbot, aangepaste Feishu-bot, aangepaste DingTalk-bot, aangepaste WebHook en SMTP-e-mail; mislukte leveringen worden automatisch opnieuw geprobeerd.
- **Commando-bots**: Feishu-/Lark-appbots (met één QR-scan aanmaken, HTTP-callback of WebSocket-langdurige verbinding), DingTalk-bots (met één QR-scan aanmaken, HTTP-callback of Stream-langdurige verbinding) en de langdurige verbinding van de WeCom-slimme robot; met ondersteuning voor aanmaken via QR-code, webautorisatie voor niet-geautoriseerde gebruikers en gebeurtenismeldingen; ondersteunt `/add`, `/list`, `/price`, `/check`, `/pause`, `/resume`, `/remove`, `/adddlc`, `/events`, `/cancel`; WeChat ClawBot en QQ Bot worden volgens de officiële platformprotocollen geïntegreerd.
- **Operationeel vriendelijk**: health check, Docker-images, online back-up van de database en een configureerbaar bewaarbeleid voor gegevens.

## Technologiestack

- Node.js 24 + TypeScript (ESM), Hono, `node:sqlite` (WAL), Zod, Nodemailer
- Vue 3 + Vite + Pinia + Vue Router (de buildoutput wordt rechtstreeks door het Node-proces geserveerd)
- Tests: Vitest (unit), Playwright (end-to-end)

## Snel aan de slag (lokale ontwikkeling)

Vereist Node.js `^22.18 || >=24.12` en pnpm.

```bash
pnpm install
cp .env.example .env
# Bewerk .env: vul minimaal APP_SECRET in (>=32 tekens)
openssl rand -base64 48
pnpm dev
```

- Webinterface: http://localhost:5173
- Backend-API: http://localhost:8787

Open bij de eerste start direct de webinterface om het eerste beheerdersaccount aan te maken en kies de regio, taal en tijdzone. **De regio heeft geen standaardwaarde**; accounts die de initialisatie niet hebben voltooid, kunnen geen monitoritems toevoegen. Het initialisatie-endpoint vervalt automatisch zodra de eerste beheerder is aangemaakt. Omdat er geen initialisatietoken meer nodig is, mag u een instantie die nog niet is geïnitialiseerd niet op het openbare internet zetten; voltooi de initialisatie direct na de deployment.

### Productiebuild

```bash
pnpm build   # Typecontrole + build van de frontend dist/ + van de server dist-server/index.js
pnpm start   # Vereist eerst een build; Node serveert zowel de API als de statische frontend
```

## Omgevingsvariabelen

| Variabele | Beschrijving |
| --- | --- |
| `NODE_ENV` | Bij `production` wordt `APP_SECRET` verplicht gevalideerd |
| `HOST` / `PORT` | Luisteradres en -poort, standaard `0.0.0.0:8787` |
| `DATA_DIR` | Gegevensmap, standaard `./data` (in Docker `/data`) |
| `DATABASE_PATH` | Pad naar het SQLite-bestand, standaard `${DATA_DIR}/steam-monitor.db` |
| `APP_SECRET` | Verplicht, ≥32 tekens. Wordt gebruikt om sleutels af te leiden voor het versleutelen van kanaal- en botreferenties; **na verlies kunnen opgeslagen sleutels niet meer worden ontsleuteld** |
| `PUBLIC_BASE_URL` | Extern toegankelijk adres, gebruikt voor het genereren van de callbackadressen van Feishu / Lark / DingTalk, de webautorisatielinks van WeCom en de CSRF-validatie; de langdurige verbinding zelf heeft geen openbare callback nodig |
| `TRUSTED_ORIGINS` | Extra toegestane origins, kommagescheiden (bij ontwikkeling inclusief `http://localhost:5173`) |
| `COOKIE_SECURE` | Stel in op `1` bij een HTTPS-deployment |
| `TRUST_PROXY` | Aantal lagen van de reverse proxy |
| `MAX_TOTAL_MONITORS` | Wereldwijde limiet voor monitoritems, standaard 2000 |
| `ALLOW_INSECURE_WEBHOOKS` | Alleen bij tests op `1` zetten; staat http- / intranet-Webhooks toe |
| `ENABLE_DEV_COMMANDS` / `DEV_COMMAND_TOKEN` | Alleen voor ontwikkeling: `/api/dev/command` om commando's te simuleren |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error`; logbestanden worden geschreven naar `${DATA_DIR}/logs/app-YYYY-MM-DD.log` |
| `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL` | Optioneel; overschrijft de Steam-endpoints (voor tests / proxy's) |

In een proxyomgeving kunt u `HTTPS_PROXY`, `NODE_USE_ENV_PROXY=1` en `NO_PROXY` gebruiken. Als de certificaatketen van het systeem niet door Node wordt herkend, voegt de service bij het opstarten de systeem-CA's samen (`lib/tls.ts`).

## Deployment met Docker Compose

GitHub Actions publiceert bij een push naar de branch `main` een snapshot-image (`dev`) en bij een tag van een stabiele versie (bijvoorbeeld `v1.1.1`) een semantische versie, waarbij `latest` naar die stabiele versie wijst:

```bash
# Nieuwste stabiele versie
docker pull akarinliu2000/steamgames-monitor:latest
# Huidige stabiele versie 1.1.1
docker pull akarinliu2000/steamgames-monitor:1.1.1
# Nieuwste snapshot van de branch main
docker pull akarinliu2000/steamgames-monitor:dev
```

De images ondersteunen `linux/amd64` en `linux/arm64`; Docker kiest automatisch de architectuur van de host. Er zijn twee soorten basisimages:

| Tag | Basisimage | Beschrijving |
| --- | --- | --- |
| `latest` / `1.1.1` / `1.1` | Debian slim (`node:24-bookworm-slim`) | Nieuwste stabiele versie |
| `latest-alpine` / `1.1.1-alpine` / `1.1-alpine` | Alpine (`node:24-alpine`) | Nieuwste stabiele Alpine-versie |
| `dev` | Debian slim | Nieuwste snapshot van de branch `main` |
| `dev-alpine` | Alpine | Nieuwste Alpine-snapshot van de branch `main` |

`latest` wordt alleen verplaatst bij een tag die geen pre-release is (zoals `v1.1.1`); tags met `-rc` / `-beta` overschrijven `latest` niet. Gewone commits op de branch `main` werken alleen de tags `dev` / `dev-alpine` en `sha-*` bij.

```bash
docker pull akarinliu2000/steamgames-monitor:latest-alpine
# Alpine-versie lokaal bouwen
docker build --build-arg BASE_IMAGE=node:24-alpine -t steam-monitor:alpine .
```

Direct met de image draaien:

```bash
cp .env.example .env
# Vul APP_SECRET, PUBLIC_BASE_URL (openbaar HTTPS-adres), COOKIE_SECURE=1 en TRUST_PROXY=1 in
docker run -d --name steam-monitor \
  --env-file .env \
  -p 8787:8787 \
  -v "$(pwd)/data:/data" \
  --restart unless-stopped \
  akarinliu2000/steamgames-monitor:latest
```

Containerlogboeken bekijken:

```bash
# met docker run
docker logs -f steam-monitor

# met docker compose
docker compose logs -f steam-monitor
```

Als `docker ps` een willekeurige containernaam toont (bijvoorbeeld `nervous_roentgen`), is de container zonder `--name steam-monitor` gestart; in dat geval toont `docker compose logs` de container niet en moet u `docker logs -f <werkelijke containernaam>` gebruiken. Bij een afzonderlijke `docker run` worden configuraties zoals `LOG_LEVEL` en `PUBLIC_BASE_URL` alleen geladen als u `--env-file .env` meegeeft; zonder dat is het logniveau standaard `info` en is `PUBLIC_BASE_URL` standaard `http://localhost:8787`.

Applicatielogboeken worden daarnaast per UTC-datum weggeschreven naar `${DATA_DIR}/logs/app-YYYY-MM-DD.log`; in Docker worden ze standaard gemapt naar `./data/logs/` op de host. De stdout van de container blijft beschikbaar en is met `docker logs` te bekijken. Logbestanden worden niet automatisch verwijderd; archiveer of ruim ze naar behoefte op.

Compose starten met de Docker Hub-image:

```bash
docker compose pull
docker compose up -d
```

Na codewijzigingen lokaal opnieuw bouwen (overschrijft de lokale image met dezelfde tag van Docker Hub):

```bash
docker compose up -d --build
```

### Publiceren naar Docker Hub

Docker Hub-adres: <https://hub.docker.com/r/akarinliu2000/steamgames-monitor> (`akarinliu2000/steamgames-monitor`)

`.github/workflows/dockerhub.yml` publiceert bij een push naar de branch `main` een `dev`-snapshot en bij een tag van een stabiele versie een semantische versie, en werkt `latest` bij:

- In de repository-secrets moeten `DOCKERHUB_USERNAME` en `DOCKERHUB_TOKEN` worden ingesteld (Docker Hub Access Token met Read & Write-rechten).
- Huidige images: `docker.io/akarinliu2000/steamgames-monitor:latest`, `:1.1.1`, `:dev` (Debian) en de bijbehorende `-alpine`-versies, allemaal als multi-architectuur amd64/arm64.
- De Docker Hub-repository is openbaar en kan anoniem worden gepulld.
- Als u een organisatienamespace wilt gebruiken, kunt u de repositoryvariabele `DOCKERHUB_REPOSITORY` toevoegen (bijvoorbeeld `myorg/steamgames-monitor`).

```bash
docker pull akarinliu2000/steamgames-monitor:latest
```

```bash
gh secret set DOCKERHUB_USERNAME --repo AkarinLiu/SteamGames-Monitor
gh secret set DOCKERHUB_TOKEN --repo AkarinLiu/SteamGames-Monitor
```

- Gegevens worden persistent opgeslagen in `./data` op de host (gemount op `/data` in de container); de database, back-ups en de logboeken in `logs/` komen hier terecht.
- Het image-entrypoint corrigeert de rechten van `./data` en laat de applicatie daarna als de gebruiker `node` in de container draaien; onder Linux kunt u ook handmatig `sudo chown -R 1000:1000 data` uitvoeren.
- Het entrypointscript mapt relatieve waarden van `DATA_DIR` / `DATABASE_PATH` uit `.env` automatisch naar `/data`, zodat ook een afzonderlijke `docker run --env-file .env` normaal in de installatiewizard komt.
- In de container wordt altijd `/data` als gegevensmap gebruikt; Compose overschrijft `DATA_DIR` / `DATABASE_PATH` uit `.env`. Gebruik geen relatieve paden in de container.
- `PUBLIC_BASE_URL` moet overeenkomen met het adres dat de browser daadwerkelijk gebruikt (bijvoorbeeld `http://192.168.1.10:8787`); pas dit ook aan bij gebruik van een domein / HTTPS-reverse-proxy.
- `APP_SECRET` is verplicht; ontbreekt deze, dan stopt de container. Met `docker compose logs -f steam-monitor` bekijkt u de opstartfouten.
- Voer na het wijzigen van `.env` `docker compose up -d` uit om de container opnieuw aan te maken.
- Het applicatieproces draait als niet-rootgebruiker en bevat een ingebouwde `HEALTHCHECK` die `/api/health` aanroept.
- Image bijwerken: `docker compose pull && docker compose up -d`; lokaal bouwen met `docker compose up -d --build`; stoppen: `docker compose down` (gegevens blijven behouden).
- Let op bij een reverse proxy:
  - De **oorspronkelijke requestbody** van `/webhooks/*` moet ongewijzigd worden doorgestuurd (niet herschrijven of opnieuw serialiseren).
  - `client_max_body_size 1m`, lees-timeout ≥10s.
  - De Feishu- / Lark- / DingTalk-adressen met HTTP-callback moeten openbaar via HTTPS bereikbaar zijn; bij uitgaande langdurige verbindingen van Feishu / Lark, DingTalk Stream en de WeCom-slimme robot is geen callbackadres nodig.

## Notificatiekanalen configureren

Voeg op de pagina "Notificatiekanalen" een kanaal toe:

- **WeCom-groepsbot**: groepinstellingen → Groepsbots → Bot toevoegen, en kopieer de Webhook.
- **Aangepaste Feishu-bot**: groepinstellingen → Groepsbots → Aangepaste bot; als u handtekeningvalidatie inschakelt, vult u ook de handtekeningsleutel in.
- **Aangepaste DingTalk-bot**: groepinstellingen → Slimme groepsassistent → Bot toevoegen; als u ondertekening inschakelt, vult u ook de ondertekeningssleutel in.
- **Aangepaste WebHook**: vul een willekeurig HTTPS-endpoint in; het systeem verstuurt JSON-gebeurtenissen via POST, optioneel met een HMAC-handtekeningsleutel en een Authorization-header.
- **SMTP**: vul server, poort, SSL/TLS, afzender en ontvangers in (meerdere adressen kommagescheiden).

Sleutels worden versleuteld opgeslagen met AES-256-GCM op basis van een uit `APP_SECRET` afgeleide sleutel; de API geeft nooit platte tekst terug en een leeg veld bij het bewerken betekent dat de bestaande waarde behouden blijft.

Zie [docs/CUSTOM_WEBHOOK.nl.md](docs/CUSTOM_WEBHOOK.nl.md) voor het requestformaat, de payloadvelden en het handtekeningalgoritme van de aangepaste WebHook.

Als u bij "Gebeurtenissen abonneren" niets aanvinkt, ontvangt u alle gebeurtenissen behalve "controlefout".

## Commando-bots integreren

Maak op de pagina "Commando-bots" een bot aan:

| Platform | Integratiewijze | Beschrijving |
| --- | --- | --- |
| Feishu / Lark | HTTP-callback of WebSocket-langdurige verbinding | Een app aanmaken met één QR-scan, of handmatig App ID / App Secret invullen; voor de langdurige verbinding kiest u in het open platform "Gebeurtenissen ontvangen via langdurige verbinding" en abonneert u zich op `im.message.receive_v1` |
| DingTalk | HTTP-callback of Stream-langdurige verbinding | Een bot aanmaken met één QR-scan, of handmatig Client ID / Secret invullen; bij HTTP-callback valideert App Secret de handtekening, bij Stream is geen openbaar adres nodig |
| WeCom | WebSocket-langdurige verbinding (geen callbackadres nodig) | Maak in het beheerportaal een slimme robot aan, kies API-modus → langdurige verbinding en vul Bot ID / Secret in; de service verbindt actief met `wss://openws.work.weixin.qq.com` |

Het HTTP-callbackadres voor Feishu / Lark is `POST /webhooks/feishu/<slug>`; de callbackmodus ondersteunt Encrypt Key / Verification Token, de langdurige verbinding heeft geen openbaar callbackadres nodig. Met "Versie" in de configuratie schakelt u tussen Feishu (`open.feishu.cn`) en Lark internationaal (`open.larksuite.com`).

**Feishu / Lark toevoegen via QR-code (aanbevolen)**: klik op de pagina "Commando-bots" op **Feishu / Lark scannen**, kies "Feishu" of "Lark internationaal" en scan met de bijbehorende client; volg daarna de aanwijzingen op de pagina om de app aan te maken. Het systeem haalt automatisch het App ID / App Secret op en legt de `open_id` van de scanner vast als eigenaar-ID; de QR-code is 10 minuten geldig. Er wordt een `PersonalAgent`-app aangemaakt met vooraf ingestelde botmogelijkheden en berichtgebeurtenisabonnementen. Na het aanmaken kunt u in Feishu / Lark op de applicatienaam zoeken om een gesprek te starten of de bot aan een groepschat toevoegen.

**DingTalk toevoegen via QR-code (aanbevolen)**: klik op **DingTalk scannen om toe te voegen**, scan met de DingTalk-app op uw telefoon, kies een organisatie en vul de botgegevens in volgens de aanwijzingen op de pagina. Het systeem haalt automatisch het Client ID / Client Secret op, gebruikt het Client ID als Robot Code en schakelt de Stream-langdurige verbinding in; de QR-code is 10 minuten geldig. Na het aanmaken kunt u in DingTalk op de bot zoeken om een directe chat te starten of de bot aan een groepschat toevoegen. Wanneer een lid voor het eerst een commando stuurt, ontvangt deze een webautorisatielink; na goedkeuring via de webpagina met het account waartoe de bot behoort, kan het lid de bot gebruiken.

De langdurige verbinding van WeCom wordt actief door de server opgezet en vereist geen openbaar IP-adres, Token of EncodingAESKey. Per bot is op elk moment slechts één geldige verbinding toegestaan; bij een deployment met meerdere instanties stoten ze elkaar van de verbinding. De callbackconfiguratie van de oude zelfgebouwde WeCom-apps is vervallen; vul in plaats daarvan het Bot ID / Secret van de slimme robot in.

U kunt ook op **WeCom scannen om toe te voegen** klikken en scannen met een WeCom-account dat rechten heeft om slimme robots aan te maken; het systeem haalt automatisch het Bot ID / Secret op, maakt de bot aan en zet de langdurige verbinding op. De QR-code is 5 minuten geldig. Na het eerste commando van een lid ontvangt deze een webautorisatielink; het account waartoe de bot behoort, keurt dit goed via de webpagina, of u voegt het lid rechtstreeks toe aan de allowlist.

Wanneer een niet-geautoriseerde gebruiker van Feishu / Lark, DingTalk of WeCom een commando stuurt, antwoordt de bot met een eenmalige webautorisatielink en wordt het commando niet uitgevoerd. Nadat een webgebruiker van het account waartoe de bot behoort op de linkpagina is ingelogd, kan deze voor die platformgebruiker de rol alleen-lezen of beheerder kiezen en goedkeuren; de link is 30 minuten geldig. `PUBLIC_BASE_URL` moet vanuit de browser bereikbaar zijn, anders kan de link niet worden geopend.

In de bewerkingspagina van een commando-bot kunt u ook **Gebeurtenismeldingen ontvangen** inschakelen: daarna worden gebeurtenissen zoals releases, acties en delistings naar het gesprek gestuurd waarin de bot voor het laatst door een geautoriseerde gebruiker is gebruikt. Een geautoriseerde gebruiker moet eerst minstens één commando in de chat hebben gestuurd voordat het systeem het meldingsdoel vastlegt; zonder recent gesprek wordt niets verstuurd. Voor DingTalk-gebeurtenismeldingen moet u bovendien App Key, App Secret en Robot Code invullen.

Commando's aan een bot werken altijd op de gegevens van **het account waartoe de bot behoort**. Alle platformgebruikers (inclusief de eigenaar-ID die bij het scannen wordt herkend) moeten eerst via webautorisatie worden goedgekeurd of aan de allowlist worden toegevoegd; anders retourneert de bot alleen een eenmalige autorisatielink en wordt het commando niet uitgevoerd. Bij goedkeuring kiest u `viewer` (alleen-lezen) of `admin`. De eigenaar-ID dient nu alleen ter identificatie. Zie [docs/BOT_INTEGRATION.nl.md](docs/BOT_INTEGRATION.nl.md) voor de gedetailleerde stappen.

De integratie van WeChat ClawBot (iLink) en QQ Bot volgens de officiële platformprotocollen is in ontwikkeling; zodra deze gereed is, verschijnen ze op dezelfde pagina.

### Commando's

```
/help
/add <appid | winkel-URL | naam> [--discount N] [--note tekst] [--force]
/adddlc <basisgame> [--max 50]
/remove <id | appid>
/pause <id | appid>
/resume <id | appid>
/check <id | appid | naam>
/price <id | appid | naam>
/list [--all] [--sale] [--paused] [--page N]
/events [--item id] [--limit 10]
/cancel
```

De volgende vormen worden ondersteund: de full-width schuine streep `／`, `/add@bot`, argumenten tussen aanhalingstekens en `--flag=value`.

## Regio en opnieuw baselinen

De regio is een instelling per gebruiker. Wanneer u de regio wijzigt, worden alle bestaande monitoritems van die gebruiker opnieuw gebaselined: actie-ankers worden gewist en de status wordt gereset; de eerste controleronde legt alleen een snapshot vast en genereert geen gebeurtenissen, om valse meldingen door prijsverschillen tussen regio's te voorkomen. Andere gebruikers worden niet beïnvloed.

## Wachtwoord opnieuw instellen

Voer dit uit in de terminal op de server (u hoeft niet in te loggen op de webinterface):

```bash
pnpm reset-password <gebruikersnaam>
pnpm reset-password <gebruikersnaam> --password 'new-password-123'
pnpm reset-password <gebruikersnaam> --enable
```

Docker-deployment:

```bash
docker compose exec steam-monitor node dist-server/reset-password.js <gebruikersnaam>
```

- Zonder `--password` wordt een willekeurig tijdelijk wachtwoord gegenereerd en in de terminal afgedrukt.
- Na het opnieuw instellen geldt `must_change_password=1`: de gebruiker moet bij de volgende login het wachtwoord wijzigen; alle bestaande sessies van die gebruiker vervallen.
- Een uitgeschakeld account blijft standaard uitgeschakeld; met `--enable` wordt het tegelijk weer ingeschakeld.
- Het commando werkt rechtstreeks op SQLite en is niet afhankelijk van `APP_SECRET`; de database wordt gevonden via `DATA_DIR` / `DATABASE_PATH`.

## Back-up en herstel

```bash
pnpm backup
```

Het script gebruikt `VACUUM INTO` om in `${DATA_DIR}/backups/` een `steam-monitor-YYYYMMDD-HHmm.db` te maken en bewaart standaard de laatste 14 back-ups. In Docker voert u uit:

```bash
docker compose exec steam-monitor node_modules/.bin/tsx scripts/backup.ts
```

Herstelprocedure: stop de container → vervang `steam-monitor.db` door het back-upbestand → verwijder de bestanden `-wal` / `-shm` in dezelfde map → start de container. **Maak ook een back-up van `APP_SECRET` in `.env`**, anders kunnen de versleutelde kanaal- en botsleutels niet worden hersteld en moet u ze opnieuw invullen.

## Tests

```bash
pnpm type-check
pnpm lint
pnpm test:unit
pnpm test:e2e   # Vereist eerst de installatie van de Playwright-browsers: pnpm exec playwright install chromium
```

De end-to-endtests doen het volgende:

1. Een nieuwe database aanmaken in `data/e2e` en de backend (4180), Vite (4181) en de mockservice (9998) starten;
2. Met de mock-Steam-API's het volledige proces van release, actie, delisting en herstel doorlopen;
3. WeCom-meldingen, de aangepaste WebHook, SMTP-e-mail, de callbacks en QR-configuratie van Feishu / Lark / DingTalk, de langdurige verbindingen van Feishu / DingTalk / WeCom en de isolatie tussen gebruikers controleren.

`scripts/mock-receiver.ts` kan ook afzonderlijk worden gestart voor lokale integratietests:

```bash
pnpm mock:receiver
# Meldings-Webhook: http://127.0.0.1:9999/<willekeurig pad>
# SMTP-sink: 127.0.0.1:1025
# Opgevangen resultaten: GET http://127.0.0.1:9999/_requests
# Gesimuleerde Steam: http://127.0.0.1:9999/steam-store en /steam-api
```

Samen met `ALLOW_INSECURE_WEBHOOKS=1` en `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL` kunt u volledig offline integratietests uitvoeren.

## Bekende beperkingen

- De Steam-winkel-API is een onofficiële API die kan wijzigen of rate limits kan opleggen; er kan geen onderscheid worden gemaakt tussen "gedelist / niet verkoopbaar in de regio / ongeldige appid". Het systeem gebruikt "eerder verkoopbaar + twee keer achter elkaar niet beschikbaar" om valse meldingen te beperken.
- Waarschuwingen op basis van trefwoorden in het nieuws dekken alleen Steam-nieuws / aankondigingen; het zijn heuristische signalen die handmatige controle vereisen.
- De exacte eindtijd van een actie is niet bekend; `sale_end` is afhankelijk van de volgende pollingronde waarin de korting op nul staat.
- Een WeCom-groepsbot kan alleen verzenden; gebruik voor commando's in de groep de langdurige verbinding van de WeCom-slimme robot. Per bot ondersteunt de langdurige verbinding slechts één geldige verbinding; bij een deployment met meerdere instanties stoten ze elkaar van de verbinding.
- WeChat ClawBot (iLink) en QQ Bot worden volgens de officiële platformprotocollen geïntegreerd.
- Deployment met één instantie, één schrijver voor SQLite; geen hoge beschikbaarheid.
- Verschillende regio's per gebruiker zorgen ervoor dat dezelfde game per regio in de cache wordt opgeslagen en afzonderlijk wordt opgehaald.

## Mapstructuur

```
server/            Hono-app, SQLite, Steam-verzameling, planning, notificaties, platformcallbacks / langdurige verbindingen, commando's
shared/            Gedeelde typen, constanten en Zod-schema's voor frontend en backend
src/               Vue-frontend
scripts/           Mockservice, back-up, E2E-startscripts
e2e/               Playwright end-to-endtests
Dockerfile         Meertrapsbuild (frontend en server bouwen → runtime met alleen productieafhankelijkheden)
docker-compose.yml Deployment met één service, bind-mount van ./data op de host
data/              Gegevensmap op de host (SQLite, back-ups, logs/ applicatielogboeken)
```
