# SteamGames-Monitor

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Italiano](README.it.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [조선어](README.ko-KP.md) | [Nederlands](README.nl.md) | [Русский](README.ru.md)

Die Oberfläche ist auf vereinfachtem Chinesisch, traditionellem Chinesisch, Englisch, Deutsch, Französisch, Italienisch, Japanisch, Koreanisch, Nordkoreanisch, Niederländisch und Russisch verfügbar. Sie lässt sich oben rechts umschalten; diese Einstellung ist unabhängig von der Steam-Inhaltssprache.

Selbst gehostetes Mehrbenutzer-Überwachungssystem für den Verkaufsstatus von Steam-Spielen und DLCs. Die Daten werden in SQLite gespeichert; überwacht werden **bevorstehende Verkaufsbeendigungen / Delistings, Rabattaktionen und Veröffentlichungen**, und die Benachrichtigung erfolgt über WeCom-Gruppenbots, Feishu-Bots, DingTalk-Bots oder SMTP-E-Mail.
Ein einzelner Prozess stellt gleichzeitig die Weboberfläche, die REST-API, die Steam-Abfrageplanung, die Zustellwarteschlange für Benachrichtigungen, Feishu-/Lark-/DingTalk-Rückrufe sowie Feishu-, DingTalk-Stream- und WeCom-Langzeitverbindungen bereit und eignet sich für die Bereitstellung mit Docker Compose auf einem einzelnen Host.

## Funktionen

- **Mehrere unabhängige Benutzerkonten**: Administratoren legen Konten an; jeder Benutzer verfügt über eigene Überwachungseinträge, Ereignisse, Benachrichtigungskanäle und Befehls-Bots, und die Daten sind strikt voneinander getrennt.
- **Überwachungseinträge**: Unterstützt appid, Shop-Links und Namenssuche; außerdem den Massenimport aller DLCs eines Basisspiels.
- **Statusänderungen**: Veröffentlichung (Wechsel von „coming soon“), Beginn / Änderung / Ende einer Rabattaktion, Änderung des Grundpreises, Nichtverfügbarkeit (Delisting) und Wiederherstellung.
- **Delisting-Erkennung**: Ein Delisting gilt erst als bestätigt, wenn der Kaufsstatus im Shop zweimal in Folge umschlägt; zusammen mit Schlüsselwörtern aus Steam-News erfolgt eine Vorwarnung (heuristisch, nur als Hinweis zu verstehen).
- **Benachrichtigungskanäle**: WeCom-Gruppenbot, benutzerdefinierter Feishu-Bot, benutzerdefinierter DingTalk-Bot, benutzerdefinierter WebHook, SMTP-E-Mail; bei Fehlern wird automatisch erneut versucht.
- **Befehls-Bots**: Feishu-/Lark-App-Bot (per QR-Code in einem Schritt erstellt, HTTP-Rückruf oder WebSocket-Langzeitverbindung), DingTalk-Bot (per QR-Code erstellt, HTTP-Rückruf oder Stream-Langzeitverbindung), WeCom-KI-Bot über Langzeitverbindung; unterstützt die Erstellung per QR-Code, die Web-Autorisierung nicht autorisierter Benutzer und Ereignisbenachrichtigungen; unterstützt `/add`, `/list`, `/price`, `/check`, `/pause`, `/resume`, `/remove`, `/adddlc`, `/events`, `/cancel`; WeChat ClawBot und QQ Bot werden derzeit gemäß den offiziellen Plattformprotokollen angebunden.
- **Betriebsfreundlich**: Health Checks, Docker-Images, Online-Sicherung der Datenbank, konfigurierbare Aufbewahrungsrichtlinie für Daten.

## Technologie-Stack

- Node.js 24 + TypeScript (ESM), Hono, `node:sqlite` (WAL), Zod, Nodemailer
- Vue 3 + Vite + Pinia + Vue Router (die Build-Artefakte werden direkt vom Node-Prozess ausgeliefert)
- Tests: Vitest (Unit), Playwright (End-to-End)

## Schnellstart (lokale Entwicklung)

Voraussetzungen: Node.js `^22.18 || >=24.12` und pnpm.

```bash
pnpm install
cp .env.example .env
# .env bearbeiten: mindestens APP_SECRET (>= 32 Zeichen) eintragen
openssl rand -base64 48
pnpm dev
```

- Weboberfläche: http://localhost:5173
- Backend-API: http://localhost:8787

Öffnen Sie beim ersten Start direkt die Weboberfläche und legen Sie das erste Administratorkonto an; wählen Sie dabei Region, Sprache und Zeitzone. **Die Region hat keinen Standardwert**; Konten, deren Initialisierung nicht abgeschlossen ist, können keine Überwachungseinträge hinzufügen. Die Initialisierungsschnittstelle wird nach dem Anlegen des ersten Administrators automatisch ungültig; da kein Initialisierungstoken mehr erforderlich ist, sollten Sie eine nicht initialisierte Instanz nicht öffentlich exponieren und die Initialisierung unmittelbar nach der Bereitstellung abschließen.

### Produktions-Build

```bash
pnpm build   # Typprüfung + Build des Frontends dist/ + Server dist-server/index.js
pnpm start   # erfordert einen vorherigen Build; Node liefert API und statisches Frontend gemeinsam aus
```

## Umgebungsvariablen

| Variable | Beschreibung |
| --- | --- |
| `NODE_ENV` | Bei `production` wird `APP_SECRET` zwingend geprüft |
| `HOST` / `PORT` | Listen-Adresse und Port, Standard `0.0.0.0:8787` |
| `DATA_DIR` | Datenverzeichnis, Standard `./data` (in Docker `/data`) |
| `DATABASE_PATH` | Pfad zur SQLite-Datei, Standard `${DATA_DIR}/steam-monitor.db` |
| `APP_SECRET` | Pflichtfeld, ≥ 32 Zeichen. Dient zum Ableiten des Schlüssels für die Verschlüsselung von Kanal- und Bot-Anmeldedaten; **bei Verlust lassen sich bereits gespeicherte Schlüssel nicht mehr entschlüsseln** |
| `PUBLIC_BASE_URL` | Extern erreichbare Adresse; wird zur Erzeugung der Feishu-/Lark-/DingTalk-Rückrufadressen, der WeCom-Web-Autorisierungslinks und für die CSRF-Prüfung verwendet; Langzeitverbindungen selbst benötigen keinen öffentlichen Rückruf |
| `TRUSTED_ORIGINS` | Zusätzlich erlaubte Origins, durch Kommas getrennt (in der Entwicklung einschließlich `http://localhost:5173`) |
| `COOKIE_SECURE` | Bei HTTPS-Bereitstellung auf `1` setzen |
| `TRUST_PROXY` | Anzahl der Reverse-Proxy-Ebenen |
| `MAX_TOTAL_MONITORS` | Globales Limit für Überwachungseinträge, Standard 2000 |
| `ALLOW_INSECURE_WEBHOOKS` | Nur für Tests auf `1` setzen; erlaubt Webhooks über http / aus dem Intranet |
| `ENABLE_DEV_COMMANDS` / `DEV_COMMAND_TOKEN` | Entwicklungsbefehl `/api/dev/command` zum Simulieren von Befehlen |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error`; Dateilogging nach `${DATA_DIR}/logs/app-YYYY-MM-DD.log` |
| `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL` | Optional, überschreibt die Steam-Endpunkte (für Tests / Proxys) |

In Proxy-Umgebungen können Sie `HTTPS_PROXY`, `NODE_USE_ENV_PROXY=1` und `NO_PROXY` verwenden. Wird die Systemzertifikatskette von Node nicht erkannt, werden beim Start des Dienstes die System-CAs zusammengeführt (`lib/tls.ts`).

## Docker-Compose-Bereitstellung

GitHub Actions veröffentlicht bei einem Push auf den Branch `main` ein Snapshot-Image (`dev`) und bei einem Push eines Tags einer stabilen Version (z. B. `v1.1.0`) eine semantische Version, wobei `latest` auf diese stabile Version zeigt:

```bash
# Neueste stabile Version
docker pull akarinliu2000/steamgames-monitor:latest
# Aktuelle stabile Version 1.1.0
docker pull akarinliu2000/steamgames-monitor:1.1.0
# Neuester Snapshot des Branches main
docker pull akarinliu2000/steamgames-monitor:dev
```

Die Images unterstützen `linux/amd64` und `linux/arm64`; Docker wählt automatisch anhand der Architektur des Hosts. Es werden zwei Basis-Images angeboten:

| Tag | Basis-Image | Beschreibung |
| --- | --- | --- |
| `latest` / `1.1.0` / `1.1` | Debian slim (`node:24-bookworm-slim`) | Neueste stabile Version |
| `latest-alpine` / `1.1.0-alpine` / `1.1-alpine` | Alpine (`node:24-alpine`) | Neueste stabile Version auf Alpine |
| `dev` | Debian slim | Neuester Snapshot des Branches `main` |
| `dev-alpine` | Alpine | Neuester Alpine-Snapshot des Branches `main` |

`latest` wird nur bei Tags von Nicht-Vorabversionen (z. B. `v1.1.0`) verschoben; Tags mit `-rc` / `-beta` überschreiben `latest` nicht. Normale Commits im Branch `main` aktualisieren nur `dev` / `dev-alpine` und die `sha-*`-Tags.

```bash
docker pull akarinliu2000/steamgames-monitor:latest-alpine
# Alpine-Version lokal bauen
docker build --build-arg BASE_IMAGE=node:24-alpine -t steam-monitor:alpine .
```

Direktes Ausführen über das Image:

```bash
cp .env.example .env
# APP_SECRET, PUBLIC_BASE_URL (öffentliche HTTPS-Adresse), COOKIE_SECURE=1, TRUST_PROXY=1 eintragen
docker run -d --name steam-monitor \
  --env-file .env \
  -p 8787:8787 \
  -v "$(pwd)/data:/data" \
  --restart unless-stopped \
  akarinliu2000/steamgames-monitor:latest
```

Container-Logs anzeigen:

```bash
# Bei Verwendung von docker run
docker logs -f steam-monitor

# Bei Verwendung von docker compose
docker compose logs -f steam-monitor
```

Wenn `docker ps` einen zufälligen Containernamen anzeigt (z. B. `nervous_roentgen`), wurde beim Start `--name steam-monitor` nicht angegeben; in diesem Fall zeigt `docker compose logs` diesen Container nicht an, und Sie müssen `docker logs -f <tatsächlicher Containername>` verwenden. Bei einem eigenständigen `docker run` werden Konfigurationen wie `LOG_LEVEL` und `PUBLIC_BASE_URL` nur geladen, wenn `--env-file .env` übergeben wird; andernfalls ist der Log-Level standardmäßig `info` und `PUBLIC_BASE_URL` standardmäßig `http://localhost:8787`.

Die Anwendungslogs werden zusätzlich nach UTC-Datum in `${DATA_DIR}/logs/app-YYYY-MM-DD.log` geschrieben; in Docker werden sie standardmäßig auf dem Host nach `./data/logs/` abgebildet. Die Standardausgabe des Containers bleibt erhalten und kann mit `docker logs` eingesehen werden. Die Logdateien werden nicht automatisch gelöscht; archivieren oder bereinigen Sie sie nach Bedarf.

Compose mit dem Docker-Hub-Image starten:

```bash
docker compose pull
docker compose up -d
```

Nach Codeänderungen lokal neu bauen (überschreibt das lokale Image mit dem gleichnamigen Tag von Docker Hub):

```bash
docker compose up -d --build
```

### Veröffentlichung auf Docker Hub

Docker-Hub-Adresse: <https://hub.docker.com/r/akarinliu2000/steamgames-monitor> (`akarinliu2000/steamgames-monitor`)

`.github/workflows/dockerhub.yml` veröffentlicht bei einem Push auf den Branch `main` den Snapshot `dev` und bei einem Push eines Tags einer stabilen Version eine semantische Version und aktualisiert `latest`:

- In den Repository-Secrets müssen `DOCKERHUB_USERNAME` und `DOCKERHUB_TOKEN` hinterlegt sein (Docker-Hub-Access-Token, benötigt Read-&-Write-Berechtigung).
- Aktuelle Images: `docker.io/akarinliu2000/steamgames-monitor:latest`, `:1.1.0`, `:dev` (Debian) sowie die entsprechenden `-alpine`-Varianten, alle als Multi-Architektur-Images für amd64/arm64.
- Das Docker-Hub-Repository ist öffentlich, die Images können direkt anonym gepullt werden.
- Wenn Sie einen Organisations-Namespace verwenden möchten, können Sie die Repository-Variable `DOCKERHUB_REPOSITORY` hinzufügen (z. B. `myorg/steamgames-monitor`).

```bash
docker pull akarinliu2000/steamgames-monitor:latest
```

```bash
gh secret set DOCKERHUB_USERNAME --repo AkarinLiu/SteamGames-Monitor
gh secret set DOCKERHUB_TOKEN --repo AkarinLiu/SteamGames-Monitor
```

- Die Daten werden auf dem Host in `./data` persistiert (eingebunden nach `/data` im Container); Datenbank, Sicherungen und die Logs in `logs/` werden hier geschrieben.
- Der Image-Einstiegspunkt korrigiert die Berechtigungen von `./data` und senkt anschließend die Rechte, sodass die Anwendung als Benutzer `node` im Container läuft; unter Linux können Sie auch manuell `sudo chown -R 1000:1000 data` ausführen.
- Das Einstiegsskript ordnet relative `DATA_DIR` / `DATABASE_PATH` aus `.env` automatisch `/data` zu, sodass auch ein eigenständiges `docker run --env-file .env` den Initialisierungsassistenten ordnungsgemäß erreicht.
- Im Container wird immer `/data` als Datenverzeichnis verwendet; Compose überschreibt `DATA_DIR` / `DATABASE_PATH` aus `.env`. Verwenden Sie keine relativen Pfade innerhalb des Containers.
- `PUBLIC_BASE_URL` muss mit der tatsächlich im Browser aufgerufenen Adresse übereinstimmen (z. B. `http://192.168.1.10:8787`); bei Verwendung einer Domain / eines HTTPS-Reverse-Proxys muss sie ebenfalls angepasst werden.
- `APP_SECRET` ist Pflicht; fehlt es, beendet sich der Container. Startfehler können Sie mit `docker compose logs -f steam-monitor` einsehen.
- Nach Änderungen an `.env` führen Sie `docker compose up -d` aus, damit der Container neu erstellt wird.
- Der Anwendungsprozess läuft als Nicht-root-Benutzer; ein integriertes `HEALTHCHECK` greift auf `/api/health` zu.
- Image aktualisieren: `docker compose pull && docker compose up -d`; lokaler Build mit `docker compose up -d --build`; stoppen: `docker compose down` (Daten bleiben erhalten).
- Hinweise zum Reverse-Proxy:
  - Der **Original-Request-Body** von `/webhooks/*` muss unverändert weitergeleitet werden (nicht umschreiben oder neu serialisieren).
  - `client_max_body_size 1m`, Lese-Timeout ≥ 10 s.
  - Feishu-/Lark-/DingTalk-Adressen für HTTP-Rückrufe müssen öffentlich über HTTPS erreichbar sein; Feishu / Lark, DingTalk Stream und der WeCom-KI-Bot benötigen bei ausgehenden Langzeitverbindungen keine Rückrufadresse.

## Benachrichtigungskanäle konfigurieren

Fügen Sie auf der Seite „Benachrichtigungskanäle“ einen Kanal hinzu:

- **WeCom-Gruppenbot**: Gruppeneinstellungen → Gruppen-Bot → Bot hinzufügen, Webhook kopieren.
- **Benutzerdefinierter Feishu-Bot**: Gruppeneinstellungen → Gruppen-Bot → Benutzerdefinierter Bot; wenn die Signaturprüfung aktiviert ist, tragen Sie zusätzlich den Signaturschlüssel ein.
- **Benutzerdefinierter DingTalk-Bot**: Gruppeneinstellungen → Intelligenter Gruppenassistent → Bot hinzufügen; wenn die Signierung aktiviert ist, tragen Sie zusätzlich den Signaturschlüssel ein.
- **Benutzerdefinierter WebHook**: Geben Sie eine beliebige HTTPS-Schnittstelle an; das System sendet die JSON-Ereignisse per POST, optional mit HMAC-Signaturschlüssel und Authorization-Header.
- **SMTP**: Server, Port, SSL/TLS, Absender und Empfänger eintragen (mehrere Adressen durch Kommas getrennt).

Schlüssel werden mit AES-256-GCM verschlüsselt gespeichert, wobei der Schlüssel aus `APP_SECRET` abgeleitet wird; die API gibt niemals Klartext zurück, und ein leeres Feld beim Bearbeiten bedeutet, dass der bisherige Wert beibehalten wird.

Das Anforderungsformat, die Payload-Felder und der Signaturalgorithmus für benutzerdefinierte WebHooks finden Sie in [docs/CUSTOM_WEBHOOK.de.md](docs/CUSTOM_WEBHOOK.de.md).

Wenn unter „Ereignisse abonnieren“ nichts ausgewählt ist, werden alle Ereignisse außer „Prüffehler“ empfangen.

## Anbindung von Befehls-Bots

Erstellen Sie auf der Seite „Befehls-Bots“ einen Bot:

| Plattform | Anbindung | Beschreibung |
| --- | --- | --- |
| Feishu / Lark | HTTP-Rückruf oder WebSocket-Langzeitverbindung | Die App kann per QR-Code in einem Schritt erstellt werden, alternativ manuelle Eingabe von App ID / App Secret; für die Langzeitverbindung muss auf der offenen Plattform „Ereignisse über Langzeitverbindung empfangen“ gewählt und `im.message.receive_v1` abonniert werden |
| DingTalk | HTTP-Rückruf oder Stream-Langzeitverbindung | Der Bot kann per QR-Code erstellt werden, alternativ manuelle Eingabe von Client ID / Secret; bei HTTP-Rückruf wird die Signatur mit dem App Secret geprüft, der Stream-Modus benötigt keine öffentliche Adresse |
| WeCom | WebSocket-Langzeitverbindung (keine Rückrufadresse erforderlich) | Im Admin-Backend einen KI-Bot erstellen, API-Modus → Langzeitverbindung wählen, Bot ID / Secret eintragen; der Dienst verbindet sich aktiv mit `wss://openws.work.weixin.qq.com` |

Die HTTP-Rückrufadresse für Feishu / Lark lautet `POST /webhooks/feishu/<slug>`; der Rückrufmodus unterstützt Encrypt Key / Verification Token, der Langzeitverbindungsmodus benötigt keine öffentliche Rückrufadresse. Die „Version“ in der Konfiguration dient der Umschaltung zwischen Feishu (`open.feishu.cn`) und Lark International (`open.larksuite.com`).

**Feishu / Lark per QR-Code hinzufügen (empfohlen)**: Klicken Sie auf der Seite „Befehls-Bots“ auf **Feishu / Lark QR-Code**, wählen Sie „Feishu“ oder „Lark International“ und scannen Sie den Code mit dem entsprechenden Client; folgen Sie anschließend den Hinweisen auf der Seite, um die App zu erstellen. Das System ruft App ID / App Secret automatisch ab und speichert die `open_id` des Scanners als Eigentümerkennung; der QR-Code ist 10 Minuten gültig. Beim Scannen wird eine `PersonalAgent`-App erstellt, in der die Bot-Funktionen und das Nachrichtenereignis-Abonnement bereits vorkonfiguriert sind. Nach der Erstellung können Sie in Feishu / Lark nach dem App-Namen suchen, um eine Unterhaltung zu beginnen, oder die App zu einem Gruppenchat hinzufügen.

**DingTalk per QR-Code hinzufügen (empfohlen)**: Klicken Sie auf **DingTalk per QR-Code hinzufügen** und scannen Sie den Code mit der DingTalk-App auf dem Smartphone; wählen Sie gemäß den Hinweisen auf der Seite die Organisation und geben Sie die Bot-Informationen ein. Das System ruft Client ID / Client Secret automatisch ab, verwendet die Client ID als Robot Code und aktiviert die Stream-Langzeitverbindung; der QR-Code ist 10 Minuten gültig. Nach der Erstellung können Sie in DingTalk nach dem Bot suchen, um einen Einzelchat zu beginnen, oder ihn zu einem Gruppenchat hinzufügen. Wenn ein Nutzer zum ersten Mal einen Befehl sendet, erhält er einen Link zur Web-Autorisierung; nachdem das Konto, dem der Bot gehört, sich auf der Webseite angemeldet und den Vorgang genehmigt hat, kann der Nutzer den Bot verwenden.

Die WeCom-Langzeitverbindung wird vom Server aktiv aufgebaut und benötigt keine öffentliche IP, kein Token und keinen EncodingAESKey. Für denselben Bot ist gleichzeitig nur eine gültige Verbindung zulässig; bei der Bereitstellung mehrerer Instanzen verdrängen sie sich gegenseitig. Die Rückrufkonfiguration der älteren selbst erstellten WeCom-Apps ist veraltet; tragen Sie stattdessen Bot ID / Secret des KI-Bots ein.

Sie können auch auf **WeCom per QR-Code hinzufügen** klicken und den Code mit einem WeCom-Konto scannen, das über die Berechtigung zum Erstellen verfügt; das System ruft Bot ID / Secret automatisch ab, erstellt den Bot und baut die Langzeitverbindung auf. Der QR-Code ist 5 Minuten gültig. Wenn ein Nutzer zum ersten Mal einen Befehl sendet, erhält er einen Link zur Web-Autorisierung; entweder genehmigt das Konto, dem der Bot gehört, den Vorgang nach Anmeldung auf der Webseite, oder der Nutzer wird direkt zur Allowlist hinzugefügt.

Wenn nicht autorisierte Benutzer bei Feishu / Lark, DingTalk oder WeCom einen Befehl senden, antwortet der Bot jeweils mit einem einmaligen Link zur Web-Autorisierung und führt den Befehl nicht aus. Nachdem sich das Konto, dem der Bot gehört, auf der Webseite angemeldet hat, kann es für den Plattformbenutzer die Rolle „schreibgeschützt“ oder „Administrator“ wählen und den Vorgang genehmigen; der Link ist 30 Minuten gültig. `PUBLIC_BASE_URL` muss im Browser erreichbar sein, sonst lässt sich der Link nicht öffnen.

Auf der Bearbeitungsseite des Befehls-Bots können Sie außerdem **Ereignisbenachrichtigungen empfangen** aktivieren: Danach werden Ereignisse wie Veröffentlichungen, Rabattaktionen und Delistings an die Unterhaltung gepusht, die vom zuletzt autorisierten Benutzer des Bots verwendet wurde. Zuvor muss ein autorisierter Benutzer mindestens einen Befehl im Chat gesendet haben, damit das System das Benachrichtigungsziel erfasst; ohne aktuelle Unterhaltung wird nichts gepusht. Für DingTalk-Ereignisbenachrichtigungen müssen zusätzlich App Key, App Secret und Robot Code eingetragen werden.

Befehle von Bots wirken immer auf die Daten **des Kontos, dem der Bot gehört**. Alle Plattformbenutzer (einschließlich der beim Scannen erkannten Eigentümer-ID) müssen zunächst über die Web-Autorisierung freigegeben oder in die Allowlist aufgenommen werden; andernfalls gibt der Bot nur einen einmaligen Autorisierungslink zurück und führt den Befehl nicht aus. Bei der Freigabe können Sie `viewer` (schreibgeschützt) oder `admin` wählen. Die Eigentümer-ID dient jetzt nur noch zur Kennzeichnung. Detaillierte Schritte finden Sie in [docs/BOT_INTEGRATION.de.md](docs/BOT_INTEGRATION.de.md).

Die Anbindung von WeChat ClawBot (iLink) und QQ Bot wird derzeit gemäß den offiziellen Plattformprotokollen integriert und erscheint nach Abschluss auf derselben Seite.

### Befehle

```
/help
/add <appid | Shop-Link | Name> [--discount N] [--note Text] [--force]
/adddlc <Basisspiel> [--max 50]
/remove <id | appid>
/pause <id | appid>
/resume <id | appid>
/check <id | appid | Name>
/price <id | appid | Name>
/list [--all] [--sale] [--paused] [--page N]
/events [--item id] [--limit 10]
/cancel
```

Unterstützt werden die Vollbreite-Form `／`, `/add@bot`, Argumente in Anführungszeichen und `--flag=value`.

## Region und Neu-Baselining

Die Region ist eine benutzerspezifische Einstellung. Beim Ändern der Region werden alle vorhandenen Überwachungseinträge dieses Benutzers neu gebaselined: Rabattanker werden gelöscht, der Status wird zurückgesetzt, und der erste Prüflauf zeichnet nur einen Snapshot auf, ohne Ereignisse zu erzeugen, um Fehlalarme durch regionale Preisunterschiede zu vermeiden. Andere Benutzer sind nicht betroffen.

## Passwort zurücksetzen

Führen Sie auf dem Serverterminal aus (keine Web-Anmeldung erforderlich):

```bash
pnpm reset-password <Benutzername>
pnpm reset-password <Benutzername> --password 'new-password-123'
pnpm reset-password <Benutzername> --enable
```

Docker-Bereitstellung:

```bash
docker compose exec steam-monitor node dist-server/reset-password.js <Benutzername>
```

- Ohne `--password` wird ein zufälliges temporäres Passwort erzeugt und im Terminal ausgegeben.
- Nach dem Zurücksetzen gilt `must_change_password=1`; der Benutzer muss bei der nächsten Anmeldung das Passwort ändern, und alle bestehenden Sitzungen dieses Benutzers werden ungültig.
- Deaktivierte Konten bleiben standardmäßig deaktiviert; mit `--enable` werden sie zusätzlich aktiviert.
- Der Befehl arbeitet direkt auf SQLite und ist nicht von `APP_SECRET` abhängig; die Datenbank wird über `DATA_DIR` / `DATABASE_PATH` gefunden.

## Sicherung und Wiederherstellung

```bash
pnpm backup
```

Das Skript erzeugt mit `VACUUM INTO` in `${DATA_DIR}/backups/` die Datei `steam-monitor-YYYYMMDD-HHmm.db` und behält standardmäßig die letzten 14 Sicherungen. In Docker können Sie ausführen:

```bash
docker compose exec steam-monitor node_modules/.bin/tsx scripts/backup.ts
```

Wiederherstellung: Container stoppen → `steam-monitor.db` durch die Sicherungsdatei ersetzen → die Dateien `-wal` / `-shm` im selben Verzeichnis löschen → Container starten. **Sichern Sie gleichzeitig das `APP_SECRET` aus `.env`**, andernfalls lassen sich die verschlüsselten Kanal- und Bot-Schlüssel nicht wiederherstellen und müssen neu eingetragen werden.

## Tests

```bash
pnpm type-check
pnpm lint
pnpm test:unit
pnpm test:e2e   # erfordert zuvor installierte Playwright-Browser: pnpm exec playwright install chromium
```

Die End-to-End-Tests:

1. legen in `data/e2e` eine neue Datenbank an und starten das Backend (4180), Vite (4181) und den Mock-Dienst (9998);
2. treiben mit Mock-Schnittstellen von Steam den gesamten Ablauf von Veröffentlichung, Rabattaktion, Delisting und Wiederherstellung;
3. prüfen WeCom-Benachrichtigungen, benutzerdefinierte WebHooks, SMTP-E-Mails, Feishu-/Lark-/DingTalk-Rückrufe und die QR-Code-Konfiguration, Feishu-/DingTalk-/WeCom-Langzeitverbindungen sowie die Mehrbenutzertrennung.

`scripts/mock-receiver.ts` kann auch separat ausgeführt werden, etwa für lokale Integrationstests:

```bash
pnpm mock:receiver
# Benachrichtigungs-Webhook: http://127.0.0.1:9999/<beliebiger Pfad>
# SMTP-Sink: 127.0.0.1:1025
# Erfasste Anfragen: GET http://127.0.0.1:9999/_requests
# Steam-Simulation: http://127.0.0.1:9999/steam-store und /steam-api
```

Zusammen mit `ALLOW_INSECURE_WEBHOOKS=1` und `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL` sind vollständig offline durchgeführte Integrationstests möglich.

## Bekannte Einschränkungen

- Die Steam-Shop-Schnittstelle ist nicht offiziell und kann sich ändern oder rate-limitiert werden; „delisted / in der Region nicht verkäuflich / ungültige appid“ lässt sich nicht unterscheiden. Das System verwendet „früher verkäuflich + zweimal in Folge nicht verfügbar“, um Fehlalarme zu reduzieren.
- Die Vorwarnung anhand von News-Schlüsselwörtern deckt nur Steam-News / -Ankündigungen ab, ist ein heuristischer Hinweis und erfordert eine manuelle Bestätigung.
- Der genaue Endzeitpunkt einer Rabattaktion ist nicht ermittelbar; `sale_end` hängt davon ab, dass die nächste Abfrage einen Rabatt von null erkennt.
- Der WeCom-Gruppenbot kann nur senden; für Befehle in Gruppen verwenden Sie bitte die Langzeitverbindung des WeCom-KI-Bots. Für dieselbe Langzeitverbindung ist nur eine gültige Verbindung zulässig; bei der Bereitstellung mehrerer Instanzen verdrängen sie sich gegenseitig.
- WeChat ClawBot (iLink) und QQ Bot werden derzeit gemäß den offiziellen Plattformprotokollen angebunden.
- Bereitstellung als Einzelinstanz, SQLite mit einem einzigen Schreiber; keine Hochverfügbarkeit.
- Unterschiedliche Benutzerregionen führen dazu, dass dasselbe Spiel je Region separat zwischengespeichert und abgerufen wird.

## Verzeichnisstruktur

```
server/            Hono-Anwendung, SQLite, Steam-Erfassung, Planung, Benachrichtigungen, Plattform-Rückrufe / Langzeitverbindungen, Befehle
shared/            Gemeinsame Typen, Konstanten und Zod-Schemas für Frontend und Backend
src/               Vue-Frontend
scripts/           Mock-Dienste, Sicherung, E2E-Startskripte
e2e/               Playwright-End-to-End-Tests
Dockerfile         Mehrstufiger Build (Frontend und Server bauen → zur Laufzeit nur Produktionsabhängigkeiten)
docker-compose.yml Bereitstellung als einzelner Dienst, Bind-Mount des Host-Verzeichnisses ./data
data/              Datenverzeichnis auf dem Host (SQLite, Sicherungen, logs/ Anwendungslogs)
```
