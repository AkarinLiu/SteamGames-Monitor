import type { NewsMatchMode } from '../../shared/types'

export type NewsMatchField = 'title' | 'contents'

export interface NewsKeywordMatch {
  /** The configured keyword, in its original casing. */
  keyword: string
  field: NewsMatchField
  /** Offset inside the normalized field text, kept for diagnostics. */
  index: number
}

interface CompiledKeyword {
  keyword: string
  regex: RegExp
  weight: number
  /** Keywords whose own wording is already negative (e.g. "no longer available"). */
  selfNegated: boolean
}

const MAX_NEGATION_LOOKBEHIND = 80
const MAX_BENIGN_LOOKAHEAD = 48

/**
 * Negation cues that turn "will be delisted" into "will not be delisted" or
 * "不会下架". Deliberately excludes "no longer" and "不再" because those are
 * positive delisting signals.
 */
const NEGATION_RE =
  /(?:\bnot\b|\bnever\b|\bwithout\b|\bno plans?\b|\bno intention\b|\bden(?:y|ies|ied)\b|\bisn['’]t\b|\baren['’]t\b|\bwasn['’]t\b|\bweren['’]t\b|\bdon['’]t\b|\bdoesn['’]t\b|\bdidn['’]t\b|\bwon['’]t\b|\bhasn['’]t\b|\bhaven['’]t\b|\bhadn['’]t\b|不会|不會|并未|並未|没有|沒有|无意|無意|不打算|暂无|暫無|暂不|暫不|尚未|否认|否認|辟谣|闢謠|未计划|未計劃|不准备|不準備|从未|從未)/i

/** "not only ... but also" is an additive phrase, not a negation. */
const NOT_ONLY_RE = /\bnot only\b|不仅|不僅/i

/** A negation stops applying once the sentence turns to a contrasting clause. */
const CONTRAST_RE = /\b(?:but|however|yet|though|although)\b|但是|不过|然而|而是/i

/**
 * A hit followed by one of these is about something other than the product
 * leaving the store: a price change, a subscription catalogue, a demo, a
 * pre-order window or temporary maintenance.
 */
const BENIGN_FOLLOW_UP_RE =
  /(?:for free|free of charge|free-to-play|\bgame\s?pass\b|\bea play\b|\bubisoft\+|\bplaystation plus\b|\bps plus\b|\bprime gaming\b|\bgeforce now\b|\bamazon luna\b|\bswitch online\b|\bpre-?order\b|\bearly access\b|\bmaintenance\b|\bdemo\b|\bbeta\b|\bplaytest\b|\bsoundtrack\b|免费|免費|预购|預購|抢先体验|搶先體驗|试玩|試玩|體驗版|体験版|체험판)/i

/** Keywords whose own wording is already negative. */
const SELF_NEGATED_RE = /(?:\bnot\b|\bno longer\b|\bwon['’]?t\b|不会|不會|不再)/i

const cache = new Map<string, CompiledKeyword | null>()
const MAX_CACHE_ENTRIES = 500

function normalizeText(text: string): string {
  // NFKC folds full-width Latin letters and compatibility characters so a
  // keyword matches regardless of how the announcement was typed. Curly
  // apostrophes are folded too, so a keyword typed with a straight quote still
  // matches Steam's typographic "won’t".
  return text.normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'")
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compileKeyword(keyword: string): CompiledKeyword | null {
  const display = keyword.trim()
  if (!display) return null

  const cached = cache.get(display)
  if (cached !== undefined) return cached

  const needle = normalizeText(display)
  const body = needle
    .split(/\s+/)
    .map((part) => escapeRegExp(part).replace(/'/g, "['’]"))
    .join('\\s+')
  // A left word boundary stops short keywords such as "sale" from matching
  // "wholesale" or "resale". There is deliberately no right boundary so
  // "delist" also catches "delisted" and "delisting".
  const left = /^[a-z0-9]/.test(needle) ? '(?<![a-z0-9])' : ''

  const compiled: CompiledKeyword = {
    keyword: display,
    regex: new RegExp(left + body, 'g'),
    weight: Array.from(needle).length,
    selfNegated: SELF_NEGATED_RE.test(needle),
  }
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear()
  cache.set(display, compiled)
  return compiled
}

function lastClause(text: string): string {
  return text.match(/[^.!?。！？;；\n]*$/)?.[0] ?? text
}

function firstClause(text: string): string {
  const cut = text.search(/[.!?。！？;；\n]/)
  return cut === -1 ? text : text.slice(0, cut)
}

function isNegated(text: string, index: number): boolean {
  const window = text.slice(Math.max(0, index - MAX_NEGATION_LOOKBEHIND), index)
  const clause = lastClause(window)
  if (!clause) return false
  const tail = clause.split(CONTRAST_RE).pop() ?? clause
  if (!tail) return false
  if (NOT_ONLY_RE.test(tail)) return false
  return NEGATION_RE.test(tail)
}

function isBenignFollowUp(text: string, end: number): boolean {
  const rest = text.slice(end, end + MAX_BENIGN_LOOKAHEAD)
  if (!rest) return false
  return BENIGN_FOLLOW_UP_RE.test(firstClause(rest))
}

/**
 * Finds the most specific delisting keyword in a news item.
 *
 * Title hits always win over body hits; within the same field the longest
 * keyword wins, so "即将下架" is reported instead of the shorter "下架".
 */
export function findNewsKeyword(
  item: { title: string; contents: string },
  keywords: readonly string[],
  mode: NewsMatchMode,
): NewsKeywordMatch | null {
  const fields: NewsMatchField[] = mode === 'title' ? ['title'] : ['title', 'contents']
  let best: NewsKeywordMatch | null = null
  let bestWeight = -1

  for (const field of fields) {
    const text = normalizeText(item[field] ?? '')
    if (!text) continue

    for (const keyword of keywords) {
      const compiled = compileKeyword(keyword)
      if (!compiled) continue

      compiled.regex.lastIndex = 0
      for (let match = compiled.regex.exec(text); match; match = compiled.regex.exec(text)) {
        const index = match.index
        if (!compiled.selfNegated && isNegated(text, index)) continue
        if (isBenignFollowUp(text, index + match[0].length)) continue

        const weight = compiled.weight + (field === 'title' ? 1000 : 0)
        if (weight > bestWeight) {
          bestWeight = weight
          best = { keyword: compiled.keyword, field, index }
        }
        break
      }
    }
  }

  return best
}
