import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { env } from '../server/env'

const KEEP_BACKUPS = 14
const BACKUP_PATTERN = /^steam-monitor-\d{8}-\d{4}\.db$/

function timestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join('')
}

const databasePath = env.DATABASE_PATH
if (!existsSync(databasePath)) {
  console.error(`[backup] 数据库不存在：${databasePath}`)
  process.exit(1)
}

const backupDir = path.join(path.dirname(databasePath), 'backups')
mkdirSync(backupDir, { recursive: true })

const target = path.join(backupDir, `steam-monitor-${timestamp(new Date())}.db`)
if (existsSync(target)) {
  console.error(`[backup] 目标文件已存在：${target}`)
  process.exit(1)
}

const db = new DatabaseSync(databasePath)
try {
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`)
} finally {
  db.close()
}

console.log(`[backup] 已生成备份：${target}`)

const backups = readdirSync(backupDir)
  .filter((name) => BACKUP_PATTERN.test(name))
  .map((name) => {
    const filePath = path.join(backupDir, name)
    return { filePath, mtimeMs: statSync(filePath).mtimeMs }
  })
  .sort((a, b) => b.mtimeMs - a.mtimeMs)

for (const stale of backups.slice(KEEP_BACKUPS)) {
  unlinkSync(stale.filePath)
  console.log(`[backup] 已清理旧备份：${stale.filePath}`)
}

console.log(`[backup] 当前保留 ${Math.min(backups.length, KEEP_BACKUPS)} 份备份`)
