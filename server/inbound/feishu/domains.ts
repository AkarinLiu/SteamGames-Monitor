import type { FeishuBrand, FeishuConnectionMode } from '../../../shared/types'
import type { FeishuBotConfig } from '../types'

export const FEISHU_API_BASE: Record<FeishuBrand, string> = {
  feishu: 'https://open.feishu.cn',
  lark: 'https://open.larksuite.com',
}

export const FEISHU_ACCOUNTS_BASE: Record<FeishuBrand, string> = {
  feishu: 'https://accounts.feishu.cn',
  lark: 'https://accounts.larksuite.com',
}

export function resolveFeishuBrand(config: FeishuBotConfig | undefined): FeishuBrand {
  return config?.brand === 'lark' ? 'lark' : 'feishu'
}

export function resolveFeishuConnectionMode(
  config: FeishuBotConfig | undefined,
): FeishuConnectionMode {
  return config?.connectionMode === 'websocket' ? 'websocket' : 'webhook'
}

export function resolveFeishuApiBase(
  config: FeishuBotConfig | undefined,
  override: string | null | undefined,
): string {
  return (override ?? FEISHU_API_BASE[resolveFeishuBrand(config)]).replace(/\/+$/, '')
}
