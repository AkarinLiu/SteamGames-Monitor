# 리용자정의 WebHook 경로

[简体中文](CUSTOM_WEBHOOK.md) | [繁體中文](CUSTOM_WEBHOOK.zh-TW.md) | [English](CUSTOM_WEBHOOK.en.md) | [Deutsch](CUSTOM_WEBHOOK.de.md) | [Français](CUSTOM_WEBHOOK.fr.md) | [Italiano](CUSTOM_WEBHOOK.it.md) | [日本語](CUSTOM_WEBHOOK.ja.md) | [한국어](CUSTOM_WEBHOOK.ko.md) | [조선어](CUSTOM_WEBHOOK.ko-KP.md) | [Nederlands](CUSTOM_WEBHOOK.nl.md) | [Русский](CUSTOM_WEBHOOK.ru.md)

[← README.ko-KP.md로 돌아가기](../README.ko-KP.md)

《통지경로 → 리용자정의 WebHook》에서는 감시사건을 JSON 형식으로 임의의 HTTPS 인터페히스에 POST할수 있으며, 자체 구축 봉사, 자동화플래트홈 또는 메쓰지게트웨이에 련결하는데 적합합니다.

## 설정항목

| 항목 | 필수 | 설명 |
| --- | --- | --- |
| 이름 | 예 | 체계안에서 식별하는데만 리용 |
| WebHook주소 | 예 | 통지를 받을 HTTPS주소이며, 본기 또는 내부망을 가리킬수 없음 |
| HMAC서명키 | 아니오 | 설정하면 요청에 서명머리가 붙으며, 접수측에서 출처와 완전성을 검증하는데 리용 |
| Authorization머리 | 아니오 | 그대로 `Authorization` 요청머리로 보내며, 례를 들면 `Bearer <token>` |

> 시험환경에서만 `ALLOW_INSECURE_WEBHOOKS=1`을 설정한 경우에 HTTP 또는 내부망주소를 허용합니다. 생산환경에서는 공용망 HTTPS주소를 리용하십시오.

## 요청형식

체계는 `POST`를 리용하며 요청본체는 JSON입니다.

```http
POST /your-endpoint HTTP/1.1
Content-Type: application/json
User-Agent: SteamGames-Monitor/1.0
X-SGM-Event: sale_start
X-SGM-Timestamp: 1793330000000
X-SGM-Signature: sha256=<hex hmac>
Authorization: Bearer <optional token>
```

사건 Payload 례:

```json
{
  "source": "steamgames-monitor",
  "version": 1,
  "kind": "event",
  "eventId": 123,
  "eventType": "sale_start",
  "severity": "info",
  "title": "【할인개시】사이버펑크 2077",
  "text": "【할인개시】사이버펑크 2077\n현재가격: ¥149.00 (-50%)...",
  "markdown": "**【할인개시】사이버펑크 2077**\n...",
  "html": "<div>...</div>",
  "monitor": {
    "id": 1,
    "appid": 1091500,
    "name": "사이버펑크 2077",
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

시험메쓰지의 `kind`는 `"test"`이고, `eventId`, `eventType`, `severity`, `monitor`는 `null`이며, `data`는 `{}`입니다.

- `eventType`은 체계의 사건류형과 같으며, 례를 들면 `release`, `sale_start`, `sale_change`, `sale_end`, `delisting_warning`, `delisted`입니다.
- `data`는 사건의 원시부가항목을 보존하며, 사건류형에 따라 항목이 다릅니다.
- 사건여과규칙은 다른 통지경로와 같습니다. 사건을 선택하지 않으면 `check_error`를 제외한 모든 사건을 받습니다.

## HMAC서명검증

서명키를 설정한 경우 체계는 다음을 보냅니다.

```text
X-SGM-Timestamp: <밀리초타임스탬프>
X-SGM-Signature: sha256=<hex>
```

서명계산방식:

```text
hex = HMAC-SHA256(secret, timestamp + "." + rawRequestBody)
```

Node.js 검증례:

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

반드시 플래트홈이 받은 **원시요청본체**로 서명을 계산하고, 먼저 반직렬화한 다음 다시 직렬화하지 마십시오. 또한 타임스탬프와 현재시간의 차이를 제한하여(례를 들면 5분) 재전송을 방지할것을 권장합니다.

## 응답과 재시도

- 임의의 `2xx` 응답은 발송성공으로 간주합니다.
- `408`, `425`, `429`, `5xx` 또는 네트웍오유는 전달대기렬의 책략에 따라 재시도합니다.
- 기타 `4xx`는 영구실패로 간주하여 재시도하지 않습니다.
- 단일요청의 초과시간은 15초입니다.

## 안전권장

- 공용망 HTTPS주소를 리용하십시오. WebHook주소, 서명키 또는 Authorization머리를 공개원천저장소에 올리지 마십시오.
- 접수측에서는 서명을 검증하고(설정한 경우) 중복요청을 제한하여야 합니다.
- 서명키와 Authorization머리는 체계안에서 `APP_SECRET`으로부터 파생한 키로 암호화하여 보관하며, 편집할 때 비워두면 원래값을 보존한다는 뜻입니다.
- 봉사가 내부망에 전개되여 프록시를 거쳐 외부인터페히스에 접근하는 경우, 출발네트웍에서 목표주소에 대한 접근이 허용되여있는지 확인하십시오.

## 관련화일

- 설정례와 타입정의: `shared/schemas/index.ts`, `server/notify/types.ts`
- WebHook발송실현: `server/notify/transports/webhook.ts`
- 사건 Payload생성: `server/notify/render.ts`
