<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  LANGUAGE_OPTIONS,
  NEWS_MATCH_MODE_OPTIONS,
  REGION_OPTIONS,
  TIMEZONE_OPTIONS,
} from '@shared/constants'
import type { NewsMatchMode } from '@shared/types'
import { describeError } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import { formatDateTime } from '@/lib/format'
import ErrorBanner from '@/components/ErrorBanner.vue'
import KeywordEditor from '@/components/KeywordEditor.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const session = useSessionStore()
const toast = useToastStore()
const user = session.user

const profileForm = reactive({ displayName: user?.displayName ?? '' })
const profileError = ref('')
const profileBusy = ref(false)

const settings = reactive({
  region: user?.region ?? '',
  language: user?.language ?? '',
  timezone: user?.timezone ?? '',
  pollMinutes: Math.round((user?.pollIntervalSeconds ?? 3600) / 60),
  minDiscountPercent: user?.minDiscountPercent ?? 20,
  newsEnabled: user?.newsEnabled ?? true,
  newsKeywords: [...(user?.newsKeywords ?? [])],
  newsMatchMode: (user?.newsMatchMode ?? 'title') as NewsMatchMode,
})
const settingsError = ref('')
const settingsBusy = ref(false)
const confirmRegionOpen = ref(false)

const timezone = computed(() => user?.timezone ?? 'UTC')
const regionWillChange = computed(
  () => Boolean(session.user?.region) && settings.region !== session.user?.region,
)

async function saveProfile(): Promise<void> {
  profileError.value = ''
  if (!profileForm.displayName.trim()) {
    profileError.value = '显示名称不能为空'
    return
  }
  profileBusy.value = true
  try {
    await session.updateProfile(profileForm.displayName.trim())
    toast.success('显示名称已更新')
  } catch (err) {
    profileError.value = describeError(err)
  } finally {
    profileBusy.value = false
  }
}

function requestSaveSettings(): void {
  settingsError.value = ''
  if (!settings.region || !settings.language || !settings.timezone) {
    settingsError.value = '请选择区域、语言和时区'
    return
  }
  if (regionWillChange.value) {
    confirmRegionOpen.value = true
    return
  }
  void saveSettings()
}

async function saveSettings(): Promise<void> {
  settingsError.value = ''
  settingsBusy.value = true
  try {
    const result = await session.updateSettings({
      region: settings.region,
      language: settings.language,
      timezone: settings.timezone,
      pollIntervalSeconds: Math.round(settings.pollMinutes * 60),
      minDiscountPercent: settings.minDiscountPercent,
      newsEnabled: settings.newsEnabled,
      newsKeywords: settings.newsKeywords,
      newsMatchMode: settings.newsMatchMode,
    })
    confirmRegionOpen.value = false
    toast.success(
      result.regionChanged
        ? `设置已保存，${result.monitorsReset} 个监控项将重新建立基线`
        : '设置已保存',
    )
  } catch (err) {
    settingsError.value = describeError(err)
    confirmRegionOpen.value = false
  } finally {
    settingsBusy.value = false
  }
}
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1>个人设置</h1>
        <p>账号资料、Steam 区域与通知偏好。修改区域会影响你的全部监控项。</p>
      </div>
    </div>

    <div class="detail-grid">
      <div class="stack">
        <section class="card">
          <div class="card-title">
            <h2>账号资料</h2>
          </div>
          <ErrorBanner :message="profileError" />
          <form @submit.prevent="saveProfile">
            <div class="field">
              <label for="set-display">显示名称</label>
              <input id="set-display" v-model="profileForm.displayName" class="input" maxlength="48" required />
            </div>
            <button class="btn" type="submit" :disabled="profileBusy">
              {{ profileBusy ? '保存中…' : '保存资料' }}
            </button>
          </form>
          <dl class="meta-list" style="margin-top: 16px">
            <dt>用户名</dt>
            <dd class="mono">{{ user?.username }}</dd>
            <dt>角色</dt>
            <dd>{{ user?.role === 'admin' ? '管理员' : '普通用户' }}</dd>
            <dt>创建时间</dt>
            <dd>{{ formatDateTime(user?.createdAt, timezone) }}</dd>
            <dt>上次登录</dt>
            <dd>{{ formatDateTime(user?.lastLoginAt, timezone) }}</dd>
          </dl>
          <div class="divider" />
          <RouterLink :to="{ name: 'change-password' }" class="btn btn-sm">修改密码</RouterLink>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>监控与通知偏好</h2>
          </div>
          <ErrorBanner :message="settingsError" />
          <form @submit.prevent="requestSaveSettings">
            <div class="grid-3">
              <div class="field">
                <label for="set-region">区域</label>
                <select id="set-region" v-model="settings.region" class="select" required>
                  <option value="" disabled>请选择区域</option>
                  <option v-for="option in REGION_OPTIONS" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <div class="field">
                <label for="set-language">语言</label>
                <select id="set-language" v-model="settings.language" class="select" required>
                  <option value="" disabled>请选择语言</option>
                  <option v-for="option in LANGUAGE_OPTIONS" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <div class="field">
                <label for="set-tz">时区</label>
                <select id="set-tz" v-model="settings.timezone" class="select" required>
                  <option value="" disabled>请选择时区</option>
                  <option v-for="zone in TIMEZONE_OPTIONS" :key="zone" :value="zone">{{ zone }}</option>
                </select>
              </div>
            </div>

            <div v-if="regionWillChange" class="banner banner-warning">
              修改区域会重新建立所有监控项的基线，首轮检查只写入快照，不发送促销 / 下架通知。
            </div>

            <div class="grid-2">
              <div class="field">
                <label for="set-poll">默认轮询间隔（分钟）</label>
                <input id="set-poll" v-model.number="settings.pollMinutes" class="input" type="number" min="15" max="240" />
              </div>
              <div class="field">
                <label for="set-discount">最低通知折扣（%）</label>
                <input id="set-discount" v-model.number="settings.minDiscountPercent" class="input" type="number" min="1" max="100" />
              </div>
            </div>

            <div class="divider" />
            <div class="card-title">
              <h3>下架新闻预警</h3>
              <label class="inline small">
                <input v-model="settings.newsEnabled" type="checkbox" />
                启用
              </label>
            </div>
            <div class="field">
              <span class="label">关键词</span>
              <KeywordEditor v-model="settings.newsKeywords" />
            </div>
            <div class="field">
              <label for="set-mode">匹配范围</label>
              <select id="set-mode" v-model="settings.newsMatchMode" class="select">
                <option v-for="option in NEWS_MATCH_MODE_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>

            <button class="btn btn-primary" type="submit" :disabled="settingsBusy">
              {{ settingsBusy ? '保存中…' : '保存设置' }}
            </button>
          </form>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-title">
            <h2>当前生效设置</h2>
          </div>
          <dl class="meta-list">
            <dt>区域</dt>
            <dd>{{ user?.region?.toUpperCase() ?? '—' }}</dd>
            <dt>语言</dt>
            <dd>{{ user?.language ?? '—' }}</dd>
            <dt>时区</dt>
            <dd>{{ timezone }}</dd>
            <dt>轮询间隔</dt>
            <dd>{{ Math.round((user?.pollIntervalSeconds ?? 0) / 60) }} 分钟</dd>
            <dt>最低折扣</dt>
            <dd>{{ user?.minDiscountPercent ?? 0 }}%</dd>
            <dt>新闻预警</dt>
            <dd>{{ user?.newsEnabled ? '已启用' : '已关闭' }}</dd>
          </dl>
        </section>
        <section class="card">
          <div class="card-title">
            <h2>说明</h2>
          </div>
          <p class="small muted">
            促销中与即将发售的监控项会自动加密检查频率；已确认不可用的监控项会降低检查频率以节省 Steam 请求额度。
          </p>
        </section>
      </div>
    </div>

    <ConfirmDialog
      :open="confirmRegionOpen"
      title="修改区域？"
      message="修改区域后，你的所有监控项会重新建立基线，首轮检查不会产生促销或下架通知。确定继续吗？"
      confirm-text="修改区域并保存"
      danger
      :busy="settingsBusy"
      @update:open="confirmRegionOpen = false"
      @confirm="saveSettings"
    />
  </div>
</template>
