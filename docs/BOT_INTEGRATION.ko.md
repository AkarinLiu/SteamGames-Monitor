# Feishu / Lark, DingTalk, WeCom 연동 가이드

[简体中文](BOT_INTEGRATION.md) | [繁體中文](BOT_INTEGRATION.zh-TW.md) | [English](BOT_INTEGRATION.en.md) | [Deutsch](BOT_INTEGRATION.de.md) | [Français](BOT_INTEGRATION.fr.md) | [Italiano](BOT_INTEGRATION.it.md) | [日本語](BOT_INTEGRATION.ja.md) | [한국어](BOT_INTEGRATION.ko.md) | [조선어](BOT_INTEGRATION.ko-KP.md) | [Nederlands](BOT_INTEGRATION.nl.md) | [Русский](BOT_INTEGRATION.ru.md)

[← README.ko.md로 돌아가기](../README.ko.md)

이 문서는 Feishu / Lark, DingTalk, WeCom을 Steam Games Monitor에 연동하는 방법을 설명합니다. 프로젝트에는 서로를 대체하지 않는 두 가지 기능이 있으므로 먼저 목표를 확인하세요:

| 목표 | 플랫폼 측에서 생성할 항목 | 시스템 진입점 | 방향 |
| --- | --- | --- | --- |
| 출시, 프로모션, 판매 중단 등의 이벤트 알림 수신 | 그룹 사용자 지정 봇 / 그룹 봇 Webhook | **알림 채널** | 단방향: 시스템 → 그룹 |
| 채팅에서 `/add`, `/list` 등 명령 전송 | Feishu / Lark 기업 자체 구축 앱 / DingTalk 기업 내부 봇(Outgoing) / WeCom 스마트 봇(롱 커넥션) | **명령 봇** | 양방향: 플랫폼 → 시스템 → 플랫폼 |

> 그룹 봇 Webhook은 일반적으로 메시지만 전송할 수 있고 명령은 수신할 수 없습니다. Feishu / Lark와 DingTalk은 모두 QR로 앱을 원클릭 생성할 수 있으며 HTTP 콜백 또는 롱 커넥션을 선택할 수 있습니다. WeCom은 스마트 봇을 생성하고 롱 커넥션을 사용해야 합니다.
>
> 알림 채널과 명령 봇은 서로 독립된 구성입니다. 같은 플랫폼에서 알림만 구성하거나, 명령만 구성하거나, 둘 다 구성할 수 있습니다.

---

## 1. 공통 준비

### 1.1 공인 HTTPS와 PUBLIC_BASE_URL(HTTP 콜백 모드)

**HTTP 콜백**을 사용하는 Feishu / Lark / DingTalk은 플랫폼이 메시지를 서버로 직접 푸시해야 하므로 다음 조건을 충족해야 합니다:

- 서비스가 공인 인터넷에서 접근 가능하고, 플랫폼이 인정하는 **HTTPS** 주소를 사용해야 합니다.
- `.env`의 `PUBLIC_BASE_URL`이 브라우저에서 실제로 접속하는 주소와 일치해야 합니다(예: `https://steam.example.com`).
- 기본값 `http://localhost:8787`을 사용하지 마세요. 그렇지 않으면 시스템이 생성한 콜백 주소에 플랫폼이 접근할 수 없습니다.
- 독립 도메인 또는 서브도메인 사용을 권장합니다. 콜백 경로는 `/webhooks/...`로 고정되어 있으므로 추가 재작성이 필요한 하위 경로에 배포하지 마세요.

시스템에 표시되는 콜백 주소는 다음 규칙으로 생성됩니다:

```text
Feishu / Lark  https://<PUBLIC_BASE_URL의 도메인>/webhooks/feishu/<slug>
DingTalk       https://<PUBLIC_BASE_URL의 도메인>/webhooks/dingtalk/<slug>
```

`<slug>`는 봇을 생성할 때 무작위로 생성되며 봇마다 다릅니다. `PUBLIC_BASE_URL`을 변경하면 콜백 주소도 바뀌므로 플랫폼 콘솔에서도 함께 갱신해야 합니다.

> Feishu / Lark의 **롱 커넥션 모드**, DingTalk **Stream 모드**, WeCom 스마트 봇은 모두 서버가 아웃바운드 연결을 능동적으로 수립하므로 공인 콜백 주소, 공인 IP, Token, EncodingAESKey가 필요하지 않습니다. QR로 생성한 Feishu / Lark 앱과 DingTalk 봇은 기본적으로 롱 커넥션을 사용합니다.
>
> 다만 `PUBLIC_BASE_URL`은 봇 소유자가 브라우저에서 접근할 수 있어야 합니다. 미승인 사용자가 받는 웹 인증 링크가 이 주소를 사용하기 때문입니다.

### 1.2 리버스 프록시 요구 사항

Nginx, Caddy, Traefik 또는 클라우드 로드 밸런서는 다음을 충족해야 합니다(Feishu / Lark / DingTalk의 HTTP 콜백에만 해당):

- **요청 본문을 그대로 전달**하고, JSON을 다시 직렬화하거나 내용을 압축·수정하지 마세요. Feishu / Lark와 DingTalk의 서명은 원본 요청 본문을 기반으로 합니다.
- 플랫폼 요청 헤더를 유지하세요: Feishu의 `X-Lark-Request-Timestamp`, `X-Lark-Request-Nonce`, `X-Lark-Signature`, DingTalk의 `timestamp`, `sign`.
- 쿼리 매개변수를 유지하고 서명 매개변수를 잃지 마세요.
- `/webhooks/*`에 로그인, Basic Auth, HTML 리다이렉트, WAF 상호 작용 검증을 추가하지 마세요.
- 요청 본문 상한은 최소 1 MB, 읽기 타임아웃은 10초 이상이어야 합니다.
- 신뢰할 수 있는 TLS 인증서를 사용하세요. 플랫폼이 인증서 체인을 검증합니다.

Feishu / Lark 롱 커넥션, DingTalk Stream, WeCom 롱 커넥션은 리버스 프록시를 거치지 않으며, 서버가 해당 플랫폼에 아웃바운드로 접근할 수 있으면 됩니다(Lark는 `open.larksuite.com`, DingTalk Stream은 `api.dingtalk.com` 사용).

### 1.3 시간 동기화와 키

- 서버에서 NTP 시간 동기화를 활성화해야 합니다. Feishu / Lark 서명은 ±300초 편차를 허용하고, DingTalk Outgoing 콜백은 ±1시간 편차를 허용합니다.
- `APP_SECRET`(32자 이상)은 채널과 봇 자격 증명을 암호화해 저장하는 데 사용됩니다. **임의로 교체하거나 분실하지 마세요.** 교체하면 저장된 App Secret, 봇 Secret, Encrypt Key 등을 복호화할 수 없어 다시 입력해야 합니다.
- 봇 자격 증명은 SQLite에 AES-256-GCM으로 암호화되어 저장됩니다. API와 페이지는 평문을 반환하지 않으며, 편집 시 비워 두면 기존 값을 유지합니다.

### 1.4 권장 생성 순서

Feishu / Lark(QR, 권장):

1. 「명령 봇」에서 「Feishu / Lark QR」을 클릭하고 Feishu 또는 Lark 국제판을 선택한 뒤 QR 코드를 스캔합니다.
2. 플랫폼 페이지에서 앱을 생성하고 확인합니다. 시스템이 App ID / App Secret, 소유자 `open_id`를 자동으로 기록하고 롱 커넥션을 활성화합니다.
3. Feishu / Lark에서 앱 이름을 검색해 1:1 채팅을 시작하거나 봇을 그룹 채팅에 추가합니다.
4. `/help`를 보내 명령과 응답 경로를 검증합니다.

Feishu / Lark(수동):

1. 시스템에서 봇을 생성하고 버전(Feishu / Lark)과 이벤트 수신 방식(HTTP 콜백 / 롱 커넥션)을 선택합니다.
2. HTTP 콜백: 콜백 주소를 복사해 플랫폼 콘솔에 입력하고 Encrypt Key / Verification Token을 구성합니다. 롱 커넥션: 플랫폼에서 「롱 커넥션으로 이벤트 수신」을 선택합니다.
3. `im.message.receive_v1`을 구독하고 메시지 읽기 및 전송 권한을 신청합니다.
4. 앱을 배포하고 봇을 그룹에 추가하거나 가시 범위를 설정합니다.
5. `/help`를 보내 검증합니다.

DingTalk(QR, 권장):

1. 「명령 봇」에서 「DingTalk QR 추가」를 클릭하고 휴대폰 DingTalk으로 QR 코드를 스캔해 생성을 확인합니다.
2. 시스템이 Client ID / Client Secret을 자동으로 기록하고 Client ID를 Robot Code로 사용하며 Stream 롱 커넥션을 활성화합니다.
3. DingTalk에서 봇을 검색해 1:1 채팅을 시작하거나 봇을 그룹 채팅에 추가합니다.
4. `/help`를 보내 검증합니다.

DingTalk(수동):

1. 시스템에서 봇을 생성하고 메시지 수신 모드를 선택한 뒤 콜백 주소(HTTP 모드)를 복사합니다.
2. 플랫폼 콘솔에서 앱 / 봇을 생성하고 콜백 주소와 키를 입력하거나, 봇 구성에서 Stream 모드를 선택합니다.
3. 플랫폼은 콜백을 저장할 때 보통 URL 검증을 수행합니다. 시스템이 시작되었고 봇이 활성화 상태인지 확인하세요.
4. 플랫폼에서 앱을 배포하고 봇을 그룹에 추가하거나 가시 범위를 설정합니다.
5. `/help`를 보내 명령과 응답 경로를 검증합니다.

WeCom:

1. WeCom 관리 콘솔에서 스마트 봇을 생성하고 API 모드 → 롱 커넥션을 선택해 Bot ID와 Secret을 가져옵니다.
2. 시스템에서 「WeCom 스마트 봇(롱 커넥션)」을 생성하고 Bot ID, Secret, 소유자 UserID를 입력합니다.
3. 저장하면 시스템이 자동으로 롱 커넥션을 수립하며 플랫폼 URL 검증이 필요하지 않습니다.
4. 봇을 그룹 채팅이나 1:1 채팅에 추가하고 `/help`를 보내 검증합니다.

---

## 2. 알림 채널(단방향 푸시)

알림 채널은 모니터링 이벤트를 그룹 채팅으로 푸시하는 데 사용하며, 공인 콜백 주소 없이 플랫폼이 제공하는 Webhook URL만 있으면 됩니다.

### 2.1 세 가지 그룹 봇 비교

| 플랫폼 | 시스템 유형 | 메시지 형식 | 서명 | 설명 |
| --- | --- | --- | --- | --- |
| WeCom | WeCom 그룹 봇 | markdown | 없음 | 단일 메시지 약 4096바이트, 시스템이 잘라냄; 그룹 봇은 전송만 가능 |
| Feishu | Feishu 봇(사용자 지정 봇) | 인터랙티브 카드 | 선택적 서명 키 | 서명 검증을 켤 수 있으며 활성화를 권장 |
| DingTalk | DingTalk 봇(사용자 지정 봇) | markdown | 선택적 서명 키 | 서명을 켤 수 있으며 시스템이 DingTalk 규칙에 따라 서명을 계산 |

구성 진입점: 좌측 **알림 채널 → 새 채널**. 이름, Webhook, 선택적 서명 키를 입력하고 구독할 이벤트를 선택합니다.

> 이벤트 알림은 기본적으로 이곳의 그룹 봇 Webhook을 통해 전송됩니다. 「명령 봇」도 별도로 이벤트 알림을 켤 수 있으며, 두 설정은 상호 독립적이므로 동시에 사용할 수 있습니다.

### 2.2 WeCom 그룹 봇

1. WeCom 그룹 채팅 열기 → 그룹 설정 → 그룹 봇 → 봇 추가.
2. Webhook 주소를 복사합니다(일반적으로 `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...` 형식).
3. 시스템의 「알림 채널」에서 **WeCom 그룹 봇**을 선택하고 Webhook을 붙여넣은 뒤 저장합니다.
4. 채널의 「테스트 전송」을 클릭해 그룹에 메시지가 도착하는지 확인합니다.

주의:

- Webhook 자체가 자격 증명이므로 유출되면 누구나 그룹에 메시지를 보낼 수 있습니다. 유출된 경우 그룹에서 봇을 제거하고 다시 추가하세요.
- 그룹 봇은 `/add` 등의 명령을 수신할 수 없습니다. 명령이 필요하면 「WeCom 스마트 봇(롱 커넥션)」을 사용하세요.
- 단일 메시지 제한은 약 4096바이트이며 시스템이 자동으로 잘라내므로 긴 목록은 일부만 표시될 수 있습니다.
- 그룹 봇에는 빈도 제한이 있으며, 제한에 걸리면 시스템이 자동으로 재시도합니다.

### 2.3 Feishu 사용자 지정 봇

1. Feishu 그룹 열기 → 그룹 설정 → 그룹 봇 → 봇 추가 → 사용자 지정 봇.
2. Webhook 주소를 복사합니다(일반적으로 `https://open.feishu.cn/open-apis/bot/v2/hook/...` 형식).
3. 보안 설정에서 **서명 검증**을 선택하고 서명 키를 복사하는 것을 권장합니다.
4. 시스템의 「알림 채널」에서 **Feishu 봇**을 선택하고 Webhook을 붙여넣습니다. 서명을 켠 경우 서명 키를 입력합니다.
5. 저장 후 테스트 메시지를 보냅니다.

서명 규칙(시스템에 구현되어 있으므로 직접 계산할 필요가 없습니다):

- 타임스탬프는 초 단위입니다.
- `timestamp + "\n" + secret`을 HMAC-SHA256의 키로 사용해 빈 문자열에 대한 서명을 계산하고 결과를 Base64로 인코딩합니다.
- 타임스탬프와 서명은 메시지 본문과 함께 전송됩니다.

서명 대신 「사용자 지정 키워드」나 「IP 허용 목록」을 사용하는 경우, 알림 내용에 키워드가 포함되도록 하거나 서버의 아웃바운드 IP를 허용 목록에 추가하세요.

### 2.4 DingTalk 사용자 지정 봇

1. DingTalk 그룹 열기 → 그룹 설정 → 스마트 그룹 도우미 → 봇 추가 → 사용자 지정.
2. Webhook 주소를 복사합니다(일반적으로 `https://oapi.dingtalk.com/robot/send?access_token=...` 형식).
3. 보안 설정에서 **서명**을 선택하고 서명 키를 복사하는 것을 권장합니다.
4. 시스템의 「알림 채널」에서 **DingTalk 봇**을 선택하고 Webhook을 붙여넣습니다. 서명을 켠 경우 서명 키를 입력합니다.
5. 저장 후 테스트 메시지를 보냅니다.

서명 규칙(시스템에 구현됨):

- 타임스탬프는 밀리초 단위입니다.
- `secret`을 키로 사용해 `timestamp + "\n" + secret`에 HMAC-SHA256을 계산하고 결과를 Base64로 인코딩합니다.
- `timestamp`와 `sign`은 URL 쿼리 매개변수로 전송됩니다.

서명 대신 「사용자 지정 키워드」나 「IP 주소 대역」을 사용하는 경우 보안 설정을 그에 맞게 조정하세요. 속도 제한(예: 오류 코드 `90037`)에 걸리면 시스템이 자동으로 재시도합니다.

### 2.5 이벤트 구독과 재시도

알림 채널에서 구독할 이벤트 유형을 선택할 수 있습니다:

| 이벤트 | 설명 |
| --- | --- |
| `release` | 게임 / DLC 정식 출시 |
| `release_date` | 정확한 출시일을 확인했거나 출시일이 변경됨 |
| `sale_start` | 할인이 모니터링 임계값에 도달 |
| `sale_change` | 프로모션 중 할인율 또는 가격 변경 |
| `sale_end` | 할인 종료, 정가 복원 |
| `price_change` | 비프로모션 상태에서 정가 변경 또는 무료 상태 전환 |
| `delisting_warning` | Steam 뉴스에서 판매 중단 키워드 감지(휴리스틱, 수동 확인 필요) |
| `delisted` | 연속 두 번 스토어 구매 불가 확인 |
| `restored` | 구매 가능 상태 복원 |
| `check_error` | 검사 실패 |

- **이벤트를 하나도 선택하지 않으면** 기본적으로 `check_error`를 제외한 모든 이벤트를 수신합니다.
- 전송에 실패하면 30초 → 2분 → 10분 → 1시간 → 6시간 → 24시간 간격으로 재시도하며 최대 6회입니다.
- 각 채널 카드에는 Webhook과 서명 구성을 검증하는 「테스트 전송」이 있습니다.

---

## 3. 명령 봇(양방향)

명령 봇을 사용하면 사용자가 Feishu / Lark, DingTalk, WeCom 채팅에서 슬래시 명령으로 모니터링 항목을 관리할 수 있습니다. Feishu / Lark는 HTTP 콜백 또는 WebSocket 롱 커넥션, DingTalk은 HTTP 콜백 또는 Stream 롱 커넥션, WeCom은 WebSocket 롱 커넥션을 지원하며, 결과는 각각 플랫폼 API 또는 롱 커넥션을 통해 원래 세션으로 회신됩니다.

### 3.1 공통 동작

- **적용 범위**: 명령은 항상 봇 소유 계정의 데이터에 적용됩니다. 허용 목록의 다른 관리자가 봇을 사용하더라도 봇 소유자의 모니터링 항목이 변경됩니다.
- **소유자 식별자**: `ownerPlatformUserId`는 QR 스캔 사용자 / 봇 소유자를 식별하는 용도로만 사용되며 명령 권한을 자동으로 부여하지 않습니다.
- **허용 목록**: 모든 플랫폼 사용자(소유자 ID 포함)는 허용 목록에 추가되어야 명령을 실행할 수 있으며, 역할은 다음과 같습니다:
  - `admin`: 모든 명령을 사용할 수 있습니다.
  - `viewer`: `/help`, `/list`, `/price`, `/events`만 사용할 수 있습니다.
  - 허용 목록에 없는 Feishu / Lark, DingTalk, WeCom 사용자는 일회용 웹 인증 링크를 받게 되며 봇은 원래 명령을 실행하지 않습니다. DingTalk도 동일한 링크를 지원합니다.
- **이벤트 알림**: 봇은 편집 페이지에서 「이벤트 알림 수신」을 별도로 켜서 이벤트를 마지막으로 승인된 사용자가 사용한 세션으로 푸시할 수 있습니다. 「알림 채널」과는 상호 독립적이며 동시에 활성화할 수 있습니다. 최근 세션이 없으면 푸시하지 않습니다. 자세한 내용은 3.5절을 참고하세요.
- **메시지 형식**: 현재 텍스트 메시지만 처리합니다. 이미지, 파일, 리치 텍스트, 카드 메시지는 무시됩니다.
- **명령 형식**: `/` 또는 전각 `／`로 시작하며, `/add@봇`, 따옴표 인수, `--flag=value`를 지원합니다.
- **중복 제거**: 플랫폼이 동일한 메시지를 다시 전달하면 시스템이 플랫폼 이벤트 / 메시지 ID로 중복을 제거하고 한 번만 처리합니다.
- **속도 제한**: 플랫폼 사용자당 분당 최대 10개, 세션당 분당 최대 30개, 봇당 분당 최대 60개의 명령을 처리하며, 제한에 걸리면 분당 최대 한 번 안내합니다.
- **비동기 응답**: Feishu / Lark / DingTalk 콜백은 먼저 빠르게 성공을 반환하고, DingTalk Stream / WeCom 메시지는 롱 커넥션으로 수신합니다. 명령은 백그라운드에서 실행되며 결과는 플랫폼 API 또는 롱 커넥션으로 회신됩니다. 플랫폼에 표시되는 응답에는 약간의 지연이 있을 수 있습니다.
- **다중 결과 선택**: `/add`, `/adddlc`에서 이름 검색 결과가 여러 개면 봇이 번호 목록을 반환합니다. 번호를 그대로 회신하거나(10분간 유효) `/cancel`을 보내 취소합니다.
- **할당량**: 계정당 최대 3개의 봇을 생성할 수 있으며, 동일 플랫폼에는 1개의 활성 봇만 둘 수 있습니다(Feishu와 Lark 국제판은 「Feishu」 플랫폼 할당량을 공유). Feishu / Lark / DingTalk의 HTTP 콜백 봇은 비활성화 후 콜백 주소가 즉시 무효화되고(404 반환), 롱 커넥션 / Stream 봇은 비활성화 후 연결이 끊어집니다.

### 3.2 Feishu / Lark 앱 봇(권장)

> #### 권장 이유
>
> Feishu/Lark는 개인 버전을 지원하므로 생활과 업무를 잘 분리할 수 있습니다.



Feishu / Lark는 **기업 자체 구축 앱**을 생성하고 봇 기능을 활성화한 뒤 메시지 이벤트를 구독해야 합니다. 그룹 사용자 지정 봇 Webhook은 명령을 수신할 수 없습니다. Feishu(중국판)는 `open.feishu.cn` / `accounts.feishu.cn`, Lark 국제판은 `open.larksuite.com` / `accounts.larksuite.com`을 사용하며, 시스템에서는 봇 구성의 「버전」으로 구분합니다.

#### QR 원클릭 생성(권장)

1. 「명령 봇」에서 **Feishu / Lark QR**을 클릭하고 팝업에서 「Feishu」 또는 「Lark 국제판」을 선택합니다.
2. 해당 클라이언트로 QR 코드를 스캔합니다. 페이지에 앱 이름이 미리 채워지며 새 앱 생성만 허용됩니다.
3. 생성을 확인하면 시스템이 App ID / App Secret을 자동으로 가져오고 스캔한 사용자의 `open_id`를 소유자로 기록하며 롱 커넥션을 활성화합니다.
4. QR 코드는 10분 동안 유효합니다. 동일 플랫폼에 이미 활성 봇이 있거나 할당량이 가득 차면 거부됩니다.
5. Feishu / Lark에서 앱 이름을 검색해 1:1 채팅을 시작하거나 봇을 그룹 채팅에 추가한 뒤 `/help`를 보냅니다.

> QR 생성은 Feishu 공식 `PersonalAgent` 템플릿을 사용하며 봇 기능, 메시지 권한, `im.message.receive_v1` 이벤트가 미리 설정되어 있고 이벤트 수신 방식은 롱 커넥션입니다. 조직에서 QR 생성을 제한하는 경우 아래 수동 구성을 사용할 수 있습니다.
>
> Feishu QR 코드를 Lark 테넌트에서 스캔하면 시스템이 자동으로 `accounts.larksuite.com`으로 전환해 인증을 계속 진행합니다.

#### 수동 구성

1. [Feishu 오픈 플랫폼](https://open.feishu.cn/app) 또는 [Lark 오픈 플랫폼](https://open.larksuite.com/app)을 열고 기업 자체 구축 앱을 생성합니다.
2. 「앱 기능 추가」에서 **봇**을 활성화합니다.
3. 「권한 관리」에서 메시지 관련 권한을 신청합니다:
   - `im:message.p2p_msg:readonly`: 사용자가 봇에게 보낸 1:1 메시지를 읽습니다.
   - `im:message.group_at_msg:readonly`: 그룹 채팅에서 봇을 @한 메시지를 수신합니다.
   - `im:message:send_as_bot`: 앱 신분으로 메시지를 전송합니다.
   - 콘솔에서 시나리오별로 권한이 분리되어 있다면 메시지 내용 읽기와 메시지 전송에 해당하는 권한을 함께 신청하세요.
4. 시스템에서 「Feishu / Lark 앱 봇」을 생성하고 버전과 이벤트 수신 방식을 선택합니다:
   - **롱 커넥션(권장)**: 플랫폼의 「이벤트와 콜백」에서 「롱 커넥션으로 이벤트 수신」을 선택하고 `im.message.receive_v1`을 구독합니다. 콜백 주소가 필요하지 않습니다.
   - **HTTP 콜백**: 시스템에 표시되는 `/webhooks/feishu/<slug>`를 요청 주소로 입력합니다. 암호화가 필요하면 Encrypt Key와 Verification Token을 입력합니다.
5. 버전을 생성하고 앱을 배포합니다. 「앱 가용 범위」에서 사용자가 사용할 수 있는지 확인합니다.
6. 봇을 그룹 채팅에 추가하거나 봇과 직접 1:1 채팅합니다.

#### 시스템 측 필드

| 필드 | 필수 여부 | 설명 |
| --- | --- | --- |
| 이름 | 예 | 시스템 내 식별에만 사용 |
| 버전 | 예 | Feishu(중국판) 또는 Lark(국제판) |
| 이벤트 수신 방식 | 예 | HTTP 콜백 / 롱 커넥션, QR 생성 시 기본값은 롱 커넥션 |
| App ID | 입력 권장 | `tenant_access_token` 획득, 회신 및 이벤트 푸시에 필요 |
| App Secret | 입력 권장 | App ID와 쌍을 이룸 |
| Encrypt Key | HTTP 콜백 시 플랫폼에 따름 | Feishu / Lark 콘솔과 완전히 일치해야 하며, 암호화를 켠 경우 필수 |
| Verification Token | HTTP 콜백 시 권장 | 플랫폼과 일치해야 하며 이벤트 출처 검증에 사용 |
| 소유자 플랫폼 사용자 ID | 입력 권장 | Feishu / Lark `open_id`(보통 `ou_`로 시작)를 입력하며, QR 생성 시 자동으로 채워짐 |
| API Base URL | 아니요 | 테스트 / 프록시 전용, 프로덕션에서는 비워 둠 |

#### 콜백, 롱 커넥션, 서명

- **HTTP 콜백**: 플랫폼이 이벤트 구독 주소를 저장할 때 `url_verification` 챌린지를 보내고 시스템이 `challenge`를 반환합니다.
  - Encrypt Key가 구성된 경우 시스템이 요청 헤더 서명 `SHA256(timestamp + nonce + encryptKey + rawBody)`을 검증하고(±300초 편차 허용) 암호문을 복호화합니다.
  - Verification Token이 구성된 경우 시스템이 이벤트의 token을 검증하며, 일치하지 않으면 401을 반환합니다.
- **롱 커넥션**: 서버가 App ID / App Secret으로 Feishu / Lark의 롱 커넥션 엔드포인트에 능동적으로 연결합니다. 이벤트는 인증된 연결로 푸시되므로 서명 검증, 공인 주소, 리버스 프록시가 필요하지 않습니다. 연결 상태는 봇 카드에 표시됩니다.
- `im.message.receive_v1`의 텍스트 메시지만 처리하며, 앱 자체가 보낸 메시지는 무시합니다.
- 회신은 「메시지 회신」 API를 우선 호출하며, 실패하면 `chat_id`로 메시지를 전송하는 방식으로 대체합니다.
- 그룹 채팅에서는 **봇을 @한 뒤** 명령을 입력해야 하며, 1:1 채팅에서는 바로 보낼 수 있습니다.

#### 소유자 ID와 허용 목록

- Feishu / Lark 이벤트의 사용자 식별자는 `open_id`를 우선 사용하므로 허용 목록에는 휴대폰 번호, 이메일, 이름이 아닌 `open_id`를 입력해야 합니다.
- QR 생성은 스캔한 사용자의 `open_id`를 "소유자 ID"에 기록하지만 식별 용도로만 사용되며 명령 권한을 자동으로 부여하지 않습니다. 처음 사용할 때는 웹 인증을 통해 자신의 플랫폼 계정을 승인해야 합니다.
- 수동 구성 시 이벤트 디버깅 / 콜백 로그를 확인하거나, 사용자가 먼저 메시지를 한 번 보내게 한 뒤 플랫폼 이벤트 상세에서 확인할 수 있습니다.

### 3.3 DingTalk 봇(HTTP 콜백 / Stream)

DingTalk은 **기업 내부 봇**을 생성해야 하며, 메시지 수신 모드는 **Stream 롱 커넥션**(권장) 또는 **HTTP 콜백 / Outgoing**을 선택할 수 있습니다. DingTalk 사용자 지정 그룹 봇 Webhook은 명령을 수신할 수 없습니다.

#### QR 추가(권장)

1. 시스템의 「명령 봇」 페이지에서 **DingTalk QR 추가**를 클릭합니다.
2. 휴대폰 DingTalk으로 QR 코드를 스캔하고 조직을 선택한 뒤 페이지 안내에 따라 봇 정보를 입력하고 생성을 확인합니다.
3. 시스템이 Client ID / Client Secret을 자동으로 가져오고 Client ID를 Robot Code로 사용하며 Stream 롱 커넥션을 활성화합니다. QR 코드는 10분 동안 유효합니다.
4. 생성에 성공하면 DingTalk에서 봇을 검색해 1:1 채팅을 시작하거나 그룹 채팅에 추가할 수 있습니다. 스캔한 사용자의 `staffId`는 식별 용도로만 사용되며, 사용 구성원은 여전히 웹 인증을 거치거나 허용 목록에 추가되어야 합니다.

> 동일 플랫폼에 이미 활성 봇이 있거나 봇 할당량이 가득 차면 QR 스캔이 거부됩니다. 먼저 페이지에서 기존 봇을 처리하세요.
>
> QR 스캔은 DingTalk 공식 앱 등록 페이지를 사용합니다. 조직에서 QR 생성을 제한하거나 등록 페이지가 비정상 응답을 반환하는 경우 아래 수동 구성을 사용할 수 있습니다.

#### 수동 구성

1. [DingTalk 오픈 플랫폼](https://open.dingtalk.com/)을 열고 기업 내부 앱을 생성합니다.
2. 「앱 기능 추가」에서 **봇**을 추가합니다.
3. 메시지 수신 모드를 선택합니다:
   - **Stream 모드(권장)**: 봇 구성에서 Stream 모드를 선택하고 배포합니다. 공인 콜백 주소가 필요하지 않습니다.
   - **HTTP 콜백 / Outgoing**: 시스템에 표시되는 `/webhooks/dingtalk/<slug>` 주소를 입력하고 서명 검증용 App Secret을 입력합니다.
4. 시스템에서 「DingTalk 봇」을 생성하고 Client ID(App Key)와 Client Secret(App Secret)을 입력한 뒤 동일한 수신 모드를 선택합니다.
5. 이벤트 알림을 푸시하려면 Robot Code(보통 Client ID와 동일)를 입력하고 앱에 봇의 능동 메시지 전송 권한이 있는지 확인합니다.
6. 앱을 배포하고 봇을 그룹 채팅에 추가한 뒤 `/help`를 보냅니다.

#### 시스템 측 필드

| 필드 | 필수 여부 | 설명 |
| --- | --- | --- |
| 이름 | 예 | 시스템 내 식별에만 사용 |
| 메시지 수신 모드 | 예 | HTTP 콜백 / Stream 롱 커넥션, QR 생성 시 기본값은 Stream |
| App Key(Client ID) | Stream 필수 | DingTalk 앱 Client ID, 이벤트 알림에도 필요 |
| App Secret(Client Secret) | Stream 필수 / HTTP 서명 검증 | Stream 연결 자격 증명, HTTP 콜백에서는 콜백 서명 검증에 사용 |
| Robot Code | 이벤트 알림 시 권장 | 봇 코드, 보통 Client ID와 동일 |
| 소유자 플랫폼 사용자 ID | 입력 권장 | DingTalk `staffId` 입력 |
| API Base URL | 아니요 | 테스트 / 프록시 전용, 프로덕션에서는 비워 둠 |

#### 메시지 수신과 회신 안내

- **Stream 모드**: 서버가 Client ID / Secret으로 DingTalk Stream 게이트웨이에 능동적으로 연결하므로 공인 IP, 도메인, 콜백 주소가 필요하지 않습니다. 봇 메시지는 롱 커넥션으로 푸시되며, 시스템이 즉시 ACK한 뒤 명령을 비동기로 실행합니다.
- **HTTP 콜백**: DingTalk 콜백 요청 헤더에는 `timestamp`(밀리초)와 `sign`이 포함됩니다. 시스템은 App Secret을 키로 `timestamp + "\n" + App Secret`에 HMAC-SHA256을 계산하며 ±1시간 편차를 허용합니다.
- 두 모드 모두 `msgtype = text`인 텍스트 메시지만 처리합니다.
- 사용자 ID는 `senderStaffId`를 우선 사용하고 그다음 `senderId`를 사용합니다. 소유자 ID와 허용 목록에는 `staffId`를 입력해야 합니다.
- 회신은 메시지 본문의 `sessionWebhook`을 사용해 markdown을 전송하고 명령 발신자를 @합니다. 이 Webhook은 보통 약 1.5시간 동안 유효하며, 만료되면 명령을 다시 보내면 됩니다.
- 시스템은 DingTalk `msgId`로 중복을 제거합니다. Stream 모드는 추가로 푸시를 즉시 확인해 플랫폼의 중복 전달을 방지합니다.

#### 소유자 ID와 허용 목록

- 콜백 이벤트의 `senderStaffId`(없으면 `senderId`)를 기준으로 합니다. 오픈 플랫폼의 이벤트 디버깅 로그에서 확인하거나 주소록 구성원 상세에서 대조할 수 있습니다.
- "소유자 ID"는 식별 용도로만 사용되며 명령 권한을 자동으로 부여하지 않습니다. 모든 DingTalk 사용자는 웹 인증을 거치거나 허용 목록에 추가되어야 합니다.
- QR 생성 시 스캔한 사용자의 `staffId`가 반환되지 않을 수 있으므로 수동으로 보완할 수 있습니다. 처음 사용할 때 봇 소유 계정으로 웹에 로그인해 승인하면 됩니다.

### 3.4 WeCom 스마트 봇(롱 커넥션)

WeCom은 **스마트 봇**을 생성하고 **API 모드 → 롱 커넥션**을 선택해야 합니다. WeCom 그룹 봇 Webhook은 전송만 가능하고 명령은 수신할 수 없습니다.

> 업그레이드 안내: 구 버전 WeCom 자체 구축 앱 콜백(Token / EncodingAESKey / CorpID / AgentID)은 더 이상 명령 봇에 사용되지 않습니다. 기존 봇은 「명령 봇」에서 스마트 봇의 Bot ID / Secret을 입력하고 저장하도록 변경해야 합니다.

#### QR 추가(권장)

1. 시스템의 「명령 봇」 페이지에서 **WeCom QR 추가**를 클릭합니다.
2. 스마트 봇 생성 권한이 있는 WeCom 계정으로 QR 코드를 스캔하고 페이지 안내에 따라 봇을 생성하고 인증합니다.
3. 시스템이 Bot ID / Secret을 자동으로 가져와 봇을 생성하고 롱 커넥션을 수립합니다. QR 코드는 5분 동안 유효합니다.
4. 생성 후 사용 구성원이 명령을 보내면, 봇 소유 계정으로 웹에 로그인해 승인해야 합니다. 소유자 UserID는 식별 용도로만 사용되며 권한을 자동으로 부여하지 않습니다.

> 동일 플랫폼에 이미 활성 봇이 있거나 봇 할당량이 가득 차면 QR 스캔이 거부됩니다. 먼저 페이지에서 기존 봇을 처리하세요.
>
> QR 스캔은 WeCom 공식 인증 페이지를 사용합니다. 계정에 스마트 봇 생성 권한이 없거나 WeCom이 페이지 흐름을 변경한 경우 아래 수동 구성을 사용할 수 있습니다.

#### 수동 구성

1. [WeCom 관리 콘솔](https://work.weixin.qq.com/) 또는 WeCom 클라이언트 워크벤치를 열고 「스마트 봇」 → 봇 생성으로 이동합니다.
2. 생성 과정에서 「API 모드로 생성」 → 「롱 커넥션 사용」을 선택합니다.
3. **Bot ID**와 **Secret**을 받아 저장합니다. Secret은 보통 한 번만 표시되며 분실하면 다시 생성할 수 있습니다.
4. 시스템에서 「WeCom 스마트 봇(롱 커넥션)」을 생성하고 Bot ID, Secret, 소유자 UserID를 입력합니다.
5. 봇을 그룹 채팅이나 1:1 채팅에 추가합니다. 그룹 채팅에서는 **봇을 @한 뒤** `/help`를 보냅니다.
6. 콜백 주소, Token, EncodingAESKey, CorpID는 입력할 필요가 없습니다. 서비스가 `wss://openws.work.weixin.qq.com`에 능동적으로 연결합니다.

#### 시스템 측 필드

| 필드 | 필수 여부 | 설명 |
| --- | --- | --- |
| 이름 | 예 | 시스템 내 식별에만 사용 |
| Bot ID | 예 | 스마트 봇의 고유 식별자 |
| Secret | 예 | 롱 커넥션 전용 Secret, `aibot_subscribe` 인증에 사용 |
| 소유자 플랫폼 사용자 ID | 입력 권장 | WeCom 주소록의 구성원 UserID, 봇이 실제 콜백에서 받은 `from.userid`를 기준으로 함 |

#### 롱 커넥션 메커니즘

- 서버가 `wss://openws.work.weixin.qq.com`에 능동적으로 연결하므로 내부 네트워크 배포에 적합하며 고정 공인 IP가 필요하지 않습니다.
- 연결이 수립되면 `aibot_subscribe`를 전송하고 Bot ID + Secret으로 신분 검증을 완료한 뒤, 30초마다 `ping` 하트비트를 보냅니다.
- 사용자 메시지는 `aibot_msg_callback`으로 평문 푸시되므로 복호화가 필요하지 않습니다. 시스템은 `msgtype = text`만 처리합니다.
- 회신은 `aibot_respond_msg`에 콜백의 `req_id`를 담아 markdown을 전송하며, 동일한 `req_id`의 회신은 순차적으로 전송됩니다.
- 하나의 스마트 봇은 동시에 하나의 유효한 롱 커넥션만 허용합니다. 새 연결은 기존 연결을 끊으며, 다중 인스턴스 배포 시 서로 연결이 중단됩니다.
- 연결이 끊어지면 지수 백오프로 재연결합니다. 연속 인증 실패 또는 새 인스턴스에 의한 연결 교체 시 봇 카드에 롱 커넥션 이상이 표시됩니다.
- 그룹 채팅 메시지는 앞부분의 `@봇`을 먼저 제거한 뒤 슬래시 명령으로 파싱합니다.
- 메시지 콜백 후 24시간 이내에는 언제든 회신할 수 있습니다. 시스템은 백그라운드 큐에서 명령을 실행하며, 긴 명령은 보통 몇 초가 걸립니다.
- 봇 이벤트 알림을 켜면 시스템이 동일한 롱 커넥션에서 `aibot_send_msg`로 최근 세션에 능동적으로 푸시합니다. 사용자가 먼저 봇에게 메시지를 보낸 적이 있어야 합니다.

#### 소유자 ID와 허용 목록

- WeCom 주소록의 **UserID**(구성원 계정)를 입력하고 이름, 휴대폰 번호, 외부 연락처 ID를 입력하지 마세요.
- 봇 생성자가 기업 슈퍼 관리자가 아니면 `from.userid`가 기업 주체 하위의 암호화된 userid일 수 있습니다. 실제 콜백 이벤트의 값을 기준으로 소유자와 허용 목록을 구성하세요.

#### 미승인과 웹 인증

- WeCom 사용자가 허용 목록에 없으면 봇이 일회용 웹 인증 링크(`PUBLIC_BASE_URL/authorize/<token>`)를 회신하며 30분 동안 유효합니다.
- 봇 소유자가 자신의 웹 계정으로 링크 페이지에 로그인해 플랫폼 사용자 ID(및 사용 가능한 경우 닉네임, 세션)를 확인한 뒤 `viewer` 또는 `admin`을 선택하고 승인하거나 거부합니다.
- 봇 소유자가 아닌 사용자가 로그인하면 요청만 조회할 수 있고 직접 승인할 수 없으므로 링크를 봇 소유자에게 전달해야 합니다.
- 인증 링크는 한 번 처리되면 무효화되며, 동일 사용자의 다른 대기 링크도 함께 갱신됩니다. 만료되면 사용자가 아무 명령이나 다시 보내 새 링크를 생성하도록 하세요.
- 모든 사용 구성원(QR 스캔자 본인 포함)은 웹 인증 또는 허용 목록을 통해 권한을 얻어야 합니다. 자신에게 모든 명령 권한을 부여하려면 승인 시 `admin`을 선택하세요.
- `PUBLIC_BASE_URL`은 브라우저에서 접근 가능해야 합니다. 링크가 열리지 않으면 리버스 프록시와 해당 환경 변수를 확인하세요.

#### 연결 상태

봇 카드에 롱 커넥션 상태가 표시됩니다:

- **롱 커넥션 중**: 연결을 수립 중이거나 자동 재연결 중입니다.
- **롱 커넥션 연결됨**: 인증에 성공했으며 명령을 수신할 수 있습니다.
- **롱 커넥션 이상**: 자격 증명 오류, Bot ID / Secret 미입력, 네트워크 도달 불가, 인증 실패 또는 다른 인스턴스에 의한 연결 교체.
- **롱 커넥션 비활성**: 봇이 비활성화되었습니다.

상태가 계속 비정상이라면 Bot ID / Secret, 서버 아웃바운드 방화벽의 `wss://openws.work.weixin.qq.com:443` 허용 여부, 다른 인스턴스가 동일한 Bot ID를 사용하고 있는지 확인하세요.

### 3.5 봇 이벤트 알림

「명령 봇」 편집 페이지에서 **이벤트 알림 수신**을 선택하면 봇이 출시, 프로모션, 판매 중단 등의 이벤트를 추가로 수신합니다. 알림 채널과는 별개의 구성이며 동시에 켤 수 있습니다.

- **알림 대상**: 허용 목록 구성원이 마지막으로 봇을 사용한 세션. 시스템은 승인된 사용자가 명령을 성공적으로 보낸 후에만 대상을 갱신하며, 미승인 사용자는 알림 대상을 변경하지 않습니다.
- **전제 조건**: 대상 봇이 승인된 사용자의 명령을 한 번 이상 받은 적이 있어야 하며, 그렇지 않으면 이벤트가 전달되지 않습니다. 봇 카드에 "최근 세션이 아직 기록되지 않음"이 표시됩니다.
- **이벤트 범위**: 검사 오류를 포함한 모든 이벤트를 수신하며, 봇별로 이벤트 유형을 개별 필터링하는 기능은 지원하지 않습니다.
- **알림 채널의 그룹 봇은 알림 채널 자체의 이벤트 선택 규칙에 따라 전송되며, 두 설정은 서로 영향을 주지 않습니다.**

각 플랫폼의 추가 요구 사항:

- **Feishu / Lark**: App ID / App Secret이 필요하며 앱 신분으로 세션에 메시지를 보낼 권한이 있어야 합니다. 이벤트는 최근 세션의 `chat_id`로 전송되며 HTTP 콜백과 롱 커넥션 모드 모두 가능합니다.
- **DingTalk**: App Key, App Secret, Robot Code가 필요하며 봇의 능동 메시지 전송 권한이 있어야 합니다. 그룹 채팅은 `openConversationId`, 1:1 채팅은 발신자 `staffId`를 사용합니다.
- **WeCom**: 롱 커넥션 `aibot_send_msg`로 최근 세션에 푸시하며 1:1 채팅은 `chat_type=1`, 그룹 채팅은 `chat_type=2`입니다. 사용자가 먼저 봇과 대화한 적이 있어야 합니다.

> 봇이 비활성화되었거나 이벤트 알림 스위치가 꺼졌거나 최근 세션이 삭제되었거나 봇이 그룹 채팅에서 제거되면 전달이 취소되거나 실패합니다. 승인된 사용자가 명령을 한 번 다시 보내면 대상 세션이 갱신됩니다.

---

## 4. 명령 빠른 참조

```text
/help
/add <appid | 스토어 링크 | 이름> [--discount N] [--note 텍스트] [--force]
/adddlc <기본 게임 appid | 링크 | 이름> [--max 50]
/remove <id | appid | 이름>
/pause <id | appid | 이름>
/resume <id | appid | 이름>
/check <id | appid | 이름>
/price <id | appid | 이름>
/list [--all] [--sale] [--paused] [--page N]
/events [--item id] [--limit 10]
/cancel
```

설명:

- `/add`는 Steam 스토어 직접 검색을 지원하며, 이름 검색 결과가 여러 개면 번호를 회신해 선택합니다.
- `--discount N`은 할인 알림 임계값(0–100)을 설정하며, 입력하지 않으면 계정 기본값을 사용합니다.
- `--force`는 현재 지역에서 조회할 수 없지만 추가해서 뉴스 경고만 받고 싶은 경우에 사용합니다.
- `/adddlc`는 기본 게임의 모든 DLC를 가져오며 1회 최대 50개입니다.
- `/check`는 캐시를 우회해 즉시 검사하고 이벤트를 기록하며, Steam 속도 제한의 영향을 받습니다.
- `/list`는 기본적으로 일시 중지된 항목을 표시하지 않습니다. `--all`은 전체, `--sale`은 프로모션 중인 항목만, `--paused`는 일시 중지된 항목만 표시합니다.
- `/events`는 기본적으로 최근 10개를 표시하며 최대 20개입니다.
- 조회자(viewer) 권한은 `/help`, `/list`, `/price`, `/events`로 제한됩니다.

---

## 5. 자주 발생하는 문제 해결

| 증상 | 가능한 원인 | 해결 방법 |
| --- | --- | --- |
| Feishu / Lark / DingTalk 콜백 주소 저장 실패 | 서비스가 공인 인터넷에서 접근 불가, 인증서 무효, `PUBLIC_BASE_URL` 오류 | 휴대폰 데이터로 콜백 도메인 접속, HTTPS 인증서 체인의 완전성 확인, 봇이 생성되고 활성화되었는지 확인 |
| Feishu / Lark / DingTalk 콜백이 404 반환 | 봇이 비활성화·삭제되었거나 `<slug>`가 잘못됨 | 「명령 봇」 페이지에서 최신 콜백 주소를 복사하고 봇 활성화 |
| Feishu / Lark 챌린지 실패 / 401 | Verification Token 또는 Encrypt Key 불일치, 프록시가 요청 본문을 재작성 | 양쪽 값을 다시 대조하고 요청 본문 압축 / 재작성 해제, `X-Lark-*` 요청 헤더 유지 |
| Feishu / Lark 암호화 활성화 후 봇 무응답 | 플랫폼에서 Encrypt Key를 켰지만 시스템에 입력하지 않아 암호문을 해석할 수 없음. Verification Token 검증으로 401이 반환될 수도 있음 | 시스템에 동일한 Encrypt Key와 Verification Token을 입력하거나 플랫폼 암호화를 끄고 다시 저장 |
| Feishu / Lark 메시지 수신은 되지만 회신 불가 | App ID / App Secret 미입력 또는 메시지 전송 권한 부족 | 자격 증명 보완, 오픈 플랫폼에서 메시지 전송 권한 신청 및 배포 |
| Feishu / Lark 롱 커넥션이 계속 연결 중 / 이상 | App ID / App Secret 오류, 앱에서 「롱 커넥션으로 이벤트 수신」 미활성, 조직에서 QR 생성 제한 | 자격 증명 확인, 이벤트와 콜백에서 롱 커넥션으로 전환 후 버전 배포, 또는 HTTP 콜백으로 전환 |
| QR 스캔 후 Feishu / Lark 봇을 검색할 수 없음 | 앱 미배포 또는 가용 범위에 해당 구성원 미포함 | 오픈 플랫폼에서 버전을 생성하고 배포, 가용 범위 조정, 앱 이름으로 검색 |
| Feishu QR을 스캔했는데 Lark 앱이 생성됨 | 스캔 계정이 Lark 테넌트에 속해 시스템이 인증 도메인을 자동 전환 | 정상 동작이며 Lark에서 앱 이름을 검색하면 됨 |
| DingTalk 콜백 401 | App Secret 오류, 프록시가 요청 헤더 삭제, 서버 시간 편차 1시간 초과 | 앱 App Secret 확인(서명 키 아님), `timestamp`, `sign` 유지, NTP 동기화 |
| DingTalk 회신 시간 초과 / 실패 | `sessionWebhook` 만료 | 명령을 다시 전송하고 콜백이 수 초 내에 완료되는지 확인 |
| DingTalk Stream이 계속 연결되지 않음 / 이상 | Client ID / Secret 오류, 봇이 Stream 모드를 선택하지 않음, 앱 미배포, 서버가 `api.dingtalk.com`에 아웃바운드 접근 불가 | 자격 증명 확인, 봇 구성에서 Stream 선택 후 버전 배포, 아웃바운드 네트워크 점검 |
| DingTalk QR 스캔 시 인증 실패 | 스캔 계정에 개발자 권한 없음, QR 만료, 선택한 기업이 앱 생성 불가, 인증 페이지 템플릿 로드 실패 | 대상 기업에서 개발자 권한이 있는지 확인, QR 재생성, 권한이 있는 기업으로 변경, 계속 실패하면 서비스 로그의 "DingTalk QR 인증 실패" 원인 확인 |
| DingTalk QR 스캔 후 봇이 응답하지 않음 | 앱 미배포 또는 가용 범위에 해당 구성원 미포함, 봇이 세션에 추가되지 않음, Stream 연결 미수립 | 앱 배포 및 가용 범위 조정, 봇 카드에서 연결 상태 확인, 명령 재전송 |
| DingTalk / Feishu 사용자에게 미승인 안내 | 해당 플랫폼 사용자가 허용 목록에 없고 웹 인증을 완료하지 않음 | 사용자가 아무 명령이나 보내 인증 링크를 받게 하고 봇 소유 계정으로 웹 로그인 후 승인, 또는 허용 목록에 직접 추가 |
| WeCom 롱 커넥션 미연결 / 이상 | Bot ID 또는 Secret 오류, 서버가 `openws.work.weixin.qq.com:443`에 아웃바운드 접근 불가, 다른 인스턴스가 동일 봇 사용, 봇 비활성 | Bot ID / Secret 확인, 아웃바운드 방화벽과 프록시 점검, 중복 배포 여부 확인, 봇 카드에서 상태와 오류 정보 확인 |
| WeCom 메시지 무응답 | 롱 커넥션 끊김, 24시간 회신 윈도 초과, 처리 중 봇 비활성화 또는 삭제 | 롱 커넥션 상태 확인, 명령 재전송, 봇이 활성 상태인지 확인 |
| WeCom 연결 교체 안내 | 동일 Bot ID로 새 연결이 수립되어 기존 연결이 WeCom에서 끊김 | 봇당 하나의 실행 인스턴스만 유지하고 중복 배포 서비스를 종료하거나 시스템에서 비활성화 후 다시 활성화 |
| 명령 무응답 | 그룹 채팅에서 봇 미@, 메시지가 텍스트가 아님, `/`로 시작하지 않음, 사용자가 허용 목록에 없음 | 그룹에서 봇 @, `/help` 전송, 플랫폼 사용자 ID를 허용 목록에 추가 |
| QR 스캔자 본인도 명령 권한 없음 | 소유자 ID는 식별 용도로만 사용되며 권한을 암묵적으로 부여하지 않음 | 웹 인증 페이지에서 자신의 플랫폼 계정 승인, 또는 봇 소유 계정이 플랫폼 ID를 허용 목록에 추가 |
| 봇 생성 충돌 | 동일 플랫폼에 이미 활성 봇 존재 | 기존 봇을 먼저 비활성화한 뒤 새 봇 활성화 |
| 알림 채널 테스트 실패 | Webhook 무효, 서명 키 오류, 키워드 / IP 허용 목록 제한 | Webhook 재복사, 서명 키 대조, 플랫폼 보안 설정 확인 |
| 그룹에 이벤트 알림이 전혀 없음 | 채널 비활성, 이벤트 유형 미선택, 그룹 봇 제거 | 채널 상태와 이벤트 구독 확인, 테스트 메시지 재전송 |
| 봇이 이벤트 알림을 푸시하지 않음 | "이벤트 알림 수신" 미활성, 최근 승인 세션 없음, DingTalk App Key / Robot Code 누락, 봇 비활성 | 봇 편집에서 알림 활성화, 승인 사용자가 먼저 명령 전송, DingTalk 자격 증명 보완, 전달 기록 확인 |
| Feishu / Lark / DingTalk 동일 메시지 중복 푸시 | 플랫폼이 ACK를 제때 받지 못하거나 네트워크 지연 | 시스템이 메시지 ID로 중복 제거, 콜백이 10초 내 반환되도록 보장 |

### 디버깅 권장 사항

1. 먼저 「명령 봇」 카드의 **명령 시뮬레이션**을 사용해 봇 소유자 신분으로 로컬에서 실행하여 명령 로직과 할당량이 정상인지 확인합니다.
2. 다음으로 「알림 채널」의 **테스트 전송**으로 Webhook과 서명을 검증합니다.
3. 마지막으로 플랫폼 채팅에서 `/help`를 보내 콜백 / 롱 커넥션, 권한, 회신 경로를 확인합니다.
4. 컨테이너 로그 확인: `docker compose logs -f steam-monitor`, `wecom`, `webhook`, `inbound`, `delivery` 관련 로그에 주목합니다.

---

## 6. 보안 권장 사항

- Feishu / Lark / DingTalk 콜백 주소, 그룹 봇 Webhook, WeCom Bot ID / Secret은 모두 자격 증명으로 간주해야 하며 공개 리포지터리에 커밋하거나 공개 그룹에 게시하지 마세요.
- Feishu / Lark의 HTTP 콜백은 Encrypt Key + Verification Token 활성화를 권장하며, 롱 커넥션 자격 증명도 비밀로 유지해야 합니다. DingTalk HTTP 콜백은 App Secret을 반드시 입력해 서명을 검증해야 하고, Stream 모드에서도 Client Secret을 보호해야 합니다. WeCom은 Bot ID와 롱 커넥션 Secret을 반드시 보호해야 합니다.
- 허용 목록은 최소 권한 원칙을 따르세요. 일반 구성원은 `viewer`, 관리자만 `admin`을 사용합니다.
- SQLite 파일을 공인 인터넷에 노출하지 마세요. 데이터베이스를 정기적으로 백업하고 `.env`의 `APP_SECRET`도 함께 백업하세요.
- `PUBLIC_BASE_URL`을 수정하거나 도메인을 변경한 후에는 Feishu / Lark / DingTalk 콘솔의 콜백 주소를 즉시 갱신하세요. 롱 커넥션 모드는 영향을 받지 않습니다.
- 자격 증명 유출이 의심되면 Feishu / Lark는 App Secret / Encrypt Key를 재설정하고, DingTalk은 Client Secret을 재설정하며, WeCom은 스마트 봇 Secret을 다시 생성한 뒤 시스템에 다시 입력하세요.

---

## 7. 공식 문서

- Feishu 이벤트 구독 및 요청 주소 구성: <https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case>
- Feishu 원클릭 앱 생성: <https://open.feishu.cn/document/mcp_open_tools/scan-to-create-an-app-in-one-click>
- Feishu 사용자 지정 봇: <https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot>
- Lark 이벤트 구독 및 요청 주소 구성: <https://open.larksuite.com/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case>
- Lark 원클릭 앱 생성: <https://open.larksuite.com/document/mcp_open_tools/scan-to-create-an-app-in-one-click>
- DingTalk 봇 메시지 수신: <https://open.dingtalk.com/document/orgapp/receive-message>
- DingTalk Stream 모드: <https://open.dingtalk.com/document/development/stream>
- DingTalk 원클릭 에이전트 앱 생성: <https://open.dingtalk.com/document/development/create-dingtalk-intelligent-agent-application>
- DingTalk 사용자 지정 봇: <https://open.dingtalk.com/document/orgapp/custom-robot-access>
- WeCom 스마트 봇 롱 커넥션: <https://developer.work.weixin.qq.com/document/path/101463>
- WeCom 스마트 봇 메시지 회신: <https://developer.work.weixin.qq.com/document/path/101836>
- WeCom 그룹 봇: <https://developer.work.weixin.qq.com/document/path/91770>

플랫폼 콘솔 진입점:

- Feishu 오픈 플랫폼: <https://open.feishu.cn/app>
- Lark 오픈 플랫폼: <https://open.larksuite.com/app>
- DingTalk 오픈 플랫폼: <https://open.dingtalk.com/>
- WeCom 관리 콘솔: <https://work.weixin.qq.com/>

> 플랫폼 콘솔의 메뉴와 권한 이름은 버전에 따라 달라질 수 있으므로 공식 문서와 실제 콘솔을 기준으로 하세요.
