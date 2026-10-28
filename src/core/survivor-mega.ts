import data from './data/pokemon-megas.json';
import { attackProfile } from './survivor-moves';
import { statsOfDex } from './survivor-stats';
import { speciesName } from './survivor-evolution';
import { add, count } from './village/life';
import type { VillageState } from './village/life';
import type { BaseStats } from './survivor-moves';
import type { SurvivorState } from './survivor-types';

/**
 * Mega Evolução temporária da Torre de Sobrevivência. Na seleção, quem tem forma Mega na PokéAPI pode megaevoluir
 * gastando 1 Fragmento de Megapedra da mochila da Vila: a corrida começa na forma Mega, com os stats base dessa forma
 * (`data/pokemon-megas.json`, gerado por `scripts/build-megas.mjs`), e volta à forma normal quando o tempo acaba.
 * Espécie sem forma Mega no dado não ganha a opção — nada é inventado.
 */

/** Item da Vila gasto pela Mega (id antigo do catálogo; o nome mostrado é "Fragmento de Megapedra"). */
export const SURVIVOR_MEGA_ITEM = 'mega-stone-shard';
/** Quanto a forma Mega dura, no relógio da corrida. */
export const SURVIVOR_MEGA_DURATION_MS = 3 * 60_000;
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
  stats: BaseStats;
  sprite: SurvivorMegaSprite;
}

/** Mega em curso (ou já encerrada) na corrida. As razões guardam o que a forma multiplicou, para desfazer no fim. */
export interface SurvivorMegaState {
  formId: number;
  label: string;
  stats: BaseStats;
  /** Relógio da corrida em que a forma acaba. */
  untilMs: number;
  active: boolean;
  ratios: { maxHp: number; damage: number; cooldownMs: number; radius: number; walkSpeed: number; projectileSpeed: number };
  /** Tamanho do disparo antes da Mega (não é proporcional: volta exatamente). */
  baseProjectileSize: number;
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

function labelOf(raw: RawForm): string {
  const species = speciesName(raw.dex) || raw.name.split('-')[0]!;
  if (raw.variant) return `Mega ${species} ${raw.variant.toUpperCase()}`;
  const middle = raw.name.replace(/-mega$/, '').split('-').slice(1).join('-');
  const extra = middle ? FORM_LABELS[middle] ?? middle : '';
  return `Mega ${species}${extra ? ` ${extra}` : ''}`;
}

function toForm(raw: RawForm): SurvivorMegaForm | null {
  const [hp, attack, defense, spAttack, spDefense, speed] = raw.stats;
  if (raw.stats.length < 6 || raw.stats.some((v) => !(v > 0))) return null;
  return {
    dexId: raw.dex, formId: raw.id, formName: raw.name, label: labelOf(raw),
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

/**
 * Entra na forma Mega: cada número do jogador muda na proporção entre o perfil dos stats da espécie e o da forma Mega
 * (como na evolução, mas sem bônus). A vida sobe junto, mantendo a fração. Sem stats da espécie, não aplica (false).
 */
export function startSurvivorMega(state: SurvivorState, form: SurvivorMegaForm, durationMs = SURVIVOR_MEGA_DURATION_MS): boolean {
  const p = state.player;
  if (p.mega?.active || form.dexId !== p.dexId) return false;
  const baseStats = statsOfDex(p.dexId);
  if (!baseStats) return false;
  const before = attackProfile(p.move, baseStats);
  const after = attackProfile(p.move, form.stats);
  const ratios = {
    maxHp: ratio(before.maxHp, after.maxHp),
    damage: ratio(before.damage, after.damage),
    cooldownMs: ratio(before.cooldownMs, after.cooldownMs),
    radius: ratio(before.radius, after.radius),
    walkSpeed: ratio(before.walkSpeed, after.walkSpeed),
    projectileSpeed: ratio(before.projectileSpeed, after.projectileSpeed),
  };
  p.mega = { formId: form.formId, label: form.label, stats: form.stats, untilMs: state.elapsedMs + durationMs, active: true, ratios, baseProjectileSize: p.projectileSize };
  scalePlayer(state, ratios, after.projectileSize);
  return true;
}

function scalePlayer(state: SurvivorState, r: SurvivorMegaState['ratios'], projectileSize: number): void {
  const p = state.player;
  const fraction = p.maxHp > 0 ? p.hp / p.maxHp : 1;
  p.maxHp = Math.max(1, Math.round(p.maxHp * r.maxHp));
  p.hp = Math.min(p.maxHp, Math.max(p.hp > 0 ? 1 : 0, Math.round(p.maxHp * fraction)));
  p.attackDamage = round1(p.attackDamage * r.damage);
  p.attackCooldownMs = Math.max(120, Math.round(p.attackCooldownMs * r.cooldownMs));
  p.attackRadius = round1(p.attackRadius * r.radius);
  p.speed = round1(p.speed * r.walkSpeed);
  p.projectileSpeed = round1(p.projectileSpeed * r.projectileSpeed);
  p.projectileSize = projectileSize;
}

/** Volta à forma normal (desfaz as razões; upgrades pegos durante a Mega continuam valendo). */
export function endSurvivorMega(state: SurvivorState): boolean {
  const mega = state.player.mega;
  if (!mega?.active) return false;
  mega.active = false;
  const r = mega.ratios;
  const inverse = (n: number): number => (n > 0 ? 1 / n : 1);
  scalePlayer(state, {
    maxHp: inverse(r.maxHp), damage: inverse(r.damage), cooldownMs: inverse(r.cooldownMs), radius: inverse(r.radius),
    walkSpeed: inverse(r.walkSpeed), projectileSpeed: inverse(r.projectileSpeed),
  }, mega.baseProjectileSize);
  return true;
}

/** Chamado a cada passo: encerra a Mega quando o relógio passa do fim. */
export function stepSurvivorMega(state: SurvivorState): void {
  const mega = state.player.mega;
  if (mega?.active && state.elapsedMs >= mega.untilMs) endSurvivorMega(state);
}

/** Tempo restante da Mega (0 quando não há Mega ativa). */
export function survivorMegaRemainingMs(state: Pick<SurvivorState, 'elapsedMs' | 'player'>): number {
  const mega = state.player.mega;
  return mega?.active ? Math.max(0, mega.untilMs - state.elapsedMs) : 0;
}

/** Stats para a defesa: os da forma Mega enquanto ela dura, senão os da espécie. */
export function survivorPlayerStats(player: { dexId: number; mega?: SurvivorMegaState }): BaseStats | null {
  return player.mega?.active ? player.mega.stats : statsOfDex(player.dexId);
}

/** Fragmentos na mochila. */
export function megaShardCount(village: VillageState): number {
  return count(village, SURVIVOR_MEGA_ITEM);
}

/** Tira 1 fragmento da mochila no começo da corrida; false se não houver. */
export function takeMegaShard(village: VillageState): boolean {
  if (megaShardCount(village) < 1) return false;
  village.inventory[SURVIVOR_MEGA_ITEM] = megaShardCount(village) - 1;
  return true;
}

/** Fim da corrida: desistência logo no começo devolve o fragmento (true); senão ele foi gasto. */
export function settleMegaShard(village: VillageState, survivedMs: number): boolean {
  if (survivedMs >= SURVIVOR_MEGA_REFUND_MS) return false;
  add(village, SURVIVOR_MEGA_ITEM, 1);
  return true;
}
