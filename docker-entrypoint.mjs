import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const dataDir = process.env.DATA_DIR?.startsWith('/') ? process.env.DATA_DIR : '/data'
const databasePath = process.env.DATABASE_PATH?.startsWith('/')
  ? process.env.DATABASE_PATH
  : `${dataDir}/steam-monitor.db`

process.env.DATA_DIR = dataDir
process.env.DATABASE_PATH = databasePath

const NODE_UID = 1000
const NODE_GID = 1000

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  try {
    mkdirSync(dataDir, { recursive: true })
    execFileSync('chown', ['-R', `${NODE_UID}:${NODE_GID}`, dataDir], { stdio: 'ignore' })
  } catch (error) {
    console.error(`[entrypoint] 无法准备数据目录 ${dataDir}:`, error)
  }
  process.setgid(NODE_GID)
  process.setuid(NODE_UID)
}

await import('./dist-server/index.js')
