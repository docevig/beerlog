export interface BeerStyle {
  code: string
  title: string
  /** Дефолтная крепость, % об. Применяется, если пользователь не указал свою */
  abv: number
  /** Цвет по шкале SRM — реальная мера цвета пива у пивоваров, от 2 до 40+ */
  srm: number
}

/**
 * Справочник стилей. Крепость — типичная середина диапазона стиля,
 * пользователь может переопределить её в конкретной отметке.
 * SRM определяет цвет, которым стиль показывается во всём приложении.
 */
export const BEER_STYLES: BeerStyle[] = [
  { code: 'cider', title: 'Сидр', abv: 5.0, srm: 2 },
  { code: 'pilsner', title: 'Пилснер', abv: 4.8, srm: 3 },
  { code: 'nonalc', title: 'Безалкогольное', abv: 0.5, srm: 3 },
  { code: 'lager', title: 'Лагер', abv: 4.5, srm: 4 },
  { code: 'gose', title: 'Гозе', abv: 4.5, srm: 4 },
  { code: 'wheat', title: 'Пшеничное', abv: 5.0, srm: 5 },
  { code: 'sour', title: 'Сауэр', abv: 4.5, srm: 5 },
  { code: 'unfiltered', title: 'Нефильтрованное', abv: 4.5, srm: 6 },
  { code: 'neipa', title: 'NEIPA', abv: 6.5, srm: 7 },
  { code: 'apa', title: 'APA', abv: 5.5, srm: 8 },
  { code: 'ipa', title: 'IPA', abv: 6.5, srm: 9 },
  { code: 'dipa', title: 'Двойной IPA', abv: 8.0, srm: 11 },
  { code: 'ale', title: 'Эль', abv: 5.0, srm: 12 },
  { code: 'fruit', title: 'Фруктовое', abv: 5.0, srm: 13 },
  { code: 'belgian', title: 'Бельгийское', abv: 7.0, srm: 14 },
  { code: 'dunkel', title: 'Дункель', abv: 5.0, srm: 19 },
  { code: 'bock', title: 'Бок', abv: 6.5, srm: 20 },
  { code: 'barleywine', title: 'Барливайн', abv: 10.0, srm: 22 },
  { code: 'porter', title: 'Портер', abv: 5.5, srm: 30 },
  { code: 'stout', title: 'Стаут', abv: 6.0, srm: 35 },
  { code: 'imperial_stout', title: 'Имперский стаут', abv: 9.0, srm: 40 },
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
