import { describe, expect, it } from 'vitest'
import type { MonitorEvent } from '../../shared/types'
import type { MonitorRow } from '../db/rows'
import { renderEventMessage, renderTestMessage } from './render'

const monitor = {
  id: 7,
  appid: 123,
  name: 'Test Game',
  store_url: 'https://store.steampowered.com/app/123/',
  region: 'us',
  language: 'english',
} as unknown as MonitorRow

const event: MonitorEvent = {
  id: 11,
  monitorId: 7,
  userId: 1,
  type: 'check_error',
  severity: 'warning',
  payload: {
    name: 'Test Game',
    region: 'us',
    consecutiveFailures: 3,
    errorCode: 'http',
  },
  source: 'steam',
  createdAt: 1_800_000_000_000,
}

describe('notification rendering locale', () => {
  it('renders event notifications in the requested locale', () => {
    const message = renderEventMessage(event, monitor, 'UTC', 'en')

    expect(message.title).toBe('[Check error] Test Game')
    expect(message.text).toContain('3 consecutive check failures (http).')
    expect(message.text).toContain('Item: Test Game (appid 123)')
    expect(message.text).toContain('Region: us')
    expect(message.markdown).toContain('[View on Steam]')
    expect(message.html).toContain('View on Steam')
    expect(message.webhook).toMatchObject({
      title: '[Check error] Test Game',
      eventType: 'check_error',
    })
  })

  it('renders test notifications in the requested locale', () => {
    const message = renderTestMessage('Webhook', 'UTC', 'en')

    expect(message.title).toBe('[Test] Steam Monitor')
    expect(message.text).toContain('Notification channel "Webhook" is configured successfully.')
    expect(message.webhook).toMatchObject({ title: '[Test] Steam Monitor', kind: 'test' })
  })

  it('renders release date announcements with the previous date', () => {
    const message = renderEventMessage(
      {
        ...event,
        type: 'release_date',
        payload: {
          name: 'Test Game',
          region: 'us',
          releaseDateText: 'Oct 29, 2026',
          previousReleaseDateText: 'Coming soon',
        },
      },
      monitor,
      'UTC',
      'en',
    )

    expect(message.title).toBe('[Release date announced] Test Game')
    expect(message.text).toContain('Release date confirmed: Oct 29, 2026')
    expect(message.text).toContain('Previous release date: Coming soon')
  })

  it('falls back to Chinese for unsupported locales', () => {
    const message = renderTestMessage('Webhook', 'UTC', 'not-a-locale')
    expect(message.title).toBe('【测试通知】Steam 监控')
  })
})
