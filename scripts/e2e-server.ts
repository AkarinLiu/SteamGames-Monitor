import { rmSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const dataDir = path.resolve(process.env.DATA_DIR ?? './data/e2e')
if (path.basename(dataDir) !== 'e2e') {
  console.error(`[e2e] 拒绝清理非 e2e 数据目录：${dataDir}`)
  process.exit(1)
}

rmSync(dataDir, { recursive: true, force: true, maxRetries: 3 })
process.env.DATA_DIR = dataDir
console.log(`[e2e] 使用全新数据目录 ${dataDir}`)

await import('../server/index')
