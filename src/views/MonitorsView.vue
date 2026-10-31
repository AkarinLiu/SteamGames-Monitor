<script setup lang="ts">
import { t, tf } from '@/i18n'

import { onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { Monitor, SteamSearchResult } from '@shared/types'
import { LIMITS } from '@shared/constants'
import { api, ApiError, describeError } from '@/api/client'
import { useMonitorsStore } from '@/stores/monitors'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import {
  formatDateTime,
  formatRelative,
  monitorStatusLabel,
  monitorStatusTone,
} from '@/lib/format'
import Modal from '@/components/Modal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'
import Pagination from '@/components/Pagination.vue'
import QuotaBar from '@/components/QuotaBar.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import PriceTag from '@/components/PriceTag.vue'

const store = useMonitorsStore()
const session = useSessionStore()
const toast = useToastStore()

const timezone = session.user?.timezone ?? 'UTC'
const filters = reactive({ q: '', status: 'all', sort: 'recent' })
const page = ref(1)
const error = ref('')
const busyId = ref<number | null>(null)

const addOpen = ref(false)
const addBusy = ref(false)
const addError = ref('')
const addForm = reactive({
  query: '',
  minDiscount: '' as number | '',
  notes: '',
  newsWatch: true,
})
const candidates = ref<SteamSearchResult[]>([])
const notAvailable = ref<{ appid: number; message: string } | null>(null)
const preview = ref<SteamSearchResult[]>([])
const previewBusy = ref(false)

const dlcOpen = ref(false)
const dlcBusy = ref(false)
const dlcError = ref('')
const dlcForm = reactive({ query: '', max: LIMITS.maxDlcImport })

const deleteTarget = ref<Monitor | null>(null)
const deleteBusy = ref(false)

async function load(): Promise<void> {
  error.value = ''
  try {
    await store.fetchList({
      q: filters.q.trim() || undefined,
      status: filters.status,
      sort: filters.sort,
      page: page.value,
    })
  } catch (err) {
    error.value = describeError(err)
  }
}

function applyFilters(): void {
  page.value = 1
  void load()
}

function changePage(next: number): void {
  page.value = next
  void load()
}

function resetAdd(): void {
  addForm.query = ''
  addForm.minDiscount = ''
  addForm.notes = ''
  addForm.newsWatch = true
  candidates.value = []
  notAvailable.value = null
  preview.value = []
  addError.value = ''
}

function openAdd(): void {
  resetAdd()
  addOpen.value = true
}

async function submitAdd(force = false): Promise<void> {
  addError.value = ''
  if (!addForm.query.trim()) {
    addError.value = t("请输入 Steam 商店链接、appid 或名称")
    return
  }
  addBusy.value = true
  try {
    const monitor = await store.create({
      query: addForm.query.trim(),
      minDiscountPercent: addForm.minDiscount === '' ? null : Number(addForm.minDiscount),
      notes: addForm.notes.trim() || undefined,
      force,
      newsWatch: addForm.newsWatch,
    })
    toast.success(tf('已添加「{name}」，首次检查将建立基线', { name: monitor.name }))
    addOpen.value = false
    resetAdd()
    page.value = 1
    await load()
  } catch (err) {
    if (err instanceof ApiError) {
      const details = err.details as
        | { results?: SteamSearchResult[]; appid?: number; requireForce?: boolean }
        | undefined
      if (err.code === 'selection_required' && details?.results?.length) {
        candidates.value = details.results
        notAvailable.value = null
        addError.value = t("找到多个匹配结果，请选择具体条目")
        return
      }
      if (err.code === 'not_available' && details?.requireForce) {
        notAvailable.value = {
          appid: details.appid ?? 0,
          message: err.message,
        }
        addError.value = err.message
        return
      }
      addError.value = err.message
      return
    }
    addError.value = describeError(err)
  } finally {
    addBusy.value = false
  }
}

function chooseCandidate(result: SteamSearchResult): void {
  addForm.query = String(result.appid)
  candidates.value = []
  void submitAdd()
}

async function searchPreview(): Promise<void> {
  const query = addForm.query.trim()
  if (!query) return
  previewBusy.value = true
  addError.value = ''
  try {
    const result = await api.get<{ items: SteamSearchResult[] }>(
      `/steam/search?q=${encodeURIComponent(query)}`,
    )
    preview.value = result.items
    if (result.items.length === 0) addError.value = t("未找到匹配的 Steam 商店条目")
  } catch (err) {
    addError.value = describeError(err)
  } finally {
    previewBusy.value = false
  }
}

function usePreview(result: SteamSearchResult): void {
  addForm.query = String(result.appid)
  preview.value = []
}

async function submitDlc(): Promise<void> {
  dlcError.value = ''
  if (!dlcForm.query.trim()) {
    dlcError.value = t("请输入基础游戏的链接、appid 或名称")
    return
  }
  dlcBusy.value = true
  try {
    const result = await store.importDlc(dlcForm.query.trim(), dlcForm.max)
    toast.success(
      result.skipped
        ? result.failed
          ? tf('已导入 {imported} 个 DLC，跳过 {skipped} 个已存在条目，{failed} 个失败', {
              imported: result.items.length,
              skipped: result.skipped,
              failed: result.failed,
            })
          : tf('已导入 {imported} 个 DLC，跳过 {skipped} 个已存在条目', {
              imported: result.items.length,
              skipped: result.skipped,
            })
        : result.failed
          ? tf('已导入 {imported} 个 DLC，{failed} 个失败', {
              imported: result.items.length,
              failed: result.failed,
            })
          : tf('已导入 {imported} 个 DLC', { imported: result.items.length }),
    )
    dlcOpen.value = false
    dlcForm.query = ''
    await load()
  } catch (err) {
    dlcError.value = describeError(err)
  } finally {
    dlcBusy.value = false
  }
}

async function runCheck(monitor: Monitor): Promise<void> {
  busyId.value = monitor.id
  try {
    const updated = await store.check(monitor.id)
    toast.success(updated ? tf('已检查「{name}」', { name: updated.name }) : t('检查已完成'))
    await load()
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    busyId.value = null
  }
}

async function togglePause(monitor: Monitor): Promise<void> {
  busyId.value = monitor.id
  try {
    if (monitor.enabled) {
      await store.pause(monitor.id)
      toast.success(tf('已暂停「{name}」', { name: monitor.name }))
    } else {
      await store.resume(monitor.id)
      toast.success(tf('已恢复「{name}」', { name: monitor.name }))
    }
    await load()
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    busyId.value = null
  }
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  deleteBusy.value = true
  try {
    await store.remove(target.id)
    toast.success(tf('已删除「{name}」', { name: target.name }))
    deleteTarget.value = null
    await load()
  } catch (err) {
    toast.error(describeError(err))
  } finally {
    deleteBusy.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1>{{ $t("监控项") }}</h1>
        <p>{{ $t("跟踪游戏与 DLC 的发售、促销、价格与下架状态。") }}</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="dlcOpen = true">{{ $t("导入 DLC") }}</button>
        <button class="btn btn-primary" type="button" @click="openAdd">{{ $t("添加监控") }}</button>
      </div>
    </div>

    <QuotaBar
      v-if="store.quota"
      :used="store.quota.used"
      :limit="store.quota.limit"
      :label='$t("监控项配额")'
    />

    <ErrorBanner :message="error" />

    <form class="toolbar" @submit.prevent="applyFilters">
      <input
        v-model="filters.q"
        class="input"
        type="search"
        :placeholder='$t("搜索名称或 appid")'
        :aria-label='$t("搜索监控项")'
      />
      <select v-model="filters.status" class="select" :aria-label='$t("状态筛选")' @change="applyFilters">
        <option value="all">{{ $t("全部状态") }}</option>
        <option value="on_sale">{{ $t("促销中") }}</option>
        <option value="available">{{ $t("正常在售") }}</option>
        <option value="coming_soon">{{ $t("即将发售") }}</option>
        <option value="unavailable">{{ $t("不可购买") }}</option>
        <option value="paused">{{ $t("已暂停") }}</option>
      </select>
      <select v-model="filters.sort" class="select" :aria-label='$t("排序")' @change="applyFilters">
        <option value="recent">{{ $t("最近添加") }}</option>
        <option value="name">{{ $t("名称") }}</option>
        <option value="last_check">{{ $t("最近检查") }}</option>
        <option value="next_check">{{ $t("下次检查") }}</option>
      </select>
      <button class="btn" type="submit">{{ $t("搜索") }}</button>
      <div class="flex-1" />
      <span class="small faint">{{ store.total }} {{ $t("个条目") }}</span>
    </form>

    <div v-if="store.loading && store.items.length === 0" class="card">
      <div v-for="index in 5" :key="index" class="skeleton" style="height: 42px; margin-bottom: 8px" />
    </div>

    <EmptyState
      v-else-if="store.items.length === 0"
      :title='$t("还没有监控项")'
      :description='$t("添加 Steam 游戏或 DLC，系统会自动建立基线并在状态变化时通知你。")'
    >
      <button class="btn btn-primary" type="button" style="margin-top: 12px" @click="openAdd"> {{ $t("添加第一个监控") }} </button>
    </EmptyState>

    <template v-else>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>{{ $t("游戏 / DLC") }}</th>
              <th>{{ $t("状态") }}</th>
              <th class="num">{{ $t("价格") }}</th>
              <th class="num">{{ $t("最低折扣") }}</th>
              <th>{{ $t("上次检查") }}</th>
              <th>{{ $t("下次检查") }}</th>
              <th class="right">{{ $t("操作") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="monitor in store.items" :key="monitor.id">
              <td>
                <div class="inline" style="flex-wrap: nowrap">
                  <img
                    v-if="monitor.headerImage"
                    :src="monitor.headerImage"
                    alt=""
                    class="cover-thumb"
                    loading="lazy"
                  />
                  <div style="min-width: 0">
                    <RouterLink
                      :to="{ name: 'monitor-detail', params: { id: monitor.id } }"
                      style="font-weight: 500"
                    >
                      {{ monitor.name }}
                    </RouterLink>
                    <div class="faint small">
                      <span class="mono">{{ monitor.appid }}</span>
                      <span> · {{ monitor.kind === 'dlc' ? 'DLC' : $t("游戏") }}</span>
                      <span v-if="monitor.parentAppid"> {{ $t("· 基础游戏") }} {{ monitor.parentAppid }}</span>
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <StatusBadge
                  :label="monitorStatusLabel(monitor)"
                  :tone="monitorStatusTone(monitor)"
                />
              </td>
              <td class="num"><PriceTag :monitor="monitor" /></td>
              <td class="num">
                {{ monitor.minDiscountPercent ?? session.user?.minDiscountPercent ?? 0 }}%
              </td>
              <td class="small nowrap">{{ formatDateTime(monitor.lastCheckAt, timezone) }}</td>
              <td class="small nowrap">
                {{ monitor.enabled ? formatRelative(monitor.nextCheckAt) : $t("已暂停") }}
              </td>
              <td class="right">
                <div class="inline nowrap" style="justify-content: flex-end">
                  <button
                    class="btn btn-sm"
                    type="button"
                    :disabled="busyId === monitor.id"
                    @click="runCheck(monitor)"
                  > {{ $t("检查") }} </button>
                  <button
                    class="btn btn-sm"
                    type="button"
                    :disabled="busyId === monitor.id"
                    @click="togglePause(monitor)"
                  >
                    {{ monitor.enabled ? $t("暂停") : $t("恢复") }}
                  </button>
                  <button
                    class="btn btn-sm btn-danger"
                    type="button"
                    @click="deleteTarget = monitor"
                  > {{ $t("删除") }} </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pagination
        :page="page"
        :page-size="store.pageSize"
        :total="store.total"
        :disabled="store.loading"
        @update:page="changePage"
      />
    </template>

    <Modal v-model:open="addOpen" :title='$t("添加监控")' width="620px">
      <ErrorBanner :message="addError">
        <button
          v-if="notAvailable"
          class="btn btn-sm"
          type="button"
          :disabled="addBusy"
          @click="submitAdd(true)"
        > {{ $t("仍然强制添加") }} </button>
      </ErrorBanner>

      <form @submit.prevent="submitAdd(false)">
        <div class="field">
          <label for="add-query">{{ $t("Steam 链接、appid 或名称") }}</label>
          <div class="inline" style="flex-wrap: nowrap">
            <input
              id="add-query"
              v-model="addForm.query"
              class="input flex-1"
              :placeholder='$t("例如 1091500 或 https://store.steampowered.com/app/1091500/")'
              autocomplete="off"
            />
            <button class="btn" type="button" :disabled="previewBusy" @click="searchPreview">
              {{ previewBusy ? $t("搜索中…") : $t("搜索") }}
            </button>
          </div>
          <span class="field-hint"> {{ $t("名称可能匹配多个结果，届时会让你按序号选择；添加后首轮检查只建立基线。") }} </span>
        </div>

        <div v-if="candidates.length" class="card" style="padding: 10px; margin-bottom: 14px">
          <p class="small muted" style="margin-bottom: 8px">{{ $t("请选择要监控的条目：") }}</p>
          <div class="stack">
            <button
              v-for="(result, index) in candidates"
              :key="result.appid"
              class="btn"
              type="button"
              style="justify-content: flex-start"
              @click="chooseCandidate(result)"
            >
              {{ index + 1 }}. {{ result.name }} <span class="faint mono">({{ result.appid }})</span>
            </button>
          </div>
        </div>

        <div v-if="preview.length" class="card" style="padding: 10px; margin-bottom: 14px">
          <p class="small muted" style="margin-bottom: 8px">{{ $t("Steam 搜索结果：") }}</p>
          <div class="stack">
            <button
              v-for="result in preview"
              :key="result.appid"
              class="btn"
              type="button"
              style="justify-content: space-between"
              @click="usePreview(result)"
            >
              <span>{{ result.name }} <span class="faint mono">({{ result.appid }})</span></span>
              <span class="faint small">{{ result.priceText ?? '' }}</span>
            </button>
          </div>
        </div>

        <div class="grid-2">
          <div class="field">
            <label for="add-discount">{{ $t("最低折扣（%），留空使用账号默认") }}</label>
            <input
              id="add-discount"
              v-model.number="addForm.minDiscount"
              class="input"
              type="number"
              min="1"
              max="100"
              :placeholder='$t("使用默认")'
            />
          </div>
          <div class="field">
            <span class="label">{{ $t("下架新闻预警") }}</span>
            <label class="inline">
              <input v-model="addForm.newsWatch" type="checkbox" /> {{ $t("扫描 Steam 新闻关键词") }} </label>
          </div>
        </div>

        <div class="field">
          <label for="add-notes">{{ $t("备注（可选）") }}</label>
          <textarea id="add-notes" v-model="addForm.notes" class="textarea" maxlength="2000" />
        </div>

        <div class="inline" style="justify-content: flex-end">
          <button class="btn" type="button" @click="addOpen = false">{{ $t("取消") }}</button>
          <button class="btn btn-primary" type="submit" :disabled="addBusy">
            {{ addBusy ? $t("添加中…") : $t("添加") }}
          </button>
        </div>
      </form>
    </Modal>

    <Modal v-model:open="dlcOpen" :title='$t("导入 DLC")' width="520px">
      <ErrorBanner :message="dlcError" />
      <form @submit.prevent="submitDlc">
        <div class="field">
          <label for="dlc-query">{{ $t("基础游戏链接、appid 或名称") }}</label>
          <input
            id="dlc-query"
            v-model="dlcForm.query"
            class="input"
            :placeholder='$t("例如 1091500")'
            autocomplete="off"
          />
          <span class="field-hint">{{ $t("将导入该游戏在 Steam 上列出的所有 DLC，已存在的条目会被跳过。") }}</span>
        </div>
        <div class="field">
          <label for="dlc-max">{{ $t("最多导入数量") }}</label>
          <input
            id="dlc-max"
            v-model.number="dlcForm.max"
            class="input"
            type="number"
            min="1"
            :max="LIMITS.maxDlcImport"
          />
        </div>
        <div class="inline" style="justify-content: flex-end">
          <button class="btn" type="button" @click="dlcOpen = false">{{ $t("取消") }}</button>
          <button class="btn btn-primary" type="submit" :disabled="dlcBusy">
            {{ dlcBusy ? $t("导入中…") : $t("开始导入") }}
          </button>
        </div>
      </form>
    </Modal>

    <ConfirmDialog
      :open="deleteTarget !== null"
      :title='$t("删除监控项")'
      :message="$tf('确定删除「{name}」吗？历史事件与快照会保留，重新添加会恢复该监控项并重新建立基线。', { name: deleteTarget?.name ?? '' })"
      :confirm-text='$t("删除")'
      danger
      :busy="deleteBusy"
      @update:open="deleteTarget = null"
      @confirm="confirmDelete"
    />
  </div>
</template>
