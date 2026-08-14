import type { Entry } from '../types'
import { DATA_VERSION } from '../storage/meta'

/**
 * Выгружает историю в файл. Данные живут в чужой инфраструктуре,
 * и путь к их извлечению должен существовать с первого релиза.
 */
export function exportEntries(entries: Entry[]): void {
  const payload = {
    app: 'beerlog',
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    entries,
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `beerlog-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()

  URL.revokeObjectURL(url)
}
