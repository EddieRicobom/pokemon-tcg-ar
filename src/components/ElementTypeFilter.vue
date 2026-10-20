<script setup lang="ts">
import { POKEMON_TYPES, TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';

const props = defineProps<{ modelValue: PokemonType | '' }>();
const emit = defineEmits<{ 'update:modelValue': [value: PokemonType | ''] }>();
const GLYPHS: Record<PokemonType, string> = {
  normal: '◉', fire: '🔥', water: '💧', electric: '⚡', grass: '🍃', ice: '❄️', fighting: '🥊', poison: '☠️',
  ground: '⛰️', flying: '🪽', psychic: '🔮', bug: '🪲', rock: '🪨', ghost: '👻', dragon: '🐉', dark: '🌑', steel: '⚙️', fairy: '✨',
};
</script>

<template>
  <div class="element-type-filter" role="group" aria-label="Filtrar por tipo elemental">
    <button type="button" class="element-type-choice all" :class="{ active: props.modelValue === '' }" :aria-pressed="props.modelValue === ''" @click="emit('update:modelValue', '')">
      <span aria-hidden="true">✦</span><small>Todos</small>
    </button>
    <button
      v-for="type in POKEMON_TYPES"
      :key="type"
      type="button"
      class="element-type-choice"
      :class="{ active: props.modelValue === type }"
      :style="{ '--type-accent': TYPE_COLORS[type] }"
      :aria-label="TYPE_LABELS_PT[type]"
      :aria-pressed="props.modelValue === type"
      :title="TYPE_LABELS_PT[type]"
      @click="emit('update:modelValue', props.modelValue === type ? '' : type)"
    >
      <span aria-hidden="true">{{ GLYPHS[type] }}</span><small>{{ TYPE_LABELS_PT[type] }}</small>
    </button>
  </div>
</template>
