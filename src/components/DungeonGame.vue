<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import WeaponArt from './WeaponArt.vue';
import FusionArt from './FusionArt.vue';
import { getCache } from '../app/services';
import { cardCompanion } from '../app/card-evolution-store';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { statsOfDex } from '../core/survivor-stats';
import { typesOfDex } from '../core/species-filter';
import { speciesName } from '../core/survivor-evolution';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import {
  attack, attackArea, attackTargets, attacker, available, chooseReward, COSTS, endTurn, FLOORS, fuse, FUSION_CHARGE, FUSION_TURNS, GRID_H, GRID_W, key, move,
  previewAttack, previewFusion, PROFILES, reachable, REWARDS, START_AP, startDungeon, switchTo, threatenedCells, usePotion, weaponFor, WEAPONS,
} from '../core/dungeon';
import type { Cell, DungeonState, Enemy, EnemySpecies, MemberInput, RewardId, WeaponPattern } from '../core/dungeon';

/**
 * Masmorra (protótipo jogável do `future project/IDEIAS_DO_JOGO.md`): monta a equipe com Pokémon de verdade da coleção
 * (cartas escaneadas e Digital Pokémon) e joga as salas em grade. Espécie sem stats ou tipos no pacote de dados aparece
 * como «sem dados» e não entra — nada de número inventado.
 */
const props = defineProps<{ digital?: { instanceId: string; dexId: number; name: string }[] }>();
const emit = defineEmits<{ leave: [] }>();

interface Candidate extends Partial<MemberInput> { id: string; dexId: number; name: string; origin: string; missing: boolean }
interface Popup { id: number; cell: string; text: string; kind: 'hit' | 'hurt' }

/** Selvagens das salas (espécies comuns de caverna); só entram as que têm stats e tipos no pacote. */
const WILD = [19, 41, 50, 66, 74, 92, 104, 109, 95];
const PATTERN_TEXT: Readonly<Record<WeaponPattern, string>> = { adjacent: 'adjacente', line: 'em linha', ranged: 'tiro reto', area: 'área em cruz' };

const candidates = ref<Candidate[] | null>(null);
const picked = ref<string[]>([]);
const loadError = ref('');
const s = ref<DungeonState | null>(null);
const mode = ref<'move' | 'attack' | null>(null);
const pending = ref<Cell | null>(null);
const flash = ref('');
const fusionOpen = ref(false);
const fusionPick = ref<number[]>([]);
const brokenSprites = ref(new Set<number>());
const showThreat = ref(true);
const inspected = ref<number | null>(null);
const popups = ref<Popup[]>([]);
let popupId = 0;

const pool: EnemySpecies[] = WILD.flatMap((dexId) => {
  const stats = statsOfDex(dexId);
  const types = typesOfDex(dexId);
  return stats && types.length ? [{ dexId, name: speciesName(dexId) || `#${dexId}`, stats, types }] : [];
});

function describeMon(id: string, dexId: number, name: string, origin: string): Candidate {
  const stats = statsOfDex(dexId);
  const types = typesOfDex(dexId);
  return stats && types.length ? { id, dexId, name, origin, stats, types, missing: false } : { id, dexId, name, origin, missing: true };
}

onMounted(async () => {
  try {
    const cards = await (await getCache()).list();
    const out: Candidate[] = [];
    for (const c of cards) {
      const mon = cardCompanion(c);
      if (mon) out.push(describeMon(mon.id, mon.dexId, mon.name, `${c.setName} ${c.localId}`));
    }
    for (const d of props.digital ?? []) out.push(describeMon(d.instanceId, d.dexId, d.name, 'Digital Pokémon'));
    candidates.value = [...new Map(out.map((c) => [c.id, c])).values()];
  } catch (e) {
    loadError.value = `Não deu para ler a sua coleção: ${e instanceof Error ? e.message : String(e)}`;
    candidates.value = [];
  }
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

function togglePick(c: Candidate): void {
  if (c.missing) return;
  const i = picked.value.indexOf(c.id);
  if (i >= 0) picked.value.splice(i, 1);
  else if (picked.value.length < 6) picked.value.push(c.id);
}

function begin(): void {
  const team = picked.value.map((id) => candidates.value!.find((c) => c.id === id)!).map((c) => ({ id: c.id, dexId: c.dexId, name: c.name, types: c.types!, stats: c.stats! }));
  s.value = startDungeon(team, pool, (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
  mode.value = null;
  pending.value = null;
  inspected.value = null;
  flash.value = '';
}

const sprite = (dexId: number): string => pokemonSpriteUrl(dexId);
const typeStyle = (t: PokemonType) => ({ background: TYPE_COLORS[t] });
const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;

const cells = computed(() => {
  const out: Cell[] = [];
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) out.push({ x, y });
  return out;
});
const moveCosts = computed(() => (s.value && mode.value === 'move' ? reachable(s.value) : new Map<string, number>()));
const targetKeys = computed(() => new Set(s.value && mode.value === 'attack' ? attackTargets(s.value).map(key) : []));
const areaKeys = computed(() => new Set(s.value && mode.value === 'attack' && pending.value ? attackArea(s.value, pending.value).map(key) : []));
const threatKeys = computed(() => (s.value && showThreat.value && s.value.phase === 'player' ? threatenedCells(s.value) : new Set<string>()));
const doomKeys = computed(() => new Set(s.value?.bossThreat?.cells.map(key) ?? []));
const preview = computed(() => (s.value && mode.value === 'attack' && pending.value ? previewAttack(s.value, pending.value) : null));
const who = computed(() => (s.value ? attacker(s.value) : null));
const activeMember = computed(() => (s.value ? s.value.team[s.value.active]! : null));
const fusionPreview = computed(() => (s.value && fusionPick.value.length === 2 ? previewFusion(s.value, fusionPick.value[0]!, fusionPick.value[1]!) : null));
/** Pokémon de cada orbe na prévia da fusão, na ordem das armas de origem. */
const fusionPreviewOrbs = computed(() => {
  const st = s.value;
  const p = fusionPreview.value;
  if (!st || !p) return [];
  const [a, b] = fusionPick.value.map((i) => st.team[i]!);
  return a && b ? (p.origins[0] === a.weapon ? [a.dexId, b.dexId] : [b.dexId, a.dexId]) : [];
});
const playing = computed(() => s.value?.phase === 'player');
const inspectedEnemy = computed<Enemy | null>(() => s.value?.enemies.find((e) => e.uid === inspected.value) ?? null);

const wallAt = (c: Cell) => s.value!.walls.some((w) => w.x === c.x && w.y === c.y);
const enemyAt = (c: Cell) => s.value!.enemies.find((e) => e.pos.x === c.x && e.pos.y === c.y);
const playerAt = (c: Cell) => s.value!.pos.x === c.x && s.value!.pos.y === c.y;
const popupsAt = (c: Cell) => popups.value.filter((p) => p.cell === key(c));

function popup(cell: Cell, text: string, kind: Popup['kind']): void {
  const id = ++popupId;
  popups.value.push({ id, cell: key(cell), text, kind });
  setTimeout(() => { popups.value = popups.value.filter((p) => p.id !== id); }, 900);
}

function result(r: { ok: boolean; reason?: string }): void {
  flash.value = r.ok ? '' : r.reason ?? '';
}

function setMode(next: 'move' | 'attack'): void {
  mode.value = mode.value === next ? null : next;
  pending.value = null;
  inspected.value = null;
}

function tapCell(c: Cell): void {
  const st = s.value;
  if (!st || !playing.value) return;
  if (!mode.value) {
    // Sem ação escolhida, tocar num inimigo mostra quem ele é e como se comporta.
    const e = enemyAt(c);
    inspected.value = e && inspected.value !== e.uid ? e.uid : null;
    return;
  }
  const k = key(c);
  const valid = mode.value === 'move' ? (moveCosts.value.get(k) ?? 0) > 0 : targetKeys.value.has(k);
  if (!valid) { pending.value = null; return; }
  // Toque na mesma casa confirma; noutra casa só troca a prévia.
  if (pending.value && key(pending.value) === k) return confirm();
  pending.value = c;
}

function confirm(): void {
  const st = s.value;
  if (!st || !pending.value) return;
  if (mode.value === 'move') result(move(st, pending.value));
  else if (mode.value === 'attack') {
    const hits = previewAttack(st, pending.value);
    const r = attack(st, pending.value);
    if (r.ok) for (const h of hits.hits) popup(h.enemy.pos, `−${h.damage}`, 'hit');
    result(r);
  }
  pending.value = null;
  if (mode.value === 'move' || (mode.value === 'attack' && attackTargets(st).length === 0)) mode.value = null;
}

function doSwitch(i: number): void {
  if (!s.value) return;
  result(switchTo(s.value, i));
  mode.value = null;
  pending.value = null;
}

function doPotion(): void {
  if (s.value) result(usePotion(s.value));
}

function doEnd(): void {
  const st = s.value;
  if (!st) return;
  mode.value = null;
  pending.value = null;
  inspected.value = null;
  const before = st.team.reduce((sum, m) => sum + m.hp, 0);
  result(endTurn(st));
  const lost = before - st.team.reduce((sum, m) => sum + m.hp, 0);
  if (lost > 0) popup(st.pos, `−${lost}`, 'hurt');
}

function openFusion(): void {
  fusionPick.value = [];
  fusionOpen.value = true;
}

function toggleFusion(i: number): void {
  const at = fusionPick.value.indexOf(i);
  if (at >= 0) fusionPick.value.splice(at, 1);
  else if (fusionPick.value.length < 2) fusionPick.value.push(i);
}

function confirmFusion(): void {
  if (!s.value || fusionPick.value.length !== 2) return;
  result(fuse(s.value, fusionPick.value[0]!, fusionPick.value[1]!));
  fusionOpen.value = false;
}

function pickReward(r: RewardId): void {
  if (s.value) result(chooseReward(s.value, r, pool));
}

function onKey(e: KeyboardEvent): void {
  if (!s.value || e.target instanceof HTMLInputElement) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 6) {
    if (fusionOpen.value) toggleFusion(n - 1);
    else if (n - 1 < s.value.team.length) doSwitch(n - 1);
  } else if (e.key === 'm' || e.key === 'M') setMode('move');
  else if (e.key === 'a' || e.key === 'A') setMode('attack');
  else if (e.key === 'Enter' && pending.value) confirm();
  else if (e.key === 'e' || e.key === 'E') doEnd();
  else if (e.key === 'Escape') { mode.value = null; pending.value = null; fusionOpen.value = false; inspected.value = null; }
}

function statusLabel(i: number): string {
  const st = s.value!;
  const m = st.team[i]!;
  if (st.fusion && (i === st.fusion.a || i === st.fusion.b)) return 'fusão';
  if (i === st.active) return 'ativo';
  if (m.status === 'down') return 'caído';
  if (m.status === 'exhausted') return `CD:${m.cooldown}`;
  if (m.status === 'recovering') return `rec.:${m.cooldown}`;
  return 'pronto';
}

const pendingText = computed(() => {
  if (!pending.value || !s.value) return '';
  if (mode.value === 'move') {
    const cost = moveCosts.value.get(key(pending.value)) ?? 0;
    const danger = threatKeys.value.has(key(pending.value)) ? ' · casa ameaçada' : '';
    return `Mover ${cost} casa(s) · ${cost * COSTS.move} PA${danger}`;
  }
  const p = preview.value;
  if (!p) return '';
  if (p.reason) return p.reason;
  const hits = p.hits.map((h) => `${h.enemy.name} −${h.damage}${h.parts.some((x) => x.factor > 1) ? ' (eficaz)' : h.parts.some((x) => x.factor < 1) ? ' (resiste)' : ''}`).join(', ');
  return `${who.value!.weapon.name}: ${hits} · ${p.ap} PA · ${p.cost} carga`;
});
</script>

<template>
  <div class="dungeon">
    <!-- Escolha da equipe -->
    <section v-if="!s" class="dg-pick">
      <h2>Masmorra · protótipo</h2>
      <p class="hint">Dungeon crawler tático em turnos: monte uma equipe de até seis Pokémon da sua coleção, desça {{ FLOORS }} andares e derrote o chefe. Cada turno tem {{ START_AP }} PA para mover, atacar, trocar, usar item ou fundir dois Pokémon. Cada Pokémon luta com uma arma; a orbe dela guarda o Pokémon.</p>
      <p class="hint dg-provisional">Provisório: a arma de cada Pokémon sai dos stats base dele e a munição é o tipo principal da espécie, até a tabela de armas e munições ser definida.</p>
      <p v-if="loadError" role="alert">{{ loadError }}</p>
      <p v-if="candidates === null" class="hint">Lendo a sua coleção…</p>
      <p v-else-if="candidates.length === 0" class="hint">Nenhum Pokémon na coleção ainda. Escaneie uma carta ou invoque um Digital Pokémon na fonte da Vila.</p>
      <p v-else-if="pool.length === 0" role="alert">Sem dados das espécies selvagens no pacote: a masmorra não pode montar inimigos.</p>
      <ul v-if="candidates?.length" class="dg-candidates">
        <li v-for="c in candidates" :key="c.id">
          <button type="button" :class="{ on: picked.includes(c.id) }" :disabled="c.missing || (!picked.includes(c.id) && picked.length >= 6)" @click="togglePick(c)">
            <small v-if="picked.includes(c.id)" class="dg-order">{{ picked.indexOf(c.id) + 1 }}</small>
            <template v-if="c.missing">
              <img v-if="!brokenSprites.has(c.dexId)" :src="sprite(c.dexId)" alt="" loading="lazy" class="dg-pick-sprite" @error="brokenSprites.add(c.dexId)" />
              <strong>{{ c.name }}</strong>
              <small>sem dados de stats/tipos</small>
            </template>
            <template v-else>
              <WeaponArt :weapon="weaponFor(c.stats!)" :dex-id="c.dexId" :ammo="c.types![0] ?? null" :size="72" />
              <strong>{{ c.name }}</strong>
              <small>{{ WEAPONS[weaponFor(c.stats!)].name }}</small>
              <span class="dg-types"><span v-for="t in c.types" :key="t" class="dg-type" :style="typeStyle(t)">{{ TYPE_LABELS_PT[t] }}</span></span>
            </template>
          </button>
        </li>
      </ul>
      <div class="dg-actions">
        <button type="button" class="primary" :disabled="picked.length === 0 || pool.length === 0" @click="begin">Entrar na masmorra ({{ picked.length }}/6)</button>
        <button type="button" @click="emit('leave')">Voltar</button>
      </div>
    </section>

    <!-- Combate -->
    <section v-else class="dg-run">
      <header class="dg-hud">
        <span class="dg-pill">Andar {{ s.floor }}/{{ FLOORS }}</span>
        <span class="dg-pill">Turno {{ s.round }}</span>
        <span class="dg-pill dg-ap" :aria-label="`${s.ap} de ${START_AP} PA`">PA <i v-for="n in START_AP" :key="n" :class="{ on: n <= s.ap }"></i></span>
        <span class="dg-pill" title="Cargas de fusão">💠 {{ s.fusionCharges }}</span>
        <span class="dg-pill" title="Poções">🧪 {{ s.potions }}</span>
        <label class="dg-toggle"><input v-model="showThreat" type="checkbox" /> ameaça</label>
      </header>

      <div class="dg-grid" :style="{ gridTemplateColumns: `repeat(${GRID_W}, 1fr)` }">
        <button
          v-for="c in cells"
          :key="key(c)"
          type="button"
          class="dg-cell"
          :class="{
            wall: wallAt(c),
            reach: (moveCosts.get(key(c)) ?? 0) > 0,
            target: targetKeys.has(key(c)),
            area: areaKeys.has(key(c)),
            pending: pending && key(pending) === key(c),
            danger: threatKeys.has(key(c)) && !wallAt(c),
            doom: doomKeys.has(key(c)),
          }"
          :aria-label="`Casa ${c.x + 1},${c.y + 1}${enemyAt(c) ? `: ${enemyAt(c)!.name}` : ''}`"
          @click="tapCell(c)"
        >
          <small v-if="mode === 'move' && (moveCosts.get(key(c)) ?? 0) > 0" class="dg-cost">{{ moveCosts.get(key(c)) }}</small>
          <template v-if="enemyAt(c)">
            <img v-if="!brokenSprites.has(enemyAt(c)!.dexId)" :src="sprite(enemyAt(c)!.dexId)" :alt="enemyAt(c)!.name" :class="{ boss: enemyAt(c)!.boss }" @error="brokenSprites.add(enemyAt(c)!.dexId)" />
            <span v-else class="dg-nosprite">{{ enemyAt(c)!.name }}</span>
            <span class="dg-profile" :title="PROFILES[enemyAt(c)!.profile].name">{{ PROFILES[enemyAt(c)!.profile].icon }}</span>
            <span class="dg-hp enemy"><i :style="{ width: pct(enemyAt(c)!.hp, enemyAt(c)!.maxHp) }"></i></span>
          </template>
          <template v-else-if="playerAt(c)">
            <span class="dg-player" :class="{ fused: !!s.fusion }">
              <template v-for="i in (s.fusion ? [s.fusion.a, s.fusion.b] : [s.active])" :key="i">
                <img v-if="!brokenSprites.has(s.team[i]!.dexId)" :src="sprite(s.team[i]!.dexId)" :alt="s.team[i]!.name" @error="brokenSprites.add(s.team[i]!.dexId)" />
                <span v-else class="dg-nosprite">{{ s.team[i]!.name }}</span>
              </template>
            </span>
          </template>
          <span v-for="p in popupsAt(c)" :key="p.id" class="dg-popup" :class="p.kind">{{ p.text }}</span>
        </button>
      </div>

      <p class="dg-preview" aria-live="polite">
        <template v-if="pendingText">{{ pendingText }} <button v-if="mode === 'attack' ? !preview?.reason : true" type="button" class="primary small" @click="confirm">Confirmar</button></template>
        <template v-else-if="flash"><span class="dg-warn">{{ flash }}</span></template>
        <template v-else-if="s.mustSwitch">Escolha quem assume a posição (troca grátis).</template>
        <template v-else-if="s.bossThreat && !mode"><span class="dg-warn">O chefe vai soltar o golpe nas casas marcadas: saia delas antes de encerrar.</span></template>
        <template v-else-if="mode === 'move'">Toque numa casa marcada para mover.</template>
        <template v-else-if="mode === 'attack'">{{ targetKeys.size ? 'Toque num alvo para ver o dano.' : 'Nenhum inimigo ao alcance desta arma.' }}</template>
        <template v-else>{{ s.log[s.log.length - 1] }}</template>
      </p>

      <div v-if="inspectedEnemy" class="dg-enemy-card">
        <img v-if="!brokenSprites.has(inspectedEnemy.dexId)" :src="sprite(inspectedEnemy.dexId)" alt="" />
        <div>
          <strong>{{ PROFILES[inspectedEnemy.profile].icon }} {{ inspectedEnemy.name }}</strong>
          <span v-for="t in inspectedEnemy.types" :key="t" class="dg-type" :style="typeStyle(t)">{{ TYPE_LABELS_PT[t] }}</span>
          <small>{{ PROFILES[inspectedEnemy.profile].name }}: {{ PROFILES[inspectedEnemy.profile].text }}</small>
          <small>{{ WEAPONS[inspectedEnemy.weapon].name }} ({{ PATTERN_TEXT[WEAPONS[inspectedEnemy.weapon].pattern] }}, alcance {{ WEAPONS[inspectedEnemy.weapon].range }}) · HP {{ inspectedEnemy.hp }}/{{ inspectedEnemy.maxHp }}{{ inspectedEnemy.shaken ? ' · defesa abalada' : '' }}</small>
        </div>
      </div>

      <div v-if="activeMember && who" class="dg-active" :class="{ fused: !!s.fusion }">
        <FusionArt v-if="s.fusion" :origins="s.fusion.origins" :orbs="who.orbs" :ammo="who.ammo" :size="84" />
        <WeaponArt v-else :weapon="activeMember.weapon" :dex-id="activeMember.dexId" :ammo="activeMember.ammo[0] ?? null" :size="84" />
        <div class="dg-active-info">
          <div>
            <strong>{{ s.fusion ? s.fusion.name : activeMember.name }}</strong>
            <span v-for="t in (s.fusion ? who.types : activeMember.types)" :key="t" class="dg-type" :style="typeStyle(t)">{{ TYPE_LABELS_PT[t] }}</span>
            <template v-if="s.fusion"> · {{ s.fusion.turnsLeft }} turno(s)</template>
          </div>
          <div v-for="i in (s.fusion ? [s.fusion.a, s.fusion.b] : [s.active])" :key="i" class="dg-bar">
            <span>{{ s.fusion ? s.team[i]!.name : 'HP' }}</span><span class="dg-hp"><i :style="{ width: pct(s.team[i]!.hp, s.team[i]!.maxHp) }"></i></span><small>{{ s.team[i]!.hp }}/{{ s.team[i]!.maxHp }}</small>
          </div>
          <div class="dg-bar">
            <span>Carga</span><span class="dg-hp charge"><i :style="{ width: pct(who.charge, s.fusion ? s.fusion.maxCharge : activeMember.maxCharge) }"></i></span><small>{{ who.charge }}/{{ s.fusion ? s.fusion.maxCharge : activeMember.maxCharge }}</small>
          </div>
          <div class="dg-weapon">
            <span v-if="!s.fusion"><strong>{{ who.weapon.name }}</strong> · {{ who.weapon.category }}</span>
            <span>{{ who.weapon.kind === 'physical' ? 'Físico' : 'Especial' }} · {{ who.weapon.ap }} PA · {{ who.weapon.cost }} carga · {{ PATTERN_TEXT[who.weapon.pattern] }}, alcance {{ who.weapon.range }} · poder {{ who.weapon.power }}</span>
            <span>Munição: <span v-for="t in who.ammo" :key="t" class="dg-type" :style="typeStyle(t)">{{ TYPE_LABELS_PT[t] }}</span><template v-if="who.ammo.length > 1"> (70% / 30%)</template></span>
          </div>
        </div>
      </div>

      <nav class="dg-commands" aria-label="Ações">
        <button type="button" :class="{ on: mode === 'move' }" :disabled="!playing || s.mustSwitch" @click="setMode('move')"><b>👣</b>Mover</button>
        <button type="button" :class="{ on: mode === 'attack' }" :disabled="!playing || s.mustSwitch" @click="setMode('attack')"><b>⚔️</b>Atacar</button>
        <button type="button" :disabled="!playing || s.mustSwitch || s.potions === 0 || s.ap < COSTS.item" @click="doPotion"><b>🧪</b>Poção · {{ COSTS.item }}</button>
        <button type="button" :disabled="!playing || s.mustSwitch || !!s.fusion || s.fusionCharges === 0" @click="openFusion"><b>💠</b>Fusão · {{ COSTS.fusion }}</button>
        <button type="button" class="primary" :disabled="!playing || s.mustSwitch" @click="doEnd"><b>⏭️</b>Encerrar</button>
      </nav>

      <ol class="dg-team" aria-label="Equipe">
        <li v-for="(m, i) in s.team" :key="m.id">
          <button type="button" :class="{ active: i === s.active && !s.fusion, fusing: !!s.fusion && (i === s.fusion.a || i === s.fusion.b), out: !available(s, i) && i !== s.active }" :disabled="!playing || !!s.fusion || (i === s.active && !s.mustSwitch) || !available(s, i)" @click="doSwitch(i)">
            <small class="dg-num">{{ i + 1 }}</small>
            <WeaponArt class="dg-team-weapon" :weapon="m.weapon" :orb="false" :size="22" />
            <img v-if="!brokenSprites.has(m.dexId)" :src="sprite(m.dexId)" alt="" @error="brokenSprites.add(m.dexId)" />
            <span v-else class="dg-nosprite">?</span>
            <span class="dg-name">{{ m.name }}</span>
            <span class="dg-hp"><i :style="{ width: pct(m.hp, m.maxHp) }"></i></span>
            <span class="dg-hp charge"><i :style="{ width: pct(m.charge, m.maxCharge) }"></i></span>
            <small>{{ statusLabel(i) }}</small>
          </button>
        </li>
      </ol>

      <details class="dg-log"><summary>Registro</summary><ol><li v-for="(line, i) in s.log.slice(-12).reverse()" :key="i">{{ line }}</li></ol></details>

      <!-- Fusão -->
      <div v-if="fusionOpen" class="dg-modal" role="dialog" aria-label="Escolher fusão">
        <div class="dg-modal-box">
          <h3>Escolher fusão</h3>
          <div class="dg-fusion-grid">
            <button v-for="(m, i) in s.team" :key="m.id" type="button" :class="{ on: fusionPick.includes(i) }" :disabled="!available(s, i)" @click="toggleFusion(i)">
              <WeaponArt :weapon="m.weapon" :dex-id="m.dexId" :ammo="m.ammo[0] ?? null" :size="46" />
              <span>{{ fusionPick.includes(i) ? '✓ ' : '' }}{{ m.name }}</span>
              <small>{{ available(s, i) ? WEAPONS[m.weapon].name : statusLabel(i) }}</small>
            </button>
          </div>
          <template v-if="fusionPreview">
            <FusionArt class="dg-fusion-preview" :origins="fusionPreview.origins" :orbs="fusionPreviewOrbs" :ammo="fusionPreview.ammo" :size="110" />
            <p class="hint dg-center">{{ fusionPreview.name }}</p>
            <p class="hint">{{ fusionPreview.weapon.description }}</p>
            <ul class="dg-facts">
              <li>Munição: {{ fusionPreview.ammo.map((t) => TYPE_LABELS_PT[t]).join(' / ') }}{{ fusionPreview.ammo.length > 1 ? ' (70% / 30%)' : '' }}</li>
              <li>{{ fusionPreview.weapon.ap }} PA e {{ fusionPreview.weapon.cost }} carga por ataque · poder {{ fusionPreview.weapon.power }} · alcance {{ fusionPreview.weapon.range }}</li>
              <li>Duração: {{ FUSION_TURNS }} turnos · Ativação: {{ COSTS.fusion }} PA + 1 buff · Carga temporária: {{ FUSION_CHARGE }}</li>
              <li>O dano recebido é dividido entre os dois; depois, ambos descansam 1 rodada.</li>
            </ul>
            <p v-if="fusionPreview.reason" class="dg-warn">{{ fusionPreview.reason }}</p>
          </template>
          <p v-else class="hint">Escolha dois membros (teclas 1 a 6 no PC).</p>
          <div class="dg-actions">
            <button type="button" @click="fusionOpen = false">Cancelar</button>
            <button type="button" class="primary" :disabled="!fusionPreview?.ok" @click="confirmFusion">Ativar</button>
          </div>
        </div>
      </div>

      <!-- Recompensa / fim -->
      <div v-if="s.phase === 'reward'" class="dg-modal" role="dialog" aria-label="Recompensa">
        <div class="dg-modal-box">
          <h3>Sala limpa!</h3>
          <button v-for="r in s.rewardOptions" :key="r" type="button" class="dg-reward" @click="pickReward(r)"><strong>{{ REWARDS[r].name }}</strong><small>{{ REWARDS[r].text }}</small></button>
        </div>
      </div>
      <div v-if="s.phase === 'won' || s.phase === 'lost'" class="dg-modal" role="dialog" aria-label="Fim da expedição">
        <div class="dg-modal-box">
          <h3>{{ s.phase === 'won' ? 'Masmorra concluída!' : 'Expedição encerrada' }}</h3>
          <p class="hint">{{ s.log[s.log.length - 1] }} Andar {{ s.floor }} de {{ FLOORS }}, {{ s.round }} turno(s) na última sala.</p>
          <div class="dg-actions">
            <button type="button" class="primary" @click="s = null">Nova expedição</button>
            <button type="button" @click="emit('leave')">Sair</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dungeon { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 12px calc(12px + env(safe-area-inset-bottom)); color: var(--text); background: radial-gradient(ellipse at top, #251c3a, #0f0c18 70%); }
.dg-pick h2 { margin: 0 0 6px; }
.hint { color: var(--muted); font-size: 0.88rem; margin: 4px 0; }
.dg-center { text-align: center; }
.dg-provisional { border-left: 3px solid var(--pending); padding-left: 8px; }
.dg-candidates { list-style: none; padding: 0; margin: 10px 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; }
.dg-candidates button { position: relative; width: 100%; min-height: 150px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px; border-radius: 12px; border: 2px solid var(--line); background: linear-gradient(180deg, var(--surface-2), var(--surface)); color: inherit; }
.dg-candidates button.on { border-color: var(--gold); box-shadow: 0 0 10px #ffcb0555; }
.dg-candidates button:disabled { opacity: 0.45; }
.dg-candidates small { color: var(--muted); font-size: 0.72rem; text-align: center; }
.dg-order { position: absolute; top: 4px; left: 6px; width: 18px; height: 18px; border-radius: 50%; background: var(--gold); color: #1a1400 !important; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.dg-pick-sprite { width: 48px; height: 48px; object-fit: contain; image-rendering: pixelated; }
.dg-types { display: flex; gap: 2px; flex-wrap: wrap; justify-content: center; }
.dg-nosprite { font-size: 0.6rem; color: var(--muted); line-height: 1; text-align: center; }
.dg-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.dg-actions button { min-height: var(--ui-touch, 44px); padding: 0 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface-2); color: inherit; }
.primary { background: var(--accent) !important; color: var(--on-accent); border-color: transparent !important; }
.primary.small { min-height: 30px; padding: 0 10px; border-radius: 8px; margin-left: 6px; }
button:disabled { opacity: 0.5; }

.dg-run { display: flex; flex-direction: column; gap: 8px; max-width: 540px; margin: 0 auto; }
.dg-hud { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 0.85rem; font-weight: 600; }
.dg-pill { padding: 3px 9px; border-radius: 999px; background: #0007; border: 1px solid #ffffff22; }
.dg-ap i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-left: 3px; border: 1px solid var(--gold); vertical-align: middle; }
.dg-ap i.on { background: var(--gold); box-shadow: 0 0 4px var(--gold); }
.dg-toggle { margin-left: auto; font-weight: 400; color: var(--muted); display: flex; align-items: center; gap: 4px; }

.dg-grid { display: grid; gap: 3px; padding: 6px; background: linear-gradient(180deg, #2b2240, #1b1529); border: 2px solid #3d3158; border-radius: 12px; box-shadow: inset 0 0 18px #000a; }
.dg-cell { position: relative; aspect-ratio: 1; padding: 0; border: 0; border-radius: 5px; background: linear-gradient(135deg, #43395c, #362d4c); display: flex; align-items: center; justify-content: center; overflow: visible; }
.dg-cell.wall { background: linear-gradient(180deg, #5a4e72 0 30%, #2a2338 30%); box-shadow: inset 0 -3px 0 #16111f; }
.dg-cell.danger::after { content: ''; position: absolute; inset: 0; border-radius: 5px; background: repeating-linear-gradient(45deg, #ff5a5a22 0 4px, transparent 4px 8px); pointer-events: none; }
.dg-cell.doom { box-shadow: inset 0 0 0 2px #ff3d3d; animation: dg-doom 0.9s ease-in-out infinite; }
.dg-cell.reach { background: linear-gradient(135deg, #2f6a80, #245468); }
.dg-cell.target { box-shadow: inset 0 0 0 2px var(--warn); }
.dg-cell.area { background: #8a3442; }
.dg-cell.pending { box-shadow: inset 0 0 0 3px var(--gold); }
.dg-cell img { width: 120%; height: 120%; object-fit: contain; image-rendering: pixelated; pointer-events: none; position: relative; top: -14%; z-index: 1; }
.dg-cell img.boss { width: 150%; height: 150%; top: -25%; filter: drop-shadow(0 0 4px #ff5a5a); }
.dg-cost { position: absolute; top: 2px; left: 4px; font-size: 0.65rem; color: #cde; }
.dg-profile { position: absolute; top: -4px; right: -4px; z-index: 2; font-size: 0.7rem; background: #0009; border-radius: 50%; width: 1.35em; height: 1.35em; display: flex; align-items: center; justify-content: center; }
.dg-player { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; border-radius: 50%; box-shadow: 0 0 0 2px var(--gold); }
.dg-player.fused { box-shadow: 0 0 0 2px #b38cff, 0 0 10px #b38cff; }
.dg-player.fused img { width: 70%; height: 70%; }
.dg-hp { position: relative; display: block; height: 5px; background: #0006; border-radius: 3px; overflow: hidden; flex: 1; }
.dg-hp i { position: absolute; inset: 0 auto 0 0; background: var(--ok); transition: width 0.3s; }
.dg-hp.charge i { background: #6fb6ff; }
.dg-cell .dg-hp.enemy { position: absolute; left: 10%; right: 10%; bottom: 3px; height: 4px; z-index: 2; }
.dg-cell .dg-hp.enemy i { background: var(--warn); }
.dg-popup { position: absolute; left: 50%; top: 10%; z-index: 3; transform: translateX(-50%); font-weight: 800; font-size: 0.9rem; pointer-events: none; text-shadow: 0 1px 2px #000, 0 0 4px #000; animation: dg-pop 0.9s ease-out forwards; }
.dg-popup.hit { color: #ffe066; }
.dg-popup.hurt { color: #ff6b6b; }

.dg-preview { min-height: 2.6em; margin: 0; font-size: 0.88rem; display: flex; align-items: center; flex-wrap: wrap; }
.dg-warn { color: var(--warn); }
.dg-enemy-card { display: flex; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 10px; background: #3a1d2a; border: 1px solid #7a3446; font-size: 0.82rem; }
.dg-enemy-card img { width: 44px; height: 44px; object-fit: contain; image-rendering: pixelated; }
.dg-enemy-card div { display: flex; flex-direction: column; gap: 2px; }
.dg-enemy-card small { color: var(--muted); }
.dg-active { display: flex; gap: 10px; align-items: center; background: linear-gradient(135deg, var(--surface-2), var(--surface)); border: 1px solid var(--line); border-radius: 12px; padding: 8px; font-size: 0.84rem; }
.dg-active.fused { border-color: #b38cff; box-shadow: 0 0 12px #b38cff44; flex-direction: column; align-items: stretch; }
.dg-active.fused :deep(.fusion-art) { align-self: center; }
.dg-active-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.dg-bar { display: flex; align-items: center; gap: 6px; }
.dg-bar > span:first-child { min-width: 3.4em; }
.dg-weapon { display: flex; flex-direction: column; gap: 2px; color: var(--muted); font-size: 0.8rem; }
.dg-weapon strong { color: var(--text); }
.dg-type { display: inline-block; padding: 0 6px; margin-left: 4px; border-radius: 999px; font-size: 0.7rem; color: #fff; text-shadow: 0 1px 1px #0008; }
.dg-commands { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.dg-commands button { min-height: 52px; padding: 2px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface-2); color: inherit; font-size: 0.74rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
.dg-commands button b { font-size: 1.05rem; font-weight: 400; }
.dg-commands button.on { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }

.dg-team { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
.dg-team button { width: 100%; display: flex; flex-direction: column; align-items: stretch; gap: 2px; padding: 4px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: inherit; position: relative; font-size: 0.68rem; }
.dg-team button.active { border-color: var(--gold); box-shadow: 0 0 6px #ffcb0544; }
.dg-team button.fusing { border-color: #b38cff; }
.dg-team button.out { opacity: 0.55; }
.dg-team button:disabled.active, .dg-team button:disabled.fusing { opacity: 1; }
.dg-team img { width: 32px; height: 32px; object-fit: contain; align-self: center; image-rendering: pixelated; }
.dg-team-weapon { position: absolute; top: 2px; right: 2px; }
.dg-team .dg-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dg-num { position: absolute; top: 2px; left: 4px; color: var(--muted); }
.dg-log { font-size: 0.8rem; color: var(--muted); }
.dg-log ol { margin: 4px 0; padding-left: 18px; }

.dg-modal { position: fixed; inset: 0; z-index: 80; background: #000b; display: flex; align-items: center; justify-content: center; padding: 16px; }
.dg-modal-box { width: min(460px, 100%); max-height: 90vh; overflow-y: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; }
.dg-modal-box h3 { margin: 0 0 8px; }
.dg-fusion-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.dg-fusion-grid button { min-height: 92px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border-radius: 10px; border: 2px solid var(--line); background: var(--surface-2); color: inherit; font-size: 0.78rem; }
.dg-fusion-grid button.on { border-color: #b38cff; box-shadow: 0 0 8px #b38cff66; }
.dg-fusion-grid small { color: var(--muted); font-size: 0.66rem; }
.dg-fusion-preview { margin-top: 12px; }
.dg-facts { margin: 6px 0; padding-left: 18px; font-size: 0.8rem; color: var(--muted); }
.dg-reward { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px; margin-top: 6px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface-2); color: inherit; text-align: left; }
.dg-reward small { color: var(--muted); }

@keyframes dg-pop { from { opacity: 1; transform: translate(-50%, 0); } to { opacity: 0; transform: translate(-50%, -26px); } }
@keyframes dg-doom { 50% { background: #7a2a36; } }
@media (prefers-reduced-motion: reduce) { .dg-popup, .dg-cell.doom { animation: none; } }
</style>
