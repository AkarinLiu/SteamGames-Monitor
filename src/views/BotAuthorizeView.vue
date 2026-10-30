<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { BotAccessRole, BotAuthRequestInfo } from '@shared/types'
import { BOT_PLATFORM_OPTIONS } from '@shared/constants'
import { api, describeError } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import { formatDateTime } from '@/lib/format'
import ErrorBanner from '@/components/ErrorBanner.vue'

const route = useRoute()
const session = useSessionStore()
const toast = useToastStore()

const info = ref<BotAuthRequestInfo | null>(null)
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const role = ref<BotAccessRole>('viewer')

const token = computed(() => {
  const value = route.params.token
  if (Array.isArray(value)) return value[0] ?? ''
  return typeof value === 'string' ? value : ''
})
const timezone = computed(() => session.user?.timezone ?? 'UTC')
const platformLabel = computed(
  () =>
    BOT_PLATFORM_OPTIONS.find((option) => option.value === info.value?.platform)?.label ??
    info.value?.platform ??
    '',
)
const showForm = computed(
  () => info.value?.status === 'pending' && info.value.canApprove,
)

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const result = await api.get<BotAuthRequestInfo>(
      `/bot-auth/${encodeURIComponent(token.value)}`,
    )
    info.value = result
    if (result.status === 'approved' && result.role) role.value = result.role
  } catch (err) {
    error.value = describeError(err)
  } finally {
    loading.value = false
  }
}

async function approve(): Promise<void> {
  if (!info.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await api.post<BotAuthRequestInfo>(
      `/bot-auth/${encodeURIComponent(token.value)}/approve`,
      { role: role.value },
    )
    info.value = result
    if (result.role) role.value = result.role
    toast.success('授权已批准')
  } catch (err) {
    error.value = describeError(err)
  } finally {
    busy.value = false
  }
}

async function deny(): Promise<void> {
  if (!info.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await api.post<BotAuthRequestInfo>(
      `/bot-auth/${encodeURIComponent(token.value)}/deny`,
      {},
    )
    info.value = result
    toast.success('已拒绝该授权请求')
  } catch (err) {
    error.value = describeError(err)
  } finally {
    busy.value = false
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
        <h1>机器人授权</h1>
        <p>确认平台用户使用指令机器人的权限。</p>
      </div>
      <div class="page-actions">
        <RouterLink :to="{ name: 'bots' }" class="btn">返回指令机器人</RouterLink>
      </div>
    </div>

    <ErrorBanner :message="error" />

    <div v-if="loading" class="card">正在加载授权请求…</div>

    <div v-else-if="info" class="detail-grid">
      <div class="stack">
        <section class="card">
          <div class="card-title">
            <h2>{{ info.botName }}</h2>
            <span class="badge badge-accent">{{ platformLabel }}</span>
          </div>

          <div v-if="showForm" class="banner banner-info">
            你正在处理一个指令机器人访问请求，请确认平台用户身份后选择权限。
          </div>
          <div v-else-if="info.status === 'pending'" class="banner banner-warning">
            只有机器人所有者可以处理此请求。请将当前链接转发给机器人所有者。
          </div>
          <div v-else-if="info.status === 'approved'" class="banner banner-info">
            已批准该用户使用机器人（{{ info.role === 'admin' ? '管理员' : '只读' }}）。
          </div>
          <div v-else-if="info.status === 'denied'" class="banner banner-warning">
            该授权请求已被拒绝。
          </div>
          <div v-else class="banner banner-warning">
            该授权链接已过期。请让用户在聊天中重新发送指令。
          </div>

          <div class="table-wrap" style="margin-top: 12px">
            <table class="table">
              <tbody>
                <tr>
                  <th>平台</th>
                  <td>{{ platformLabel }}</td>
                </tr>
                <tr>
                  <th>平台用户 ID</th>
                  <td class="mono">{{ info.platformUserId }}</td>
                </tr>
                <tr v-if="info.platformUserName">
                  <th>昵称</th>
                  <td>{{ info.platformUserName }}</td>
                </tr>
                <tr v-if="info.chatId">
                  <th>会话</th>
                  <td class="mono small">{{ info.chatId }}</td>
                </tr>
                <tr>
                  <th>创建时间</th>
                  <td>{{ formatDateTime(info.createdAt, timezone) }}</td>
                </tr>
                <tr>
                  <th>有效期至</th>
                  <td>{{ formatDateTime(info.expiresAt, timezone) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-if="showForm" class="card">
          <h2>授权设置</h2>
          <div class="field">
            <label for="auth-role">角色</label>
            <select id="auth-role" v-model="role" class="select">
              <option value="viewer">只读（/help、/list、/price、/events）</option>
              <option value="admin">管理员（可使用全部指令）</option>
            </select>
            <span class="field-hint">指令始终作用于机器人所属账号的数据；所有者自用建议选择管理员。</span>
          </div>
          <div class="inline">
            <button class="btn btn-primary" type="button" :disabled="busy" @click="approve">
              {{ busy ? '处理中…' : '批准授权' }}
            </button>
            <button class="btn btn-danger" type="button" :disabled="busy" @click="deny">
              拒绝
            </button>
          </div>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-title">
            <h2>说明</h2>
          </div>
          <p class="small muted">
            批准后，该平台用户可以在聊天中使用机器人指令。只读角色仅能查询；管理员可以添加、删除、暂停监控项。
          </p>
          <p class="small faint">
            授权链接 30 分钟内有效。若链接过期，请让用户重新发送任意指令生成新链接。
          </p>
          <p class="small faint">
            扫码时识别的所有者 ID 仅用于标识；所有平台用户（包括所有者）都需要在本页面批准自己的平台账号，或由管理员在「指令机器人」页面加入允许名单后才能使用指令。
          </p>
        </section>
      </div>
    </div>

    <div v-else class="card">
      <h2>无法加载授权请求</h2>
      <p class="small muted">链接可能已失效，请让用户在聊天中重新发送指令。</p>
      <RouterLink :to="{ name: 'bots' }" class="btn" style="margin-top: 12px">
        返回指令机器人
      </RouterLink>
    </div>
  </div>
</template>
