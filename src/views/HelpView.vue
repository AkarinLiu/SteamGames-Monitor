<script setup lang="ts">
import { APP_NAME } from '@shared/constants'

const commands = [
  { command: '/help', description: '显示指令列表' },
  { command: '/add <appid|链接|名称> [--discount N] [--note 文本] [--force]', description: '添加监控项' },
  { command: '/adddlc <基础游戏> [--max 50]', description: '批量导入该游戏的 DLC' },
  { command: '/remove <id|appid>', description: '删除监控项' },
  { command: '/pause <id|appid>', description: '暂停检查' },
  { command: '/resume <id|appid>', description: '恢复检查' },
  { command: '/check <id|appid|名称>', description: '立即检查（绕过缓存）' },
  { command: '/price <id|appid|名称>', description: '查询当前价格与状态' },
  { command: '/list [--all] [--sale] [--paused] [--page N]', description: '列出监控项' },
  { command: '/events [--item id] [--limit 10]', description: '查看最近事件' },
  { command: '/cancel', description: '取消正在等待的选择（搜索多个结果时）' },
]
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1>帮助</h1>
        <p>{{ APP_NAME }} 的接入步骤、斜杠指令与已知限制。</p>
      </div>
    </div>

    <div class="detail-grid">
      <div class="stack">
        <section class="card">
          <div class="card-title">
            <h2>斜杠指令</h2>
          </div>
          <p class="small muted">
            指令作用于机器人所属账号的数据。机器人所有者隐式拥有管理员权限；允许名单中的
            <code>viewer</code> 只能执行 <code>/list</code>、<code>/price</code>、<code>/events</code>。
          </p>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>指令</th>
                  <th>说明</th>
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
          <p class="small faint" style="margin-top: 10px">
            支持全角 <code>／</code>、<code>/add@机器人</code>、引号参数与 <code>--flag=value</code>。
            名称搜索返回多个结果时会给出序号，直接回复序号即可选择，10 分钟内有效。
          </p>
          <p class="small faint" style="margin-top: 10px">
            在“指令机器人”页面创建机器人：飞书、钉钉填写回调地址；企业微信填写 Bot ID / Secret 后自动建立长连接。不同平台可以分别配置允许名单。
          </p>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>接入飞书应用机器人</h2>
          </div>
          <ol class="small muted" style="padding-left: 1.2rem">
            <li>在飞书开放平台创建企业自建应用，开启“机器人”能力。</li>
            <li>事件订阅地址填写“指令机器人”页面显示的回调地址（<code>/webhooks/feishu/&lt;slug&gt;</code>）。</li>
            <li>订阅 <code>im.message.receive_v1</code>，并申请 <code>im:message</code>、<code>im:message:send_as_bot</code> 等权限。</li>
            <li>发布应用并把机器人加入群聊，@机器人后输入 <code>/help</code> 测试。</li>
          </ol>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>接入钉钉机器人</h2>
          </div>
          <ol class="small muted" style="padding-left: 1.2rem">
            <li>在钉钉开放平台创建企业内部机器人，开启“Outgoing”回调。</li>
            <li>回调地址填写 <code>/webhooks/dingtalk/&lt;slug&gt;</code>，填写 App Secret 用于验签。</li>
            <li>在机器人配置中填写 App Secret、Robot Code 与所有者 staffId。</li>
            <li>群内 @机器人 发送 <code>/help</code>，回复通过临时会话 Webhook 发送。</li>
          </ol>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>接入企业微信智能机器人（长连接）</h2>
          </div>
          <ol class="small muted" style="padding-left: 1.2rem">
            <li>在「指令机器人」点击「企微扫码添加」，用有创建权限的企业微信扫码，系统会自动创建机器人并填写 Bot ID / Secret；二维码 5 分钟内有效。</li>
            <li>也可以手动在企业微信管理后台进入「智能机器人」→ API 模式 → 长连接，创建机器人并填写 Bot ID、Secret 与所有者 UserID。</li>
            <li>保存后服务会主动连接 <code>wss://openws.work.weixin.qq.com</code>，无需公网回调地址、Token 或 EncodingAESKey。</li>
            <li>将机器人加入群聊或单聊，@机器人 发送 <code>/help</code> 测试；建议在机器人编辑页补充所有者 UserID。事件通知仍需在「通知渠道」单独添加企业微信群机器人 Webhook。</li>
            <li>未授权成员会收到一次性网页授权链接；机器人所有者登录后可选择只读或管理员角色并批准，链接 30 分钟内有效。</li>
          </ol>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>通知渠道</h2>
          </div>
          <ul class="small muted" style="padding-left: 1.2rem; margin: 0">
            <li>企业微信群机器人：markdown，单条上限约 4096 字节，20 条/分钟。</li>
            <li>飞书自定义机器人：交互卡片，签名密钥按官方 HMAC-SHA256 规则计算。</li>
            <li>钉钉自定义机器人：markdown，支持加签，90037 等限流错误会自动重试。</li>
            <li>自定义 WebHook：POST JSON 事件，可选 HMAC-SHA256 签名与 Authorization 头。</li>
            <li>SMTP 邮件：同时发送纯文本与 HTML，主题不超过 200 字符。</li>
            <li>投递失败会按 30 秒 → 2 分钟 → 10 分钟 → 1 小时 → 6 小时 → 24 小时重试，最多 6 次。</li>
          </ul>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-title">
            <h2>下架判定</h2>
          </div>
          <p class="small muted">
            “下架”采用两连击策略：Steam appdetails 首次返回 <code>success:false</code> 时只标记“疑似不可用”并提前 10
            分钟复查；连续第二次确认后才会发送下架通知。网络错误永远不会改变可购状态，避免抖动误报。
          </p>
          <p class="small muted">
            新闻关键词预警是启发式功能，只扫描 Steam 新闻/公告，可能漏报或误报。默认只匹配标题，并在通知中标注“请人工确认”。
          </p>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>区域与货币</h2>
          </div>
          <p class="small muted">
            区域与语言是账号级设置，决定 Steam 返回的货币和文案。修改区域会让你的全部监控项重新建立基线，
            首轮检查只写快照、不发送促销或下架通知。不同用户可以使用不同区域，Steam 请求按
            <code>(appid, region, language)</code> 共享缓存。
          </p>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>Steam 限流</h2>
          </div>
          <p class="small muted">
            Steam 商店接口为非官方接口，约 200 请求 / 5 分钟 / IP。系统使用全局令牌桶（默认 24 请求/分钟）、
            共享缓存与自适应检查间隔控制用量。监控项较多时检查会被延后，管理员可在“系统状态”查看令牌余量与队列。
          </p>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>备份与恢复</h2>
          </div>
          <p class="small muted">
            数据保存在 SQLite（WAL 模式）。备份时使用 <code>VACUUM INTO</code> 生成一致性副本，并同时备份
            <code>.env</code> 中的 <code>APP_SECRET</code>。恢复时停止容器、替换数据库文件、删除
            <code>-wal/-shm</code> 后重新启动。
          </p>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>已知限制</h2>
          </div>
          <ul class="small muted" style="padding-left: 1.2rem; margin: 0">
            <li>无法获得精确促销结束时间，<code>sale_end</code> 依赖下一次检查发现折扣归零。</li>
            <li><code>success:false</code> 无法区分已下架、区域不可售与非法 appid。</li>
            <li>单实例部署，SQLite 单写者，无 HA。</li>
            <li>企业微信群机器人 Webhook 只能发送；群内指令需使用智能机器人长连接。</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
