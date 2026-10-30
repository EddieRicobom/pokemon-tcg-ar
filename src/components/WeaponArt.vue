<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { TYPE_COLORS } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import { WEAPONS } from '../core/dungeon';
import type { WeaponId } from '../core/dungeon';

/**
 * Desenho de uma arma base da Masmorra (SVG por código, sem arquivo de arte) com a orbe que guarda o Pokémon de origem.
 * O anel da orbe tem a cor do tipo da munição. A orbe é HTML por cima do SVG para o GIF do Pokémon animar e para a falta
 * do sprite aparecer como falta («?»), não como outro Pokémon.
 */
const props = withDefaults(defineProps<{ weapon: WeaponId; dexId?: number | null; ammo?: PokemonType | null; size?: number; orb?: boolean }>(), {
  dexId: null,
  ammo: null,
  size: 96,
  orb: true,
});

/** Onde fica a orbe em cada arma (em % do quadro 100×100) e o tamanho dela. */
const ORB: Readonly<Partial<Record<WeaponId, { x: number; y: number; r: number }>>> = {
  laminas: { x: 50, y: 61, r: 12 },
  lanca: { x: 64, y: 36, r: 11 },
  martelo: { x: 64, y: 30, r: 12 },
  emissor: { x: 44, y: 44, r: 12 },
  lancador: { x: 24, y: 53, r: 13 },
};

const broken = ref(false);
watch(() => props.dexId, () => { broken.value = false; });
/** Armas ainda sem desenho próprio usam o emblema genérico, com a orbe no centro. */
const drawn = computed(() => props.weapon in ORB);
const orbPos = computed(() => ORB[props.weapon] ?? { x: 50, y: 50, r: 16 });
const label = computed(() => WEAPONS[props.weapon].name);
const ring = computed(() => (props.ammo ? TYPE_COLORS[props.ammo] : '#c9b8ff'));
const src = computed(() => (props.dexId ? pokemonSpriteUrl(props.dexId) : ''));
/** Ids únicos de gradiente por instância (vários desenhos na mesma tela). */
const uid = `w${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <span class="weapon-art" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient :id="`${uid}-steel`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f4f7ff" />
          <stop offset="0.45" stop-color="#b9c3d8" />
          <stop offset="1" stop-color="#6c7690" />
        </linearGradient>
        <linearGradient :id="`${uid}-dark`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#4b4560" />
          <stop offset="1" stop-color="#262236" />
        </linearGradient>
        <linearGradient :id="`${uid}-gold`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffe9a3" />
          <stop offset="1" stop-color="#c58a22" />
        </linearGradient>
        <linearGradient :id="`${uid}-wood`" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#a8714a" />
          <stop offset="1" stop-color="#6b4228" />
        </linearGradient>
      </defs>
      <g stroke="#1b1828" stroke-width="1.6" stroke-linejoin="round">
        <!-- Lâminas duplas: dois punhais cruzados; a orbe fica no encontro das guardas. -->
        <template v-if="weapon === 'laminas'">
          <g v-for="angle in [-35, 35]" :key="angle" :transform="`rotate(${angle} 50 60)`">
            <polygon points="50,6 57,20 56,57 44,57 43,20" :fill="`url(#${uid}-steel)`" />
            <line x1="50" y1="12" x2="50" y2="54" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1" />
            <rect x="35" y="57" width="30" height="7" rx="3" :fill="`url(#${uid}-gold)`" />
            <rect x="46" y="64" width="8" height="21" rx="3" :fill="`url(#${uid}-dark)`" />
            <circle cx="50" cy="89" r="5" :fill="`url(#${uid}-gold)`" />
          </g>
        </template>
        <!-- Lança de combate: haste longa na diagonal, ponta larga; a orbe fica no encaixe da ponta. -->
        <template v-else-if="weapon === 'lanca'">
          <g transform="rotate(45 50 50)">
            <rect x="46.5" y="30" width="7" height="70" rx="3" :fill="`url(#${uid}-wood)`" />
            <rect x="45" y="88" width="10" height="7" rx="2" :fill="`url(#${uid}-gold)`" />
            <polygon points="50,-4 61,14 56,24 44,24 39,14" :fill="`url(#${uid}-steel)`" />
            <line x1="50" y1="0" x2="50" y2="22" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1" />
            <rect x="41" y="22" width="18" height="14" rx="4" :fill="`url(#${uid}-gold)`" />
            <path d="M45 40 q-6 10 -2 18 M55 40 q6 10 2 18" fill="none" stroke="#e0483f" stroke-width="2.4" />
          </g>
        </template>
        <!-- Martelo de impacto: cabo na diagonal e cabeça pesada; a orbe fica no meio da cabeça. -->
        <template v-else-if="weapon === 'martelo'">
          <g transform="rotate(35 50 50)">
            <rect x="46" y="34" width="8" height="64" rx="3" :fill="`url(#${uid}-wood)`" />
            <rect x="44.5" y="84" width="11" height="12" rx="3" :fill="`url(#${uid}-dark)`" />
            <rect x="22" y="10" width="56" height="30" rx="5" :fill="`url(#${uid}-dark)`" />
            <rect x="16" y="13" width="9" height="24" rx="3" :fill="`url(#${uid}-steel)`" />
            <rect x="75" y="13" width="9" height="24" rx="3" :fill="`url(#${uid}-steel)`" />
            <rect x="30" y="12" width="40" height="5" rx="2" fill="#ffffff" fill-opacity="0.18" stroke="none" />
          </g>
        </template>
        <!-- Emissor rápido: pistola compacta; a orbe fica no corpo, à vista. -->
        <template v-else-if="weapon === 'emissor'">
          <polygon points="34,52 48,52 44,86 28,86" :fill="`url(#${uid}-dark)`" />
          <rect x="16" y="32" width="58" height="24" rx="8" :fill="`url(#${uid}-steel)`" />
          <rect x="72" y="38" width="20" height="11" rx="3" :fill="`url(#${uid}-dark)`" />
          <rect x="90" y="35" width="7" height="17" rx="2" :fill="`url(#${uid}-gold)`" />
          <rect x="26" y="25" width="36" height="8" rx="3" :fill="`url(#${uid}-dark)`" />
          <path d="M44 58 q6 8 0 14" fill="none" stroke="#1b1828" stroke-width="2" />
          <rect x="60" y="40" width="10" height="3" rx="1" fill="#7df0ff" stroke="none" />
        </template>
        <!-- Lançador balístico: tubo grosso no ombro; a orbe fica na culatra. -->
        <template v-else-if="weapon === 'lancador'">
          <g transform="rotate(-12 50 50)">
            <rect x="8" y="34" width="80" height="28" rx="12" :fill="`url(#${uid}-dark)`" />
            <rect x="82" y="29" width="12" height="38" rx="4" :fill="`url(#${uid}-gold)`" />
            <rect x="40" y="27" width="22" height="8" rx="3" :fill="`url(#${uid}-steel)`" />
            <rect x="44" y="60" width="9" height="22" rx="3" :fill="`url(#${uid}-wood)`" />
            <rect x="60" y="60" width="8" height="12" rx="2" :fill="`url(#${uid}-dark)`" />
            <path d="M50 40 h28" stroke="#ff9a4d" stroke-width="2" stroke-dasharray="4 3" />
          </g>
        </template>
        <!-- Emblema genérico (arma do catálogo ainda sem desenho próprio): escudo hexagonal com a orbe no centro. -->
        <template v-else>
          <polygon points="50,6 88,28 88,72 50,94 12,72 12,28" :fill="`url(#${uid}-dark)`" />
          <polygon points="50,16 79,33 79,67 50,84 21,67 21,33" fill="none" :stroke="`url(#${uid}-gold)`" stroke-width="3" />
        </template>
      </g>
    </svg>
    <span v-if="!drawn" class="weapon-generic-label">{{ label }}</span>
    <span
      v-if="orb"
      class="weapon-orb"
      :style="{ left: `${orbPos.x}%`, top: `${orbPos.y}%`, width: `${orbPos.r * 2}%`, height: `${orbPos.r * 2}%`, '--ring': ring }"
    >
      <img v-if="src && !broken" :src="src" alt="" loading="lazy" @error="broken = true" />
      <span v-else-if="dexId" class="weapon-orb-missing" title="Sprite indisponível">?</span>
    </span>
  </span>
</template>

<style scoped>
.weapon-art { position: relative; display: inline-block; flex: none; }
.weapon-art svg { width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 2px 2px #0008); }
.weapon-orb {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ffffffcc 0 12%, #a6e8ff55 30%, #2a2050ee 75%);
  box-shadow: 0 0 0 2px var(--ring), 0 0 8px var(--ring), inset 0 0 6px #000a;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.weapon-orb img { width: 150%; height: 150%; object-fit: contain; image-rendering: pixelated; }
.weapon-generic-label { position: absolute; left: 0; right: 0; bottom: -2px; font-size: 9px; line-height: 1.1; text-align: center; color: #fff; text-shadow: 0 1px 2px #000; pointer-events: none; }
.weapon-orb-missing { color: #fff; font-weight: 700; font-size: 0.7em; }
</style>
