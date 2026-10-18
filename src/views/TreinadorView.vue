<script setup lang="ts">
import { computed, ref } from 'vue';
import { applyFullBackup, backupFileName, buildFullBackup, parseBackup, parseBackupZip, serializeBackupZip } from '../app/backup';
import type { BackupFile } from '../app/backup';
import { routeFlags, routeHref } from '../app/route';
import { coins } from '../app/wallet';
import { trainer } from '../app/trainer-store';
import LeagueCard from '../components/LeagueCard.vue';
import MinigameHub from '../components/MinigameHub.vue';
import TrainerAvatar from '../components/TrainerAvatar.vue';
import { itemDef } from '../core/village/catalog';
import { prizeOf } from '../core/village/rewards';
import { ACHIEVEMENTS, dayKey, levelProgress, missionsFor, previousDay, XP } from '../core/trainer';
import { nextUnlock, townStage } from '../core/village/town';
import { LOTS } from '../core/village/town-layout';

/**
 * O Treinador mostra uma seção por vez (antes era tudo empilhado: ~6.000 px de rolagem no celular). O topo (nível,
 * moedas, sequência) fica sempre à vista; `#/treinador?jogos=1` abre direto nos minigames.
 */
type Section = 'resumo' | 'liga' | 'jogos' | 'colecao' | 'dados';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'liga', label: 'Liga' },
  { id: 'jogos', label: 'Jogos' },
  { id: 'colecao', label: 'Coleção' },
  { id: 'dados', label: 'Dados' },
];
const section = ref<Section>(routeFlags(window.location.hash).has('jogos') ? 'jogos' : 'resumo');

const today = computed(() => dayKey(new Date()));
const progress = computed(() => levelProgress(trainer.value.xp));
const town = computed(() => ({ stage: townStage(progress.value.level), next: nextUnlock(progress.value.level), lots: LOTS.filter((l) => progress.value.level >= l.unlock).length }));
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
  ACHIEVEMENTS.map((a) => {
    const prize = prizeOf(a.id);
    const item = prize?.item ? itemDef(prize.item)?.name : undefined;
    return { id: a.id, title: a.title, hint: a.hint, unlocked: trainer.value.achievements[a.id] !== undefined, prize: prize ? [`${prize.coins} moedas`, item].filter(Boolean).join(' + ') : '' };
  }),
);
const unlockedCount = computed(() => achievements.value.filter((a) => a.unlocked).length);
const cardCount = computed(() => trainer.value.cardIds.length);

// ---- Seus dados: backup completo do progresso e dos ajustes (ver `app/backup.ts`), sem servidor nenhum.
const backupStatus = ref<{ kind: 'erro' | 'ok'; text: string } | null>(null);
const pendingImport = ref<BackupFile | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

async function exportBackup(): Promise<void> {
  backupStatus.value = null;
  try {
    const file = await buildFullBackup(localStorage);
    const zip = serializeBackupZip(file);
    const blob = new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    backupStatus.value = { kind: 'ok', text: `Backup completo baixado (${file.collection?.cards.length ?? 0} cartas guardadas).` };
  } catch {
    backupStatus.value = { kind: 'erro', text: 'Não consegui ler todos os dados do aparelho. Confira o espaço e tente novamente.' };
  }
}

function pickImportFile(): void {
  backupStatus.value = null;
  fileInput.value?.click();
}

async function onImportFileChosen(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const picked = input.files?.[0] ?? null;
  input.value = '';
  if (!picked) return;
  const parsed = picked.name.toLowerCase().endsWith('.zip')
    ? parseBackupZip(new Uint8Array(await picked.arrayBuffer()))
    : parseBackup(await picked.text());
  if (parsed === 'json-invalido') {
    backupStatus.value = { kind: 'erro', text: 'Esse arquivo não é um JSON válido.' };
    return;
  }
  if (parsed === 'formato-desconhecido') {
    backupStatus.value = { kind: 'erro', text: 'Esse arquivo não parece ser um backup deste app.' };
    return;
  }
  if (typeof parsed === 'string') {
    backupStatus.value = { kind: 'erro', text: parsed === 'versao-incompativel' ? 'Este backup foi criado por uma versão incompatível do app.' : 'O backup está corrompido ou incompleto.' };
    return;
  }
  pendingImport.value = parsed;
}

function backupDateLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'data desconhecida' : d.toLocaleString('pt-BR');
}

async function confirmImport(): Promise<void> {
  if (!pendingImport.value) return;
  try {
    await applyFullBackup(pendingImport.value, localStorage);
    pendingImport.value = null;
  // Vários dados (Treinador, perfil…) ficam em memória desde que o app abriu; a forma simples e segura de
  // garantir que tudo reflita o backup importado é recarregar a página — ela lê tudo de novo do zero.
  window.location.reload();
  } catch {
    backupStatus.value = { kind: 'erro', text: 'Não consegui restaurar todos os dados. O aparelho pode estar sem espaço.' };
  }
}

function cancelImport(): void {
  pendingImport.value = null;
}
</script>

<template>
  <section class="trainer" aria-labelledby="trainer-title">
    <h2 id="trainer-title" class="sr-only">Treinador</h2>

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
        <p class="trainer-xp"><span class="coin-mark" aria-hidden="true"></span>{{ coins }} moedas · <a :href="routeHref('pins')">use nos Pins</a>, na Fonte da Vila e na loja</p>
        <p class="trainer-xp trainer-town">
          Cidade da Vila: {{ town.stage.name }} ({{ town.lots }} de {{ LOTS.length }} terrenos liberados)<template v-if="town.next">; no nível {{ town.next.level }} chega {{ town.next.text }}</template>.
          <a :href="routeHref('vila')">Visitar a Vila</a>
        </p>
        <p class="streak" :class="streak.state">
          <span class="flame" aria-hidden="true"></span>
          <template v-if="streak.state === 'ativa'">Sequência de {{ streak.days }} dia{{ streak.days === 1 ? '' : 's' }}</template>
          <template v-else-if="streak.state === 'em-risco'">Sequência de {{ streak.days }} dia{{ streak.days === 1 ? '' : 's' }}: jogue hoje para manter</template>
          <template v-else>Sem sequência: jogue hoje para começar</template>
          <small v-if="streak.best > 0">recorde {{ streak.best }}</small>
        </p>
      </div>
    </div>

    <nav class="trainer-sections" aria-label="Seções do Treinador">
      <button
        v-for="s in SECTIONS"
        :key="s.id"
        type="button"
        :class="{ active: section === s.id }"
        :aria-current="section === s.id ? 'true' : undefined"
        @click="section = s.id"
      >
        {{ s.label }}<b v-if="s.id === 'resumo' && !allDone" class="dot" aria-label="missões em aberto"></b>
      </button>
    </nav>

    <template v-if="section === 'resumo'">
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
      <h2>Seu treinador</h2>
      <TrainerAvatar />
    </div>
    </template>

    <LeagueCard v-else-if="section === 'liga'" />

    <template v-else-if="section === 'jogos'">
    <MinigameHub />

    <div class="card">
      <h2>Como ganhar XP</h2>
      <ul class="earn">
        <li><b>+{{ XP.newCard }}</b> carta nova escaneada</li>
        <li><b>+{{ XP.repeatCardDaily }}</b> carta já conhecida (a primeira leitura de cada dia)</li>
        <li><b>+{{ XP.battle }}</b> batalha vista até o fim (as {{ XP.battlesPerDay }} primeiras do dia)</li>
        <li><b>+{{ XP.minigameWin }}</b> minigame vencido (as {{ XP.minigamesPerDay }} primeiras do dia)</li>
        <li><b>+{{ XP.streakPerDay }}</b> por dia de sequência, até +{{ XP.streakMax }}, no primeiro feito do dia</li>
      </ul>
      <p class="note">Todo XP ganho também vira a mesma quantia de moedas (o saldo único do app: Pins, forma Mega, Fonte e loja da Vila). O XP em si não é gasto: o nível continua subindo.</p>
      <a class="primary link-button" :href="routeHref('escanear')">Escanear uma carta</a>
    </div>
    </template>

    <template v-else-if="section === 'colecao'">
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
      <p class="note">Cada conquista rende moedas e, nas marcantes, um acessório exclusivo para o seu personagem. Os prêmios chegam quando você abre a Vila.</p>
      <ul class="badges">
        <li v-for="a in achievements" :key="a.id" :class="{ on: a.unlocked }">
          <span class="medal" aria-hidden="true">{{ a.unlocked ? '★' : '☆' }}</span>
          <strong>{{ a.title }}</strong>
          <small>{{ a.hint }}</small>
          <small v-if="a.prize" class="prize">🎁 {{ a.prize }}</small>
        </li>
      </ul>
    </div>
    </template>

    <div v-else class="card">
      <h2>Seus dados</h2>
      <p class="note">
        Baixe um ZIP com todo o progresso, ajustes, cartas reconhecidas e arquivos locais (referências, sprites e alvos de AR) para guardar fora do navegador ou levar para outro aparelho.
        Os dados são validados antes da restauração; caches que não pertencem ao app ficam fora.
      </p>
      <div class="backup-actions">
        <button type="button" @click="exportBackup">Baixar backup</button>
        <button type="button" @click="pickImportFile">Importar backup</button>
        <input ref="fileInput" type="file" accept=".zip,application/zip,application/json" class="sr-only" @change="onImportFileChosen" />
      </div>
      <p v-if="backupStatus" class="note" :class="backupStatus.kind">{{ backupStatus.text }}</p>
      <div v-if="pendingImport" class="card backup-confirm">
        <p><strong>Importar este backup vai substituir os dados, as cartas guardadas e os ajustes deste aparelho.</strong></p>
        <p class="note">Backup de {{ backupDateLabel(pendingImport.exportedAt) }}.</p>
        <p v-if="!pendingImport.collection" class="note">Este backup antigo não contém a coleção local; as cartas deste aparelho serão mantidas por compatibilidade.</p>
        <div class="backup-actions">
          <button type="button" class="primary" @click="confirmImport">Confirmar e substituir</button>
          <button type="button" @click="cancelImport">Cancelar</button>
        </div>
      </div>
    </div>
  </section>
</template>
