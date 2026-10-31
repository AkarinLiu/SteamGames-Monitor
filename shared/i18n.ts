export const UI_LOCALES = [
  'zh-CN',
  'zh-TW',
  'en',
  'de',
  'fr',
  'it',
  'ja',
  'ko',
  'ko-KP',
  'nl',
  'ru',
] as const

export type UiLocale = (typeof UI_LOCALES)[number]

export const DEFAULT_UI_LOCALE: UiLocale = 'zh-CN'

export function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === 'string' && (UI_LOCALES as readonly string[]).includes(value)
}

export function resolveUiLocale(value: string | null | undefined): UiLocale {
  return isUiLocale(value) ? value : DEFAULT_UI_LOCALE
}

export function localeFromLanguageTag(tag: string): UiLocale {
  const normalized = tag.replace('_', '-').toLowerCase()
  if (normalized === 'zh-tw' || normalized === 'zh-hk' || normalized === 'zh-hant') {
    return 'zh-TW'
  }
  if (normalized.startsWith('zh')) return 'zh-CN'
  if (normalized.startsWith('ko-kp') || normalized === 'ko-kp') return 'ko-KP'
  if (normalized.startsWith('ko')) return 'ko'
  if (normalized.startsWith('en')) return 'en'
  if (normalized.startsWith('de')) return 'de'
  if (normalized.startsWith('fr')) return 'fr'
  if (normalized.startsWith('it')) return 'it'
  if (normalized.startsWith('ja')) return 'ja'
  if (normalized.startsWith('nl')) return 'nl'
  if (normalized.startsWith('ru')) return 'ru'
  return 'zh-CN'
}
