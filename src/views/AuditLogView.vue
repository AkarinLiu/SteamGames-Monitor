<script setup lang="ts">
import { t, tf } from '@/i18n'

import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, describeError } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { formatDateTime, formatRelative } from '@/lib/format'
import ErrorBanner from '@/components/ErrorBanner.vue'

interface AuditRow {
  id: number
  actor_user_id: number | null
  action: string
  target: string | null
  detail_json: string
  ip: string | null
  created_at: number
}

interface AuditActor {
  id: number
  username: string
  displayName: string
}

interface AuditPage {
  items: AuditRow[]
  total: number
  offset: number
  limit: number
}

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const timezone = session.user?.timezone ?? 'UTC'

const loading = ref(false)
const error = ref('')
const rows = ref<AuditRow[]>([])
const total = ref(0)
const actions = ref<string[]>([])
const actors = ref<AuditActor[]>([])

const PAGE_SIZE = 50

const filter = reactive({
  action: '',
  actorUserId: '' as string | number,
  target: '',
  since: '',
  until: '',
  offset: 0,
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const currentPage = computed(() => Math.floor(filter.offset / PAGE_SIZE) + 1)

function parseTimeInput(value: string): number | undefined {
  if (!value) return undefined
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed.getTime()
}

function syncFromQuery(): void {
  const q = route.query
  filter.action = typeof q.action === 'string' ? q.action : ''
  filter.actorUserId = typeof q.actor === 'string' ? q.actor : ''
  filter.target = typeof q.target === 'string' ? q.target : ''
  filter.since = typeof q.since === 'string' ? q.since : ''
  filter.until = typeof q.until === 'string' ? q.until : ''
  filter.offset = typeof q.offset === 'string' ? Number(q.offset) || 0 : 0
}

function writeQuery(): void {
  const query: Record<string, string> = {}
  if (filter.action) query.action = filter.action
  if (filter.actorUserId !== '' && filter.actorUserId !== null) query.actor = String(filter.actorUserId)
  if (filter.target) query.target = filter.target
  if (filter.since) query.since = filter.since
  if (filter.until) query.until = filter.until
  if (filter.offset > 0) query.offset = String(filter.offset)
  void router.replace({ query })
}

function safeParseDetail(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

function describeAction(action: string): string {
  const map: Record<string, string> = {
    'admin.user_create': t('创建用户'),
    'admin.user_update': t('编辑用户'),
    'admin.user_reset_password': t('重置密码'),
    'admin.user_delete': t('删除用户'),
    'admin.settings_update': t('更新系统设置'),
    'admin.batch': t('批量操作'),
  }
  return map[action] ?? action
}

function actorLabel(actorId: number | null): string {
  if (actorId === null) return t('系统')
  const actor = actors.value.find((item) => item.id === actorId)
  if (actor) return actor.displayName
  return `#${actorId}`
}

async function loadFacets(): Promise<void> {
  try {
    const result = await api.get<{ actions: string[]; actors: AuditActor[] }>('/admin/audit/facets')
    actions.value = result.actions
    actors.value = result.actors
  } catch {
    // 非致命：筛选器降级为空
    actions.value = []
    actors.value = []
  }
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(filter.offset),
    })
    if (filter.action) params.set('actions', filter.action)
    if (filter.actorUserId !== '' && filter.actorUserId !== null) {
      params.set('actorUserId', String(filter.actorUserId))
    }
    if (filter.target) params.set('target', filter.target)
    const since = parseTimeInput(filter.since)
    const until = parseTimeInput(filter.until)
    if (since !== undefined) params.set('since', String(since))
    if (until !== undefined) params.set('until', String(until))
    const result = await api.get<AuditPage>(`/admin/audit?${params.toString()}`)
    rows.value = result.items
    total.value = result.total
  } catch (err) {
    error.value = describeError(err)
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function resetOffsetAndLoad(): void {
  filter.offset = 0
  writeQuery()
  void load()
}

function goToPage(page: number): void {
  const clamped = Math.max(1, Math.min(page, totalPages.value))
  filter.offset = (clamped - 1) * PAGE_SIZE
  writeQuery()
  void load()
}

function clearFilters(): void {
  filter.action = ''
  filter.actorUserId = ''
  filter.target = ''
  filter.since = ''
  filter.until = ''
  filter.offset = 0
  writeQuery()
  void load()
}

onMounted(() => {
  syncFromQuery()
  void loadFacets()
  void load()
})

watch(
  () => route.fullPath,
  () => {
    syncFromQuery()
    void load()
  },
)
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1>{{ $t("审计日志") }}</h1>
        <p>{{ $t("记录管理员在系统内的关键操作，便于追溯与排障。") }}</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" :disabled="loading" @click="load()">
          {{ loading ? $t("刷新中…") : $t("刷新") }}
        </button>
      </div>
    </div>

    <ErrorBanner :message="error" />

    <div class="card filter-bar">
      <div class="field">
        <label for="f-action">{{ $t("操作类型") }}</label>
        <select id="f-action" v-model="filter.action" class="select" @change="resetOffsetAndLoad">
          <option value="">{{ $t("全部") }}</option>
          <option v-for="action in actions" :key="action" :value="action">
            {{ describeAction(action) }}
          </option>
        </select>
      </div>
      <div class="field">
        <label for="f-actor">{{ $t("操作者") }}</label>
        <select id="f-actor" v-model="filter.actorUserId" class="select" @change="resetOffsetAndLoad">
          <option value="">{{ $t("全部") }}</option>
          <option v-for="actor in actors" :key="actor.id" :value="actor.id">
            {{ actor.displayName }} (@{{ actor.username }})
          </option>
        </select>
      </div>
      <div class="field">
        <label for="f-target">{{ $t("目标") }}</label>
        <input
          id="f-target"
          v-model="filter.target"
          class="input"
          :placeholder='$t("例如 user:12 或 user:*")'
          @keydown.enter.prevent="resetOffsetAndLoad"
        />
      </div>
      <div class="field">
        <label for="f-since">{{ $t("起始时间") }}</label>
        <input id="f-since" v-model="filter.since" class="input" type="datetime-local" @change="resetOffsetAndLoad" />
      </div>
      <div class="field">
        <label for="f-until">{{ $t("结束时间") }}</label>
        <input id="f-until" v-model="filter.until" class="input" type="datetime-local" @change="resetOffsetAndLoad" />
      </div>
      <div class="field filter-actions">
        <label class="invisible">{{ $t("操作") }}</label>
        <button class="btn" type="button" @click="clearFilters">{{ $t("清除筛选") }}</button>
      </div>
    </div>

    <div v-if="loading && rows.length === 0" class="card">
      <div v-for="index in 5" :key="index" class="skeleton" style="height: 32px; margin-bottom: 8px" />
    </div>

    <div v-else-if="rows.length === 0" class="card empty">
      <p>{{ $t("没有符合条件的审计记录。") }}</p>
    </div>

    <div v-else class="table-wrap">
      <table class="table audit-table">
        <thead>
          <tr>
            <th class="col-time">{{ $t("时间") }}</th>
            <th class="col-actor">{{ $t("操作者") }}</th>
            <th class="col-action">{{ $t("动作") }}</th>
            <th class="col-target">{{ $t("目标") }}</th>
            <th class="col-ip">{{ $t("IP") }}</th>
            <th class="col-detail">{{ $t("详情") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td class="col-time">
              <div>{{ formatRelative(row.created_at) }}</div>
              <div class="faint small">{{ formatDateTime(row.created_at, timezone) }}</div>
            </td>
            <td class="col-actor">{{ actorLabel(row.actor_user_id) }}</td>
            <td class="col-action">
              <span class="badge badge-neutral">{{ describeAction(row.action) }}</span>
            </td>
            <td class="col-target small mono">{{ row.target ?? '—' }}</td>
            <td class="col-ip small mono">{{ row.ip ?? '—' }}</td>
            <td class="col-detail">
              <details>
                <summary class="faint small">{{ $t("展开") }}</summary>
                <pre class="detail-pre">{{ JSON.stringify(safeParseDetail(row.detail_json), null, 2) }}</pre>
              </details>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="total > 0" class="pager">
      <span class="faint small">
        {{ tf("共 {total} 条，第 {page} / {pages} 页", { total, page: currentPage, pages: totalPages }) }}
      </span>
      <div class="inline pager-buttons">
        <button class="btn btn-sm" type="button" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">
          {{ $t("上一页") }}
        </button>
        <button
          class="btn btn-sm"
          type="button"
          :disabled="currentPage >= totalPages"
          @click="goToPage(currentPage + 1)"
        >
          {{ $t("下一页") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.filter-bar .field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.filter-bar label {
  font-size: 12px;
  color: var(--color-text-muted, #8a8f98);
}
.filter.actions {
  justify-content: flex-end;
}
.invisible {
  visibility: hidden;
}
.filter-bar .filter-actions {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.audit-table .col-time {
  width: 170px;
}
.audit-table .col-actor {
  width: 140px;
}
.audit-table .col-action {
  width: 140px;
}
.audit-table .col-target {
  width: 160px;
}
.audit-table .col-ip {
  width: 130px;
}
.detail-pre {
  margin: 8px 0 0;
  padding: 8px;
  background: var(--color-surface-2, #1a1d24);
  border-radius: 6px;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.empty {
  text-align: center;
  padding: 32px;
  color: var(--color-text-muted, #8a8f98);
}
.pager {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  gap: 12px;
  flex-wrap: wrap;
}
.pager-buttons {
  gap: 8px;
}
</style>
