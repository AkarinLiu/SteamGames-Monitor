import { describe, expect, it } from 'vitest'
import {
  resolveFeishuApiBase,
  resolveFeishuBrand,
  resolveFeishuConnectionMode,
} from './domains'

describe('Feishu / Lark domain resolution', () => {
  it('defaults to Feishu', () => {
    expect(resolveFeishuBrand({})).toBe('feishu')
    expect(resolveFeishuApiBase({}, null)).toBe('https://open.feishu.cn')
    expect(resolveFeishuConnectionMode({})).toBe('webhook')
  })

  it('uses Lark endpoints when brand is lark', () => {
    expect(resolveFeishuBrand({ brand: 'lark' })).toBe('lark')
    expect(resolveFeishuApiBase({ brand: 'lark' }, null)).toBe('https://open.larksuite.com')
    expect(resolveFeishuConnectionMode({ connectionMode: 'websocket' })).toBe('websocket')
  })

  it('prefers an explicit API base override', () => {
    expect(
      resolveFeishuApiBase({ brand: 'lark' }, 'http://127.0.0.1:9999/'),
    ).toBe('http://127.0.0.1:9999')
  })
})
