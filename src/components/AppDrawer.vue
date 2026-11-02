<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
}>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

function close(): void {
  emit('update:open', false)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.open) close()
}

watch(
  () => props.open,
  (open) => {
    if (open) document.addEventListener('keydown', onKeydown)
    else document.removeEventListener('keydown', onKeydown)
    document.body.style.overflow = open ? 'hidden' : ''
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="drawer-backdrop" @click.self="close" />
    <Transition name="drawer-slide">
      <aside v-if="open" class="drawer" role="complementary" :aria-label="title">
        <header class="drawer-header">
          <div>
            <div class="drawer-title">{{ title }}</div>
          </div>
          <button class="btn btn-sm" type="button" :aria-label='$t("关闭")' @click="close">✕</button>
        </header>
        <div class="drawer-body">
          <slot />
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 30;
}
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(520px, 100%);
  background: var(--color-surface, #0f1115);
  border-left: 1px solid var(--color-border, #23262d);
  z-index: 31;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.3);
}
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #23262d);
}
.drawer-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-strong, #e6e8ee);
}
.drawer-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.25s ease;
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
}
</style>
