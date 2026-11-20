import { describe, expect, it } from 'vitest'
import { escapeHtml, stripHtml } from './index'

describe('stripHtml', () => {
  it('strips tags and decodes standard entities', () => {
    expect(stripHtml('<p>Hello&nbsp;<b>world</b>&amp; friends</p>')).toBe('Hello world & friends')
  })

  it('decodes entities in a single pass', () => {
    expect(stripHtml('&amp;lt;')).toBe('&lt;')
    expect(stripHtml('&amp;amp;')).toBe('&amp;')
  })
})

describe('escapeHtml', () => {
  it('escapes markup characters once', () => {
    expect(escapeHtml('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;')
  })
})
