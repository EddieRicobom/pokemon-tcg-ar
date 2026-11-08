<script setup lang="ts">
import { POKEMON_TYPES, TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import { TYPE_GLYPHS as GLYPHS } from '../core/type-glyphs';

/** `counts`, quando vem, apaga os tipos que dariam uma grade vazia (o tipo já ativo continua tocável, para desligar). */
const props = defineProps<{ modelValue: PokemonType | ''; counts?: Partial<Record<PokemonType, number>> }>();
const emit = defineEmits<{ 'update:modelValue': [value: PokemonType | ''] }>();
const isEmpty = (type: PokemonType): boolean => props.counts !== undefined && !props.counts[type] && props.modelValue !== type;
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
      :aria-label="isEmpty(type) ? `${TYPE_LABELS_PT[type]}: nenhum Pokémon` : TYPE_LABELS_PT[type]"
      :aria-pressed="props.modelValue === type"
      :title="TYPE_LABELS_PT[type]"
      :disabled="isEmpty(type)"
      @click="emit('update:modelValue', props.modelValue === type ? '' : type)"
    >
      <span aria-hidden="true">{{ GLYPHS[type] }}</span><small>{{ TYPE_LABELS_PT[type] }}</small>
    </button>
  </div>
</template>
