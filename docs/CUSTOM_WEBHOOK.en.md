# Custom WebHook Channel

[简体中文](CUSTOM_WEBHOOK.md) | [繁體中文](CUSTOM_WEBHOOK.zh-TW.md) | [English](CUSTOM_WEBHOOK.en.md) | [Deutsch](CUSTOM_WEBHOOK.de.md) | [Français](CUSTOM_WEBHOOK.fr.md) | [Italiano](CUSTOM_WEBHOOK.it.md) | [日本語](CUSTOM_WEBHOOK.ja.md) | [한국어](CUSTOM_WEBHOOK.ko.md) | [조선어](CUSTOM_WEBHOOK.ko-KP.md) | [Nederlands](CUSTOM_WEBHOOK.nl.md) | [Русский](CUSTOM_WEBHOOK.ru.md)

[Back to README](../README.en.md)

"Notification channels → Custom WebHook" lets you POST monitor events as JSON to any HTTPS endpoint, which is suitable for integrating self-hosted services, automation platforms, or message gateways.

## Configuration fields

| Field | Required | Description |
| --- | --- | --- |
| Name | Yes | For identification inside the system only |
| WebHook URL | Yes | HTTPS address that receives notifications; must not point to the local machine or an intranet address |
| HMAC signing secret | No | When set, requests carry a signature header so the receiver can verify the source and integrity |
| Authorization header | No | Sent as-is in the `Authorization` request header, e.g. `Bearer <token>` |

> HTTP or intranet addresses are allowed only when `ALLOW_INSECURE_WEBHOOKS=1` is set in a test environment. Use public HTTPS addresses in production.

## Request format

The system uses `POST` with a JSON request body:

```http
POST /your-endpoint HTTP/1.1
Content-Type: application/json
User-Agent: SteamGames-Monitor/1.0
X-SGM-Event: sale_start
X-SGM-Timestamp: 1793330000000
X-SGM-Signature: sha256=<hex hmac>
Authorization: Bearer <optional token>
```

Example event payload:

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

For test messages, `kind` is `"test"`, `eventId`, `eventType`, `severity`, and `monitor` are `null`, and `data` is `{}`.

- `eventType` matches the system event types, e.g. `release`, `sale_start`, `sale_change`, `sale_end`, `delisting_warning`, `delisted`.
- `data` keeps the original additional fields of the event; the fields differ by event type.
- Event filtering follows the same rules as other notification channels; when no events are selected, all events except `check_error` are received.

## HMAC signature verification

If a signing secret is configured, the system sends:

```text
X-SGM-Timestamp: <millisecond timestamp>
X-SGM-Signature: sha256=<hex>
```

The signature is computed as follows:

```text
hex = HMAC-SHA256(secret, timestamp + "." + rawRequestBody)
```

Node.js verification example:

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

Always compute the signature over the **raw request body** exactly as your endpoint received it; do not deserialize and then re-serialize it. It is recommended to also restrict the timestamp deviation from the current time (e.g. 5 minutes) to prevent replay.

## Responses and retries

- Any `2xx` response is treated as a successful delivery.
- `408`, `425`, `429`, `5xx`, or network errors are retried according to the delivery queue policy.
- Other `4xx` responses are treated as permanent failures and are not retried.
- The timeout for a single request is 15 seconds.

## Security recommendations

- Use public HTTPS addresses; do not commit WebHook URLs, signing secrets, or Authorization headers to public repositories.
- The receiver should verify the signature (if configured) and reject duplicate requests.
- Signing secrets and Authorization headers are stored encrypted in the system with a key derived from `APP_SECRET`; leaving a field empty when editing keeps the existing value.
- If the service is deployed on an intranet and accesses external endpoints through a proxy, make sure outbound networking allows the target address.

## Related files

- Configuration schema and type definitions: `shared/schemas/index.ts`, `server/notify/types.ts`
- WebHook sending implementation: `server/notify/transports/webhook.ts`
- Event payload generation: `server/notify/render.ts`
