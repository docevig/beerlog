<script setup lang="ts">
import { computed } from 'vue'
import type { Entry } from '../types'
import { styleTitle, findStyle } from '../data/styles'
import { styleColor } from '../lib/srm'
import { entryAbv } from '../lib/stats'
import { formatPortion, formatTime, formatAbv } from '../lib/format'

const props = defineProps<{ entry: Entry; expanded: boolean }>()
const emit = defineEmits<{
  toggle: [id: string]
  edit: [id: string]
  remove: [id: string]
}>()

/** Подробности, которые пользователь мог заполнить при записи */
const details = computed(() => {
  const e = props.entry
  const rows: { label: string; value: string }[] = []

  if (e.brewery) rows.push({ label: 'пивоварня', value: e.brewery })
  if (e.place) rows.push({ label: 'место', value: e.place })
  if (e.rating) rows.push({ label: 'оценка', value: `${e.rating} из 5` })
  if (e.price) rows.push({ label: 'цена', value: `${e.price} ₽` })

  // Раскрытие не должно быть пустым, поэтому всегда показываем крепость и стиль
  rows.push({ label: 'стиль', value: `${styleTitle(e.style)} · ${formatAbv(entryAbv(e))}` })
  if (findStyle(e.style)) rows.push({ label: 'цвет', value: `SRM ${findStyle(e.style)!.srm}` })

  return rows
})
</script>

<template>
  <div class="wrap" :class="{ open: expanded }">
    <div class="row">
      <span class="swatch" :style="{ background: styleColor(entry.style) }" />
      <button type="button" class="main" @click="emit('toggle', entry.id)">
        <span class="title">
          {{ entry.name || styleTitle(entry.style) }}
          <span class="portion">{{ formatPortion(entry.ml) }}</span>
        </span>
        <span v-if="entry.name" class="sub">{{ styleTitle(entry.style) }}</span>
      </button>
      <span class="time">{{ formatTime(entry.ts) }}</span>
      <span class="chevron" :class="{ turned: expanded }">⌄</span>
    </div>

    <Transition name="details">
      <div v-if="expanded" class="details">
        <div v-for="d in details" :key="d.label" class="detail">
          <span class="detail-label">{{ d.label }}</span>
          <span class="detail-value">{{ d.value }}</span>
        </div>
        <p v-if="entry.note" class="note">{{ entry.note }}</p>
        <div class="actions">
          <button type="button" class="action" @click="emit('edit', entry.id)">править</button>
          <button type="button" class="action danger" @click="emit('remove', entry.id)">удалить</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.wrap {
  border-bottom: 1px solid var(--line);
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
}
/* Цветная метка — тот же язык, что в календаре и столбиках */
.swatch {
  flex: none;
  width: 4px;
  align-self: stretch;
  min-height: 26px;
  border-radius: 2px;
}
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: opacity 120ms ease;
}
.main:active {
  opacity: 0.6;
}
.title {
  font-size: 15px;
}
.portion {
  color: var(--text-faint);
}
.sub {
  font-size: 12px;
  color: var(--text-faint);
}
.time {
  font-size: 12px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.chevron {
  color: var(--text-faint);
  font-size: 13px;
  line-height: 1;
  transition: transform 200ms ease;
}
.chevron.turned {
  transform: rotate(180deg);
}
.details {
  padding: 4px 0 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow: hidden;
}
.detail {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}
.detail-label {
  color: var(--text-faint);
}
.detail-value {
  color: var(--text-dim);
  text-align: right;
}
.note {
  margin: 4px 0 0;
  padding: 8px 10px;
  border-radius: var(--radius);
  background: var(--surface);
  font-size: 13px;
  color: var(--text-dim);
}
.actions {
  display: flex;
  gap: 14px;
  margin-top: 6px;
}
.action {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent-bright);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.action.danger {
  color: var(--text-faint);
}
.details-enter-active,
.details-leave-active {
  transition: opacity 200ms ease, max-height 240ms ease;
  max-height: 320px;
}
.details-enter-from,
.details-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
