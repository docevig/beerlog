/** Плотность этанола, г/мл */
const ETHANOL_DENSITY = 0.789

/** Граммы чистого спирта в порции заданного объёма и крепости */
export function pureAlcoholGrams(ml: number, abv: number): number {
  return ml * (abv / 100) * ETHANOL_DENSITY
}

/** Литры из миллилитров, округлённые до одного знака */
export function toLitres(ml: number): number {
  return Math.round(ml / 100) / 10
}
