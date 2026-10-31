# Integratiehandleiding voor Feishu / Lark, DingTalk en WeCom

[简体中文](BOT_INTEGRATION.md) | [繁體中文](BOT_INTEGRATION.zh-TW.md) | [English](BOT_INTEGRATION.en.md) | [Deutsch](BOT_INTEGRATION.de.md) | [Français](BOT_INTEGRATION.fr.md) | [Italiano](BOT_INTEGRATION.it.md) | [日本語](BOT_INTEGRATION.ja.md) | [한국어](BOT_INTEGRATION.ko.md) | [조선어](BOT_INTEGRATION.ko-KP.md) | [Nederlands](BOT_INTEGRATION.nl.md) | [Русский](BOT_INTEGRATION.ru.md)

[← Terug naar de README](../README.nl.md)

In dit document wordt uitgelegd hoe u Feishu / Lark, DingTalk en WeCom op Steam Games Monitor aansluit. Het project heeft twee afzonderlijke mogelijkheden die elkaar niet vervangen; bepaal eerst uw doel:

| Doel                                                              | Aan platformzijde aan te maken                                                                                          | Ingang in het systeem   | Richting                          |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------- |
| Meldingen ontvangen over releases, acties, delistings enzovoort   | Aangepaste groepsbot / Webhook van een groepsbot                                                                        | **Notificatiekanalen**  | Eén richting: systeem → groep     |
| Commando's zoals `/add` en `/list` in de chat sturen              | Zelfgebouwde Feishu-/Lark-bedrijfsapp / DingTalk-bedrijfsbot (Outgoing) / WeCom-slimme robot (langdurige verbinding)     | **Commando-bots**       | Twee richtingen: platform → systeem → platform |

> De Webhook van een groepsbot kan meestal alleen berichten verzenden en geen commando's ontvangen. Zowel Feishu / Lark als DingTalk biedt eenmalig aanmaken via QR-code, met keuze uit HTTP-callback of langdurige verbinding; voor WeCom maakt u een slimme robot aan en gebruikt u de langdurige verbinding.
>
> Notificatiekanalen en commando-bots zijn twee onafhankelijke configuraties: voor hetzelfde platform kunt u alleen meldingen instellen, alleen commando's, of beide.

---

## 1. Algemene voorbereiding

### 1.1 Openbaar HTTPS en PUBLIC_BASE_URL (HTTP-callbackmodus)

Feishu / Lark / DingTalk met **HTTP-callback** vereisen dat het platform berichten actief naar uw server pusht; daarom moet aan het volgende zijn voldaan:

- De service is vanaf het openbare internet bereikbaar en gebruikt een door het platform geaccepteerd **HTTPS**-adres.
- `PUBLIC_BASE_URL` in `.env` komt overeen met het adres dat de browser daadwerkelijk gebruikt, bijvoorbeeld `https://steam.example.com`.
- Gebruik niet de standaardwaarde `http://localhost:8787`, anders kan het platform het door het systeem gegenereerde callbackadres niet bereiken.
- Gebruik bij voorkeur een eigen domein of subdomein. Het callbackpad is vast `/webhooks/...`; implementeer de service niet onder een subpad waarvoor extra herschrijving nodig is.

De callbackadressen die het systeem toont, worden volgens de volgende regels gegenereerd:

```text
Feishu / Lark  https://<domein van PUBLIC_BASE_URL>/webhooks/feishu/<slug>
DingTalk       https://<domein van PUBLIC_BASE_URL>/webhooks/dingtalk/<slug>
```

`<slug>` wordt bij het aanmaken van de bot willekeurig gegenereerd en verschilt per bot. Als u `PUBLIC_BASE_URL` wijzigt, veranderen de callbackadressen en moet u ze ook in het platformbeheer bijwerken.

> De **langdurige verbinding** van Feishu / Lark, de **Stream-modus** van DingTalk en de WeCom-slimme robot maken allemaal een uitgaande verbinding die door de server wordt opgezet; er is geen openbaar callbackadres, openbaar IP-adres, Token of EncodingAESKey nodig. Via QR-code aangemaakte Feishu-/Lark-apps en DingTalk-bots gebruiken standaard de langdurige verbinding.
>
> `PUBLIC_BASE_URL` moet echter wel in de browser van de eigenaar van de bot bereikbaar zijn: de webautorisatielink die niet-geautoriseerde gebruikers ontvangen, gebruikt dit adres.

### 1.2 Vereisten voor de reverse proxy

Nginx, Caddy, Traefik of een cloudloadbalancer moet aan het volgende voldoen (dit geldt alleen voor de HTTP-callbacks van Feishu / Lark / DingTalk):

- **Stuur de requestbody ongewijzigd door**, serialiseer de JSON niet opnieuw en comprimeer of wijzig de inhoud niet; de handtekeningen van Feishu / Lark en DingTalk zijn gebaseerd op de oorspronkelijke requestbody.
- Behoud de platformheaders: `X-Lark-Request-Timestamp`, `X-Lark-Request-Nonce` en `X-Lark-Signature` van Feishu, en `timestamp` en `sign` van DingTalk.
- Behoud de queryparameters en verlies de handtekeningsparameters niet.
- Voeg voor `/webhooks/*` geen login, Basic Auth, HTML-redirect of interactieve WAF-verificatie toe.
- Requestbody-limiet van ten minste 1 MB; lees-timeout van ten minste 10 seconden.
- Gebruik een vertrouwd TLS-certificaat; het platform valideert de certificaatketen.

De langdurige verbinding van Feishu / Lark, DingTalk Stream en de langdurige verbinding van WeCom lopen niet via de reverse proxy; de server hoeft alleen uitgaand toegang te hebben tot het betreffende platform (Lark gebruikt `open.larksuite.com`, DingTalk Stream gebruikt `api.dingtalk.com`).

### 1.3 Tijdsynchronisatie en sleutels

- Op de server moet NTP-tijdsynchronisatie actief zijn. De handtekening van Feishu / Lark staat een afwijking van ±300 seconden toe, de Outgoing-callback van DingTalk een afwijking van ±1 uur.
- `APP_SECRET` (minimaal 32 tekens) wordt gebruikt om kanaal- en botreferenties versleuteld op te slaan. **Wijzig of verlies deze niet zomaar**: na een wijziging kunnen opgeslagen App Secrets, bot-Secrets, Encrypt Keys enzovoort niet meer worden ontsleuteld en moet u ze opnieuw invullen.
- Botreferenties worden in SQLite opgeslagen met AES-256-GCM-versleuteling; de API en de pagina's tonen nooit platte tekst, en een leeg veld bij het bewerken betekent dat de bestaande waarde behouden blijft.

### 1.4 Aanbevolen aanmaakvolgorde

Feishu / Lark (QR-code, aanbevolen):

1. Klik in "Commando-bots" op "Feishu / Lark scannen", kies Feishu of Lark internationaal en scan de QR-code.
2. Maak de app aan op de platformpagina en bevestig; het systeem schrijft automatisch het App ID / App Secret en de `open_id` van de eigenaar weg en schakelt de langdurige verbinding in.
3. Zoek in Feishu / Lark op de applicatienaam om een directe chat te starten, of voeg de bot toe aan een groepschat.
4. Stuur `/help` om de commando- en antwoordketen te controleren.

Feishu / Lark (handmatig):

1. Maak in het systeem een bot aan en kies de versie (Feishu / Lark) en de wijze van gebeurtenisontvangst (HTTP-callback / langdurige verbinding).
2. HTTP-callback: kopieer het callbackadres naar het platformbeheer en configureer Encrypt Key / Verification Token; langdurige verbinding: kies in het platform "Gebeurtenissen ontvangen via langdurige verbinding".
3. Abonneer u op `im.message.receive_v1` en vraag machtigingen aan voor het lezen en verzenden van berichten.
4. Publiceer de app, voeg de bot aan een groep toe of stel het zichtbaarheidsbereik in.
5. Stuur `/help` om te controleren.

DingTalk (QR-code, aanbevolen):

1. Klik in "Commando-bots" op "DingTalk scannen om toe te voegen", scan met de DingTalk-app op uw telefoon en bevestig het aanmaken.
2. Het systeem schrijft automatisch het Client ID / Client Secret weg, gebruikt het Client ID als Robot Code en schakelt de Stream-langdurige verbinding in.
3. Zoek in DingTalk op de bot om een directe chat te starten, of voeg de bot aan een groepschat toe.
4. Stuur `/help` om te controleren.

DingTalk (handmatig):

1. Maak in het systeem een bot aan, kies de modus voor berichtontvangst en kopieer het callbackadres (HTTP-modus).
2. Maak in het platformbeheer een app / bot aan en vul het callbackadres en de sleutel in, of kies in de botconfiguratie de Stream-modus.
3. Bij het opslaan van de callback voert het platform meestal een URL-verificatie uit; zorg dat het systeem draait en de bot is ingeschakeld.
4. Publiceer de app in het platform, voeg de bot aan een groep toe of stel het zichtbaarheidsbereik in.
5. Stuur `/help` om de commando- en antwoordketen te controleren.

WeCom:

1. Maak in het WeCom-beheerportaal een slimme robot aan, kies API-modus → langdurige verbinding en noteer het Bot ID en Secret.
2. Maak in het systeem een "WeCom-slimme robot (langdurige verbinding)" aan en vul het Bot ID, Secret en de UserID van de eigenaar in.
3. Na opslaan zet het systeem automatisch de langdurige verbinding op; URL-verificatie op het platform is niet nodig.
4. Voeg de bot toe aan een groepschat of directe chat en stuur `/help` om te controleren.

---

## 2. Notificatiekanalen (eenrichtingspush)

Notificatiekanalen sturen monitorgebeurtenissen naar groepschats; er is geen openbaar callbackadres nodig, alleen de door het platform geleverde Webhook-URL.

### 2.1 Vergelijking van de drie groepsbots

| Platform | Systeemtype                    | Berichtformaat    | Handtekening                   | Beschrijving                                                                                     |
| -------- | ------------------------------ | ----------------- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| WeCom    | WeCom-groepsbot                | markdown          | geen                           | Ongeveer 4096 bytes per bericht, het systeem kapt af; een groepsbot kan alleen verzenden          |
| Feishu   | Feishu-bot (aangepaste bot)    | interactieve kaart | optionele handtekeningsleutel | Handtekeningvalidatie kan worden ingeschakeld; aanbevolen                                        |
| DingTalk | DingTalk-bot (aangepaste bot)  | markdown          | optionele ondertekeningssleutel | Ondertekening kan worden ingeschakeld; het systeem berekent de handtekening volgens de DingTalk-regels |

Ingang voor configuratie: links **Notificatiekanalen → Nieuw kanaal**. Vul de naam, de Webhook en eventueel de handtekeningsleutel in en vink de gebeurtenissen aan waarop u zich wilt abonneren.

> Gebeurtenismeldingen worden standaard via de Webhook van de groepsbot hier verzonden; ook een "Commando-bot" kan afzonderlijk gebeurtenismeldingen inschakelen. Beide zijn onafhankelijk en kunnen tegelijk worden gebruikt.

### 2.2 WeCom-groepsbot

1. Open de WeCom-groepschat → groepinstellingen → Groepsbots → Bot toevoegen.
2. Kopieer het Webhook-adres (meestal in de vorm `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...`).
3. Kies in het systeem bij "Notificatiekanalen" de optie **WeCom-groepsbot**, plak de Webhook en sla op.
4. Klik bij het kanaal op "Test verzenden" om te controleren of de groep het bericht ontvangt.

Let op:

- De Webhook zelf is een referentie; na een lek kan iedereen berichten naar de groep sturen. Verwijder de bot in dat geval uit de groep en voeg hem opnieuw toe.
- Een groepsbot kan geen commando's zoals `/add` ontvangen; gebruik voor commando's de "WeCom-slimme robot (langdurige verbinding)".
- Per bericht geldt een limiet van ongeveer 4096 bytes; het systeem kapt automatisch af, waardoor lange lijsten mogelijk onvolledig worden weergegeven.
- Groepsbots kennen frequentielimieten; bij het bereiken van de limiet probeert het systeem het automatisch opnieuw.

### 2.3 Aangepaste Feishu-bot

1. Open de Feishu-groep → groepinstellingen → Groepsbots → Bot toevoegen → Aangepaste bot.
2. Kopieer het Webhook-adres (meestal in de vorm `https://open.feishu.cn/open-apis/bot/v2/hook/...`).
3. Kies bij voorkeur in de beveiligingsinstellingen voor **handtekeningvalidatie** en kopieer de handtekeningsleutel.
4. Kies in het systeem bij "Notificatiekanalen" de optie **Feishu-bot**, plak de Webhook en vul bij ingeschakelde handtekening de handtekeningsleutel in.
5. Stuur na het opslaan een testbericht.

Handtekeningsregels (het systeem implementeert deze al; u hoeft niets handmatig te berekenen):

- De tijdstempel is in seconden.
- Gebruik `timestamp + "\n" + secret` als sleutel voor HMAC-SHA256, bereken de handtekening over een lege string en codeer het resultaat in Base64.
- De tijdstempel en handtekening worden samen met de berichtbody verzonden.

Als u "aangepaste trefwoorden" of een "IP-allowlist" gebruikt in plaats van een handtekening, controleer dan dat de meldingsinhoud de trefwoorden bevat, of voeg het uitgaande IP-adres van de server toe aan de allowlist.

### 2.4 Aangepaste DingTalk-bot

1. Open de DingTalk-groep → groepinstellingen → Slimme groepsassistent → Bot toevoegen → Aangepast.
2. Kopieer het Webhook-adres (meestal in de vorm `https://oapi.dingtalk.com/robot/send?access_token=...`).
3. Kies bij voorkeur in de beveiligingsinstellingen voor **ondertekening** en kopieer de ondertekeningssleutel.
4. Kies in het systeem bij "Notificatiekanalen" de optie **DingTalk-bot**, plak de Webhook en vul bij ingeschakelde ondertekening de ondertekeningssleutel in.
5. Stuur na het opslaan een testbericht.

Handtekeningsregels (het systeem implementeert deze al):

- De tijdstempel is in milliseconden.
- Gebruik `secret` als sleutel, bereken HMAC-SHA256 over `timestamp + "\n" + secret` en codeer het resultaat in Base64.
- `timestamp` en `sign` worden als URL-queryparameters verzonden.

Als u "aangepaste trefwoorden" of "IP-adresbereiken" gebruikt in plaats van ondertekening, pas dan de beveiligingsinstellingen dienovereenkomstig aan. Bij het bereiken van een frequentielimiet (zoals foutcode `90037`) probeert het systeem het automatisch opnieuw.

### 2.5 Gebeurtenisabonnementen en retries

Bij een notificatiekanaal kunt u de gebeurtenistypen aanvinken waarop u zich abonneert:

| Gebeurtenis          | Beschrijving                                                                     |
| -------------------- | -------------------------------------------------------------------------------- |
| `release`            | Officiële release van een game / DLC                                             |
| `release_date`       | Exacte releasedatum gevonden of releasedatum gewijzigd                           |
| `sale_start`         | De korting bereikt de ingestelde drempel                                         |
| `sale_change`        | Wijziging van de korting of prijs tijdens een actie                              |
| `sale_end`           | Einde van de korting, terug naar de oorspronkelijke prijs                        |
| `price_change`       | Wijziging van de oorspronkelijke prijs buiten een actie, of omslag naar gratis   |
| `delisting_warning`  | Een Steam-nieuwsbericht bevat een delisting-trefwoord (heuristisch, handmatige controle nodig) |
| `delisted`           | Twee keer achter elkaar bevestigd dat de winkel niet meer verkoopt               |
| `restored`           | Weer aankoopbaar                                                                 |
| `check_error`        | Controle mislukt                                                                 |

- **Als u geen enkele gebeurtenis aanvinkt**, ontvangt u standaard alle gebeurtenissen behalve `check_error`.
- Bij een mislukte verzending wordt na 30 seconden → 2 minuten → 10 minuten → 1 uur → 6 uur → 24 uur opnieuw geprobeerd, maximaal 6 keer.
- Elke kanaalkaart heeft een knop "Test verzenden" om de Webhook- en handtekeningconfiguratie te controleren.

---

## 3. Commando-bots (bidirectioneel)

Met commando-bots kunnen gebruikers hun monitoritems beheren via slash-commando's in een Feishu-/Lark-, DingTalk- of WeCom-chat. Feishu / Lark ondersteunt HTTP-callback of een WebSocket-langdurige verbinding, DingTalk ondersteunt HTTP-callback of een Stream-langdurige verbinding en WeCom gebruikt een WebSocket-langdurige verbinding; de resultaten worden via de platform-API of de langdurige verbinding in het oorspronkelijke gesprek beantwoord.

### 3.1 Algemeen gedrag

- **Werkingsbereik**: commando's werken altijd op de gegevens van het account waartoe de bot behoort. Ook wanneer een andere beheerder uit de allowlist de bot gebruikt, worden de monitoritems van de eigenaar van de bot gewijzigd.
- **Eigenaar-ID**: `ownerPlatformUserId` dient alleen ter identificatie van de scanner / eigenaar van de bot en verleent niet automatisch rechten voor commando's.
- **Allowlist**: alle platformgebruikers (inclusief de eigenaar-ID) moeten op de allowlist staan om commando's te kunnen uitvoeren. De rollen zijn:
  - `admin`: kan alle commando's gebruiken.
  - `viewer`: kan alleen `/help`, `/list`, `/price` en `/events` gebruiken.
  - Feishu-/Lark-, DingTalk- en WeCom-gebruikers die niet op de allowlist staan, ontvangen een eenmalige webautorisatielink en het oorspronkelijke commando wordt niet uitgevoerd; DingTalk ondersteunt deze link ook.
- **Gebeurtenismeldingen**: op de bewerkingspagina van de bot kunt u afzonderlijk "Gebeurtenismeldingen ontvangen" inschakelen om gebeurtenissen naar het gesprek te sturen dat het laatst door een geautoriseerde gebruiker is gebruikt. Dit staat los van "Notificatiekanalen" en kan tegelijk worden ingeschakeld. Zonder recent gesprek wordt niets verstuurd; zie paragraaf 3.5.
- **Berichtformaat**: momenteel worden alleen tekstberichten verwerkt. Afbeeldingen, bestanden, rich text en kaartberichten worden genegeerd.
- **Commandoformaat**: begint met `/` of de full-width `／`; ondersteunt `/add@bot`, argumenten tussen aanhalingstekens en `--flag=value`.
- **Deduplicatie**: wanneer het platform hetzelfde bericht meerdere keren aflevert, dedupliceert het systeem op platformgebeurtenis- / bericht-ID en verwerkt het bericht slechts één keer.
- **Rate limiting**: per platformgebruiker maximaal 10 commando's per minuut, per gesprek maximaal 30 en per bot maximaal 60; bij het bereiken van de limiet volgt maximaal één melding per minuut.
- **Asynchrone antwoorden**: de callbacks van Feishu / Lark / DingTalk retourneren eerst snel succes en DingTalk Stream- / WeCom-berichten worden via de langdurige verbinding ontvangen; commando's worden op de achtergrond uitgevoerd en het resultaat wordt via de platform-API of de langdurige verbinding teruggestuurd. Het platform kan het antwoord met enige vertraging tonen.
- **Keuze uit meerdere resultaten**: wanneer een zoekopdracht op naam bij `/add` of `/adddlc` meerdere treffers oplevert, retourneert de bot een genummerde lijst; antwoord met het nummer (10 minuten geldig) of stuur `/cancel` om te annuleren.
- **Quotum**: per account kunnen maximaal 3 bots worden aangemaakt; per platform mag slechts 1 bot actief zijn (Feishu en Lark internationaal delen het quotum van het platform "Feishu"). Bij Feishu-/Lark-/DingTalk-bots met HTTP-callback vervalt het callbackadres direct na uitschakeling (er wordt 404 geretourneerd); bij bots met langdurige verbinding / Stream wordt de verbinding na uitschakeling verbroken.

### 3.2 Feishu-/Lark-appbot (aanbevolen)

> #### Waarom aanbevolen
>
> Feishu/Lark heeft een persoonlijke versie, waarmee u werk en privé goed gescheiden kunt houden.



Voor Feishu / Lark moet u een **zelfgebouwde bedrijfsapp** aanmaken, de botmogelijkheid inschakelen en zich abonneren op berichtgebeurtenissen. De Webhook van een aangepaste groepsbot kan geen commando's ontvangen. Feishu (Chinese versie) gebruikt `open.feishu.cn` / `accounts.feishu.cn`, Lark internationaal gebruikt `open.larksuite.com` / `accounts.larksuite.com`; in het systeem maakt u het onderscheid via de "Versie" in de botconfiguratie.

#### Eenmalig aanmaken via QR-code (aanbevolen)

1. Klik in "Commando-bots" op **Feishu / Lark scannen** en kies in het dialoogvenster "Feishu" of "Lark internationaal".
2. Scan de QR-code met de bijbehorende client; de pagina vult de applicatienaam vooraf in en staat alleen het aanmaken van een nieuwe app toe.
3. Na bevestiging haalt het systeem automatisch het App ID / App Secret op, schrijft de `open_id` van de scanner weg als eigenaar en schakelt de langdurige verbinding in.
4. De QR-code is 10 minuten geldig; als er op hetzelfde platform al een actieve bot is of het quotum vol is, wordt de aanvraag geweigerd.
5. Zoek in Feishu / Lark op de applicatienaam om een directe chat te starten, of voeg de bot aan een groepschat toe en stuur `/help`.

> Bij aanmaken via QR-code wordt de officiële `PersonalAgent`-template van Feishu gebruikt, met vooraf ingestelde botmogelijkheden, berichtmachtigingen en de gebeurtenis `im.message.receive_v1`; gebeurtenissen worden via de langdurige verbinding ontvangen. Als uw organisatie het aanmaken via QR-code beperkt, kunt u de handmatige configuratie hieronder gebruiken.
>
> Als een Lark-tenant de Feishu-QR-code scant, schakelt het systeem automatisch over naar `accounts.larksuite.com` om de autorisatie te voltooien.

#### Handmatige configuratie

1. Open het [Feishu open platform](https://open.feishu.cn/app) of het [Lark open platform](https://open.larksuite.com/app) en maak een zelfgebouwde bedrijfsapp aan.
2. Schakel onder "Applicatiemogelijkheden toevoegen" de optie **Bot** in.
3. Vraag onder "Machtigingenbeheer" de berichtgerelateerde machtigingen aan:
   - `im:message.p2p_msg:readonly`: directe berichten lezen die gebruikers naar de bot sturen.
   - `im:message.group_at_msg:readonly`: berichten ontvangen waarin de bot in een groepschat wordt genoemd (@).
   - `im:message:send_as_bot`: berichten verzenden namens de app.
   - Als het beheer de machtigingen per scenario opsplitst, vraagt u ook de bijbehorende machtigingen aan voor het lezen van berichtinhoud en het verzenden van berichten.
4. Maak in het systeem een "Feishu-/Lark-appbot" aan en kies de versie en de wijze van gebeurtenisontvangst:
   - **Langdurige verbinding (aanbevolen)**: kies in het platform onder "Gebeurtenissen en callbacks" de optie "Gebeurtenissen ontvangen via langdurige verbinding" en abonneer u op `im.message.receive_v1`; er is geen callbackadres nodig.
   - **HTTP-callback**: vul het door het systeem getoonde `/webhooks/feishu/<slug>` in als aanvraagadres; vul voor versleuteling de Encrypt Key en Verification Token in.
5. Maak een versie aan en publiceer de app; zorg er onder "Beschikbaarheidsbereik van de app" voor dat de gebruikers toegang hebben.
6. Voeg de bot toe aan een groepschat of chat rechtstreeks met de bot.

#### Velden aan systeemzijde

| Veld                                  | Verplicht                                  | Beschrijving                                                                                             |
| ------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Naam                                  | Ja                                         | Alleen voor identificatie binnen het systeem                                                             |
| Versie                                | Ja                                         | Feishu (Chinese versie) of Lark (internationale versie)                                                  |
| Wijze van gebeurtenisontvangst        | Ja                                         | HTTP-callback / langdurige verbinding; bij aanmaken via QR-code standaard de langdurige verbinding       |
| App ID                                | Bij voorkeur verplicht                     | Nodig voor het verkrijgen van een `tenant_access_token`, voor antwoorden en voor het pushen van gebeurtenissen |
| App Secret                            | Bij voorkeur verplicht                     | Hoort bij het App ID                                                                                     |
| Encrypt Key                           | Bij HTTP-callback afhankelijk van het platform | Moet exact overeenkomen met het Feishu- / Lark-beheer; verplicht wanneer versleuteling is ingeschakeld   |
| Verification Token                    | Bij HTTP-callback aanbevolen               | Moet overeenkomen met het platform; dient ter verificatie van de herkomst van gebeurtenissen             |
| Platformgebruikers-ID van de eigenaar | Aanbevolen                                 | Vul de Feishu- / Lark-`open_id` in (begint meestal met `ou_`); bij aanmaken via QR-code automatisch ingevuld |
| API Base URL                          | Nee                                        | Alleen voor tests / proxy's; laat leeg in productie                                                       |

#### Callback, langdurige verbinding en handtekening

- **HTTP-callback**: wanneer het platform het abonnementsadres voor gebeurtenissen opslaat, stuurt het een `url_verification`-uitdaging en retourneert het systeem de `challenge`.
  - Als een Encrypt Key is geconfigureerd, valideert het systeem de headerhandtekening `SHA256(timestamp + nonce + encryptKey + rawBody)` met een toegestane afwijking van ±300 seconden en ontsleutelt het vervolgens de versleutelde inhoud.
  - Als een Verification Token is geconfigureerd, valideert het systeem het token in de gebeurtenis; bij een mismatch wordt 401 geretourneerd.
- **Langdurige verbinding**: de server maakt met het App ID / App Secret actief verbinding met het eindpunt voor de langdurige verbinding van Feishu / Lark; gebeurtenissen worden via de geauthenticeerde verbinding gepusht, zonder handtekeningvalidatie, openbaar adres of reverse proxy. De verbindingsstatus wordt op de botkaart weergegeven.
- Alleen tekstberichten in `im.message.receive_v1` worden verwerkt; berichten die de app zelf verzendt, worden genegeerd.
- Voor antwoorden wordt eerst de interface "Bericht beantwoorden" gebruikt; bij een fout wordt teruggevallen op het verzenden van een bericht naar de `chat_id`.
- In groepschats moet u de **bot vermelden (@)** voordat u een commando invoert; in een directe chat kunt u het direct sturen.

#### Eigenaar-ID en allowlist

- In Feishu- / Lark-gebeurtenissen wordt voor de gebruikersidentiteit bij voorkeur de `open_id` gebruikt; vul daarom de `open_id` in de allowlist in en niet het telefoonnummer, e-mailadres of de naam.
- Bij aanmaken via QR-code wordt de `open_id` van de scanner in "Eigenaar-ID" vastgelegd, maar deze dient alleen ter identificatie en verleent niet automatisch rechten voor commando's; bij het eerste gebruik moet u uw eigen platformaccount nog via webautorisatie goedkeuren.
- Bij handmatige configuratie kunt u de gebeurtenisdebugging / callbacklogboeken bekijken, of een gebruiker eerst een bericht laten sturen en daarna de gebeurtenisdetails in het platform bekijken.

### 3.3 DingTalk-bot (HTTP-callback / Stream)

Voor DingTalk moet u een **bedrijfsinterne bot** aanmaken; als modus voor berichtontvangst kiest u **Stream-langdurige verbinding** (aanbevolen) of **HTTP-callback / Outgoing**. De Webhook van een aangepaste DingTalk-groepsbot kan geen commando's ontvangen.

#### Toevoegen via QR-code (aanbevolen)

1. Klik op de pagina "Commando-bots" op **DingTalk scannen om toe te voegen**.
2. Scan met de DingTalk-app op uw telefoon, kies een organisatie, vul volgens de aanwijzingen op de pagina de botgegevens in en bevestig het aanmaken.
3. Het systeem haalt automatisch het Client ID / Client Secret op, gebruikt het Client ID als Robot Code en schakelt de Stream-langdurige verbinding in; de QR-code is 10 minuten geldig.
4. Na succesvol aanmaken kunt u in DingTalk op de bot zoeken om een directe chat te starten of de bot aan een groepschat toevoegen; de `staffId` van de scanner dient alleen ter identificatie en gebruikers moeten nog steeds webautorisatie doorlopen of aan de allowlist worden toegevoegd.

> Als er op hetzelfde platform al een actieve bot is of het botquotum vol is, wordt de scan geweigerd; verwijder of schakel eerst de oude bot op de pagina uit.
>
> Voor het scannen wordt de officiële appregistratiepagina van DingTalk gebruikt. Als uw organisatie het aanmaken via QR-code beperkt of de registratiepagina een fout teruggeeft, kunt u nog steeds de handmatige configuratie hieronder gebruiken.

#### Handmatige configuratie

1. Open het [DingTalk open platform](https://open.dingtalk.com/) en maak een bedrijfsinterne app aan.
2. Voeg onder "Applicatiemogelijkheden toevoegen" **Bot** toe.
3. Kies de modus voor berichtontvangst:
   - **Stream-modus (aanbevolen)**: kies in de botconfiguratie de Stream-modus en publiceer; er is geen openbaar callbackadres nodig.
   - **HTTP-callback / Outgoing**: vul het door het systeem getoonde adres `/webhooks/dingtalk/<slug>` in en vul het App Secret in voor de handtekeningvalidatie.
4. Maak in het systeem een "DingTalk-bot" aan, vul het Client ID (App Key) en Client Secret (App Secret) in en kies dezelfde ontvangstmodus.
5. Als u gebeurtenismeldingen wilt pushen, vult u de Robot Code in (meestal gelijk aan het Client ID) en controleert u of de app rechten heeft om als bot actief berichten te verzenden.
6. Publiceer de app, voeg de bot toe aan een groepschat en stuur `/help`.

#### Velden aan systeemzijde

| Veld                                  | Verplicht                                        | Beschrijving                                                                                    |
| ------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Naam                                  | Ja                                               | Alleen voor identificatie binnen het systeem                                                    |
| Modus voor berichtontvangst           | Ja                                               | HTTP-callback / Stream-langdurige verbinding; bij aanmaken via QR-code standaard Stream        |
| App Key (Client ID)                   | Verplicht bij Stream                             | Client ID van de DingTalk-app; ook nodig voor gebeurtenismeldingen                              |
| App Secret (Client Secret)            | Verplicht bij Stream / voor HTTP-handtekening    | Referentie voor het opzetten van de Stream-verbinding; bij HTTP-callback gebruikt voor het valideren van de callbackhandtekening |
| Robot Code                            | Aanbevolen voor gebeurtenismeldingen             | Botcode; meestal gelijk aan het Client ID                                                       |
| Platformgebruikers-ID van de eigenaar | Aanbevolen                                       | Vul de DingTalk-`staffId` in                                                                    |
| API Base URL                          | Nee                                              | Alleen voor tests / proxy's; laat leeg in productie                                              |

#### Berichtontvangst en antwoorden

- **Stream-modus**: de server verbindt met het Client ID / Secret actief met de DingTalk Stream-gateway; een openbaar IP-adres, domein of callbackadres is niet nodig. Botberichten worden via de langdurige verbinding gepusht; het systeem bevestigt (ACK) onmiddellijk en voert het commando daarna asynchroon uit.
- **HTTP-callback**: de callbackheaders van DingTalk bevatten `timestamp` (milliseconden) en `sign`; het systeem gebruikt het App Secret als sleutel, berekent HMAC-SHA256 over `timestamp + "\n" + App Secret` en staat een afwijking van ±1 uur toe.
- Beide modi verwerken alleen tekstberichten met `msgtype = text`.
- Voor de gebruikers-ID wordt eerst `senderStaffId` gebruikt en daarna `senderId`; vul voor de eigenaar-ID en de allowlist de `staffId` in.
- Antwoorden worden verzonden via de `sessionWebhook` uit de berichtbody, als markdown en met vermelding (@) van de afzender van het commando; deze Webhook is meestal ongeveer 1,5 uur geldig. Stuur na het verlopen gewoon opnieuw een commando.
- Het systeem dedupliceert op de DingTalk-`msgId`; in de Stream-modus wordt de push daarnaast onmiddellijk bevestigd om dubbele aflevering door het platform te voorkomen.

#### Eigenaar-ID en allowlist

- Gebruik de `senderStaffId` uit de callbackgebeurtenis (en daarna `senderId`); u kunt deze bekijken in het gebeurtenisdebuglogboek van het open platform of controleren in de details van het adresboeklid.
- De "Eigenaar-ID" dient alleen ter identificatie en verleent niet automatisch rechten voor commando's; alle DingTalk-gebruikers moeten webautorisatie doorlopen of aan de allowlist worden toegevoegd.
- Bij aanmaken via QR-code wordt niet altijd de `staffId` van de scanner teruggegeven; u kunt deze handmatig aanvullen. Laat bij het eerste gebruik het account waartoe de bot behoort via de webpagina goedkeuren.

### 3.4 WeCom-slimme robot (langdurige verbinding)

Voor WeCom moet u een **slimme robot** aanmaken en **API-modus → langdurige verbinding** kiezen. De Webhook van een WeCom-groepsbot kan alleen verzenden en geen commando's ontvangen.

> Upgraden: de callback van de oude zelfgebouwde WeCom-apps (Token / EncodingAESKey / CorpID / AgentID) wordt niet meer gebruikt voor commando-bots. Bestaande bots moet u in "Commando-bots" omzetten naar het Bot ID / Secret van de slimme robot en opslaan.

#### Toevoegen via QR-code (aanbevolen)

1. Klik op de pagina "Commando-bots" op **WeCom scannen om toe te voegen**.
2. Scan met een WeCom-account dat rechten heeft om slimme robots aan te maken, maak de bot aan en autoriseer deze volgens de aanwijzingen op de pagina.
3. Het systeem haalt automatisch het Bot ID / Secret op, maakt de bot aan en zet de langdurige verbinding op; de QR-code is 5 minuten geldig.
4. Laat na het aanmaken een lid een commando sturen en laat het account waartoe de bot behoort dit via de webpagina goedkeuren; de UserID van de eigenaar dient alleen ter identificatie en verleent niet automatisch rechten.

> Als er op hetzelfde platform al een actieve bot is of het botquotum vol is, wordt de scan geweigerd; verwijder of schakel eerst de oude bot op de pagina uit.
>
> Voor het scannen wordt de officiële autorisatiepagina van WeCom gebruikt. Als het account geen rechten heeft om slimme robots aan te maken, of als WeCom de paginastroom heeft gewijzigd, kunt u nog steeds de handmatige configuratie hieronder gebruiken.

#### Handmatige configuratie

1. Open het [WeCom-beheerportaal](https://work.weixin.qq.com/) of de werkbank in de WeCom-client en ga naar "Slimme robot" → Robot aanmaken.
2. Kies in het aanmaakproces "Aanmaken in API-modus" → "Langdurige verbinding gebruiken".
3. Haal het **Bot ID** en **Secret** op en bewaar ze. Het Secret wordt meestal maar één keer getoond; na verlies kunt u het opnieuw genereren.
4. Maak in het systeem een "WeCom-slimme robot (langdurige verbinding)" aan en vul het Bot ID, Secret en de UserID van de eigenaar in.
5. Voeg de bot toe aan een groepschat of directe chat; stuur in een groepschat **@bot** gevolgd door `/help`.
6. U hoeft geen callbackadres, Token, EncodingAESKey of CorpID in te vullen; de service verbindt actief met `wss://openws.work.weixin.qq.com`.

#### Velden aan systeemzijde

| Veld                                  | Verplicht  | Beschrijving                                                                                              |
| ------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| Naam                                  | Ja         | Alleen voor identificatie binnen het systeem                                                              |
| Bot ID                                | Ja         | Unieke identificatie van de slimme robot                                                                  |
| Secret                                | Ja         | Secret uitsluitend voor de langdurige verbinding, gebruikt voor `aibot_subscribe`-authenticatie           |
| Platformgebruikers-ID van de eigenaar | Aanbevolen | UserID van het lid in het WeCom-adresboek; de `from.userid` in de daadwerkelijke callback van de bot is bepalend |

#### Werking van de langdurige verbinding

- De server verbindt actief met `wss://openws.work.weixin.qq.com`; dit werkt ook bij een intranetdeployment en vereist geen vast openbaar IP-adres.
- Na het opzetten van de verbinding wordt `aibot_subscribe` verzonden en wordt de identiteit met Bot ID + Secret gevalideerd; daarna wordt elke 30 seconden een `ping`-heartbeat verzonden.
- Gebruikersberichten worden via `aibot_msg_callback` als platte tekst gepusht en hoeven niet te worden ontsleuteld; het systeem verwerkt alleen `msgtype = text`.
- Antwoorden worden via `aibot_respond_msg` met de `req_id` uit de callback als markdown verzonden; antwoorden met dezelfde `req_id` worden serieel verzonden.
- Per slimme robot is op elk moment slechts één geldige langdurige verbinding toegestaan; een nieuwe verbinding verbreekt de oude en bij een deployment met meerdere instanties onderbreken ze elkaar.
- Na een verbindingsbreuk wordt de verbinding met exponentiële backoff hersteld; bij herhaalde authenticatiefouten of wanneer de verbinding door een nieuwe instantie wordt vervangen, toont de botkaart een fout in de langdurige verbinding.
- Bij groepschatberichten wordt de voorafgaande `@bot` verwijderd voordat het bericht als slash-commando wordt geïnterpreteerd.
- Er kan binnen 24 uur na de berichtcallback worden geantwoord; het systeem voert commando's uit in een achtergrondwachtrij en langere commando's duren meestal enkele seconden.
- Na het inschakelen van gebeurtenismeldingen voor de bot pusht het systeem via dezelfde langdurige verbinding met `aibot_send_msg` actief naar het meest recente gesprek; de gebruiker moet eerst een bericht naar de bot hebben gestuurd.

#### Eigenaar-ID en allowlist

- Vul de **UserID** uit het WeCom-adresboek in (het ledenaccount), niet de naam, het telefoonnummer of de ID van een externe contactpersoon.
- Als de maker van de bot geen superbeheerder van de organisatie is, kan `from.userid` een versleutelde userid onder de organisatie zijn; gebruik de waarde uit de daadwerkelijke callbackgebeurtenis voor de eigenaar en de allowlist.

#### Niet-geautoriseerd en webautorisatie

- Wanneer een WeCom-gebruiker niet op de allowlist staat, antwoordt de bot met een eenmalige webautorisatielink (`PUBLIC_BASE_URL/authorize/<token>`), die 30 minuten geldig is.
- De eigenaar van de bot logt met het eigen webaccount in op de linkpagina, controleert de platformgebruikers-ID (en indien beschikbaar de bijnaam en het gesprek), kiest `viewer` of `admin` en keurt goed of wijst af.
- Iemand anders dan de eigenaar van de bot kan na inloggen alleen de aanvraag bekijken en niet zelf goedkeuren; stuur de link door naar de eigenaar van de bot.
- Een autorisatielink vervalt nadat deze één keer is verwerkt; andere openstaande links van dezelfde gebruiker worden synchroon bijgewerkt. Laat de gebruiker na het verlopen een willekeurig commando opnieuw sturen om een nieuwe link te genereren.
- Alle gebruikers (inclusief de scanner zelf) moeten via webautorisatie of de allowlist rechten krijgen; als u zelf alle commandorechten wilt hebben, kiest u bij het goedkeuren `admin`.
- `PUBLIC_BASE_URL` moet vanuit de browser bereikbaar zijn; als de link niet opent, controleert u de reverse proxy en deze omgevingsvariabele.

#### Verbindingsstatus

De botkaart toont de status van de langdurige verbinding:

- **Langdurige verbinding wordt opgezet**: de verbinding wordt opgezet of automatisch hersteld.
- **Langdurige verbinding verbonden**: de authenticatie is geslaagd en commando's kunnen worden ontvangen.
- **Fout in langdurige verbinding**: onjuiste referenties, Bot ID / Secret niet ingevuld, netwerk onbereikbaar, authenticatie mislukt of de verbinding is door een andere instantie vervangen.
- **Langdurige verbinding niet ingeschakeld**: de bot is uitgeschakeld.

Als de status aanhoudend fout is, controleer dan het Bot ID / Secret, of de uitgaande firewall van de server `wss://openws.work.weixin.qq.com:443` toestaat en of een andere instantie hetzelfde Bot ID gebruikt.

### 3.5 Gebeurtenismeldingen van bots

Als u op de bewerkingspagina van "Commando-bots" **Gebeurtenismeldingen ontvangen** aanvinkt, ontvangt de bot daarnaast gebeurtenissen zoals releases, acties en delistings. Dit staat los van de notificatiekanalen en kan tegelijk worden ingeschakeld.

- **Meldingsdoel**: het gesprek dat het laatst door een lid van de allowlist is gebruikt. Het systeem werkt dit doel alleen bij nadat een geautoriseerde gebruiker met succes een commando heeft verzonden; niet-geautoriseerde gebruikers wijzigen het meldingsdoel niet.
- **Voorwaarde**: de bot moet eerst minstens één commando van een geautoriseerde gebruiker hebben ontvangen, anders worden er geen gebeurtenissen afgeleverd. De botkaart meldt "nog geen recent gesprek vastgelegd".
- **Bereik van gebeurtenissen**: alle gebeurtenissen worden ontvangen, inclusief controlefouten; het is niet mogelijk om per bot gebeurtenistypen te filteren.
- **Groepsbots van notificatiekanalen verzenden nog steeds volgens de eigen selectie van gebeurtenissen in dat kanaal; beide beïnvloeden elkaar niet.**

Aanvullende vereisten per platform:

- **Feishu / Lark**: een App ID / App Secret is nodig, plus de machtiging om namens de app berichten naar een gesprek te sturen. Gebeurtenissen worden naar de `chat_id` van het meest recente gesprek gestuurd; zowel HTTP-callback als de langdurige verbinding is mogelijk.
- **DingTalk**: App Key, App Secret en Robot Code zijn nodig, plus de machtiging voor de bot om actief berichten te verzenden. Groepschats gebruiken de `openConversationId`, directe chats de `staffId` van de afzender.
- **WeCom**: gebruikt de langdurige verbinding met `aibot_send_msg` om naar het meest recente gesprek te pushen; directe chat `chat_type=1`, groepschat `chat_type=2`. De gebruiker moet eerst een gesprek met de bot hebben gehad.

> Als de bot wordt uitgeschakeld, de schakelaar voor gebeurtenismeldingen wordt uitgezet, het recente gesprek wordt verwijderd of de bot uit de groepschat wordt verwijderd, wordt de aflevering geannuleerd of mislukt; laat een geautoriseerde gebruiker opnieuw een commando sturen om het doelgesprek te vernieuwen.

---

## 4. Commando-overzicht

```text
/help
/add <appid | winkel-URL | naam> [--discount N] [--note tekst] [--force]
/adddlc <basisgame appid | link | naam> [--max 50]
/remove <id | appid | naam>
/pause <id | appid | naam>
/resume <id | appid | naam>
/check <id | appid | naam>
/price <id | appid | naam>
/list [--all] [--sale] [--paused] [--page N]
/events [--item id] [--limit 10]
/cancel
```

Toelichting:

- `/add` kan rechtstreeks in de Steam-winkel zoeken; als een zoekopdracht op naam meerdere resultaten oplevert, antwoordt u met het nummer van uw keuze.
- `--discount N` stelt de drempel voor kortingsmeldingen in (0–100); laat u deze weg, dan wordt de standaardwaarde van het account gebruikt.
- `--force` is bedoeld voor gevallen waarin het item in de huidige regio niet beschikbaar is, maar u het toch wilt toevoegen om alleen nieuwswaarschuwingen te ontvangen.
- `/adddlc` importeert alle DLC van een basisgame, maximaal 50 per keer.
- `/check` slaat de cache over, controleert direct en schrijft gebeurtenissen weg; dit is onderhevig aan de rate limits van Steam.
- `/list` toont standaard geen gepauzeerde items; `--all` toont alles, `--sale` alleen acties en `--paused` alleen gepauzeerde items.
- `/events` toont standaard de laatste 10 gebeurtenissen, maximaal 20.
- De viewer-rol is beperkt tot `/help`, `/list`, `/price` en `/events`.

---

## 5. Probleemoplossing

| Symptoom                                                        | Mogelijke oorzaak                                                                                                                         | Oplossing                                                                                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feishu / Lark / DingTalk kan het callbackadres niet opslaan      | De service is niet openbaar bereikbaar, het certificaat is ongeldig of `PUBLIC_BASE_URL` is fout                                          | Open het callbackdomein via mobiele data; controleer of de HTTPS-certificaatketen compleet is; controleer of de bot is aangemaakt en ingeschakeld                 |
| Feishu / Lark / DingTalk-callback retourneert 404                | De bot is uitgeschakeld of verwijderd, of de `<slug>` is fout                                                                             | Kopieer het nieuwste callbackadres op de pagina "Commando-bots"; schakel de bot in                                                                              |
| Feishu / Lark meldt een mislukte uitdaging / 401                 | Verification Token of Encrypt Key komt niet overeen; de proxy heeft de requestbody herschreven                                            | Vergelijk beide zijden opnieuw; schakel compressie / herschrijving van de requestbody uit; behoud de headers `X-Lark-*`                                          |
| Feishu / Lark reageert niet nadat versleuteling is ingeschakeld  | Op het platform is een Encrypt Key ingesteld die niet in het systeem is ingevuld, waardoor de versleutelde inhoud niet kan worden geparseerd; ook kan de validatie van Verification Token direct 401 opleveren | Vul dezelfde Encrypt Key en Verification Token in het systeem in, of schakel de versleuteling op het platform uit en sla opnieuw op                      |
| Feishu / Lark ontvangt berichten maar kan niet antwoorden        | App ID / App Secret ontbreekt of de machtiging voor het verzenden van berichten ontbreekt                                                 | Vul de referenties aan; vraag op het open platform de machtiging voor berichtverzending aan en publiceer deze                                                    |
| De langdurige verbinding van Feishu / Lark blijft "wordt opgezet" / fout tonen | Onjuist App ID / App Secret; voor de app is "Gebeurtenissen ontvangen via langdurige verbinding" niet ingeschakeld; de organisatie beperkt aanmaken via QR-code | Controleer de referenties; schakel bij gebeurtenissen en callbacks over op de langdurige verbinding en publiceer een versie; of gebruik HTTP-callback              |
| Na het scannen is de Feishu- / Lark-bot niet vindbaar            | De app is niet gepubliceerd of het beschikbaarheidsbereik bevat het lid niet                                                              | Maak op het open platform een versie aan en publiceer deze, pas het bereik aan; zoek op de applicatienaam                                                       |
| Na het scannen van de Feishu-QR-code is een Lark-app aangemaakt  | Het scannende account hoort bij een Lark-tenant en het systeem heeft automatisch het autorisatiedomein gewisseld                            | Dit is normaal gedrag; zoek in Lark op de applicatienaam                                                                                                        |
| DingTalk-callback 401                                            | Onjuist App Secret; headers zijn door de proxy verwijderd; de servertijd wijkt meer dan 1 uur af                                           | Controleer het App Secret van de app (niet de ondertekeningssleutel); behoud `timestamp` en `sign`; synchroniseer NTP                                             |
| DingTalk-antwoord verloopt / mislukt                             | De `sessionWebhook` is verlopen                                                                                                            | Stuur het commando opnieuw; zorg dat de callback binnen enkele seconden is afgerond                                                                             |
| DingTalk Stream blijft niet verbonden / toont een fout           | Onjuist Client ID / Secret; voor de bot is de Stream-modus niet gekozen; de app is niet gepubliceerd; de server heeft geen uitgaande toegang tot `api.dingtalk.com` | Controleer de referenties; kies de Stream-modus in de botconfiguratie en publiceer een versie; controleer het uitgaande netwerk                                   |
| DingTalk-scan meldt dat de autorisatie is mislukt                | Het scannende account heeft geen ontwikkelaarsrechten; de QR-code is verlopen; de gekozen organisatie staat geen apps toe; de template van de autorisatiepagina kan niet worden geladen | Controleer of het account ontwikkelaarsrechten heeft in de doelorganisatie; genereer een nieuwe QR-code; gebruik een organisatie met de juiste rechten; bekijk bij aanhoudende fouten de oorzaak "DingTalk-scanautorisatie mislukt" in de servicelogboeken |
| De DingTalk-bot antwoordt niet na het scannen                    | De app is niet gepubliceerd of het beschikbaarheidsbereik bevat het lid niet; de bot is niet aan het gesprek toegevoegd; de Stream-verbinding is niet opgezet | Publiceer de app en pas het bereik aan; bekijk de verbindingsstatus op de botkaart; stuur het commando opnieuw                                                     |
| DingTalk- / Feishu-gebruiker krijgt de melding dat hij niet geautoriseerd is | De platformgebruiker staat niet op de allowlist en is nog niet via webautorisatie goedgekeurd                                             | Laat de gebruiker een willekeurig commando sturen om een autorisatielink te krijgen en laat het account waartoe de bot behoort, via de webpagina goedkeuren, of voeg de gebruiker rechtstreeks aan de allowlist toe |
| De langdurige verbinding van WeCom is niet verbonden / toont een fout | Onjuist Bot ID of Secret; de server heeft geen uitgaande toegang tot `openws.work.weixin.qq.com:443`; een andere instantie gebruikt dezelfde bot; de bot is uitgeschakeld | Controleer het Bot ID / Secret; controleer de uitgaande firewall en proxy; bevestig dat er geen dubbele deployment is; bekijk de status en foutinformatie op de botkaart |
| Geen antwoord op WeCom-berichten                                 | De langdurige verbinding is verbroken; het bericht valt buiten het antwoordvenster van 24 uur; de bot is tijdens de verwerking uitgeschakeld of verwijderd | Controleer de status van de langdurige verbinding; stuur het commando opnieuw; controleer of de bot ingeschakeld blijft                                 |
| WeCom meldt dat de verbinding is vervangen                       | Er is een nieuwe verbinding met hetzelfde Bot ID opgezet en WeCom heeft de oude verbinding verbroken                                      | Houd per bot slechts één actieve instantie aan; stop de dubbel gedeployde services of schakel de bot in het systeem uit en weer in                               |
| Commando's krijgen geen reactie                                  | De bot is in de groepschat niet vermeld (@); het bericht is geen tekst; het bericht begint niet met `/`; de gebruiker staat niet op de allowlist | Vermeld de @bot in de groep; stuur `/help`; voeg de platformgebruikers-ID toe aan de allowlist                                                                   |
| De scanner zelf heeft ook geen rechten voor commando's           | De eigenaar-ID dient alleen ter identificatie en verleent niet langer impliciet rechten                                                    | Keur uw eigen platformaccount goed op de webautorisatiepagina, of laat het account waartoe de bot behoort uw platform-ID aan de allowlist toevoegen              |
| Conflict bij het aanmaken van een bot                            | Op hetzelfde platform is al een actieve bot                                                                                                | Schakel eerst de oude bot uit en daarna de nieuwe in                                                                                                            |
| Test van het notificatiekanaal mislukt                           | De Webhook is ongeldig, de handtekeningsleutel is fout, of de beperkingen voor trefwoorden / IP-allowlist gelden                          | Kopieer de Webhook opnieuw; controleer de handtekeningsleutel; controleer de beveiligingsinstellingen van het platform                                          |
| Er komen geen gebeurtenismeldingen in de groep                   | Het kanaal is uitgeschakeld, er zijn geen gebeurtenistypen aangevinkt, of de groepsbot is verwijderd                                     | Controleer de kanaalstatus en het abonnement; stuur opnieuw een testbericht                                                                                     |
| De bot pusht geen gebeurtenismeldingen                           | "Gebeurtenismeldingen ontvangen" is niet ingeschakeld; er is geen recent geautoriseerd gesprek; bij DingTalk ontbreekt App Key / Robot Code; de bot is uitgeschakeld | Bewerk de bot en schakel meldingen in; laat een geautoriseerde gebruiker eerst een commando sturen; vul de DingTalk-referenties aan; controleer de afleveringsrecords |
| Feishu / Lark / DingTalk pusht hetzelfde bericht meerdere keren  | Het platform heeft niet tijdig een ACK ontvangen of er was netwerkschommeling                                                             | Het systeem dedupliceert op bericht-ID; zorg dat de callback binnen 10 seconden retourneert                                                                     |

### Tips voor foutopsporing

1. Gebruik eerst **Commando simuleren** op de kaart van "Commando-bots" en voer het lokaal uit als eigenaar van de bot om de commandologica en het quotum te controleren.
2. Gebruik daarna **Test verzenden** bij "Notificatiekanalen" om de Webhook en de handtekening te controleren.
3. Stuur ten slotte `/help` in de chat van het platform om de callback / langdurige verbinding, de machtigingen en de antwoordketen te controleren.
4. Bekijk de containerlogboeken: `docker compose logs -f steam-monitor`, en let op logregels met `wecom`, `webhook`, `inbound` en `delivery`.

---

## 6. Veiligheidsadviezen

- Beschouw de callbackadressen van Feishu / Lark / DingTalk, de Webhooks van groepsbots en het WeCom Bot ID / Secret als referenties; commit ze niet in een openbare repository en deel ze niet in openbare groepen.
- Schakel voor de HTTP-callbacks van Feishu / Lark bij voorkeur Encrypt Key + Verification Token in; de referenties van de langdurige verbinding moeten net zo goed geheim blijven. Bij de HTTP-callback van DingTalk moet u het App Secret invullen voor de handtekeningvalidatie en ook in de Stream-modus moet het Client Secret worden beschermd; bescherm bij WeCom altijd het Bot ID en het Secret van de langdurige verbinding.
- Pas het principe van minimale rechten toe op de allowlist: gewone leden gebruiken `viewer`, alleen beheerders gebruiken `admin`.
- Stel het SQLite-bestand niet bloot aan het openbare internet; maak regelmatig een back-up van de database en tegelijk van `APP_SECRET` in `.env`.
- Werk na het wijzigen van `PUBLIC_BASE_URL` of een domeinwissel tijdig de callbackadressen in het Feishu- / Lark- / DingTalk-beheer bij; de langdurige verbinding wordt hierdoor niet beïnvloed.
- Bij vermoeden van een lek: reset bij Feishu / Lark het App Secret / de Encrypt Key, reset bij DingTalk het Client Secret, genereer bij WeCom het Secret van de slimme robot opnieuw en vul de nieuwe waarden in het systeem in.

---

## 7. Officiële documentatie

- Feishu: gebeurtenisabonnementen en configuratie van het aanvraagadres: <https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case>
- Feishu: een app met één klik aanmaken: <https://open.feishu.cn/document/mcp_open_tools/scan-to-create-an-app-in-one-click>
- Feishu: aangepaste bot: <https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot>
- Lark: gebeurtenisabonnementen en configuratie van het aanvraagadres: <https://open.larksuite.com/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case>
- Lark: een app met één klik aanmaken: <https://open.larksuite.com/document/mcp_open_tools/scan-to-create-an-app-in-one-click>
- DingTalk: berichten ontvangen met een bot: <https://open.dingtalk.com/document/orgapp/receive-message>
- DingTalk: Stream-modus: <https://open.dingtalk.com/document/development/stream>
- DingTalk: een agent-app met één klik aanmaken: <https://open.dingtalk.com/document/development/create-dingtalk-intelligent-agent-application>
- DingTalk: aangepaste bot: <https://open.dingtalk.com/document/orgapp/custom-robot-access>
- WeCom: langdurige verbinding van de slimme robot: <https://developer.work.weixin.qq.com/document/path/101463>
- WeCom: antwoorden met de slimme robot: <https://developer.work.weixin.qq.com/document/path/101836>
- WeCom: groepsbot: <https://developer.work.weixin.qq.com/document/path/91770>

Ingangen van de platformbeheeromgevingen:

- Feishu open platform: <https://open.feishu.cn/app>
- Lark open platform: <https://open.larksuite.com/app>
- DingTalk open platform: <https://open.dingtalk.com/>
- WeCom-beheerportaal: <https://work.weixin.qq.com/>

> Menu's en machtigingsnamen in de platformbeheeromgevingen kunnen per versie wijzigen; de officiële documentatie en de werkelijke console zijn bepalend.
