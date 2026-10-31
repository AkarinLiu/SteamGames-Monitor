<script setup lang="ts">
import { watch } from 'vue'
import type { PublicUser } from '@shared/types'
import { api } from '@/api/client'
import {
  UI_LOCALE_OPTIONS,
  hasStoredUiLocale,
  setUiLocale,
  uiLocale,
  type UiLocale,
} from '@/i18n'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()

async function persist(value: UiLocale): Promise<void> {
  try {
    const result = await api.patch<{ user: PublicUser }>('/me/locale', { uiLocale: value })
    session.setUser(result.user)
  } catch {
    // 网络异常时只保留浏览器本地语言，下次切换会重试。
  }
}

async function onChange(event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement).value as UiLocale
  if (value === uiLocale.value) return
  if (session.user) await persist(value)
  setUiLocale(value)
}

watch(
  () => session.user?.uiLocale,
  (serverLocale) => {
    if (serverLocale && serverLocale !== uiLocale.value && hasStoredUiLocale()) {
      void persist(uiLocale.value)
    }
  },
  { immediate: true },
)
</script>

<template>
  <select
    class="select locale-select"
    :value="uiLocale"
    aria-label="UI locale"
    title="Interface language / 界面语言"
    @change="onChange"
  >
    <option v-for="option in UI_LOCALE_OPTIONS" :key="option.value" :value="option.value">
      {{ option.label }}
    </option>
  </select>
</template>
