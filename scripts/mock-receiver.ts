import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createTcpServer, type Socket } from 'node:net'
import process from 'node:process'

const HTTP_PORT = Number(process.env.MOCK_PORT ?? 9999)
const SMTP_PORT = Number(process.env.MOCK_SMTP_PORT ?? 1025)
const HOST = process.env.MOCK_HOST ?? '127.0.0.1'

interface CapturedRequest {
  id: number
  kind: 'webhook' | 'api' | 'smtp' | 'steam'
  method: string
  path: string
  query: Record<string, string>
  headers: Record<string, string>
  body: unknown
  receivedAt: string
  injectedFailure?: boolean
}

interface SteamNewsState {
  gid: string
  title: string
  contents?: string
  url?: string
}

interface SteamAppState {
  appid: number
  name: string
  type: 'game' | 'dlc'
  available: boolean
  comingSoon: boolean
  releaseDate: string
  isFree: boolean
  currency: string
  initial: number
  final: number
  discountPercent: number
  dlc: number[]
  news: SteamNewsState[]
}

const requests: CapturedRequest[] = []
const steamApps = new Map<number, SteamAppState>()
const steamRequestCounts = new Map<string, number>()
let nextRequestId = 1
let failNext = 0
let failStatus = 500
let failPathContains = ''
let responseDelayMs = 0

function record(entry: Omit<CapturedRequest, 'id' | 'receivedAt'>): CapturedRequest {
  const captured: CapturedRequest = {
    id: nextRequestId,
    receivedAt: new Date().toISOString(),
    ...entry,
  }
  nextRequestId += 1
  requests.push(captured)
  if (requests.length > 1000) requests.shift()
  return captured
}

function defaultApp(appid: number): SteamAppState {
  return {
    appid,
    name: `Mock App ${appid}`,
    type: 'game',
    available: true,
    comingSoon: true,
    releaseDate: '即将推出',
    isFree: false,
    currency: 'CNY',
    initial: 9900,
    final: 9900,
    discountPercent: 0,
    dlc: [],
    news: [],
  }
}

function appState(appid: number): SteamAppState {
  let state = steamApps.get(appid)
  if (!state) {
    state = defaultApp(appid)
    steamApps.set(appid, state)
  }
  return state
}

function applyAppPatch(appid: number, patch: Partial<SteamAppState>): SteamAppState {
  const state = { ...appState(appid), ...patch, appid }
  steamApps.set(appid, state)
  return state
}

function buildAppDetails(state: SteamAppState): Record<string, unknown> {
  const data: Record<string, unknown> = {
    type: state.type,
    name: state.name,
    steam_appid: state.appid,
    is_free: state.isFree,
    release_date: { coming_soon: state.comingSoon, date: state.releaseDate },
    header_image: `https://cdn.akamai.steamstatic.com/steam/apps/${state.appid}/header.jpg`,
    short_description: '由 mock-receiver 提供的端到端测试条目',
    developers: ['Mock Studio'],
    publishers: ['Mock Publisher'],
  }
  if (!state.isFree) {
    data.price_overview = {
      currency: state.currency,
      initial: state.initial,
      final: state.final,
      discount_percent: state.discountPercent,
      initial_formatted: `${state.currency} ${(state.initial / 100).toFixed(2)}`,
      final_formatted: `${state.currency} ${(state.final / 100).toFixed(2)}`,
    }
  }
  if (state.dlc.length > 0) data.dlc = state.dlc
  return data
}

function headersRecord(req: IncomingMessage): Record<string, string> {
  const record: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    record[key] = Array.isArray(value) ? value.join(',') : (value ?? '')
  }
  return record
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 2 * 1024 * 1024) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function parseBody(headers: Record<string, string>, raw: Buffer): unknown {
  const text = raw.toString('utf8')
  if (!text) return null
  const contentType = headers['content-type'] ?? ''
  const looksJson = contentType.includes('json') || text.startsWith('{') || text.startsWith('[')
  if (!looksJson) return text
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function queryRecord(url: URL): Record<string, string> {
  const query: Record<string, string> = {}
  url.searchParams.forEach((value, key) => {
    query[key] = value
  })
  return query
}

function parseJsonBody<T>(body: unknown): T | null {
  return body !== null && typeof body === 'object' ? (body as T) : null
}

interface SmtpCapture {
  kind: 'smtp'
  from: string | null
  to: string[]
  subject: string | null
  raw: string
  receivedAt: string
}

const smtpMessages: SmtpCapture[] = []

function decodeMimeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_match, charset, encoding, text) => {
    const payload = String(text)
    if (String(encoding).toUpperCase() === 'B') {
      return Buffer.from(payload, 'base64').toString('utf8')
    }
    return payload.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_m, hex) =>
      String.fromCharCode(Number.parseInt(String(hex), 16)),
    )
  })
}

function captureSmtp(message: string, envelope: { from: string; to: string[] }): void {
  const [headBlock = ''] = message.split(/\r?\n\r?\n/)
  const headers = new Map<string, string>()
  let current = ''
  for (const line of headBlock.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && current) {
      headers.set(current, `${headers.get(current) ?? ''} ${line.trim()}`)
      continue
    }
    const index = line.indexOf(':')
    if (index <= 0) continue
    current = line.slice(0, index).trim().toLowerCase()
    headers.set(current, line.slice(index + 1).trim())
  }
  const subject = headers.get('subject')
  smtpMessages.push({
    kind: 'smtp',
    from: envelope.from,
    to: envelope.to,
    subject: subject ? decodeMimeWords(subject) : null,
    raw: message,
    receivedAt: new Date().toISOString(),
  })
  if (smtpMessages.length > 200) smtpMessages.shift()
  console.log(`[mock] smtp message captured from=${envelope.from} to=${envelope.to.join(',')}`)
}

function startSmtpServer(): void {
  const server = createTcpServer((socket: Socket) => {
    let buffer = ''
    let inData = false
    let dataBuffer = ''
    let from = ''
    let to: string[] = []
    socket.setEncoding('utf8')
    socket.write('220 mock-smtp ready\r\n')

    const handleCommand = (line: string): void => {
      const upper = line.toUpperCase()
      if (upper.startsWith('EHLO')) {
        socket.write('250-mock-smtp\r\n250 PIPELINING\r\n')
        return
      }
      if (upper.startsWith('HELO')) {
        socket.write('250 mock-smtp\r\n')
        return
      }
      if (upper.startsWith('MAIL FROM')) {
        from = line.slice(line.indexOf(':') + 1).replace(/[<>]/g, '').trim()
        socket.write('250 2.1.0 OK\r\n')
        return
      }
      if (upper.startsWith('RCPT TO')) {
        to.push(line.slice(line.indexOf(':') + 1).replace(/[<>]/g, '').trim())
        socket.write('250 2.1.5 OK\r\n')
        return
      }
      if (upper.startsWith('DATA')) {
        inData = true
        dataBuffer = ''
        socket.write('354 End data with <CR><LF>.<CR><LF>\r\n')
        return
      }
      if (upper.startsWith('AUTH') || upper.startsWith('STARTTLS')) {
        socket.write('504 5.5.1 Command not supported\r\n')
        return
      }
      if (upper.startsWith('RSET')) {
        from = ''
        to = []
        socket.write('250 2.0.0 OK\r\n')
        return
      }
      if (upper.startsWith('NOOP')) {
        socket.write('250 2.0.0 OK\r\n')
        return
      }
      if (upper.startsWith('QUIT')) {
        socket.write('221 2.0.0 Bye\r\n')
        socket.end()
        return
      }
      socket.write('250 2.0.0 OK\r\n')
    }

    socket.on('data', (chunk: string) => {
      buffer += chunk
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n')
          if (end === -1) return
          dataBuffer += buffer.slice(0, end)
          buffer = buffer.slice(end + 5)
          inData = false
          const message = dataBuffer
            .split('\r\n')
            .map((line) => (line.startsWith('..') ? line.slice(1) : line))
            .join('\r\n')
          captureSmtp(message, { from, to })
          from = ''
          to = []
          dataBuffer = ''
          socket.write('250 2.0.0 OK queued\r\n')
          continue
        }
        const newline = buffer.indexOf('\r\n')
        if (newline === -1) return
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 2)
        handleCommand(line)
      }
    })
    socket.on('error', () => socket.destroy())
  })
  server.listen(SMTP_PORT, HOST, () => {
    console.log(`[mock] SMTP sink listening on ${HOST}:${SMTP_PORT}`)
  })
}

function steamDetailsResponse(url: URL): unknown {
  const appid = Number(url.searchParams.get('appids') ?? '0')
  const region = url.searchParams.get('cc') ?? ''
  const language = url.searchParams.get('l') ?? ''
  const key = `${appid}:${region}:${language}`
  steamRequestCounts.set(key, (steamRequestCounts.get(key) ?? 0) + 1)
  const state = appState(appid)
  if (!state.available) {
    return { [String(appid)]: { success: false } }
  }
  return { [String(appid)]: { success: true, data: buildAppDetails(state) } }
}

function steamSearchResponse(url: URL): unknown {
  const term = (url.searchParams.get('term') ?? '').trim().toLowerCase()
  const items = [...steamApps.values()]
    .filter((state) => !term || state.name.toLowerCase().includes(term))
    .map((state) => ({
      type: state.type === 'dlc' ? 'dlc' : 'app',
      id: state.appid,
      name: state.name,
      tiny_image: `https://cdn.akamai.steamstatic.com/steam/apps/${state.appid}/capsule_sm_120.jpg`,
      price: state.isFree
        ? undefined
        : {
            currency: state.currency,
            initial: state.initial,
            final: state.final,
            discount_percent: state.discountPercent,
            final_formatted: `${state.currency} ${(state.final / 100).toFixed(2)}`,
          },
    }))
  return { success: 1, total: items.length, items }
}

function steamNewsResponse(url: URL): unknown {
  const appid = Number(url.searchParams.get('appid') ?? '0')
  const state = appState(appid)
  return {
    appnews: {
      appid,
      newsitems: state.news.map((item) => ({
        gid: item.gid,
        title: item.title,
        url: item.url ?? `https://store.steampowered.com/news/app/${appid}`,
        contents: item.contents ?? item.title,
        date: Math.floor(Date.now() / 1000),
        feedname: 'mock',
      })),
    },
  }
}

async function handleControl(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  body: unknown,
): Promise<boolean> {
  if (url.pathname === '/_health') {
    sendJson(res, 200, { ok: true, steamApps: steamApps.size, requests: requests.length })
    return true
  }
  if (url.pathname === '/_requests' && req.method === 'GET') {
    const since = Number(url.searchParams.get('since') ?? '0')
    sendJson(res, 200, {
      requests: requests.filter((item) => item.id > since),
      smtp: smtpMessages,
      steam: Object.fromEntries(steamRequestCounts),
    })
    return true
  }
  if (url.pathname === '/_smtp' && req.method === 'GET') {
    sendJson(res, 200, { messages: smtpMessages })
    return true
  }
  if (url.pathname === '/_reset' && req.method === 'POST') {
    requests.length = 0
    smtpMessages.length = 0
    steamRequestCounts.clear()
    failNext = 0
    failPathContains = ''
    responseDelayMs = 0
    sendJson(res, 200, { ok: true })
    return true
  }
  if (url.pathname === '/_control' && req.method === 'POST') {
    const input = parseJsonBody<{
      failNext?: number
      failStatus?: number
      failPathContains?: string
      delayMs?: number
    }>(body)
    if (typeof input?.failNext === 'number') failNext = Math.max(0, Math.trunc(input.failNext))
    if (typeof input?.failStatus === 'number') failStatus = input.failStatus
    if (typeof input?.failPathContains === 'string') failPathContains = input.failPathContains
    if (typeof input?.delayMs === 'number') responseDelayMs = Math.max(0, input.delayMs)
    sendJson(res, 200, { ok: true, failNext, failStatus, failPathContains, delayMs: responseDelayMs })
    return true
  }
  if (url.pathname === '/_steam/apps' && req.method === 'POST') {
    const input = parseJsonBody<Partial<SteamAppState> | Array<Partial<SteamAppState>>>(body)
    const list = Array.isArray(input) ? input : input ? [input] : []
    for (const item of list) {
      if (typeof item.appid !== 'number') continue
      applyAppPatch(item.appid, item)
    }
    sendJson(res, 200, { ok: true, apps: [...steamApps.values()] })
    return true
  }
  if (url.pathname === '/_steam/apps' && req.method === 'DELETE') {
    const appid = Number(url.searchParams.get('appid') ?? '')
    if (Number.isSafeInteger(appid) && appid > 0) {
      steamApps.delete(appid)
      for (const key of steamRequestCounts.keys()) {
        if (key.startsWith(`${appid}:`)) steamRequestCounts.delete(key)
      }
    } else {
      steamApps.clear()
      steamRequestCounts.clear()
    }
    sendJson(res, 200, { ok: true })
    return true
  }
  return false
}

async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${HOST}:${HTTP_PORT}`)
  const raw = await readBody(req)
  const headers = headersRecord(req)
  const body = parseBody(headers, raw)

  if (await handleControl(req, res, url, body)) return

  if (req.method === 'GET' && url.pathname === '/steam-store/api/appdetails') {
    record({ kind: 'steam', method: 'GET', path: url.pathname, query: queryRecord(url), headers, body: null })
    sendJson(res, 200, steamDetailsResponse(url))
    return
  }
  if (req.method === 'GET' && url.pathname === '/steam-store/api/storesearch') {
    record({ kind: 'steam', method: 'GET', path: url.pathname, query: queryRecord(url), headers, body: null })
    sendJson(res, 200, steamSearchResponse(url))
    return
  }
  if (req.method === 'GET' && url.pathname.startsWith('/steam-api/ISteamNews/')) {
    record({ kind: 'steam', method: 'GET', path: url.pathname, query: queryRecord(url), headers, body: null })
    sendJson(res, 200, steamNewsResponse(url))
    return
  }

  if (req.method === 'POST') {
    if (responseDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, responseDelayMs))
    }
    const injected = failNext > 0 && (!failPathContains || url.pathname.includes(failPathContains))
    if (injected) failNext -= 1
    record({
      kind: 'webhook',
      method: req.method,
      path: url.pathname,
      query: queryRecord(url),
      headers,
      body,
      injectedFailure: injected,
    })
    if (injected) {
      sendJson(res, failStatus, {
        errcode: failStatus,
        errmsg: 'mock failure',
        code: failStatus,
        msg: 'mock failure',
        StatusCode: failStatus,
      })
      return
    }
    sendJson(res, 200, { errcode: 0, errmsg: 'ok', code: 0, msg: 'ok', StatusCode: 0 })
    return
  }

  sendJson(res, 404, { error: 'not found' })
}

const server = createServer((req, res) => {
  void handler(req, res).catch((error: unknown) => {
    console.error('[mock] handler error', error)
    if (!res.headersSent) sendJson(res, 500, { error: 'mock error' })
    else res.end()
  })
})

server.listen(HTTP_PORT, HOST, () => {
  console.log(`[mock] HTTP mock listening on http://${HOST}:${HTTP_PORT}`)
  console.log(`[mock] Steam store: http://${HOST}:${HTTP_PORT}/steam-store`)
  console.log(`[mock] Steam api:   http://${HOST}:${HTTP_PORT}/steam-api`)
})
startSmtpServer()

function shutdown(): void {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
