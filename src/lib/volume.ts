/**
 * Разбор поля «своё». Человек вводит то, чем думает: «0,5» — это половина
 * литра, «500» — те же пятьсот миллилитров. Требовать одну форму бесполезно,
 * поэтому берём обе, а запятую принимаем наравне с точкой: на телефонной
 * клавиатуре она и стоит.
 */

/** Ниже этого числа значение читается как литры: кружек по пять миллилитров не бывает */
const LITRES_BELOW = 6

/** Меньше этого объёма запись не имеет смысла — скорее опечатка */
export const MIN_ML = 10

/** Больше десяти литров за раз — тоже опечатка, а не рекорд */
export const MAX_ML = 10_000

export function parseVolume(raw: string | number | undefined | null): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined

  const text = String(raw).trim().replace(',', '.')
  const value = Number.parseFloat(text)

  if (!Number.isFinite(value) || value <= 0) return undefined

  const ml = value < LITRES_BELOW ? Math.round(value * 1000) : Math.round(value)
  if (ml < MIN_ML || ml > MAX_ML) return undefined

  return ml
}

/** Подпись под полем: показывает, как понято введённое */
export function volumeHint(raw: string | number | undefined | null): string {
  const ml = parseVolume(raw)
  if (ml === undefined) return ''
  return ml >= 1000 ? `= ${(ml / 1000).toFixed(2).replace('.', ',')} л` : `= ${ml} мл`
}
