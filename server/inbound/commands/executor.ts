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
import {
  addMonitor,
  importDlcMonitors,
  type AddMonitorOutcome,
  type ImportDlcOutcome,
} from '../../monitor/addMonitor'
import type { CheckOutcome, CheckOptions } from '../../monitor/checkMonitor'
import type { SteamRateLimiter } from '../../monitor/rateLimiter'
import { botMessages, formatBotMessage as fmt, type BotMessages } from '../../i18n'
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

function ok(lines: string[]): CommandExecutionResult {
  return { ok: true, result: 'ok', lines }
}

function fail(
  lines: string[],
  result: CommandExecutionResult['result'] = 'error',
): CommandExecutionResult {
  return { ok: false, result, lines }
}

function describeAddError(
  outcome: Extract<AddMonitorOutcome | ImportDlcOutcome, { status: 'error' }>,
  messages: BotMessages,
): string {
  switch (outcome.code) {
    case 'onboarding_required':
      return messages.onboardingRequired
    case 'not_found':
      return fmt(messages.searchNotFound, { query: outcome.query ?? '' })
    case 'network':
      return messages.steamNetwork
    case 'timeout':
      return messages.steamTimeout
    case 'rate_limited':
      return messages.steamRateLimited
    case 'unknown':
      return messages.unknownError
    default:
      return fmt(messages.steamError, { code: outcome.code })
  }
}

function describeAddOutcome(
  outcome: AddMonitorOutcome,
  messages: BotMessages,
): CommandExecutionResult {
  switch (outcome.status) {
    case 'added':
      return ok([
        fmt(messages.addAdded, { name: outcome.monitor.name, appid: outcome.monitor.appid }),
        fmt(messages.addAddedStatus, {
          status: monitorStatusLabel(outcome.monitor, messages),
        }),
      ])
    case 'already_exists':
      return ok([
        fmt(messages.addAlready, { line: formatMonitorLine(outcome.monitor, messages) }),
      ])
    case 'not_available':
      return fail([
        fmt(messages.appNotAvailable, { region: outcome.region }),
        messages.addForceHint,
      ])
    case 'quota_exceeded':
      return fail(
        [
          outcome.scope === 'user'
            ? fmt(messages.quotaUser, { limit: outcome.limit })
            : fmt(messages.quotaSystem, { limit: outcome.limit }),
        ],
        'denied',
      )
    case 'error':
      return fail([describeAddError(outcome, messages)])
    default:
      return fail([messages.unexpected])
  }
}

function describeImportOutcome(
  outcome: ImportDlcOutcome,
  messages: BotMessages,
): CommandExecutionResult {
  switch (outcome.status) {
    case 'ok':
      return ok([
        fmt(messages.importDone, {
          created: outcome.created.length,
          skipped: outcome.skipped,
          failed: outcome.failed,
        }),
        ...outcome.created.slice(0, 10).map((monitor) => formatMonitorLine(monitor, messages)),
      ])
    case 'no_dlc':
      return ok([fmt(messages.importNoDlc, { appid: outcome.appid })])
    case 'not_available':
      return fail([fmt(messages.appNotAvailable, { region: outcome.region })])
    case 'quota_exceeded':
      return fail(
        [
          outcome.scope === 'user'
            ? fmt(messages.importQuotaUser, {
                current: outcome.current ?? 0,
                limit: outcome.limit,
                maxImport: outcome.maxImport ?? 0,
              })
            : fmt(messages.importQuotaSystem, { limit: outcome.limit }),
        ],
        'denied',
      )
    case 'error':
      return fail([describeAddError(outcome, messages)])
    default:
      return fail([messages.unexpected])
  }
}

function describeCheck(outcome: CheckOutcome, messages: BotMessages): string {
  switch (outcome.status) {
    case 'ok':
      return fmt(outcome.fromCache ? messages.checkDoneCached : messages.checkDone, {
        count: outcome.eventsCreated,
      })
    case 'not_found':
      return messages.checkNotFound
    case 'skipped':
      return messages.checkSkipped
    default:
      return fmt(messages.checkFailed, { code: outcome.errorCode ?? messages.unknownError })
  }
}

function listMonitors(
  services: CommandServices,
  user: UserRow,
  parsed: ParsedCommand,
  messages: BotMessages,
): CommandExecutionResult {
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
    return ok([page === 1 ? messages.listEmpty : messages.listNoMore])
  }
  return ok([
    fmt(messages.listHeader, { page, total: rows.length }),
    ...pageRows.map((monitor) => formatMonitorLine(monitor, messages)),
  ])
}

type TargetAction = 'remove' | 'pause' | 'resume' | 'check' | 'price'

const NOT_FOUND_KEYS: Record<TargetAction, keyof BotMessages> = {
  remove: 'notFoundRemove',
  pause: 'notFoundPause',
  resume: 'notFoundResume',
  check: 'notFoundCheck',
  price: 'notFoundPrice',
}

function resolveOne(
  services: CommandServices,
  user: UserRow,
  parsed: ParsedCommand,
  messages: BotMessages,
  action: TargetAction,
): { result: CommandExecutionResult } | { monitor: MonitorRow } {
  const query = parsed.args.join(' ').trim()
  if (!query || !parsed.args.length) {
    return {
      result: fail([
        parsed.args.length
          ? fmt(messages.usageTarget, { command: parsed.command })
          : messages.provideTarget,
      ]),
    }
  }
  const resolution = resolveMonitorTarget(services.db, user.id, query)
  if (resolution.kind === 'none') {
    return {
      result: fail([fmt(messages[NOT_FOUND_KEYS[action]], { query })]),
    }
  }
  if (resolution.kind === 'many') {
    return {
      result: fail([
        fmt(messages.manyMatches, { query }),
        ...resolution.monitors.map((monitor) => formatMonitorLine(monitor, messages)),
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
  messages: BotMessages,
): Promise<CommandExecutionResult> {
  const readOnly = new Set(['help', 'list', 'price', 'events'])
  if (actor.role === 'viewer' && !readOnly.has(parsed.command)) {
    return fail([messages.viewerDenied], 'denied')
  }

  switch (parsed.command) {
    case 'help':
      return ok([messages.help])
    case 'cancel':
      clearCommandContext(services.db, actor.botAppId, actor.platformUserId, actor.chatId)
      return ok([messages.cancelDone])
    case 'list':
      return listMonitors(services, user, parsed, messages)
    case 'add': {
      const query = parsed.args.join(' ').trim()
      if (!query) return fail([messages.addUsage])
      const discount = numericFlag(parsed.flags, 'discount')
      if (parsed.flags.discount !== undefined && discount === null) {
        return fail([messages.discountInvalid], 'parse_error')
      }
      if (discount !== null && discount > 100) {
        return fail([messages.discountInvalid], 'parse_error')
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
          fmt(messages.selectionPrompt, { query: outcome.query }),
          ...outcome.results.map((item, index) => `${index + 1}. ${item.name} (${item.appid})`),
        ])
      }
      return describeAddOutcome(outcome, messages)
    }
    case 'adddlc': {
      const query = parsed.args.join(' ').trim()
      if (!query) return fail([messages.addDlcUsage])
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
          fmt(messages.selectionPrompt, { query: outcome.query }),
          ...outcome.results.map((item, index) => `${index + 1}. ${item.name} (${item.appid})`),
        ])
      }
      return describeImportOutcome(outcome, messages)
    }
    case 'remove': {
      const target = resolveOne(services, user, parsed, messages, 'remove')
      if ('result' in target) return target.result
      softDeleteMonitor(services.db, user.id, target.monitor.id)
      return ok([
        fmt(messages.removed, { line: formatMonitorLine(target.monitor, messages) }),
      ])
    }
    case 'pause':
    case 'resume': {
      const enable = parsed.command === 'resume'
      const target = resolveOne(
        services,
        user,
        parsed,
        messages,
        enable ? 'resume' : 'pause',
      )
      if ('result' in target) return target.result
      setMonitorEnabled(services.db, user.id, target.monitor.id, enable)
      return ok([
        fmt(enable ? messages.resumed : messages.paused, {
          line: formatMonitorLine(target.monitor, messages),
        }),
      ])
    }
    case 'check': {
      const target = resolveOne(services, user, parsed, messages, 'check')
      if ('result' in target) return target.result
      const outcome = await services.checkMonitor(target.monitor.id, {
        force: true,
        source: 'command',
      })
      return ok([
        `${target.monitor.name} (${target.monitor.appid}): ${describeCheck(outcome, messages)}`,
      ])
    }
    case 'price': {
      const target = resolveOne(services, user, parsed, messages, 'price')
      if ('result' in target) return target.result
      return ok([formatMonitorDetail(target.monitor, user.timezone, messages)])
    }
    case 'events': {
      const limit = Math.min(Math.max(1, numericFlag(parsed.flags, 'limit') ?? 10), 20)
      let monitorId: number | undefined
      const item = stringFlag(parsed.flags, 'item')
      if (item) {
        const resolution = resolveMonitorTarget(services.db, user.id, item)
        if (resolution.kind === 'none') {
          return fail([fmt(messages.eventsNotFound, { item })])
        }
        if (resolution.kind === 'many') {
          return fail([
            messages.eventsMany,
            ...resolution.monitors.map((monitor) => formatMonitorLine(monitor, messages)),
          ])
        }
        monitorId = resolution.monitor.id
      }
      const { rows } = listEvents(services.db, user.id, {
        monitorId,
        page: 1,
        pageSize: limit,
      })
      if (rows.length === 0) return ok([messages.eventsEmpty])
      return ok([
        messages.eventsHeader,
        ...rows.map((event) =>
          formatEventLine(event, user.timezone, event.monitorName, messages),
        ),
      ])
    }
    default:
      return fail([messages.unknownCommandReply], 'parse_error')
  }
}

async function executeSelection(
  services: CommandServices,
  actor: CommandActor,
  user: UserRow,
  text: string,
  messages: BotMessages,
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
    return fail(
      [fmt(messages.selectionInvalid, { count: payload.results.length })],
      'parse_error',
    )
  }
  clearCommandContext(services.db, actor.botAppId, actor.platformUserId, actor.chatId)

  if (actor.role === 'viewer') {
    return fail([messages.selectionViewerDenied], 'denied')
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
    return describeImportOutcome(outcome, messages)
  }

  const discount =
    typeof payload.flags.discount === 'string' ? Number(payload.flags.discount) : null
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
  return describeAddOutcome(outcome, messages)
}

export async function executeCommand(
  services: CommandServices,
  actor: CommandActor,
  user: UserRow,
  text: string,
): Promise<CommandExecutionResult> {
  const messages = botMessages(user.ui_locale)
  const selected = await executeSelection(services, actor, user, text, messages)
  if (selected) return selected

  const parsed = parseCommand(text, messages)
  if (!parsed.ok) return fail([parsed.error], 'parse_error')
  return executeParsed(services, actor, user, parsed.parsed, messages)
}
