<script setup lang="ts">
defineProps<{
  label: string
  tone?: string
  title?: string
}>()
</script>

<template>
  <span class="badge" :class="tone ?? 'badge-neutral'" :title="title">{{ label }}</span>
</template>
