import type { Entry } from '../types'

export interface ImportResult {
  added: Entry[]
  skipped: number
  broken: number
}

/** Проверяем каждую запись: чужой или битый файл не должен попасть в дневник */
function isEntry(value: unknown): value is Entry {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  return (
    typeof e.id === 'string' &&
    typeof e.ts === 'number' &&
    Number.isFinite(e.ts) &&
    typeof e.ml === 'number' &&
    e.ml > 0 &&
    typeof e.style === 'string'
  )
}

/**
 * Сливает выгрузку с текущей историей, а не заменяет её.
 *
 * Файл мог быть выгружен месяц назад: всё, что записано после, обязано
 * уцелеть. Совпадение по id считается той же самой отметкой и пропускается.
 */
export function mergeImport(existing: Entry[], raw: unknown): ImportResult {
  const payload = raw as { entries?: unknown }
  const incoming = Array.isArray(payload?.entries) ? payload.entries : Array.isArray(raw) ? raw : null

  if (!incoming) {
    throw new Error('в файле нет списка отметок')
  }

  const knownIds = new Set(existing.map((e) => e.id))
  const added: Entry[] = []
  let skipped = 0
  let broken = 0

  for (const item of incoming) {
    if (!isEntry(item)) {
      broken++
      continue
    }
    if (knownIds.has(item.id)) {
      skipped++
      continue
    }
    knownIds.add(item.id)
    added.push(item)
  }

  return { added, skipped, broken }
}

/** Читает файл, выбранный пользователем */
export function readJsonFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)))
      } catch {
        reject(new Error('файл не похож на выгрузку beerlog'))
      }
    }
    reader.onerror = () => reject(new Error('не удалось прочитать файл'))
    reader.readAsText(file)
  })
}
