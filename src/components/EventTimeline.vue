<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { EVENT_META } from '@shared/constants'
import type { EventListItem, EventType } from '@shared/types'
import StatusBadge from './StatusBadge.vue'
import { eventBadge, formatDateTime } from '@/lib/format'
import { eventSummary, newsUrlOf } from '@/lib/events'

withDefaults(
  defineProps<{
    items: EventListItem[]
    timezone?: string
    showMonitor?: boolean
    emptyText?: string
  }>(),
  { timezone: 'UTC', showMonitor: true, emptyText: '暂无事件记录' },
)

function badge(type: EventType): string {
  return eventBadge(type)
}

function label(type: EventType): string {
  return EVENT_META[type]?.label ?? type
}

</script>

<template>
  <div v-if="items.length === 0" class="empty-state small">{{ emptyText }}</div>
  <div v-else class="timeline">
    <div
      v-for="event in items"
      :key="event.id"
      class="timeline-item"
      :class="`severity-${EVENT_META[event.type]?.severity ?? 'info'}`"
    >
      <div class="inline" style="justify-content: space-between">
        <div class="inline">
          <StatusBadge :label="label(event.type)" :tone="badge(event.type)" />
          <RouterLink
            v-if="showMonitor"
            :to="{ name: 'monitor-detail', params: { id: event.monitorId } }"
            class="small"
          >
            {{ event.monitorName }}
          </RouterLink>
          <span v-if="showMonitor" class="faint small mono">{{ event.appid }}</span>
        </div>
        <span class="timeline-time">{{ formatDateTime(event.createdAt, timezone) }}</span>
      </div>
      <p class="small muted" style="margin: 4px 0 0">
        {{ eventSummary(event.type, event.payload) }}
      </p>
      <a
        v-if="event.type === 'delisting_warning' && newsUrlOf(event.payload)"
        :href="newsUrlOf(event.payload) ?? '#'"
        target="_blank"
        rel="noopener noreferrer"
        class="small"
      >
        查看新闻 ↗
      </a>
    </div>
  </div>
</template>
