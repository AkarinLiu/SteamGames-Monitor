<script setup lang="ts">
import { computed } from 'vue'

interface Point {
  at: number
  value: number
}

const props = withDefaults(
  defineProps<{
    points: Point[]
    label?: string
  }>(),
  { label: '' },
)

const width = 320
const height = 72
const pad = 4

const sorted = computed(() =>
  props.points
    .filter((point) => Number.isFinite(point.value))
    .slice()
    .sort((a, b) => a.at - b.at),
)

const bounds = computed(() => {
  const values = sorted.value.map((point) => point.value)
  if (values.length === 0) return null
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    const delta = Math.abs(min) * 0.05 || 1
    min -= delta
    max += delta
  }
  return { min, max }
})

function xOf(index: number): number {
  if (sorted.value.length <= 1) return width / 2
  return pad + (index / (sorted.value.length - 1)) * (width - pad * 2)
}

function yOf(value: number): number {
  const range = bounds.value
  if (!range) return height / 2
  const ratio = (value - range.min) / (range.max - range.min)
  return height - pad - ratio * (height - pad * 2)
}

const line = computed(() =>
  sorted.value.map((point, index) => `${xOf(index).toFixed(2)},${yOf(point.value).toFixed(2)}`).join(' '),
)

const area = computed(() => {
  if (sorted.value.length === 0) return ''
  const first = `M ${xOf(0).toFixed(2)} ${height - pad}`
  const lines = sorted.value
    .map((point, index) => `L ${xOf(index).toFixed(2)} ${yOf(point.value).toFixed(2)}`)
    .join(' ')
  const last = `L ${xOf(sorted.value.length - 1).toFixed(2)} ${height - pad} Z`
  return `${first} ${lines} ${last}`
})

const lastPoint = computed(() => sorted.value[sorted.value.length - 1] ?? null)
</script>

<template>
  <div aria-label="价格走势">
    <div v-if="sorted.length === 0" class="empty-state small" style="padding: 12px">
      暂无价格快照
    </div>
    <svg
      v-else
      class="sparkline"
      :viewBox="`0 0 ${width} ${height}`"
      preserveAspectRatio="none"
      role="img"
      :aria-label="label || '价格走势'"
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(102,192,244,0.38)" />
          <stop offset="100%" stop-color="rgba(102,192,244,0)" />
        </linearGradient>
      </defs>
      <path :d="area" fill="url(#spark-fill)" />
      <polyline
        :points="line"
        fill="none"
        stroke="var(--color-accent)"
        stroke-width="1.6"
        stroke-linejoin="round"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />
      <circle
        v-if="lastPoint"
        :cx="xOf(sorted.length - 1)"
        :cy="yOf(lastPoint.value)"
        r="2.6"
        fill="var(--color-accent-strong)"
      />
    </svg>
    <div v-if="bounds && sorted.length > 0" class="inline small faint" style="justify-content: space-between">
      <span>{{ label }}</span>
      <span>{{ sorted.length }} 个快照</span>
    </div>
  </div>
</template>
