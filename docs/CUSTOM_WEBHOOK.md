# 自定义 WebHook 渠道

「通知渠道 → 自定义 WebHook」可以把监控事件以 JSON 形式 POST 到任意 HTTPS 接口，适合接入自建服务、自动化平台或消息网关。

## 配置字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| 名称 | 是 | 仅用于系统内识别 |
| WebHook 地址 | 是 | 接收通知的 HTTPS 地址，不能指向本机或内网 |
| HMAC 签名密钥 | 否 | 设置后请求会携带签名头，用于接收端校验来源和完整性 |
| Authorization 头 | 否 | 原样作为 `Authorization` 请求头发送，例如 `Bearer <token>` |

> 仅在测试环境设置 `ALLOW_INSECURE_WEBHOOKS=1` 时才允许 HTTP 或内网地址。生产环境请使用公网 HTTPS 地址。

## 请求格式

系统使用 `POST`，请求体为 JSON：

```http
POST /your-endpoint HTTP/1.1
Content-Type: application/json
User-Agent: SteamGames-Monitor/1.0
X-SGM-Event: sale_start
X-SGM-Timestamp: 1793330000000
X-SGM-Signature: sha256=<hex hmac>
Authorization: Bearer <optional token>
```

事件 Payload 示例：

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

测试消息的 `kind` 为 `"test"`，`eventId`、`eventType`、`severity`、`monitor` 为 `null`，`data` 为 `{}`。

- `eventType` 与系统事件类型一致，例如 `release`、`sale_start`、`sale_change`、`sale_end`、`delisting_warning`、`delisted`。
- `data` 保留事件原始附加字段，不同事件类型字段不同。
- 事件过滤规则与其他通知渠道一致；未选择事件时接收除 `check_error` 外的全部事件。

## HMAC 签名校验

如果配置了签名密钥，系统会发送：

```text
X-SGM-Timestamp: <毫秒时间戳>
X-SGM-Signature: sha256=<hex>
```

签名计算方式：

```text
hex = HMAC-SHA256(secret, timestamp + "." + rawRequestBody)
```

Node.js 校验示例：

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

请直接使用平台收到的**原始请求体**计算签名，不要先反序列化再重新序列化。建议同时限制时间戳与当前时间的偏差（例如 5 分钟），防止重放。

## 响应与重试

- 任意 `2xx` 响应视为发送成功。
- `408`、`425`、`429`、`5xx` 或网络错误会按投递队列策略重试。
- 其他 `4xx` 视为永久失败，不再重试。
- 单个请求超时时间为 15 秒。

## 安全建议

- 使用公网 HTTPS 地址；不要把 WebHook 地址、签名密钥或 Authorization 头发到公开仓库。
- 接收端应校验签名（如已配置）并限制重复请求。
- 签名密钥和 Authorization 头在系统中使用 `APP_SECRET` 派生的密钥加密保存，编辑时留空表示保留原值。
- 如果服务部署在内网并通过代理访问外部接口，请确保出站网络允许访问目标地址。

## 相关文件

- 配置示例和类型定义：`shared/schemas/index.ts`、`server/notify/types.ts`
- WebHook 发送实现：`server/notify/transports/webhook.ts`
- 事件 Payload 生成：`server/notify/render.ts`
