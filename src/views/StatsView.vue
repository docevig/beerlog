<script setup lang="ts">
import { computed, ref } from 'vue'
import Heatmap from '../components/Heatmap.vue'
import StyleBars from '../components/StyleBars.vue'
import SrmRange from '../components/SrmRange.vue'
import { useEntries } from '../store/entries'
import { useUi } from '../store/ui'
import {
  totalMl,
  totalAlcoholGrams,
  styleBreakdown,
  soberDaysCount,
  longestSoberStreak,
  distinctStyles,
  heaviestDay,
  placeBreakdown,
  spending,
  byMonth,
  yearsWithEntries,
  byWeekday,
  favouriteHour,
} from '../lib/stats'
import YearBars from '../components/YearBars.vue'
import WeekBars from '../components/WeekBars.vue'
import { buildCatalog } from '../lib/catalog'
import MyBeers from '../components/MyBeers.vue'
import { achievements } from '../lib/achievements'
import { dayKey, dayStart, todayKey } from '../lib/day'
import { formatLitres, formatDay, formatGrams, withPlural } from '../lib/format'
import { useCountUp } from '../lib/countUp'
import { monthSummaryText, shareUrl, monthCardData } from '../lib/share'
import { drawMonthCard } from '../lib/card'
import { prepareCard, apiAvailable } from '../lib/api'
import { tg, isVersionAtLeast, SHARE_MESSAGE_SINCE } from '../lib/telegram'

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

function entriesOfMonth(y: number, m: number) {
  return entries.value.filter((e) => {
    const [ey, em] = dayKey(e.ts).split('-').map(Number)
    return ey === y && em === m
  })
}

const monthEntries = computed(() => entriesOfMonth(year.value, month.value))

/** Предыдущий месяц — для строки сравнения под главной цифрой */
const previous = computed(() => {
  const s = serial(year.value, month.value) - 1
  return { year: Math.floor(s / 12), month: (s % 12) + 1 }
})

const previousMl = computed(() => totalMl(entriesOfMonth(previous.value.year, previous.value.month)))

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
const places = computed(() => placeBreakdown(monthEntries.value))
const money = computed(() => spending(monthEntries.value))

// Главная цифра прокручивается от нуля — единственное место, где это уместно
const monthLitres = useCountUp(() => totalMl(monthEntries.value) / 1000)

/**
 * Когда пьётся чаще — по всей истории, а не за период: недельный ритм
 * складывается месяцами, и на коротком отрезке любой всплеск случаен.
 */
const weekPoints = computed(() => byWeekday(entries.value))
const bestHour = computed(() => favouriteHour(entries.value))

const WEEKDAY_NAMES = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье']

/** Строка под столбиками: сначала день, потом час — так её и читают вслух */
const rhythm = computed(() => {
  const top = [...weekPoints.value].sort((a, b) => b.ml - a.ml)[0]
  if (!top || top.ml === 0) return ''

  const day = WEEKDAY_NAMES[top.weekday]
  const hour = bestHour.value
  return hour === undefined ? `чаще всего — ${day}` : `чаще всего — ${day}, около ${hour}:00`
})

/** Что показываем: разобранный месяц или год целиком */
const period = ref<'month' | 'year'>('month')

const years = computed(() => yearsWithEntries(entries.value))

const yearEntries = computed(() =>
  entries.value.filter((e) => Number(dayKey(e.ts).slice(0, 4)) === year.value),
)

const yearPoints = computed(() => byMonth(entries.value, year.value))
const yearShares = computed(() => styleBreakdown(yearEntries.value).slice(0, 6))
const yearMoney = computed(() => spending(yearEntries.value))
const yearLitres = useCountUp(() => totalMl(yearEntries.value) / 1000)

/**
 * Год считаем до сегодняшнего дня, а не до 31 декабря: иначе текущий год
 * получил бы месяцы будущих трезвых дней и «серия» вышла бы фантастической.
 */
const yearLastDay = computed(() => {
  const last = `${year.value}-12-31`
  return todayKey() < last ? todayKey() : last
})

const soberStreak = computed(() =>
  longestSoberStreak(yearEntries.value, `${year.value}-01-01`, yearLastDay.value),
)

/** Пиво года — то, что брали чаще прочего; при равенстве побеждает свежее */
const favourite = computed(() => {
  const list = buildCatalog(yearEntries.value)
  if (list.length === 0) return null
  return [...list].sort((a, b) => b.times - a.times || b.lastTs - a.lastTs)[0]
})

function shiftYear(delta: number) {
  const next = year.value + delta
  if (!years.value.includes(next)) return
  year.value = next
}

/** Тап по столбику года открывает разбор того месяца */
function openMonth(m: number) {
  month.value = m
  period.value = 'month'
}

const sharing = ref(false)
const shareFailure = ref('')

function shareText() {
  const text = monthSummaryText(monthEntries.value, month.value)
  const url = shareUrl(text)

  // Внутри Telegram диалог выбора чата открывает сам клиент
  const app = tg()
  if (app) app.openTelegramLink(url)
  else window.open(url, '_blank')
}

/**
 * Картинкой делимся, когда это умеет и клиент, и сервер. Всё остальное —
 * старый Telegram, отсутствие сети — откатывается на текст: поделиться
 * итогами человек должен смочь в любом случае.
 */
async function shareMonth() {
  const app = tg()
  const canShareImage =
    app?.shareMessage && isVersionAtLeast(SHARE_MESSAGE_SINCE) && apiAvailable() && monthEntries.value.length > 0

  if (!canShareImage) {
    shareText()
    return
  }

  sharing.value = true
  shareFailure.value = ''

  try {
    const blob = await drawMonthCard(monthCardData(monthEntries.value, year.value, month.value))
    const { preparedMessageId } = await prepareCard(blob)
    app!.shareMessage!(preparedMessageId)
  } catch {
    shareFailure.value = 'картинка не собралась, отправляем текстом'
    shareText()
  } finally {
    sharing.value = false
  }
}
</script>

<template>
  <section class="view">
    <div v-if="entries.length === 0" class="empty">
      <p class="empty-title">здесь появится картина месяца</p>
      <p class="empty-body">отметь первую кружку — и календарь начнёт окрашиваться в цвет того, что ты пил</p>
    </div>

    <template v-else>
      <div class="periods">
        <button type="button" :class="{ on: period === 'month' }" @click="period = 'month'">месяц</button>
        <button type="button" :class="{ on: period === 'year' }" @click="period = 'year'">год</button>
      </div>

      <template v-if="period === 'year'">
        <div class="hero">
          <div class="year-head">
            <button type="button" class="arrow" :disabled="!years.includes(year - 1)" @click="shiftYear(-1)">‹</button>
            <span class="eyebrow">за {{ year }} год</span>
            <button type="button" class="arrow" :disabled="!years.includes(year + 1)" @click="shiftYear(1)">›</button>
          </div>
          <div class="figure hero-value">
            {{ yearLitres.toFixed(1).replace('.', ',') }}<span class="unit"> л</span>
          </div>
        </div>

        <div class="cards">
          <div class="card">
            <div class="figure card-value">{{ yearEntries.length }}</div>
            <div class="eyebrow">{{ withPlural(yearEntries.length, 'кружка', 'кружки', 'кружек') }}</div>
          </div>
          <div class="card">
            <div class="figure card-value">{{ distinctStyles(yearEntries) }}</div>
            <div class="eyebrow">стилей за год</div>
          </div>
          <div class="card">
            <div class="figure card-value">{{ soberStreak }}</div>
            <div class="eyebrow">дней подряд без пива</div>
          </div>
          <div class="card">
            <div class="figure card-value">{{ formatGrams(totalAlcoholGrams(yearEntries)) }}</div>
            <div class="eyebrow">спирта за год</div>
          </div>
        </div>

        <div class="block">
          <div class="eyebrow">по месяцам</div>
          <YearBars :points="yearPoints" :current="month" @pick="openMonth" />
          <div class="hint">нажми на месяц — откроется его разбор</div>
        </div>

        <div v-if="yearShares.length" class="block">
          <div class="eyebrow">стили за год</div>
          <StyleBars :shares="yearShares" />
        </div>

        <div v-if="favourite" class="block">
          <div class="eyebrow">пиво года</div>
          <div class="favourite">{{ favourite.name }}</div>
          <div class="hint">
            {{ withPlural(favourite.times, 'раз', 'раза', 'раз') }}<template v-if="favourite.brewery">
            · {{ favourite.brewery }}</template>
          </div>
        </div>

        <div v-if="yearMoney.counted > 0" class="block">
          <div class="eyebrow">потрачено за год</div>
          <div class="figure money">{{ yearMoney.total.toLocaleString('ru-RU') }} ₽</div>
          <div class="money-note">
            по {{ withPlural(yearMoney.counted, 'записи', 'записям', 'записям') }}<template v-if="yearMoney.skipped">,
            у {{ yearMoney.skipped }} цена не указана</template>
          </div>
        </div>
      </template>

      <template v-else>
      <div class="hero">
        <div class="eyebrow">за месяц</div>
        <div class="figure hero-value">
          {{ monthLitres.toFixed(1).replace('.', ',') }}<span class="unit"> л</span>
        </div>
        <!-- Прошлый месяц без стрелок и процентов: это справка, а не соревнование -->
        <div v-if="previousMl > 0" class="hint">прошлый месяц — {{ formatLitres(previousMl) }}</div>
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

      <div v-if="places.length" class="block">
        <div class="eyebrow">где чаще</div>
        <div v-for="p in places.slice(0, 5)" :key="p.place" class="place">
          <span class="place-name">{{ p.place }}</span>
          <span class="place-times">{{ withPlural(p.times, 'раз', 'раза', 'раз') }}</span>
        </div>
      </div>

      <div v-if="money.counted > 0" class="block">
        <div class="eyebrow">потрачено за месяц</div>
        <div class="figure money">{{ money.total.toLocaleString('ru-RU') }} ₽</div>
        <!-- Честно говорим, что считаем не всё: цену указывают не всегда -->
        <div class="money-note">
          по {{ withPlural(money.counted, 'записи', 'записям', 'записям') }}<template v-if="money.skipped">,
          у {{ money.skipped }} цена не указана</template>
        </div>
      </div>
      </template>

      <div v-if="rhythm" class="block">
        <div class="eyebrow">когда ты пьёшь</div>
        <WeekBars :points="weekPoints" />
        <div class="hint">{{ rhythm }} · по всей истории</div>
      </div>

      <div class="block">
        <MyBeers :entries="entries" />
      </div>

      <button v-if="period === 'month'" type="button" class="share" :disabled="sharing" @click="shareMonth">
        {{ sharing ? 'рисуем карточку…' : 'поделиться итогами месяца' }}
      </button>
      <p v-if="shareFailure" class="hint">{{ shareFailure }}</p>

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
/* Переключатель периода: две подписи, а не кнопки-коробки — шапка и так плотная */
.periods {
  display: flex;
  gap: 14px;
}
.periods button {
  padding: 0;
  border: 0;
  border-bottom: 1px solid transparent;
  background: none;
  color: var(--text-faint);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.periods button.on {
  border-bottom-color: var(--accent);
  color: var(--accent-bright);
}
.year-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.arrow {
  padding: 0 4px;
  border: 0;
  background: none;
  color: var(--accent);
  font: inherit;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
}
.arrow:disabled {
  opacity: 0.3;
  cursor: default;
}
.hint {
  font-size: 11px;
  color: var(--text-faint);
}
.favourite {
  font-size: 18px;
  color: var(--accent-bright);
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
.place {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
}
.place-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.place-times {
  flex: none;
  color: var(--text-faint);
  font-size: 12px;
}
.money {
  font-size: 24px;
  color: var(--accent-bright);
}
.money-note {
  font-size: 11px;
  color: var(--text-faint);
}
.share {
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--accent-bright);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  transition: border-color 160ms ease, transform 100ms ease;
}
.share:active {
  transform: scale(0.99);
  border-color: var(--accent);
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
