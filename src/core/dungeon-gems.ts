import type { Rng } from './battle';

/**
 * Gemas da Masmorra: achadas em baús e deixadas por inimigos, encaixadas nas armas entre um andar e outro. Cada arma
 * tem dois encaixes comuns (stats) e um encaixe lendário (efeito que muda o ataque). Três gemas comuns iguais, do mesmo
 * grau, viram uma do grau seguinte na lapidação — o grau não tem teto, como a masmorra.
 */

export type GemKind = 'rubi' | 'safira' | 'esmeralda' | 'ametista' | 'topazio';
export type LegendaryKind = 'eco' | 'vampiro' | 'corrente' | 'fenix' | 'ampulheta' | 'prisma' | 'vendaval';

export interface Gem {
  id: number;
  kind: GemKind | LegendaryKind;
  /** Grau (1 = Lascada). Gemas lendárias têm sempre grau 1. */
  tier: number;
  legendary: boolean;
}

export const GEM_KINDS: readonly GemKind[] = ['rubi', 'safira', 'esmeralda', 'ametista', 'topazio'];
export const LEGENDARY_KINDS: readonly LegendaryKind[] = ['eco', 'vampiro', 'corrente', 'fenix', 'ampulheta', 'prisma', 'vendaval'];

/** Encaixes por arma: 0 e 1 comuns, 2 lendário. */
export const GEM_SLOTS = 3;
export const LEGENDARY_SLOT = 2;

export const GEMS: Readonly<Record<GemKind, { name: string; icon: string; color: string; stat: string }>> = {
  rubi: { name: 'Rubi', icon: '🔴', color: '#ff4f6d', stat: 'poder' },
  safira: { name: 'Safira', icon: '🔵', color: '#4f8dff', stat: 'carga máxima' },
  esmeralda: { name: 'Esmeralda', icon: '🟢', color: '#3fd17a', stat: 'HP máximo' },
  ametista: { name: 'Ametista', icon: '🟣', color: '#b46bff', stat: 'defesas' },
  topazio: { name: 'Topázio', icon: '🟡', color: '#ffc542', stat: 'chance de crítico' },
};

export const LEGENDARY: Readonly<Record<LegendaryKind, { name: string; icon: string; color: string; text: string }>> = {
  eco: { name: 'Gema do Eco', icon: '🔔', color: '#7fe7ff', text: '30% de chance de o golpe ecoar: cada alvo leva mais 50% do dano.' },
  vampiro: { name: 'Gema Vampírica', icon: '🩸', color: '#d0263f', text: 'Cura quem ataca em 20% do dano causado.' },
  corrente: { name: 'Gema da Corrente', icon: '⛓️', color: '#ffe066', text: 'Cada acerto salta para um inimigo vizinho do alvo, com 50% do dano.' },
  fenix: { name: 'Gema da Fênix', icon: '🔥', color: '#ff7a2f', text: 'Uma vez por andar, quem a carrega volta com 30% do HP em vez de cair.' },
  ampulheta: { name: 'Gema da Ampulheta', icon: '⏳', color: '#e8c58a', text: '+1 PA no começo do turno enquanto o portador estiver em campo.' },
  prisma: { name: 'Gema Prismática', icon: '🌈', color: '#ff9cf0', text: 'A munição vira mista com o segundo tipo do Pokémon (sem segundo tipo: +15% de poder).' },
  vendaval: { name: 'Gema do Vendaval', icon: '🌪️', color: '#9be7c4', text: 'Empurra cada alvo atingido uma casa para longe.' },
};

const TIER_NAMES = ['Lascada', 'Polida', 'Perfeita', 'Radiante', 'Estelar'];

export function tierName(tier: number): string {
  const last = TIER_NAMES.length;
  return tier <= last ? TIER_NAMES[Math.max(0, tier - 1)]! : `${TIER_NAMES[last - 1]} +${tier - last}`;
}

/** Valor do bônus de uma gema comum: fração para poder/HP/defesas/crítico, pontos para carga. */
export function gemValue(kind: GemKind, tier: number): number {
  switch (kind) {
    case 'rubi': return 0.08 * tier;
    case 'safira': return 2 * tier;
    case 'esmeralda': return 0.1 * tier;
    case 'ametista': return 0.07 * tier;
    case 'topazio': return 0.05 * tier;
  }
}

const isCommon = (kind: Gem['kind']): kind is GemKind => (GEM_KINDS as readonly string[]).includes(kind);

export function gemName(g: Gem): string {
  return isCommon(g.kind) ? `${GEMS[g.kind].name} ${tierName(g.tier)}` : LEGENDARY[g.kind].name;
}

export function gemIcon(g: Gem): string {
  return isCommon(g.kind) ? GEMS[g.kind].icon : LEGENDARY[g.kind].icon;
}

export function gemColor(g: Gem): string {
  return isCommon(g.kind) ? GEMS[g.kind].color : LEGENDARY[g.kind].color;
}

export function gemText(g: Gem): string {
  if (!isCommon(g.kind)) return LEGENDARY[g.kind].text;
  const v = gemValue(g.kind, g.tier);
  return g.kind === 'safira' ? `+${v} de ${GEMS.safira.stat}` : `+${Math.round(v * 100)}% de ${GEMS[g.kind].stat}`;
}

export interface GemBonus {
  /** Frações somadas (0,16 = +16%). */
  power: number;
  hp: number;
  defense: number;
  crit: number;
  /** Pontos de carga. */
  charge: number;
  legendary: Set<LegendaryKind>;
}

export const CRIT_CAP = 0.6;

export function gemBonus(gems: readonly (Gem | null)[]): GemBonus {
  const out: GemBonus = { power: 0, hp: 0, defense: 0, crit: 0, charge: 0, legendary: new Set() };
  for (const g of gems) {
    if (!g) continue;
    if (!isCommon(g.kind)) { out.legendary.add(g.kind); continue; }
    const v = gemValue(g.kind, g.tier);
    if (g.kind === 'rubi') out.power += v;
    else if (g.kind === 'safira') out.charge += v;
    else if (g.kind === 'esmeralda') out.hp += v;
    else if (g.kind === 'ametista') out.defense += v;
    else out.crit += v;
  }
  out.crit = Math.min(CRIT_CAP, out.crit);
  return out;
}

/** Bônus de uma fusão: média dos números dos dois e soma dos efeitos lendários (a sinergia é o prêmio da fusão). */
export function mergeBonus(list: readonly GemBonus[]): GemBonus {
  const n = Math.max(1, list.length);
  const avg = (f: (b: GemBonus) => number) => list.reduce((s, b) => s + f(b), 0) / n;
  return {
    power: avg((b) => b.power),
    hp: avg((b) => b.hp),
    defense: avg((b) => b.defense),
    crit: Math.min(CRIT_CAP, avg((b) => b.crit)),
    charge: Math.round(avg((b) => b.charge)),
    legendary: new Set(list.flatMap((b) => [...b.legendary])),
  };
}

/** Grau base de uma gema achada no andar `depth`: sobe um a cada 6 andares, com 25% de chance de vir um acima. */
export function rollTier(rng: Rng, depth: number): number {
  return 1 + Math.floor((Math.max(1, depth) - 1) / 6) + (rng() < 0.25 ? 1 : 0);
}

export function rollGem(rng: Rng, depth: number, id: number, legendaryChance: number): Gem {
  if (rng() < legendaryChance) {
    const kind = LEGENDARY_KINDS[Math.floor(rng() * LEGENDARY_KINDS.length)]!;
    return { id, kind, tier: 1, legendary: true };
  }
  const kind = GEM_KINDS[Math.floor(rng() * GEM_KINDS.length)]!;
  return { id, kind, tier: rollTier(rng, depth), legendary: false };
}

/** Chance de gema lendária num baú do andar `depth` (cresce devagar, até 20%). */
export function chestLegendaryChance(depth: number): number {
  return Math.min(0.2, 0.04 + depth * 0.006);
}

/** Grupos que já podem ser lapidados (3 comuns do mesmo tipo e grau). */
export function polishable(bag: readonly Gem[]): { kind: GemKind; tier: number; count: number }[] {
  const groups = new Map<string, { kind: GemKind; tier: number; count: number }>();
  for (const g of bag) {
    if (!isCommon(g.kind)) continue;
    const k = `${g.kind}:${g.tier}`;
    const cur = groups.get(k) ?? { kind: g.kind, tier: g.tier, count: 0 };
    cur.count++;
    groups.set(k, cur);
  }
  return [...groups.values()].filter((x) => x.count >= 3).sort((a, b) => a.kind.localeCompare(b.kind) || a.tier - b.tier);
}
