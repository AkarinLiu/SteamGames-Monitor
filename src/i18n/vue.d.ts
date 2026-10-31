import type { t, tf } from './index'

declare module 'vue' {
  interface ComponentCustomProperties {
    $t: typeof t
    $tf: typeof tf
  }
}

export {}
