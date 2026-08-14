import type { KeyValueStore } from './types'

/** Текущая версия формата данных */
export const DATA_VERSION = 1

const META_KEY = 'meta'

interface Meta {
  version: number
}

/**
 * Проверяет версию формата при старте. Пока миграций нет, но точка входа
 * для них должна существовать с первого релиза: иначе первая же смена
 * формата встретит историю, про которую ничего не известно.
 */
export async function ensureMeta(store: KeyValueStore): Promise<void> {
  const raw = await store.get(META_KEY)

  if (!raw) {
    await store.set(META_KEY, JSON.stringify({ version: DATA_VERSION } satisfies Meta))
    return
  }

  let meta: Meta
  try {
    meta = JSON.parse(raw) as Meta
  } catch {
    // Битый meta не повод терять историю: перезаписываем текущей версией
    await store.set(META_KEY, JSON.stringify({ version: DATA_VERSION } satisfies Meta))
    return
  }

  if (meta.version < DATA_VERSION) {
    await migrate(store, meta.version)
    await store.set(META_KEY, JSON.stringify({ version: DATA_VERSION } satisfies Meta))
  }
}

/** Цепочка миграций. Сейчас пуста — версия формата первая */
async function migrate(_store: KeyValueStore, _from: number): Promise<void> {
  return
}
