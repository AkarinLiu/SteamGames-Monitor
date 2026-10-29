import { LIMITS } from '../../../shared/constants'
import type { BotAccessRole, BotPlatform, CommandExecutionResult } from '../../../shared/types'
import type { Db } from '../../db/database'
import type { MonitorRow, UserRow } from '../../db/rows'
import { listEvents } from '../../db/repo/events'
import {
  listMonitorsForCommand,
  setMonitorEnabled,
  softDeleteMonitor,
} from '../../db/repo/monitors'
import { clearCommandContext, getCommandContext, setCommandContext } from '../../db/repo/inbound'
import { addMonitor, importDlcMonitors, type AddMonitorOutcome, type ImportDlcOutcome } from '../../monitor/addMonitor'
import type { CheckOutcome, CheckOptions } from '../../monitor/checkMonitor'
import type { SteamRateLimiter } from '../../monitor/rateLimiter'
import { numericFlag, parseCommand, stringFlag, type ParsedCommand } from './parser'
import { resolveMonitorTarget } from './resolveTarget'
import {
  formatEventLine,
  formatMonitorDetail,
  formatMonitorLine,
  monitorStatusLabel,
} from './format'

export interface CommandServices {
  db: Db
  limiter: SteamRateLimiter
  cacheTtlMs: number
  maxTotalMonitors: number
  checkMonitor: (monitorId: number, options?: CheckOptions) => Promise<CheckOutcome>
}

export interface CommandActor {
  botAppId: number
  platform: BotPlatform
  chatId: string
  platformUserId: string
  role: BotAccessRole
}

export const HELP_TEXT = [
  'Steam 销售监控指令',
  '/help — 查看帮助',
  '/add <appid|链接|名称> [--discount 20] [--note 备注] [--force] — 添加监控',
  '/adddlc <本体 appid|链接|名称> [--max 50] — 导入全部 DLC',
  '/remove <id|appid|名称> — 删除监控',
  '/pause <id|appid|名称> — 暂停检查',
  '/resume <id|appid|名称> — 恢复检查',
  '/check <id|appid|名称> — 立即检查',
  '/price <id|appid|名称> — 查看当前价格',
  '/list [--all] [--sale] [--paused] [--page 2] — 查看监控列表',
  '/events [--item id] [--limit 10] — 查看最近事件',
  '/cancel — 取消待选择操作',
  '',
  '查看者可使用 /help /list /price /events，其余指令需要管理权限。',
].join('\n')

function ok(lines: string[]): CommandExecutionResult {
  return { ok: true, result: 'ok', lines }
}

function fail(lines: string[], result: CommandExecutionResult['result'] = 'error'): CommandExecutionResult {
  return { ok: false, result, lines }
}

function describeAddOutcome(outcome: AddMonitorOutcome): CommandExecutionResult {
  switch (outcome.status) {
    case 'added':
      return ok([
        `已添加监控：${outcome.monitor.name}（${outcome.monitor.appid}）`,
        `当前状态：${monitorStatusLabel(outcome.monitor)} · 已写入基线，后续变化会推送通知。`,
      ])
    case 'already_exists':
      return ok([`已在监控中：${formatMonitorLine(outcome.monitor)}`])
    case 'not_available':
      return fail([
        `在区域 ${outcome.region} 无法获取该应用（不存在 / 已下架 / 区域不可售）。`,
        `确认仍要添加请追加 --force，届时只做新闻预警。`,
      ])
    case 'quota_exceeded':
      return fail([outcome.message], 'denied')
    case 'error':
      return fail([outcome.message])
    default:
      return fail(['未预期的结果'])
  }
}

function describeImportOutcome(outcome: ImportDlcOutcome): CommandExecutionResult {
  switch (outcome.status) {
    case 'ok':
      return ok([
        `已导入 ${outcome.created.length} 个 DLC，跳过 ${outcome.skipped} 个，失败 ${outcome.failed} 个。`,
        ...outcome.created.slice(0, 10).map((monitor) => formatMonitorLine(monitor)),
      ])
    case 'no_dlc':
      return ok([`App ${outcome.appid} 没有可导入的 DLC。`])
    case 'not_available':
      return fail([`在区域 ${outcome.region} 无法获取该应用（不存在 / 已下架 / 区域不可售）。`])
    case 'quota_exceeded':
      return fail([outcome.message], 'denied')
    case 'error':
      return fail([outcome.message])
    default:
      return fail(['未预期的结果'])
  }
}

function requireQuery(parsed: ParsedCommand, usage: string): string | null {
  const query = parsed.args.join(' ').trim()
  return query || usage
}

function describeCheck(outcome: CheckOutcome): string {
  switch (outcome.status) {
    case 'ok':
      return `检查完成${outcome.fromCache ? '（使用缓存）' : ''}，新增事件 ${outcome.eventsCreated} 条。`
    case 'not_found':
      return 'Steam 未返回该应用（可能已下架或当前区域不可售）。'
    case 'skipped':
      return '已跳过：监控项不存在或账号已停用。'
    default:
      return `检查失败：${outcome.errorCode ?? '未知错误'}`
  }
}

function listMonitors(services: CommandServices, user: UserRow, parsed: ParsedCommand): CommandExecutionResult {
  const page = Math.max(1, numericFlag(parsed.flags, 'page') ?? 1)
  const includePaused = parsed.flags.all === true
  const rows = listMonitorsForCommand(services.db, user.id, {
    saleOnly: parsed.flags.sale === true,
    pausedOnly: parsed.flags.paused === true,
    includePaused,
    limit: page * 10,
  })
  const pageRows = rows.slice((page - 1) * 10)
  if (pageRows.length === 0) {
    return ok([page === 1 ? '暂无监控项，使用 /add 添加。' : '没有更多监控项。'])
  }
  return ok([`监控项（第 ${page} 页，共 ${rows.length} 条）：`, ...pageRows.map(formatMonitorLine)])
}

function resolveOne(
  services: CommandServices,
  user: UserRow,
  parsed: ParsedCommand,
  forWhat: string,
):
  | { result: CommandExecutionResult }
  | { monitor: MonitorRow } {
  const query = requireQuery(parsed, `用法：/${parsed.command} <id|appid|名称>`)
  if (!query || !parsed.args.length) {
    return { result: fail([query ?? '请提供监控项 ID、AppID 或名称。']) }
  }
  const resolution = resolveMonitorTarget(services.db, user.id, query)
  if (resolution.kind === 'none') {
    return { result: fail([`未找到用于${forWhat}的监控项「${query}」。`]) }
  }
  if (resolution.kind === 'many') {
    return {
      result: fail([
        `「${query}」匹配多个监控项，请改用 ID 或 AppID：`,
        ...resolution.monitors.map(formatMonitorLine),
      ]),
    }
  }
  return { monitor: resolution.monitor }
}

async function executeParsed(
  services: CommandServices,
  actor: CommandActor,
  user: UserRow,
  parsed: ParsedCommand,
): Promise<CommandExecutionResult> {
  const readOnly = new Set(['help', 'list', 'price', 'events'])
  if (actor.role === 'viewer' && !readOnly.has(parsed.command)) {
    return fail(['未授权：查看者只能使用 /help、/list、/price、/events。'], 'denied')
  }

  switch (parsed.command) {
    case 'help':
      return ok([HELP_TEXT])
    case 'cancel':
      clearCommandContext(services.db, actor.botAppId, actor.platformUserId, actor.chatId)
      return ok(['已取消待选择操作。'])
    case 'list':
      return listMonitors(services, user, parsed)
    case 'add': {
      const query = parsed.args.join(' ').trim()
      if (!query) return fail(['用法：/add <appid|链接|名称> [--discount 20] [--note 备注] [--force]'])
      const discount = numericFlag(parsed.flags, 'discount')
      if (parsed.flags.discount !== undefined && discount === null) {
        return fail(['--discount 必须是 0-100 的整数。'], 'parse_error')
      }
      if (discount !== null && discount > 100) {
        return fail(['--discount 必须是 0-100 的整数。'], 'parse_error')
      }
      const outcome = await addMonitor(
        {
          db: services.db,
          limiter: services.limiter,
          cacheTtlMs: services.cacheTtlMs,
          maxTotalMonitors: services.maxTotalMonitors,
        },
        user,
        {
          query,
          minDiscountPercent: discount,
          notes: stringFlag(parsed.flags, 'note'),
          force: parsed.flags.force === true,
          newsWatch: user.news_enabled === 1,
        },
      )
      if (outcome.status === 'selection_required') {
        setCommandContext(services.db, {
          botAppId: actor.botAppId,
          platform: actor.platform,
          chatId: actor.chatId,
          platformUserId: actor.platformUserId,
          kind: 'select_appid',
          payload: {
            command: 'add',
            query: outcome.query,
            results: outcome.results,
            flags: parsed.flags,
          },
          expiresAt: Date.now() + 10 * 60_000,
        })
        return ok([
          `「${outcome.query}」匹配多个结果，请回复序号（10 分钟内有效）：`,
          ...outcome.results.map((item, index) => `${index + 1}. ${item.name}（${item.appid}）`),
        ])
      }
      return describeAddOutcome(outcome)
    }
    case 'adddlc': {
      const query = parsed.args.join(' ').trim()
      if (!query) return fail(['用法：/adddlc <本体 appid|链接|名称> [--max 50]'])
      const max = numericFlag(parsed.flags, 'max') ?? LIMITS.maxDlcImport
      const outcome = await importDlcMonitors(
        {
          db: services.db,
          limiter: services.limiter,
          cacheTtlMs: services.cacheTtlMs,
          maxTotalMonitors: services.maxTotalMonitors,
        },
        user,
        query,
        Math.min(max, LIMITS.maxDlcImport),
      )
      if (outcome.status === 'selection_required') {
        setCommandContext(services.db, {
          botAppId: actor.botAppId,
          platform: actor.platform,
          chatId: actor.chatId,
          platformUserId: actor.platformUserId,
          kind: 'select_appid',
          payload: {
            command: 'adddlc',
            query: outcome.query,
            results: outcome.results,
            flags: parsed.flags,
          },
          expiresAt: Date.now() + 10 * 60_000,
        })
        return ok([
          `「${outcome.query}」匹配多个结果，请回复序号（10 分钟内有效）：`,
          ...outcome.results.map((item, index) => `${index + 1}. ${item.name}（${item.appid}）`),
        ])
      }
      return describeImportOutcome(outcome)
    }
    case 'remove': {
      const target = resolveOne(services, user, parsed, '删除')
      if ('result' in target) return target.result
      softDeleteMonitor(services.db, user.id, target.monitor.id)
      return ok([`已删除监控：${formatMonitorLine(target.monitor)}`])
    }
    case 'pause':
    case 'resume': {
      const target = resolveOne(services, user, parsed, parsed.command === 'pause' ? '暂停' : '恢复')
      if ('result' in target) return target.result
      const enable = parsed.command === 'resume'
      setMonitorEnabled(services.db, user.id, target.monitor.id, enable)
      return ok([`${enable ? '已恢复' : '已暂停'}：${formatMonitorLine(target.monitor)}`])
    }
    case 'check': {
      const target = resolveOne(services, user, parsed, '检查')
      if ('result' in target) return target.result
      const outcome = await services.checkMonitor(target.monitor.id, {
        force: true,
        source: 'command',
      })
      return ok([`${target.monitor.name}（${target.monitor.appid}）：${describeCheck(outcome)}`])
    }
    case 'price': {
      const target = resolveOne(services, user, parsed, '查询')
      if ('result' in target) return target.result
      return ok([formatMonitorDetail(target.monitor, user.timezone)])
    }
    case 'events': {
      const limit = Math.min(Math.max(1, numericFlag(parsed.flags, 'limit') ?? 10), 20)
      let monitorId: number | undefined
      const item = stringFlag(parsed.flags, 'item')
      if (item) {
        const resolution = resolveMonitorTarget(services.db, user.id, item)
        if (resolution.kind === 'none') return fail([`未找到监控项「${item}」。`])
        if (resolution.kind === 'many') {
          return fail(['事件查询匹配多个监控项，请改用 ID 或 AppID。', ...resolution.monitors.map(formatMonitorLine)])
        }
        monitorId = resolution.monitor.id
      }
      const { rows } = listEvents(services.db, user.id, { monitorId, page: 1, pageSize: limit })
      if (rows.length === 0) return ok(['暂无事件记录。'])
      return ok([
        '最近事件：',
        ...rows.map((event) => formatEventLine(event, user.timezone, event.monitorName)),
      ])
    }
    default:
      return fail(['未知指令，发送 /help 查看用法。'], 'parse_error')
  }
}

async function executeSelection(
  services: CommandServices,
  actor: CommandActor,
  user: UserRow,
  text: string,
): Promise<CommandExecutionResult | null> {
  if (!/^\d{1,2}$/.test(text.trim())) return null
  const context = getCommandContext(
    services.db,
    actor.botAppId,
    actor.platformUserId,
    actor.chatId,
    Date.now(),
  )
  if (!context || context.kind !== 'select_appid') return null

  const payload = JSON.parse(context.payload_json) as {
    command: 'add' | 'adddlc'
    results: Array<{ appid: number; name: string }>
    flags: Record<string, string | true>
  }
  const index = Number(text.trim()) - 1
  const picked = payload.results[index]
  if (!picked) {
    return fail([`序号无效，请回复 1-${payload.results.length}，或发送 /cancel 取消。`], 'parse_error')
  }
  clearCommandContext(services.db, actor.botAppId, actor.platformUserId, actor.chatId)

  if (actor.role === 'viewer') {
    return fail(['未授权：查看者不能添加监控。'], 'denied')
  }

  if (payload.command === 'adddlc') {
    const max = Number(payload.flags.max) || LIMITS.maxDlcImport
    const outcome = await importDlcMonitors(
      {
        db: services.db,
        limiter: services.limiter,
        cacheTtlMs: services.cacheTtlMs,
        maxTotalMonitors: services.maxTotalMonitors,
      },
      user,
      String(picked.appid),
      Math.min(max, LIMITS.maxDlcImport),
    )
    return describeImportOutcome(outcome)
  }

  const discount = typeof payload.flags.discount === 'string' ? Number(payload.flags.discount) : null
  const outcome = await addMonitor(
    {
      db: services.db,
      limiter: services.limiter,
      cacheTtlMs: services.cacheTtlMs,
      maxTotalMonitors: services.maxTotalMonitors,
    },
    user,
    {
      query: String(picked.appid),
      minDiscountPercent: discount,
      notes: typeof payload.flags.note === 'string' ? payload.flags.note : null,
      force: payload.flags.force === true,
      newsWatch: user.news_enabled === 1,
    },
  )
  return describeAddOutcome(outcome)
}

export async function executeCommand(
  services: CommandServices,
  actor: CommandActor,
  user: UserRow,
  text: string,
): Promise<CommandExecutionResult> {
  const selected = await executeSelection(services, actor, user, text)
  if (selected) return selected

  const parsed = parseCommand(text)
  if (!parsed.ok) return fail([parsed.error], 'parse_error')
  return executeParsed(services, actor, user, parsed.parsed)
}
