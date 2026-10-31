<script setup lang="ts">
import { t } from '@/i18n'

import { ref } from 'vue'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{ value: string; label?: string }>()
const toast = useToastStore()
const copied = ref(false)

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.value)
    copied.value = true
    toast.success(t("已复制到剪贴板"))
    window.setTimeout(() => (copied.value = false), 1800)
  } catch {
    toast.error(t("复制失败，请手动选择文本复制"))
  }
}
</script>

<template>
  <button class="btn btn-sm" type="button" @click="copy">
    {{ copied ? $t("已复制") : (label ?? $t("复制")) }}
  </button>
</template>
