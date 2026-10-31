import fs from 'node:fs'
import path from 'node:path'
import {
  APP_NAME,
  BOT_PLATFORM_OPTIONS,
  CHANNEL_TYPE_OPTIONS,
  EVENT_META,
  EVENT_TYPE_OPTIONS,
  LANGUAGE_OPTIONS,
  NEWS_MATCH_MODE_OPTIONS,
  REGION_OPTIONS,
  ROLE_OPTIONS,
} from '../shared/constants'

const files: string[] = []
function walk(dir: string): void {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p)
    else if (/\.(vue|ts)$/.test(p)) files.push(p)
  }
}
walk('src')

const keys = new Set<string>([APP_NAME])

for (const file of files) {
  if (file.replaceAll('\\', '/').startsWith('src/i18n/')) continue
  const source = fs.readFileSync(file, 'utf8')
  for (const match of source.matchAll(
    /\b(?:\$t|\$tf|t|tf)\(\s*("(?:\\.|[^"])*"|'(?:\\.|[^'])*')/g,
  )) {
    const raw = match[1]
    if (!raw) continue
    try {
      keys.add(JSON.parse(raw.replace(/^'|'$/g, '"')))
    } catch {
      keys.add(raw.slice(1, -1))
    }
  }
}

function addOptions(options: ReadonlyArray<{ label: string }>): void {
  for (const option of options) {
    if (/[\u4e00-\u9fff]/.test(option.label)) keys.add(option.label)
  }
}
addOptions(BOT_PLATFORM_OPTIONS)
addOptions(CHANNEL_TYPE_OPTIONS)
addOptions(EVENT_TYPE_OPTIONS)
addOptions(LANGUAGE_OPTIONS)
addOptions(NEWS_MATCH_MODE_OPTIONS)
addOptions(REGION_OPTIONS)
addOptions(ROLE_OPTIONS)
for (const meta of Object.values(EVENT_META)) {
  keys.add(meta.label)
  keys.add(meta.short)
  keys.add(meta.description)
}

for (const title of [
  '初始化系统',
  '登录',
  '修改密码',
  '初始设置',
  '概览',
  '监控状态与最近事件',
  '监控项',
  '游戏与 DLC 的销售状态',
  '监控详情',
  '价格、快照与事件时间线',
  '事件记录',
  '状态变化与通知投递',
  '通知渠道',
  '机器人 Webhook 与 SMTP 邮件',
  '指令机器人',
  '飞书 / 钉钉 / 企业微信',
  '机器人授权',
  '批准平台用户的指令权限',
  '个人设置',
  '资料、区域与通知偏好',
  '帮助',
  '接入步骤与指令说明',
  '用户管理',
  '账号、角色与配额',
  '系统状态',
  '调度、限流与保留策略',
  '页面不存在',
]) {
  keys.add(title)
}

const output = [...keys]
  .filter((key) => /[\u4e00-\u9fff]/.test(key))
  .sort((a, b) => a.localeCompare(b, 'zh-CN'))
fs.writeFileSync(
  'src/i18n/keys.json',
  `${JSON.stringify(output, null, 2)}\n`,
  'utf8',
)
console.log('keys', output.length)
