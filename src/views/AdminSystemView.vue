<script setup lang="ts">
import { t, tf } from '@/i18n'

import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { describeError } from '@/api/client'
import { useAdminStore } from '@/stores/admin'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import { formatDateTime, formatRelative } from '@/lib/format'
import ErrorBanner from '@/components/ErrorBanner.vue'

const store = useAdminStore()
const session = useSessionStore()
const toast = useToastStore()
const timezone = session.user?.timezone ?? 'UTC'

const error = ref('')
const settingsError = ref('')
const saving = ref(false)
let timer: number | null = null

const form = reactive({
  defaultPollMinutes: 60,
  defaultMinDiscountPercent: 20,
  cacheTtlMinutes: 10,
  newsCacheTtlHours: 6,
  snapshotsDays: 90,
  eventsDays: 365,
  deliveriesDays: 14,
  inboundDays: 30,
  logsDays: 180,
  newsSeenDays: 180,
})

const health = computed(() => store.health)
const settings = computed(() => store.settings)

const uptimeText = computed(() => {
  const seconds = health.value?.uptimeSeconds ?? 0
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return tf('{days} 天 {hours} 小时', { days, hours })
  if (hours > 0) return tf('{hours} 小时 {minutes} 分钟', { hours, minutes })
  return tf('{minutes} 分钟', { minutes })
})

const tokenPercent = computed(() => {
  const steam = health.value?.steam
  if (!steam || steam.capacity <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((steam.tokensRemaining / steam.capacity) * 100)))
})

async function loadHealth(): Promise<void> {
  try {
    await store.fetchHealth()
  } catch (err) {
    error.value = describeError(err)
  }
}

function applySettingsForm(): void {
  const current = settings.value
  if (!current) return
  form.defaultPollMinutes = Math.round(current.defaultPollIntervalSeconds / 60)
  form.defaultMinDiscountPercent = current.defaultMinDiscountPercent
  form.cacheTtlMinutes = Math.round(current.cacheTtlSeconds / 60)
  form.newsCacheTtlHours = Math.round(current.newsCacheTtlSeconds / 3600)
  form.snapshotsDays = current.retention.snapshotsDays
  form.eventsDays = current.retention.eventsDays
  form.deliveriesDays = current.retention.deliveriesDays
  form.inboundDays = current.retention.inboundDays
  form.logsDays = current.retention.logsDays
  form.newsSeenDays = current.retention.newsSeenDays
}

async function saveSettings(): Promise<void> {
  settingsError.value = ''
  saving.value = true
  try {
    await store.updateSettings({
      defaultPollIntervalSeconds: Math.round(form.defaultPollMinutes * 60),
      defaultMinDiscountPercent: form.defaultMinDiscountPercent,
      cacheTtlSeconds: Math.round(form.cacheTtlMinutes * 60),
      newsCacheTtlSeconds: Math.round(form.newsCacheTtlHours * 3600),
      retention: {
        snapshotsDays: form.snapshotsDays,
        eventsDays: form.eventsDays,
        deliveriesDays: form.deliveriesDays,
        inboundDays: form.inboundDays,
        logsDays: form.logsDays,
        newsSeenDays: form.newsSeenDays,
      },
    })
    toast.success(t("系统设置已保存"))
  } catch (err) {
    settingsError.value = describeError(err)
  } finally {
    saving.value = false
  }
}

async function refresh(): Promise<void> {
  await loadHealth()
  toast.success(t("系统状态已刷新"))
}

onMounted(async () => {
  await Promise.all([loadHealth(), store.fetchSettings().then(applySettingsForm).catch((err) => {
    settingsError.value = describeError(err)
  })])
  timer = window.setInterval(() => void loadHealth(), 10_000)
})

onBeforeUnmount(() => {
  if (timer !== null) window.clearInterval(timer)
})
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1>{{ $t("系统状态") }}</h1>
        <p>{{ $t("调度器、Steam 请求额度、通知队列与保留策略。页面每 10 秒自动刷新。") }}</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="refresh">{{ $t("刷新") }}</button>
      </div>
    </div>

    <ErrorBanner :message="error" />

    <div v-if="!health" class="card">
      <div class="skeleton" style="height: 80px" />
    </div>

    <template v-else>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">{{ $t("运行时长") }}</div>
          <div class="stat-value" style="font-size: 1.3rem">{{ uptimeText }}</div>
          <div class="stat-foot">{{ $t("环境：") }}{{ health.env }}</div>
        </div>
        <div class="stat">
          <div class="stat-label">{{ $t("监控项") }}</div>
          <div class="stat-value">{{ health.monitors.enabled }}</div>
          <div class="stat-foot">{{ $tf('共 {total} / 上限 {max}', { total: health.monitors.total, max: health.monitors.maxTotal }) }}</div>
        </div>
        <div class="stat">
          <div class="stat-label">{{ $t("到期任务") }}</div>
          <div class="stat-value">{{ health.monitors.dueNow }}</div>
          <div class="stat-foot">{{ $tf('新闻到期 {count}', { count: health.monitors.dueNewsNow }) }}</div>
        </div>
        <div class="stat">
          <div class="stat-label">{{ $t("Steam 令牌") }}</div>
          <div class="stat-value">{{ health.steam.tokensRemaining }}</div>
          <div class="stat-foot">{{ $tf('容量 {capacity} / 分钟', { capacity: health.steam.capacity }) }}</div>
        </div>
        <div class="stat">
          <div class="stat-label">{{ $t("通知队列") }}</div>
          <div class="stat-value">{{ health.delivery.pending }}</div>
          <div class="stat-foot">
            {{ $tf('发送中 {sending} / 24h 失败 {failed}', { sending: health.delivery.sending, failed: health.delivery.failed24h }) }}
          </div>
        </div>
        <div class="stat">
          <div class="stat-label">{{ $t("缓存 TTL") }}</div>
          <div class="stat-value" style="font-size: 1.3rem">
            {{ $tf('{minutes} 分钟', { minutes: Math.round(health.cacheTtlSeconds / 60) }) }}
          </div>
          <div class="stat-foot">{{ $t("Steam appdetails 共享缓存") }}</div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="stack">
          <section class="card">
            <div class="card-title">
              <h2>{{ $t("运行状态") }}</h2>
            </div>
            <div class="stack small">
              <div class="inline" style="justify-content: space-between">
                <span class="muted">{{ $t("调度器") }}</span>
                <span class="badge" :class="health.scheduler.running ? 'badge-green' : 'badge-danger'">
                  {{ health.scheduler.running ? $t("运行中") : $t("已停止") }}
                </span>
              </div>
              <div class="inline" style="justify-content: space-between">
                <span class="muted">{{ $t("进行中的请求组") }}</span>
                <span>{{ health.scheduler.inflightGroups }}</span>
              </div>
              <div class="inline" style="justify-content: space-between">
                <span class="muted">{{ $t("新闻扫描") }}</span>
                <span class="badge" :class="health.newsScanner.running ? 'badge-green' : 'badge-neutral'">
                  {{ health.newsScanner.running ? $t("运行中") : $t("空闲") }}
                </span>
              </div>
              <div class="inline" style="justify-content: space-between">
                <span class="muted">{{ $t("投递 worker") }}</span>
                <span class="badge" :class="health.delivery.running ? 'badge-green' : 'badge-danger'">
                  {{ health.delivery.running ? $t("运行中") : $t("已停止") }}
                </span>
              </div>
              <div class="inline" style="justify-content: space-between">
                <span class="muted">{{ $t("最旧待发送") }}</span>
                <span>{{ formatRelative(health.delivery.oldestPendingAt) }}</span>
              </div>
              <div class="inline" style="justify-content: space-between">
                <span class="muted">{{ $t("Steam 冷却") }}</span>
                <span>
                  {{
                    health.steam.cooldownUntil && health.steam.cooldownUntil > Date.now()
                      ? $tf('至 {date}', {
                          date: formatDateTime(health.steam.cooldownUntil, timezone),
                        })
                      : $t("无")
                  }}
                </span>
              </div>
            </div>
            <div style="margin-top: 14px">
              <div class="inline small" style="justify-content: space-between; margin-bottom: 4px">
                <span class="muted">{{ $t("Steam 令牌余量") }}</span>
                <span class="faint">{{ tokenPercent }}%</span>
              </div>
              <div style="height: 6px; border-radius: 999px; background: rgba(143, 152, 160, 0.18)">
                <div
                  :style="{
                    width: `${tokenPercent}%`,
                    height: '100%',
                    borderRadius: '999px',
                    background: tokenPercent < 20 ? 'var(--color-warning)' : 'var(--color-accent)',
                  }"
                />
              </div>
            </div>
          </section>

          <section class="card">
            <div class="card-title">
              <h2>{{ $t("保留策略") }}</h2>
            </div>
            <ErrorBanner :message="settingsError" />
            <form @submit.prevent="saveSettings">
              <div class="grid-2">
                <div class="field">
                  <label for="sys-poll">{{ $t("默认轮询间隔（分钟）") }}</label>
                  <input id="sys-poll" v-model.number="form.defaultPollMinutes" class="input" type="number" min="15" max="240" />
                </div>
                <div class="field">
                  <label for="sys-discount">{{ $t("默认最低折扣（%）") }}</label>
                  <input id="sys-discount" v-model.number="form.defaultMinDiscountPercent" class="input" type="number" min="1" max="100" />
                </div>
              </div>
              <div class="grid-2">
                <div class="field">
                  <label for="sys-cache">{{ $t("Steam 缓存 TTL（分钟）") }}</label>
                  <input id="sys-cache" v-model.number="form.cacheTtlMinutes" class="input" type="number" min="1" max="1440" />
                </div>
                <div class="field">
                  <label for="sys-news-cache">{{ $t("新闻缓存 TTL（小时）") }}</label>
                  <input id="sys-news-cache" v-model.number="form.newsCacheTtlHours" class="input" type="number" min="1" max="168" />
                </div>
              </div>

              <div class="divider" />
              <div class="grid-3">
                <div class="field">
                  <label for="ret-snapshots">{{ $t("快照保留（天）") }}</label>
                  <input id="ret-snapshots" v-model.number="form.snapshotsDays" class="input" type="number" min="1" max="3650" />
                </div>
                <div class="field">
                  <label for="ret-events">{{ $t("事件保留（天）") }}</label>
                  <input id="ret-events" v-model.number="form.eventsDays" class="input" type="number" min="1" max="3650" />
                </div>
                <div class="field">
                  <label for="ret-deliveries">{{ $t("投递记录保留（天）") }}</label>
                  <input id="ret-deliveries" v-model.number="form.deliveriesDays" class="input" type="number" min="1" max="3650" />
                </div>
                <div class="field">
                  <label for="ret-inbound">{{ $t("入站消息保留（天）") }}</label>
                  <input id="ret-inbound" v-model.number="form.inboundDays" class="input" type="number" min="1" max="3650" />
                </div>
                <div class="field">
                  <label for="ret-logs">{{ $t("命令 / 审计日志保留（天）") }}</label>
                  <input id="ret-logs" v-model.number="form.logsDays" class="input" type="number" min="1" max="3650" />
                </div>
                <div class="field">
                  <label for="ret-news">{{ $t("新闻去重记录保留（天）") }}</label>
                  <input id="ret-news" v-model.number="form.newsSeenDays" class="input" type="number" min="1" max="3650" />
                </div>
              </div>

              <button class="btn btn-primary" type="submit" :disabled="saving">
                {{ saving ? $t("保存中…") : $t("保存系统设置") }}
              </button>
            </form>
          </section>
        </div>

        <div class="stack">
          <section class="card">
            <div class="card-title">
              <h2>{{ $t("容量提示") }}</h2>
            </div>
            <p class="small muted"> {{ $t("全局最多") }} {{ settings?.maxTotalMonitors ?? health.monitors.maxTotal }} {{ $t("个监控项。Steam 接口按 IP 限流， 用户越多、区域越分散，同一 tick 需要的请求越多。调度器会自动延后并显示令牌余量，请关注预算告警。") }} </p>
            <dl class="meta-list">
              <dt>{{ $t("到期监控") }}</dt>
              <dd>{{ health.monitors.dueNow }}</dd>
              <dt>{{ $t("进行中请求组") }}</dt>
              <dd>{{ health.scheduler.inflightGroups }}</dd>
              <dt>{{ $t("队列待发送") }}</dt>
              <dd>{{ health.delivery.pending }}</dd>
            </dl>
          </section>

          <section class="card">
            <div class="card-title">
              <h2>{{ $t("运维建议") }}</h2>
            </div>
            <ul class="small muted" style="margin: 0; padding-left: 1.1rem">
              <li>{{ $t("定期备份 SQLite 数据文件与") }} <code>.env</code> {{ $t("中的") }} <code>APP_SECRET</code>。</li>
              <li>{{ $t("丢失") }} <code>APP_SECRET</code> {{ $t("将无法解密渠道与机器人密钥，需要重新填写。") }}</li>
              <li>{{ $t("生产环境务必使用 HTTPS，并设置") }} <code>COOKIE_SECURE=true</code>。</li>
              <li>{{ $t("飞书 / 钉钉机器人回调地址需公网 HTTPS 可达；企业微信智能机器人使用出站长连接。反向代理需原样透传") }} <code>/webhooks/*</code> {{ $t("的请求体。") }}</li>
            </ul>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>
