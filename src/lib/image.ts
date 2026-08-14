/**
 * Сторона снимка после сжатия. Начали с 600: этикетка в карточке
 * показывается небольшой, а вес падает квадратично со стороной.
 * Если мелкий шрифт на этикетках начнёт плыть — поднимать до 800.
 */
const MAX_SIDE = 600

/** У WebP на этом качестве ещё не видно артефактов на буквах */
const QUALITY = 0.8

export interface Compressed {
  blob: Blob
  width: number
  height: number
  /** Во сколько раз ужали — показываем в отчёте загрузки */
  ratio: number
  /** webp или jpeg: старые устройства webp не кодируют */
  type: string
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY))
}

/**
 * Сжимает фото до отправки.
 *
 * Снимок с камеры весит 3–5 МБ. Сжимать на сервере нельзя — обработка
 * картинок у Cloudflare платная, поэтому уменьшаем прямо на устройстве:
 * заодно экономим трафик пользователя на мобильной сети.
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

  /*
    Просим webp, но проверяем, что его действительно отдали: браузер,
    который не умеет кодировать webp, молча вернёт png — а он тяжелее
    исходного jpeg, и «сжатие» обернулось бы раздуванием.
  */
  let blob = await toBlob(canvas, 'image/webp')
  if (!blob || blob.type !== 'image/webp') {
    blob = await toBlob(canvas, 'image/jpeg')
  }

  if (!blob) throw new Error('не удалось сжать изображение')

  return {
    blob,
    width,
    height,
    ratio: file.size > 0 ? Math.round((file.size / blob.size) * 10) / 10 : 1,
    type: blob.type,
  }
}
