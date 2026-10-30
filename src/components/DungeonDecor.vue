<script setup lang="ts">
import type { DecorKind } from '../core/dungeon';

/**
 * Enfeite de chão de um andar da Masmorra (só visual, não bloqueia nada), desenhado em SVG no estilo dos cenários de
 * Mystery Dungeon: estalagmites, Pedras da Lua, cristais, brasas, gelo, raízes, trilhos, lampiões, conchas, ossos,
 * espelhos e prismas Terastal. As cores vêm das variáveis do bioma (`--accent`, `--wall-top`, `--wall-side`).
 */
defineProps<{ kind: DecorKind }>();
</script>

<template>
  <svg class="dg-decor" viewBox="0 0 16 16" aria-hidden="true">
    <g v-if="kind === 'estalagmite'">
      <polygon points="3,15 6,6 9,15" fill="var(--wall-top)" />
      <polygon points="6,6 9,15 7,15" fill="var(--wall-side)" />
      <polygon points="9,15 11,10 13,15" fill="var(--wall-top)" />
      <polygon points="11,10 13,15 12,15" fill="var(--wall-side)" />
    </g>
    <g v-else-if="kind === 'pedra-lunar'">
      <ellipse cx="8" cy="12" rx="5" ry="3" fill="var(--wall-side)" />
      <circle cx="8" cy="10" r="3.4" fill="#cfd8e6" />
      <path d="M8 7.2 a2.8 2.8 0 1 0 0 5.6 a2 2 0 1 1 0 -5.6" fill="#8fa3c4" />
      <circle cx="8" cy="10" r="5" fill="var(--accent)" opacity="0.18" class="dg-decor-glow" />
    </g>
    <g v-else-if="kind === 'cogumelo'">
      <rect x="7" y="9" width="2" height="5" fill="#e8dcc0" />
      <ellipse cx="8" cy="9" rx="5" ry="3" fill="var(--accent)" />
      <circle cx="6" cy="8" r="0.9" fill="#fff" /><circle cx="10" cy="8.5" r="0.8" fill="#fff" />
    </g>
    <g v-else-if="kind === 'cristal'">
      <polygon points="8,2 11,8 8,15 5,8" fill="var(--accent)" opacity="0.9" />
      <polygon points="8,2 8,15 5,8" fill="#ffffff" opacity="0.35" />
      <polygon points="12,8 14,11 12,15 10,11" fill="var(--accent)" opacity="0.75" />
      <circle cx="8" cy="8" r="6" fill="var(--accent)" opacity="0.15" class="dg-decor-glow" />
    </g>
    <g v-else-if="kind === 'brasa'">
      <ellipse cx="8" cy="13" rx="6" ry="2.4" fill="#3a1a12" />
      <circle cx="6" cy="12" r="1.6" fill="#ff7a2f" class="dg-decor-glow" />
      <circle cx="10" cy="12.5" r="1.3" fill="#ffb347" class="dg-decor-glow" />
      <circle cx="8" cy="11" r="1" fill="#ffe08a" />
    </g>
    <g v-else-if="kind === 'gelo'">
      <polygon points="4,15 6,5 8,15" fill="#dff0ff" />
      <polygon points="7,15 10,3 12,15" fill="#b8dcf6" />
      <polygon points="10,3 12,15 11,15" fill="#8fb9dc" />
      <ellipse cx="8" cy="15" rx="6" ry="1" fill="#ffffff" opacity="0.6" />
    </g>
    <g v-else-if="kind === 'raiz'">
      <path d="M3 15 q2 -6 4 -9 M8 15 q0 -5 1 -10 M13 15 q-2 -5 -3 -7" stroke="#5f8a3c" stroke-width="1.4" fill="none" stroke-linecap="round" />
      <path d="M5 15 q1 -3 3 -4 M11 15 q-1 -3 -3 -5" stroke="#86b356" stroke-width="1" fill="none" stroke-linecap="round" />
    </g>
    <g v-else-if="kind === 'trilho'">
      <rect x="0" y="5" width="16" height="1.4" fill="#7c858d" />
      <rect x="0" y="10" width="16" height="1.4" fill="#7c858d" />
      <rect v-for="x in [1, 6, 11]" :key="x" :x="x" y="4" width="2.4" height="8" fill="#6b4a2f" opacity="0.85" />
    </g>
    <g v-else-if="kind === 'lanterna'">
      <rect x="7.4" y="2" width="1.2" height="3" fill="#2b2b2b" />
      <rect x="5" y="5" width="6" height="7" rx="1" fill="#3a2b1d" />
      <rect x="6" y="6" width="4" height="5" fill="var(--accent)" class="dg-decor-glow" />
      <circle cx="8" cy="8.5" r="6" fill="var(--accent)" opacity="0.18" class="dg-decor-glow" />
    </g>
    <g v-else-if="kind === 'concha'">
      <path d="M3 13 Q8 3 13 13 Z" fill="#f4c9c0" />
      <path d="M8 13 L8 5 M8 13 L5 7 M8 13 L11 7" stroke="#d99a8f" stroke-width="0.8" />
      <ellipse cx="8" cy="13.4" rx="5" ry="1" fill="#000" opacity="0.2" />
    </g>
    <g v-else-if="kind === 'osso'">
      <rect x="4" y="8" width="8" height="2" fill="#efe8d8" transform="rotate(-20 8 9)" />
      <circle cx="3.8" cy="10.6" r="1.4" fill="#efe8d8" /><circle cx="4.6" cy="12" r="1.2" fill="#efe8d8" />
      <circle cx="11.4" cy="6.2" r="1.4" fill="#efe8d8" /><circle cx="12.4" cy="7.4" r="1.2" fill="#efe8d8" />
    </g>
    <g v-else-if="kind === 'espelho'">
      <polygon points="5,15 7,3 11,4 11,15" fill="var(--wall-top)" />
      <polygon points="6.5,13 8,5 10,5.6 10,13" fill="var(--accent)" opacity="0.8" />
      <line x1="7.5" y1="12" x2="9.4" y2="6" stroke="#ffffff" stroke-width="0.6" opacity="0.9" />
    </g>
    <g v-else>
      <defs>
        <linearGradient id="dg-prisma" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ff9cf0" /><stop offset="0.35" stop-color="#ffe08a" /><stop offset="0.65" stop-color="#8ef0c8" /><stop offset="1" stop-color="#8fb4ff" />
        </linearGradient>
      </defs>
      <polygon points="8,1 12,7 8,15 4,7" fill="url(#dg-prisma)" />
      <polygon points="8,1 8,15 4,7" fill="#ffffff" opacity="0.3" />
      <circle cx="8" cy="8" r="7" fill="#ffffff" opacity="0.1" class="dg-decor-glow" />
    </g>
  </svg>
</template>

<style scoped>
.dg-decor { position: absolute; inset: 8%; width: 84%; height: 84%; pointer-events: none; z-index: 0; overflow: visible; }
.dg-decor-glow { animation: dg-decor-pulse 2.8s ease-in-out infinite; }
@keyframes dg-decor-pulse { 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { .dg-decor-glow { animation: none; } }
</style>
