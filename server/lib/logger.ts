import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import path from 'node:path'
import { env } from '../env'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const SENSITIVE_KEY =
  /(secret|pass(word)?|token|sign|authorization|cookie|api[_-]?key|encodingaeskey|corpsecret|appsecret|credential)/i

const MAX_DEPTH = 5
const MAX_ARRAY = 20

function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[depth]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return value.length > 2000 ? `${value.slice(0, 2000)}…` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((item) => redact(item, depth + 1))
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redact(item, depth + 1)
    }
    return out
  }
  return String(value)
}

function formatTime(date: Date): string {
  return date.toISOString().slice(11, 23)
}

const LOG_DIR = path.join(env.DATA_DIR, 'logs')
let fileStream: WriteStream | null = null
let fileDate = ''
let fileLoggingDisabled = false

function writeFileLine(line: string): void {
  if (process.env.NODE_ENV === 'test' || fileLoggingDisabled) return
  try {
    const date = new Date().toISOString().slice(0, 10)
    if (!fileStream || fileDate !== date) {
      fileStream?.end()
      fileStream = null
      mkdirSync(LOG_DIR, { recursive: true, mode: 0o750 })
      const stream = createWriteStream(path.join(LOG_DIR, `app-${date}.log`), {
        flags: 'a',
        mode: 0o600,
      })
      stream.on('error', (error) => {
        fileLoggingDisabled = true
        if (fileStream === stream) fileStream = null
        console.error(`[logger] 写入日志文件失败：${error.message}`)
      })
      fileStream = stream
      fileDate = date
    }
    fileStream?.write(`${line}\n`)
  } catch (error) {
    fileLoggingDisabled = true
    console.error(`[logger] 无法初始化日志目录：${(error as Error).message}`)
  }
}

class Logger {
  private readonly level: LogLevel

  constructor(
    private readonly scope: string | null = null,
    level?: LogLevel,
  ) {
    this.level = level ?? resolveLevel()
  }

  child(scope: string): Logger {
    const prefix = this.scope ? `${this.scope}:${scope}` : scope
    return new Logger(prefix, this.level)
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.write('debug', message, fields)
  }

  info(message: string, fields?: Record<string, unknown>): void {
    this.write('info', message, fields)
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.write('warn', message, fields)
  }

  error(message: string, fields?: Record<string, unknown>): void {
    this.write('error', message, fields)
  }

  private write(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) return
    const payload = fields ? (redact(fields) as Record<string, unknown>) : undefined
    if (process.env.NODE_ENV === 'production') {
      const entry = {
        ts: new Date().toISOString(),
        level,
        scope: this.scope ?? undefined,
        msg: message,
        ...payload,
      }
      const line = JSON.stringify(entry)
      writeFileLine(line)
      if (level === 'error') console.error(line)
      else if (level === 'warn') console.warn(line)
      else console.log(line)
      return
    }
    const prefix = `${formatTime(new Date())} ${level.toUpperCase().padEnd(5)} ${
      this.scope ? `[${this.scope}] ` : ''
    }`
    const suffix = payload && Object.keys(payload).length > 0 ? ` ${JSON.stringify(payload)}` : ''
    const line = `${prefix}${message}${suffix}`
    writeFileLine(line)
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  }
}

function resolveLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase()
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw
  return 'info'
}

export const logger = new Logger()
export type { LogLevel }
