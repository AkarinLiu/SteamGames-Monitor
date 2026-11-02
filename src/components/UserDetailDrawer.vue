<script setup lang="ts">
import { t, tf } from '@/i18n'

import { computed, ref, watch } from 'vue'
import type { AdminUserSummary } from '@shared/types'
import { api, describeError } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { formatDateTime, formatRelative } from '@/lib/format'
import Drawer from '@/components/AppDrawer.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'

interface LoginRow {
  id: number
  user_id: number | null
  username: string
  ip: string | null
  user_agent: string | null
  success: number
  reason: string | null
  created_at: number
}

interface AuditRow {
  id: number
  actor_user_id: number | null
  action: string
  target: string | null
  detail_json: string
  ip: string | null
  created_at: number
}

interface LoginPage {
  items: LoginRow[]
  total: number
}

interface AuditPage {
  items: AuditRow[]
  total: number
}

const props = defineProps<{
  target: AdminUserSummary | null
}>()
const emit = defineEmits<{ 'update:target': [AdminUserSummary | null] }>()

const session = useSessionStore()
const timezone = session.user?.timezone ?? 'UTC'

const open = computed({
  get: () => props.target !== null,
  set: (value: boolean) => emit('update:target', value ? props.target : null),
})

const logins = ref<LoginRow[]>([])
const audits = ref<AuditRow[]>([])
const loginsError = ref('')
const auditsError = ref('')
const loginsLoading = ref(false)
const auditsLoading = ref(false)

function describeLoginReason(reason: string | null): string {
  if (!reason) return ''
  const map: Record<string, string> = {
    user_not_found: t('用户不存在'),
    password_wrong: t('密码错误'),
    user_disabled: t('账号已禁用'),
    throttled: t('请求过于频繁'),
  }
  return map[reason] ?? reason
}

function describeAuditAction(action: string): string {
  const map: Record<string, string> = {
    'admin.user_create': t('创建用户'),
    'admin.user_update': t('编辑用户'),
    'admin.user_reset_password': t('重置密码'),
    'admin.user_delete': t('删除用户'),
    'admin.settings_update': t('更新系统设置'),
    'admin.batch': t('批量操作'),
    'auth.login': t('登录成功'),
    'auth.login_failed': t('登录失败'),
  }
  return map[action] ?? action
}

function safeParseDetail(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    return {}
  } catch {
    return {}
  }
}

async function loadLogins(userId: number): Promise<void> {
  loginsLoading.value = true
  loginsError.value = ''
  try {
    const result = await api.get<LoginPage>(`/admin/users/${userId}/logins?limit=10`)
    logins.value = result.items
  } catch (err) {
    loginsError.value = describeError(err)
    logins.value = []
  } finally {
    loginsLoading.value = false
  }
}

async function loadAudits(userId: number): Promise<void> {
  auditsLoading.value = true
  auditsError.value = ''
  try {
    const params = new URLSearchParams({ target: `user:${userId}`, limit: '15' })
    const result = await api.get<AuditPage>(`/admin/audit?${params.toString()}`)
    audits.value = result.items
  } catch (err) {
    auditsError.value = describeError(err)
    audits.value = []
  } finally {
    auditsLoading.value = false
  }
}

watch(
  () => props.target,
  (next) => {
    if (next) {
      void loadLogins(next.id)
      void loadAudits(next.id)
    } else {
      logins.value = []
      audits.value = []
    }
  },
)
</script>

<template>
  <Drawer v-model:open="open" :title='target ? target.displayName : ""'>
    <template v-if="target">
      <section class="section">
        <h3 class="section-title">{{ $t("基础信息") }}</h3>
        <dl class="kv">
          <div>
            <dt>{{ $t("用户名") }}</dt>
            <dd class="mono">@{{ target.username }}</dd>
          </div>
          <div>
            <dt>{{ $t("角色") }}</dt>
            <dd>
              <span class="badge" :class="target.role === 'admin' ? 'badge-accent' : 'badge-neutral'">
                {{ target.role === 'admin' ? $t("管理员") : $t("普通用户") }}
              </span>
            </dd>
          </div>
          <div>
            <dt>{{ $t("状态") }}</dt>
            <dd>
              <span class="badge" :class="target.status === 'active' ? 'badge-green' : 'badge-danger'">
                {{ target.status === 'active' ? $t("启用") : $t("禁用") }}
              </span>
            </dd>
          </div>
          <div>
            <dt>{{ $t("区域") }}</dt>
            <dd>{{ target.region ? target.region.toUpperCase() : $t("未设置") }}</dd>
          </div>
          <div>
            <dt>{{ $t("语言") }}</dt>
            <dd>{{ target.language ?? $t("未设置") }}</dd>
          </div>
          <div>
            <dt>{{ $t("时区") }}</dt>
            <dd>{{ target.timezone ?? $t("未设置") }}</dd>
          </div>
          <div>
            <dt>{{ $t("监控项配额") }}</dt>
            <dd>{{ tf("{used} / {max}", { used: target.monitorCount, max: target.maxMonitors }) }}</dd>
          </div>
          <div>
            <dt>{{ $t("通知渠道") }}</dt>
            <dd>{{ target.channelCount }}</dd>
          </div>
          <div>
            <dt>{{ $t("指令机器人") }}</dt>
            <dd>{{ target.botCount }}</dd>
          </div>
          <div>
            <dt>{{ $t("活跃会话") }}</dt>
            <dd>{{ target.activeSessions }}</dd>
          </div>
          <div>
            <dt>{{ $t("创建时间") }}</dt>
            <dd>{{ formatDateTime(target.createdAt, timezone) }}</dd>
          </div>
          <div>
            <dt>{{ $t("上次登录") }}</dt>
            <dd>
              <span v-if="target.lastLoginAt">{{ formatRelative(target.lastLoginAt) }}</span>
              <span v-else class="faint">{{ $t("从未登录") }}</span>
            </dd>
          </div>
          <div>
            <dt>{{ $t("初始设置") }}</dt>
            <dd>
              <span v-if="target.onboardedAt" class="badge badge-green">{{ $t("已完成") }}</span>
              <span v-else class="badge badge-warning">{{ $t("未完成") }}</span>
            </dd>
          </div>
          <div>
            <dt>{{ $t("待改密") }}</dt>
            <dd>
              <span v-if="target.mustChangePassword" class="badge badge-warning">{{ $t("是") }}</span>
              <span v-else class="badge badge-neutral">{{ $t("否") }}</span>
            </dd>
          </div>
        </dl>
      </section>

      <section class="section">
        <h3 class="section-title">{{ $t("最近登录") }}</h3>
        <ErrorBanner v-if="loginsError" :message="loginsError" />
        <div v-if="loginsLoading && logins.length === 0" class="skeleton-block">
          <div v-for="index in 3" :key="index" class="skeleton" style="height: 24px; margin-bottom: 6px" />
        </div>
        <div v-else-if="logins.length === 0" class="empty-hint">{{ $t("暂无登录记录") }}</div>
        <ul v-else class="timeline">
          <li v-for="row in logins" :key="row.id" class="timeline-item">
            <div class="timeline-main">
              <span class="badge" :class="row.success ? 'badge-green' : 'badge-danger'">
                {{ row.success ? $t("成功") : $t("失败") }}
              </span>
              <span v-if="!row.success && row.reason" class="faint small">
                · {{ describeLoginReason(row.reason) }}
              </span>
            </div>
            <div class="timeline-meta small">
              <span>{{ formatDateTime(row.created_at, timezone) }}</span>
              <span v-if="row.ip" class="faint">· {{ row.ip }}</span>
            </div>
            <div v-if="row.user_agent" class="faint small mono ua">{{ row.user_agent }}</div>
          </li>
        </ul>
      </section>

      <section class="section">
        <h3 class="section-title">{{ $t("相关审计") }}</h3>
        <ErrorBanner v-if="auditsError" :message="auditsError" />
        <div v-if="auditsLoading && audits.length === 0" class="skeleton-block">
          <div v-for="index in 3" :key="index" class="skeleton" style="height: 24px; margin-bottom: 6px" />
        </div>
        <div v-else-if="audits.length === 0" class="empty-hint">{{ $t("暂无审计记录") }}</div>
        <ul v-else class="timeline">
          <li v-for="row in audits" :key="row.id" class="timeline-item">
            <div class="timeline-main">
              <span class="badge badge-neutral">{{ describeAuditAction(row.action) }}</span>
              <span v-if="row.actor_user_id !== target.id" class="faint small">
                · {{ $t("操作者") }} #{{ row.actor_user_id ?? $t("系统") }}
              </span>
            </div>
            <div class="timeline-meta small">
              <span>{{ formatDateTime(row.created_at, timezone) }}</span>
              <span v-if="row.ip" class="faint">· {{ row.ip }}</span>
            </div>
            <details v-if="Object.keys(safeParseDetail(row.detail_json)).length > 0" class="small">
              <summary class="faint">{{ $t("详情") }}</summary>
              <pre class="detail-pre">{{ JSON.stringify(safeParseDetail(row.detail_json), null, 2) }}</pre>
            </details>
          </li>
        </ul>
      </section>
    </template>
  </Drawer>
</template>

<style scoped>
.section {
  margin-bottom: 24px;
}
.section:last-child {
  margin-bottom: 0;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted, #8a8f98);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0 0 12px;
}
.kv {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin: 0;
}
.kv > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kv dt {
  font-size: 12px;
  color: var(--color-text-muted, #8a8f98);
}
.kv dd {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-strong, #e6e8ee);
}
.timeline {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.timeline-item {
  padding: 10px 12px;
  background: var(--color-surface-2, #1a1d24);
  border-radius: 8px;
  border: 1px solid var(--color-border, #23262d);
}
.timeline-main {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.timeline-meta {
  display: flex;
  gap: 8px;
  color: var(--color-text-muted, #8a8f98);
}
.ua {
  margin-top: 4px;
  word-break: break-all;
}
.empty-hint {
  text-align: center;
  padding: 16px;
  color: var(--color-text-muted, #8a8f98);
  background: var(--color-surface-2, #1a1d24);
  border-radius: 8px;
}
.skeleton-block {
  padding: 8px;
}
.detail-pre {
  margin: 6px 0 0;
  padding: 6px 8px;
  background: var(--color-surface, #0f1115);
  border-radius: 4px;
  font-size: 11px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
