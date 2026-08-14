import { ref } from 'vue'

/**
 * Общее состояние навигации между вкладками. Нужно, чтобы клик по дню
 * в календаре умел перебросить пользователя в историю к этой дате.
 */
const focusDay = ref<string | null>(null)

export function useUi() {
  function goToDay(day: string) {
    focusDay.value = day
  }

  /** История забирает цель один раз и сбрасывает, иначе она сработает снова */
  function takeFocusDay(): string | null {
    const day = focusDay.value
    focusDay.value = null
    return day
  }

  return { focusDay, goToDay, takeFocusDay }
}
