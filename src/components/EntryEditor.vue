<script setup lang="ts">
import { ref, computed } from 'vue'
import ChoiceGrid, { type Choice } from './ChoiceGrid.vue'
import BeerNameInput from './BeerNameInput.vue'
import LabelPhoto from './LabelPhoto.vue'
import type { Entry } from '../types'
import { BEER_STYLES, VOLUME_PRESETS, findStyle } from '../data/styles'
import { styleColor, textOn, subTextOn } from '../lib/srm'
import { formatAbv, formatPortion } from '../lib/format'
import { parseVolume, volumeHint } from '../lib/volume'
import { buildCatalog, type KnownBeer } from '../lib/catalog'
import { useEntries } from '../store/entries'

const props = defineProps<{ entry: Entry }>()
const emit = defineEmits<{ save: [patch: Partial<Entry>]; cancel: [] }>()

const { entries } = useEntries()

/** Подсказки те же, что при отметке: правка не должна знать меньше добавления */
const catalog = computed(() => buildCatalog(entries.value))

const ml = ref(props.entry.ml)

/** Поле «своё» держим строкой: запятая в нём законна, а type=number её теряет */
const customMl = ref<string | undefined>(
  VOLUME_PRESETS.includes(props.entry.ml) ? undefined : String(props.entry.ml),
)

const customHint = computed(() => volumeHint(customMl.value))
const style = ref(props.entry.style)
const showAllStyles = ref(false)

const name = ref(props.entry.name ?? '')
const brewery = ref(props.entry.brewery ?? '')
const place = ref(props.entry.place ?? '')
const note = ref(props.entry.note ?? '')
const rating = ref<number | undefined>(props.entry.rating)
const price = ref<number | undefined>(props.entry.price)

/**
 * Выбор знакомого пива подставляет стиль и пивоварню, но не объём:
 * в правке объём — это ровно то, что человек пришёл поменять руками.
 */
function applyKnown(beer: KnownBeer) {
  style.value = beer.style
  if (beer.brewery) brewery.value = beer.brewery
}

/** Время правится как есть — значение для input[type=datetime-local] */
const when = ref(toLocalInput(props.entry.ts))

function toLocalInput(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const volumeOptions = computed<Choice[]>(() => [
  ...VOLUME_PRESETS.map((v) => ({ value: v, title: formatPortion(v) })),
  { value: -1, title: 'своё' },
])

const styleOptions = computed<Choice[]>(() =>
  BEER_STYLES.map((s) => ({
    value: s.code,
    title: s.title,
    hint: formatAbv(s.abv),
    fill: styleColor(s.code),
    ink: textOn(s.code),
    subInk: subTextOn(s.code),
  })),
)

/** Пока список свёрнут, показываем текущий стиль и три соседних по цвету */
const shortStyles = computed<Choice[]>(() => {
  const current = findStyle(style.value)
  if (!current) return styleOptions.value.slice(0, 4)

  const sorted = [...BEER_STYLES].sort(
    (a, b) => Math.abs(a.srm - current.srm) - Math.abs(b.srm - current.srm),
  )
  const codes = sorted.slice(0, 4).map((s) => s.code)
  return styleOptions.value.filter((o) => codes.includes(String(o.value)))
})

function pickVolume(value: string | number) {
  if (value === -1) {
    customMl.value = customMl.value ?? String(ml.value)
    return
  }
  customMl.value = undefined
  ml.value = Number(value)
}

function submit() {
  // Пустое или бессмысленное «своё» не должно превратиться в кружку на ноль
  const effectiveMl = customMl.value === undefined ? ml.value : parseVolume(customMl.value)
  if (!effectiveMl || effectiveMl <= 0) return

  emit('save', {
    ml: effectiveMl,
    style: style.value,
    ts: new Date(when.value).getTime(),
    name: name.value || undefined,
    brewery: brewery.value || undefined,
    place: place.value || undefined,
    note: note.value || undefined,
    rating: rating.value,
    price: price.value,
  })
}
</script>

<template>
  <div class="editor">
    <div class="eyebrow">объём</div>
    <ChoiceGrid :options="volumeOptions" :model-value="customMl ? -1 : ml" @update:model-value="pickVolume" :columns="4" />
    <template v-if="customMl !== undefined">
      <input
        v-model="customMl"
        type="text"
        inputmode="decimal"
        class="input"
        placeholder="0,4 или 400"
      />
      <!-- Проговариваем понятое: «0,25» человек имеет в виду как литры, а не как четверть миллилитра -->
      <span class="unit-hint">{{ customHint || 'литры или миллилитры — поймём и так' }}</span>
    </template>

    <div class="eyebrow">стиль</div>
    <ChoiceGrid v-model="style" :options="showAllStyles ? styleOptions : shortStyles" :columns="2" />
    <button type="button" class="link" @click="showAllStyles = !showAllStyles">
      {{ showAllStyles ? 'свернуть список' : 'все стили' }}
    </button>

    <div class="eyebrow">когда</div>
    <input v-model="when" type="datetime-local" class="input" />

    <div class="eyebrow">подробности</div>
    <BeerNameInput v-model="name" :catalog="catalog" @pick="applyKnown" />
    <input v-model="brewery" class="input" placeholder="пивоварня" />
    <input v-model="place" class="input" placeholder="место" />
    <div class="row">
      <input v-model.number="rating" type="number" min="1" max="5" class="input" placeholder="оценка 1–5" />
      <input v-model.number="price" type="number" min="0" class="input" placeholder="цена" />
    </div>
    <input v-model="note" class="input" placeholder="заметка" />
    <LabelPhoto v-if="name.trim()" :name="name" />

    <div class="actions">
      <button type="button" class="link" @click="emit('cancel')">отмена</button>
      <button type="button" class="primary" @click="submit">сохранить</button>
    </div>
  </div>
</template>

<style scoped>
.unit-hint {
  font-size: 11px;
  color: var(--text-faint);
}
.editor {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
}
.eyebrow {
  margin-top: 4px;
}
.input {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
.input::placeholder {
  color: var(--text-faint);
}
.row {
  display: flex;
  gap: 6px;
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
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}
.primary {
  padding: 10px 20px;
  border: 0;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
}
</style>
