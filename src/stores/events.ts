import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { EventDeliverySummary, EventListItem } from '@shared/types'
import { api } from '@/api/client'

export type EventWithDeliveries = EventListItem & { deliveries: EventDeliverySummary }

export interface EventListFilters {
  type?: string
  monitorId?: number
  from?: number
  to?: number
  page?: number
  pageSize?: number
}

interface EventListResponse {
  items: EventWithDeliveries[]
  total: number
  page: number
  pageSize: number
}

export const useEventsStore = defineStore('events', () => {
  const items = ref<EventWithDeliveries[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(20)
  const loading = ref(false)

  async function fetchList(filters: EventListFilters = {}): Promise<void> {
    loading.value = true
    try {
      const params = new URLSearchParams()
      if (filters.type) params.set('type', filters.type)
      if (filters.monitorId) params.set('monitorId', String(filters.monitorId))
      if (filters.from !== undefined) params.set('from', String(filters.from))
      if (filters.to !== undefined) params.set('to', String(filters.to))
      params.set('page', String(filters.page ?? 1))
      params.set('pageSize', String(filters.pageSize ?? pageSize.value))
      const result = await api.get<EventListResponse>(`/events?${params.toString()}`)
      items.value = result.items
      total.value = result.total
      page.value = result.page
      pageSize.value = result.pageSize
    } finally {
      loading.value = false
    }
  }

  async function redeliver(eventId: number): Promise<number> {
    const result = await api.post<{ reset: number }>(`/events/${eventId}/redeliver`)
    return result.reset
  }

  return { items, total, page, pageSize, loading, fetchList, redeliver }
})
