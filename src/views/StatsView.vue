<script setup lang="ts">
import { computed, ref } from 'vue'
import Heatmap from '../components/Heatmap.vue'
import StyleBars from '../components/StyleBars.vue'
import SrmRange from '../components/SrmRange.vue'
import { useEntries } from '../store/entries'
import { useUi } from '../store/ui'
import { totalMl, totalAlcoholGrams, styleBreakdown, soberDaysCount, heaviestDay } from '../lib/stats'
import { achievements } from '../lib/achievements'
import { dayKey, dayStart, todayKey } from '../lib/day'
import { formatLitres, formatDay, formatGrams } from '../lib/format'
import { useCountUp } from '../lib/countUp'

const { entries } = useEntries()
const { goToDay } = useUi()

const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)

/** Порядковый номер месяца, чтобы сравнивать границы одним числом */
function serial(y: number, m: number): number {
  return y * 12 + (m - 1)
}

const currentSerial = serial(now.getFullYear(), now.getMonth() + 1)

/** Самый ранний месяц с отметками — дальше листать некуда */
const earliestSerial = computed(() => {
  if (entries.value.length === 0) return currentSerial
  const [y, m] = dayKey(entries.value[0].ts).split('-').map(Number)
  return serial(y, m)
})

const canGoBack = computed(() => serial(year.value, month.value) > earliestSerial.value)
const canGoForward = computed(() => serial(year.value, month.value) < currentSerial)

function shiftMonth(delta: number) {
  const next = serial(year.value, month.value) + delta
  if (next < earliestSerial.value || next > currentSerial) return
  year.value = Math.floor(next / 12)
  month.value = (next % 12) + 1
}

const monthEntries = computed(() =>
  entries.value.filter((e) => {
    const [y, m] = dayKey(e.ts).split('-').map(Number)
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

// Главная цифра прокручивается от нуля — единственное место, где это уместно
const monthLitres = useCountUp(() => totalMl(monthEntries.value) / 1000)
</script>

<template>
  <section class="view">
    <div v-if="entries.length === 0" class="empty">
      <p class="empty-title">здесь появится картина месяца</p>
      <p class="empty-body">отметь первую кружку — и календарь начнёт окрашиваться в цвет того, что ты пил</p>
    </div>

    <template v-else>
      <div class="hero">
        <div class="eyebrow">за месяц</div>
        <div class="figure hero-value">
          {{ monthLitres.toFixed(1).replace('.', ',') }}<span class="unit"> л</span>
        </div>
      </div>

      <div class="cards">
        <div class="card">
          <div class="figure card-value">{{ formatLitres(totalMl(weekEntries)) }}</div>
          <div class="eyebrow">за неделю</div>
        </div>
        <div class="card">
          <div class="figure card-value">{{ soberInMonth }}</div>
          <div class="eyebrow">трезвых дней</div>
        </div>
        <div class="card">
          <div class="figure card-value">{{ formatGrams(totalAlcoholGrams(monthEntries)) }}</div>
          <div class="eyebrow">спирта за месяц</div>
        </div>
        <div class="card" v-if="peak">
          <div class="figure card-value">{{ formatLitres(peak.ml) }}</div>
          <div class="eyebrow">{{ formatDay(peak.day) }} — рекорд</div>
        </div>
      </div>

      <div class="block">
        <div class="eyebrow">календарь</div>
        <Heatmap
          :entries="monthEntries"
          :year="year"
          :month="month"
          :can-go-back="canGoBack"
          :can-go-forward="canGoForward"
          @shift="shiftMonth"
          @pick="goToDay"
        />
      </div>

      <div v-if="shares.length" class="block">
        <div class="eyebrow">стили за месяц</div>
        <StyleBars :shares="shares" />
      </div>

      <div class="block">
        <div class="eyebrow">твой диапазон</div>
        <SrmRange :entries="entries" />
      </div>

      <div v-if="badges.length" class="block">
        <div class="eyebrow">достижения</div>
        <div v-for="b in badges" :key="b.title" class="badge">
          <div>{{ b.title }}</div>
          <div v-if="b.detail" class="badge-detail">{{ b.detail }}</div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px 16px 24px;
}
.hero-value {
  font-size: 46px;
  color: var(--accent-bright);
  font-variant-numeric: tabular-nums;
}
.unit {
  font-family: var(--font-body);
  font-size: 16px;
  color: var(--text-faint);
  letter-spacing: 0;
}
.cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
/* Акцентная планка слева вместо коробки-карточки — меньше шума */
.card {
  border-left: 2px solid var(--accent);
  padding-left: 10px;
}
.card-value {
  font-size: 19px;
  margin-bottom: 2px;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.badge {
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--surface);
  font-size: 14px;
  margin-bottom: 6px;
}
.badge-detail {
  font-size: 11px;
  color: var(--text-faint);
}
.empty {
  padding: 40px 0;
}
.empty-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 17px;
  margin: 0 0 8px;
}
.empty-body {
  margin: 0;
  color: var(--text-dim);
  font-size: 14px;
}
</style>
