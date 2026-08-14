# beerlog, этап 1 — план реализации

**Цель:** рабочий Telegram Mini App, в котором можно за два тапа отметить выпитое пиво,
посмотреть историю и статистику, а данные хранятся в Telegram CloudStorage.

**Архитектура:** статическая SPA на Vue 3, без бэкенда. Прикладной код работает с
интерфейсом `Storage`, за которым прячется либо Telegram CloudStorage, либо localStorage.
Данные разложены по ключам-месяцам с автоматической сегментацией при переполнении.

**Стек:** Vue 3, Vite, TypeScript, Vitest. Никаких UI-библиотек и тяжёлых зависимостей.

## Общие ограничения

- Значение в CloudStorage — не длиннее 4096 символов, ключ — 1–128 символов из `A-Z a-z 0-9 _ -`, всего до 1024 ключей.
- Приложение обязано загружаться быстрее 10 секунд, иначе Telegram его не покажет.
- Сутки для статистики начинаются в 06:00 локального времени.
- Комментарии в коде — на русском, идентификаторы — на английском.
- Коммиты делает владелец репозитория вручную; шаги плана коммиты не выполняют.
- Тексты интерфейса — в предложениях с маленькой буквы, без восклицательных знаков.

---

### Задача 1. Каркас проекта

**Файлы:**
- Создать: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.ts`, `src/App.vue`, `.gitignore`

**Производит:** рабочую команду `npm run dev`, поднимающую пустое приложение, и `npm run test`.

- [ ] **Шаг 1.** Создать проект командой `npm create vite@latest . -- --template vue-ts` в пустом каталоге.
- [ ] **Шаг 2.** Установить зависимости и Vitest: `npm install` и `npm install -D vitest`.
- [ ] **Шаг 3.** В `package.json` добавить скрипт `"test": "vitest run"`.
- [ ] **Шаг 4.** В `vite.config.ts` прописать `base: '/beerlog/'` — под этим путём GitHub Pages раздаёт репозиторий.
- [ ] **Шаг 5.** В `index.html` подключить скрипт Telegram: `<script src="https://telegram.org/js/telegram-web-app.js"></script>`.

  Атрибут `integrity` здесь сознательно не ставится, хотя обычно внешние скрипты
  им подписывают: Telegram обновляет этот файл по месту, и фиксированный хеш
  однажды молча уронит приложение. Домен принадлежит самой платформе, внутри
  которой приложение и работает.
- [ ] **Шаг 6.** Проверить: `npm run dev` открывает страницу без ошибок в консоли.

---

### Задача 2. Справочник стилей и расчёты

**Файлы:**
- Создать: `src/data/styles.ts`, `src/lib/calc.ts`, `src/lib/calc.test.ts`

**Производит:**
- `BEER_STYLES: BeerStyle[]`, где `BeerStyle = { code: string; title: string; abv: number }`
- `findStyle(code: string): BeerStyle | undefined`
- `pureAlcoholGrams(ml: number, abv: number): number`
- `VOLUME_PRESETS: number[]`

- [ ] **Шаг 1.** Написать падающий тест в `src/lib/calc.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pureAlcoholGrams } from './calc'

describe('pureAlcoholGrams', () => {
  it('считает граммы чистого спирта для полулитра пятиградусного', () => {
    // 500 мл × 5% × 0,789 = 19,725 г
    expect(pureAlcoholGrams(500, 5)).toBeCloseTo(19.725, 3)
  })

  it('для безалкогольного даёт почти ноль', () => {
    expect(pureAlcoholGrams(500, 0.5)).toBeCloseTo(1.9725, 3)
  })
})
```

- [ ] **Шаг 2.** Запустить `npm run test` — тест падает, функции нет.
- [ ] **Шаг 3.** Написать `src/lib/calc.ts`:

```ts
/** Плотность этанола, г/мл */
const ETHANOL_DENSITY = 0.789

/** Граммы чистого спирта в порции заданного объёма и крепости */
export function pureAlcoholGrams(ml: number, abv: number): number {
  return ml * (abv / 100) * ETHANOL_DENSITY
}
```

- [ ] **Шаг 4.** Запустить `npm run test` — тест проходит.
- [ ] **Шаг 5.** Создать `src/data/styles.ts` со всеми 21 стилем из спека (код, название, дефолтная крепость) и `VOLUME_PRESETS = [330, 500, 1000]`.

---

### Задача 3. Слой хранилища и сегментация ключей

**Файлы:**
- Создать: `src/storage/types.ts`, `src/storage/local.ts`, `src/storage/segments.ts`, `src/storage/segments.test.ts`

**Потребляет:** ничего.

**Производит:**
- `interface KeyValueStore { get(key: string): Promise<string | null>; set(key, value): Promise<void>; remove(key): Promise<void>; keys(): Promise<string[]> }`
- `splitIntoSegments(items: unknown[], limit: number): string[]` — режет массив на строки не длиннее лимита
- `class LocalStore implements KeyValueStore`

Интерфейс называется `KeyValueStore`, а не `Storage`: имя `Storage` уже занято
встроенным DOM-типом, и совпадение приводит к молчаливой подмене типа в редакторе.

- [ ] **Шаг 1.** Написать падающий тест сегментации в `src/storage/segments.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { splitIntoSegments } from './segments'

describe('splitIntoSegments', () => {
  it('умещает всё в один сегмент, когда лимит не мешает', () => {
    const parts = splitIntoSegments([1, 2, 3], 4096)
    expect(parts).toHaveLength(1)
    expect(JSON.parse(parts[0])).toEqual([1, 2, 3])
  })

  it('режет на несколько сегментов при тесном лимите', () => {
    const parts = splitIntoSegments([1, 2, 3, 4], 10)
    expect(parts.length).toBeGreaterThan(1)
    parts.forEach(p => expect(p.length).toBeLessThanOrEqual(10))
    const restored = parts.flatMap(p => JSON.parse(p))
    expect(restored).toEqual([1, 2, 3, 4])
  })

  it('не теряет ни одного элемента на длинной серии', () => {
    const items = Array.from({ length: 500 }, (_, i) => ({ id: i, ml: 500 }))
    const parts = splitIntoSegments(items, 4096)
    const restored = parts.flatMap(p => JSON.parse(p))
    expect(restored).toHaveLength(500)
  })
})
```

- [ ] **Шаг 2.** Запустить `npm run test` — падает.
- [ ] **Шаг 3.** Реализовать `splitIntoSegments`: набирать элементы в массив, пока сериализованная длина не превысит лимит, затем начинать новый сегмент. Элемент, не влезающий в пустой сегмент, всё равно кладётся в свой (иначе потеря данных).
- [ ] **Шаг 4.** Запустить `npm run test` — проходит.
- [ ] **Шаг 5.** Написать `src/storage/types.ts` с интерфейсом `KeyValueStore` и `src/storage/local.ts` с реализацией поверх `window.localStorage`, оборачивающей синхронные вызовы в `Promise`.

---

### Задача 4. Реализация CloudStorage и выбор хранилища

**Файлы:**
- Создать: `src/storage/cloud.ts`, `src/storage/index.ts`, `src/lib/telegram.ts`

**Потребляет:** `KeyValueStore` из задачи 3.

**Производит:**
- `class CloudStore implements KeyValueStore`
- `createStore(): { store: KeyValueStore; synced: boolean }` — CloudStorage внутри Telegram, иначе localStorage; флаг `synced` говорит, синхронизируются ли данные между устройствами
- `tg()` — типизированный доступ к `window.Telegram?.WebApp`

- [ ] **Шаг 1.** Написать `src/lib/telegram.ts` с типами и функцией `tg()`, возвращающей `window.Telegram?.WebApp` или `undefined`.
- [ ] **Шаг 2.** Написать `src/storage/cloud.ts`: обернуть колбэчные методы `CloudStorage.getItem/setItem/removeItem/getKeys` в промисы.
- [ ] **Шаг 3.** Написать `src/storage/index.ts` с `createStore()`: если `tg()?.CloudStorage` существует — CloudStore и `synced: true`, иначе LocalStore и `synced: false`.
- [ ] **Шаг 4.** Проверить в браузере: `createStore()` возвращает LocalStore, запись и чтение работают.

---

### Задача 4-бис. Версия формата данных и предупреждение о локальном режиме

**Файлы:**
- Создать: `src/storage/meta.ts`
- Изменить: `src/App.vue`

**Потребляет:** `createStore` из задачи 4.

**Производит:**
- `DATA_VERSION = 1`
- `ensureMeta(store: KeyValueStore): Promise<void>` — при первом запуске пишет ключ `meta`, при последующих сверяет версию

- [ ] **Шаг 1.** Написать `src/storage/meta.ts`: читать ключ `meta`, при отсутствии записывать `{ version: DATA_VERSION }`. Если прочитанная версия старше текущей — вызвать цепочку миграций, пока пустую, но с явным местом для их добавления.
- [ ] **Шаг 2.** В `App.vue` вызывать `ensureMeta` при старте, до загрузки отметок.
- [ ] **Шаг 3.** Если `synced` равен `false`, показывать над навигацией неброскую полоску: «данные хранятся только на этом устройстве». Без неё пользователь не отличит рабочую синхронизацию от её отсутствия и однажды потеряет историю, не поняв причины.
- [ ] **Шаг 4.** Проверить в браузере: полоска видна вне Telegram, ключ `meta` появляется в localStorage.

---

### Задача 5. Хранилище отметок и агрегация

**Файлы:**
- Создать: `src/store/entries.ts`, `src/lib/day.ts`, `src/lib/day.test.ts`, `src/lib/stats.ts`, `src/lib/stats.test.ts`

**Потребляет:** `Storage`, `splitIntoSegments`, `pureAlcoholGrams`.

**Производит:**
- `dayKey(ts: number): string` — календарный день с границей 06:00, в формате `YYYY-MM-DD`
- `useEntries()` — реактивный список отметок с методами `add`, `update`, `remove`, `load`
- `monthTotals`, `styleBreakdown`, `heatmap`, `soberDays`, `longestStreak`

- [ ] **Шаг 1.** Написать падающий тест границы суток в `src/lib/day.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { dayKey } from './day'

describe('dayKey', () => {
  it('час ночи относит к предыдущему дню', () => {
    const night = new Date(2026, 7, 15, 1, 30).getTime()
    expect(dayKey(night)).toBe('2026-08-14')
  })

  it('семь утра — уже новый день', () => {
    const morning = new Date(2026, 7, 15, 7, 0).getTime()
    expect(dayKey(morning)).toBe('2026-08-15')
  })

  it('ровно шесть утра — новый день', () => {
    const border = new Date(2026, 7, 15, 6, 0).getTime()
    expect(dayKey(border)).toBe('2026-08-15')
  })
})
```

- [ ] **Шаг 2.** Запустить `npm run test` — падает.
- [ ] **Шаг 3.** Реализовать `dayKey`: вычесть 6 часов из времени, взять календарную дату результата.
- [ ] **Шаг 4.** Запустить `npm run test` — проходит.
- [ ] **Шаг 5.** Написать тесты статистики в `src/lib/stats.test.ts` на трёх заранее заданных отметках: суммарный объём, доли стилей, число трезвых дней в интервале.
- [ ] **Шаг 6.** Реализовать `src/lib/stats.ts`, добиться прохождения тестов.
- [ ] **Шаг 7.** Написать `src/store/entries.ts`: загрузка месяцев по ключам `log_YYYY_MM` со всеми сегментами, добавление отметки с записью в нужный месяц, генерация `id`.

---

### Задача 6. Экран «Отметить»

**Файлы:**
- Создать: `src/views/AddView.vue`, `src/components/ChoiceGrid.vue`, `src/style.css`

**Потребляет:** `useEntries`, `BEER_STYLES`, `VOLUME_PRESETS`.

- [ ] **Шаг 1.** Написать `src/style.css`, где цвета берутся из переменных темы Telegram с запасными значениями: `--tg-theme-bg-color`, `--tg-theme-text-color`, `--tg-theme-button-color`, `--tg-theme-hint-color`.
- [ ] **Шаг 2.** Написать `ChoiceGrid.vue` — сетку кнопок выбора с выделением активной; принимает список опций и текущее значение.
- [ ] **Шаг 3.** Написать `AddView.vue`: ряд объёмов, блок частых стилей, раскрывающийся полный список, кнопка «записать».
- [ ] **Шаг 4.** Реализовать запоминание последнего выбора объёма и стиля в `profile`.
- [ ] **Шаг 5.** Добавить блок «подробнее» с необязательными полями: название, пивоварня, место, оценка, цена, заметка, сдвиг времени назад.
- [ ] **Шаг 6.** Проверить в браузере: отметка добавляется, после перезагрузки страницы остаётся на месте.

---

### Задача 7. Экран «История» и экспорт

**Файлы:**
- Создать: `src/views/HistoryView.vue`, `src/components/EntryRow.vue`, `src/lib/export.ts`

**Потребляет:** `useEntries`, `dayKey`, `pureAlcoholGrams`.

- [ ] **Шаг 1.** Написать `EntryRow.vue`: строка отметки со стилем, объёмом и временем.
- [ ] **Шаг 2.** Написать `HistoryView.vue`: сводка за текущий день и лента, сгруппированная по дням.
- [ ] **Шаг 3.** Добавить правку отметки по тапу и удаление с возможностью отмены в течение нескольких секунд.
- [ ] **Шаг 4.** Написать `src/lib/export.ts`: собрать всю историю в JSON и отдать файл через ссылку с `download`.
- [ ] **Шаг 5.** Проверить в браузере: файл выгружается и содержит все отметки.

---

### Задача 8. Экран «Статистика»

**Файлы:**
- Создать: `src/views/StatsView.vue`, `src/components/Heatmap.vue`, `src/components/StyleBars.vue`, `src/lib/achievements.ts`

**Потребляет:** функции из `src/lib/stats.ts`.

- [ ] **Шаг 1.** Написать `Heatmap.vue`: сетка дней месяца, насыщенность клетки пропорциональна объёму за день, пустая клетка — трезвый день.
- [ ] **Шаг 2.** Написать `StyleBars.vue`: горизонтальные столбики долей по стилям.
- [ ] **Шаг 3.** Написать `src/lib/achievements.ts`: «попробовано N стилей из 21», «за год выпито N ванн», самая длинная трезвая серия, самая длинная серия дней с отметкой.
- [ ] **Шаг 4.** Собрать `StatsView.vue` из карточек итогов, теплокарты, столбиков и ачивок.
- [ ] **Шаг 5.** Проверить на подготовленных данных за два месяца, что цифры сходятся с ручным подсчётом.

---

### Задача 9. Интеграция с Telegram

**Файлы:**
- Изменить: `src/main.ts`, `src/App.vue`

- [ ] **Шаг 1.** При старте вызвать `tg()?.ready()` и `tg()?.expand()`.
- [ ] **Шаг 2.** Подписаться на событие смены темы и обновлять переменные оформления.
- [ ] **Шаг 3.** Собрать нижнюю навигацию из трёх вкладок без роутера — переключением компонента.
- [ ] **Шаг 4.** Проверить в браузере, что приложение работает и вне Telegram, без ошибок в консоли.

---

### Задача 10. Деплой на GitHub Pages

**Файлы:**
- Создать: `.github/workflows/deploy.yml`

- [ ] **Шаг 1.** Написать workflow: на пуш в основную ветку — установка зависимостей, `npm run test`, `npm run build`, публикация каталога `dist` через `actions/deploy-pages`.
- [ ] **Шаг 2.** Владелец репозитория включает Pages в настройках репозитория, источник — GitHub Actions.
- [ ] **Шаг 3.** Владелец пушит ветку; убедиться, что workflow отработал и страница открывается по адресу Pages.
- [ ] **Шаг 4.** Открыть адрес в обычном браузере: приложение работает на localStorage.

---

### Задача 11. Бот и первый запуск в Telegram

- [ ] **Шаг 1.** Владелец создаёт бота в BotFather командой `/newbot`.
- [ ] **Шаг 2.** Командой `/newapp` привязывает адрес Pages как Mini App либо задаёт его кнопкой меню через `/mybots`.
- [ ] **Шаг 3.** Открыть приложение в Telegram на телефоне, добавить отметку.
- [ ] **Шаг 4.** Открыть приложение в Telegram на десктопе и убедиться, что отметка видна — это доказывает, что данные легли в CloudStorage, а не в локальное хранилище.
- [ ] **Шаг 5.** Выгрузить экспорт и проверить его содержимое.
