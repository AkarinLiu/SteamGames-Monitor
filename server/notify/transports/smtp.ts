import nodemailer from 'nodemailer'
import type { RenderedMessage, SendResult, SmtpChannelConfig } from '../types'

export async function sendSmtp(
  config: SmtpChannelConfig,
  message: RenderedMessage,
): Promise<SendResult> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTls === true,
    auth: config.username
      ? { user: config.username, pass: config.password ?? '' }
      : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 25_000,
  })

  try {
    await transport.sendMail({
      from: config.from,
      to: config.to.join(', '),
      subject: message.subject.slice(0, 200),
      text: message.text,
      html: message.html,
    })
    return { ok: true, httpStatus: null }
  } catch (error) {
    const err = error as Error & { code?: string; responseCode?: number }
    const permanent = err.code === 'EAUTH' || err.responseCode === 550
    return {
      ok: false,
      httpStatus: typeof err.responseCode === 'number' ? err.responseCode : null,
      error: `SMTP 发送失败：${err.message}`,
      permanent,
      retryAfterMs: permanent ? undefined : 60_000,
    }
  } finally {
    transport.close()
  }
}
