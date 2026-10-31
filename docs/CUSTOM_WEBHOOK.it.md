# Canale WebHook personalizzato

[简体中文](CUSTOM_WEBHOOK.md) | [繁體中文](CUSTOM_WEBHOOK.zh-TW.md) | [English](CUSTOM_WEBHOOK.en.md) | [Deutsch](CUSTOM_WEBHOOK.de.md) | [Français](CUSTOM_WEBHOOK.fr.md) | [Italiano](CUSTOM_WEBHOOK.it.md) | [日本語](CUSTOM_WEBHOOK.ja.md) | [한국어](CUSTOM_WEBHOOK.ko.md) | [조선어](CUSTOM_WEBHOOK.ko-KP.md) | [Nederlands](CUSTOM_WEBHOOK.nl.md) | [Русский](CUSTOM_WEBHOOK.ru.md)

[Torna al README](../README.it.md)

«Canali di notifica → WebHook personalizzato» consente di inviare in POST gli eventi di monitoraggio in formato JSON a qualsiasi endpoint HTTPS; è la soluzione adatta all'integrazione con servizi self-hosted, piattaforme di automazione o gateway di messaggistica.

## Campi di configurazione

| Campo | Obbligatorio | Descrizione |
| --- | --- | --- |
| Nome | Sì | Utilizzato solo per l'identificazione all'interno del sistema |
| Indirizzo WebHook | Sì | Indirizzo HTTPS che riceve le notifiche; non può puntare alla macchina locale o alla rete interna |
| Chiave di firma HMAC | No | Se impostata, le richieste includono un header di firma utilizzato dal destinatario per verificare l'origine e l'integrità |
| Header Authorization | No | Inviato così com'è come header `Authorization`, ad esempio `Bearer <token>` |

> Gli indirizzi HTTP o di rete interna sono consentiti solo impostando `ALLOW_INSECURE_WEBHOOKS=1` in ambiente di test. In produzione utilizzi un indirizzo HTTPS pubblico.

## Formato della richiesta

Il sistema utilizza il metodo `POST` con corpo JSON:

```http
POST /your-endpoint HTTP/1.1
Content-Type: application/json
User-Agent: SteamGames-Monitor/1.0
X-SGM-Event: sale_start
X-SGM-Timestamp: 1793330000000
X-SGM-Signature: sha256=<hex hmac>
Authorization: Bearer <optional token>
```

Esempio di payload di un evento:

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

Il messaggio di test ha `kind` uguale a `"test"`, mentre `eventId`, `eventType`, `severity` e `monitor` sono `null` e `data` è `{}`.

- `eventType` corrisponde ai tipi di evento del sistema, ad esempio `release`, `sale_start`, `sale_change`, `sale_end`, `delisting_warning`, `delisted`.
- `data` conserva i campi aggiuntivi originali dell'evento; i campi variano in base al tipo di evento.
- Le regole di filtro degli eventi sono identiche a quelle degli altri canali di notifica; se non viene selezionato alcun evento, vengono ricevuti tutti gli eventi tranne `check_error`.

## Verifica della firma HMAC

Se è stata configurata una chiave di firma, il sistema invia:

```text
X-SGM-Timestamp: <timestamp in millisecondi>
X-SGM-Signature: sha256=<hex>
```

La firma viene calcolata nel modo seguente:

```text
hex = HMAC-SHA256(secret, timestamp + "." + rawRequestBody)
```

Esempio di verifica in Node.js:

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

Calcoli la firma utilizzando direttamente il **corpo originale della richiesta** ricevuto dalla piattaforma, senza deserializzarlo e riserializzarlo. Si consiglia inoltre di limitare lo scostamento tra il timestamp e l'ora corrente (ad esempio 5 minuti) per prevenire attacchi di replay.

## Risposta e nuovi tentativi

- Qualsiasi risposta `2xx` viene considerata un invio riuscito.
- `408`, `425`, `429`, `5xx` o errori di rete comportano un nuovo tentativo secondo i criteri della coda di consegna.
- Gli altri `4xx` sono considerati errori permanenti e non vengono ritentati.
- Il timeout di una singola richiesta è di 15 secondi.

## Suggerimenti di sicurezza

- Utilizzi un indirizzo HTTPS pubblico; non pubblichi l'indirizzo WebHook, la chiave di firma o l'header Authorization in repository pubblici.
- Il destinatario deve verificare la firma (se configurata) e limitare le richieste duplicate.
- La chiave di firma e l'header Authorization sono archiviati cifrati nel sistema con una chiave derivata da `APP_SECRET`; in fase di modifica, lasciare vuoto il campo significa mantenere il valore esistente.
- Se il servizio è distribuito in una rete interna e accede a interfacce esterne tramite proxy, verifichi che la rete in uscita consenta l'accesso all'indirizzo di destinazione.

## File correlati

- Esempi di configurazione e definizioni dei tipi: `shared/schemas/index.ts`, `server/notify/types.ts`
- Implementazione dell'invio WebHook: `server/notify/transports/webhook.ts`
- Generazione del payload degli eventi: `server/notify/render.ts`
