<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type {
  BotAccessRole,
  BotPlatform,
  DingtalkConnectionMode,
  DingtalkQrPollResult,
  DingtalkQrSession,
  FeishuBrand,
  FeishuConnectionMode,
  FeishuQrPollResult,
  FeishuQrSession,
  WecomQrPollResult,
  WecomQrSession,
} from '@shared/types'
import { BOT_PLATFORM_OPTIONS, LIMITS } from '@shared/constants'
import { describeError } from '@/api/client'
import { useBotsStore, type BotView } from '@/stores/bots'
import { useToastStore } from '@/stores/toast'
import Modal from '@/components/Modal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'
import QuotaBar from '@/components/QuotaBar.vue'
import CopyButton from '@/components/CopyButton.vue'

interface AllowDraft {
  platformUserId: string
  displayName: string
  role: BotAccessRole
}

const store = useBotsStore()
const toast = useToastStore()

const error = ref('')
const busyId = ref<number | null>(null)
const dialogOpen = ref(false)
const dialogBusy = ref(false)
const dialogError = ref('')
const editing = ref<BotView | null>(null)

const form = reactive({
  platform: 'feishu' as BotPlatform,
  name: '',
  enabled: true,
  notifyEnabled: false,
  apiBaseUrl: '',
  ownerPlatformUserId: '',
  appId: '',
  appKey: '',
  appSecret: '',
  encryptKey: '',
  verificationToken: '',
  robotCode: '',
  botId: '',
  secret: '',
  brand: 'feishu' as FeishuBrand,
  connectionMode: 'webhook' as FeishuConnectionMode,
  dingtalkConnectionMode: 'webhook' as DingtalkConnectionMode,
})

const deleteTarget = ref<BotView | null>(null)
const deleteBusy = ref(false)

const drafts = reactive<Record<number, AllowDraft>>({})
const inboundTexts = reactive<Record<number, string>>({})
const inboundResults = reactive<Record<number, string>>({})
const inboundBusy = ref<number | null>(null)

type QrPlatform = 'feishu' | 'wecom' | 'dingtalk'
type QrSessionView = FeishuQrSession | WecomQrSession | DingtalkQrSession
type QrStatusView = FeishuQrPollResult | WecomQrPollResult | DingtalkQrPollResult

const qrOpen = ref(false)
const qrStarting = ref(false)
const qrPolling = ref(false)
const qrError = ref('')
const qrPlatform = ref<QrPlatform>('wecom')
const qrBrand = ref<FeishuBrand>('feishu')
const qrSession = ref<QrSessionView | null>(null)
const qrStatus = ref<QrStatusView | null>(null)
const qrName = ref('企业微信智能机器人')
let qrTimer: number | null = null
let qrRequestId = 0

const isEditing = computed(() => editing.value !== null)

const BOT_DOCS: Record<BotPlatform, string> = {
  feishu:
    'https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case',
  dingtalk: 'https://open.dingtalk.com/document/orgapp/receive-message',
  wecom: 'https://developer.work.weixin.qq.com/document/path/101463',
}

const LARK_DOCS =
  'https://open.larksuite.com/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case'

const CONNECTION_LABELS: Record<string, string> = {
  connecting: '长连接中',
  connected: '长连接已连接',
  disconnected: '长连接已断开',
  error: '长连接异常',
  disabled: '长连接未启用',
}

function connectionLabel(state: string | undefined): string {
  return state ? (CONNECTION_LABELS[state] ?? state) : '未知状态'
}

function connectionClass(state: string | undefined): string {
  if (state === 'connected') return 'badge-green'
  if (state === 'connecting') return 'badge-warning'
  if (state === 'error') return 'badge-danger'
  return 'badge-neutral'
}

const botDocsUrl = computed(() =>
  form.platform === 'feishu' && form.brand === 'lark'
    ? LARK_DOCS
    : BOT_DOCS[form.platform],
)

const qrLabel = computed(() => {
  if (qrPlatform.value === 'wecom') return '企业微信'
  if (qrPlatform.value === 'dingtalk') return '钉钉'
  return qrBrand.value === 'lark' ? 'Lark' : '飞书'
})

const qrTitle = computed(() => `扫码添加${qrLabel.value}机器人`)

function defaultQrName(platform: QrPlatform, brand: FeishuBrand): string {
  if (platform === 'wecom') return '企业微信智能机器人'
  if (platform === 'dingtalk') return '钉钉智能机器人'
  return brand === 'lark' ? 'Lark 智能机器人' : '飞书智能机器人'
}

function usesLongConnection(bot: BotView): boolean {
  return (
    bot.platform === 'wecom' ||
    (bot.platform === 'feishu' && bot.config.connectionMode === 'websocket') ||
    (bot.platform === 'dingtalk' && bot.config.connectionMode === 'stream')
  )
}

function usesCallback(bot: BotView): boolean {
  return (
    (bot.platform === 'dingtalk' && bot.config.connectionMode !== 'stream') ||
    (bot.platform === 'feishu' && bot.config.connectionMode !== 'websocket')
  )
}

function platformLabel(platform: BotPlatform): string {
  return BOT_PLATFORM_OPTIONS.find((option) => option.value === platform)?.label ?? platform
}

function draftFor(id: number): AllowDraft {
  if (!drafts[id]) {
    drafts[id] = { platformUserId: '', displayName: '', role: 'viewer' }
  }
  return drafts[id] as AllowDraft
}

function inboundTextFor(id: number): string {
  return inboundTexts[id] ?? '/help'
}

function setInboundText(id: number, value: string): void {
  inboundTexts[id] = value
}

function resetForm(): void {
  form.platform = 'feishu'
  form.name = ''
  form.enabled = true
  form.notifyEnabled = false
  form.apiBaseUrl = ''
  form.ownerPlatformUserId = ''
  form.appId = ''
  form.appKey = ''
  form.appSecret = ''
  form.encryptKey = ''
  form.verificationToken = ''
  form.robotCode = ''
  form.botId = ''
  form.secret = ''
  form.brand = 'feishu'
  form.connectionMode = 'webhook'
  form.dingtalkConnectionMode = 'webhook'
  dialogError.value = ''
}

function openCreate(): void {
  editing.value = null
  resetForm()
  dialogOpen.value = true
}

function stopQrPolling(): void {
  if (qrTimer !== null) {
    window.clearInterval(qrTimer)
    qrTimer = null
  }
}

function openQrDialog(platform: QrPlatform, brand: FeishuBrand = 'feishu'): void {
  qrPlatform.value = platform
  qrBrand.value = brand
  qrOpen.value = true
  qrError.value = ''
  qrStatus.value = null
  qrSession.value = null
  qrName.value = defaultQrName(platform, brand)
  qrRequestId += 1
  void startQr()
}

function openQrFromCreate(): void {
  dialogOpen.value = false
  const platform: QrPlatform =
    form.platform === 'wecom'
      ? 'wecom'
      : form.platform === 'dingtalk'
        ? 'dingtalk'
        : 'feishu'
  openQrDialog(platform, form.brand)
  if (form.name.trim()) qrName.value = form.name.trim()
}

async function startQr(): Promise<void> {
  stopQrPolling()
  const requestId = ++qrRequestId
  const platform = qrPlatform.value
  qrStarting.value = true
  qrError.value = ''
  qrStatus.value = null
  qrSession.value = null
  try {
    const session: QrSessionView =
      platform === 'wecom'
        ? await store.startWecomQr(qrName.value)
        : platform === 'dingtalk'
          ? await store.startDingtalkQr(qrName.value)
          : await store.startFeishuQr({ name: qrName.value, brand: qrBrand.value })
    if (requestId !== qrRequestId || !qrOpen.value) {
      void cancelQrSession(platform, session.sessionId)
      return
    }
    qrSession.value = session
    qrStatus.value = { status: 'pending', message: '等待扫码授权' }
    const intervalMs =
      'intervalMs' in session && typeof session.intervalMs === 'number'
        ? Math.max(2500, session.intervalMs)
        : 2500
    qrTimer = window.setInterval(() => {
      void pollQr()
    }, intervalMs)
  } catch (err) {
    if (requestId === qrRequestId) qrError.value = describeError(err)
  } finally {
    if (requestId === qrRequestId) qrStarting.value = false
  }
}

async function pollQr(): Promise<void> {
  const session = qrSession.value
  if (!session || qrPolling.value) return
  qrPolling.value = true
  try {
    const result: QrStatusView =
      qrPlatform.value === 'wecom'
        ? await store.pollWecomQr(session.sessionId)
        : qrPlatform.value === 'dingtalk'
          ? await store.pollDingtalkQr(session.sessionId)
          : await store.pollFeishuQr(session.sessionId)
    if (!qrOpen.value || qrSession.value?.sessionId !== session.sessionId) return
    qrStatus.value = result
    if (result.status === 'success') {
      stopQrPolling()
      if ('brand' in result && result.brand) qrBrand.value = result.brand
      await store.fetchAll()
      toast.success(`${qrLabel.value}机器人已添加`)
    } else if (result.status === 'expired' || result.status === 'failed') {
      stopQrPolling()
    }
  } catch (err) {
    qrError.value = describeError(err)
    stopQrPolling()
  } finally {
    qrPolling.value = false
  }
}

async function cancelQrSession(platform: QrPlatform, sessionId: string): Promise<void> {
  try {
    if (platform === 'wecom') await store.cancelWecomQr(sessionId)
    else if (platform === 'dingtalk') await store.cancelDingtalkQr(sessionId)
    else await store.cancelFeishuQr(sessionId)
  } catch {
    // Session cleanup is best-effort.
  }
}

function closeQrDialog(): void {
  stopQrPolling()
  qrRequestId += 1
  const session = qrSession.value
  qrSession.value = null
  qrStatus.value = null
  qrOpen.value = false
  if (session) void cancelQrSession(qrPlatform.value, session.sessionId)
}

function switchQrBrand(brand: FeishuBrand): void {
  if (qrPlatform.value !== 'feishu' || qrBrand.value === brand) return
  qrBrand.value = brand
  qrName.value = defaultQrName('feishu', brand)
  void startQr()
}

function qrOwnerId(status: QrStatusView | null): string {
  return status && 'ownerPlatformUserId' in status ? (status.ownerPlatformUserId ?? '') : ''
}

function onQrOpenChange(open: boolean): void {
  if (!open) closeQrDialog()
}

async function editQrBot(): Promise<void> {
  const botId = qrStatus.value?.botId
  if (!botId) return
  closeQrDialog()
  try {
    await store.fetchAll()
    const bot = store.items.find((item) => item.id === botId)
    if (bot) openEdit(bot)
  } catch (err) {
    toast.error(describeError(err))
  }
}

function openEdit(bot: BotView): void {
  editing.value = bot
  resetForm()
  form.platform = bot.platform
  form.name = bot.name
  form.enabled = bot.enabled
  form.notifyEnabled = bot.notifyEnabled
  form.apiBaseUrl = bot.apiBaseUrl ?? ''
  const config = bot.config
  form.ownerPlatformUserId =
    typeof config.ownerPlatformUserId === 'string' ? config.ownerPlatformUserId : ''
  if (bot.platform === 'feishu') {
    form.appId = typeof config.appId === 'string' ? config.appId : ''
    form.brand = config.brand === 'lark' ? 'lark' : 'feishu'
    form.connectionMode = config.connectionMode === 'websocket' ? 'websocket' : 'webhook'
  } else if (bot.platform === 'dingtalk') {
    form.appKey = typeof config.appKey === 'string' ? config.appKey : ''
    form.robotCode = typeof config.robotCode === 'string' ? config.robotCode : ''
    form.dingtalkConnectionMode = config.connectionMode === 'stream' ? 'stream' : 'webhook'
  } else {
    form.botId = typeof config.botId === 'string' ? config.botId : ''
  }
  dialogOpen.value = true
}

function buildConfig(): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  if (form.ownerPlatformUserId.trim()) {
    config.ownerPlatformUserId = form.ownerPlatformUserId.trim()
  }
  if (form.platform === 'feishu') {
    if (form.appId.trim()) config.appId = form.appId.trim()
    if (form.appSecret.trim()) config.appSecret = form.appSecret.trim()
    if (form.encryptKey.trim()) config.encryptKey = form.encryptKey.trim()
    if (form.verificationToken.trim()) config.verificationToken = form.verificationToken.trim()
    config.brand = form.brand
    config.connectionMode = form.connectionMode
  } else if (form.platform === 'dingtalk') {
    if (form.appKey.trim()) config.appKey = form.appKey.trim()
    if (form.appSecret.trim()) config.appSecret = form.appSecret.trim()
    if (form.robotCode.trim()) config.robotCode = form.robotCode.trim()
    config.connectionMode = form.dingtalkConnectionMode
  } else {
    if (form.botId.trim()) config.botId = form.botId.trim()
    if (form.secret.trim()) config.secret = form.secret.trim()
  }
  return config
}

async function save(): Promise<void> {
  dialogError.value = ''
  if (!form.name.trim()) {
    dialogError.value = '请填写机器人名称'
    return
  }
  if (form.platform === 'wecom') {
    if (!form.botId.trim()) {
      dialogError.value = '请填写企业微信智能机器人 Bot ID'
      return
    }
    if (!isEditing.value && !form.secret.trim()) {
      dialogError.value = '请填写企业微信智能机器人 Secret'
      return
    }
  }
  if (form.platform === 'feishu' && form.connectionMode === 'websocket') {
    if (!form.appId.trim()) {
      dialogError.value = '长连接模式需要填写 App ID'
      return
    }
    if (!isEditing.value && !form.appSecret.trim()) {
      dialogError.value = '长连接模式需要填写 App Secret'
      return
    }
  }
  if (form.platform === 'dingtalk' && form.dingtalkConnectionMode === 'stream') {
    if (!form.appKey.trim()) {
      dialogError.value = 'Stream 模式需要填写 App Key / Client ID'
      return
    }
    if (!isEditing.value && !form.appSecret.trim()) {
      dialogError.value = 'Stream 模式需要填写 App Secret / Client Secret'
      return
    }
  }
  dialogBusy.value = true
  try {
    const apiBaseUrl =
      form.platform === 'wecom' ? null : form.apiBaseUrl.trim() || null
    if (editing.value) {
      const patch: Record<string, unknown> = {
        name: form.name.trim(),
        enabled: form.enabled,
        notifyEnabled: form.notifyEnabled,
        apiBaseUrl,
        config: buildConfig(),
      }
      await store.update(editing.value.id, patch)
      toast.success('机器人配置已更新')
    } else {
      await store.create({
        platform: form.platform,
        name: form.name.trim(),
        enabled: form.enabled,
        notifyEnabled: form.notifyEnabled,
        apiBaseUrl: apiBaseUrl ?? undefined,
        config: buildConfig(),
      })
      toast.success('机器人已创建')
    }
    dialogOpen.value = false
  } catch (err) {
    dialogError.value = describeError(err)
  } finally {
    dialogBusy.value = false
  }
}

async function toggleEnabled(bot: BotView): Promise<void> {
  busyId.value = bot.id
  try {
    await store.update(bot.id, { enabled: !bot.enabled })
    toast.success(bot.enabled ? '机器人已停用' : '机器人已启用')
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    busyId.value = null
  }
}

async function toggleNotify(bot: BotView): Promise<void> {
  busyId.value = bot.id
  try {
    await store.update(bot.id, { notifyEnabled: !bot.notifyEnabled })
    toast.success(bot.notifyEnabled ? '事件通知已关闭' : '事件通知已开启')
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    busyId.value = null
  }
}

async function addAllowlist(bot: BotView): Promise<void> {
  const draft = draftFor(bot.id)
  if (!draft.platformUserId.trim()) {
    toast.error('请填写平台用户 ID')
    return
  }
  busyId.value = bot.id
  try {
    await store.addAllowlist(bot.id, {
      platformUserId: draft.platformUserId.trim(),
      displayName: draft.displayName.trim() || undefined,
      role: draft.role,
    })
    drafts[bot.id] = { platformUserId: '', displayName: '', role: 'viewer' }
    toast.success('允许名单已更新')
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    busyId.value = null
  }
}

async function removeAllowlist(bot: BotView, platformUserId: string): Promise<void> {
  busyId.value = bot.id
  try {
    await store.removeAllowlist(bot.id, platformUserId)
    toast.success('已从允许名单移除')
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    busyId.value = null
  }
}

async function testInbound(bot: BotView): Promise<void> {
  const text = inboundTextFor(bot.id).trim()
  if (!text) return
  inboundBusy.value = bot.id
  try {
    const result = await store.testInbound(bot.id, text)
    inboundResults[bot.id] = `[${result.result}]\n${result.lines.join('\n')}`
  } catch (err) {
    inboundResults[bot.id] = describeError(err)
  } finally {
    inboundBusy.value = null
  }
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  deleteBusy.value = true
  try {
    await store.remove(target.id)
    toast.success('机器人已删除')
    deleteTarget.value = null
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    deleteBusy.value = false
  }
}

async function load(): Promise<void> {
  error.value = ''
  try {
    await store.fetchAll()
  } catch (err) {
    error.value = describeError(err)
  }
}

let statusTimer: number | null = null

onMounted(() => {
  void load()
  statusTimer = window.setInterval(() => {
    if (
      store.items.some(
        (bot) => (usesLongConnection(bot) && bot.enabled) || bot.notifyEnabled,
      )
    ) {
      void store.fetchAll().catch(() => {})
    }
  }, 5000)
})

onBeforeUnmount(() => {
  if (statusTimer !== null) {
    window.clearInterval(statusTimer)
    statusTimer = null
  }
})
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1>指令机器人</h1>
        <p>接入飞书 / Lark、钉钉或企业微信智能机器人，在聊天中用斜杠指令管理监控项。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="openQrDialog('feishu')">飞书 / Lark 扫码</button>
        <button class="btn" type="button" @click="openQrDialog('dingtalk')">钉钉扫码添加</button>
        <button class="btn" type="button" @click="openQrDialog('wecom')">企微扫码添加</button>
        <button class="btn btn-primary" type="button" @click="openCreate">添加机器人</button>
      </div>
    </div>

    <QuotaBar v-if="store.quota" :used="store.quota.used" :limit="store.quota.limit" label="机器人配额" />

    <ErrorBanner :message="error" />

    <div v-if="store.loading && store.items.length === 0" class="card">
      <div v-for="index in 2" :key="index" class="skeleton" style="height: 120px; margin-bottom: 12px" />
    </div>

    <EmptyState
      v-else-if="store.items.length === 0"
      title="还没有接入机器人"
      description="飞书 / Lark、钉钉、企业微信都可扫码自动创建，也可手动填写凭据。接入后即可在聊天中使用 /add、/list 等指令。"
    >
      <button class="btn btn-primary" type="button" style="margin-top: 12px" @click="openCreate">
        添加第一个机器人
      </button>
    </EmptyState>

    <div v-else class="stack">
      <section v-for="bot in store.items" :key="bot.id" class="card">
        <div class="card-title">
          <div class="inline">
            <h2>{{ bot.name }}</h2>
            <span class="badge badge-accent">{{ platformLabel(bot.platform) }}</span>
            <span class="badge" :class="bot.enabled ? 'badge-green' : 'badge-neutral'">
              {{ bot.enabled ? '已启用' : '已停用' }}
            </span>
            <span v-if="bot.notifyEnabled" class="badge badge-accent">事件通知</span>
            <span
              v-if="bot.platform === 'feishu'"
              class="badge badge-neutral"
            >
              {{ bot.config.brand === 'lark' ? 'Lark 国际版' : '飞书' }} ·
              {{ bot.config.connectionMode === 'websocket' ? '长连接' : 'HTTP 回调' }}
            </span>
            <span v-if="bot.platform === 'dingtalk'" class="badge badge-neutral">
              {{ bot.config.connectionMode === 'stream' ? 'Stream 长连接' : 'HTTP 回调' }}
            </span>
            <span
              v-if="bot.connection"
              class="badge"
              :class="connectionClass(bot.connection.state)"
            >
              {{ connectionLabel(bot.connection.state) }}
            </span>
            <span v-if="bot.configError" class="badge badge-danger">密钥无法解密</span>
          </div>
          <div class="inline">
            <button class="btn btn-sm" type="button" @click="openEdit(bot)">编辑</button>
            <button
              class="btn btn-sm"
              type="button"
              :disabled="busyId === bot.id"
              @click="toggleNotify(bot)"
            >
              {{ bot.notifyEnabled ? '关闭通知' : '开启通知' }}
            </button>
            <button
              class="btn btn-sm"
              type="button"
              :disabled="busyId === bot.id"
              @click="toggleEnabled(bot)"
            >
              {{ bot.enabled ? '停用' : '启用' }}
            </button>
            <button class="btn btn-sm btn-danger" type="button" @click="deleteTarget = bot">
              删除
            </button>
          </div>
        </div>

        <div v-if="usesCallback(bot) && bot.callbackUrl" class="field">
          <span class="label">回调地址（填入平台后台）</span>
          <div class="inline" style="flex-wrap: nowrap">
            <input class="input flex-1 mono small" :value="bot.callbackUrl" readonly />
            <CopyButton :value="bot.callbackUrl" />
          </div>
        </div>

        <div
          v-else-if="usesLongConnection(bot)"
          class="banner"
          :class="bot.connection?.state === 'error' ? 'banner-error' : 'banner-info'"
        >
          {{ bot.platform === 'wecom'
            ? '企业微信长连接'
            : bot.platform === 'dingtalk'
              ? '钉钉 Stream'
              : '飞书 / Lark 长连接' }}模式：无需公网回调地址，服务启动后主动建立连接。{{ bot.connection?.message ?? '' }}
        </div>

        <div v-if="bot.platform === 'wecom' && !bot.config.botId" class="banner banner-warning">
          尚未配置 Bot ID / Secret，长连接不会建立。请编辑机器人并填写企业微信智能机器人凭据。
        </div>

        <div
          v-if="bot.platform === 'feishu' && bot.config.connectionMode === 'websocket' && !bot.config.appId"
          class="banner banner-warning"
        >
          尚未配置 App ID / App Secret，飞书 / Lark 长连接不会建立。
        </div>

        <div
          v-if="bot.platform === 'dingtalk' && bot.config.connectionMode === 'stream' && !bot.config.appKey"
          class="banner banner-warning"
        >
          尚未配置 App Key / App Secret，钉钉 Stream 长连接不会建立。
        </div>

        <div v-if="bot.notifyEnabled && !bot.lastChatAt" class="banner banner-warning">
          已开启事件通知，但还没有记录到最近会话。请让授权用户在聊天中发送任意指令，事件才会推送到该会话。
        </div>

        <div v-if="bot.configError" class="banner banner-error">
          {{ bot.configError }}（请重新填写密钥）
        </div>

        <div class="inline small" style="margin-bottom: 12px">
          <span v-if="typeof bot.config.ownerPlatformUserId === 'string' && bot.config.ownerPlatformUserId" class="badge badge-neutral">
            所有者 ID：{{ bot.config.ownerPlatformUserId }}
          </span>
          <span v-if="typeof bot.config.appId === 'string' && bot.config.appId" class="badge badge-neutral">
            App ID：{{ bot.config.appId }}
          </span>
          <span v-if="typeof bot.config.appKey === 'string' && bot.config.appKey" class="badge badge-neutral">
            App Key：{{ bot.config.appKey }}
          </span>
          <span v-if="typeof bot.config.robotCode === 'string' && bot.config.robotCode" class="badge badge-neutral">
            Robot Code：{{ bot.config.robotCode }}
          </span>
          <span v-if="typeof bot.config.botId === 'string' && bot.config.botId" class="badge badge-neutral">
            Bot ID：{{ bot.config.botId }}
          </span>
          <span v-if="bot.config.secretSet === true" class="badge badge-green">Secret 已配置</span>
          <span v-if="bot.apiBaseUrl && bot.platform !== 'wecom'" class="badge badge-warning">API：{{ bot.apiBaseUrl }}</span>
        </div>

        <div class="grid-2">
          <div>
            <h3>允许名单</h3>
            <p class="faint small">
              所有平台用户（包括所有者 ID）都需要先通过网页授权或加入允许名单才能使用指令；viewer 只能查询。
            </p>
            <div class="table-wrap" style="margin-bottom: 10px">
              <table class="table">
                <thead>
                  <tr>
                    <th>平台用户 ID</th>
                    <th>名称</th>
                    <th>角色</th>
                    <th class="right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="entry in bot.allowlist" :key="entry.id">
                    <td class="mono small">{{ entry.platformUserId }}</td>
                    <td class="small">{{ entry.displayName || '—' }}</td>
                    <td>
                      <span class="badge" :class="entry.role === 'admin' ? 'badge-accent' : 'badge-neutral'">
                        {{ entry.role === 'admin' ? '管理员' : '只读' }}
                      </span>
                    </td>
                    <td class="right">
                      <button
                        class="btn btn-sm"
                        type="button"
                        :disabled="busyId === bot.id"
                        @click="removeAllowlist(bot, entry.platformUserId)"
                      >
                        移除
                      </button>
                    </td>
                  </tr>
                  <tr v-if="bot.allowlist.length === 0">
                    <td colspan="4" class="small faint">暂无其他平台用户</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <form class="inline" @submit.prevent="addAllowlist(bot)">
              <input
                v-model="draftFor(bot.id).platformUserId"
                class="input"
                style="width: 160px"
                placeholder="平台用户 ID"
                aria-label="平台用户 ID"
              />
              <input
                v-model="draftFor(bot.id).displayName"
                class="input"
                style="width: 120px"
                placeholder="备注名"
                aria-label="备注名"
              />
              <select v-model="draftFor(bot.id).role" class="select" style="width: auto" aria-label="角色">
                <option value="viewer">只读</option>
                <option value="admin">管理员</option>
              </select>
              <button class="btn btn-sm" type="submit" :disabled="busyId === bot.id">添加</button>
            </form>
          </div>

          <div>
            <h3>模拟指令</h3>
            <p class="faint small">
              以机器人所有者身份在本地执行一条指令，不经过平台，用于验证配置与权限。
            </p>
            <div class="inline" style="margin-bottom: 8px">
              <input
                class="input flex-1 mono"
                :value="inboundTextFor(bot.id)"
                aria-label="模拟指令"
                @input="setInboundText(bot.id, ($event.target as HTMLInputElement).value)"
                @keydown.enter.prevent="testInbound(bot)"
              />
              <button class="btn btn-sm" type="button" :disabled="inboundBusy === bot.id" @click="testInbound(bot)">
                {{ inboundBusy === bot.id ? '执行中…' : '执行' }}
              </button>
            </div>
            <pre v-if="inboundResults[bot.id]" class="small" style="white-space: pre-wrap">{{ inboundResults[bot.id] }}</pre>
          </div>
        </div>
      </section>
    </div>

    <Modal v-model:open="dialogOpen" :title="isEditing ? '编辑机器人' : '添加机器人'" width="620px">
      <ErrorBanner :message="dialogError" />
      <form @submit.prevent="save">
        <div class="grid-2">
          <div class="field">
            <label for="bot-name">名称</label>
            <input id="bot-name" v-model="form.name" class="input" required :maxlength="LIMITS.botNameMaxLength" />
          </div>
          <div class="field">
            <label for="bot-platform">平台</label>
            <select id="bot-platform" v-model="form.platform" class="select" :disabled="isEditing">
              <option v-for="option in BOT_PLATFORM_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>

        <p class="field-hint" style="margin-top: -6px">
          <a :href="botDocsUrl" target="_blank" rel="noopener noreferrer">
            查看 {{ platformLabel(form.platform) }} 官方接入文档 ↗
          </a>
        </p>

        <div class="field">
          <label for="bot-owner">所有者平台用户 ID（仅标识）</label>
          <input
            id="bot-owner"
            v-model="form.ownerPlatformUserId"
            class="input mono"
            placeholder="例如飞书 open_id / 钉钉 staffId / 企微 UserID"
          />
          <span class="field-hint">
            仅用于标识扫码者 / 所有者，不会自动授予指令权限。所有平台用户都需要网页授权或允许名单。
          </span>
        </div>

        <template v-if="form.platform === 'feishu'">
          <div class="grid-2">
            <div class="field">
              <label for="bot-feishu-brand">版本</label>
              <select id="bot-feishu-brand" v-model="form.brand" class="select">
                <option value="feishu">飞书（中国版）</option>
                <option value="lark">Lark（国际版）</option>
              </select>
            </div>
            <div class="field">
              <label for="bot-feishu-mode">事件接收方式</label>
              <select id="bot-feishu-mode" v-model="form.connectionMode" class="select">
                <option value="webhook">HTTP 回调</option>
                <option value="websocket">长连接（推荐）</option>
              </select>
            </div>
          </div>

          <div class="banner banner-info">
            使用{{ form.brand === 'lark' ? ' Lark ' : '飞书 / Lark ' }}扫码一键创建应用，系统会自动填写 App ID / App Secret、所有者 open_id，并启用长连接。
            <button class="btn-link" type="button" @click="openQrFromCreate">扫码自动创建</button>
          </div>

          <div class="grid-2">
            <div class="field">
              <label for="bot-appid">App ID</label>
              <input id="bot-appid" v-model="form.appId" class="input mono" />
            </div>
            <div class="field">
              <label for="bot-appsecret">App Secret</label>
              <input id="bot-appsecret" v-model="form.appSecret" class="input" type="password" autocomplete="new-password" :placeholder="isEditing ? '留空保留已保存值' : ''" />
            </div>
          </div>
          <div v-if="form.connectionMode === 'webhook'" class="grid-2">
            <div class="field">
              <label for="bot-encrypt">Encrypt Key</label>
              <input id="bot-encrypt" v-model="form.encryptKey" class="input" type="password" autocomplete="new-password" :placeholder="isEditing ? '留空保留已保存值' : ''" />
            </div>
            <div class="field">
              <label for="bot-verify">Verification Token</label>
              <input id="bot-verify" v-model="form.verificationToken" class="input" type="password" autocomplete="new-password" :placeholder="isEditing ? '留空保留已保存值' : ''" />
            </div>
          </div>
          <p v-else class="field-hint" style="margin-top: -6px">
            长连接无需公网回调地址；飞书 / Lark 开放平台需将事件订阅方式设为「使用长连接接收事件」，并订阅
            <code>im.message.receive_v1</code>。
          </p>
        </template>

        <template v-else-if="form.platform === 'dingtalk'">
          <div class="grid-2">
            <div class="field">
              <label for="bot-ding-key">App Key（Client ID）</label>
              <input id="bot-ding-key" v-model="form.appKey" class="input mono" />
            </div>
            <div class="field">
              <label for="bot-ding-secret">App Secret（Client Secret）</label>
              <input id="bot-ding-secret" v-model="form.appSecret" class="input" type="password" autocomplete="new-password" :placeholder="isEditing ? '留空保留已保存值' : ''" />
            </div>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="bot-ding-mode">消息接收模式</label>
              <select id="bot-ding-mode" v-model="form.dingtalkConnectionMode" class="select">
                <option value="webhook">HTTP 回调（Outgoing）</option>
                <option value="stream">Stream 长连接（推荐）</option>
              </select>
            </div>
            <div class="field">
              <label for="bot-robotcode">Robot Code</label>
              <input id="bot-robotcode" v-model="form.robotCode" class="input mono" placeholder="通常与 Client ID 相同" />
            </div>
          </div>

          <div class="banner banner-info">
            使用钉钉扫码一键创建机器人应用，系统会自动填写 Client ID / Secret 并启用 Stream 长连接。
            <button class="btn-link" type="button" @click="openQrFromCreate">扫码自动创建</button>
          </div>

          <p v-if="form.dingtalkConnectionMode === 'stream'" class="field-hint" style="margin-top: -6px">
            Stream 模式由服务端主动连接钉钉，无需公网回调地址；钉钉后台需将机器人消息接收模式设为 Stream 并发布应用。
            App Key、App Secret 与 Robot Code 同时填写后，机器人还可以推送事件通知。
          </p>
          <p v-else class="field-hint" style="margin-top: -6px">
            HTTP 回调模式需把卡片上的回调地址填入钉钉机器人 Outgoing 配置；App Secret 用于校验签名。
            开启事件通知还需要 App Key、App Secret 与 Robot Code。
          </p>
        </template>

        <template v-else>
          <div class="grid-2">
            <div class="field">
              <label for="bot-id">Bot ID</label>
              <input
                id="bot-id"
                v-model="form.botId"
                class="input mono"
                required
                placeholder="企业微信智能机器人 BotID"
              />
            </div>
            <div class="field">
              <label for="bot-secret">Secret</label>
              <input
                id="bot-secret"
                v-model="form.secret"
                class="input"
                type="password"
                autocomplete="new-password"
                :required="!isEditing"
                :placeholder="isEditing ? '留空保留已保存值' : '长连接专用 Secret'"
              />
            </div>
          </div>
          <p class="field-hint" style="margin-top: -6px">
            在企业微信管理后台进入「智能机器人」→ API 模式 → 长连接，获取 Bot ID 和 Secret。保存后服务会自动建立长连接，无需公网回调地址。
          </p>
          <div class="banner banner-info">
            也可以让系统生成二维码，用有权创建智能机器人的企业微信扫码，自动创建并填写凭据。
            <button class="btn-link" type="button" @click="openQrFromCreate">扫码自动创建</button>
          </div>
        </template>

        <div v-if="form.platform !== 'wecom'" class="field">
          <label for="bot-api">API Base URL（仅测试 / 代理）</label>
          <input id="bot-api" v-model="form.apiBaseUrl" class="input mono" placeholder="可选，例如 http://127.0.0.1:9999" />
          <span class="field-hint">留空使用平台默认地址。生产环境建议保持为空。</span>
        </div>

        <label class="inline">
          <input v-model="form.enabled" type="checkbox" />
          启用该机器人（每个平台最多一个启用的机器人）
        </label>
        <label class="inline" style="margin-top: 8px">
          <input v-model="form.notifyEnabled" type="checkbox" />
          接收事件通知（推送到最近活跃会话）
        </label>
        <p class="field-hint">
          开启后，发售、促销、下架等事件会额外推送到该机器人最近一次被授权用户使用的会话；需要该用户先发送过指令。
        </p>

        <div class="inline" style="justify-content: flex-end; margin-top: 16px">
          <button class="btn" type="button" @click="dialogOpen = false">取消</button>
          <button class="btn btn-primary" type="submit" :disabled="dialogBusy">
            {{ dialogBusy ? '保存中…' : '保存' }}
          </button>
        </div>
      </form>
    </Modal>

    <ConfirmDialog
      :open="deleteTarget !== null"
      title="删除机器人"
      :message="`确定删除「${deleteTarget?.name ?? ''}」吗？对应回调地址会立即失效。`"
      confirm-text="删除"
      danger
      :busy="deleteBusy"
      @update:open="deleteTarget = null"
      @confirm="confirmDelete"
    />

    <Modal
      :open="qrOpen"
      :title="qrTitle"
      width="480px"
      @update:open="onQrOpenChange"
    >
      <ErrorBanner :message="qrError" />

      <div class="inline" v-if="qrPlatform === 'feishu'" style="justify-content: center; margin-bottom: 12px">
        <button
          class="btn btn-sm"
          :class="{ 'btn-primary': qrBrand === 'feishu' }"
          type="button"
          :disabled="qrStarting"
          @click="switchQrBrand('feishu')"
        >
          飞书
        </button>
        <button
          class="btn btn-sm"
          :class="{ 'btn-primary': qrBrand === 'lark' }"
          type="button"
          :disabled="qrStarting"
          @click="switchQrBrand('lark')"
        >
          Lark 国际版
        </button>
      </div>

      <div v-if="qrStarting" class="qr-panel">
        <p class="small muted">正在向{{ qrLabel }}申请二维码…</p>
      </div>

      <div v-else-if="qrSession" class="qr-panel">
        <template v-if="qrStatus?.status === 'pending'">
          <img
            class="qr-image"
            :src="qrSession.qrDataUrl"
            :alt="`${qrLabel}扫码添加机器人二维码`"
          />
          <p class="small">
            {{ qrPlatform === 'wecom'
              ? '使用企业微信扫一扫，按页面提示创建并授权智能机器人。'
              : `使用${qrLabel}扫一扫，按页面提示创建并授权应用。` }}
          </p>
          <p class="small faint">
            {{ qrPlatform === 'wecom'
              ? '二维码 5 分钟内有效；授权成功后系统会自动添加机器人并建立长连接。'
              : qrPlatform === 'dingtalk'
                ? '二维码 10 分钟内有效；授权成功后系统会自动填写 Client ID / Client Secret，并以 Stream 长连接接收指令。'
                : '二维码 10 分钟内有效；授权成功后系统会自动填写 App ID / App Secret，并以长连接接收指令。' }}
          </p>
          <p class="small faint">{{ qrStatus.message ?? '等待扫码授权…' }}</p>
          <p v-if="qrPolling" class="small faint">正在检查扫码状态…</p>
        </template>

        <template v-else-if="qrStatus?.status === 'success'">
          <div class="banner banner-info">{{ qrStatus.message }}</div>
          <p class="small">系统内名称：{{ qrName }}</p>
          <p v-if="qrOwnerId(qrStatus)" class="small">
            已识别所有者 open_id：<span class="mono">{{ qrOwnerId(qrStatus) }}</span>
          </p>
          <p class="small faint">
            {{ qrPlatform === 'wecom'
              ? '请让使用成员先发送指令，再由机器人所属账号登录网页批准；也可直接在允许名单中添加。'
              : qrPlatform === 'dingtalk'
                ? '所有者 ID 仅用于标识；请在网页授权页面批准自己的钉钉账号，其他成员也需授权或加入允许名单。'
                : '已识别所有者 open_id，但它仅用于标识；首次使用仍需在网页授权页面批准自己的平台账号。' }}
          </p>
          <p v-if="qrStatus.enabled === false" class="small faint">
            机器人已创建但未启用：当前平台已有启用中的机器人。
          </p>
        </template>

        <template v-else>
          <div class="banner banner-warning">{{ qrStatus?.message ?? '二维码已失效' }}</div>
          <p v-if="qrPlatform === 'dingtalk'" class="small faint">
            请确认扫码账号在目标企业拥有开发者权限，且已选择允许创建应用的组织；也可以关闭弹窗，使用手动配置填写 Client ID / Secret。
          </p>
        </template>
      </div>

      <template #footer>
        <button class="btn" type="button" @click="closeQrDialog">关闭</button>
        <div class="inline">
          <template v-if="qrStatus?.status === 'success'">
            <button class="btn btn-primary" type="button" @click="editQrBot">编辑机器人</button>
            <button class="btn" type="button" @click="closeQrDialog">完成</button>
          </template>
          <button
            v-else
            class="btn"
            type="button"
            :disabled="qrStarting"
            @click="startQr"
          >
            重新生成
          </button>
        </div>
      </template>
    </Modal>
  </div>
</template>
