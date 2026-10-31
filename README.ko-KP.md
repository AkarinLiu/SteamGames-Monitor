# SteamGames-Monitor

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Italiano](README.it.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [조선어](README.ko-KP.md) | [Nederlands](README.nl.md) | [Русский](README.ru.md)

인터페히스는 중국어 간체, 중국어 번체, 영어, 독일어, 프랑스어, 이탈리아어, 일본어, 한국어, 조선어, 네델란드어, 로씨야어를 지원합니다. 오른쪽우에서 선택하여 전환할수 있으며, 이 설정은 Steam 내용물 언어와 별개입니다.

자체 호스팅하는 다중리용자 Steam 게임 / DLC 판매상태 감시체계입니다. SQLite로 데터를 보관하고 **곧 판매중지 / 내리기, 할인, 발매**를 감시하며, 기업위신단체대화방로보트, 페이수로보트, 딩딩로보트 또는 SMTP메일로 통지합니다.
하나의 과정이 동시에 Web인터페히스, REST API, Steam조회스케쥴, 통지전달대기렬, 페이수 / Lark / 딩딩콜백, 그리고 페이수, 딩딩 Stream과 기업위신긴련결을 제공하므로 단일기 Docker Compose전개에 적합합니다.

## 기능

- **다중리용자독립계정**: 관리자가 계정을 만들며, 모든 리용자는 독립적인 감시항목, 사건, 통지경로와 명령로보트를 가지며 데터는 엄격히 격리됩니다.
- **감시항목**: appid, 상점련결, 이름검색을 지원하며, 기본게임의 모든 DLC를 일괄수입할수 있습니다.
- **상태변화**: 발매(coming soon 전환), 할인개시 / 변화 / 종료, 원래가격변화, 리용불가(내리기)와 회복.
- **내리기판정**: 상점에서 구매할수 있는 상태가 련속 두번 전환되여야 내리기로 확정하고, Steam소식의 핵심단어와 배합하여 사전경보를 합니다(발견법, 참고용에 불과).
- **통지경로**: 기업위신단체대화방로보트, 페이수리용자정의로보트, 딩딩리용자정의로보트, 리용자정의 WebHook, SMTP메일; 실패시 자동으로 재시도합니다.
- **명령로보트**: 페이수 / Lark응용로보트(스캔부호로 한번에 창조, HTTP콜백 또는 WebSocket긴련결), 딩딩로보트(스캔부호로 한번에 창조, HTTP콜백 또는 Stream긴련결), 기업위신지능로보트긴련결; 스캔부호창조, 미허가웹페지권한부여와 사건통지를 지원하며 `/add`, `/list`, `/price`, `/check`, `/pause`, `/resume`, `/remove`, `/adddlc`, `/events`, `/cancel`을 지원합니다. 위신 ClawBot과 QQ Bot은 해당플래트홈의 공식프로토콜에 따라 접속중입니다.
- **운영친화**: 건강검사, Docker이미지, 데터베스련상예비보관, 설정가능한 데터보존책략.

## 기술구성

- Node.js 24 + TypeScript(ESM), Hono, `node:sqlite`(WAL), Zod, Nodemailer
- Vue 3 + Vite + Pinia + Vue Router(건설산물은 Node과정이 직접 봉사)
- 시험: Vitest(단위), Playwright(종단간)

## 빠른 시작(본지개발)

Node.js `^22.18 || >=24.12`와 pnpm이 필요합니다.

```bash
pnpm install
cp .env.example .env
# .env를 편집: 적어도 APP_SECRET(>=32자)을 채우십시오
openssl rand -base64 48
pnpm dev
```

- Web인터페히스: http://localhost:5173
- 백단 API: http://localhost:8787

처음 시작할 때 Web인터페히스를 직접 열어 첫번째 관리자계정을 만들고 지역, 언어와 시간대를 선택하십시오. **지역에는 기본값이 없으며**, 초기화를 마치지 않은 계정은 감시항목을 추가할수 없습니다. 초기화인터페히스는 첫 관리자를 만든 후 자동으로 무효화되며, 더는 초기화토큰이 필요없으므로 초기화하지 않은 상태에서 실례를 공용망에 폭로하지 마십시오. 전개한 후에는 즉시 초기화를 마쳐야 합니다.

### 생산건설

```bash
pnpm build   # 타입검사 + 전단 dist/ 건설 + 봉사단 dist-server/index.js
pnpm start   # 먼저 건설해야 함; Node가 API와 정적전단을 동시에 제공
```

## 환경변수

| 변수 | 설명 |
| --- | --- |
| `NODE_ENV` | `production`일 때 `APP_SECRET`검증을 강제 |
| `HOST` / `PORT` | 청취주소와 포트, 기본값 `0.0.0.0:8787` |
| `DATA_DIR` | 데터목록, 기본값 `./data`(Docker에서는 `/data`) |
| `DATABASE_PATH` | SQLite화일경로, 기본값 `${DATA_DIR}/steam-monitor.db` |
| `APP_SECRET` | 필수, ≥32자. 경로 / 로보트자격증명을 암호화할 키를 파생하는데 리용; **분실하면 이미 보관된 키는 해독할수 없음** |
| `PUBLIC_BASE_URL` | 외부접근주소. 페이수 / Lark / 딩딩콜백주소, 기업위신웹페지권한부여련결과 CSRF검증을 생성하는데 리용; 긴련결자체는 공용망콜백이 필요없음 |
| `TRUSTED_ORIGINS` | 추가로 허용할 Origin, 쉼표로 구분(개발시 `http://localhost:5173` 포함) |
| `COOKIE_SECURE` | HTTPS전개시 `1`로 설정 |
| `TRUST_PROXY` | 반대프록시계층수 |
| `MAX_TOTAL_MONITORS` | 전역감시항목상한, 기본값 2000 |
| `ALLOW_INSECURE_WEBHOOKS` | 시험할 때만 `1`로 설정, http / 내부망 Webhook허용 |
| `ENABLE_DEV_COMMANDS` / `DEV_COMMAND_TOKEN` | 개발용 `/api/dev/command` 모의명령 |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error`; 화일록크는 `${DATA_DIR}/logs/app-YYYY-MM-DD.log`에 기록 |
| `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL` | 선택, Steam종단점을 대체(시험 / 프록시용) |

프록시환경에서는 `HTTPS_PROXY`, `NODE_USE_ENV_PROXY=1`과 `NO_PROXY`를 리용할수 있습니다. 체계증서사슬을 Node가 식별하지 못하는 경우 봉사가 시작될 때 체계 CA를 합칩니다(`lib/tls.ts`).

## Docker Compose전개

GitHub Actions는 `main`분지에 push할 때 스냅샷이미지(`dev`)를 발행하고, 안정버전태그(례를 들면 `v1.1.0`)에 push할 때 의미화된 버전을 발행하며 `latest`를 해당 안정버전에 돌립니다.

```bash
# 최신안정판
docker pull akarinliu2000/steamgames-monitor:latest
# 현재 1.1.0안정판
docker pull akarinliu2000/steamgames-monitor:1.1.0
# main분지 최신스냅샷
docker pull akarinliu2000/steamgames-monitor:dev
```

이미지는 `linux/amd64`와 `linux/arm64`를 지원하며 Docker가 숙주기구조에 따라 자동으로 선택합니다. 두가지 기초이미지를 제공합니다.

| 태그 | 기초이미지 | 설명 |
| --- | --- | --- |
| `latest` / `1.1.0` / `1.1` | Debian slim(`node:24-bookworm-slim`) | 최신안정판 |
| `latest-alpine` / `1.1.0-alpine` / `1.1-alpine` | Alpine(`node:24-alpine`) | 최신안정판 Alpine |
| `dev` | Debian slim | `main`분지 최신스냅샷 |
| `dev-alpine` | Alpine | `main`분지 최신 Alpine스냅샷 |

`latest`는 예비발행이 아닌 태그(례를 들면 `v1.1.0`)에서만 이동하며, `-rc` / `-beta`가 붙은 태그는 `latest`를 덮어쓰지 않습니다. `main`분지의 일반커밋은 `dev` / `dev-alpine`과 `sha-*`태그만 갱신합니다.

```bash
docker pull akarinliu2000/steamgames-monitor:latest-alpine
# 본지에서 Alpine판 건설
docker build --build-arg BASE_IMAGE=node:24-alpine -t steam-monitor:alpine .
```

이미지를 직접 실행:

```bash
cp .env.example .env
# APP_SECRET, PUBLIC_BASE_URL(공용망 HTTPS주소), COOKIE_SECURE=1, TRUST_PROXY=1을 채우십시오
docker run -d --name steam-monitor \
  --env-file .env \
  -p 8787:8787 \
  -v "$(pwd)/data:/data" \
  --restart unless-stopped \
  akarinliu2000/steamgames-monitor:latest
```

콘테나록크보기:

```bash
# docker run방식
docker logs -f steam-monitor

# docker compose방식
docker compose logs -f steam-monitor
```

`docker ps`에 표시되는 콘테나이름이 임의의 이름(례를 들면 `nervous_roentgen`)이라면 시작할 때 `--name steam-monitor`를 붙이지 않은것입니다. 이때 `docker compose logs`는 해당 콘테나를 표시하지 않으며 `docker logs -f <실제콘테나이름>`을 리용해야 합니다. `docker run`만 리용할 때는 `--env-file .env`를 넘겨야 `LOG_LEVEL`, `PUBLIC_BASE_URL` 등 설정이 적재됩니다. 넘기지 않으면 록크수준은 기본값 `info`, `PUBLIC_BASE_URL`은 기본값 `http://localhost:8787`입니다.

응용록크는 또한 UTC날자에 따라 `${DATA_DIR}/logs/app-YYYY-MM-DD.log`에 기록되며, Docker에서는 기본적으로 숙주기의 `./data/logs/`에 대응됩니다. 콘테나의 stdout도 그대로 보존되므로 `docker logs`로 볼수 있습니다. 록크화일은 자동으로 삭제되지 않으므로 필요에 따라 보관하거나 정리하십시오.

Docker Hub이미지로 Compose를 시작:

```bash
docker compose pull
docker compose up -d
```

코드를 수정한 후 본지에서 다시 건설(같은 이름의 Docker Hub태그로 본지이미지를 덮어씀):

```bash
docker compose up -d --build
```

### Docker Hub에 발행

Docker Hub주소: <https://hub.docker.com/r/akarinliu2000/steamgames-monitor>(`akarinliu2000/steamgames-monitor`)

`.github/workflows/dockerhub.yml`은 `main`분지에 push할 때 `dev`스냅샷을 발행하고, 안정버전태그에 push할 때 의미화된 버전을 발행하며 `latest`를 갱신합니다.

- 창고 Secrets에 `DOCKERHUB_USERNAME`과 `DOCKERHUB_TOKEN`(Docker Hub Access Token, Read & Write권한 필요)을 설정해야 합니다.
- 현재이미지: `docker.io/akarinliu2000/steamgames-monitor:latest`, `:1.1.0`, `:dev`(Debian) 및 그에 대응하는 `-alpine`판이며, 모두 amd64/arm64다중구조입니다.
- Docker Hub창고는 이미 공개되여있어 익명으로 직접 내리적재할수 있습니다.
- 조직네임스페히스를 리용하려면 창고변수 `DOCKERHUB_REPOSITORY`를 추가할수 있습니다(례를 들면 `myorg/steamgames-monitor`).

```bash
docker pull akarinliu2000/steamgames-monitor:latest
```

```bash
gh secret set DOCKERHUB_USERNAME --repo AkarinLiu/SteamGames-Monitor
gh secret set DOCKERHUB_TOKEN --repo AkarinLiu/SteamGames-Monitor
```

- 데터는 숙주기의 `./data`(콘테나의 `/data`에 마운트)에 지속되며, 데터베스, 예비보관과 `logs/`록크가 모두 여기에 기록됩니다.
- 이미지입구는 `./data`의 권한을 바로잡은 다음 콘테나안의 `node`리용자로 권한을 낮추어 응용을 실행합니다. Linux에서는 수동으로 `sudo chown -R 1000:1000 data`를 실행할수도 있습니다.
- 입구스크립트는 `.env`의 상대적인 `DATA_DIR` / `DATABASE_PATH`를 자동으로 `/data`에 대응시키므로, `docker run --env-file .env`만으로도 초기화마법사에 정상적으로 들어갈수 있습니다.
- 콘테나안에서는 항상 `/data`를 데터목록으로 리용하며, Compose는 `.env`의 `DATA_DIR` / `DATABASE_PATH`를 덮어씁니다. 콘테나안의 상대경로로 바꾸지 마십시오.
- `PUBLIC_BASE_URL`은 브라우제가 실제로 접근하는 주소와 일치해야 합니다(례를 들면 `http://192.168.1.10:8787`). 도메인 / HTTPS반대프록시를 리용할 때도 함께 수정하십시오.
- `APP_SECRET`은 필수이며, 없으면 콘테나가 종료됩니다. `docker compose logs -f steam-monitor`로 시작오유를 볼수 있습니다.
- `.env`를 수정한 후 `docker compose up -d`를 실행하여 콘테나를 다시 만들어 적용하십시오.
- 응용과정은 비root리용자로 실행되며, 내장된 `HEALTHCHECK`가 `/api/health`에 접근합니다.
- 이미지갱신: `docker compose pull && docker compose up -d`; 본지건설은 `docker compose up -d --build`; 정지: `docker compose down`(데터보존).
- 반대프록시주의사항:
  - `/webhooks/*`의 **원시요청본체**를 그대로 전달해야 합니다(개작하거나 다시 직렬화하지 마십시오).
  - `client_max_body_size 1m`, 읽기초과시간 ≥10s.
  - HTTP콜백을 리용하는 페이수 / Lark / 딩딩주소는 공용망 HTTPS로 접근할수 있어야 합니다. 페이수 / Lark, 딩딩 Stream과 기업위신지능로보트가 출발긴련결을 리용할 때는 콜백주소가 필요없습니다.

## 통지경로설정

《통지경로》페지에서 경로를 추가합니다.

- **기업위신단체대화방로보트**: 단체대화방설정 → 단체대화방로보트 → 로보트추가, Webhook을 복사.
- **페이수리용자정의로보트**: 단체대화방설정 → 단체대화방로보트 → 리용자정의로보트; 서명검증을 켜면 서명키도 함께 채우십시오.
- **딩딩리용자정의로보트**: 단체대화방설정 → 지능단체대화방조수 → 로보트추가; 가입서명을 켜면 가입서명키도 함께 채우십시오.
- **리용자정의 WebHook**: 임의의 HTTPS인터페히스를 채우십시오. 체계는 사건을 JSON으로 POST하며, HMAC서명키와 Authorization머리를 선택적으로 지정할수 있습니다.
- **SMTP**: 봉사기, 포트, SSL/TLS, 발신자와 접수자(여러주소는 쉼표로 구분)를 채우십시오.

키는 `APP_SECRET`으로부터 파생한 AES-256-GCM으로 암호화하여 보관하며, API는 평문을 돌려보내지 않습니다. 편집할 때 비워두면 원래값을 보존한다는 뜻입니다.

리용자정의 WebHook의 요청형식, Payload항목과 서명알고리듬은 [docs/CUSTOM_WEBHOOK.ko-KP.md](docs/CUSTOM_WEBHOOK.ko-KP.md)를 보십시오.

《구독사건》에서 아무것도 선택하지 않으면 《검사이상》을 제외한 모든 사건을 받는다는 뜻입니다.

## 명령로보트접속

《명령로보트》페지에서 로보트를 만듭니다.

| 플래트홈 | 접속방식 | 설명 |
| --- | --- | --- |
| 페이수 / Lark | HTTP콜백 또는 WebSocket긴련결 | 스캔부호로 응용을 한번에 창조할수 있고, App ID / App Secret을 수동으로 채울수도 있음; 긴련결은 《긴련결로 사건접수》를 선택하고 `im.message.receive_v1`을 구독해야 함 |
| 딩딩 | HTTP콜백 또는 Stream긴련결 | 스캔부호로 로보트를 한번에 창조할수 있고, Client ID / Secret을 수동으로 채울수도 있음; HTTP콜백은 App Secret으로 서명을 검증하며, Stream모식은 공용망주소가 필요없음 |
| 기업위신 | WebSocket긴련결(콜백주소 불필요) | 관리배후에서 지능로보트를 만들고 API모식 → 긴련결을 선택한 다음 Bot ID / Secret을 채움; 봉사가 `wss://openws.work.weixin.qq.com`에 자발적으로 접속 |

페이수 / Lark의 HTTP콜백주소는 `POST /webhooks/feishu/<slug>`입니다. 콜백모식은 Encrypt Key / Verification Token을 지원하며, 긴련결모식은 공용망콜백주소가 필요없습니다. 설정의 《버전》은 페이수(`open.feishu.cn`)와 Lark국제판(`open.larksuite.com`)을 전환하는데 리용합니다.

**페이수 / Lark스캔부호추가(권장)**: 《명령로보트》페지에서 **페이수 / Lark스캔부호**를 클릭하고 《페이수》 또는 《Lark국제판》을 선택한 다음 해당클리앙트로 스캔부호를 찍고 페지의 안내에 따라 응용을 만드십시오. 체계는 App ID / App Secret을 자동으로 얻고 스캔한사람의 `open_id`를 소유자식별로 기록합니다. 2차원부호는 10분동안 유효합니다. 스캔부호로 만드는것은 `PersonalAgent`응용이며 로보트기능과 메쓰지사건구독이 미리 설정되여있습니다. 만든 후 페이수 / Lark에서 응용이름을 검색하여 대화를 시작하거나 단체대화방에 추가할수 있습니다.

**딩딩스캔부호추가(권장)**: **딩딩스캔부호추가**를 클릭하고 휴대전화 딩딩으로 스캔부호를 찍은 다음 페지의 안내에 따라 조직을 선택하고 로보트정보를 채우십시오. 체계는 Client ID / Client Secret을 자동으로 얻고 Client ID를 Robot Code로 리용하며 Stream긴련결을 켭니다. 2차원부호는 10분동안 유효합니다. 만든 후 딩딩에서 로보트를 검색하여 개별대화를 시작하거나 단체대화방에 추가할수 있습니다. 리용성원이 처음 명령을 보내면 웹페지권한부여련결을 받으며, 로보트소속계정으로 웹페지에 로그인하여 비준하면 리용할수 있습니다.

기업위신긴련결은 봉사단에서 자발적으로 건립하며 공용망 IP, Token 또는 EncodingAESKey가 필요없습니다. 같은 로보트는 같은 시간에 하나의 유효련결만 허용되며, 여러실례를 전개하면 서로의 련결을 끊습니다. 옛판 기업위신자체응용콜백설정은 이미 페지되였으므로 지능로보트의 Bot ID / Secret을 채우십시오.

**기업위신스캔부호추가**를 클릭하여 창조권한이 있는 기업위신으로 스캔부호를 찍을수도 있습니다. 체계는 Bot ID / Secret을 자동으로 얻고 로보트를 만들어 긴련결을 건립합니다. 2차원부호는 5분동안 유효합니다. 리용성원이 처음 명령을 보낸 후 웹페지권한부여련결을 받으며, 로보트소속계정으로 웹페지에 로그인하여 비준하거나 허용명부에 직접 추가할수 있습니다.

페이수 / Lark, 딩딩, 기업위신의 미허가리용자가 명령을 보내면 로보트는 한번만 리용할수 있는 웹페지권한부여련결을 답하고 해당명령은 실행하지 않습니다. 로보트소속계정의 Web리용자가 련결페지에 로그인한 후 해당플래트홈리용자에게 읽기전용 또는 관리자역할을 선택하여 비준할수 있으며, 련결은 30분동안 유효합니다. `PUBLIC_BASE_URL`은 브라우제에서 접근할수 있어야 하며, 그렇지 않으면 련결을 열수 없습니다.

명령로보트는 편집페지에서 **사건통지접수**를 켤수도 있습니다. 켜면 발매, 할인, 내리기 등 사건이 해당로보트가 마지막으로 권한부여된 리용자가 리용한 대화에 밀려갑니다. 권한부여된 리용자가 대화에서 적어도 하나의 명령을 보낸적이 있어야 체계가 통지목표를 기록하며, 최근대화가 없으면 밀어보내지 않습니다. 딩딩사건통지는 App Key, App Secret과 Robot Code도 채워야 합니다.

로보트의 명령은 항상 **로보트소속계정**의 데터에 작용합니다. 모든 플래트홈리용자(스캔부호로 식별된 소유자 ID 포함)는 먼저 웹페지권한부여를 거치거나 허용명부에 들어가야 하며, 그렇지 않으면 로보트는 한번만 리용할수 있는 권한부여련결만 돌려보내고 명령을 실행하지 않습니다. 비준할 때 `viewer`(읽기전용) 또는 `admin`을 선택할수 있습니다. 소유자 ID는 지금 식별에만 리용됩니다. 자세한 절차는 [docs/BOT_INTEGRATION.ko-KP.md](docs/BOT_INTEGRATION.ko-KP.md)를 보십시오.

위신 ClawBot(iLink)과 QQ Bot접속은 해당플래트홈의 공식프로토콜에 따라 통합중이며, 완성되면 같은 페지에 나타납니다.

### 명령

```
/help
/add <appid | 상점련결 | 이름> [--discount N] [--note 본문] [--force]
/adddlc <기본게임> [--max 50]
/remove <id | appid>
/pause <id | appid>
/resume <id | appid>
/check <id | appid | 이름>
/price <id | appid | 이름>
/list [--all] [--sale] [--paused] [--page N]
/events [--item id] [--limit 10]
/cancel
```

전각 `／`, `/add@bot`, 인용부호인수와 `--flag=value`를 지원합니다.

## 지역과 기준선재설정

지역은 리용자수준의 설정입니다. 지역을 수정하면 해당리용자의 기존감시항목을 전부 다시 기준선화합니다. 할인기준점을 비우고 상태를 재설정하며, 첫회검사는 스냅샷만 기록하고 사건을 만들지 않으므로 지역가격차이로 인한 오보를 피합니다. 다른 리용자는 영향을 받지 않습니다.

## 비밀번호재설정

봉사기단말에서 실행합니다(Web로그인 불필요).

```bash
pnpm reset-password <리용자이름>
pnpm reset-password <리용자이름> --password 'new-password-123'
pnpm reset-password <리용자이름> --enable
```

Docker전개:

```bash
docker compose exec steam-monitor node dist-server/reset-password.js <리용자이름>
```

- `--password`를 지정하지 않으면 임의의 림시비밀번호를 생성하여 단말에 인쇄합니다.
- 재설정후 `must_change_password=1`이 되며, 리용자는 다음 로그인때 반드시 비밀번호를 바꾸어야 합니다. 해당리용자의 기존 세션은 모두 무효화됩니다.
- 금지된 계정은 기본적으로 금지상태를 유지하며, `--enable`을 더하면 함께 리용가능하게 할수 있습니다.
- 명령은 SQLite를 직접 조작하며 `APP_SECRET`에 의존하지 않고, `DATA_DIR` / `DATABASE_PATH`로 데터베스를 찾습니다.

## 예비보관과 회복

```bash
pnpm backup
```

스크립트는 `VACUUM INTO`를 리용하여 `${DATA_DIR}/backups/`에 `steam-monitor-YYYYMMDD-HHmm.db`를 생성하며, 기본적으로 최근 14개를 보존합니다. Docker에서는 다음을 실행할수 있습니다.

```bash
docker compose exec steam-monitor node_modules/.bin/tsx scripts/backup.ts
```

회복절차: 콘테나정지 → 예비보관화일로 `steam-monitor.db`를 대체 → 같은 목록의 `-wal` / `-shm`화일삭제 → 콘테나시작. **`.env`의 `APP_SECRET`도 함께 예비보관하십시오**. 그렇지 않으면 암호화된 경로와 로보트키를 회복할수 없어 다시 채워야 합니다.

## 시험

```bash
pnpm type-check
pnpm lint
pnpm test:unit
pnpm test:e2e   # 먼저 Playwright브라우제를 설치해야 함: pnpm exec playwright install chromium
```

종단간시험은 다음을 합니다.

1. `data/e2e`에 완전히 새로운 데터베스를 만들고 백단(4180), Vite(4181)와 mock봉사(9998)를 시작합니다.
2. mock Steam인터페히스로 발매, 할인, 내리기, 회복의 전과정을 구동합니다.
3. 기업위신통지, 리용자정의 WebHook, SMTP메일, 페이수 / Lark / 딩딩콜백과 스캔부호설정, 페이수 / 딩딩 / 기업위신긴련결, 다중리용자격리를 검증합니다.

`scripts/mock-receiver.ts`도 따로 실행하여 본지련합조정에 리용할수 있습니다.

```bash
pnpm mock:receiver
# 통지 Webhook: http://127.0.0.1:9999/<임의경로>
# SMTP sink: 127.0.0.1:1025
# 포획결과: GET http://127.0.0.1:9999/_requests
# 모의 Steam: http://127.0.0.1:9999/steam-store 와 /steam-api
```

`ALLOW_INSECURE_WEBHOOKS=1`과 `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL`을 배합하면 완전히 오프라인으로 련합조정할수 있습니다.

## 알려진제한

- Steam상점인터페히스는 비공식인터페히스이므로 변경되거나 속도제한을 받을수 있습니다. 《이미 내리기 / 지역에서 판매불가 / 불법 appid》를 구별할수 없으며, 체계는 《과거에 판매가능 + 련속 두번 리용불가》로 오보를 줄입니다.
- 소식의 핵심단어경보는 Steam소식 / 공고만 포함하며 발견법적제시에 속하므로 사람의 확인이 필요합니다.
- 정확한 할인종료시간을 알수 없으며, `sale_end`는 다음 조회에서 할인이 0으로 된것을 발견하는데 의존합니다.
- 기업위신단체대화방로보트는 발송만 할수 있으며, 단체대화방안의 명령은 기업위신지능로보트긴련결을 리용하십시오. 긴련결은 같은 로보트에 하나의 유효련결만 지원하며, 여러실례를 전개하면 서로의 련결을 끊습니다.
- 위신 ClawBot(iLink)과 QQ Bot은 해당플래트홈의 공식프로토콜에 따라 접속중입니다.
- 단일실례전개, SQLite단일기록자; 고가용성을 제공하지 않습니다.
- 리용자지역이 다르면 같은 게임이 지역에 따라 따로 캐쉬되고 각각 수집됩니다.

## 목록구조

```
server/            Hono응용, SQLite, Steam수집, 스케쥴, 통지, 플래트홈콜백 / 긴련결, 명령
shared/            전후단공유타입, 상수와 Zod schema
src/               Vue전단
scripts/           mock봉사, 예비보관, E2E시작스크립트
e2e/               Playwright종단간시험
Dockerfile         다단계건설(전단과 봉사단건설 → 실행시 생산의존성만)
docker-compose.yml 단일봉사전개, 숙주기 ./data바인드마운트
data/              숙주기데터목록(SQLite, 예비보관, logs/ 응용록크)
```
