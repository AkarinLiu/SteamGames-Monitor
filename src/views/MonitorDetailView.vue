<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type { EventListItem, MonitorDetail, Snapshot } from '@shared/types'
import { api, ApiError, describeError } from '@/api/client'
import { useMonitorsStore } from '@/stores/monitors'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import {
  availabilityLabel,
  availabilityBadge,
  formatDateTime,
  formatRelative,
  monitorStatusLabel,
  monitorStatusTone,
  releaseLabel,
} from '@/lib/format'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import PriceTag from '@/components/PriceTag.vue'
import Sparkline from '@/components/Sparkline.vue'
import EventTimeline from '@/components/EventTimeline.vue'
import Modal from '@/components/Modal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const store = useMonitorsStore()
const session = useSessionStore()
const toast = useToastStore()

const monitorId = computed(() => Number(route.params.id))
const timezone = session.user?.timezone ?? 'UTC'

const monitor = ref<MonitorDetail | null>(null)
const snapshots = ref<Snapshot[]>([])
const events = ref<EventListItem[]>([])
const days = ref(30)
const loading = ref(true)
const error = ref('')
const notFound = ref(false)
const busy = ref(false)

const editOpen = ref(false)
const editError = ref('')
const editForm = reactive({
  notes: '',
  minDiscount: '' as number | '',
  newsWatch: true,
})

const deleteOpen = ref(false)
const deleteBusy = ref(false)

const points = computed(() =>
  snapshots.value
    .filter((snapshot) => snapshot.priceFinalRaw !== null)
    .map((snapshot) => ({ at: snapshot.checkedAt, value: snapshot.priceFinalRaw ?? 0 })),
)

const effectiveMinDiscount = computed(
  () => monitor.value?.minDiscountPercent ?? session.user?.minDiscountPercent ?? 0,
)

async function loadSnapshots(): Promise<void> {
  const result = await api.get<{ items: Snapshot[] }>(
    `/monitors/${monitorId.value}/snapshots?days=${days.value}&limit=1000`,
  )
  snapshots.value = result.items
}

async function load(): Promise<void> {
  error.value = ''
  notFound.value = false
  try {
    const detail = await store.fetchDetail(monitorId.value)
    monitor.value = detail
    const [eventResult] = await Promise.all([
      api.get<{ items: EventListItem[] }>(`/monitors/${monitorId.value}/events?limit=50`),
      loadSnapshots(),
    ])
    events.value = eventResult.items
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound.value = true
    } else {
      error.value = describeError(err)
    }
  } finally {
    loading.value = false
  }
}

function openEdit(): void {
  if (!monitor.value) return
  editForm.notes = monitor.value.notes ?? ''
  editForm.minDiscount = monitor.value.minDiscountPercent ?? ''
  editForm.newsWatch = monitor.value.newsWatch
  editError.value = ''
  editOpen.value = true
}

async function saveEdit(): Promise<void> {
  if (!monitor.value) return
  editError.value = ''
  try {
    const updated = await store.update(monitor.value.id, {
      notes: editForm.notes.trim() || null,
      minDiscountPercent: editForm.minDiscount === '' ? null : Number(editForm.minDiscount),
      newsWatch: editForm.newsWatch,
    })
    monitor.value = { ...monitor.value, ...updated }
    editOpen.value = false
    toast.success('监控设置已保存')
  } catch (err) {
    editError.value = describeError(err)
  }
}

async function runCheck(): Promise<void> {
  if (!monitor.value) return
  busy.value = true
  try {
    const updated = await store.check(monitor.value.id)
    if (updated) monitor.value = { ...monitor.value, ...updated }
    await load()
    toast.success('检查已完成')
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    busy.value = false
  }
}

async function togglePause(): Promise<void> {
  if (!monitor.value) return
  busy.value = true
  try {
    const updated = monitor.value.enabled
      ? await store.pause(monitor.value.id)
      : await store.resume(monitor.value.id)
    if (updated) monitor.value = { ...monitor.value, ...updated }
    toast.success(monitor.value.enabled ? '已恢复监控' : '已暂停监控')
    await load()
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    busy.value = false
  }
}

async function confirmDelete(): Promise<void> {
  if (!monitor.value) return
  deleteBusy.value = true
  try {
    await store.remove(monitor.value.id)
    toast.success('监控项已删除')
    await router.replace({ name: 'monitors' })
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    deleteBusy.value = false
  }
}

watch(days, () => {
  void loadSnapshots().catch((err) => toast.error(describeError(err)))
})

onMounted(() => {
  void load()
})
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <div class="inline small" style="margin-bottom: 4px">
          <RouterLink :to="{ name: 'monitors' }">← 返回监控项</RouterLink>
        </div>
        <h1>{{ monitor?.name ?? (loading ? '加载中…' : '监控项') }}</h1>
        <p v-if="monitor" class="inline">
          <span class="mono">{{ monitor.appid }}</span>
          <span class="faint">·</span>
          <span>{{ monitor.kind === 'dlc' ? 'DLC' : '游戏' }}</span>
          <span class="faint">·</span>
          <span>{{ monitor.region.toUpperCase() }} / {{ monitor.language }}</span>
          <span v-if="monitor.parentAppid" class="faint">· 基础游戏 {{ monitor.parentAppid }}</span>
        </p>
      </div>
      <div v-if="monitor" class="page-actions">
        <a
          :href="monitor.storeUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="btn"
        >
          Steam 商店 ↗
        </a>
        <button class="btn" type="button" :disabled="busy" @click="runCheck">
          {{ busy ? '检查中…' : '立即检查' }}
        </button>
        <button class="btn" type="button" :disabled="busy" @click="togglePause">
          {{ monitor.enabled ? '暂停' : '恢复' }}
        </button>
        <button class="btn btn-danger" type="button" @click="deleteOpen = true">删除</button>
      </div>
    </div>

    <ErrorBanner :message="error" />

    <EmptyState
      v-if="notFound"
      title="监控项不存在"
      description="它可能已被删除，或属于其他账号。"
    >
      <RouterLink :to="{ name: 'monitors' }" class="btn btn-primary" style="margin-top: 12px">
        返回列表
      </RouterLink>
    </EmptyState>

    <div v-else-if="loading" class="card">
      <div class="skeleton" style="height: 180px; margin-bottom: 12px" />
      <div class="skeleton" style="height: 16px; width: 60%" />
    </div>

    <div v-else-if="monitor" class="detail-grid">
      <div class="stack">
        <section class="card">
          <img v-if="monitor.headerImage" :src="monitor.headerImage" :alt="monitor.name" class="cover" />
          <div class="inline" style="margin-top: 12px; justify-content: space-between">
            <StatusBadge
              :label="monitorStatusLabel(monitor)"
              :tone="monitorStatusTone(monitor)"
            />
            <span class="faint small">
              上次检查 {{ formatDateTime(monitor.lastCheckAt, timezone) }} ·
              {{ formatRelative(monitor.lastCheckAt) }}
            </span>
          </div>
          <dl class="meta-list" style="margin-top: 12px">
            <dt>发售状态</dt>
            <dd>{{ releaseLabel(monitor.releaseStatus, monitor.releaseDateText) }}</dd>
            <dt>商店可购</dt>
            <dd>
              <StatusBadge
                :label="availabilityLabel(monitor.availability)"
                :tone="availabilityBadge(monitor.availability)"
              />
              <span v-if="monitor.everAvailable" class="faint small"> · 曾经可售</span>
            </dd>
            <dt>下次检查</dt>
            <dd>{{ monitor.enabled ? formatRelative(monitor.nextCheckAt) : '已暂停' }}</dd>
            <dt>连续失败</dt>
            <dd>{{ monitor.consecutiveFailures }}</dd>
            <dt>连续不可用</dt>
            <dd>{{ monitor.consecutiveUnavailable }}</dd>
            <dt>最低通知折扣</dt>
            <dd>{{ effectiveMinDiscount }}%</dd>
            <dt>新闻预警</dt>
            <dd>{{ monitor.newsWatch ? '已启用' : '已关闭' }}</dd>
            <dt>备注</dt>
            <dd style="white-space: pre-line">{{ monitor.notes || '—' }}</dd>
          </dl>
          <div class="inline" style="margin-top: 12px">
            <button class="btn btn-sm" type="button" @click="openEdit">编辑设置</button>
            <span v-if="monitor.baselinePending" class="badge badge-neutral">等待基线检查</span>
          </div>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>价格走势</h2>
            <select v-model.number="days" class="select" style="width: auto" aria-label="时间范围">
              <option :value="30">最近 30 天</option>
              <option :value="90">最近 90 天</option>
            </select>
          </div>
          <Sparkline :points="points" :label="`最终价格 · ${days} 天`" />
        </section>

        <section class="card">
          <div class="card-title">
            <h2>事件时间线</h2>
            <span class="faint small">共 {{ monitor.eventCount }} 条</span>
          </div>
          <EventTimeline
            :items="events"
            :timezone="timezone"
            :show-monitor="false"
            empty-text="暂无事件。首次检查只建立基线，不会发送通知。"
          />
        </section>

        <section class="card">
          <div class="card-title">
            <h2>检查快照</h2>
            <span class="faint small">显示 {{ snapshots.length }} 条</span>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>状态</th>
                  <th class="num">价格</th>
                  <th class="num">折扣</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="snapshot in snapshots" :key="snapshot.id">
                  <td class="small nowrap">{{ formatDateTime(snapshot.checkedAt, timezone) }}</td>
                  <td>
                    <StatusBadge
                      :label="availabilityLabel(snapshot.availability)"
                      :tone="availabilityBadge(snapshot.availability)"
                    />
                  </td>
                  <td class="num small">
                    {{ snapshot.isFree ? '免费' : (snapshot.priceFinalFormatted ?? '—') }}
                  </td>
                  <td class="num small">
                    {{ snapshot.discountPercent > 0 ? `-${snapshot.discountPercent}%` : '—' }}
                  </td>
                  <td class="small faint">
                    <span v-if="snapshot.suppressed" class="badge badge-neutral">基线</span>
                    <span v-if="snapshot.errorCode" class="badge badge-warning">
                      {{ snapshot.errorCode }}
                    </span>
                  </td>
                </tr>
                <tr v-if="snapshots.length === 0">
                  <td colspan="5" class="small faint">暂无快照</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-title">
            <h2>当前价格</h2>
          </div>
          <div class="inline" style="justify-content: space-between">
            <PriceTag :monitor="monitor" />
            <span v-if="monitor.currency" class="badge badge-neutral">{{ monitor.currency }}</span>
          </div>
          <p class="faint small" style="margin-top: 8px">
            {{
              monitor.saleStartedAt
                ? `本次促销开始于 ${formatDateTime(monitor.saleStartedAt, timezone)}`
                : '当前不在跟踪中的促销状态'
            }}
          </p>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>监控信息</h2>
          </div>
          <dl class="meta-list">
            <dt>监控 ID</dt>
            <dd class="mono">{{ monitor.id }}</dd>
            <dt>添加时间</dt>
            <dd>{{ formatDateTime(monitor.createdAt, timezone) }}</dd>
            <dt>最近成功</dt>
            <dd>{{ formatDateTime(monitor.lastSuccessAt, timezone) }}</dd>
            <dt>新闻下次检查</dt>
            <dd>{{ formatDateTime(monitor.nextNewsCheckAt, timezone) }}</dd>
            <dt>快照数量</dt>
            <dd>{{ monitor.snapshotCount }}</dd>
          </dl>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>提示</h2>
          </div>
          <p class="small muted">
            下架判定采用“连续两次检查确认无法购买”，新闻预警只是启发式提示。首次检查与修改区域后的检查只建立基线，不产生通知。
          </p>
        </section>
      </div>
    </div>

    <Modal v-model:open="editOpen" title="编辑监控设置" width="520px">
      <ErrorBanner :message="editError" />
      <form @submit.prevent="saveEdit">
        <div class="field">
          <label for="md-discount">最低通知折扣（%），留空使用账号默认</label>
          <input
            id="md-discount"
            v-model.number="editForm.minDiscount"
            class="input"
            type="number"
            min="1"
            max="100"
            placeholder="使用默认"
          />
        </div>
        <div class="field">
          <span class="label">下架新闻预警</span>
          <label class="inline">
            <input v-model="editForm.newsWatch" type="checkbox" />
            扫描 Steam 新闻关键词
          </label>
        </div>
        <div class="field">
          <label for="md-notes">备注</label>
          <textarea id="md-notes" v-model="editForm.notes" class="textarea" maxlength="2000" />
        </div>
        <div class="inline" style="justify-content: flex-end">
          <button class="btn" type="button" @click="editOpen = false">取消</button>
          <button class="btn btn-primary" type="submit">保存</button>
        </div>
      </form>
    </Modal>

    <ConfirmDialog
      :open="deleteOpen"
      title="删除监控项"
      :message="`确定删除「${monitor?.name ?? ''}」吗？历史事件与快照会保留。`"
      confirm-text="删除"
      danger
      :busy="deleteBusy"
      @update:open="deleteOpen = false"
      @confirm="confirmDelete"
    />
  </div>
</template>
