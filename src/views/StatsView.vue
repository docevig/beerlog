<script setup lang="ts">
import { computed, ref } from 'vue'
import Heatmap from '../components/Heatmap.vue'
import StyleBars from '../components/StyleBars.vue'
import { useEntries } from '../store/entries'
import { totalMl, totalAlcoholGrams, styleBreakdown, soberDaysCount, heaviestDay } from '../lib/stats'
import { achievements } from '../lib/achievements'
import { dayKey, dayStart, todayKey } from '../lib/day'
import { formatLitres, formatDay, formatGrams } from '../lib/format'

const { entries } = useEntries()

const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)

const monthEntries = computed(() =>
  entries.value.filter((e) => {
    const key = dayKey(e.ts)
    const [y, m] = key.split('-').map(Number)
    return y === year.value && m === month.value
  }),
)

const weekEntries = computed(() => {
  const since = dayStart(todayKey()) - 6 * 24 * 3600_000
  return entries.value.filter((e) => e.ts >= since)
})

const monthFirstDay = computed(() => `${year.value}-${String(month.value).padStart(2, '0')}-01`)
const monthLastDay = computed(() => {
  const days = new Date(year.value, month.value, 0).getDate()
  return `${year.value}-${String(month.value).padStart(2, '0')}-${days}`
})

const soberInMonth = computed(() => soberDaysCount(monthEntries.value, monthFirstDay.value, monthLastDay.value))
const peak = computed(() => heaviestDay(entries.value))
const shares = computed(() => styleBreakdown(monthEntries.value).slice(0, 6))
const badges = computed(() => achievements(entries.value))
</script>

<template>
  <section class="view">
    <p v-if="entries.length === 0" class="empty">статистика появится после первой отметки</p>

    <template v-else>
      <div class="cards">
        <div class="card">
          <div class="caption">за неделю</div>
          <div class="big">{{ formatLitres(totalMl(weekEntries)) }}</div>
        </div>
        <div class="card">
          <div class="caption">за месяц</div>
          <div class="big">{{ formatLitres(totalMl(monthEntries)) }}</div>
        </div>
        <div class="card">
          <div class="caption">трезвых дней</div>
          <div class="big">{{ soberInMonth }}</div>
        </div>
        <div class="card">
          <div class="caption">спирта за месяц</div>
          <div class="big">{{ formatGrams(totalAlcoholGrams(monthEntries)) }}</div>
        </div>
      </div>

      <div class="block">
        <div class="caption">календарь месяца</div>
        <Heatmap :entries="monthEntries" :year="year" :month="month" />
      </div>

      <div v-if="shares.length" class="block">
        <div class="caption">стили за месяц</div>
        <StyleBars :shares="shares" />
      </div>

      <div v-if="peak" class="block">
        <div class="caption">самый ударный день</div>
        <div class="line">{{ formatDay(peak.day) }} · {{ formatLitres(peak.ml) }}</div>
      </div>

      <div class="block">
        <div class="caption">достижения</div>
        <div v-for="b in badges" :key="b.title" class="badge">
          <div>{{ b.title }}</div>
          <div v-if="b.detail" class="caption">{{ b.detail }}</div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.card {
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--section-bg);
}
.caption {
  font-size: 12px;
  color: var(--hint);
}
.big {
  font-size: 20px;
  font-weight: 500;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.line {
  font-size: 15px;
}
.badge {
  padding: 8px 12px;
  border-radius: var(--radius);
  background: var(--section-bg);
  font-size: 14px;
}
.empty {
  color: var(--hint);
  font-size: 14px;
}
</style>
