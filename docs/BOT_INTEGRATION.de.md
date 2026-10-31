# Integrationsleitfaden für Feishu / Lark, DingTalk und WeCom

[简体中文](BOT_INTEGRATION.md) | [繁體中文](BOT_INTEGRATION.zh-TW.md) | [English](BOT_INTEGRATION.en.md) | [Deutsch](BOT_INTEGRATION.de.md) | [Français](BOT_INTEGRATION.fr.md) | [Italiano](BOT_INTEGRATION.it.md) | [日本語](BOT_INTEGRATION.ja.md) | [한국어](BOT_INTEGRATION.ko.md) | [조선어](BOT_INTEGRATION.ko-KP.md) | [Nederlands](BOT_INTEGRATION.nl.md) | [Русский](BOT_INTEGRATION.ru.md)

[Zurück zur README](../README.de.md)

Dieses Dokument beschreibt, wie Sie Feishu / Lark, DingTalk und WeCom an Steam Games Monitor anbinden. Das Projekt bietet zwei Funktionen, die sich nicht gegenseitig ersetzen; klären Sie daher zunächst Ihr Ziel:

| Ziel | Auf der Plattform zu erstellen | Systemeinstieg | Richtung |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | -------------- | ------------------------ |
| Ereignisbenachrichtigungen zu Veröffentlichung, Rabattaktion, Delisting usw. empfangen | Benutzerdefinierter Gruppen-Bot / Gruppen-Bot-Webhook | **Benachrichtigungskanäle** | Einseitig: System → Gruppe |
| Befehle wie `/add`, `/list` im Chat senden | Feishu-/Lark-Unternehmens-App / DingTalk-Betriebsinterner Bot (Outgoing) / WeCom-KI-Bot (Langzeitverbindung) | **Befehls-Bots** | Bidirektional: Plattform → System → Plattform |

> Gruppen-Bot-Webhooks können in der Regel nur Nachrichten senden und keine Befehle empfangen. Sowohl bei Feishu / Lark als auch bei DingTalk können Sie eine App per QR-Code in einem Schritt erstellen und dabei HTTP-Rückruf oder Langzeitverbindung wählen; bei WeCom müssen Sie einen KI-Bot erstellen und die Langzeitverbindung verwenden.
>
> Benachrichtigungskanäle und Befehls-Bots sind zwei voneinander unabhängige Konfigurationen: Für dieselbe Plattform können Sie nur Benachrichtigungen, nur Befehle oder beides einrichten.

---

## 1. Allgemeine Vorbereitung

### 1.1 Öffentliches HTTPS und PUBLIC_BASE_URL (HTTP-Rückrufmodus)

Feishu / Lark / DingTalk im Modus **HTTP-Rückruf** benötigen, dass die Plattform Nachrichten aktiv an Ihren Server pushst. Daher muss Folgendes erfüllt sein:

- Der Dienst ist aus dem öffentlichen Internet erreichbar und nutzt eine von der Plattform akzeptierte **HTTPS**-Adresse.
- `PUBLIC_BASE_URL` in `.env` stimmt mit der tatsächlich im Browser aufgerufenen Adresse überein, z. B. `https://steam.example.com`.
- Verwenden Sie nicht den Standardwert `http://localhost:8787`, da die von der Plattform aufgerufene Rückrufadresse sonst nicht erreichbar ist.
- Es wird eine eigene Domain oder Subdomain empfohlen. Der Rückrufpfad ist fest `/webhooks/...`; stellen Sie den Dienst nicht unter einem Unterpfad bereit, der zusätzliche Umschreibungen erfordert.

Die im System angezeigten Rückrufadressen werden nach folgenden Regeln erzeugt:

```text
Feishu / Lark  https://<Domain von PUBLIC_BASE_URL>/webhooks/feishu/<slug>
DingTalk       https://<Domain von PUBLIC_BASE_URL>/webhooks/dingtalk/<slug>
```

`<slug>` wird beim Erstellen des Bots zufällig erzeugt und ist für jeden Bot unterschiedlich. Nach einer Änderung von `PUBLIC_BASE_URL` ändern sich die Rückrufadressen und müssen im Plattform-Backend entsprechend aktualisiert werden.

> Der **Langzeitverbindungsmodus** von Feishu / Lark, der **Stream-Modus** von DingTalk und der WeCom-KI-Bot bauen die ausgehende Verbindung jeweils selbst vom Server aus auf und benötigen weder öffentliche Rückrufadresse noch öffentliche IP, Token oder EncodingAESKey. Per QR-Code erstellte Feishu-/Lark-Apps und DingTalk-Bots verwenden standardmäßig die Langzeitverbindung.
>
> `PUBLIC_BASE_URL` muss jedoch weiterhin für den Eigentümer des Bots im Browser erreichbar sein: Die Web-Autorisierungslinks, die nicht autorisierte Benutzer erhalten, verwenden diese Adresse.

### 1.2 Anforderungen an den Reverse-Proxy

Nginx, Caddy, Traefik oder ein Cloud-Load-Balancer müssen Folgendes erfüllen (betrifft nur HTTP-Rückrufe von Feishu / Lark / DingTalk):

- **Request-Body unverändert weiterleiten**: JSON nicht neu serialisieren, Inhalte nicht komprimieren oder verändern; die Signaturen von Feishu / Lark und DingTalk basieren auf dem ursprünglichen Request-Body.
- Plattform-Header beibehalten: bei Feishu `X-Lark-Request-Timestamp`, `X-Lark-Request-Nonce`, `X-Lark-Signature`, bei DingTalk `timestamp`, `sign`.
- Query-Parameter beibehalten und Signaturparameter nicht verlieren.
- Fügen Sie `/webhooks/*` keine Anmeldung, kein Basic Auth, keine HTML-Weiterleitung und keine interaktive WAF-Prüfung hinzu.
- Die Obergrenze für den Request-Body beträgt mindestens 1 MB; das Lese-Timeout mindestens 10 Sekunden.
- Verwenden Sie ein vertrauenswürdiges TLS-Zertifikat; die Plattform prüft die Zertifikatskette.

Die Feishu-/Lark-Langzeitverbindung, DingTalk Stream und die WeCom-Langzeitverbindung laufen nicht über den Reverse-Proxy; der Server muss lediglich ausgehend auf die jeweilige Plattform zugreifen können (Lark verwendet `open.larksuite.com`, DingTalk Stream verwendet `api.dingtalk.com`).

### 1.3 Zeitsynchronisation und Schlüssel

- Auf dem Server muss die NTP-Zeitsynchronisierung aktiviert sein. Die Feishu-/Lark-Signatur erlaubt eine Abweichung von ±300 Sekunden, DingTalk-Outgoing-Rückrufe erlauben ±1 Stunde.
- `APP_SECRET` (mindestens 32 Zeichen) dient der verschlüsselten Speicherung von Kanal- und Bot-Anmeldedaten. **Ändern oder verlieren Sie es nicht leichtfertig**: Nach einer Änderung lassen sich bereits gespeicherte App Secrets, Bot-Secrets, Encrypt Keys usw. nicht mehr entschlüsseln und müssen neu eingetragen werden.
- Bot-Anmeldedaten werden in SQLite mit AES-256-GCM verschlüsselt gespeichert; API und Oberfläche zeigen niemals Klartext an, und ein leeres Feld beim Bearbeiten bedeutet, dass der bisherige Wert beibehalten wird.

### 1.4 Empfohlene Reihenfolge beim Anlegen

Feishu / Lark (QR-Code, empfohlen):

1. Klicken Sie unter „Befehls-Bots“ auf „Feishu / Lark QR-Code“, wählen Sie Feishu oder Lark International und scannen Sie den Code.
2. Erstellen Sie die App auf der Plattformseite und bestätigen Sie; das System trägt App ID / App Secret und die `open_id` des Eigentümers automatisch ein und aktiviert die Langzeitverbindung.
3. Suchen Sie in Feishu / Lark nach dem App-Namen, um einen Einzelchat zu beginnen, oder fügen Sie den Bot einem Gruppenchat hinzu.
4. Senden Sie `/help`, um Befehle und Antwortkette zu prüfen.

Feishu / Lark (manuell):

1. Erstellen Sie im System einen Bot und wählen Sie Version (Feishu / Lark) sowie Art des Ereignisempfangs (HTTP-Rückruf / Langzeitverbindung).
2. HTTP-Rückruf: Kopieren Sie die Rückrufadresse in das Plattform-Backend und konfigurieren Sie Encrypt Key / Verification Token; Langzeitverbindung: Wählen Sie auf der Plattform „Ereignisse über Langzeitverbindung empfangen“.
3. Abonnieren Sie `im.message.receive_v1` und beantragen Sie Berechtigungen zum Lesen und Senden von Nachrichten.
4. Veröffentlichen Sie die App, fügen Sie den Bot zur Gruppe hinzu oder legen Sie den Sichtbarkeitsbereich fest.
5. Senden Sie `/help` zur Prüfung.

DingTalk (QR-Code, empfohlen):

1. Klicken Sie unter „Befehls-Bots“ auf „DingTalk per QR-Code hinzufügen“ und scannen Sie den Code mit der DingTalk-App auf dem Smartphone; bestätigen Sie die Erstellung.
2. Das System trägt Client ID / Client Secret automatisch ein, verwendet die Client ID als Robot Code und aktiviert die Stream-Langzeitverbindung.
3. Suchen Sie in DingTalk nach dem Bot, um einen Einzelchat zu beginnen, oder fügen Sie den Bot einem Gruppenchat hinzu.
4. Senden Sie `/help` zur Prüfung.

DingTalk (manuell):

1. Erstellen Sie im System einen Bot, wählen Sie den Modus für den Nachrichtenempfang und kopieren Sie die Rückrufadresse (HTTP-Modus).
2. Erstellen Sie im Plattform-Backend eine App / einen Bot, tragen Sie Rückrufadresse und Schlüssel ein, oder wählen Sie in der Bot-Konfiguration den Stream-Modus.
3. Beim Speichern des Rückrufs startet die Plattform in der Regel eine URL-Verifizierung; stellen Sie sicher, dass das System läuft und der Bot aktiviert ist.
4. Veröffentlichen Sie die App auf der Plattform, fügen Sie den Bot zur Gruppe hinzu oder legen Sie den Sichtbarkeitsbereich fest.
5. Senden Sie `/help`, um Befehle und Antwortkette zu prüfen.

WeCom:

1. Erstellen Sie im WeCom-Verwaltungsbackend einen KI-Bot, wählen Sie API-Modus → Langzeitverbindung und notieren Sie Bot ID und Secret.
2. Erstellen Sie im System „WeCom-KI-Bot (Langzeitverbindung)“ und tragen Sie Bot ID, Secret und die UserID des Eigentümers ein.
3. Nach dem Speichern baut das System die Langzeitverbindung automatisch auf; eine URL-Verifizierung auf der Plattform ist nicht erforderlich.
4. Fügen Sie den Bot einem Gruppen- oder Einzelchat hinzu und senden Sie `/help` zur Prüfung.

---

## 2. Benachrichtigungskanäle (einseitiges Pushen)

Benachrichtigungskanäle dienen dazu, Überwachungsereignisse in Gruppenchats zu pushen. Sie benötigen keine öffentliche Rückrufadresse, sondern nur die von der Plattform bereitgestellte Webhook-URL.

### 2.1 Vergleich der drei Gruppen-Bots

| Plattform | Systemtyp | Nachrichtenformat | Signatur | Beschreibung |
| -------- | -------------------------- | -------- | ------------ | ---------------------------------------------- |
| WeCom | WeCom-Gruppenbot | markdown | keine | Etwa 4096 Byte pro Nachricht, das System kürzt; Gruppen-Bots können nur senden |
| Feishu | Feishu-Bot (benutzerdefinierter Bot) | Interaktive Karte | optionaler Signaturschlüssel | Signaturprüfung kann aktiviert werden; empfohlen |
| DingTalk | DingTalk-Bot (benutzerdefinierter Bot) | markdown | optionaler Signaturschlüssel | Signierung kann aktiviert werden; das System berechnet die Signatur nach DingTalk-Regeln |

Einstieg: links **Benachrichtigungskanäle → Neuer Kanal**. Tragen Sie Namen, Webhook und optionalen Signaturschlüssel ein und wählen Sie die zu abonnierenden Ereignisse.

> Ereignisbenachrichtigungen werden standardmäßig über die Gruppen-Bot-Webhooks an dieser Stelle gesendet; „Befehls-Bots“ können Ereignisbenachrichtigungen zusätzlich separat aktivieren. Beides ist unabhängig voneinander und kann gleichzeitig verwendet werden.

### 2.2 WeCom-Gruppenbot

1. Öffnen Sie den WeCom-Gruppenchat → Gruppeneinstellungen → Gruppen-Bot → Bot hinzufügen.
2. Kopieren Sie die Webhook-Adresse (üblicherweise in der Form `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...`).
3. Wählen Sie im System unter „Benachrichtigungskanäle“ **WeCom-Gruppenbot**, fügen Sie den Webhook ein und speichern Sie.
4. Klicken Sie beim Kanal auf „Test senden“, um zu prüfen, ob die Nachricht in der Gruppe ankommt.

Hinweise:

- Der Webhook selbst ist ein Anmeldedatum; nach einer Offenlegung kann jeder Nachrichten in die Gruppe senden. Entfernen Sie den Bot in diesem Fall aus der Gruppe und fügen Sie ihn neu hinzu.
- Gruppen-Bots können keine Befehle wie `/add` empfangen; für Befehle verwenden Sie „WeCom-KI-Bot (Langzeitverbindung)“.
- Eine einzelne Nachricht ist auf etwa 4096 Byte begrenzt; das System kürzt automatisch, lange Listen werden möglicherweise unvollständig angezeigt.
- Gruppen-Bots unterliegen Ratenbegrenzungen; bei Erreichen des Limits versucht das System automatisch erneut.

### 2.3 Benutzerdefinierter Feishu-Bot

1. Öffnen Sie den Feishu-Gruppenchat → Gruppeneinstellungen → Gruppen-Bot → Bot hinzufügen → Benutzerdefinierter Bot.
2. Kopieren Sie die Webhook-Adresse (üblicherweise in der Form `https://open.feishu.cn/open-apis/bot/v2/hook/...`).
3. Wählen Sie in den Sicherheitseinstellungen idealerweise **Signaturprüfung** und kopieren Sie den Signaturschlüssel.
4. Wählen Sie im System unter „Benachrichtigungskanäle“ **Feishu-Bot** und fügen Sie den Webhook ein; bei aktivierter Signatur tragen Sie den Signaturschlüssel ein.
5. Senden Sie nach dem Speichern eine Testnachricht.

Signaturregeln (im System implementiert, keine manuelle Berechnung erforderlich):

- Der Zeitstempel wird in Sekunden angegeben.
- `timestamp + "\n" + secret` dient als Schlüssel für HMAC-SHA256; die Signatur wird über die leere Zeichenkette berechnet und das Ergebnis Base64-kodiert.
- Zeitstempel und Signatur werden zusammen mit dem Nachrichtentext gesendet.

Wenn Sie statt der Signatur „Benutzerdefiniertes Schlüsselwort“ oder „IP-Whitelist“ verwenden, stellen Sie sicher, dass der Benachrichtigungsinhalt das Schlüsselwort enthält, oder nehmen Sie die ausgehende IP des Servers in die Whitelist auf.

### 2.4 Benutzerdefinierter DingTalk-Bot

1. Öffnen Sie den DingTalk-Gruppenchat → Gruppeneinstellungen → Intelligenter Gruppenassistent → Bot hinzufügen → Benutzerdefiniert.
2. Kopieren Sie die Webhook-Adresse (üblicherweise in der Form `https://oapi.dingtalk.com/robot/send?access_token=...`).
3. Wählen Sie in den Sicherheitseinstellungen idealerweise **Signierung** und kopieren Sie den Signaturschlüssel.
4. Wählen Sie im System unter „Benachrichtigungskanäle“ **DingTalk-Bot** und fügen Sie den Webhook ein; bei aktivierter Signierung tragen Sie den Signaturschlüssel ein.
5. Senden Sie nach dem Speichern eine Testnachricht.

Signaturregeln (im System implementiert):

- Der Zeitstempel wird in Millisekunden angegeben.
- Mit `secret` als Schlüssel wird HMAC-SHA256 über `timestamp + "\n" + secret` berechnet und das Ergebnis Base64-kodiert.
- `timestamp` und `sign` werden als URL-Query-Parameter gesendet.

Wenn Sie statt der Signierung „Benutzerdefiniertes Schlüsselwort“ oder „IP-Adressbereich“ verwenden, passen Sie die Sicherheitseinstellungen entsprechend an. Bei Erreichen des Ratenlimits (z. B. Fehlercode `90037`) versucht das System automatisch erneut.

### 2.5 Ereignisabonnement und Wiederholungen

Für Benachrichtigungskanäle können Sie die zu abonnierenden Ereignistypen auswählen:

| Ereignis | Beschreibung |
| ------------------- | ---------------------------------------------- |
| `release` | Spiel / DLC offiziell veröffentlicht |
| `release_date` | Genaues Veröffentlichungsdatum erhalten oder geändert |
| `sale_start` | Rabatt erreicht den Überwachungsschwellenwert |
| `sale_change` | Rabatt oder Preis während einer Rabattaktion geändert |
| `sale_end` | Rabatt beendet, Rückkehr zum Grundpreis |
| `price_change` | Änderung des Grundpreises außerhalb von Rabattaktionen oder Wechsel des Gratis-Status |
| `delisting_warning` | Steam-News enthält Delisting-Schlüsselwort (heuristisch, manuelle Bestätigung erforderlich) |
| `delisted` | Zweimal in Folge bestätigt, dass der Shop nicht kaufbar ist |
| `restored` | Wieder kaufbar |
| `check_error` | Prüfung fehlgeschlagen |

- Wenn **kein Ereignis ausgewählt** ist, werden standardmäßig alle Ereignisse außer `check_error` empfangen.
- Fehlgeschlagene Sendungen werden nach 30 Sekunden → 2 Minuten → 10 Minuten → 1 Stunde → 6 Stunden → 24 Stunden wiederholt, maximal 6 Mal.
- Auf jeder Kanal-Karte gibt es „Test senden“, um Webhook- und Signaturkonfiguration zu prüfen.

---

## 3. Befehls-Bots (bidirektional)

Befehls-Bots ermöglichen Benutzern, Überwachungseinträge über Slash-Befehle in Feishu / Lark, DingTalk oder WeCom zu verwalten. Feishu / Lark unterstützt HTTP-Rückruf oder WebSocket-Langzeitverbindung, DingTalk HTTP-Rückruf oder Stream-Langzeitverbindung, WeCom die WebSocket-Langzeitverbindung; die Ergebnisse werden jeweils über die Plattform-API oder die Langzeitverbindung in die ursprüngliche Unterhaltung zurückgegeben.

### 3.1 Allgemeines Verhalten

- **Wirkungsbereich**: Befehle wirken immer auf die Daten des Kontos, dem der Bot gehört. Auch wenn andere Administratoren aus der Allowlist den Bot verwenden, ändern sie die Überwachungseinträge des Bot-Eigentümers.
- **Eigentümerkennung**: `ownerPlatformUserId` dient nur zur Kennzeichnung des Scanners / Bot-Eigentümers und gewährt nicht automatisch Befehlsrechte.
- **Allowlist**: Alle Plattformbenutzer (einschließlich der Eigentümer-ID) müssen in die Allowlist aufgenommen werden, um Befehle auszuführen. Die Rollen sind:
  - `admin`: darf alle Befehle verwenden.
  - `viewer`: darf nur `/help`, `/list`, `/price`, `/events` verwenden.
  - Feishu-/Lark-, DingTalk- und WeCom-Benutzer, die nicht in der Allowlist stehen, erhalten einen einmaligen Link zur Web-Autorisierung, und der Bot führt den ursprünglichen Befehl nicht aus; DingTalk unterstützt diesen Link ebenfalls.
- **Ereignisbenachrichtigungen**: Auf der Bearbeitungsseite kann der Bot separat „Ereignisbenachrichtigungen empfangen“ aktivieren, um Ereignisse an die zuletzt von einem autorisierten Benutzer verwendete Unterhaltung zu pushen. Dies ist unabhängig von den „Benachrichtigungskanälen“ und kann gleichzeitig aktiviert werden. Ohne aktuelle Unterhaltung wird nichts gepusht; Details siehe Abschnitt 3.5.
- **Nachrichtenformat**: Derzeit werden nur Textnachrichten verarbeitet. Bilder, Dateien, Rich-Text- und Kartennachrichten werden ignoriert.
- **Befehlsformat**: Beginnt mit `/` oder dem Vollbreite-Zeichen `／`; unterstützt `/add@Bot`, Argumente in Anführungszeichen und `--flag=value`.
- **Deduplizierung**: Wenn die Plattform dieselbe Nachricht mehrfach zustellt, dedupliziert das System anhand der Plattform-Ereignis- / Nachrichten-ID und verarbeitet sie nur einmal.
- **Ratenbegrenzung**: Pro Plattformbenutzer maximal 10 Befehle pro Minute, pro Unterhaltung maximal 30 pro Minute, pro Bot maximal 60 pro Minute; bei Erreichen des Limits erfolgt höchstens einmal pro Minute ein Hinweis.
- **Asynchrone Antworten**: Feishu-/Lark-/DingTalk-Rückrufe werden zunächst schnell mit Erfolg beantwortet, DingTalk-Stream- und WeCom-Nachrichten werden über die Langzeitverbindung empfangen; die Befehle werden im Hintergrund ausgeführt und die Ergebnisse über die Plattform-API oder die Langzeitverbindung zurückgegeben. Die Anzeige der Antwort auf der Plattform kann sich leicht verzögern.
- **Auswahl bei mehreren Ergebnissen**: Wenn `/add` oder `/adddlc` bei der Namenssuche mehrere Treffer liefert, gibt der Bot eine nummerierte Liste zurück; antworten Sie direkt mit der Nummer (10 Minuten gültig) oder senden Sie `/cancel` zum Abbrechen.
- **Kontingent**: Pro Konto können maximal 3 Bots erstellt werden; pro Plattform ist nur 1 aktiver Bot zulässig (Feishu und Lark International teilen sich das Plattformkontingent „Feishu“). Bei HTTP-Rückruf-Bots von Feishu / Lark / DingTalk wird die Rückrufadresse nach der Deaktivierung sofort ungültig (Rückgabe 404); bei Langzeitverbindungs- / Stream-Bots wird die Verbindung nach der Deaktivierung getrennt.

### 3.2 Feishu-/Lark-App-Bot (empfohlen)

> #### Begründung der Empfehlung
>
> Feishu/Lark unterstützt eine Privatversion, mit der sich Privatleben und Beruf sehr gut trennen lassen.



Feishu / Lark erfordert die Erstellung einer **Unternehmens-App**, in der die Bot-Funktion aktiviert und das Nachrichtenereignis abonniert ist. Gruppen-Bot-Webhooks für benutzerdefinierte Bots können keine Befehle empfangen. Feishu (China-Version) verwendet `open.feishu.cn` / `accounts.feishu.cn`, Lark International verwendet `open.larksuite.com` / `accounts.larksuite.com`; im System wird über die „Version“ in der Bot-Konfiguration unterschieden.

#### Erstellung per QR-Code in einem Schritt (empfohlen)

1. Klicken Sie unter „Befehls-Bots“ auf **Feishu / Lark QR-Code** und wählen Sie im Dialog „Feishu“ oder „Lark International“.
2. Scannen Sie den Code mit dem entsprechenden Client; die Seite füllt den App-Namen vor und erlaubt nur das Anlegen einer neuen App.
3. Nach Bestätigung ruft das System App ID / App Secret automatisch ab, trägt die `open_id` des Scanners als Eigentümer ein und aktiviert die Langzeitverbindung.
4. Der QR-Code ist 10 Minuten gültig; wenn auf derselben Plattform bereits ein aktiver Bot existiert oder das Kontingent ausgeschöpft ist, wird der Vorgang abgelehnt.
5. Suchen Sie in Feishu / Lark nach dem App-Namen, um einen Einzelchat zu beginnen, oder fügen Sie den Bot einem Gruppenchat hinzu und senden Sie `/help`.

> Die Erstellung per QR-Code verwendet die offizielle Feishu-Vorlage `PersonalAgent`, in der Bot-Funktion, Nachrichtenberechtigungen und das Ereignis `im.message.receive_v1` vorkonfiguriert sind; die Ereignisse werden über die Langzeitverbindung empfangen. Wenn Ihr Unternehmen die Erstellung per QR-Code einschränkt, können Sie die manuelle Konfiguration unten verwenden.
>
> Wird der Feishu-QR-Code von einem Lark-Mandanten gescannt, wechselt das System automatisch zu `accounts.larksuite.com`, um die Autorisierung abzuschließen.

#### Manuelle Konfiguration

1. Öffnen Sie die [Feishu Open Platform](https://open.feishu.cn/app) oder die [Lark Open Platform](https://open.larksuite.com/app) und erstellen Sie eine Unternehmens-App.
2. Aktivieren Sie unter „App-Funktionen hinzufügen“ den **Bot**.
3. Beantragen Sie unter „Berechtigungsverwaltung“ die nachrichtenbezogenen Berechtigungen:
   - `im:message.p2p_msg:readonly`: Einzelchatnachrichten von Benutzern an den Bot lesen.
   - `im:message.group_at_msg:readonly`: Nachrichten empfangen, in denen der Bot in Gruppenchats mit @ erwähnt wird.
   - `im:message:send_as_bot`: Nachrichten im Namen der App senden.
   - Wenn das Backend Berechtigungen nach Szenarien aufteilt, beantragen Sie zusätzlich die Berechtigungen zum Lesen des Nachrichteninhalts und zum Senden von Nachrichten.
4. Erstellen Sie im System „Feishu-/Lark-App-Bot“ und wählen Sie Version und Art des Ereignisempfangs:
   - **Langzeitverbindung (empfohlen)**: Wählen Sie auf der Plattform unter „Ereignisse und Rückrufe“ „Ereignisse über Langzeitverbindung empfangen“ und abonnieren Sie `im.message.receive_v1`; eine Rückrufadresse ist nicht erforderlich.
   - **HTTP-Rückruf**: Tragen Sie die im System angezeigte Adresse `/webhooks/feishu/<slug>` als Anforderungsadresse ein; bei Bedarf an Verschlüsselung tragen Sie Encrypt Key und Verification Token ein.
5. Erstellen Sie eine Version und veröffentlichen Sie die App; stellen Sie unter „Verfügbarer Bereich der App“ sicher, dass die Benutzer sie verwenden können.
6. Fügen Sie den Bot einem Gruppenchat hinzu oder chatten Sie direkt mit ihm.

#### Felder auf Systemseite

| Feld | Pflichtfeld | Beschreibung |
| ------------------ | ----------------- | ---------------------------------------------------------------- |
| Name | Ja | Dient nur der Identifikation im System |
| Version | Ja | Feishu (China-Version) oder Lark (International) |
| Art des Ereignisempfangs | Ja | HTTP-Rückruf / Langzeitverbindung; bei QR-Code-Erstellung standardmäßig Langzeitverbindung |
| App ID | Empfohlen | Erforderlich für `tenant_access_token`, Antworten und das Pushen von Ereignissen |
| App Secret | Empfohlen | Gehört zu App ID |
| Encrypt Key | Bei HTTP-Rückruf plattformabhängig | Muss exakt mit dem Feishu-/Lark-Backend übereinstimmen; bei aktivierter Verschlüsselung Pflichtfeld |
| Verification Token | Bei HTTP-Rückruf empfohlen | Muss mit der Plattform übereinstimmen; dient der Prüfung der Ereignisquelle |
| Plattform-Benutzer-ID des Eigentümers | Empfohlen | Feishu-/Lark-`open_id` eintragen (beginnt üblicherweise mit `ou_`); bei QR-Code-Erstellung automatisch ausgefüllt |
| API Base URL | Nein | Nur für Tests / Proxys; in der Produktion leer lassen |

#### Rückruf, Langzeitverbindung und Signatur

- **HTTP-Rückruf**: Beim Speichern der Ereignisabonnement-Adresse sendet die Plattform eine `url_verification`-Challenge, und das System gibt `challenge` zurück.
  - Bei konfiguriertem Encrypt Key prüft das System die Header-Signatur `SHA256(timestamp + nonce + encryptKey + rawBody)`, erlaubt ±300 Sekunden Abweichung und entschlüsselt anschließend den Chiffretext.
  - Bei konfiguriertem Verification Token prüft das System das Token im Ereignis; bei Abweichung wird 401 zurückgegeben.
- **Langzeitverbindung**: Der Server verbindet sich mit App ID / App Secret aktiv mit dem Langzeitverbindungs-Endpunkt von Feishu / Lark; Ereignisse werden über die authentifizierte Verbindung gepusht, sodass weder Signaturprüfung noch öffentliche Adresse oder Reverse-Proxy erforderlich sind. Der Verbindungsstatus wird auf der Bot-Karte angezeigt.
- Es werden nur Textnachrichten aus `im.message.receive_v1` verarbeitet; vom Bot selbst gesendete Nachrichten werden ignoriert.
- Für Antworten wird bevorzugt die Schnittstelle „Nachricht beantworten“ aufgerufen; bei Fehlschlag wird auf das Senden einer Nachricht an `chat_id` zurückgegriffen.
- In Gruppenchats müssen Sie den **Bot mit @ erwähnen** und dann den Befehl eingeben; in Einzelchats können Sie direkt senden.

#### Eigentümer-ID und Allowlist

- Bei Feishu-/Lark-Ereignissen wird als Benutzerkennung bevorzugt `open_id` verwendet; tragen Sie daher in der Allowlist `open_id` ein und keine Telefonnummer, E-Mail-Adresse oder Namen.
- Bei der QR-Code-Erstellung wird die `open_id` des Scanners in „Eigentümer-ID“ geschrieben, sie dient jedoch nur der Kennzeichnung und gewährt keine automatischen Befehlsrechte; bei der ersten Verwendung muss das eigene Plattformkonto weiterhin über die Web-Autorisierung freigegeben werden.
- Bei manueller Konfiguration können Sie das Ereignis-Debugging / die Rückruflogs einsehen oder den Benutzer zunächst eine Nachricht senden lassen und dann die Ereignisdetails auf der Plattform prüfen.

### 3.3 DingTalk-Bot (HTTP-Rückruf / Stream)

DingTalk erfordert die Erstellung eines **betriebsinternen Bots**; als Modus für den Nachrichtenempfang kann **Stream-Langzeitverbindung** (empfohlen) oder **HTTP-Rückruf / Outgoing** gewählt werden. DingTalk-Webhooks für benutzerdefinierte Gruppen-Bots können keine Befehle empfangen.

#### Hinzufügen per QR-Code (empfohlen)

1. Klicken Sie auf der Seite „Befehls-Bots“ auf **DingTalk per QR-Code hinzufügen**.
2. Scannen Sie den Code mit der DingTalk-App auf dem Smartphone, wählen Sie die Organisation und geben Sie gemäß den Hinweisen auf der Seite die Bot-Informationen ein, um die Erstellung zu bestätigen.
3. Das System ruft Client ID / Client Secret automatisch ab, verwendet die Client ID als Robot Code und aktiviert die Stream-Langzeitverbindung; der QR-Code ist 10 Minuten gültig.
4. Nach erfolgreicher Erstellung können Sie in DingTalk nach dem Bot suchen, um einen Einzelchat zu beginnen, oder ihn einem Gruppenchat hinzufügen; die `staffId` des Scanners dient nur der Kennzeichnung, verwendende Mitglieder benötigen weiterhin eine Web-Autorisierung oder einen Eintrag in der Allowlist.

> Wenn auf derselben Plattform bereits ein aktiver Bot existiert oder das Bot-Kontingent ausgeschöpft ist, wird der QR-Code abgelehnt; behandeln Sie den alten Bot zuerst auf der Seite.
>
> Für den QR-Code wird die offizielle App-Registrierungsseite von DingTalk verwendet. Wenn Ihre Organisation die Erstellung per QR-Code einschränkt oder die Registrierungsseite Fehler zurückgibt, können Sie die manuelle Konfiguration unten verwenden.

#### Manuelle Konfiguration

1. Öffnen Sie die [DingTalk Open Platform](https://open.dingtalk.com/) und erstellen Sie eine betriebsinterne App.
2. Fügen Sie unter „App-Funktionen hinzufügen“ einen **Bot** hinzu.
3. Wählen Sie den Modus für den Nachrichtenempfang:
   - **Stream-Modus (empfohlen)**: Wählen Sie in der Bot-Konfiguration den Stream-Modus und veröffentlichen Sie; keine öffentliche Rückrufadresse erforderlich.
   - **HTTP-Rückruf / Outgoing**: Tragen Sie die im System angezeigte Adresse `/webhooks/dingtalk/<slug>` und das App Secret zur Signaturprüfung ein.
4. Erstellen Sie im System einen „DingTalk-Bot“, tragen Sie Client ID (App Key) und Client Secret (App Secret) ein und wählen Sie denselben Empfangsmodus.
5. Wenn Sie Ereignisbenachrichtigungen pushen möchten, tragen Sie den Robot Code ein (üblicherweise identisch mit der Client ID) und stellen Sie sicher, dass die App die Berechtigung besitzt, dass der Bot aktiv Nachrichten sendet.
6. Veröffentlichen Sie die App, fügen Sie den Bot einem Gruppenchat hinzu und senden Sie `/help`.

#### Felder auf Systemseite

| Feld | Pflichtfeld | Beschreibung |
| --------------------------- | ----------------------- | ---------------------------------------------- |
| Name | Ja | Dient nur der Identifikation im System |
| Modus für den Nachrichtenempfang | Ja | HTTP-Rückruf / Stream-Langzeitverbindung; bei QR-Code-Erstellung standardmäßig Stream |
| App Key (Client ID) | Bei Stream Pflicht | DingTalk-App-Client-ID; auch für Ereignisbenachrichtigungen erforderlich |
| App Secret (Client Secret) | Bei Stream Pflicht / HTTP-Signaturprüfung | Anmeldedatum für den Stream-Verbindungsaufbau; bei HTTP-Rückruf zur Prüfung der Rückrufsignatur |
| Robot Code | Für Ereignisbenachrichtigungen empfohlen | Bot-Code; üblicherweise identisch mit der Client ID |
| Plattform-Benutzer-ID des Eigentümers | Empfohlen | DingTalk-`staffId` eintragen |
| API Base URL | Nein | Nur für Tests / Proxys; in der Produktion leer lassen |

#### Nachrichtenempfang und Antworten

- **Stream-Modus**: Der Server verbindet sich mit Client ID / Secret aktiv mit dem DingTalk-Stream-Gateway; öffentliche IP, Domain oder Rückrufadresse sind nicht erforderlich. Bot-Nachrichten werden über die Langzeitverbindung gepusht; das System bestätigt sofort (ACK) und führt den Befehl anschließend asynchron aus.
- **HTTP-Rückruf**: Die Rückruf-Header von DingTalk enthalten `timestamp` (Millisekunden) und `sign`; das System berechnet mit dem App Secret als Schlüssel HMAC-SHA256 über `timestamp + "\n" + App Secret` und erlaubt ±1 Stunde Abweichung.
- In beiden Modi werden nur Textnachrichten mit `msgtype = text` verarbeitet.
- Als Benutzer-ID wird bevorzugt `senderStaffId` verwendet, danach `senderId`; Eigentümer-ID und Allowlist sollten `staffId` enthalten.
- Für Antworten wird das `sessionWebhook` aus dem Nachrichtentext verwendet, um markdown zu senden und den Absender des Befehls mit @ zu erwähnen; dieses Webhook ist üblicherweise etwa 1,5 Stunden gültig, danach senden Sie den Befehl einfach erneut.
- Das System dedupliziert anhand der DingTalk-`msgId`; im Stream-Modus wird der Push zusätzlich sofort bestätigt, um doppelte Zustellungen der Plattform zu vermeiden.

#### Eigentümer-ID und Allowlist

- Maßgeblich ist `senderStaffId` (danach `senderId`) aus dem Rückrufereignis; Sie können den Wert im Ereignis-Debuglog der offenen Plattform einsehen oder in den Mitgliedsdetails des Adressbuchs prüfen.
- Die „Eigentümer-ID“ dient nur der Kennzeichnung und gewährt keine automatischen Befehlsrechte; alle DingTalk-Benutzer benötigen eine Web-Autorisierung oder einen Eintrag in der Allowlist.
- Bei der Erstellung per QR-Code wird nicht unbedingt die `staffId` des Scanners zurückgegeben; Sie können sie manuell ergänzen. Bei der ersten Verwendung genügt es, wenn sich das Konto des Bots auf der Webseite anmeldet und den Vorgang genehmigt.

### 3.4 WeCom-KI-Bot (Langzeitverbindung)

WeCom erfordert die Erstellung eines **KI-Bots** mit **API-Modus → Langzeitverbindung**. WeCom-Gruppen-Bot-Webhooks können nur senden und keine Befehle empfangen.

> Upgrade-Hinweis: Die Rückrufkonfiguration der älteren selbst erstellten WeCom-Apps (Token / EncodingAESKey / CorpID / AgentID) wird für Befehls-Bots nicht mehr verwendet. Bestehende Bots müssen unter „Befehls-Bots“ auf Bot ID / Secret des KI-Bots umgestellt und gespeichert werden.

#### Hinzufügen per QR-Code (empfohlen)

1. Klicken Sie auf der Seite „Befehls-Bots“ auf **WeCom per QR-Code hinzufügen**.
2. Scannen Sie den Code mit einem WeCom-Konto, das die Berechtigung zum Erstellen von KI-Bots besitzt, und erstellen und autorisieren Sie den Bot gemäß den Hinweisen auf der Seite.
3. Das System ruft Bot ID / Secret automatisch ab, erstellt den Bot und baut die Langzeitverbindung auf; der QR-Code ist 5 Minuten gültig.
4. Lassen Sie nach erfolgreicher Erstellung ein verwendendes Mitglied einen Befehl senden und genehmigen Sie den Vorgang, indem sich das Konto des Bots auf der Webseite anmeldet; die UserID des Eigentümers dient nur der Kennzeichnung und gewährt keine automatischen Rechte.

> Wenn auf derselben Plattform bereits ein aktiver Bot existiert oder das Bot-Kontingent ausgeschöpft ist, wird der QR-Code abgelehnt; behandeln Sie den alten Bot zuerst auf der Seite.
>
> Für den QR-Code wird die offizielle Autorisierungsseite von WeCom verwendet. Wenn das Konto keine Berechtigung zum Erstellen von KI-Bots besitzt oder WeCom den Seitenablauf geändert hat, können Sie die manuelle Konfiguration unten verwenden.

#### Manuelle Konfiguration

1. Öffnen Sie das [WeCom-Verwaltungsbackend](https://work.weixin.qq.com/) oder den Arbeitsbereich des WeCom-Clients und wechseln Sie zu „KI-Bot“ → Bot erstellen.
2. Wählen Sie im Erstellungsablauf „API-Modus erstellen“ → „Langzeitverbindung verwenden“.
3. Notieren und speichern Sie **Bot ID** und **Secret**. Das Secret wird üblicherweise nur einmal angezeigt und kann bei Verlust neu erzeugt werden.
4. Erstellen Sie im System „WeCom-KI-Bot (Langzeitverbindung)“ und tragen Sie Bot ID, Secret und die UserID des Eigentümers ein.
5. Fügen Sie den Bot einem Gruppen- oder Einzelchat hinzu; senden Sie in Gruppenchats `/help` mit **@Bot**.
6. Rückrufadresse, Token, EncodingAESKey oder CorpID müssen nicht eingetragen werden; der Dienst verbindet sich aktiv mit `wss://openws.work.weixin.qq.com`.

#### Felder auf Systemseite

| Feld | Pflichtfeld | Beschreibung |
| ----------------- | -------- | ---------------------------------------------------------------------- |
| Name | Ja | Dient nur der Identifikation im System |
| Bot ID | Ja | Eindeutige Kennung des KI-Bots |
| Secret | Ja | Secret speziell für die Langzeitverbindung, dient der Authentifizierung von `aibot_subscribe` |
| Plattform-Benutzer-ID des Eigentümers | Empfohlen | UserID des Mitglieds im WeCom-Adressbuch; maßgeblich ist `from.userid` im tatsächlichen Rückruf des Bots |

#### Mechanismus der Langzeitverbindung

- Der Server verbindet sich aktiv mit `wss://openws.work.weixin.qq.com`; dies eignet sich für interne Bereitstellungen und erfordert keine feste öffentliche IP.
- Nach dem Verbindungsaufbau wird `aibot_subscribe` gesendet, wobei Bot ID + Secret die Identitätsprüfung durchführen; anschließend wird alle 30 Sekunden ein `ping`-Heartbeat gesendet.
- Benutzernachrichten werden über `aibot_msg_callback` im Klartext gepusht und müssen nicht entschlüsselt werden; das System verarbeitet nur `msgtype = text`.
- Antworten werden über `aibot_respond_msg` mit der `req_id` aus dem Rückruf als markdown gesendet; Antworten mit derselben `req_id` werden seriell gesendet.
- Für einen KI-Bot ist gleichzeitig nur eine gültige Langzeitverbindung zulässig; eine neue Verbindung verdrängt die alte, und bei der Bereitstellung mehrerer Instanzen unterbrechen sie sich gegenseitig.
- Nach Verbindungsabbrüchen wird mit exponentiellem Backoff erneut verbunden; bei wiederholtem Authentifizierungsfehler oder wenn die Verbindung durch eine neue Instanz ersetzt wurde, zeigt die Bot-Karte eine Störung der Langzeitverbindung an.
- Bei Gruppennachrichten wird das führende `@Bot` entfernt und anschließend als Slash-Befehl ausgewertet.
- Antworten sind innerhalb von 24 Stunden nach dem Nachrichtenrückruf möglich; das System führt Befehle in einer Hintergrundwarteschlange aus, lange Befehle dauern in der Regel einige Sekunden.
- Nach Aktivierung der Bot-Ereignisbenachrichtigungen pusht das System über dieselbe Langzeitverbindung mit `aibot_send_msg` aktiv an die aktuelle Unterhaltung; der Benutzer muss dem Bot zuvor eine Nachricht gesendet haben.

#### Eigentümer-ID und Allowlist

- Tragen Sie die **UserID** aus dem WeCom-Adressbuch ein (Mitgliedskonto), nicht Namen, Telefonnummer oder ID externer Kontakte.
- Wenn der Ersteller des Bots kein Unternehmens-Superadministrator ist, kann `from.userid` eine verschlüsselte userid des Unternehmens sein; konfigurieren Sie Eigentümer und Allowlist anhand des tatsächlichen Werts im Rückrufereignis.

#### Nicht autorisiert und Web-Autorisierung

- Wenn ein WeCom-Benutzer nicht in der Allowlist steht, antwortet der Bot mit einem einmaligen Link zur Web-Autorisierung (`PUBLIC_BASE_URL/authorize/<token>`), der 30 Minuten gültig ist.
- Der Bot-Eigentümer meldet sich mit seinem eigenen Web-Konto auf der Linkseite an, prüft die Plattform-Benutzer-ID (sowie ggf. Nickname und Unterhaltung), wählt `viewer` oder `admin` und genehmigt oder lehnt den Vorgang ab.
- Wer nicht Bot-Eigentümer ist, kann nach der Anmeldung die Anfrage nur ansehen und nicht selbst genehmigen; leiten Sie den Link in diesem Fall an den Bot-Eigentümer weiter.
- Der Autorisierungslink wird nach einer Bearbeitung ungültig; andere ausstehende Links desselben Benutzers werden synchron aktualisiert. Nach Ablauf lassen Sie den Benutzer einen beliebigen Befehl erneut senden, um einen neuen Link zu erzeugen.
- Alle verwendenden Mitglieder (auch der Scanner selbst) benötigen Rechte über die Web-Autorisierung oder die Allowlist; wenn Sie selbst alle Befehlsrechte haben möchten, wählen Sie bei der Freigabe `admin`.
- `PUBLIC_BASE_URL` muss im Browser erreichbar sein; wenn sich der Link nicht öffnen lässt, prüfen Sie den Reverse-Proxy und diese Umgebungsvariable.

#### Verbindungsstatus

Die Bot-Karte zeigt den Status der Langzeitverbindung:

- **Langzeitverbindung wird aufgebaut**: Verbindungsaufbau oder automatische Wiederverbindung läuft.
- **Langzeitverbindung verbunden**: Authentifizierung erfolgreich, Befehle können empfangen werden.
- **Langzeitverbindung gestört**: Anmeldedaten falsch, Bot ID / Secret nicht eingetragen, Netzwerk nicht erreichbar, Authentifizierung fehlgeschlagen oder Verbindung durch eine andere Instanz ersetzt.
- **Langzeitverbindung nicht aktiviert**: Der Bot wurde deaktiviert.

Wenn der Status dauerhaft gestört ist, prüfen Sie Bot ID / Secret, ob die ausgehende Firewall des Servers `wss://openws.work.weixin.qq.com:443` zulässt und ob eine andere Instanz dieselbe Bot ID verwendet.

### 3.5 Ereignisbenachrichtigungen des Bots

Wenn Sie auf der Bearbeitungsseite unter „Befehls-Bots“ **Ereignisbenachrichtigungen empfangen** aktivieren, empfängt der Bot zusätzlich Ereignisse wie Veröffentlichung, Rabattaktion und Delisting. Dies ist eine von den Benachrichtigungskanälen unabhängige Konfiguration; beides kann gleichzeitig aktiviert sein.

- **Benachrichtigungsziel**: Die Unterhaltung, die zuletzt von einem Mitglied der Allowlist mit dem Bot verwendet wurde. Das System aktualisiert dieses Ziel nur, wenn ein autorisierter Benutzer erfolgreich einen Befehl gesendet hat; nicht autorisierte Benutzer ändern das Benachrichtigungsziel nicht.
- **Voraussetzung**: Der Ziel-Bot muss zuvor mindestens einen Befehl eines autorisierten Benutzers empfangen haben, andernfalls erfolgt keine Ereigniszustellung. Die Bot-Karte weist darauf hin, dass „noch keine aktuelle Unterhaltung erfasst“ wurde.
- **Ereignisumfang**: Es werden alle Ereignisse empfangen, einschließlich Prüffehlern; eine Filterung der Ereignistypen pro Bot wird nicht unterstützt.
- **Gruppen-Bots von Benachrichtigungskanälen senden weiterhin gemäß den Ereignisauswahlregeln des jeweiligen Kanals; beides beeinflusst sich nicht gegenseitig.**

Zusätzliche Anforderungen je Plattform:

- **Feishu / Lark**: App ID / App Secret erforderlich sowie die Berechtigung, im Namen der App Nachrichten an Unterhaltungen zu senden. Ereignisse werden an die `chat_id` der aktuellen Unterhaltung gesendet; sowohl HTTP-Rückruf als auch Langzeitverbindung sind möglich.
- **DingTalk**: App Key, App Secret und Robot Code erforderlich sowie die Berechtigung, dass der Bot aktiv Nachrichten sendet. In Gruppenchats wird `openConversationId` verwendet, in Einzelchats die `staffId` des Absenders.
- **WeCom**: Push über die Langzeitverbindung mit `aibot_send_msg` an die aktuelle Unterhaltung; Einzelchat `chat_type=1`, Gruppenchat `chat_type=2`. Der Benutzer muss zuvor mit dem Bot kommuniziert haben.

> Wenn der Bot deaktiviert wird, der Schalter für Ereignisbenachrichtigungen ausgeschaltet wird, die aktuelle Unterhaltung gelöscht wird oder der Bot aus dem Gruppenchat entfernt wird, wird die Zustellung abgebrochen oder schlägt fehl; lassen Sie einen autorisierten Benutzer erneut einen Befehl senden, um die Zielunterhaltung zu aktualisieren.

---

## 4. Befehlsübersicht

```text
/help
/add <appid | Shop-Link | Name> [--discount N] [--note Text] [--force]
/adddlc <Basisspiel-AppID | Link | Name> [--max 50]
/remove <id | appid | Name>
/pause <id | appid | Name>
/resume <id | appid | Name>
/check <id | appid | Name>
/price <id | appid | Name>
/list [--all] [--sale] [--paused] [--page N]
/events [--item id] [--limit 10]
/cancel
```

Erläuterungen:

- `/add` unterstützt die direkte Suche im Steam-Shop; bei mehreren Treffern der Namenssuche antworten Sie mit der Nummer zur Auswahl.
- `--discount N` legt den Schwellenwert für Rabattbenachrichtigungen fest (0–100); ohne Angabe wird der Kontostandard verwendet.
- `--force` ist für Fälle gedacht, in denen das Spiel in der aktuellen Region nicht abrufbar ist, Sie es aber dennoch hinzufügen und nur eine News-Vorwarnung erhalten möchten.
- `/adddlc` importiert alle DLCs eines Basisspiels, maximal 50 pro Vorgang.
- `/check` umgeht den Cache, prüft sofort und schreibt Ereignisse; es unterliegt dem Ratenlimit von Steam.
- `/list` zeigt standardmäßig keine pausierten Einträge; `--all` zeigt alle, `--sale` nur laufende Rabattaktionen, `--paused` nur pausierte Einträge.
- `/events` zeigt standardmäßig die letzten 10 Einträge, maximal 20.
- Die Rolle „Betrachter“ ist auf `/help`, `/list`, `/price`, `/events` beschränkt.

---

## 5. Fehlerbehebung bei häufigen Problemen

| Symptom | Mögliche Ursache | Vorgehen |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Speichern der Rückrufadresse bei Feishu / Lark / DingTalk schlägt fehl | Dienst nicht öffentlich erreichbar, Zertifikat ungültig, `PUBLIC_BASE_URL` falsch | Rufen Sie die Rückrufdomäne über mobile Daten auf; prüfen Sie die vollständige HTTPS-Zertifikatskette; stellen Sie sicher, dass der Bot erstellt und aktiviert ist |
| Rückruf bei Feishu / Lark / DingTalk liefert 404 | Bot deaktiviert oder gelöscht, oder `<slug>` falsch eingetragen | Kopieren Sie die aktuelle Rückrufadresse auf der Seite „Befehls-Bots“; aktivieren Sie den Bot |
| Feishu / Lark meldet Challenge-Fehler / 401 | Verification Token oder Encrypt Key stimmt nicht überein; Proxy hat den Request-Body verändert | Gleichen Sie beide Seiten erneut ab; deaktivieren Sie Body-Komprimierung / -Umschreibung; behalten Sie die `X-Lark-*`-Header bei |
| Feishu / Lark reagiert nach Aktivierung der Verschlüsselung nicht | Die Plattform hat den Encrypt Key aktiviert, im System ist er nicht eingetragen, der Chiffretext kann nicht ausgewertet werden; auch die Prüfung des Verification Token kann direkt 401 zurückgeben | Tragen Sie im System denselben Encrypt Key und Verification Token ein oder deaktivieren Sie die Verschlüsselung auf der Plattform und speichern Sie erneut |
| Feishu / Lark empfängt Nachrichten, kann aber nicht antworten | App ID / App Secret nicht eingetragen oder Berechtigung zum Senden von Nachrichten fehlt | Vervollständigen Sie die Anmeldedaten; beantragen und veröffentlichen Sie auf der offenen Plattform die Berechtigung zum Senden von Nachrichten |
| Feishu-/Lark-Langzeitverbindung zeigt dauerhaft „verbindet“ / Störung | App ID / App Secret falsch; App hat „Ereignisse über Langzeitverbindung empfangen“ nicht aktiviert; Unternehmen schränkt die Erstellung per QR-Code ein | Prüfen Sie die Anmeldedaten; stellen Sie unter „Ereignisse und Rückrufe“ auf Langzeitverbindung um und veröffentlichen Sie eine Version; oder wechseln Sie zu HTTP-Rückruf |
| Feishu-/Lark-Bot nach dem Scannen nicht auffindbar | App nicht veröffentlicht oder der verfügbare Bereich umfasst das Mitglied nicht | Erstellen und veröffentlichen Sie auf der offenen Plattform eine Version, passen Sie den verfügbaren Bereich an; suchen Sie nach dem App-Namen |
| Feishu-QR-Code gescannt, aber es wurde eine Lark-App erstellt | Das scannende Konto gehört zu einem Lark-Mandanten, das System hat die Autorisierungsdomäne automatisch gewechselt | Normales Verhalten; suchen Sie in Lark nach dem App-Namen |
| DingTalk-Rückruf 401 | App Secret falsch; Header durch Proxy entfernt; Serverzeit weicht um mehr als 1 Stunde ab | Prüfen Sie das App Secret der App (nicht den Signaturschlüssel); behalten Sie `timestamp`, `sign` bei; synchronisieren Sie per NTP |
| DingTalk-Antwort mit Zeitüberschreitung / Fehler | `sessionWebhook` ist abgelaufen | Senden Sie den Befehl erneut; stellen Sie sicher, dass der Rückruf innerhalb von Sekunden abgeschlossen ist |
| DingTalk Stream verbindet dauerhaft nicht / Störung | Client ID / Secret falsch; Bot hat den Stream-Modus nicht gewählt; App nicht veröffentlicht; Server kann `api.dingtalk.com` nicht ausgehend erreichen | Prüfen Sie die Anmeldedaten; wählen Sie in der Bot-Konfiguration Stream und veröffentlichen Sie eine Version; prüfen Sie das ausgehende Netzwerk |
| DingTalk-QR-Code meldet Autorisierungsfehler | Scannendes Konto hat keine Entwicklerberechtigung; QR-Code abgelaufen; gewähltes Unternehmen erlaubt keine App-Erstellung; Vorlage der Autorisierungsseite konnte nicht geladen werden | Prüfen Sie, ob das Konto im Zielunternehmen Entwicklerberechtigungen hat; erzeugen Sie den QR-Code neu; verwenden Sie ein Unternehmen mit Berechtigung; prüfen Sie bei weiterem Fehlschlag die Ursache „DingTalk-QR-Code-Autorisierung fehlgeschlagen“ in den Dienstlogs |
| DingTalk-Bot antwortet nach dem Scannen nicht | App nicht veröffentlicht oder der verfügbare Bereich umfasst das Mitglied nicht; Bot nicht zur Unterhaltung hinzugefügt; Stream-Verbindung nicht aufgebaut | Veröffentlichen Sie die App und passen Sie den verfügbaren Bereich an; prüfen Sie den Verbindungsstatus auf der Bot-Karte; senden Sie den Befehl erneut |
| DingTalk-/Feishu-Benutzer erhalten den Hinweis „nicht autorisiert“ | Der Plattformbenutzer steht nicht in der Allowlist und wurde noch nicht über die Webseite autorisiert | Lassen Sie den Benutzer einen beliebigen Befehl senden, um den Autorisierungslink zu erhalten; das Konto des Bots genehmigt nach Anmeldung auf der Webseite, oder der Benutzer wird direkt in die Allowlist aufgenommen |
| WeCom-Langzeitverbindung nicht verbunden / Störung | Bot ID oder Secret falsch; Server kann `openws.work.weixin.qq.com:443` nicht ausgehend erreichen; eine andere Instanz verwendet denselben Bot; Bot deaktiviert | Prüfen Sie Bot ID / Secret; prüfen Sie ausgehende Firewall und Proxy; stellen Sie sicher, dass keine doppelte Bereitstellung läuft; prüfen Sie Status und Fehlermeldung auf der Bot-Karte |
| Keine Antwort auf WeCom-Nachrichten | Langzeitverbindung getrennt; Nachricht außerhalb des 24-Stunden-Antwortfensters; Bot während der Verarbeitung deaktiviert oder gelöscht | Prüfen Sie den Status der Langzeitverbindung; senden Sie den Befehl erneut; stellen Sie sicher, dass der Bot aktiviert bleibt |
| WeCom meldet, die Verbindung wurde ersetzt | Für dieselbe Bot ID wurde eine neue Verbindung aufgebaut, die alte wurde von WeCom getrennt | Betreiben Sie pro Bot nur eine laufende Instanz; stoppen Sie doppelt bereitgestellte Dienste oder deaktivieren und reaktivieren Sie den Bot im System |
| Befehl ohne Reaktion | In der Gruppe wurde der Bot nicht mit @ erwähnt; Nachricht ist kein Text; sie beginnt nicht mit `/`; Benutzer nicht in der Allowlist | Erwähnen Sie den Bot in der Gruppe mit @; senden Sie `/help`; nehmen Sie die Plattform-Benutzer-ID in die Allowlist auf |
| Auch der Scanner selbst hat keine Befehlsrechte | Die Eigentümer-ID dient nur der Kennzeichnung und gewährt keine impliziten Rechte mehr | Geben Sie Ihr eigenes Plattformkonto auf der Web-Autorisierungsseite frei, oder lassen Sie das Konto des Bots Ihre Plattform-ID in die Allowlist aufnehmen |
| Konflikt beim Erstellen eines Bots | Auf derselben Plattform existiert bereits ein aktiver Bot | Deaktivieren Sie zuerst den alten Bot und aktivieren Sie dann den neuen |
| Test des Benachrichtigungskanals schlägt fehl | Webhook ungültig, Signaturschlüssel falsch, Einschränkung durch Schlüsselwort / IP-Whitelist | Kopieren Sie den Webhook erneut; prüfen Sie den Signaturschlüssel; prüfen Sie die Sicherheitseinstellungen der Plattform |
| Keine Ereignisbenachrichtigungen in der Gruppe | Kanal deaktiviert, Ereignistyp nicht ausgewählt, Gruppen-Bot wurde entfernt | Prüfen Sie Kanalstatus und Ereignisabonnement; senden Sie die Testnachricht erneut |
| Bot pusht keine Ereignisbenachrichtigungen | „Ereignisbenachrichtigungen empfangen“ nicht aktiviert; keine aktuelle autorisierte Unterhaltung; bei DingTalk fehlen App Key / Robot Code; Bot deaktiviert | Bearbeiten Sie den Bot und aktivieren Sie Benachrichtigungen; lassen Sie einen autorisierten Benutzer zuerst einen Befehl senden; vervollständigen Sie die DingTalk-Anmeldedaten; prüfen Sie das Zustellprotokoll |
| Feishu / Lark / DingTalk pusht dieselbe Nachricht mehrfach | Plattform hat das ACK nicht rechtzeitig erhalten oder Netzwerkschwankung | Das System dedupliziert anhand der Nachrichten-ID; stellen Sie sicher, dass der Rückruf innerhalb von 10 Sekunden antwortet |

### Empfehlungen zur Fehlersuche

1. Verwenden Sie zunächst **Befehl simulieren** auf der Karte „Befehls-Bots“, um den Befehl lokal in der Rolle des Bot-Eigentümers auszuführen und Befehlslogik und Kontingent zu prüfen.
2. Prüfen Sie anschließend mit **Test senden** unter „Benachrichtigungskanäle“ Webhook und Signatur.
3. Senden Sie abschließend `/help` im Chat der Plattform, um Rückruf / Langzeitverbindung, Berechtigungen und Antwortkette zu prüfen.
4. Prüfen Sie die Container-Logs: `docker compose logs -f steam-monitor`, achten Sie auf Logs zu `wecom`, `webhook`, `inbound`, `delivery`.

---

## 6. Sicherheitsempfehlungen

- Behandeln Sie Feishu-/Lark-/DingTalk-Rückrufadressen, Gruppen-Bot-Webhooks und WeCom-Bot-ID / Secret als Anmeldedaten und übertragen Sie sie nicht in öffentliche Repositories oder öffentliche Gruppen.
- Für Feishu-/Lark-HTTP-Rückrufe wird die Aktivierung von Encrypt Key + Verification Token empfohlen; auch die Anmeldedaten der Langzeitverbindung müssen geheim bleiben. Bei DingTalk-HTTP-Rückrufen muss das App Secret zur Signaturprüfung eingetragen werden, und auch im Stream-Modus muss das Client Secret geschützt werden; bei WeCom müssen Bot ID und das Secret der Langzeitverbindung geschützt werden.
- Die Allowlist folgt dem Prinzip der minimalen Rechte: normale Mitglieder verwenden `viewer`, nur Administratoren verwenden `admin`.
- Stellen Sie die SQLite-Datei nicht im öffentlichen Internet bereit; sichern Sie die Datenbank regelmäßig und sichern Sie gleichzeitig das `APP_SECRET` aus `.env`.
- Nach einer Änderung von `PUBLIC_BASE_URL` oder einem Domainwechsel aktualisieren Sie zeitnah die Rückrufadressen im Feishu-/Lark-/DingTalk-Backend; der Langzeitverbindungsmodus ist nicht betroffen.
- Bei Verdacht auf offengelegte Anmeldedaten: Bei Feishu / Lark App Secret / Encrypt Key zurücksetzen, bei DingTalk das Client Secret zurücksetzen, bei WeCom das Secret des KI-Bots neu erzeugen und im System erneut eintragen.

---

## 7. Offizielle Dokumentation

- Feishu: Ereignisabonnement und Konfiguration der Anforderungsadresse: <https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case>
- Feishu: App in einem Schritt erstellen: <https://open.feishu.cn/document/mcp_open_tools/scan-to-create-an-app-in-one-click>
- Feishu: Benutzerdefinierter Bot: <https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot>
- Lark: Ereignisabonnement und Konfiguration der Anforderungsadresse: <https://open.larksuite.com/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case>
- Lark: App in einem Schritt erstellen: <https://open.larksuite.com/document/mcp_open_tools/scan-to-create-an-app-in-one-click>
- DingTalk: Nachrichten mit Bots empfangen: <https://open.dingtalk.com/document/orgapp/receive-message>
- DingTalk: Stream-Modus: <https://open.dingtalk.com/document/development/stream>
- DingTalk: Intelligente Agent-App in einem Schritt erstellen: <https://open.dingtalk.com/document/development/create-dingtalk-intelligent-agent-application>
- DingTalk: Benutzerdefinierter Bot: <https://open.dingtalk.com/document/orgapp/custom-robot-access>
- WeCom: Langzeitverbindung des KI-Bots: <https://developer.work.weixin.qq.com/document/path/101463>
- WeCom: Antwortnachrichten des KI-Bots: <https://developer.work.weixin.qq.com/document/path/101836>
- WeCom: Gruppen-Bot: <https://developer.work.weixin.qq.com/document/path/91770>

Einstiegspunkte in den Plattform-Backends:

- Feishu Open Platform: <https://open.feishu.cn/app>
- Lark Open Platform: <https://open.larksuite.com/app>
- DingTalk Open Platform: <https://open.dingtalk.com/>
- WeCom-Verwaltungsbackend: <https://work.weixin.qq.com/>

> Menüs und Berechtigungsbezeichnungen in den Plattform-Backends können sich je nach Version ändern; maßgeblich sind die offizielle Dokumentation und die tatsächliche Konsole.
