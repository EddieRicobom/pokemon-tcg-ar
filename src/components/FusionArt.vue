<script setup lang="ts">
import { computed } from 'vue';
import WeaponArt from './WeaponArt.vue';
import { fusionName, WEAPONS } from '../core/dungeon';
import type { WeaponId } from '../core/dungeon';
import type { PokemonType } from '../core/pokemon-data';

/**
 * Arte genérica de fusão: as duas armas de origem sobrepostas, cada uma com a orbe do seu Pokémon, num brilho comum.
 * Embaixo, o nome da fusão (do catálogo) e de que armas ela veio — as fusões não têm desenho próprio.
 */
const props = withDefaults(defineProps<{
  origins: readonly WeaponId[];
  orbs?: readonly (number | null)[];
  ammo?: readonly PokemonType[];
  size?: number;
  caption?: boolean;
}>(), { orbs: () => [], ammo: () => [], size: 120, caption: true });

const first = computed<WeaponId>(() => props.origins[0] ?? 'laminas');
const second = computed<WeaponId>(() => props.origins[1] ?? first.value);
</script>

<template>
  <figure class="fusion-art">
    <span class="fusion-stack" :style="{ width: `${size * 1.25}px`, height: `${size}px` }">
      <span class="fusion-glow" aria-hidden="true"></span>
      <WeaponArt class="fusion-a" :weapon="first" :dex-id="orbs[0] ?? null" :ammo="ammo[0] ?? null" :size="size * 0.9" />
      <WeaponArt class="fusion-b" :weapon="second" :dex-id="orbs[1] ?? null" :ammo="ammo[1] ?? ammo[0] ?? null" :size="size * 0.9" />
      <span class="fusion-plus" aria-hidden="true">+</span>
    </span>
    <figcaption v-if="caption">
      <strong>{{ fusionName(first, second) }}</strong>
      <span class="fusion-origins">
        <span class="fusion-chip">{{ WEAPONS[first].name }} · {{ WEAPONS[first].category }}</span>
        <span class="fusion-chip">{{ WEAPONS[second].name }} · {{ WEAPONS[second].category }}</span>
      </span>
    </figcaption>
  </figure>
</template>

<style scoped>
.fusion-art { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.fusion-stack { position: relative; display: block; }
.fusion-glow { position: absolute; inset: 8%; border-radius: 50%; background: radial-gradient(circle, #b38cff66, #b38cff00 70%); animation: fusion-pulse 2.4s ease-in-out infinite; }
.fusion-a, .fusion-b { position: absolute; top: 5%; }
.fusion-a { left: 0; transform: rotate(-14deg); }
.fusion-b { right: 0; transform: rotate(14deg) scaleX(-1); opacity: 0.94; }
/* A orbe da arma espelhada volta ao normal (o Pokémon não fica de costas). */
.fusion-b :deep(.weapon-orb img) { transform: scaleX(-1); }
.fusion-plus { position: absolute; left: 50%; bottom: 2%; transform: translateX(-50%); width: 22px; height: 22px; border-radius: 50%; background: #b38cff; color: #160f28; font-weight: 800; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px #b38cff; }
figcaption { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; }
figcaption strong { font-size: 0.95rem; }
.fusion-origins { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; }
.fusion-chip { padding: 1px 8px; border-radius: 999px; border: 1px solid #b38cff88; background: #b38cff22; font-size: 0.72rem; color: var(--muted, #a3aed0); }
@media (prefers-reduced-motion: reduce) { .fusion-glow { animation: none; } }
@keyframes fusion-pulse { 50% { transform: scale(1.08); opacity: 0.7; } }
</style>
