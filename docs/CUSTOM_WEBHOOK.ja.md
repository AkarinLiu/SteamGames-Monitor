# カスタム WebHook チャネル

[简体中文](CUSTOM_WEBHOOK.md) | [繁體中文](CUSTOM_WEBHOOK.zh-TW.md) | [English](CUSTOM_WEBHOOK.en.md) | [Deutsch](CUSTOM_WEBHOOK.de.md) | [Français](CUSTOM_WEBHOOK.fr.md) | [Italiano](CUSTOM_WEBHOOK.it.md) | [日本語](CUSTOM_WEBHOOK.ja.md) | [한국어](CUSTOM_WEBHOOK.ko.md) | [조선어](CUSTOM_WEBHOOK.ko-KP.md) | [Nederlands](CUSTOM_WEBHOOK.nl.md) | [Русский](CUSTOM_WEBHOOK.ru.md)

[README に戻る](../README.ja.md)

「通知チャネル → カスタム WebHook」では、監視イベントを JSON 形式で任意の HTTPS エンドポイントに POST できます。自前のサービス、自動化プラットフォーム、メッセージゲートウェイとの連携に適しています。

## 設定フィールド

| フィールド | 必須 | 説明 |
| --- | --- | --- |
| 名前 | はい | システム内での識別のみに使用 |
| WebHook アドレス | はい | 通知を受け取る HTTPS アドレス。ローカルホストや内部ネットワークは指定できません |
| HMAC 署名シークレット | いいえ | 設定するとリクエストに署名ヘッダーが付与され、受信側で送信元と完全性を検証できます |
| Authorization ヘッダー | いいえ | そのまま `Authorization` リクエストヘッダーとして送信されます（例：`Bearer <token>`） |

> HTTP または内部ネットワークのアドレスは、テスト環境で `ALLOW_INSECURE_WEBHOOKS=1` を設定した場合にのみ許可されます。本番環境では公開 HTTPS アドレスを使用してください。

## リクエスト形式

システムは `POST` を使用し、リクエストボディは JSON です：

```http
POST /your-endpoint HTTP/1.1
Content-Type: application/json
User-Agent: SteamGames-Monitor/1.0
X-SGM-Event: sale_start
X-SGM-Timestamp: 1793330000000
X-SGM-Signature: sha256=<hex hmac>
Authorization: Bearer <optional token>
```

イベント Payload の例：

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

テストメッセージの `kind` は `"test"` で、`eventId`、`eventType`、`severity`、`monitor` は `null`、`data` は `{}` です。

- `eventType` はシステムのイベントタイプと一致します（例：`release`、`sale_start`、`sale_change`、`sale_end`、`delisting_warning`、`delisted`）。
- `data` にはイベント固有の追加フィールドが保持され、イベントタイプによってフィールドが異なります。
- イベントのフィルタリングルールは他の通知チャネルと同じです。イベントを選択しない場合は `check_error` 以外のすべてのイベントを受信します。

## HMAC 署名の検証

署名シークレットを設定した場合、システムは次を送信します：

```text
X-SGM-Timestamp: <ミリ秒タイムスタンプ>
X-SGM-Signature: sha256=<hex>
```

署名の計算方法：

```text
hex = HMAC-SHA256(secret, timestamp + "." + rawRequestBody)
```

Node.js での検証例：

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

署名の計算には、プラットフォームが受信した**元のリクエストボディ**をそのまま使用してください。先にデシリアライズしてから再シリアライズしないでください。リプレイ攻撃を防ぐため、タイムスタンプと現在時刻の差を制限すること（例：5 分）も併せて推奨します。

## レスポンスと再試行

- 任意の `2xx` レスポンスを送信成功とみなします。
- `408`、`425`、`429`、`5xx`、またはネットワークエラーの場合は、配信キューのポリシーに従って再試行します。
- その他の `4xx` は永続的な失敗とみなし、再試行しません。
- 1 リクエストあたりのタイムアウトは 15 秒です。

## セキュリティの推奨事項

- 公開 HTTPS アドレスを使用してください。WebHook アドレス、署名シークレット、Authorization ヘッダーを公開リポジトリに投稿しないでください。
- 受信側では署名を検証し（設定している場合）、重複リクエストを制限する必要があります。
- 署名シークレットと Authorization ヘッダーは、システム内で `APP_SECRET` から導出した鍵により暗号化して保存されます。編集時に空欄にすると元の値が保持されます。
- サービスが内部ネットワークにデプロイされ、プロキシ経由で外部エンドポイントにアクセスする場合は、アウトバウンドネットワークが対象アドレスへのアクセスを許可していることを確認してください。

## 関連ファイル

- 設定例と型定義：`shared/schemas/index.ts`、`server/notify/types.ts`
- WebHook 送信の実装：`server/notify/transports/webhook.ts`
- イベント Payload の生成：`server/notify/render.ts`
