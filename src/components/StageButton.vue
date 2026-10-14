<script setup lang="ts">
export type StageIconName =
  | 'fullscreen' | 'exit-fullscreen' | 'filters' | 'close' | 'rescan' | 'adjust' | 'panel' | 'team' | 'move'
  | 'formation' | 'wander' | 'battle' | 'stop' | 'tools' | 'search' | 'sliders' | 'photo';
defineProps<{ icon: StageIconName; label: string; active?: boolean; disabled?: boolean; attention?: boolean }>();
</script>

<template>
  <button type="button" class="stage-btn" :class="{ active, attention }" :aria-pressed="active === undefined ? undefined : active" :disabled="disabled">
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path v-if="icon === 'fullscreen'" d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
      <path v-else-if="icon === 'exit-fullscreen'" d="M9 4v4a1 1 0 0 1-1 1H4M20 9h-4a1 1 0 0 1-1-1V4M15 20v-4a1 1 0 0 1 1-1h4M4 15h4a1 1 0 0 1 1 1v4" />
      <path v-else-if="icon === 'filters'" d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />
      <path v-else-if="icon === 'close'" d="m6 6 12 12M18 6 6 18" />
      <path v-else-if="icon === 'rescan'" d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5" />
      <path v-else-if="icon === 'adjust'" d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
      <g v-else-if="icon === 'panel'"><rect x="4" y="5" width="16" height="14" rx="2.5" /><path d="M8 15v-3M12 15V9M16 15v-5" /></g>
      <g v-else-if="icon === 'team'"><circle cx="9" cy="9" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.8M17.5 14.2A5.5 5.5 0 0 1 21 19" /></g>
      <path v-else-if="icon === 'move'" d="M12 3v18M3 12h18M8 8l4-4 4 4M8 16l4 4 4-4" />
      <g v-else-if="icon === 'formation'"><circle cx="6" cy="14" r="2" /><circle cx="12" cy="10" r="2" /><circle cx="18" cy="14" r="2" /><path d="M4 20h16" /></g>
      <path v-else-if="icon === 'wander'" d="M4 17c3-9 5 3 8-5s5 3 8-5" />
      <g v-else-if="icon === 'battle'"><path d="m5 5 8 8M5 5h4M5 5v4M19 5l-8 8M19 5h-4M19 5v4M7 17l-2 2M17 17l2 2M9 15l-3 3M15 15l3 3" /></g>
      <rect v-else-if="icon === 'stop'" x="6" y="6" width="12" height="12" rx="2" />
      <g v-else-if="icon === 'search'"><circle cx="11" cy="11" r="6" /><path d="m20 20-4.2-4.2" /></g>
      <path v-else-if="icon === 'sliders'" d="M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6" />
      <g v-else-if="icon === 'tools'"><path d="M14.5 6.5a4 4 0 0 0 4.8 4.8L10 20.6a2 2 0 0 1-2.8-2.8l9.3-9.3a4 4 0 0 0-2-2Z" /></g>
      <g v-else-if="icon === 'photo'"><rect x="3.5" y="6" width="17" height="13" rx="2.5" /><circle cx="12" cy="12.5" r="3.2" /><path d="M8.5 6 9.6 4h4.8l1.1 2" /></g>
    </svg>
    <span>{{ label }}</span>
  </button>
</template>
