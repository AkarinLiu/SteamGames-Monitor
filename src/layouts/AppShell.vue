<script setup lang="ts">
import { t } from '@/i18n'

import { ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { APP_NAME } from '@shared/constants'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import LocaleSelect from '@/components/LocaleSelect.vue'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const toast = useToastStore()
const menuOpen = ref(false)

watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
  },
)

function navActive(...names: string[]): boolean {
  return typeof route.name === 'string' && names.includes(route.name)
}

async function logout(): Promise<void> {
  try {
    await session.logout()
    toast.success(t("已退出登录"))
    await router.replace({ name: 'login' })
  } catch {
    toast.error(t("退出失败，请重试"))
  }
}
</script>

<template>
  <div class="app-shell">
    <aside class="app-sidebar" :class="{ open: menuOpen }">
      <RouterLink :to="{ name: 'dashboard' }" class="brand">
        <span class="brand-mark">S</span>
        <span>{{ $t(APP_NAME) }}</span>
      </RouterLink>

      <div class="nav-section">{{ $t("监控") }}</div>
      <RouterLink :to="{ name: 'dashboard' }" class="nav-link" :class="{ active: navActive('dashboard') }" active-class="" exact-active-class="">{{ $t("概览") }}</RouterLink>
      <RouterLink :to="{ name: 'monitors' }" class="nav-link" :class="{ active: navActive('monitors', 'monitor-detail') }" active-class="" exact-active-class="">{{ $t("监控项") }}</RouterLink>
      <RouterLink :to="{ name: 'events' }" class="nav-link" :class="{ active: navActive('events') }" active-class="" exact-active-class="">{{ $t("事件记录") }}</RouterLink>

      <div class="nav-section">{{ $t("通知与机器人") }}</div>
      <RouterLink :to="{ name: 'channels' }" class="nav-link" :class="{ active: navActive('channels') }" active-class="" exact-active-class="">{{ $t("通知渠道") }}</RouterLink>
      <RouterLink :to="{ name: 'bots' }" class="nav-link" :class="{ active: navActive('bots', 'bot-authorize') }" active-class="" exact-active-class="">{{ $t("指令机器人") }}</RouterLink>

      <template v-if="session.isAdmin">
        <div class="nav-section">{{ $t("管理") }}</div>
        <RouterLink :to="{ name: 'admin-users' }" class="nav-link" :class="{ active: navActive('admin-users') }" active-class="" exact-active-class="">{{ $t("用户管理") }}</RouterLink>
        <RouterLink :to="{ name: 'admin-system' }" class="nav-link" :class="{ active: navActive('admin-system') }" active-class="" exact-active-class="">{{ $t("系统状态") }}</RouterLink>
      </template>

      <div class="nav-section">{{ $t("其他") }}</div>
      <RouterLink :to="{ name: 'settings' }" class="nav-link" :class="{ active: navActive('settings') }" active-class="" exact-active-class="">{{ $t("个人设置") }}</RouterLink>
      <RouterLink :to="{ name: 'help' }" class="nav-link" :class="{ active: navActive('help') }" active-class="" exact-active-class="">{{ $t("帮助") }}</RouterLink>

      <div class="sidebar-spacer" />
      <div class="sidebar-footer">
        <div>
          <div style="color: var(--color-text-strong)">{{ session.user?.displayName }}</div>
          <div class="faint">@{{ session.user?.username }}</div>
        </div>
        <button class="btn btn-sm" type="button" @click="logout">{{ $t("退出登录") }}</button>
      </div>
    </aside>

    <div class="app-main">
      <header class="app-header">
        <div class="inline">
          <button
            class="btn btn-sm mobile-only"
            type="button"
            :aria-label='$t("打开菜单")'
            @click="menuOpen = !menuOpen"
          > {{ $t("菜单") }} </button>
          <span class="mobile-only" style="color: var(--color-text-strong); font-weight: 600">{{ $t(APP_NAME) }}</span>
          <span v-if="route.name === 'dashboard'" class="header-status">
            <span class="status-dot" />{{ $t("自动刷新 30 秒") }} </span>
        </div>
        <div class="inline">
          <LocaleSelect />
          <span v-if="session.user?.region" class="badge badge-neutral">
            {{ session.user.region.toUpperCase() }} / {{ session.user.language }}
          </span>
          <span v-if="session.isAdmin" class="badge badge-accent">{{ $t("管理员") }}</span>
        </div>
      </header>

      <main class="app-content">
        <RouterView />
      </main>
    </div>

    <div v-if="menuOpen" class="mobile-only" style="position: fixed; inset: 0; z-index: 18" @click="menuOpen = false" />
  </div>
</template>
