<script setup lang="ts">
import { computed } from 'vue';
import { gemColor, gemIcon, gemName, gemText } from '../core/dungeon-gems';
import type { Gem } from '../core/dungeon-gems';

/** Uma gema da Masmorra: lapidação desenhada em CSS na cor dela; as lendárias brilham. Vazio = encaixe livre. */
const props = withDefaults(defineProps<{ gem: Gem | null; size?: number; legendarySlot?: boolean; label?: boolean }>(), { size: 26, legendarySlot: false, label: false });
const title = computed(() => (props.gem ? `${gemName(props.gem)}: ${gemText(props.gem)}` : props.legendarySlot ? 'Encaixe lendário vazio' : 'Encaixe vazio'));
</script>

<template>
  <span class="gem-chip" :title="title">
    <span
      class="gem"
      :class="{ empty: !gem, legendary: gem?.legendary, 'legendary-slot': !gem && legendarySlot }"
      :style="{ width: `${size}px`, height: `${size}px`, '--gem': gem ? gemColor(gem) : '#555' }"
    >
      <span v-if="gem?.legendary" class="gem-icon">{{ gemIcon(gem) }}</span>
      <span v-else-if="gem && gem.tier > 1" class="gem-tier">{{ gem.tier }}</span>
    </span>
    <span v-if="label && gem" class="gem-label"><strong>{{ gemName(gem) }}</strong><small>{{ gemText(gem) }}</small></span>
  </span>
</template>

<style scoped>
.gem-chip { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.gem {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  clip-path: polygon(50% 0, 100% 35%, 80% 100%, 20% 100%, 0 35%);
  background: linear-gradient(160deg, #ffffffcc 0 14%, var(--gem) 15% 55%, color-mix(in srgb, var(--gem) 55%, #000) 100%);
}
.gem.empty { background: repeating-linear-gradient(45deg, #ffffff18 0 3px, #00000030 3px 6px); }
.gem.legendary-slot { background: repeating-linear-gradient(45deg, #ffcb0533 0 3px, #00000030 3px 6px); }
.gem.legendary { animation: gem-shine 2.6s linear infinite; }
.gem-icon { font-size: 0.55em; filter: drop-shadow(0 1px 1px #000); }
.gem-tier { font-size: 0.5em; font-weight: 800; color: #fff; text-shadow: 0 1px 2px #000; margin-top: 15%; }
.gem-label { display: flex; flex-direction: column; min-width: 0; font-size: 0.78rem; line-height: 1.2; }
.gem-label small { color: var(--muted, #a3aed0); font-size: 0.7rem; }
@keyframes gem-shine { 50% { filter: brightness(1.45) saturate(1.3); } }
@media (prefers-reduced-motion: reduce) { .gem.legendary { animation: none; } }
</style>
