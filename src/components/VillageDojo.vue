<script setup lang="ts">
import { computed, ref } from 'vue';
import { trainer } from '../app/trainer-store';
import { buyLesson, buyTraining, dojoOpen, lessonBlock, nextDojoUpgrade, toggleTowerOption, trainingBlock, trainingLevel, upgradeDojo } from '../core/village/dojo';
import { count, describeCost } from '../core/village/life';
import type { VillageState } from '../core/village/life';
import { itemName } from '../core/village/life';
import { DOJO_LEVELS, LESSON_IDS, LESSONS, TRAINING_IDS, TRAINING_PIECES, TRAININGS } from '../core/village/tower-state';
import { paintItemIcon } from '../village/item-art';

/**
 * Painel do Dojô da Torre: reformas, treinos e Lições do Instrutor (Survival e BONK). As regras e as mensagens vêm de
 * `core/village/dojo.ts`; aqui só se mostra o estado e se chama a compra. Os números estão em docs/PROGRESSAO_TORRE.md.
 */
const props = defineProps<{ state: VillageState; population: number; instructorName?: string | null }>();
const emit = defineEmits<{ changed: [] }>();

const open = computed(() => dojoOpen(props.population));
const message = ref<{ ok: boolean; text: string } | null>(null);
const level = computed(() => props.state.tower.dojoLevel);
const levelName = computed(() => (level.value === 0 ? 'Sem Dojô' : DOJO_LEVELS[level.value - 1]!.name));
const upgrade = computed(() => nextDojoUpgrade(props.state));
const upgradeCost = computed(() => (upgrade.value ? describeCost(props.state, upgrade.value.cost) : ''));
const upgradeBlock = computed(() => {
  const next = upgrade.value;
  if (!next) return null;
  if (props.state.coins < next.coins) return `Faltam ${next.coins - props.state.coins} moedas.`;
  return null;
});
const pieces = computed(() => TRAINING_PIECES.map((id) => ({ id, name: itemName(id), qty: count(props.state, id) })));

/** O Instrutor só comenta o que o Treinador realmente registrou na última corrida da Torre. */
const coachLine = computed(() => {
  if (!open.value) return 'O Dojô está fechado: a Vila precisa de mais moradores para eu assumir o posto.';
  const last = trainer.value.torre?.recentRuns?.at(-1);
  if (!last) return 'Ainda não vi você correr na Torre. Treinar antes ajuda, mas o melhor professor é a primeira corrida.';
  const minutes = Math.floor(last.survivedMs / 60_000);
  const time = minutes >= 1 ? `${minutes} min` : `${Math.max(1, Math.round(last.survivedMs / 1000))} s`;
  if (last.cleared) return `Você zerou a Torre na última corrida (${time})! Que tal ensinar o seu Pokémon a escolher melhor as cartas?`;
  return `Na última corrida você aguentou ${time}, chegou à onda ${last.wave} e derrotou ${last.kills}. Vamos reforçar o que falta?`;
});

const iconCache = new Map<string, string>();
function icon(id: string): string {
  let url = iconCache.get(id);
  if (url) return url;
  const buf = paintItemIcon(id);
  const canvas = document.createElement('canvas');
  canvas.width = buf.w;
  canvas.height = buf.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const data = ctx.createImageData(buf.w, buf.h);
  data.data.set(buf.data);
  ctx.putImageData(data, 0, 0);
  url = canvas.toDataURL();
  iconCache.set(id, url);
  return url;
}

function done(result: { ok: boolean; message: string }): void {
  message.value = { ok: result.ok, text: result.message };
  if (result.ok) emit('changed');
}
const disabled = (id: string): boolean => props.state.tower.disabled.includes(id);
function toggle(id: string): void {
  if (toggleTowerOption(props.state, id)) emit('changed');
}
function trainingLevels(id: (typeof TRAINING_IDS)[number]): number[] {
  return TRAININGS[id].coins.map((_, i) => i);
}
</script>

<template>
  <section class="dojo" aria-labelledby="dojo-title">
    <header class="dojo-head">
      <h3 id="dojo-title">🥋 Dojô da Torre</h3>
      <p class="dojo-coach"><strong v-if="instructorName">{{ instructorName }}:</strong> “{{ coachLine }}”</p>
      <p class="dojo-wallet"><span>🪙 <b>{{ state.coins }}</b> moedas</span><span>{{ levelName }}</span></p>
      <p v-if="!open" class="dojo-warning" role="status">Dojô fechado. Você mantém tudo o que já aprendeu, mas só pode comprar novidades com o Instrutor no posto.</p>
    </header>

    <p v-if="message" class="dojo-message" :class="{ bad: !message.ok }" role="status">{{ message.text }}</p>

    <section class="dojo-block" aria-labelledby="dojo-pieces">
      <h4 id="dojo-pieces">Peças de treino</h4>
      <ul class="dojo-pieces">
        <li v-for="piece in pieces" :key="piece.id" :class="{ empty: piece.qty === 0 }"><img :src="icon(piece.id)" alt="" width="32" height="32" /><span>{{ piece.name }}</span><b>{{ piece.qty }}</b></li>
      </ul>
      <p class="dojo-hint">As peças são fabricadas no menu <b>Fabricar</b>, com os materiais da Vila (ferro, vidro, tecido, lã, peixe-dourado…).</p>
    </section>

    <section class="dojo-block" aria-labelledby="dojo-reform">
      <h4 id="dojo-reform">Reformas</h4>
      <ol class="dojo-levels">
        <li v-for="step in DOJO_LEVELS" :key="step.level" :class="{ done: level >= step.level, next: level + 1 === step.level }">
          <span class="dojo-icon" aria-hidden="true">{{ step.icon }}</span>
          <span><b>{{ step.name }}</b><small>{{ step.coins }} moedas · {{ describeCost(state, step.cost) }}</small></span>
          <em v-if="level >= step.level">Pronto</em>
        </li>
      </ol>
      <button v-if="upgrade" type="button" class="dojo-buy" :disabled="!open" @click="done(upgradeDojo(state, open))">
        {{ upgrade.icon }} Reformar para {{ upgrade.name }} ({{ upgrade.coins }})
      </button>
      <p v-if="upgrade && upgradeBlock" class="dojo-hint">{{ upgradeBlock }} Materiais: {{ upgradeCost }}.</p>
      <p v-else-if="upgrade" class="dojo-hint">Materiais: {{ upgradeCost }}.</p>
      <p v-else class="dojo-hint">O Dojô já está no último nível.</p>
    </section>

    <section class="dojo-block" aria-labelledby="dojo-training">
      <h4 id="dojo-training">Treinos permanentes</h4>
      <ul class="dojo-list">
        <li v-for="id in TRAINING_IDS" :key="id">
          <div class="dojo-row">
            <span class="dojo-icon" aria-hidden="true">{{ TRAININGS[id].icon }}</span>
            <span class="dojo-text"><b>{{ TRAININGS[id].name }}</b><small>{{ TRAININGS[id].perLevel }} por nível</small></span>
            <span class="dojo-pips" :aria-label="`Nível ${trainingLevel(state, id)} de ${TRAININGS[id].coins.length}`"><i v-for="n in trainingLevels(id)" :key="n" :class="{ on: n < trainingLevel(state, id) }"></i></span>
          </div>
          <div class="dojo-actions">
            <button type="button" class="dojo-buy" :disabled="!open || trainingBlock(state, id) !== null" @click="done(buyTraining(state, id, open))">
              {{ trainingLevel(state, id) >= TRAININGS[id].coins.length ? 'No máximo' : `Treinar (${TRAININGS[id].coins[trainingLevel(state, id)]} + ${itemName(TRAININGS[id].piece)})` }}
            </button>
            <label v-if="trainingLevel(state, id) > 0" class="dojo-switch"><input type="checkbox" :checked="!disabled(id)" @change="toggle(id)" /> Usar nas corridas</label>
          </div>
          <p v-if="trainingBlock(state, id)" class="dojo-why">{{ trainingBlock(state, id) }}</p>
        </li>
      </ul>
    </section>

    <section class="dojo-block" aria-labelledby="dojo-lessons">
      <h4 id="dojo-lessons">Lições do Instrutor</h4>
      <ul class="dojo-list">
        <li v-for="id in LESSON_IDS" :key="id">
          <div class="dojo-row">
            <span class="dojo-icon" aria-hidden="true">{{ LESSONS[id].icon }}</span>
            <span class="dojo-text"><b>{{ LESSONS[id].name }}</b><small>{{ LESSONS[id].effect }}</small></span>
            <em v-if="state.tower.lessons.includes(id)" class="dojo-owned">Aprendida</em>
          </div>
          <div class="dojo-actions">
            <button v-if="!state.tower.lessons.includes(id)" type="button" class="dojo-buy" :disabled="!open || lessonBlock(state, id) !== null" @click="done(buyLesson(state, id, open))">
              Aprender ({{ LESSONS[id].coins }} + {{ LESSONS[id].pieces }}× {{ itemName(LESSONS[id].piece) }})
            </button>
            <label v-else class="dojo-switch"><input type="checkbox" :checked="!disabled(id)" @change="toggle(id)" /> Usar nas corridas</label>
          </div>
          <p v-if="!state.tower.lessons.includes(id) && lessonBlock(state, id)" class="dojo-why">{{ lessonBlock(state, id) }}</p>
        </li>
      </ul>
    </section>

    <p class="dojo-hint">Na seleção da Torre há a opção <b>Corrida pura</b>, que deixa o Dojô, a sorte do Carteiro e a marmita de fora (e tem recorde próprio). Vale para o Survival clássico e para o BONK.</p>
  </section>
</template>

<style scoped>
.dojo { display: grid; gap: 14px; padding: 4px 2px 16px; }
.dojo-head h3 { margin: 0 0 6px; font-size: 1.15rem; }
.dojo-coach { margin: 0 0 8px; line-height: 1.4; }
.dojo-wallet { display: flex; justify-content: space-between; gap: 8px; margin: 0; padding: 8px 12px; border-radius: 10px; background: rgba(0, 0, 0, .06); font-size: .95rem; }
.dojo-warning { margin: 8px 0 0; padding: 8px 12px; border-radius: 10px; background: #fff3cd; color: #5c4400; line-height: 1.35; }
.dojo-message { margin: 0; padding: 10px 12px; border-radius: 10px; background: #dff5e0; color: #1d4d24; line-height: 1.35; }
.dojo-message.bad { background: #fde1e1; color: #6a1b1b; }
.dojo-block { display: grid; gap: 8px; padding: 12px; border-radius: 12px; border: 1px solid rgba(0, 0, 0, .12); background: rgba(255, 255, 255, .55); }
.dojo-block h4 { margin: 0; font-size: 1rem; }
.dojo-pieces { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
.dojo-pieces li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; background: rgba(0, 0, 0, .05); font-size: .85rem; }
.dojo-pieces li.empty { opacity: .55; }
.dojo-pieces img { image-rendering: pixelated; flex: none; }
.dojo-pieces b { margin-left: auto; }
.dojo-levels, .dojo-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.dojo-levels li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: rgba(0, 0, 0, .04); }
.dojo-levels li.done { background: #dff5e0; }
.dojo-levels li.next { outline: 2px solid #c9902a; }
.dojo-levels small, .dojo-text small { display: block; opacity: .75; line-height: 1.3; }
.dojo-levels em, .dojo-owned { margin-left: auto; font-style: normal; font-size: .8rem; font-weight: 700; color: #1d6a2a; }
.dojo-list > li { display: grid; gap: 6px; padding: 10px; border-radius: 10px; background: rgba(0, 0, 0, .04); }
.dojo-row { display: flex; align-items: center; gap: 10px; }
.dojo-icon { font-size: 1.5rem; flex: none; width: 32px; text-align: center; }
.dojo-text { flex: 1; min-width: 0; }
.dojo-pips { display: flex; gap: 4px; flex: none; }
.dojo-pips i { width: 10px; height: 10px; border-radius: 50%; background: rgba(0, 0, 0, .18); }
.dojo-pips i.on { background: #c9902a; }
.dojo-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dojo-buy { min-height: 44px; padding: 8px 14px; border-radius: 10px; border: 0; background: #c9902a; color: #fff; font-weight: 700; cursor: pointer; text-align: left; }
.dojo-buy:disabled { background: rgba(0, 0, 0, .18); color: rgba(0, 0, 0, .55); cursor: not-allowed; }
.dojo-buy:focus-visible, .dojo-switch input:focus-visible { outline: 3px solid #6e3b98; outline-offset: 2px; }
.dojo-switch { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-size: .9rem; }
.dojo-switch input { width: 22px; height: 22px; }
.dojo-why, .dojo-hint { margin: 0; font-size: .85rem; line-height: 1.35; opacity: .8; }
@media (prefers-color-scheme: dark) {
  .dojo-block { background: rgba(255, 255, 255, .06); border-color: rgba(255, 255, 255, .16); }
  .dojo-wallet, .dojo-pieces li, .dojo-levels li, .dojo-list > li { background: rgba(255, 255, 255, .08); }
  .dojo-levels li.done { background: rgba(80, 180, 90, .25); }
  .dojo-message { background: rgba(80, 180, 90, .25); color: #d4f5d8; }
  .dojo-message.bad { background: rgba(220, 80, 80, .25); color: #ffd9d9; }
  .dojo-warning { background: rgba(255, 200, 80, .2); color: #ffe7a8; }
  .dojo-buy:disabled { background: rgba(255, 255, 255, .14); color: rgba(255, 255, 255, .55); }
}
</style>
