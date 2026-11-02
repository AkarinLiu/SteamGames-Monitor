<script setup lang="ts">
import { t, tf } from '@/i18n'

import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AdminUserSummary, Role, UserStatus } from '@shared/types'
import {
  LANGUAGE_OPTIONS,
  LIMITS,
  REGION_OPTIONS,
  ROLE_OPTIONS,
  TIMEZONE_OPTIONS,
} from '@shared/constants'
import { describeError } from '@/api/client'
import { useAdminStore } from '@/stores/admin'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import { formatDateTime, formatRelative } from '@/lib/format'
import Modal from '@/components/Modal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'
import CopyButton from '@/components/CopyButton.vue'
import UserDetailDrawer from '@/components/UserDetailDrawer.vue'

const route = useRoute()
const router = useRouter()
const store = useAdminStore()
const session = useSessionStore()
const toast = useToastStore()
const timezone = session.user?.timezone ?? 'UTC'

const error = ref('')
const createOpen = ref(false)
const createBusy = ref(false)
const createError = ref('')
const createForm = reactive({
  username: '',
  displayName: '',
  password: '',
  role: 'member' as Role,
  maxMonitors: LIMITS.maxMonitorsPerUser as number,
  region: '',
  language: '',
  timezone: '',
})

const editTarget = ref<AdminUserSummary | null>(null)
const editBusy = ref(false)
const editError = ref('')
const editForm = reactive({
  displayName: '',
  role: 'member' as Role,
  status: 'active' as UserStatus,
  maxMonitors: LIMITS.maxMonitorsPerUser as number,
  mustChangePassword: false,
})

const deleteTarget = ref<AdminUserSummary | null>(null)
const deleteBusy = ref(false)
const resetTarget = ref<AdminUserSummary | null>(null)
const resetBusy = ref(false)
const resetResult = ref<{ user: AdminUserSummary; password: string } | null>(null)
const detailTarget = ref<AdminUserSummary | null>(null)

const selectedIds = ref<Set<number>>(new Set())
const batchBusy = ref(false)
const batchMaxMonitors = ref<number>(LIMITS.maxMonitorsPerUser)

const search = ref('')
const filterRole = ref<'' | Role>('')
const filterStatus = ref<'' | UserStatus>('')
const filterMustChange = ref<'all' | 'yes' | 'no'>('all')
const filterOnboarded = ref<'all' | 'yes' | 'no'>('all')

function syncFiltersFromQuery(): void {
  const q = route.query
  search.value = typeof q.q === 'string' ? q.q : ''
  filterRole.value = (typeof q.role === 'string' && (q.role === 'admin' || q.role === 'member')) ? q.role : ''
  filterStatus.value = (typeof q.status === 'string' && (q.status === 'active' || q.status === 'disabled')) ? q.status : ''
  filterMustChange.value = q.mustChange === 'yes' ? 'yes' : q.mustChange === 'no' ? 'no' : 'all'
  filterOnboarded.value = q.onboarded === 'yes' ? 'yes' : q.onboarded === 'no' ? 'no' : 'all'
}

function writeFilterQuery(): void {
  const query: Record<string, string> = {}
  if (search.value) query.q = search.value
  if (filterRole.value) query.role = filterRole.value
  if (filterStatus.value) query.status = filterStatus.value
  if (filterMustChange.value !== 'all') query.mustChange = filterMustChange.value
  if (filterOnboarded.value !== 'all') query.onboarded = filterOnboarded.value
  void router.replace({ query })
}

const filteredUsers = computed<AdminUserSummary[]>(() => {
  const keyword = search.value.trim().toLowerCase()
  return store.users.filter((person) => {
    if (keyword) {
      const hay = `${person.username} ${person.displayName}`.toLowerCase()
      if (!hay.includes(keyword)) return false
    }
    if (filterRole.value && person.role !== filterRole.value) return false
    if (filterStatus.value && person.status !== filterStatus.value) return false
    if (filterMustChange.value === 'yes' && !person.mustChangePassword) return false
    if (filterMustChange.value === 'no' && person.mustChangePassword) return false
    if (filterOnboarded.value === 'yes' && !person.onboardedAt) return false
    if (filterOnboarded.value === 'no' && person.onboardedAt) return false
    return true
  })
})

const allSelected = computed<boolean>(
  () => filteredUsers.value.length > 0 && selectedIds.value.size === filteredUsers.value.length,
)

function toggleSelect(id: number): void {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function toggleSelectAll(): void {
  if (selectedIds.value.size === filteredUsers.value.length) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(filteredUsers.value.map((user) => user.id))
  }
}

watch(filteredUsers, () => {
  const validIds = new Set(filteredUsers.value.map((user) => user.id))
  const next = new Set<number>()
  for (const id of selectedIds.value) {
    if (validIds.has(id)) next.add(id)
  }
  selectedIds.value = next
})

watch([search, filterRole, filterStatus, filterMustChange, filterOnboarded], () => {
  writeFilterQuery()
})

async function runBatch(
  action:
    | { action: 'enable'; ids: number[] }
    | { action: 'disable'; ids: number[] }
    | { action: 'force_change_password'; ids: number[] }
    | { action: 'set_max_monitors'; ids: number[]; maxMonitors: number }
    | { action: 'delete'; ids: number[] },
  confirmMessage: string,
): Promise<void> {
  if (selectedIds.value.size === 0) return
  if (!window.confirm(confirmMessage)) return
  batchBusy.value = true
  try {
    const result = await store.batchUsers(action)
    if (result.failed.length === 0) {
      toast.success(tf("已批量处理 {count} 位用户", { count: result.succeeded.length }))
    } else {
      toast.error(
        tf("部分失败：成功 {ok}，失败 {fail}", {
          ok: result.succeeded.length,
          fail: result.failed.length,
        }),
      )
    }
    selectedIds.value = new Set()
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    batchBusy.value = false
  }
}

async function load(): Promise<void> {
  error.value = ''
  try {
    await store.fetchUsers()
  } catch (err) {
    error.value = describeError(err)
  }
}

function openCreate(): void {
  createForm.username = ''
  createForm.displayName = ''
  createForm.password = ''
  createForm.role = 'member'
  createForm.maxMonitors = LIMITS.maxMonitorsPerUser
  createForm.region = ''
  createForm.language = ''
  createForm.timezone = ''
  createError.value = ''
  createOpen.value = true
}

async function submitCreate(): Promise<void> {
  createError.value = ''
  if (createForm.password.length < LIMITS.passwordMinLength) {
    createError.value = tf('临时密码至少需要 {min} 位', { min: LIMITS.passwordMinLength })
    return
  }
  createBusy.value = true
  try {
    await store.createUser({
      username: createForm.username.trim(),
      displayName: createForm.displayName.trim(),
      password: createForm.password,
      role: createForm.role,
      maxMonitors: createForm.maxMonitors,
      region: createForm.region || undefined,
      language: createForm.language || undefined,
      timezone: createForm.timezone || undefined,
    })
    toast.success(t("用户已创建，请把临时密码安全地交给对方"))
    createOpen.value = false
  } catch (err) {
    createError.value = describeError(err)
  } finally {
    createBusy.value = false
  }
}

function openEdit(target: AdminUserSummary): void {
  editTarget.value = target
  editForm.displayName = target.displayName
  editForm.role = target.role
  editForm.status = target.status
  editForm.maxMonitors = target.maxMonitors
  editForm.mustChangePassword = target.mustChangePassword
  editError.value = ''
}

async function submitEdit(): Promise<void> {
  const target = editTarget.value
  if (!target) return
  editError.value = ''
  editBusy.value = true
  try {
    await store.updateUser(target.id, {
      displayName: editForm.displayName.trim(),
      role: editForm.role,
      status: editForm.status,
      maxMonitors: editForm.maxMonitors,
      mustChangePassword: editForm.mustChangePassword,
    })
    toast.success(t("用户信息已更新"))
    editTarget.value = null
  } catch (err) {
    editError.value = describeError(err)
  } finally {
    editBusy.value = false
  }
}

async function confirmReset(): Promise<void> {
  const target = resetTarget.value
  if (!target) return
  resetBusy.value = true
  try {
    const password = await store.resetPassword(target.id)
    resetResult.value = { user: target, password }
    resetTarget.value = null
    toast.success(t("临时密码已生成，用户的现有会话已注销"))
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    resetBusy.value = false
  }
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  deleteBusy.value = true
  try {
    await store.deleteUser(target.id)
    toast.success(t("用户已删除"))
    deleteTarget.value = null
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    deleteBusy.value = false
  }
}

onMounted(() => {
  syncFiltersFromQuery()
  void load()
})

watch(
  () => route.query,
  () => {
    syncFiltersFromQuery()
  },
)
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1>{{ $t("用户管理") }}</h1>
        <p>{{ $t("创建账号、分配配额与角色。管理员不能查看其他用户的监控内容。") }}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" type="button" @click="openCreate">{{ $t("创建用户") }}</button>
      </div>
    </div>

    <ErrorBanner :message="error" />

    <div class="card filter-bar">
      <div class="field search-field">
        <label for="u-search">{{ $t("搜索") }}</label>
        <input
          id="u-search"
          v-model="search"
          class="input"
          type="search"
          :placeholder='$t("按用户名或显示名称搜索")'
        />
      </div>
      <div class="field">
        <label for="u-role">{{ $t("角色") }}</label>
        <select id="u-role" v-model="filterRole" class="select">
          <option value="">{{ $t("全部") }}</option>
          <option value="admin">{{ $t("管理员") }}</option>
          <option value="member">{{ $t("普通用户") }}</option>
        </select>
      </div>
      <div class="field">
        <label for="u-status">{{ $t("状态") }}</label>
        <select id="u-status" v-model="filterStatus" class="select">
          <option value="">{{ $t("全部") }}</option>
          <option value="active">{{ $t("启用") }}</option>
          <option value="disabled">{{ $t("禁用") }}</option>
        </select>
      </div>
      <div class="field">
        <label for="u-must-change">{{ $t("待改密") }}</label>
        <select id="u-must-change" v-model="filterMustChange" class="select">
          <option value="all">{{ $t("全部") }}</option>
          <option value="yes">{{ $t("是") }}</option>
          <option value="no">{{ $t("否") }}</option>
        </select>
      </div>
      <div class="field">
        <label for="u-onboarded">{{ $t("初始设置") }}</label>
        <select id="u-onboarded" v-model="filterOnboarded" class="select">
          <option value="all">{{ $t("全部") }}</option>
          <option value="yes">{{ $t("已完成") }}</option>
          <option value="no">{{ $t("未完成") }}</option>
        </select>
      </div>
      <div class="field filter-actions">
        <label class="invisible">{{ $t("操作") }}</label>
        <button class="btn" type="button" @click="search = ''; filterRole = ''; filterStatus = ''; filterMustChange = 'all'; filterOnboarded = 'all'">
          {{ $t("清除筛选") }}
        </button>
      </div>
    </div>

    <p v-if="store.users.length > 0" class="faint small filter-summary">
      {{ tf("显示 {shown} / {total} 位用户", { shown: filteredUsers.length, total: store.users.length }) }}
    </p>

    <div v-if="selectedIds.size > 0" class="batch-bar card">
      <span class="batch-count">
        {{ tf("已选择 {count} 位用户", { count: selectedIds.size }) }}
      </span>
      <div class="batch-actions">
        <button
          class="btn btn-sm"
          type="button"
          :disabled="batchBusy"
          @click="runBatch({ action: 'enable', ids: Array.from(selectedIds) }, $t('确定批量启用所选用户吗？'))"
        >
          {{ $t("批量启用") }}
        </button>
        <button
          class="btn btn-sm"
          type="button"
          :disabled="batchBusy"
          @click="runBatch({ action: 'disable', ids: Array.from(selectedIds) }, $t('确定批量禁用所选用户吗？被禁用用户会立即被注销。'))"
        >
          {{ $t("批量禁用") }}
        </button>
        <button
          class="btn btn-sm"
          type="button"
          :disabled="batchBusy"
          @click="runBatch({ action: 'force_change_password', ids: Array.from(selectedIds) }, $t('确定批量强制所选用户下次登录改密吗？现有会话会被注销。'))"
        >
          {{ $t("强制改密") }}
        </button>
        <div class="inline batch-setmax">
          <input
            v-model.number="batchMaxMonitors"
            class="input input-sm"
            type="number"
            min="1"
            max="2000"
            style="width: 90px"
            @click.stop
          />
          <button
            class="btn btn-sm"
            type="button"
            :disabled="batchBusy"
            @click.stop="runBatch({ action: 'set_max_monitors', ids: Array.from(selectedIds), maxMonitors: batchMaxMonitors }, $tf('确定把所选用户的监控配额设为 {max} 吗？', { max: batchMaxMonitors }))"
          >
            {{ $t("设置配额") }}
          </button>
        </div>
        <button
          class="btn btn-sm btn-danger"
          type="button"
          :disabled="batchBusy"
          @click="runBatch({ action: 'delete', ids: Array.from(selectedIds) }, $t('确定批量删除所选用户吗？该操作不可恢复，用户数据会被级联删除。'))"
        >
          {{ $t("批量删除") }}
        </button>
      </div>
    </div>

    <div v-if="store.loading && store.users.length === 0" class="card">
      <div v-for="index in 4" :key="index" class="skeleton" style="height: 40px; margin-bottom: 8px" />
    </div>

    <div v-else-if="filteredUsers.length === 0" class="card empty">
      <p>{{ $t("没有符合条件的用户。") }}</p>
    </div>

    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th class="col-check">
              <input
                type="checkbox"
                :checked="allSelected"
                :aria-label='$t("全选")'
                @click.stop
                @change="toggleSelectAll"
              />
            </th>
            <th>{{ $t("用户") }}</th>
            <th>{{ $t("角色 / 状态") }}</th>
            <th>{{ $t("区域 / 语言") }}</th>
            <th class="num">{{ $t("监控") }}</th>
            <th class="num">{{ $t("渠道") }}</th>
            <th class="num">{{ $t("机器人") }}</th>
            <th class="num">{{ $t("会话") }}</th>
            <th>{{ $t("上次登录") }}</th>
            <th class="right">{{ $t("操作") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="person in filteredUsers"
            :key="person.id"
            class="clickable-row"
            :class="{ selected: selectedIds.has(person.id) }"
            @click="detailTarget = person"
          >
            <td class="col-check" @click.stop>
              <input
                type="checkbox"
                :checked="selectedIds.has(person.id)"
                :aria-label='$t("选择用户")'
                @click.stop
                @change="toggleSelect(person.id)"
              />
            </td>
            <td>
              <div style="font-weight: 500">
                {{ person.displayName }}
                <span v-if="person.id === session.user?.id" class="badge badge-accent">{{ $t("你") }}</span>
              </div>
              <div class="faint small mono">@{{ person.username }}</div>
            </td>
            <td>
              <div class="inline">
                <span class="badge" :class="person.role === 'admin' ? 'badge-accent' : 'badge-neutral'">
                  {{ person.role === 'admin' ? $t("管理员") : $t("普通用户") }}
                </span>
                <span class="badge" :class="person.status === 'active' ? 'badge-green' : 'badge-danger'">
                  {{ person.status === 'active' ? $t("启用") : $t("禁用") }}
                </span>
                <span v-if="person.mustChangePassword" class="badge badge-warning">{{ $t("待改密") }}</span>
              </div>
            </td>
            <td class="small">
              {{ person.region ? person.region.toUpperCase() : $t("未设置") }}
              <span class="faint">/ {{ person.language ?? '—' }}</span>
            </td>
            <td class="num small">{{ person.monitorCount }} / {{ person.maxMonitors }}</td>
            <td class="num small">{{ person.channelCount }}</td>
            <td class="num small">{{ person.botCount }}</td>
            <td class="num small">{{ person.activeSessions }}</td>
            <td class="small nowrap">
              <div>{{ formatRelative(person.lastLoginAt) }}</div>
              <div class="faint">{{ formatDateTime(person.lastLoginAt, timezone) }}</div>
            </td>
            <td class="right">
              <div class="inline nowrap" style="justify-content: flex-end">
                <button class="btn btn-sm" type="button" @click="openEdit(person)">{{ $t("编辑") }}</button>
                <button class="btn btn-sm" type="button" @click="resetTarget = person">{{ $t("重置密码") }}</button>
                <button
                  class="btn btn-sm btn-danger"
                  type="button"
                  :disabled="person.id === session.user?.id"
                  @click="deleteTarget = person"
                > {{ $t("删除") }} </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal v-model:open="createOpen" :title='$t("创建用户")' width="600px">
      <ErrorBanner :message="createError" />
      <form @submit.prevent="submitCreate">
        <div class="grid-2">
          <div class="field">
            <label for="cu-username">{{ $t("用户名") }}</label>
            <input id="cu-username" v-model="createForm.username" class="input" required minlength="3" maxlength="32" autocomplete="off" />
          </div>
          <div class="field">
            <label for="cu-display">{{ $t("显示名称") }}</label>
            <input id="cu-display" v-model="createForm.displayName" class="input" required maxlength="48" />
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="cu-password">{{ $t("一次性临时密码") }}</label>
            <input id="cu-password" v-model="createForm.password" class="input" type="text" required autocomplete="off" />
            <span class="field-hint">{{ $t("至少") }} {{ LIMITS.passwordMinLength }} {{ $t("位，用户首次登录时必须修改。") }}</span>
          </div>
          <div class="field">
            <label for="cu-role">{{ $t("角色") }}</label>
            <select id="cu-role" v-model="createForm.role" class="select">
              <option v-for="option in ROLE_OPTIONS" :key="option.value" :value="option.value">
                {{ $t(option.label) }}
              </option>
            </select>
          </div>
        </div>

        <div class="field">
          <label for="cu-max">{{ $t("监控项配额") }}</label>
          <input id="cu-max" v-model.number="createForm.maxMonitors" class="input" type="number" min="1" max="2000" />
          <span class="field-hint">{{ $t("单个账号最多可添加的监控项数量（全局总量另有限制）。") }}</span>
        </div>

        <div class="divider" />
        <p class="small muted">{{ $t("可选：预先设置区域与语言，用户登录后仍需完成 onboarding 确认。") }}</p>
        <div class="grid-3">
          <div class="field">
            <label for="cu-region">{{ $t("区域") }}</label>
            <select id="cu-region" v-model="createForm.region" class="select">
              <option value="">{{ $t("由用户选择") }}</option>
              <option v-for="option in REGION_OPTIONS" :key="option.value" :value="option.value">
                {{ $t(option.label) }}
              </option>
            </select>
          </div>
          <div class="field">
            <label for="cu-language">{{ $t("语言") }}</label>
            <select id="cu-language" v-model="createForm.language" class="select">
              <option value="">{{ $t("由用户选择") }}</option>
              <option v-for="option in LANGUAGE_OPTIONS" :key="option.value" :value="option.value">
                {{ $t(option.label) }}
              </option>
            </select>
          </div>
          <div class="field">
            <label for="cu-tz">{{ $t("时区") }}</label>
            <select id="cu-tz" v-model="createForm.timezone" class="select">
              <option value="">{{ $t("由用户选择") }}</option>
              <option v-for="zone in TIMEZONE_OPTIONS" :key="zone" :value="zone">{{ zone }}</option>
            </select>
          </div>
        </div>

        <div class="inline" style="justify-content: flex-end">
          <button class="btn" type="button" @click="createOpen = false">{{ $t("取消") }}</button>
          <button class="btn btn-primary" type="submit" :disabled="createBusy">
            {{ createBusy ? $t("创建中…") : $t("创建用户") }}
          </button>
        </div>
      </form>
    </Modal>

    <Modal
      :open="editTarget !== null"
      :title='$t("编辑用户")'
      width="540px"
      @update:open="editTarget = null"
    >
      <ErrorBanner :message="editError" />
      <form @submit.prevent="submitEdit">
        <div class="field">
          <label for="eu-display">{{ $t("显示名称") }}</label>
          <input id="eu-display" v-model="editForm.displayName" class="input" required maxlength="48" />
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="eu-role">{{ $t("角色") }}</label>
            <select id="eu-role" v-model="editForm.role" class="select">
              <option v-for="option in ROLE_OPTIONS" :key="option.value" :value="option.value">
                {{ $t(option.label) }}
              </option>
            </select>
          </div>
          <div class="field">
            <label for="eu-status">{{ $t("状态") }}</label>
            <select id="eu-status" v-model="editForm.status" class="select">
              <option value="active">{{ $t("启用") }}</option>
              <option value="disabled">{{ $t("禁用") }}</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="eu-max">{{ $t("监控项配额") }}</label>
          <input id="eu-max" v-model.number="editForm.maxMonitors" class="input" type="number" min="1" max="2000" />
        </div>
        <label class="inline">
          <input v-model="editForm.mustChangePassword" type="checkbox" /> {{ $t("下次登录强制修改密码") }} </label>
        <p class="small faint" style="margin-top: 8px"> {{ $t("禁用用户会立即注销其全部会话。系统必须保留至少一个启用的管理员。") }} </p>
        <div class="inline" style="justify-content: flex-end; margin-top: 16px">
          <button class="btn" type="button" @click="editTarget = null">{{ $t("取消") }}</button>
          <button class="btn btn-primary" type="submit" :disabled="editBusy">
            {{ editBusy ? $t("保存中…") : $t("保存") }}
          </button>
        </div>
      </form>
    </Modal>

    <Modal
      :open="resetResult !== null"
      :title='$t("临时密码已生成")'
      width="460px"
      @update:open="resetResult = null"
    >
      <p class="muted"> {{ $t("用户") }} <strong>{{ resetResult?.user.displayName }}</strong>（@{{ resetResult?.user.username }}{{ $t("） 的密码已重置，现有会话已注销。请通过安全渠道把临时密码交给对方，对方登录后必须修改。") }} </p>
      <div class="inline">
        <input class="input mono flex-1" :value="resetResult?.password ?? ''" readonly />
        <CopyButton :value="resetResult?.password ?? ''" />
      </div>
      <template #footer>
        <button class="btn btn-primary" type="button" @click="resetResult = null">{{ $t("我已保存") }}</button>
      </template>
    </Modal>

    <ConfirmDialog
      :open="resetTarget !== null"
      :title='$t("重置密码")'
      :message="$tf('确定重置「{name}」的密码吗？现有会话会立即失效。', { name: resetTarget?.displayName ?? '' })"
      :confirm-text='$t("重置密码")'
      :busy="resetBusy"
      @update:open="resetTarget = null"
      @confirm="confirmReset"
    />

    <ConfirmDialog
      :open="deleteTarget !== null"
      :title='$t("删除用户")'
      :message="$tf('确定删除「{name}」吗？该用户的监控项、事件、渠道与机器人都会被删除，且无法恢复。', { name: deleteTarget?.displayName ?? '' })"
      :confirm-text='$t("删除用户")'
      danger
      :busy="deleteBusy"
      @update:open="deleteTarget = null"
      @confirm="confirmDelete"
    />

    <UserDetailDrawer v-model:target="detailTarget" />
  </div>
</template>

<style scoped>
.filter-bar {
  display: grid;
  grid-template-columns: minmax(200px, 2fr) repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.filter-bar .field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.filter-bar label {
  font-size: 12px;
  color: var(--color-text-muted, #8a8f98);
}
.filter-bar .filter-actions {
  justify-content: flex-end;
  display: flex;
  flex-direction: column;
}
.filter-bar .invisible {
  visibility: hidden;
}
.filter-summary {
  margin: 0 0 12px;
}
.empty {
  text-align: center;
  padding: 32px;
  color: var(--color-text-muted, #8a8f98);
}
.col-check {
  width: 32px;
  text-align: center;
}
.clickable-row {
  cursor: pointer;
}
.clickable-row.selected {
  background: var(--color-surface-2, #1a1d24);
}
.batch-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 10px 14px;
}
.batch-count {
  font-weight: 500;
  color: var(--color-text-strong, #e6e8ee);
}
.batch-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: auto;
  align-items: center;
}
.batch-setmax {
  gap: 6px;
}
.input-sm {
  padding: 4px 8px;
  font-size: 13px;
}
</style>
