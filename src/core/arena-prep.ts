import { speciesName } from './league';
import { seededRng } from './battle';
import { statsOfDex } from './survivor-stats';
import { applyUpgrade, createSurvivorState, rollUpgrades } from './survivor';
import { survivorAttackChoices, survivorAttackOf } from './survivor-loadout';
import { SURVIVOR_RARITY_ORDER, SURVIVOR_UPGRADES } from './survivor-upgrades';
import { SV_LIMITS, SV_MAX_TEAM, svMonFromRun } from './survivor-pvp';
import type { SvAttackForm, SvCombatProfile, SvMonSpec } from './survivor-pvp';
import type { SurvivorState } from './survivor';
import type { SurvivorPlayer, SurvivorUpgradeOption } from './survivor-types';

/**
 * Preparo da luta 6x6 da Arena: cada Pokémon recebe 10 níveis, e cada nível é uma carta da Torre. As cartas são as mesmas
 * da corrida e passam pelo mesmo motor (`rollUpgrades`, `applyUpgrade`); só entram as que mudam algum número da luta,
 * porque ímã, XP e apoio não existem na arena. O resultado é o mesmo `SvMonSpec` que o PvP do Survivor leva para a arena.
 */

export const ARENA_TEAM_SIZE = SV_MAX_TEAM;
export const ARENA_LEVEL_UPS = 10;
/**
 * A luta 6x6 dá mais vida a cada Pokémon do que o fim do PvP do Survivor: com a vida da corrida, cada um caía em uns 10 s
 * e não sobrava tempo para trocar, desviar e usar o escudo (medido em lutas entre rivais, ver `arena-prep.test.ts`).
 */
export const ARENA_HP_FACTOR = 1.4;
const OFFER_SIZE = 3;

export interface ArenaPrepMember {
  id: string;
  name: string;
  dexId: number;
  shiny: boolean;
}

export interface ArenaPrep {
  member: ArenaPrepMember;
  state: SurvivorState;
  /** Cartas já escolhidas (0 a `ARENA_LEVEL_UPS`). */
  picked: string[];
  offer: SurvivorUpgradeOption[];
}

const clampOf = (n: number, [lo, hi]: readonly [number, number]): number => Math.max(lo, Math.min(hi, n));

/**
 * Os números da luta já com os limites da ficha (os mesmos de `svMonFromRun`): uma carta que só empurra a velocidade para
 * além do teto não muda nada na arena e não pode ocupar uma das três vagas da oferta.
 */
const combatOf = (p: SurvivorPlayer): string => [
  clampOf(p.maxHp, SV_LIMITS.maxHp), clampOf(p.attackDamage, SV_LIMITS.power), clampOf(p.speed * 1.35, SV_LIMITS.speed), clampOf(p.attackCooldownMs, SV_LIMITS.fireMs),
  clampOf(p.projectileSpeed, [120, 700]), clampOf(p.projectileSize, [3, 18]), clampOf(p.shots, [1, 5]), clampOf(p.pierce, [0, 4]),
  clampOf(p.attackRange, [40, 360]), clampOf(p.attackRadius, [18, 160]), clampOf(p.critChance ?? 0, [0, 0.6]),
].join('|');

/** Cartas que não mudariam nada na luta deste Pokémon agora: ficam de fora da oferta. */
export function arenaIdleUpgrades(player: SurvivorPlayer): string[] {
  const before = combatOf(player);
  return SURVIVOR_UPGRADES.filter((upgrade) => {
    const copy = structuredClone(player);
    upgrade.apply(copy, upgrade.valueRange?.[1]);
    return combatOf(copy) === before;
  }).map((upgrade) => upgrade.id);
}

function nextOffer(prep: ArenaPrep): void {
  const { state } = prep;
  let offer: SurvivorUpgradeOption[] = [];
  if (prep.picked.length < ARENA_LEVEL_UPS) {
    offer = rollUpgrades(state.rng, OFFER_SIZE, state.player.move, state.player, { excludeIds: arenaIdleUpgrades(state.player) });
    // Os 10 níveis são garantidos para os dois lados: sem carta útil sobrando, vale qualquer carta da forma do golpe.
    if (offer.length === 0) offer = rollUpgrades(state.rng, OFFER_SIZE, state.player.move, state.player);
  }
  prep.offer = offer;
  state.pendingUpgrade = offer.length > 0 ? offer : null;
}

export function createArenaPrep(member: ArenaPrepMember, seed: number): ArenaPrep {
  const { move, profile } = survivorAttackOf(member.dexId);
  const state = createSurvivorState(seed, { kindCount: 1, move, profile, dexId: member.dexId });
  const prep: ArenaPrep = { member, state, picked: [], offer: [] };
  nextOffer(prep);
  return prep;
}

export const arenaPrepDone = (prep: ArenaPrep): boolean => prep.offer.length === 0;

/** Escolhe uma das cartas oferecidas: o Pokémon sobe um nível. Devolve false se a carta não estava na oferta. */
export function pickArenaCard(prep: ArenaPrep, id: string): boolean {
  if (!prep.offer.some((option) => option.id === id)) return false;
  applyUpgrade(prep.state, id);
  prep.state.player.level += 1;
  prep.picked.push(id);
  nextOffer(prep);
  return true;
}

/** A carta de maior raridade da oferta: quem pede para o jogo escolher e os rivais. */
export function bestArenaCard(prep: ArenaPrep): string | null {
  const rank = (option: SurvivorUpgradeOption): number => SURVIVOR_RARITY_ORDER.indexOf(option.rarity ?? 'normal');
  return [...prep.offer].sort((a, b) => rank(b) - rank(a))[0]?.id ?? null;
}

/** Escolhe sozinho o que falta deste Pokémon. */
export function autoFinishArenaPrep(prep: ArenaPrep): void {
  for (let id = bestArenaCard(prep); id; id = bestArenaCard(prep)) pickArenaCard(prep, id);
}

const ratioOf = (from: number, to: number): number => (from > 0 && to > 0 ? to / from : 1);
const clampTo = (n: number, [lo, hi]: readonly [number, number]): number => Math.max(lo, Math.min(hi, n));

/** O segundo ataque: as cartas pegas valem nele na mesma proporção em que mudaram o ataque principal. */
function secondAttack(prep: ArenaPrep): SvAttackForm {
  const { player, profile } = prep.state;
  const { move, profile: alt } = survivorAttackChoices(prep.member.dexId).alternative;
  const base = profile ?? alt;
  return {
    attackType: move.type,
    power: Math.round(clampTo(alt.damage * ratioOf(base.damage, player.attackDamage), SV_LIMITS.power)),
    fireMs: Math.round(clampTo(alt.cooldownMs * ratioOf(base.cooldownMs, player.attackCooldownMs), SV_LIMITS.fireMs)),
    moveName: move.name,
    moveCategory: move.category,
    moveEffect: move.effect,
    projectileSpeed: clampTo(alt.projectileSpeed * ratioOf(base.projectileSpeed, player.projectileSpeed), [120, 700]),
    projectileSize: clampTo(alt.projectileSize * ratioOf(base.projectileSize, player.projectileSize), [3, 18]),
    shots: Math.round(clampTo(player.shots, [1, 5])),
    pierce: Math.round(clampTo(player.pierce, [0, 4])),
    attackRange: clampTo(alt.range * ratioOf(base.range, player.attackRange), [40, 360]),
    attackRadius: clampTo(alt.radius * ratioOf(base.radius, player.attackRadius), [18, 160]),
    critChance: clampTo(player.critChance ?? 0, [0, 0.6]),
  };
}

/** O Pokémon pronto para a arena, com o ataque principal, o secundário e as cartas escolhidas. */
export function arenaSpecOf(prep: ArenaPrep): SvMonSpec {
  const { member, state } = prep;
  const p = state.player;
  const combat: SvCombatProfile = {
    moveName: p.move.name, category: p.move.category, effect: p.move.effect, maxHp: Math.round(p.maxHp), power: Math.round(p.attackDamage), speed: p.speed,
    cooldownMs: Math.round(p.attackCooldownMs), projectileSpeed: p.projectileSpeed, projectileSize: p.projectileSize, shots: p.shots, pierce: p.pierce,
    attackRange: p.attackRange, attackRadius: p.attackRadius, critChance: p.critChance ?? 0, buffs: [...new Set(prep.picked)],
  };
  const spec = svMonFromRun({
    id: member.id, dexId: member.dexId, name: member.name, shiny: member.shiny, types: survivorAttackOf(member.dexId).types, attackType: p.move.type,
    survivedMs: 0, kills: 0, level: p.level, defeated: false, combat,
  }, member.id);
  return { ...spec, maxHp: Math.round(clampTo(spec.maxHp * ARENA_HP_FACTOR, SV_LIMITS.maxHp)), alt: secondAttack(prep) };
}

export interface ArenaStat {
  label: string;
  value: string;
}

export interface ArenaCardChange {
  label: string;
  before: string;
  after: string;
  /** A carta melhora este número (na recarga, menor é melhor). */
  better: boolean;
}

const secondsOf = (ms: number): string => `${(ms / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`;
const whole = (n: number): string => String(Math.round(n));
const percent = (n: number): string => `${Math.round(n * 100)}%`;

/** Os números que a arena lê da ficha, com o mesmo arredondamento e os mesmos limites da luta. */
const ARENA_STAT_ROWS: readonly { label: string; read: (spec: SvMonSpec) => number; show: (n: number) => string; lowerIsBetter?: boolean; core?: boolean }[] = [
  { label: 'Vida', read: (spec) => spec.maxHp, show: whole, core: true },
  { label: 'Dano', read: (spec) => spec.power, show: whole, core: true },
  { label: 'Recarga', read: (spec) => spec.fireMs, show: secondsOf, lowerIsBetter: true, core: true },
  { label: 'Veloc.', read: (spec) => spec.speed, show: whole, core: true },
  { label: 'Disparos', read: (spec) => spec.shots ?? 1, show: whole },
  { label: 'Perfura', read: (spec) => spec.pierce ?? 0, show: whole },
  { label: 'Alcance', read: (spec) => spec.attackRange ?? 0, show: whole },
  { label: 'Raio', read: (spec) => spec.attackRadius ?? 0, show: whole },
  { label: 'Crítico', read: (spec) => spec.critChance ?? 0, show: percent },
  { label: 'Tiro', read: (spec) => spec.projectileSpeed ?? 0, show: whole },
  { label: 'Tamanho', read: (spec) => spec.projectileSize ?? 0, show: whole },
];

/** O resumo que fica em cima das cartas: como este Pokémon entraria na luta agora. */
export function arenaCoreStats(prep: ArenaPrep): ArenaStat[] {
  const spec = arenaSpecOf(prep);
  return ARENA_STAT_ROWS.filter((row) => row.core).map((row) => ({ label: row.label, value: row.show(row.read(spec)) }));
}

/**
 * O que a carta muda em números: aplica o mesmo efeito numa cópia e compara a ficha de luta antes e depois. Número que
 * não muda não aparece; lista vazia quer dizer que a carta não muda nenhum número desta luta.
 */
export function arenaCardChanges(prep: ArenaPrep, option: SurvivorUpgradeOption): ArenaCardChange[] {
  const upgrade = SURVIVOR_UPGRADES.find((candidate) => candidate.id === option.id);
  if (!upgrade) return [];
  const before = arenaSpecOf(prep);
  const player = structuredClone(prep.state.player);
  upgrade.apply(player, option.value);
  const after = arenaSpecOf({ ...prep, state: { ...prep.state, player }, picked: [...prep.picked, option.id] });
  return ARENA_STAT_ROWS.flatMap((row) => {
    const from = row.read(before);
    const to = row.read(after);
    if (row.show(from) === row.show(to)) return [];
    return [{ label: row.label, before: row.show(from), after: row.show(to), better: row.lowerIsBetter ? to < from : to > from }];
  });
}

/**
 * Equipe de um rival do jogo: sempre 6, repetindo a lista quando ela é menor (líderes têm equipes de tamanhos diferentes).
 * `power` é a dificuldade do desafio da Liga, a mesma que multiplicava os atributos do líder na batalha antiga.
 */
export function arenaRivalTeam(dexIds: readonly number[], power: number, seed: number): SvMonSpec[] {
  if (dexIds.length === 0) return [];
  const rng = seededRng(seed);
  const k = Math.max(0.5, Math.min(2, power));
  return Array.from({ length: ARENA_TEAM_SIZE }, (_, index) => {
    const dexId = dexIds[index % dexIds.length]!;
    const prep = createArenaPrep({ id: `rival-${index}`, name: speciesName(dexId), dexId, shiny: false }, Math.floor(rng() * 2 ** 31));
    autoFinishArenaPrep(prep);
    const spec = arenaSpecOf(prep);
    return {
      ...spec,
      maxHp: Math.round(clampTo(spec.maxHp * k, SV_LIMITS.maxHp)),
      power: Math.round(clampTo(spec.power * k, SV_LIMITS.power)),
      ...(spec.alt ? { alt: { ...spec.alt, power: Math.round(clampTo(spec.alt.power * k, SV_LIMITS.power)) } } : {}),
    };
  });
}

/** Sem os stats reais da espécie, o Pokémon luta com números médios: a tela precisa dizer isso. */
export const arenaEstimated = (dexId: number): boolean => statsOfDex(dexId) === null;
