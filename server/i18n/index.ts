import { resolveUiLocale, type UiLocale } from '../../shared/i18n'
import type { EventType } from '../../shared/types'
import { de } from './de'
import { en } from './en'
import { fr } from './fr'
import { it } from './it'
import { ja } from './ja'
import { ko } from './ko'
import { koKP } from './ko-KP'
import { nl } from './nl'
import { ru } from './ru'
import { zhCN, type BotMessages } from './zh-CN'
import { zhTW } from './zh-TW'

export type { BotMessages }

const catalogs: Record<UiLocale, BotMessages> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  en,
  de,
  fr,
  it,
  ja,
  ko,
  'ko-KP': koKP,
  nl,
  ru,
}

export function botMessages(locale: string | null | undefined): BotMessages {
  return catalogs[resolveUiLocale(locale)]
}

export function formatBotMessage(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  )
}

const EVENT_LABEL_KEYS: Record<EventType, keyof BotMessages> = {
  release: 'eventRelease',
  release_date: 'eventReleaseDate',
  sale_start: 'eventSaleStart',
  sale_change: 'eventSaleChange',
  sale_end: 'eventSaleEnd',
  price_change: 'eventPriceChange',
  delisting_warning: 'eventDelistingWarning',
  delisted: 'eventDelisted',
  restored: 'eventRestored',
  check_error: 'eventCheckError',
}

export function eventLabel(type: string, messages: BotMessages): string {
  const key = EVENT_LABEL_KEYS[type as EventType]
  return key ? messages[key] : type
}
