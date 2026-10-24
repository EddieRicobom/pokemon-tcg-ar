<script setup lang="ts">
import { computed, useId } from 'vue';
import { badgeDesign, pathData, polishLook } from '../core/badges';
import type { BadgeLayer, Fill } from '../core/badges';

/**
 * Uma insígnia da Liga em SVG: metal com degradê e chanfro, esmalte com filetes de metal entre as cores, verniz
 * por cima, poeira que some com o polimento e um brilho. Sem conquista, só o contorno tracejado do encaixe vazio (nada de
 * insígnia "de mentira").
 */
const props = defineProps<{ order: number; won: boolean; polish?: number }>();

const uid = useId();
const design = computed(() => badgeDesign(props.order));
const look = computed(() => (design.value ? polishLook(design.value, props.polish ?? 0.35) : null));
const outline = computed(() => (design.value ? pathData(design.value.outline) : ''));

function fillOf(f: Fill): string {
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
      return 'rgb(255 255 255 / 0.7)';
    default:
      return f;
  }
}

/** Filete escuro em volta das áreas de esmalte (a "solda" entre as cores, como num broche de verdade). */
const wired = (layer: BadgeLayer): boolean => layer.line === undefined && layer.fill !== 'shine' && layer.fill !== 'metal';
</script>

<template>
  <svg v-if="design && look" class="badge-icon" viewBox="-1.16 -1.16 2.32 2.32" aria-hidden="true" :class="{ won }">
    <template v-if="won">
      <defs>
        <linearGradient :id="`${uid}-metal`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" :stop-color="design.metal.light" />
          <stop offset="0.45" :stop-color="design.metal.base" />
          <stop offset="1" :stop-color="design.metal.dark" />
        </linearGradient>
        <linearGradient :id="`${uid}-bevel`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity="0.85" />
          <stop offset="0.5" stop-color="#fff" stop-opacity="0" />
          <stop offset="0.55" stop-color="#000" stop-opacity="0" />
          <stop offset="1" stop-color="#000" stop-opacity="0.45" />
        </linearGradient>
        <radialGradient :id="`${uid}-glaze`" cx="0.3" cy="0.22" r="0.75">
          <stop offset="0" stop-color="#fff" stop-opacity="0.38" />
          <stop offset="0.5" stop-color="#fff" stop-opacity="0.08" />
          <stop offset="1" stop-color="#000" stop-opacity="0.18" />
        </radialGradient>
        <linearGradient :id="`${uid}-gleam`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.3" stop-color="#fff" stop-opacity="0" />
          <stop offset="0.45" stop-color="#fff" :stop-opacity="0.15 + 0.55 * look.gleam" />
          <stop offset="0.55" stop-color="#fff" stop-opacity="0" />
        </linearGradient>
        <clipPath :id="`${uid}-clip`"><path :d="outline" /></clipPath>
      </defs>
      <path :d="outline" :fill="`url(#${uid}-metal)`" />
      <g :clip-path="`url(#${uid}-clip)`" :opacity="design.translucent ? 0.92 : 1">
        <path
          v-for="(layer, i) in design.layers"
          :key="i"
          :d="pathData(layer.points, layer.line === undefined)"
          :fill="layer.line === undefined ? fillOf(layer.fill) : 'none'"
          :stroke="layer.line === undefined ? (wired(layer) ? 'rgb(0 0 0 / 0.28)' : 'none') : fillOf(layer.fill)"
          :stroke-width="layer.line ?? 0.022"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <rect x="-1.1" y="-1.1" width="2.2" height="2.2" :fill="`url(#${uid}-glaze)`" />
        <path :d="outline" fill="none" :stroke="`url(#${uid}-bevel)`" stroke-width="0.12" stroke-linejoin="round" />
        <rect x="-1.1" y="-1.1" width="2.2" height="2.2" fill="#5b5346" :opacity="look.dust * 0.6" />
        <rect x="-1.1" y="-1.1" width="2.2" height="2.2" :fill="`url(#${uid}-gleam)`" />
      </g>
      <path :d="outline" fill="none" :stroke="design.metal.dark" stroke-width="0.04" stroke-linejoin="round" />
    </template>
    <path v-else :d="outline" class="badge-empty" />
  </svg>
</template>
