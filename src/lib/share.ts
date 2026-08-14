import type { Entry } from '../types'
import { totalMl, distinctStyles, entryAbv } from './stats'
import { BEER_STYLES, findStyle, styleTitle } from '../data/styles'
import { formatLitres, withPlural } from './format'

const APP_URL = 'https://t.me/beerlogs_bot/app'

const MONTHS_IN = [
  'январе', 'феврале', 'марте', 'апреле', 'мае', 'июне',
  'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре',
]

/**
 * Текст итогов для отправки в чат. Картинку так не отправить:
 * shareMessage требует подготовки сообщения ботом, то есть сервера.
 * Текстовая ссылка работает без бэкенда и уже сейчас.
 */
export function monthSummaryText(entries: Entry[], month: number): string {
  if (entries.length === 0) return `в ${MONTHS_IN[month - 1]} пока ни одной кружки`

  const litres = formatLitres(totalMl(entries))
  const portions = withPlural(entries.length, 'порция', 'порции', 'порций')
  const styles = distinctStyles(entries)

  // Самый тёмный стиль месяца — самая говорящая деталь после объёма
  let darkest = entries[0].style
  let darkestSrm = -1
  for (const e of entries) {
    const srm = findStyle(e.style)?.srm ?? 0
    if (srm > darkestSrm) {
      darkestSrm = srm
      darkest = e.style
    }
  }

  const strongest = entries.reduce((best, e) => (entryAbv(e) > entryAbv(best) ? e : best), entries[0])

  // «в августе», а не «мой августе»: список месяцев в предложном падеже
  return [
    `в ${MONTHS_IN[month - 1]}: ${litres}, ${portions}`,
    `стилей попробовано: ${styles} из ${BEER_STYLES.length}`,
    `самое тёмное — ${styleTitle(darkest).toLowerCase()}, самое крепкое — ${entryAbv(strongest).toString().replace('.', ',')}%`,
  ].join('\n')
}

/** Ссылка стандартного диалога «поделиться» в Telegram */
export function shareUrl(text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(APP_URL)}&text=${encodeURIComponent(text)}`
}
