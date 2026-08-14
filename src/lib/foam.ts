/** Полный стакан за вечер. Всё сверх этого выливается наружу */
export const FULL_GLASS_ML = 2000

/**
 * Насколько перебрали сверх полного стакана: 0 — ровно по край,
 * 1 — вдвое больше. Дальше не растим, иначе пена съест весь экран.
 *
 * Живёт отдельным модулем, потому что перелив рисует не только стакан:
 * пена доходит до кнопки повтора и стекает уже по ней.
 */
export function overflowRatio(totalMl: number): number {
  if (totalMl <= FULL_GLASS_ML) return 0
  return Math.min(1, (totalMl - FULL_GLASS_ML) / FULL_GLASS_ML)
}
