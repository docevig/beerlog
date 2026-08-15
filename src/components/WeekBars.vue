<script setup lang="ts">
import { computed } from 'vue'
import type { WeekPoint } from '../lib/stats'
import { formatLitres } from '../lib/format'

const props = defineProps<{ points: WeekPoint[] }>()

const DAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

const peak = computed(() => Math.max(...props.points.map((p) => p.ml), 1))

/** Пустой день оставляем полоской: ноль здесь — такой же ответ, как и всё прочее */
function height(ml: number): string {
  return ml === 0 ? '2px' : `${Math.max(6, Math.round((ml / peak.value) * 100))}%`
}

/** Выходные подсвечиваем: по ним и так видно, но глазу проще */
const busiest = computed(() => {
  let best = 0
  props.points.forEach((p, i) => {
    if (p.ml > props.points[best].ml) best = i
  })
  return props.points[best].ml > 0 ? best : -1
})
</script>

<template>
  <div class="week">
    <div v-for="(p, i) in points" :key="p.weekday" class="col" :title="formatLitres(p.ml)">
      <span class="bar-space">
        <span class="bar" :class="{ top: i === busiest }" :style="{ height: height(p.ml) }" />
      </span>
      <span class="label" :class="{ top: i === busiest }">{{ DAYS[i] }}</span>
    </div>
  </div>
</template>

<style scoped>
.week {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}
.col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.bar-space {
  display: flex;
  align-items: flex-end;
  width: 100%;
  height: 74px;
}
.bar {
  width: 100%;
  border-radius: 3px 3px 0 0;
  background: var(--line);
}
.bar.top {
  background: var(--accent);
}
.label {
  font-size: 11px;
  color: var(--text-faint);
}
.label.top {
  color: var(--accent-bright);
}
</style>
