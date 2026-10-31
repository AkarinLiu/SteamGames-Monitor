<script setup lang="ts">
import { t, tf } from '@/i18n'

import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  APP_NAME,
  LANGUAGE_OPTIONS,
  LIMITS,
  NEWS_MATCH_MODE_OPTIONS,
  REGION_OPTIONS,
  TIMEZONE_OPTIONS,
} from '@shared/constants'
import type { NewsMatchMode } from '@shared/types'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import { describeError } from '@/api/client'
import LocaleSelect from '@/components/LocaleSelect.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'
import KeywordEditor from '@/components/KeywordEditor.vue'

const router = useRouter()
const session = useSessionStore()
const toast = useToastStore()
const user = session.user

function detectedTimezone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return (TIMEZONE_OPTIONS as readonly string[]).includes(zone) ? zone : ''
}

const form = reactive({
  region: user?.region ?? '',
  language: user?.language ?? '',
  timezone: user?.timezone ?? detectedTimezone(),
  pollMinutes: Math.round((user?.pollIntervalSeconds ?? LIMITS.defaultPollIntervalSeconds) / 60),
  minDiscountPercent: user?.minDiscountPercent ?? LIMITS.defaultMinDiscountPercent,
  newsEnabled: user?.newsEnabled ?? true,
  newsKeywords: [...(user?.newsKeywords ?? [])],
  newsMatchMode: (user?.newsMatchMode ?? 'title') as NewsMatchMode,
})

const error = ref('')
const busy = ref(false)
const regionChanged = computed(
  () =>
    Boolean(session.user?.region) &&
    Boolean(form.region) &&
    form.region !== session.user?.region,
)

async function submit(): Promise<void> {
  error.value = ''
  if (!form.region || !form.language || !form.timezone) {
    error.value = t("请选择区域、语言和时区")
    return
  }
  busy.value = true
  try {
    const result = await session.completeOnboarding({
      region: form.region,
      language: form.language,
      timezone: form.timezone,
      pollIntervalSeconds: Math.round(form.pollMinutes * 60),
      minDiscountPercent: form.minDiscountPercent,
      newsEnabled: form.newsEnabled,
      newsKeywords: form.newsKeywords,
      newsMatchMode: form.newsMatchMode,
    })
    toast.success(
      result.monitorsReset > 0
        ? tf('设置已保存，{count} 个监控项将重新建立基线', {
            count: result.monitorsReset,
          })
        : t('设置已保存'),
    )
    await router.replace({ name: 'dashboard' })
  } catch (err) {
    error.value = describeError(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="auth-shell">
    <div class="auth-card" style="max-width: 640px">
      <div class="inline" style="justify-content: space-between">
        <div class="brand" style="padding: 0 0 8px">
          <span class="brand-mark">S</span>
          <span>{{ $t(APP_NAME) }}</span>
        </div>
        <LocaleSelect />
      </div>
      <h1>{{ $t("完成初始设置") }}</h1>
      <p class="muted"> {{ $t("区域与语言决定 Steam 商店返回的货币与文案，未选择区域前无法添加监控项。之后可随时在个人设置中修改。") }} </p>

      <ErrorBanner :message="error" />

      <form @submit.prevent="submit">
        <div class="grid-3">
          <div class="field">
            <label for="ob-region">{{ $t("区域") }}</label>
            <select id="ob-region" v-model="form.region" class="select" required>
              <option value="" disabled>{{ $t("请选择区域") }}</option>
              <option v-for="option in REGION_OPTIONS" :key="option.value" :value="option.value">
                {{ $t(option.label) }}
              </option>
            </select>
          </div>
          <div class="field">
            <label for="ob-language">{{ $t("语言") }}</label>
            <select id="ob-language" v-model="form.language" class="select" required>
              <option value="" disabled>{{ $t("请选择语言") }}</option>
              <option v-for="option in LANGUAGE_OPTIONS" :key="option.value" :value="option.value">
                {{ $t(option.label) }}
              </option>
            </select>
          </div>
          <div class="field">
            <label for="ob-tz">{{ $t("时区") }}</label>
            <select id="ob-tz" v-model="form.timezone" class="select" required>
              <option value="" disabled>{{ $t("请选择时区") }}</option>
              <option v-for="zone in TIMEZONE_OPTIONS" :key="zone" :value="zone">{{ zone }}</option>
            </select>
          </div>
        </div>

        <div v-if="regionChanged" class="banner banner-warning"> {{ $t("修改区域后，你的所有监控项会被重新建立基线，首轮检查不会产生促销 / 下架通知。") }} </div>

        <div class="grid-2">
          <div class="field">
            <label for="ob-poll">{{ $t("默认轮询间隔（分钟）") }}</label>
            <input
              id="ob-poll"
              v-model.number="form.pollMinutes"
              class="input"
              type="number"
              min="15"
              max="240"
            />
            <span class="field-hint">{{ $t("允许范围 15–240 分钟，促销与即将发售时会自动加密检查。") }}</span>
          </div>
          <div class="field">
            <label for="ob-discount">{{ $t("最低通知折扣（%）") }}</label>
            <input
              id="ob-discount"
              v-model.number="form.minDiscountPercent"
              class="input"
              type="number"
              min="1"
              max="100"
            />
            <span class="field-hint">{{ $t("折扣达到该值才发送促销通知，可在单个监控项覆盖。") }}</span>
          </div>
        </div>

        <div class="divider" />
        <div class="card-title">
          <h3>{{ $t("下架新闻预警") }}</h3>
          <label class="inline small">
            <input v-model="form.newsEnabled" type="checkbox" /> {{ $t("启用") }} </label>
        </div>
        <p class="small muted"> {{ $t("扫描 Steam 新闻与公告，命中关键词时发送“下架预警”。该功能为启发式，请人工确认。") }} </p>
        <div class="field">
          <span class="label">{{ $t("关键词") }}</span>
          <KeywordEditor v-model="form.newsKeywords" />
        </div>
        <div class="field">
          <label for="ob-mode">{{ $t("匹配范围") }}</label>
          <select id="ob-mode" v-model="form.newsMatchMode" class="select">
            <option v-for="option in NEWS_MATCH_MODE_OPTIONS" :key="option.value" :value="option.value">
              {{ $t(option.label) }}
            </option>
          </select>
        </div>

        <button class="btn btn-primary" type="submit" :disabled="busy">
          {{ busy ? $t("保存中…") : $t("保存并进入系统") }}
        </button>
      </form>
    </div>
  </main>
</template>
