<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { HOME_INTERIOR_HEIGHT, HOME_INTERIOR_WIDTH } from '../core/village/home-interior';
import type { HomeInterior } from '../core/village/home-interior';
import { furniturePurpose, furnitureZone, isHomeEntrance, ROOM_ZONE_NAMES } from '../core/village/home-layout';

interface Resident { id: string; name: string; thumb?: string }
const props = defineProps<{
  interior: HomeInterior;
  residents: Resident[];
  editable: boolean;
  selectedItem?: string | null;
  itemName: (id: string) => string;
  icon: (id: string) => string;
}>();
const emit = defineEmits<{ cell: [position: { x: number; y: number }]; exit: [] }>();
const editing = ref(false);
const inspected = ref<string | null>(null);
watch(() => props.selectedItem, (item) => { if (item) editing.value = true; });
const cells = computed(() => {
  const items = new Map(props.interior.placed.map((p) => [`${p.x},${p.y}`, p.item]));
  return Array.from({ length: HOME_INTERIOR_WIDTH * HOME_INTERIOR_HEIGHT }, (_, index) => {
    const x = index % HOME_INTERIOR_WIDTH, y = Math.floor(index / HOME_INTERIOR_WIDTH);
    return { x, y, item: items.get(`${x},${y}`) };
  });
});
function select(cell: { x: number; y: number; item?: string }): void {
  if (editing.value && props.editable) emit('cell', { x: cell.x, y: cell.y });
  else inspected.value = cell.item ?? null;
}
</script>

<template>
  <section class="home-interior-map" aria-label="Mapa interno da casa">
    <div class="home-map-header">
      <div class="home-map-residents">
        <span v-for="resident in residents" :key="resident.id" class="home-resident">
          <img v-if="resident.thumb" :src="resident.thumb" alt="" width="30" height="30" />
          {{ resident.name }}
        </span>
      </div>
      <button v-if="editable" type="button" class="home-edit-toggle" :aria-pressed="editing" @click="editing = !editing">
        {{ editing ? 'Concluir decoração' : 'Organizar móveis' }}
      </button>
    </div>
    <div class="home-room-scene" :class="[`wall-${interior.wallpaper}`, `floor-${interior.floor}`, { editing }]">
      <div class="home-back-wall" aria-hidden="true">
        <div class="home-window"><i></i><i></i><i></i><i></i></div>
        <div class="home-window"><i></i><i></i><i></i><i></i></div>
      </div>
      <div class="home-room-floor" :style="{ '--home-cols': HOME_INTERIOR_WIDTH }">
        <div v-for="cell in cells" :key="`${cell.x}-${cell.y}`" class="home-floor-tile"
          :class="{ 'has-item': cell.item, entrance: isHomeEntrance(cell.x, cell.y), [`zone-${cell.item ? furnitureZone(cell.item) : 'empty'}`]: true }">
          <button v-if="cell.item" type="button" class="home-furniture" :title="itemName(cell.item)"
            :aria-label="`${editing && editable ? 'Guardar' : 'Examinar'} ${itemName(cell.item)}`" @click="select(cell)">
            <img :src="icon(cell.item)" :alt="itemName(cell.item)" draggable="false" />
            <span class="home-furniture-caption">{{ itemName(cell.item) }}</span>
          </button>
          <button v-else-if="editing && editable && !isHomeEntrance(cell.x, cell.y)" type="button"
            class="home-empty" :aria-label="`Colocar móvel na coluna ${cell.x + 1}, linha ${cell.y + 1}`" @click="select(cell)">+</button>
          <span v-else-if="isHomeEntrance(cell.x, cell.y)" class="home-door-mat" aria-hidden="true">↓</span>
        </div>
      </div>
      <div class="home-front-wall">
        <button type="button" class="home-map-door" aria-label="Sair da casa e voltar à Vila" @click="emit('exit')">
          <span aria-hidden="true">↓</span> Sair para a Vila
        </button>
      </div>
    </div>
    <p v-if="inspected" class="home-inspection" role="status">
      <strong>{{ itemName(inspected) }}</strong> · {{ ROOM_ZONE_NAMES[furnitureZone(inspected)] }}<br />{{ furniturePurpose(inspected) }}
    </p>
    <p v-else class="home-map-hint">{{ editing ? 'Escolha um móvel da mochila e um espaço livre. Toque em um móvel para guardá-lo.' : 'Toque nos móveis para conhecer os cantinhos da casa.' }}</p>
  </section>
</template>

<style scoped>
.home-interior-map { display: grid; gap: .7rem; }
.home-map-header { display: flex; align-items: center; justify-content: space-between; gap: .6rem; flex-wrap: wrap; }
.home-map-residents { display: flex; gap: .6rem; flex-wrap: wrap; }
.home-resident { display: inline-flex; align-items: center; gap: .3rem; font-size: .84rem; }
.home-resident img { object-fit: contain; image-rendering: pixelated; }
.home-edit-toggle { min-height: 44px; padding: .5rem .75rem; font: inherit; font-size: .8rem; }
.home-room-scene { --wall: #f3e5bf; --wall-detail: #d4c395; --floor: #c89b6b; --grain: #9e754b; padding: 0 8px; border: 4px solid #72513e; border-radius: 5px; background: #8c684f; box-shadow: 0 4px 0 #4e392e; }
.home-back-wall { height: clamp(58px, 12vw, 96px); display: flex; justify-content: space-around; align-items: center; background-color: var(--wall); background-image: repeating-linear-gradient(90deg, transparent 0 22px, var(--wall-detail) 22px 23px); border-bottom: 8px solid #9d754f; box-shadow: inset 0 5px 0 #fff7dd; }
.home-window { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; width: 45px; height: 38px; padding: 4px; background: #a17d58; border: 2px solid #674a37; box-shadow: 0 3px 0 #795840; }
.home-window i { background: linear-gradient(135deg, #e5f5ec 0 24%, #a7d5d6 25% 100%); }
.home-room-floor { display: grid; grid-template-columns: repeat(var(--home-cols), minmax(0, 1fr)); grid-template-rows: repeat(5, minmax(0, 1fr)); aspect-ratio: 7 / 5; background-color: var(--floor); background-image: repeating-linear-gradient(0deg, transparent 0 calc(20% - 1px), var(--grain) calc(20% - 1px) 20%), repeating-linear-gradient(90deg, transparent 0 calc(14.285% - 1px), #b2875a calc(14.285% - 1px) 14.285%); box-shadow: inset 0 5px 0 #694c3428; }
.home-floor-tile { position: relative; display: grid; min-width: 0; min-height: 0; }
.home-furniture, .home-empty { width: 100%; height: 100%; min-width: 0; min-height: 0; padding: 0; border: 0; border-radius: 3px; background: transparent; box-shadow: none; display: grid; place-items: center; cursor: pointer; touch-action: manipulation; }
.home-furniture img { width: 96%; height: 96%; max-height: 82px; object-fit: contain; image-rendering: pixelated; }
.home-furniture:hover, .home-furniture:focus-visible, .home-empty:hover { background: #fff1c855; outline: 2px solid #624b35; outline-offset: -2px; transform: none; }
.home-furniture-caption { position: absolute; left: 50%; bottom: 100%; z-index: 2; width: max-content; max-width: 150px; padding: .25rem .4rem; border-radius: .25rem; background: #fff5dc; color: #3e352a; font-size: .68rem; font-weight: 700; pointer-events: none; opacity: 0; transform: translateX(-50%); }
.home-furniture:focus-visible .home-furniture-caption, .home-furniture:hover .home-furniture-caption { opacity: 1; }
.home-empty { color: #62492d; font-size: 1.2rem; outline: 1px dashed #6d543f66; outline-offset: -4px; }
.home-door-mat { align-self: end; justify-self: center; width: 80%; text-align: center; background: #b76c50; color: #ffe6bc; border: 2px solid #7e4f3a; font-size: 1.2rem; }
.home-front-wall { display: flex; justify-content: center; background: #a17c58; border-top: 4px solid #6c4c35; padding: .3rem; }
.home-map-door { min-height: 44px; padding: .5rem 1rem; border: 2px solid #63462f; border-radius: 4px; background: #fff0c9; color: #493c2e; font: inherit; font-size: .8rem; font-weight: 800; box-shadow: 0 2px 0 #674a37; }
.home-map-hint, .home-inspection { margin: 0; font-size: .82rem; line-height: 1.5; }
.home-inspection { border-left: 3px solid #c09a58; padding: .4rem .65rem; }
.wall-floral { --wall: #f2dfd8; --wall-detail: #d9b8bc; }
.wall-floral .home-back-wall { background-image: radial-gradient(#c18b9955 2px, transparent 3px); background-size: 16px 16px; }
.wall-noite { --wall: #777ca2; --wall-detail: #9294b7; }
.wall-noite .home-back-wall { background-image: radial-gradient(#fff2b7 1px, transparent 2px); background-size: 17px 19px; }
.wall-madeira { --wall: #c5a17b; --wall-detail: #a3815d; }
.floor-xadrez .home-room-floor { background: conic-gradient(#dcc7a5 25%, #f6e9d2 0 50%, #dcc7a5 0 75%, #f6e9d2 0) 0 0 / 28.5714% 40%; }
.floor-grama .home-room-floor { background-color: #99b779; background-image: radial-gradient(#799961 1px, transparent 2px); background-size: 12px 12px; }
.floor-ladrilho .home-room-floor { background-color: #c7cfcb; background-image: linear-gradient(#a7b4ad 1px, transparent 1px), linear-gradient(90deg, #a7b4ad 1px, transparent 1px); background-size: 14.2857% 20%; }
@media (orientation: landscape) and (max-height: 600px) { .home-room-scene { max-width: 480px; width: 100%; justify-self: center; box-sizing: border-box; } .home-back-wall { height: 50px; } }
</style>
