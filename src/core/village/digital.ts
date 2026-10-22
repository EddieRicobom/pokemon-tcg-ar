import type { Rng } from '../battle';

/**
 * Digital Pokémon: um companheiro digital que o jogador recebe (presente inicial ou invocado na Fonte), baseado
 * numa carta real do catálogo, mas sem ser a carta física em si — nunca pode virar alvo de scan/AR (ver
 * `isDigitalPokemon` nos lugares que montam a lista de quem pode ser escaneado). A amizade reaproveita o sistema
 * já existente da Vila (`core/village/life.ts`, `friendOf`/`friendLevel`), usando `instanceId` como a chave —
 * nenhum sistema de amizade novo foi criado. Tudo aqui é puro e testável; a tela fica em `VillageView.vue`.
 */

export const SUMMON_COST = 500;
export const EVOLVE_COST = 1000;
/** Nível de amizade mínimo pra evoluir (índice de `FRIEND_LEVELS`: 3 = "Grande amigo"). */
export const EVOLVE_FRIEND_LEVEL = 3;
/** Quantas transações o histórico guarda (as mais antigas somem; o saldo nunca depende do histórico). */
const LEDGER_MAX = 40;

/** Um gasto (ou ganho) de moedas na Fonte, para o histórico. O saldo em si mora na carteira (`app/wallet.ts`). */
export interface CoinTx {
  type: 'ganho' | 'gasto';
  amount: number;
  reason: string;
  /** ISO. */
  at: string;
  instanceId?: string;
  balanceAfter: number;
}

export interface DigitalPokemonInstance {
  instanceId: string;
  /** Carta real do catálogo usada como origem (imagem e dados) — nunca inventada. */
  originCardId: string;
  dexId: number;
  name: string;
  readonly isDigitalPokemon: true;
  source: 'presente' | 'fonte' | 'evolucao' | 'sobrevivencia';
  /** ISO. */
  grantedAt: string;
  /** 0 = forma recebida; sobe 1 a cada evolução. */
  stage: number;
}

export interface DigitalState {
  /** Histórico das moedas gastas na Fonte (invocar, evoluir). Desde a unificação o saldo é só de moedas. */
  ledger: CoinTx[];
  instances: DigitalPokemonInstance[];
  /** O presente inicial já foi dado (só um por perfil, mesmo recarregando ou reabrindo o questionário). */
  starterGiven: boolean;
  /** A cutscene da primeira entrada (Fase 4) já foi vista — não aparece de novo. */
  introSeen: boolean;
  /** O mini tutorial dos Digital Pokémon (mostrado uma vez, ao receber o presente inicial) já foi visto. */
  tutorialSeen: boolean;
}

export function emptyDigital(): DigitalState {
  return { ledger: [], instances: [], starterGiven: false, introSeen: false, tutorialSeen: false };
}

/** Converte dados salvos (possivelmente de uma versão antiga ou corrompidos) num `DigitalState` válido. */
export function normalizeDigital(raw: unknown): DigitalState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<DigitalState>;
  // A energia antiga da Fonte (antes da unificação) é descartada, por escolha do dono: vale só o saldo de moedas.
  const ledger = Array.isArray(r.ledger)
    ? r.ledger.filter((t): t is CoinTx => !!t && typeof t === 'object' && (t.type === 'ganho' || t.type === 'gasto') && typeof t.amount === 'number').slice(-LEDGER_MAX)
    : [];
  const instances = Array.isArray(r.instances)
    ? r.instances.filter((i): i is DigitalPokemonInstance => !!i && typeof i === 'object' && typeof i.instanceId === 'string' && typeof i.dexId === 'number' && i.isDigitalPokemon === true)
    : [];
  return {
    ledger,
    instances,
    starterGiven: r.starterGiven === true,
    introSeen: r.introSeen === true,
    tutorialSeen: r.tutorialSeen === true,
  };
}

export function isDigitalInstanceId(id: string): boolean {
  return id.startsWith('dp_');
}

function makeInstanceId(s: DigitalState, dexId: number, now: string): string {
  return `dp_${now.replace(/[^0-9]/g, '')}_${dexId}_${s.instances.length}`;
}

/** Gasta moedas na Fonte e registra no histórico; null (nada muda) se faltar. Devolve o estado e as moedas que sobram. */
function trySpend(s: DigitalState, coins: number, amount: number, reason: string, now: string, instanceId?: string): { state: DigitalState; coins: number } | null {
  if (amount > coins) return null;
  const left = coins - amount;
  const tx: CoinTx = { type: 'gasto', amount, reason, at: now, instanceId, balanceAfter: left };
  return { state: { ...s, ledger: [...s.ledger, tx].slice(-LEDGER_MAX) }, coins: left };
}

export function canAffordSummon(coins: number): boolean {
  return coins >= SUMMON_COST;
}

/** Uma espécie real do catálogo (carta de origem já encontrada por quem chamou — nunca inventada aqui). */
export interface SpeciesRef {
  dexId: number;
  name: string;
  cardId: string;
}

/** O presente inicial: só funciona uma vez (`starterGiven`); null se já foi dado. */
export function grantStarter(s: DigitalState, species: SpeciesRef, now: string): DigitalState | null {
  if (s.starterGiven) return null;
  const instance: DigitalPokemonInstance = {
    instanceId: makeInstanceId(s, species.dexId, now),
    originCardId: species.cardId,
    dexId: species.dexId,
    name: species.name,
    isDigitalPokemon: true,
    source: 'presente',
    grantedAt: now,
    stage: 0,
  };
  return { ...s, starterGiven: true, instances: [...s.instances, instance] };
}

/**
 * Invocação "na sorte" por moedas (pedido do dono, para o futuro): qualquer espécie da Pokédex, não só os iniciais.
 * O código está pronto e testado, mas a opção fica DESLIGADA na Fonte até o dono pedir (`COIN_SUMMON_ENABLED`).
 */
export const COIN_SUMMON_COST = 700;
export const COIN_SUMMON_ENABLED = false;
/** Última espécie da Pokédex Nacional (Ger. IX) — o sorteio "qualquer um" vai de 1 até aqui. */
export const LAST_DEX_ID = 1025;

/** Sorteia o número de qualquer espécie (1..LAST_DEX_ID), evitando repetir uma já na coleção quando dá. */
export function pickAnySpecies(s: DigitalState, rng: Rng): number {
  const owned = new Set(s.instances.map((i) => i.dexId));
  for (let tries = 0; tries < 20; tries++) {
    const dexId = 1 + Math.floor(rng() * LAST_DEX_ID);
    if (!owned.has(dexId)) return dexId;
  }
  return 1 + Math.floor(rng() * LAST_DEX_ID);
}

/**
 * Invoca por moedas (espécie real já resolvida por quem chamou). Atômica: devolve o novo estado e as moedas que
 * sobram, ou null se faltar moeda — nesse caso nada muda. As moedas são da Vila, por isso entram e saem por aqui.
 */
export function summonWithCoins(s: DigitalState, coins: number, species: SpeciesRef, now: string): { state: DigitalState; coins: number } | null {
  const spent = trySpend(s, coins, COIN_SUMMON_COST, 'fonte-sorte', now);
  if (!spent) return null;
  const instance: DigitalPokemonInstance = {
    instanceId: makeInstanceId(spent.state, species.dexId, now),
    originCardId: species.cardId,
    dexId: species.dexId,
    name: species.name,
    isDigitalPokemon: true,
    source: 'fonte',
    grantedAt: now,
    stage: 0,
  };
  return { state: { ...spent.state, instances: [...spent.state.instances, instance] }, coins: spent.coins };
}

/** Invoca na Fonte por 500 moedas; null se não tiver saldo. A operação é atômica: ou gasta e recebe, ou nada muda. */
export function summon(s: DigitalState, coins: number, species: SpeciesRef, now: string): { state: DigitalState; coins: number } | null {
  const spent = trySpend(s, coins, SUMMON_COST, 'fonte', now);
  if (!spent) return null;
  const instance: DigitalPokemonInstance = {
    instanceId: makeInstanceId(spent.state, species.dexId, now),
    originCardId: species.cardId,
    dexId: species.dexId,
    name: species.name,
    isDigitalPokemon: true,
    source: 'fonte',
    grantedAt: now,
    stage: 0,
  };
  return { state: { ...spent.state, instances: [...spent.state.instances, instance] }, coins: spent.coins };
}

/** Recruta um Digital Pokémon encontrado numa Pokébola da Torre, sem custo de moedas. */
export function grantSurvival(s: DigitalState, species: SpeciesRef, now: string): DigitalState {
  const instance: DigitalPokemonInstance = {
    instanceId: makeInstanceId(s, species.dexId, now),
    originCardId: species.cardId,
    dexId: species.dexId,
    name: species.name,
    isDigitalPokemon: true,
    source: 'sobrevivencia',
    grantedAt: now,
    stage: 0,
  };
  return { ...s, instances: [...s.instances, instance] };
}

/** As 3 condições da evolução (todas obrigatórias): 1000 moedas, amizade nível 3+, e uma próxima forma real. */
export function canEvolve(s: DigitalState, coins: number, instanceId: string, friendshipLevel: number, hasNextForm: boolean): boolean {
  return hasNextForm && friendshipLevel >= EVOLVE_FRIEND_LEVEL && coins >= EVOLVE_COST && s.instances.some((i) => i.instanceId === instanceId);
}

/** Evolui a instância para `next` (forma real, já resolvida por quem chamou); null se alguma condição falhar. */
export function evolve(
  s: DigitalState, coins: number, instanceId: string, friendshipLevel: number, next: SpeciesRef, now: string,
): { state: DigitalState; coins: number } | null {
  if (!canEvolve(s, coins, instanceId, friendshipLevel, true)) return null;
  const spent = trySpend(s, coins, EVOLVE_COST, 'evolucao', now, instanceId);
  if (!spent) return null;
  const instances = spent.state.instances.map((i) =>
    i.instanceId === instanceId ? { ...i, dexId: next.dexId, name: next.name, originCardId: next.cardId, stage: i.stage + 1, source: 'evolucao' as const } : i,
  );
  return { state: { ...spent.state, instances }, coins: spent.coins };
}

export function instanceOf(s: DigitalState, instanceId: string): DigitalPokemonInstance | undefined {
  return s.instances.find((i) => i.instanceId === instanceId);
}

/** Pega uma espécie elegível pra Fonte entre `pool` (dexIds reais do catálogo), evitando repetir uma já na coleção quando dá. */
export function pickFonteSpecies<T extends { dexId: number }>(s: DigitalState, pool: readonly T[], rng: Rng): T | null {
  if (pool.length === 0) return null;
  const owned = new Set(s.instances.map((i) => i.dexId));
  const fresh = pool.filter((p) => !owned.has(p.dexId));
  const from = fresh.length > 0 ? fresh : pool;
  return from[Math.floor(rng() * from.length)] ?? null;
}

/** Uma linha da lista de cartas para um Digital Pokémon: aparece junto das cartas, mas marcado e sem scan (não tem carta física). */
export interface DigitalRow {
  instanceId: string;
  name: string;
  dexId: number;
  /** De onde veio, em português (presente inicial, Fonte, evolução). */
  origin: string;
  /** Data de chegada (DD/MM/AAAA). */
  since: string;
  originCardId: string;
  stage: number;
}

const SOURCE_PT: Record<DigitalPokemonInstance['source'], string> = {
  presente: 'Presente inicial',
  fonte: 'Invocado na Fonte',
  evolucao: 'Evoluiu na Fonte',
  sobrevivencia: 'Encontrado na Torre',
};

export function digitalRows(s: DigitalState): DigitalRow[] {
  return s.instances.map((i) => ({
    instanceId: i.instanceId,
    name: i.name,
    dexId: i.dexId,
    origin: SOURCE_PT[i.source] ?? 'Digital',
    since: typeof i.grantedAt === 'string' ? i.grantedAt.slice(0, 10).split('-').reverse().join('/') : '',
    originCardId: i.originCardId,
    stage: i.stage,
  }));
}
