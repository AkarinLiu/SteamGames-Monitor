import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AdminUserSummary, SystemSettings } from '@shared/types'
import type { CreateUserInput, UpdateUserInput } from '@shared/schemas'
import { api } from '@/api/client'

export interface AdminHealth {
  uptimeSeconds: number
  env: string
  monitors: {
    total: number
    enabled: number
    dueNow: number
    dueNewsNow: number
    maxTotal: number
  }
  scheduler: { running: boolean; inflightGroups: number }
  newsScanner: { running: boolean }
  delivery: {
    running: boolean
    pending: number
    sending: number
    failed24h: number
    oldestPendingAt: number | null
  }
  steam: {
    capacity: number
    tokensRemaining: number
    cooldownUntil: number | null
    cooldownMs: number
  }
  cacheTtlSeconds: number
}

export const useAdminStore = defineStore('admin', () => {
  const users = ref<AdminUserSummary[]>([])
  const settings = ref<SystemSettings | null>(null)
  const health = ref<AdminHealth | null>(null)
  const loading = ref(false)

  async function fetchUsers(): Promise<void> {
    loading.value = true
    try {
      const result = await api.get<{ users: AdminUserSummary[] }>('/admin/users')
      users.value = result.users
    } finally {
      loading.value = false
    }
  }

  async function createUser(input: CreateUserInput): Promise<AdminUserSummary> {
    const result = await api.post<{ user: AdminUserSummary }>('/admin/users', input)
    await fetchUsers()
    return result.user
  }

  async function updateUser(id: number, input: UpdateUserInput): Promise<void> {
    await api.patch(`/admin/users/${id}`, input)
    await fetchUsers()
  }

  async function resetPassword(id: number): Promise<string> {
    const result = await api.post<{ password: string }>(`/admin/users/${id}/reset-password`, {})
    return result.password
  }

  async function deleteUser(id: number): Promise<void> {
    await api.delete(`/admin/users/${id}`)
    await fetchUsers()
  }

  async function fetchSettings(): Promise<void> {
    const result = await api.get<{ settings: SystemSettings }>('/admin/settings')
    settings.value = result.settings
  }

  async function updateSettings(input: Record<string, unknown>): Promise<void> {
    const result = await api.patch<{ settings: SystemSettings }>('/admin/settings', input)
    settings.value = result.settings
  }

  async function fetchHealth(): Promise<void> {
    health.value = await api.get<AdminHealth>('/admin/health')
  }

  return {
    users,
    settings,
    health,
    loading,
    fetchUsers,
    createUser,
    updateUser,
    resetPassword,
    deleteUser,
    fetchSettings,
    updateSettings,
    fetchHealth,
  }
})
