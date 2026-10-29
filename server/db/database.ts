import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { StatementSync } from 'node:sqlite'
import { migrations } from './migrations'

export function runMigrations(db: DatabaseSync): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
  )
  const rows = db.prepare('SELECT version FROM schema_migrations').all() as Array<{
    version: number
  }>
  const applied = new Set(rows.map((row) => Number(row.version)))
  const pending = migrations
    .filter((migration) => !applied.has(migration.version))
    .sort((a, b) => a.version - b.version)
  if (pending.length === 0) return

  // Table rebuilds require FK enforcement off; each migration still runs atomically.
  db.exec('PRAGMA foreign_keys = OFF')
  try {
    for (const migration of pending) {
      db.exec('BEGIN IMMEDIATE')
      try {
        migration.up(db)
        db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
          migration.version,
          Date.now(),
        )
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    }
    const violations = db.prepare('PRAGMA foreign_key_check').all()
    if (violations.length > 0) {
      throw new Error(`数据库迁移后存在外键冲突（${violations.length} 行）`)
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
}

export class Db {
  readonly raw: DatabaseSync
  private readonly statements = new Map<string, StatementSync>()
  private transactionDepth = 0

  constructor(readonly filePath: string) {
    if (filePath !== ':memory:') {
      mkdirSync(path.dirname(filePath), { recursive: true })
    }
    this.raw = new DatabaseSync(filePath)
    this.raw.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA temp_store = MEMORY;
    `)
    runMigrations(this.raw)
  }

  prepare(sql: string): StatementSync {
    let statement = this.statements.get(sql)
    if (!statement) {
      statement = this.raw.prepare(sql)
      this.statements.set(sql, statement)
    }
    return statement
  }

  transaction<T>(fn: () => T): T {
    if (this.transactionDepth > 0) {
      const savepoint = `sp_${this.transactionDepth}`
      this.raw.exec(`SAVEPOINT ${savepoint}`)
      this.transactionDepth += 1
      try {
        const result = fn()
        this.raw.exec(`RELEASE ${savepoint}`)
        return result
      } catch (error) {
        this.raw.exec(`ROLLBACK TO ${savepoint}`)
        this.raw.exec(`RELEASE ${savepoint}`)
        throw error
      } finally {
        this.transactionDepth -= 1
      }
    }

    this.raw.exec('BEGIN IMMEDIATE')
    this.transactionDepth = 1
    try {
      const result = fn()
      this.raw.exec('COMMIT')
      return result
    } catch (error) {
      this.raw.exec('ROLLBACK')
      throw error
    } finally {
      this.transactionDepth = 0
    }
  }

  checkpoint(mode: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE' = 'TRUNCATE'): void {
    try {
      this.raw.exec(`PRAGMA wal_checkpoint(${mode})`)
    } catch {
      // checkpoint can fail while another statement is active; retried next hour
    }
  }

  vacuumInto(targetPath: string): void {
    const escaped = targetPath.replaceAll("'", "''")
    this.raw.exec(`VACUUM INTO '${escaped}'`)
  }

  close(): void {
    this.statements.clear()
    this.raw.close()
  }
}

export function openDatabase(filePath: string): Db {
  return new Db(filePath)
}

export function lastInsertId(result: { lastInsertRowid: number | bigint }): number {
  return Number(result.lastInsertRowid)
}

export function affectedRows(result: { changes: number | bigint }): number {
  return Number(result.changes)
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
}

export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Error && /FOREIGN KEY constraint failed/i.test(error.message)
}
