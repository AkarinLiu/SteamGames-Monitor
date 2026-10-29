export interface ParsedCommand {
  command: string
  args: string[]
  flags: Record<string, string | true>
}

export type ParseResult = { ok: true; parsed: ParsedCommand } | { ok: false; error: string }

const VALUE_FLAGS = new Set(['discount', 'note', 'max', 'page', 'limit', 'item'])
const SUPPORTED = new Set([
  'help',
  'add',
  'adddlc',
  'remove',
  'pause',
  'resume',
  'check',
  'price',
  'list',
  'events',
  'cancel',
])

function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: string | null = null
  for (const char of input) {
    if (quote) {
      if (char === quote) quote = null
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current) tokens.push(current)
  return tokens
}

export function normalizeCommandText(input: string): string {
  return input
    .replace(/／/g, '/')
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
}

export function parseCommand(input: string): ParseResult {
  const text = normalizeCommandText(input)
  if (!text.startsWith('/')) {
    return { ok: false, error: '指令必须以 / 开头，发送 /help 查看用法。' }
  }
  const tokens = tokenize(text.slice(1))
  const head = tokens.shift()
  if (!head) return { ok: false, error: '缺少指令名称，发送 /help 查看用法。' }
  const command = head.split('@')[0]!.toLowerCase()
  if (!SUPPORTED.has(command)) {
    return { ok: false, error: `未知指令 /${command}，发送 /help 查看可用指令。` }
  }

  const args: string[] = []
  const flags: Record<string, string | true> = {}
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!
    if (!token.startsWith('--') || token === '--') {
      args.push(token)
      continue
    }
    const body = token.slice(2)
    const eq = body.indexOf('=')
    if (eq >= 0) {
      const name = body.slice(0, eq).toLowerCase()
      flags[name] = body.slice(eq + 1)
      continue
    }
    const name = body.toLowerCase()
    if (VALUE_FLAGS.has(name)) {
      const value = tokens[index + 1]
      if (value !== undefined && !value.startsWith('--')) {
        flags[name] = value
        index += 1
      } else {
        flags[name] = true
      }
    } else {
      flags[name] = true
    }
  }

  return { ok: true, parsed: { command, args, flags } }
}

export function numericFlag(flags: Record<string, string | true>, name: string): number | null {
  const value = flags[name]
  if (typeof value !== 'string') return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

export function stringFlag(flags: Record<string, string | true>, name: string): string | null {
  const value = flags[name]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
