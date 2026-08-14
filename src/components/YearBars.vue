<script setup lang="ts">
import { computed } from 'vue'
import type { MonthPoint } from '../lib/stats'
import { formatLitres } from '../lib/format'

const props = defineProps<{
  points: MonthPoint[]
  /** Месяц, на который смотрели до переключения на год — подсвечиваем его */
  current?: number
}>()

const emit = defineEmits<{ pick: [month: number] }>()

const SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

const peak = computed(() => Math.max(...props.points.map((p) => p.ml), 1))

/**
 * Пустой месяц оставляем полоской в один пиксель: нулевой высоты столбик
 * читается как «данных нет», хотя ноль здесь — полноценный ответ.
 */
function height(ml: number): string {
  return ml === 0 ? '1px' : `${Math.max(4, Math.round((ml / peak.value) * 100))}%`
}
</script>

<template>
  <div class="year">
    <button
      v-for="p in points"
      :key="p.month"
      type="button"
      class="col"
      :class="{ empty: p.ml === 0, on: p.month === current }"
      :title="`${SHORT[p.month - 1]} — ${formatLitres(p.ml)}`"
      @click="emit('pick', p.month)"
    >
      <span class="value">{{ p.ml ? formatLitres(p.ml) : '' }}</span>
      <span class="bar-space">
        <span class="bar" :style="{ height: height(p.ml) }" />
      </span>
      <span class="label">{{ SHORT[p.month - 1] }}</span>
    </button>
  </div>
</template>

<style scoped>
.year {
  display: flex;
  align-items: flex-end;
  gap: 3px;
}
.col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  cursor: pointer;
}
.bar-space {
  display: flex;
  align-items: flex-end;
  width: 100%;
  height: 90px;
}
.bar {
  width: 100%;
  border-radius: 3px 3px 0 0;
  background: var(--accent);
}
.col.empty .bar {
  background: var(--line);
}
.col.on .bar {
  background: var(--accent-bright);
}
.value {
  font-size: 9px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.label {
  font-size: 10px;
  color: var(--text-faint);
}
.col.on .label {
  color: var(--accent-bright);
}
</style>
