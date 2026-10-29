<script setup lang="ts">
import { computed } from 'vue'
import type { Monitor } from '@shared/types'

const props = defineProps<{ monitor: Monitor }>()

const finalText = computed(() => {
  if (props.monitor.isFree) return '免费'
  return props.monitor.priceFinalFormatted ?? '—'
})
const initialText = computed(() =>
  props.monitor.discountPercent > 0 ? (props.monitor.priceInitialFormatted ?? '') : '',
)
const discount = computed(() =>
  props.monitor.discountPercent > 0 ? `-${props.monitor.discountPercent}%` : '',
)
</script>

<template>
  <div class="price-block">
    <span class="price-final">{{ finalText }}</span>
    <span v-if="initialText || discount" class="inline">
      <span v-if="initialText" class="price-initial">{{ initialText }}</span>
      <span v-if="discount" class="discount">{{ discount }}</span>
    </span>
  </div>
</template>
