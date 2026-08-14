import type { KeyValueStore } from './types'
import { LocalStore } from './local'
import { CloudStore } from './cloud'
import { ResilientStore } from './resilient'
import { tg, isVersionAtLeast, CLOUD_STORAGE_SINCE } from '../lib/telegram'

export interface StoreHandle {
  store: KeyValueStore
  /** Синхронизируются ли данные между устройствами пользователя */
  synced: boolean
  /** Есть только у облачного: досылает то, что не уехало без сети */
  resilient?: ResilientStore
}

/**
 * Выбирает хранилище один раз при старте: внутри Telegram — облачное,
 * иначе локальное. Флаг synced нужен интерфейсу, чтобы честно предупредить
 * пользователя, что история никуда не уедет с этого устройства.
 *
 * Облачное заворачивается в устойчивую обёртку: в баре связь пропадает
 * ровно тогда, когда её ждут, а кружка должна записаться при любой сети.
 */
export function createStore(): StoreHandle {
  const api = tg()?.CloudStorage

  // Одного наличия объекта мало: вне Telegram скрипт отдаёт заглушку версии 6.0,
  // где CloudStorage есть, но каждый вызов падает с WebAppMethodUnsupported
  if (api && isVersionAtLeast(CLOUD_STORAGE_SINCE)) {
    const resilient = new ResilientStore(new CloudStore(api))
    return { store: resilient, synced: true, resilient }
  }

  return { store: new LocalStore(), synced: false }
}

export type { KeyValueStore }
export { ResilientStore }
