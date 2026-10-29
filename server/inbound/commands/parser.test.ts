import { describe, expect, it } from 'vitest'
import { normalizeCommandText, numericFlag, parseCommand, stringFlag } from './parser'

function parse(input: string) {
  const result = parseCommand(input)
  if (!result.ok) throw new Error(result.error)
  return result.parsed
}

describe('parseCommand', () => {
  it('解析基本指令', () => {
    const parsed = parse('/list')
    expect(parsed.command).toBe('list')
    expect(parsed.args).toEqual([])
    expect(parsed.flags).toEqual({})
  })

  it('支持全角斜杠并去除 @机器人后缀', () => {
    expect(parse('／add@steam_monitor_bot 1091500').command).toBe('add')
    expect(normalizeCommandText('／help')).toBe('/help')
  })

  it('保留引号内的空格', () => {
    const parsed = parse('/add "赛博朋克 2077" --note "本体 + 资料片"')
    expect(parsed.args).toEqual(['赛博朋克 2077'])
    expect(stringFlag(parsed.flags, 'note')).toBe('本体 + 资料片')
  })

  it('支持 --flag value 与 --flag=value', () => {
    expect(numericFlag(parse('/add 1 --discount 35').flags, 'discount')).toBe(35)
    expect(numericFlag(parse('/add 1 --discount=35').flags, 'discount')).toBe(35)
    expect(numericFlag(parse('/add 1 --discount').flags, 'discount')).toBeNull()
  })

  it('布尔开关保持 true', () => {
    const parsed = parse('/add 1 --force --note 备注')
    expect(parsed.flags.force).toBe(true)
    expect(stringFlag(parsed.flags, 'note')).toBe('备注')
  })

  it('拒绝未知指令与非指令文本', () => {
    const unknown = parseCommand('/nope')
    expect(unknown.ok).toBe(false)
    expect(unknown.ok ? '' : unknown.error).toContain('未知指令')
    expect(parseCommand('hello').ok).toBe(false)
    expect(parseCommand('/').ok).toBe(false)
  })

  it('规范智能引号', () => {
    const parsed = parse('/add “只狼”')
    expect(parsed.args).toEqual(['只狼'])
  })
})
