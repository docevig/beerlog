/** Больше этого этикетке не нужно: в карточке она размером с ладонь */
const MAX_SIDE = 1000

/** Ниже качество уже заметно на буквах мелким шрифтом */
const QUALITY = 0.82

export interface Compressed {
  blob: Blob
  width: number
  height: number
  /** Во сколько раз ужали — показываем в отчёте загрузки */
  ratio: number
}

/**
 * Сжимает фото до отправки.
 *
 * Снимок с камеры весит 3–5 МБ, и хранилища хватило бы на пару тысяч штук.
 * Сжимать на сервере нельзя — обработка картинок у Cloudflare платная,
 * поэтому уменьшаем прямо на устройстве: заодно экономим трафик.
 */
export async function compressImage(file: File): Promise<Compressed> {
  const bitmap = await createImageBitmap(file)

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('не удалось подготовить изображение')

  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  )

  if (!blob) throw new Error('не удалось сжать изображение')

  return {
    blob,
    width,
    height,
    ratio: file.size > 0 ? Math.round((file.size / blob.size) * 10) / 10 : 1,
  }
}
