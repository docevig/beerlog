<script setup lang="ts">
import { computed } from 'vue'
import type { Entry } from '../types'
import { srmColor } from '../lib/srm'
import { findStyle } from '../data/styles'
import { formatLitres } from '../lib/format'

const props = defineProps<{ entries: Entry[] }>()

/** Полный стакан — два литра за вечер. Дальше пена лезет через край */
const FULL_ML = 2000

/** Геометрия силуэта пинты в координатах svg */
const W = 92
const H = 136
const TOP_INSET = 4
const BOTTOM_INSET = 13

const totalMl = computed(() => props.entries.reduce((sum, e) => sum + e.ml, 0))
const fillRatio = computed(() => Math.min(1, totalMl.value / FULL_ML))
const overflowing = computed(() => totalMl.value > FULL_ML)

/** Верхняя граница жидкости в координатах svg */
const surfaceY = computed(() => H - fillRatio.value * H)

/**
 * Цвет — смесь всего выпитого за день, взвешенная по объёму.
 * Усредняем градус SRM, а не пиксели: так это работает и в жизни —
 * литр лагера и бокал стаута дают тёмное золото, а не грязь.
 */
const fillColor = computed(() => {
  if (props.entries.length === 0) return 'transparent'

  let weighted = 0
  let volume = 0

  for (const e of props.entries) {
    const srm = findStyle(e.style)?.srm
    if (srm === undefined) continue
    weighted += srm * e.ml
    volume += e.ml
  }

  if (volume === 0) return 'transparent'
  return srmColor(weighted / volume)
})

/**
 * Реплика по числу порций. Тон развлекательный: это дневник-прикол,
 * а не инструмент самоконтроля, поэтому никаких упрёков.
 */
const caption = computed(() => {
  const count = props.entries.length
  if (count === 0) return 'стакан пока пуст'
  if (count === 1) return 'первая пошла'
  if (count === 2) return 'второй заход'
  if (count === 3) return 'уверенный вечер'
  if (count === 4) return 'вечер удался'
  if (count <= 6) return 'завтра будет интересно'
  return 'история этого вечера пишется сама'
})

const silhouette = `M ${TOP_INSET} 0 L ${W - TOP_INSET} 0 L ${W - BOTTOM_INSET} ${H} L ${BOTTOM_INSET} ${H} Z`
</script>

<template>
  <div class="glass-block">
    <!-- Холст с запасом сверху и по бокам: пене и каплям нужно место вне стакана -->
    <svg :viewBox="`-10 -30 ${W + 20} ${H + 40}`" class="glass" role="img" :aria-label="`выпито ${formatLitres(totalMl)}`">
      <defs>
        <clipPath id="glass-shape">
          <path :d="silhouette" />
        </clipPath>
      </defs>

      <!-- Стекло -->
      <path :d="silhouette" class="pane" />

      <g clip-path="url(#glass-shape)">
        <rect x="0" :y="surfaceY" :width="W" :height="H" :fill="fillColor" class="beer" />
        <rect v-if="totalMl > 0" x="0" :y="surfaceY - 5" :width="W" height="7" class="foam" />
      </g>

      <!--
        Перебор: шапка из слипшихся пузырей сидит на кромке, по стенке
        сползают капли. Пузыри вместо эллипса — иначе пена читается
        как парящая над стаканом крышка, а не как пена.
      -->
      <g v-if="overflowing" class="spill">
        <g class="crown">
          <rect :x="TOP_INSET" y="-7" :width="W - TOP_INSET * 2" height="10" rx="4" />
          <circle :cx="TOP_INSET + 10" cy="-6" r="9" />
          <circle :cx="W * 0.36" cy="-11" r="11" />
          <circle :cx="W * 0.62" cy="-9" r="10" />
          <circle :cx="W - TOP_INSET - 11" cy="-5" r="8" />
        </g>
        <circle class="drop" :cx="TOP_INSET + 4" cy="0" r="3.4" />
        <circle class="drop drop-late" :cx="W - TOP_INSET - 5" cy="2" r="2.8" />
      </g>

      <!-- Мерные риски на четверть, половину и три четверти -->
      <line v-for="n in 3" :key="n" :x1="W * 0.62" :x2="W - BOTTOM_INSET - 3" :y1="H - (H * n) / 4" :y2="H - (H * n) / 4" class="tick" />

      <path :d="silhouette" class="outline" />
    </svg>

    <div class="readout">
      <span class="figure amount">{{ formatLitres(totalMl) }}</span>
      <span class="caption">{{ caption }}</span>
      <span v-if="overflowing" class="overflow">через край</span>
    </div>
  </div>
</template>

<style scoped>
.glass-block {
  display: flex;
  align-items: center;
  gap: 18px;
}
.glass {
  width: 104px;
  height: 168px;
  flex: none;
}
.pane {
  fill: var(--surface);
}
.outline {
  fill: none;
  stroke: rgba(242, 231, 213, 0.28);
  stroke-width: 1.5;
}
.beer {
  transition: y 620ms cubic-bezier(0.22, 1, 0.36, 1), fill 320ms ease;
}
.foam {
  fill: #fcf8ee;
  transition: y 620ms cubic-bezier(0.22, 1, 0.36, 1);
}
.tick {
  stroke: rgba(242, 231, 213, 0.18);
  stroke-width: 1;
}
/* Шапка дышит целиком, от кромки стакана, а не сама по себе */
.crown {
  fill: #fcf8ee;
  transform-origin: 50% 100%;
  animation: breathe 3.4s ease-in-out infinite alternate;
}
.drop {
  fill: #fcf8ee;
  opacity: 0;
  animation: slide 4.2s ease-in infinite;
}
.drop-late {
  animation-delay: 2.1s;
}
@keyframes breathe {
  from {
    transform: scaleY(0.94);
  }
  to {
    transform: scaleY(1.06);
  }
}
/* Капля набухает у кромки, сползает по стенке и тает */
@keyframes slide {
  0% {
    transform: translateY(0) scale(0.6);
    opacity: 0;
  }
  12% {
    opacity: 0.9;
    transform: translateY(2px) scale(1);
  }
  70% {
    opacity: 0.75;
    transform: translateY(46px) scale(0.9);
  }
  100% {
    transform: translateY(72px) scale(0.5);
    opacity: 0;
  }
}
.readout {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.amount {
  font-size: 30px;
  color: var(--accent-bright);
}
.caption {
  font-size: 13px;
  color: var(--text-dim);
}
.overflow {
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent);
}
@media (prefers-reduced-motion: reduce) {
  .beer,
  .foam {
    transition: none;
  }
  .crown,
  .drop {
    animation: none;
  }
}
</style>
