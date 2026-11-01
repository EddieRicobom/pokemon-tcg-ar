<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import WeaponArt from './WeaponArt.vue';
import FusionArt from './FusionArt.vue';
import GemChip from './GemChip.vue';
import DungeonAttackFx from './DungeonAttackFx.vue';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { effectiveVisual } from '../app/visual-settings';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import { ammoOptions, biomeOf, COSTS, FUSION_CHARGE, FUSION_TURNS, GRID_H, GRID_W, key, START_AP } from '../core/dungeon';
import type { Cell, Member, WeaponId } from '../core/dungeon';
import { LEGENDARY_SLOT } from '../core/dungeon-gems';
import {
  applyAction, concede, DUEL_MAX_ROUNDS, duelArea, duelAttacker, duelAttacksLeft, duelDigest, duelFusionPreview, duelPreview, duelReach, duelReachable, duelTargets, mirrorCell, other,
} from '../core/dungeon-duel';
import type { DuelAction, DuelState, Side } from '../core/dungeon-duel';
import type { PvpPeer } from '../pvp/peer';
import type { WireMessage } from '../pvp/wire';

/**
 * Duelo da Masmorra (PvP): a sala 7×7 com as duas equipes, em turnos. Quem joga aplica a jogada na hora e a manda ao
 * amigo; o amigo aplica a mesma jogada com as mesmas funções (`core/dungeon-duel.ts`) e confere o resumo do estado.
 * O tabuleiro do convidado é girado 180° para cada um se ver embaixo. Textos de ajuda ficam numa linha fixa sob o
 * tabuleiro (nunca em janela por cima do jogo); só o resultado final usa uma janela.
 */
const props = defineProps<{ duel: DuelState; side: Side; peer: PvpPeer; friend: string }>();
const emit = defineEmits<{ leave: [] }>();

interface Popup { id: number; cell: string; text: string; kind: 'hit' | 'hurt' | 'heal' | 'info' }
interface AttackFx { id: number; weapon: WeaponId; ammo: PokemonType | null; cells: string[] }

const mode = ref<'move' | 'attack' | null>(null);
const pending = ref<Cell | null>(null);
const flash = ref('');
const notice = ref('');
const fusionOpen = ref(false);
const fusionPick = ref<number[]>([]);
const popups = ref<Popup[]>([]);
const attackFx = ref<AttackFx | null>(null);
const brokenSprites = ref(new Set<number>());
const confirmForfeit = ref(false);
let popupId = 0;
let fxId = 0;
let fxTimer: ReturnType<typeof setTimeout> | undefined;
let forfeitTimer: ReturnType<typeof setTimeout> | undefined;
let sent = 0;
let expected = 0;

const me = computed(() => props.duel.sides[props.side]);
const foeSide = computed<Side>(() => other(props.side));
const foe = computed(() => props.duel.sides[foeSide.value]);
const over = computed(() => props.duel.phase === 'over');
const myTurn = computed(() => props.duel.phase === 'duel' && props.duel.turn === props.side);
const biome = computed(() => biomeOf(props.duel.biome));
const biomeStyle = computed(() => {
  const p = biome.value.palette;
  return {
    '--floor-a': p.floorA, '--floor-b': p.floorB, '--speck': p.speck, '--wall-top': p.wallTop, '--wall-side': p.wallSide,
    '--wall-edge': p.wallEdge, '--frame': p.frame, '--bg-a': p.bgA, '--bg-b': p.bgB, '--accent': p.accent,
  };
});

/** As casas na ordem da tela: o convidado vê o tabuleiro girado, para estar sempre embaixo. */
const displayCells = computed(() => {
  const out: Cell[] = [];
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) out.push(props.side === 1 ? mirrorCell({ x, y }) : { x, y });
  return out;
});

const sprite = (dexId: number): string => pokemonSpriteUrl(dexId);
const typeStyle = (t: PokemonType) => ({ background: TYPE_COLORS[t] });
const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;
const same = (a: Cell, b: Cell | null) => !!b && a.x === b.x && a.y === b.y;
const ammoLabel = (types: readonly PokemonType[]): string => types.map((t) => TYPE_LABELS_PT[t]).join(' / ');
const ammoKey = (ammo: readonly PokemonType[]) => ammo.join('/');

/** Quem está em campo de cada lado (a fusão põe os dois). */
const pickable = (m: Member): boolean => m.status === 'ready' && m.hp > 0;
const fieldedOf = (s: Side): Member[] => {
  const st = props.duel.sides[s];
  return st.fusion ? [st.team[st.fusion.a]!, st.team[st.fusion.b]!] : [st.team[st.active]!];
};
const hpRatio = (s: Side): string => {
  const list = fieldedOf(s);
  return pct(list.reduce((a, m) => a + m.hp, 0), list.reduce((a, m) => a + m.maxHp, 0));
};
const nameOf = (s: Side): string => (props.duel.sides[s].fusion ? props.duel.sides[s].fusion!.name : fieldedOf(s)[0]!.name);

const wallAt = (c: Cell) => props.duel.walls.some((w) => same(w, c));
const barrierAt = (c: Cell) => props.duel.barriers.some((b) => same(b.pos, c));
const myTrapAt = (c: Cell) => me.value.traps.some((t) => same(t.pos, c));
const foeTrapAt = (c: Cell) => foe.value.traps.some((t) => same(t.pos, c));
const mineAt = (c: Cell) => same(c, me.value.pos);
const theirsAt = (c: Cell) => same(c, foe.value.pos);
const cellHash = (c: Cell): number => {
  let h = Math.imul((c.x + 11) * 73856093 ^ (c.y + 7) * 19349663 ^ props.duel.seed, 2654435761) >>> 0;
  h ^= h >>> 13;
  return (Math.imul(h, 1274126177) >>> 0) / 4294967296;
};
const wallFront = (c: Cell) => wallAt(c) && !(c.y + 1 < GRID_H && wallAt({ x: c.x, y: c.y + 1 }));
const popupsAt = (c: Cell) => popups.value.filter((p) => p.cell === key(c));

const walkCosts = computed(() => (myTurn.value ? duelReachable(props.duel, props.side) : new Map<string, number>()));
const reachKeys = computed(() => new Set(myTurn.value && !me.value.mustSwitch && (mode.value === 'attack' || !mode.value) ? duelReach(props.duel, props.side).map(key) : []));
const targetKeys = computed(() => new Set(myTurn.value && mode.value === 'attack' ? duelTargets(props.duel, props.side).map(key) : []));
const areaKeys = computed(() => new Set(myTurn.value && mode.value === 'attack' && pending.value ? duelArea(props.duel, props.side, pending.value).map(key) : []));
const preview = computed(() => (myTurn.value && mode.value === 'attack' && pending.value ? duelPreview(props.duel, props.side, pending.value) : null));
const who = computed(() => duelAttacker(props.duel, props.side));
const attacksNow = computed(() => duelAttacksLeft(props.duel, props.side));
const activeMember = computed(() => me.value.team[me.value.active]!);
const chargeMax = computed(() => (me.value.fusion ? me.value.fusion.maxCharge : activeMember.value.maxCharge));
const apMax = computed(() => Math.max(START_AP, props.duel.ap));
const fusionPreview = computed(() => (fusionPick.value.length === 2 ? duelFusionPreview(props.duel, props.side, fusionPick.value[0]!, fusionPick.value[1]!) : null));
const idle = computed(() => myTurn.value && !me.value.mustSwitch && props.duel.ap === 0);

/** A linha de orientação: o que fazer agora, sempre no mesmo lugar e sem janela por cima do jogo. */
const guide = computed(() => {
  const d = props.duel;
  if (over.value) return 'O duelo terminou.';
  if (!myTurn.value) return `Vez de ${props.friend}. Aguarde: cada jogada dele aparece aqui na hora.`;
  if (me.value.mustSwitch) return 'Seu Pokémon em campo caiu ou esgotou a carga. Toque em outro da equipe, embaixo (troca grátis).';
  if (pending.value && mode.value === 'move') {
    const cost = walkCosts.value.get(key(pending.value)) ?? 0;
    return `Mover ${cost} casa(s) · ${cost * COSTS.move} PA. Toque de novo na casa (ou em Confirmar).`;
  }
  const p = preview.value;
  if (p) {
    if (p.reason) return p.reason;
    const eff = p.parts.some((x) => x.factor > 1) ? ' (eficaz)' : p.parts.some((x) => x.factor < 1) ? ' (resiste)' : '';
    return p.trap ? `${who.value.weapon.name}: instala uma armadilha · ${p.ap} PA.` : `${who.value.weapon.name}: ${p.target} −${p.damage}${eff} · ${p.ap} PA · ${p.cost} carga. Toque de novo (ou Confirmar).`;
  }
  if (mode.value === 'move') return 'Toque numa casa azul para mover (1 PA por casa).';
  if (mode.value === 'attack') return targetKeys.value.size ? 'Toque no alvo para ver o dano; toque de novo para atacar.' : `Nada ao alcance desta arma. Mova-se para perto de ${props.friend} (👣 Mover).`;
  if (d.ap === 0) return 'Sem PA. Toque em Encerrar turno para passar a vez.';
  if (attacksNow.value.count === 0) return attacksNow.value.limit === 'charge' ? 'Sem carga neste Pokémon: troque (1 PA) ou encerre o turno.' : 'Sem PA para atacar: encerre o turno.';
  return `Sua vez · ${d.ap} PA. Chegue perto com 👣 Mover e ataque com ⚔️ Atacar. Quando acabar, toque em Encerrar turno.`;
});

const pendingKind = computed(() => (mode.value === 'attack' ? (preview.value && !preview.value.reason ? 'attack' : null) : pending.value ? 'move' : null));

const outcome = computed(() => {
  const d = props.duel;
  if (d.phase !== 'over') return null;
  const won = d.winner === props.side;
  const f = props.friend;
  switch (d.reason) {
    case 'down': return { title: won ? '🏆 Você venceu o duelo!' : '💀 Você perdeu o duelo', text: won ? `Todos os Pokémon de ${f} caíram.` : 'Todos os seus Pokémon caíram.' };
    case 'forfeit': return { title: won ? '🏆 Você venceu o duelo!' : '🏳️ Você desistiu', text: won ? `${f} desistiu.` : 'A vitória ficou com o amigo.' };
    case 'left': return { title: '🏆 Você venceu o duelo!', text: `${f} saiu ou a conexão caiu. A vitória é sua por abandono.` };
    case 'rounds': return { title: won ? '🏆 Você venceu por vida' : '⏱️ Você perdeu por vida', text: `Limite de ${DUEL_MAX_ROUNDS} rodadas: vence quem termina com mais vida.` };
    case 'draw': return { title: '🤝 Empate', text: 'Os dois terminaram iguais.' };
    default: return { title: '⚠️ Duelo interrompido', text: `Os dois jogos deixaram de bater (versões diferentes do app?). ${notice.value}`.trim() };
  }
});

// ----------------------------------------------------------------------------- jogadas

const hpSnapshot = (): [number, number] => [0, 1].map((s) => props.duel.sides[s as Side].team.reduce((a, m) => a + m.hp, 0)) as [number, number];

function popup(cell: Cell, text: string, kind: Popup['kind']): void {
  const id = ++popupId;
  popups.value.push({ id, cell: key(cell), text, kind });
  setTimeout(() => { popups.value = popups.value.filter((p) => p.id !== id); }, 1000);
}

function fxBefore(act: DuelAction, actor: Side): AttackFx | null {
  if (act.k !== 'attack' || !effectiveVisual.value.impactFx) return null;
  const w = duelAttacker(props.duel, actor);
  const cells = duelArea(props.duel, actor, { x: act.x, y: act.y });
  return { id: ++fxId, weapon: w.weapon.id, ammo: w.ammo[0] ?? null, cells: (cells.length ? cells : [{ x: act.x, y: act.y }]).map(key) };
}

function animate(before: [number, number], fx: AttackFx | null): void {
  const after = hpSnapshot();
  for (const s of [0, 1] as const) {
    const delta = after[s] - before[s];
    if (delta === 0) continue;
    const mineSide = s === props.side;
    popup(props.duel.sides[s].pos, `${delta < 0 ? '−' : '+'}${Math.abs(delta)}`, delta > 0 ? 'heal' : mineSide ? 'hurt' : 'hit');
  }
  if (fx) {
    if (fxTimer) clearTimeout(fxTimer);
    attackFx.value = fx;
    fxTimer = setTimeout(() => { attackFx.value = null; }, 640);
  }
}

function perform(act: DuelAction): boolean {
  const d = props.duel;
  if (d.phase !== 'duel' || d.turn !== props.side) return false;
  const before = hpSnapshot();
  const fx = fxBefore(act, props.side);
  const r = applyAction(d, props.side, act);
  if (!r.ok) {
    flash.value = r.reason;
    return false;
  }
  flash.value = '';
  props.peer.send({ t: 'dd-act', seq: sent++, act, sum: duelDigest(d) });
  animate(before, fx);
  return true;
}

function desync(why: string): void {
  notice.value = why;
  props.peer.send({ t: 'dd-desync' });
  concede(props.duel, props.side, 'desync');
}

function receive(msg: Extract<WireMessage, { t: 'dd-act' }>): void {
  const d = props.duel;
  const friendSide = other(props.side);
  if (msg.seq !== expected || d.turn !== friendSide) return desync('Uma jogada chegou fora de ordem.');
  const before = hpSnapshot();
  const fx = fxBefore(msg.act, friendSide);
  const r = applyAction(d, friendSide, msg.act);
  if (!r.ok) return desync(`Jogada do amigo recusada pelas regras: ${r.reason}`);
  expected++;
  if (duelDigest(d) !== msg.sum) return desync('O estado depois da jogada não bateu com o do amigo.');
  mode.value = null;
  pending.value = null;
  animate(before, fx);
}

function onMessage(msg: WireMessage): void {
  if (over.value) return;
  if (msg.t === 'dd-act') receive(msg);
  else if (msg.t === 'dd-forfeit') concede(props.duel, other(props.side), 'forfeit');
  else if (msg.t === 'dd-desync') {
    notice.value = 'O amigo detectou a divergência.';
    concede(props.duel, props.side, 'desync');
  }
}

function tapCell(c: Cell): void {
  if (!myTurn.value || over.value) return;
  if (me.value.mustSwitch) { flash.value = 'Escolha antes quem assume a posição (equipe, embaixo).'; return; }
  const k = key(c);
  if (!mode.value) {
    // Atalho de toque: selecionar uma casa alcançável e tocar nela outra vez anda até ela.
    if ((walkCosts.value.get(k) ?? 0) > 0) {
      if (same(c, pending.value)) { perform({ k: 'move', x: c.x, y: c.y }); pending.value = null; } else { pending.value = c; flash.value = ''; }
      return;
    }
    pending.value = null;
    return;
  }
  const valid = mode.value === 'move' ? (walkCosts.value.get(k) ?? 0) > 0 : targetKeys.value.has(k);
  if (!valid) { pending.value = null; return; }
  if (same(c, pending.value)) return confirm();
  pending.value = c;
}

function confirm(): void {
  const c = pending.value;
  if (!c || !myTurn.value) return;
  const act: DuelAction = mode.value === 'attack' ? { k: 'attack', x: c.x, y: c.y } : { k: 'move', x: c.x, y: c.y };
  perform(act);
  pending.value = null;
  if (mode.value === 'move' || (mode.value === 'attack' && !myTurn.value) || (mode.value === 'attack' && duelTargets(props.duel, props.side).length === 0)) mode.value = null;
}

function setMode(next: 'move' | 'attack'): void {
  mode.value = mode.value === next ? null : next;
  pending.value = null;
  flash.value = '';
}

function doSwitch(i: number): void {
  perform({ k: 'switch', i });
  mode.value = null;
  pending.value = null;
}

function doPotion(): void {
  perform({ k: 'potion' });
}

function doEnd(): void {
  mode.value = null;
  pending.value = null;
  fusionOpen.value = false;
  perform({ k: 'end' });
}

function chooseAmmo(ammo: readonly PokemonType[]): void {
  perform({ k: 'ammo', m: me.value.active, ammo: [...ammo] });
}

function openFusion(): void {
  fusionPick.value = [];
  fusionOpen.value = !fusionOpen.value;
}

function toggleFusion(i: number): void {
  const at = fusionPick.value.indexOf(i);
  if (at >= 0) fusionPick.value.splice(at, 1);
  else if (fusionPick.value.length < 2) fusionPick.value.push(i);
}

function confirmFusion(): void {
  if (fusionPick.value.length !== 2) return;
  perform({ k: 'fuse', a: fusionPick.value[0]!, b: fusionPick.value[1]! });
  fusionOpen.value = false;
}

function forfeit(): void {
  if (!confirmForfeit.value) {
    confirmForfeit.value = true;
    forfeitTimer = setTimeout(() => { confirmForfeit.value = false; }, 4000);
    return;
  }
  props.peer.send({ t: 'dd-forfeit' });
  concede(props.duel, props.side, 'forfeit');
}

function statusLabel(i: number): string {
  const st = me.value;
  const m = st.team[i]!;
  if (st.fusion && (i === st.fusion.a || i === st.fusion.b)) return 'fusão';
  if (i === st.active) return 'ativo';
  if (m.status === 'down' || m.hp <= 0) return 'caído';
  if (m.status === 'exhausted') return `CD:${m.cooldown}`;
  if (m.status === 'recovering') return `rec.:${m.cooldown}`;
  return 'pronto';
}

function foeStatus(m: Member, i: number): string {
  const st = foe.value;
  if (m.hp <= 0) return 'caído';
  if (st.fusion && (i === st.fusion.a || i === st.fusion.b)) return 'fusão';
  if (i === st.active) return 'em campo';
  return m.status === 'exhausted' ? 'esgotado' : 'reserva';
}

function onKey(e: KeyboardEvent): void {
  if (over.value || e.target instanceof HTMLInputElement) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 6) {
    if (fusionOpen.value) toggleFusion(n - 1);
    else if (n - 1 < me.value.team.length) doSwitch(n - 1);
  } else if (e.key === 'm' || e.key === 'M') setMode('move');
  else if (e.key === 'a' || e.key === 'A') setMode('attack');
  else if (e.key === 'Enter' && pending.value) confirm();
  else if ((e.key === 'e' || e.key === 'E') && myTurn.value) doEnd();
  else if (e.key === 'Escape') { mode.value = null; pending.value = null; fusionOpen.value = false; }
}

watch(() => props.duel.turn, (turn) => {
  if (turn === props.side && props.duel.phase === 'duel') {
    flash.value = '';
    try { navigator.vibrate?.(60); } catch { /* sem vibração neste aparelho */ }
  }
});

onMounted(() => {
  props.peer.onMessage = onMessage;
  props.peer.onState = (state) => {
    if (state === 'closed' && !over.value) concede(props.duel, other(props.side), 'left');
  };
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  props.peer.onMessage = null;
  props.peer.onState = null;
  window.removeEventListener('keydown', onKey);
  if (fxTimer) clearTimeout(fxTimer);
  if (forfeitTimer) clearTimeout(forfeitTimer);
});
</script>

<template>
  <div class="dd" :style="biomeStyle">
    <header class="dd-turn" :class="{ mine: myTurn, theirs: !myTurn && !over }" role="status" aria-live="polite">
      <strong v-if="over">Duelo encerrado</strong>
      <strong v-else-if="myTurn">🟢 Sua vez</strong>
      <strong v-else>⏳ Vez de {{ friend }}</strong>
      <span class="dd-pill">Rodada {{ Math.min(duel.round, DUEL_MAX_ROUNDS) }}/{{ DUEL_MAX_ROUNDS }}</span>
      <span v-if="myTurn" class="dd-pill dd-ap" :class="{ empty: duel.ap === 0 }" :aria-label="`${duel.ap} PA`">
        <b>PA</b><i v-for="n in apMax" :key="n" :class="{ on: n <= duel.ap }"></i><small>{{ duel.ap }}</small>
      </span>
      <span v-if="myTurn" class="dd-pill" :class="{ none: attacksNow.count === 0 }" title="Ataques que ainda cabem neste turno">⚔ ×{{ attacksNow.count }}</span>
      <span v-if="me.guard.reduce > 0" class="dd-pill" title="Bloqueio para o próximo golpe">🛡️ {{ Math.round(me.guard.reduce * 100) }}%</span>
    </header>

    <section class="dd-foe" aria-label="Seu adversário">
      <span class="dd-foe-name">{{ friend }}</span>
      <ul class="dd-foe-team">
        <li v-for="(m, i) in foe.team" :key="m.id" :class="{ down: m.hp <= 0, field: i === foe.active || (foe.fusion && (i === foe.fusion.a || i === foe.fusion.b)) }" :title="`${m.name} · ${foeStatus(m, i)}`">
          <img v-if="!brokenSprites.has(m.dexId)" :src="sprite(m.dexId)" :alt="m.name" @error="brokenSprites.add(m.dexId)" />
          <span v-else class="dd-nosprite">?</span>
          <span class="dd-hp"><i :style="{ width: pct(m.hp, m.maxHp) }"></i></span>
          <small>{{ foeStatus(m, i) }}</small>
        </li>
      </ul>
    </section>

    <div class="dd-grid" :class="{ aiming: mode === 'attack', theirs: !myTurn && !over }" :style="{ gridTemplateColumns: `repeat(${GRID_W}, 1fr)` }">
      <button
        v-for="c in displayCells"
        :key="key(c)"
        type="button"
        class="dd-cell"
        :class="{
          wall: wallAt(c),
          'wall-front': wallFront(c),
          alt: cellHash(c) > 0.55,
          barrier: barrierAt(c),
          reach: myTurn && mode === 'move' && (walkCosts.get(key(c)) ?? 0) > 0,
          'in-range': reachKeys.has(key(c)),
          target: targetKeys.has(key(c)),
          area: areaKeys.has(key(c)),
          pending: same(c, pending),
        }"
        :aria-label="`Casa ${c.x + 1},${c.y + 1}${theirsAt(c) ? `: ${nameOf(foeSide)} (${friend})` : mineAt(c) ? `: ${nameOf(side)} (você)` : ''}`"
        @click="tapCell(c)"
      >
        <small v-if="mode === 'move' && (walkCosts.get(key(c)) ?? 0) > 0" class="dd-cost">{{ walkCosts.get(key(c)) }}</small>
        <span v-if="myTrapAt(c)" class="dd-trap mine" title="Sua armadilha" aria-hidden="true">⚙️</span>
        <span v-if="foeTrapAt(c)" class="dd-trap theirs" title="Armadilha do amigo" aria-hidden="true">⚙️</span>
        <template v-if="theirsAt(c)">
          <span class="dd-mon theirs" :class="{ fused: !!foe.fusion }">
            <template v-for="m in fieldedOf(foeSide)" :key="m.id">
              <img v-if="!brokenSprites.has(m.dexId)" :src="sprite(m.dexId)" :alt="m.name" @error="brokenSprites.add(m.dexId)" />
              <span v-else class="dd-nosprite">{{ m.name }}</span>
            </template>
          </span>
          <span v-if="foe.burn" class="dd-burn" title="Queimando">🔥</span>
          <span class="dd-hp bar theirs"><i :style="{ width: hpRatio(foeSide) }"></i></span>
        </template>
        <template v-else-if="mineAt(c)">
          <span class="dd-mon mine" :class="{ fused: !!me.fusion }">
            <template v-for="m in fieldedOf(side)" :key="m.id">
              <img v-if="!brokenSprites.has(m.dexId)" :src="sprite(m.dexId)" :alt="m.name" @error="brokenSprites.add(m.dexId)" />
              <span v-else class="dd-nosprite">{{ m.name }}</span>
            </template>
          </span>
          <span class="dd-hp bar mine"><i :style="{ width: hpRatio(side) }"></i></span>
        </template>
        <DungeonAttackFx v-if="attackFx?.cells.includes(key(c))" :key="`${attackFx.id}:${key(c)}`" :weapon="attackFx.weapon" :ammo="attackFx.ammo" />
        <span v-for="p in popupsAt(c)" :key="p.id" class="dd-popup" :class="p.kind">{{ p.text }}</span>
      </button>
    </div>

    <p class="dd-guide" :class="{ hot: myTurn, wait: !myTurn && !over }" aria-live="polite">
      <span class="dd-guide-text">{{ flash || guide }}</span>
      <button v-if="pendingKind" type="button" class="primary small" @click="confirm">{{ mode === 'attack' ? '⚔ Atacar' : 'Confirmar' }}</button>
    </p>
    <p v-if="duel.log.length && !over" class="dd-last">{{ duel.log[duel.log.length - 1]!.side === side ? 'Você' : friend }}: {{ duel.log[duel.log.length - 1]!.text }}</p>

    <nav class="dd-commands" aria-label="Ações">
      <button type="button" :class="{ on: mode === 'move' }" :disabled="!myTurn || me.mustSwitch" @click="setMode('move')"><b>👣</b>Mover</button>
      <button type="button" :class="{ on: mode === 'attack' }" :disabled="!myTurn || me.mustSwitch" @click="setMode('attack')"><b>⚔️</b>Atacar · {{ who.weapon.ap }}</button>
      <button type="button" :disabled="!myTurn || me.mustSwitch || me.potions === 0 || duel.ap < COSTS.item" @click="doPotion"><b>🧪</b>Poção · {{ COSTS.item }}<small>×{{ me.potions }}</small></button>
      <button type="button" :class="{ on: fusionOpen }" :disabled="!myTurn || me.mustSwitch || !!me.fusion || me.fusionCharges === 0" @click="openFusion"><b>💠</b>Fusão · {{ COSTS.fusion }}<small>×{{ me.fusionCharges }}</small></button>
      <button type="button" class="primary" :class="{ hot: idle }" :disabled="!myTurn || me.mustSwitch" @click="doEnd"><b>⏭️</b>Encerrar</button>
    </nav>

    <section v-if="fusionOpen" class="dd-fusion" aria-label="Escolher fusão">
      <p class="dd-hint">Escolha dois Pokémon da equipe (teclas 1–6 no PC). A fusão dura {{ FUSION_TURNS }} turnos, usa a média dos stats e divide o dano entre os dois.</p>
      <div class="dd-fusion-pick">
        <button v-for="(m, i) in me.team" :key="m.id" type="button" :class="{ on: fusionPick.includes(i) }" :disabled="!pickable(m)" @click="toggleFusion(i)">
          <WeaponArt :weapon="m.weapon" :dex-id="m.dexId" :ammo="m.ammo[0] ?? null" :size="38" />
          <span>{{ fusionPick.includes(i) ? '✓ ' : '' }}{{ m.name }}</span>
        </button>
      </div>
      <template v-if="fusionPreview">
        <p class="dd-hint"><strong>{{ fusionPreview.weapon.name }}</strong> · {{ fusionPreview.weapon.ap }} PA · {{ fusionPreview.weapon.cost }} carga · carga temporária {{ FUSION_CHARGE }} · munição {{ ammoLabel(fusionPreview.ammo) }}</p>
        <p v-if="fusionPreview.reason" class="dd-warn">{{ fusionPreview.reason }}</p>
      </template>
      <div class="dd-row"><button type="button" @click="fusionOpen = false">Cancelar</button><button type="button" class="primary" :disabled="!fusionPreview?.ok" @click="confirmFusion">Ativar fusão</button></div>
    </section>

    <section class="dd-active" :class="{ fused: !!me.fusion }" aria-label="Quem está em campo">
      <FusionArt v-if="me.fusion" :origins="who.origins" :orbs="who.orbs" :ammo="who.ammo" :size="70" />
      <div v-else class="dd-weapon-col">
        <WeaponArt :weapon="activeMember.weapon" :dex-id="activeMember.dexId" :ammo="activeMember.ammo[0] ?? null" :size="64" />
        <span class="dd-sockets"><GemChip v-for="(g, i) in activeMember.gems" :key="i" :gem="g" :legendary-slot="i === LEGENDARY_SLOT" :size="15" /></span>
      </div>
      <div class="dd-active-info">
        <div>
          <strong>{{ me.fusion ? me.fusion.name : activeMember.name }}</strong>
          <span v-for="t in (me.fusion ? who.types : activeMember.types)" :key="t" class="dd-type" :style="typeStyle(t)">{{ TYPE_LABELS_PT[t] }}</span>
          <template v-if="me.fusion"> · {{ me.fusion.turnsLeft }} turno(s)</template>
        </div>
        <div v-for="m in fieldedOf(side)" :key="m.id" class="dd-bar"><span>HP</span><span class="dd-hp"><i :style="{ width: pct(m.hp, m.maxHp) }"></i></span><small>{{ m.hp }}/{{ m.maxHp }}</small></div>
        <div class="dd-bar"><span>Carga</span><span class="dd-hp charge"><i :style="{ width: pct(who.charge, chargeMax) }"></i></span><small>{{ who.charge }}/{{ chargeMax }}</small></div>
        <div class="dd-weapon">
          <span><strong>{{ who.weapon.name }}</strong> · poder {{ who.power }} · {{ who.weapon.ap }} PA · {{ who.weapon.cost }} carga · alcance {{ who.weapon.range }}</span>
          <span>Munição: <span v-for="t in who.ammo" :key="t" class="dd-type" :style="typeStyle(t)">{{ TYPE_LABELS_PT[t] }}</span><template v-if="who.ammo.length > 1"> (70% / 30%)</template></span>
          <span v-if="!me.fusion && ammoOptions(activeMember).length > 1" class="dd-ammo">
            <button v-for="opt in ammoOptions(activeMember)" :key="ammoKey(opt)" type="button" :class="{ on: ammoKey(opt) === ammoKey(activeMember.ammo) }" :disabled="!myTurn" @click="chooseAmmo(opt)">{{ ammoLabel(opt) }}</button>
          </span>
        </div>
      </div>
    </section>

    <ol class="dd-team" aria-label="Sua equipe">
      <li v-for="(m, i) in me.team" :key="m.id">
        <button type="button" :class="{ active: i === me.active && !me.fusion, fusing: !!me.fusion && (i === me.fusion.a || i === me.fusion.b), out: m.hp <= 0 || (m.status !== 'ready' && i !== me.active) }" :disabled="!myTurn || !!me.fusion || (i === me.active && !me.mustSwitch) || m.hp <= 0 || m.status !== 'ready'" @click="doSwitch(i)">
          <small class="dd-num">{{ i + 1 }}</small>
          <img v-if="!brokenSprites.has(m.dexId)" :src="sprite(m.dexId)" alt="" @error="brokenSprites.add(m.dexId)" />
          <span v-else class="dd-nosprite">?</span>
          <span class="dd-name">{{ m.name }}</span>
          <span class="dd-hp"><i :style="{ width: pct(m.hp, m.maxHp) }"></i></span>
          <span class="dd-hp charge"><i :style="{ width: pct(m.charge, m.maxCharge) }"></i></span>
          <small>{{ statusLabel(i) }}</small>
        </button>
      </li>
    </ol>

    <details class="dd-log"><summary>Registro do duelo</summary><ol><li v-for="(line, i) in duel.log.slice(-16).reverse()" :key="i">{{ line.side === side ? 'Você' : friend }}: {{ line.text }}</li></ol></details>

    <div class="dd-foot">
      <small>Sem moedas, XP nem gemas: o duelo é só pela vitória.</small>
      <button v-if="!over" type="button" class="dd-forfeit" :class="{ sure: confirmForfeit }" @click="forfeit">{{ confirmForfeit ? 'Toque de novo para desistir' : '🏳️ Desistir' }}</button>
    </div>

    <div v-if="outcome" class="dd-result" role="dialog" aria-label="Fim do duelo">
      <div class="dd-result-box">
        <h3>{{ outcome.title }}</h3>
        <p>{{ outcome.text }}</p>
        <p class="dd-hint">Nada foi ganho ou perdido na Vila: o duelo não rende prêmio.</p>
        <button type="button" class="primary" @click="emit('leave')">Voltar</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dd { --floor-a: #43395c; --floor-b: #362d4c; --speck: #5a4e72; --wall-top: #5a4e72; --wall-side: #2a2338; --wall-edge: #17121f; --frame: #3d3158; --bg-a: #251c3a; --bg-b: #0f0c18; --accent: #d9e6ff; position: relative; display: grid; gap: 8px; align-content: start; color: var(--text); }
.dd-turn { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 10px; border: 1px solid var(--line); background: #0007; }
.dd-turn.mine { border-color: #3fae5a; box-shadow: 0 0 10px #3fae5a55; }
.dd-turn.theirs { border-color: #b84a5a; }
.dd-pill { padding: 3px 9px; border-radius: 999px; background: #0007; border: 1px solid #ffffff22; font-size: 0.78rem; }
.dd-pill.none { color: #ffb3b3; border-color: #ff667088; }
.dd-ap { display: inline-flex; align-items: center; gap: 4px; }
.dd-ap b { color: var(--gold); font-size: 0.85em; }
.dd-ap i { display: inline-block; width: 9px; height: 9px; margin: 0 1px; border-radius: 2px; border: 1px solid var(--gold); transform: rotate(45deg); }
.dd-ap i.on { background: linear-gradient(135deg, #fff2b0, var(--gold)); box-shadow: 0 0 5px var(--gold); }
.dd-ap.empty { border-color: #ff667088; color: #ffb3b3; }
.dd-foe { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 10px; background: #3a1d2a; border: 1px solid #7a3446; font-size: 0.78rem; }
.dd-foe-name { font-weight: 700; max-width: 7em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dd-foe-team { list-style: none; margin: 0; padding: 0; display: flex; gap: 6px; flex: 1; justify-content: flex-end; flex-wrap: wrap; }
.dd-foe-team li { display: flex; flex-direction: column; align-items: center; width: 44px; gap: 1px; opacity: 0.85; }
.dd-foe-team li.field { opacity: 1; outline: 1px solid #ff9aa8; border-radius: 6px; }
.dd-foe-team li.down { opacity: 0.4; filter: grayscale(1); }
.dd-foe-team img { width: 30px; height: 30px; object-fit: contain; image-rendering: pixelated; }
.dd-foe-team small { font-size: 0.58rem; color: var(--muted); }
.dd-hp { position: relative; display: block; height: 5px; width: 100%; background: #0006; border-radius: 3px; overflow: hidden; flex: 1; }
.dd-hp i { position: absolute; inset: 0 auto 0 0; background: var(--ok); transition: width 0.3s; }
.dd-hp.charge i { background: #6fb6ff; }
.dd-grid { position: relative; display: grid; gap: 0; padding: 7px; background: var(--wall-side); border: 2px solid var(--wall-edge); border-radius: 10px; box-shadow: inset 0 0 0 3px var(--wall-top), inset 0 0 26px #000d, 0 0 18px color-mix(in srgb, var(--frame) 45%, transparent); overflow: hidden; }
.dd-grid.theirs { border-color: #b84a5a; }
.dd-cell { position: relative; aspect-ratio: 1; padding: 0; border: 0; border-radius: 0; background-color: var(--floor-a); background-image: radial-gradient(circle at 22% 30%, var(--speck) 0 1.5px, transparent 2px), radial-gradient(circle at 70% 72%, var(--speck) 0 1px, transparent 1.5px), linear-gradient(135deg, var(--floor-a), var(--floor-b)); box-shadow: inset 0 0 0 0.5px #0000001f; display: flex; align-items: center; justify-content: center; overflow: visible; touch-action: manipulation; }
.dd-cell.alt { background-image: radial-gradient(circle at 62% 24%, var(--speck) 0 1.2px, transparent 1.7px), radial-gradient(circle at 30% 78%, var(--speck) 0 1.5px, transparent 2px), linear-gradient(160deg, var(--floor-b), var(--floor-a)); }
.dd-cell.barrier { background: repeating-linear-gradient(90deg, #7fe7ff55 0 3px, #1b2a40 3px 7px); box-shadow: inset 0 0 0 2px #7fe7ff99; }
.dd-cell.wall { background: linear-gradient(135deg, var(--wall-top), color-mix(in srgb, var(--wall-top) 75%, var(--wall-side))); box-shadow: inset 0 0 0 1px var(--wall-edge); z-index: 1; }
.dd-cell.wall-front { background: linear-gradient(180deg, var(--wall-top) 0 46%, var(--wall-edge) 46% 50%, var(--wall-side) 50% 100%); box-shadow: inset 0 0 0 1px var(--wall-edge), 0 3px 4px #0007; }
.dd-cell.reach { background: linear-gradient(135deg, #2f6a80, #245468); }
.dd-cell.in-range::before { content: ''; position: absolute; inset: 2px; border: 2px dashed #ffd76a8c; border-radius: 4px; pointer-events: none; }
.dd-grid.aiming .dd-cell.in-range::before { inset: 1px; border: 2px solid #ffd76a; background: #ffd76a33; }
.dd-cell.target { box-shadow: inset 0 0 0 2px var(--warn); }
.dd-cell.area { background: #8a3442; }
.dd-cell.pending { box-shadow: inset 0 0 0 3px var(--gold); }
.dd-cost { position: absolute; top: 1px; left: 3px; font-size: 0.62rem; color: #cfe; z-index: 2; }
.dd-trap { position: absolute; right: 1px; bottom: 1px; font-size: 0.8rem; z-index: 1; }
.dd-trap.theirs { filter: hue-rotate(300deg) drop-shadow(0 0 2px #f44); }
.dd-mon { position: relative; z-index: 1; display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; border-radius: 50%; }
.dd-mon.mine { box-shadow: 0 0 0 2px var(--gold); }
.dd-mon.theirs { box-shadow: 0 0 0 2px #ff6b7a; }
.dd-mon.fused { box-shadow: 0 0 0 2px #b38cff, 0 0 10px #b38cff; }
.dd-mon img { width: 120%; height: 120%; object-fit: contain; image-rendering: pixelated; pointer-events: none; position: relative; top: -14%; animation: dd-bob 1.8s ease-in-out infinite; }
.dd-mon.fused img { width: 70%; height: 70%; top: 0; }
.dd-burn { position: absolute; top: 0; right: 0; z-index: 3; font-size: 0.8rem; }
.dd-hp.bar { position: absolute; left: 10%; right: 10%; bottom: 3px; width: auto; height: 4px; z-index: 2; box-shadow: 0 0 0 1px #0009; }
.dd-hp.bar.theirs i { background: var(--warn); }
.dd-nosprite { font-size: 0.6rem; color: var(--muted); line-height: 1; text-align: center; }
.dd-popup { position: absolute; left: 50%; top: 10%; z-index: 3; transform: translateX(-50%); font-weight: 800; font-size: 0.95rem; pointer-events: none; text-shadow: 0 1px 2px #000, 0 0 4px #000; animation: dd-pop 1s ease-out forwards; }
.dd-popup.hit { color: #ffe066; }
.dd-popup.hurt { color: #ff6b6b; }
.dd-popup.heal { color: #6bff9a; }
.dd-popup.info { color: #ddd; }
.dd-guide { margin: 0; min-height: 2.8em; padding: 6px 10px; border-radius: 10px; font-size: 0.86rem; display: flex; align-items: center; gap: 8px; background: #0006; border: 1px solid var(--line); }
.dd-guide.hot { border-color: #3fae5a; }
.dd-guide.wait { border-color: #b84a5a; color: #ffd0d6; }
.dd-guide-text { flex: 1; min-width: 0; }
.dd-guide button { min-width: 84px; min-height: 40px; }
.dd-last { margin: 0; font-size: 0.74rem; color: var(--muted); }
.dd-commands { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.dd-commands button { min-height: 50px; padding: 2px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface-2); color: inherit; font-size: 0.7rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; touch-action: manipulation; }
.dd-commands button b { font-size: 1rem; font-weight: 400; }
.dd-commands button small { font-size: 0.62rem; color: var(--muted); }
.dd-commands button.on { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }
.dd-commands button.hot { animation: dd-hot 1.1s ease-in-out infinite alternate; }
.dd-fusion { display: grid; gap: 6px; padding: 8px; border-radius: 10px; background: var(--surface); border: 1px solid #b38cff; }
.dd-fusion-pick { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 4px; }
.dd-fusion-pick button { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: inherit; font-size: 0.72rem; }
.dd-fusion-pick button.on { border-color: #b38cff; }
.dd-row { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 6px; }
.dd-hint { margin: 0; color: var(--muted); font-size: 0.8rem; }
.dd-warn { margin: 0; color: var(--warn); font-size: 0.82rem; }
.dd-active { display: flex; gap: 10px; align-items: center; background: linear-gradient(135deg, var(--surface-2), var(--surface)); border: 1px solid var(--line); border-radius: 12px; padding: 6px 8px; font-size: 0.76rem; }
.dd-active.fused { border-color: #b38cff; }
.dd-weapon-col { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.dd-sockets { display: flex; gap: 3px; }
.dd-active-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.dd-bar { display: flex; align-items: center; gap: 6px; }
.dd-bar > span:first-child { min-width: 3em; }
.dd-weapon { display: flex; flex-direction: column; gap: 2px; color: var(--muted); font-size: 0.72rem; }
.dd-weapon strong { color: var(--text); }
.dd-ammo { display: flex; flex-wrap: wrap; gap: 4px; }
.dd-ammo button { padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface-2); color: inherit; font-size: 0.7rem; }
.dd-ammo button.on { border-color: var(--gold); }
.dd-type { display: inline-block; padding: 0 6px; margin-left: 4px; border-radius: 999px; font-size: 0.68rem; color: #fff; text-shadow: 0 1px 1px #0008; }
.dd-team { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
.dd-team button { width: 100%; display: flex; flex-direction: column; align-items: stretch; gap: 2px; padding: 4px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: inherit; position: relative; font-size: 0.66rem; touch-action: manipulation; }
.dd-team button.active { border-color: var(--gold); box-shadow: 0 0 6px #ffcb0544; }
.dd-team button.fusing { border-color: #b38cff; }
.dd-team button.out { opacity: 0.55; }
.dd-team button:disabled.active, .dd-team button:disabled.fusing { opacity: 1; }
.dd-team img { width: 30px; height: 30px; object-fit: contain; align-self: center; image-rendering: pixelated; }
.dd-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
.dd-num { position: absolute; top: 2px; left: 4px; color: var(--muted); }
.dd-log { color: var(--muted); font-size: 0.78rem; }
.dd-log summary { cursor: pointer; color: var(--gold); }
.dd-log ol { margin: 4px 0 0; padding-left: 1.2em; display: grid; gap: 2px; }
.dd-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--muted); }
.dd-forfeit { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: inherit; font-size: 0.78rem; }
.dd-forfeit.sure { border-color: var(--warn); color: var(--warn); }
.dd-result { position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center; padding: 16px; background: #000a; }
.dd-result-box { width: min(92vw, 380px); display: grid; gap: 10px; padding: 16px; border-radius: 14px; background: var(--surface); border: 1px solid var(--gold); text-align: center; }
.dd-result-box h3 { margin: 0; }
.dd-result-box p { margin: 0; }
@keyframes dd-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
@keyframes dd-pop { 0% { opacity: 0; transform: translate(-50%, 6px); } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -22px); } }
@keyframes dd-hot { from { box-shadow: 0 0 0 0 #ffcb0500; } to { box-shadow: 0 0 10px 2px #ffcb05aa; } }
@media (prefers-reduced-motion: reduce) { .dd-mon img, .dd-commands button.hot { animation: none; } .dd-popup { animation-duration: 0.01s; } }
</style>
