import { ref, onMounted, type Ref } from 'vue'

/** Плавное замедление к концу — число «доезжает», а не тормозит рывком */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Прокручивает число от нуля до целевого значения.
 * При системной настройке «уменьшить движение» сразу отдаёт итог.
 */
export function useCountUp(target: () => number, duration = 700): Ref<number> {
  const value = ref(0)

  onMounted(() => {
    const finish = target()

    // Скрытая страница не выдаёт кадров анимации, и счётчик застыл бы на нуле.
    // Уважаем и системную настройку «уменьшить движение».
    if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      value.value = finish
      return
    }

    let startedAt: number | null = null

    function step(now: number) {
      if (startedAt === null) startedAt = now
      const progress = Math.min(1, (now - startedAt) / duration)
      value.value = finish * easeOut(progress)
      if (progress < 1) requestAnimationFrame(step)
      else value.value = finish
    }

    requestAnimationFrame(step)
  })

  return value
}
