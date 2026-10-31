# SteamGames-Monitor

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Italiano](README.it.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [조선어](README.ko-KP.md) | [Nederlands](README.nl.md) | [Русский](README.ru.md)

インターフェースは簡体字中国語、繁体字中国語、英語、ドイツ語、フランス語、イタリア語、日本語、韓国語、朝鮮語、オランダ語、ロシア語に対応しています。右上の選択欄から切り替えられ、この設定は Steam のコンテンツ言語とは独立しています。

セルフホスト型のマルチユーザー Steam ゲーム / DLC 販売ステータス監視システムです。データの保存には SQLite を使用し、**販売終了 / ストアからの削除、値引き、発売**を監視して、WeCom（企業微信）グループボット、Feishu（飛書）ボット、DingTalk（釘釘）ボット、または SMTP メールで通知します。
1 つのプロセスで Web インターフェース、REST API、Steam ポーリングスケジューラ、通知配信キュー、Feishu / Lark / DingTalk のコールバック、さらに Feishu・DingTalk の Stream と WeCom の常時接続を提供するため、単一ホストの Docker Compose デプロイに適しています。

## 機能

- **マルチユーザー対応の独立アカウント**：管理者がアカウントを作成し、各ユーザーは独立した監視項目、イベント、通知チャネル、コマンドボットを持ちます。データは厳密に分離されます。
- **監視項目**：appid、ストアリンク、名前検索に対応しています。ベースゲームの全 DLC の一括インポートにも対応します。
- **ステータス変化**：発売（coming soon の切り替わり）、セール開始 / 変更 / 終了、定価の変更、購入不可（ストアからの削除）と復旧。
- **削除の判定**：ストアの購入可否ステータスが 2 回連続で反転した場合にのみ削除と確定します。Steam ニュースのキーワードによる事前警告も併用します（ヒューリスティックであり、参考情報です）。
- **通知チャネル**：WeCom グループボット、Feishu カスタムボット、DingTalk カスタムボット、カスタム WebHook、SMTP メール。失敗時は自動で再試行します。
- **コマンドボット**：Feishu / Lark アプリボット（QR コードによるワンクリック作成、HTTP コールバックまたは WebSocket 常時接続）、DingTalk ボット（QR コードによるワンクリック作成、HTTP コールバックまたは Stream 常時接続）、WeCom スマートボットの常時接続。QR コードからの作成、未承認ユーザー向けの Web 認可、イベント通知に対応します。`/add`、`/list`、`/price`、`/check`、`/pause`、`/resume`、`/remove`、`/adddlc`、`/events`、`/cancel` を利用できます。WeChat ClawBot と QQ Bot は各プラットフォームの公式プロトコルに沿って対応を進めています。
- **運用に配慮した設計**：ヘルスチェック、Docker イメージ、データベースのオンラインバックアップ、設定可能なデータ保持ポリシー。

## 技術スタック

- Node.js 24 + TypeScript（ESM）、Hono、`node:sqlite`（WAL）、Zod、Nodemailer
- Vue 3 + Vite + Pinia + Vue Router（ビルド成果物は Node プロセスが直接配信）
- テスト：Vitest（ユニット）、Playwright（エンドツーエンド）

## クイックスタート（ローカル開発）

Node.js `^22.18 || >=24.12` と pnpm が必要です。

```bash
pnpm install
cp .env.example .env
# .env を編集：少なくとも APP_SECRET（32 文字以上）を設定
openssl rand -base64 48
pnpm dev
```

- Web インターフェース：http://localhost:5173
- バックエンド API：http://localhost:8787

初回起動時は Web インターフェースを直接開いて最初の管理者アカウントを作成し、リージョン、言語、タイムゾーンを選択してください。**リージョンには既定値がありません**。初期化が完了していないアカウントは監視項目を追加できません。初期化用エンドポイントは最初の管理者を作成した後に自動的に無効になります。初期化トークンが不要になったため、未初期化の状態でインスタンスをインターネットに公開しないでください。デプロイ後は速やかに初期化を完了してください。

### 本番ビルド

```bash
pnpm build   # 型チェック + フロントエンド dist/ のビルド + サーバー dist-server/index.js
pnpm start   # 事前にビルドが必要。API と静的フロントエンドを Node が同時に提供
```

## 環境変数

| 変数 | 説明 |
| --- | --- |
| `NODE_ENV` | `production` の場合は `APP_SECRET` を必須として検証します |
| `HOST` / `PORT` | 待ち受けアドレスとポート。既定値は `0.0.0.0:8787` |
| `DATA_DIR` | データディレクトリ。既定値は `./data`（Docker 内では `/data`） |
| `DATABASE_PATH` | SQLite ファイルのパス。既定値は `${DATA_DIR}/steam-monitor.db` |
| `APP_SECRET` | 必須、32 文字以上。チャネル / ボットの認証情報を暗号化する鍵の導出に使用します。**紛失すると保存済みの鍵は復号できません** |
| `PUBLIC_BASE_URL` | 外部アクセス用アドレス。Feishu / Lark / DingTalk のコールバックアドレス、WeCom の Web 認可リンク、CSRF 検証の生成に使用します。常時接続自体は公開コールバックを必要としません |
| `TRUSTED_ORIGINS` | 追加で許可する Origin。カンマ区切り（開発時は `http://localhost:5173` を含む） |
| `COOKIE_SECURE` | HTTPS でデプロイする場合は `1` を設定 |
| `TRUST_PROXY` | リバースプロキシの段数 |
| `MAX_TOTAL_MONITORS` | 監視項目の全体上限。既定値は 2000 |
| `ALLOW_INSECURE_WEBHOOKS` | テスト時のみ `1` を設定。http / 内部ネットワークの Webhook を許可します |
| `ENABLE_DEV_COMMANDS` / `DEV_COMMAND_TOKEN` | 開発用の `/api/dev/command` によるコマンドシミュレーション |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error`。ファイルログは `${DATA_DIR}/logs/app-YYYY-MM-DD.log` に書き込まれます |
| `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL` | 任意。Steam のエンドポイントを上書きします（テスト / プロキシ用） |

プロキシ環境では `HTTPS_PROXY`、`NODE_USE_ENV_PROXY=1`、`NO_PROXY` を使用できます。システムの証明書チェーンが Node に認識されない場合、サービス起動時にシステム CA をマージします（`lib/tls.ts`）。

## Docker Compose でのデプロイ

GitHub Actions は `main` ブランチへのプッシュ時にスナップショットイメージ（`dev`）を公開し、安定版タグ（例：`v1.1.1`）のプッシュ時にセマンティックバージョンを公開して `latest` をその安定版に向けます：

```bash
# 最新の安定版
docker pull akarinliu2000/steamgames-monitor:latest
# 現在の 1.1.1 安定版
docker pull akarinliu2000/steamgames-monitor:1.1.1
# main ブランチの最新スナップショット
docker pull akarinliu2000/steamgames-monitor:dev
```

イメージは `linux/amd64` と `linux/arm64` に対応しており、Docker がホストのアーキテクチャに応じて自動的に選択します。ベースイメージは 2 種類用意しています：

| タグ | ベースイメージ | 説明 |
| --- | --- | --- |
| `latest` / `1.1.1` / `1.1` | Debian slim（`node:24-bookworm-slim`） | 最新の安定版 |
| `latest-alpine` / `1.1.1-alpine` / `1.1-alpine` | Alpine（`node:24-alpine`） | 最新の安定版 Alpine |
| `dev` | Debian slim | `main` ブランチの最新スナップショット |
| `dev-alpine` | Alpine | `main` ブランチの最新 Alpine スナップショット |

`latest` は非プレリリースタグ（例：`v1.1.1`）でのみ移動します。`-rc` / `-beta` を含むタグは `latest` を上書きしません。`main` ブランチの通常のコミットは `dev` / `dev-alpine` と `sha-*` タグのみを更新します。

```bash
docker pull akarinliu2000/steamgames-monitor:latest-alpine
# Alpine 版をローカルでビルド
docker build --build-arg BASE_IMAGE=node:24-alpine -t steam-monitor:alpine .
```

イメージを直接実行する場合：

```bash
cp .env.example .env
# APP_SECRET、PUBLIC_BASE_URL（公開 HTTPS アドレス）、COOKIE_SECURE=1、TRUST_PROXY=1 を設定
docker run -d --name steam-monitor \
  --env-file .env \
  -p 8787:8787 \
  -v "$(pwd)/data:/data" \
  --restart unless-stopped \
  akarinliu2000/steamgames-monitor:latest
```

コンテナログの確認：

```bash
# docker run の場合
docker logs -f steam-monitor

# docker compose の場合
docker compose logs -f steam-monitor
```

`docker ps` に表示されるコンテナ名がランダムな名前（例：`nervous_roentgen`）になっている場合、起動時に `--name steam-monitor` を指定していません。この場合 `docker compose logs` にはそのコンテナが表示されないため、`docker logs -f <実際のコンテナ名>` を使用してください。`docker run` を単独で使う場合は `--env-file .env` を渡したときだけ `LOG_LEVEL` や `PUBLIC_BASE_URL` などの設定が読み込まれます。渡さない場合、ログレベルは既定の `info`、`PUBLIC_BASE_URL` は既定の `http://localhost:8787` になります。

アプリケーションログは UTC の日付ごとに `${DATA_DIR}/logs/app-YYYY-MM-DD.log` にも書き込まれます。Docker では既定でホストの `./data/logs/` にマッピングされます。コンテナの stdout も保持されるため、`docker logs` で確認できます。ログファイルは自動削除されません。必要に応じてアーカイブまたは削除してください。

Docker Hub のイメージで Compose を起動する場合：

```bash
docker compose pull
docker compose up -d
```

コードを変更した後にローカルで再ビルドする場合（Docker Hub の同名タグのローカルイメージを上書きします）：

```bash
docker compose up -d --build
```

### Docker Hub への公開

Docker Hub のアドレス：<https://hub.docker.com/r/akarinliu2000/steamgames-monitor>（`akarinliu2000/steamgames-monitor`）

`.github/workflows/dockerhub.yml` は `main` ブランチへのプッシュ時に `dev` スナップショットを公開し、安定版タグのプッシュ時にセマンティックバージョンを公開して `latest` を更新します：

- リポジトリの Secrets に `DOCKERHUB_USERNAME` と `DOCKERHUB_TOKEN`（Docker Hub Access Token、Read & Write 権限が必要）を設定する必要があります。
- 現在のイメージ：`docker.io/akarinliu2000/steamgames-monitor:latest`、`:1.1.1`、`:dev`（Debian）、および対応する `-alpine` バージョン。いずれも amd64/arm64 のマルチアーキテクチャです。
- Docker Hub リポジトリは公開済みで、匿名のまま直接プルできます。
- 組織の名前空間を使用する場合は、リポジトリ変数 `DOCKERHUB_REPOSITORY`（例：`myorg/steamgames-monitor`）を追加できます。

```bash
docker pull akarinliu2000/steamgames-monitor:latest
```

```bash
gh secret set DOCKERHUB_USERNAME --repo AkarinLiu/SteamGames-Monitor
gh secret set DOCKERHUB_TOKEN --repo AkarinLiu/SteamGames-Monitor
```

- データはホストの `./data`（コンテナの `/data` にマウント）に永続化されます。データベース、バックアップ、`logs/` のログはすべてここに書き込まれます。
- イメージのエントリーポイントは `./data` のパーミッションを修正したうえで、コンテナ内の `node` ユーザーに権限を落としてアプリケーションを実行します。Linux では手動で `sudo chown -R 1000:1000 data` を実行することもできます。
- エントリースクリプトは `.env` 内の相対パス `DATA_DIR` / `DATABASE_PATH` を自動的に `/data` にマッピングするため、`docker run --env-file .env` を単独で使っても初期化ウィザードに正常に入れます。
- コンテナ内では常に `/data` をデータディレクトリとして使用します。Compose は `.env` の `DATA_DIR` / `DATABASE_PATH` を上書きするため、コンテナ内の相対パスに変更しないでください。
- `PUBLIC_BASE_URL` はブラウザから実際にアクセスするアドレスと一致させる必要があります（例：`http://192.168.1.10:8787`）。ドメイン / HTTPS リバースプロキシを使用する場合も同様に変更してください。
- `APP_SECRET` は必須です。設定がないとコンテナは終了します。`docker compose logs -f steam-monitor` で起動エラーを確認できます。
- `.env` を変更した後は `docker compose up -d` を実行してコンテナを再作成し、反映させてください。
- アプリケーションプロセスは非 root ユーザーで実行され、組み込みの `HEALTHCHECK` が `/api/health` にアクセスします。
- イメージの更新：`docker compose pull && docker compose up -d`。ローカルビルドは `docker compose up -d --build`。停止：`docker compose down`（データは保持されます）。
- リバースプロキシでの注意点：
  - `/webhooks/*` の**元のリクエストボディ**をそのまま転送する必要があります（書き換えや再シリアライズはしないでください）。
  - `client_max_body_size 1m`、読み取りタイムアウトは 10 秒以上にしてください。
  - HTTP コールバックを使用する Feishu / Lark / DingTalk のアドレスは、公開 HTTPS で到達可能である必要があります。Feishu / Lark、DingTalk の Stream、WeCom スマートボットが送信側の常時接続を使用する場合、コールバックアドレスは不要です。

## 通知チャネルの設定

「通知チャネル」ページでチャネルを追加します：

- **WeCom グループボット**：グループ設定 → グループボット → ボットを追加 で Webhook をコピーします。
- **Feishu カスタムボット**：グループ設定 → グループボット → カスタムボット。署名検証を有効にした場合は署名シークレットも入力してください。
- **DingTalk カスタムボット**：グループ設定 → スマートグループアシスタント → ボットを追加。「加签」（署名）を有効にした場合は署名シークレットも入力してください。
- **カスタム WebHook**：任意の HTTPS エンドポイントを入力します。システムはイベントを JSON で POST し、HMAC 署名シークレットと Authorization ヘッダーを任意で指定できます。
- **SMTP**：サーバー、ポート、SSL/TLS、送信者と受信者を入力します（複数のアドレスはカンマ区切り）。

シークレットは `APP_SECRET` から導出した鍵で AES-256-GCM 暗号化して保存されます。API は平文を返しません。編集時に空欄にすると元の値が保持されます。

カスタム WebHook のリクエスト形式、Payload のフィールド、署名アルゴリズムは [docs/CUSTOM_WEBHOOK.ja.md](docs/CUSTOM_WEBHOOK.ja.md) を参照してください。

「購読イベント」を何も選択しない場合は、「チェック異常」以外のすべてのイベントを受信します。

## コマンドボットの連携

「コマンドボット」ページでボットを作成します：

| プラットフォーム | 接続方式 | 説明 |
| --- | --- | --- |
| Feishu / Lark | HTTP コールバックまたは WebSocket 常時接続 | QR コードでアプリをワンクリック作成できます。App ID / App Secret の手動入力も可能です。常時接続では、開発者プラットフォームで「常時接続でイベントを受信」を選択し、`im.message.receive_v1` を購読する必要があります |
| DingTalk | HTTP コールバックまたは Stream 常時接続 | QR コードでボットをワンクリック作成できます。Client ID / Secret の手動入力も可能です。HTTP コールバックでは App Secret を入力して署名を検証します。Stream モードでは公開アドレスは不要です |
| WeCom | WebSocket 常時接続（コールバックアドレス不要） | 管理コンソールでスマートボットを作成し、API モード → 常時接続を選択して Bot ID / Secret を入力します。サービスが能動的に `wss://openws.work.weixin.qq.com` に接続します |

Feishu / Lark の HTTP コールバックアドレスは `POST /webhooks/feishu/<slug>` です。コールバックモードでは Encrypt Key / Verification Token をサポートし、常時接続モードでは公開コールバックアドレスは不要です。設定内の「バージョン」は、Feishu（`open.feishu.cn`）と Lark 国際版（`open.larksuite.com`）の切り替えに使用します。

**Feishu / Lark の QR コード追加（推奨）**：「コマンドボット」ページで **Feishu / Lark QR コード** をクリックし、「Feishu」または「Lark 国際版」を選択して、対応するクライアントで QR コードを読み取り、ページの指示に従ってアプリを作成します。システムは App ID / App Secret を自動取得し、読み取った人の `open_id` を所有者識別子として記録します。QR コードの有効期限は 10 分です。QR コードで作成されるのは `PersonalAgent` アプリで、ボット機能とメッセージイベント購読が事前に設定されています。作成後は Feishu / Lark でアプリ名を検索して会話を開始するか、グループチャットに追加できます。

**DingTalk の QR コード追加（推奨）**：**DingTalk QR コードで追加** をクリックし、スマートフォンの DingTalk で QR コードを読み取り、ページの指示に従って組織を選択してボット情報を入力します。システムは Client ID / Client Secret を自動取得し、Client ID を Robot Code として使用して Stream 常時接続を有効にします。QR コードの有効期限は 10 分です。作成後は DingTalk でボットを検索して 1 対 1 チャットを開始するか、グループチャットに追加できます。利用メンバーが初めてコマンドを送信すると Web 認可リンクが届きます。ボットの所有アカウントで Web ページにログインして承認すると利用できます。

WeCom の常時接続はサーバー側から能動的に確立されるため、公開 IP、Token、EncodingAESKey は不要です。同じボットに対して同時に 1 つの有効な接続のみが許可され、複数インスタンスでデプロイすると互いに切断されます。旧版 WeCom 自社開発アプリのコールバック設定は廃止されました。スマートボットの Bot ID / Secret を入力してください。

**WeCom QR コードで追加** をクリックし、作成権限のある WeCom で QR コードを読み取ることもできます。システムは Bot ID / Secret を自動取得し、ボットを作成して常時接続を確立します。QR コードの有効期限は 5 分です。利用メンバーが初めてコマンドを送信すると Web 認可リンクが届きます。ボットの所有アカウントで Web ページにログインして承認するか、許可リストに直接追加してください。

Feishu / Lark、DingTalk、WeCom の未承認ユーザーがコマンドを送信すると、ボットはワンタイムの Web 認可リンクを返信し、そのコマンドは実行しません。ボットの所有アカウントの Web ユーザーがリンク先のページにログインすると、そのプラットフォームのユーザーに閲覧専用または管理者ロールを選択して承認できます。リンクの有効期限は 30 分です。`PUBLIC_BASE_URL` はブラウザからアクセス可能である必要があり、そうでないとリンクを開けません。

コマンドボットは編集ページで **イベント通知を受信** を有効にすることもできます。有効にすると、発売、セール、削除などのイベントが、そのボットが最後に承認済みユーザーに使用された会話にプッシュされます。通知先を記録するには、承認済みユーザーがチャットで少なくとも 1 回コマンドを送信している必要があります。直近の会話がない場合はプッシュされません。DingTalk のイベント通知には App Key、App Secret、Robot Code の入力も必要です。

ボットのコマンドは常に**ボットの所有アカウント**のデータに作用します。すべてのプラットフォームユーザー（QR コード読み取り時に識別された所有者 ID を含む）は、事前に Web 認可を受けるか許可リストに追加される必要があります。そうでない場合、ボットはワンタイムの認可リンクを返すだけでコマンドを実行しません。承認時に `viewer`（閲覧専用）または `admin` を選択できます。所有者 ID は現在、識別のためだけに使用されます。詳細な手順は [docs/BOT_INTEGRATION.ja.md](docs/BOT_INTEGRATION.ja.md) を参照してください。

WeChat ClawBot（iLink）と QQ Bot の連携は各プラットフォームの公式プロトコルに沿って統合中で、完了すると同じページに表示されます。

### コマンド

```
/help
/add <appid | ストアリンク | 名前> [--discount N] [--note テキスト] [--force]
/adddlc <ベースゲーム> [--max 50]
/remove <id | appid>
/pause <id | appid>
/resume <id | appid>
/check <id | appid | 名前>
/price <id | appid | 名前>
/list [--all] [--sale] [--paused] [--page N]
/events [--item id] [--limit 10]
/cancel
```

全角の `／`、`/add@bot`、引用符付きの引数、`--flag=value` に対応しています。

## リージョンとリベースライン

リージョンはユーザー単位の設定です。リージョンを変更すると、そのユーザーの既存の監視項目がすべて再ベースライン化されます。セールのアンカーをクリアし、状態をリセットし、初回チェックではスナップショットを記録するだけでイベントを生成しません。これにより、リージョンごとの価格差による誤検知を防ぎます。他のユーザーには影響しません。

## パスワードのリセット

サーバーのターミナルで実行します（Web ログインは不要）：

```bash
pnpm reset-password <ユーザー名>
pnpm reset-password <ユーザー名> --password 'new-password-123'
pnpm reset-password <ユーザー名> --enable
```

Docker デプロイの場合：

```bash
docker compose exec steam-monitor node dist-server/reset-password.js <ユーザー名>
```

- `--password` を指定しない場合は、ランダムな一時パスワードが生成されてターミナルに出力されます。
- リセット後は `must_change_password=1` となり、ユーザーは次回ログイン時にパスワードを変更する必要があります。そのユーザーの既存セッションはすべて無効になります。
- 無効化されたアカウントは既定で無効のままです。`--enable` を付けると同時に有効化できます。
- このコマンドは SQLite を直接操作し、`APP_SECRET` に依存しません。`DATA_DIR` / `DATABASE_PATH` でデータベースを特定します。

## バックアップと復元

```bash
pnpm backup
```

スクリプトは `VACUUM INTO` を使用して `${DATA_DIR}/backups/` に `steam-monitor-YYYYMMDD-HHmm.db` を生成し、既定で直近 14 件を保持します。Docker では次のように実行できます：

```bash
docker compose exec steam-monitor node_modules/.bin/tsx scripts/backup.ts
```

復元手順：コンテナを停止 → バックアップファイルで `steam-monitor.db` を置き換え → 同じディレクトリ内の `-wal` / `-shm` ファイルを削除 → コンテナを起動。**`.env` の `APP_SECRET` も必ずバックアップしてください**。そうしないと暗号化済みのチャネルとボットのシークレットを復元できず、再入力が必要になります。

## テスト

```bash
pnpm type-check
pnpm lint
pnpm test:unit
pnpm test:e2e   # 事前に Playwright ブラウザのインストールが必要：pnpm exec playwright install chromium
```

エンドツーエンドテストでは次のことを行います：

1. `data/e2e` に新しいデータベースを作成し、バックエンド（4180）、Vite（4181）、モックサービス（9998）を起動します。
2. モックの Steam API を使用して、発売、セール、削除、復旧の全フローを駆動します。
3. WeCom 通知、カスタム WebHook、SMTP メール、Feishu / Lark / DingTalk のコールバックと QR コード設定、Feishu / DingTalk / WeCom の常時接続、マルチユーザー分離を検証します。

`scripts/mock-receiver.ts` は単独でも実行でき、ローカルでの結合テストに使用できます：

```bash
pnpm mock:receiver
# 通知 Webhook：http://127.0.0.1:9999/<任意のパス>
# SMTP sink：127.0.0.1:1025
# キャプチャ結果：GET http://127.0.0.1:9999/_requests
# Steam のモック：http://127.0.0.1:9999/steam-store と /steam-api
```

`ALLOW_INSECURE_WEBHOOKS=1` と `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL` を組み合わせれば、完全にオフラインで結合テストできます。

## 既知の制限

- Steam ストア API は非公式のため、変更やレート制限が発生する可能性があります。「削除済み / リージョンで購入不可 / 不正な appid」を区別できないため、システムは「かつて購入可能だった + 2 回連続で購入不可」という条件で誤検知を減らしています。
- ニュースのキーワードによる事前警告は Steam ニュース / お知らせのみを対象としたヒューリスティックな通知であり、人による確認が必要です。
- セールの正確な終了時刻は取得できません。`sale_end` は次回のポーリングで割引がゼロになったことを検出することに依存します。
- WeCom グループボットは送信のみ可能です。グループ内でのコマンドには WeCom スマートボットの常時接続を使用してください。常時接続は同じボットに対して 1 つの有効な接続のみをサポートし、複数インスタンスでデプロイすると互いに切断されます。
- WeChat ClawBot（iLink）と QQ Bot は各プラットフォームの公式プロトコルに沿って対応中です。
- 単一インスタンスのデプロイ、SQLite の単一ライターです。高可用性は提供しません。
- ユーザーのリージョンが異なる場合、同じゲームがリージョンごとにキャッシュされ、それぞれ取得されます。

## ディレクトリ構成

```
server/            Hono アプリ、SQLite、Steam 収集、スケジューラ、通知、プラットフォームコールバック / 常時接続、コマンド
shared/            フロントエンドとバックエンドで共有する型、定数、Zod スキーマ
src/               Vue フロントエンド
scripts/           モックサービス、バックアップ、E2E 起動スクリプト
e2e/               Playwright エンドツーエンドテスト
Dockerfile         マルチステージビルド（フロントエンドとサーバーをビルド → 実行時は本番依存のみ）
docker-compose.yml 単一サービスのデプロイ、ホストの ./data をバインドマウント
data/              ホストのデータディレクトリ（SQLite、バックアップ、logs/ アプリケーションログ）
```
