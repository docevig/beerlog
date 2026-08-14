<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import AddView from './views/AddView.vue'
import HistoryView from './views/HistoryView.vue'
import StatsView from './views/StatsView.vue'
import FriendsView from './views/FriendsView.vue'
import SettingsView from './views/SettingsView.vue'
import Bubbles from './components/Bubbles.vue'
import { createStore } from './storage'
import { ensureMeta } from './storage/meta'
import { useEntries } from './store/entries'
import { useUi } from './store/ui'
import { useParty } from './store/party'
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
const settingsOpen = ref(false)
const synced = ref(true)

/** Свой идентификатор нужен настройкам: под ним живут аватарка и имя */
const meId = tg()?.initDataUnsafe?.user?.id

/** Сколько ключей занято в хранилище — показываем в справке о приложении */
const storageKeys = ref(0)

/** Досылку из настроек делает то же хранилище, что и при возврате в приложение */
let resend: (() => void) | undefined

function flushPending() {
  resend?.()
}
const ready = ref(false)
const failure = ref('')
const invited = ref('')

/** Сколько записей ждут сети, чтобы уехать в облако */
const waiting = ref(0)

const { load, entries: allEntries } = useEntries()
const { focusDay } = useUi()
const { refresh: refreshParty, catchUpActive } = useParty()

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

/**
 * Высоту окна берём у Telegram, а не из 100vh: в мини-приложении vh считается
 * от экрана целиком, поэтому при компактном окне или открытой клавиатуре низ
 * интерфейса оказывался за краем — до вкладок было не добраться.
 */
function trackViewport(app: ReturnType<typeof tg>): void {
  /*
    Переменную высоты ставим только внутри Telegram: вне его скрипт тоже
    создаёт заглушку с высотой, но об изменениях окна не сообщает — значение
    застыло бы на первом замере, и в браузере приложение стало бы не по окну.
  */
  if (!app?.initData) {
    return
  }

  /*
    Берём фактическую высоту окна, а не стабильную: при открытой клавиатуре
    приложение должно сжаться, иначе верх формы уходит за видимую область
    и достать его прокруткой невозможно — контейнер считает, что всё влезло.
  */
  const apply = () => {
    const reported = app.viewportHeight ?? 0
    const height = reported > 0 ? reported : window.innerHeight

    document.documentElement.style.setProperty('--app-height', `${Math.round(height)}px`)
  }

  apply()

  /*
    Промежуточные кадры пропускаем. Telegram шлёт viewportChanged всю анимацию
    клавиатуры, и пересчёт на каждом из них — то самое дёрганье интерфейса;
    isStateStable отмечает кадр, на котором размер окончательный.
  */
  app.onEvent('viewportChanged', (payload) => {
    if (payload?.isStateStable === false) return
    apply()
  })

  // resize здесь не слушаем: на Android он срабатывает пачкой во время анимации

  /*
    Клавиатура перекрывает нижнюю часть окна, а высота приложения на неё
    намеренно не реагирует. Поэтому сфокусированное поле подводим к центру
    сами — с задержкой, иначе прокрутка случится раньше, чем клавиатура
    закончит выезжать, и поле снова окажется под ней.
  */
  document.addEventListener('focusin', (event) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return

    setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320)
  })
}

onMounted(async () => {
  const app = tg()
  app?.ready()
  app?.expand()
  trackViewport(app)

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
    resend = () => void keeper.flush()
    void keeper.flush()
  }

  try {
    await ensureMeta(handle.store)
    await load(handle.store)
    // Занятые ключи считаем один раз: цифра нужна только в справке
    storageKeys.value = (await handle.store.keys()).length
  } catch (e) {
    // Сорвавшееся хранилище не должно оставлять экран в вечной загрузке
    failure.value = e instanceof Error ? e.message : String(e)
  } finally {
    ready.value = true
  }

  /*
    Про идущий вечер надо знать с самого запуска. Раньше это выяснялось
    только при открытии вкладки компании, и кружка, записанная сразу после
    старта приложения, на общий стол не уезжала совсем.
  */
  const meId = app?.initDataUnsafe?.user?.id
  if (apiAvailable() && meId) {
    /*
      Сразу и сверяем свои строки вечера: кружка, записанная до того, как
      приложение узнало о вечере, иначе так и осталась бы только в дневнике,
      а на общем столе её ждали бы напрасно.
    */
    const syncParty = async () => {
      await refreshParty()
      await catchUpActive(meId, allEntries.value)
    }

    const onReturn = () => {
      if (document.visibilityState === 'visible') void syncParty()
    }

    void syncParty()
    // Вечер могли начать, пока приложение было свёрнуто
    document.addEventListener('visibilitychange', onReturn)
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
      <button type="button" class="help" aria-label="настройки" @click="settingsOpen = true">⚙</button>
    </div>

    <p v-if="hintOpen" class="hint-box">{{ HINTS[tab] }}</p>

    <main class="content">
      <Bubbles v-if="tab === 'add'" />
      <p v-if="!ready" class="loading">загружаем историю</p>
      <Transition v-else name="view" mode="out-in">
        <component :is="currentView" :key="tab" class="screen" />
      </Transition>

      <SettingsView
        v-if="settingsOpen"
        :me-id="meId ?? 0"
        :waiting="waiting"
        :synced="synced"
        :keys="storageKeys"
        @close="settingsOpen = false"
        @flush="flushPending"
      />
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
  /* dvh как запасной вариант: он тоже учитывает клавиатуру, но есть не везде */
  height: var(--app-height, 100dvh);
  min-height: var(--app-height, 100dvh);
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
/* Прокручивается содержимое, а не страница: так вкладки не уезжают за край окна */
.content {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
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
/*
  Вкладки закреплены не на экране, а в колонке приложения. С position: fixed
  они привязывались к экрану целиком и при невысоком окне мини-приложения
  оказывались ниже его края.
*/
.tabs {
  flex: none;
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
