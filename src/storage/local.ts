import type { KeyValueStore } from './types'

/** Префикс, чтобы не конфликтовать с чужими ключами на том же домене */
const PREFIX = 'beerlog:'

/**
 * Хранилище поверх localStorage. Используется вне Telegram: при разработке
 * и в клиентах старее Bot API 6.9, где CloudStorage отсутствует.
 */
export class LocalStore implements KeyValueStore {
  async get(key: string): Promise<string | null> {
    return window.localStorage.getItem(PREFIX + key)
  }

  async set(key: string, value: string): Promise<void> {
    window.localStorage.setItem(PREFIX + key, value)
  }

  async remove(key: string): Promise<void> {
    window.localStorage.removeItem(PREFIX + key)
  }

  async keys(): Promise<string[]> {
    const result: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const raw = window.localStorage.key(i)
      if (raw && raw.startsWith(PREFIX)) {
        result.push(raw.slice(PREFIX.length))
      }
    }
    return result
  }
}
