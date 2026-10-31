import { ref } from 'vue'
import type { App } from 'vue'
import { localeFromLanguageTag, type UiLocale } from '@shared/i18n'

export { localeFromLanguageTag }
export type { UiLocale }

export const UI_LOCALE_OPTIONS: Array<{ value: UiLocale; label: string }> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'ko-KP', label: '조선어' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'ru', label: 'Русский' },
]

const loaders: Record<
  Exclude<UiLocale, 'zh-CN'>,
  () => Promise<{ default: Record<string, string> }>
> = {
  'zh-TW': () => import('./locales/zh-TW.json'),
  en: () => import('./locales/en.json'),
  de: () => import('./locales/de.json'),
  fr: () => import('./locales/fr.json'),
  it: () => import('./locales/it.json'),
  ja: () => import('./locales/ja.json'),
  ko: () => import('./locales/ko.json'),
  'ko-KP': () => import('./locales/ko-KP.json'),
  nl: () => import('./locales/nl.json'),
  ru: () => import('./locales/ru.json'),
}

const activeMessages = ref<Record<string, string>>({})

const STORAGE_KEY = 'sgm.uiLocale'

function isUiLocale(value: string): value is UiLocale {
  return UI_LOCALE_OPTIONS.some((option) => option.value === value)
}

export function detectUiLocale(): UiLocale {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && isUiLocale(stored)) return stored
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of tags) {
    const locale = localeFromLanguageTag(tag)
    if (locale !== 'zh-CN' || tag.toLowerCase().startsWith('zh')) return locale
  }
  return 'zh-CN'
}

export function hasStoredUiLocale(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null
}

export const uiLocale = ref<UiLocale>('zh-CN')

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  )
}

export function t(
  key: string,
  params?: Record<string, string | number>,
): string {
  if (uiLocale.value === 'zh-CN') return interpolate(key, params)
  const translated = activeMessages.value[key] ?? key
  return interpolate(translated, params)
}

export function tf(
  template: string,
  params?: Record<string, string | number>,
): string {
  return t(template, params)
}

export function initUiLocale(): void {
  uiLocale.value = detectUiLocale()
  document.documentElement.lang = uiLocale.value
}

export function setUiLocale(locale: UiLocale): void {
  localStorage.setItem(STORAGE_KEY, locale)
  uiLocale.value = locale
  document.documentElement.lang = locale
  location.reload()
}

export async function installI18n(app: App): Promise<void> {
  initUiLocale()
  if (uiLocale.value !== 'zh-CN') {
    try {
      activeMessages.value = (await loaders[uiLocale.value]()).default
    } catch {
      activeMessages.value = {}
    }
  }
  app.config.globalProperties.$t = t
  app.config.globalProperties.$tf = tf
}
