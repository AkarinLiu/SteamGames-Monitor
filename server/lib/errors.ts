import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const badRequest = (message = '请求参数无效', details?: unknown) =>
  new AppError(400, 'bad_request', message, details)

export const unauthorized = (message = '请先登录') =>
  new AppError(401, 'unauthorized', message)

export const forbidden = (message = '没有权限执行该操作') =>
  new AppError(403, 'forbidden', message)

export const notFound = (message = '资源不存在') => new AppError(404, 'not_found', message)

export const conflict = (message = '资源冲突', details?: unknown) =>
  new AppError(409, 'conflict', message, details)

export const preconditionRequired = (message = '系统尚未初始化') =>
  new AppError(428, 'setup_required', message)

export const tooManyRequests = (message = '请求过于频繁，请稍后再试', details?: unknown) =>
  new AppError(429, 'too_many_requests', message, details)

export const badGateway = (message = '上游服务请求失败', details?: unknown) =>
  new AppError(502, 'bad_gateway', message, details)

export const internalError = (message = '服务器内部错误') =>
  new AppError(500, 'internal_error', message)
