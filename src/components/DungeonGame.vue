<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getCache } from '../app/services';
import { cardCompanion } from '../app/card-evolution-store';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { statsOfDex } from '../core/survivor-stats';
import { typesOfDex } from '../core/species-filter';
import { speciesName } from '../core/survivor-evolution';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import {
  attack, attackArea, attackTargets, attacker, available, chooseReward, COSTS, endTurn, FLOORS, fuse, GRID_H, GRID_W, key, move, previewAttack,
  previewFusion, reachable, REWARDS, START_AP, startDungeon, switchTo, usePotion, weaponFor, WEAPONS,
} from '../core/dungeon';
import type { Cell, DungeonState, EnemySpecies, MemberInput, RewardId } from '../core/dungeon';

/**
 * Masmorra (protótipo jogável do `future project/IDEIAS_DO_JOGO.md`): monta a equipe com Pokémon de verdade da coleção
 * (cartas escaneadas e Digital Pokémon) e joga as salas em grade. Espécie sem stats ou tipos no pacote de dados aparece
 * como «sem dados» e não entra — nada de número inventado.
 */
const props = defineProps<{ digital?: { instanceId: string; dexId: number; name: string }[] }>();
const emit = defineEmits<{ leave: [] }>();

interface Candidate extends Partial<MemberInput> { id: string; dexId: number; name: string; origin: string; missing: boolean }

/** Selvagens das salas (espécies comuns de caverna); só entram as que têm stats e tipos no pacote. */
const WILD = [19, 41, 50, 66, 74, 92, 104, 109, 95];

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
const preview = computed(() => (s.value && mode.value === 'attack' && pending.value ? previewAttack(s.value, pending.value) : null));
const who = computed(() => (s.value ? attacker(s.value) : null));
const activeMember = computed(() => (s.value ? s.value.team[s.value.active]! : null));
const fusionPreview = computed(() => (s.value && fusionPick.value.length === 2 ? previewFusion(s.value, fusionPick.value[0]!, fusionPick.value[1]!) : null));
const playing = computed(() => s.value?.phase === 'player');

const wallAt = (c: Cell) => s.value!.walls.some((w) => w.x === c.x && w.y === c.y);
const enemyAt = (c: Cell) => s.value!.enemies.find((e) => e.pos.x === c.x && e.pos.y === c.y);
const playerAt = (c: Cell) => s.value!.pos.x === c.x && s.value!.pos.y === c.y;

function result(r: { ok: boolean; reason?: string }): void {
  flash.value = r.ok ? '' : r.reason ?? '';
}

function setMode(next: 'move' | 'attack'): void {
  mode.value = mode.value === next ? null : next;
  pending.value = null;
}

function tapCell(c: Cell): void {
  const st = s.value;
  if (!st || !playing.value || !mode.value) return;
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
  else if (mode.value === 'attack') result(attack(st, pending.value));
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
  if (!s.value) return;
  mode.value = null;
  pending.value = null;
  result(endTurn(s.value));
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
  else if (e.key === 'Escape') { mode.value = null; pending.value = null; fusionOpen.value = false; }
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
    return `Mover ${cost} casa(s) · ${cost * COSTS.move} PA`;
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
      <p class="hint">Dungeon crawler tático em turnos: monte uma equipe de até seis Pokémon da sua coleção, desça {{ FLOORS }} andares e derrote o chefe. Cada turno tem {{ START_AP }} PA para mover, atacar, trocar, usar item ou fundir dois Pokémon.</p>
      <p class="hint dg-provisional">Provisório: a arma de cada Pokémon sai dos stats base dele e a munição é o tipo principal da espécie, até a tabela de armas e munições ser definida.</p>
      <p v-if="loadError" role="alert">{{ loadError }}</p>
      <p v-if="candidates === null" class="hint">Lendo a sua coleção…</p>
      <p v-else-if="candidates.length === 0" class="hint">Nenhum Pokémon na coleção ainda. Escaneie uma carta ou invoque um Digital Pokémon na fonte da Vila.</p>
      <p v-else-if="pool.length === 0" role="alert">Sem dados das espécies selvagens no pacote: a masmorra não pode montar inimigos.</p>
      <ul v-if="candidates?.length" class="dg-candidates">
        <li v-for="c in candidates" :key="c.id">
          <button type="button" :class="{ on: picked.includes(c.id) }" :disabled="c.missing || (!picked.includes(c.id) && picked.length >= 6)" @click="togglePick(c)">
            <img v-if="!brokenSprites.has(c.dexId)" :src="sprite(c.dexId)" alt="" loading="lazy" @error="brokenSprites.add(c.dexId)" />
            <span v-else class="dg-nosprite">sem sprite</span>
            <strong>{{ c.name }}</strong>
            <small v-if="c.missing">sem dados de stats/tipos</small>
            <small v-else>{{ WEAPONS[weaponFor(c.stats!)].name }}</small>
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
        <span>Andar {{ s.floor }}/{{ FLOORS }}</span>
        <span>Turno {{ s.round }}</span>
        <span class="dg-ap" :aria-label="`${s.ap} de ${START_AP} PA`">PA <i v-for="n in START_AP" :key="n" :class="{ on: n <= s.ap }"></i></span>
        <span title="Cargas de fusão">💠 {{ s.fusionCharges }}</span>
        <span title="Poções">🧪 {{ s.potions }}</span>
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
          }"
          :aria-label="`Casa ${c.x + 1},${c.y + 1}`"
          @click="tapCell(c)"
        >
          <small v-if="mode === 'move' && (moveCosts.get(key(c)) ?? 0) > 0" class="dg-cost">{{ moveCosts.get(key(c)) }}</small>
          <template v-if="enemyAt(c)">
            <img v-if="!brokenSprites.has(enemyAt(c)!.dexId)" :src="sprite(enemyAt(c)!.dexId)" :alt="enemyAt(c)!.name" :class="{ boss: enemyAt(c)!.boss }" @error="brokenSprites.add(enemyAt(c)!.dexId)" />
            <span v-else class="dg-nosprite">{{ enemyAt(c)!.name }}</span>
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
        </button>
      </div>

      <p class="dg-preview" aria-live="polite">
        <template v-if="pendingText">{{ pendingText }} <button v-if="mode === 'attack' ? !preview?.reason : true" type="button" class="primary small" @click="confirm">Confirmar</button></template>
        <template v-else-if="flash"><span class="dg-warn">{{ flash }}</span></template>
        <template v-else-if="s.mustSwitch">Escolha quem assume a posição (troca grátis).</template>
        <template v-else-if="mode === 'move'">Toque numa casa marcada para mover.</template>
        <template v-else-if="mode === 'attack'">{{ targetKeys.size ? 'Toque num alvo para ver o dano.' : 'Nenhum inimigo ao alcance desta arma.' }}</template>
        <template v-else>{{ s.log[s.log.length - 1] }}</template>
      </p>

      <div v-if="activeMember && who" class="dg-active">
        <div>
          <strong>{{ s.fusion ? s.fusion.name : activeMember.name }}</strong>
          <span v-for="t in (s.fusion ? who.types : activeMember.types)" :key="t" class="dg-type" :style="typeStyle(t)">{{ TYPE_LABELS_PT[t] }}</span>
          <template v-if="s.fusion"> · {{ s.fusion.turnsLeft }} turno(s)</template>
        </div>
        <div v-for="i in (s.fusion ? [s.fusion.a, s.fusion.b] : [s.active])" :key="i" class="dg-bar">
          <span>{{ s.fusion ? s.team[i]!.name : 'HP' }}</span><span class="dg-hp"><i :style="{ width: pct(s.team[i]!.hp, s.team[i]!.maxHp) }"></i></span><small>{{ s.team[i]!.hp }}/{{ s.team[i]!.maxHp }}</small>
        </div>
        <div class="dg-weapon">
          <span>{{ who.weapon.name }} <small>({{ who.weapon.kind === 'physical' ? 'físico' : 'especial' }}, {{ who.weapon.ap }} PA)</small></span>
          <span>Munição: <span v-for="t in who.ammo" :key="t" class="dg-type" :style="typeStyle(t)">{{ TYPE_LABELS_PT[t] }}</span></span>
          <span>Carga {{ who.charge }}/{{ s.fusion ? s.fusion.maxCharge : activeMember.maxCharge }}</span>
        </div>
      </div>

      <nav class="dg-commands" aria-label="Ações">
        <button type="button" :class="{ on: mode === 'move' }" :disabled="!playing || s.mustSwitch" @click="setMode('move')">Mover</button>
        <button type="button" :class="{ on: mode === 'attack' }" :disabled="!playing || s.mustSwitch" @click="setMode('attack')">Atacar</button>
        <button type="button" :disabled="!playing || s.mustSwitch || s.potions === 0 || s.ap < COSTS.item" @click="doPotion">Poção ({{ COSTS.item }})</button>
        <button type="button" :disabled="!playing || s.mustSwitch || !!s.fusion || s.fusionCharges === 0" @click="openFusion">Fusão</button>
        <button type="button" class="primary" :disabled="!playing || s.mustSwitch" @click="doEnd">Encerrar</button>
      </nav>

      <ol class="dg-team" aria-label="Equipe">
        <li v-for="(m, i) in s.team" :key="m.id">
          <button type="button" :class="{ active: i === s.active && !s.fusion, out: !available(s, i) && i !== s.active }" :disabled="!playing || !!s.fusion || (i === s.active && !s.mustSwitch) || !available(s, i)" @click="doSwitch(i)">
            <small class="dg-num">{{ i + 1 }}</small>
            <img v-if="!brokenSprites.has(m.dexId)" :src="sprite(m.dexId)" alt="" @error="brokenSprites.add(m.dexId)" />
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
              {{ fusionPick.includes(i) ? '✓ ' : '' }}{{ m.name }}<small>{{ available(s, i) ? WEAPONS[m.weapon].name : statusLabel(i) }}</small>
            </button>
          </div>
          <template v-if="fusionPreview">
            <p><strong>{{ fusionPreview.weapon.name }}</strong></p>
            <p class="hint">{{ fusionPreview.weapon.description }}</p>
            <p class="hint">Munição: {{ fusionPreview.ammo.map((t) => TYPE_LABELS_PT[t]).join(' / ') }}{{ fusionPreview.ammo.length > 1 ? ' (70% / 30%)' : '' }} · Duração: 3 turnos · Ativação: 1 PA + 1 buff · Carga temporária: 12 · O dano recebido é dividido entre os dois.</p>
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
.dungeon { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 12px calc(12px + env(safe-area-inset-bottom)); color: var(--text); background: #12101c; }
.dg-pick h2 { margin: 0 0 6px; }
.hint { color: var(--muted); font-size: 0.88rem; margin: 4px 0; }
.dg-provisional { border-left: 3px solid var(--pending); padding-left: 8px; }
.dg-candidates { list-style: none; padding: 0; margin: 10px 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; }
.dg-candidates button { width: 100%; min-height: 110px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px; border-radius: 10px; border: 2px solid var(--line); background: var(--surface); color: inherit; }
.dg-candidates button.on { border-color: var(--gold); background: var(--surface-2); }
.dg-candidates button:disabled { opacity: 0.45; }
.dg-candidates img { width: 48px; height: 48px; object-fit: contain; image-rendering: pixelated; }
.dg-candidates small { color: var(--muted); font-size: 0.72rem; text-align: center; }
.dg-nosprite { font-size: 0.6rem; color: var(--muted); line-height: 1; text-align: center; }
.dg-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.dg-actions button, .dg-commands button { min-height: var(--ui-touch, 44px); padding: 0 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface-2); color: inherit; }
.primary { background: var(--accent) !important; color: var(--on-accent); border-color: transparent !important; }
.primary.small { min-height: 30px; padding: 0 10px; border-radius: 8px; margin-left: 6px; }
button:disabled { opacity: 0.5; }

.dg-run { display: flex; flex-direction: column; gap: 8px; max-width: 520px; margin: 0 auto; }
.dg-hud { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-size: 0.9rem; font-weight: 600; }
.dg-ap i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-left: 3px; border: 1px solid var(--gold); }
.dg-ap i.on { background: var(--gold); }

.dg-grid { display: grid; gap: 2px; padding: 4px; background: #241d33; border-radius: 10px; }
.dg-cell { position: relative; aspect-ratio: 1; padding: 0; border: 0; border-radius: 4px; background: #3a3150; display: flex; align-items: center; justify-content: center; overflow: visible; }
.dg-cell.wall { background: repeating-linear-gradient(45deg, #1b1626 0 6px, #262036 6px 12px); }
.dg-cell.reach { background: #2f5a6e; }
.dg-cell.target { box-shadow: inset 0 0 0 2px var(--warn); }
.dg-cell.area { background: #7a3340; }
.dg-cell.pending { box-shadow: inset 0 0 0 3px var(--gold); }
.dg-cell img { width: 120%; height: 120%; object-fit: contain; image-rendering: pixelated; pointer-events: none; position: relative; top: -14%; }
.dg-cell img.boss { width: 150%; height: 150%; top: -25%; filter: drop-shadow(0 0 4px #ff5a5a); }
.dg-cost { position: absolute; top: 2px; left: 4px; font-size: 0.65rem; color: #cde; }
.dg-player { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; border-radius: 50%; box-shadow: 0 0 0 2px var(--gold); }
.dg-player.fused { box-shadow: 0 0 0 2px #b38cff, 0 0 10px #b38cff; }
.dg-player.fused img { width: 70%; height: 70%; }
.dg-hp { position: relative; display: block; height: 5px; background: #0006; border-radius: 3px; overflow: hidden; flex: 1; }
.dg-hp i { position: absolute; inset: 0 auto 0 0; background: var(--ok); }
.dg-hp.charge i { background: #6fb6ff; }
.dg-cell .dg-hp.enemy { position: absolute; left: 10%; right: 10%; bottom: 3px; height: 4px; }
.dg-cell .dg-hp.enemy i { background: var(--warn); }

.dg-preview { min-height: 2.6em; margin: 0; font-size: 0.88rem; display: flex; align-items: center; flex-wrap: wrap; }
.dg-warn { color: var(--warn); }
.dg-active { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 4px; font-size: 0.86rem; }
.dg-bar { display: flex; align-items: center; gap: 6px; }
.dg-bar > span:first-child { min-width: 3em; }
.dg-weapon { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--muted); }
.dg-type { display: inline-block; padding: 0 6px; margin-left: 4px; border-radius: 999px; font-size: 0.72rem; color: #fff; text-shadow: 0 1px 1px #0008; }
.dg-commands { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.dg-commands button { padding: 0 4px; font-size: 0.85rem; }
.dg-commands button.on { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }

.dg-team { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
.dg-team button { width: 100%; display: flex; flex-direction: column; align-items: stretch; gap: 2px; padding: 4px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: inherit; position: relative; font-size: 0.7rem; }
.dg-team button.active { border-color: var(--gold); }
.dg-team button.out { opacity: 0.55; }
.dg-team button:disabled.active { opacity: 1; }
.dg-team img { width: 32px; height: 32px; object-fit: contain; align-self: center; image-rendering: pixelated; }
.dg-team .dg-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dg-num { position: absolute; top: 2px; left: 4px; color: var(--muted); }
.dg-log { font-size: 0.8rem; color: var(--muted); }
.dg-log ol { margin: 4px 0; padding-left: 18px; }

.dg-modal { position: fixed; inset: 0; z-index: 80; background: #000a; display: flex; align-items: center; justify-content: center; padding: 16px; }
.dg-modal-box { width: min(440px, 100%); max-height: 90vh; overflow-y: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; }
.dg-modal-box h3 { margin: 0 0 8px; }
.dg-fusion-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.dg-fusion-grid button { min-height: 52px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 8px; border: 2px solid var(--line); background: var(--surface-2); color: inherit; font-size: 0.8rem; }
.dg-fusion-grid button.on { border-color: #b38cff; }
.dg-fusion-grid small { color: var(--muted); font-size: 0.68rem; }
.dg-reward { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px; margin-top: 6px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface-2); color: inherit; text-align: left; }
.dg-reward small { color: var(--muted); }
</style>
