import type { SurvivorPlayer } from './survivor-types';

/**
 * Peças da Torre que ficam fora do motor principal: o ladrão de tesouro, o desafio que se adapta, o bônus de nível quando
 * acabam as cartas e as estatísticas do resumo. Tudo puro; `survivor.ts` só chama.
 */

// ----------------------------------------------------------------------------- ladrão de tesouro

/** Meowth: aparece brilhando, foge de você e some se não for pego a tempo. */
export const SURVIVOR_THIEF_DEX = 52;
export const SURVIVOR_THIEF_FIRST_MS = 240_000;
export const SURVIVOR_THIEF_EVERY_MS = 270_000;
export const SURVIVOR_THIEF_LIFE_MS = 22_000;
/** Corre um pouco menos que um Pokémon médio: dá para alcançar, mas exige ir atrás. */
export const SURVIVOR_THIEF_SPEED = 118;

/** Moedas por pegar o ladrão: crescem com o tempo de corrida, até um teto. */
export function thiefReward(elapsedMs: number): number {
  return Math.min(150, 40 + Math.floor(elapsedMs / 60_000) * 6);
}

/** Para onde o ladrão corre: direto para longe de você, sem sair da arena. */
export function thiefFleeTarget(thief: { x: number; y: number }, player: { x: number; y: number }, bounds: { w: number; h: number }): { x: number; y: number } {
  const dx = thief.x - player.x;
  const dy = thief.y - player.y;
  const d = Math.hypot(dx, dy) || 1;
  const margin = 60;
  const clampPoint = (ux: number, uy: number) => ({
    x: Math.max(margin, Math.min(bounds.w - margin, thief.x + ux * 200)),
    y: Math.max(margin, Math.min(bounds.h - margin, thief.y + uy * 200)),
  });
  const reach = (p: { x: number; y: number }): number => Math.hypot(p.x - thief.x, p.y - thief.y);
  const away = clampPoint(dx / d, dy / d);
  if (reach(away) >= 60) return away;
  // Encurralado na parede: escorrega ao longo dela, para o lado que tem mais espaço.
  const left = clampPoint(-dy / d, dx / d);
  const right = clampPoint(dy / d, -dx / d);
  return reach(left) >= reach(right) ? left : right;
}

// ----------------------------------------------------------------------------- desafio que se adapta

export const ADAPTIVE_MIN = 0.7;
/** Começa abaixo da Torre de sempre: um Pokémon novo tem espaço para crescer. */
export const ADAPTIVE_START = 0.85;
export const ADAPTIVE_MAX = 1.6;

/** Cartas pegas até agora (cada nível de upgrade conta uma). */
export function upgradesTaken(p: Pick<SurvivorPlayer, 'upgradeLevels'>): number {
  return Object.values(p.upgradeLevels).reduce((sum, n) => sum + (n ?? 0), 0);
}

/**
 * Para onde o desafio quer ir: começa fácil e endurece a cada carta e evolução. Com pouca vida ele recua, para quem está
 * apanhando conseguir respirar. 1 é a Torre de sempre.
 */
export function adaptiveTarget(p: Pick<SurvivorPlayer, 'upgradeLevels' | 'stage' | 'hp' | 'maxHp'>): number {
  const power = 0.8 + upgradesTaken(p) * 0.014 + p.stage * 0.08;
  const struggling = p.hp < p.maxHp * 0.35 ? 0.25 : 0;
  return Math.max(ADAPTIVE_MIN, Math.min(ADAPTIVE_MAX, power - struggling));
}

/** O desafio anda devagar até o alvo (no máximo 4% por segundo), para nunca dar um salto que a pessoa sinta de uma vez. */
export function stepAdaptive(current: number, target: number, dtMs: number): number {
  const step = 0.04 * (Math.max(0, dtMs) / 1000);
  return current + Math.max(-step, Math.min(step, target - current));
}

// ----------------------------------------------------------------------------- bônus quando acabam as cartas

export type LevelBonusKind = 'heal' | 'damage' | 'speed' | 'vida';

export const LEVEL_BONUS_TEXT: Record<LevelBonusKind, string> = {
  heal: 'Sem cartas novas: cura 30% da vida.',
  damage: 'Sem cartas novas: +5% de dano.',
  speed: 'Sem cartas novas: +3% de velocidade.',
  vida: 'Sem cartas novas: +8 de vida máxima.',
};

/** Aplica um bônus sorteado no lugar da tela de cartas. Cura só entra no sorteio quando falta vida. */
export function applyLevelBonus(p: SurvivorPlayer, roll: number): LevelBonusKind {
  const kinds: LevelBonusKind[] = p.hp < p.maxHp ? ['heal', 'damage', 'speed', 'vida'] : ['damage', 'speed', 'vida'];
  const kind = kinds[Math.min(kinds.length - 1, Math.floor(roll * kinds.length))]!;
  if (kind === 'heal') p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3);
  else if (kind === 'damage') p.attackDamage = Math.round(p.attackDamage * 1.05 * 10) / 10;
  else if (kind === 'speed') p.speed = Math.round(p.speed * 1.03 * 10) / 10;
  else {
    p.maxHp += 8;
    p.hp += 8;
  }
  return kind;
}

// ----------------------------------------------------------------------------- estatísticas do resumo

export interface SurvivorDamageSource {
  name: string;
  color: string;
  damage: number;
}

export interface SurvivorTimelinePoint {
  ms: number;
  kills: number;
  level: number;
}

export interface SurvivorRunStats {
  damage: Record<string, SurvivorDamageSource>;
  timeline: SurvivorTimelinePoint[];
  nextSampleMs: number;
  thievesCaught: number;
}

/** Uma amostra a cada 30 s: o gráfico do resumo mostra derrotas e nível ao longo da corrida. */
export const SURVIVOR_TIMELINE_EVERY_MS = 30_000;
const MAX_TIMELINE = 240;

export const emptyRunStats = (): SurvivorRunStats => ({ damage: {}, timeline: [{ ms: 0, kills: 0, level: 1 }], nextSampleMs: SURVIVOR_TIMELINE_EVERY_MS, thievesCaught: 0 });

/** Soma o dano que de fato saiu da vida do inimigo (sem contar o que passou de zero). */
export function recordDamage(stats: SurvivorRunStats, name: string, color: string, dealt: number): void {
  if (!(dealt > 0)) return;
  const row = stats.damage[name] ?? (stats.damage[name] = { name, color, damage: 0 });
  row.damage += dealt;
}

export function sampleTimeline(stats: SurvivorRunStats, elapsedMs: number, kills: number, level: number): void {
  while (elapsedMs >= stats.nextSampleMs) {
    if (stats.timeline.length < MAX_TIMELINE) stats.timeline.push({ ms: stats.nextSampleMs, kills, level });
    stats.nextSampleMs += SURVIVOR_TIMELINE_EVERY_MS;
  }
}

/** As fontes de dano do resumo, da maior para a menor, com o dano arredondado. */
export function damageRanking(stats: SurvivorRunStats, limit = 6): SurvivorDamageSource[] {
  return Object.values(stats.damage)
    .map((row) => ({ ...row, damage: Math.round(row.damage) }))
    .filter((row) => row.damage > 0)
    .sort((a, b) => b.damage - a.damage)
    .slice(0, limit);
}
