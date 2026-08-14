<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Entry } from '../types'
import { buildCatalog } from '../lib/catalog'
import { styleTitle } from '../data/styles'
import { styleColor, textOn } from '../lib/srm'
import { formatDay, withPlural } from '../lib/format'
import { dayKey } from '../lib/day'

const props = defineProps<{ entries: Entry[] }>()

type Order = 'recent' | 'often' | 'rating'

const order = ref<Order>('recent')

const beers = computed(() => {
  const list = buildCatalog(props.entries)

  if (order.value === 'often') return [...list].sort((a, b) => b.times - a.times)
  if (order.value === 'rating') {
    // Без оценки — в конец: иначе неоценённое перемешается с плохим
    return [...list].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
  }
  return list
})
</script>

<template>
  <div v-if="beers.length" class="my-beers">
    <div class="head">
      <div class="eyebrow">мои сорта · {{ beers.length }}</div>
      <div class="switch">
        <button type="button" :class="{ on: order === 'recent' }" @click="order = 'recent'">свежие</button>
        <button type="button" :class="{ on: order === 'often' }" @click="order = 'often'">частые</button>
        <button type="button" :class="{ on: order === 'rating' }" @click="order = 'rating'">по оценке</button>
      </div>
    </div>

    <div v-for="beer in beers" :key="beer.name" class="beer">
      <span class="chip" :style="{ background: styleColor(beer.style), color: textOn(beer.style) }">
        {{ styleTitle(beer.style) }}
      </span>
      <span class="body">
        <span class="name">{{ beer.name }}</span>
        <span class="meta">
          <template v-if="beer.brewery">{{ beer.brewery }} · </template>
          {{ withPlural(beer.times, 'раз', 'раза', 'раз') }} ·
          {{ formatDay(dayKey(beer.lastTs)) }}
          <template v-if="beer.price"> · {{ beer.price }} ₽</template>
        </span>
      </span>
      <span v-if="beer.rating" class="rating">{{ beer.rating }}/5</span>
    </div>
  </div>

  <p v-else class="empty">
    сорта появятся, когда начнёшь записывать названия — в отметке они под «добавить подробности»
  </p>
</template>

<style scoped>
.my-beers {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.switch {
  display: flex;
  gap: 3px;
}
.switch button {
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: none;
  color: var(--text-faint);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.switch button.on {
  border-color: var(--accent);
  color: var(--accent-bright);
}
.beer {
  display: flex;
  align-items: center;
  gap: 9px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}
.chip {
  flex: none;
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 11px;
}
.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  font-size: 11px;
  color: var(--text-faint);
}
.rating {
  font-size: 13px;
  color: var(--accent-bright);
  font-variant-numeric: tabular-nums;
}
.empty {
  margin: 0;
  font-size: 13px;
  color: var(--text-faint);
}
</style>
