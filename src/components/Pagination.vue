<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  page: number
  pageSize: number
  total: number
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:page': [number] }>()

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

function go(next: number): void {
  const target = Math.min(Math.max(1, next), pageCount.value)
  if (target !== props.page) emit('update:page', target)
}
</script>

<template>
  <div v-if="total > pageSize" class="pagination">
    <span>共 {{ total }} 条 · 第 {{ page }} / {{ pageCount }} 页</span>
    <button class="btn btn-sm" type="button" :disabled="disabled || page <= 1" @click="go(page - 1)">
      上一页
    </button>
    <button
      class="btn btn-sm"
      type="button"
      :disabled="disabled || page >= pageCount"
      @click="go(page + 1)"
    >
      下一页
    </button>
  </div>
</template>
