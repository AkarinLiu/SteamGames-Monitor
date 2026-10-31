<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { APP_NAME } from '@shared/constants'
import { useSessionStore } from '@/stores/session'
import { describeError } from '@/api/client'
import ErrorBanner from '@/components/ErrorBanner.vue'
import LocaleSelect from '@/components/LocaleSelect.vue'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const form = reactive({ username: '', password: '' })
const error = ref('')
const busy = ref(false)

async function submit(): Promise<void> {
  error.value = ''
  busy.value = true
  try {
    await session.login(form.username, form.password)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
    if (redirect && redirect.startsWith('/')) {
      await router.replace(redirect)
    } else if (session.needsPasswordChange) {
      await router.replace({ name: 'change-password' })
    } else if (!session.isOnboarded) {
      await router.replace({ name: 'onboarding' })
    } else {
      await router.replace({ name: 'dashboard' })
    }
  } catch (err) {
    error.value = describeError(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="auth-shell">
    <div class="auth-card" style="max-width: 420px">
      <div class="inline" style="justify-content: space-between">
        <div class="brand" style="padding: 0 0 8px">
          <span class="brand-mark">S</span>
          <span>{{ $t(APP_NAME) }}</span>
        </div>
        <LocaleSelect />
      </div>
      <h1>{{ $t("登录") }}</h1>
      <p class="muted">{{ $t("使用管理员分配的账号登录。没有账号请联系系统管理员创建。") }}</p>

      <ErrorBanner :message="error" />

      <form @submit.prevent="submit">
        <div class="field">
          <label for="login-username">{{ $t("用户名") }}</label>
          <input
            id="login-username"
            v-model="form.username"
            class="input"
            required
            autocomplete="username"
            autofocus
          />
        </div>
        <div class="field">
          <label for="login-password">{{ $t("密码") }}</label>
          <input
            id="login-password"
            v-model="form.password"
            class="input"
            type="password"
            required
            autocomplete="current-password"
          />
        </div>
        <button class="btn btn-primary" type="submit" :disabled="busy" style="width: 100%">
          {{ busy ? $t("登录中…") : $t("登录") }}
        </button>
      </form>
    </div>
  </main>
</template>
