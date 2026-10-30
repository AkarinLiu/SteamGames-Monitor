import type { DingtalkConnectionMode } from '../../../shared/types'
import type { DingtalkBotConfig } from '../types'

export function resolveDingtalkConnectionMode(
  config: DingtalkBotConfig | undefined,
): DingtalkConnectionMode {
  return config?.connectionMode === 'stream' ? 'stream' : 'webhook'
}
