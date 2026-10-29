<script setup lang="ts">
import { ref } from 'vue'
import { LIMITS } from '@shared/constants'

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    max?: number
    placeholder?: string
  }>(),
  { max: LIMITS.maxNewsKeywords, placeholder: '输入关键词后回车添加' },
)
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const draft = ref('')
const error = ref('')

function add(): void {
  const value = draft.value.trim()
  if (!value) return
  if (value.length > LIMITS.keywordMaxLength) {
    error.value = `单个关键词最多 ${LIMITS.keywordMaxLength} 个字符`
    return
  }
  if (props.modelValue.includes(value)) {
    error.value = '关键词已存在'
    return
  }
  if (props.modelValue.length >= props.max) {
    error.value = `最多 ${props.max} 个关键词`
    return
  }
  error.value = ''
  emit('update:modelValue', [...props.modelValue, value])
  draft.value = ''
}

function remove(value: string): void {
  emit(
    'update:modelValue',
    props.modelValue.filter((item) => item !== value),
  )
}
</script>

<template>
  <div>
    <div class="inline" style="margin-bottom: 8px">
      <input
        v-model="draft"
        class="input flex-1"
        type="text"
        :placeholder="placeholder"
        :maxlength="LIMITS.keywordMaxLength"
        @keydown.enter.prevent="add"
      />
      <button class="btn" type="button" @click="add">添加</button>
    </div>
    <div v-if="modelValue.length" class="inline">
      <span v-for="keyword in modelValue" :key="keyword" class="badge badge-accent">
        {{ keyword }}
        <button class="btn-link small" type="button" aria-label="移除关键词" @click="remove(keyword)">
          ✕
        </button>
      </span>
    </div>
    <p v-else class="field-hint">尚未配置关键词，将使用默认下架关键词集合。</p>
    <p v-if="error" class="field-error">{{ error }}</p>
  </div>
</template>
