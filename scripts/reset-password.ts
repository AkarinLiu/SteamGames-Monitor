import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { LIMITS } from '../shared/constants'
import { openDatabase } from '../server/db/database'
import { findUserByUsername, listUserRows } from '../server/db/repo/users'
import { deleteUserSessions } from '../server/db/repo/sessions'
import { writeAudit } from '../server/db/repo/audit'
import { hashPassword } from '../server/auth/password'

const explicitDatabasePath = process.env.DATABASE_PATH
const explicitDataDir = process.env.DATA_DIR
try {
  process.loadEnvFile()
} catch {
  // No .env file; rely on process environment.
}
if (explicitDatabasePath !== undefined) process.env.DATABASE_PATH = explicitDatabasePath
if (explicitDataDir !== undefined) process.env.DATA_DIR = explicitDataDir

interface Args {
  username: string
  password: string
  enable: boolean
  help: boolean
}

function usage(): string {
  return [
    '用法：pnpm reset-password <用户名> [选项]',
    '      node dist-server/reset-password.js <用户名> [选项]（Docker / 生产构建）',
    '',
    '选项：',
    '  -p, --password <密码>  使用指定密码（至少 10 位），默认随机生成',
    '  -e, --enable           同时启用被禁用的账号',
    '  -h, --help             显示帮助',
    '',
    '示例：',
    '  pnpm reset-password admin',
    "  pnpm reset-password admin --password 'new-password-123'",
    '  pnpm reset-password admin --enable',
  ].join('\n')
}

function parseArgs(argv: string[]): Args {
  const args: Args = { username: '', password: '', enable: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    if (arg === '-h' || arg === '--help') {
      args.help = true
      continue
    }
    if (arg === '-e' || arg === '--enable') {
      args.enable = true
      continue
    }
    if (arg === '-p' || arg === '--password') {
      args.password = argv[index + 1] ?? ''
      index += 1
      continue
    }
    if (arg.startsWith('--password=')) {
      args.password = arg.slice('--password='.length)
      continue
    }
    if (arg.startsWith('-')) {
      throw new Error(`未知选项：${arg}`)
    }
    if (!args.username) {
      args.username = arg
      continue
    }
    throw new Error(`多余的参数：${arg}`)
  }
  return args
}

function databasePath(): string {
  const dataDir = path.resolve(process.env.DATA_DIR ?? './data')
  return process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(dataDir, 'steam-monitor.db')
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  if (!args.username) {
    console.error(usage())
    process.exitCode = 1
    return
  }
  if (args.password && args.password.length < LIMITS.passwordMinLength) {
    console.error(`密码至少需要 ${LIMITS.passwordMinLength} 位。`)
    process.exitCode = 1
    return
  }
  if (args.password.length > LIMITS.passwordMaxLength) {
    console.error(`密码不能超过 ${LIMITS.passwordMaxLength} 位。`)
    process.exitCode = 1
    return
  }

  const file = databasePath()
  if (!existsSync(file)) {
    console.error(`数据库不存在：${file}`)
    console.error('请检查 DATA_DIR / DATABASE_PATH，或在项目根目录执行该命令。')
    process.exitCode = 1
    return
  }

  const db = openDatabase(file)
  try {
    const user = findUserByUsername(db, args.username)
    if (!user) {
      const names = listUserRows(db)
        .map((row) => row.username)
        .slice(0, 20)
      console.error(`用户「${args.username}」不存在。`)
      if (names.length > 0) console.error(`现有用户：${names.join(', ')}`)
      process.exitCode = 1
      return
    }

    const password = args.password || randomBytes(12).toString('base64url')
    const passwordHash = await hashPassword(password)
    const now = Date.now()
    const activeSessions = db
      .prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?')
      .get(user.id) as { n: number }

    db.transaction(() => {
      db.prepare(
        'UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?',
      ).run(passwordHash, now, user.id)
      if (args.enable && user.status !== 'active') {
        db.prepare("UPDATE users SET status = 'active', updated_at = ? WHERE id = ?").run(
          now,
          user.id,
        )
      }
      deleteUserSessions(db, user.id)
      writeAudit(db, {
        actorUserId: null,
        action: 'user.password.reset_cli',
        target: `user:${user.id}`,
        detail: {
          username: user.username,
          generated: !args.password,
          enabled: args.enable && user.status !== 'active',
        },
        ip: null,
      })
    })

    console.log(`已重置用户 ${user.username}（ID ${user.id}）的密码。`)
    console.log(`${args.password ? '新密码' : '临时密码'}：${password}`)
    console.log('下次登录必须修改密码；该用户的现有会话已全部失效。')
    if (activeSessions.n > 0) console.log(`已撤销会话：${activeSessions.n} 个。`)
    if (user.status !== 'active' && !args.enable) {
      console.log('提示：该账号当前为禁用状态，使用 --enable 可同时启用。')
    }
  } finally {
    db.close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
