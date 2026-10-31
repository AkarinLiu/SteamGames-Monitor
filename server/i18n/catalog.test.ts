import { describe, expect, it } from 'vitest'
import { UI_LOCALES } from '../../shared/i18n'
import { botMessages } from './index'
import { zhCN } from './zh-CN'

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort()
}

describe('bot message catalogs', () => {
  for (const locale of UI_LOCALES) {
    it(`${locale} covers every key and preserves placeholders`, () => {
      const messages = botMessages(locale)
      for (const key of Object.keys(zhCN) as Array<keyof typeof zhCN>) {
        const value = messages[key]
        expect(value.trim(), `${locale}: ${key}`).not.toBe('')
        expect(placeholders(value), `${locale}: ${key}`).toEqual(placeholders(zhCN[key]))
      }
    })
  }
})
