import { ref } from 'vue'
import { apiAvailable, listPhotos, retagPhoto, deletePhoto } from '../lib/api'

/**
 * Снимки этикеток: ключ пива в нижнем регистре → идентификатор файла.
 * Список общий для всех экранов, где снимают этикетку: иначе каждая форма
 * спрашивала бы сервер об одном и том же при первом открытии.
 */
const photos = ref<Record<string, string>>({})

/** Список уже спрашивали — второй раз не идём */
let asked = false

/** Ключ пива: снимок принадлежит названию, а не отдельной кружке */
function keyOf(name: string): string {
  return name.trim().toLowerCase()
}

export function usePhotos() {
  async function load(): Promise<void> {
    if (asked || !apiAvailable()) return
    asked = true

    try {
      const { photos: known } = await listPhotos()

      // Первый снимок пива — самый свежий: список приходит отсортированным
      const map: Record<string, string> = {}
      for (const p of known) if (!map[p.beer_key]) map[p.beer_key] = p.file_id
      photos.value = map
    } catch {
      // Без снимков экраны остаются рабочими; попробуем ещё раз при следующем открытии
      asked = false
    }
  }

  function photoOf(name: string): string | null {
    return photos.value[keyOf(name)] ?? null
  }

  function remember(name: string, fileId: string): void {
    photos.value = { ...photos.value, [keyOf(name)]: fileId }
  }

  function forget(name: string): void {
    const next = { ...photos.value }
    delete next[keyOf(name)]
    photos.value = next
  }

  /**
   * Переносит снимок на новое название — вслед за исправлением в записи.
   * Ошибку глотаем: правка уже сохранена, и ронять её из-за этикетки незачем.
   */
  async function rename(from: string, to: string): Promise<void> {
    const fileId = photoOf(from)
    if (!fileId || keyOf(from) === keyOf(to)) return

    forget(from)
    remember(to, fileId)

    try {
      await retagPhoto(fileId, keyOf(to))
    } catch {
      // Останется на старом названии до следующей правки
    }
  }

  /** Убирает снимок вместе с последней записью пива */
  async function drop(name: string): Promise<void> {
    const fileId = photoOf(name)
    if (!fileId) return

    forget(name)

    try {
      await deletePhoto(fileId)
    } catch {
      // Молча: в базе останется недостижимая строка, экрану это не мешает
    }
  }

  return { load, photoOf, remember, forget, rename, drop }
}
