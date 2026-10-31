# SteamGames-Monitor

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Italiano](README.it.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [조선어](README.ko-KP.md) | [Nederlands](README.nl.md) | [Русский](README.ru.md)

介面支援簡體中文、繁體中文、英文、德文、法文、義大利文、日文、韓文、朝鮮文、荷蘭文與俄文，可從頁面右上角切換；此設定與 Steam 內容語言無關。

自行託管的多使用者 Steam 遊戲 / DLC 銷售狀態監控系統。使用 SQLite 儲存資料，監控**即將停售 / 下架、折扣、發售**，並透過企業微信群組機器人、飛書機器人、釘釘機器人或 SMTP 郵件通知。
同一個行程同時提供 Web 介面、REST API、Steam 輪詢排程、通知投遞佇列、飛書 / Lark / 釘釘回呼，以及飛書、釘釘 Stream 和企業微信長連線，適合單機 Docker Compose 部署。

## 功能

- **多使用者獨立帳號**：管理員建立帳號，每個使用者擁有獨立的監控項目、事件、通知頻道和指令機器人，資料嚴格隔離。
- **監控項目**：支援 appid、商店連結、名稱搜尋；支援批次匯入基礎遊戲的全部 DLC。
- **狀態變化**：發售（coming soon 翻轉）、促銷開始 / 變化 / 結束、原價變化、無法使用（下架）與恢復。
- **下架判定**：商店可購買狀態連續兩次翻轉才確認下架；搭配 Steam 新聞關鍵字做提前預警（啟發式，僅供參考）。
- **通知頻道**：企業微信群組機器人、飛書自訂機器人、釘釘自訂機器人、自訂 WebHook、SMTP 郵件；失敗自動重試。
- **指令機器人**：飛書 / Lark 應用機器人（掃碼一鍵建立、HTTP 回呼或 WebSocket 長連線）、釘釘機器人（掃碼一鍵建立、HTTP 回呼或 Stream 長連線）、企業微信智慧機器人長連線，支援掃碼建立、未授權網頁授權和事件通知；支援 `/add`、`/list`、`/price`、`/check`、`/pause`、`/resume`、`/remove`、`/adddlc`、`/events`、`/cancel`；微信 ClawBot 與 QQ Bot 正依平台官方協定接入。
- **維運友善**：健康檢查、Docker 映像、資料庫線上備份、可設定的資料保留策略。

## 技術堆疊

- Node.js 24 + TypeScript（ESM）、Hono、`node:sqlite`（WAL）、Zod、Nodemailer
- Vue 3 + Vite + Pinia + Vue Router（建置產物由 Node 行程直接託管）
- 測試：Vitest（單元）、Playwright（端對端）

## 快速開始（本機開發）

需要 Node.js `^22.18 || >=24.12` 與 pnpm。

```bash
pnpm install
cp .env.example .env
# 編輯 .env：至少填寫 APP_SECRET（>=32 字元）
openssl rand -base64 48
pnpm dev
```

- Web 介面：http://localhost:5173
- 後端 API：http://localhost:8787

首次啟動時直接開啟 Web 介面建立第一個管理員帳號，並選擇地區、語言和時區。**地區沒有預設值**，未完成初始化的帳號不能新增監控項目。初始化 API 會在建立第一個管理員後自動失效；由於不再需要初始化權杖，請勿在未初始化狀態下把執行個體暴露到公網，部署後應立即完成初始化。

### 正式環境建置

```bash
pnpm build   # 型別檢查 + 建置前端 dist/ + 伺服器端 dist-server/index.js
pnpm start   # 需要先建置；由 Node 同時提供 API 與靜態前端
```

## 環境變數

| 變數 | 說明 |
| --- | --- |
| `NODE_ENV` | 設為 `production` 時強制驗證 `APP_SECRET` |
| `HOST` / `PORT` | 監聽位址與連接埠，預設 `0.0.0.0:8787` |
| `DATA_DIR` | 資料目錄，預設 `./data`（Docker 中為 `/data`） |
| `DATABASE_PATH` | SQLite 檔案路徑，預設 `${DATA_DIR}/steam-monitor.db` |
| `APP_SECRET` | 必填，≥32 字元。用於衍生金鑰加密頻道 / 機器人憑證；**遺失後已儲存的金鑰無法解密** |
| `PUBLIC_BASE_URL` | 對外存取位址，用於產生飛書 / Lark / 釘釘回呼位址、企業微信網頁授權連結與 CSRF 驗證；長連線本身不需要公網回呼 |
| `TRUSTED_ORIGINS` | 額外允許的 Origin，以逗號分隔（開發時含 `http://localhost:5173`） |
| `COOKIE_SECURE` | HTTPS 部署時設為 `1` |
| `TRUST_PROXY` | 反向代理層數 |
| `MAX_TOTAL_MONITORS` | 全域監控項目上限，預設 2000 |
| `ALLOW_INSECURE_WEBHOOKS` | 僅測試時設為 `1`，允許 http / 內網 Webhook |
| `ENABLE_DEV_COMMANDS` / `DEV_COMMAND_TOKEN` | 開發用 `/api/dev/command` 模擬指令 |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error`；檔案日誌寫入 `${DATA_DIR}/logs/app-YYYY-MM-DD.log` |
| `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL` | 選用，覆寫 Steam 端點（測試 / 代理用） |

代理環境可使用 `HTTPS_PROXY`、`NODE_USE_ENV_PROXY=1` 與 `NO_PROXY`。若系統憑證鏈不被 Node 辨識，服務啟動時會合併系統 CA（`lib/tls.ts`）。

## Docker Compose 部署

GitHub Actions 在 `main` 分支推送時發布快照映像（`dev`），在穩定版本標籤（例如 `v1.1.0`）推送時發布語意化版本並把 `latest` 指向該穩定版本：

```bash
# 最新穩定版
docker pull akarinliu2000/steamgames-monitor:latest
# 目前 1.1.0 穩定版
docker pull akarinliu2000/steamgames-monitor:1.1.0
# main 分支最新快照
docker pull akarinliu2000/steamgames-monitor:dev
```

映像支援 `linux/amd64` 與 `linux/arm64`，Docker 會依主機架構自動選擇。提供兩種基礎映像：

| 標籤 | 基礎映像 | 說明 |
| --- | --- | --- |
| `latest` / `1.1.0` / `1.1` | Debian slim（`node:24-bookworm-slim`） | 最新穩定版 |
| `latest-alpine` / `1.1.0-alpine` / `1.1-alpine` | Alpine（`node:24-alpine`） | 最新穩定版 Alpine |
| `dev` | Debian slim | `main` 分支最新快照 |
| `dev-alpine` | Alpine | `main` 分支最新 Alpine 快照 |

`latest` 只會在非預發布標籤（例如 `v1.1.0`）上移動；帶有 `-rc` / `-beta` 的標籤不會覆寫 `latest`。`main` 分支的一般提交只會更新 `dev` / `dev-alpine` 和 `sha-*` 標籤。

```bash
docker pull akarinliu2000/steamgames-monitor:latest-alpine
# 本機建置 Alpine 版本
docker build --build-arg BASE_IMAGE=node:24-alpine -t steam-monitor:alpine .
```

直接用映像執行：

```bash
cp .env.example .env
# 填寫 APP_SECRET、PUBLIC_BASE_URL（公網 HTTPS 位址）、COOKIE_SECURE=1、TRUST_PROXY=1
docker run -d --name steam-monitor \
  --env-file .env \
  -p 8787:8787 \
  -v "$(pwd)/data:/data" \
  --restart unless-stopped \
  akarinliu2000/steamgames-monitor:latest
```

查看容器日誌：

```bash
# docker run 方式
docker logs -f steam-monitor

# docker compose 方式
docker compose logs -f steam-monitor
```

如果 `docker ps` 顯示的容器名稱是隨機名稱（例如 `nervous_roentgen`），表示啟動時沒有加上 `--name steam-monitor`；此時 `docker compose logs` 不會顯示該容器，需改用 `docker logs -f <實際容器名稱>`。單獨使用 `docker run` 時，只有傳入 `--env-file .env` 才會載入 `LOG_LEVEL`、`PUBLIC_BASE_URL` 等設定；未傳入時日誌等級預設為 `info`，`PUBLIC_BASE_URL` 預設為 `http://localhost:8787`。

應用程式日誌也會依 UTC 日期寫入 `${DATA_DIR}/logs/app-YYYY-MM-DD.log`；Docker 預設映射到主機 `./data/logs/`。容器 stdout 仍然保留，可用 `docker logs` 查看。日誌檔案不會自動刪除，請視需要封存或清理。

使用 Docker Hub 映像啟動 Compose：

```bash
docker compose pull
docker compose up -d
```

修改程式碼後在本機重新建置（會以 Docker Hub 同名標籤覆寫本機映像）：

```bash
docker compose up -d --build
```

### 發布到 Docker Hub

Docker Hub 位址：<https://hub.docker.com/r/akarinliu2000/steamgames-monitor>（`akarinliu2000/steamgames-monitor`）

`.github/workflows/dockerhub.yml` 會在 `main` 分支推送時發布 `dev` 快照，在穩定版本標籤推送時發布語意化版本並更新 `latest`：

- 儲存庫 Secrets 需要設定 `DOCKERHUB_USERNAME` 與 `DOCKERHUB_TOKEN`（Docker Hub Access Token，需具備 Read & Write 權限）。
- 目前映像：`docker.io/akarinliu2000/steamgames-monitor:latest`、`:1.1.0`、`:dev`（Debian），以及對應的 `-alpine` 版本，皆為 amd64/arm64 多架構。
- Docker Hub 儲存庫已公開，可直接匿名拉取。
- 如需使用組織命名空間，可新增儲存庫變數 `DOCKERHUB_REPOSITORY`（例如 `myorg/steamgames-monitor`）。

```bash
docker pull akarinliu2000/steamgames-monitor:latest
```

```bash
gh secret set DOCKERHUB_USERNAME --repo AkarinLiu/SteamGames-Monitor
gh secret set DOCKERHUB_TOKEN --repo AkarinLiu/SteamGames-Monitor
```

- 資料持久化在主機 `./data`（掛載到容器 `/data`），資料庫、備份和 `logs/` 日誌都會寫入這裡。
- 映像進入點會修正 `./data` 的權限，然後降低權限至容器內的 `node` 使用者執行應用程式；Linux 下也可手動執行 `sudo chown -R 1000:1000 data`。
- 進入點指令碼會把 `.env` 中的相對 `DATA_DIR` / `DATABASE_PATH` 自動映射到 `/data`，單獨使用 `docker run --env-file .env` 也能正常進入初始化精靈。
- 容器內一律使用 `/data` 作為資料目錄，Compose 會覆寫 `.env` 中的 `DATA_DIR` / `DATABASE_PATH`，請勿改成容器內的相對路徑。
- `PUBLIC_BASE_URL` 必須與瀏覽器實際存取的位址一致（例如 `http://192.168.1.10:8787`）；使用網域 / HTTPS 反向代理時也要同步修改。
- `APP_SECRET` 必填，缺少時容器會結束；可執行 `docker compose logs -f steam-monitor` 查看啟動錯誤。
- 修改 `.env` 後執行 `docker compose up -d` 讓容器重建生效。
- 應用程式行程以非 root 使用者執行，內建 `HEALTHCHECK` 存取 `/api/health`。
- 更新映像：`docker compose pull && docker compose up -d`；本機建置用 `docker compose up -d --build`；停止：`docker compose down`（資料保留）。
- 反向代理需注意：
  - 必須將 `/webhooks/*` 的**原始請求主體**原樣轉發（不要改寫或重新序列化）。
  - `client_max_body_size 1m`，讀取逾時 ≥10s。
  - 使用 HTTP 回呼的飛書 / Lark / 釘釘位址必須是公網 HTTPS 可達；飛書 / Lark、釘釘 Stream 與企業微信智慧機器人使用對外長連線時不需要回呼位址。

## 通知頻道設定

在「通知頻道」頁面新增頻道：

- **企業微信群組機器人**：群組設定 → 群組機器人 → 新增機器人，複製 Webhook。
- **飛書自訂機器人**：群組設定 → 群組機器人 → 自訂機器人；如開啟簽章驗證，請同時填寫簽章金鑰。
- **釘釘自訂機器人**：群組設定 → 智慧群助理 → 新增機器人；如開啟加簽，請同時填寫加簽金鑰。
- **自訂 WebHook**：填寫任意 HTTPS 端點；系統會 POST JSON 事件，可選 HMAC 簽章金鑰與 Authorization 標頭。
- **SMTP**：填寫伺服器、連接埠、SSL/TLS、寄件者與收件者（多個位址以逗號分隔）。

金鑰使用 `APP_SECRET` 衍生的 AES-256-GCM 加密儲存；API 不會回傳明文，編輯時留空表示保留原值。

自訂 WebHook 的請求格式、Payload 欄位和簽章演算法請見 [docs/CUSTOM_WEBHOOK.zh-TW.md](docs/CUSTOM_WEBHOOK.zh-TW.md)。

「訂閱事件」未勾選表示接收除了「檢查異常」以外的全部事件。

## 指令機器人接入

在「指令機器人」頁面建立機器人：

| 平台 | 接入方式 | 說明 |
| --- | --- | --- |
| 飛書 / Lark | HTTP 回呼或 WebSocket 長連線 | 可掃碼一鍵建立應用，也可手動填寫 App ID / App Secret；長連線需在開放平台選擇「使用長連線接收事件」並訂閱 `im.message.receive_v1` |
| 釘釘 | HTTP 回呼或 Stream 長連線 | 可掃碼一鍵建立機器人，也可手動填寫 Client ID / Secret；HTTP 回呼填寫 App Secret 驗證簽章，Stream 模式無需公網位址 |
| 企業微信 | WebSocket 長連線（無需回呼位址） | 在管理後台建立智慧機器人，選擇 API 模式 → 長連線，填寫 Bot ID / Secret；服務主動連線 `wss://openws.work.weixin.qq.com` |

飛書 / Lark 的 HTTP 回呼位址為 `POST /webhooks/feishu/<slug>`；回呼模式支援 Encrypt Key / Verification Token，長連線模式不需要公網回呼位址。設定中的「版本」用於切換飛書（`open.feishu.cn`）與 Lark 國際版（`open.larksuite.com`）。

**飛書 / Lark 掃碼新增（建議）**：在「指令機器人」頁點選 **飛書 / Lark 掃碼**，選擇「飛書」或「Lark 國際版」，用對應的用戶端掃碼並依頁面提示建立應用。系統會自動取得 App ID / App Secret，並記錄掃碼者的 `open_id` 作為擁有者識別；QR Code 10 分鐘內有效。掃碼建立的是 `PersonalAgent` 應用，已預先設定機器人能力和訊息事件訂閱，建立後可在飛書 / Lark 中搜尋應用名稱開始對話，或加入群組聊天。

**釘釘掃碼新增（建議）**：點選 **釘釘掃碼新增**，用手機釘釘掃碼並依頁面提示選擇組織、填寫機器人資訊。系統會自動取得 Client ID / Client Secret，以 Client ID 作為 Robot Code，並啟用 Stream 長連線；QR Code 10 分鐘內有效。建立後可在釘釘中搜尋機器人開始一對一聊天，或加入群組聊天。使用成員首次傳送指令時會收到網頁授權連結，由機器人所屬帳號登入網頁核准後即可使用。

企業微信長連線由伺服器端主動建立，不需要公網 IP、Token 或 EncodingAESKey。同一個機器人在同一時間只允許一條有效連線，多執行個體部署時會互相踢下線。舊版企業微信自建應用回呼設定已廢棄，請改為填寫智慧機器人的 Bot ID / Secret。

也可以點選 **企微掃碼新增**，使用具有建立權限的企業微信掃碼；系統會自動取得 Bot ID / Secret，建立機器人並建立長連線。QR Code 5 分鐘內有效。使用成員首次傳送指令後會收到網頁授權連結，由機器人所屬帳號登入網頁核准，或直接在允許清單中新增。

飛書 / Lark、釘釘、企業微信的未授權使用者傳送指令時，機器人都會回覆一次性網頁授權連結，且不會執行該指令。機器人所屬帳號的 Web 使用者登入連結頁面後，可為該平台使用者選擇唯讀或管理員角色並核准，連結 30 分鐘內有效。`PUBLIC_BASE_URL` 必須可從瀏覽器存取，否則連結無法開啟。

指令機器人還可以在編輯頁開啟 **接收事件通知**：開啟後，發售、促銷、下架等事件會推送到該機器人最近一次被授權使用者使用的會話。需要先由授權使用者在聊天中傳送過至少一條指令，系統才會記錄通知目標；沒有最近會話時不會推送。釘釘事件通知還需要填寫 App Key、App Secret 和 Robot Code。

機器人的指令始終作用於**機器人所屬帳號**的資料。所有平台使用者（包括掃碼時識別的擁有者 ID）都必須先透過網頁授權或加入允許清單，否則機器人只會回傳一次性授權連結，不會執行指令；核准時可選擇 `viewer`（唯讀）或 `admin`。擁有者 ID 現在僅用於識別。詳細步驟請見 [docs/BOT_INTEGRATION.zh-TW.md](docs/BOT_INTEGRATION.zh-TW.md)。

微信 ClawBot（iLink）與 QQ Bot 接入正依平台官方協定整合，完成後會出現在同一頁面。

### 指令

```
/help
/add <appid | 商店連結 | 名稱> [--discount N] [--note 文字] [--force]
/adddlc <基礎遊戲> [--max 50]
/remove <id | appid>
/pause <id | appid>
/resume <id | appid>
/check <id | appid | 名稱>
/price <id | appid | 名稱>
/list [--all] [--sale] [--paused] [--page N]
/events [--item id] [--limit 10]
/cancel
```

支援全形 `／`、`/add@bot`、引號參數與 `--flag=value`。

## 地區與重新建立基準

地區是使用者層級的設定。修改地區時會把該使用者既有的監控項目全部重新建立基準：清除促銷基準點、重設狀態，首輪檢查只記錄快照、不產生事件，避免因地區價格差異造成誤報。其他使用者不受影響。

## 重設密碼

在伺服器終端機執行（無需登入 Web）：

```bash
pnpm reset-password <使用者名稱>
pnpm reset-password <使用者名稱> --password 'new-password-123'
pnpm reset-password <使用者名稱> --enable
```

Docker 部署：

```bash
docker compose exec steam-monitor node dist-server/reset-password.js <使用者名稱>
```

- 未指定 `--password` 時會產生隨機暫時密碼並輸出到終端機。
- 重設後 `must_change_password=1`，使用者下次登入必須變更密碼；該使用者現有的工作階段全部失效。
- 被停用的帳號預設維持停用；加上 `--enable` 可同時啟用。
- 指令直接操作 SQLite，不依賴 `APP_SECRET`；透過 `DATA_DIR` / `DATABASE_PATH` 定位資料庫。

## 備份與還原

```bash
pnpm backup
```

指令碼使用 `VACUUM INTO` 在 `${DATA_DIR}/backups/` 產生 `steam-monitor-YYYYMMDD-HHmm.db`，預設保留最近 14 份。Docker 中可執行：

```bash
docker compose exec steam-monitor node_modules/.bin/tsx scripts/backup.ts
```

還原步驟：停止容器 → 用備份檔案取代 `steam-monitor.db` → 刪除同目錄下的 `-wal` / `-shm` 檔案 → 啟動容器。**請同時備份 `.env` 中的 `APP_SECRET`**，否則已加密的頻道與機器人金鑰無法還原，需要重新填寫。

## 測試

```bash
pnpm type-check
pnpm lint
pnpm test:unit
pnpm test:e2e   # 需要先安裝 Playwright 瀏覽器：pnpm exec playwright install chromium
```

端對端測試會：

1. 在 `data/e2e` 建立全新的資料庫，啟動後端（4180）、Vite（4181）和 mock 服務（9998）；
2. 使用 mock Steam API 驅動發售、促銷、下架、恢復的完整流程；
3. 驗證企業微信通知、自訂 WebHook、SMTP 郵件、飛書 / Lark / 釘釘回呼與掃碼設定、飛書 / 釘釘 / 企業微信長連線、多使用者隔離。

`scripts/mock-receiver.ts` 也可單獨執行，用於本機聯合偵錯：

```bash
pnpm mock:receiver
# 通知 Webhook：http://127.0.0.1:9999/<任意路徑>
# SMTP sink：127.0.0.1:1025
# 擷取結果：GET http://127.0.0.1:9999/_requests
# 模擬 Steam：http://127.0.0.1:9999/steam-store 與 /steam-api
```

搭配 `ALLOW_INSECURE_WEBHOOKS=1` 與 `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL` 即可完全離線聯合偵錯。

## 已知限制

- Steam 商店 API 為非官方 API，可能變更或限流；無法區分「已下架 / 該地區無法販售 / 非法 appid」，系統使用「曾經可販售 + 連續兩次無法使用」降低誤報。
- 新聞關鍵字預警只涵蓋 Steam 新聞 / 公告，屬於啟發式提示，需人工確認。
- 無法得知精確的促銷結束時間，`sale_end` 依賴下一次輪詢發現折扣歸零。
- 企業微信群組機器人只能傳送；群組內指令請使用企業微信智慧機器人長連線。長連線同一機器人僅支援一條有效連線，多執行個體部署會互相踢下線。
- 微信 ClawBot（iLink）與 QQ Bot 正依平台官方協定接入。
- 單執行個體部署、SQLite 單一寫入者；不提供高可用性。
- 使用者地區不同會導致同一遊戲依不同地區快取並分別擷取。

## 目錄結構

```
server/            Hono 應用、SQLite、Steam 擷取、排程、通知、平台回呼 / 長連線、指令
shared/            前後端共用型別、常數與 Zod schema
src/               Vue 前端
scripts/           mock 服務、備份、E2E 啟動指令碼
e2e/               Playwright 端對端測試
Dockerfile         多階段建置（建置前端與伺服器端 → 執行階段僅含正式依賴）
docker-compose.yml 單一服務部署，主機 ./data 綁定掛載
data/              主機資料目錄（SQLite、備份、logs/ 應用程式日誌）
```
