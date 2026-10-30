<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import WeaponArt from './WeaponArt.vue';
import FusionArt from './FusionArt.vue';
import GemChip from './GemChip.vue';
import DungeonAttackFx from './DungeonAttackFx.vue';
import { getCache } from '../app/services';
import { effectiveVisual } from '../app/visual-settings';
import { cardCompanion } from '../app/card-evolution-store';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { statsOfDex } from '../core/survivor-stats';
import { typesOfDex } from '../core/species-filter';
import { nextEvolutions, speciesName } from '../core/survivor-evolution';
import { REGIONAL_ENCOUNTERS } from '../core/survivor-encounters';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import {
  AFFIXES, ammoOptions, attack, MECHANICS, setAmmo, attackArea, attackTargets, attacker, available, beginEnemyTurn, chooseReward, COSTS, enemyStep, equipGem, finishEnemyTurn,
  floorGeneration, floorTheme, fuse, FUSION_CHARGE, FUSION_TURNS, GRID_H, GRID_W, INTENTS, intents, isBossFloor, isMiniBossFloor, key, move, polishGems, previewAttack,
  addMember, MAX_TEAM, previewFusion, PROFILES, reachable, retreat, REWARDS, START_AP, startDungeon, switchTo, threatenedCells, unequipGem, usePotion, weaponOfDex, weaponOfferAtFloor, evolveMember, WEAPONS,
} from '../core/dungeon';
import type { Cell, DungeonState, Enemy, EnemySpecies, Intent, MechanicId, MemberInput, RewardId, WeaponPattern } from '../core/dungeon';
import { GEMS, gemName, LEGENDARY_SLOT as LEGENDARY_SLOT_INDEX, polishable, tierName } from '../core/dungeon-gems';
import type { Gem, GemKind } from '../core/dungeon-gems';

/**
 * Masmorra (protótipo jogável do `future project/IDEIAS_DO_JOGO.md`): monta a equipe com Pokémon de verdade da coleção
 * (cartas escaneadas e Digital Pokémon) e desce andar após andar, até cair ou decidir sair. Espécie sem stats ou tipos
 * no pacote de dados aparece como «sem dados» e não entra — nada de número inventado. Regras: `core/dungeon.ts`.
 */
const props = defineProps<{ digital?: { instanceId: string; dexId: number; name: string }[] }>();
const emit = defineEmits<{ leave: [] }>();

interface Candidate extends Partial<MemberInput> { id: string; dexId: number; name: string; origin: string; missing: boolean }
interface Popup { id: number; cell: string; text: string; kind: 'hit' | 'hurt' | 'heal' | 'info' }
interface EvolutionOffer { memberIndex: number; input: Omit<MemberInput, 'id'> }
interface WeaponOffer { choices: Candidate[]; evolutions: EvolutionOffer[]; reward: RewardId }
interface OrbAnimation { dexId: number; name: string; weapon: NonNullable<ReturnType<typeof weaponOfDex>>; message: string }
interface AttackFx { id: number; weapon: NonNullable<ReturnType<typeof weaponOfDex>>; ammo: PokemonType | null; cells: string[] }

/**
 * Cada andar gira uma geração (I a IX). As listas regionais começam com formas básicas; as evoluções intermediárias
 * só entram no 7º andar e as finais no 13º. Assim, os primeiros andares não parecem uma coleção de chefões pequenos.
 * Os marcados como chefe só são escolhidos para o chefe da sala. Só entram espécies com stats e tipos no pacote.
 */
const MID_STAGE_WILD = [
  20, 42, 67, 75, 93, 105, 162, 164, 180, 188, 262, 264, 271, 294, 305, 397, 404, 407, 409,
  507, 520, 525, 536, 552, 660, 662, 673, 680, 715, 732, 735, 737, 743, 752, 811, 814, 817, 822, 825, 832, 844,
  907, 910, 913, 916, 920, 922, 927, 936,
] as const;
const FINAL_STAGE_WILD = [
  68, 76, 94, 181, 195, 197, 306, 319, 334, 405, 445, 508, 530, 553, 663, 681, 730, 733, 738, 745,
  812, 815, 818, 823, 908, 911, 914, 923, 937,
] as const;
/** Um chefe pequeno por geração no início; as versões finais só entram depois que a equipe já teve tempo de crescer. */
const BOSS_WILD = [
  27, 179, 304, 403, 524, 679, 736, 843, 935,
  28, 181, 306, 405, 530, 681, 738, 844, 937,
] as const;
const WILD: readonly { dexId: number; minDepth: number; boss?: boolean }[] = [
  ...REGIONAL_ENCOUNTERS.flatMap((region) => region.wild.map((dexId) => ({ dexId, minDepth: 1 }))),
  ...MID_STAGE_WILD.map((dexId) => ({ dexId, minDepth: 7 })),
  ...FINAL_STAGE_WILD.map((dexId) => ({ dexId, minDepth: 13 })),
  ...BOSS_WILD.map((dexId, index) => ({ dexId, minDepth: index < 9 ? 1 : 14, boss: true })),
];
const PATTERN_TEXT: Readonly<Record<WeaponPattern, string>> = { adjacent: 'adjacente', line: 'em linha', ranged: 'tiro reto', area: 'área em cruz', cone: 'leque', aura: 'em volta', homing: 'teleguiado', trap: 'armadilha' };
const RECORD_KEY = 'tcg-ar-masmorra-recorde-v1';
const STEP_MS = 420;

const candidates = ref<Candidate[] | null>(null);
const picked = ref<string[]>([]);
const loadError = ref('');
const s = ref<DungeonState | null>(null);
const mode = ref<'move' | 'attack' | null>(null);
const pending = ref<Cell | null>(null);
const flash = ref('');
const fusionOpen = ref(false);
const fusionPick = ref<number[]>([]);
const forgeOpen = ref(false);
const forgeGem = ref<number | null>(null);
const brokenSprites = ref(new Set<number>());
const showThreat = ref(true);
const inspected = ref<number | null>(null);
const popups = ref<Popup[]>([]);
const acting = ref<number | null>(null);
const record = ref(readRecord());
const weaponOffer = ref<WeaponOffer | null>(null);
const chosenCandidateIds = new Set<string>();
const offeredFloors = new Set<number>();
const orbAnimation = ref<OrbAnimation | null>(null);
const attackFx = ref<AttackFx | null>(null);
const weaponOfferView = ref<'weapons' | 'evolve'>('weapons');
const evolutionPick = ref<number | null>(null);
let popupId = 0;
let attackFxId = 0;
let attackFxTimer: ReturnType<typeof setTimeout> | undefined;
let alive = true;

const pool: EnemySpecies[] = WILD.flatMap(({ dexId, minDepth, boss }) => {
  const stats = statsOfDex(dexId);
  const types = typesOfDex(dexId);
  return stats && types.length ? [{ dexId, name: speciesName(dexId) || `#${dexId}`, stats, types, minDepth, boss }] : [];
});

function readRecord(): number {
  try { return Math.max(0, Number(localStorage.getItem(RECORD_KEY)) || 0); } catch { return 0; }
}
function saveRecord(floor: number): void {
  if (floor <= record.value) return;
  record.value = floor;
  try { localStorage.setItem(RECORD_KEY, String(floor)); } catch { /* sem armazenamento: o recorde vale só nesta sessão */ }
}

function describeMon(id: string, dexId: number, name: string, origin: string): Candidate {
  const stats = statsOfDex(dexId);
  const types = typesOfDex(dexId);
  return stats && types.length && weaponOfDex(dexId) ? { id, dexId, name, origin, stats, types, missing: false } : { id, dexId, name, origin, missing: true };
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
onBeforeUnmount(() => { alive = false; window.removeEventListener('keydown', onKey); if (attackFxTimer) clearTimeout(attackFxTimer); });

function togglePick(c: Candidate): void {
  if (c.missing) return;
  const i = picked.value.indexOf(c.id);
  if (i >= 0) picked.value.splice(i, 1);
  else if (picked.value.length < 1) picked.value.push(c.id);
}

function begin(): void {
  const team = picked.value.map((id) => candidates.value!.find((c) => c.id === id)!).map((c) => ({ id: c.id, dexId: c.dexId, name: c.name, types: c.types!, stats: c.stats! }));
  s.value = startDungeon(team, pool, (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
  chosenCandidateIds.clear();
  for (const id of picked.value) chosenCandidateIds.add(id);
  offeredFloors.clear();
  weaponOffer.value = null;
  orbAnimation.value = null;
  weaponOfferView.value = 'weapons';
  evolutionPick.value = null;
  mode.value = null;
  pending.value = null;
  inspected.value = null;
  flash.value = '';
}

const sprite = (dexId: number): string => pokemonSpriteUrl(dexId);
const typeStyle = (t: PokemonType) => ({ background: TYPE_COLORS[t] });
const ammoLabel = (types: readonly PokemonType[]): string => types.map((t) => TYPE_LABELS_PT[t]).join(' / ');
const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const cells = computed(() => {
  const out: Cell[] = [];
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) out.push({ x, y });
  return out;
});
const playing = computed(() => s.value?.phase === 'player');
const exploring = computed(() => s.value?.phase === 'cleared');
const enemyTurn = computed(() => s.value?.phase === 'enemy');
const canForge = computed(() => s.value?.phase === 'cleared' || s.value?.phase === 'reward');
const theme = computed(() => (s.value ? floorTheme(s.value.floor) : { index: 0, name: '' }));
/** Alcance para desenhar o modo Mover e a sala limpa. */
const moveCosts = computed(() => (s.value && (mode.value === 'move' || exploring.value) ? reachable(s.value) : new Map<string, number>()));
/** Mesmo sem abrir o comando Mover, um espaço livre pode ser selecionado e confirmado com outro toque. */
const walkCosts = computed(() => (s.value && playing.value ? reachable(s.value) : new Map<string, number>()));
const targetKeys = computed(() => new Set(s.value && mode.value === 'attack' ? attackTargets(s.value).map(key) : []));
const areaKeys = computed(() => new Set(s.value && mode.value === 'attack' && pending.value ? attackArea(s.value, pending.value).map(key) : []));
const threatKeys = computed(() => (s.value && showThreat.value && playing.value ? threatenedCells(s.value) : new Set<string>()));
const doomKeys = computed(() => new Set(s.value?.bossThreat?.cells.map(key) ?? []));
const plans = computed(() => (s.value && playing.value ? intents(s.value) : new Map<number, Intent>()));
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
const inspectedEnemy = computed<Enemy | null>(() => s.value?.enemies.find((e) => e.uid === inspected.value) ?? null);
const bagSorted = computed(() => [...(s.value?.bag ?? [])].sort((a, b) => Number(b.legendary) - Number(a.legendary) || a.kind.localeCompare(b.kind) || b.tier - a.tier));
const polishGroups = computed(() => polishable(s.value?.bag ?? []));
const selectedGem = computed<Gem | null>(() => s.value?.bag.find((g) => g.id === forgeGem.value) ?? null);
const evolutionMembers = computed(() => {
  const offer = weaponOffer.value;
  const st = s.value;
  if (!offer || !st) return [];
  return [...new Set(offer.evolutions.map((e) => e.memberIndex))].map((memberIndex) => ({
    memberIndex,
    member: st.team[memberIndex]!,
    count: offer.evolutions.filter((e) => e.memberIndex === memberIndex).length,
  }));
});
const shownEvolutions = computed(() => weaponOffer.value?.evolutions.filter((e) => e.memberIndex === evolutionPick.value) ?? []);

const wallAt = (c: Cell) => s.value!.walls.some((w) => w.x === c.x && w.y === c.y);
const barrierAt = (c: Cell) => s.value!.barriers.some((b) => b.pos.x === c.x && b.pos.y === c.y);
const trapAt = (c: Cell) => s.value!.traps.some((t) => t.pos.x === c.x && t.pos.y === c.y);
const ammoKey = (ammo: readonly PokemonType[]) => ammo.join('/');
const mechanicList = (ids: readonly MechanicId[]) => ids.map((id) => `${MECHANICS[id].name}: ${MECHANICS[id].effect}`);
function chooseAmmo(ammo: readonly PokemonType[]): void {
  if (s.value) result(setAmmo(s.value, s.value.active, ammo));
}
const enemyAt = (c: Cell) => s.value!.enemies.find((e) => e.pos.x === c.x && e.pos.y === c.y);
const lootAt = (c: Cell) => s.value!.loot.find((l) => l.pos.x === c.x && l.pos.y === c.y);
const stairsAt = (c: Cell) => !!s.value!.stairs && s.value!.stairs.x === c.x && s.value!.stairs.y === c.y;
const playerAt = (c: Cell) => s.value!.pos.x === c.x && s.value!.pos.y === c.y;
const popupsAt = (c: Cell) => popups.value.filter((p) => p.cell === key(c));
const intentOf = (e: Enemy) => plans.value.get(e.uid);

function popup(cell: Cell, text: string, kind: Popup['kind']): void {
  const id = ++popupId;
  popups.value.push({ id, cell: key(cell), text, kind });
  setTimeout(() => { popups.value = popups.value.filter((p) => p.id !== id); }, 1000);
}

/** O impacto usa a cor da munição e a silhueta da arma; só existe durante o golpe. */
function showAttackFx(weapon: AttackFx['weapon'], ammo: PokemonType | null, cells: readonly Cell[]): void {
  if (!effectiveVisual.value.impactFx) return;
  if (attackFxTimer) clearTimeout(attackFxTimer);
  attackFx.value = { id: ++attackFxId, weapon, ammo, cells: cells.map(key) };
  attackFxTimer = setTimeout(() => { attackFx.value = null; }, 640);
}

function result(r: { ok: boolean; reason?: string }): void {
  flash.value = r.ok ? '' : r.reason ?? '';
  if (s.value) saveRecord(s.value.stats.deepest);
}

function setMode(next: 'move' | 'attack'): void {
  mode.value = mode.value === next ? null : next;
  pending.value = null;
  inspected.value = null;
}

function tapCell(c: Cell): void {
  const st = s.value;
  if (!st) return;
  if (exploring.value) {
    // Sala limpa: um toque anda até a casa (pega o que houver; a escada abre a escolha de descer).
    if ((moveCosts.value.get(key(c)) ?? 0) > 0) result(move(st, c));
    return;
  }
  if (!playing.value) return;
  if (!mode.value) {
    // Sem ação escolhida, tocar num inimigo mostra quem ele é, como se comporta e o que pretende.
    const e = enemyAt(c);
    if (e) {
      inspected.value = inspected.value !== e.uid ? e.uid : null;
      pending.value = null;
      return;
    }
    // Atalho de toque: selecionar uma casa livre alcançável e tocar nela outra vez anda até ela.
    // Não aciona movimento em uma casa ocupada por inimigo, para manter a inspeção desse inimigo previsível.
    const k = key(c);
    if ((walkCosts.value.get(k) ?? 0) > 0) {
      if (pending.value && key(pending.value) === k) {
        result(move(st, c));
        pending.value = null;
      } else {
        pending.value = c;
        inspected.value = null;
        flash.value = 'Toque novamente nesta casa para andar.';
      }
      return;
    }
    pending.value = null;
    inspected.value = null;
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
    const weapon = attacker(st).weapon.id;
    const ammo = attacker(st).ammo[0] ?? null;
    const before = new Map(st.enemies.map((e) => [e.uid, { hp: e.hp, pos: e.pos }]));
    const r = attack(st, pending.value);
    if (r.ok) showAttackFx(weapon, ammo, hits.trap ? [pending.value] : hits.hits.map((hit) => hit.enemy.pos));
    if (r.ok) for (const [uid, b] of before) {
      const now = st.enemies.find((e) => e.uid === uid);
      const lost = b.hp - (now?.hp ?? 0);
      if (lost > 0) popup(now?.pos ?? b.pos, `−${lost}`, 'hit');
    }
    if (r.ok && hits.hits.length === 0) popup(pending.value, '…', 'info');
    result(r);
  }
  pending.value = null;
  if (mode.value === 'move' || (mode.value === 'attack' && (!playing.value || attackTargets(st).length === 0))) mode.value = null;
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

const teamHp = (st: DungeonState) => st.team.reduce((sum, m) => sum + m.hp, 0);

/** Encerra o turno e anima os inimigos um por um (quem age pisca; dano e cura sobem em números). */
async function doEnd(): Promise<void> {
  const st = s.value;
  if (!st) return;
  mode.value = null;
  pending.value = null;
  inspected.value = null;
  const r = beginEnemyTurn(st);
  result(r);
  if (!r.ok) return;
  for (;;) {
    const hpBefore = teamHp(st);
    const enemyHp = new Map(st.enemies.map((e) => [e.uid, e.hp]));
    const uid = enemyStep(st);
    if (uid === null) break;
    acting.value = uid;
    const lost = hpBefore - teamHp(st);
    if (lost > 0) popup(st.pos, `−${lost}`, 'hurt');
    for (const e of st.enemies) {
      const gained = e.hp - (enemyHp.get(e.uid) ?? e.hp);
      if (gained > 0) popup(e.pos, `+${gained}`, 'heal');
    }
    await wait(STEP_MS);
    if (!alive) return;
  }
  acting.value = null;
  finishEnemyTurn(st);
  result({ ok: true });
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
  if (!s.value) return;
  if (!offeredFloors.has(s.value.floor) && weaponOfferAtFloor(s.value.floor)) {
    offeredFloors.add(s.value.floor);
    const offer = makeWeaponOffer(s.value, r);
    if (offer) {
      weaponOffer.value = offer;
      weaponOfferView.value = offer.choices.length ? 'weapons' : 'evolve';
      evolutionPick.value = null;
      return;
    }
  }
  forgeOpen.value = false;
  result(chooseReward(s.value, r));
}

function leaveDungeon(): void {
  if (!s.value) return;
  forgeOpen.value = false;
  result(retreat(s.value));
}

function tapSlot(member: number, slot: number): void {
  const st = s.value;
  if (!st || !canForge.value) return;
  const current = st.team[member]?.gems[slot];
  if (forgeGem.value !== null) {
    result(equipGem(st, member, slot, forgeGem.value));
    forgeGem.value = null;
  } else if (current) result(unequipGem(st, member, slot));
}

function doPolish(kind: GemKind, tier: number): void {
  if (s.value) result(polishGems(s.value, kind, tier));
}

/** Sorteio determinístico por run: a mesma seed e o mesmo andar mostram as mesmas três alternativas. */
function drawChoices<T>(items: readonly T[], count: number, seed: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  let value = seed >>> 0;
  while (pool.length && out.length < count) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    out.push(pool.splice(value % pool.length, 1)[0]!);
  }
  return out;
}

function inputOf(c: Candidate): MemberInput {
  return { id: c.id, dexId: c.dexId, name: c.name, types: [...c.types!], stats: c.stats! };
}

function makeWeaponOffer(st: DungeonState, reward: RewardId): WeaponOffer | null {
  const remaining = st.team.length >= MAX_TEAM ? [] : (candidates.value ?? []).filter((c) => !c.missing && !chosenCandidateIds.has(c.id));
  const evolutions: EvolutionOffer[] = (st.fusion ? [] : st.team.flatMap((member, memberIndex) => nextEvolutions(member.dexId).flatMap((dexId) => {
    const stats = statsOfDex(dexId);
    const types = typesOfDex(dexId);
    const weapon = weaponOfDex(dexId);
    return stats && types.length && weapon ? [{ memberIndex, input: { dexId, name: speciesName(dexId) || `#${dexId}`, types: [...types], stats } }] : [];
  })));
  const choices = drawChoices(remaining, 3, st.seed ^ Math.imul(st.floor, 4099) ^ st.team.length);
  return choices.length || evolutions.length ? { choices, evolutions, reward } : null;
}

async function playOrbAnimation(animation: OrbAnimation): Promise<void> {
  orbAnimation.value = animation;
  await wait(720);
  if (alive) orbAnimation.value = null;
}

function finishWeaponOffer(offer: WeaponOffer): void {
  weaponOffer.value = null;
  evolutionPick.value = null;
  pickReward(offer.reward);
}

async function chooseWeapon(c: Candidate): Promise<void> {
  const st = s.value;
  const offer = weaponOffer.value;
  const weapon = weaponOfDex(c.dexId);
  if (!st || !offer || !weapon) return;
  await playOrbAnimation({ dexId: c.dexId, name: c.name, weapon, message: `${c.name} virou uma nova arma!` });
  if (!alive) return;
  const added = addMember(st, inputOf(c));
  result(added);
  if (!added.ok) return;
  chosenCandidateIds.add(c.id);
  finishWeaponOffer(offer);
}

async function chooseEvolution(evolution: EvolutionOffer): Promise<void> {
  const st = s.value;
  const offer = weaponOffer.value;
  const weapon = weaponOfDex(evolution.input.dexId);
  if (!st || !offer || !weapon) return;
  await playOrbAnimation({ dexId: evolution.input.dexId, name: evolution.input.name, weapon, message: `${evolution.input.name} evoluiu na orbe!` });
  if (!alive) return;
  const evolved = evolveMember(st, evolution.memberIndex, evolution.input);
  result(evolved);
  if (!evolved.ok) return;
  finishWeaponOffer(offer);
}

function onKey(e: KeyboardEvent): void {
  if (!s.value || e.target instanceof HTMLInputElement) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 6) {
    if (fusionOpen.value) toggleFusion(n - 1);
    else if (n - 1 < s.value.team.length) doSwitch(n - 1);
  } else if (e.key === 'm' || e.key === 'M') setMode('move');
  else if (e.key === 'a' || e.key === 'A') setMode('attack');
  else if (e.key === 'g' || e.key === 'G') forgeOpen.value = !forgeOpen.value;
  else if (e.key === 'Enter' && pending.value) confirm();
  else if ((e.key === 'e' || e.key === 'E') && playing.value) void doEnd();
  else if (e.key === 'Escape') { mode.value = null; pending.value = null; fusionOpen.value = false; forgeOpen.value = false; inspected.value = null; }
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
    const loot = lootAt(pending.value) ? ' · pega o saque' : '';
    return `Mover ${cost} casa(s) · ${cost * COSTS.move} PA${loot}${danger}`;
  }
  const p = preview.value;
  if (!p) return '';
  if (p.reason) return p.reason;
  const hits = p.hits.map((h) => `${h.enemy.name} −${h.damage}${h.parts.some((x) => x.factor > 1) ? ' (eficaz)' : h.parts.some((x) => x.factor < 1) ? ' (resiste)' : ''}${h.guarded ? ' (protegido)' : ''}`).join(', ');
  return `${who.value!.weapon.name}: ${hits} · ${p.ap} PA · ${p.cost} carga`;
});
</script>

<template>
  <div class="dungeon" :class="[s ? `theme-${theme.index}` : '', { 'is-running': !!s }]">
    <!-- Escolha da equipe -->
    <section v-if="!s" class="dg-pick">
      <h2>Masmorra · protótipo</h2>
      <p class="hint">Comece com um Pokémon da sua coleção. Ao limpar o 1º andar, a Pokébola oferece três novas armas; depois ela volta no 3º andar e a cada três andares. A expedição só acaba quando a equipe cai ou quando você decide sair pela escada.</p>
      <p class="hint">Cada turno tem {{ START_AP }} PA para mover, atacar, trocar, usar item ou fundir dois Pokémon. A orbe da arma guarda o Pokémon.</p>
      <p v-if="record > 0" class="dg-record">🏆 Seu recorde: andar {{ record }}</p>
      <p class="hint">A arma é inata da espécie: ao colocar na coleção um Pokémon que usa uma arma ainda inédita para você, ela fica disponível nas próximas expedições com aquele Pokémon. A munição ainda usa o tipo principal da espécie.</p>
      <p v-if="loadError" role="alert">{{ loadError }}</p>
      <p v-if="candidates === null" class="hint">Lendo a sua coleção…</p>
      <p v-else-if="candidates.length === 0" class="hint">Nenhum Pokémon na coleção ainda. Escaneie uma carta ou invoque um Digital Pokémon na fonte da Vila.</p>
      <p v-else-if="pool.length === 0" role="alert">Sem dados das espécies selvagens no pacote: a masmorra não pode montar inimigos.</p>
      <ul v-if="candidates?.length" class="dg-candidates">
        <li v-for="c in candidates" :key="c.id">
          <button type="button" :class="{ on: picked.includes(c.id) }" :disabled="c.missing || (!picked.includes(c.id) && picked.length >= 1)" @click="togglePick(c)">
            <small v-if="picked.includes(c.id)" class="dg-order">{{ picked.indexOf(c.id) + 1 }}</small>
            <template v-if="c.missing">
              <img v-if="!brokenSprites.has(c.dexId)" :src="sprite(c.dexId)" alt="" loading="lazy" class="dg-pick-sprite" @error="brokenSprites.add(c.dexId)" />
              <strong>{{ c.name }}</strong>
              <small>sem dados de stats/tipos ou arma catalogada</small>
            </template>
            <template v-else>
              <WeaponArt :weapon="weaponOfDex(c.dexId)!" :dex-id="c.dexId" :ammo="c.types![0] ?? null" :size="72" />
              <strong>{{ c.name }}</strong>
              <small>{{ WEAPONS[weaponOfDex(c.dexId)!].name }}</small>
              <span class="dg-types"><span v-for="t in c.types" :key="t" class="dg-type" :style="typeStyle(t)">{{ TYPE_LABELS_PT[t] }}</span></span>
            </template>
          </button>
        </li>
      </ul>
      <div class="dg-actions">
        <button type="button" class="primary" :disabled="picked.length === 0 || pool.length === 0" @click="begin">Começar com esta arma</button>
        <button type="button" @click="emit('leave')">Voltar</button>
      </div>
    </section>

    <!-- Expedição -->
    <section v-else class="dg-run">
      <header class="dg-hud">
        <span class="dg-pill dg-floor" :class="{ boss: isBossFloor(s.floor), mini: isMiniBossFloor(s.floor) && !isBossFloor(s.floor) }">{{ isBossFloor(s.floor) ? '👑 ' : isMiniBossFloor(s.floor) ? '⚜️ ' : '' }}Andar {{ s.floor }}</span>
        <span class="dg-theme" :title="`Geração ${floorGeneration(s.floor)}`">{{ theme.name }} · G{{ floorGeneration(s.floor) }}</span>
        <span v-if="record > 0" class="dg-pill dg-small" title="Recorde">🏆 {{ record }}</span>
        <span class="dg-break"></span>
        <span class="dg-pill">Turno {{ s.round }}</span>
        <span class="dg-pill dg-ap" :aria-label="`${s.ap} PA`">PA <i v-for="n in Math.max(START_AP, s.ap)" :key="n" :class="{ on: n <= s.ap }"></i></span>
        <span v-if="s.guard.reduce > 0" class="dg-pill" title="Bloqueio para o próximo golpe">🛡️ {{ Math.round(s.guard.reduce * 100) }}%</span>
        <label class="dg-toggle"><input v-model="showThreat" type="checkbox" /> ameaça</label>
      </header>

      <div class="dg-grid" :class="{ 'enemy-turn': enemyTurn }" :style="{ gridTemplateColumns: `repeat(${GRID_W}, 1fr)` }">
        <button
          v-for="c in cells"
          :key="key(c)"
          type="button"
          class="dg-cell"
          :class="{
            wall: wallAt(c),
            barrier: barrierAt(c),
            reach: (moveCosts.get(key(c)) ?? 0) > 0,
            target: targetKeys.has(key(c)),
            area: areaKeys.has(key(c)),
            pending: pending && key(pending) === key(c),
            danger: threatKeys.has(key(c)) && !wallAt(c),
            doom: doomKeys.has(key(c)),
          }"
          :aria-label="`Casa ${c.x + 1},${c.y + 1}${enemyAt(c) ? `: ${enemyAt(c)!.name}` : lootAt(c) ? ': saque' : stairsAt(c) ? ': escada' : ''}`"
          @click="tapCell(c)"
        >
          <small v-if="mode === 'move' && (moveCosts.get(key(c)) ?? 0) > 0" class="dg-cost">{{ moveCosts.get(key(c)) }}</small>
          <span v-if="stairsAt(c)" class="dg-stairs" aria-hidden="true">🪜</span>
          <span v-if="trapAt(c)" class="dg-trap" title="Armadilha" aria-hidden="true">⚙️</span>
          <span v-if="lootAt(c) && !enemyAt(c)" class="dg-loot" :class="{ chest: lootAt(c)!.chest }" aria-hidden="true">{{ lootAt(c)!.chest ? '🧰' : lootAt(c)!.items.some((i) => i.kind === 'gem' && i.gem.legendary) ? '🌟' : '💎' }}</span>
          <template v-if="enemyAt(c)">
            <span class="dg-mon" :class="{ acting: acting === enemyAt(c)!.uid, elite: enemyAt(c)!.elite, mini: enemyAt(c)!.miniBoss, boss: enemyAt(c)!.boss }">
              <img v-if="!brokenSprites.has(enemyAt(c)!.dexId)" :src="sprite(enemyAt(c)!.dexId)" :alt="enemyAt(c)!.name" @error="brokenSprites.add(enemyAt(c)!.dexId)" />
              <span v-else class="dg-nosprite">{{ enemyAt(c)!.name }}</span>
            </span>
            <span class="dg-profile" :title="PROFILES[enemyAt(c)!.profile].name">{{ PROFILES[enemyAt(c)!.profile].icon }}</span>
            <span v-if="intentOf(enemyAt(c)!)" class="dg-intent" :title="INTENTS[intentOf(enemyAt(c)!)!.kind].text">{{ INTENTS[intentOf(enemyAt(c)!)!.kind].icon }}</span>
            <span v-if="enemyAt(c)!.burn" class="dg-burn" title="Queimando">🔥</span>
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
          <DungeonAttackFx v-if="attackFx?.cells.includes(key(c))" :key="`${attackFx.id}:${key(c)}`" :weapon="attackFx.weapon" :ammo="attackFx.ammo" />
          <span v-for="p in popupsAt(c)" :key="p.id" class="dg-popup" :class="p.kind">{{ p.text }}</span>
        </button>
      </div>

      <p class="dg-preview" aria-live="polite">
        <template v-if="enemyTurn"><span class="dg-enemy-msg">Turno dos inimigos… {{ s.log[s.log.length - 1] }}</span></template>
        <template v-else-if="exploring">✨ Sala limpa: toque numa casa para andar, pegue o saque e vá até a 🪜 escada. <button type="button" class="small" @click="forgeOpen = true">Forja</button></template>
        <template v-else-if="pendingText">{{ pendingText }} <button v-if="mode === 'attack' ? !preview?.reason : true" type="button" class="primary small" @click="confirm">Confirmar</button></template>
        <template v-else-if="flash"><span class="dg-warn">{{ flash }}</span></template>
        <template v-else-if="s.mustSwitch">Escolha quem assume a posição (troca grátis).</template>
        <template v-else-if="s.bossThreat && !mode"><span class="dg-warn">O chefe vai soltar o golpe nas casas marcadas: saia delas antes de encerrar.</span></template>
        <template v-else-if="mode === 'move'">Toque numa casa marcada para mover.</template>
        <template v-else-if="mode === 'attack'">{{ targetKeys.size ? 'Toque num alvo para ver o dano.' : 'Nenhum inimigo ao alcance desta arma.' }}</template>
        <template v-else>{{ s.log[s.log.length - 1] }}</template>
      </p>

      <div v-if="inspectedEnemy" class="dg-enemy-card" :class="{ elite: inspectedEnemy.elite, mini: inspectedEnemy.miniBoss, boss: inspectedEnemy.boss }">
        <img v-if="!brokenSprites.has(inspectedEnemy.dexId)" :src="sprite(inspectedEnemy.dexId)" alt="" />
        <div>
          <strong>{{ PROFILES[inspectedEnemy.profile].icon }} {{ inspectedEnemy.name }}<template v-if="inspectedEnemy.boss"> · Chefe</template><template v-else-if="inspectedEnemy.miniBoss"> · Mini-chefe</template><template v-else-if="inspectedEnemy.elite"> · Elite</template></strong>
          <span><span v-for="t in inspectedEnemy.types" :key="t" class="dg-type" :style="typeStyle(t)">{{ TYPE_LABELS_PT[t] }}</span></span>
          <small>{{ PROFILES[inspectedEnemy.profile].name }}: {{ PROFILES[inspectedEnemy.profile].text }}</small>
          <small v-for="a in inspectedEnemy.affixes" :key="a">{{ AFFIXES[a].icon }} {{ AFFIXES[a].name }}: {{ AFFIXES[a].text }}</small>
          <small>{{ WEAPONS[inspectedEnemy.weapon].name }} ({{ PATTERN_TEXT[WEAPONS[inspectedEnemy.weapon].pattern] }}, alcance {{ WEAPONS[inspectedEnemy.weapon].range }}) · HP {{ inspectedEnemy.hp }}/{{ inspectedEnemy.maxHp }}{{ inspectedEnemy.shaken ? ' · defesa abalada' : '' }}</small>
          <small v-if="intentOf(inspectedEnemy)" class="dg-intent-text">{{ INTENTS[intentOf(inspectedEnemy)!.kind].icon }} Neste turno, {{ INTENTS[intentOf(inspectedEnemy)!.kind].text }}.</small>
          <details class="dg-enemy-details">
            <summary>Detalhes do inimigo</summary>
            <div>
              <span>{{ PROFILES[inspectedEnemy.profile].name }}: {{ PROFILES[inspectedEnemy.profile].text }}</span>
              <span v-for="a in inspectedEnemy.affixes" :key="a">{{ AFFIXES[a].icon }} {{ AFFIXES[a].name }}: {{ AFFIXES[a].text }}</span>
              <span>{{ WEAPONS[inspectedEnemy.weapon].name }} ({{ PATTERN_TEXT[WEAPONS[inspectedEnemy.weapon].pattern] }}, alcance {{ WEAPONS[inspectedEnemy.weapon].range }}) · HP {{ inspectedEnemy.hp }}/{{ inspectedEnemy.maxHp }}{{ inspectedEnemy.shaken ? ' · defesa abalada' : '' }}</span>
            </div>
          </details>
        </div>
      </div>

      <nav class="dg-commands" aria-label="Ações">
        <button type="button" :class="{ on: mode === 'move' }" :disabled="!playing || s.mustSwitch" @click="setMode('move')"><b>👣</b>Mover</button>
        <button type="button" :class="{ on: mode === 'attack' }" :disabled="!playing || s.mustSwitch" @click="setMode('attack')"><b>⚔️</b>Atacar</button>
        <button type="button" :disabled="!playing || s.mustSwitch || s.potions === 0 || s.ap < COSTS.item" @click="doPotion"><b>🧪</b>Poção · {{ COSTS.item }}</button>
        <button type="button" :disabled="!playing || s.mustSwitch || !!s.fusion || s.fusionCharges === 0" @click="openFusion"><b>💠</b>Fusão · {{ COSTS.fusion }}</button>
        <button type="button" class="primary" :disabled="!playing || s.mustSwitch" @click="doEnd"><b>⏭️</b>Encerrar</button>
      </nav>

      <div v-if="activeMember && who" class="dg-active" :class="{ fused: !!s.fusion }">
        <FusionArt v-if="s.fusion" :origins="s.fusion.origins" :orbs="who.orbs" :ammo="who.ammo" :size="84" />
        <div v-else class="dg-weapon-col">
          <WeaponArt :weapon="activeMember.weapon" :dex-id="activeMember.dexId" :ammo="activeMember.ammo[0] ?? null" :size="84" />
          <span class="dg-sockets"><GemChip v-for="(g, i) in activeMember.gems" :key="i" :gem="g" :legendary-slot="i === LEGENDARY_SLOT_INDEX" :size="16" /></span>
        </div>
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
            <span class="dg-weapon-summary"><strong>{{ who.weapon.name }}</strong> · poder {{ who.power }} · {{ who.weapon.ap }} PA · {{ who.weapon.cost }} carga</span>
            <span>Munição: <span v-for="t in who.ammo" :key="t" class="dg-type" :style="typeStyle(t)">{{ TYPE_LABELS_PT[t] }}</span><template v-if="who.ammo.length > 1"> (70% / 30%)</template></span>
            <span v-if="!s.fusion && ammoOptions(activeMember).length > 1" class="dg-ammo">
              <button v-for="opt in ammoOptions(activeMember)" :key="ammoKey(opt)" type="button" :class="{ on: ammoKey(opt) === ammoKey(activeMember.ammo) }" :disabled="s.phase === 'enemy'" @click="chooseAmmo(opt)">{{ ammoLabel(opt) }}</button>
            </span>
            <details class="dg-weapon-details">
              <summary>Detalhes da arma</summary>
              <div>
                <span>{{ who.weapon.kind === 'physical' ? 'Físico' : 'Especial' }} · {{ who.weapon.category }} · {{ PATTERN_TEXT[who.weapon.pattern] }}, alcance {{ who.weapon.range }}<template v-if="who.bonus.crit > 0"> · crítico {{ Math.round(who.bonus.crit * 100) }}%</template></span>
                <span v-for="(line, i) in mechanicList(who.weapon.mechanics)" :key="i" class="dg-mech">⚙ {{ line }}</span>
              </div>
            </details>
          </div>
        </div>
      </div>

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

      <details class="dg-log"><summary>Registro</summary><ol><li v-for="(line, i) in s.log.slice(-16).reverse()" :key="i">{{ line }}</li></ol></details>

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
              <li v-for="(line, i) in mechanicList(fusionPreview.weapon.mechanics)" :key="`m${i}`">⚙ {{ line }}</li>
              <li>Munição: {{ ammoLabel(fusionPreview.ammo) }}{{ fusionPreview.ammo.length > 1 ? ' (70% / 30%)' : '' }}</li>
              <li>{{ fusionPreview.weapon.ap }} PA e {{ fusionPreview.weapon.cost }} carga por ataque · poder base {{ fusionPreview.weapon.power }} · alcance {{ fusionPreview.weapon.range }}</li>
              <li>Duração: {{ FUSION_TURNS }} turnos · Ativação: {{ COSTS.fusion }} PA + 1 buff · Carga temporária: {{ FUSION_CHARGE }}</li>
              <li>Gemas: média dos bônus dos dois, e os efeitos lendários de ambos valem juntos.</li>
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

      <!-- Mochila e forja -->
      <div v-if="forgeOpen" class="dg-modal" role="dialog" aria-label="Mochila e forja">
        <div class="dg-modal-box wide">
          <h3>💎 Mochila e forja</h3>
          <p v-if="!canForge" class="hint dg-provisional">Em combate dá só para olhar. Encaixe e lapide com a sala limpa ou na escada.</p>
          <p v-else class="hint">Toque numa gema da mochila e depois num encaixe. Toque numa gema encaixada para tirá-la. Dois encaixes comuns e um lendário (★) por arma.</p>
          <ul class="dg-forge-team">
            <li v-for="(m, i) in s.team" :key="m.id" :class="{ down: m.status === 'down' }">
              <WeaponArt :weapon="m.weapon" :dex-id="m.dexId" :ammo="m.ammo[0] ?? null" :size="54" />
              <div class="dg-forge-info">
                <strong>{{ m.name }}</strong>
                <small>{{ WEAPONS[m.weapon].name }} · HP {{ m.hp }}/{{ m.maxHp }} · carga {{ m.maxCharge }}</small>
                <span class="dg-forge-slots">
                  <button v-for="(g, slot) in m.gems" :key="slot" type="button" class="dg-slot" :class="{ legendary: slot === LEGENDARY_SLOT_INDEX, ready: !!selectedGem && selectedGem.legendary === (slot === LEGENDARY_SLOT_INDEX) }" :disabled="!canForge" :aria-label="g ? `Tirar ${gemName(g)}` : 'Encaixe vazio'" @click="tapSlot(i, slot)">
                    <GemChip :gem="g" :legendary-slot="slot === LEGENDARY_SLOT_INDEX" :size="24" />
                    <small v-if="slot === LEGENDARY_SLOT_INDEX">★</small>
                  </button>
                </span>
              </div>
            </li>
          </ul>
          <h4>Mochila ({{ s.bag.length }})</h4>
          <p v-if="s.bag.length === 0" class="hint">Vazia. Baús 🧰 e inimigos derrotados deixam gemas; elites deixam mais, e todo chefe deixa uma lendária.</p>
          <ul class="dg-bag-list">
            <li v-for="g in bagSorted" :key="g.id">
              <button type="button" :class="{ on: forgeGem === g.id }" :disabled="!canForge" @click="forgeGem = forgeGem === g.id ? null : g.id"><GemChip :gem="g" label :size="26" /></button>
            </li>
          </ul>
          <template v-if="polishGroups.length">
            <h4>Lapidação</h4>
            <p class="hint">Três gemas iguais do mesmo grau viram uma do grau seguinte (sem teto).</p>
            <div class="dg-polish">
              <button v-for="grp in polishGroups" :key="`${grp.kind}${grp.tier}`" type="button" :disabled="!canForge" @click="doPolish(grp.kind, grp.tier)">
                {{ GEMS[grp.kind].icon }} 3× {{ GEMS[grp.kind].name }} {{ tierName(grp.tier) }} → {{ tierName(grp.tier + 1) }} <small>({{ grp.count }})</small>
              </button>
            </div>
          </template>
          <p v-if="flash" class="dg-warn">{{ flash }}</p>
          <div class="dg-actions"><button type="button" class="primary" @click="forgeOpen = false; forgeGem = null">Fechar</button></div>
        </div>
      </div>

      <!-- Pokébola: nova arma ou evolução antes de descer -->
      <div v-if="weaponOffer && s.phase === 'reward'" class="dg-modal" role="dialog" aria-label="Escolha da Pokébola">
        <div class="dg-modal-box wide dg-weapon-offer">
          <header class="dg-offer-head"><h3>🔴 Pokébola · andar {{ s.floor }}</h3><small>1 escolha nesta escada</small></header>
          <p class="hint">Uma arma nova entra na equipe; ou evolua uma que já está nela. Tudo vale apenas nesta expedição.</p>
          <div v-if="orbAnimation" class="dg-orb-animation" role="status" aria-live="polite">
            <img :src="sprite(orbAnimation.dexId)" :alt="orbAnimation.name" />
            <span class="dg-orb">◉</span>
            <WeaponArt :weapon="orbAnimation.weapon" :dex-id="orbAnimation.dexId" :size="78" />
            <strong>{{ orbAnimation.message }}</strong>
          </div>
          <template v-else>
            <div class="dg-offer-tabs" role="tablist" aria-label="Tipo de escolha">
              <button v-if="weaponOffer.choices.length" type="button" :class="{ on: weaponOfferView === 'weapons' }" role="tab" :aria-selected="weaponOfferView === 'weapons'" @click="weaponOfferView = 'weapons'; evolutionPick = null">⚔️ Armas ({{ weaponOffer.choices.length }})</button>
              <button v-if="weaponOffer.evolutions.length" type="button" :class="{ on: weaponOfferView === 'evolve' }" role="tab" :aria-selected="weaponOfferView === 'evolve'" @click="weaponOfferView = 'evolve'; evolutionPick = null">✨ Evoluir ({{ evolutionMembers.length }})</button>
            </div>
            <div v-if="weaponOfferView === 'weapons'" class="dg-draft-options" role="tabpanel">
              <button v-for="c in weaponOffer.choices" :key="c.id" type="button" @click="void chooseWeapon(c)">
                <WeaponArt :weapon="weaponOfDex(c.dexId)!" :dex-id="c.dexId" :ammo="c.types![0] ?? null" :size="44" />
                <strong>{{ c.name }}</strong>
                <small>{{ WEAPONS[weaponOfDex(c.dexId)!].name }}</small>
              </button>
            </div>
            <div v-else class="dg-evolve-panel" role="tabpanel">
              <div v-if="evolutionPick === null" class="dg-evolve-members">
                <button v-for="entry in evolutionMembers" :key="entry.memberIndex" type="button" @click="evolutionPick = entry.memberIndex">
                  <img :src="sprite(entry.member.dexId)" alt="" />
                  <span><strong>{{ entry.member.name }}</strong><small>{{ entry.count }} evolução{{ entry.count === 1 ? '' : 'ões' }}</small></span>
                </button>
              </div>
              <template v-else>
                <button type="button" class="dg-back" @click="evolutionPick = null">← Escolher outro Pokémon</button>
                <div class="dg-evolve-options">
                  <button v-for="evolution in shownEvolutions" :key="`${evolution.memberIndex}:${evolution.input.dexId}`" type="button" @click="void chooseEvolution(evolution)">
                    <span>✨ {{ s.team[evolution.memberIndex]!.name }} → <strong>{{ evolution.input.name }}</strong></span>
                    <small>{{ WEAPONS[weaponOfDex(evolution.input.dexId)!].name }}</small>
                  </button>
                </div>
              </template>
            </div>
          </template>
        </div>
      </div>

      <!-- Escada: recompensa e descer, ou sair -->
      <div v-if="s.phase === 'reward' && !forgeOpen && !weaponOffer" class="dg-modal" role="dialog" aria-label="Escada">
        <div class="dg-modal-box">
          <h3>🪜 Escada para o andar {{ s.floor + 1 }}</h3>
          <p class="hint">{{ isBossFloor(s.floor + 1) ? '👑 Lá embaixo espera um chefe.' : `Próxima região: ${floorTheme(s.floor + 1).name}.` }} Os inimigos ficam mais fortes a cada andar.</p>
          <button v-for="r in s.rewardOptions" :key="r" type="button" class="dg-reward" @click="pickReward(r)"><strong>Descer com: {{ REWARDS[r].name }}</strong><small>{{ REWARDS[r].text }}</small></button>
          <div class="dg-actions">
            <button type="button" @click="forgeOpen = true">💎 Forja ({{ s.bag.length }})</button>
            <button type="button" class="dg-leave" @click="leaveDungeon">Sair com o espólio</button>
          </div>
        </div>
      </div>

      <!-- Fim da expedição -->
      <div v-if="s.phase === 'lost' || s.phase === 'retired'" class="dg-modal" role="dialog" aria-label="Fim da expedição">
        <div class="dg-modal-box">
          <h3>{{ s.phase === 'retired' ? '🎒 Você saiu da masmorra' : '💀 A equipe caiu' }}</h3>
          <p class="hint">{{ s.log[s.log.length - 1] }}</p>
          <ul class="dg-summary">
            <li><strong>{{ s.stats.deepest }}</strong><small>andar mais fundo</small></li>
            <li><strong>{{ s.stats.kills }}</strong><small>inimigos</small></li>
            <li><strong>{{ s.stats.elites }}</strong><small>elites</small></li>
            <li><strong>{{ s.stats.bosses }}</strong><small>chefes</small></li>
            <li><strong>{{ s.stats.gems }}</strong><small>gemas achadas</small></li>
            <li><strong>{{ s.stats.legendaries }}</strong><small>lendárias</small></li>
          </ul>
          <p v-if="s.stats.deepest >= record" class="dg-record">🏆 Novo recorde: andar {{ s.stats.deepest }}!</p>
          <p class="hint">As gemas valem só nesta expedição: ainda não voltam para a Vila.</p>
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
.dungeon { --tile-a: #43395c; --tile-b: #362d4c; --wall-top: #5a4e72; --wall-side: #2a2338; --frame: #3d3158; --bg-a: #251c3a; --bg-b: #0f0c18; flex: 1; min-height: 0; overflow-y: auto; padding: 10px 12px calc(12px + env(safe-area-inset-bottom)); color: var(--text); background: radial-gradient(ellipse at top, var(--bg-a), var(--bg-b) 70%); transition: background 0.6s; }
.theme-1 { --tile-a: #3e4646; --tile-b: #2e3434; --wall-top: #5d6762; --wall-side: #222827; --frame: #4a5552; --bg-a: #1d2826; --bg-b: #0b100f; }
.theme-2 { --tile-a: #5a3427; --tile-b: #43241a; --wall-top: #7a4632; --wall-side: #2e150d; --frame: #8a3f22; --bg-a: #3a170b; --bg-b: #120604; }
.theme-3 { --tile-a: #2f5552; --tile-b: #22403d; --wall-top: #5fa59a; --wall-side: #183230; --frame: #3f8a80; --bg-a: #12302d; --bg-b: #061210; }
.theme-4 { --tile-a: #24285a; --tile-b: #181b40; --wall-top: #3d4290; --wall-side: #0f1130; --frame: #5a4fc0; --bg-a: #150f3a; --bg-b: #040312; }
.dg-pick h2 { margin: 0 0 6px; }
.hint { color: var(--muted); font-size: 0.88rem; margin: 4px 0; }
.dg-center { text-align: center; }
.dg-record { color: var(--gold); font-weight: 700; margin: 6px 0; }
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
.dg-leave { border-color: var(--gold) !important; color: var(--gold) !important; }
.primary { background: var(--accent) !important; color: var(--on-accent); border-color: transparent !important; }
button.small { min-height: 30px; padding: 0 10px; border-radius: 8px; margin-left: 6px; border: 1px solid var(--line); background: var(--surface-2); color: inherit; }
button:disabled { opacity: 0.5; }

.dg-run { display: flex; flex-direction: column; gap: 8px; max-width: 540px; margin: 0 auto; }
.dungeon.is-running { display: flex; overflow: hidden; padding: 5px 8px calc(5px + env(safe-area-inset-bottom)); }
.dungeon.is-running .dg-run { width: min(540px, 100%); height: 100%; min-height: 0; flex: 1; gap: 4px; }
.dungeon.is-running .dg-hud { gap: 3px 4px; font-size: 0.76rem; line-height: 1.1; }
.dungeon.is-running .dg-break { display: none; }
.dungeon.is-running .dg-pill { padding: 3px 6px; }
.dungeon.is-running .dg-floor { font-size: 0.88rem; }
.dungeon.is-running .dg-small { display: none; }
.dungeon.is-running .dg-theme { margin-right: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dungeon.is-running .dg-toggle { margin-left: 0; }
.dg-hud { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 0.85rem; font-weight: 600; }
.dg-break { flex-basis: 100%; height: 0; }
.dg-pill { padding: 3px 9px; border-radius: 999px; background: #0007; border: 1px solid #ffffff22; color: inherit; font: inherit; }
.dg-small { font-size: 0.75rem; }
.dg-floor { font-size: 1rem; background: color-mix(in srgb, var(--frame) 70%, #000); }
.dg-floor.boss { border-color: var(--gold); box-shadow: 0 0 8px #ffcb0566; }
.dg-floor.mini { border-color: #ff8a55; box-shadow: 0 0 8px #ff6b4a66; }
.dg-theme { color: var(--muted); font-weight: 500; font-style: italic; }
.dg-ap i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-left: 3px; border: 1px solid var(--gold); vertical-align: middle; }
.dg-ap i.on { background: var(--gold); box-shadow: 0 0 4px var(--gold); }
.dg-toggle { margin-left: auto; font-weight: 400; color: var(--muted); display: flex; align-items: center; gap: 4px; }

.dg-grid { display: grid; gap: 3px; padding: 6px; background: linear-gradient(180deg, color-mix(in srgb, var(--tile-b) 70%, #000), #00000080); border: 2px solid var(--frame); border-radius: 12px; box-shadow: inset 0 0 22px #000c, 0 0 18px color-mix(in srgb, var(--frame) 40%, transparent); transition: border-color 0.6s; }
.dungeon.is-running .dg-grid { width: clamp(230px, calc(100dvh - 440px), 390px); max-width: 100%; align-self: center; flex: none; }
.dg-grid.enemy-turn { border-color: #b84a5a; }
.dg-cell { position: relative; aspect-ratio: 1; padding: 0; border: 0; border-radius: 5px; background: linear-gradient(135deg, var(--tile-a), var(--tile-b)); display: flex; align-items: center; justify-content: center; overflow: visible; }
.dg-cell.barrier { background: repeating-linear-gradient(90deg, #7fe7ff55 0 3px, #1b2a40 3px 7px); box-shadow: inset 0 0 0 2px #7fe7ff99; }
.dg-trap { position: absolute; bottom: 2px; right: 3px; font-size: 0.8rem; z-index: 2; }
.dg-burn { position: absolute; bottom: 6px; left: -2px; font-size: 0.65rem; z-index: 2; }
.dg-ammo { display: flex; flex-wrap: wrap; gap: 4px; }
.dg-ammo button { padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); background: #0004; color: inherit; font-size: 0.72rem; }
.dg-ammo button.on { border-color: var(--gold); color: var(--gold); }
.dg-mech { font-size: 0.74rem; }
.dg-cell.wall { background: linear-gradient(180deg, var(--wall-top) 0 32%, var(--wall-side) 32%); box-shadow: inset 0 -3px 0 #0008; }
.dg-cell.doom { box-shadow: inset 0 0 0 2px #ff3d3d; animation: dg-doom 0.9s ease-in-out infinite; }
.dg-cell.reach { background: linear-gradient(135deg, #2f6a80, #245468); }
.dg-cell.target { box-shadow: inset 0 0 0 2px var(--warn); }
.dg-cell.area { background: #8a3442; }
.dg-cell.pending { box-shadow: inset 0 0 0 3px var(--gold); }
.dg-cell.danger { background: linear-gradient(135deg, #a42b39, #581621); box-shadow: inset 0 0 0 2px #ff6670, 0 0 8px #ff344766; }
.dg-cell.danger::after { content: ''; position: absolute; inset: 0; border-radius: 5px; background: repeating-linear-gradient(45deg, #ff566a8c 0 4px, #7e152566 4px 8px); pointer-events: none; }
.dg-mon, .dg-player { position: relative; z-index: 1; display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; }
.dg-mon img, .dg-player img { width: 120%; height: 120%; object-fit: contain; image-rendering: pixelated; pointer-events: none; position: relative; top: -14%; animation: dg-bob 1.8s ease-in-out infinite; }
.dg-mon.elite img { filter: drop-shadow(0 0 3px #ffcb05); }
.dg-mon.mini img { width: 135%; height: 135%; top: -20%; filter: drop-shadow(0 0 5px #ff7955); }
.dg-mon.boss img { width: 150%; height: 150%; top: -25%; filter: drop-shadow(0 0 5px #ff5a5a); }
.dg-mon.acting { animation: dg-act 0.42s ease-out; }
.dg-mon.acting::before { content: ''; position: absolute; inset: 6%; border-radius: 50%; box-shadow: 0 0 0 2px #ff7a7a, 0 0 12px #ff5a5a; }
.dg-cost { position: absolute; top: 2px; left: 4px; font-size: 0.65rem; color: #cde; z-index: 2; }
.dg-profile { position: absolute; top: -4px; right: -4px; z-index: 2; font-size: 0.68rem; background: #000a; border-radius: 50%; width: 1.35em; height: 1.35em; display: flex; align-items: center; justify-content: center; }
.dg-intent { position: absolute; top: -4px; left: -4px; z-index: 2; font-size: 0.68rem; background: #2a0f14d0; border: 1px solid #ff7a7a88; border-radius: 6px; padding: 0 2px; line-height: 1.3; }
.dg-stairs { position: absolute; font-size: 1.4rem; animation: dg-glow 1.6s ease-in-out infinite; }
.dg-loot { position: absolute; font-size: 1.1rem; animation: dg-bob 1.4s ease-in-out infinite; filter: drop-shadow(0 0 4px #7fe7ff); }
.dg-loot.chest { filter: drop-shadow(0 0 4px #ffcb05); }
.dg-player { border-radius: 50%; box-shadow: 0 0 0 2px var(--gold); }
.dg-player.fused { box-shadow: 0 0 0 2px #b38cff, 0 0 10px #b38cff; }
.dg-player.fused img { width: 70%; height: 70%; }
.dg-hp { position: relative; display: block; height: 5px; background: #0006; border-radius: 3px; overflow: hidden; flex: 1; }
.dg-hp i { position: absolute; inset: 0 auto 0 0; background: var(--ok); transition: width 0.3s; }
.dg-hp.charge i { background: #6fb6ff; }
.dg-cell .dg-hp.enemy { position: absolute; left: 10%; right: 10%; bottom: 3px; height: 4px; z-index: 2; }
.dg-cell .dg-hp.enemy i { background: var(--warn); }
.dg-popup { position: absolute; left: 50%; top: 10%; z-index: 3; transform: translateX(-50%); font-weight: 800; font-size: 0.9rem; pointer-events: none; text-shadow: 0 1px 2px #000, 0 0 4px #000; animation: dg-pop 1s ease-out forwards; }
.dg-popup.hit { color: #ffe066; }
.dg-popup.hurt { color: #ff6b6b; font-size: 1rem; }
.dg-popup.heal { color: #6bff9a; }
.dg-popup.info { color: #ddd; }

.dg-preview { min-height: 2.6em; margin: 0; font-size: 0.88rem; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
.dungeon.is-running .dg-preview { min-height: 1.7em; font-size: 0.76rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; flex-wrap: nowrap; }
.dungeon.is-running .dg-preview > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.dungeon.is-running .dg-preview button { min-height: 26px; flex: none; }
.dg-warn { color: var(--warn); }
.dg-enemy-msg { color: #ffb3b3; }
.dg-enemy-card { display: flex; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 10px; background: #3a1d2a; border: 1px solid #7a3446; font-size: 0.82rem; }
.dg-enemy-card.elite { border-color: var(--gold); }
.dg-enemy-card.mini { border-color: #ff8a55; box-shadow: 0 0 8px #ff6b4a44; }
.dg-enemy-card.boss { border-color: #ff5a5a; box-shadow: 0 0 10px #ff5a5a55; }
.dg-enemy-card img { width: 44px; height: 44px; object-fit: contain; image-rendering: pixelated; }
.dg-enemy-card div { display: flex; flex-direction: column; gap: 2px; }
.dg-enemy-card small { color: var(--muted); }
.dg-intent-text { color: #ffb3b3 !important; }
.dg-enemy-details { display: none; }
.dungeon.is-running .dg-enemy-card { min-height: 48px; gap: 5px; padding: 4px 6px; font-size: 0.74rem; }
.dungeon.is-running .dg-enemy-card img { width: 38px; height: 38px; }
.dungeon.is-running .dg-enemy-card > div { min-width: 0; }
.dungeon.is-running .dg-enemy-card strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dungeon.is-running .dg-enemy-card small:not(.dg-intent-text) { display: none; }
.dungeon.is-running .dg-enemy-card .dg-intent-text { display: none; }
.dungeon.is-running .dg-enemy-details { display: block; }
.dungeon.is-running .dg-enemy-details:not([open]) { position: static; max-height: none; overflow: visible; padding: 0; border: 0; background: transparent; box-shadow: none; }
.dungeon.is-running .dg-enemy-details[open] { position: fixed; z-index: 85; inset: auto 12px calc(12px + env(safe-area-inset-bottom)); max-height: min(42dvh, 250px); overflow-y: auto; padding: 8px 10px; border: 1px solid #7a3446; border-radius: 10px; background: var(--surface); box-shadow: 0 10px 28px #000b; }
.dungeon.is-running .dg-enemy-details summary { cursor: pointer; color: var(--gold); }
.dungeon.is-running .dg-enemy-details > div { display: flex; flex-direction: column; gap: 3px; max-height: none; margin-top: 4px; overflow: visible; color: var(--muted); }
.dg-active { display: flex; gap: 10px; align-items: center; background: linear-gradient(135deg, var(--surface-2), var(--surface)); border: 1px solid var(--line); border-radius: 12px; padding: 8px; font-size: 0.84rem; }
.dg-active.fused { border-color: #b38cff; box-shadow: 0 0 12px #b38cff44; flex-direction: column; align-items: stretch; }
.dg-active.fused :deep(.fusion-art) { align-self: center; }
.dg-weapon-col { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.dg-sockets { display: flex; gap: 3px; }
.dg-active-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.dg-bar { display: flex; align-items: center; gap: 6px; }
.dg-bar > span:first-child { min-width: 3.4em; }
.dg-weapon { display: flex; flex-direction: column; gap: 2px; color: var(--muted); font-size: 0.8rem; }
.dg-weapon strong { color: var(--text); }
.dg-weapon-details { color: var(--muted); }
.dg-weapon-details summary { cursor: pointer; color: var(--gold); }
.dg-weapon-details > div { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; }
.dungeon.is-running .dg-active { min-height: 76px; gap: 6px; padding: 5px 6px; font-size: 0.75rem; }
.dungeon.is-running .dg-active .weapon-art { width: 60px !important; height: 60px !important; }
.dungeon.is-running .dg-active-info { gap: 2px; }
.dungeon.is-running .dg-bar { gap: 4px; }
.dungeon.is-running .dg-bar > span:first-child { min-width: 2.9em; }
.dungeon.is-running .dg-weapon { font-size: 0.72rem; gap: 1px; }
.dungeon.is-running .dg-weapon-details { position: fixed; z-index: 85; inset: auto 12px calc(12px + env(safe-area-inset-bottom)); max-height: min(42dvh, 250px); overflow-y: auto; padding: 8px 10px; border: 1px solid var(--gold); border-radius: 10px; background: var(--surface); box-shadow: 0 10px 28px #000b; }
.dungeon.is-running .dg-weapon-details:not([open]) { position: static; max-height: none; overflow: visible; padding: 0; border: 0; background: transparent; box-shadow: none; }
.dungeon.is-running .dg-weapon-details[open] summary { margin-bottom: 4px; }
.dg-type { display: inline-block; padding: 0 6px; margin-left: 4px; border-radius: 999px; font-size: 0.7rem; color: #fff; text-shadow: 0 1px 1px #0008; }
.dg-commands { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.dg-commands button { min-height: 52px; padding: 2px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface-2); color: inherit; font-size: 0.74rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
.dg-commands button b { font-size: 1.05rem; font-weight: 400; }
.dg-commands button.on { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }
.dungeon.is-running .dg-commands { gap: 3px; }
.dungeon.is-running .dg-commands button { min-height: 42px; font-size: 0.67rem; }
.dungeon.is-running .dg-commands button b { font-size: 0.94rem; }

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
.dungeon.is-running .dg-team { gap: 3px; }
.dungeon.is-running .dg-team button { min-height: 54px; gap: 1px; padding: 2px; font-size: 0.62rem; }
.dungeon.is-running .dg-team img { width: 23px; height: 23px; }
.dungeon.is-running .dg-team-weapon { transform: scale(0.75); transform-origin: top right; }
.dungeon.is-running .dg-team button > small:last-child { display: none; }
.dungeon.is-running .dg-team .dg-hp { height: 4px; }
.dungeon.is-running .dg-log { min-height: 16px; font-size: 0.7rem; line-height: 1.1; }
.dungeon.is-running .dg-log[open] { position: fixed; z-index: 85; inset: auto 12px calc(12px + env(safe-area-inset-bottom)); max-height: min(46dvh, 290px); overflow-y: auto; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); box-shadow: 0 10px 28px #000b; }

@media (max-height: 620px) and (orientation: portrait) {
  .dungeon.is-running .dg-grid { width: clamp(210px, calc(100dvh - 410px), 310px); }
  .dungeon.is-running .dg-enemy-card { display: none; }
  .dungeon.is-running .dg-active { min-height: 64px; }
  .dungeon.is-running .dg-active .weapon-art { width: 48px !important; height: 48px !important; }
  .dungeon.is-running .dg-team button { min-height: 46px; }
}

.dg-modal { position: fixed; inset: 0; z-index: 80; background: #000b; display: flex; align-items: center; justify-content: center; padding: max(8px, env(safe-area-inset-top)) 8px max(8px, env(safe-area-inset-bottom)); }
.dg-modal-box { width: min(460px, 100%); max-height: calc(100dvh - 16px); overflow-y: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; }
.dg-modal-box.wide { width: min(560px, 100%); }
.dg-modal-box h3 { margin: 0 0 8px; }
.dg-modal-box h4 { margin: 12px 0 4px; }
.dg-fusion-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.dg-fusion-grid button { min-height: 92px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border-radius: 10px; border: 2px solid var(--line); background: var(--surface-2); color: inherit; font-size: 0.78rem; }
.dg-fusion-grid button.on { border-color: #b38cff; box-shadow: 0 0 8px #b38cff66; }
.dg-fusion-grid small { color: var(--muted); font-size: 0.66rem; }
.dg-fusion-preview { margin-top: 12px; }
.dg-facts { margin: 6px 0; padding-left: 18px; font-size: 0.8rem; color: var(--muted); }
.dg-reward { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px; margin-top: 6px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface-2); color: inherit; text-align: left; }
.dg-reward small { color: var(--muted); }
.dg-weapon-offer { max-height: calc(100dvh - 16px); overflow: hidden; display: flex; flex-direction: column; gap: 7px; padding: 10px; }
.dg-offer-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.dg-offer-head h3 { margin: 0; font-size: 1rem; }
.dg-offer-head small, .dg-weapon-offer > .hint { font-size: 0.72rem; margin: 0; }
.dg-offer-tabs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px; }
.dg-offer-tabs button, .dg-back { min-height: 34px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); color: inherit; font-size: 0.75rem; }
.dg-offer-tabs button.on { border-color: var(--gold); color: var(--gold); box-shadow: inset 0 0 0 1px #ffcb0555; }
.dg-draft-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.dg-draft-options button, .dg-evolve-options button { min-width: 0; min-height: 106px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 5px 3px; color: inherit; background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; }
.dg-draft-options strong { font-size: 0.74rem; overflow-wrap: anywhere; }
.dg-draft-options small, .dg-evolve-options small, .dg-evolve-members small { color: var(--muted); font-size: 0.65rem; }
.dg-evolve-panel { min-height: 0; display: flex; flex-direction: column; gap: 6px; }
.dg-evolve-members { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
.dg-evolve-members button { min-height: 52px; display: flex; align-items: center; gap: 5px; padding: 5px; text-align: left; color: inherit; background: var(--surface-2); border: 1px solid var(--line); border-radius: 9px; }
.dg-evolve-members img { width: 38px; height: 38px; object-fit: contain; image-rendering: pixelated; }
.dg-evolve-members span { display: flex; flex-direction: column; min-width: 0; }
.dg-evolve-members strong { font-size: 0.72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dg-evolve-options { display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px; }
.dg-evolve-options button { min-height: 56px; align-items: flex-start; padding: 7px; text-align: left; }
.dg-back { align-self: flex-start; padding: 0 8px; }
.dg-orb-animation { min-height: 150px; display: grid; place-items: center; justify-items: center; position: relative; overflow: hidden; }
.dg-orb-animation > img { width: 76px; height: 76px; object-fit: contain; image-rendering: pixelated; animation: dg-orb-in 0.72s ease-in forwards; z-index: 2; }
.dg-orb-animation .dg-orb { position: absolute; font-size: 5.2rem; line-height: 1; color: #f04949; text-shadow: 0 0 12px #fff, 0 0 22px #ffcf57; animation: dg-orb-flash 0.72s ease-out forwards; }
.dg-orb-animation .weapon-art { position: absolute; opacity: 0; animation: dg-weapon-out 0.72s ease-in forwards; animation-delay: 0.2s; }
.dg-orb-animation strong { margin-top: -8px; text-align: center; }
.dg-forge-team { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.dg-forge-team li { display: flex; gap: 8px; align-items: center; padding: 6px; border-radius: 10px; background: var(--surface-2); }
.dg-forge-team li.down { opacity: 0.6; }
.dg-forge-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dg-forge-info small { color: var(--muted); font-size: 0.72rem; }
.dg-forge-slots { display: flex; gap: 6px; }
.dg-slot { min-width: 40px; min-height: 40px; border-radius: 8px; border: 1px dashed var(--line); background: #0004; color: var(--gold); display: flex; align-items: center; justify-content: center; gap: 2px; }
.dg-slot.legendary { border-color: #ffcb0588; }
.dg-slot.ready { border-style: solid; border-color: var(--gold); box-shadow: 0 0 6px #ffcb0566; }
.dg-bag-list { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 4px; }
.dg-bag-list button { width: 100%; padding: 6px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: inherit; text-align: left; }
.dg-bag-list button.on { border-color: var(--gold); box-shadow: 0 0 8px #ffcb0566; }
.dg-polish { display: flex; flex-wrap: wrap; gap: 4px; }
.dg-polish button { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: inherit; font-size: 0.8rem; }
.dg-summary { list-style: none; padding: 0; margin: 8px 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.dg-summary li { display: flex; flex-direction: column; align-items: center; padding: 6px; border-radius: 10px; background: var(--surface-2); }
.dg-summary strong { font-size: 1.3rem; }
.dg-summary small { color: var(--muted); font-size: 0.7rem; text-align: center; }

@keyframes dg-pop { from { opacity: 1; transform: translate(-50%, 0); } to { opacity: 0; transform: translate(-50%, -28px); } }
@keyframes dg-doom { 50% { background: #7a2a36; } }
@keyframes dg-bob { 50% { transform: translateY(-4%); } }
@keyframes dg-act { 30% { transform: scale(1.18); } }
@keyframes dg-glow { 50% { filter: drop-shadow(0 0 6px #ffe9a3); transform: scale(1.08); } }
@keyframes dg-orb-in { 0% { transform: translateY(-130px) scale(1.25); opacity: 1; } 75% { transform: translateY(0) scale(0.25); opacity: 1; } 100% { transform: translateY(0) scale(0); opacity: 0; } }
@keyframes dg-orb-flash { 0%, 45% { transform: scale(0.55); opacity: 0; } 65% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(0.6); opacity: 0; } }
@keyframes dg-weapon-out { 0%, 35% { transform: scale(0.3) rotate(-18deg); opacity: 0; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
@media (max-height: 620px) { .dg-weapon-offer { gap: 4px; } .dg-weapon-offer > .hint { display: none; } .dg-draft-options button { min-height: 88px; } .dg-evolve-members button { min-height: 44px; } .dg-evolve-members img { width: 32px; height: 32px; } .dg-orb-animation { min-height: 108px; } .dg-orb-animation > img { width: 58px; height: 58px; } }
@media (prefers-reduced-motion: reduce) { .dg-popup, .dg-cell.doom, .dg-mon img, .dg-player img, .dg-loot, .dg-stairs, .dg-mon.acting, .dg-orb-animation > img, .dg-orb-animation .dg-orb, .dg-orb-animation .weapon-art { animation: none; } .dg-orb-animation > img, .dg-orb-animation .dg-orb { display: none; } .dg-orb-animation .weapon-art { position: static; opacity: 1; } }
</style>
