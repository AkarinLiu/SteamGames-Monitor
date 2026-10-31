import { describe, expect, it } from 'vitest'
import { isExactReleaseDate } from './releaseDate'

describe('isExactReleaseDate', () => {
  it.each([
    '2026 年 10 月 29 日',
    '2026年10月29日',
    '2026년 10월 29일',
    '2026-10-29',
    '2026/10/29 10:00',
    '29.10.2026',
    '29 October 2026',
    'Oct 29, 2026',
    '29 de out. de 2026',
    '２０２６年１０月２９日',
  ])('accepts exact date: %s', (value) => {
    expect(isExactReleaseDate(value)).toBe(true)
  })

  it.each([
    '',
    '即将推出',
    'Coming soon',
    'To be announced',
    '2026',
    '2026 年',
    '2026년',
    '2026 年 10 月',
    '2026년 10월',
    '2026-10',
    '10/2026',
    'October 2026',
    'Q1 2026',
    '2026 Q4',
    'H1 2026',
    '2026 年末',
    'Early 2026',
  ])('rejects vague date: %s', (value) => {
    expect(isExactReleaseDate(value)).toBe(false)
  })

  it('treats empty input as not exact', () => {
    expect(isExactReleaseDate(null)).toBe(false)
    expect(isExactReleaseDate(undefined)).toBe(false)
  })
})
