<script setup lang="ts">
import { computed } from 'vue';
import { HOME_INTERIOR_HEIGHT, HOME_INTERIOR_WIDTH } from '../core/village/home-interior';
import type { HomeInterior } from '../core/village/home-interior';

interface Resident {
  id: string;
  name: string;
  thumb?: string;
}

const props = defineProps<{
  interior: HomeInterior;
  residents: Resident[];
  editable: boolean;
  itemName: (id: string) => string;
  icon: (id: string) => string;
}>();

const emit = defineEmits<{
  cell: [position: { x: number; y: number }];
  exit: [];
}>();

const cells = computed(() => Array.from({ length: HOME_INTERIOR_WIDTH * HOME_INTERIOR_HEIGHT }, (_, index) => ({
  x: index % HOME_INTERIOR_WIDTH,
  y: Math.floor(index / HOME_INTERIOR_WIDTH),
})));

function itemAt(x: number, y: number): string | undefined {
  return props.interior.placed.find((entry) => entry.x === x && entry.y === y)?.item;
}

function isWall(x: number, y: number): boolean {
  return y === 0 || x === 0 || x === HOME_INTERIOR_WIDTH - 1;
}

function isDoor(x: number, y: number): boolean {
  return x === Math.floor(HOME_INTERIOR_WIDTH / 2) && y === HOME_INTERIOR_HEIGHT - 1;
}
</script>

<template>
  <section class="home-interior-map" aria-label="Mapa interno da casa">
    <div class="home-map-header">
      <span class="home-map-label">INTERIOR · MAPA DA CASA</span>
      <span class="home-map-residents">{{ residents.map((resident) => resident.name).join(' e ') }}</span>
    </div>
    <div class="home-map-grid" :style="{ '--home-cols': HOME_INTERIOR_WIDTH }">
      <div
        v-for="cell in cells"
        :key="`${cell.x}-${cell.y}`"
        class="home-map-cell"
        :class="{ 'is-wall': isWall(cell.x, cell.y), 'is-door': isDoor(cell.x, cell.y), 'has-item': !!itemAt(cell.x, cell.y) }"
      >
        <button
          v-if="isDoor(cell.x, cell.y)"
          type="button"
          class="home-map-door"
          aria-label="Sair pela porta e voltar para a frente da casa"
          @click="emit('exit')"
        >
          <span aria-hidden="true">🚪</span>
          <small>SAÍDA</small>
        </button>
        <button
          v-else-if="itemAt(cell.x, cell.y)"
          type="button"
          class="home-map-item"
          :disabled="!editable"
          :aria-label="editable ? `Guardar ${itemName(itemAt(cell.x, cell.y) ?? '')}` : itemName(itemAt(cell.x, cell.y) ?? '')"
          @click="emit('cell', cell)"
        >
          <img :src="icon(itemAt(cell.x, cell.y) ?? '')" :alt="itemName(itemAt(cell.x, cell.y) ?? '')" />
          <small>{{ itemName(itemAt(cell.x, cell.y) ?? '') }}</small>
        </button>
        <button
          v-else-if="editable && !isWall(cell.x, cell.y)"
          type="button"
          class="home-map-empty"
          aria-label="Espaço vazio para colocar um móvel"
          @click="emit('cell', cell)"
        >
          <span aria-hidden="true">·</span>
        </button>
        <span v-else class="home-map-floor" aria-hidden="true"></span>
      </div>
    </div>
    <div class="home-map-footer">
      <span>Os móveis seguem a rotina e a personalidade de quem mora aqui.</span>
      <button type="button" class="home-map-exit" @click="emit('exit')">↩ Voltar para a frente da casa</button>
    </div>
  </section>
</template>

<style scoped>
.home-interior-map { display: grid; gap: .45rem; }
.home-map-header, .home-map-footer { display: flex; align-items: center; justify-content: space-between; gap: .6rem; flex-wrap: wrap; }
.home-map-label { color: #8fd4ff; font-size: .67rem; font-weight: 800; letter-spacing: .1em; }
.home-map-residents { color: var(--muted); font-size: .82rem; }
.home-map-grid {
  --home-cols: 7;
  display: grid;
  grid-template-columns: repeat(var(--home-cols), minmax(0, 1fr));
  aspect-ratio: 7 / 5;
  overflow: hidden;
  border: 10px solid #5a392b;
  border-radius: 12px;
  background:
    linear-gradient(90deg, rgb(255 255 255 / .06) 1px, transparent 1px),
    linear-gradient(0deg, rgb(255 255 255 / .04) 1px, transparent 1px),
    #bd8654;
  box-shadow: inset 0 0 0 3px #e5be7d, inset 0 -16px 20px rgb(47 25 17 / .25), 0 8px 20px rgb(0 0 0 / .28);
}
.home-map-cell { position: relative; min-width: 0; min-height: 0; border: 1px solid rgb(77 45 31 / .2); }
.home-map-cell.is-wall { background: linear-gradient(135deg, #a96b46, #d09a62 52%, #875139); box-shadow: inset 0 -5px 0 rgb(70 35 25 / .26); }
.home-map-cell.is-door { background: #9a6648; }
.home-map-floor { display: block; width: 100%; height: 100%; background: rgb(236 196 132 / .14); }
.home-map-item, .home-map-empty, .home-map-door { display: grid; place-items: center; width: 100%; height: 100%; padding: .15rem; border: 0; background: transparent; color: #fff4d6; cursor: pointer; }
.home-map-item:not(:disabled):hover, .home-map-empty:hover, .home-map-door:hover { background: rgb(255 241 184 / .2); }
.home-map-item:disabled { cursor: default; }
.home-map-item img { width: min(80%, 42px); height: min(80%, 42px); object-fit: contain; image-rendering: pixelated; filter: drop-shadow(0 2px 1px rgb(46 22 12 / .45)); }
.home-map-item small { position: absolute; right: 2px; bottom: 1px; left: 2px; overflow: hidden; color: #fff8e6; font-size: .48rem; line-height: 1.05; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 2px #3d1d10; }
.home-map-empty { color: rgb(255 241 184 / .7); font-size: 1.1rem; }
.home-map-door { gap: .05rem; color: #ffe4a7; font-size: 1.25rem; }
.home-map-door small { font-size: .48rem; font-weight: 800; letter-spacing: .05em; }
.home-map-footer { color: var(--muted); font-size: .75rem; }
.home-map-exit { border: 1px solid #d9ae6b; border-radius: .55rem; background: #51362d; color: #ffe9ba; padding: .42rem .65rem; font: inherit; font-weight: 700; }
@media (max-width: 480px) {
  .home-map-footer { align-items: stretch; flex-direction: column; }
  .home-map-exit { width: 100%; }
}
</style>
