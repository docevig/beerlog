<script setup lang="ts">
import { ref, computed } from 'vue'
import ChoiceGrid from '../components/ChoiceGrid.vue'
import { BEER_STYLES, VOLUME_PRESETS, findStyle } from '../data/styles'
import { formatAbv } from '../lib/format'
import { useEntries } from '../store/entries'

const { entries, profile, add } = useEntries()

const ml = ref<number>(profile.value.lastMl ?? 500)
const style = ref<string>(profile.value.lastStyle ?? 'lager')
const showAllStyles = ref(false)
const showDetails = ref(false)
const saved = ref(false)

const name = ref('')
const brewery = ref('')
const place = ref('')
const note = ref('')
const rating = ref<number | undefined>(undefined)
const price = ref<number | undefined>(undefined)
const customMl = ref<number | undefined>(undefined)
const minutesAgo = ref(0)

const volumeOptions = computed(() => [
  ...VOLUME_PRESETS.map((v) => ({ value: v, title: formatMl(v) })),
  { value: -1, title: 'своё' },
])

/** Часто используемые стили считаются по истории, а не задаются вручную */
const frequentStyles = computed(() => {
  const counts = new Map<string, number>()
  for (const e of entries.value) {
    counts.set(e.style, (counts.get(e.style) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code)
  const fallback = ['lager', 'ipa', 'wheat', 'stout']
  const codes = [...new Set([...sorted, ...fallback])].slice(0, 4)
  return codes.map(toOption)
})

const allStyleOptions = computed(() =>
  BEER_STYLES.map((s) => ({ value: s.code, title: s.title, hint: formatAbv(s.abv) })),
)

function toOption(code: string) {
  const s = findStyle(code)
  return { value: code, title: s?.title ?? code, hint: s ? formatAbv(s.abv) : undefined }
}

function formatMl(value: number): string {
  return String(value / 1000).replace('.', ',') + ' л'
}

function pickVolume(value: string | number) {
  if (value === -1) {
    customMl.value = customMl.value ?? ml.value
    return
  }
  customMl.value = undefined
  ml.value = Number(value)
}

async function save() {
  const effectiveMl = customMl.value ?? ml.value
  if (!effectiveMl || effectiveMl <= 0) return

  await add({
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

  name.value = ''
  brewery.value = ''
  place.value = ''
  note.value = ''
  rating.value = undefined
  price.value = undefined
  minutesAgo.value = 0
  showDetails.value = false

  saved.value = true
  setTimeout(() => (saved.value = false), 1600)
}
</script>

<template>
  <section class="view">
    <div class="block">
      <div class="label">объём</div>
      <ChoiceGrid :options="volumeOptions" :model-value="customMl ? -1 : ml" @update:model-value="pickVolume" :columns="4" />
      <input
        v-if="customMl !== undefined"
        v-model.number="customMl"
        type="number"
        inputmode="numeric"
        class="input"
        placeholder="миллилитров"
      />
    </div>

    <div class="block">
      <div class="label">стиль</div>
      <ChoiceGrid v-model="style" :options="frequentStyles" :columns="2" />
      <button type="button" class="link" @click="showAllStyles = !showAllStyles">
        {{ showAllStyles ? 'свернуть' : `ещё ${BEER_STYLES.length - 4} стилей` }}
      </button>
      <ChoiceGrid v-if="showAllStyles" v-model="style" :options="allStyleOptions" :columns="3" />
    </div>

    <button type="button" class="link" @click="showDetails = !showDetails">
      {{ showDetails ? 'скрыть подробности' : 'подробнее' }}
    </button>

    <div v-if="showDetails" class="block details">
      <input v-model="name" class="input" placeholder="название" />
      <input v-model="brewery" class="input" placeholder="пивоварня" />
      <input v-model="place" class="input" placeholder="место" />
      <div class="row">
        <input v-model.number="rating" type="number" min="1" max="5" class="input" placeholder="оценка 1–5" />
        <input v-model.number="price" type="number" min="0" class="input" placeholder="цена" />
      </div>
      <input v-model="note" class="input" placeholder="заметка" />
      <label class="shift">
        выпито минут назад
        <input v-model.number="minutesAgo" type="number" min="0" class="input narrow" />
      </label>
    </div>

    <button type="button" class="primary" @click="save">записать</button>
    <p v-if="saved" class="saved">записано</p>
  </section>
</template>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.label {
  font-size: 12px;
  color: var(--hint);
}
.input {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--section-bg);
  border-radius: var(--radius);
  background: var(--section-bg);
  color: var(--text);
  font: inherit;
}
.input.narrow {
  width: 90px;
}
.row {
  display: flex;
  gap: 6px;
}
.details {
  gap: 6px;
}
.shift {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: var(--hint);
}
.link {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: none;
  color: var(--link);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.primary {
  padding: 14px;
  border: 0;
  border-radius: var(--radius);
  background: var(--button);
  color: var(--button-text);
  font: inherit;
  font-size: 16px;
  cursor: pointer;
}
.saved {
  margin: 0;
  text-align: center;
  font-size: 13px;
  color: var(--hint);
}
</style>
