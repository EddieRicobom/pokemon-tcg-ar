import data from './data/pokemon-megas.json';
import { otherSurvivorAttack, type SurvivorAttackFields } from './survivor-attack-slots';
import { attackProfile } from './survivor-moves';
import { statsOfDex } from './survivor-stats';
import { speciesName } from './survivor-evolution';
import { add, count } from './village/life';
import type { VillageState } from './village/life';
import type { BaseStats } from './survivor-moves';
import type { SurvivorState } from './survivor-types';

/**
 * Mega Evolução da Torre de Sobrevivência, válida por uma corrida. Na seleção, quem tem forma Mega na PokéAPI pode
 * megaevoluir gastando 1 Fragmento Ômega da mochila da Vila: a corrida começa na forma Mega, com os stats base
 * dessa forma (`data/pokemon-megas.json`, gerado por `scripts/build-megas.mjs`), e fica assim até a corrida acabar.
 * Sem limite de tempo; só a evolução encerra a Mega antes (a forma Mega é da espécie de agora).
 * Espécie sem forma Mega no dado não ganha a opção — nada é inventado.
 */

/** Item da Vila gasto pela Mega ("Fragmento Ômega"; saves antigos com `mega-stone-shard` são convertidos em `normalizeVillage`). */
export const SURVIVOR_OMEGA_SHARD_ITEM = 'omega-shard';
/** Corrida abandonada antes disto devolve o fragmento (o mesmo limite da marmita, `TOWER_RUN_MIN_MS`). */
export const SURVIVOR_MEGA_REFUND_MS = 20_000;

/** Como o sprite da forma existe no repositório PokeAPI/sprites (conferido quando o dado foi gerado). */
export type SurvivorMegaSprite = 'animado' | 'parado' | 'nenhum';

export interface SurvivorMegaForm {
  /** Espécie base (número da Pokédex). */
  dexId: number;
  /** Id da forma na PokéAPI (10001+), o mesmo dos sprites. */
  formId: number;
  /** Nome da forma na PokéAPI ("charizard-mega-x"). */
  formName: string;
  /** "Mega Charizard X". */
  label: string;
  /** Rótulo curto do botão na seleção ("Mega X", "Mega"). */
  short: string;
  stats: BaseStats;
  sprite: SurvivorMegaSprite;
}

/** Mega em curso (ou já encerrada) na corrida. As razões guardam o que a forma multiplicou, para desfazer no fim. */
export interface SurvivorMegaState {
  formId: number;
  label: string;
  stats: BaseStats;
  active: boolean;
  maxHpRatio: number;
  walkSpeedRatio: number;
  attacks: readonly [MegaAttackScale, MegaAttackScale?];
}

interface MegaAttackScale {
  damage: number;
  cooldownMs: number;
  radius: number;
  projectileSpeed: number;
  baseProjectileSize: number;
  megaProjectileSize: number;
}

interface RawForm { dex: number; id: number; name: string; variant: string | null; stats: number[]; animated: boolean; still: boolean }

/** Sufixos de formas sem letra (o que vem antes de "-mega" no nome da PokéAPI). */
const FORM_LABELS: Record<string, string> = {
  male: '(macho)',
  female: '(fêmea)',
  original: 'Cor Original',
  curly: 'Forma Curvada',
  droopy: 'Forma Caída',
  stretchy: 'Forma Estendida',
};

/** O que distingue a forma ("X", "(fêmea)"), vazio quando a espécie só tem uma Mega simples. */
function extraOf(raw: RawForm): string {
  if (raw.variant) return raw.variant.toUpperCase();
  const middle = raw.name.replace(/-mega$/, '').split('-').slice(1).join('-');
  return middle ? FORM_LABELS[middle] ?? middle : '';
}

function labelOf(raw: RawForm): string {
  const species = speciesName(raw.dex) || raw.name.split('-')[0]!;
  const extra = extraOf(raw);
  return `Mega ${species}${extra ? ` ${extra}` : ''}`;
}

function toForm(raw: RawForm): SurvivorMegaForm | null {
  const [hp, attack, defense, spAttack, spDefense, speed] = raw.stats;
  if (raw.stats.length < 6 || raw.stats.some((v) => !(v > 0))) return null;
  return {
    dexId: raw.dex, formId: raw.id, formName: raw.name, label: labelOf(raw), short: `Mega${extraOf(raw) ? ` ${extraOf(raw)}` : ''}`,
    stats: { hp: hp!, attack: attack!, defense: defense!, spAttack: spAttack!, spDefense: spDefense!, speed: speed! },
    sprite: raw.animated ? 'animado' : raw.still ? 'parado' : 'nenhum',
  };
}

const FORMS: readonly SurvivorMegaForm[] = (data.forms as RawForm[]).map(toForm).filter((f): f is SurvivorMegaForm => f !== null);

/** Formas Mega da espécie (Charizard tem X e Y; quem não tem Mega devolve vazio). */
export function survivorMegaForms(dexId: number): readonly SurvivorMegaForm[] {
  return FORMS.filter((form) => form.dexId === dexId);
}

export function survivorMegaForm(formId: number): SurvivorMegaForm | null {
  return FORMS.find((form) => form.formId === formId) ?? null;
}

/** Total de formas no dado (para o Diagnóstico e os testes). */
export function survivorMegaCount(): number {
  return FORMS.length;
}

/** Diferença dos stats base, para a seleção mostrar o efeito ("Ataque +46"). Só stats que mudam. */
export function survivorMegaStatDelta(form: SurvivorMegaForm): { stat: keyof BaseStats; label: string; delta: number }[] {
  const base = statsOfDex(form.dexId);
  if (!base) return [];
  const labels: Record<keyof BaseStats, string> = { hp: 'Vida', attack: 'Ataque', defense: 'Defesa', spAttack: 'At. Esp.', spDefense: 'Def. Esp.', speed: 'Velocidade' };
  return (Object.keys(labels) as (keyof BaseStats)[])
    .map((stat) => ({ stat, label: labels[stat], delta: form.stats[stat] - base[stat] }))
    .filter((row) => row.delta !== 0);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const ratio = (a: number, b: number): number => (a > 0 && b > 0 ? b / a : 1);

function megaAttackScale(attack: SurvivorAttackFields, baseStats: BaseStats, megaStats: BaseStats): MegaAttackScale {
  const move = attack.terastal?.baseMove ?? attack.move;
  const before = attackProfile(move, baseStats);
  const after = attackProfile(move, megaStats);
  return {
    damage: ratio(before.damage, after.damage),
    cooldownMs: ratio(before.cooldownMs, after.cooldownMs),
    radius: ratio(before.radius, after.radius),
    projectileSpeed: ratio(before.projectileSpeed, after.projectileSpeed),
    baseProjectileSize: attack.projectileSize,
    megaProjectileSize: after.projectileSize,
  };
}

/**
 * Entra na forma Mega: cada número do jogador muda na proporção entre o perfil dos stats da espécie e o da forma Mega
 * (como na evolução, mas sem bônus). A vida sobe junto, mantendo a fração. Sem stats da espécie, não aplica (false).
 */
export function startSurvivorMega(state: SurvivorState, form: SurvivorMegaForm): boolean {
  const p = state.player;
  if (p.mega?.active || form.dexId !== p.dexId) return false;
  const baseStats = statsOfDex(p.dexId);
  if (!baseStats) return false;
  const before = attackProfile(p.move, baseStats);
  const after = attackProfile(p.move, form.stats);
  const slots = state.attackSlots;
  const loadedAttack = megaAttackScale(p, baseStats, form.stats);
  const storedAttack = slots ? megaAttackScale(slots.stored, baseStats, form.stats) : undefined;
  const attacks: SurvivorMegaState['attacks'] = storedAttack && slots?.loaded === 1 ? [storedAttack, loadedAttack] : [loadedAttack, storedAttack];
  p.mega = {
    formId: form.formId, label: form.label, stats: form.stats, active: true, attacks,
    maxHpRatio: ratio(before.maxHp, after.maxHp), walkSpeedRatio: ratio(before.walkSpeed, after.walkSpeed),
  };
  scalePlayer(state, p.mega, true);
  return true;
}

function scalePlayer(state: SurvivorState, mega: SurvivorMegaState, entering: boolean): void {
  const p = state.player;
  const scale = (value: number): number => entering ? value : ratio(value, 1);
  const hpBefore = p.hp;
  const fraction = p.maxHp > 0 ? p.hp / p.maxHp : 1;
  p.maxHp = Math.max(1, Math.round(p.maxHp * scale(mega.maxHpRatio)));
  p.hp = Math.min(p.maxHp, Math.max(p.hp > 0 ? 1 : 0, Math.round(p.maxHp * fraction)), (p.healBlockMs ?? 0) > 0 ? hpBefore : Infinity);
  p.speed = round1(p.speed * scale(mega.walkSpeedRatio));
  function scaleAttack(attack: SurvivorAttackFields, ratios: MegaAttackScale | undefined): void {
    if (!ratios) return;
    attack.attackDamage = round1(attack.attackDamage * scale(ratios.damage));
    attack.attackCooldownMs = Math.max(120, Math.round(attack.attackCooldownMs * scale(ratios.cooldownMs)));
    attack.attackRadius = round1(attack.attackRadius * scale(ratios.radius));
    attack.projectileSpeed = round1(attack.projectileSpeed * scale(ratios.projectileSpeed));
    attack.projectileSize = entering ? ratios.megaProjectileSize : ratios.baseProjectileSize;
  }
  const slots = state.attackSlots;
  scaleAttack(p, mega.attacks[slots?.loaded ?? 0]);
  if (slots) scaleAttack(slots.stored, mega.attacks[otherSurvivorAttack(slots.loaded)]);
}

/** Volta à forma normal, usado só quando o Pokémon evolui (desfaz as razões; upgrades pegos durante a Mega continuam valendo). */
export function endSurvivorMega(state: SurvivorState): boolean {
  const mega = state.player.mega;
  if (!mega?.active) return false;
  mega.active = false;
  scalePlayer(state, mega, false);
  return true;
}

/** Stats para a defesa: os da forma Mega enquanto ela estiver ativa, senão os da espécie. */
export function survivorPlayerStats(player: { dexId: number; mega?: SurvivorMegaState }): BaseStats | null {
  return player.mega?.active ? player.mega.stats : statsOfDex(player.dexId);
}

/** Fragmentos na mochila. */
export function omegaShardCount(village: VillageState): number {
  return count(village, SURVIVOR_OMEGA_SHARD_ITEM);
}

/** Tira 1 fragmento da mochila no começo da corrida; false se não houver. */
export function takeOmegaShard(village: VillageState): boolean {
  if (omegaShardCount(village) < 1) return false;
  village.inventory[SURVIVOR_OMEGA_SHARD_ITEM] = omegaShardCount(village) - 1;
  return true;
}

/** Fim da corrida: desistência logo no começo devolve o fragmento (true); senão ele foi gasto. */
export function settleOmegaShard(village: VillageState, survivedMs: number): boolean {
  if (survivedMs >= SURVIVOR_MEGA_REFUND_MS) return false;
  add(village, SURVIVOR_OMEGA_SHARD_ITEM, 1);
  return true;
}
