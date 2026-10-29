import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ChannelType, NotificationChannel } from '@shared/types'
import { api } from '@/api/client'

export interface ChannelView extends NotificationChannel {
  config: Record<string, unknown>
  configError?: string
}

export interface ChannelPayload {
  name: string
  type: ChannelType
  enabled: boolean
  eventTypes: string[]
  config: Record<string, unknown>
}

export interface ChannelTestResult {
  ok: boolean
  httpStatus: number | null
  error: string | null
  latencyMs: number
}

export const useChannelsStore = defineStore('channels', () => {
  const items = ref<ChannelView[]>([])
  const quota = ref<{ used: number; limit: number } | null>(null)
  const loading = ref(false)

  async function fetchAll(): Promise<void> {
    loading.value = true
    try {
      const result = await api.get<{ items: ChannelView[]; quota: { used: number; limit: number } }>(
        '/channels',
      )
      items.value = result.items
      quota.value = result.quota
    } finally {
      loading.value = false
    }
  }

  async function create(payload: ChannelPayload): Promise<ChannelView> {
    const result = await api.post<{ channel: ChannelView }>('/channels', payload)
    await fetchAll()
    return result.channel
  }

  async function update(id: number, patch: Record<string, unknown>): Promise<ChannelView> {
    const result = await api.patch<{ channel: ChannelView }>(`/channels/${id}`, patch)
    await fetchAll()
    return result.channel
  }

  async function remove(id: number): Promise<void> {
    await api.delete(`/channels/${id}`)
    await fetchAll()
  }

  async function test(id: number): Promise<ChannelTestResult> {
    const result = await api.post<ChannelTestResult>(`/channels/${id}/test`)
    await fetchAll()
    return result
  }

  return { items, quota, loading, fetchAll, create, update, remove, test }
})
