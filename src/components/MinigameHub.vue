<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { loadPieces } from '../app/game-pieces';
import type { LoadedPieces } from '../app/game-pieces';
import { getCache } from '../app/services';
import { recordEvent, trainer } from '../app/trainer-store';
import { GAME_LABELS_PT, gameBlocker } from '../core/minigames';
import type { GameId, Grade } from '../core/minigames';
import { XP } from '../core/trainer';
import MinigameMemoria from './MinigameMemoria.vue';
import MinigameQuem from './MinigameQuem.vue';
import MinigameSobrevivencia from './MinigameSobrevivencia.vue';
import MinigameTipos from './MinigameTipos.vue';

/**
 * Os minigames (Quem é esse Pokémon?, Tipos, Memória, Zona de Sobrevivência) em um só lugar: a lista com o
 * melhor resultado e o jogo ativo. Aparece no Treinador e no Fliperama da Vila; as partidas contam do mesmo
 * jeito (`recordEvent`), onde quer que se jogue.
 */
defineProps<{ /** Mostra «Sair» no fim (no Fliperama da Vila, onde não há outra saída). */ closable?: boolean }>();
const emit = defineEmits<{ leave: [] }>();

const GAMES: GameId[] = ['quem', 'tipos', 'memoria', 'sobrevivencia'];
const loaded = ref<LoadedPieces | null>(null);
const active = ref<GameId | null>(null);
const loadingPieces = ref(true);

const gameRows = computed(() =>
  GAMES.map((id) => ({
    id,
    ...GAME_LABELS_PT[id],
    blocker: loadingPieces.value ? null : gameBlocker(id, loaded.value?.pieces ?? []),
    best: trainer.value.games[id]?.best ?? null,
    played: trainer.value.games[id]?.played ?? 0,
  })),
);

onMounted(async () => {
  try {
    loaded.value = await loadPieces(await getCache());
  } catch {
    loaded.value = null;
  } finally {
    loadingPieces.value = false;
  }
});
onBeforeUnmount(() => loaded.value?.release());

function onFinished(game: GameId, grade: Grade): void {
  recordEvent({ type: 'minigame', game, won: grade.won, score: grade.score });
}
</script>

<template>
  <div v-if="active" class="card">
    <h2>{{ GAME_LABELS_PT[active].title }}</h2>
    <MinigameQuem v-if="active === 'quem'" :pieces="loaded?.pieces ?? []" :urls="loaded?.urls ?? new Map()" @finished="(g) => onFinished('quem', g)" @leave="active = null" />
    <MinigameTipos v-else-if="active === 'tipos'" @finished="(g) => onFinished('tipos', g)" @leave="active = null" />
    <MinigameMemoria v-else-if="active === 'memoria'" :pieces="loaded?.pieces ?? []" :urls="loaded?.urls ?? new Map()" @finished="(g) => onFinished('memoria', g)" @leave="active = null" />
    <MinigameSobrevivencia v-else @finished="(g) => onFinished('sobrevivencia', g)" @leave="active = null" />
    <button type="button" class="link game-back" @click="active = null">Voltar aos jogos</button>
  </div>
  <div v-else class="card">
    <h2>Minigames</h2>
    <ul class="games">
      <li v-for="g in gameRows" :key="g.id">
        <span class="g-text">
          <strong>{{ g.title }}</strong>
          <small>{{ g.blurb }}</small>
          <small v-if="g.blocker" class="g-blocker">{{ g.blocker }}</small>
          <small v-else-if="g.best !== null" class="g-best">Melhor: {{ g.best }} pontos · {{ g.played }} partida{{ g.played === 1 ? '' : 's' }}</small>
        </span>
        <button type="button" class="primary" :disabled="loadingPieces || g.blocker !== null" @click="active = g.id">Jogar</button>
      </li>
    </ul>
    <p class="note">Vencer rende {{ XP.minigameWin }} XP (nas {{ XP.minigamesPerDay }} primeiras vitórias do dia). Quanto mais cartas você escanear, mais jogos libera.</p>
    <button v-if="closable" type="button" class="link game-back" @click="emit('leave')">Sair do Fliperama</button>
  </div>
</template>
