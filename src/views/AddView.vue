<script setup lang="ts">
import { ref, computed } from 'vue'
import ChoiceGrid, { type Choice } from '../components/ChoiceGrid.vue'
import DayGlass from '../components/DayGlass.vue'
import BeerNameInput from '../components/BeerNameInput.vue'
import LabelPhoto from '../components/LabelPhoto.vue'
import { buildCatalog, type KnownBeer } from '../lib/catalog'
import { BEER_STYLES, VOLUME_PRESETS, findStyle, styleTitle } from '../data/styles'
import { styleColor, textOn, subTextOn } from '../lib/srm'
import { formatAbv, formatPortion } from '../lib/format'
import { parseVolume, volumeHint } from '../lib/volume'
import { dayKey, todayKey } from '../lib/day'
import { overflowRatio } from '../lib/foam'
import { useEntries } from '../store/entries'
import { useParty } from '../store/party'
import { apiAvailable, saveLastChoice } from '../lib/api'

const { entries, profile, add } = useEntries()
const { active: activeParty, mirror } = useParty()

const ml = ref<number>(profile.value.lastMl ?? 500)
const style = ref<string>(profile.value.lastStyle ?? 'lager')
const showAllStyles = ref(false)
const showDetails = ref(false)
const justSaved = ref<string | null>(null)
const pouring = ref(false)
const pourLabel = ref('записать')

/**
 * Наливание комментирует само себя. Наборов несколько, чтобы фраза
 * не приедалась: за десятую кружку она уже не смешная.
 */
const POUR_PHRASES = [
  ['наливаем…', 'пена оседает…', 'готово'],
  ['щедрой рукой…', 'ждём пену…', 'принято'],
  ['по краешек…', 'осаживаем…', 'зафиксировано'],
  ['открываем…', 'шапка растёт…', 'засчитано'],
  ['держим наклон…', 'выравниваем…', 'записано'],
  ['пошла родимая…', 'шапка что надо…', 'есть контакт'],
  ['под углом сорок пять…', 'даём осесть…', 'в дневнике'],
  ['кран открыт…', 'ловим пену…', 'учтено'],
  ['до риски…', 'чуть подождём…', 'готово'],
  ['не расплескать…', 'пена садится…', 'принято к сведению'],
  ['ровно, без брызг…', 'шапка ровняется…', 'внесено'],
  ['последняя, честно…', 'ну да, конечно…', 'записано без комментариев'],
]

const name = ref('')
const brewery = ref('')
const place = ref('')
const note = ref('')
const rating = ref<number | undefined>(undefined)
const price = ref<number | undefined>(undefined)
/** Строкой, а не числом: в поле законна запятая, а type=number её теряет */
const customMl = ref<string | undefined>(undefined)

const customHint = computed(() => volumeHint(customMl.value))
const minutesAgo = ref(0)

/** Свои объёмы из настроек, иначе привычные 0,33 / 0,5 / 1 */
const presets = computed(() => profile.value.volumes ?? VOLUME_PRESETS)

const volumeOptions = computed<Choice[]>(() => [
  ...presets.value.map((v) => ({ value: v, title: formatPortion(v) })),
  { value: -1, title: 'своё' },
])

/** Часто используемые стили считаются по истории, а не задаются вручную */
const frequentStyles = computed<Choice[]>(() => {
  const counts = new Map<string, number>()
  for (const e of entries.value) counts.set(e.style, (counts.get(e.style) ?? 0) + 1)

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code)
  const codes = [...new Set([...sorted, 'lager', 'ipa', 'wheat', 'stout'])].slice(0, 4)
  return codes.map(toChoice)
})

const allStyleOptions = computed<Choice[]>(() => BEER_STYLES.map((s) => toChoice(s.code)))

/** Что уже выпито сегодня — контекст, который помогает решить, наливать ли ещё */
const todayEntries = computed(() => entries.value.filter((e) => dayKey(e.ts) === todayKey()))

/** Своя коллекция — источник подсказок при вводе названия */
const catalog = computed(() => buildCatalog(entries.value))

/** Выбрали знакомое пиво: подставляем всё, что о нём известно */
function applyKnown(beer: KnownBeer) {
  style.value = beer.style
  customMl.value = undefined
  ml.value = beer.ml
  if (beer.brewery) brewery.value = beer.brewery
}

/** Перелив за день: им же питается пена, доливающаяся на кнопку повтора */
const spill = computed(() => overflowRatio(todayEntries.value.reduce((sum, e) => sum + e.ml, 0)))

/**
 * Натёки на кромке кнопки. Три кляксы вместо одной сплошной полосы:
 * полоса во всю ширину читается как блик и режет экран пополам.
 */
const blobs = computed(() => {
  const r = spill.value
  return [
    { left: 21, width: 14 + r * 30, height: 7 + r * 4 },
    { left: 46, width: 11 + r * 24, height: 6 + r * 5 },
    { left: 71, width: 12 + r * 26, height: 6 + r * 4 },
  ]
})

/**
 * Последний СДЕЛАННЫЙ выбор, а не последняя по времени запись: отметка
 * задним числом иначе перебивала бы кнопку повтора более старым пивом.
 */
const lastChoice = computed(() => {
  const { lastStyle, lastMl } = profile.value
  if (!lastStyle || !lastMl) return null
  return { style: lastStyle, ml: lastMl }
})

async function repeatLast() {
  const source = lastChoice.value
  if (!source) return

  ml.value = source.ml
  customMl.value = undefined
  style.value = source.style
  await save()
}

function toChoice(code: string): Choice {
  const s = findStyle(code)
  return {
    value: code,
    title: s?.title ?? code,
    hint: s ? formatAbv(s.abv) : undefined,
    fill: styleColor(code),
    ink: textOn(code),
    subInk: subTextOn(code),
  }
}

function pickVolume(value: string | number) {
  if (value === -1) {
    customMl.value = customMl.value ?? String(ml.value)
    return
  }
  customMl.value = undefined
  ml.value = Number(value)
}

async function save() {
  // Своё значение разбираем терпимо, но пустое или бессмысленное отбрасываем
  const effectiveMl = customMl.value === undefined ? ml.value : parseVolume(customMl.value)
  if (!effectiveMl || effectiveMl <= 0) return

  // Кнопка наполняется цветом выбранного пива и проговаривает процесс —
  // единственный выразительный момент во всём приложении,
  // ровно на главном действии
  const phrases = POUR_PHRASES[entries.value.length % POUR_PHRASES.length]
  pouring.value = true
  pourLabel.value = phrases[0]

  const timers = [
    setTimeout(() => (pourLabel.value = phrases[1]), 700),
    setTimeout(() => (pourLabel.value = phrases[2]), 1250),
    setTimeout(() => {
      pouring.value = false
      pourLabel.value = 'записать'
    }, 1750),
  ]
  void timers

  const created = await add({
    ts: Date.now() - minutesAgo.value * 60_000,
    ml: effectiveMl,
    style: style.value,
    name: name.value || undefined,
    brewery: brewery.value || undefined,
    place: place.value || undefined,
    note: note.value || undefined,
    rating: rating.value,
    price: price.value,
  })

  // Если сейчас идёт вечеринка, та же отметка появляется и на общем столе
  void mirror(created)

  /*
    Тот же выбор запоминает сервер: дневник боту недоступен, а кнопка
    «ещё такое же» в переписке должна предлагать именно последнее пиво.
  */
  if (apiAvailable()) void saveLastChoice(effectiveMl, style.value).catch(() => {})

  justSaved.value = `${styleTitle(style.value)} ${formatPortion(effectiveMl)}`

  name.value = ''
  brewery.value = ''
  place.value = ''
  note.value = ''
  rating.value = undefined
  price.value = undefined
  minutesAgo.value = 0
  showDetails.value = false

  setTimeout(() => (justSaved.value = null), 2200)
}
</script>

<template>
  <section class="view">
    <!-- Идёт общий вечер: пусть будет видно, что запись уходит ещё и на стол -->
    <div v-if="activeParty" class="party-banner">
      сейчас вечеринка — отметки видит вся компания
    </div>

    <div class="block">
      <div class="eyebrow">объём</div>
      <ChoiceGrid :options="volumeOptions" :model-value="customMl ? -1 : ml" @update:model-value="pickVolume" :columns="4" />
      <template v-if="customMl !== undefined">
        <input v-model="customMl" type="text" inputmode="decimal" class="input" placeholder="0,4 или 400" />
        <!-- Показываем, как понято: «0,25» человек имеет в виду литрами, а не четвертью миллилитра -->
        <span class="unit-hint">{{ customHint || 'литры или миллилитры — поймём и так' }}</span>
      </template>
    </div>

    <div class="block">
      <div class="eyebrow">стиль</div>
      <ChoiceGrid v-model="style" :options="frequentStyles" :columns="2" />
      <button type="button" class="link" @click="showAllStyles = !showAllStyles">
        {{ showAllStyles ? 'свернуть список' : `ещё ${BEER_STYLES.length - 4} стилей` }}
      </button>
      <ChoiceGrid v-if="showAllStyles" v-model="style" :options="allStyleOptions" :columns="2" />
    </div>

    <button type="button" class="link" @click="showDetails = !showDetails">
      {{ showDetails ? 'скрыть подробности' : 'добавить подробности' }}
    </button>

    <div v-if="showDetails" class="block details">
      <BeerNameInput v-model="name" :catalog="catalog" @pick="applyKnown" />
      <input v-model="brewery" class="input" placeholder="пивоварня" />
      <input v-model="place" class="input" placeholder="место" />
      <div class="row">
        <input v-model.number="rating" type="number" min="1" max="5" class="input" placeholder="оценка 1–5" />
        <input v-model.number="price" type="number" min="0" class="input" placeholder="цена" />
      </div>
      <input v-model="note" class="input" placeholder="заметка" />
      <!-- Этикетка снимается прямо здесь: пиво уже названо, ходить за ней в коллекцию незачем -->
      <LabelPhoto v-if="name.trim()" :name="name" />
      <label class="shift">
        <span>выпито минут назад</span>
        <input v-model.number="minutesAgo" type="number" min="0" class="input narrow" />
      </label>
    </div>

    <div class="today">
      <div class="eyebrow">сегодня</div>
      <DayGlass :entries="todayEntries" />
    </div>

    <div class="footer">
      <button v-if="lastChoice" type="button" class="repeat" @click="repeatLast">
        <!--
          Пена, добежавшая по стакану, доливается сюда: лужа растекается
          по кромке кнопки тем шире, чем сильнее перебор, и капает дальше
        -->
        <span v-if="spill > 0" class="puddle" aria-hidden="true">
          <span
            v-for="b in blobs"
            :key="b.left"
            class="blob"
            :style="{ left: `${b.left}%`, width: `${b.width}px`, height: `${b.height}px` }"
          />
          <span class="puddle-drop" />
          <span class="puddle-drop late" />
        </span>
        <span class="repeat-swatch" :style="{ background: styleColor(lastChoice.style) }" />
        ещё такое же: {{ styleTitle(lastChoice.style) }} {{ formatPortion(lastChoice.ml) }}
      </button>
      <Transition name="saved">
        <p v-if="justSaved" class="saved">записано: {{ justSaved }}</p>
      </Transition>
      <button type="button" class="primary" :class="{ emptying: pouring }" @click="save">
        <span class="pour" :class="{ pouring }" :style="{ background: styleColor(style) }" />
        <span class="label" :class="{ light: pouring && textOn(style) !== '#2A1500' }">{{ pourLabel }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 16px 0;
  min-height: calc(var(--app-height, 100dvh) - 116px);
}
.party-banner {
  padding: 8px 11px;
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  color: var(--accent-bright);
  font-size: 12px;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.input {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.input::placeholder {
  color: var(--text-faint);
}
.input.narrow {
  width: 84px;
}
.row {
  display: flex;
  gap: 5px;
}
.unit-hint {
  font-size: 11px;
  color: var(--text-faint);
}
.details {
  gap: 5px;
}
.shift {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: var(--text-dim);
}
.link {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent-bright);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
/* Сводка дня занимает середину экрана и даёт контекст перед записью */
.today {
  margin-top: auto;
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
/* Повтор прошлой отметки — сокращение самого частого сценария */
.repeat {
  position: relative;
  overflow: visible;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-dim);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: transform 100ms ease, border-color 160ms ease;
}
.repeat:active {
  transform: scale(0.985);
  border-color: var(--accent);
}
.repeat-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex: none;
}
/*
  Лужа пены на кромке кнопки: ширина — это перелив, а не декор.
  Комки по краям сделаны тенями — ровный овал читался бы как блик.
*/
.puddle {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
/* Отдельный натёк: свисает с кромки, растекаясь тем шире, чем больше перебор */
.blob {
  position: absolute;
  top: -3px;
  background: #f7f2e4;
  border-radius: 44% 40% 48% 42% / 62% 70% 32% 28%;
  transition: width 620ms cubic-bezier(0.22, 1, 0.36, 1), height 620ms ease;
}
/* С краёв лужи срываются капли и падают дальше вниз */
.puddle-drop {
  position: absolute;
  top: 4px;
  left: 24%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fcf8ee;
  opacity: 0;
  animation: fall 3.6s ease-in infinite;
}
.puddle-drop.late {
  left: auto;
  right: 26%;
  width: 5px;
  height: 5px;
  animation-delay: 1.8s;
}
@keyframes fall {
  0% {
    transform: translateY(0) scale(0.5);
    opacity: 0;
  }
  15% {
    transform: translateY(4px) scale(1);
    opacity: 0.95;
  }
  70% {
    transform: translateY(34px) scale(0.95);
    opacity: 0.8;
  }
  100% {
    transform: translateY(58px) scale(0.5);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .puddle-drop {
    animation: none;
    opacity: 0;
  }
}
.footer {
  padding-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.primary {
  position: relative;
  overflow: hidden;
  padding: 15px;
  border: 0;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: transform 100ms ease, background 200ms ease;
}
/*
  На время наливания кнопка гасит собственный янтарь: иначе IPA той же
  масти льётся в фон того же цвета и движения попросту не видно.
*/
.primary.emptying {
  background: var(--surface-high);
}
.primary:active {
  transform: scale(0.985);
}
.label {
  position: relative;
  z-index: 1;
  transition: color 260ms ease;
}
/* На тёмном пиве надпись должна светлеть, иначе тонет в заливке */
.label.light {
  color: #F6E8D6;
}
/* Заливка поднимается снизу, как пиво в стакане; сверху — полоска пены */
.pour {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 0;
  transition: height 1150ms cubic-bezier(0.35, 0.75, 0.45, 1);
}
/* Шапка пены едет вместе с уровнем и слегка колышется */
.pour::after {
  content: '';
  position: absolute;
  top: -4px;
  left: 0;
  right: 0;
  height: 6px;
  border-radius: 50% 50% 40% 40% / 100% 100% 20% 20%;
  background: #FCF8EE;
  /* Без наливания уровень нулевой, и пена иначе лежала бы полоской по низу */
  opacity: 0;
  transition: opacity 160ms ease;
}
.pour.pouring::after {
  opacity: 0.92;
}
.pour.pouring::after {
  animation: foam 900ms ease-in-out infinite alternate;
}
@keyframes foam {
  from {
    transform: scaleX(1) translateY(0);
  }
  to {
    transform: scaleX(1.04) translateY(-1px);
  }
}
.pour.pouring {
  height: 100%;
}
.saved {
  margin: 0;
  text-align: center;
  font-size: 13px;
  color: var(--accent-bright);
}
.saved-enter-active,
.saved-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}
.saved-enter-from,
.saved-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
@media (prefers-reduced-motion: reduce) {
  .pour {
    transition: none;
  }
}
</style>
