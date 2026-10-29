import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

let nextId = 1

export const useToastStore = defineStore('toast', () => {
  const items = ref<ToastItem[]>([])

  function dismiss(id: number): void {
    items.value = items.value.filter((item) => item.id !== id)
  }

  function push(message: string, kind: ToastKind = 'info', ttl = 4200): void {
    const id = nextId++
    items.value = [...items.value, { id, message, kind }]
    window.setTimeout(() => dismiss(id), ttl)
  }

  return {
    items,
    push,
    dismiss,
    success: (message: string) => push(message, 'success'),
    error: (message: string) => push(message, 'error', 6000),
  }
})
