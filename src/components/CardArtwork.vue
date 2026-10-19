<script setup lang="ts">
import { ref, watch } from 'vue';

const props = withDefaults(defineProps<{ src: string; alt: string; card?: boolean; lazy?: boolean }>(), { card: false, lazy: true });
const loaded = ref(false);
const failed = ref(false);
watch(() => props.src, () => { loaded.value = false; failed.value = false; });
</script>

<template>
  <span class="card-artwork" :class="{ card, loading: !loaded && !failed, failed }" aria-hidden="true">
    <span v-if="!loaded && !failed" class="card-artwork-skeleton"></span>
    <img :src="props.src" :alt="props.alt" :loading="props.lazy ? 'lazy' : 'eager'" @load="loaded = true" @error="failed = true" />
    <span v-if="failed" class="card-artwork-fallback">Carta indisponível</span>
  </span>
</template>
