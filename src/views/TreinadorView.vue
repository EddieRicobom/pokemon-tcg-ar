<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { loadPieces } from '../app/game-pieces';
import type { LoadedPieces } from '../app/game-pieces';
import { routeHref } from '../app/route';
import { getCache } from '../app/services';
import { recordEvent, trainer } from '../app/trainer-store';
import MinigameMemoria from '../components/MinigameMemoria.vue';
import MinigameQuem from '../components/MinigameQuem.vue';
import MinigameTipos from '../components/MinigameTipos.vue';
import { GAME_LABELS_PT, gameBlocker } from '../core/minigames';
import type { GameId, Grade } from '../core/minigames';
import { ACHIEVEMENTS, dayKey, levelProgress, missionsFor, previousDay, XP } from '../core/trainer';

const today = computed(() => dayKey(new Date()));
const progress = computed(() => levelProgress(trainer.value.xp));
const RING = 2 * Math.PI * 46;

const missions = computed(() => {
  const state = trainer.value;
  const sameDay = state.today.day === today.value;
  return missionsFor(today.value).map((mission) => {
    const done = sameDay && state.today.done.includes(mission.id);
    const have = sameDay ? Math.min(state.today.progress[mission.kind] ?? 0, mission.target) : 0;
    return { ...mission, done, have, frac: done ? 1 : have / mission.target };
  });
});
const allDone = computed(() => missions.value.every((m) => m.done));

/** Sequência que ainda vale: hoje ou ontem. Se foi ontem, falta jogar hoje para ela continuar. */
const streak = computed(() => {
  const { current, best, lastDay } = trainer.value.streak;
  if (lastDay === today.value) return { days: current, best, state: 'ativa' as const };
  if (lastDay === previousDay(today.value) && current > 0) return { days: current, best, state: 'em-risco' as const };
  return { days: 0, best, state: 'parada' as const };
});

const sets = computed(() =>
  Object.entries(trainer.value.sets)
    .map(([id, set]) => ({ id, name: set.name, have: set.ids.length, total: Math.max(set.total, set.ids.length) }))
    .sort((a, b) => b.have / b.total - a.have / a.total || b.have - a.have)
    .slice(0, 8),
);

const achievements = computed(() =>
  ACHIEVEMENTS.map((a) => ({ id: a.id, title: a.title, hint: a.hint, unlocked: trainer.value.achievements[a.id] !== undefined })),
);
const unlockedCount = computed(() => achievements.value.filter((a) => a.unlocked).length);
const cardCount = computed(() => trainer.value.cardIds.length);

// ---- minigames
const GAMES: GameId[] = ['quem', 'tipos', 'memoria'];
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
  <section class="trainer" aria-labelledby="trainer-title">
    <h2 id="trainer-title" class="sr-only">Treinador</h2>

    <div v-if="active" class="card">
      <h2>{{ GAME_LABELS_PT[active].title }}</h2>
      <MinigameQuem v-if="active === 'quem'" :pieces="loaded?.pieces ?? []" :urls="loaded?.urls ?? new Map()" @finished="(g) => onFinished('quem', g)" @leave="active = null" />
      <MinigameTipos v-else-if="active === 'tipos'" @finished="(g) => onFinished('tipos', g)" @leave="active = null" />
      <MinigameMemoria v-else :pieces="loaded?.pieces ?? []" :urls="loaded?.urls ?? new Map()" @finished="(g) => onFinished('memoria', g)" @leave="active = null" />
      <button type="button" class="link game-back" @click="active = null">Voltar ao Treinador</button>
    </div>

    <template v-else>
    <div class="card trainer-head">
      <div class="level-ring" role="img" :aria-label="`Nível ${progress.level}, ${Math.round(progress.frac * 100)}% do caminho para o próximo`">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle class="track" cx="50" cy="50" r="46" />
          <circle class="fill" cx="50" cy="50" r="46" :stroke-dasharray="RING" :stroke-dashoffset="RING * (1 - progress.frac)" />
        </svg>
        <span><small>Nível</small><strong>{{ progress.level }}</strong></span>
      </div>
      <div class="trainer-who">
        <p class="trainer-title">{{ progress.title }}</p>
        <p class="trainer-xp">{{ trainer.xp }} XP · faltam {{ progress.span - progress.into }} para o nível {{ progress.level + 1 }}</p>
        <p class="trainer-xp"><span class="bolt" aria-hidden="true"></span>{{ trainer.energy }} de energia · <a :href="routeHref('pins')">gaste no Pin Mode</a></p>
        <p class="streak" :class="streak.state">
          <span class="flame" aria-hidden="true"></span>
          <template v-if="streak.state === 'ativa'">Sequência de {{ streak.days }} dia{{ streak.days === 1 ? '' : 's' }}</template>
          <template v-else-if="streak.state === 'em-risco'">Sequência de {{ streak.days }} dia{{ streak.days === 1 ? '' : 's' }}: jogue hoje para manter</template>
          <template v-else>Sem sequência: jogue hoje para começar</template>
          <small v-if="streak.best > 0">recorde {{ streak.best }}</small>
        </p>
      </div>
    </div>

    <div class="card">
      <h2>Missões de hoje</h2>
      <ul class="missions">
        <li v-for="m in missions" :key="m.id" :class="{ done: m.done }">
          <span class="check" aria-hidden="true">{{ m.done ? '✓' : '' }}</span>
          <span class="m-text">
            <strong>{{ m.label }}</strong>
            <i class="bar"><b :style="{ width: m.frac * 100 + '%' }"></b></i>
          </span>
          <span class="m-count">{{ m.have }}/{{ m.target }}</span>
        </li>
      </ul>
      <p class="note">
        Cada missão vale {{ XP.mission }} XP; cumprir as três hoje dá mais {{ XP.allMissions }} XP.
        <strong v-if="allDone"> Todas cumpridas, volte amanhã!</strong>
      </p>
    </div>

    <div class="card">
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
    </div>

    <div class="card">
      <h2>Como ganhar XP</h2>
      <ul class="earn">
        <li><b>+{{ XP.newCard }}</b> carta nova escaneada</li>
        <li><b>+{{ XP.repeatCardDaily }}</b> carta já conhecida (a primeira leitura de cada dia)</li>
        <li><b>+{{ XP.battle }}</b> batalha vista até o fim (as {{ XP.battlesPerDay }} primeiras do dia)</li>
        <li><b>+{{ XP.minigameWin }}</b> minigame vencido (as {{ XP.minigamesPerDay }} primeiras do dia)</li>
        <li><b>+{{ XP.streakPerDay }}</b> por dia de sequência, até +{{ XP.streakMax }}, no primeiro feito do dia</li>
      </ul>
      <p class="note">Todo XP ganho vira a mesma quantia de energia para o Pin Mode. O XP em si não é gasto: o nível continua subindo.</p>
      <a class="primary link-button" :href="routeHref('escanear')">Escanear uma carta</a>
    </div>

    <div class="card">
      <h2>Coleção <small class="count">{{ cardCount }} carta{{ cardCount === 1 ? '' : 's' }} diferente{{ cardCount === 1 ? '' : 's' }}</small></h2>
      <p v-if="sets.length === 0" class="note">Nada por aqui ainda. Escaneie uma carta para abrir a primeira coleção.</p>
      <ul v-else class="sets">
        <li v-for="set in sets" :key="set.id">
          <span class="s-name">{{ set.name }}</span>
          <i class="bar"><b :style="{ width: Math.min(100, (set.have / set.total) * 100) + '%' }"></b></i>
          <span class="s-count">{{ set.have }}/{{ set.total }}</span>
        </li>
      </ul>
    </div>

    <div class="card">
      <h2>Conquistas <small class="count">{{ unlockedCount }} de {{ achievements.length }}</small></h2>
      <ul class="badges">
        <li v-for="a in achievements" :key="a.id" :class="{ on: a.unlocked }">
          <span class="medal" aria-hidden="true">{{ a.unlocked ? '★' : '·' }}</span>
          <strong>{{ a.title }}</strong>
          <small>{{ a.hint }}</small>
        </li>
      </ul>
    </div>
    </template>
  </section>
</template>
