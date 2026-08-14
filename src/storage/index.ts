import type { KeyValueStore } from './types'
import { LocalStore } from './local'
import { CloudStore } from './cloud'
import { tg, isVersionAtLeast, CLOUD_STORAGE_SINCE } from '../lib/telegram'

export interface StoreHandle {
  store: KeyValueStore
  /** Синхронизируются ли данные между устройствами пользователя */
  synced: boolean
}

/**
 * Выбирает хранилище один раз при старте: внутри Telegram — облачное,
 * иначе локальное. Флаг synced нужен интерфейсу, чтобы честно предупредить
 * пользователя, что история никуда не уедет с этого устройства.
 */
export function createStore(): StoreHandle {
  const api = tg()?.CloudStorage

  // Одного наличия объекта мало: вне Telegram скрипт отдаёт заглушку версии 6.0,
  // где CloudStorage есть, но каждый вызов падает с WebAppMethodUnsupported
  if (api && isVersionAtLeast(CLOUD_STORAGE_SINCE)) {
    return { store: new CloudStore(api), synced: true }
  }

  return { store: new LocalStore(), synced: false }
}

export type { KeyValueStore }
