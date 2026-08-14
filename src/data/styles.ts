export interface BeerStyle {
  code: string
  title: string
  /** Дефолтная крепость, % об. Применяется, если пользователь не указал свою */
  abv: number
}

/**
 * Справочник стилей. Крепость — типичная середина диапазона стиля,
 * пользователь может переопределить её в конкретной отметке.
 */
export const BEER_STYLES: BeerStyle[] = [
  { code: 'lager', title: 'Лагер', abv: 4.5 },
  { code: 'pilsner', title: 'Пилснер', abv: 4.8 },
  { code: 'wheat', title: 'Пшеничное', abv: 5.0 },
  { code: 'unfiltered', title: 'Нефильтрованное', abv: 4.5 },
  { code: 'apa', title: 'APA', abv: 5.5 },
  { code: 'ipa', title: 'IPA', abv: 6.5 },
  { code: 'neipa', title: 'NEIPA', abv: 6.5 },
  { code: 'dipa', title: 'Двойной IPA', abv: 8.0 },
  { code: 'porter', title: 'Портер', abv: 5.5 },
  { code: 'stout', title: 'Стаут', abv: 6.0 },
  { code: 'imperial_stout', title: 'Имперский стаут', abv: 9.0 },
  { code: 'ale', title: 'Эль', abv: 5.0 },
  { code: 'belgian', title: 'Бельгийское', abv: 7.0 },
  { code: 'sour', title: 'Сауэр', abv: 4.5 },
  { code: 'gose', title: 'Гозе', abv: 4.5 },
  { code: 'fruit', title: 'Фруктовое', abv: 5.0 },
  { code: 'bock', title: 'Бок', abv: 6.5 },
  { code: 'dunkel', title: 'Дункель', abv: 5.0 },
  { code: 'barleywine', title: 'Барливайн', abv: 10.0 },
  { code: 'nonalc', title: 'Безалкогольное', abv: 0.5 },
  { code: 'cider', title: 'Сидр', abv: 5.0 },
]

const STYLE_BY_CODE = new Map(BEER_STYLES.map((s) => [s.code, s]))

export function findStyle(code: string): BeerStyle | undefined {
  return STYLE_BY_CODE.get(code)
}

/** Название стиля для показа; неизвестный код не должен ломать историю */
export function styleTitle(code: string): string {
  return STYLE_BY_CODE.get(code)?.title ?? code
}

/** Пресеты объёма в миллилитрах */
export const VOLUME_PRESETS = [330, 500, 1000]
