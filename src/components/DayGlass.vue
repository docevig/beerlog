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

/**
 * Насколько перебрали сверх полного стакана: 0 — ровно по край,
 * 1 — вдвое больше. Дальше не растим, иначе пена съест весь экран.
 */
const overflowRatio = computed(() => {
  if (totalMl.value <= FULL_ML) return 0
  return Math.min(1, (totalMl.value - FULL_ML) / FULL_ML)
})

/** Шапка поднимается, расползается вширь и свешивается по стенкам */
const crownHeight = computed(() => 9 + overflowRatio.value * 17)
const crownSpread = computed(() => overflowRatio.value * 11)
const tongueLength = computed(() => overflowRatio.value * 52)

/** Пузыри шапки: чем больше перелив, тем крупнее и шире расставлены */
const crownBubbles = computed(() => {
  const left = TOP_INSET - crownSpread.value
  const right = W - TOP_INSET + crownSpread.value
  const span = right - left
  const base = crownHeight.value

  return [
    { cx: left + span * 0.1, r: base * 0.42 },
    { cx: left + span * 0.3, r: base * 0.58 },
    { cx: left + span * 0.52, r: base * 0.64 },
    { cx: left + span * 0.73, r: base * 0.55 },
    { cx: left + span * 0.91, r: base * 0.4 },
  ]
})

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
        <!-- Языки пены сползают по внешним стенкам, удлиняясь с перебором -->
        <path
          v-if="tongueLength > 4"
          class="tongue"
          :d="`M ${TOP_INSET - crownSpread + 2} 0 q -2 ${tongueLength * 0.6} 2 ${tongueLength} q 4 -${tongueLength * 0.5} 5 -${tongueLength}`"
        />
        <path
          v-if="tongueLength > 12"
          class="tongue"
          :d="`M ${W - TOP_INSET + crownSpread - 6} 0 q 1 ${tongueLength * 0.5} -2 ${tongueLength * 0.8} q 5 -${tongueLength * 0.4} 4 -${tongueLength * 0.8}`"
        />

        <g class="crown">
          <rect
            :x="TOP_INSET - crownSpread"
            :y="-crownHeight * 0.5"
            :width="W - TOP_INSET * 2 + crownSpread * 2"
            :height="crownHeight * 0.5 + 4"
            rx="4"
          />
          <circle v-for="(b, i) in crownBubbles" :key="i" :cx="b.cx" :cy="-crownHeight * 0.55" :r="b.r" />
        </g>

        <circle class="drop" :cx="TOP_INSET - crownSpread + 4" :cy="tongueLength" r="3.2" />
        <circle class="drop drop-late" :cx="W - TOP_INSET + crownSpread - 5" :cy="tongueLength * 0.8" r="2.6" />
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
/*
  Шапка не пульсирует: её размер — это показание, а не украшение.
  Двигается только то, что и в жизни движется, — стекающие капли.
*/
.crown,
.tongue {
  fill: #fcf8ee;
  transition: all 620ms cubic-bezier(0.22, 1, 0.36, 1);
}
.drop {
  fill: #fcf8ee;
  opacity: 0;
  animation: slide 4.2s ease-in infinite;
}
.drop-late {
  animation-delay: 2.1s;
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
