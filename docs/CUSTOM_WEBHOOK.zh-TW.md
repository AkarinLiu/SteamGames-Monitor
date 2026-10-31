# 自訂 WebHook 頻道

[简体中文](CUSTOM_WEBHOOK.md) | [繁體中文](CUSTOM_WEBHOOK.zh-TW.md) | [English](CUSTOM_WEBHOOK.en.md) | [Deutsch](CUSTOM_WEBHOOK.de.md) | [Français](CUSTOM_WEBHOOK.fr.md) | [Italiano](CUSTOM_WEBHOOK.it.md) | [日本語](CUSTOM_WEBHOOK.ja.md) | [한국어](CUSTOM_WEBHOOK.ko.md) | [조선어](CUSTOM_WEBHOOK.ko-KP.md) | [Nederlands](CUSTOM_WEBHOOK.nl.md) | [Русский](CUSTOM_WEBHOOK.ru.md)

[返回 README](../README.zh-TW.md)

「通知頻道 → 自訂 WebHook」可以把監控事件以 JSON 形式 POST 到任意 HTTPS 端點，適合接入自建服務、自動化平台或訊息閘道。

## 設定欄位

| 欄位 | 必填 | 說明 |
| --- | --- | --- |
| 名稱 | 是 | 僅用於系統內識別 |
| WebHook 位址 | 是 | 接收通知的 HTTPS 位址，不能指向本機或內網 |
| HMAC 簽章金鑰 | 否 | 設定後請求會攜帶簽章標頭，用於接收端驗證來源與完整性 |
| Authorization 標頭 | 否 | 原樣作為 `Authorization` 請求標頭傳送，例如 `Bearer <token>` |

> 僅在測試環境設定 `ALLOW_INSECURE_WEBHOOKS=1` 時才允許 HTTP 或內網位址。正式環境請使用公網 HTTPS 位址。

## 請求格式

系統使用 `POST`，請求主體為 JSON：

```http
POST /your-endpoint HTTP/1.1
Content-Type: application/json
User-Agent: SteamGames-Monitor/1.0
X-SGM-Event: sale_start
X-SGM-Timestamp: 1793330000000
X-SGM-Signature: sha256=<hex hmac>
Authorization: Bearer <optional token>
```

事件 Payload 範例：

```json
{
  "source": "steamgames-monitor",
  "version": 1,
  "kind": "event",
  "eventId": 123,
  "eventType": "sale_start",
  "severity": "info",
  "title": "【促銷開始】電馭叛客 2077",
  "text": "【促銷開始】電馭叛客 2077\n目前價格：¥149.00（-50%）...",
  "markdown": "**【促銷開始】電馭叛客 2077**\n...",
  "html": "<div>...</div>",
  "monitor": {
    "id": 1,
    "appid": 1091500,
    "name": "電馭叛客 2077",
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

測試訊息的 `kind` 為 `"test"`，`eventId`、`eventType`、`severity`、`monitor` 為 `null`，`data` 為 `{}`。

- `eventType` 與系統事件類型一致，例如 `release`、`sale_start`、`sale_change`、`sale_end`、`delisting_warning`、`delisted`。
- `data` 保留事件原始附加欄位，不同事件類型的欄位不同。
- 事件篩選規則與其他通知頻道一致；未選擇事件時接收除了 `check_error` 以外的全部事件。

## HMAC 簽章驗證

如果設定了簽章金鑰，系統會傳送：

```text
X-SGM-Timestamp: <毫秒時間戳>
X-SGM-Signature: sha256=<hex>
```

簽章計算方式：

```text
hex = HMAC-SHA256(secret, timestamp + "." + rawRequestBody)
```

Node.js 驗證範例：

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

請直接使用平台收到的**原始請求主體**計算簽章，不要先反序列化再重新序列化。建議同時限制時間戳與目前時間的誤差（例如 5 分鐘），以防止重送。

## 回應與重試

- 任意 `2xx` 回應視為傳送成功。
- `408`、`425`、`429`、`5xx` 或網路錯誤會依投遞佇列策略重試。
- 其他 `4xx` 視為永久失敗，不再重試。
- 單一請求逾時時間為 15 秒。

## 安全性建議

- 使用公網 HTTPS 位址；不要把 WebHook 位址、簽章金鑰或 Authorization 標頭發到公開儲存庫。
- 接收端應驗證簽章（如已設定）並限制重複請求。
- 簽章金鑰和 Authorization 標頭在系統中使用 `APP_SECRET` 衍生的金鑰加密儲存，編輯時留空表示保留原值。
- 如果服務部署在內網並透過代理存取外部 API，請確保對外網路允許存取目標位址。

## 相關檔案

- 設定範例和型別定義：`shared/schemas/index.ts`、`server/notify/types.ts`
- WebHook 傳送實作：`server/notify/transports/webhook.ts`
- 事件 Payload 產生：`server/notify/render.ts`
