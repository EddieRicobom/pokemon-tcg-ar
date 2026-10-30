<script setup lang="ts">
import { computed } from 'vue';
import { TYPE_COLORS } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import type { WeaponId } from '../core/dungeon';

/**
 * Impacto curto de uma arma na grade da Masmorra. A cor vem da munição do Pokémon,
 * como nos golpes elementais, mas cada silhueta acompanha o mecanismo da arma.
 * É SVG/CSS efêmero: não cria canvas, partículas persistentes nem estado de combate.
 */
const props = defineProps<{ weapon: WeaponId; ammo: PokemonType | null }>();
const color = computed(() => props.ammo ? TYPE_COLORS[props.ammo] : '#c9b8ff');
</script>

<template>
  <span class="dungeon-attack-fx" :class="`fx-${weapon}`" :style="{ '--fx': color }" aria-hidden="true">
    <svg viewBox="0 0 100 100" focusable="false">
      <template v-if="weapon === 'laminas'">
        <path class="fx-stroke" d="M16 72 L78 18 M23 86 L88 33" />
        <path class="fx-hot" d="M31 74 L72 37" />
      </template>
      <template v-else-if="weapon === 'espada'">
        <path class="fx-stroke" d="M12 83 Q47 21 91 16" />
        <path class="fx-hot" d="M20 88 Q54 45 91 31" />
      </template>
      <template v-else-if="weapon === 'martelo'">
        <circle class="fx-ring" cx="50" cy="56" r="31" />
        <path class="fx-hot" d="M50 11 V48 M22 76 L40 63 M78 76 L60 63" />
      </template>
      <template v-else-if="weapon === 'lanca'">
        <path class="fx-stroke" d="M8 74 L76 25" />
        <path class="fx-hot" d="M72 12 L95 20 L80 38 Z" />
      </template>
      <template v-else-if="weapon === 'manoplas'">
        <path class="fx-hot" d="M25 68 L25 43 L35 36 L42 45 L48 31 L57 35 L59 47 L67 39 L75 48 L72 70 Z" />
        <path class="fx-stroke" d="M16 80 L30 72 M84 80 L70 72" />
      </template>
      <template v-else-if="weapon === 'escudo'">
        <path class="fx-hot" d="M50 11 L81 25 V53 Q77 75 50 89 Q23 75 19 53 V25 Z" />
        <path class="fx-stroke" d="M50 22 V75 M30 43 H70" />
      </template>
      <template v-else-if="weapon === 'barreira'">
        <path class="fx-hot" d="M50 8 L84 28 V70 L50 91 L16 70 V28 Z" />
        <path class="fx-stroke" d="M50 8 V91 M16 49 H84" />
      </template>
      <template v-else-if="weapon === 'orbital'">
        <circle class="fx-ring" cx="50" cy="50" r="32" />
        <ellipse class="fx-stroke" cx="50" cy="50" rx="43" ry="17" transform="rotate(-30 50 50)" />
        <circle class="fx-hot" cx="20" cy="34" r="5" />
        <circle class="fx-hot" cx="80" cy="66" r="5" />
      </template>
      <template v-else-if="weapon === 'espadaEscudo'">
        <path class="fx-hot" d="M20 22 L56 46 L26 82" />
        <path class="fx-stroke" d="M49 12 L83 77 M17 47 Q49 20 75 42" />
      </template>
      <template v-else-if="weapon === 'emissor'">
        <path class="fx-stroke" d="M8 31 H75 M8 50 H92 M8 69 H75" />
        <circle class="fx-hot" cx="80" cy="31" r="7" />
        <circle class="fx-hot" cx="93" cy="50" r="7" />
        <circle class="fx-hot" cx="80" cy="69" r="7" />
      </template>
      <template v-else-if="weapon === 'dispersao'">
        <path class="fx-stroke" d="M13 50 L88 13 M13 50 H96 M13 50 L88 87" />
        <path class="fx-hot" d="M74 10 L94 13 L87 31 M81 42 L98 50 L81 58 M74 90 L94 87 L87 69" />
      </template>
      <template v-else-if="weapon === 'continuo'">
        <path class="fx-beam" d="M5 50 H95" />
        <path class="fx-stroke" d="M5 39 H95 M5 61 H95" />
      </template>
      <template v-else-if="weapon === 'canhao'">
        <circle class="fx-hot" cx="50" cy="50" r="26" />
        <circle class="fx-ring" cx="50" cy="50" r="40" />
        <path class="fx-stroke" d="M50 5 V22 M50 78 V95 M5 50 H22 M78 50 H95" />
      </template>
      <template v-else-if="weapon === 'lancador'">
        <path class="fx-stroke" d="M8 86 Q48 3 88 47" />
        <path class="fx-hot" d="M50 26 L57 43 L76 42 L62 55 L67 73 L50 63 L34 73 L39 55 L24 42 L43 43 Z" />
      </template>
      <template v-else-if="weapon === 'condutor'">
        <path class="fx-hot" d="M50 4 L31 40 H48 L38 69 H56 L49 96 L76 53 H57 L70 25 H53 Z" />
        <path class="fx-stroke" d="M16 31 L33 40 M84 31 L67 40" />
      </template>
      <template v-else-if="weapon === 'rifle'">
        <path class="fx-beam" d="M4 50 H96" />
        <path class="fx-hot" d="M76 36 L94 50 L76 64" />
      </template>
      <template v-else-if="weapon === 'disco'">
        <circle class="fx-ring" cx="50" cy="50" r="34" />
        <path class="fx-hot" d="M50 11 L60 40 L89 50 L60 60 L50 89 L40 60 L11 50 L40 40 Z" />
      </template>
      <template v-else-if="weapon === 'armadilhas'">
        <path class="fx-hot" d="M16 59 L28 42 L40 51 L50 31 L60 51 L72 42 L84 59 L68 75 H32 Z" />
        <path class="fx-stroke" d="M18 76 H82 M40 78 L33 92 M60 78 L67 92" />
      </template>
      <template v-else-if="weapon === 'correntes'">
        <path class="fx-stroke" d="M7 77 C29 25 48 84 66 30 C74 7 88 17 93 20" />
        <path class="fx-hot" d="M76 11 L95 20 L81 34" />
      </template>
      <template v-else-if="weapon === 'enxameador'">
        <path class="fx-stroke" d="M18 68 Q50 15 83 38" />
        <g class="fx-hot">
          <circle cx="29" cy="65" r="7" /><circle cx="48" cy="44" r="7" /><circle cx="70" cy="35" r="7" />
        </g>
      </template>
    </svg>
  </span>
</template>

<style scoped>
.dungeon-attack-fx { position: absolute; inset: -38%; z-index: 4; pointer-events: none; display: grid; place-items: center; animation: fx-pop 0.62s ease-out both; filter: drop-shadow(0 0 4px var(--fx)); }
.dungeon-attack-fx svg { width: 100%; height: 100%; overflow: visible; }
.fx-stroke, .fx-ring { fill: none; stroke: var(--fx); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
.fx-hot { fill: var(--fx); stroke: #fff8df; stroke-width: 2; stroke-linejoin: round; }
.fx-beam { fill: none; stroke: var(--fx); stroke-width: 12; stroke-linecap: round; opacity: 0.8; }
.fx-continuo .fx-beam, .fx-rifle .fx-beam { stroke-dasharray: 100; animation: fx-beam 0.58s ease-out both; }
.fx-disco svg, .fx-orbital svg { animation: fx-spin 0.62s ease-out both; }
.fx-enxameador .fx-hot { animation: fx-swarm 0.48s ease-out both; transform-origin: 50% 50%; }
.fx-condutor .fx-hot { animation: fx-flash 0.2s steps(2, end) 2; }
@keyframes fx-pop { 0% { opacity: 0; transform: scale(0.35); } 25% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.22); } }
@keyframes fx-beam { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }
@keyframes fx-spin { from { transform: rotate(-120deg) scale(0.45); } to { transform: rotate(120deg) scale(1.1); } }
@keyframes fx-swarm { from { transform: translate(-18px, 15px); } to { transform: translate(12px, -10px); } }
@keyframes fx-flash { 50% { opacity: 0.15; } }
@media (prefers-reduced-motion: reduce) { .dungeon-attack-fx, .fx-continuo .fx-beam, .fx-rifle .fx-beam, .fx-disco svg, .fx-orbital svg, .fx-enxameador .fx-hot, .fx-condutor .fx-hot { animation: none; } .dungeon-attack-fx { opacity: 0.78; } }
</style>
