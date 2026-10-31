# Benutzerdefinierter WebHook-Kanal

[简体中文](CUSTOM_WEBHOOK.md) | [繁體中文](CUSTOM_WEBHOOK.zh-TW.md) | [English](CUSTOM_WEBHOOK.en.md) | [Deutsch](CUSTOM_WEBHOOK.de.md) | [Français](CUSTOM_WEBHOOK.fr.md) | [Italiano](CUSTOM_WEBHOOK.it.md) | [日本語](CUSTOM_WEBHOOK.ja.md) | [한국어](CUSTOM_WEBHOOK.ko.md) | [조선어](CUSTOM_WEBHOOK.ko-KP.md) | [Nederlands](CUSTOM_WEBHOOK.nl.md) | [Русский](CUSTOM_WEBHOOK.ru.md)

[Zurück zur README](../README.de.md)

Unter „Benachrichtigungskanäle → Benutzerdefinierter WebHook“ können Sie Überwachungsereignisse als JSON per POST an eine beliebige HTTPS-Schnittstelle senden. Dies eignet sich für eigene Dienste, Automatisierungsplattformen oder Nachrichten-Gateways.

## Konfigurationsfelder

| Feld | Pflichtfeld | Beschreibung |
| --- | --- | --- |
| Name | Ja | Dient nur der Identifikation im System |
| WebHook-Adresse | Ja | HTTPS-Adresse für den Empfang der Benachrichtigungen; darf nicht auf den lokalen Rechner oder ins Intranet zeigen |
| HMAC-Signaturschlüssel | Nein | Wenn gesetzt, enthält die Anforderung einen Signatur-Header, mit dem der Empfänger Quelle und Integrität prüfen kann |
| Authorization-Header | Nein | Wird unverändert als `Authorization`-Header gesendet, z. B. `Bearer <token>` |

> HTTP- oder Intranetadressen sind nur zulässig, wenn in einer Testumgebung `ALLOW_INSECURE_WEBHOOKS=1` gesetzt ist. Verwenden Sie in der Produktion öffentliche HTTPS-Adressen.

## Anforderungsformat

Das System verwendet `POST`, der Request-Body ist JSON:

```http
POST /your-endpoint HTTP/1.1
Content-Type: application/json
User-Agent: SteamGames-Monitor/1.0
X-SGM-Event: sale_start
X-SGM-Timestamp: 1793330000000
X-SGM-Signature: sha256=<hex hmac>
Authorization: Bearer <optional token>
```

Beispiel für ein Ereignis-Payload:

```json
{
  "source": "steamgames-monitor",
  "version": 1,
  "kind": "event",
  "eventId": 123,
  "eventType": "sale_start",
  "severity": "info",
  "title": "【促销开始】赛博朋克 2077",
  "text": "【促销开始】赛博朋克 2077\n当前价格：¥149.00（-50%）...",
  "markdown": "**【促销开始】赛博朋克 2077**\n...",
  "html": "<div>...</div>",
  "monitor": {
    "id": 1,
    "appid": 1091500,
    "name": "赛博朋克 2077",
    "storeUrl": "https://store.steampowered.com/app/1091500/",
    "region": "cn",
    "language": "schinese"
  },
  "data": {
    "discountPercent": 50,
    "priceInitialFormatted": "¥298.00",
    "priceFinalFormatted": "¥149.00"
  },
  "createdAt": 1793330000000,
  "timestamp": "2026-10-30T05:00:00.000Z"
}
```

Bei einer Testnachricht ist `kind` gleich `"test"`, `eventId`, `eventType`, `severity` und `monitor` sind `null`, und `data` ist `{}`.

- `eventType` entspricht den Ereignistypen des Systems, z. B. `release`, `sale_start`, `sale_change`, `sale_end`, `delisting_warning`, `delisted`.
- `data` enthält die ursprünglichen Zusatzfelder des Ereignisses; je nach Ereignistyp sind die Felder unterschiedlich.
- Die Regeln zur Ereignisfilterung entsprechen denen der anderen Benachrichtigungskanäle; wenn keine Ereignisse ausgewählt sind, werden alle Ereignisse außer `check_error` empfangen.

## HMAC-Signaturprüfung

Wenn ein Signaturschlüssel konfiguriert ist, sendet das System:

```text
X-SGM-Timestamp: <Zeitstempel in Millisekunden>
X-SGM-Signature: sha256=<hex>
```

Berechnung der Signatur:

```text
hex = HMAC-SHA256(secret, timestamp + "." + rawRequestBody)
```

Beispiel zur Prüfung in Node.js:

```js
import { createHmac, timingSafeEqual } from 'node:crypto'

function verifyWebhook(req, secret) {
  const timestamp = req.headers['x-sgm-timestamp']
  const signature = req.headers['x-sgm-signature']
  if (!timestamp || !signature) return false

  const expected = `sha256=${createHmac('sha256', secret)
    .update(`${timestamp}.${req.rawBody}`)
    .digest('hex')}`

  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}
```

Berechnen Sie die Signatur direkt über den **unveränderten Request-Body**, den die Plattform empfängt, und deserialisieren Sie ihn nicht, um ihn anschließend neu zu serialisieren. Es wird empfohlen, zusätzlich die Abweichung zwischen Zeitstempel und aktueller Zeit zu begrenzen (z. B. 5 Minuten), um Replay-Angriffe zu verhindern.

## Antwort und Wiederholungen

- Jede `2xx`-Antwort gilt als erfolgreich gesendet.
- Bei `408`, `425`, `429`, `5xx` oder Netzwerkfehlern wird gemäß der Strategie der Zustellwarteschlange erneut versucht.
- Andere `4xx` gelten als dauerhafter Fehler und werden nicht erneut versucht.
- Die Zeitüberschreitung für eine einzelne Anforderung beträgt 15 Sekunden.

## Sicherheitsempfehlungen

- Verwenden Sie öffentliche HTTPS-Adressen; übertragen Sie WebHook-Adresse, Signaturschlüssel und Authorization-Header nicht in öffentliche Repositories.
- Der Empfänger sollte die Signatur prüfen (sofern konfiguriert) und doppelte Anforderungen begrenzen.
- Signaturschlüssel und Authorization-Header werden im System mit einem aus `APP_SECRET` abgeleiteten Schlüssel verschlüsselt gespeichert; ein leeres Feld beim Bearbeiten bedeutet, dass der bisherige Wert beibehalten wird.
- Wenn der Dienst im Intranet läuft und über einen Proxy auf externe Schnittstellen zugreift, stellen Sie sicher, dass das ausgehende Netzwerk den Zugriff auf die Zieladresse erlaubt.

## Relevante Dateien

- Konfigurationsbeispiele und Typdefinitionen: `shared/schemas/index.ts`, `server/notify/types.ts`
- Implementierung des WebHook-Versands: `server/notify/transports/webhook.ts`
- Erzeugung des Ereignis-Payloads: `server/notify/render.ts`
