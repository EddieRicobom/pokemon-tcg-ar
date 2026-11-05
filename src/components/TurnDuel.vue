<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import { pokemonBackSpriteUrl, pokemonSpriteUrl } from '../ar/sprite-url';
import type { ArenaMember } from '../app/arena-members';
import { loadDexNames } from '../app/dex-names';
import { effectiveVisual } from '../app/visual-settings';
import { pendingChallenge, recordLeagueResult } from '../app/league-store';
import { savedMoves } from '../app/moveset-store';
import { prepareFoeSide, preparePlayerSide } from '../app/turn-duel-setup';
import type { DuelMonView, DuelOpponentSpec } from '../app/turn-duel-setup';
import { effectivenessTone, seededRng, typeEffectiveness } from '../core/battle';
import { moveVisual } from '../core/move-specials';
import type { MoveVisual } from '../core/move-specials';
import { effectSummary } from '../core/moveset';
import type { ChosenMove } from '../core/moveset';
import { challengeById } from '../core/league';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import { artUrl, duelTheme, paintDuelBackdrop, paintDuelPad } from '../village/duel-backdrop-art';
import {
  actionBlocker, activeMon, chooseFoeAction, createDuel, describeDuelEvent, DUEL_STATUS_LABELS_PT, DUEL_STATUS_SHORT_PT, forfeitDuel, lockedAction, needsStruggle,
  orderHint, resolveTurn, sendReplacement, stageBadges, statusBlockedByType, STRUGGLE, switchOptions,
} from '../core/turn-battle';
import type { DuelAction, DuelEvent, DuelState, DuelStatus, SideIndex, Stages } from '../core/turn-battle';

const props = defineProps<{ members: ArenaMember[]; opponent: DuelOpponentSpec }>();
const emit = defineEmits<{ close: [] }>();

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const theme = duelTheme(props.opponent.trainer);
const backdropUrl = artUrl(paintDuelBackdrop(theme));
const padUrl = artUrl(paintDuelPad(theme));
const sceneStyle = {
  ...(backdropUrl ? { '--scene': `url(${backdropUrl})` } : {}),
  ...(padUrl ? { '--pad': `url(${padUrl})` } : {}),
};

const phase = ref<'loading' | 'error' | 'battle' | 'over'>('loading');
const errorMessage = ref('');
const notes = ref<string[]>([]);
const engine = shallowRef<DuelState | null>(null);
const views = ref<[DuelMonView[], DuelMonView[]]>([[], []]);
const shown = reactive({
  hp: [[], []] as [number[], number[]],
  status: [[], []] as [(DuelStatus | null)[], (DuelStatus | null)[]],
  confused: [[], []] as [boolean[], boolean[]],
  stages: [[], []] as [Stages[], Stages[]],
  active: [0, 0] as [number, number],
});
const fx = reactive({
  hit: [false, false] as [boolean, boolean],
  lunge: [false, false] as [boolean, boolean],
  faint: [false, false] as [boolean, boolean],
  flash: false,
  float: null as { side: SideIndex; text: string; tone: string; key: number } | null,
  /** Golpe voando de quem usou até o alvo. `side` é quem usou. */
  shot: null as { side: SideIndex; color: string; visual: MoveVisual; key: number } | null,
  /** Fora de alcance (Voar, Cavar): o sprite some até o golpe sair. */
  semi: [false, false] as [boolean, boolean],
  weather: null as string | null,
  /** Explosão de impacto em quem apanhou. */
  burst: null as { side: SideIndex; color: string; big: boolean; key: number } | null,
  shake: false,
  enter: [false, false] as [boolean, boolean],
});
const message = ref('Preparando o duelo…');
/** Tudo o que aconteceu na luta, do mais novo para o mais antigo. */
const log = ref<{ key: number; turn: number; text: string }[]>([]);
let logKey = 0;
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
    shown.confused[side] = state.sides[side].state.map((m) => m.confusion > 0);
    shown.stages[side] = state.sides[side].state.map((m) => ({ ...m.stages }));
    shown.active[side] = state.sides[side].active;
    fx.faint[side] = (state.sides[side].state[state.sides[side].active]?.hp ?? 0) <= 0;
  }
}

onMounted(async () => {
  try {
    const deps = { storage: storage() };
    const names = await loadDexNames().catch(() => null);
    const [mine, foe] = await Promise.all([
      preparePlayerSide(props.members, { ...deps, suggestMissing: true, savedMovesOf: (m) => savedMoves(m.id, m.dexId) }),
      prepareFoeSide(props.opponent, { ...deps, nameOf: (dex) => names?.get(dex) }),
    ]);
    if (disposed) return;
    notes.value = [...mine.notes, ...(foe.failed.length > 0 ? [`Sem dados da PokéAPI, ficaram de fora do oponente: ${foe.failed.join(', ')}.`] : [])];
    if (mine.mons.length === 0) {
      errorMessage.value = 'Não consegui montar golpes para a sua equipe: a PokéAPI não respondeu e não há cópia guardada. Tente de novo com internet.';
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

/** Golpes animados seguem a opção de efeitos: o Modo Rotom e "Faíscas" desligado deixam só o tremor do sprite. */
const showFx = (): boolean => effectiveVisual.value.impactFx;

function shakeField(ms: number): void {
  if (!showFx()) return;
  fx.shake = true;
  setTimeout(() => { fx.shake = false; }, ms);
}

function applyVisual(event: DuelEvent): void {
  switch (event.kind) {
    case 'switch': {
      const old = shown.stages[event.side][event.from];
      if (old) for (const key of Object.keys(old) as (keyof Stages)[]) old[key] = 0;
      shown.confused[event.side][event.from] = false;
      shown.active[event.side] = event.to;
      fx.faint[event.side] = false;
      fx.enter[event.side] = true;
      setTimeout(() => { fx.enter[event.side] = false; }, 520);
      break;
    }
    case 'move':
      pulse('lunge', event.side, 380);
      fx.semi[event.side] = false;
      if (showFx()) fx.shot = { side: event.side, color: TYPE_COLORS[event.move.type], visual: moveVisual(event.move.slug, event.move.damageClass), key: ++floatKey };
      break;
    case 'hit': {
      shown.hp[event.side][event.mon] = event.hpAfter;
      pulse('hit', event.side, 450);
      const tone = effectivenessTone(event.effectiveness);
      float(event.side, `-${event.damage}`, event.critical ? 'crit' : tone);
      if (showFx()) fx.burst = { side: event.side, color: fx.shot?.color ?? '#ffffff', big: event.critical || tone === 'strong', key: ++floatKey };
      if (event.critical || tone === 'strong') {
        fx.flash = true;
        setTimeout(() => { fx.flash = false; }, 220);
        shakeField(420);
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
      if (event.status === 'confusion') shown.confused[event.side][event.mon] = true;
      else shown.status[event.side][event.mon] = event.status;
      break;
    case 'thaw':
    case 'wake':
      shown.status[event.side][event.mon] = null;
      break;
    case 'confusion-end':
      shown.confused[event.side][event.mon] = false;
      break;
    case 'stage': {
      const stages = shown.stages[event.side][event.mon];
      if (stages) stages[event.stat] += event.applied;
      break;
    }
    case 'heal':
      shown.hp[event.side][event.mon] = event.hpAfter;
      break;
    case 'residual':
    case 'recoil':
    case 'confusion-hit':
      shown.hp[event.side][event.mon] = event.hpAfter;
      pulse('hit', event.side, 300);
      break;
    case 'faint':
      shown.hp[event.side][event.mon] = 0;
      fx.faint[event.side] = true;
      shakeField(520);
      break;
    case 'multi':
      float(event.side === 0 ? 1 : 0, `${event.hits}×`, 'neutral');
      break;
    case 'charge':
      fx.semi[event.side] = event.semi;
      break;
    case 'weather':
      fx.weather = event.weather;
      break;
    case 'protect':
      float(event.side, 'Proteção', 'neutral');
      break;
    case 'protected':
      float(event.side, 'Bloqueou', 'weak');
      break;
    case 'seeded':
    case 'trapped':
    case 'screen':
    case 'fail':
    case 'skip':
    case 'confused':
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
      log.value.unshift({ key: ++logKey, turn: engine.value!.turn, text });
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
const locked = computed(() => (engine.value ? lockedAction(engine.value, 0) : null));
const struggleOnly = computed(() => (engine.value ? needsStruggle(engine.value, 0) : false));
const partyOptions = computed(() => (engine.value ? switchOptions(engine.value, 0) : []));

function hpPct(side: SideIndex, mon: number): number {
  const max = engine.value?.sides[side].mons[mon]?.fighter.maxHp ?? 1;
  return Math.max(0, Math.min(100, ((shown.hp[side][mon] ?? 0) / max) * 100));
}
const hpTone = (pct: number) => (pct > 50 ? 'ok' : pct > 20 ? 'mid' : 'low');

function effHint(move: ChosenMove): { text: string; tone: string } | null {
  const target = foe.value;
  if (!target || (move.damageClass === 'status' && !move.ailment)) return null;
  const mult = typeEffectiveness(move.type, target.mon.fighter.types);
  if (move.damageClass === 'status') return statusBlockedByType(move, target.mon.fighter.types) ? { text: 'Não afeta', tone: 'immune' } : null;
  if (mult === 0) return { text: 'Não afeta', tone: 'immune' };
  if (mult > 1) return { text: mult >= 4 ? 'Super efetivo ×4' : 'Super efetivo', tone: 'strong' };
  if (mult < 1) return { text: 'Pouco efetivo', tone: 'weak' };
  return null;
}

const CLASS_SHORT: Record<ChosenMove['damageClass'], string> = { physical: 'Fís.', special: 'Esp.', status: 'Status' };
function orderText(i: number): string {
  if (!engine.value) return '';
  const hint = orderHint(engine.value, i);
  return hint === 'first' ? 'Age primeiro' : hint === 'second' ? 'Age depois' : 'Empate de Velocidade';
}
function badgesOf(side: SideIndex): { stat: string; label: string; value: number }[] {
  const stages = shown.stages[side][shown.active[side]];
  return stages ? stageBadges(stages) : [];
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
      <section class="duel-field" :class="[{ flash: fx.flash, shaking: fx.shake }, fx.weather ? `sky-${fx.weather}` : '']" :style="sceneStyle" @click="advance">
        <div class="duel-hud foe-hud">
          <div class="hud-line"><strong>{{ foe.mon.fighter.name }}</strong><span>Nv. 50</span></div>
          <div class="hud-types">
            <span v-for="t in foe.mon.fighter.types" :key="t" class="type-chip" :style="{ '--type': TYPE_COLORS[t] }">{{ TYPE_LABELS_PT[t] }}</span>
            <span v-if="shown.status[1][shown.active[1]]" class="status-chip" :class="shown.status[1][shown.active[1]]!" :title="DUEL_STATUS_LABELS_PT[shown.status[1][shown.active[1]]!]">{{ DUEL_STATUS_SHORT_PT[shown.status[1][shown.active[1]]!] }}</span>
            <span v-if="shown.confused[1][shown.active[1]]" class="status-chip confusion">Confuso</span>
            <span v-for="b in badgesOf(1)" :key="b.stat" class="stage-chip" :class="b.value > 0 ? 'up' : 'down'">{{ b.label }}</span>
          </div>
          <div class="hp"><span class="hp-label">PS</span><div class="hp-track"><div class="hp-fill" :class="hpTone(hpPct(1, shown.active[1]))" :style="{ width: `${hpPct(1, shown.active[1])}%` }"></div></div></div>
          <div class="hp-num">{{ shown.hp[1][shown.active[1]] }} / {{ foe.mon.fighter.maxHp }}</div>
          <div class="pips" aria-label="Equipe do oponente"><i v-for="(hp, i) in shown.hp[1]" :key="i" :class="{ out: hp <= 0, on: i === shown.active[1] }"></i></div>
        </div>
        <svg v-if="fx.shot && fx.shot.visual === 'beam'" :key="`beam${fx.shot.key}`" class="duel-beam" viewBox="0 0 100 100" preserveAspectRatio="none" :style="{ '--type': fx.shot.color }" aria-hidden="true">
          <line :x1="fx.shot.side === 0 ? 26 : 74" :y1="fx.shot.side === 0 ? 74 : 30" :x2="fx.shot.side === 0 ? 74 : 26" :y2="fx.shot.side === 0 ? 30 : 74" />
        </svg>
        <span v-else-if="fx.shot" :key="`shot${fx.shot.key}`" class="duel-shot" :class="[`v-${fx.shot.visual}`, fx.shot.side === 0 ? 'from-me' : 'from-foe']" :style="{ '--type': fx.shot.color }" aria-hidden="true"></span>
        <span v-if="fx.burst" :key="`burst${fx.burst.key}`" class="duel-burst" :class="[fx.burst.side === 0 ? 'on-me' : 'on-foe', { big: fx.burst.big }]" :style="{ '--type': fx.burst.color }" aria-hidden="true"></span>
        <div class="duel-mon foe-mon" :class="{ hit: fx.hit[1], lunge: fx.lunge[1], faint: fx.faint[1], entering: fx.enter[1], gone: fx.semi[1] }">
          <img v-if="viewOf(1, shown.active[1])" :key="`f${shown.active[1]}`" :src="pokemonSpriteUrl(viewOf(1, shown.active[1])!.dexId)" :alt="foe.mon.fighter.name" />
          <span class="platform" aria-hidden="true"></span>
          <span v-if="fx.float && fx.float.side === 1" :key="fx.float.key" class="float" :class="fx.float.tone">{{ fx.float.text }}</span>
        </div>
        <div class="duel-mon my-mon" :class="{ hit: fx.hit[0], lunge: fx.lunge[0], faint: fx.faint[0], entering: fx.enter[0], gone: fx.semi[0] }">
          <img v-if="viewOf(0, shown.active[0])" :key="`m${shown.active[0]}`" :src="backUrl(viewOf(0, shown.active[0])!)" :alt="mine.mon.fighter.name" @error="backFailed.add(viewOf(0, shown.active[0])!.dexId)" />
          <span class="platform" aria-hidden="true"></span>
          <span v-if="fx.float && fx.float.side === 0" :key="fx.float.key" class="float" :class="fx.float.tone">{{ fx.float.text }}</span>
        </div>
        <div class="duel-hud my-hud">
          <div class="hud-line"><strong>{{ mine.mon.fighter.name }}</strong><span>Nv. 50</span></div>
          <div class="hud-types">
            <span v-for="t in mine.mon.fighter.types" :key="t" class="type-chip" :style="{ '--type': TYPE_COLORS[t] }">{{ TYPE_LABELS_PT[t] }}</span>
            <span v-if="shown.status[0][shown.active[0]]" class="status-chip" :class="shown.status[0][shown.active[0]]!" :title="DUEL_STATUS_LABELS_PT[shown.status[0][shown.active[0]]!]">{{ DUEL_STATUS_SHORT_PT[shown.status[0][shown.active[0]]!] }}</span>
            <span v-if="shown.confused[0][shown.active[0]]" class="status-chip confusion">Confuso</span>
            <span v-for="b in badgesOf(0)" :key="b.stat" class="stage-chip" :class="b.value > 0 ? 'up' : 'down'">{{ b.label }}</span>
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
          <div v-if="locked" class="duel-actions">
            <button type="button" class="act fight locked" @click="act(locked)">Continuar</button>
          </div>

          <div v-else-if="menu === 'main'" class="duel-actions">
            <button type="button" class="act fight" @click="menu = 'fight'">Lutar</button>
            <button type="button" class="act party" :disabled="partyOptions.length === 0" @click="menu = 'party'">Pokémon</button>
          </div>

          <div v-else-if="menu === 'fight'" class="duel-moves">
            <button v-if="struggleOnly" type="button" class="move" :style="{ '--type': TYPE_COLORS.normal }" @click="act({ kind: 'move', move: -1 })">
              <span class="move-name">{{ STRUGGLE.name }}</span><small>Sem PP em todos os golpes</small>
            </button>
            <template v-else>
              <button
                v-for="(move, i) in mine.mon.moves"
                :key="move.slug"
                type="button"
                class="move"
                :style="{ '--type': TYPE_COLORS[move.type] }"
                :disabled="(mine.live.pp[i] ?? 0) <= 0"
                @click="act({ kind: 'move', move: i })"
              >
                <span class="move-head">
                  <span class="move-name">{{ move.name }}</span>
                  <small class="move-pp" :class="{ lowpp: (mine.live.pp[i] ?? 0) <= Math.ceil(move.pp / 4) }">{{ mine.live.pp[i] }}/{{ move.pp }}</small>
                </span>
                <span class="move-meta">
                  <span class="type-tag">{{ TYPE_LABELS_PT[move.type] }}</span>
                  <small>{{ CLASS_SHORT[move.damageClass] }}<template v-if="move.damageClass !== 'status' && move.power > 1"> · {{ move.power }}</template> · {{ move.accuracy ?? '—' }}%</small>
                </span>
                <small v-if="effectSummary(move).length" class="move-effect">{{ effectSummary(move).join(' · ') }}</small>
                <span class="move-hints">
                  <small v-if="effHint(move)" class="eff" :class="effHint(move)!.tone">{{ effHint(move)!.text }}</small>
                  <small class="order">{{ orderText(i) }}</small>
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
        <details v-if="log.length" class="duel-log">
          <summary>Histórico da luta · {{ log.length }}</summary>
          <ol>
            <li v-for="entry in log" :key="entry.key"><small>T{{ entry.turn }}</small>{{ entry.text }}</li>
          </ol>
        </details>
      </section>
    </template>
  </div>
</template>

<style scoped>
.duel { position: fixed; inset: 0; z-index: 1000; display: grid; grid-template-rows: auto minmax(220px, 1fr) auto; background: #161c38; color: #fff; }
.duel-top { display: flex; align-items: center; gap: .6rem; padding: .35rem .7rem; background: #232b52; box-shadow: inset 0 -2px 0 #353d5d; }
.duel-top > span:first-child { display: grid; flex: 1; line-height: 1.15; }
.duel-top small { color: #b4bedc; font-size: .72rem; }
.duel-turn { padding: .1rem .5rem; border-radius: 99px; background: #161c38; color: #ffd84a; font-size: .75rem; font-weight: 800; }
.duel-quit { min-height: 36px; padding: .2rem .65rem; font-size: .8rem; }
.duel-quit.armed { border-color: var(--accent); color: var(--accent); }
.duel-center { display: grid; place-content: center; justify-items: center; gap: .8rem; padding: 1rem; text-align: center; }
.duel-spinner { width: 2.4rem; height: 2.4rem; border: 4px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.duel-notes { margin: 0; padding-left: 1.1rem; color: #ffd2a6; font-size: .78rem; text-align: left; }

.duel-field { position: relative; min-height: 0; overflow: hidden; background: #6cb060 var(--scene, linear-gradient(#7cc0f0 50%, #8cd070 50%)) center / cover no-repeat; image-rendering: pixelated; }
.duel-field.flash::after { content: ''; position: absolute; inset: 0; background: #fff; opacity: .55; pointer-events: none; }
.duel-hud { position: absolute; z-index: 2; display: grid; gap: .15rem; grid-template-columns: auto 1fr; align-items: center; width: min(54%, 230px); padding: .3rem .55rem .35rem; border: 2px solid #353d5d; background: linear-gradient(#fbf8ea, #e6decb); color: #2b2f3f; font-size: .85rem; box-shadow: 0 3px 0 rgba(20, 24, 48, .45); }
.foe-hud { top: .6rem; left: 0; border-left: 0; border-radius: 0 1rem .35rem 0; }
.my-hud { right: 0; bottom: .6rem; border-right: 0; border-radius: 1rem 0 0 .35rem; }
.hud-line { display: flex; justify-content: space-between; gap: .4rem; }
.hud-line strong { overflow: hidden; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
.hud-line span { color: #5a6078; font-size: .75rem; font-weight: 800; }
.hud-types { display: flex; flex-wrap: wrap; gap: .25rem; }
.type-chip { display: inline-block; padding: 0 .36rem; border-radius: .25rem; background: var(--type, #666); color: #fff; font-size: .66rem; font-weight: 800; text-shadow: 0 1px 1px rgba(0, 0, 0, .45); }
.status-chip { padding: 0 .36rem; border-radius: .25rem; color: #fff; font-size: .66rem; font-weight: 800; background: #777; }
.status-chip.confusion { background: #c86fd8; } .status-chip.sleep { background: #6f7fa8; }
.stage-chip { padding: 0 .3rem; border-radius: .25rem; font-size: .66rem; font-weight: 800; }
.stage-chip.up { background: #2f9a68; color: #fff; }
.stage-chip.down { background: #d04848; color: #fff; }
.move-effect { overflow: hidden; color: #fff !important; text-overflow: ellipsis; white-space: nowrap; opacity: .85; }
.move small.order { color: #ffe9a0 !important; }
.status-chip.burn { background: #e5603b; } .status-chip.poison { background: #a05bc5; } .status-chip.paralysis { background: #d8b425; color: #222; } .status-chip.freeze { background: #5fc3e4; color: #123; }
.hp { display: flex; align-items: center; gap: 0; padding: 2px 3px 2px 0; border-radius: .3rem; background: #353d5d; }
.hp-label { padding: 0 .3rem; color: #ffd84a; font-size: .62rem; font-weight: 900; line-height: 1; }
.hp-track { position: relative; display: block; flex: 1; height: .5rem; border-radius: .2rem; background: #1a2040; overflow: hidden; }
.hp-track.small { height: .4rem; }
.hp-fill { display: block; height: 100%; border-radius: inherit; transition: width .6s ease, background-color .3s; }
.hp-fill.ok { background: linear-gradient(#7cf0a0 40%, #38c070 40%); } .hp-fill.mid { background: linear-gradient(#ffe070 40%, #e8b020 40%); } .hp-fill.low { background: linear-gradient(#ff8a70 40%, #e04838 40%); }
.hud-line, .hud-types, .hp { grid-column: 1 / -1; }
.pips { grid-row: 4; grid-column: 1; }
.hp-num { grid-row: 4; grid-column: 2; justify-self: end; font-size: .76rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.pips { display: flex; gap: .18rem; }
.pips i { width: .45rem; height: .45rem; border: 1px solid #353d5d; border-radius: 50%; background: #f2554b; }
.pips i.out { background: #9a9a9a; }
.pips i.on { outline: 1px solid #353d5d; outline-offset: 1px; }

.duel-mon { position: absolute; z-index: 1; display: grid; place-items: end center; translate: -50% 0; image-rendering: auto; }
.foe-mon { left: 72%; bottom: 47%; width: clamp(84px, 30vw, 170px); }
.my-mon { left: 25%; bottom: 5%; width: clamp(110px, 36vw, 220px); }
.duel-mon img { position: relative; z-index: 1; width: 100%; max-height: 30vh; object-fit: contain; object-position: bottom; image-rendering: pixelated; transform-origin: 50% 100%; transition: transform .35s ease, opacity .45s ease; }


.platform { position: absolute; bottom: -7%; left: 50%; width: 125%; aspect-ratio: 96 / 30; translate: -50% 0; background: var(--pad) center / 100% 100% no-repeat; image-rendering: pixelated; }
.duel-mon.lunge.foe-mon img { transform: translate(-22%, 16%); }
.duel-mon.lunge.my-mon img { transform: translate(22%, -14%); }
.duel-mon.hit img { animation: shake .45s; }
.duel-mon.faint img { transform: translateY(40%) scaleY(.2); opacity: 0; }
@keyframes shake { 0%, 100% { translate: 0; filter: none; } 20% { translate: -6px; filter: brightness(2.2); } 40% { translate: 6px; } 60% { translate: -4px; filter: brightness(2.2); } 80% { translate: 3px; } }
.float { position: absolute; top: 10%; z-index: 2; font-size: 1.25rem; font-weight: 900; text-shadow: 0 2px 0 #000; animation: rise 1s ease-out forwards; pointer-events: none; }
.float.strong { color: #ffd84a; font-size: 1.5rem; } .float.crit { color: #ff8a3d; font-size: 1.6rem; } .float.weak { color: #b8c1d6; } .float.immune { color: #8aa0c8; } .float.neutral { color: #fff; }
@keyframes rise { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-2.2rem); } }

.duel-bottom { display: grid; gap: .5rem; padding: .55rem .7rem calc(.65rem + env(safe-area-inset-bottom)); border-top: 3px solid #353d5d; background: #232b52; }
.duel-msg { display: flex; justify-content: space-between; align-items: flex-start; gap: .5rem; min-height: 3.4rem; padding: .55rem .8rem; border: 3px solid #353d5d; border-radius: .6rem; color: #2b2f3f; font: inherit; font-weight: 700; text-align: left; background: #fbf8ea; box-shadow: inset 0 0 0 2px #d8cfb4; }
.duel-next { color: #d04848; animation: blink 1s steps(2) infinite; }
@keyframes blink { 50% { opacity: 0; } }
.duel-actions { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
.act { min-height: 3.4rem; border: 2px solid rgba(0, 0, 0, .35); border-radius: .7rem; color: #fff; font-size: 1.1rem; font-weight: 900; text-shadow: 0 1px 2px rgba(0, 0, 0, .45); box-shadow: 0 4px 0 rgba(0, 0, 0, .35), inset 0 2px 0 rgba(255, 255, 255, .3); }
.act.fight { background: linear-gradient(#f4685c, #d03c34); }
.act.party { background: linear-gradient(#5cc484, #2f9a5c); }
.duel-moves { display: grid; grid-template-columns: 1fr 1fr; gap: .4rem; }
.move { display: grid; align-content: start; gap: .1rem; min-width: 0; padding: .4rem .5rem .45rem; border: 2px solid rgba(0, 0, 0, .35); border-radius: .65rem; color: #fff; font: inherit; text-align: left; text-shadow: 0 1px 1px rgba(0, 0, 0, .5); background: linear-gradient(color-mix(in srgb, var(--type) 88%, #fff), color-mix(in srgb, var(--type) 78%, #000)); box-shadow: 0 3px 0 rgba(0, 0, 0, .35), inset 0 1px 0 rgba(255, 255, 255, .35); }
.move:disabled { opacity: .45; }
.move-head { display: flex; align-items: baseline; justify-content: space-between; gap: .3rem; min-width: 0; }
.move-name { overflow: hidden; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
.move-pp { flex: none; font-variant-numeric: tabular-nums; }
.type-tag { padding: 0 .3rem; border-radius: .25rem; background: rgba(0, 0, 0, .28); font-size: .64rem; font-weight: 800; }
.move-hints { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0 .3rem; }
.move-meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .25rem; }
.move small { color: #fff; font-size: .68rem; }
.move small.lowpp { color: #ffd0c0; font-weight: 900; }
.eff { font-weight: 800; }
.eff.strong { color: #fff27a !important; } .eff.weak { color: #dfe4ee !important; } .eff.immune { color: #c8d0e0 !important; }
.back { grid-column: 1 / -1; min-height: 40px; padding: .3rem; }
.duel-party { display: grid; gap: .35rem; max-height: 40vh; overflow-y: auto; }
.party-row { display: grid; grid-template-columns: 40px 1fr 6rem; align-items: center; gap: .5rem; padding: .35rem .55rem; border: 1px solid var(--line); border-radius: .6rem; color: inherit; font: inherit; text-align: left; background: rgba(255, 255, 255, .04); }
.party-row img { width: 40px; height: 40px; object-fit: contain; image-rendering: pixelated; }
.party-name small { color: var(--muted); }
/* Histórico: fechado por padrão, para o menu de golpes continuar à mão. */
.duel-log { border: 1px solid var(--line); border-radius: .6rem; padding: 0 .6rem; }
.duel-log summary { display: flex; align-items: center; min-height: 40px; color: var(--muted); font-size: .85rem; font-weight: 700; cursor: pointer; }
.duel-log ol { display: grid; gap: .25rem; max-height: 28vh; margin: 0 0 .5rem; padding: 0; overflow-y: auto; list-style: none; font-size: .85rem; }
.duel-log small { display: inline-block; min-width: 2rem; color: var(--gold); font-weight: 800; }
/* Encenação: o golpe voa, explode no alvo e o campo treme nos momentos fortes. */
.duel-field.shaking { animation: field-shake .42s; }
@keyframes field-shake { 0%, 100% { transform: none; } 20% { transform: translate(-5px, 2px) scale(1.012); } 45% { transform: translate(5px, -3px) scale(1.012); } 70% { transform: translate(-3px, 1px); } }
.duel-shot { position: absolute; z-index: 3; width: 26px; height: 26px; margin: -13px; border-radius: 50%; background: radial-gradient(circle, #fff 18%, var(--type) 55%, transparent 72%); box-shadow: 0 0 16px var(--type); pointer-events: none; animation: .5s ease-in forwards; }
.duel-shot.from-me { animation-name: shot-up; }
.duel-shot.from-foe { animation-name: shot-down; }
/* Golpes de contato: nada voa, a marca aparece em cima do alvo. */
.duel-shot.v-punch, .duel-shot.v-kick, .duel-shot.v-bite, .duel-shot.v-slash, .duel-shot.v-slam { width: 96px; height: 96px; margin: -48px; border-radius: 0; background: none; box-shadow: none; animation: strike .5s ease-out forwards; }
.duel-shot.from-me.v-punch, .duel-shot.from-me.v-kick, .duel-shot.from-me.v-bite, .duel-shot.from-me.v-slash, .duel-shot.from-me.v-slam { left: 74%; top: 30%; }
.duel-shot.from-foe.v-punch, .duel-shot.from-foe.v-kick, .duel-shot.from-foe.v-bite, .duel-shot.from-foe.v-slash, .duel-shot.from-foe.v-slam { left: 26%; top: 74%; }
.duel-shot.v-punch { background: var(--type); clip-path: polygon(50% 0, 62% 30%, 98% 22%, 72% 50%, 98% 78%, 62% 70%, 50% 100%, 38% 70%, 2% 78%, 28% 50%, 2% 22%, 38% 30%); }
.duel-shot.v-kick { background: var(--type); clip-path: polygon(50% 0, 58% 38%, 100% 50%, 58% 62%, 50% 100%, 42% 62%, 0 50%, 42% 38%); }
.duel-shot.v-bite { background: linear-gradient(var(--type), var(--type)) top / 100% 38% no-repeat, linear-gradient(var(--type), var(--type)) bottom / 100% 38% no-repeat; clip-path: polygon(0 0, 100% 0, 100% 30%, 83% 46%, 66% 30%, 50% 46%, 33% 30%, 17% 46%, 0 30%, 0 70%, 17% 54%, 33% 70%, 50% 54%, 66% 70%, 83% 54%, 100% 70%, 100% 100%, 0 100%); }
.duel-shot.v-slash { background: repeating-linear-gradient(120deg, transparent 0 16px, #fff 16px 20px, var(--type) 20px 26px, transparent 26px 34px); }
.duel-shot.v-slam { border-radius: 50%; border: 8px solid var(--type); box-shadow: 0 0 14px var(--type); }
@keyframes strike { 0% { opacity: 0; transform: scale(.4) rotate(-12deg); } 35% { opacity: 1; transform: scale(1.1); } 100% { opacity: 0; transform: scale(1.3) rotate(6deg); } }
/* Status: anel que abre em volta de quem usa. */
.duel-shot.v-aura { width: 90px; height: 90px; margin: -45px; background: none; border: 3px solid var(--type); box-shadow: 0 0 14px var(--type); animation: strike .6s ease-out forwards; }
.duel-shot.from-me.v-aura { left: 26%; top: 74%; }
.duel-shot.from-foe.v-aura { left: 74%; top: 30%; }
/* Onda e tempestade cobrem o campo inteiro. */
.duel-shot.v-wave, .duel-shot.v-storm { left: 50%; top: 50%; width: 100%; height: 100%; margin: 0; border-radius: 0; box-shadow: none; transform: translate(-50%, -50%); animation: sweep .62s ease-out forwards; }
.duel-shot.v-wave { background: repeating-radial-gradient(ellipse at 50% 100%, transparent 0 26px, var(--type) 26px 34px); }
.duel-shot.v-storm { background: repeating-linear-gradient(100deg, transparent 0 14px, var(--type) 14px 16px); }
@keyframes sweep { 0% { opacity: 0; } 30% { opacity: .75; } 100% { opacity: 0; } }
.duel-beam { position: absolute; inset: 0; z-index: 3; width: 100%; height: 100%; pointer-events: none; animation: beam .5s ease-out forwards; }
.duel-beam line { stroke: var(--type); stroke-width: 14px; stroke-linecap: round; vector-effect: non-scaling-stroke; filter: drop-shadow(0 0 6px var(--type)); }
@keyframes beam { 0% { opacity: 0; } 20% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }
.duel-mon.gone img { opacity: 0; transform: translateY(-30%) scale(.7); }
/* Clima: o céu do campo muda enquanto dura. */
.duel-field.sky-sun { box-shadow: inset 0 0 90px rgba(255, 196, 70, .55); }
.duel-field.sky-rain { box-shadow: inset 0 0 90px rgba(70, 130, 230, .6); }
.duel-field.sky-sand { box-shadow: inset 0 0 90px rgba(190, 150, 90, .65); }
.duel-field.sky-hail { box-shadow: inset 0 0 90px rgba(190, 230, 255, .6); }
.act.locked { grid-column: 1 / -1; }
@keyframes shot-up { from { left: 26%; top: 74%; transform: scale(.5); } to { left: 74%; top: 30%; transform: scale(1.3); opacity: .9; } }
@keyframes shot-down { from { left: 74%; top: 30%; transform: scale(.5); } to { left: 26%; top: 74%; transform: scale(1.3); opacity: .9; } }
.duel-burst { position: absolute; z-index: 3; width: 110px; height: 110px; margin: -55px; border-radius: 50%; background: radial-gradient(circle, #fff 8%, var(--type) 34%, transparent 68%); pointer-events: none; animation: burst .42s ease-out forwards; }
.duel-burst.big { width: 170px; height: 170px; margin: -85px; }
.duel-burst.on-foe { left: 74%; top: 30%; }
.duel-burst.on-me { left: 26%; top: 74%; }
@keyframes burst { from { opacity: .95; transform: scale(.25); } to { opacity: 0; transform: scale(1.15); } }
.duel-mon.entering img { animation: mon-enter .5s cubic-bezier(.2, 1.4, .4, 1); }
@keyframes mon-enter { from { opacity: 0; transform: scale(.2); filter: brightness(3); } to { opacity: 1; transform: none; filter: none; } }
.duel-over { display: grid; justify-items: center; gap: .4rem; text-align: center; }
.duel-over h3 { margin: 0; font-size: 1.4rem; }
.duel-over p { margin: 0; }
@media (prefers-reduced-motion: reduce) { .duel-mon img, .hp-fill { transition: none; } .duel-mon.hit img, .float, .duel-next, .duel-field.shaking, .duel-mon.entering img { animation: none; } .duel-shot, .duel-burst, .duel-beam { display: none; } }
</style>
