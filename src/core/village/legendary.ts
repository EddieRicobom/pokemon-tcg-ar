import type { Rng } from '../battle';

/**
 * Encontros lendários raríssimos na Vila. Uma "oportunidade de sorteio" é a primeira vez que você abre a Vila em
 * cada dia do calendário do aparelho (nunca mais de uma por dia, nunca a cada abrir/fechar) — por isso o estado
 * guarda `lastRollDay`, não um relógio. Chance-base de 0,1% por oportunidade (`BASE_CHANCE`), com peso por
 * lendário. Arquitetura extensível: cada lendário é uma entrada de dados em `LEGENDARIES` (sprite real por dexId,
 * efeito, bônus, consequência, falas) — adicionar um novo é só acrescentar uma entrada, sem mexer no motor.
 * Função pura, sem UI — a cutscene fica em `VillageView.vue`.
 */

export type LegendaryEffectKind = 'clima' | 'tempo' | 'tempestade';

export interface LegendaryDef {
  id: string;
  /** Número real da Pokédex (nunca inventado). */
  dexId: number;
  name: string;
  /** Peso relativo no sorteio entre os lendários elegíveis (não afeta a chance-base de aparecer). */
  weight: number;
  effect: LegendaryEffectKind;
  /** Falas curtas da cutscene, nessa ordem. */
  lines: readonly string[];
  /** O que a aparição traz de bom (efeito temporário/registro). */
  boon: string;
  /** O lado difícil/estranho da aparição (nunca apaga progresso). */
  consequence: string;
}

export const LEGENDARIES: readonly LegendaryDef[] = [
  {
    id: 'suicune',
    dexId: 245,
    name: 'Suicune',
    weight: 1,
    effect: 'clima',
    lines: [
      'O vento para. A praça fica em silêncio.',
      'Da direção do lago, uma silhueta azul atravessa a água sem fazer uma onda.',
      'Suicune te encara por um instante — e some na chuva que começa a cair.',
    ],
    boon: 'Chuva calma cai sobre a Vila pelo resto do dia: a horta cresce mais rápido.',
    consequence: 'Os Pokémon ficam mais quietos hoje, meio encantados — conversam menos que o normal.',
  },
  {
    id: 'zapdos',
    dexId: 145,
    name: 'Zapdos',
    weight: 1,
    effect: 'tempestade',
    lines: [
      'O céu escurece de repente, mesmo sem nuvem nenhuma.',
      'Um raio corta o ar e, no clarão, uma ave elétrica gigante sobrevoa a praça.',
      'Zapdos solta um grito que ecoa — e desaparece entre relâmpagos.',
    ],
    boon: 'O ar da Vila fica "carregado": as moedas rendem um pouco mais pelas próximas horas.',
    consequence: 'As luzes da cidade piscam a noite toda — nada grave, só um susto a cada tanto.',
  },
  {
    id: 'celebi',
    dexId: 251,
    name: 'Celebi',
    weight: 1,
    effect: 'tempo',
    lines: [
      'Por um segundo, tudo ao redor parece "tremer", como um quadro atrasando.',
      'Uma luz verde gira entre as árvores da praça, deixando rastros de folhas no ar.',
      'Celebi aparece, observa a Vila crescer com curiosidade — e volta a sumir no tempo.',
    ],
    boon: 'Um lampejo do futuro: o Diário ganha uma página especial, só desse dia.',
    consequence: 'Pelo resto do dia, o tempo na Vila parece "pular" — animações ficam um pouco mais rápidas.',
  },
];

/** Chance-base por oportunidade de sorteio (0,1%). Ajustável depois de testes de balanceamento. */
export const BASE_CHANCE = 0.001;
/** Quantos encontros o histórico guarda (os mais antigos somem; não afeta o sorteio). */
const HISTORY_MAX = 20;

export interface LegendaryEncounter {
  id: string;
  /** ISO. */
  at: string;
}

export interface LegendaryState {
  history: LegendaryEncounter[];
  /** Quantas oportunidades de sorteio já aconteceram (mesmo as que não deram nada) — não reseta. */
  attempts: number;
  /** Dia (YYYY-MM-DD) do último sorteio feito, pra nunca sortear duas vezes no mesmo dia. */
  lastRollDay: string;
  /** Lendário aparecendo agora, até o jogador ver a cutscene (ver `VillageView.vue`). */
  active: { id: string } | null;
}

export function emptyLegendary(): LegendaryState {
  return { history: [], attempts: 0, lastRollDay: '', active: null };
}

export function normalizeLegendary(raw: unknown): LegendaryState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<LegendaryState>;
  const ids = new Set(LEGENDARIES.map((l) => l.id));
  return {
    history: Array.isArray(r.history) ? r.history.filter((e): e is LegendaryEncounter => !!e && typeof e.id === 'string' && typeof e.at === 'string').slice(-HISTORY_MAX) : [],
    attempts: typeof r.attempts === 'number' && r.attempts >= 0 ? Math.floor(r.attempts) : 0,
    lastRollDay: typeof r.lastRollDay === 'string' ? r.lastRollDay : '',
    active: r.active && typeof r.active === 'object' && typeof r.active.id === 'string' && ids.has(r.active.id) ? { id: r.active.id } : null,
  };
}

export function legendaryOf(id: string): LegendaryDef | undefined {
  return LEGENDARIES.find((l) => l.id === id);
}

export interface RollResult {
  state: LegendaryState;
  legendary: LegendaryDef | null;
}

/**
 * Uma oportunidade de sorteio (no máximo uma por `day`, veja o comentário do arquivo). Se já rolou hoje ou se um
 * encontro já está ativo esperando o jogador ver a cutscene, não sorteia de novo (evita manipular reabrindo a Vila).
 */
export function rollLegendary(s: LegendaryState, rng: Rng, day: string, now: string): RollResult {
  if (s.lastRollDay === day || s.active) return { state: s, legendary: null };
  const attempts = s.attempts + 1;
  const base: LegendaryState = { ...s, attempts, lastRollDay: day };
  if (rng() >= BASE_CHANCE) return { state: base, legendary: null };
  const totalWeight = LEGENDARIES.reduce((sum, l) => sum + l.weight, 0);
  let roll = rng() * totalWeight;
  let chosen = LEGENDARIES[0]!;
  for (const l of LEGENDARIES) {
    if (roll < l.weight) {
      chosen = l;
      break;
    }
    roll -= l.weight;
  }
  const history = [...s.history, { id: chosen.id, at: now }].slice(-HISTORY_MAX);
  return { state: { ...base, history, active: { id: chosen.id } }, legendary: chosen };
}

/** Fecha a cutscene ativa (o jogador já viu); o encontro já ficou registrado no histórico ao sortear. */
export function dismissActive(s: LegendaryState): LegendaryState {
  return s.active ? { ...s, active: null } : s;
}
