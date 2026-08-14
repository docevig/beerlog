import { describe, it, expect, beforeEach } from 'vitest'
import { ResilientStore } from './resilient'
import type { KeyValueStore } from './types'

/**
 * Тесты идут без браузера, а хранилищу нужен localStorage. Своя заглушка
 * на десять строк дешевле, чем тащить в проект целый jsdom ради неё одной.
 */
const memory = new Map<string, string>()

const fakeStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
  key: (i: number) => [...memory.keys()][i] ?? null,
  get length() {
    return memory.size
  },
}

;(globalThis as unknown as { window: unknown }).window = { localStorage: fakeStorage }

/** Облако, которое можно «отключить» — как связь в подвальном баре */
class FlakyCloud implements KeyValueStore {
  data = new Map<string, string>()
  online = true

  async get(key: string): Promise<string | null> {
    if (!this.online) throw new Error('нет сети')
    return this.data.get(key) ?? null
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.online) throw new Error('нет сети')
    this.data.set(key, value)
  }

  async remove(key: string): Promise<void> {
    if (!this.online) throw new Error('нет сети')
    this.data.delete(key)
  }

  async keys(): Promise<string[]> {
    if (!this.online) throw new Error('нет сети')
    return [...this.data.keys()]
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('ResilientStore', () => {
  it('сохраняет кружку без сети и отдаёт её при чтении', async () => {
    const cloud = new FlakyCloud()
    const store = new ResilientStore(cloud)

    cloud.online = false
    await store.set('log_2026_08', '[{"id":"a"}]')

    expect(await store.get('log_2026_08')).toBe('[{"id":"a"}]')
    expect(store.pendingCount).toBe(1)
  })

  it('досылает отложенное, когда связь вернулась', async () => {
    const cloud = new FlakyCloud()
    const store = new ResilientStore(cloud)

    cloud.online = false
    await store.set('log_2026_08', '[{"id":"a"}]')

    cloud.online = true
    await store.flush()

    expect(cloud.data.get('log_2026_08')).toBe('[{"id":"a"}]')
    expect(store.pendingCount).toBe(0)
  })

  it('предпочитает свою версию облачной, пока та не уехала', async () => {
    const cloud = new FlakyCloud()
    cloud.data.set('profile', '{"lastMl":330}')

    const store = new ResilientStore(cloud)
    cloud.online = false
    await store.set('profile', '{"lastMl":500}')

    cloud.online = true
    // Облако всё ещё отдаёт старое, но своё изменение важнее
    expect(await store.get('profile')).toBe('{"lastMl":500}')
  })

  it('переживает перезапуск: очередь лежит рядом с данными', async () => {
    const cloud = new FlakyCloud()
    cloud.online = false

    const first = new ResilientStore(cloud)
    await first.set('log_2026_08', '[{"id":"a"}]')

    // Приложение закрыли и открыли заново — объект новый, очередь та же
    const second = new ResilientStore(cloud)
    expect(second.pendingCount).toBe(1)

    cloud.online = true
    await second.flush()
    expect(cloud.data.get('log_2026_08')).toBe('[{"id":"a"}]')
  })

  it('без облака перечисляет ключи по локальному зеркалу', async () => {
    const cloud = new FlakyCloud()
    const store = new ResilientStore(cloud)

    await store.set('log_2026_08', '[]')
    cloud.online = false

    expect(await store.keys()).toEqual(['log_2026_08'])
  })

  it('удаление тоже дожидается сети', async () => {
    const cloud = new FlakyCloud()
    const store = new ResilientStore(cloud)
    await store.set('log_2026_08_1', '[]')

    cloud.online = false
    await store.remove('log_2026_08_1')

    // Удалённого ключа не видно сразу, хотя в облаке он ещё есть
    expect(await store.get('log_2026_08_1')).toBeNull()

    cloud.online = true
    await store.flush()
    expect(cloud.data.has('log_2026_08_1')).toBe(false)
  })
})
