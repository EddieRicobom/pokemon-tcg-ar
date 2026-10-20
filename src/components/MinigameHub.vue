<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { loadPieces } from '../app/game-pieces';
import type { LoadedPieces } from '../app/game-pieces';
import { getCache } from '../app/services';
import { recordEvent, trainer } from '../app/trainer-store';
import { addCoins } from '../app/wallet';
import { GAME_LABELS_PT, gameBlocker, MEMORY_PAIRS, memoryUsesCards, MINIGAME_WIN_COINS, minigameCoinReward } from '../core/minigames';
import type { GameId, Grade, Piece } from '../core/minigames';
import { loadDexNames } from '../app/dex-names';
import { prepareDexRound } from '../app/dex-quiz';
import { seededRng } from '../core/battle';
import { dexIdsFor, dexPieces } from '../core/dex';
import { XP } from '../core/trainer';
import MinigameMemoria from './MinigameMemoria.vue';
import MinigameQuem from './MinigameQuem.vue';
import MinigameTipos from './MinigameTipos.vue';

/**
 * Os minigames (Quem é esse Pokémon?, Tipos, Memória) em um só lugar: a lista com o melhor resultado e o jogo ativo.
 * Aparece no Treinador e no Fliperama da Vila; as partidas contam do mesmo jeito (`recordEvent`), onde quer que se jogue.
 */
defineProps<{ /** Mostra «Sair» no fim (no Fliperama da Vila, onde não há outra saída). */ closable?: boolean }>();
const emit = defineEmits<{ leave: [] }>();

const GAMES: GameId[] = ['quem', 'tipos', 'memoria'];
const loaded = ref<LoadedPieces | null>(null);
const active = ref<GameId | null>(null);
const loadingPieces = ref(true);
const coinReward = ref(0);

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
onBeforeUnmount(() => {
  loaded.value?.release();
  dropDexMemory();
});

/**
 * Memória sem cartas que bastem: sorteia `MEMORY_PAIRS` Pokémon da Pokédex (com a imagem baixada de cada um), do mesmo
 * jeito que o "Quem é esse Pokémon?" no modo aleatório.
 */
const dexMemory = ref<{ pieces: Piece[]; urls: Map<string, string>; release: () => void } | null>(null);
const memoryLoading = ref(false);
const memoryError = ref('');
function dropDexMemory(): void {
  dexMemory.value?.release();
  dexMemory.value = null;
}
async function play(id: GameId): Promise<void> {
  memoryError.value = '';
  if (id !== 'memoria' || memoryUsesCards(loaded.value?.pieces ?? [])) {
    active.value = id;
    return;
  }
  memoryLoading.value = true;
  try {
    dropDexMemory();
    const names = await loadDexNames();
    const rng = seededRng((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
    const round = await prepareDexRound(dexPieces(dexIdsFor({ kind: 'random' }, names), names), rng, undefined, undefined, undefined, MEMORY_PAIRS);
    dexMemory.value = { pieces: round.questions.map((q) => q.piece), urls: round.urls, release: round.release };
    active.value = 'memoria';
  } catch (e) {
    memoryError.value = e instanceof Error ? e.message : 'Não foi possível sortear os Pokémon.';
  } finally {
    memoryLoading.value = false;
  }
}

function onFinished(game: GameId, grade: Grade): void {
  recordEvent({ type: 'minigame', game, won: grade.won, score: grade.score });
  const baseReward = minigameCoinReward(grade.won);
  coinReward.value = baseReward > 0 ? addCoins(baseReward) : 0;
}
</script>

<template>
  <div v-if="active" class="card">
    <h2>{{ GAME_LABELS_PT[active].title }}</h2>
    <MinigameQuem v-if="active === 'quem'" :pieces="loaded?.pieces ?? []" :urls="loaded?.urls ?? new Map()" :reward-coins="coinReward" @finished="(g) => onFinished('quem', g)" @leave="active = null" />
    <MinigameTipos v-else-if="active === 'tipos'" :reward-coins="coinReward" @finished="(g) => onFinished('tipos', g)" @leave="active = null" />
    <MinigameMemoria v-else :pieces="dexMemory?.pieces ?? loaded?.pieces ?? []" :urls="dexMemory?.urls ?? loaded?.urls ?? new Map()" :reward-coins="coinReward" @finished="(g) => onFinished('memoria', g)" @leave="active = null" />
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
        <button type="button" class="primary" :disabled="loadingPieces || memoryLoading || g.blocker !== null" @click="play(g.id)">{{ memoryLoading && g.id === 'memoria' ? 'Sorteando…' : 'Jogar' }}</button>
      </li>
    </ul>
    <p v-if="memoryError" class="hint" role="alert">{{ memoryError }}</p>
    <p class="note">Cada vitória rende {{ MINIGAME_WIN_COINS }} moedas de bônus. As {{ XP.minigamesPerDay }} primeiras vitórias do dia também dão {{ XP.minigameWin }} XP; todo XP ganho também credita moedas. Sem cartas, os Pokémon são sorteados da Pokédex; com cartas, "Quem é" e Memória podem usar as suas.</p>
    <button v-if="closable" type="button" class="link game-back" @click="emit('leave')">Sair do Fliperama</button>
  </div>
</template>
