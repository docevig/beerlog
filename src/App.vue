<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import AddView from './views/AddView.vue'
import HistoryView from './views/HistoryView.vue'
import StatsView from './views/StatsView.vue'
import FriendsView from './views/FriendsView.vue'
import Bubbles from './components/Bubbles.vue'
import { createStore } from './storage'
import { ensureMeta } from './storage/meta'
import { useEntries } from './store/entries'
import { useUi } from './store/ui'
import { tg } from './lib/telegram'
import { acceptInvite, apiAvailable } from './lib/api'

type Tab = 'add' | 'history' | 'stats' | 'friends'

const TABS: { id: Tab; title: string }[] = [
  { id: 'add', title: 'отметить' },
  { id: 'history', title: 'история' },
  { id: 'stats', title: 'итоги' },
  { id: 'friends', title: 'компания' },
]

/**
 * Справка по разделу. Говорим о том, чего на экране не видно: границе суток,
 * происхождении коллекции, общем столе. Перечислять кнопки смысла нет — они
 * и так перед глазами.
 */
const HINTS: Record<Tab, string> = {
  add: 'два тапа — объём и стиль — и кружка записана. Название, пивоварня, цена и этикетка прячутся под «добавить подробности». День здесь начинается в 6 утра, поэтому ночная кружка попадает во вчерашний вечер.',
  history:
    'все отметки по дням, свежие сверху. Тап по записи раскрывает её: там правка и удаление. Удалил случайно — пять секунд на отмену.',
  stats:
    'месяц или год целиком. Коллекция внизу собирается сама из названий, которые ты указывал в отметках. Кнопка отправляет итоги месяца картинкой в любой чат.',
  friends:
    'друзья и общие вечера. Пока вечер идёт, отметки всех участников видны за одним столом; твою запись правишь и удаляешь только ты. Сравнение — по вкусам, а не по литрам.',
}

const tab = ref<Tab>('add')
const hintOpen = ref(false)
const synced = ref(true)
const ready = ref(false)
const failure = ref('')
const invited = ref('')

/** Сколько записей ждут сети, чтобы уехать в облако */
const waiting = ref(0)

const { load } = useEntries()
const { focusDay } = useUi()

// Клик по дню в календаре сам перебрасывает на вкладку истории
watch(focusDay, (day) => {
  if (day) tab.value = 'history'
})

// Справка закрывается при переходе: она про раздел, а не про приложение целиком
watch(tab, () => (hintOpen.value = false))

const currentView = computed(() => {
  if (tab.value === 'add') return AddView
  if (tab.value === 'history') return HistoryView
  if (tab.value === 'friends') return FriendsView
  return StatsView
})

onMounted(async () => {
  const app = tg()
  app?.ready()
  app?.expand()

  const handle = createStore()
  synced.value = handle.synced

  const keeper = handle.resilient
  if (keeper) {
    waiting.value = keeper.pendingCount
    keeper.onPendingChange = (count) => (waiting.value = count)

    /*
      Досылаем при возвращении в приложение: человек вышел из подвала,
      открыл beerlog снова — и записи уезжают сами, без единой кнопки.
    */
    const catchUp = () => {
      if (document.visibilityState === 'visible' && keeper.pendingCount > 0) void keeper.flush()
    }

    document.addEventListener('visibilitychange', catchUp)
    window.addEventListener('online', catchUp)
    void keeper.flush()
  }

  try {
    await ensureMeta(handle.store)
    await load(handle.store)
  } catch (e) {
    // Сорвавшееся хранилище не должно оставлять экран в вечной загрузке
    failure.value = e instanceof Error ? e.message : String(e)
  } finally {
    ready.value = true
  }

  // Пришли по ссылке-приглашению: принимаем её и показываем компанию
  const code = app?.initDataUnsafe?.start_param
  if (code && apiAvailable()) {
    try {
      await acceptInvite(code)
      invited.value = 'приглашение принято'
    } catch (e) {
      invited.value = e instanceof Error ? e.message : 'приглашение не сработало'
    }
    tab.value = 'friends'
    setTimeout(() => (invited.value = ''), 5000)
  }
})
</script>

<template>
  <div class="app">
    <p v-if="!synced" class="warning">данные хранятся только на этом устройстве</p>
    <!-- Кружка записана в любом случае; строка объясняет, почему её пока не видно на других устройствах -->
    <p v-else-if="waiting > 0" class="warning">записано на телефоне · ждём сеть, чтобы синхронизировать</p>
    <p v-if="failure" class="warning">хранилище недоступно: {{ failure }}</p>
    <p v-if="invited" class="warning accent">{{ invited }}</p>

    <div class="topbar">
      <button
        type="button"
        class="help"
        :class="{ on: hintOpen }"
        :aria-expanded="hintOpen"
        aria-label="что здесь"
        @click="hintOpen = !hintOpen"
      >
        ?
      </button>
    </div>

    <p v-if="hintOpen" class="hint-box">{{ HINTS[tab] }}</p>

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
/* Полоса под знак вопроса: своей шапки у экранов нет, а место занимать нечем */
.topbar {
  display: flex;
  justify-content: flex-end;
  padding: 6px 12px 0;
}
.help {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: none;
  color: var(--text-faint);
  font: inherit;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}
.help.on {
  border-color: var(--accent);
  color: var(--accent-bright);
}
.hint-box {
  margin: 6px 16px 0;
  padding: 11px 13px;
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-dim);
  font-size: 13px;
  line-height: 1.45;
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
.accent {
  color: var(--accent-bright);
}
.tabs {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
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
