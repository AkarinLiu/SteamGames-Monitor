<script setup lang="ts">
import { t, tf } from '@/i18n'

import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { APP_NAME, LIMITS } from '@shared/constants'
import { useSessionStore } from '@/stores/session'
import { describeError } from '@/api/client'
import LocaleSelect from '@/components/LocaleSelect.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'

const router = useRouter()
const session = useSessionStore()

const form = reactive({ currentPassword: '', newPassword: '', confirm: '' })
const error = ref('')
const busy = ref(false)

async function submit(): Promise<void> {
  error.value = ''
  if (form.newPassword !== form.confirm) {
    error.value = t("两次输入的新密码不一致")
    return
  }
  if (form.newPassword.length < LIMITS.passwordMinLength) {
    error.value = tf('密码至少需要 {min} 位', { min: LIMITS.passwordMinLength })
    return
  }
  if (form.newPassword === form.currentPassword) {
    error.value = t("新密码不能与当前密码相同")
    return
  }
  busy.value = true
  try {
    await session.changePassword(form.currentPassword, form.newPassword)
    if (!session.isOnboarded) {
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
    <div class="auth-card" style="max-width: 460px">
      <div class="inline" style="justify-content: space-between">
        <div class="brand" style="padding: 0 0 8px">
          <span class="brand-mark">S</span>
          <span>{{ $t(APP_NAME) }}</span>
        </div>
        <LocaleSelect />
      </div>
      <h1>{{ $t("修改密码") }}</h1>
      <p v-if="session.needsPasswordChange" class="banner banner-warning" style="margin-bottom: 14px"> {{ $t("当前使用的是管理员分配的临时密码，请先修改密码后继续使用。") }} </p>
      <p v-else class="muted">{{ $t("修改密码后，你在其他设备上的登录会话将被注销。") }}</p>

      <ErrorBanner :message="error" />

      <form @submit.prevent="submit">
        <div class="field">
          <label for="cp-current">{{ $t("当前密码") }}</label>
          <input
            id="cp-current"
            v-model="form.currentPassword"
            class="input"
            type="password"
            required
            autocomplete="current-password"
          />
        </div>
        <div class="field">
          <label for="cp-new">{{ $t("新密码") }}</label>
          <input
            id="cp-new"
            v-model="form.newPassword"
            class="input"
            type="password"
            required
            autocomplete="new-password"
          />
          <span class="field-hint">{{ $t("至少") }} {{ LIMITS.passwordMinLength }} {{ $t("位") }}</span>
        </div>
        <div class="field">
          <label for="cp-confirm">{{ $t("确认新密码") }}</label>
          <input
            id="cp-confirm"
            v-model="form.confirm"
            class="input"
            type="password"
            required
            autocomplete="new-password"
          />
        </div>
        <button class="btn btn-primary" type="submit" :disabled="busy" style="width: 100%">
          {{ busy ? $t("提交中…") : $t("更新密码") }}
        </button>
      </form>
    </div>
  </main>
</template>
