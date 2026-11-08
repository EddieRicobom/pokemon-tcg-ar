import { healSurvivor } from './survivor-healing';
import type { PokemonType } from './pokemon-data';
import type { SurvivorEnemy, SurvivorEvent, SurvivorInput, SurvivorState } from './survivor-types';

/**
 * Golpe Supremo: o ultimate da Torre. Um medidor enche com abates, dano causado e dano recebido; cheio, um toque solta um
 * golpe único do tipo do jogador. Lógica pura: a câmera, o letreiro e o desenho ficam na interface.
 *
 * Grupo de cartas (docs/SURVIVOR_BALANCE_PRINCIPLES.md): não é carta, é recurso da corrida. Os tetos estão aqui: o medidor
 * não enche mais rápido que `SUPREME_MIN_FILL_MS`, os abates do próprio Supremo não recarregam, e chefes têm dano limitado
 * por fração da vida, para que nenhuma build o transforme em vitória automática nem elimine um chefe de uma vez.
 */

/** Tempo mínimo de jogo para encher o medidor, por mais inimigos que caiam. */
export const SUPREME_MIN_FILL_MS = 45_000;
/** Energia guardada além do que já escoou para o medidor: uma horda não paga o golpe seguinte inteiro. */
export const SUPREME_BANK_CAP = 0.4;
/** Carga entre o toque e a soltura. O jogador continua andando. */
export const SUPREME_WINDUP_MS = 420;
/** Proteção depois da soltura, além da carga. */
export const SUPREME_GRACE_MS = 420;
export const SUPREME_RADIUS = 340;

export const SUPREME_GAIN = {
  killCommon: 1 / 60,
  killElite: 1 / 12,
  killBoss: 1 / 4,
  /** Por barra inteira de vida de inimigo tirada. */
  damageDealtPerBar: 1 / 120,
  /** Por barra inteira da própria vida perdida: quem apanha recupera a saída. */
  damageTakenPerBar: 0.2,
} as const;

/** Faixas do dano do Supremo por classe, em fração da vida máxima do alvo. */
export const SUPREME_DAMAGE_BOUNDS = {
  comum: { min: 0.55, max: Number.POSITIVE_INFINITY },
  elite: { min: 0.12, max: 0.32 },
  chefao: { min: 0.05, max: 0.14 },
} as const;

export interface SurvivorSupremeDef {
  name: string;
  /** Múltiplo do dano do golpe principal. */
  damage: number;
  /** Múltiplo de `SUPREME_RADIUS`. */
  radius?: number;
  /** Multiplica o teto contra chefes. */
  bossFactor?: number;
  stunMs?: number;
  slowMs?: number;
  /** Queimadura por segundo, em fração do dano do golpe. */
  burnFraction?: number;
  pushPx?: number;
  /** Cura em fração da vida máxima. */
  healFraction?: number;
  /** Cura por alvo atingido, com teto de 20% da vida máxima. */
  healPerHit?: number;
  /** Proteção extra depois da soltura. */
  invulnMs?: number;
  clearsShots?: boolean;
  gathersOrbs?: boolean;
  /** Comuns que ficarem abaixo desta fração de vida caem na hora. */
  executeBelow?: number;
  /** Parte do medidor devolvida depois do golpe. */
  refund?: number;
  /** Desenho: `radial` marcas, `spokes` raios, `rain` chuva caindo. */
  pattern: 'radial' | 'spokes' | 'rain';
}

export const SURVIVOR_SUPREMES: Record<PokemonType, SurvivorSupremeDef> = {
  normal: { name: 'Impacto Absoluto', damage: 6.5, refund: 0.25, pattern: 'radial' },
  fire: { name: 'Sol Incandescente', damage: 6, burnFraction: 0.5, pattern: 'radial' },
  water: { name: 'Maré Colossal', damage: 5, pushPx: 130, slowMs: 1500, pattern: 'rain' },
  electric: { name: 'Céu Trovejante', damage: 5, stunMs: 900, pattern: 'spokes' },
  grass: { name: 'Floresta Desperta', damage: 4.5, healFraction: 0.22, pattern: 'rain' },
  ice: { name: 'Inverno Sem Fim', damage: 4.5, stunMs: 1200, slowMs: 2500, pattern: 'rain' },
  fighting: { name: 'Punho do Campeão', damage: 6.5, radius: 0.75, bossFactor: 1.5, pattern: 'spokes' },
  poison: { name: 'Névoa Letal', damage: 4.5, radius: 1.1, burnFraction: 1, pattern: 'radial' },
  ground: { name: 'Fenda Tectônica', damage: 6, radius: 0.85, stunMs: 600, pattern: 'spokes' },
  flying: { name: 'Ciclone Celeste', damage: 5, pushPx: 60, gathersOrbs: true, pattern: 'rain' },
  psychic: { name: 'Mente Soberana', damage: 5, slowMs: 2000, clearsShots: true, pattern: 'radial' },
  bug: { name: 'Enxame Sem Fim', damage: 6.6, slowMs: 900, pattern: 'radial' },
  rock: { name: 'Cordilheira Viva', damage: 5.5, invulnMs: 2200, pattern: 'spokes' },
  ghost: { name: 'Juízo Espectral', damage: 4.5, executeBelow: 0.5, pattern: 'radial' },
  dragon: { name: 'Cólera Ancestral', damage: 8, pattern: 'spokes' },
  dark: { name: 'Eclipse Voraz', damage: 5, healPerHit: 0.015, pattern: 'radial' },
  steel: { name: 'Muralha de Aço', damage: 4.5, invulnMs: 3200, pattern: 'spokes' },
  fairy: { name: 'Bênção Estelar', damage: 4.5, healFraction: 0.15, invulnMs: 1500, pattern: 'rain' },
};

export interface SurvivorSupremeState {
  type: PokemonType;
  /** De 0 a 1. */
  meter: number;
  /** Energia ganha que ainda vai escoar para o medidor. */
  banked: number;
  windupMs: number;
  /** Tempo restante da marca visual da soltura. */
  fxMs: number;
  /** Onde a soltura aconteceu. */
  x: number;
  y: number;
  uses: number;
}

export interface SupremeHooks {
  stun(e: SurvivorEnemy, ms: number): void;
  push(e: SurvivorEnemy, from: { x: number; y: number }, px: number): void;
  /** Dano para a conta do fim da corrida. */
  record(name: string, color: string, damage: number): void;
  attackDamage: number;
}

export function createSurvivorSupreme(type: PokemonType): SurvivorSupremeState {
  return { type, meter: 0, banked: 0, windupMs: 0, fxMs: 0, x: 0, y: 0, uses: 0 };
}

/** Soma energia, respeitando o que já está guardado. Medidor cheio ou golpe em carga não guardam nada. */
export function gainSupreme(state: SurvivorState, amount: number): void {
  const supreme = state.supreme;
  if (supreme.meter >= 1 || supreme.windupMs > 0 || !Number.isFinite(amount) || amount <= 0) return;
  supreme.banked = Math.min(SUPREME_BANK_CAP, supreme.banked + amount);
}

/** Abates que o próprio Supremo causou não contam, senão o golpe se pagaria sozinho numa horda. */
export function creditSupremeKill(state: SurvivorState, enemy: SurvivorEnemy): void {
  if (enemy.supremeHit) return;
  gainSupreme(state, enemy.boss || enemy.grade === 'chefao' || enemy.shadowBoss ? SUPREME_GAIN.killBoss : enemy.grade === 'elite' ? SUPREME_GAIN.killElite : SUPREME_GAIN.killCommon);
}

function classBounds(enemy: SurvivorEnemy): { min: number; max: number } {
  if (enemy.boss || enemy.grade === 'chefao' || enemy.shadowBoss) return SUPREME_DAMAGE_BOUNDS.chefao;
  return enemy.grade === 'elite' || enemy.trainerId !== undefined ? SUPREME_DAMAGE_BOUNDS.elite : SUPREME_DAMAGE_BOUNDS.comum;
}

/** Dano do Supremo num alvo: escala com o golpe, mas fica sempre dentro da faixa da classe. */
export function supremeDamageTo(enemy: SurvivorEnemy, def: SurvivorSupremeDef, attackDamage: number): number {
  const bounds = classBounds(enemy);
  const isBoss = bounds === SUPREME_DAMAGE_BOUNDS.chefao;
  const factor = isBoss ? def.bossFactor ?? 1 : 1;
  const raw = attackDamage * def.damage * factor;
  return Math.min(enemy.maxHp * bounds.max * factor, Math.max(enemy.maxHp * bounds.min * factor, raw));
}

function releaseSupreme(state: SurvivorState, hooks: SupremeHooks, events: SurvivorEvent[]): void {
  const supreme = state.supreme;
  const def = SURVIVOR_SUPREMES[supreme.type];
  const p = state.player;
  const origin = { x: p.x, y: p.y };
  const radius = SUPREME_RADIUS * (def.radius ?? 1);
  let hits = 0;
  for (const e of state.enemies) {
    if (e.hp <= 0 || e.thief || Math.hypot(e.x - origin.x, e.y - origin.y) > radius + e.radius) continue;
    const damage = supremeDamageTo(e, def, hooks.attackDamage) * ((e.protectedMs ?? 0) > 0 ? 0.75 : 1);
    hooks.record(def.name, p.move.color, Math.min(Math.max(0, e.hp), damage));
    e.hp -= damage;
    e.hitFlashMs = 140;
    hits++;
    if (def.executeBelow && e.grade === 'comum' && !e.boss && e.trainerId === undefined && e.hp <= e.maxHp * def.executeBelow) e.hp = 0;
    if (e.hp <= 0) { e.supremeHit = true; continue; }
    if (def.stunMs) hooks.stun(e, def.stunMs);
    if (def.slowMs) e.slowMs = Math.max(e.slowMs ?? 0, def.slowMs);
    if (def.burnFraction) {
      e.burnMs = 2000;
      e.burnDps = Math.max(e.burnDps ?? 0, damage * def.burnFraction);
    }
    if (def.pushPx) hooks.push(e, origin, classBounds(e) === SUPREME_DAMAGE_BOUNDS.chefao ? def.pushPx * 0.25 : def.pushPx);
  }
  if (def.healFraction) healSurvivor(p, Math.round(p.maxHp * def.healFraction));
  if (def.healPerHit && hits > 0) healSurvivor(p, Math.round(p.maxHp * Math.min(0.2, hits * def.healPerHit)));
  if (def.invulnMs) p.invulnMs = Math.max(p.invulnMs, def.invulnMs);
  if (def.clearsShots) state.hostileProjectiles = [];
  if (def.gathersOrbs) for (const orb of state.orbs) { orb.x = p.x; orb.y = p.y; }
  if (def.refund) supreme.banked = Math.min(SUPREME_BANK_CAP, def.refund);
  supreme.x = origin.x;
  supreme.y = origin.y;
  supreme.fxMs = 900;
  state.fx.push({ kind: 'blast', x: origin.x, y: origin.y, r: radius, color: p.move.color, ageMs: 0, lifeMs: 560, moveType: supreme.type });
  events.push({ type: 'supremeRelease', name: def.name, hits, x: origin.x, y: origin.y });
}

/** Escoa a energia para o medidor, inicia a carga pelo toque e solta o golpe quando a carga termina. */
export function stepSurvivorSupreme(state: SurvivorState, input: SurvivorInput, dtMs: number, events: SurvivorEvent[], hooks: SupremeHooks): void {
  const supreme = state.supreme;
  supreme.fxMs = Math.max(0, supreme.fxMs - dtMs);
  if (supreme.windupMs > 0) {
    supreme.windupMs = Math.max(0, supreme.windupMs - dtMs);
    if (supreme.windupMs === 0) releaseSupreme(state, hooks, events);
    return;
  }
  if (supreme.meter < 1 && supreme.banked > 0) {
    const flow = Math.min(supreme.banked, dtMs / SUPREME_MIN_FILL_MS, 1 - supreme.meter);
    supreme.meter = Math.min(1, supreme.meter + flow);
    supreme.banked -= flow;
    if (supreme.meter >= 1 - 1e-9) {
      supreme.meter = 1;
      supreme.banked = 0;
      events.push({ type: 'supremeReady', name: SURVIVOR_SUPREMES[supreme.type].name });
    }
  }
  if (input.supreme && supreme.meter >= 1 && !state.over) {
    supreme.meter = 0;
    supreme.banked = 0;
    supreme.windupMs = SUPREME_WINDUP_MS;
    supreme.uses += 1;
    state.player.invulnMs = Math.max(state.player.invulnMs, SUPREME_WINDUP_MS + SUPREME_GRACE_MS);
    events.push({ type: 'supremeCharge', name: SURVIVOR_SUPREMES[supreme.type].name });
  }
}
