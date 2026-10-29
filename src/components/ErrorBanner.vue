<script setup lang="ts">
defineProps<{ message: string | null }>()
</script>

<template>
  <div v-if="message" class="banner banner-error" role="alert">
    <span class="flex-1">{{ message }}</span>
    <slot />
  </div>
</template>
