# Guida all'integrazione di Feishu / Lark, DingTalk e WeCom

[简体中文](BOT_INTEGRATION.md) | [繁體中文](BOT_INTEGRATION.zh-TW.md) | [English](BOT_INTEGRATION.en.md) | [Deutsch](BOT_INTEGRATION.de.md) | [Français](BOT_INTEGRATION.fr.md) | [Italiano](BOT_INTEGRATION.it.md) | [日本語](BOT_INTEGRATION.ja.md) | [한국어](BOT_INTEGRATION.ko.md) | [조선어](BOT_INTEGRATION.ko-KP.md) | [Nederlands](BOT_INTEGRATION.nl.md) | [Русский](BOT_INTEGRATION.ru.md)

[Torna al README](../README.it.md)

Questo documento descrive come integrare Feishu / Lark, DingTalk e WeCom in Steam Games Monitor. Il progetto offre due funzionalità distinte e non intercambiabili: chiarisca prima l'obiettivo.

| Obiettivo | Cosa creare sulla piattaforma | Voce di sistema | Direzione |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | -------------- | ------------------------ |
| Ricevere notifiche di eventi quali uscita, promozione e delisting | Webhook del bot di gruppo / bot personalizzato di gruppo | **Canali di notifica** | Unidirezionale: sistema → gruppo |
| Inviare in chat istruzioni come `/add`, `/list` | Applicazione aziendale self-built Feishu / Lark / bot aziendale interno DingTalk (Outgoing) / bot intelligente WeCom (connessione long-lived) | **Bot di comando** | Bidirezionale: piattaforma → sistema → piattaforma |

> I Webhook dei bot di gruppo di norma possono solo inviare messaggi e non ricevere istruzioni. Feishu / Lark e DingTalk consentono di creare un'applicazione con un clic tramite scansione del codice QR e di scegliere tra callback HTTP e connessione long-lived; WeCom richiede la creazione di un bot intelligente e l'uso della connessione long-lived.
>
> I canali di notifica e i bot di comando sono due configurazioni indipendenti: per la stessa piattaforma è possibile configurare solo le notifiche, solo le istruzioni, oppure entrambe.

---

## 1. Preparativi comuni

### 1.1 HTTPS pubblico e PUBLIC_BASE_URL (modalità callback HTTP)

Feishu / Lark / DingTalk in modalità **callback HTTP** richiedono che la piattaforma invii attivamente i messaggi al Suo server; è quindi necessario che:

- il servizio sia raggiungibile da Internet e utilizzi un indirizzo **HTTPS** riconosciuto dalla piattaforma;
- `PUBLIC_BASE_URL` in `.env` corrisponda all'indirizzo effettivamente usato nel browser, ad esempio `https://steam.example.com`;
- non utilizzi il valore predefinito `http://localhost:8787`, altrimenti la piattaforma non potrà raggiungere l'URL di callback generato dal sistema;
- preferibilmente utilizzi un dominio o sottodominio dedicato. Il percorso di callback è fisso `/webhooks/...`: non esegua il deployment in un sottopercorso che richieda riscritture aggiuntive.

Gli URL di callback mostrati dal sistema vengono generati secondo le regole seguenti:

```text
Feishu / Lark  https://<dominio di PUBLIC_BASE_URL>/webhooks/feishu/<slug>
DingTalk       https://<dominio di PUBLIC_BASE_URL>/webhooks/dingtalk/<slug>
```

`<slug>` viene generato casualmente al momento della creazione del bot ed è diverso per ogni bot. Dopo la modifica di `PUBLIC_BASE_URL` l'URL di callback cambia e deve essere aggiornato anche nella console della piattaforma.

> La **modalità long-lived** di Feishu / Lark, la **modalità Stream** di DingTalk e il bot intelligente WeCom stabiliscono tutti connessioni in uscita attivate dal server e non richiedono URL di callback pubblici, IP pubblici, Token o EncodingAESKey. Le applicazioni Feishu / Lark e i bot DingTalk creati tramite scansione del codice QR utilizzano la connessione long-lived per impostazione predefinita.
>
> `PUBLIC_BASE_URL` deve comunque essere raggiungibile nel browser dal proprietario del bot: i link di autorizzazione Web inviati agli utenti non autorizzati utilizzano questo indirizzo.

### 1.2 Requisiti del reverse proxy

Nginx, Caddy, Traefik o un load balancer cloud devono soddisfare i seguenti requisiti (riguardano solo i callback HTTP di Feishu / Lark / DingTalk):

- **inoltrare il corpo della richiesta senza modifiche**: non riserializzare il JSON, non comprimere o modificare il contenuto; le firme di Feishu / Lark e DingTalk si basano sul corpo originale della richiesta.
- Conservare gli header inviati dalla piattaforma: `X-Lark-Request-Timestamp`, `X-Lark-Request-Nonce`, `X-Lark-Signature` per Feishu, `timestamp`, `sign` per DingTalk.
- Conservare i parametri di query senza perdere i parametri di firma.
- Non aggiungere a `/webhooks/*` autenticazione, Basic Auth, redirect HTML o verifiche interattive del WAF.
- Limite del corpo della richiesta di almeno 1 MB; timeout di lettura non inferiore a 10 secondi.
- Utilizzare certificati TLS attendibili: la piattaforma verifica la catena di certificati.

Le connessioni long-lived Feishu / Lark, DingTalk Stream e WeCom non passano attraverso il reverse proxy: è sufficiente che il server possa accedere in uscita alla piattaforma corrispondente (Lark utilizza `open.larksuite.com`, DingTalk Stream utilizza `api.dingtalk.com`).

### 1.3 Sincronizzazione dell'ora e chiavi

- Il server deve avere la sincronizzazione NTP attiva. La firma di Feishu / Lark tollera uno scostamento di ±300 secondi, il callback Outgoing di DingTalk tollera ±1 ora.
- `APP_SECRET` (almeno 32 caratteri) viene utilizzato per cifrare le credenziali dei canali e dei bot. **Non lo cambi e non lo perda**: dopo la sostituzione le credenziali già salvate (App Secret, Secret dei bot, Encrypt Key e così via) non potranno più essere decifrate e dovranno essere reinserite.
- Le credenziali dei bot sono memorizzate in SQLite e cifrate con AES-256-GCM; l'API e le pagine non mostrano mai il testo in chiaro e, in fase di modifica, lasciare vuoto il campo significa mantenere il valore esistente.

### 1.4 Ordine di creazione consigliato

Feishu / Lark (scansione QR, consigliata):

1. In «Bot di comando» faccia clic su «Scansione QR Feishu / Lark», selezioni Feishu o Lark internazionale e scansioni il codice.
2. Crei l'applicazione nella pagina della piattaforma e confermi; il sistema scrive automaticamente App ID / App Secret e l'`open_id` del proprietario, e abilita la connessione long-lived.
3. Cerchi il nome dell'applicazione in Feishu / Lark per avviare una chat privata, oppure aggiunga il bot a un gruppo.
4. Invii `/help` per verificare la catena di istruzioni e risposte.

Feishu / Lark (manuale):

1. Crei il bot nel sistema e selezioni la versione (Feishu / Lark) e la modalità di ricezione degli eventi (callback HTTP / connessione long-lived).
2. Callback HTTP: copi l'URL di callback nella console della piattaforma e configuri Encrypt Key / Verification Token; connessione long-lived: selezioni «Ricevi eventi tramite connessione long-lived» nella piattaforma.
3. Sottoscriva `im.message.receive_v1` e richieda i permessi di lettura e invio dei messaggi.
4. Pubblichi l'applicazione, aggiunga il bot al gruppo o imposti l'ambito di visibilità.
5. Invii `/help` per la verifica.

DingTalk (scansione QR, consigliata):

1. In «Bot di comando» faccia clic su «Aggiungi DingTalk tramite QR», scansiona il codice con DingTalk sul telefono e confermi la creazione.
2. Il sistema scrive automaticamente Client ID / Client Secret, usa il Client ID come Robot Code e abilita la connessione long-lived Stream.
3. Cerchi il bot in DingTalk per avviare una chat privata, oppure aggiunga il bot a un gruppo.
4. Invii `/help` per la verifica.

DingTalk (manuale):

1. Crei il bot nel sistema, selezioni la modalità di ricezione dei messaggi e copi l'URL di callback (modalità HTTP).
2. Nella console della piattaforma crei l'applicazione / il bot, inserisca l'URL di callback e la chiave, oppure selezioni la modalità Stream nella configurazione del bot.
3. Quando la piattaforma salva il callback avvia di norma una verifica dell'URL; assicurarsi che il sistema sia avviato e che il bot sia abilitato.
4. Pubblichi l'applicazione, aggiunga il bot al gruppo o imposti l'ambito di visibilità.
5. Invii `/help` per verificare la catena di istruzioni e risposte.

WeCom:

1. Crei un bot intelligente nella console di amministrazione WeCom, selezioni modalità API → connessione long-lived e recuperi Bot ID e Secret.
2. Nel sistema crei «Bot intelligente WeCom (connessione long-lived)» e inserisca Bot ID, Secret e UserID del proprietario.
3. Dopo il salvataggio il sistema stabilisce automaticamente la connessione long-lived, senza necessità di verifica dell'URL da parte della piattaforma.
4. Aggiunga il bot a un gruppo o a una chat privata e invii `/help` per la verifica.

---

## 2. Canali di notifica (invio unidirezionale)

I canali di notifica servono a inviare gli eventi di monitoraggio alle chat di gruppo: non richiedono un URL di callback pubblico, ma solo l'URL Webhook fornito dalla piattaforma.

### 2.1 Confronto tra i tre tipi di bot di gruppo

| Piattaforma | Tipo di sistema | Formato messaggio | Firma | Descrizione |
| -------- | -------------------------- | -------- | ------------ | ---------------------------------------------- |
| WeCom | Bot di gruppo WeCom | markdown | Nessuna | Circa 4096 byte per messaggio, il sistema tronca; il bot di gruppo può solo inviare |
| Feishu | Bot Feishu (bot personalizzato) | scheda interattiva | Chiave di firma opzionale | È possibile abilitare la verifica della firma; consigliato |
| DingTalk | Bot DingTalk (bot personalizzato) | markdown | Chiave di firma opzionale | È possibile abilitare la firma aggiuntiva; il sistema calcola la firma secondo le regole DingTalk |

Accesso alla configurazione: **Canali di notifica → Nuovo canale** nella barra laterale sinistra. Inserisca nome, Webhook, chiave di firma opzionale e selezioni gli eventi da sottoscrivere.

> Le notifiche degli eventi vengono inviate per impostazione predefinita tramite il Webhook del bot di gruppo configurato qui; anche il «Bot di comando» può abilitare separatamente le notifiche eventi. Le due configurazioni sono indipendenti e possono essere usate contemporaneamente.

### 2.2 Bot di gruppo WeCom

1. Apra la chat di gruppo WeCom → impostazioni del gruppo → bot di gruppo → aggiungi bot.
2. Copi l'indirizzo Webhook (in genere nel formato `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...`).
3. In «Canali di notifica» del sistema selezioni **Bot di gruppo WeCom**, incolli il Webhook e salvi.
4. Faccia clic su «Invio di prova» nel canale per verificare che il messaggio arrivi nel gruppo.

Note:

- Il Webhook stesso è una credenziale: se viene divulgato, chiunque può inviare messaggi nel gruppo. In caso di divulgazione lo rimuova dal gruppo e aggiunga nuovamente il bot.
- Il bot di gruppo non può ricevere istruzioni come `/add`; per le istruzioni utilizzi «Bot intelligente WeCom (connessione long-lived)».
- Il limite per singolo messaggio è di circa 4096 byte: il sistema tronca automaticamente e gli elenchi lunghi potrebbero non essere visualizzati per intero.
- I bot di gruppo sono soggetti a limiti di frequenza; quando il limite viene raggiunto il sistema ritenta automaticamente.

### 2.3 Bot personalizzato Feishu

1. Apra il gruppo Feishu → impostazioni del gruppo → bot di gruppo → aggiungi bot → bot personalizzato.
2. Copi l'indirizzo Webhook (in genere nel formato `https://open.feishu.cn/open-apis/bot/v2/hook/...`).
3. Si consiglia di selezionare **Verifica della firma** nelle impostazioni di sicurezza e di copiare la chiave di firma.
4. In «Canali di notifica» del sistema selezioni **Bot Feishu**, incolli il Webhook e, se ha abilitato la firma, inserisca la chiave di firma.
5. Dopo il salvataggio invii un messaggio di prova.

Regole della firma (già implementate nel sistema, non è necessario calcolarle manualmente):

- Il timestamp è espresso in secondi.
- Si usa `timestamp + "\n" + secret` come chiave per HMAC-SHA256 e si calcola la firma su una stringa vuota; il risultato viene codificato in Base64.
- Timestamp e firma vengono inviati insieme al corpo del messaggio.

Se utilizza «Parola chiave personalizzata» o «Lista bianca IP» anziché la firma, verifichi che il contenuto della notifica contenga la parola chiave oppure aggiunga l'IP in uscita del server alla lista bianca.

### 2.4 Bot personalizzato DingTalk

1. Apra il gruppo DingTalk → impostazioni del gruppo → assistente intelligente di gruppo → aggiungi bot → personalizzato.
2. Copi l'indirizzo Webhook (in genere nel formato `https://oapi.dingtalk.com/robot/send?access_token=...`).
3. Si consiglia di selezionare **Firma aggiuntiva** nelle impostazioni di sicurezza e di copiare la chiave di firma.
4. In «Canali di notifica» del sistema selezioni **Bot DingTalk**, incolli il Webhook e, se ha abilitato la firma aggiuntiva, inserisca la chiave di firma.
5. Dopo il salvataggio invii un messaggio di prova.

Regole della firma (già implementate nel sistema):

- Il timestamp è espresso in millisecondi.
- Si usa `secret` come chiave per calcolare HMAC-SHA256 su `timestamp + "\n" + secret`; il risultato viene codificato in Base64.
- `timestamp` e `sign` vengono inviati come parametri di query nell'URL.

Se utilizza «Parola chiave personalizzata» o «Intervallo di indirizzi IP» anziché la firma aggiuntiva, adegui di conseguenza le impostazioni di sicurezza. Quando viene raggiunto il limite di frequenza (ad esempio con codice di errore `90037`) il sistema ritenta automaticamente.

### 2.5 Sottoscrizione degli eventi e nuovi tentativi

Nei canali di notifica è possibile selezionare i tipi di evento da sottoscrivere:

| Evento | Descrizione |
| ------------------- | ---------------------------------------------- |
| `release` | Uscita ufficiale del gioco / DLC |
| `sale_start` | Lo sconto raggiunge la soglia di monitoraggio |
| `sale_change` | Variazione dello sconto o del prezzo durante una promozione |
| `sale_end` | Fine dello sconto, ripristino del prezzo originale |
| `price_change` | Variazione del prezzo originale o inversione dello stato gratuito al di fuori di una promozione |
| `delisting_warning` | Le notizie Steam contengono parole chiave di delisting (euristico, richiede conferma manuale) |
| `delisted` | Confermata per due volte consecutive l'impossibilità di acquistare nello store |
| `restored` | Ripristino dell'acquistabilità |
| `check_error` | Verifica non riuscita |

- **Se non viene selezionato alcun evento**, vengono ricevuti per impostazione predefinita tutti gli eventi tranne `check_error`.
- In caso di invio non riuscito vengono eseguiti nuovi tentativi dopo 30 secondi → 2 minuti → 10 minuti → 1 ora → 6 ore → 24 ore, per un massimo di 6 tentativi.
- Ogni scheda di canale dispone di «Invio di prova», utile per verificare il Webhook e la configurazione della firma.

---

## 3. Bot di comando (bidirezionali)

I bot di comando consentono agli utenti di gestire gli elementi monitorati tramite istruzioni slash nelle chat di Feishu / Lark, DingTalk o WeCom. Feishu / Lark supporta callback HTTP o connessione long-lived WebSocket, DingTalk supporta callback HTTP o connessione long-lived Stream, mentre WeCom utilizza la connessione long-lived WebSocket; i risultati vengono restituiti alla conversazione originale tramite l'API della piattaforma o la connessione long-lived.

### 3.1 Comportamento comune

- **Ambito di applicazione**: le istruzioni agiscono sempre sui dati dell'account a cui appartiene il bot. Anche se altri amministratori presenti nella lista consentita utilizzano il bot, vengono modificati gli elementi monitorati del proprietario del bot.
- **Identificativo del proprietario**: `ownerPlatformUserId` serve solo a identificare chi ha effettuato la scansione / il proprietario del bot e non concede automaticamente il permesso di eseguire istruzioni.
- **Lista consentita**: tutti gli utenti della piattaforma (compreso l'ID del proprietario) devono essere inseriti nella lista consentita per poter eseguire istruzioni; i ruoli sono:
  - `admin`: può usare tutte le istruzioni.
  - `viewer`: può usare solo `/help`, `/list`, `/price`, `/events`.
  - Gli utenti Feishu / Lark, DingTalk e WeCom non presenti nella lista consentita ricevono un link di autorizzazione Web monouso e il bot non esegue l'istruzione originale; anche DingTalk supporta questo link.
- **Notifiche eventi**: il bot può abilitare separatamente «Ricezione notifiche eventi» nella pagina di modifica, per inviare gli eventi alla conversazione usata più di recente da un utente autorizzato. È indipendente dai «Canali di notifica» e può essere abilitata contemporaneamente. In assenza di una conversazione recente non viene inviato nulla; per i dettagli vedere la sezione 3.5.
- **Formato dei messaggi**: attualmente vengono gestiti solo i messaggi di testo. I messaggi con immagini, file, testo formattato o schede vengono ignorati.
- **Formato delle istruzioni**: iniziano con `/` o con il carattere a larghezza piena `／`; sono supportati `/add@bot`, argomenti tra virgolette e `--flag=value`.
- **Deduplicazione**: quando la piattaforma consegna più volte lo stesso messaggio, il sistema deduplica in base all'ID evento / messaggio della piattaforma e lo elabora una sola volta.
- **Limiti di frequenza**: massimo 10 istruzioni al minuto per utente della piattaforma, 30 al minuto per conversazione e 60 al minuto per bot; quando il limite viene raggiunto l'avviso viene mostrato al massimo una volta al minuto.
- **Risposte asincrone**: i callback Feishu / Lark / DingTalk restituiscono subito un esito positivo, mentre i messaggi DingTalk Stream / WeCom vengono ricevuti tramite connessione long-lived; le istruzioni vengono eseguite in background e il risultato viene inviato tramite l'API della piattaforma o la connessione long-lived. La visualizzazione della risposta sulla piattaforma può subire un lieve ritardo.
- **Selezione tra più risultati**: quando `/add` e `/adddlc` trovano più risultati con la ricerca per nome, il bot restituisce un elenco numerato; risponda direttamente con il numero (valido per 10 minuti) oppure invii `/cancel` per annullare.
- **Quote**: ogni account può creare al massimo 3 bot; per la stessa piattaforma può esistere un solo bot abilitato (Feishu e Lark internazionale condividono la quota della piattaforma «Feishu»). Per i bot con callback HTTP di Feishu / Lark / DingTalk, dopo la disattivazione l'URL di callback diventa immediatamente non valido (restituisce 404); per i bot long-lived / Stream la connessione viene chiusa dopo la disattivazione.

### 3.2 Bot applicativo Feishu / Lark (consigliato)

> #### Motivo della raccomandazione
>
> Feishu/Lark supporta la versione personale, che consente di separare bene vita privata e lavoro.



Feishu / Lark richiede la creazione di un'**applicazione aziendale self-built**, con l'abilitazione delle funzionalità del bot e la sottoscrizione degli eventi dei messaggi. Il Webhook del bot personalizzato di gruppo non può ricevere istruzioni. Feishu (versione cinese) utilizza `open.feishu.cn` / `accounts.feishu.cn`, mentre Lark internazionale utilizza `open.larksuite.com` / `accounts.larksuite.com`; nel sistema la distinzione avviene tramite la «Versione» configurata nel bot.

#### Creazione con un clic tramite scansione QR (consigliata)

1. In «Bot di comando» faccia clic su **Scansione QR Feishu / Lark** e nella finestra selezioni «Feishu» o «Lark internazionale».
2. Scansioni il codice con il client corrispondente; la pagina precompila il nome dell'applicazione e consente solo la creazione di una nuova applicazione.
3. Dopo la conferma della creazione, il sistema recupera automaticamente App ID / App Secret, registra l'`open_id` di chi ha effettuato la scansione come proprietario e abilita la connessione long-lived.
4. Il codice QR è valido per 10 minuti; se sulla stessa piattaforma esiste già un bot abilitato o la quota è esaurita, la richiesta viene rifiutata.
5. Cerchi il nome dell'applicazione in Feishu / Lark per avviare una chat privata, oppure aggiunga il bot a un gruppo e invii `/help`.

> La creazione tramite scansione utilizza il modello ufficiale `PersonalAgent` di Feishu, che include già le funzionalità del bot, i permessi sui messaggi e l'evento `im.message.receive_v1`; la modalità di ricezione degli eventi è la connessione long-lived. Se la Sua azienda limita la creazione tramite scansione, può utilizzare la configurazione manuale descritta di seguito.
>
> Se il codice QR di Feishu viene scansionato da un tenant Lark, il sistema passa automaticamente a `accounts.larksuite.com` per completare l'autorizzazione.

#### Configurazione manuale

1. Apra la [piattaforma aperta Feishu](https://open.feishu.cn/app) o la [piattaforma aperta Lark](https://open.larksuite.com/app) e crei un'applicazione aziendale self-built.
2. In «Aggiungi funzionalità dell'applicazione» abiliti **Bot**.
3. In «Gestione permessi» richieda i permessi relativi ai messaggi:
   - `im:message.p2p_msg:readonly`: lettura dei messaggi privati inviati dall'utente al bot.
   - `im:message.group_at_msg:readonly`: ricezione dei messaggi in cui il bot viene menzionato (@) nelle chat di gruppo.
   - `im:message:send_as_bot`: invio di messaggi con l'identità dell'applicazione.
   - Se la console suddivide i permessi per scenario, richieda anche i permessi corrispondenti alla lettura del contenuto dei messaggi e all'invio dei messaggi.
4. Nel sistema crei «Bot applicativo Feishu / Lark» e selezioni la versione e la modalità di ricezione degli eventi:
   - **Connessione long-lived (consigliata)**: in «Eventi e callback» della piattaforma selezioni «Ricevi eventi tramite connessione long-lived» e sottoscriva `im.message.receive_v1`; non serve un URL di callback.
   - **Callback HTTP**: inserisca come indirizzo di richiesta il valore `/webhooks/feishu/<slug>` mostrato dal sistema; se è richiesta la cifratura, inserisca Encrypt Key e Verification Token.
5. Crei una versione e pubblichi l'applicazione; in «Ambito di disponibilità dell'applicazione» si assicuri che gli utenti previsti possano usarla.
6. Aggiunga il bot a un gruppo oppure avvii direttamente una chat privata con il bot.

#### Campi lato sistema

| Campo | Obbligatorio | Descrizione |
| ------------------ | ----------------- | ---------------------------------------------------------------- |
| Nome | Sì | Utilizzato solo per l'identificazione all'interno del sistema |
| Versione | Sì | Feishu (versione cinese) o Lark (internazionale) |
| Modalità di ricezione eventi | Sì | Callback HTTP / connessione long-lived; la creazione tramite scansione usa la connessione long-lived per impostazione predefinita |
| App ID | Consigliato come obbligatorio | Necessario per ottenere `tenant_access_token`, rispondere e inviare eventi |
| App Secret | Consigliato come obbligatorio | Abbinato all'App ID |
| Encrypt Key | Con callback HTTP, dipende dalla piattaforma | Deve coincidere esattamente con quello della console Feishu / Lark; obbligatorio se la cifratura è abilitata |
| Verification Token | Con callback HTTP, consigliato | Deve coincidere con quello della piattaforma; serve a validare l'origine degli eventi |
| ID utente piattaforma del proprietario | Consigliato | Inserisca l'`open_id` Feishu / Lark (di norma inizia con `ou_`); viene compilato automaticamente con la creazione tramite scansione |
| API Base URL | No | Solo per test / proxy; lasciare vuoto in produzione |

#### Callback, connessione long-lived e firma

- **Callback HTTP**: quando la piattaforma salva l'indirizzo di sottoscrizione degli eventi invia una verifica `url_verification`, a cui il sistema risponde con `challenge`.
  - Se è configurato un Encrypt Key, il sistema verifica la firma negli header `SHA256(timestamp + nonce + encryptKey + rawBody)`, tollerando uno scostamento di ±300 secondi, quindi decifra il testo cifrato.
  - Se è configurato un Verification Token, il sistema verifica il token presente nell'evento; in caso di mancata corrispondenza restituisce 401.
- **Connessione long-lived**: il server utilizza App ID / App Secret per connettersi attivamente all'endpoint long-lived di Feishu / Lark; gli eventi vengono inviati tramite la connessione autenticata e non richiedono verifica della firma, indirizzo pubblico o reverse proxy. Lo stato della connessione viene mostrato sulla scheda del bot.
- Vengono gestiti solo i messaggi di testo di `im.message.receive_v1`; i messaggi inviati dall'applicazione stessa vengono ignorati.
- La risposta utilizza preferibilmente l'API «Rispondi al messaggio»; in caso di errore si passa all'invio di un messaggio a `chat_id`.
- Nelle chat di gruppo è necessario **menzionare il bot (@)** prima di digitare l'istruzione; nelle chat private è possibile inviarla direttamente.

#### ID del proprietario e lista consentita

- Negli eventi Feishu / Lark l'identificativo dell'utente utilizzato è preferibilmente `open_id`; la lista consentita deve quindi contenere `open_id`, non numeri di telefono, indirizzi e-mail o nomi.
- La creazione tramite scansione scrive l'`open_id` di chi ha effettuato la scansione nel campo "ID del proprietario", ma questo serve solo come identificativo e non concede automaticamente il permesso di eseguire istruzioni; al primo utilizzo è comunque necessario approvare il proprio account della piattaforma tramite l'autorizzazione Web.
- In caso di configurazione manuale è possibile consultare il debug degli eventi / i log dei callback, oppure chiedere all'utente di inviare prima un messaggio e poi controllare i dettagli dell'evento sulla piattaforma.

### 3.3 Bot DingTalk (callback HTTP / Stream)

DingTalk richiede la creazione di un **bot aziendale interno**, con modalità di ricezione dei messaggi **connessione long-lived Stream** (consigliata) oppure **callback HTTP / Outgoing**. Il Webhook del bot personalizzato di gruppo DingTalk non può ricevere istruzioni.

#### Aggiunta tramite scansione QR (consigliata)

1. Nella pagina «Bot di comando» del sistema faccia clic su **Aggiungi DingTalk tramite QR**.
2. Scansioni il codice con DingTalk sul telefono, selezioni l'organizzazione e segua le indicazioni della pagina per inserire le informazioni del bot e confermare la creazione.
3. Il sistema recupera automaticamente Client ID / Client Secret, usa il Client ID come Robot Code e abilita la connessione long-lived Stream; il codice QR è valido per 10 minuti.
4. Dopo la creazione è possibile cercare il bot in DingTalk per avviare una chat privata oppure aggiungerlo a un gruppo; lo `staffId` di chi ha effettuato la scansione serve solo come identificativo, mentre i membri che lo utilizzano devono comunque ottenere l'autorizzazione Web o essere aggiunti alla lista consentita.

> Se sulla stessa piattaforma esiste già un bot abilitato, o la quota di bot è esaurita, la scansione viene rifiutata; gestisca prima il bot esistente nella pagina.
>
> La scansione utilizza la pagina ufficiale di registrazione delle applicazioni DingTalk. Se l'organizzazione limita la creazione tramite scansione o la pagina di registrazione restituisce un errore, può comunque utilizzare la configurazione manuale descritta di seguito.

#### Configurazione manuale

1. Apra la [piattaforma aperta DingTalk](https://open.dingtalk.com/) e crei un'applicazione aziendale interna.
2. In «Aggiungi funzionalità dell'applicazione» aggiunga **Bot**.
3. Selezioni la modalità di ricezione dei messaggi:
   - **Modalità Stream (consigliata)**: selezioni la modalità Stream nella configurazione del bot e pubblichi; non serve un URL di callback pubblico.
   - **Callback HTTP / Outgoing**: inserisca l'indirizzo `/webhooks/dingtalk/<slug>` mostrato dal sistema e l'App Secret per la verifica della firma.
4. Nel sistema crei «Bot DingTalk», inserisca Client ID (App Key) e Client Secret (App Secret) e selezioni la stessa modalità di ricezione.
5. Se desidera inviare notifiche eventi, inserisca il Robot Code (di norma identico al Client ID) e verifichi che l'applicazione disponga del permesso di invio attivo dei messaggi da parte del bot.
6. Pubblichi l'applicazione, aggiunga il bot al gruppo e invii `/help`.

#### Campi lato sistema

| Campo | Obbligatorio | Descrizione |
| --------------------------- | ----------------------- | ---------------------------------------------- |
| Nome | Sì | Utilizzato solo per l'identificazione all'interno del sistema |
| Modalità di ricezione messaggi | Sì | Callback HTTP / connessione long-lived Stream; la creazione tramite scansione usa Stream per impostazione predefinita |
| App Key (Client ID) | Obbligatorio con Stream | Client ID dell'applicazione DingTalk; necessario anche per le notifiche eventi |
| App Secret (Client Secret) | Obbligatorio con Stream / verifica firma HTTP | Credenziale per stabilire la connessione Stream; con callback HTTP serve a verificare la firma del callback |
| Robot Code | Consigliato per le notifiche eventi | Codice del bot; di norma identico al Client ID |
| ID utente piattaforma del proprietario | Consigliato | Inserisca lo `staffId` DingTalk |
| API Base URL | No | Solo per test / proxy; lasciare vuoto in produzione |

#### Ricezione dei messaggi e risposte

- **Modalità Stream**: il server utilizza Client ID / Secret per connettersi attivamente al gateway DingTalk Stream e non richiede IP pubblico, dominio o URL di callback; i messaggi del bot vengono inviati tramite la connessione long-lived e il sistema invia immediatamente un ACK per poi eseguire l'istruzione in modo asincrono.
- **Callback HTTP**: gli header della richiesta di callback DingTalk contengono `timestamp` (millisecondi) e `sign`; il sistema usa App Secret come chiave per calcolare HMAC-SHA256 su `timestamp + "\n" + App Secret`, tollerando uno scostamento di ±1 ora.
- Entrambe le modalità gestiscono solo i messaggi di testo con `msgtype = text`.
- L'ID utente viene ricavato preferibilmente da `senderStaffId` e, in alternativa, da `senderId`; l'ID del proprietario e la lista consentita devono contenere lo `staffId`.
- Per le risposte viene utilizzato il `sessionWebhook` presente nel corpo del messaggio, inviando markdown e menzionando il mittente dell'istruzione; questo Webhook è in genere valido per circa 1,5 ore: una volta scaduto è sufficiente inviare nuovamente l'istruzione.
- Il sistema deduplica in base al `msgId` di DingTalk; la modalità Stream conferma inoltre immediatamente l'invio per evitare consegne duplicate da parte della piattaforma.

#### ID del proprietario e lista consentita

- Si basa su `senderStaffId` dell'evento di callback (in alternativa `senderId`); è possibile consultarlo nei log di debug degli eventi della piattaforma aperta o verificarlo nei dettagli del membro in rubrica.
- "ID del proprietario" serve solo come identificativo e non concede automaticamente il permesso di eseguire istruzioni; tutti gli utenti DingTalk devono ottenere l'autorizzazione Web o essere aggiunti alla lista consentita.
- La creazione tramite scansione non restituisce necessariamente lo `staffId` di chi ha effettuato la scansione: è possibile inserirlo manualmente; al primo utilizzo è sufficiente che l'account proprietario del bot acceda alla pagina Web e approvi.

### 3.4 Bot intelligente WeCom (connessione long-lived)

WeCom richiede la creazione di un **bot intelligente** con selezione di **modalità API → connessione long-lived**. Il Webhook del bot di gruppo WeCom può solo inviare e non ricevere istruzioni.

> Nota di aggiornamento: il vecchio callback delle applicazioni self-built WeCom (Token / EncodingAESKey / CorpID / AgentID) non viene più utilizzato per i bot di comando. Per i bot esistenti è necessario inserire in «Bot di comando» il Bot ID / Secret del bot intelligente e salvare.

#### Aggiunta tramite scansione QR (consigliata)

1. Nella pagina «Bot di comando» del sistema faccia clic su **Aggiungi WeCom tramite QR**.
2. Scansioni il codice con un account WeCom che disponga del permesso di creare bot intelligenti e segua le indicazioni della pagina per creare e autorizzare il bot.
3. Il sistema recupera automaticamente Bot ID / Secret, crea il bot e stabilisce la connessione long-lived; il codice QR è valido per 5 minuti.
4. Dopo la creazione faccia inviare un'istruzione da un membro che utilizza il bot e approvi dalla pagina Web con l'account proprietario del bot; lo UserID del proprietario serve solo come identificativo e non concede automaticamente i permessi.

> Se sulla stessa piattaforma esiste già un bot abilitato, o la quota di bot è esaurita, la scansione viene rifiutata; gestisca prima il bot esistente nella pagina.
>
> La scansione utilizza la pagina di autorizzazione ufficiale WeCom. Se l'account non dispone del permesso di creare bot intelligenti o se WeCom ha modificato il flusso della pagina, può comunque utilizzare la configurazione manuale descritta di seguito.

#### Configurazione manuale

1. Apra la [console di amministrazione WeCom](https://work.weixin.qq.com/) o l'area di lavoro del client WeCom e acceda a «Bot intelligente» → crea bot.
2. Nella procedura di creazione selezioni «Crea in modalità API» → «Usa connessione long-lived».
3. Recuperi e salvi **Bot ID** e **Secret**. Il Secret di norma viene mostrato una sola volta; se viene perso può essere rigenerato.
4. Nel sistema crei «Bot intelligente WeCom (connessione long-lived)» e inserisca Bot ID, Secret e UserID del proprietario.
5. Aggiunga il bot a un gruppo o a una chat privata; nelle chat di gruppo invii `/help` **menzionando il bot (@)**.
6. Non è necessario inserire URL di callback, Token, EncodingAESKey o CorpID; il servizio si connette attivamente a `wss://openws.work.weixin.qq.com`.

#### Campi lato sistema

| Campo | Obbligatorio | Descrizione |
| ----------------- | -------- | ---------------------------------------------------------------------- |
| Nome | Sì | Utilizzato solo per l'identificazione all'interno del sistema |
| Bot ID | Sì | Identificativo univoco del bot intelligente |
| Secret | Sì | Secret dedicato alla connessione long-lived, usato per l'autenticazione `aibot_subscribe` |
| ID utente piattaforma del proprietario | Consigliato | UserID del membro nella rubrica WeCom; fa fede il `from.userid` presente nel callback effettivo del bot |

#### Meccanismo della connessione long-lived

- Il server si connette attivamente a `wss://openws.work.weixin.qq.com`, il che lo rende adatto ai deployment in rete interna senza necessità di un IP pubblico fisso.
- Una volta stabilita la connessione viene inviato `aibot_subscribe`, che utilizza Bot ID + Secret per completare l'autenticazione; successivamente viene inviato un heartbeat `ping` ogni 30 secondi.
- I messaggi degli utenti vengono inviati in chiaro tramite `aibot_msg_callback` e non richiedono decifratura; il sistema gestisce solo `msgtype = text`.
- Le risposte vengono inviate tramite `aibot_respond_msg` con il `req_id` del callback, in formato markdown; le risposte con lo stesso `req_id` vengono inviate in modo seriale.
- Per un bot intelligente è consentita una sola connessione long-lived valida alla volta; una nuova connessione disconnette quella precedente e, in caso di deployment multi-istanza, le istanze si interrompono a vicenda.
- In caso di disconnessione il sistema si riconnette con backoff esponenziale; se l'autenticazione fallisce ripetutamente o la connessione viene sostituita da una nuova istanza, la scheda del bot mostra un'anomalia della connessione long-lived.
- Nei messaggi di gruppo viene prima rimosso il prefisso `@bot` e poi l'istruzione viene interpretata come istruzione slash.
- È possibile rispondere entro 24 ore dal callback del messaggio; il sistema esegue le istruzioni in una coda in background e le istruzioni lunghe richiedono in genere alcuni secondi.
- Dopo aver abilitato le notifiche eventi del bot, il sistema utilizza la stessa connessione long-lived con `aibot_send_msg` per inviare attivamente messaggi alla conversazione più recente; è necessario che l'utente abbia prima inviato un messaggio al bot.

#### ID del proprietario e lista consentita

- Inserisca lo **UserID** presente nella rubrica WeCom (account del membro), non nomi, numeri di telefono o ID di contatti esterni.
- Se il creatore del bot non è un super amministratore aziendale, `from.userid` potrebbe essere lo userid cifrato dell'entità aziendale; configuri proprietario e lista consentita in base al valore presente nell'evento di callback effettivo.

#### Utenti non autorizzati e autorizzazione Web

- Se un utente WeCom non è nella lista consentita, il bot risponde con un link di autorizzazione Web monouso (`PUBLIC_BASE_URL/authorize/<token>`), valido per 30 minuti.
- Il proprietario del bot accede alla pagina del link con il proprio account Web, verifica l'ID utente della piattaforma (nonché, se disponibili, nickname e conversazione), seleziona `viewer` o `admin` e quindi approva o rifiuta.
- Chi non è proprietario del bot, dopo l'accesso, può solo visualizzare la richiesta e non approvarla autonomamente: deve inoltrare il link al proprietario del bot.
- Il link di autorizzazione diventa non valido dopo essere stato elaborato una volta; gli altri link in sospeso dello stesso utente vengono aggiornati di conseguenza. Una volta scaduto, faccia inviare all'utente una qualsiasi istruzione per generare un nuovo link.
- Tutti i membri che utilizzano il bot (compreso chi ha effettuato la scansione) devono ottenere i permessi tramite l'autorizzazione Web o la lista consentita; se desidera disporre di tutti i permessi sulle istruzioni, selezioni `admin` al momento dell'approvazione.
- `PUBLIC_BASE_URL` deve essere raggiungibile dal browser; se il link non si apre, verifichi il reverse proxy e questa variabile d'ambiente.

#### Stato della connessione

La scheda del bot mostra lo stato della connessione long-lived:

- **Connessione long-lived in corso**: connessione in fase di stabilimento o riconnessione automatica.
- **Connessione long-lived attiva**: autenticazione riuscita, il bot può ricevere istruzioni.
- **Anomalia della connessione long-lived**: credenziali errate, Bot ID / Secret non inseriti, rete non raggiungibile, autenticazione non riuscita o connessione sostituita da un'altra istanza.
- **Connessione long-lived non abilitata**: il bot è disattivato.

Se lo stato resta anomalo, verifichi Bot ID / Secret, che il firewall in uscita del server consenta `wss://openws.work.weixin.qq.com:443` e che nessun'altra istanza utilizzi lo stesso Bot ID.

### 3.5 Notifiche eventi del bot

Dopo aver selezionato **Ricezione notifiche eventi** nella pagina di modifica del «Bot di comando», il bot riceve anche eventi quali uscite, promozioni e delisting. Si tratta di una configurazione distinta dai canali di notifica e le due possono essere abilitate contemporaneamente.

- **Destinazione delle notifiche**: la conversazione usata più di recente da un membro della lista consentita con il bot. Il sistema aggiorna questa destinazione solo dopo che un utente autorizzato ha inviato con successo un'istruzione; gli utenti non autorizzati non modificano la destinazione delle notifiche.
- **Prerequisiti**: il bot di destinazione deve aver ricevuto almeno un'istruzione da un utente autorizzato, altrimenti non viene effettuata alcuna consegna degli eventi. La scheda del bot indica "nessuna conversazione recente registrata".
- **Ambito degli eventi**: vengono ricevuti tutti gli eventi, compresi gli errori di verifica; non è possibile filtrare i tipi di evento per singolo bot.
- **I bot di gruppo dei canali di notifica continuano a inviare secondo le regole di selezione degli eventi del canale stesso; le due configurazioni non si influenzano a vicenda.**

Requisiti aggiuntivi per ciascuna piattaforma:

- **Feishu / Lark**: richiede App ID / App Secret e il permesso di inviare messaggi alla conversazione con l'identità dell'applicazione. Gli eventi vengono inviati al `chat_id` della conversazione più recente; sono supportate sia la modalità callback HTTP sia quella long-lived.
- **DingTalk**: richiede App Key, App Secret, Robot Code e il permesso di invio attivo dei messaggi da parte del bot. Per le chat di gruppo viene utilizzato `openConversationId`, per le chat private lo `staffId` del mittente.
- **WeCom**: utilizza la connessione long-lived `aibot_send_msg` per inviare alla conversazione più recente; chat privata `chat_type=1`, chat di gruppo `chat_type=2`. L'utente deve aver già avuto una conversazione con il bot.

> Se il bot viene disattivato, l'interruttore delle notifiche eventi viene spento, la conversazione più recente viene eliminata o il bot viene rimosso dal gruppo, la consegna viene annullata o fallisce; è sufficiente far inviare nuovamente un'istruzione da un utente autorizzato per aggiornare la conversazione di destinazione.

---

## 4. Riferimento rapido delle istruzioni

```text
/help
/add <appid | link allo store | nome> [--discount N] [--note testo] [--force]
/adddlc <appid del gioco base | link | nome> [--max 50]
/remove <id | appid | nome>
/pause <id | appid | nome>
/resume <id | appid | nome>
/check <id | appid | nome>
/price <id | appid | nome>
/list [--all] [--sale] [--paused] [--page N]
/events [--item id] [--limit 10]
/cancel
```

Note:

- `/add` consente di cercare direttamente nello store Steam; quando la ricerca per nome restituisce più risultati, risponda con il numero per selezionare.
- `--discount N` imposta la soglia di notifica dello sconto (0–100); se non specificata viene usato il valore predefinito dell'account.
- `--force` serve nei casi in cui il gioco non sia recuperabile nella regione corrente ma si desideri comunque aggiungerlo per ricevere solo avvisi basati sulle notizie.
- `/adddlc` importa tutti i DLC del gioco base, con un massimo di 50 per operazione.
- `/check` ignora la cache, esegue immediatamente la verifica e registra gli eventi, ed è soggetto ai limiti di frequenza di Steam.
- `/list` non mostra per impostazione predefinita gli elementi sospesi; `--all` mostra tutto, `--sale` solo quelli in promozione, `--paused` solo quelli sospesi.
- `/events` mostra per impostazione predefinita gli ultimi 10 eventi, fino a un massimo di 20.
- I permessi di visualizzatore sono limitati a `/help`, `/list`, `/price`, `/events`.

---

## 5. Risoluzione dei problemi comuni

| Sintomo | Possibile causa | Intervento |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Salvataggio dell'URL di callback Feishu / Lark / DingTalk non riuscito | Servizio non raggiungibile da Internet, certificato non valido, `PUBLIC_BASE_URL` errato | Acceda al dominio di callback tramite rete mobile; verifichi che la catena di certificati HTTPS sia completa; verifichi che il bot sia stato creato e abilitato |
| Il callback Feishu / Lark / DingTalk restituisce 404 | Bot disattivato, eliminato, oppure `<slug>` errato | Copi l'URL di callback più recente dalla pagina «Bot di comando»; abiliti il bot |
| Feishu / Lark segnala verifica della sfida non riuscita / 401 | Verification Token o Encrypt Key non coerenti; il proxy ha modificato il corpo della richiesta | Verifichi nuovamente su entrambi i lati; disattivi la compressione / riscrittura del corpo; conservi gli header `X-Lark-*` |
| Dopo aver abilitato la cifratura in Feishu / Lark il bot non risponde | La piattaforma ha abilitato l'Encrypt Key ma il sistema non lo ha inserito e il testo cifrato non può essere analizzato; oppure la verifica del Verification Token restituisce direttamente 401 | Inserisca nel sistema lo stesso Encrypt Key e Verification Token, oppure disabiliti la cifratura sulla piattaforma e salvi nuovamente |
| Feishu / Lark riceve i messaggi ma non riesce a rispondere | App ID / App Secret non inseriti o permesso di invio messaggi mancante | Completi le credenziali; richieda e pubblichi il permesso di invio messaggi nella piattaforma aperta |
| La connessione long-lived Feishu / Lark resta in connessione / in anomalia | App ID / App Secret errati; l'applicazione non ha abilitato «Ricevi eventi tramite connessione long-lived»; l'azienda limita la creazione tramite scansione | Verifichi le credenziali; passi a connessione long-lived in eventi e callback e pubblichi una versione; oppure utilizzi il callback HTTP |
| Dopo la scansione il bot Feishu / Lark non si trova | Applicazione non pubblicata o ambito di disponibilità che non include il membro | Crei una versione e la pubblichi nella piattaforma aperta, adeguando l'ambito di disponibilità; cerchi il nome dell'applicazione |
| È stato scansionato il codice QR Feishu ma è stata creata un'applicazione Lark | L'account che ha effettuato la scansione appartiene a un tenant Lark e il sistema ha cambiato automaticamente il dominio di autorizzazione | Comportamento normale; cerchi il nome dell'applicazione in Lark |
| Callback DingTalk 401 | App Secret errato; header rimossi dal proxy; scostamento dell'ora del server superiore a 1 ora | Verifichi l'App Secret dell'applicazione (non la chiave di firma); conservi `timestamp`, `sign`; sincronizzi NTP |
| Risposta DingTalk in timeout / non riuscita | `sessionWebhook` scaduto | Invii nuovamente l'istruzione; si assicuri che il callback venga completato entro pochi secondi |
| DingTalk Stream resta non connesso / in anomalia | Client ID / Secret errati; il bot non ha selezionato la modalità Stream; applicazione non pubblicata; il server non può accedere in uscita a `api.dingtalk.com` | Verifichi le credenziali; selezioni Stream nella configurazione del bot e pubblichi una versione; controlli la rete in uscita |
| La scansione QR DingTalk segnala autorizzazione non riuscita | L'account che ha effettuato la scansione non ha permessi da sviluppatore; codice QR scaduto; l'azienda selezionata non consente la creazione di applicazioni; caricamento del modello della pagina di autorizzazione non riuscito | Verifichi che l'account abbia permessi da sviluppatore nell'azienda di destinazione; rigeneri il codice QR; utilizzi un'azienda con i permessi necessari; se il problema persiste, controlli nei log del servizio la causa dell'«autorizzazione tramite scansione QR DingTalk non riuscita» |
| Dopo la scansione QR DingTalk il bot non risponde | Applicazione non pubblicata o ambito di disponibilità che non include il membro; bot non aggiunto alla conversazione; connessione Stream non stabilita | Pubblichi l'applicazione e adegui l'ambito di disponibilità; controlli lo stato della connessione nella scheda del bot; invii nuovamente l'istruzione |
| L'utente DingTalk / Feishu riceve l'avviso di mancata autorizzazione | L'utente della piattaforma non è nella lista consentita e non ha ancora ottenuto l'autorizzazione Web | Faccia inviare all'utente una qualsiasi istruzione per ottenere il link di autorizzazione, quindi approvi accedendo alla pagina Web con l'account proprietario del bot, oppure lo aggiunga direttamente alla lista consentita |
| Connessione long-lived WeCom non connessa / in anomalia | Bot ID o Secret errati; il server non può accedere in uscita a `openws.work.weixin.qq.com:443`; un'altra istanza utilizza lo stesso bot; bot disattivato | Verifichi Bot ID / Secret; controlli firewall in uscita e proxy; verifichi che non vi siano deployment duplicati; controlli stato e messaggi di errore nella scheda del bot |
| Nessuna risposta ai messaggi WeCom | Connessione long-lived interrotta; messaggio oltre la finestra di risposta di 24 ore; bot disattivato o eliminato durante l'elaborazione | Controlli lo stato della connessione long-lived; invii nuovamente l'istruzione; verifichi che il bot resti abilitato |
| WeCom segnala che la connessione è stata sostituita | Per lo stesso Bot ID è stata stabilita una nuova connessione e la precedente è stata disconnessa da WeCom | Mantenga una sola istanza in esecuzione per ogni bot; arresti i servizi distribuiti in duplicato oppure disattivi e riabiliti il bot nel sistema |
| Nessuna risposta alle istruzioni | Nella chat di gruppo il bot non è stato menzionato (@); il messaggio non è di testo; non inizia con `/`; l'utente non è nella lista consentita | Menzioni il bot nel gruppo (@); invii `/help`; aggiunga l'ID utente della piattaforma alla lista consentita |
| Anche chi ha effettuato la scansione non ha i permessi sulle istruzioni | L'ID del proprietario serve solo come identificativo e non concede più implicitamente i permessi | Approvi il proprio account della piattaforma nella pagina di autorizzazione Web, oppure faccia aggiungere il proprio ID della piattaforma alla lista consentita dall'account proprietario del bot |
| Conflitto durante la creazione del bot | Sulla stessa piattaforma esiste già un bot abilitato | Disattivi prima il vecchio bot e poi abiliti quello nuovo |
| Invio di prova del canale di notifica non riuscito | Webhook non valido, chiave di firma errata, restrizioni basate su parola chiave / lista bianca IP | Copi nuovamente il Webhook; verifichi la chiave di firma; controlli le impostazioni di sicurezza della piattaforma |
| Nessuna notifica eventi nel gruppo | Canale disattivato, tipi di evento non selezionati, bot di gruppo rimosso | Controlli lo stato del canale e la sottoscrizione degli eventi; invii nuovamente un messaggio di prova |
| Il bot non invia notifiche eventi | «Ricezione notifiche eventi» non abilitata; nessuna conversazione autorizzata recente; in DingTalk mancano App Key / Robot Code; bot disattivato | Attivi le notifiche modificando il bot; faccia inviare prima un'istruzione da un utente autorizzato; completi le credenziali DingTalk; controlli i record di consegna |
| Feishu / Lark / DingTalk invia più volte lo stesso messaggio | La piattaforma non ha ricevuto tempestivamente l'ACK o si sono verificati problemi di rete | Il sistema deduplica in base all'ID messaggio; si assicuri che il callback risponda entro 10 secondi |

### Suggerimenti per il debug

1. Utilizzi prima **Simula istruzione** nella scheda «Bot di comando» del sistema, eseguendo localmente con l'identità del proprietario del bot, per verificare che la logica delle istruzioni e le quote funzionino correttamente.
2. Utilizzi poi **Invio di prova** nei «Canali di notifica» per verificare il Webhook e la firma.
3. Infine invii `/help` nella chat della piattaforma per verificare callback / connessione long-lived, permessi e catena di risposte.
4. Consulti i log del container: `docker compose logs -f steam-monitor`, prestando attenzione ai log relativi a `wecom`, `webhook`, `inbound`, `delivery`.

---

## 6. Suggerimenti di sicurezza

- Gli URL di callback Feishu / Lark / DingTalk, i Webhook dei bot di gruppo e Bot ID / Secret di WeCom sono da considerarsi credenziali: non li inserisca in repository pubblici né li invii in gruppi pubblici.
- Per i callback HTTP di Feishu / Lark si consiglia di abilitare Encrypt Key + Verification Token; anche le credenziali della connessione long-lived devono restare riservate. Il callback HTTP di DingTalk richiede obbligatoriamente l'App Secret per la verifica della firma e anche la modalità Stream richiede la protezione del Client Secret; WeCom richiede la protezione di Bot ID e del Secret della connessione long-lived.
- La lista consentita deve seguire il principio dei privilegi minimi: i membri ordinari utilizzano `viewer`, solo gli amministratori usano `admin`.
- Non esponga il file SQLite su Internet; esegua regolarmente il backup del database e, contestualmente, di `APP_SECRET` presente in `.env`.
- Dopo aver modificato `PUBLIC_BASE_URL` o cambiato dominio, aggiorni tempestivamente gli URL di callback nella console di Feishu / Lark / DingTalk; la modalità long-lived non è interessata.
- In caso di sospetta divulgazione delle credenziali: reimposti App Secret / Encrypt Key in Feishu / Lark, Client Secret in DingTalk, rigeneri il Secret del bot intelligente in WeCom e li reinserisca nel sistema.

---

## 7. Documentazione ufficiale

- Sottoscrizione degli eventi e configurazione dell'indirizzo di richiesta Feishu: <https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case>
- Creazione di un'applicazione Feishu con un clic: <https://open.feishu.cn/document/mcp_open_tools/scan-to-create-an-app-in-one-click>
- Bot personalizzato Feishu: <https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot>
- Sottoscrizione degli eventi e configurazione dell'indirizzo di richiesta Lark: <https://open.larksuite.com/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case>
- Creazione di un'applicazione Lark con un clic: <https://open.larksuite.com/document/mcp_open_tools/scan-to-create-an-app-in-one-click>
- Ricezione dei messaggi nei bot DingTalk: <https://open.dingtalk.com/document/orgapp/receive-message>
- Modalità Stream di DingTalk: <https://open.dingtalk.com/document/development/stream>
- Creazione di un'applicazione agente intelligente DingTalk con un clic: <https://open.dingtalk.com/document/development/create-dingtalk-intelligent-agent-application>
- Bot personalizzato DingTalk: <https://open.dingtalk.com/document/orgapp/custom-robot-access>
- Connessione long-lived del bot intelligente WeCom: <https://developer.work.weixin.qq.com/document/path/101463>
- Risposta ai messaggi del bot intelligente WeCom: <https://developer.work.weixin.qq.com/document/path/101836>
- Bot di gruppo WeCom: <https://developer.work.weixin.qq.com/document/path/91770>

Accessi alle console delle piattaforme:

- Piattaforma aperta Feishu: <https://open.feishu.cn/app>
- Piattaforma aperta Lark: <https://open.larksuite.com/app>
- Piattaforma aperta DingTalk: <https://open.dingtalk.com/>
- Console di amministrazione WeCom: <https://work.weixin.qq.com/>

> I menu e i nomi dei permessi nelle console delle piattaforme possono cambiare con le versioni: facciano fede la documentazione ufficiale e la console effettiva.
