<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  used: number
  limit: number
  label: string
}>()

const percent = computed(() =>
  props.limit <= 0 ? 0 : Math.min(100, Math.round((props.used / props.limit) * 100)),
)
</script>

<template>
  <div style="margin-bottom: 14px">
    <div class="inline small" style="justify-content: space-between; margin-bottom: 4px">
      <span class="muted">{{ label }}</span>
      <span class="faint">{{ used }} / {{ limit }}</span>
    </div>
    <div style="height: 6px; border-radius: 999px; background: rgba(143, 152, 160, 0.18)">
      <div
        :style="{
          width: `${percent}%`,
          height: '100%',
          borderRadius: '999px',
          background:
            percent >= 100
              ? 'var(--color-danger)'
              : percent >= 80
                ? 'var(--color-warning)'
                : 'var(--color-accent)',
        }"
      />
    </div>
  </div>
</template>
