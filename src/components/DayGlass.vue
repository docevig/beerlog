<script setup lang="ts">
import { computed } from 'vue'
import type { Entry } from '../types'
import { srmColor } from '../lib/srm'
import { findStyle } from '../data/styles'
import { formatLitres } from '../lib/format'
import { FULL_GLASS_ML, overflowRatio as overflowRatioOf } from '../lib/foam'

const props = defineProps<{ entries: Entry[] }>()

/** Геометрия силуэта пинты в координатах svg */
const W = 92
const H = 136
const TOP_INSET = 4
const BOTTOM_INSET = 13

const totalMl = computed(() => props.entries.reduce((sum, e) => sum + e.ml, 0))
const fillRatio = computed(() => Math.min(1, totalMl.value / FULL_GLASS_ML))
const overflowing = computed(() => totalMl.value > FULL_GLASS_ML)
const overflowRatio = computed(() => overflowRatioOf(totalMl.value))

/**
 * Шапка поднимается над кромкой, но почти не расползается вбок:
 * заметный вынос за стенки превращает пену в шарик мороженого.
 */
const crownHeight = computed(() => 8 + overflowRatio.value * 13)
const crownSpread = computed(() => overflowRatio.value * 3.5)

/**
 * Стакан сужается книзу, поэтому потёк не может идти отвесно —
 * он обязан повторять наклон стенки, иначе висит сосулькой рядом.
 * Коэффициент показывает, насколько сжата ширина на глубине y.
 */
function narrowing(y: number): number {
  const halfTop = W / 2 - TOP_INSET
  const halfAt = halfTop - (BOTTOM_INSET - TOP_INSET) * (y / H)
  return halfAt / halfTop
}

/** Точка на глубине y для потёка, начавшегося в x0 на кромке */
function alongWall(x0: number, y: number): number {
  return W / 2 + (x0 - W / 2) * narrowing(y)
}

/** Потёки: позиция на кромке, длина и толщина. Длина растёт с переливом */
const drips = computed(() => {
  const r = overflowRatio.value
  if (r <= 0) return []

  const spots = [
    { x: TOP_INSET + 3, factor: 1, width: 6 },
    { x: W * 0.3, factor: 0.55, width: 4.5 },
    { x: W * 0.68, factor: 0.75, width: 5 },
    { x: W - TOP_INSET - 4, factor: 0.9, width: 5.5 },
    { x: W * 0.48, factor: 0.35, width: 4 },
  ]

  return spots
    .map((s) => {
      const length = r * 62 * s.factor
      return {
        d: `M ${s.x} 0 L ${alongWall(s.x, length)} ${length}`,
        width: s.width,
        length,
        tipX: alongWall(s.x, length),
      }
    })
    .filter((d) => d.length > 5)
})

/** Пузыри шапки: чем больше перелив, тем крупнее и шире расставлены */
const crownBubbles = computed(() => {
  const left = TOP_INSET - crownSpread.value
  const right = W - TOP_INSET + crownSpread.value
  const span = right - left
  const base = crownHeight.value

  // Крайние пузыри мельче и подобраны внутрь, чтобы силуэт держал ширину стакана
  return [
    { cx: left + span * 0.11, r: base * 0.34 },
    { cx: left + span * 0.32, r: base * 0.46 },
    { cx: left + span * 0.53, r: base * 0.5 },
    { cx: left + span * 0.73, r: base * 0.44 },
    { cx: left + span * 0.9, r: base * 0.33 },
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
        <!-- Потёки идут вдоль наклонной стенки, а не отвесно рядом с ней -->
        <path
          v-for="(d, i) in drips"
          :key="i"
          class="drip"
          :d="d.d"
          :stroke-width="d.width"
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

        <!-- Капля срывается с кончика самого длинного потёка -->
        <circle
          v-if="drips.length"
          class="drop"
          :cx="drips[0].tipX"
          :cy="drips[0].length"
          :r="drips[0].width / 2"
        />
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
.crown {
  fill: #fcf8ee;
  transition: all 620ms cubic-bezier(0.22, 1, 0.36, 1);
}
.drip {
  stroke: #fcf8ee;
  stroke-linecap: round;
  fill: none;
  transition: d 620ms cubic-bezier(0.22, 1, 0.36, 1);
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
