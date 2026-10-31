<script setup lang="ts">
import { t } from '@/i18n'

import { APP_NAME } from '@shared/constants'

const commands = [
  { command: '/help', description: t("显示指令列表") },
  { command: t("/add <appid|链接|名称> [--discount N] [--note 文本] [--force]"), description: t("添加监控项") },
  { command: t("/adddlc <基础游戏> [--max 50]"), description: t("批量导入该游戏的 DLC") },
  { command: '/remove <id|appid>', description: t("删除监控项") },
  { command: '/pause <id|appid>', description: t("暂停检查") },
  { command: '/resume <id|appid>', description: t("恢复检查") },
  { command: t("/check <id|appid|名称>"), description: t("立即检查（绕过缓存）") },
  { command: t("/price <id|appid|名称>"), description: t("查询当前价格与状态") },
  { command: '/list [--all] [--sale] [--paused] [--page N]', description: t("列出监控项") },
  { command: '/events [--item id] [--limit 10]', description: t("查看最近事件") },
  { command: '/cancel', description: t("取消正在等待的选择（搜索多个结果时）") },
]
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1>{{ $t("帮助") }}</h1>
        <p>{{ $t(APP_NAME) }} {{ $t("的接入步骤、斜杠指令与已知限制。") }}</p>
      </div>
    </div>

    <div class="detail-grid">
      <div class="stack">
        <section class="card">
          <div class="card-title">
            <h2>{{ $t("斜杠指令") }}</h2>
          </div>
          <p class="small muted"> {{ $t("指令作用于机器人所属账号的数据。所有平台用户（包括扫码时识别的所有者）都需要先通过网页授权或加入允许名单，否则只会收到授权链接；允许名单中的") }} <code>viewer</code> {{ $t("只能执行") }} <code>/list</code>、<code>/price</code>、<code>/events</code>。
          </p>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>{{ $t("指令") }}</th>
                  <th>{{ $t("说明") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in commands" :key="item.command">
                  <td class="mono small">{{ item.command }}</td>
                  <td class="small">{{ item.description }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="small faint" style="margin-top: 10px"> {{ $t("支持全角") }} <code>／</code>、<code>/add@机器人</code>{{ $t("、引号参数与") }} <code>--flag=value</code>{{ $t("。 名称搜索返回多个结果时会给出序号，直接回复序号即可选择，10 分钟内有效。") }} </p>
          <p class="small faint" style="margin-top: 10px"> {{ $t("在“指令机器人”页面创建机器人：飞书 / Lark、钉钉可扫码一键创建并自动启用长连接，也可手动选择 HTTP 回调或长连接；企业微信填写 Bot ID / Secret。不同平台可以分别配置允许名单。") }} </p>
          <p class="small faint" style="margin-top: 10px"> {{ $t("在机器人编辑页可开启“接收事件通知”，事件会推送到最近一次被授权用户使用的会话；需要用户先发送过指令。钉钉事件通知还需要 App Key、App Secret 与 Robot Code。") }} </p>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>{{ $t("接入飞书 / Lark 应用机器人") }}</h2>
          </div>
          <ol class="small muted" style="padding-left: 1.2rem">
            <li>{{ $t("推荐在「指令机器人」点击「飞书 / Lark 扫码」，选择「飞书」或「Lark 国际版」后扫码创建应用；系统会自动填写 App ID / App Secret、所有者 open_id，并启用长连接。") }}</li>
            <li>{{ $t("手动配置时，在飞书 / Lark 开放平台创建企业自建应用并开启「机器人」能力，填写 App ID 与 App Secret。") }}</li>
            <li>{{ $t("长连接模式需在「事件与回调」选择「使用长连接接收事件」，订阅") }} <code>im.message.receive_v1</code>{{ $t("；HTTP 回调模式则填写页面显示的") }} <code>/webhooks/feishu/&lt;slug&gt;</code> {{ $t("地址。") }}</li>
            <li>{{ $t("发布应用并将机器人加入群聊或单聊；群聊中 @机器人 后发送") }} <code>/help</code> {{ $t("测试。") }}</li>
            <li>{{ $t("Lark 国际版使用") }} <code>open.larksuite.com</code> {{ $t("与") }} <code>accounts.larksuite.com</code>{{ $t("，配置中版本选择「Lark（国际版）」即可。") }}</li>
          </ol>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>{{ $t("接入钉钉机器人") }}</h2>
          </div>
          <ol class="small muted" style="padding-left: 1.2rem">
            <li>{{ $t("推荐在「指令机器人」点击「钉钉扫码添加」，用手机钉钉扫码并确认创建；系统会自动填写 Client ID / Secret，并以 Client ID 作为 Robot Code 启用 Stream 长连接。") }}</li>
            <li>{{ $t("手动配置时，在钉钉开放平台创建企业内部应用并添加机器人能力；消息接收模式选择 Stream 或 HTTP 回调。") }}</li>
            <li>{{ $t("Stream 模式无需回调地址；HTTP 回调模式填写") }} <code>/webhooks/dingtalk/&lt;slug&gt;</code>{{ $t("，并填写 App Secret 验签。") }}</li>
            <li>{{ $t("发布应用后，在钉钉中搜索机器人单聊，或加入群聊 @机器人 发送") }} <code>/help</code>{{ $t("；回复通过临时会话 Webhook 发送。") }}</li>
            <li>{{ $t("使用成员首次发送指令后会收到网页授权链接，由机器人所属账号登录网页批准；所有者 staffId 仅用于标识，不会自动授予权限。") }}</li>
          </ol>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>{{ $t("接入企业微信智能机器人（长连接）") }}</h2>
          </div>
          <ol class="small muted" style="padding-left: 1.2rem">
            <li>{{ $t("在「指令机器人」点击「企微扫码添加」，用有创建权限的企业微信扫码，系统会自动创建机器人并填写 Bot ID / Secret；二维码 5 分钟内有效。") }}</li>
            <li>{{ $t("也可以手动在企业微信管理后台进入「智能机器人」→ API 模式 → 长连接，创建机器人并填写 Bot ID、Secret 与所有者 UserID。") }}</li>
            <li>{{ $t("保存后服务会主动连接") }} <code>wss://openws.work.weixin.qq.com</code>{{ $t("，无需公网回调地址、Token 或 EncodingAESKey。") }}</li>
            <li>{{ $t("将机器人加入群聊或单聊，@机器人 发送") }} <code>/help</code> {{ $t("测试；使用成员需网页授权或加入允许名单。事件通知仍需在「通知渠道」单独添加企业微信群机器人 Webhook。") }}</li>
            <li>{{ $t("未授权成员会收到一次性网页授权链接；机器人所有者登录后可选择只读或管理员角色并批准，链接 30 分钟内有效。") }}</li>
          </ol>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>{{ $t("通知渠道") }}</h2>
          </div>
          <ul class="small muted" style="padding-left: 1.2rem; margin: 0">
            <li>{{ $t("企业微信群机器人：markdown，单条上限约 4096 字节，20 条/分钟。") }}</li>
            <li>{{ $t("飞书自定义机器人：交互卡片，签名密钥按官方 HMAC-SHA256 规则计算。") }}</li>
            <li>{{ $t("钉钉自定义机器人：markdown，支持加签，90037 等限流错误会自动重试。") }}</li>
            <li>{{ $t("自定义 WebHook：POST JSON 事件，可选 HMAC-SHA256 签名与 Authorization 头。") }}</li>
            <li>{{ $t("SMTP 邮件：同时发送纯文本与 HTML，主题不超过 200 字符。") }}</li>
            <li>{{ $t("投递失败会按 30 秒 → 2 分钟 → 10 分钟 → 1 小时 → 6 小时 → 24 小时重试，最多 6 次。") }}</li>
          </ul>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-title">
            <h2>{{ $t("下架判定") }}</h2>
          </div>
          <p class="small muted"> {{ $t("“下架”采用两连击策略：Steam appdetails 首次返回") }} <code>success:false</code> {{ $t("时只标记“疑似不可用”并提前 10 分钟复查；连续第二次确认后才会发送下架通知。网络错误永远不会改变可购状态，避免抖动误报。") }} </p>
          <p class="small muted"> {{ $t("新闻关键词预警是启发式功能，只扫描 Steam 新闻/公告，可能漏报或误报。默认只匹配标题，并在通知中标注“请人工确认”。") }} </p>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>{{ $t("区域与货币") }}</h2>
          </div>
          <p class="small muted"> {{ $t("区域与语言是账号级设置，决定 Steam 返回的货币和文案。修改区域会让你的全部监控项重新建立基线， 首轮检查只写快照、不发送促销或下架通知。不同用户可以使用不同区域，Steam 请求按") }} <code>(appid, region, language)</code> {{ $t("共享缓存。") }} </p>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>{{ $t("Steam 限流") }}</h2>
          </div>
          <p class="small muted"> {{ $t("Steam 商店接口为非官方接口，约 200 请求 / 5 分钟 / IP。系统使用全局令牌桶（默认 24 请求/分钟）、 共享缓存与自适应检查间隔控制用量。监控项较多时检查会被延后，管理员可在“系统状态”查看令牌余量与队列。") }} </p>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>{{ $t("备份与恢复") }}</h2>
          </div>
          <p class="small muted"> {{ $t("数据保存在 SQLite（WAL 模式）。备份时使用") }} <code>VACUUM INTO</code> {{ $t("生成一致性副本，并同时备份") }} <code>.env</code> {{ $t("中的") }} <code>APP_SECRET</code>{{ $t("。恢复时停止容器、替换数据库文件、删除") }} <code>-wal/-shm</code> {{ $t("后重新启动。") }} </p>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>{{ $t("已知限制") }}</h2>
          </div>
          <ul class="small muted" style="padding-left: 1.2rem; margin: 0">
            <li>{{ $t("无法获得精确促销结束时间，") }}<code>sale_end</code> {{ $t("依赖下一次检查发现折扣归零。") }}</li>
            <li><code>success:false</code> {{ $t("无法区分已下架、区域不可售与非法 appid。") }}</li>
            <li>{{ $t("单实例部署，SQLite 单写者，无 HA。") }}</li>
            <li>{{ $t("企业微信群机器人 Webhook 只能发送；群内指令需使用智能机器人长连接。") }}</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
