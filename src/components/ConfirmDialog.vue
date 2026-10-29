<script setup lang="ts">
import Modal from './Modal.vue'

withDefaults(
  defineProps<{
    open: boolean
    title?: string
    message: string
    confirmText?: string
    danger?: boolean
    busy?: boolean
  }>(),
  { title: '请确认', confirmText: '确认', danger: false, busy: false },
)
const emit = defineEmits<{
  'update:open': [boolean]
  confirm: []
}>()
</script>

<template>
  <Modal
    :open="open"
    :title="title"
    width="440px"
    @update:open="emit('update:open', $event)"
  >
    <p class="muted" style="white-space: pre-line">{{ message }}</p>
    <template #footer>
      <button class="btn" type="button" :disabled="busy" @click="emit('update:open', false)">
        取消
      </button>
      <button
        class="btn"
        :class="danger ? 'btn-danger' : 'btn-primary'"
        type="button"
        :disabled="busy"
        @click="emit('confirm')"
      >
        {{ busy ? '处理中…' : confirmText }}
      </button>
    </template>
  </Modal>
</template>
