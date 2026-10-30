import { createRouter, createWebHistory } from 'vue-router'
import { setUnauthorizedHandler } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import AppShell from '@/layouts/AppShell.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/setup',
      name: 'setup',
      component: () => import('../views/SetupView.vue'),
      meta: { title: '初始化系统', standalone: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { title: '登录', standalone: true },
    },
    {
      path: '/change-password',
      name: 'change-password',
      component: () => import('../views/ChangePasswordView.vue'),
      meta: { title: '修改密码', standalone: true },
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: () => import('../views/OnboardingView.vue'),
      meta: { title: '初始设置', standalone: true },
    },
    {
      path: '/',
      component: AppShell,
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('../views/DashboardView.vue'),
          meta: { title: '概览', subtitle: '监控状态与最近事件' },
        },
        {
          path: 'monitors',
          name: 'monitors',
          component: () => import('../views/MonitorsView.vue'),
          meta: { title: '监控项', subtitle: '游戏与 DLC 的销售状态' },
        },
        {
          path: 'monitors/:id',
          name: 'monitor-detail',
          component: () => import('../views/MonitorDetailView.vue'),
          meta: { title: '监控详情', subtitle: '价格、快照与事件时间线' },
        },
        {
          path: 'events',
          name: 'events',
          component: () => import('../views/EventsView.vue'),
          meta: { title: '事件记录', subtitle: '状态变化与通知投递' },
        },
        {
          path: 'channels',
          name: 'channels',
          component: () => import('../views/ChannelsView.vue'),
          meta: { title: '通知渠道', subtitle: '机器人 Webhook 与 SMTP 邮件' },
        },
        {
          path: 'bots',
          name: 'bots',
          component: () => import('../views/BotsView.vue'),
          meta: { title: '指令机器人', subtitle: '飞书 / 钉钉 / 企业微信' },
        },
        {
          path: 'authorize/:token',
          name: 'bot-authorize',
          component: () => import('../views/BotAuthorizeView.vue'),
          meta: { title: '机器人授权', subtitle: '批准平台用户的指令权限' },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('../views/UserSettingsView.vue'),
          meta: { title: '个人设置', subtitle: '资料、区域与通知偏好' },
        },
        {
          path: 'help',
          name: 'help',
          component: () => import('../views/HelpView.vue'),
          meta: { title: '帮助', subtitle: '接入步骤与指令说明' },
        },
        {
          path: 'admin/users',
          name: 'admin-users',
          component: () => import('../views/AdminUsersView.vue'),
          meta: { title: '用户管理', subtitle: '账号、角色与配额', admin: true },
        },
        {
          path: 'admin/system',
          name: 'admin-system',
          component: () => import('../views/AdminSystemView.vue'),
          meta: { title: '系统状态', subtitle: '调度、限流与保留策略', admin: true },
        },
        {
          path: ':pathMatch(.*)*',
          name: 'not-found',
          component: () => import('../views/NotFoundView.vue'),
          meta: { title: '页面不存在' },
        },
      ],
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const session = useSessionStore()

  if (!session.setupLoaded) await session.loadSetupStatus()

  if (session.setupRequired === true) {
    return to.name === 'setup' ? true : { name: 'setup' }
  }

  if (to.name === 'setup') {
    if (!session.loaded) await session.load()
    return session.user ? { name: 'dashboard' } : { name: 'login' }
  }

  if (!session.loaded) await session.load()

  if (!session.user) {
    if (to.name === 'login') return true
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.name === 'login') return { name: 'dashboard' }

  if (session.needsPasswordChange && to.name !== 'change-password') {
    return { name: 'change-password' }
  }

  if (!session.isOnboarded) {
    if (to.name !== 'onboarding' && to.name !== 'change-password') {
      return { name: 'onboarding' }
    }
    return true
  }

  if (to.name === 'onboarding') return { name: 'dashboard' }

  if (to.meta.admin === true && !session.isAdmin) return { name: 'dashboard' }

  return true
})

setUnauthorizedHandler(() => {
  const session = useSessionStore()
  session.setUser(null)
  const current = router.currentRoute.value
  const name = current.name
  if (name && name !== 'login' && name !== 'setup') {
    void router.replace({ name: 'login', query: { redirect: current.fullPath } })
  }
})

export default router
