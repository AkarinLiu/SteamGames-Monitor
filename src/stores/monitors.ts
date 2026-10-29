import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Monitor, MonitorDetail } from '@shared/types'
import type { CreateMonitorInput, UpdateMonitorInput } from '@shared/schemas'
import { api } from '@/api/client'

export interface MonitorStats {
  total: number
  available: number
  onSale: number
  unavailable: number
  comingSoon: number
  paused: number
  lastCheckAt: number | null
}

export interface MonitorListFilters {
  q?: string
  status?: string
  page?: number
  pageSize?: number
  sort?: string
}

interface MonitorListResponse {
  items: Monitor[]
  total: number
  page: number
  pageSize: number
  stats: MonitorStats
  quota: { used: number; limit: number }
}

export interface ImportDlcResponse {
  items: Monitor[]
  skipped: number
  failed: number
}

export const useMonitorsStore = defineStore('monitors', () => {
  const items = ref<Monitor[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(20)
  const stats = ref<MonitorStats | null>(null)
  const quota = ref<{ used: number; limit: number } | null>(null)
  const loading = ref(false)

  async function fetchList(filters: MonitorListFilters = {}): Promise<void> {
    loading.value = true
    try {
      const params = new URLSearchParams()
      if (filters.q) params.set('q', filters.q)
      if (filters.status && filters.status !== 'all') params.set('status', filters.status)
      if (filters.sort) params.set('sort', filters.sort)
      params.set('page', String(filters.page ?? 1))
      params.set('pageSize', String(filters.pageSize ?? pageSize.value))
      const result = await api.get<MonitorListResponse>(`/monitors?${params.toString()}`)
      items.value = result.items
      total.value = result.total
      page.value = result.page
      pageSize.value = result.pageSize
      stats.value = result.stats
      quota.value = result.quota
    } finally {
      loading.value = false
    }
  }

  async function fetchDetail(id: number): Promise<MonitorDetail> {
    const result = await api.get<{ monitor: MonitorDetail }>(`/monitors/${id}`)
    return result.monitor
  }

  async function create(input: CreateMonitorInput): Promise<Monitor> {
    const result = await api.post<{ monitor: Monitor }>('/monitors', input)
    return result.monitor
  }

  async function importDlc(query: string, max?: number): Promise<ImportDlcResponse> {
    return api.post<ImportDlcResponse>('/monitors/import-dlc', { query, max })
  }

  async function update(id: number, input: UpdateMonitorInput): Promise<Monitor> {
    const result = await api.patch<{ monitor: Monitor }>(`/monitors/${id}`, input)
    const index = items.value.findIndex((item) => item.id === id)
    if (index >= 0 && items.value[index]) items.value[index] = result.monitor
    return result.monitor
  }

  async function check(id: number): Promise<Monitor | null> {
    const result = await api.post<{ monitor: Monitor | null }>(`/monitors/${id}/check`)
    return result.monitor
  }

  async function pause(id: number): Promise<Monitor | null> {
    const result = await api.post<{ monitor: Monitor | null }>(`/monitors/${id}/pause`)
    return result.monitor
  }

  async function resume(id: number): Promise<Monitor | null> {
    const result = await api.post<{ monitor: Monitor | null }>(`/monitors/${id}/resume`)
    return result.monitor
  }

  async function remove(id: number): Promise<void> {
    await api.delete(`/monitors/${id}`)
    items.value = items.value.filter((item) => item.id !== id)
  }

  return {
    items,
    total,
    page,
    pageSize,
    stats,
    quota,
    loading,
    fetchList,
    fetchDetail,
    create,
    importDlc,
    update,
    check,
    pause,
    resume,
    remove,
  }
})
