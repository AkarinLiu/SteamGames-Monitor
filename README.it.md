# SteamGames-Monitor

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Italiano](README.it.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [조선어](README.ko-KP.md) | [Nederlands](README.nl.md) | [Русский](README.ru.md)

L’interfaccia è disponibile in cinese semplificato, cinese tradizionale, inglese, tedesco, francese, italiano, giapponese, coreano, nordcoreano, olandese e russo. Puoi cambiarla dal selettore in alto a destra; questa impostazione è indipendente dalla lingua dei contenuti Steam.

Sistema self-hosted multiutente per il monitoraggio dello stato di vendita di giochi e DLC su Steam. Utilizza SQLite per l'archiviazione dei dati, monitora **ritiro dal listino / delisting, sconti e uscite**, e invia notifiche tramite bot di gruppo WeCom, bot Feishu, bot DingTalk o e-mail SMTP.
Un unico processo espone contemporaneamente l'interfaccia Web, l'API REST, lo scheduler di polling di Steam, la coda di consegna delle notifiche, i callback Feishu / Lark / DingTalk, nonché le connessioni long-lived di Feishu, DingTalk Stream e WeCom: una soluzione adatta al deployment con Docker Compose su singola macchina.

## Funzionalità

- **Account multiutente indipendenti**: l'amministratore crea gli account; ogni utente dispone di elementi monitorati, eventi, canali di notifica e bot di comando propri, con isolamento rigoroso dei dati.
- **Elementi monitorati**: supporta appid, link allo store e ricerca per nome; supporta l'importazione in blocco di tutti i DLC di un gioco base.
- **Cambi di stato**: uscita (inversione dello stato "coming soon"), inizio / variazione / fine della promozione, variazione del prezzo originale, non disponibilità (delisting) e ripristino.
- **Determinazione del delisting**: il delisting viene confermato solo dopo due inversioni consecutive dello stato di acquistabilità nello store; in combinazione con le parole chiave delle notizie Steam viene fornito un avviso anticipato (euristico, solo a titolo di riferimento).
- **Canali di notifica**: bot di gruppo WeCom, bot personalizzato Feishu, bot personalizzato DingTalk, WebHook personalizzato, e-mail SMTP; nuovo tentativo automatico in caso di errore.
- **Bot di comando**: bot applicativo Feishu / Lark (creazione con un clic tramite scansione del codice QR, callback HTTP o connessione long-lived WebSocket), bot DingTalk (creazione con un clic tramite scansione del codice QR, callback HTTP o connessione long-lived Stream), connessione long-lived del bot intelligente WeCom, con supporto alla creazione tramite scansione del codice QR, all'autorizzazione tramite pagina Web per utenti non autorizzati e alle notifiche degli eventi; supporta `/add`, `/list`, `/price`, `/check`, `/pause`, `/resume`, `/remove`, `/adddlc`, `/events`, `/cancel`; WeChat ClawBot e QQ Bot sono in fase di integrazione secondo i protocolli ufficiali delle rispettive piattaforme.
- **Orientato alle operazioni**: health check, immagini Docker, backup online del database, criteri di conservazione dei dati configurabili.

## Stack tecnologico

- Node.js 24 + TypeScript (ESM), Hono, `node:sqlite` (WAL), Zod, Nodemailer
- Vue 3 + Vite + Pinia + Vue Router (gli artefatti di build sono serviti direttamente dal processo Node)
- Test: Vitest (unit), Playwright (end-to-end)

## Avvio rapido (sviluppo locale)

Richiede Node.js `^22.18 || >=24.12` e pnpm.

```bash
pnpm install
cp .env.example .env
# Modificare .env: inserire almeno APP_SECRET (>=32 caratteri)
openssl rand -base64 48
pnpm dev
```

- Interfaccia Web: http://localhost:5173
- API backend: http://localhost:8787

Al primo avvio apra direttamente l'interfaccia Web per creare il primo account amministratore e selezioni regione, lingua e fuso orario. **La regione non ha un valore predefinito**: un account che non ha completato l'inizializzazione non può aggiungere elementi monitorati. L'endpoint di inizializzazione diventa automaticamente non valido dopo la creazione del primo amministratore; poiché non è più richiesto un token di inizializzazione, non esponga l'istanza su Internet prima di aver completato l'inizializzazione e completi subito la procedura dopo il deployment.

### Build di produzione

```bash
pnpm build   # controllo dei tipi + build del frontend dist/ + server dist-server/index.js
pnpm start   # richiede una build preventiva; Node serve sia l'API sia il frontend statico
```

## Variabili d'ambiente

| Variabile | Descrizione |
| --- | --- |
| `NODE_ENV` | Se impostata a `production`, impone la validazione di `APP_SECRET` |
| `HOST` / `PORT` | Indirizzo e porta di ascolto, predefiniti `0.0.0.0:8787` |
| `DATA_DIR` | Directory dei dati, predefinita `./data` (in Docker `/data`) |
| `DATABASE_PATH` | Percorso del file SQLite, predefinito `${DATA_DIR}/steam-monitor.db` |
| `APP_SECRET` | Obbligatoria, ≥32 caratteri. Serve a derivare la chiave che cifra le credenziali dei canali / bot; **se viene persa, le chiavi già salvate non possono più essere decifrate** |
| `PUBLIC_BASE_URL` | Indirizzo di accesso pubblico, utilizzato per generare gli URL di callback Feishu / Lark / DingTalk, i link di autorizzazione Web WeCom e la validazione CSRF; le connessioni long-lived non richiedono un callback pubblico |
| `TRUSTED_ORIGINS` | Origin aggiuntivi consentiti, separati da virgola (in sviluppo include `http://localhost:5173`) |
| `COOKIE_SECURE` | Impostare a `1` per i deployment su HTTPS |
| `TRUST_PROXY` | Numero di livelli di reverse proxy |
| `MAX_TOTAL_MONITORS` | Limite globale di elementi monitorati, predefinito 2000 |
| `ALLOW_INSECURE_WEBHOOKS` | Impostare a `1` solo in fase di test; consente Webhook http / su rete interna |
| `ENABLE_DEV_COMMANDS` / `DEV_COMMAND_TOKEN` | Comando di sviluppo `/api/dev/command` per simulare le istruzioni |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error`; i log su file vengono scritti in `${DATA_DIR}/logs/app-YYYY-MM-DD.log` |
| `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL` | Opzionali, sostituiscono gli endpoint Steam (per test / proxy) |

In ambienti con proxy è possibile usare `HTTPS_PROXY`, `NODE_USE_ENV_PROXY=1` e `NO_PROXY`. Se la catena di certificati di sistema non viene riconosciuta da Node, all'avvio il servizio integra le CA di sistema (`lib/tls.ts`).

## Deployment con Docker Compose

GitHub Actions pubblica un'immagine snapshot (`dev`) a ogni push sul branch `main` e, in occasione del push di un tag di versione stabile (ad esempio `v1.1.1`), pubblica una versione semantica e punta `latest` a quella versione stabile:

```bash
# Ultima versione stabile
docker pull akarinliu2000/steamgames-monitor:latest
# Versione stabile 1.1.1 corrente
docker pull akarinliu2000/steamgames-monitor:1.1.1
# Ultimo snapshot del branch main
docker pull akarinliu2000/steamgames-monitor:dev
```

L'immagine supporta `linux/amd64` e `linux/arm64`; Docker seleziona automaticamente l'architettura dell'host. Sono disponibili due immagini di base:

| Tag | Immagine di base | Descrizione |
| --- | --- | --- |
| `latest` / `1.1.1` / `1.1` | Debian slim (`node:24-bookworm-slim`) | Ultima versione stabile |
| `latest-alpine` / `1.1.1-alpine` / `1.1-alpine` | Alpine (`node:24-alpine`) | Ultima versione stabile Alpine |
| `dev` | Debian slim | Ultimo snapshot del branch `main` |
| `dev-alpine` | Alpine | Ultimo snapshot Alpine del branch `main` |

`latest` viene spostato solo su tag non pre-release (come `v1.1.1`); i tag con `-rc` / `-beta` non sovrascrivono `latest`. I commit ordinari sul branch `main` aggiornano solo i tag `dev` / `dev-alpine` e `sha-*`.

```bash
docker pull akarinliu2000/steamgames-monitor:latest-alpine
# Build locale della versione Alpine
docker build --build-arg BASE_IMAGE=node:24-alpine -t steam-monitor:alpine .
```

Esecuzione diretta con l'immagine:

```bash
cp .env.example .env
# Compilare APP_SECRET, PUBLIC_BASE_URL (indirizzo HTTPS pubblico), COOKIE_SECURE=1, TRUST_PROXY=1
docker run -d --name steam-monitor \
  --env-file .env \
  -p 8787:8787 \
  -v "$(pwd)/data:/data" \
  --restart unless-stopped \
  akarinliu2000/steamgames-monitor:latest
```

Visualizzazione dei log del container:

```bash
# Metodo docker run
docker logs -f steam-monitor

# Metodo docker compose
docker compose logs -f steam-monitor
```

Se `docker ps` mostra un nome di container casuale (ad esempio `nervous_roentgen`), significa che all'avvio non è stato specificato `--name steam-monitor`; in tal caso `docker compose logs` non mostrerà quel container e sarà necessario usare `docker logs -f <nome effettivo del container>`. Con il solo `docker run`, configurazioni come `LOG_LEVEL` e `PUBLIC_BASE_URL` vengono caricate solo se si passa `--env-file .env`; in caso contrario il livello di log predefinito è `info` e `PUBLIC_BASE_URL` predefinito è `http://localhost:8787`.

I log dell'applicazione vengono inoltre scritti per data UTC in `${DATA_DIR}/logs/app-YYYY-MM-DD.log`; con Docker sono mappati per impostazione predefinita su `./data/logs/` dell'host. Lo stdout del container resta comunque disponibile e consultabile con `docker logs`. I file di log non vengono eliminati automaticamente: li archivi o li rimuova secondo necessità.

Avvio di Compose con l'immagine di Docker Hub:

```bash
docker compose pull
docker compose up -d
```

Ricostruzione locale dopo aver modificato il codice (sovrascrive l'immagine locale con il tag omonimo di Docker Hub):

```bash
docker compose up -d --build
```

### Pubblicazione su Docker Hub

Indirizzo Docker Hub: <https://hub.docker.com/r/akarinliu2000/steamgames-monitor> (`akarinliu2000/steamgames-monitor`)

`.github/workflows/dockerhub.yml` pubblica lo snapshot `dev` a ogni push sul branch `main` e, al push di un tag di versione stabile, pubblica la versione semantica e aggiorna `latest`:

- Nei Secrets del repository devono essere configurati `DOCKERHUB_USERNAME` e `DOCKERHUB_TOKEN` (Access Token di Docker Hub, con permessi Read & Write).
- Immagini attuali: `docker.io/akarinliu2000/steamgames-monitor:latest`, `:1.1.1`, `:dev` (Debian) e le corrispondenti versioni `-alpine`, tutte multi-architettura amd64/arm64.
- Il repository Docker Hub è pubblico ed è possibile eseguire il pull in modo anonimo.
- Se desidera usare un namespace di organizzazione, può aggiungere la variabile di repository `DOCKERHUB_REPOSITORY` (ad esempio `myorg/steamgames-monitor`).

```bash
docker pull akarinliu2000/steamgames-monitor:latest
```

```bash
gh secret set DOCKERHUB_USERNAME --repo AkarinLiu/SteamGames-Monitor
gh secret set DOCKERHUB_TOKEN --repo AkarinLiu/SteamGames-Monitor
```

- I dati sono persistiti in `./data` sull'host (montata in `/data` nel container); database, backup e log in `logs/` vengono scritti qui.
- L'entrypoint dell'immagine corregge i permessi di `./data` e poi riduce i privilegi eseguendo l'applicazione con l'utente `node` del container; su Linux è anche possibile eseguire manualmente `sudo chown -R 1000:1000 data`.
- Lo script di entrypoint mappa automaticamente i valori relativi di `DATA_DIR` / `DATABASE_PATH` presenti in `.env` su `/data`, così anche `docker run --env-file .env` accede correttamente alla procedura guidata di inizializzazione.
- Nel container viene sempre usata `/data` come directory dei dati; Compose sovrascrive `DATA_DIR` / `DATABASE_PATH` definiti in `.env`, quindi non li imposti su percorsi relativi interni al container.
- `PUBLIC_BASE_URL` deve corrispondere all'indirizzo effettivamente usato nel browser (ad esempio `http://192.168.1.10:8787`); anche in caso di dominio / reverse proxy HTTPS occorre modificarlo di conseguenza.
- `APP_SECRET` è obbligatoria: se manca, il container termina; per vedere gli errori di avvio esegua `docker compose logs -f steam-monitor`.
- Dopo aver modificato `.env` esegua `docker compose up -d` per ricreare il container e applicare le modifiche.
- Il processo dell'applicazione viene eseguito con un utente non root e integra un `HEALTHCHECK` che contatta `/api/health`.
- Aggiornamento dell'immagine: `docker compose pull && docker compose up -d`; build locale con `docker compose up -d --build`; arresto: `docker compose down` (i dati vengono conservati).
- Note per il reverse proxy:
  - È necessario inoltrare `/webhooks/*` con il **corpo della richiesta originale** intatto (senza riscritture o riserializzazioni).
  - `client_max_body_size 1m`, timeout di lettura ≥10s.
  - Gli indirizzi Feishu / Lark / DingTalk che utilizzano callback HTTP devono essere raggiungibili pubblicamente via HTTPS; Feishu / Lark, DingTalk Stream e il bot intelligente WeCom, che usano connessioni in uscita long-lived, non richiedono un URL di callback.

## Configurazione dei canali di notifica

Nella pagina "Canali di notifica" aggiunga un canale:

- **Bot di gruppo WeCom**: impostazioni del gruppo → bot di gruppo → aggiungi bot, quindi copi il Webhook.
- **Bot personalizzato Feishu**: impostazioni del gruppo → bot di gruppo → bot personalizzato; se abilita la verifica della firma, inserisca anche la chiave di firma.
- **Bot personalizzato DingTalk**: impostazioni del gruppo → assistente intelligente di gruppo → aggiungi bot; se abilita la firma aggiuntiva, inserisca anche la chiave di firma.
- **WebHook personalizzato**: inserisca un endpoint HTTPS qualsiasi; il sistema invia gli eventi in POST come JSON, con chiave di firma HMAC e header Authorization opzionali.
- **SMTP**: inserisca server, porta, SSL/TLS, mittente e destinatari (più indirizzi separati da virgola).

Le chiavi vengono archiviate cifrate con AES-256-GCM tramite una chiave derivata da `APP_SECRET`; l'API non restituisce mai il testo in chiaro e, in fase di modifica, lasciare vuoto il campo significa mantenere il valore esistente.

Il formato delle richieste, i campi del payload e l'algoritmo di firma del WebHook personalizzato sono descritti in [docs/CUSTOM_WEBHOOK.it.md](docs/CUSTOM_WEBHOOK.it.md).

Se "Eventi sottoscritti" non viene selezionato, vengono ricevuti tutti gli eventi tranne "errore di verifica".

## Integrazione dei bot di comando

Nella pagina "Bot di comando" crei un bot:

| Piattaforma | Modalità di integrazione | Descrizione |
| --- | --- | --- |
| Feishu / Lark | Callback HTTP o connessione long-lived WebSocket | È possibile creare l'applicazione con un clic tramite scansione del codice QR oppure inserire manualmente App ID / App Secret; per la connessione long-lived occorre selezionare «Ricevi eventi tramite connessione long-lived» nella piattaforma aperta e sottoscrivere `im.message.receive_v1` |
| DingTalk | Callback HTTP o connessione long-lived Stream | È possibile creare il bot con un clic tramite scansione del codice QR oppure inserire manualmente Client ID / Secret; con il callback HTTP si inserisce App Secret per validare la firma, mentre la modalità Stream non richiede un indirizzo pubblico |
| WeCom | Connessione long-lived WebSocket (nessun URL di callback necessario) | Crei un bot intelligente nella console di amministrazione, selezioni modalità API → connessione long-lived e inserisca Bot ID / Secret; il servizio si connette attivamente a `wss://openws.work.weixin.qq.com` |

L'URL di callback HTTP di Feishu / Lark è `POST /webhooks/feishu/<slug>`; la modalità con callback supporta Encrypt Key / Verification Token, mentre la modalità long-lived non richiede un URL di callback pubblico. Il campo «Versione» della configurazione serve a passare da Feishu (`open.feishu.cn`) a Lark internazionale (`open.larksuite.com`).

**Aggiunta Feishu / Lark tramite scansione del codice QR (consigliata)**: nella pagina «Bot di comando» faccia clic su **Scansione QR Feishu / Lark**, selezioni «Feishu» o «Lark internazionale» e scansioni il codice con il client corrispondente, seguendo le indicazioni della pagina per creare l'applicazione. Il sistema recupera automaticamente App ID / App Secret e registra l'`open_id` di chi effettua la scansione come identificativo del proprietario; il codice QR è valido per 10 minuti. L'applicazione creata tramite scansione è del tipo `PersonalAgent` e include già le funzionalità del bot e la sottoscrizione degli eventi dei messaggi; dopo la creazione è possibile cercare il nome dell'applicazione in Feishu / Lark per avviare una conversazione oppure aggiungerla a un gruppo.

**Aggiunta DingTalk tramite scansione del codice QR (consigliata)**: faccia clic su **Aggiungi DingTalk tramite QR**, scansiona il codice con DingTalk sul telefono e segua le indicazioni della pagina per selezionare l'organizzazione e inserire le informazioni del bot. Il sistema recupera automaticamente Client ID / Client Secret, usa il Client ID come Robot Code e abilita la connessione long-lived Stream; il codice QR è valido per 10 minuti. Dopo la creazione è possibile cercare il bot in DingTalk per avviare una chat privata oppure aggiungerlo a un gruppo. Al primo invio di un'istruzione da parte di un membro, questi riceverà un link di autorizzazione Web: dopo che l'account proprietario del bot avrà effettuato l'accesso alla pagina e approvato la richiesta, sarà possibile utilizzarlo.

La connessione long-lived WeCom viene stabilita attivamente dal server e non richiede IP pubblico, Token o EncodingAESKey. Per lo stesso bot è consentita una sola connessione valida alla volta; in caso di deployment multi-istanza le istanze si disconnettono a vicenda. La vecchia configurazione con callback dell'applicazione self-built di WeCom è deprecata: inserisca invece Bot ID / Secret del bot intelligente.

Può anche fare clic su **Aggiungi WeCom tramite QR** e scansionare il codice con un account WeCom che disponga del permesso di creazione; il sistema recupera automaticamente Bot ID / Secret, crea il bot e stabilisce la connessione long-lived. Il codice QR è valido per 5 minuti. Al primo invio di un'istruzione da parte di un membro, questi riceverà un link di autorizzazione Web: l'account proprietario del bot dovrà effettuare l'accesso alla pagina e approvare, oppure sarà sufficiente aggiungerlo direttamente alla lista consentita.

Quando utenti non autorizzati inviano istruzioni a Feishu / Lark, DingTalk o WeCom, il bot risponde con un link di autorizzazione Web monouso e non esegue l'istruzione. Dopo che l'account proprietario del bot avrà effettuato l'accesso alla pagina Web, potrà scegliere per l'utente della piattaforma il ruolo di sola lettura o amministratore e approvare; il link è valido per 30 minuti. `PUBLIC_BASE_URL` deve essere raggiungibile dal browser, altrimenti il link non si aprirà.

Nel bot di comando è inoltre possibile abilitare **Ricezione notifiche eventi** nella pagina di modifica: una volta attivata, eventi come uscite, promozioni e delisting vengono inviati alla conversazione usata più di recente da un utente autorizzato. È necessario che un utente autorizzato abbia inviato almeno un'istruzione in chat perché il sistema registri la destinazione delle notifiche; in assenza di una conversazione recente non viene inviato nulla. Per le notifiche eventi di DingTalk occorre inoltre inserire App Key, App Secret e Robot Code.

Le istruzioni del bot agiscono sempre sui dati dell'**account a cui appartiene il bot**. Tutti gli utenti della piattaforma (compreso l'ID del proprietario riconosciuto al momento della scansione) devono prima ottenere l'autorizzazione tramite la pagina Web o essere aggiunti alla lista consentita; in caso contrario il bot restituisce solo un link di autorizzazione monouso e non esegue l'istruzione. In fase di approvazione è possibile scegliere `viewer` (sola lettura) o `admin`. L'ID del proprietario ora serve solo come identificativo. I passaggi dettagliati sono in [docs/BOT_INTEGRATION.it.md](docs/BOT_INTEGRATION.it.md).

L'integrazione di WeChat ClawBot (iLink) e QQ Bot è in corso secondo i protocolli ufficiali delle rispettive piattaforme e, una volta completata, comparirà nella stessa pagina.

### Istruzioni

```
/help
/add <appid | link allo store | nome> [--discount N] [--note testo] [--force]
/adddlc <gioco base> [--max 50]
/remove <id | appid>
/pause <id | appid>
/resume <id | appid>
/check <id | appid | nome>
/price <id | appid | nome>
/list [--all] [--sale] [--paused] [--page N]
/events [--item id] [--limit 10]
/cancel
```

Sono supportati il carattere a larghezza piena `／`, la forma `/add@bot`, gli argomenti tra virgolette e `--flag=value`.

## Regioni e rebaseline

La regione è un'impostazione a livello di utente. Quando si modifica la regione, tutti gli elementi monitorati dell'utente vengono riportati a un nuovo baseline: gli ancoraggi delle promozioni vengono azzerati, gli stati vengono reimpostati e il primo ciclo di verifica registra solo uno snapshot senza generare eventi, evitando falsi allarmi dovuti alle differenze di prezzo tra regioni. Gli altri utenti non sono interessati.

## Reimpostazione della password

Eseguire nel terminale del server (senza effettuare l'accesso al Web):

```bash
pnpm reset-password <nome-utente>
pnpm reset-password <nome-utente> --password 'new-password-123'
pnpm reset-password <nome-utente> --enable
```

Deployment Docker:

```bash
docker compose exec steam-monitor node dist-server/reset-password.js <nome-utente>
```

- Se `--password` non viene specificato, viene generata una password temporanea casuale e stampata nel terminale.
- Dopo la reimpostazione viene impostato `must_change_password=1`: l'utente dovrà cambiare la password al successivo accesso e tutte le sessioni esistenti di quell'utente vengono invalidate.
- Gli account disabilitati restano disabilitati per impostazione predefinita; con `--enable` vengono riabilitati contestualmente.
- Il comando opera direttamente su SQLite e non dipende da `APP_SECRET`; individua il database tramite `DATA_DIR` / `DATABASE_PATH`.

## Backup e ripristino

```bash
pnpm backup
```

Lo script utilizza `VACUUM INTO` per generare `steam-monitor-YYYYMMDD-HHmm.db` in `${DATA_DIR}/backups/`, conservando per impostazione predefinita le 14 copie più recenti. In Docker è possibile eseguire:

```bash
docker compose exec steam-monitor node_modules/.bin/tsx scripts/backup.ts
```

Procedura di ripristino: arrestare il container → sostituire `steam-monitor.db` con il file di backup → eliminare i file `-wal` / `-shm` presenti nella stessa directory → avviare il container. **Si ricordi di eseguire il backup anche di `APP_SECRET` presente in `.env`**, altrimenti le chiavi cifrate dei canali e dei bot non potranno essere ripristinate e dovranno essere reinserite.

## Test

```bash
pnpm type-check
pnpm lint
pnpm test:unit
pnpm test:e2e   # richiede l'installazione preventiva dei browser Playwright: pnpm exec playwright install chromium
```

I test end-to-end:

1. creano un database nuovo in `data/e2e` e avviano il backend (4180), Vite (4181) e il servizio mock (9998);
2. utilizzano le API Steam mock per simulare l'intero flusso di uscita, promozione, delisting e ripristino;
3. verificano le notifiche WeCom, il WebHook personalizzato, le e-mail SMTP, i callback e la configurazione tramite scansione QR di Feishu / Lark / DingTalk, le connessioni long-lived Feishu / DingTalk / WeCom e l'isolamento multiutente.

`scripts/mock-receiver.ts` può anche essere eseguito separatamente per test di integrazione locali:

```bash
pnpm mock:receiver
# Webhook di notifica: http://127.0.0.1:9999/<percorso qualsiasi>
# Sink SMTP: 127.0.0.1:1025
# Risultati catturati: GET http://127.0.0.1:9999/_requests
# Steam simulato: http://127.0.0.1:9999/steam-store e /steam-api
```

In combinazione con `ALLOW_INSECURE_WEBHOOKS=1` e `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL` è possibile eseguire test di integrazione completamente offline.

## Limitazioni note

- L'API dello store Steam non è ufficiale e può cambiare o applicare limiti di frequenza; non è possibile distinguere tra "rimosso dal listino / non vendibile nella regione / appid non valido", pertanto il sistema utilizza la regola "precedentemente acquistabile + due indisponibilità consecutive" per ridurre i falsi allarmi.
- L'avviso basato sulle parole chiave delle notizie copre solo notizie / annunci Steam ed è un avviso euristico che richiede conferma manuale.
- Non è possibile conoscere l'orario esatto di fine di una promozione: `sale_end` dipende dal polling successivo che rileva l'azzeramento dello sconto.
- Il bot di gruppo WeCom può solo inviare messaggi; per le istruzioni nel gruppo utilizzi la connessione long-lived del bot intelligente WeCom. Una connessione long-lived supporta una sola connessione valida per lo stesso bot e, in caso di deployment multi-istanza, le istanze si disconnettono a vicenda.
- WeChat ClawBot (iLink) e QQ Bot sono in fase di integrazione secondo i protocolli ufficiali delle rispettive piattaforme.
- Deployment a istanza singola, SQLite con scrittore singolo; non è prevista alta disponibilità.
- Regioni utente diverse comportano la memorizzazione in cache e il recupero separato dello stesso gioco per ciascuna regione.

## Struttura delle directory

```
server/            applicazione Hono, SQLite, raccolta dati Steam, scheduler, notifiche, callback / connessioni long-lived delle piattaforme, istruzioni
shared/            tipi condivisi tra frontend e backend, costanti e schema Zod
src/               frontend Vue
scripts/           servizio mock, backup, script di avvio E2E
e2e/               test end-to-end Playwright
Dockerfile         build multi-stage (build di frontend e server → runtime con sole dipendenze di produzione)
docker-compose.yml deployment a servizio singolo, bind mount della directory host ./data
data/              directory dei dati sull'host (SQLite, backup, log applicativi in logs/)
```
