<script setup lang="ts">
import { computed } from 'vue'
import type { PartyState } from '../lib/api'
import { styleTitle } from '../data/styles'
import { styleColor, textOn } from '../lib/srm'
import { formatLitres, formatTime, withPlural } from '../lib/format'
import { useFriendNames } from '../store/friends'

const props = defineProps<{ state: PartyState; meId: number }>()
defineEmits<{ close: []; invite: [] }>()

// Тот, кого ты переименовал в компании, и за столом должен быть тем же человеком
const { nameOf } = useFriendNames()

const nameById = computed(
  () => new Map(props.state.members.map((m) => [m.tg_id, nameOf(m.tg_id, m.name)])),
)

/** Итог по каждому за столом: сколько взял и что именно */
const perMember = computed(() =>
  props.state.members
    .map((m) => {
      const own = props.state.entries.filter((e) => e.tg_id === m.tg_id)
      return {
        ...m,
        name: nameOf(m.tg_id, m.name),
        ml: own.reduce((sum, e) => sum + e.ml, 0),
        portions: own.length,
        styles: [...new Set(own.map((e) => e.style))],
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
)

const total = computed(() => props.state.entries.reduce((sum, e) => sum + e.ml, 0))

/** Сколько идёт вечер — в часах и минутах */
const duration = computed(() => {
  const end = props.state.party.ended_at ?? Date.now()
  const minutes = Math.max(0, Math.round((end - props.state.party.started_at) / 60000))
  const hours = Math.floor(minutes / 60)
  if (hours === 0) return `${minutes} мин`
  return `${hours} ч ${minutes % 60} мин`
})

const isHost = computed(() => props.state.party.host_id === props.meId)
const isOpen = computed(() => props.state.party.ended_at === null)
</script>

<template>
  <div class="table">
    <div class="head">
      <div>
        <div class="eyebrow">{{ isOpen ? 'вечер идёт' : 'вечер закрыт' }}</div>
        <div class="figure total">{{ formatLitres(total) }}</div>
        <div class="sub">
          {{ withPlural(state.members.length, 'человек', 'человека', 'человек') }} · {{ duration }}
        </div>
      </div>
      <button v-if="isOpen" type="button" class="ghost" @click="$emit('invite')">позвать</button>
    </div>

    <div class="members">
      <div v-for="m in perMember" :key="m.tg_id" class="member">
        <span class="who" :class="{ me: m.tg_id === meId }">{{ m.tg_id === meId ? 'ты' : m.name }}</span>
        <span class="chips">
          <span v-for="s in m.styles" :key="s" class="chip" :style="{ background: styleColor(s), color: textOn(s) }">
            {{ styleTitle(s) }}
          </span>
          <span v-if="!m.styles.length" class="nothing">пока ничего</span>
        </span>
        <span class="amount">{{ formatLitres(m.ml) }}</span>
      </div>
    </div>

    <div v-if="state.entries.length" class="feed">
      <div class="eyebrow">за вечер</div>
      <div v-for="e in [...state.entries].reverse()" :key="e.id" class="event">
        <span class="swatch" :style="{ background: styleColor(e.style) }" />
        <span class="event-text">
          {{ e.tg_id === meId ? 'ты' : nameById.get(e.tg_id) ?? 'кто-то' }} —
          {{ (e.name || styleTitle(e.style)).toLowerCase() }}
        </span>
        <span class="event-time">{{ formatTime(e.ts) }}</span>
      </div>
    </div>

    <!-- Зов живёт внутри карточки вечера: отдельно от неё непонятно, к чему он -->
    <slot name="summon" />

    <button v-if="isOpen && isHost" type="button" class="ghost wide" @click="$emit('close')">
      завершить вечер
    </button>
  </div>
</template>

<style scoped>
.table {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.total {
  font-size: 30px;
  color: var(--accent-bright);
}
.sub {
  font-size: 12px;
  color: var(--text-faint);
}
.members {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.member {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}
.who {
  font-size: 13px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.who.me {
  color: var(--accent-bright);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.chip {
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 11px;
}
.nothing {
  font-size: 11px;
  color: var(--text-faint);
}
.amount {
  font-size: 13px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.feed {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.event {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.swatch {
  flex: none;
  width: 4px;
  height: 14px;
  border-radius: 2px;
}
.event-text {
  flex: 1;
  color: var(--text-dim);
}
.event-time {
  font-size: 11px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.ghost {
  padding: 8px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: none;
  color: var(--accent-bright);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.wide {
  width: 100%;
  padding: 11px;
}
</style>
