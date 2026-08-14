<script setup lang="ts">
/**
 * Амбиентные пузырьки. Чистый CSS с трансформами: анимация идёт
 * в компоновщике браузера и не заставляет перерисовывать разметку.
 * Живут только на экране отметки, где нет цифр, которые они бы перебивали.
 */
const BUBBLES = [
  { left: 6, size: 7, duration: 13, delay: 0 },
  { left: 17, size: 4, duration: 17, delay: 4 },
  { left: 88, size: 6, duration: 15, delay: 2 },
  { left: 95, size: 4, duration: 19, delay: 8 },
  { left: 78, size: 5, duration: 16, delay: 11 },
  { left: 11, size: 5, duration: 21, delay: 7 },
]
</script>

<template>
  <div class="bubbles" aria-hidden="true">
    <span
      v-for="(b, i) in BUBBLES"
      :key="i"
      :style="{
        left: `${b.left}%`,
        width: `${b.size}px`,
        height: `${b.size}px`,
        animationDuration: `${b.duration}s`,
        animationDelay: `${b.delay}s`,
      }"
    />
  </div>
</template>

<style scoped>
.bubbles {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}
.bubbles span {
  position: absolute;
  bottom: -20px;
  border-radius: 50%;
  background: var(--accent-bright);
  opacity: 0;
  animation-name: float;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform;
}
@keyframes float {
  0% {
    transform: translateY(0);
    opacity: 0;
  }
  12% {
    opacity: 0.22;
  }
  85% {
    opacity: 0.16;
  }
  100% {
    transform: translateY(-100vh);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .bubbles {
    display: none;
  }
}
</style>
