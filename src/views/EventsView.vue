<script setup lang="ts">
import { tf } from '@/i18n'
import { onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { Monitor } from '@shared/types'
import { EVENT_TYPE_OPTIONS } from '@shared/constants'
import { api, describeError } from '@/api/client'
import { useEventsStore } from '@/stores/events'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import { eventBadge, eventLabel, formatDateTime, formatRelative } from '@/lib/format'
import { eventSummary, newsUrlOf } from '@/lib/events'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import Pagination from '@/components/Pagination.vue'

const store = useEventsStore()
const session = useSessionStore()
const toast = useToastStore()

const timezone = session.user?.timezone ?? 'UTC'
const filters = reactive({ type: '', range: '7', monitorId: '' })
const monitors = ref<Monitor[]>([])
const page = ref(1)
const error = ref('')
const busyId = ref<number | null>(null)

async function loadMonitors(): Promise<void> {
  try {
    const result = await api.get<{ items: Monitor[] }>('/monitors?page=1&pageSize=100')
    monitors.value = result.items
  } catch {
    monitors.value = []
  }
}

function rangeStart(): number | undefined {
  const days = Number(filters.range)
  if (!days) return undefined
  return Date.now() - days * 24 * 60 * 60 * 1000
}

async function load(): Promise<void> {
  error.value = ''
  try {
    await store.fetchList({
      type: filters.type || undefined,
      monitorId: filters.monitorId ? Number(filters.monitorId) : undefined,
      from: rangeStart(),
      page: page.value,
    })
  } catch (err) {
    error.value = describeError(err)
  }
}

function applyFilters(): void {
  page.value = 1
  void load()
}

function changePage(next: number): void {
  page.value = next
  void load()
}

async function redeliver(eventId: number): Promise<void> {
  busyId.value = eventId
  try {
    const count = await store.redeliver(eventId)
    toast.success(tf('已重新排队 {count} 条失败投递', { count }))
    await load()
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    busyId.value = null
  }
}

onMounted(() => {
  void loadMonitors()
  void load()
})
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1>{{ $t("事件记录") }}</h1>
        <p>{{ $t("发售、促销、价格、下架与检查异常的历史记录及通知投递状态。") }}</p>
      </div>
    </div>

    <ErrorBanner :message="error" />

    <form class="toolbar" @submit.prevent="applyFilters">
      <select v-model="filters.type" class="select" :aria-label='$t("事件类型")' @change="applyFilters">
        <option value="">{{ $t("全部类型") }}</option>
        <option v-for="option in EVENT_TYPE_OPTIONS" :key="option.value" :value="option.value">
          {{ $t(option.label) }}
        </option>
      </select>
      <select v-model="filters.monitorId" class="select" :aria-label='$t("监控项")' @change="applyFilters">
        <option value="">{{ $t("全部监控项") }}</option>
        <option v-for="monitor in monitors" :key="monitor.id" :value="String(monitor.id)">
          {{ monitor.name }}
        </option>
      </select>
      <select v-model="filters.range" class="select" :aria-label='$t("时间范围")' @change="applyFilters">
        <option value="1">{{ $t("最近 24 小时") }}</option>
        <option value="7">{{ $t("最近 7 天") }}</option>
        <option value="30">{{ $t("最近 30 天") }}</option>
        <option value="0">{{ $t("全部时间") }}</option>
      </select>
      <button class="btn" type="submit">{{ $t("筛选") }}</button>
      <div class="flex-1" />
      <span class="small faint">{{ store.total }} {{ $t("条事件") }}</span>
    </form>

    <div v-if="store.loading && store.items.length === 0" class="card">
      <div v-for="index in 4" :key="index" class="skeleton" style="height: 58px; margin-bottom: 8px" />
    </div>

    <EmptyState
      v-else-if="store.items.length === 0"
      :title='$t("暂无事件")'
      :description='$t("当监控项出现发售、促销、下架等状态变化时会记录在这里。")'
    />

    <div v-else class="stack">
      <article v-for="event in store.items" :key="event.id" class="card event-card">
        <div class="inline" style="justify-content: space-between; align-items: flex-start">
          <div class="inline">
            <StatusBadge :label="eventLabel(event.type)" :tone="eventBadge(event.type)" />
            <RouterLink
              :to="{ name: 'monitor-detail', params: { id: event.monitorId } }"
              style="font-weight: 500"
            >
              {{ event.monitorName }}
            </RouterLink>
            <span class="faint mono small">{{ event.appid }}</span>
            <span v-if="event.monitorKind === 'dlc'" class="badge badge-neutral">DLC</span>
          </div>
          <div class="right small faint nowrap">
            <div>{{ formatDateTime(event.createdAt, timezone) }}</div>
            <div>{{ formatRelative(event.createdAt) }}</div>
          </div>
        </div>

        <p class="small muted" style="margin: 8px 0">
          {{ eventSummary(event.type, event.payload) }}
          <a
            v-if="event.type === 'delisting_warning' && newsUrlOf(event.payload)"
            :href="newsUrlOf(event.payload) ?? '#'"
            target="_blank"
            rel="noopener noreferrer"
          > {{ $t("查看新闻 ↗") }} </a>
        </p>

        <div class="inline small">
          <span class="faint">{{ $t("通知投递：") }}</span>
          <span class="badge badge-green">{{ $t("成功") }} {{ event.deliveries.sent }}</span>
          <span v-if="event.deliveries.pending" class="badge badge-neutral"> {{ $t("待发送") }} {{ event.deliveries.pending }}
          </span>
          <span v-if="event.deliveries.failed" class="badge badge-danger"> {{ $t("失败") }} {{ event.deliveries.failed }}
          </span>
          <span v-if="event.deliveries.total === 0" class="badge badge-neutral">{{ $t("无匹配渠道") }}</span>
          <button
            v-if="event.deliveries.failed > 0"
            class="btn btn-sm"
            type="button"
            :disabled="busyId === event.id"
            @click="redeliver(event.id)"
          >
            {{ busyId === event.id ? $t("重投中…") : $t("重投失败通知") }}
          </button>
        </div>
      </article>

      <Pagination
        :page="page"
        :page-size="store.pageSize"
        :total="store.total"
        :disabled="store.loading"
        @update:page="changePage"
      />
    </div>
  </div>
</template>
