<script setup lang="ts">
import { UI_LOCALE_OPTIONS, setUiLocale, uiLocale, type UiLocale } from '@/i18n'

function onChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value as UiLocale
  if (value !== uiLocale.value) setUiLocale(value)
}
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
