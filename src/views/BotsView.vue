<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { BotAccessRole, BotPlatform } from '@shared/types'
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
  apiBaseUrl: '',
  ownerPlatformUserId: '',
  appId: '',
  appSecret: '',
  encryptKey: '',
  verificationToken: '',
  robotCode: '',
  botId: '',
  secret: '',
})

const deleteTarget = ref<BotView | null>(null)
const deleteBusy = ref(false)

const drafts = reactive<Record<number, AllowDraft>>({})
const inboundTexts = reactive<Record<number, string>>({})
const inboundResults = reactive<Record<number, string>>({})
const inboundBusy = ref<number | null>(null)

const isEditing = computed(() => editing.value !== null)

const BOT_DOCS: Record<BotPlatform, string> = {
  feishu:
    'https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case',
  dingtalk: 'https://open.dingtalk.com/document/orgapp/receive-message',
  wecom: 'https://developer.work.weixin.qq.com/document/path/101463',
}

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

const botDocsUrl = computed(() => BOT_DOCS[form.platform])

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
  form.apiBaseUrl = ''
  form.ownerPlatformUserId = ''
  form.appId = ''
  form.appSecret = ''
  form.encryptKey = ''
  form.verificationToken = ''
  form.robotCode = ''
  form.botId = ''
  form.secret = ''
  dialogError.value = ''
}

function openCreate(): void {
  editing.value = null
  resetForm()
  dialogOpen.value = true
}

function openEdit(bot: BotView): void {
  editing.value = bot
  resetForm()
  form.platform = bot.platform
  form.name = bot.name
  form.enabled = bot.enabled
  form.apiBaseUrl = bot.apiBaseUrl ?? ''
  const config = bot.config
  form.ownerPlatformUserId =
    typeof config.ownerPlatformUserId === 'string' ? config.ownerPlatformUserId : ''
  if (bot.platform === 'feishu') {
    form.appId = typeof config.appId === 'string' ? config.appId : ''
  } else if (bot.platform === 'dingtalk') {
    form.robotCode = typeof config.robotCode === 'string' ? config.robotCode : ''
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
  } else if (form.platform === 'dingtalk') {
    if (form.appSecret.trim()) config.appSecret = form.appSecret.trim()
    if (form.robotCode.trim()) config.robotCode = form.robotCode.trim()
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
  dialogBusy.value = true
  try {
    const apiBaseUrl =
      form.platform === 'wecom' ? null : form.apiBaseUrl.trim() || null
    if (editing.value) {
      const patch: Record<string, unknown> = {
        name: form.name.trim(),
        enabled: form.enabled,
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
    if (store.items.some((bot) => bot.platform === 'wecom' && bot.enabled)) {
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
        <p>接入飞书、钉钉或企业微信智能机器人，在聊天中用斜杠指令管理监控项。</p>
      </div>
      <div class="page-actions">
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
      description="飞书、钉钉填写回调地址，企业微信填写 Bot ID / Secret 后自动建立长连接，即可在聊天中使用 /add、/list 等指令。"
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
            <span
              v-if="bot.platform === 'wecom' && bot.connection"
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
              @click="toggleEnabled(bot)"
            >
              {{ bot.enabled ? '停用' : '启用' }}
            </button>
            <button class="btn btn-sm btn-danger" type="button" @click="deleteTarget = bot">
              删除
            </button>
          </div>
        </div>

        <div v-if="bot.platform !== 'wecom' && bot.callbackUrl" class="field">
          <span class="label">回调地址（填入平台后台）</span>
          <div class="inline" style="flex-wrap: nowrap">
            <input class="input flex-1 mono small" :value="bot.callbackUrl" readonly />
            <CopyButton :value="bot.callbackUrl" />
          </div>
        </div>

        <div
          v-else-if="bot.platform === 'wecom'"
          class="banner"
          :class="bot.connection?.state === 'error' ? 'banner-error' : 'banner-info'"
        >
          长连接模式：无需公网回调地址，服务启动后主动连接企业微信。{{ bot.connection?.message ?? '' }}
        </div>

        <div v-if="bot.platform === 'wecom' && !bot.config.botId" class="banner banner-warning">
          尚未配置 Bot ID / Secret，长连接不会建立。请编辑机器人并填写企业微信智能机器人凭据。
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
              机器人所有者隐式拥有管理员权限。其他平台用户需加入允许名单才能使用指令；viewer 只能查询。
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
          <label for="bot-owner">所有者平台用户 ID</label>
          <input
            id="bot-owner"
            v-model="form.ownerPlatformUserId"
            class="input mono"
            placeholder="例如飞书 open_id / 钉钉 staffId / 企微 UserID"
          />
          <span class="field-hint">机器人的指令始终作用于你的账号数据；所有者无需加入允许名单。</span>
        </div>

        <template v-if="form.platform === 'feishu'">
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
          <div class="grid-2">
            <div class="field">
              <label for="bot-encrypt">Encrypt Key</label>
              <input id="bot-encrypt" v-model="form.encryptKey" class="input" type="password" autocomplete="new-password" :placeholder="isEditing ? '留空保留已保存值' : ''" />
            </div>
            <div class="field">
              <label for="bot-verify">Verification Token</label>
              <input id="bot-verify" v-model="form.verificationToken" class="input" type="password" autocomplete="new-password" :placeholder="isEditing ? '留空保留已保存值' : ''" />
            </div>
          </div>
        </template>

        <template v-else-if="form.platform === 'dingtalk'">
          <div class="grid-2">
            <div class="field">
              <label for="bot-ding-secret">App Secret</label>
              <input id="bot-ding-secret" v-model="form.appSecret" class="input" type="password" autocomplete="new-password" :placeholder="isEditing ? '留空保留已保存值' : ''" />
              <span class="field-hint">用于校验 Outgoing 回调签名。</span>
            </div>
            <div class="field">
              <label for="bot-robotcode">Robot Code</label>
              <input id="bot-robotcode" v-model="form.robotCode" class="input mono" />
            </div>
          </div>
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
  </div>
</template>
