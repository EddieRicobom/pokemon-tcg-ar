<script setup lang="ts">
withDefaults(defineProps<{ title: string; titleId: string; icon?: string; back?: { label: string; run: () => void }; closeLabel?: string }>(), { closeLabel: 'Fechar' });
defineEmits<{ close: [] }>();
</script>

<template>
  <header class="village-sheet-header">
    <button v-if="back" type="button" class="link village-sheet-back" @click="back.run">← {{ back.label }}</button>
    <strong :id="titleId"><span v-if="icon" aria-hidden="true">{{ icon }} </span>{{ title }}</strong>
    <button type="button" class="village-sheet-close" :aria-label="`${closeLabel} ${title}`" @click="$emit('close')">✕</button>
    <div v-if="$slots.actions" class="village-sheet-actions"><slot name="actions" /></div>
  </header>
</template>
