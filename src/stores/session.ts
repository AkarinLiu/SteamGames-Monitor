import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { PublicUser, SetupStatus } from '@shared/types'
import type { OnboardingInput, SetupInput } from '@shared/schemas'
import { api, ApiError, describeError } from '@/api/client'
import { useToastStore } from './toast'

export const useSessionStore = defineStore('session', () => {
  const user = ref<PublicUser | null>(null)
  const setupRequired = ref<boolean | null>(null)
  const setupLoaded = ref(false)
  const loaded = ref(false)
  const loading = ref(false)

  const isAdmin = computed(() => user.value?.role === 'admin')
  const needsPasswordChange = computed(() => user.value?.mustChangePassword === true)
  const isOnboarded = computed(
    () =>
      Boolean(user.value?.region) &&
      Boolean(user.value?.language) &&
      Boolean(user.value?.timezone) &&
      user.value?.onboardedAt !== null,
  )

  function setUser(next: PublicUser | null): void {
    user.value = next
    loaded.value = true
  }

  async function loadSetupStatus(): Promise<void> {
    try {
      const status = await api.get<SetupStatus>('/setup/status')
      setupRequired.value = status.setupRequired
    } catch {
      setupRequired.value = null
    } finally {
      setupLoaded.value = true
    }
  }

  async function load(): Promise<void> {
    if (loading.value) return
    loading.value = true
    try {
      const result = await api.get<{ user: PublicUser }>('/auth/me')
      setUser(result.user)
    } catch (error) {
      setUser(null)
      if (!(error instanceof ApiError && error.status === 401)) {
        useToastStore().error(describeError(error))
      }
    } finally {
      loading.value = false
      loaded.value = true
    }
  }

  async function login(username: string, password: string): Promise<void> {
    const result = await api.post<{ user: PublicUser }>('/auth/login', { username, password })
    setUser(result.user)
    setupRequired.value = false
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout')
    } finally {
      setUser(null)
    }
  }

  async function completeSetup(input: SetupInput): Promise<void> {
    const result = await api.post<{ user: PublicUser }>('/setup', input)
    setUser(result.user)
    setupRequired.value = false
  }

  async function completeOnboarding(input: OnboardingInput): Promise<{ monitorsReset: number }> {
    const result = await api.post<{ user: PublicUser; monitorsReset: number }>(
      '/auth/onboarding',
      input,
    )
    setUser(result.user)
    return { monitorsReset: result.monitorsReset }
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const result = await api.post<{ user: PublicUser }>('/auth/password', {
      currentPassword,
      newPassword,
    })
    setUser(result.user)
    useToastStore().success('密码已更新')
  }

  async function updateProfile(displayName: string): Promise<void> {
    const result = await api.patch<{ user: PublicUser }>('/me', { displayName })
    setUser(result.user)
  }

  async function updateSettings(input: Record<string, unknown>): Promise<{ regionChanged: boolean; monitorsReset: number }> {
    const result = await api.patch<{ user: PublicUser; regionChanged: boolean; monitorsReset: number }>(
      '/me/settings',
      input,
    )
    setUser(result.user)
    return { regionChanged: result.regionChanged, monitorsReset: result.monitorsReset }
  }

  return {
    user,
    setupRequired,
    setupLoaded,
    loaded,
    loading,
    isAdmin,
    needsPasswordChange,
    isOnboarded,
    setUser,
    loadSetupStatus,
    load,
    login,
    logout,
    completeSetup,
    completeOnboarding,
    changePassword,
    updateProfile,
    updateSettings,
  }
})
