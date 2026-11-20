import { describe, expect, it } from 'vitest'
import { DEFAULT_NEWS_KEYWORDS, LIMITS } from '../../shared/constants'
import { findNewsKeyword } from './newsKeywords'

function keywordOf(
  title: string,
  contents = '',
  keywords: readonly string[] = DEFAULT_NEWS_KEYWORDS,
  mode: 'title' | 'any' = 'title',
): string | null {
  return findNewsKeyword({ title, contents }, keywords, mode)?.keyword ?? null
}

describe('findNewsKeyword', () => {
  it('matches explicit Chinese delisting wording and prefers the specific term', () => {
    expect(keywordOf('《某游戏》将于 6 月 30 日下架')).toBe('下架')
    expect(keywordOf('《某游戏》即将下架')).toBe('即将下架')
    expect(keywordOf('《某游戏》暂时下架公告')).toBe('暂时下架')
    expect(keywordOf('《某游戏》将于月底停服')).toBe('停服')
    expect(keywordOf('《某游戏》授权到期，将停止销售')).toBe('停止销售')
  })

  it('ignores Chinese negations and denials', () => {
    expect(keywordOf('官方确认《某游戏》不会下架')).toBeNull()
    expect(keywordOf('开发者表示暂不下架')).toBeNull()
    expect(keywordOf('发行商否认《某游戏》下架传闻')).toBeNull()
    expect(keywordOf('目前尚未停止销售')).toBeNull()
  })

  it('matches English delisting wording and inflections', () => {
    expect(keywordOf('Soon Gone will be delisted on June 1')).toBe('delisted')
    expect(keywordOf('Delisting notice for Soon Gone')).toBe('delisting')
    expect(keywordOf('Soon Gone has been removed from sale')).toBe('removed from sale')
    expect(keywordOf('Soon Gone will be removed from the Steam store')).toBe(
      'removed from the steam store',
    )
    expect(keywordOf('Soon Gone is no longer available')).toBe('no longer available')
    expect(keywordOf('Soon Gone will no longer be available')).toBe('will no longer be available')
    expect(keywordOf('Soon Gone is no longer sold')).toBe('no longer sold')
  })

  it('ignores English negations but keeps "not only"', () => {
    expect(keywordOf('We have no plans to delist Soon Gone')).toBeNull()
    expect(keywordOf('Soon Gone will not be delisted')).toBeNull()
    expect(keywordOf('Soon Gone is not being removed from sale')).toBeNull()
    expect(keywordOf("Soon Gone isn't being delisted")).toBeNull()
    expect(keywordOf("Soon Gone hasn't been removed from sale")).toBeNull()
    expect(keywordOf('Not only will Soon Gone be delisted, but its DLC will too')).toBe('delisted')
  })

  it('treats "will not be available" as a delisting signal', () => {
    expect(keywordOf('Soon Gone will not be available after June')).toBe('will not be available')
    expect(keywordOf('SOON GONE WON’T BE AVAILABLE AFTER JUNE')).toBe("won't be available")
  })

  it('does not treat unrelated price or subscription changes as delisting', () => {
    expect(
      keywordOf('Soon Gone is no longer available for free', '', ['no longer available']),
    ).toBeNull()
    expect(
      keywordOf('Soon Gone is no longer available on Xbox Game Pass', '', ['no longer available']),
    ).toBeNull()
    expect(
      keywordOf('Soon Gone is no longer available for pre-order', '', ['no longer available']),
    ).toBeNull()
    expect(keywordOf('Soon Gone was taken down for maintenance', '', ['taken down'])).toBeNull()
  })

  it('only looks at the clause that follows the hit when filtering false positives', () => {
    expect(keywordOf('Soon Gone is no longer available. A beta for the sequel opens soon.')).toBe(
      'no longer available',
    )
  })

  it('scopes negations to the current sentence and contrasting clause', () => {
    expect(keywordOf('Soon Gone is not cancelled. It will be delisted in May.')).toBe('delisted')
    expect(keywordOf('Soon Gone will not be delisted, but its DLC will be removed from sale')).toBe(
      'removed from sale',
    )
    expect(keywordOf('游戏不会在元旦下架')).toBeNull()
  })

  it('applies word boundaries to Latin keywords', () => {
    expect(keywordOf('Wholesale prices rise', '', ['sale'])).toBeNull()
    expect(keywordOf('Sale has ended', '', ['sale'])).toBe('sale')
  })

  it('normalizes full-width latin text', () => {
    expect(keywordOf('Ｆｏｏ ｗｉｌｌ ｂｅ ｄｅｌｉｓｔｅｄ')).toBe('delisted')
  })

  it('matches multilingual announcements', () => {
    expect(keywordOf('サービス終了のお知らせ')).toBe('サービス終了')
    expect(keywordOf('판매 종료 안내')).toBe('판매 종료')
    expect(keywordOf('Игра снята с продажи')).toBe('снята с продажи')
    expect(keywordOf('El juego ya no estará disponible')).toBe('ya no estará disponible')
    expect(keywordOf('Das Spiel wird nicht mehr erhältlich sein')).toBe('nicht mehr erhältlich')
    expect(keywordOf('Le jeu ne sera plus disponible')).toBe('ne sera plus disponible')
  })

  it('scans the body only in the "any" mode', () => {
    const item = { title: 'An important announcement', contents: 'Soon Gone will be delisted.' }
    expect(findNewsKeyword(item, ['delist'], 'title')).toBeNull()
    expect(findNewsKeyword(item, ['delist'], 'any')).toEqual({
      keyword: 'delist',
      field: 'contents',
      index: 18,
    })
  })

  it('returns the title hit even when the body has a longer keyword', () => {
    const item = {
      title: 'Soon Gone will be delisted',
      contents: 'Read the full no longer available for purchase notice.',
    }
    expect(findNewsKeyword(item, DEFAULT_NEWS_KEYWORDS, 'any')?.keyword).toBe('delisted')
  })

  it('ignores empty keyword entries', () => {
    expect(
      findNewsKeyword({ title: 'Nothing to see', contents: '' }, ['', '   '], 'title'),
    ).toBeNull()
  })

  it('keeps the default list within the configured limits', () => {
    expect(DEFAULT_NEWS_KEYWORDS.length).toBeLessThanOrEqual(LIMITS.maxNewsKeywords)
    for (const keyword of DEFAULT_NEWS_KEYWORDS) {
      expect(keyword).toBe(keyword.trim())
      expect(keyword.length).toBeGreaterThan(0)
      expect(keyword.length).toBeLessThanOrEqual(LIMITS.keywordMaxLength)
    }
    const normalized = DEFAULT_NEWS_KEYWORDS.map((keyword) => keyword.toLowerCase())
    expect(new Set(normalized).size).toBe(normalized.length)
  })
})
