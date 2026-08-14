<script setup lang="ts">
import { computed, ref } from 'vue'
import EntryRow from '../components/EntryRow.vue'
import { useEntries } from '../store/entries'
import { dayKey, todayKey } from '../lib/day'
import { totalMl, totalAlcoholGrams } from '../lib/stats'
import { formatLitres, formatDay, formatGrams, withPlural } from '../lib/format'
import { exportEntries } from '../lib/export'
import type { Entry } from '../types'

const { entries, remove, update, restore } = useEntries()

/** Отметка, ждущая подтверждения удаления */
const pendingRemoval = ref<Entry | undefined>(undefined)
let removalTimer: ReturnType<typeof setTimeout> | undefined

const editing = ref<Entry | undefined>(undefined)
const editMl = ref(0)

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

  clearTimeout(removalTimer)
  removalTimer = setTimeout(() => (pendingRemoval.value = undefined), 5000)
}

async function undoRemove() {
  const target = pendingRemoval.value
  if (!target) return

  pendingRemoval.value = undefined
  clearTimeout(removalTimer)
  await restore(target)
}

function startEdit(id: string) {
  const target = entries.value.find((e) => e.id === id)
  if (!target) return
  editing.value = target
  editMl.value = target.ml
}

async function applyEdit() {
  if (!editing.value) return
  await update(editing.value.id, { ml: editMl.value })
  editing.value = undefined
}
</script>

<template>
  <section class="view">
    <div class="summary">
      <div class="caption">сегодня</div>
      <div class="big">{{ formatLitres(totalMl(today)) }}</div>
      <div class="caption">
        {{ withPlural(today.length, 'порция', 'порции', 'порций') }} ·
        {{ formatGrams(totalAlcoholGrams(today)) }} спирта
      </div>
    </div>

    <button type="button" class="link" @click="exportEntries(entries)">выгрузить историю в файл</button>

    <p v-if="entries.length === 0" class="empty">пока пусто — первая отметка на соседней вкладке</p>

    <div v-for="[day, list] in grouped" :key="day" class="group">
      <div class="day">{{ formatDay(day) }} · {{ formatLitres(totalMl(list)) }}</div>
      <EntryRow v-for="e in list" :key="e.id" :entry="e" @edit="startEdit" @remove="askRemove" />
    </div>

    <div v-if="pendingRemoval" class="undo">
      отметка удалена
      <button type="button" @click="undoRemove">вернуть</button>
    </div>

    <div v-if="editing" class="editor">
      <div class="caption">объём, мл</div>
      <input v-model.number="editMl" type="number" class="input" />
      <div class="editor-actions">
        <button type="button" class="link" @click="editing = undefined">отмена</button>
        <button type="button" class="primary" @click="applyEdit">сохранить</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}
.summary {
  padding: 12px;
  border-radius: var(--radius);
  background: var(--section-bg);
}
.caption {
  font-size: 12px;
  color: var(--hint);
}
.big {
  font-size: 26px;
  font-weight: 500;
}
.group {
  display: flex;
  flex-direction: column;
}
.day {
  padding: 8px 0 2px;
  font-size: 12px;
  color: var(--hint);
}
.empty {
  color: var(--hint);
  font-size: 14px;
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
.undo {
  position: sticky;
  bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--section-bg);
  font-size: 13px;
}
.undo button {
  border: 0;
  background: none;
  color: var(--link);
  font: inherit;
  cursor: pointer;
}
.editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: var(--radius);
  background: var(--section-bg);
}
.editor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.input {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--bg);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
.primary {
  padding: 8px 16px;
  border: 0;
  border-radius: var(--radius);
  background: var(--button);
  color: var(--button-text);
  font: inherit;
  cursor: pointer;
}
</style>
