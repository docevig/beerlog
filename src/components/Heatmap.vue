<script setup lang="ts">
import { computed } from 'vue'
import type { Entry } from '../types'
import { byDay } from '../lib/stats'
import { dayKey } from '../lib/day'

const props = defineProps<{ entries: Entry[]; year: number; month: number }>()

const cells = computed(() => {
  const volumes = byDay(props.entries)
  const daysInMonth = new Date(props.year, props.month, 0).getDate()

  // Максимум за месяц задаёт шкалу насыщенности
  let max = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dayKey(new Date(props.year, props.month - 1, d, 12).getTime())
    max = Math.max(max, volumes.get(key) ?? 0)
  }

  const result: { day: number; ml: number; level: number }[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dayKey(new Date(props.year, props.month - 1, d, 12).getTime())
    const ml = volumes.get(key) ?? 0
    result.push({ day: d, ml, level: max > 0 ? ml / max : 0 })
  }
  return result
})

/** Сдвиг первой клетки, чтобы месяц начинался с нужного дня недели */
const offset = computed(() => {
  const first = new Date(props.year, props.month - 1, 1).getDay()
  return first === 0 ? 6 : first - 1
})
</script>

<template>
  <div class="heatmap">
    <span v-for="n in offset" :key="`pad-${n}`" class="cell pad" />
    <span
      v-for="c in cells"
      :key="c.day"
      class="cell"
      :class="{ empty: c.ml === 0 }"
      :style="c.ml > 0 ? { opacity: 0.25 + c.level * 0.75 } : undefined"
      :title="`${c.day}: ${c.ml} мл`"
    />
  </div>
</template>

<style scoped>
.heatmap {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.cell {
  aspect-ratio: 1;
  border-radius: 3px;
  background: var(--button);
}
.cell.empty {
  background: var(--section-bg);
}
.cell.pad {
  background: none;
}
</style>
