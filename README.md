# SteamGames-Monitor

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Italiano](README.it.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [조선어](README.ko-KP.md) | [Nederlands](README.nl.md) | [Русский](README.ru.md)

界面支持简体中文、繁体中文、英语、德语、法语、意大利语、日语、韩语、朝鲜语、荷兰语和俄语，可在页面右上角切换；该设置独立于 Steam 内容语言。

自托管的多用户 Steam 游戏 / DLC 销售状态监控系统。使用 SQLite 存储数据，监控**即将停售 / 下架、打折、发售**，并通过企业微信群机器人、飞书机器人、钉钉机器人或 SMTP 邮件通知。
同一个进程同时提供 Web 界面、REST API、Steam 轮询调度、通知投递队列、飞书 / Lark / 钉钉回调，以及飞书、钉钉 Stream 和企业微信长连接，适合单机 Docker Compose 部署。

## 功能

- **多用户独立账号**：管理员创建账号，每个用户拥有独立的监控项、事件、通知渠道和指令机器人，数据严格隔离。
- **监控项**：支持 appid、商店链接、名称搜索；支持批量导入基础游戏的全部 DLC。
- **状态变化**：发售（coming soon 翻转）、促销开始 / 变化 / 结束、原价变化、不可用（下架）与恢复。
- **下架判定**：商店可购状态连续两次翻转才确认下架；配合 Steam 新闻关键词做提前预警（启发式，仅作参考）。
- **通知渠道**：企业微信群机器人、飞书自定义机器人、钉钉自定义机器人、自定义 WebHook、SMTP 邮件；失败自动重试。
- **指令机器人**：飞书 / Lark 应用机器人（扫码一键创建、HTTP 回调或 WebSocket 长连接）、钉钉机器人（扫码一键创建、HTTP 回调或 Stream 长连接）、企业微信智能机器人长连接，支持扫码创建、未授权网页授权和事件通知；支持 `/add`、`/list`、`/price`、`/check`、`/pause`、`/resume`、`/remove`、`/adddlc`、`/events`、`/cancel`；微信 ClawBot 与 QQ Bot 正在按平台官方协议接入。
- **运维友好**：健康检查、Docker 镜像、数据库在线备份、可配置的数据保留策略。

## 技术栈

- Node.js 24 + TypeScript（ESM）、Hono、`node:sqlite`（WAL）、Zod、Nodemailer
- Vue 3 + Vite + Pinia + Vue Router（构建产物由 Node 进程直接托管）
- 测试：Vitest（单元）、Playwright（端到端）

## 快速开始（本地开发）

要求 Node.js `^22.18 || >=24.12` 与 pnpm。

```bash
pnpm install
cp .env.example .env
# 编辑 .env：至少填写 APP_SECRET（>=32 字符）
openssl rand -base64 48
pnpm dev
```

- Web 界面：http://localhost:5173
- 后端 API：http://localhost:8787

首次启动时直接打开 Web 界面创建第一个管理员账号，并选择区域、语言和时区。**区域没有默认值**，未完成初始化的账号不能添加监控项。初始化接口在创建首个管理员后自动失效；由于不再需要初始化令牌，请勿在未初始化状态下把实例暴露到公网，部署后应立即完成初始化。

### 生产构建

```bash
pnpm build   # 类型检查 + 构建前端 dist/ + 服务端 dist-server/index.js
pnpm start   # 需要先构建；由 Node 同时提供 API 与静态前端
```

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `NODE_ENV` | `production` 时强制校验 `APP_SECRET` |
| `HOST` / `PORT` | 监听地址与端口，默认 `0.0.0.0:8787` |
| `DATA_DIR` | 数据目录，默认 `./data`（Docker 中为 `/data`） |
| `DATABASE_PATH` | SQLite 文件路径，默认 `${DATA_DIR}/steam-monitor.db` |
| `APP_SECRET` | 必填，≥32 字符。用于派生密钥加密渠道 / 机器人凭据；**丢失后已保存的密钥无法解密** |
| `PUBLIC_BASE_URL` | 对外访问地址，用于生成飞书 / Lark / 钉钉回调地址、企业微信网页授权链接与 CSRF 校验；长连接本身不需要公网回调 |
| `TRUSTED_ORIGINS` | 额外允许的 Origin，逗号分隔（开发时含 `http://localhost:5173`） |
| `COOKIE_SECURE` | HTTPS 部署时设为 `1` |
| `TRUST_PROXY` | 反向代理层数 |
| `MAX_TOTAL_MONITORS` | 全局监控项上限，默认 2000 |
| `ALLOW_INSECURE_WEBHOOKS` | 仅测试时设为 `1`，允许 http / 内网 Webhook |
| `ENABLE_DEV_COMMANDS` / `DEV_COMMAND_TOKEN` | 开发用 `/api/dev/command` 模拟指令 |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error`；文件日志写入 `${DATA_DIR}/logs/app-YYYY-MM-DD.log` |
| `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL` | 可选，覆盖 Steam 端点（测试 / 代理用） |

代理环境可使用 `HTTPS_PROXY`、`NODE_USE_ENV_PROXY=1` 与 `NO_PROXY`。若系统证书链不被 Node 识别，服务启动时会合并系统 CA（`lib/tls.ts`）。

## Docker Compose 部署

GitHub Actions 在 `main` 分支推送时发布快照镜像（`dev`），在稳定版本 tag（例如 `v1.1.1`）推送时发布语义化版本并把 `latest` 指向该稳定版本：

```bash
# 最新稳定版
docker pull akarinliu2000/steamgames-monitor:latest
# 当前 1.1.1 稳定版
docker pull akarinliu2000/steamgames-monitor:1.1.1
# main 分支最新快照
docker pull akarinliu2000/steamgames-monitor:dev
```

镜像支持 `linux/amd64` 与 `linux/arm64`，Docker 会按宿主机架构自动选择。提供两种基础镜像：

| 标签 | 基础镜像 | 说明 |
| --- | --- | --- |
| `latest` / `1.1.1` / `1.1` | Debian slim（`node:24-bookworm-slim`） | 最新稳定版 |
| `latest-alpine` / `1.1.1-alpine` / `1.1-alpine` | Alpine（`node:24-alpine`） | 最新稳定版 Alpine |
| `dev` | Debian slim | `main` 分支最新快照 |
| `dev-alpine` | Alpine | `main` 分支最新 Alpine 快照 |

`latest` 只会在非预发布 tag（如 `v1.1.1`）上移动；带 `-rc` / `-beta` 的 tag 不会覆盖 `latest`。`main` 分支的普通提交只更新 `dev` / `dev-alpine` 和 `sha-*` 标签。

```bash
docker pull akarinliu2000/steamgames-monitor:latest-alpine
# 本地构建 Alpine 版本
docker build --build-arg BASE_IMAGE=node:24-alpine -t steam-monitor:alpine .
```

直接用镜像运行：

```bash
cp .env.example .env
# 填写 APP_SECRET、PUBLIC_BASE_URL（公网 HTTPS 地址）、COOKIE_SECURE=1、TRUST_PROXY=1
docker run -d --name steam-monitor \
  --env-file .env \
  -p 8787:8787 \
  -v "$(pwd)/data:/data" \
  --restart unless-stopped \
  akarinliu2000/steamgames-monitor:latest
```

查看容器日志：

```bash
# docker run 方式
docker logs -f steam-monitor

# docker compose 方式
docker compose logs -f steam-monitor
```

如果 `docker ps` 显示的容器名是随机名称（例如 `nervous_roentgen`），说明启动时没有加 `--name steam-monitor`；此时 `docker compose logs` 不会显示该容器，需使用 `docker logs -f <实际容器名>`。单独 `docker run` 时只有传入 `--env-file .env` 才会加载 `LOG_LEVEL`、`PUBLIC_BASE_URL` 等配置；未传入时日志级别默认为 `info`，`PUBLIC_BASE_URL` 默认为 `http://localhost:8787`。

应用日志还会按 UTC 日期写入 `${DATA_DIR}/logs/app-YYYY-MM-DD.log`；Docker 默认映射到宿主机 `./data/logs/`。容器 stdout 仍然保留，可用 `docker logs` 查看。日志文件不会自动删除，请按需归档或清理。

使用 Docker Hub 镜像启动 Compose：

```bash
docker compose pull
docker compose up -d
```

修改代码后本地重新构建（会以 Docker Hub 同名标签覆盖本地镜像）：

```bash
docker compose up -d --build
```

### 发布到 Docker Hub

Docker Hub 地址：<https://hub.docker.com/r/akarinliu2000/steamgames-monitor>（`akarinliu2000/steamgames-monitor`）

`.github/workflows/dockerhub.yml` 会在 `main` 分支推送时发布 `dev` 快照，在稳定版本 tag 推送时发布语义化版本并更新 `latest`：

- 仓库 Secrets 需要配置 `DOCKERHUB_USERNAME` 与 `DOCKERHUB_TOKEN`（Docker Hub Access Token，需 Read & Write 权限）。
- 当前镜像：`docker.io/akarinliu2000/steamgames-monitor:latest`、`:1.1.1`、`:dev`（Debian），以及对应的 `-alpine` 版本，均为 amd64/arm64 多架构。
- Docker Hub 仓库已公开，可直接匿名拉取。
- 如需使用组织命名空间，可添加仓库变量 `DOCKERHUB_REPOSITORY`（例如 `myorg/steamgames-monitor`）。

```bash
docker pull akarinliu2000/steamgames-monitor:latest
```

```bash
gh secret set DOCKERHUB_USERNAME --repo AkarinLiu/SteamGames-Monitor
gh secret set DOCKERHUB_TOKEN --repo AkarinLiu/SteamGames-Monitor
```

- 数据持久化在宿主机 `./data`（挂载到容器 `/data`），数据库、备份和 `logs/` 日志都会写到这里。
- 镜像入口会修正 `./data` 的权限，然后降权到容器内 `node` 用户运行应用；Linux 下也可手动 `sudo chown -R 1000:1000 data`。
- 入口脚本会把 `.env` 中的相对 `DATA_DIR` / `DATABASE_PATH` 自动映射到 `/data`，单独 `docker run --env-file .env` 也能正常进入初始化向导。
- 容器内始终使用 `/data` 作为数据目录，Compose 会覆盖 `.env` 中的 `DATA_DIR` / `DATABASE_PATH`，不要改成容器内相对路径。
- `PUBLIC_BASE_URL` 必须与浏览器实际访问地址一致（例如 `http://192.168.1.10:8787`）；使用域名 / HTTPS 反代时也要同步修改。
- `APP_SECRET` 必填，缺失时容器会退出；可执行 `docker compose logs -f steam-monitor` 查看启动错误。
- 修改 `.env` 后执行 `docker compose up -d` 让容器重建生效。
- 应用进程以非 root 用户运行，内置 `HEALTHCHECK` 访问 `/api/health`。
- 更新镜像：`docker compose pull && docker compose up -d`；本地构建用 `docker compose up -d --build`；停止：`docker compose down`（数据保留）。
- 反向代理需注意：
  - 必须将 `/webhooks/*` 的**原始请求体**原样转发（不要改写或重新序列化）。
  - `client_max_body_size 1m`，读取超时 ≥10s。
  - 使用 HTTP 回调的飞书 / Lark / 钉钉地址必须公网 HTTPS 可达；飞书 / Lark、钉钉 Stream 与企业微信智能机器人使用出站长连接时不需要回调地址。

## 通知渠道配置

在“通知渠道”页面新增渠道：

- **企业微信群机器人**：群设置 → 群机器人 → 添加机器人，复制 Webhook。
- **飞书自定义机器人**：群设置 → 群机器人 → 自定义机器人；如开启签名校验，请同时填写签名密钥。
- **钉钉自定义机器人**：群设置 → 智能群助手 → 添加机器人；如开启加签，请同时填写加签密钥。
- **自定义 WebHook**：填写任意 HTTPS 接口；系统 POST JSON 事件，可选 HMAC 签名密钥与 Authorization 头。
- **SMTP**：填写服务器、端口、SSL/TLS、发件人与收件人（多个地址用逗号分隔）。

密钥使用 `APP_SECRET` 派生的 AES-256-GCM 加密存储；API 不会回传明文，编辑时留空表示保留原值。

自定义 WebHook 的请求格式、Payload 字段和签名算法见 [docs/CUSTOM_WEBHOOK.md](docs/CUSTOM_WEBHOOK.md)。

“订阅事件”不勾选表示接收除“检查异常”外的全部事件。

## 指令机器人接入

在“指令机器人”页面创建机器人：

| 平台 | 接入方式 | 说明 |
| --- | --- | --- |
| 飞书 / Lark | HTTP 回调或 WebSocket 长连接 | 可扫码一键创建应用，也可手动填写 App ID / App Secret；长连接需在开放平台选择「使用长连接接收事件」并订阅 `im.message.receive_v1` |
| 钉钉 | HTTP 回调或 Stream 长连接 | 可扫码一键创建机器人，也可手动填写 Client ID / Secret；HTTP 回调填写 App Secret 校验签名，Stream 模式无需公网地址 |
| 企业微信 | WebSocket 长连接（无需回调地址） | 在管理后台创建智能机器人，选择 API 模式 → 长连接，填写 Bot ID / Secret；服务主动连接 `wss://openws.work.weixin.qq.com` |

飞书 / Lark 的 HTTP 回调地址为 `POST /webhooks/feishu/<slug>`；回调模式支持 Encrypt Key / Verification Token，长连接模式不需要公网回调地址。配置中的「版本」用于切换飞书（`open.feishu.cn`）与 Lark 国际版（`open.larksuite.com`）。

**飞书 / Lark 扫码添加（推荐）**：在「指令机器人」页点击 **飞书 / Lark 扫码**，选择「飞书」或「Lark 国际版」，用对应客户端扫码并按页面提示创建应用。系统会自动获取 App ID / App Secret，并记录扫码者 `open_id` 作为所有者标识；二维码 10 分钟内有效。扫码创建的是 `PersonalAgent` 应用，已预置机器人能力和消息事件订阅，创建后可在飞书 / Lark 中搜索应用名称开始对话，或添加到群聊。

**钉钉扫码添加（推荐）**：点击 **钉钉扫码添加**，用手机钉钉扫码并按页面提示选择组织、填写机器人信息。系统会自动获取 Client ID / Client Secret，以 Client ID 作为 Robot Code，并启用 Stream 长连接；二维码 10 分钟内有效。创建后可在钉钉中搜索机器人开始单聊，或添加到群聊。使用成员首次发送指令时会收到网页授权链接，由机器人所属账号登录网页批准后即可使用。

企业微信长连接由服务端主动建立，不需要公网 IP、Token 或 EncodingAESKey。同一机器人在同一时间只允许一条有效连接，多实例部署时会互相踢下线。旧版企业微信自建应用回调配置已废弃，请改为填写智能机器人的 Bot ID / Secret。

也可以点击 **企微扫码添加**，使用有创建权限的企业微信扫码；系统会自动获取 Bot ID / Secret，创建机器人并建立长连接。二维码 5 分钟内有效。使用成员首次发送指令后会收到网页授权链接，由机器人所属账号登录网页批准，或直接在允许名单中添加。

飞书 / Lark、钉钉、企业微信未授权用户发送指令时，机器人都会回复一次性网页授权链接，且不会执行该指令。机器人所属账号的 Web 用户登录链接页面后，可为该平台用户选择只读或管理员角色并批准，链接 30 分钟内有效。`PUBLIC_BASE_URL` 必须可从浏览器访问，否则链接无法打开。

指令机器人还可以在编辑页开启 **接收事件通知**：开启后，发售、促销、下架等事件会推送到该机器人最近一次被授权用户使用的会话。需要先由授权用户在聊天中发送过至少一条指令，系统才会记录通知目标；没有最近会话时不会推送。钉钉事件通知还需要填写 App Key、App Secret 和 Robot Code。

机器人的指令始终作用于**机器人所属账号**的数据。所有平台用户（包括扫码时识别的所有者 ID）都必须先通过网页授权或加入允许名单，否则机器人只返回一次性授权链接，不会执行指令；批准时可选择 `viewer`（只读）或 `admin`。所有者 ID 现在仅用于标识。详细步骤见 [docs/BOT_INTEGRATION.md](docs/BOT_INTEGRATION.md)。

微信 ClawBot（iLink）与 QQ Bot 接入正在按平台官方协议集成，完成后会出现在同一页面。

### 指令

```
/help
/add <appid | 商店链接 | 名称> [--discount N] [--note 文本] [--force]
/adddlc <基础游戏> [--max 50]
/remove <id | appid>
/pause <id | appid>
/resume <id | appid>
/check <id | appid | 名称>
/price <id | appid | 名称>
/list [--all] [--sale] [--paused] [--page N]
/events [--item id] [--limit 10]
/cancel
```

支持全角 `／`、`/add@bot`、引号参数与 `--flag=value`。

## 区域与重基线

区域是用户级设置。修改区域时会把该用户已有监控项全部重新基线化：清空促销锚点、重置状态，首轮检查只记录快照、不产生事件，避免因区域价格差异造成误报。其他用户不受影响。

## 重置密码

在服务器终端执行（无需登录 Web）：

```bash
pnpm reset-password <用户名>
pnpm reset-password <用户名> --password 'new-password-123'
pnpm reset-password <用户名> --enable
```

Docker 部署：

```bash
docker compose exec steam-monitor node dist-server/reset-password.js <用户名>
```

- 不指定 `--password` 时会生成随机临时密码并打印到终端。
- 重置后 `must_change_password=1`，用户下次登录必须修改密码；该用户的现有会话全部失效。
- 被禁用的账号默认保持禁用；加 `--enable` 可同时启用。
- 命令直接操作 SQLite，不依赖 `APP_SECRET`；通过 `DATA_DIR` / `DATABASE_PATH` 定位数据库。

## 备份与恢复

```bash
pnpm backup
```

脚本使用 `VACUUM INTO` 在 `${DATA_DIR}/backups/` 生成 `steam-monitor-YYYYMMDD-HHmm.db`，默认保留最近 14 份。Docker 中可执行：

```bash
docker compose exec steam-monitor node_modules/.bin/tsx scripts/backup.ts
```

恢复步骤：停止容器 → 用备份文件替换 `steam-monitor.db` → 删除同目录下的 `-wal` / `-shm` 文件 → 启动容器。**请同时备份 `.env` 中的 `APP_SECRET`**，否则已加密的渠道与机器人密钥无法恢复，需要重新填写。

## 测试

```bash
pnpm type-check
pnpm lint
pnpm test:unit
pnpm test:e2e   # 需要先安装 Playwright 浏览器：pnpm exec playwright install chromium
```

端到端测试会：

1. 在 `data/e2e` 创建全新数据库，启动后端（4180）、Vite（4181）和 mock 服务（9998）；
2. 使用 mock Steam 接口驱动发售、促销、下架、恢复全流程；
3. 校验企业微信通知、自定义 WebHook、SMTP 邮件、飞书 / Lark / 钉钉回调与扫码配置、飞书 / 钉钉 / 企业微信长连接、多用户隔离。

`scripts/mock-receiver.ts` 也可单独运行，用于本地联调：

```bash
pnpm mock:receiver
# 通知 Webhook：http://127.0.0.1:9999/<任意路径>
# SMTP sink：127.0.0.1:1025
# 捕获结果：GET http://127.0.0.1:9999/_requests
# 模拟 Steam：http://127.0.0.1:9999/steam-store 与 /steam-api
```

配合 `ALLOW_INSECURE_WEBHOOKS=1` 与 `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL` 即可完全离线联调。

## 已知限制

- Steam 商店接口为非官方接口，可能变更或限流；无法区分“已下架 / 区域不可售 / 非法 appid”，系统使用“曾经可售 + 连续两次不可用”降低误报。
- 新闻关键词预警只覆盖 Steam 新闻 / 公告，属于启发式提示，需人工确认。
- 无法获知精确促销结束时间，`sale_end` 依赖下一次轮询发现折扣归零。
- 企业微信群机器人只能发送；群内指令请使用企业微信智能机器人长连接。长连接同一机器人仅支持一条有效连接，多实例部署会互相踢下线。
- 微信 ClawBot（iLink）与 QQ Bot 正在按平台官方协议接入。
- 单实例部署、SQLite 单写者；不提供高可用。
- 用户区域不同会导致同一游戏按不同区域缓存并分别抓取。

## 目录结构

```
server/            Hono 应用、SQLite、Steam 采集、调度、通知、平台回调 / 长连接、指令
shared/            前后端共享类型、常量与 Zod schema
src/               Vue 前端
scripts/           mock 服务、备份、E2E 启动脚本
e2e/               Playwright 端到端测试
Dockerfile         多阶段构建（构建前端与服务端 → 运行时仅生产依赖）
docker-compose.yml 单服务部署，宿主机 ./data 绑定挂载
data/              宿主机数据目录（SQLite、备份、logs/ 应用日志）
```
