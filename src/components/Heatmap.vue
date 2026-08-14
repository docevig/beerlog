<script setup lang="ts">
import { computed } from 'vue'
import type { Entry } from '../types'
import { dayKey } from '../lib/day'
import { styleColor } from '../lib/srm'
import { findStyle } from '../data/styles'
import { formatLitres } from '../lib/format'

const props = defineProps<{
  entries: Entry[]
  year: number
  month: number
  canGoBack?: boolean
  canGoForward?: boolean
}>()
const emit = defineEmits<{ pick: [day: string]; shift: [delta: number] }>()

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
const MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

interface Cell {
  day: number
  key: string
  ml: number
  color?: string
  dark: boolean
}

const cells = computed<Cell[]>(() => {
  // Для каждого дня копим объём и запоминаем самый тёмный выпитый стиль:
  // цвет дня должен отражать, что пил, а не просто «сколько»
  const perDay = new Map<string, { ml: number; topStyle: string; topSrm: number }>()

  for (const e of props.entries) {
    const key = dayKey(e.ts)
    const srm = findStyle(e.style)?.srm ?? 0
    const prev = perDay.get(key)
    if (!prev) {
      perDay.set(key, { ml: e.ml, topStyle: e.style, topSrm: srm })
    } else {
      prev.ml += e.ml
      if (srm > prev.topSrm) {
        prev.topSrm = srm
        prev.topStyle = e.style
      }
    }
  }

  const daysInMonth = new Date(props.year, props.month, 0).getDate()
  const result: Cell[] = []

  for (let d = 1; d <= daysInMonth; d++) {
    const key = dayKey(new Date(props.year, props.month - 1, d, 12).getTime())
    const info = perDay.get(key)
    result.push({
      day: d,
      key,
      ml: info?.ml ?? 0,
      color: info ? styleColor(info.topStyle) : undefined,
      dark: info ? info.topSrm >= 13 : false,
    })
  }

  return result
})

/** Сдвиг первой клетки: неделя начинается с понедельника */
const offset = computed(() => {
  const first = new Date(props.year, props.month - 1, 1).getDay()
  return first === 0 ? 6 : first - 1
})

const title = computed(() => `${MONTHS[props.month - 1]} ${props.year}`)
</script>

<template>
  <div class="calendar">
    <div class="header">
      <button type="button" class="nav" :disabled="!canGoBack" aria-label="предыдущий месяц" @click="emit('shift', -1)">‹</button>
      <span class="month">{{ title }}</span>
      <button type="button" class="nav" :disabled="!canGoForward" aria-label="следующий месяц" @click="emit('shift', 1)">›</button>
    </div>

    <div class="grid head">
      <span v-for="w in WEEKDAYS" :key="w" class="weekday">{{ w }}</span>
    </div>

    <div class="grid">
      <span v-for="n in offset" :key="`pad-${n}`" class="pad" />
      <button
        v-for="c in cells"
        :key="c.day"
        type="button"
        class="cell"
        :class="{ empty: c.ml === 0, dark: c.dark }"
        :style="c.color ? { background: c.color } : undefined"
        :disabled="c.ml === 0"
        :title="c.ml ? `${c.day}: ${formatLitres(c.ml)}` : `${c.day}: трезвый день`"
        @click="emit('pick', c.key)"
      >{{ c.day }}</button>
    </div>
  </div>
</template>

<style scoped>
.calendar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.month {
  font-size: 13px;
  color: var(--text-dim);
}
.nav {
  width: 30px;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-dim);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transition: border-color 160ms ease, color 160ms ease;
}
.nav:disabled {
  opacity: 0.35;
  cursor: default;
}
.nav:not(:disabled):active {
  border-color: var(--accent);
  color: var(--accent-bright);
}
.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.weekday {
  text-align: center;
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--text-faint);
}
.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  border: 0;
  border-radius: 4px;
  font: inherit;
  font-size: 10px;
  color: #2a1500;
  cursor: pointer;
  transition: transform 120ms ease;
}
.cell:not(:disabled):active {
  transform: scale(0.92);
}
.cell.dark {
  color: #e8d5be;
}
/* Пустой день ничего не открывает — кликать не по чему */
.cell.empty {
  background: none;
  border: 1px solid var(--line);
  color: var(--text-faint);
  cursor: default;
}
.pad {
  aspect-ratio: 1;
}
</style>
