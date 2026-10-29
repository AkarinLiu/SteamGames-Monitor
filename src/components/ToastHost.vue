<script setup lang="ts">
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

function tone(kind: 'info' | 'success' | 'error'): string {
  return kind === 'success' ? 'toast-success' : kind === 'error' ? 'toast-error' : ''
}
</script>

<template>
  <div class="toast-host" aria-live="polite">
    <div v-for="item in toast.items" :key="item.id" class="toast" :class="tone(item.kind)">
      <span class="flex-1">{{ item.message }}</span>
      <button class="btn-link small" type="button" @click="toast.dismiss(item.id)">关闭</button>
    </div>
  </div>
</template>
