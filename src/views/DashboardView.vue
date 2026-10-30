<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { DashboardStats } from '@shared/types'
import { api, describeError } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import { formatDateTime, formatRelative } from '@/lib/format'
import EventTimeline from '@/components/EventTimeline.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'

const session = useSessionStore()
const toast = useToastStore()

const stats = ref<DashboardStats | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
let timer: number | null = null

const timezone = computed(() => session.user?.timezone ?? 'UTC')

async function load(silent = false): Promise<void> {
  if (!silent) refreshing.value = true
  try {
    stats.value = await api.get<DashboardStats>('/dashboard')
    error.value = ''
  } catch (err) {
    if (!silent) error.value = describeError(err)
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function refresh(): void {
  void load().then(() => toast.success('概览已刷新'))
}

onMounted(() => {
  void load()
  timer = window.setInterval(() => void load(true), 30_000)
})

onBeforeUnmount(() => {
  if (timer !== null) window.clearInterval(timer)
})
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1>概览</h1>
        <p>最近一次检查：{{ formatDateTime(stats?.lastCheckAt, timezone) }}</p>
      </div>
      <div class="page-actions">
        <RouterLink :to="{ name: 'monitors' }" class="btn btn-primary">添加监控</RouterLink>
        <button class="btn" type="button" :disabled="refreshing" @click="refresh">
          {{ refreshing ? '刷新中…' : '刷新' }}
        </button>
      </div>
    </div>

    <ErrorBanner :message="error" />

    <div v-if="loading" class="stat-grid">
      <div v-for="index in 6" :key="index" class="stat">
        <div class="skeleton" style="height: 12px; width: 60%" />
        <div class="skeleton" style="height: 26px; margin-top: 10px; width: 40%" />
      </div>
    </div>
    <div v-else class="stat-grid">
      <div class="stat">
        <div class="stat-label">监控项</div>
        <div class="stat-value">{{ stats?.monitors.total ?? 0 }}</div>
        <div class="stat-foot">已暂停 {{ stats?.monitors.paused ?? 0 }}</div>
      </div>
      <div class="stat">
        <div class="stat-label">正常在售</div>
        <div class="stat-value">{{ stats?.monitors.available ?? 0 }}</div>
        <div class="stat-foot">即将发售 {{ stats?.monitors.comingSoon ?? 0 }}</div>
      </div>
      <div class="stat">
        <div class="stat-label">促销中</div>
        <div class="stat-value" style="color: var(--color-green)">
          {{ stats?.monitors.onSale ?? 0 }}
        </div>
        <div class="stat-foot">达到监控折扣阈值</div>
      </div>
      <div class="stat">
        <div class="stat-label">不可购买</div>
        <div class="stat-value" style="color: var(--color-danger)">
          {{ stats?.monitors.unavailable ?? 0 }}
        </div>
        <div class="stat-foot">含疑似不可用</div>
      </div>
      <div class="stat">
        <div class="stat-label">24 小时事件</div>
        <div class="stat-value">{{ stats?.events24h ?? 0 }}</div>
        <div class="stat-foot">发售 / 促销 / 下架</div>
      </div>
      <div class="stat">
        <div class="stat-label">待发送通知</div>
        <div class="stat-value">{{ stats?.pendingDeliveries ?? 0 }}</div>
        <div class="stat-foot" :style="stats?.failedDeliveries ? 'color: #ff9b93' : ''">
          失败 {{ stats?.failedDeliveries ?? 0 }}
        </div>
      </div>
    </div>

    <div v-if="(stats?.failedDeliveries ?? 0) > 0" class="banner banner-warning">
      <span class="flex-1">有 {{ stats?.failedDeliveries }} 条通知投递失败，可在事件记录中重投。</span>
      <RouterLink :to="{ name: 'events' }">前往事件记录</RouterLink>
    </div>

    <div class="detail-grid">
      <section class="card">
        <div class="card-title">
          <h2>最近事件</h2>
          <RouterLink :to="{ name: 'events' }" class="small">全部事件</RouterLink>
        </div>
        <EventTimeline
          :items="stats?.recentEvents ?? []"
          :timezone="timezone"
          empty-text="暂无事件。首次检查只建立基线，不会发送通知。"
        />
      </section>

      <div class="stack">
        <section class="card">
          <div class="card-title">
            <h2>快捷入口</h2>
          </div>
          <div class="stack">
            <RouterLink :to="{ name: 'monitors' }" class="quick-link">
              <span>管理监控项</span><span class="quick-arrow">›</span>
            </RouterLink>
            <RouterLink :to="{ name: 'channels' }" class="quick-link">
              <span>配置通知渠道</span><span class="quick-arrow">›</span>
            </RouterLink>
            <RouterLink :to="{ name: 'bots' }" class="quick-link">
              <span>接入指令机器人</span><span class="quick-arrow">›</span>
            </RouterLink>
            <RouterLink :to="{ name: 'settings' }" class="quick-link">
              <span>调整个人设置</span><span class="quick-arrow">›</span>
            </RouterLink>
          </div>
        </section>
        <section class="card">
          <div class="card-title">
            <h2>当前配置</h2>
          </div>
          <dl class="meta-list">
            <dt>区域</dt>
            <dd>{{ session.user?.region?.toUpperCase() ?? '—' }}</dd>
            <dt>语言</dt>
            <dd>{{ session.user?.language ?? '—' }}</dd>
            <dt>时区</dt>
            <dd>{{ timezone }}</dd>
            <dt>默认间隔</dt>
            <dd>{{ Math.round((session.user?.pollIntervalSeconds ?? 0) / 60) }} 分钟</dd>
            <dt>最低折扣</dt>
            <dd>{{ session.user?.minDiscountPercent ?? 0 }}%</dd>
            <dt>下次检查</dt>
            <dd>
              {{
                stats?.lastCheckAt
                  ? formatRelative(stats.lastCheckAt + (session.user?.pollIntervalSeconds ?? 3600) * 1000)
                  : '—'
              }}
            </dd>
          </dl>
        </section>
      </div>
    </div>
  </div>
</template>
