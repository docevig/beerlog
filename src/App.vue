<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import AddView from './views/AddView.vue'
import HistoryView from './views/HistoryView.vue'
import StatsView from './views/StatsView.vue'
import Bubbles from './components/Bubbles.vue'
import { createStore } from './storage'
import { ensureMeta } from './storage/meta'
import { useEntries } from './store/entries'
import { useUi } from './store/ui'
import { tg } from './lib/telegram'

type Tab = 'add' | 'history' | 'stats'

const TABS: { id: Tab; title: string }[] = [
  { id: 'add', title: 'отметить' },
  { id: 'history', title: 'история' },
  { id: 'stats', title: 'статистика' },
]

const tab = ref<Tab>('add')
const synced = ref(true)
const ready = ref(false)
const failure = ref('')

const { load } = useEntries()
const { focusDay } = useUi()

// Клик по дню в календаре сам перебрасывает на вкладку истории
watch(focusDay, (day) => {
  if (day) tab.value = 'history'
})

const currentView = computed(() => {
  if (tab.value === 'add') return AddView
  if (tab.value === 'history') return HistoryView
  return StatsView
})

onMounted(async () => {
  const app = tg()
  app?.ready()
  app?.expand()

  const handle = createStore()
  synced.value = handle.synced

  try {
    await ensureMeta(handle.store)
    await load(handle.store)
  } catch (e) {
    // Сорвавшееся хранилище не должно оставлять экран в вечной загрузке
    failure.value = e instanceof Error ? e.message : String(e)
  } finally {
    ready.value = true
  }
})
</script>

<template>
  <div class="app">
    <p v-if="!synced" class="warning">данные хранятся только на этом устройстве</p>
    <p v-if="failure" class="warning">хранилище недоступно: {{ failure }}</p>

    <main class="content">
      <Bubbles v-if="tab === 'add'" />
      <p v-if="!ready" class="loading">загружаем историю</p>
      <Transition v-else name="view" mode="out-in">
        <component :is="currentView" :key="tab" class="screen" />
      </Transition>
    </main>

    <nav class="tabs">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        :class="{ active: tab === t.id }"
        @click="tab = t.id"
      >
        {{ t.title }}
      </button>
    </nav>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.warning {
  margin: 0;
  padding: 7px 16px;
  background: var(--surface-high);
  color: var(--text-dim);
  font-size: 12px;
  text-align: center;
}
.content {
  position: relative;
  flex: 1;
  padding-bottom: 62px;
}
.screen {
  position: relative;
  z-index: 1;
}
.loading {
  padding: 16px;
  color: var(--text-faint);
  font-size: 14px;
}
.tabs {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid var(--line);
  background: var(--bg);
}
.tabs button {
  position: relative;
  padding: 13px 0 calc(13px + env(safe-area-inset-bottom));
  border: 0;
  background: none;
  color: var(--text-faint);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: color 160ms ease;
}
.tabs button.active {
  color: var(--accent-bright);
}
/* Активная вкладка отмечена янтарной чертой сверху */
.tabs button.active::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 50%;
  transform: translateX(-50%);
  width: 28px;
  height: 2px;
  background: var(--accent);
}
.view-enter-active,
.view-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}
.view-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.view-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
