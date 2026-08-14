import type { Entry } from '../types'

export interface KnownBeer {
  /** Название в том виде, как записали в первый раз */
  name: string
  brewery?: string
  /** Последний использованный стиль — он же подставляется при повторе */
  style: string
  ml: number
  times: number
  lastTs: number
  /** Последняя выставленная оценка, если была */
  rating?: number
  /** Средняя цена по тем записям, где она указана */
  price?: number
}

/** Ключ пива: название без учёта регистра и лишних пробелов */
function key(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Собирает коллекцию попробованного из собственной истории.
 *
 * Внешние каталоги пива для нас бесполезны: там мировой крафт на английском,
 * а местная пивоварня или «Жигулёвское» не найдутся. Свои записи — точнее.
 */
export function buildCatalog(entries: Entry[]): KnownBeer[] {
  const byName = new Map<string, KnownBeer & { priceSum: number; priceCount: number }>()

  for (const entry of entries) {
    if (!entry.name) continue

    const id = key(entry.name)
    const known = byName.get(id)

    if (!known) {
      byName.set(id, {
        name: entry.name.trim(),
        brewery: entry.brewery,
        style: entry.style,
        ml: entry.ml,
        times: 1,
        lastTs: entry.ts,
        rating: entry.rating,
        priceSum: entry.price ?? 0,
        priceCount: entry.price ? 1 : 0,
      })
      continue
    }

    known.times += 1
    if (entry.price) {
      known.priceSum += entry.price
      known.priceCount += 1
    }

    // Свежая запись задаёт стиль, объём и оценку: вкусы и фасовка меняются
    if (entry.ts > known.lastTs) {
      known.lastTs = entry.ts
      known.style = entry.style
      known.ml = entry.ml
      if (entry.brewery) known.brewery = entry.brewery
      if (entry.rating) known.rating = entry.rating
    }
  }

  return [...byName.values()]
    .map(({ priceSum, priceCount, ...beer }) => ({
      ...beer,
      price: priceCount ? Math.round(priceSum / priceCount) : undefined,
    }))
    .sort((a, b) => b.lastTs - a.lastTs)
}

/** Подсказки по началу ввода: сначала совпадение с начала, потом вхождение */
export function suggest(catalog: KnownBeer[], query: string, limit = 5): KnownBeer[] {
  const q = key(query)
  if (!q) return catalog.slice(0, limit)

  const starts: KnownBeer[] = []
  const contains: KnownBeer[] = []

  for (const beer of catalog) {
    const name = key(beer.name)
    if (name.startsWith(q)) starts.push(beer)
    else if (name.includes(q)) contains.push(beer)
  }

  return [...starts, ...contains].slice(0, limit)
}
