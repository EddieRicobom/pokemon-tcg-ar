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
  espada: { x: 56, y: 56, r: 11 },
  manoplas: { x: 50, y: 44, r: 12 },
  escudo: { x: 50, y: 50, r: 14 },
  barreira: { x: 50, y: 72, r: 11 },
  orbital: { x: 50, y: 50, r: 14 },
  espadaEscudo: { x: 34, y: 52, r: 11 },
  dispersao: { x: 39, y: 52, r: 12 },
  continuo: { x: 25, y: 55, r: 12 },
  canhao: { x: 30, y: 55, r: 14 },
  condutor: { x: 59, y: 42, r: 10 },
  rifle: { x: 45, y: 51, r: 11 },
  disco: { x: 50, y: 50, r: 14 },
  armadilhas: { x: 35, y: 67, r: 11 },
  correntes: { x: 27, y: 57, r: 12 },
  enxameador: { x: 40, y: 56, r: 13 },
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
        <!-- Espada longa: lâmina diagonal, guarda larga e pomo; a orbe ocupa o encaixe da guarda. -->
        <template v-else-if="weapon === 'espada'">
          <g transform="rotate(-45 50 50)">
            <polygon points="50,4 61,22 57,60 43,60 39,22" :fill="`url(#${uid}-steel)`" />
            <path d="M50 8 L54 24 L50 56 L46 24 Z" :fill="`url(#${uid}-dark)`" stroke="none" />
            <line x1="46" y1="15" x2="46" y2="53" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1" />
            <rect x="30" y="57" width="40" height="8" rx="3" :fill="`url(#${uid}-gold)`" />
            <rect x="45" y="65" width="10" height="23" rx="4" :fill="`url(#${uid}-dark)`" />
            <circle cx="50" cy="92" r="6" :fill="`url(#${uid}-gold)`" />
          </g>
        </template>
        <!-- Manoplas: punho frontal com nós dourados; a orbe vai protegida no dorso da mão. -->
        <template v-else-if="weapon === 'manoplas'">
          <path d="M28 82 L24 57 Q22 38 34 31 L66 31 Q78 38 76 57 L72 82 Z" :fill="`url(#${uid}-dark)`" />
          <rect x="31" y="38" width="38" height="34" rx="12" :fill="`url(#${uid}-steel)`" />
          <rect x="35" y="70" width="30" height="18" rx="5" :fill="`url(#${uid}-dark)`" />
          <rect x="27" y="82" width="46" height="10" rx="4" :fill="`url(#${uid}-gold)`" />
          <circle cx="37" cy="38" r="6" :fill="`url(#${uid}-gold)`" />
          <circle cx="46" cy="34" r="6" :fill="`url(#${uid}-gold)`" />
          <circle cx="55" cy="34" r="6" :fill="`url(#${uid}-gold)`" />
          <circle cx="64" cy="38" r="6" :fill="`url(#${uid}-gold)`" />
          <path d="M34 48 Q50 40 66 48" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1" />
        </template>
        <!-- Escudo de impacto: placa fechada, cravos frontais e centro reforçado para a orbe. -->
        <template v-else-if="weapon === 'escudo'">
          <path d="M50 7 L84 20 V52 Q81 76 50 93 Q19 76 16 52 V20 Z" :fill="`url(#${uid}-steel)`" />
          <path d="M50 16 L75 27 V51 Q72 69 50 82 Q28 69 25 51 V27 Z" :fill="`url(#${uid}-dark)`" />
          <path d="M30 29 Q48 18 67 27" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1.2" />
          <circle cx="31" cy="47" r="5" :fill="`url(#${uid}-gold)`" />
          <circle cx="69" cy="47" r="5" :fill="`url(#${uid}-gold)`" />
          <circle cx="50" cy="75" r="5" :fill="`url(#${uid}-gold)`" />
          <path d="M42 86 L50 92 L58 86" fill="none" :stroke="`url(#${uid}-gold)`" stroke-width="3" />
        </template>
        <!-- Projetor de barreira: pedestal, coluna e prato emissor sob um arco energético. -->
        <template v-else-if="weapon === 'barreira'">
          <path d="M23 82 H77 L84 92 H16 Z" :fill="`url(#${uid}-dark)`" />
          <rect x="31" y="72" width="38" height="11" rx="4" :fill="`url(#${uid}-steel)`" />
          <rect x="45" y="41" width="10" height="31" rx="4" :fill="`url(#${uid}-dark)`" />
          <ellipse cx="50" cy="40" rx="25" ry="8" :fill="`url(#${uid}-gold)`" />
          <ellipse cx="50" cy="38" rx="16" ry="4" :fill="`url(#${uid}-steel)`" />
          <path d="M20 37 Q50 3 80 37" fill="none" stroke="#7df0ff" stroke-width="2.5" stroke-dasharray="5 3" />
          <path d="M25 43 Q50 18 75 43" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1" />
        </template>
        <!-- Guardião orbital: núcleo pesado, anel inclinado e dois satélites dourados. -->
        <template v-else-if="weapon === 'orbital'">
          <circle cx="50" cy="50" r="25" :fill="`url(#${uid}-dark)`" />
          <circle cx="50" cy="50" r="17" :fill="`url(#${uid}-steel)`" />
          <ellipse cx="50" cy="50" rx="44" ry="17" transform="rotate(-28 50 50)" fill="none" :stroke="`url(#${uid}-gold)`" stroke-width="6" />
          <ellipse cx="50" cy="50" rx="38" ry="12" transform="rotate(-28 50 50)" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1" />
          <circle cx="18" cy="31" r="7" :fill="`url(#${uid}-gold)`" />
          <circle cx="82" cy="69" r="7" :fill="`url(#${uid}-gold)`" />
          <path d="M40 37 Q50 28 60 37" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1.2" />
        </template>
        <!-- Espada e escudo: escudo compacto à frente e espada curta cruzada por trás. -->
        <template v-else-if="weapon === 'espadaEscudo'">
          <g transform="rotate(33 58 48)">
            <polygon points="58,5 67,20 64,61 52,61 49,20" :fill="`url(#${uid}-steel)`" />
            <line x1="54" y1="15" x2="54" y2="55" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1" />
            <rect x="42" y="58" width="25" height="7" rx="3" :fill="`url(#${uid}-gold)`" />
            <rect x="50" y="65" width="9" height="20" rx="3" :fill="`url(#${uid}-dark)`" />
          </g>
          <path d="M34 19 L57 28 V51 Q54 69 34 80 Q14 69 11 51 V28 Z" :fill="`url(#${uid}-dark)`" />
          <path d="M34 26 L50 33 V50 Q48 62 34 70 Q20 62 18 50 V33 Z" :fill="`url(#${uid}-steel)`" />
          <path d="M20 35 Q34 25 47 33" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1" />
          <circle cx="34" cy="73" r="4" :fill="`url(#${uid}-gold)`" />
        </template>
        <!-- Canhão de dispersão: funil largo com boca visível, corpo curto e cabo. -->
        <template v-else-if="weapon === 'dispersao'">
          <path d="M13 36 H55 L83 25 V75 L55 64 H13 Z" :fill="`url(#${uid}-dark)`" />
          <path d="M54 31 L90 18 V82 L54 69 Z" :fill="`url(#${uid}-steel)`" />
          <ellipse cx="87" cy="50" rx="8" ry="27" :fill="`url(#${uid}-dark)`" />
          <ellipse cx="89" cy="50" rx="4" ry="17" :fill="`url(#${uid}-gold)`" />
          <path d="M32 62 H48 L43 88 H27 Z" :fill="`url(#${uid}-wood)`" />
          <rect x="20" y="29" width="27" height="7" rx="3" :fill="`url(#${uid}-steel)`" />
          <path d="M58 37 L77 31 M58 50 L80 50 M58 63 L77 69" fill="none" stroke="#ff9a4d" stroke-width="2" />
        </template>
        <!-- Projetor contínuo: cilindro longo inclinado, bobinas douradas e bico afunilado. -->
        <template v-else-if="weapon === 'continuo'">
          <g transform="rotate(-12 50 50)">
            <rect x="14" y="38" width="58" height="24" rx="10" :fill="`url(#${uid}-dark)`" />
            <rect x="19" y="42" width="46" height="10" rx="5" :fill="`url(#${uid}-steel)`" />
            <rect x="30" y="36" width="6" height="28" rx="2" :fill="`url(#${uid}-gold)`" />
            <rect x="48" y="36" width="6" height="28" rx="2" :fill="`url(#${uid}-gold)`" />
            <path d="M71 34 L93 42 V58 L71 66 Z" :fill="`url(#${uid}-steel)`" />
            <ellipse cx="92" cy="50" rx="4" ry="8" :fill="`url(#${uid}-dark)`" />
            <path d="M23 46 H63" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1" />
          </g>
        </template>
        <!-- Canhão de carga: câmara circular grande, cano grosso e boca dourada. -->
        <template v-else-if="weapon === 'canhao'">
          <circle cx="30" cy="55" r="25" :fill="`url(#${uid}-dark)`" />
          <circle cx="30" cy="55" r="18" :fill="`url(#${uid}-steel)`" />
          <rect x="47" y="42" width="39" height="26" rx="8" :fill="`url(#${uid}-dark)`" />
          <rect x="57" y="46" width="34" height="18" rx="7" :fill="`url(#${uid}-steel)`" />
          <ellipse cx="88" cy="55" rx="7" ry="12" :fill="`url(#${uid}-gold)`" />
          <ellipse cx="90" cy="55" rx="3" ry="7" :fill="`url(#${uid}-dark)`" />
          <path d="M53 39 H72 L76 31 H58 Z" :fill="`url(#${uid}-gold)`" />
          <path d="M20 41 Q30 33 40 41" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1" />
        </template>
        <!-- Condutor de arco: bastão diagonal, garfo de duas pontas e raio fino. -->
        <template v-else-if="weapon === 'condutor'">
          <g transform="rotate(45 50 50)">
            <rect x="46" y="31" width="8" height="57" rx="4" :fill="`url(#${uid}-dark)`" />
            <rect x="43" y="80" width="14" height="12" rx="4" :fill="`url(#${uid}-wood)`" />
            <path d="M46 34 L34 15 L41 10 L50 26 L59 10 L66 15 L54 34" :fill="`url(#${uid}-steel)`" />
            <rect x="40" y="34" width="20" height="8" rx="3" :fill="`url(#${uid}-gold)`" />
            <path d="M50 39 L44 51 H50 L46 62 L57 47 H51 L55 39" fill="none" stroke="#7df0ff" stroke-width="2.4" />
            <line x1="47" y1="48" x2="47" y2="76" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1" />
          </g>
        </template>
        <!-- Rifle perfurante: cano longo, coronha de madeira e luneta no corpo. -->
        <template v-else-if="weapon === 'rifle'">
          <g transform="rotate(-12 50 50)">
            <rect x="21" y="43" width="64" height="13" rx="4" :fill="`url(#${uid}-dark)`" />
            <rect x="48" y="45" width="46" height="7" rx="3" :fill="`url(#${uid}-steel)`" />
            <rect x="30" y="34" width="28" height="7" rx="3" :fill="`url(#${uid}-steel)`" />
            <circle cx="34" cy="37.5" r="5" :fill="`url(#${uid}-dark)`" />
            <circle cx="55" cy="37.5" r="5" :fill="`url(#${uid}-dark)`" />
            <path d="M17 54 H42 L37 75 H20 Z" :fill="`url(#${uid}-wood)`" />
            <rect x="88" y="41" width="8" height="17" rx="2" :fill="`url(#${uid}-gold)`" />
            <path d="M53 47 H87" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1" />
          </g>
        </template>
        <!-- Disco retornável: disco frontal com quatro lâminas e rastro de retorno. -->
        <template v-else-if="weapon === 'disco'">
          <circle cx="50" cy="50" r="34" :fill="`url(#${uid}-dark)`" />
          <circle cx="50" cy="50" r="26" :fill="`url(#${uid}-steel)`" />
          <polygon points="50,14 59,34 50,40 41,34" :fill="`url(#${uid}-gold)`" />
          <polygon points="86,50 66,59 60,50 66,41" :fill="`url(#${uid}-gold)`" />
          <polygon points="50,86 41,66 50,60 59,66" :fill="`url(#${uid}-gold)`" />
          <polygon points="14,50 34,41 40,50 34,59" :fill="`url(#${uid}-gold)`" />
          <circle cx="50" cy="50" r="13" :fill="`url(#${uid}-dark)`" />
          <path d="M18 78 Q5 63 18 48" fill="none" stroke="#7df0ff" stroke-width="2" stroke-dasharray="4 3" />
        </template>
        <!-- Lançador de armadilhas: morteiro baixo, base firme e armadilha dentada em disparo. -->
        <template v-else-if="weapon === 'armadilhas'">
          <path d="M14 76 H62 L72 90 H8 Z" :fill="`url(#${uid}-dark)`" />
          <rect x="23" y="66" width="30" height="12" rx="4" :fill="`url(#${uid}-steel)`" />
          <g transform="rotate(-32 50 54)">
            <rect x="38" y="25" width="25" height="42" rx="8" :fill="`url(#${uid}-dark)`" />
            <rect x="43" y="22" width="15" height="43" rx="6" :fill="`url(#${uid}-steel)`" />
            <ellipse cx="50" cy="24" rx="8" ry="5" :fill="`url(#${uid}-gold)`" />
          </g>
          <path d="M68 22 L75 15 L79 24 L87 19 L86 29 L95 30 L87 37 L92 45 L81 43 L76 52 L72 42 L62 45 L67 36 L59 31 L69 29 Z" :fill="`url(#${uid}-gold)`" />
          <circle cx="77" cy="32" r="5" :fill="`url(#${uid}-dark)`" />
          <path d="M19 82 H58" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1" />
        </template>
        <!-- Lança-correntes: lançador compacto e corrente diagonal terminando em gancho dourado. -->
        <template v-else-if="weapon === 'correntes'">
          <rect x="10" y="43" width="34" height="28" rx="8" :fill="`url(#${uid}-dark)`" />
          <rect x="17" y="48" width="22" height="12" rx="5" :fill="`url(#${uid}-steel)`" />
          <path d="M20 68 H35 L31 88 H18 Z" :fill="`url(#${uid}-wood)`" />
          <ellipse cx="47" cy="43" rx="8" ry="5" transform="rotate(-35 47 43)" :fill="`url(#${uid}-steel)`" />
          <ellipse cx="58" cy="35" rx="8" ry="5" transform="rotate(-35 58 35)" :fill="`url(#${uid}-steel)`" />
          <ellipse cx="69" cy="27" rx="8" ry="5" transform="rotate(-35 69 27)" :fill="`url(#${uid}-steel)`" />
          <path d="M75 18 Q91 14 92 27 Q93 40 81 44 L76 35 Q84 31 83 24 Q82 20 76 24 Z" :fill="`url(#${uid}-gold)`" />
          <path d="M18 51 H36" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1" />
        </template>
        <!-- Enxameador: colmeia oval furada e três pequenos projéteis triangulares em saída. -->
        <template v-else-if="weapon === 'enxameador'">
          <ellipse cx="40" cy="56" rx="25" ry="33" :fill="`url(#${uid}-dark)`" />
          <ellipse cx="40" cy="53" rx="18" ry="25" :fill="`url(#${uid}-steel)`" />
          <circle cx="31" cy="40" r="5" :fill="`url(#${uid}-gold)`" />
          <circle cx="48" cy="41" r="5" :fill="`url(#${uid}-gold)`" />
          <circle cx="29" cy="58" r="5" :fill="`url(#${uid}-gold)`" />
          <circle cx="50" cy="60" r="5" :fill="`url(#${uid}-gold)`" />
          <circle cx="39" cy="75" r="5" :fill="`url(#${uid}-gold)`" />
          <polygon points="71,35 84,40 73,47" :fill="`url(#${uid}-steel)`" />
          <polygon points="80,53 94,58 82,65" :fill="`url(#${uid}-steel)`" />
          <polygon points="68,70 81,75 70,82" :fill="`url(#${uid}-steel)`" />
          <path d="M61 45 Q68 43 73 40 M63 58 H80 M61 70 Q67 73 70 76" fill="none" stroke="#7df0ff" stroke-width="1.8" />
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
