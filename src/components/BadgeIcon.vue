<script setup lang="ts">
import { computed, useId } from 'vue';
import { badgeDesign, pathData, polishLook } from '../core/badges';
import type { Finish } from '../core/badges';

/**
 * Uma insígnia da Liga em SVG: metal com degradê, esmalte, poeira que some com o polimento e um brilho. Sem conquista,
 * só o contorno tracejado do encaixe vazio (nada de insígnia "de mentira").
 */
const props = defineProps<{ order: number; won: boolean; polish?: number }>();

const uid = useId();
const design = computed(() => badgeDesign(props.order));
const look = computed(() => (design.value ? polishLook(design.value, props.polish ?? 0.35) : null));
const outline = computed(() => (design.value ? pathData(design.value.outline) : ''));

function fillOf(f: Finish): string {
  const d = design.value!;
  switch (f) {
    case 'metal':
      return `url(#${uid}-metal)`;
    case 'enamel':
      return d.enamel[0];
    case 'enamel2':
      return d.enamel[1];
    case 'enamel3':
      return d.enamel[2];
    case 'dark':
      return d.metal.dark;
    case 'shine':
      return 'rgb(255 255 255 / 0.75)';
  }
}
</script>

<template>
  <svg v-if="design && look" class="badge-icon" viewBox="-1.12 -1.12 2.24 2.24" aria-hidden="true" :class="{ won }">
    <template v-if="won">
      <defs>
        <linearGradient :id="`${uid}-metal`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" :stop-color="design.metal.light" />
          <stop offset="0.45" :stop-color="design.metal.base" />
          <stop offset="1" :stop-color="design.metal.dark" />
        </linearGradient>
        <linearGradient :id="`${uid}-gleam`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.3" stop-color="#fff" stop-opacity="0" />
          <stop offset="0.45" stop-color="#fff" :stop-opacity="0.15 + 0.55 * look.gleam" />
          <stop offset="0.55" stop-color="#fff" stop-opacity="0" />
        </linearGradient>
        <clipPath :id="`${uid}-clip`"><path :d="outline" /></clipPath>
      </defs>
      <path :d="outline" :fill="`url(#${uid}-metal)`" :stroke="design.metal.dark" stroke-width="0.05" stroke-linejoin="round" />
      <g :clip-path="`url(#${uid}-clip)`" :opacity="design.translucent ? 0.92 : 1">
        <path
          v-for="(layer, i) in design.layers"
          :key="i"
          :d="pathData(layer.points, layer.line === undefined)"
          :fill="layer.line === undefined ? fillOf(layer.fill) : 'none'"
          :stroke="layer.line === undefined ? 'none' : fillOf(layer.fill)"
          :stroke-width="layer.line"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <rect x="-1.1" y="-1.1" width="2.2" height="2.2" fill="#5b5346" :opacity="look.dust * 0.6" />
        <rect x="-1.1" y="-1.1" width="2.2" height="2.2" :fill="`url(#${uid}-gleam)`" />
      </g>
    </template>
    <path v-else :d="outline" class="badge-empty" />
  </svg>
</template>
