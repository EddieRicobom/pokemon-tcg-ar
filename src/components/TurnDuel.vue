<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import { pokemonBackSpriteUrl, pokemonSpriteUrl } from '../ar/sprite-url';
import type { ArenaMember } from '../app/arena-members';
import { loadDexNames } from '../app/dex-names';
import { pendingChallenge, recordLeagueResult } from '../app/league-store';
import { savedMoves } from '../app/moveset-store';
import { prepareFoeSide, preparePlayerSide } from '../app/turn-duel-setup';
import type { DuelMonView, DuelOpponentSpec } from '../app/turn-duel-setup';
import { effectivenessTone, seededRng, STATUS_LABELS_PT, typeEffectiveness } from '../core/battle';
import type { StatusKind } from '../core/battle';
import { challengeById } from '../core/league';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import {
  actionBlocker, activeMon, chooseFoeAction, createDuel, describeDuelEvent, forfeitDuel, needsStruggle, resolveTurn, sendReplacement, STRUGGLE,
  switchOptions,
} from '../core/turn-battle';
import type { DuelAction, DuelEvent, DuelState, SideIndex } from '../core/turn-battle';

const props = defineProps<{ members: ArenaMember[]; opponent: DuelOpponentSpec }>();
const emit = defineEmits<{ close: [] }>();

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const phase = ref<'loading' | 'error' | 'battle' | 'over'>('loading');
const errorMessage = ref('');
const notes = ref<string[]>([]);
const engine = shallowRef<DuelState | null>(null);
const views = ref<[DuelMonView[], DuelMonView[]]>([[], []]);
const shown = reactive({
  hp: [[], []] as [number[], number[]],
  status: [[], []] as [(StatusKind | null)[], (StatusKind | null)[]],
  active: [0, 0] as [number, number],
});
const fx = reactive({
  hit: [false, false] as [boolean, boolean],
  lunge: [false, false] as [boolean, boolean],
  faint: [false, false] as [boolean, boolean],
  flash: false,
  float: null as { side: SideIndex; text: string; tone: string; key: number } | null,
});
const message = ref('Preparando o duelo…');
const busy = ref(false);
const menu = ref<'main' | 'fight' | 'party'>('main');
const confirmForfeit = ref(false);
const leagueMessage = ref('');
const backFailed = reactive(new Set<number>());
const rng = seededRng((Math.random() * 2 ** 32) >>> 0);
let skipWait: (() => void) | null = null;
let disposed = false;
let floatKey = 0;

function syncShown(state: DuelState): void {
  for (const side of [0, 1] as const) {
    shown.hp[side] = state.sides[side].state.map((m) => m.hp);
    shown.status[side] = state.sides[side].state.map((m) => m.status);
    shown.active[side] = state.sides[side].active;
    fx.faint[side] = (state.sides[side].state[state.sides[side].active]?.hp ?? 0) <= 0;
  }
}

onMounted(async () => {
  try {
    const deps = { storage: storage() };
    const names = await loadDexNames().catch(() => null);
    const [mine, foe] = await Promise.all([
      preparePlayerSide(props.members, { ...deps, savedMovesOf: (m) => savedMoves(m.id, m.dexId) }),
      prepareFoeSide(props.opponent, { ...deps, nameOf: (dex) => names?.get(dex) }),
    ]);
    if (disposed) return;
    notes.value = [...mine.notes, ...(foe.failed.length > 0 ? [`Sem dados da PokéAPI, ficaram de fora do oponente: ${foe.failed.join(', ')}.`] : [])];
    if (mine.mons.length === 0) {
      errorMessage.value = 'Nenhum Pokémon da equipe tem golpes montados. Escolha os golpes antes do duelo.';
      phase.value = 'error';
      return;
    }
    if (foe.mons.length === 0) {
      errorMessage.value = 'Não consegui montar a equipe do oponente: a PokéAPI não respondeu e não há cópia guardada. Tente de novo com internet.';
      phase.value = 'error';
      return;
    }
    const state = createDuel({ name: 'Você', mons: mine.mons }, { name: props.opponent.trainer, mons: foe.mons });
    views.value = [mine.views, foe.views];
    engine.value = state;
    syncShown(state);
    phase.value = 'battle';
    busy.value = true;
    const first = state.sides[1].mons[0]!.fighter.name;
    const mineFirst = state.sides[0].mons[0]!.fighter.name;
    message.value = `${props.opponent.role} ${props.opponent.trainer} quer batalhar!`;
    await wait(1300);
    message.value = `${props.opponent.trainer} enviou ${first}! Vai, ${mineFirst}!`;
    await wait(1100);
    busy.value = false;
    message.value = `O que ${mineFirst} vai fazer?`;
  } catch (error) {
    if (disposed) return;
    errorMessage.value = `Não consegui preparar o duelo: ${error instanceof Error ? error.message : String(error)}`;
    phase.value = 'error';
  }
});

onBeforeUnmount(() => {
  disposed = true;
  skipWait?.();
});

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      skipWait = null;
      resolve();
    }
    skipWait = done;
  });
}

function advance(): void {
  skipWait?.();
}

function pulse(key: 'hit' | 'lunge', side: SideIndex, ms: number): void {
  fx[key][side] = true;
  setTimeout(() => { fx[key][side] = false; }, ms);
}

function float(side: SideIndex, text: string, tone: string): void {
  fx.float = { side, text, tone, key: ++floatKey };
}

function applyVisual(event: DuelEvent): void {
  switch (event.kind) {
    case 'switch':
      shown.active[event.side] = event.to;
      fx.faint[event.side] = false;
      break;
    case 'move':
      pulse('lunge', event.side, 380);
      break;
    case 'hit': {
      shown.hp[event.side][event.mon] = event.hpAfter;
      pulse('hit', event.side, 450);
      const tone = effectivenessTone(event.effectiveness);
      float(event.side, `-${event.damage}`, event.critical ? 'crit' : tone);
      if (event.critical || tone === 'strong') {
        fx.flash = true;
        setTimeout(() => { fx.flash = false; }, 220);
      }
      break;
    }
    case 'miss':
      float(event.side === 0 ? 1 : 0, 'Errou!', 'weak');
      break;
    case 'immune':
      float(event.side, 'Sem efeito', 'immune');
      break;
    case 'status':
      shown.status[event.side][event.mon] = event.status;
      break;
    case 'thaw':
      shown.status[event.side][event.mon] = null;
      break;
    case 'residual':
    case 'recoil':
      shown.hp[event.side][event.mon] = event.hpAfter;
      pulse('hit', event.side, 300);
      break;
    case 'faint':
      shown.hp[event.side][event.mon] = 0;
      fx.faint[event.side] = true;
      break;
    case 'skip':
    case 'end':
      break;
  }
}

async function play(events: DuelEvent[]): Promise<void> {
  busy.value = true;
  for (const event of events) {
    if (disposed) return;
    applyVisual(event);
    const text = describeDuelEvent(engine.value!, event);
    if (text) {
      message.value = text;
      await wait(event.kind === 'end' ? 1400 : 1150);
    } else {
      await wait(520);
    }
  }
  if (disposed) return;
  const state = engine.value!;
  syncShown(state);
  busy.value = false;
  if (state.winner !== null) {
    finish(state);
    return;
  }
  menu.value = state.mustSwitch ? 'party' : 'main';
  message.value = state.mustSwitch ? 'Quem vai entrar agora?' : `O que ${activeMon(state, 0).mon.fighter.name} vai fazer?`;
}

let recorded = false;
function finish(state: DuelState): void {
  phase.value = 'over';
  const won = state.winner === 0;
  if (recorded || !props.opponent.challengeId) return;
  recorded = true;
  const challenge = challengeById(props.opponent.challengeId);
  if (!challenge) return;
  leagueMessage.value = recordLeagueResult(challenge, won).message;
  if (won) pendingChallenge.value = null;
}

function act(action: DuelAction): void {
  const state = engine.value;
  if (!state || busy.value || actionBlocker(state, 0, action)) return;
  confirmForfeit.value = false;
  if (state.mustSwitch && action.kind === 'switch') {
    const result = sendReplacement(state, action.to);
    engine.value = result.state;
    void play(result.events);
    return;
  }
  const result = resolveTurn(state, action, chooseFoeAction(state, rng), rng);
  engine.value = result.state;
  menu.value = 'main';
  void play(result.events);
}

function forfeit(): void {
  const state = engine.value;
  if (!state || busy.value) return;
  if (!confirmForfeit.value) {
    confirmForfeit.value = true;
    return;
  }
  const result = forfeitDuel(state);
  engine.value = result.state;
  void play(result.events);
}

const mine = computed(() => (engine.value ? activeMon(engine.value, 0) : null));
const foe = computed(() => (engine.value ? activeMon(engine.value, 1) : null));
const struggleOnly = computed(() => (engine.value ? needsStruggle(engine.value, 0) : false));
const partyOptions = computed(() => (engine.value ? switchOptions(engine.value, 0) : []));

function hpPct(side: SideIndex, mon: number): number {
  const max = engine.value?.sides[side].mons[mon]?.fighter.maxHp ?? 1;
  return Math.max(0, Math.min(100, ((shown.hp[side][mon] ?? 0) / max) * 100));
}
const hpTone = (pct: number) => (pct > 50 ? 'ok' : pct > 20 ? 'mid' : 'low');

function effHint(type: Parameters<typeof typeEffectiveness>[0]): { text: string; tone: string } | null {
  const target = foe.value;
  if (!target) return null;
  const mult = typeEffectiveness(type, target.mon.fighter.types);
  if (mult === 0) return { text: 'Não afeta', tone: 'immune' };
  if (mult > 1) return { text: mult >= 4 ? 'Super efetivo ×4' : 'Super efetivo', tone: 'strong' };
  if (mult < 1) return { text: 'Pouco efetivo', tone: 'weak' };
  return null;
}

function viewOf(side: SideIndex, mon: number): DuelMonView | null {
  return views.value[side][mon] ?? null;
}
function backUrl(view: DuelMonView): string {
  return backFailed.has(view.dexId) ? pokemonSpriteUrl(view.dexId, view.shiny) : pokemonBackSpriteUrl(view.dexId, view.shiny);
}
</script>

<template>
  <div class="duel" role="dialog" aria-modal="true" aria-label="Duelo por turnos">
    <header class="duel-top">
      <span><strong>{{ opponent.trainer }}</strong><small>{{ opponent.role }}</small></span>
      <span v-if="engine" class="duel-turn">Turno {{ engine.turn + 1 }}</span>
      <button v-if="phase === 'battle'" type="button" class="duel-quit" :class="{ armed: confirmForfeit }" :disabled="busy" @click="forfeit">{{ confirmForfeit ? 'Confirmar desistência' : 'Desistir' }}</button>
      <button v-else type="button" class="duel-quit" @click="emit('close')">Fechar</button>
    </header>

    <div v-if="phase === 'loading'" class="duel-center" role="status">
      <div class="duel-spinner" aria-hidden="true"></div>
      <p>Buscando atributos e golpes reais na PokéAPI…</p>
    </div>

    <div v-else-if="phase === 'error'" class="duel-center" role="alert">
      <p>{{ errorMessage }}</p>
      <ul v-if="notes.length" class="duel-notes"><li v-for="n in notes" :key="n">{{ n }}</li></ul>
      <button type="button" class="primary" @click="emit('close')">Voltar à Arena</button>
    </div>

    <template v-else-if="engine && mine && foe">
      <section class="duel-field" :class="{ flash: fx.flash }" @click="advance">
        <div class="duel-hud foe-hud">
          <div class="hud-line"><strong>{{ foe.mon.fighter.name }}</strong><span>Nv. 50</span></div>
          <div class="hud-types">
            <span v-for="t in foe.mon.fighter.types" :key="t" class="type-chip" :style="{ '--type': TYPE_COLORS[t] }">{{ TYPE_LABELS_PT[t] }}</span>
            <span v-if="shown.status[1][shown.active[1]]" class="status-chip" :class="shown.status[1][shown.active[1]]!">{{ STATUS_LABELS_PT[shown.status[1][shown.active[1]]!] }}</span>
          </div>
          <div class="hp"><span class="hp-label">PS</span><div class="hp-track"><div class="hp-fill" :class="hpTone(hpPct(1, shown.active[1]))" :style="{ width: `${hpPct(1, shown.active[1])}%` }"></div></div></div>
          <div class="pips" aria-label="Equipe do oponente"><i v-for="(hp, i) in shown.hp[1]" :key="i" :class="{ out: hp <= 0, on: i === shown.active[1] }"></i></div>
        </div>
        <div class="duel-mon foe-mon" :class="{ hit: fx.hit[1], lunge: fx.lunge[1], faint: fx.faint[1] }">
          <img v-if="viewOf(1, shown.active[1])" :key="`f${shown.active[1]}`" :src="pokemonSpriteUrl(viewOf(1, shown.active[1])!.dexId)" :alt="foe.mon.fighter.name" />
          <span class="platform" aria-hidden="true"></span>
          <span v-if="fx.float && fx.float.side === 1" :key="fx.float.key" class="float" :class="fx.float.tone">{{ fx.float.text }}</span>
        </div>
        <div class="duel-mon my-mon" :class="{ hit: fx.hit[0], lunge: fx.lunge[0], faint: fx.faint[0] }">
          <img v-if="viewOf(0, shown.active[0])" :key="`m${shown.active[0]}`" :src="backUrl(viewOf(0, shown.active[0])!)" :alt="mine.mon.fighter.name" @error="backFailed.add(viewOf(0, shown.active[0])!.dexId)" />
          <span class="platform" aria-hidden="true"></span>
          <span v-if="fx.float && fx.float.side === 0" :key="fx.float.key" class="float" :class="fx.float.tone">{{ fx.float.text }}</span>
        </div>
        <div class="duel-hud my-hud">
          <div class="hud-line"><strong>{{ mine.mon.fighter.name }}</strong><span>Nv. 50</span></div>
          <div class="hud-types">
            <span v-for="t in mine.mon.fighter.types" :key="t" class="type-chip" :style="{ '--type': TYPE_COLORS[t] }">{{ TYPE_LABELS_PT[t] }}</span>
            <span v-if="shown.status[0][shown.active[0]]" class="status-chip" :class="shown.status[0][shown.active[0]]!">{{ STATUS_LABELS_PT[shown.status[0][shown.active[0]]!] }}</span>
          </div>
          <div class="hp"><span class="hp-label">PS</span><div class="hp-track"><div class="hp-fill" :class="hpTone(hpPct(0, shown.active[0]))" :style="{ width: `${hpPct(0, shown.active[0])}%` }"></div></div></div>
          <div class="hp-num">{{ shown.hp[0][shown.active[0]] }} / {{ mine.mon.fighter.maxHp }}</div>
          <div class="pips" aria-label="Sua equipe"><i v-for="(hp, i) in shown.hp[0]" :key="i" :class="{ out: hp <= 0, on: i === shown.active[0] }"></i></div>
        </div>
      </section>

      <section class="duel-bottom">
        <button type="button" class="duel-msg" aria-live="polite" @click="advance">
          <span>{{ message }}</span><span v-if="busy" class="duel-next" aria-hidden="true">▼</span>
        </button>

        <div v-if="phase === 'over'" class="duel-over">
          <h3>{{ engine.winner === 0 ? 'Vitória!' : 'Derrota' }}</h3>
          <p v-if="leagueMessage">{{ leagueMessage }}</p>
          <p v-else-if="!opponent.challengeId" class="note">Treino: o resultado não muda a Liga.</p>
          <button type="button" class="primary" @click="emit('close')">Voltar à Arena</button>
        </div>

        <template v-else-if="!busy">
          <div v-if="menu === 'main'" class="duel-actions">
            <button type="button" class="act fight" @click="menu = 'fight'">Lutar</button>
            <button type="button" class="act party" :disabled="partyOptions.length === 0" @click="menu = 'party'">Pokémon</button>
          </div>

          <div v-else-if="menu === 'fight'" class="duel-moves">
            <button v-if="struggleOnly" type="button" class="move" :style="{ '--type': TYPE_COLORS.normal }" @click="act({ kind: 'move', move: -1 })">
              <span class="move-name">{{ STRUGGLE.name }}</span><small>Sem PP em todos os golpes</small>
            </button>
            <template v-else>
              <button
                v-for="(move, i) in mine.mon.fighter.moves"
                :key="move.name"
                type="button"
                class="move"
                :style="{ '--type': TYPE_COLORS[move.type] }"
                :disabled="(mine.live.pp[i] ?? 0) <= 0"
                @click="act({ kind: 'move', move: i })"
              >
                <span class="move-name">{{ move.name }}</span>
                <span class="move-meta">
                  <span class="type-chip" :style="{ '--type': TYPE_COLORS[move.type] }">{{ TYPE_LABELS_PT[move.type] }}</span>
                  <small>{{ move.special ? 'Esp.' : 'Fís.' }} · Poder {{ move.power }}</small>
                </span>
                <span class="move-meta">
                  <small :class="{ lowpp: (mine.live.pp[i] ?? 0) <= Math.ceil((mine.mon.maxPp[i] ?? 1) / 4) }">PP {{ mine.live.pp[i] }}/{{ mine.mon.maxPp[i] }}</small>
                  <small v-if="effHint(move.type)" class="eff" :class="effHint(move.type)!.tone">{{ effHint(move.type)!.text }}</small>
                </span>
              </button>
            </template>
            <button type="button" class="back" @click="menu = 'main'">Voltar</button>
          </div>

          <div v-else-if="menu === 'party'" class="duel-party">
            <button
              v-for="(m, i) in engine.sides[0].mons"
              :key="m.fighter.id"
              type="button"
              class="party-row"
              :disabled="!partyOptions.includes(i)"
              @click="act({ kind: 'switch', to: i })"
            >
              <img v-if="viewOf(0, i)" :src="pokemonSpriteUrl(viewOf(0, i)!.dexId, viewOf(0, i)!.shiny)" alt="" />
              <span class="party-name">{{ m.fighter.name }}<small v-if="i === shown.active[0]"> · em campo</small><small v-else-if="(shown.hp[0][i] ?? 0) <= 0"> · desmaiado</small></span>
              <span class="hp-track small"><span class="hp-fill" :class="hpTone(hpPct(0, i))" :style="{ width: `${hpPct(0, i)}%` }"></span></span>
            </button>
            <button v-if="!engine.mustSwitch" type="button" class="back" @click="menu = 'main'">Voltar</button>
          </div>
        </template>
        <ul v-if="notes.length && engine.turn === 0" class="duel-notes"><li v-for="n in notes" :key="n">{{ n }}</li></ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.duel { position: fixed; inset: 0; z-index: 1000; display: grid; grid-template-rows: auto 1fr auto; background: #0c1122; color: var(--text, #fff); }
.duel-top { display: flex; align-items: center; gap: .6rem; padding: .55rem 1rem; border-bottom: 1px solid var(--line); }
.duel-top > span:first-child { display: grid; flex: 1; line-height: 1.15; }
.duel-top small { color: var(--muted); font-size: .75rem; }
.duel-turn { color: var(--gold); font-size: .8rem; font-weight: 800; }
.duel-quit { padding: .35rem .7rem; font-size: .85rem; }
.duel-quit.armed { border-color: var(--accent); color: var(--accent); }
.duel-center { display: grid; place-content: center; justify-items: center; gap: .8rem; padding: 1rem; text-align: center; }
.duel-spinner { width: 2.4rem; height: 2.4rem; border: 4px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.duel-notes { margin: 0; padding-left: 1.1rem; color: #ffd2a6; font-size: .78rem; text-align: left; }

.duel-field { position: relative; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; align-items: center; min-height: 0; padding: .75rem 1rem; overflow: hidden;
  background: radial-gradient(ellipse at 50% 120%, #2f6b45 0%, #1d3f2c 38%, transparent 39%), linear-gradient(#24365e, #3b5f8f 55%, #2f6b45 56%, #1d3f2c); }
.duel-field.flash::after { content: ''; position: absolute; inset: 0; background: #fff; opacity: .55; pointer-events: none; }
.duel-hud { z-index: 1; display: grid; gap: .25rem; padding: .5rem .65rem; border: 2px solid rgba(255, 255, 255, .25); border-radius: .7rem; background: rgba(12, 17, 34, .82); font-size: .85rem; }
.foe-hud { grid-column: 1; grid-row: 1; align-self: start; }
.my-hud { grid-column: 2; grid-row: 2; align-self: end; }
.hud-line { display: flex; justify-content: space-between; gap: .4rem; }
.hud-line strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hud-line span { color: var(--muted); font-size: .75rem; }
.hud-types { display: flex; flex-wrap: wrap; gap: .25rem; }
.type-chip { display: inline-block; padding: .02rem .38rem; border-radius: 99px; background: var(--type, #666); color: #fff; font-size: .64rem; font-weight: 800; text-shadow: 0 1px 1px rgba(0, 0, 0, .45); }
.status-chip { padding: .02rem .38rem; border-radius: 99px; color: #fff; font-size: .64rem; font-weight: 800; background: #777; }
.status-chip.burn { background: #e5603b; } .status-chip.poison { background: #a05bc5; } .status-chip.paralysis { background: #d8b425; color: #222; } .status-chip.freeze { background: #5fc3e4; color: #123; }
.hp { display: flex; align-items: center; gap: .35rem; }
.hp-label { color: var(--gold); font-size: .62rem; font-weight: 900; }
.hp-track { position: relative; display: block; flex: 1; height: .5rem; border-radius: 99px; background: rgba(255, 255, 255, .15); overflow: hidden; }
.hp-track.small { height: .4rem; }
.hp-fill { display: block; height: 100%; border-radius: inherit; transition: width .6s ease, background-color .3s; }
.hp-fill.ok { background: #4fd18b; } .hp-fill.mid { background: #f2c94c; } .hp-fill.low { background: #ef5a5a; }
.hp-num { justify-self: end; font-size: .78rem; font-variant-numeric: tabular-nums; }
.pips { display: flex; gap: .2rem; }
.pips i { width: .5rem; height: .5rem; border-radius: 50%; background: #f2554b; box-shadow: inset 0 -2px 0 rgba(0, 0, 0, .25); }
.pips i.out { background: #555; }
.pips i.on { outline: 2px solid #fff; }

.duel-mon { position: relative; display: grid; place-items: end center; height: 100%; min-height: 0; }
.foe-mon { grid-column: 2; grid-row: 1; }
.my-mon { grid-column: 1; grid-row: 2; }
.duel-mon img { position: relative; z-index: 1; max-width: 100%; max-height: 100%; object-fit: contain; image-rendering: pixelated; transform-origin: 50% 100%; transition: transform .35s ease, opacity .45s ease; }
.foe-mon img { width: clamp(72px, 26vw, 150px); }
.my-mon img { width: clamp(96px, 34vw, 200px); }
.platform { position: absolute; bottom: -.2rem; width: 80%; height: 1.2rem; border-radius: 50%; background: rgba(0, 0, 0, .28); }
.duel-mon.lunge.foe-mon img { transform: translate(-14%, 10%); }
.duel-mon.lunge.my-mon img { transform: translate(14%, -10%); }
.duel-mon.hit img { animation: shake .45s; }
.duel-mon.faint img { transform: translateY(40%) scaleY(.2); opacity: 0; }
@keyframes shake { 0%, 100% { translate: 0; filter: none; } 20% { translate: -6px; filter: brightness(2.2); } 40% { translate: 6px; } 60% { translate: -4px; filter: brightness(2.2); } 80% { translate: 3px; } }
.float { position: absolute; top: 10%; z-index: 2; font-size: 1.25rem; font-weight: 900; text-shadow: 0 2px 0 #000; animation: rise 1s ease-out forwards; pointer-events: none; }
.float.strong { color: #ffd84a; font-size: 1.5rem; } .float.crit { color: #ff8a3d; font-size: 1.6rem; } .float.weak { color: #b8c1d6; } .float.immune { color: #8aa0c8; } .float.neutral { color: #fff; }
@keyframes rise { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-2.2rem); } }

.duel-bottom { display: grid; gap: .55rem; padding: .7rem 1rem calc(.8rem + env(safe-area-inset-bottom)); border-top: 3px solid #2a3557; background: #111a33; }
.duel-msg { display: flex; justify-content: space-between; align-items: flex-start; gap: .5rem; min-height: 3.4rem; padding: .65rem .8rem; border: 2px solid rgba(255, 255, 255, .3); border-radius: .7rem; color: inherit; font: inherit; font-size: 1rem; line-height: 1.35; text-align: left; background: #0c1122; }
.duel-next { color: var(--gold); animation: blink 1s steps(2) infinite; }
@keyframes blink { 50% { opacity: 0; } }
.duel-actions { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
.act { min-height: 3.2rem; font-size: 1.05rem; font-weight: 800; }
.act.fight { border-color: #f2554b; background: rgba(242, 85, 75, .2); }
.act.party { border-color: #4da3ff; background: rgba(77, 163, 255, .16); }
.duel-moves { display: grid; grid-template-columns: 1fr 1fr; gap: .45rem; }
.move { display: grid; gap: .2rem; padding: .5rem .55rem; border: 2px solid var(--type); border-radius: .7rem; color: inherit; font: inherit; text-align: left; background: color-mix(in srgb, var(--type) 22%, #0c1122); }
.move:disabled { opacity: .45; }
.move-name { overflow: hidden; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.move-meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .25rem; }
.move small { color: #d4dbef; font-size: .7rem; }
.move small.lowpp { color: #ff8a7a; font-weight: 800; }
.eff { font-weight: 800; }
.eff.strong { color: #ffd84a !important; } .eff.weak { color: #b8c1d6 !important; } .eff.immune { color: #8aa0c8 !important; }
.back { grid-column: 1 / -1; padding: .4rem; }
.duel-party { display: grid; gap: .35rem; max-height: 40vh; overflow-y: auto; }
.party-row { display: grid; grid-template-columns: 40px 1fr 6rem; align-items: center; gap: .5rem; padding: .35rem .55rem; border: 1px solid var(--line); border-radius: .6rem; color: inherit; font: inherit; text-align: left; background: rgba(255, 255, 255, .04); }
.party-row img { width: 40px; height: 40px; object-fit: contain; image-rendering: pixelated; }
.party-name small { color: var(--muted); }
.duel-over { display: grid; justify-items: center; gap: .4rem; text-align: center; }
.duel-over h3 { margin: 0; font-size: 1.4rem; }
.duel-over p { margin: 0; }
@media (prefers-reduced-motion: reduce) { .duel-mon img, .hp-fill { transition: none; } .duel-mon.hit img, .float, .duel-next { animation: none; } }
</style>
