<script setup lang="ts">
import { computed, ref, onMounted, nextTick } from 'vue'
import EntryRow from '../components/EntryRow.vue'
import EntryEditor from '../components/EntryEditor.vue'
import { useEntries } from '../store/entries'
import { useUi } from '../store/ui'
import { useParty } from '../store/party'
import { dayKey, todayKey } from '../lib/day'
import { totalMl, totalAlcoholGrams } from '../lib/stats'
import { formatLitres, formatDay, formatGrams, withPlural } from '../lib/format'
import { exportEntries } from '../lib/export'
import { mergeImport, readJsonFile } from '../lib/importer'
import type { Entry } from '../types'

const { entries, remove, update, restore, importMany } = useEntries()
const { takeFocusDay } = useUi()
// Стол вечеринки повторяет судьбу отметки: иначе он расходится с дневником
const { mirror, mirrorUpdate, mirrorRemove } = useParty()

/**
 * Выгрузка и загрузка скрыты до появления экрана настроек: место в конце
 * ленты было неудачным — при длинной истории до кнопок не долистать.
 * Код оставлен рабочим, включается этим флагом.
 */
const SHOW_TRANSFER = false

const fileInput = ref<HTMLInputElement | null>(null)
const importReport = ref('')

function pickFile() {
  fileInput.value?.click()
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const raw = await readJsonFile(file)
    const result = mergeImport(entries.value, raw)
    await importMany(result.added)

    const parts = [`добавлено ${result.added.length}`]
    if (result.skipped) parts.push(`уже было ${result.skipped}`)
    if (result.broken) parts.push(`пропущено битых ${result.broken}`)
    importReport.value = parts.join(', ')
  } catch (e) {
    importReport.value = e instanceof Error ? e.message : 'не удалось разобрать файл'
  } finally {
    // Сбрасываем поле, иначе повторный выбор того же файла не вызовет событие
    input.value = ''
    setTimeout(() => (importReport.value = ''), 6000)
  }
}

/** Отметка, ждущая подтверждения удаления */
const pendingRemoval = ref<Entry | undefined>(undefined)
let removalTimer: ReturnType<typeof setTimeout> | undefined

const editing = ref<Entry | undefined>(undefined)

/** Раскрытая строка; одновременно раскрыта только одна */
const expandedId = ref<string | null>(null)

/** День, к которому перебросил календарь — подсвечиваем и прокручиваем */
const highlightedDay = ref<string | null>(null)
const dayRefs = new Map<string, HTMLElement>()

function setDayRef(day: string, el: unknown) {
  if (el instanceof HTMLElement) dayRefs.set(day, el)
  else dayRefs.delete(day)
}

function toggleRow(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

onMounted(async () => {
  const target = takeFocusDay()
  if (!target) return

  highlightedDay.value = target
  await nextTick()
  dayRefs.get(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // Подсветка гаснет сама: она подсказка, а не постоянное состояние
  setTimeout(() => (highlightedDay.value = null), 2600)
})

const today = computed(() => entries.value.filter((e) => dayKey(e.ts) === todayKey()))

const grouped = computed(() => {
  const map = new Map<string, Entry[]>()
  for (const e of [...entries.value].sort((a, b) => b.ts - a.ts)) {
    const key = dayKey(e.ts)
    const list = map.get(key) ?? []
    list.push(e)
    map.set(key, list)
  }
  return [...map.entries()]
})

function askRemove(id: string) {
  const target = entries.value.find((e) => e.id === id)
  if (!target) return

  pendingRemoval.value = target
  void remove(id)
  void mirrorRemove(id)

  clearTimeout(removalTimer)
  removalTimer = setTimeout(() => (pendingRemoval.value = undefined), 5000)
}

async function undoRemove() {
  const target = pendingRemoval.value
  if (!target) return

  pendingRemoval.value = undefined
  clearTimeout(removalTimer)
  await restore(target)
  // Возврат на стол — только если отметка из идущего вечера, это решает mirror
  void mirror(target)
}

function startEdit(id: string) {
  const target = entries.value.find((e) => e.id === id)
  if (!target) return
  editing.value = target
}

async function applyEdit(patch: Partial<Entry>) {
  if (!editing.value) return

  const id = editing.value.id
  await update(id, patch)
  editing.value = undefined

  const updated = entries.value.find((e) => e.id === id)
  if (updated) void mirrorUpdate(updated)
}
</script>

<template>
  <section class="view">
    <div v-if="entries.length === 0" class="empty">
      <p class="empty-title">дневник пока пуст</p>
      <p class="empty-body">открой соседнюю вкладку и отметь первую кружку — двух касаний хватит</p>
    </div>

    <template v-else>
      <div class="summary">
        <div class="eyebrow">сегодня</div>
        <div class="figure summary-value">{{ formatLitres(totalMl(today)) }}</div>
        <div class="summary-sub">
          {{ withPlural(today.length, 'кружка', 'кружки', 'кружек') }} ·
          {{ formatGrams(totalAlcoholGrams(today)) }} спирта
        </div>
      </div>

      <div
        v-for="[day, list] in grouped"
        :key="day"
        :ref="(el) => setDayRef(day, el)"
        class="group"
        :class="{ highlighted: highlightedDay === day }"
      >
        <div class="day">
          <span>{{ formatDay(day) }}</span>
          <span class="day-total">{{ formatLitres(totalMl(list)) }}</span>
        </div>
        <TransitionGroup name="entry">
          <EntryRow
            v-for="e in list"
            :key="e.id"
            :entry="e"
            :expanded="expandedId === e.id"
            @toggle="toggleRow"
            @edit="startEdit"
            @remove="askRemove"
          />
        </TransitionGroup>
      </div>

      <div v-if="SHOW_TRANSFER" class="transfer">
        <button type="button" class="link" @click="exportEntries(entries)">выгрузить в файл</button>
        <button type="button" class="link" @click="pickFile">загрузить из файла</button>
        <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="onFile" />
      </div>
      <p v-if="importReport" class="report">{{ importReport }}</p>
    </template>

    <Transition name="toast">
      <div v-if="pendingRemoval" class="undo">
        <span>отметка удалена</span>
        <button type="button" @click="undoRemove">вернуть</button>
      </div>
    </Transition>

    <Teleport to="body">
      <div v-if="editing" class="sheet" @click.self="editing = undefined">
        <EntryEditor :entry="editing" @save="applyEdit" @cancel="editing = undefined" />
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 16px 24px;
}
.summary-value {
  font-size: 32px;
  color: var(--accent-bright);
}
.summary-sub {
  font-size: 12px;
  color: var(--text-faint);
  margin-top: 2px;
}
.group {
  display: flex;
  flex-direction: column;
  scroll-margin-top: 12px;
  border-radius: var(--radius);
  transition: background 400ms ease;
}
/* Подсветка дня, на который перебросил календарь */
.group.highlighted {
  background: rgba(229, 133, 0, 0.12);
}
.day {
  display: flex;
  justify-content: space-between;
  padding: 6px 0 2px;
  font-size: 12px;
  color: var(--text-faint);
}
.day-total {
  font-variant-numeric: tabular-nums;
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
.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent-bright);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.transfer {
  display: flex;
  gap: 18px;
}
.hidden {
  display: none;
}
.report {
  margin: 0;
  font-size: 12px;
  color: var(--text-dim);
}
.undo {
  position: sticky;
  bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 13px;
  border-radius: var(--radius);
  background: var(--surface-high);
  font-size: 13px;
}
.undo button {
  border: 0;
  background: none;
  color: var(--accent-bright);
  font: inherit;
  cursor: pointer;
}
/* Редактор выезжает поверх всего: правка не должна терять место в ленте */
.sheet {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: flex-end;
  padding: 12px;
  background: rgba(10, 8, 5, 0.7);
  overflow-y: auto;
}
.sheet > * {
  width: 100%;
}

/* Удаляемая строка схлопывается, а не пропадает рывком */
.entry-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.entry-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}
.entry-move {
  transition: transform 220ms ease;
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
