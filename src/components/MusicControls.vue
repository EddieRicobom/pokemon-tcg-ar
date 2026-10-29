<script setup lang="ts">
defineProps<{ enabled: boolean; volume: number; effectsVolume?: number; attackSounds?: boolean; track?: string; unavailable?: boolean; regional?: boolean }>();
defineEmits<{ 'update:enabled': [value: boolean]; 'update:volume': [value: number]; 'update:effectsVolume': [value: number]; 'update:attackSounds': [value: boolean]; unlock: [] }>();
</script>

<template>
  <fieldset class="music-controls" @pointerdown.stop="$emit('unlock')" @keydown="$emit('unlock')" @click.stop>
    <legend>Música e sons</legend>
    <button type="button" :aria-pressed="enabled" @click="$emit('update:enabled', !enabled); $emit('unlock')">Música: {{ enabled ? 'ligada' : 'desligada' }}</button>
    <label>Música · {{ volume }}%<input type="range" min="0" max="100" step="5" :value="volume" aria-label="Volume da música" @input="$emit('update:volume', Number(($event.target as HTMLInputElement).value))" /></label>
    <label v-if="effectsVolume !== undefined">Efeitos · {{ effectsVolume }}%<input type="range" min="0" max="100" step="5" :value="effectsVolume" aria-label="Volume dos efeitos da Vila" @input="$emit('update:effectsVolume', Number(($event.target as HTMLInputElement).value))" /></label>
    <button v-if="attackSounds !== undefined" type="button" :aria-pressed="attackSounds" @click="$emit('update:attackSounds', !attackSounds)">Ataques: {{ attackSounds ? 'ligados' : 'desligados' }}</button>
    <small v-if="enabled && track">♫ {{ track }}</small>
    <small v-if="unavailable" role="status">Áudio indisponível ou bloqueado pelo navegador. Toque em Música para tentar novamente.</small>
    <small>Arranjos GBA: <a href="https://www.youtube.com/@MeeowsMusic" target="_blank" rel="noopener noreferrer">Meeow’s Music</a>.<template v-if="regional"> Demais temas: composições Pokémon, fonte <a href="https://github.com/pagefaultgames/pokerogue-assets/blob/beta/audio/REUSE.toml" target="_blank" rel="noopener noreferrer">PokeRogue</a>, com tratamento retrô local.</template></small>
  </fieldset>
</template>

<style scoped>
.music-controls { display: flex; flex-wrap: wrap; align-items: center; gap: .65rem; border: 1px solid var(--border, #465269); border-radius: 12px; padding: .7rem; min-width: 0; text-align: left; }
legend { font-weight: 700; }
label { display: grid; gap: .2rem; font-size: .85rem; flex: 1 1 130px; }
input { width: 100%; min-height: 36px; accent-color: #d6b659; }
small { flex-basis: 100%; overflow-wrap: anywhere; }
</style>
