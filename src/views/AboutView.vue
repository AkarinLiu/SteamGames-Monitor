<script setup lang="ts">
import { t, uiLocale } from '@/i18n'
import { API_VERSION, APP_NAME } from '@shared/constants'

const repoUrl = 'https://github.com/AkarinLiu/SteamGames-Monitor'
const readmeUrl =
  uiLocale.value === 'zh-CN'
    ? `${repoUrl}#readme`
    : `${repoUrl}/blob/main/docs/${uiLocale.value}/README.md`

const links = [
  { label: t("GitHub 仓库"), href: repoUrl, hint: 'github.com/AkarinLiu/SteamGames-Monitor' },
  { label: t("使用文档"), href: readmeUrl, hint: 'README' },
  { label: t("问题反馈"), href: `${repoUrl}/issues`, hint: 'Issues' },
  { label: t("版本发布"), href: `${repoUrl}/releases`, hint: 'Releases' },
  {
    label: t("自定义 WebHook 文档"),
    href: `${repoUrl}/blob/main/docs/${uiLocale.value}/CUSTOM_WEBHOOK.md`,
    hint: 'CUSTOM_WEBHOOK.md',
  },
]

const stack = [
  { label: t("前端"), value: 'Vue 3 · Vite · Pinia · Vue Router' },
  { label: t("后端"), value: 'Node.js · TypeScript · Hono' },
  { label: t("数据存储"), value: 'SQLite (WAL)' },
  { label: t("通知与机器人"), value: 'WeCom · Feishu · DingTalk · Gotify · Bark · WebHook · SMTP' },
]
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1>{{ $t("关于") }}</h1>
        <p>{{ $t("版本信息、项目简介与相关链接。") }}</p>
      </div>
    </div>

    <div class="detail-grid">
      <div class="stack">
        <section class="card">
          <div class="inline" style="align-items: center; gap: 14px">
            <span class="brand-mark" style="width: 46px; height: 46px; font-size: 1.35rem">S</span>
            <div>
              <h2 style="margin: 0">{{ $t(APP_NAME) }}</h2>
              <div class="faint mono">v{{ API_VERSION }}</div>
            </div>
          </div>
          <p class="muted" style="margin: 16px 0 0">
            {{ $t("自托管的多用户 Steam 游戏 / DLC 销售状态监控系统，支持下架预警、促销与发售通知，可通过群机器人、WebHook、Gotify / Bark 或 SMTP 推送状态变化。") }}
          </p>
          <p class="small faint" style="margin: 10px 0 0">
            {{ $t("与 Valve / Steam 官方无关的第三方开源项目。") }}
          </p>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>{{ $t("技术栈") }}</h2>
          </div>
          <div class="stack small">
            <div
              v-for="item in stack"
              :key="item.label"
              class="inline"
              style="justify-content: space-between; gap: 16px"
            >
              <span class="muted">{{ item.label }}</span>
              <span class="mono" style="text-align: right">{{ item.value }}</span>
            </div>
          </div>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-title">
            <h2>{{ $t("版本信息") }}</h2>
          </div>
          <div class="stack small">
            <div class="inline" style="justify-content: space-between">
              <span class="muted">{{ $t("应用版本") }}</span>
              <span class="badge badge-accent mono">v{{ API_VERSION }}</span>
            </div>
            <div class="inline" style="justify-content: space-between">
              <span class="muted">{{ $t("界面语言") }}</span>
              <span class="mono">{{ uiLocale }}</span>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>{{ $t("相关链接") }}</h2>
          </div>
          <div class="stack small">
            <a
              v-for="link in links"
              :key="link.href"
              class="about-link"
              :href="link.href"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>{{ link.label }}</span>
              <span class="faint small">{{ link.hint }} ↗</span>
            </a>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
