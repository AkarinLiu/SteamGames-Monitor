import { describe, expect, it } from 'vitest'
import { formatDingtalkMarkdown } from './format'

describe('formatDingtalkMarkdown', () => {
  it('adds two trailing spaces so DingTalk renders line breaks', () => {
    expect(formatDingtalkMarkdown('第一行\n第二行\n\n第三行')).toBe(
      '第一行  \n第二行  \n\n第三行  ',
    )
  })

  it('normalizes CRLF and strips existing trailing whitespace', () => {
    expect(formatDingtalkMarkdown('a\r\nb   \r\nc')).toBe('a  \nb  \nc  ')
  })
})
