<script setup lang="ts">
import { t, tf } from '@/i18n'

import { computed, onMounted, reactive, ref } from 'vue'
import type { ChannelType, EventType } from '@shared/types'
import {
  CHANNEL_TYPE_OPTIONS,
  DEFAULT_NOTIFY_EVENT_TYPES,
  EVENT_TYPE_OPTIONS,
} from '@shared/constants'
import { describeError } from '@/api/client'
import { useChannelsStore, type ChannelView } from '@/stores/channels'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import { formatDateTime } from '@/lib/format'
import Modal from '@/components/Modal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'
import QuotaBar from '@/components/QuotaBar.vue'

const store = useChannelsStore()
const session = useSessionStore()
const toast = useToastStore()
const timezone = session.user?.timezone ?? 'UTC'

const error = ref('')
const busyId = ref<number | null>(null)
const testResult = ref<Record<number, string>>({})

const dialogOpen = ref(false)
const dialogBusy = ref(false)
const dialogError = ref('')
const editing = ref<ChannelView | null>(null)

const form = reactive({
  name: '',
  type: 'wecom_bot' as ChannelType,
  enabled: true,
  eventTypes: [...DEFAULT_NOTIFY_EVENT_TYPES] as EventType[],
  webhookUrl: '',
  secret: '',
  authorization: '',
  host: '',
  port: 587,
  secure: true,
  requireTls: false,
  username: '',
  password: '',
  from: '',
  to: '',
})

const deleteTarget = ref<ChannelView | null>(null)
const deleteBusy = ref(false)

const isSmtp = computed(() => form.type === 'smtp')
const isEditing = computed(() => editing.value !== null)

const CHANNEL_DOCS: Record<ChannelType, string> = {
  wecom_bot: 'https://developer.work.weixin.qq.com/document/path/91770',
  feishu_bot: 'https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot',
  dingtalk_bot: 'https://open.dingtalk.com/document/orgapp/custom-robot-access',
  webhook: '',
  smtp: 'https://nodemailer.com/smtp/',
}

const channelDocsUrl = computed(() => CHANNEL_DOCS[form.type])

function typeLabel(type: ChannelType): string {
  return t(CHANNEL_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type)
}

function configSummary(channel: ChannelView): string {
  const config = channel.config
  if (channel.type === 'smtp') {
    const host = typeof config.host === 'string' ? config.host : ''
    const port = typeof config.port === 'number' ? config.port : ''
    const to = Array.isArray(config.to) ? config.to.join(', ') : ''
    return `${host}${port ? `:${port}` : ''}${to ? ` → ${to}` : ''}`
  }
  const host = typeof config.webhookHost === 'string' ? config.webhookHost : ''
  const secret = config.secretSet === true ? t(" · 已配置签名密钥") : ''
  const auth = config.authorizationSet === true ? t(" · 已配置 Authorization") : ''
  return `${host || t("未配置 Webhook")}${secret}${auth}`
}

function resetForm(): void {
  form.name = ''
  form.type = 'wecom_bot'
  form.enabled = true
  form.eventTypes = [...DEFAULT_NOTIFY_EVENT_TYPES]
  form.webhookUrl = ''
  form.secret = ''
  form.authorization = ''
  form.host = ''
  form.port = 587
  form.secure = true
  form.requireTls = false
  form.username = ''
  form.password = ''
  form.from = ''
  form.to = ''
  dialogError.value = ''
}

function openCreate(): void {
  editing.value = null
  resetForm()
  dialogOpen.value = true
}

function openEdit(channel: ChannelView): void {
  editing.value = channel
  resetForm()
  form.name = channel.name
  form.type = channel.type
  form.enabled = channel.enabled
  form.eventTypes = [...channel.eventTypes]
  const config = channel.config
  if (channel.type === 'smtp') {
    form.host = typeof config.host === 'string' ? config.host : ''
    form.port = typeof config.port === 'number' ? config.port : 587
    form.secure = config.secure !== false
    form.requireTls = config.requireTls === true
    form.from = typeof config.from === 'string' ? config.from : ''
    form.to = Array.isArray(config.to) ? config.to.join(', ') : ''
  }
  dialogOpen.value = true
}

function toggleEventType(type: EventType, checked: boolean): void {
  const set = new Set(form.eventTypes)
  if (checked) set.add(type)
  else set.delete(type)
  form.eventTypes = [...set]
}

function selectAllEvents(): void {
  form.eventTypes = [...DEFAULT_NOTIFY_EVENT_TYPES]
}

function buildConfig(): Record<string, unknown> | null {
  if (isSmtp.value) {
    const recipients = form.to
      .split(/[,，;\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
    const config: Record<string, unknown> = {
      host: form.host.trim(),
      port: Number(form.port),
      secure: form.secure,
      requireTls: form.requireTls,
      from: form.from.trim(),
      to: recipients,
    }
    if (form.username.trim()) config.username = form.username.trim()
    if (form.password) config.password = form.password
    return config
  }
  const config: Record<string, unknown> = {}
  if (form.webhookUrl.trim()) config.webhookUrl = form.webhookUrl.trim()
  if (form.secret.trim()) config.secret = form.secret.trim()
  if (form.type === 'webhook' && form.authorization.trim()) {
    config.authorization = form.authorization.trim()
  }
  if (!isEditing.value && !config.webhookUrl) {
    dialogError.value = t("请填写 Webhook 地址")
    return null
  }
  return Object.keys(config).length ? config : null
}

async function save(): Promise<void> {
  dialogError.value = ''
  if (!form.name.trim()) {
    dialogError.value = t("请填写渠道名称")
    return
  }
  if (isSmtp.value) {
    if (!form.host.trim() || !form.from.trim() || !form.to.trim()) {
      dialogError.value = t("请填写 SMTP 服务器、发件人与至少一个收件人")
      return
    }
  }
  const config = buildConfig()
  if (config === null && !isEditing.value) return
  dialogBusy.value = true
  try {
    if (editing.value) {
      const patch: Record<string, unknown> = {
        name: form.name.trim(),
        enabled: form.enabled,
        eventTypes: form.eventTypes,
      }
      if (config) patch.config = config
      await store.update(editing.value.id, patch)
      toast.success(t("通知渠道已更新"))
    } else {
      await store.create({
        name: form.name.trim(),
        type: form.type,
        enabled: form.enabled,
        eventTypes: form.eventTypes,
        config: config ?? {},
      })
      toast.success(t("通知渠道已创建"))
    }
    dialogOpen.value = false
  } catch (err) {
    dialogError.value = describeError(err)
  } finally {
    dialogBusy.value = false
  }
}

async function toggleEnabled(channel: ChannelView): Promise<void> {
  busyId.value = channel.id
  try {
    await store.update(channel.id, { enabled: !channel.enabled })
    toast.success(channel.enabled ? t("渠道已停用") : t("渠道已启用"))
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    busyId.value = null
  }
}

async function sendTest(channel: ChannelView): Promise<void> {
  busyId.value = channel.id
  testResult.value = { ...testResult.value, [channel.id]: t("发送中…") }
  try {
    const result = await store.test(channel.id)
    const message = result.ok
      ? tf('测试消息发送成功（{latency} ms）', { latency: result.latencyMs })
      : result.httpStatus
        ? tf('测试失败（HTTP {status}）：{error}', {
            status: result.httpStatus,
            error: result.error ?? t('未知错误'),
          })
        : tf('测试失败：{error}', { error: result.error ?? t('未知错误') })
    testResult.value = { ...testResult.value, [channel.id]: message }
    if (result.ok) toast.success(message)
    else toast.error(message)
  } catch (err) {
    const message = describeError(err)
    testResult.value = { ...testResult.value, [channel.id]: message }
    toast.error(message)
  } finally {
    busyId.value = null
  }
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  deleteBusy.value = true
  try {
    await store.remove(target.id)
    toast.success(t("通知渠道已删除"))
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

onMounted(() => {
  void load()
})
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1>{{ $t("通知渠道") }}</h1>
        <p>{{ $t("通过企业微信、飞书、钉钉群机器人、自定义 WebHook 或 SMTP 邮件接收状态变化通知。") }}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" type="button" @click="openCreate">{{ $t("添加渠道") }}</button>
      </div>
    </div>

    <QuotaBar
      v-if="store.quota"
      :used="store.quota.used"
      :limit="store.quota.limit"
      :label='$t("通知渠道配额")'
    />

    <ErrorBanner :message="error" />

    <div v-if="store.loading && store.items.length === 0" class="card">
      <div v-for="index in 3" :key="index" class="skeleton" style="height: 40px; margin-bottom: 8px" />
    </div>

    <EmptyState
      v-else-if="store.items.length === 0"
      :title='$t("还没有通知渠道")'
      :description='$t("配置群机器人、自定义 WebHook 或 SMTP 邮件，状态变化会自动推送。")'
    >
      <button class="btn btn-primary" type="button" style="margin-top: 12px" @click="openCreate"> {{ $t("添加第一个渠道") }} </button>
    </EmptyState>

    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>{{ $t("名称") }}</th>
            <th>{{ $t("类型 / 目标") }}</th>
            <th>{{ $t("事件") }}</th>
            <th>{{ $t("上次测试") }}</th>
            <th>{{ $t("状态") }}</th>
            <th class="right">{{ $t("操作") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="channel in store.items" :key="channel.id">
            <td>
              <div style="font-weight: 500">{{ channel.name }}</div>
              <div v-if="channel.configError" class="field-error small">
                {{ channel.configError }}
              </div>
            </td>
            <td>
              <div class="small">{{ typeLabel(channel.type) }}</div>
              <div class="faint small">{{ configSummary(channel) }}</div>
            </td>
            <td class="small">
              {{ channel.eventTypes.length ? channel.eventTypes.length + $t(" 种") : $t("全部（不含异常）") }}
            </td>
            <td class="small">
              <div v-if="channel.lastTestAt" class="nowrap">
                {{ formatDateTime(channel.lastTestAt, timezone) }}
              </div>
              <span
                v-if="channel.lastTestOk !== null"
                class="badge"
                :class="channel.lastTestOk ? 'badge-green' : 'badge-danger'"
              >
                {{ channel.lastTestOk ? $t("成功") : $t("失败") }}
              </span>
              <span v-else class="faint">{{ $t("未测试") }}</span>
              <div v-if="testResult[channel.id]" class="faint small">{{ testResult[channel.id] }}</div>
            </td>
            <td>
              <span class="badge" :class="channel.enabled ? 'badge-green' : 'badge-neutral'">
                {{ channel.enabled ? $t("已启用") : $t("已停用") }}
              </span>
            </td>
            <td class="right">
              <div class="inline nowrap" style="justify-content: flex-end">
                <button
                  class="btn btn-sm"
                  type="button"
                  :disabled="busyId === channel.id"
                  @click="sendTest(channel)"
                > {{ $t("测试") }} </button>
                <button class="btn btn-sm" type="button" @click="openEdit(channel)">{{ $t("编辑") }}</button>
                <button
                  class="btn btn-sm"
                  type="button"
                  :disabled="busyId === channel.id"
                  @click="toggleEnabled(channel)"
                >
                  {{ channel.enabled ? $t("停用") : $t("启用") }}
                </button>
                <button class="btn btn-sm btn-danger" type="button" @click="deleteTarget = channel"> {{ $t("删除") }} </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal
      v-model:open="dialogOpen"
      :title="isEditing ? $t('编辑通知渠道') : $t('添加通知渠道')"
      width="600px"
    >
      <ErrorBanner :message="dialogError" />
      <form @submit.prevent="save">
        <div class="grid-2">
          <div class="field">
            <label for="ch-name">{{ $t("渠道名称") }}</label>
            <input id="ch-name" v-model="form.name" class="input" required maxlength="64" />
          </div>
          <div class="field">
            <label for="ch-type">{{ $t("类型") }}</label>
            <select id="ch-type" v-model="form.type" class="select" :disabled="isEditing">
              <option v-for="option in CHANNEL_TYPE_OPTIONS" :key="option.value" :value="option.value">
                {{ $t(option.label) }}
              </option>
            </select>
          </div>
        </div>

        <p v-if="channelDocsUrl" class="field-hint" style="margin-top: -6px">
          <a :href="channelDocsUrl" target="_blank" rel="noopener noreferrer"> {{ $t("查看") }} {{ typeLabel(form.type) }} {{ $t("官方接入文档 ↗") }} </a>
        </p>

        <template v-if="isSmtp">
          <div class="grid-2">
            <div class="field">
              <label for="ch-host">{{ $t("SMTP 服务器") }}</label>
              <input id="ch-host" v-model="form.host" class="input" placeholder="smtp.example.com" />
            </div>
            <div class="field">
              <label for="ch-port">{{ $t("端口") }}</label>
              <input id="ch-port" v-model.number="form.port" class="input" type="number" min="1" max="65535" />
            </div>
          </div>
          <div class="grid-2">
            <div class="field">
              <label class="inline">
                <input v-model="form.secure" type="checkbox" /> {{ $t("SSL/TLS（通常 465 端口）") }} </label>
              <label class="inline">
                <input v-model="form.requireTls" type="checkbox" /> {{ $t("强制 STARTTLS") }} </label>
            </div>
            <div class="field">
              <label for="ch-user">{{ $t("用户名（可选）") }}</label>
              <input id="ch-user" v-model="form.username" class="input" autocomplete="off" />
            </div>
          </div>
          <div class="field">
            <label for="ch-pass">{{ $t("密码") }}</label>
            <input
              id="ch-pass"
              v-model="form.password"
              class="input"
              type="password"
              autocomplete="new-password"
            />
            <span v-if="isEditing" class="field-hint">{{ $t("留空表示保留已保存的密码。") }}</span>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="ch-from">{{ $t("发件人") }}</label>
              <input id="ch-from" v-model="form.from" class="input" placeholder="Monitor &lt;monitor@example.com&gt;" />
            </div>
            <div class="field">
              <label for="ch-to">{{ $t("收件人") }}</label>
              <input id="ch-to" v-model="form.to" class="input" :placeholder='$t("多个地址用逗号分隔")' />
            </div>
          </div>
        </template>

        <template v-else>
          <div class="field">
            <label for="ch-webhook">
              {{ form.type === 'webhook' ? $t("WebHook 地址") : $t("机器人 Webhook 地址") }}
            </label>
            <input
              id="ch-webhook"
              v-model="form.webhookUrl"
              class="input"
              :placeholder="isEditing ? $t('留空保留当前 Webhook') : 'https://...'"
            />
            <span class="field-hint">
              {{
                form.type === 'wecom_bot'
                  ? $t("企业微信群机器人 Webhook，支持 markdown 消息。")
                  : form.type === 'feishu_bot'
                    ? $t("飞书自定义机器人 Webhook，请填写签名密钥（如已开启签名校验）。")
                    : form.type === 'dingtalk_bot'
                      ? $t("钉钉自定义机器人 Webhook，请填写加签密钥（如已开启加签）。")
                      : $t("系统会向该地址 POST JSON 事件，支持 HMAC-SHA256 签名和可选 Authorization 头。")
              }}
            </span>
          </div>
          <div v-if="form.type !== 'wecom_bot'" class="field">
            <label for="ch-secret">
              {{ form.type === 'webhook' ? $t("HMAC 签名密钥（可选）") : $t("签名密钥") }}
            </label>
            <input
              id="ch-secret"
              v-model="form.secret"
              class="input"
              type="password"
              autocomplete="new-password"
              :placeholder="isEditing ? $t('留空保留当前密钥') : $t('可选')"
            />
            <span v-if="form.type === 'webhook'" class="field-hint"> {{ $t("设置后，请求头会携带 X-SGM-Timestamp 和 X-SGM-Signature。") }} </span>
          </div>
          <div v-if="form.type === 'webhook'" class="field">
            <label for="ch-authorization">{{ $t("Authorization 头（可选）") }}</label>
            <input
              id="ch-authorization"
              v-model="form.authorization"
              class="input"
              type="password"
              autocomplete="new-password"
              :placeholder="isEditing ? $t('留空保留当前 Authorization') : $t('例如 Bearer <token>')"
            />
            <span class="field-hint"> {{ $t("会原样作为 Authorization 请求头发送，适合需要 Bearer / Basic 认证的接口。") }} </span>
          </div>
        </template>

        <div class="divider" />
        <div class="card-title">
          <span class="label">{{ $t("订阅事件") }}</span>
          <div class="inline">
            <button class="btn-link small" type="button" @click="selectAllEvents">{{ $t("全选默认") }}</button>
            <button class="btn-link small" type="button" @click="form.eventTypes = []">{{ $t("清空") }}</button>
          </div>
        </div>
        <p class="small faint">{{ $t("不选择任何事件表示接收除“检查异常”外的全部事件。") }}</p>
        <div class="grid-3">
          <label v-for="option in EVENT_TYPE_OPTIONS" :key="option.value" class="inline small">
            <input
              type="checkbox"
              :checked="form.eventTypes.includes(option.value)"
              @change="toggleEventType(option.value, ($event.target as HTMLInputElement).checked)"
            />
            {{ $t(option.label) }}
          </label>
        </div>

        <div class="divider" />
        <label class="inline">
          <input v-model="form.enabled" type="checkbox" /> {{ $t("启用该渠道") }} </label>

        <div class="inline" style="justify-content: flex-end; margin-top: 16px">
          <button class="btn" type="button" @click="dialogOpen = false">{{ $t("取消") }}</button>
          <button class="btn btn-primary" type="submit" :disabled="dialogBusy">
            {{ dialogBusy ? $t("保存中…") : $t("保存") }}
          </button>
        </div>
      </form>
    </Modal>

    <ConfirmDialog
      :open="deleteTarget !== null"
      :title='$t("删除通知渠道")'
      :message="$tf('确定删除「{name}」吗？未发送的通知会被取消。', { name: deleteTarget?.name ?? '' })"
      :confirm-text='$t("删除")'
      danger
      :busy="deleteBusy"
      @update:open="deleteTarget = null"
      @confirm="confirmDelete"
    />
  </div>
</template>
