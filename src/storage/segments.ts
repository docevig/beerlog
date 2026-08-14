/**
 * Режет массив на JSON-строки, ни одна из которых не длиннее лимита.
 *
 * Нужно потому, что значение одного ключа в CloudStorage ограничено
 * 4096 символами, а месяц активной жизни в этот предел может не влезть.
 * Элемент, который не помещается в лимит даже в одиночку, всё равно
 * попадает в собственный сегмент: терять данные хуже, чем нарушить лимит.
 */
export function splitIntoSegments(items: unknown[], limit: number): string[] {
  if (items.length === 0) return ['[]']

  const segments: string[] = []
  let current: unknown[] = []

  for (const item of items) {
    const candidate = [...current, item]
    if (JSON.stringify(candidate).length <= limit) {
      current = candidate
      continue
    }

    // Не влезло: закрываем текущий сегмент и начинаем новый с этого элемента
    if (current.length > 0) {
      segments.push(JSON.stringify(current))
    }
    current = [item]
  }

  segments.push(JSON.stringify(current))
  return segments
}

/** Имя ключа месяца: log_YYYY_MM, второй и следующие сегменты — с суффиксом */
export function monthKey(year: number, month: number, segment = 0): string {
  const mm = String(month).padStart(2, '0')
  const base = `log_${year}_${mm}`
  return segment === 0 ? base : `${base}_${segment + 1}`
}

/** Разбирает имя ключа обратно; возвращает undefined для чужих ключей */
export function parseMonthKey(key: string): { year: number; month: number; segment: number } | undefined {
  const m = /^log_(\d{4})_(\d{2})(?:_(\d+))?$/.exec(key)
  if (!m) return undefined
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    segment: m[3] ? Number(m[3]) - 1 : 0,
  }
}
