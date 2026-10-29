import type { Context } from 'hono'
import type { UserRow } from '../db/rows'

export type AppBindings = {
  Variables: {
    requestId: string
    user?: UserRow
    sessionTokenHash?: string
  }
}

export type AppContext = Context<AppBindings>
