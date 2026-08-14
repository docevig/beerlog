<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AddView from './views/AddView.vue'
import HistoryView from './views/HistoryView.vue'
import StatsView from './views/StatsView.vue'
import { createStore } from './storage'
import { ensureMeta } from './storage/meta'
import { useEntries } from './store/entries'
import { tg } from './lib/telegram'

type Tab = 'add' | 'history' | 'stats'

const tab = ref<Tab>('add')
const synced = ref(true)
const ready = ref(false)
const failure = ref('')

const { load } = useEntries()

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
      <p v-if="!ready" class="loading">загружаем историю</p>
      <template v-else>
        <AddView v-if="tab === 'add'" />
        <HistoryView v-else-if="tab === 'history'" />
        <StatsView v-else />
      </template>
    </main>

    <nav class="tabs">
      <button type="button" :class="{ active: tab === 'add' }" @click="tab = 'add'">отметить</button>
      <button type="button" :class="{ active: tab === 'history' }" @click="tab = 'history'">история</button>
      <button type="button" :class="{ active: tab === 'stats' }" @click="tab = 'stats'">статистика</button>
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
  padding: 6px 16px;
  background: var(--section-bg);
  color: var(--hint);
  font-size: 12px;
  text-align: center;
}
.content {
  flex: 1;
  padding-bottom: 64px;
}
.loading {
  padding: 16px;
  color: var(--hint);
  font-size: 14px;
}
.tabs {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid var(--section-bg);
  background: var(--bg);
}
.tabs button {
  padding: 14px 0 calc(14px + env(safe-area-inset-bottom));
  border: 0;
  background: none;
  color: var(--hint);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.tabs button.active {
  color: var(--button);
}
</style>
