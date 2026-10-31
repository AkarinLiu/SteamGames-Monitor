# Aangepast WebHook-kanaal

[简体中文](CUSTOM_WEBHOOK.md) | [繁體中文](CUSTOM_WEBHOOK.zh-TW.md) | [English](CUSTOM_WEBHOOK.en.md) | [Deutsch](CUSTOM_WEBHOOK.de.md) | [Français](CUSTOM_WEBHOOK.fr.md) | [Italiano](CUSTOM_WEBHOOK.it.md) | [日本語](CUSTOM_WEBHOOK.ja.md) | [한국어](CUSTOM_WEBHOOK.ko.md) | [조선어](CUSTOM_WEBHOOK.ko-KP.md) | [Nederlands](CUSTOM_WEBHOOK.nl.md) | [Русский](CUSTOM_WEBHOOK.ru.md)

[← Terug naar de README](../README.nl.md)

Met "Notificatiekanalen → Aangepaste WebHook" kan het systeem monitorgebeurtenissen als JSON via POST naar een willekeurig HTTPS-endpoint sturen; dit is geschikt voor het aansluiten op eigen services, automatiseringsplatformen of berichtgateways.

## Configuratievelden

| Veld                      | Verplicht | Beschrijving                                                                                                            |
| ------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| Naam                      | Ja        | Alleen voor identificatie binnen het systeem                                                                             |
| WebHook-adres             | Ja        | HTTPS-adres dat de meldingen ontvangt; mag niet naar de lokale machine of het intranet wijzen                            |
| HMAC-handtekeningsleutel  | Nee       | Na instelling bevat het verzoek een handtekeningheader waarmee de ontvanger de herkomst en integriteit kan controleren   |
| Authorization-header      | Nee       | Wordt ongewijzigd als `Authorization`-header verzonden, bijvoorbeeld `Bearer <token>`                                    |

> Alleen wanneer u in een testomgeving `ALLOW_INSECURE_WEBHOOKS=1` instelt, zijn HTTP- of intranetadressen toegestaan. Gebruik in productie een openbaar HTTPS-adres.

## Requestformaat

Het systeem gebruikt `POST` met een JSON-requestbody:

```http
POST /your-endpoint HTTP/1.1
Content-Type: application/json
User-Agent: SteamGames-Monitor/1.0
X-SGM-Event: sale_start
X-SGM-Timestamp: 1793330000000
X-SGM-Signature: sha256=<hex hmac>
Authorization: Bearer <optional token>
```

Voorbeeld van een gebeurtenis-payload:

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

Bij een testbericht is `kind` gelijk aan `"test"`, zijn `eventId`, `eventType`, `severity` en `monitor` `null` en is `data` gelijk aan `{}`.

- `eventType` komt overeen met de gebeurtenistypen van het systeem, bijvoorbeeld `release`, `sale_start`, `sale_change`, `sale_end`, `delisting_warning`, `delisted`.
- `data` bevat de oorspronkelijke aanvullende velden van de gebeurtenis; deze velden verschillen per gebeurtenistype.
- De filterregels voor gebeurtenissen zijn gelijk aan die van de andere notificatiekanalen; als u geen gebeurtenissen selecteert, ontvangt u alle gebeurtenissen behalve `check_error`.

## HMAC-handtekeningvalidatie

Als een handtekeningsleutel is geconfigureerd, verzendt het systeem:

```text
X-SGM-Timestamp: <tijdstempel in milliseconden>
X-SGM-Signature: sha256=<hex>
```

Berekening van de handtekening:

```text
hex = HMAC-SHA256(secret, timestamp + "." + rawRequestBody)
```

Voorbeeld van validatie in Node.js:

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

Bereken de handtekening rechtstreeks over de **oorspronkelijke requestbody** die u ontvangt en deserialiseer deze niet eerst om hem daarna opnieuw te serialiseren. Beperk daarnaast bij voorkeur de afwijking tussen de tijdstempel en de huidige tijd (bijvoorbeeld 5 minuten) om replay te voorkomen.

## Responses en retries

- Elke `2xx`-respons geldt als een succesvolle verzending.
- `408`, `425`, `429`, `5xx` of netwerkfouten worden volgens het beleid van de afleverwachtrij opnieuw geprobeerd.
- Overige `4xx` gelden als een definitieve fout en worden niet opnieuw geprobeerd.
- De timeout per verzoek is 15 seconden.

## Veiligheidsadviezen

- Gebruik een openbaar HTTPS-adres; plaats het WebHook-adres, de handtekeningsleutel of de Authorization-header niet in een openbare repository.
- De ontvangende partij moet de handtekening valideren (indien geconfigureerd) en dubbele verzoeken beperken.
- De handtekeningsleutel en de Authorization-header worden in het systeem versleuteld opgeslagen met een uit `APP_SECRET` afgeleide sleutel; een leeg veld bij het bewerken betekent dat de bestaande waarde behouden blijft.
- Als de service in een intranet wordt geïmplementeerd en externe endpoints via een proxy bereikt, zorg er dan voor dat het uitgaande netwerk toegang tot het doeladres toestaat.

## Gerelateerde bestanden

- Configuratievoorbeelden en typedefinities: `shared/schemas/index.ts`, `server/notify/types.ts`
- Implementatie van het verzenden van WebHooks: `server/notify/transports/webhook.ts`
- Genereren van de gebeurtenis-payload: `server/notify/render.ts`
