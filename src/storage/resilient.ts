import type { KeyValueStore } from './types'
import { LocalStore } from './local'

/**
 * Сколько ждём облако. Telegram может не вызвать колбэк вовсе, если связь
 * оборвалась в момент запроса, — тогда без предела запись висела бы вечно,
 * а кружка так и осталась бы незаписанной.
 */
const CLOUD_TIMEOUT_MS = 8000

/** Зеркало облачных значений; отдельный префикс, чтобы не путать с обычным локальным хранением */
const MIRROR = 'mirror:'

/** Ключи, которые не доехали до облака и ждут сети */
const PENDING_KEY = 'pending'

/** Ключи, удаление которых не доехало */
const PENDING_REMOVE_KEY = 'pending-remove'

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('облако не ответило')), CLOUD_TIMEOUT_MS)),
  ])
}

/**
 * Облачное хранилище, переживающее плохую связь.
 *
 * Каждая запись сначала ложится в localStorage и только потом уезжает
 * в облако. Если облако недоступно, ключ встаёт в очередь и уедет позже,
 * а до тех пор чтение отдаёт локальную копию — она свежее облачной.
 *
 * Чего этот слой сознательно НЕ делает: не сливает свою версию с чужой.
 * Досылка перезаписывает облачное значение целиком, поэтому кружка,
 * записанная с другого устройства в тот же месяц, пока висела очередь,
 * потеряется. Для личного дневника с одним телефоном это приемлемо,
 * а слияние потребовало бы перекройки сегментов месяца на этом уровне.
 */
export class ResilientStore implements KeyValueStore {
  private readonly mirror = new LocalStore()
  private pending = new Set<string>()
  private pendingRemove = new Set<string>()

  /** Есть ли что-то, не доехавшее до облака — интерфейс показывает это пользователю */
  onPendingChange?: (count: number) => void

  constructor(private readonly cloud: KeyValueStore) {
    this.pending = readSet(PENDING_KEY)
    this.pendingRemove = readSet(PENDING_REMOVE_KEY)
  }

  get pendingCount(): number {
    return this.pending.size + this.pendingRemove.size
  }

  async get(key: string): Promise<string | null> {
    const local = await this.mirror.get(MIRROR + key)

    // Своя версия ещё не уехала — она новее того, что лежит в облаке
    if (this.pending.has(key)) return local
    if (this.pendingRemove.has(key)) return null

    try {
      const value = await withTimeout(this.cloud.get(key))
      if (value !== null) await this.mirror.set(MIRROR + key, value)
      return value
    } catch {
      return local
    }
  }

  async set(key: string, value: string): Promise<void> {
    // Сначала гарантия, потом синхронизация: порядок здесь и есть весь смысл
    await this.mirror.set(MIRROR + key, value)
    this.pendingRemove.delete(key)

    try {
      await withTimeout(this.cloud.set(key, value))
      this.mark(key, false)
    } catch {
      this.mark(key, true)
    }
  }

  async remove(key: string): Promise<void> {
    await this.mirror.remove(MIRROR + key)
    this.pending.delete(key)

    try {
      await withTimeout(this.cloud.remove(key))
      this.markRemoved(key, false)
    } catch {
      this.markRemoved(key, true)
    }
  }

  async keys(): Promise<string[]> {
    const local = (await this.mirror.keys())
      .filter((k) => k.startsWith(MIRROR))
      .map((k) => k.slice(MIRROR.length))

    try {
      const cloud = await withTimeout(this.cloud.keys())
      const merged = new Set([...cloud, ...local])
      for (const key of this.pendingRemove) merged.delete(key)
      return [...merged]
    } catch {
      // Без облака список строим по зеркалу: оно повторяет всё, что писали с этого устройства
      return local
    }
  }

  /**
   * Досылает то, что не уехало. Первая же неудача обрывает круг:
   * если сети нет, остальные попытки только потратят по восемь секунд.
   */
  async flush(): Promise<void> {
    for (const key of [...this.pending]) {
      const value = await this.mirror.get(MIRROR + key)
      if (value === null) {
        this.mark(key, false)
        continue
      }

      try {
        await withTimeout(this.cloud.set(key, value))
        this.mark(key, false)
      } catch {
        return
      }
    }

    for (const key of [...this.pendingRemove]) {
      try {
        await withTimeout(this.cloud.remove(key))
        this.markRemoved(key, false)
      } catch {
        return
      }
    }
  }

  private mark(key: string, waiting: boolean): void {
    if (waiting) this.pending.add(key)
    else this.pending.delete(key)

    writeSet(PENDING_KEY, this.pending)
    this.onPendingChange?.(this.pendingCount)
  }

  private markRemoved(key: string, waiting: boolean): void {
    if (waiting) this.pendingRemove.add(key)
    else this.pendingRemove.delete(key)

    writeSet(PENDING_REMOVE_KEY, this.pendingRemove)
    this.onPendingChange?.(this.pendingCount)
  }
}

/** Очередь переживает закрытие приложения: иначе досылать было бы нечего */
function readSet(name: string): Set<string> {
  try {
    const raw = window.localStorage.getItem('beerlog:' + name)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function writeSet(name: string, value: Set<string>): void {
  try {
    window.localStorage.setItem('beerlog:' + name, JSON.stringify([...value]))
  } catch {
    // Переполненный localStorage не должен ронять запись — она уже в памяти
  }
}
