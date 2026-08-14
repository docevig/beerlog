import type { KeyValueStore } from './types'
import type { TgCloudStorage } from '../lib/telegram'

/**
 * Хранилище поверх Telegram CloudStorage. Данные привязаны к паре
 * «пользователь + бот», синхронизируются между устройствами
 * и переживают переустановку клиента.
 */
export class CloudStore implements KeyValueStore {
  constructor(private readonly api: TgCloudStorage) {}

  get(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      this.api.getItem(key, (err, value) => {
        if (err) reject(new Error(err))
        // Отсутствующий ключ приходит пустой строкой, а не null
        else resolve(value ? value : null)
      })
    })
  }

  set(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.api.setItem(key, value, (err) => {
        if (err) reject(new Error(err))
        else resolve()
      })
    })
  }

  remove(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.api.removeItem(key, (err) => {
        if (err) reject(new Error(err))
        else resolve()
      })
    })
  }

  keys(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.api.getKeys((err, keys) => {
        if (err) reject(new Error(err))
        else resolve(keys ?? [])
      })
    })
  }
}
