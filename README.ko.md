# SteamGames-Monitor

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Italiano](README.it.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [조선어](README.ko-KP.md) | [Nederlands](README.nl.md) | [Русский](README.ru.md)

인터페이스는 중국어 간체, 중국어 번체, 영어, 독일어, 프랑스어, 이탈리아어, 일본어, 한국어, 조선어, 네덜란드어, 러시아어를 지원합니다. 오른쪽 위 선택기에서 전환할 수 있으며, 이 설정은 Steam 콘텐츠 언어와 별개입니다.

자체 호스팅 방식의 다중 사용자 Steam 게임 / DLC 판매 상태 모니터링 시스템입니다. SQLite에 데이터를 저장하고, **곧 판매 중단 / 스토어 삭제, 할인, 출시**를 모니터링하며, WeCom 그룹 봇, Feishu 봇, DingTalk 봇 또는 SMTP 이메일로 알림을 보냅니다.
하나의 프로세스가 웹 UI, REST API, Steam 폴링 스케줄러, 알림 전달 큐, Feishu / Lark / DingTalk 콜백, 그리고 Feishu·DingTalk Stream과 WeCom 롱 커넥션을 동시에 제공하므로 단일 머신 Docker Compose 배포에 적합합니다.

## 기능

- **다중 사용자 독립 계정**: 관리자가 계정을 생성하며, 각 사용자는 독립적인 모니터링 항목, 이벤트, 알림 채널, 명령 봇을 가지고, 데이터는 엄격하게 격리됩니다.
- **모니터링 항목**: appid, 스토어 링크, 이름 검색을 지원하며, 기본 게임의 모든 DLC를 일괄 가져올 수 있습니다.
- **상태 변화**: 출시(coming soon 전환), 프로모션 시작 / 변경 / 종료, 정가 변경, 구매 불가(판매 중단)와 복구.
- **판매 중단 판정**: 스토어 구매 가능 상태가 연속 두 번 뒤집혀야 판매 중단으로 확정하며, Steam 뉴스 키워드를 함께 활용해 사전 경고를 제공합니다(휴리스틱, 참고용).
- **알림 채널**: WeCom 그룹 봇, Feishu 사용자 지정 봇, DingTalk 사용자 지정 봇, 사용자 지정 WebHook, SMTP 이메일. 실패 시 자동으로 재시도합니다.
- **명령 봇**: Feishu / Lark 앱 봇(QR 원클릭 생성, HTTP 콜백 또는 WebSocket 롱 커넥션), DingTalk 봇(QR 원클릭 생성, HTTP 콜백 또는 Stream 롱 커넥션), WeCom 스마트 봇 롱 커넥션. QR 생성, 미승인 사용자 웹 인증, 이벤트 알림을 제공하며 `/add`, `/list`, `/price`, `/check`, `/pause`, `/resume`, `/remove`, `/adddlc`, `/events`, `/cancel` 명령을 지원합니다. WeChat ClawBot과 QQ Bot은 플랫폼 공식 프로토콜에 따라 연동 중입니다.
- **운영 친화적**: 헬스 체크, Docker 이미지, 데이터베이스 온라인 백업, 구성 가능한 데이터 보존 정책.

## 기술 스택

- Node.js 24 + TypeScript(ESM), Hono, `node:sqlite`(WAL), Zod, Nodemailer
- Vue 3 + Vite + Pinia + Vue Router(빌드 산출물은 Node 프로세스가 직접 제공)
- 테스트: Vitest(단위), Playwright(엔드 투 엔드)

## 빠른 시작(로컬 개발)

Node.js `^22.18 || >=24.12`와 pnpm이 필요합니다.

```bash
pnpm install
cp .env.example .env
# .env 편집: 최소한 APP_SECRET(>=32자)을 입력하세요
openssl rand -base64 48
pnpm dev
```

- 웹 UI: http://localhost:5173
- 백엔드 API: http://localhost:8787

처음 시작할 때 웹 UI를 바로 열어 첫 관리자 계정을 생성하고 지역, 언어, 시간대를 선택합니다. **지역에는 기본값이 없으며**, 초기화를 완료하지 않은 계정은 모니터링 항목을 추가할 수 없습니다. 초기화 API는 첫 관리자가 생성된 후 자동으로 무효화됩니다. 더 이상 초기화 토큰이 필요하지 않으므로 초기화되지 않은 상태에서 인스턴스를 공인 인터넷에 노출하지 말고, 배포 후 즉시 초기화를 완료하세요.

### 프로덕션 빌드

```bash
pnpm build   # 타입 검사 + 프런트엔드 dist/ 빌드 + 서버 dist-server/index.js
pnpm start   # 먼저 빌드해야 합니다. Node가 API와 정적 프런트엔드를 함께 제공합니다
```

## 환경 변수

| 변수 | 설명 |
| --- | --- |
| `NODE_ENV` | `production`일 때 `APP_SECRET`을 강제로 검증합니다 |
| `HOST` / `PORT` | 수신 주소와 포트, 기본값 `0.0.0.0:8787` |
| `DATA_DIR` | 데이터 디렉터리, 기본값 `./data`(Docker에서는 `/data`) |
| `DATABASE_PATH` | SQLite 파일 경로, 기본값 `${DATA_DIR}/steam-monitor.db` |
| `APP_SECRET` | 필수, 32자 이상. 채널 / 봇 자격 증명을 암호화하기 위한 키를 파생하는 데 사용됩니다. **분실하면 이미 저장된 키를 복호화할 수 없습니다** |
| `PUBLIC_BASE_URL` | 외부 접근 주소로, Feishu / Lark / DingTalk 콜백 주소, WeCom 웹 인증 링크 생성과 CSRF 검증에 사용됩니다. 롱 커넥션 자체는 공인 콜백이 필요하지 않습니다 |
| `TRUSTED_ORIGINS` | 추가로 허용할 Origin, 쉼표로 구분(개발 시 `http://localhost:5173` 포함) |
| `COOKIE_SECURE` | HTTPS 배포 시 `1`로 설정합니다 |
| `TRUST_PROXY` | 리버스 프록시 계층 수 |
| `MAX_TOTAL_MONITORS` | 전체 모니터링 항목 상한, 기본값 2000 |
| `ALLOW_INSECURE_WEBHOOKS` | 테스트 시에만 `1`로 설정하여 http / 내부 네트워크 Webhook을 허용합니다 |
| `ENABLE_DEV_COMMANDS` / `DEV_COMMAND_TOKEN` | 개발용 `/api/dev/command` 명령 시뮬레이션 |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error`, 파일 로그는 `${DATA_DIR}/logs/app-YYYY-MM-DD.log`에 기록됩니다 |
| `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL` | 선택 사항, Steam 엔드포인트 재정의(테스트 / 프록시용) |

프록시 환경에서는 `HTTPS_PROXY`, `NODE_USE_ENV_PROXY=1`, `NO_PROXY`를 사용할 수 있습니다. 시스템 인증서 체인을 Node가 인식하지 못하는 경우, 서비스 시작 시 시스템 CA를 병합합니다(`lib/tls.ts`).

## Docker Compose 배포

GitHub Actions는 `main` 브랜치에 푸시하면 스냅샷 이미지(`dev`)를 게시하고, 안정 버전 태그(예: `v1.1.0`)를 푸시하면 시맨틱 버전을 게시하며 `latest`를 해당 안정 버전으로 지정합니다:

```bash
# 최신 안정 버전
docker pull akarinliu2000/steamgames-monitor:latest
# 현재 1.1.0 안정 버전
docker pull akarinliu2000/steamgames-monitor:1.1.0
# main 브랜치 최신 스냅샷
docker pull akarinliu2000/steamgames-monitor:dev
```

이미지는 `linux/amd64`와 `linux/arm64`를 지원하며, Docker가 호스트 아키텍처에 따라 자동으로 선택합니다. 두 가지 기본 이미지를 제공합니다:

| 태그 | 기본 이미지 | 설명 |
| --- | --- | --- |
| `latest` / `1.1.0` / `1.1` | Debian slim(`node:24-bookworm-slim`) | 최신 안정 버전 |
| `latest-alpine` / `1.1.0-alpine` / `1.1-alpine` | Alpine(`node:24-alpine`) | 최신 안정 버전 Alpine |
| `dev` | Debian slim | `main` 브랜치 최신 스냅샷 |
| `dev-alpine` | Alpine | `main` 브랜치 최신 Alpine 스냅샷 |

`latest`는 사전 릴리스가 아닌 태그(예: `v1.1.0`)에서만 이동합니다. `-rc` / `-beta`가 붙은 태그는 `latest`를 덮어쓰지 않습니다. `main` 브랜치의 일반 커밋은 `dev` / `dev-alpine`과 `sha-*` 태그만 갱신합니다.

```bash
docker pull akarinliu2000/steamgames-monitor:latest-alpine
# 로컬에서 Alpine 버전 빌드
docker build --build-arg BASE_IMAGE=node:24-alpine -t steam-monitor:alpine .
```

이미지를 직접 실행하려면:

```bash
cp .env.example .env
# APP_SECRET, PUBLIC_BASE_URL(공인 HTTPS 주소), COOKIE_SECURE=1, TRUST_PROXY=1을 입력하세요
docker run -d --name steam-monitor \
  --env-file .env \
  -p 8787:8787 \
  -v "$(pwd)/data:/data" \
  --restart unless-stopped \
  akarinliu2000/steamgames-monitor:latest
```

컨테이너 로그 확인:

```bash
# docker run 방식
docker logs -f steam-monitor

# docker compose 방식
docker compose logs -f steam-monitor
```

`docker ps`에 표시되는 컨테이너 이름이 임의의 이름(예: `nervous_roentgen`)이라면 시작할 때 `--name steam-monitor`를 지정하지 않은 것입니다. 이 경우 `docker compose logs`는 해당 컨테이너를 표시하지 않으므로 `docker logs -f <실제 컨테이너 이름>`을 사용해야 합니다. `docker run`만 사용할 때는 `--env-file .env`를 전달해야 `LOG_LEVEL`, `PUBLIC_BASE_URL` 등의 설정이 로드됩니다. 전달하지 않으면 로그 레벨은 기본값 `info`, `PUBLIC_BASE_URL`은 기본값 `http://localhost:8787`이 됩니다.

애플리케이션 로그는 UTC 날짜 기준으로 `${DATA_DIR}/logs/app-YYYY-MM-DD.log`에도 기록됩니다. Docker에서는 기본적으로 호스트의 `./data/logs/`에 매핑됩니다. 컨테이너 stdout도 그대로 유지되므로 `docker logs`로 확인할 수 있습니다. 로그 파일은 자동으로 삭제되지 않으니 필요에 따라 보관하거나 정리하세요.

Docker Hub 이미지로 Compose를 시작하려면:

```bash
docker compose pull
docker compose up -d
```

코드를 수정한 후 로컬에서 다시 빌드합니다(Docker Hub의 동일 태그로 로컬 이미지를 덮어씁니다):

```bash
docker compose up -d --build
```

### Docker Hub에 게시

Docker Hub 주소: <https://hub.docker.com/r/akarinliu2000/steamgames-monitor>(`akarinliu2000/steamgames-monitor`)

`.github/workflows/dockerhub.yml`은 `main` 브랜치에 푸시하면 `dev` 스냅샷을 게시하고, 안정 버전 태그를 푸시하면 시맨틱 버전을 게시하고 `latest`를 갱신합니다:

- 리포지터리 Secrets에 `DOCKERHUB_USERNAME`과 `DOCKERHUB_TOKEN`(Docker Hub Access Token, Read & Write 권한 필요)을 구성해야 합니다.
- 현재 이미지: `docker.io/akarinliu2000/steamgames-monitor:latest`, `:1.1.0`, `:dev`(Debian) 및 이에 대응하는 `-alpine` 버전이며, 모두 amd64/arm64 멀티 아키텍처입니다.
- Docker Hub 리포지터리는 공개되어 있어 익명으로 바로 가져올 수 있습니다.
- 조직 네임스페이스를 사용하려면 리포지터리 변수 `DOCKERHUB_REPOSITORY`(예: `myorg/steamgames-monitor`)를 추가하면 됩니다.

```bash
docker pull akarinliu2000/steamgames-monitor:latest
```

```bash
gh secret set DOCKERHUB_USERNAME --repo AkarinLiu/SteamGames-Monitor
gh secret set DOCKERHUB_TOKEN --repo AkarinLiu/SteamGames-Monitor
```

- 데이터는 호스트의 `./data`에 영속화되며(컨테이너 `/data`에 마운트), 데이터베이스, 백업, `logs/` 로그가 모두 이곳에 기록됩니다.
- 이미지 엔트리는 `./data`의 권한을 수정한 다음 컨테이너 내 `node` 사용자로 권한을 낮추어 애플리케이션을 실행합니다. Linux에서는 수동으로 `sudo chown -R 1000:1000 data`를 실행해도 됩니다.
- 엔트리 스크립트는 `.env`의 상대 경로 `DATA_DIR` / `DATABASE_PATH`를 `/data`로 자동 매핑하므로, `docker run --env-file .env`만으로도 초기 설정 마법사에 정상 진입할 수 있습니다.
- 컨테이너 내부에서는 항상 `/data`를 데이터 디렉터리로 사용하며, Compose가 `.env`의 `DATA_DIR` / `DATABASE_PATH`를 덮어쓰므로 컨테이너 내 상대 경로로 변경하지 마세요.
- `PUBLIC_BASE_URL`은 브라우저에서 실제로 접속하는 주소와 일치해야 합니다(예: `http://192.168.1.10:8787`). 도메인 / HTTPS 리버스 프록시를 사용하는 경우에도 함께 수정하세요.
- `APP_SECRET`은 필수이며, 누락되면 컨테이너가 종료됩니다. `docker compose logs -f steam-monitor`로 시작 오류를 확인할 수 있습니다.
- `.env`를 수정한 후 `docker compose up -d`를 실행해 컨테이너를 재생성해야 적용됩니다.
- 애플리케이션 프로세스는 비 root 사용자로 실행되며, 내장 `HEALTHCHECK`가 `/api/health`에 접근합니다.
- 이미지 업데이트: `docker compose pull && docker compose up -d`, 로컬 빌드는 `docker compose up -d --build`, 중지는 `docker compose down`(데이터 유지).
- 리버스 프록시 주의 사항:
  - `/webhooks/*`의 **원본 요청 본문**을 그대로 전달해야 합니다(재작성하거나 다시 직렬화하지 마세요).
  - `client_max_body_size 1m`, 읽기 타임아웃 10초 이상.
  - HTTP 콜백을 사용하는 Feishu / Lark / DingTalk 주소는 공인 인터넷에서 HTTPS로 접근 가능해야 합니다. Feishu / Lark, DingTalk Stream, WeCom 스마트 봇이 아웃바운드 롱 커넥션을 사용할 때는 콜백 주소가 필요하지 않습니다.

## 알림 채널 구성

「알림 채널」 페이지에서 채널을 추가합니다:

- **WeCom 그룹 봇**: 그룹 설정 → 그룹 봇 → 봇 추가 후 Webhook을 복사합니다.
- **Feishu 사용자 지정 봇**: 그룹 설정 → 그룹 봇 → 사용자 지정 봇. 서명 검증을 사용하는 경우 서명 키도 함께 입력하세요.
- **DingTalk 사용자 지정 봇**: 그룹 설정 → 스마트 그룹 도우미 → 봇 추가. 서명을 사용하는 경우 서명 키도 함께 입력하세요.
- **사용자 지정 WebHook**: 임의의 HTTPS 엔드포인트를 입력합니다. 시스템이 JSON 이벤트를 POST하며, HMAC 서명 키와 Authorization 헤더는 선택 사항입니다.
- **SMTP**: 서버, 포트, SSL/TLS, 발신자와 수신자를 입력합니다(여러 주소는 쉼표로 구분).

키는 `APP_SECRET`에서 파생된 AES-256-GCM으로 암호화되어 저장되며, API는 평문을 반환하지 않습니다. 편집 시 비워 두면 기존 값을 유지합니다.

사용자 지정 WebHook의 요청 형식, Payload 필드, 서명 알고리즘은 [docs/CUSTOM_WEBHOOK.ko.md](docs/CUSTOM_WEBHOOK.ko.md)를 참고하세요.

「구독 이벤트」를 선택하지 않으면 「검사 오류」를 제외한 모든 이벤트를 수신합니다.

## 명령 봇 연동

「명령 봇」 페이지에서 봇을 생성합니다:

| 플랫폼 | 연동 방식 | 설명 |
| --- | --- | --- |
| Feishu / Lark | HTTP 콜백 또는 WebSocket 롱 커넥션 | QR 원클릭 앱 생성 또는 App ID / App Secret 수동 입력. 롱 커넥션은 오픈 플랫폼에서 「롱 커넥션으로 이벤트 수신」을 선택하고 `im.message.receive_v1`을 구독해야 합니다 |
| DingTalk | HTTP 콜백 또는 Stream 롱 커넥션 | QR 원클릭 봇 생성 또는 Client ID / Secret 수동 입력. HTTP 콜백은 App Secret을 입력해 서명을 검증하고, Stream 모드는 공인 주소가 필요하지 않습니다 |
| WeCom | WebSocket 롱 커넥션(콜백 주소 불필요) | 관리 콘솔에서 스마트 봇을 생성하고 API 모드 → 롱 커넥션을 선택한 뒤 Bot ID / Secret을 입력합니다. 서비스가 `wss://openws.work.weixin.qq.com`에 능동적으로 연결합니다 |

Feishu / Lark의 HTTP 콜백 주소는 `POST /webhooks/feishu/<slug>`입니다. 콜백 모드는 Encrypt Key / Verification Token을 지원하며, 롱 커넥션 모드는 공인 콜백 주소가 필요하지 않습니다. 설정의 「버전」은 Feishu(`open.feishu.cn`)와 Lark 국제판(`open.larksuite.com`)을 전환하는 데 사용됩니다.

**Feishu / Lark QR 추가(권장)**: 「명령 봇」 페이지에서 **Feishu / Lark QR**을 클릭하고 「Feishu」 또는 「Lark 국제판」을 선택한 뒤, 해당 클라이언트로 QR 코드를 스캔하고 페이지 안내에 따라 앱을 생성합니다. 시스템이 App ID / App Secret을 자동으로 가져오고 스캔한 사용자의 `open_id`를 소유자 식별자로 기록합니다. QR 코드는 10분 동안 유효합니다. QR로 생성되는 것은 `PersonalAgent` 앱이며 봇 기능과 메시지 이벤트 구독이 미리 설정되어 있습니다. 생성 후 Feishu / Lark에서 앱 이름을 검색해 대화를 시작하거나 그룹 채팅에 추가할 수 있습니다.

**DingTalk QR 추가(권장)**: **DingTalk QR 추가** 버튼을 클릭하고 휴대폰 DingTalk으로 QR 코드를 스캔한 뒤, 페이지 안내에 따라 조직을 선택하고 봇 정보를 입력합니다. 시스템이 Client ID / Client Secret을 자동으로 가져오고 Client ID를 Robot Code로 사용하며 Stream 롱 커넥션을 활성화합니다. QR 코드는 10분 동안 유효합니다. 생성 후 DingTalk에서 봇을 검색해 1:1 채팅을 시작하거나 그룹 채팅에 추가할 수 있습니다. 구성원이 처음으로 명령을 보내면 웹 인증 링크를 받게 되며, 봇 소유 계정으로 웹에 로그인해 승인하면 사용할 수 있습니다.

WeCom 롱 커넥션은 서버가 능동적으로 연결하며 공인 IP, Token, EncodingAESKey가 필요하지 않습니다. 동일한 봇은 동시에 하나의 유효한 연결만 허용되며, 다중 인스턴스로 배포하면 서로 연결을 끊습니다. 구 버전 WeCom 자체 구축 앱 콜백 구성은 폐기되었으므로 스마트 봇의 Bot ID / Secret을 입력하는 방식으로 변경하세요.

**WeCom QR 추가**를 클릭해 생성 권한이 있는 WeCom 계정으로 QR 코드를 스캔할 수도 있습니다. 시스템이 Bot ID / Secret을 자동으로 가져와 봇을 생성하고 롱 커넥션을 수립합니다. QR 코드는 5분 동안 유효합니다. 구성원이 처음으로 명령을 보내면 웹 인증 링크를 받게 되며, 봇 소유 계정으로 웹에 로그인해 승인하거나 허용 목록에 직접 추가하면 됩니다.

Feishu / Lark, DingTalk, WeCom의 미승인 사용자가 명령을 보내면 봇은 일회용 웹 인증 링크를 회신하며 해당 명령을 실행하지 않습니다. 봇 소유 계정의 웹 사용자가 링크 페이지에 로그인하면 해당 플랫폼 사용자에게 읽기 전용 또는 관리자 역할을 선택해 승인할 수 있으며, 링크는 30분 동안 유효합니다. `PUBLIC_BASE_URL`은 브라우저에서 접근 가능해야 하며, 그렇지 않으면 링크를 열 수 없습니다.

명령 봇은 편집 페이지에서 **이벤트 알림 수신**을 켤 수도 있습니다. 활성화하면 출시, 프로모션, 판매 중단 등의 이벤트가 해당 봇에 마지막으로 승인된 사용자가 사용한 세션으로 푸시됩니다. 시스템이 알림 대상을 기록하려면 먼저 승인된 사용자가 채팅에서 명령을 한 번 이상 보내야 하며, 최근 세션이 없으면 푸시하지 않습니다. DingTalk 이벤트 알림은 App Key, App Secret, Robot Code도 입력해야 합니다.

봇의 명령은 항상 **봇 소유 계정**의 데이터에 적용됩니다. 모든 플랫폼 사용자(QR 스캔 시 식별된 소유자 ID 포함)는 먼저 웹 인증을 거치거나 허용 목록에 추가되어야 하며, 그렇지 않으면 봇은 일회용 인증 링크만 반환하고 명령을 실행하지 않습니다. 승인 시 `viewer`(읽기 전용) 또는 `admin`을 선택할 수 있습니다. 소유자 ID는 이제 식별 용도로만 사용됩니다. 자세한 절차는 [docs/BOT_INTEGRATION.ko.md](docs/BOT_INTEGRATION.ko.md)를 참고하세요.

WeChat ClawBot(iLink)과 QQ Bot 연동은 플랫폼 공식 프로토콜에 따라 통합 중이며, 완료되면 같은 페이지에 표시됩니다.

### 명령

```
/help
/add <appid | 스토어 링크 | 이름> [--discount N] [--note 텍스트] [--force]
/adddlc <기본 게임> [--max 50]
/remove <id | appid>
/pause <id | appid>
/resume <id | appid>
/check <id | appid | 이름>
/price <id | appid | 이름>
/list [--all] [--sale] [--paused] [--page N]
/events [--item id] [--limit 10]
/cancel
```

전각 `／`, `/add@bot`, 따옴표 인수, `--flag=value`를 지원합니다.

## 지역과 기준 재설정

지역은 사용자 수준 설정입니다. 지역을 변경하면 해당 사용자의 기존 모니터링 항목이 모두 기준 재설정됩니다. 프로모션 기준점(앵커)을 비우고 상태를 초기화하며, 첫 검사에서는 스냅샷만 기록하고 이벤트를 생성하지 않아 지역별 가격 차이로 인한 오탐을 방지합니다. 다른 사용자에게는 영향을 주지 않습니다.

## 비밀번호 재설정

서버 터미널에서 실행합니다(웹 로그인 불필요):

```bash
pnpm reset-password <사용자 이름>
pnpm reset-password <사용자 이름> --password 'new-password-123'
pnpm reset-password <사용자 이름> --enable
```

Docker 배포 시:

```bash
docker compose exec steam-monitor node dist-server/reset-password.js <사용자 이름>
```

- `--password`를 지정하지 않으면 임의의 임시 비밀번호를 생성해 터미널에 출력합니다.
- 재설정 후 `must_change_password=1`이 되며, 사용자는 다음 로그인 시 반드시 비밀번호를 변경해야 합니다. 해당 사용자의 기존 세션은 모두 무효화됩니다.
- 비활성화된 계정은 기본적으로 비활성 상태로 유지되며, `--enable`을 추가하면 함께 활성화됩니다.
- 명령은 SQLite를 직접 조작하며 `APP_SECRET`에 의존하지 않습니다. `DATA_DIR` / `DATABASE_PATH`로 데이터베이스를 찾습니다.

## 백업과 복원

```bash
pnpm backup
```

스크립트는 `VACUUM INTO`를 사용해 `${DATA_DIR}/backups/`에 `steam-monitor-YYYYMMDD-HHmm.db`를 생성하며, 기본적으로 최근 14개를 보존합니다. Docker에서는 다음을 실행할 수 있습니다:

```bash
docker compose exec steam-monitor node_modules/.bin/tsx scripts/backup.ts
```

복원 절차: 컨테이너 중지 → 백업 파일로 `steam-monitor.db` 교체 → 같은 디렉터리의 `-wal` / `-shm` 파일 삭제 → 컨테이너 시작. **`.env`의 `APP_SECRET`도 함께 백업하세요.** 그렇지 않으면 암호화된 채널과 봇 키를 복원할 수 없어 다시 입력해야 합니다.

## 테스트

```bash
pnpm type-check
pnpm lint
pnpm test:unit
pnpm test:e2e   # Playwright 브라우저를 먼저 설치해야 합니다: pnpm exec playwright install chromium
```

엔드 투 엔드 테스트는 다음을 수행합니다:

1. `data/e2e`에 새 데이터베이스를 생성하고 백엔드(4180), Vite(4181), mock 서비스(9998)를 시작합니다.
2. mock Steam API를 사용해 출시, 프로모션, 판매 중단, 복구의 전체 흐름을 구동합니다.
3. WeCom 알림, 사용자 지정 WebHook, SMTP 이메일, Feishu / Lark / DingTalk 콜백과 QR 구성, Feishu / DingTalk / WeCom 롱 커넥션, 다중 사용자 격리를 검증합니다.

`scripts/mock-receiver.ts`는 로컬 연동 테스트용으로 단독 실행할 수도 있습니다:

```bash
pnpm mock:receiver
# 알림 Webhook: http://127.0.0.1:9999/<임의 경로>
# SMTP sink: 127.0.0.1:1025
# 캡처 결과: GET http://127.0.0.1:9999/_requests
# Steam 시뮬레이션: http://127.0.0.1:9999/steam-store 및 /steam-api
```

`ALLOW_INSECURE_WEBHOOKS=1`과 `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL`을 함께 사용하면 완전히 오프라인으로 연동 테스트를 진행할 수 있습니다.

## 알려진 제한 사항

- Steam 스토어 API는 비공식 API이므로 변경되거나 속도가 제한될 수 있습니다. "판매 중단 / 지역 판매 불가 / 잘못된 appid"를 구분할 수 없어, 시스템은 "과거에 판매된 적 있음 + 연속 두 번 구매 불가" 조건으로 오탐을 줄입니다.
- 뉴스 키워드 경고는 Steam 뉴스 / 공지사항만 대상으로 하는 휴리스틱 알림이므로 수동으로 확인해야 합니다.
- 정확한 프로모션 종료 시각을 알 수 없어 `sale_end`는 다음 폴링에서 할인율이 0이 된 것을 감지하는 방식에 의존합니다.
- WeCom 그룹 봇은 전송만 가능합니다. 그룹 내 명령은 WeCom 스마트 봇 롱 커넥션을 사용하세요. 롱 커넥션은 동일한 봇에 하나의 유효한 연결만 지원하므로 다중 인스턴스 배포 시 서로 연결을 끊습니다.
- WeChat ClawBot(iLink)과 QQ Bot은 플랫폼 공식 프로토콜에 따라 연동 중입니다.
- 단일 인스턴스 배포, SQLite 단일 쓰기 방식이며 고가용성을 제공하지 않습니다.
- 사용자 지역이 다르면 동일한 게임이 지역별로 각각 캐시되고 별도로 수집됩니다.

## 디렉터리 구조

```
server/            Hono 앱, SQLite, Steam 수집, 스케줄러, 알림, 플랫폼 콜백 / 롱 커넥션, 명령
shared/            프런트엔드와 백엔드가 공유하는 타입, 상수, Zod 스키마
src/               Vue 프런트엔드
scripts/           mock 서비스, 백업, E2E 시작 스크립트
e2e/               Playwright 엔드 투 엔드 테스트
Dockerfile         다단계 빌드(프런트엔드와 서버 빌드 → 런타임에는 프로덕션 의존성만 포함)
docker-compose.yml 단일 서비스 배포, 호스트 ./data 바인드 마운트
data/              호스트 데이터 디렉터리(SQLite, 백업, logs/ 애플리케이션 로그)
```
