/** Литры с запятой: 330 → «0,33 л» */
export function formatLitres(ml: number): string {
  return String(Math.round(ml) / 1000).replace('.', ',') + ' л'
}

/** Объём одной порции в подписи строки: 500 → «0,5» */
export function formatPortion(ml: number): string {
  return String(Math.round(ml) / 1000).replace('.', ',')
}

/** Время отметки: «21:40» */
export function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

/** День для заголовка группы: «14 августа» */
export function formatDay(day: string): string {
  const [, m, d] = day.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

/** Граммы спирта без лишней точности */
export function formatGrams(g: number): string {
  return `${Math.round(g)} г`
}

/** Крепость с десятичной запятой: 4.5 → «4,5%» */
export function formatAbv(abv: number): string {
  return String(abv).replace('.', ',') + '%'
}

/**
 * Русское склонение по числу: plural(1, 'порция', 'порции', 'порций').
 * Без него интерфейс выдаёт «1 порций», что сразу читается как небрежность.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10

  if (abs > 10 && abs < 20) return many
  if (last > 1 && last < 5) return few
  if (last === 1) return one
  return many
}

/** Число вместе со склонённым словом: «3 порции» */
export function withPlural(n: number, one: string, few: string, many: string): string {
  return `${n} ${plural(n, one, few, many)}`
}
