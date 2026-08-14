/**
 * Ключ-значение хранилище. Названо KeyValueStore, а не Storage:
 * имя Storage занято встроенным DOM-типом, и совпадение приводит
 * к молчаливой подмене типа.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
  keys(): Promise<string[]>
}

/** Предел длины значения в CloudStorage */
export const VALUE_LIMIT = 4096
