# 사용자 지정 WebHook 채널

[简体中文](CUSTOM_WEBHOOK.md) | [繁體中文](CUSTOM_WEBHOOK.zh-TW.md) | [English](CUSTOM_WEBHOOK.en.md) | [Deutsch](CUSTOM_WEBHOOK.de.md) | [Français](CUSTOM_WEBHOOK.fr.md) | [Italiano](CUSTOM_WEBHOOK.it.md) | [日本語](CUSTOM_WEBHOOK.ja.md) | [한국어](CUSTOM_WEBHOOK.ko.md) | [조선어](CUSTOM_WEBHOOK.ko-KP.md) | [Nederlands](CUSTOM_WEBHOOK.nl.md) | [Русский](CUSTOM_WEBHOOK.ru.md)

[← README.ko.md로 돌아가기](../README.ko.md)

「알림 채널 → 사용자 지정 WebHook」을 사용하면 모니터링 이벤트를 JSON 형식으로 임의의 HTTPS 엔드포인트에 POST할 수 있어 자체 구축 서비스, 자동화 플랫폼, 메시지 게이트웨이에 연동하기에 적합합니다.

## 구성 필드

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| 이름 | 예 | 시스템 내 식별에만 사용 |
| WebHook 주소 | 예 | 알림을 수신할 HTTPS 주소로, 로컬 호스트나 내부 네트워크를 가리킬 수 없습니다 |
| HMAC 서명 키 | 아니요 | 설정하면 요청에 서명 헤더가 포함되어 수신 측에서 출처와 무결성을 검증할 수 있습니다 |
| Authorization 헤더 | 아니요 | `Authorization` 요청 헤더로 그대로 전송됩니다(예: `Bearer <token>`) |

> 테스트 환경에서 `ALLOW_INSECURE_WEBHOOKS=1`을 설정한 경우에만 HTTP 또는 내부 네트워크 주소를 허용합니다. 프로덕션 환경에서는 공인 HTTPS 주소를 사용하세요.

## 요청 형식

시스템은 `POST`를 사용하며 요청 본문은 JSON입니다:

```http
POST /your-endpoint HTTP/1.1
Content-Type: application/json
User-Agent: SteamGames-Monitor/1.0
X-SGM-Event: sale_start
X-SGM-Timestamp: 1793330000000
X-SGM-Signature: sha256=<hex hmac>
Authorization: Bearer <optional token>
```

이벤트 Payload 예시:

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

테스트 메시지의 `kind`는 `"test"`이고, `eventId`, `eventType`, `severity`, `monitor`는 `null`, `data`는 `{}`입니다.

- `eventType`은 시스템 이벤트 유형과 동일합니다(예: `release`, `sale_start`, `sale_change`, `sale_end`, `delisting_warning`, `delisted`).
- `data`에는 이벤트의 원본 추가 필드가 유지되며, 이벤트 유형마다 필드가 다릅니다.
- 이벤트 필터링 규칙은 다른 알림 채널과 동일합니다. 이벤트를 선택하지 않으면 `check_error`를 제외한 모든 이벤트를 수신합니다.

## HMAC 서명 검증

서명 키를 구성한 경우 시스템은 다음을 전송합니다:

```text
X-SGM-Timestamp: <밀리초 타임스탬프>
X-SGM-Signature: sha256=<hex>
```

서명 계산 방식:

```text
hex = HMAC-SHA256(secret, timestamp + "." + rawRequestBody)
```

Node.js 검증 예시:

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

서명은 플랫폼이 수신한 **원본 요청 본문**으로 직접 계산하고, 먼저 역직렬화한 뒤 다시 직렬화하지 마세요. 재생 공격을 방지하기 위해 타임스탬프와 현재 시간의 편차를 제한하는 것(예: 5분)을 함께 권장합니다.

## 응답과 재시도

- 임의의 `2xx` 응답은 전송 성공으로 간주합니다.
- `408`, `425`, `429`, `5xx` 또는 네트워크 오류는 전달 큐 정책에 따라 재시도합니다.
- 기타 `4xx`는 영구 실패로 간주하여 재시도하지 않습니다.
- 단일 요청 타임아웃은 15초입니다.

## 보안 권장 사항

- 공인 HTTPS 주소를 사용하고 WebHook 주소, 서명 키, Authorization 헤더를 공개 리포지터리에 게시하지 마세요.
- 수신 측은 서명을 검증하고(구성한 경우) 중복 요청을 제한해야 합니다.
- 서명 키와 Authorization 헤더는 시스템에서 `APP_SECRET`으로부터 파생된 키로 암호화되어 저장되며, 편집 시 비워 두면 기존 값을 유지합니다.
- 서비스가 내부 네트워크에 배포되고 프록시를 통해 외부 API에 접근하는 경우, 아웃바운드 네트워크에서 대상 주소 접근이 허용되는지 확인하세요.

## 관련 파일

- 구성 예시와 타입 정의: `shared/schemas/index.ts`, `server/notify/types.ts`
- WebHook 전송 구현: `server/notify/transports/webhook.ts`
- 이벤트 Payload 생성: `server/notify/render.ts`
