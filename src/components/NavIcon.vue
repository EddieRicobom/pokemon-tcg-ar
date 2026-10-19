<script setup lang="ts">
export type NavIconName = 'escanear' | 'varias' | 'vila' | 'caixa' | 'cartas' | 'arena' | 'diagnostico' | 'treinador' | 'pins';
defineProps<{ name: NavIconName }>();
</script>

<template>
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <!-- Escanear: moldura de visor com um ponto no centro -->
    <template v-if="name === 'escanear'">
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="2.6" />
    </template>
    <!-- Várias: três cartas lado a lado -->
    <template v-else-if="name === 'varias'">
      <rect x="3" y="7" width="6" height="10" rx="1.4" />
      <rect x="9" y="5" width="6" height="14" rx="1.4" />
      <rect x="15" y="7" width="6" height="10" rx="1.4" />
    </template>
    <!-- Vila: casinha com porta -->
    <template v-else-if="name === 'vila'">
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5.5h4V20" />
    </template>
    <!-- Caixa: cubo -->
    <template v-else-if="name === 'caixa'">
      <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </template>
    <!-- Arena: dois raios de batalha dentro do círculo -->
    <template v-else-if="name === 'arena'">
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9 7 3 4-2 1 3 5M15 7l-3 4 2 1-3 5" />
    </template>
    <!-- Pins: disco com a seta de disparo -->
    <template v-else-if="name === 'pins'">
      <circle cx="9" cy="15" r="5" />
      <path d="m13 11 7-7M14.5 4H20v5.5" />
    </template>
    <!-- Cartas: duas cartas empilhadas -->
    <template v-else-if="name === 'cartas'">
      <rect x="8" y="3.5" width="11" height="15" rx="2" />
      <path d="M5.5 7.5A2 2 0 0 0 4.5 9.2V19a2 2 0 0 0 2 2h8.3" />
    </template>
    <!-- Treinador: medalha com estrela -->
    <template v-else-if="name === 'treinador'">
      <circle cx="12" cy="9" r="5.5" />
      <path d="m12 6.6.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 8.7l2-.3L12 6.6ZM8.6 13.6 7 20l5-2.4 5 2.4-1.6-6.4" />
    </template>
    <!-- Diagnóstico: linha de pulso -->
    <template v-else>
      <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
    </template>
  </svg>
</template>
