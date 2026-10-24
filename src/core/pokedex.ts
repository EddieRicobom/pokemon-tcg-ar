import { LAST_DEX } from './species-filter';

/**
 * Pokédex do jogador: registra cada **espécie** de Pokémon que ele já encontrou (não cartas: duas cartas do mesmo
 * Pokémon contam como uma espécie). Só guarda o que realmente apareceu no app: uma carta escaneada, um morador
 * da Vila, um adversário ou parceiro nos Pins, um inimigo na Torre. Nada é preenchido sozinho.
 */
export type DexSource = 'carta' | 'vila' | 'pins' | 'torre';
export const DEX_SOURCES: readonly DexSource[] = ['carta', 'vila', 'pins', 'torre'];
export const DEX_SOURCE_LABELS_PT: Record<DexSource, string> = {
  carta: 'Carta escaneada',
  vila: 'Mora na Vila',
  pins: 'Enfrentou nos Pins',
  torre: 'Enfrentou na Torre',
};

export interface DexEntry {
  /** Quando foi visto pela primeira vez (ms desde 1970). */
  first: number;
  /** Quantas vezes apareceu (cada partida ou corrida conta uma vez). */
  count: number;
  sources: DexSource[];
}

export interface PokedexState {
  version: 1;
  /** Chave = número da Pokédex nacional. */
  seen: Record<string, DexEntry>;
  /** Marcos de registro que já pagaram moedas. */
  claimed: number[];
}

/** Moedas por espécie nova e bônus por marco de registros (pago uma vez). */
export const DEX_COINS_PER_NEW = 10;
export const DEX_MILESTONES: readonly { count: number; coins: number }[] = [
  { count: 10, coins: 50 },
  { count: 25, coins: 120 },
  { count: 50, coins: 250 },
  { count: 100, coins: 500 },
  { count: 200, coins: 900 },
  { count: 400, coins: 1500 },
  { count: 800, coins: 3000 },
];

export function emptyPokedex(): PokedexState {
  return { version: 1, seen: {}, claimed: [] };
}

export function isDexId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= LAST_DEX;
}

/** Lê o que foi guardado, descartando qualquer coisa fora do formato (arquivo antigo, backup mexido à mão). */
export function normalizePokedex(raw: unknown): PokedexState {
  const out = emptyPokedex();
  if (!raw || typeof raw !== 'object') return out;
  const data = raw as Partial<PokedexState>;
  if (data.seen && typeof data.seen === 'object') {
    for (const [key, value] of Object.entries(data.seen)) {
      const id = Number(key);
      if (!isDexId(id) || !value || typeof value !== 'object') continue;
      const entry = value as Partial<DexEntry>;
      const sources = Array.isArray(entry.sources) ? entry.sources.filter((s): s is DexSource => DEX_SOURCES.includes(s as DexSource)) : [];
      out.seen[String(id)] = {
        first: typeof entry.first === 'number' && Number.isFinite(entry.first) ? entry.first : 0,
        count: typeof entry.count === 'number' && entry.count >= 1 ? Math.floor(entry.count) : 1,
        sources: [...new Set(sources)],
      };
    }
  }
  if (Array.isArray(data.claimed)) out.claimed = data.claimed.filter((n): n is number => typeof n === 'number' && DEX_MILESTONES.some((m) => m.count === n));
  return out;
}

export function seenCount(dex: PokedexState): number {
  return Object.keys(dex.seen).length;
}

export function hasSeen(dex: PokedexState, dexId: number): boolean {
  return dex.seen[String(dexId)] !== undefined;
}

export interface SightingResult {
  dex: PokedexState;
  /** Espécies vistas pela primeira vez agora. */
  added: number[];
  /** Marcos que acabaram de ser atingidos. */
  milestones: { count: number; coins: number }[];
  /** Total de moedas a pagar (espécies novas + marcos). */
  coins: number;
}

/** Registra as espécies vistas (repetidas na lista contam uma vez). Não altera o objeto recebido. */
export function registerSightings(dex: PokedexState, dexIds: readonly number[], source: DexSource, now: number): SightingResult {
  const unique = [...new Set(dexIds.filter(isDexId))];
  const seen = { ...dex.seen };
  const added: number[] = [];
  for (const id of unique) {
    const key = String(id);
    const current = seen[key];
    if (current) {
      seen[key] = { ...current, count: current.count + 1, sources: current.sources.includes(source) ? current.sources : [...current.sources, source] };
    } else {
      seen[key] = { first: now, count: 1, sources: [source] };
      added.push(id);
    }
  }
  const total = Object.keys(seen).length;
  const milestones = DEX_MILESTONES.filter((m) => total >= m.count && !dex.claimed.includes(m.count));
  const next: PokedexState = { version: 1, seen, claimed: [...dex.claimed, ...milestones.map((m) => m.count)] };
  const coins = added.length * DEX_COINS_PER_NEW + milestones.reduce((sum, m) => sum + m.coins, 0);
  return { dex: next, added, milestones, coins };
}

/** Faixa da Pokédex nacional de cada geração, para filtrar a lista. */
export const DEX_GENERATIONS: readonly { label: string; from: number; to: number }[] = [
  { label: 'I', from: 1, to: 151 },
  { label: 'II', from: 152, to: 251 },
  { label: 'III', from: 252, to: 386 },
  { label: 'IV', from: 387, to: 493 },
  { label: 'V', from: 494, to: 649 },
  { label: 'VI', from: 650, to: 721 },
  { label: 'VII', from: 722, to: 809 },
  { label: 'VIII', from: 810, to: 905 },
  { label: 'IX', from: 906, to: LAST_DEX },
];

/** Quantas espécies de cada geração já foram vistas. */
export function generationProgress(dex: PokedexState): { label: string; seen: number; total: number }[] {
  return DEX_GENERATIONS.map((g) => {
    let seen = 0;
    for (let id = g.from; id <= g.to; id++) if (hasSeen(dex, id)) seen++;
    return { label: g.label, seen, total: g.to - g.from + 1 };
  });
}
