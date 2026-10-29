<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="empty-state">
    <h1>404</h1>
    <p>页面不存在，或链接已经失效。</p>
    <RouterLink :to="{ name: 'dashboard' }" class="btn btn-primary">返回概览</RouterLink>
  </div>
</template>
