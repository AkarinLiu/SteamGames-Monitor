import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  BotAccessRole,
  BotApp,
  BotConnectionStatus,
  BotPlatform,
  WecomQrPollResult,
  WecomQrSession,
} from '@shared/types'
import { api } from '@/api/client'

export interface BotView extends BotApp {
  config: Record<string, unknown>
  configError?: string
  webhookPath: string | null
  callbackUrl: string | null
  connection?: BotConnectionStatus | null
}

export interface BotPayload {
  platform: BotPlatform
  name: string
  enabled: boolean
  notifyEnabled?: boolean
  config: Record<string, unknown>
  apiBaseUrl?: string
}

export const useBotsStore = defineStore('bots', () => {
  const items = ref<BotView[]>([])
  const quota = ref<{ used: number; limit: number } | null>(null)
  const loading = ref(false)

  async function fetchAll(): Promise<void> {
    loading.value = true
    try {
      const result = await api.get<{ items: BotView[]; quota: { used: number; limit: number } }>(
        '/bots',
      )
      items.value = result.items
      quota.value = result.quota
    } finally {
      loading.value = false
    }
  }

  async function create(payload: BotPayload): Promise<BotView> {
    const result = await api.post<{ bot: BotView }>('/bots', payload)
    await fetchAll()
    return result.bot
  }

  async function update(id: number, patch: Record<string, unknown>): Promise<BotView> {
    const result = await api.patch<{ bot: BotView }>(`/bots/${id}`, patch)
    await fetchAll()
    return result.bot
  }

  async function remove(id: number): Promise<void> {
    await api.delete(`/bots/${id}`)
    await fetchAll()
  }

  async function addAllowlist(
    id: number,
    input: { platformUserId: string; displayName?: string; role: BotAccessRole },
  ): Promise<void> {
    await api.post(`/bots/${id}/allowlist`, input)
    await fetchAll()
  }

  async function removeAllowlist(id: number, platformUserId: string): Promise<void> {
    await api.delete(`/bots/${id}/allowlist/${encodeURIComponent(platformUserId)}`)
    await fetchAll()
  }

  async function testInbound(id: number, text: string): Promise<{ result: string; lines: string[] }> {
    return api.post<{ result: string; lines: string[] }>(`/bots/${id}/test-inbound`, { text })
  }

  async function startWecomQr(name?: string): Promise<WecomQrSession> {
    return api.post<WecomQrSession>('/bots/wecom/qr', { name })
  }

  async function pollWecomQr(sessionId: string): Promise<WecomQrPollResult> {
    return api.get<WecomQrPollResult>(`/bots/wecom/qr/${encodeURIComponent(sessionId)}`)
  }

  async function cancelWecomQr(sessionId: string): Promise<void> {
    await api.delete(`/bots/wecom/qr/${encodeURIComponent(sessionId)}`)
  }

  return {
    items,
    quota,
    loading,
    fetchAll,
    create,
    update,
    remove,
    addAllowlist,
    removeAllowlist,
    testInbound,
    startWecomQr,
    pollWecomQr,
    cancelWecomQr,
  }
})
