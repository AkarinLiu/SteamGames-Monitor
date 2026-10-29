import { z } from 'zod'
import type { AppContext } from './context'
import { AppError, badRequest } from '../lib/errors'

export function formatZodIssues(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
}

export function parseWith<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw badRequest('请求参数校验失败', formatZodIssues(result.error))
  }
  return result.data
}

export async function parseJson<T>(c: AppContext, schema: z.ZodType<T>): Promise<T> {
  const contentType = c.req.header('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new AppError(415, 'unsupported_media_type', '请求必须使用 application/json')
  }
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw badRequest('请求体必须是合法 JSON')
  }
  return parseWith(schema, body)
}

export function parseQuery<T>(c: AppContext, schema: z.ZodType<T>): T {
  return parseWith(schema, c.req.query())
}

export function parseIdParam(c: AppContext, name = 'id'): number {
  const raw = c.req.param(name)
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw badRequest('无效的 ID')
  }
  return value
}
