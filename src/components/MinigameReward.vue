<script setup lang="ts">
defineProps<{ won: boolean; coins: number }>();
</script>

<template>
  <p v-if="won && coins > 0" class="note" role="status">Prêmio da vitória: +{{ coins }} moedas.</p>
</template>
