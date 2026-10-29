<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  APP_NAME,
  LANGUAGE_OPTIONS,
  LIMITS,
  REGION_OPTIONS,
  TIMEZONE_OPTIONS,
} from '@shared/constants'
import { useSessionStore } from '@/stores/session'
import { describeError } from '@/api/client'
import ErrorBanner from '@/components/ErrorBanner.vue'

const router = useRouter()
const session = useSessionStore()

const form = reactive({
  username: '',
  displayName: '',
  password: '',
  confirm: '',
  region: '',
  language: '',
  timezone: '',
  pollMinutes: 60,
  minDiscountPercent: LIMITS.defaultMinDiscountPercent,
})

const error = ref('')
const busy = ref(false)

async function submit(): Promise<void> {
  error.value = ''
  if (form.password !== form.confirm) {
    error.value = '两次输入的密码不一致'
    return
  }
  if (form.password.length < LIMITS.passwordMinLength) {
    error.value = `密码至少需要 ${LIMITS.passwordMinLength} 位`
    return
  }
  if (!form.region || !form.language || !form.timezone) {
    error.value = '请选择区域、语言和时区'
    return
  }
  busy.value = true
  try {
    await session.completeSetup({
      username: form.username,
      displayName: form.displayName,
      password: form.password,
      region: form.region,
      language: form.language,
      timezone: form.timezone,
      pollIntervalSeconds: Math.round(form.pollMinutes * 60),
      minDiscountPercent: form.minDiscountPercent,
    })
    await router.replace({ name: 'dashboard' })
  } catch (err) {
    error.value = describeError(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="auth-shell">
    <div class="auth-card">
      <div class="brand" style="padding: 0 0 8px">
        <span class="brand-mark">S</span>
        <span>{{ APP_NAME }}</span>
      </div>
      <h1>初始化系统</h1>
      <p class="muted">
        创建首个管理员账号。初始化完成后此页面会自动失效。请在任何情况下都不要把未初始化的实例直接暴露在公网。
      </p>

      <ErrorBanner :message="error" />

      <form @submit.prevent="submit">
        <div class="grid-2">
          <div class="field">
            <label for="setup-username">用户名</label>
            <input id="setup-username" v-model="form.username" class="input" required autocomplete="username" />
            <span class="field-hint">字母、数字、下划线、点或短横线，至少 3 位</span>
          </div>
          <div class="field">
            <label for="setup-display">显示名称</label>
            <input id="setup-display" v-model="form.displayName" class="input" required />
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="setup-password">密码</label>
            <input id="setup-password" v-model="form.password" class="input" type="password" required autocomplete="new-password" />
            <span class="field-hint">至少 {{ LIMITS.passwordMinLength }} 位</span>
          </div>
          <div class="field">
            <label for="setup-confirm">确认密码</label>
            <input id="setup-confirm" v-model="form.confirm" class="input" type="password" required autocomplete="new-password" />
          </div>
        </div>

        <div class="divider" />
        <p class="small muted">区域与语言决定 Steam 商店返回的货币与文案，初始化后仍可在个人设置中修改。</p>

        <div class="grid-3">
          <div class="field">
            <label for="setup-region">区域</label>
            <select id="setup-region" v-model="form.region" class="select" required>
              <option value="" disabled>请选择区域</option>
              <option v-for="option in REGION_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
          <div class="field">
            <label for="setup-language">语言</label>
            <select id="setup-language" v-model="form.language" class="select" required>
              <option value="" disabled>请选择语言</option>
              <option v-for="option in LANGUAGE_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
          <div class="field">
            <label for="setup-tz">时区</label>
            <select id="setup-tz" v-model="form.timezone" class="select" required>
              <option value="" disabled>请选择时区</option>
              <option v-for="zone in TIMEZONE_OPTIONS" :key="zone" :value="zone">{{ zone }}</option>
            </select>
          </div>
        </div>

        <div class="grid-2">
          <div class="field">
            <label for="setup-poll">默认轮询间隔（分钟）</label>
            <input
              id="setup-poll"
              v-model.number="form.pollMinutes"
              class="input"
              type="number"
              min="15"
              max="240"
            />
          </div>
          <div class="field">
            <label for="setup-discount">最低通知折扣（%）</label>
            <input
              id="setup-discount"
              v-model.number="form.minDiscountPercent"
              class="input"
              type="number"
              min="1"
              max="100"
            />
          </div>
        </div>

        <button class="btn btn-primary" type="submit" :disabled="busy">
          {{ busy ? '初始化中…' : '创建管理员并进入系统' }}
        </button>
      </form>
    </div>
  </main>
</template>
