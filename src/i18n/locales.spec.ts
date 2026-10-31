import { describe, expect, it } from 'vitest'
import keys from './keys.json'
import en from './locales/en.json'
import de from './locales/de.json'
import fr from './locales/fr.json'
import itLocale from './locales/it.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'
import koKP from './locales/ko-KP.json'
import nl from './locales/nl.json'
import ru from './locales/ru.json'
import zhTW from './locales/zh-TW.json'
import { localeFromLanguageTag } from './index'

const locales: Record<string, Record<string, string>> = {
  en,
  de,
  fr,
  it: itLocale,
  ja,
  ko,
  'ko-KP': koKP,
  nl,
  ru,
  'zh-TW': zhTW,
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort()
}

describe('UI locale dictionaries', () => {
  for (const [locale, messages] of Object.entries(locales)) {
    it(`${locale} covers every key and preserves placeholders`, () => {
      const missing = keys.filter((key) => !(key in messages))
      expect(missing).toEqual([])
      for (const key of keys) {
        const value = messages[key] ?? ''
        expect(value.trim(), `${locale}: ${key}`).not.toBe('')
        expect(placeholders(value), `${locale}: ${key}`).toEqual(placeholders(key))
      }
    })
  }

  it('maps browser language tags to UI locales', () => {
    expect(localeFromLanguageTag('zh-HK')).toBe('zh-TW')
    expect(localeFromLanguageTag('zh-CN')).toBe('zh-CN')
    expect(localeFromLanguageTag('en-US')).toBe('en')
    expect(localeFromLanguageTag('ko-KP')).toBe('ko-KP')
    expect(localeFromLanguageTag('ru-RU')).toBe('ru')
  })
})
