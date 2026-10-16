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
/** Nível de amizade mínimo pra evoluir (índice de `FRIEND_LEVELS`: 3 = "Grande amigo", já usado pros apelidos). */
export const EVOLVE_FRIEND_LEVEL = 3;
/** Quantas transações o histórico guarda (as mais antigas somem; o saldo nunca depende do histórico). */
const LEDGER_MAX = 40;

export interface EnergyTx {
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
  source: 'presente' | 'fonte' | 'evolucao';
  /** ISO. */
  grantedAt: string;
  /** 0 = forma recebida; sobe 1 a cada evolução. */
  stage: number;
}

export interface DigitalState {
  energy: number;
  ledger: EnergyTx[];
  instances: DigitalPokemonInstance[];
  /** O presente inicial já foi dado (só um por perfil, mesmo recarregando ou reabrindo o questionário). */
  starterGiven: boolean;
}

export function emptyDigital(): DigitalState {
  return { energy: 0, ledger: [], instances: [], starterGiven: false };
}

/** Converte dados salvos (possivelmente de uma versão antiga ou corrompidos) num `DigitalState` válido. */
export function normalizeDigital(raw: unknown): DigitalState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<DigitalState>;
  const energy = typeof r.energy === 'number' && Number.isFinite(r.energy) && r.energy >= 0 ? Math.floor(r.energy) : 0;
  const ledger = Array.isArray(r.ledger)
    ? r.ledger.filter((t): t is EnergyTx => !!t && typeof t === 'object' && (t.type === 'ganho' || t.type === 'gasto') && typeof t.amount === 'number').slice(-LEDGER_MAX)
    : [];
  const instances = Array.isArray(r.instances)
    ? r.instances.filter((i): i is DigitalPokemonInstance => !!i && typeof i === 'object' && typeof i.instanceId === 'string' && typeof i.dexId === 'number' && i.isDigitalPokemon === true)
    : [];
  return { energy, ledger, instances, starterGiven: r.starterGiven === true };
}

export function isDigitalInstanceId(id: string): boolean {
  return id.startsWith('dp_');
}

function makeInstanceId(s: DigitalState, dexId: number, now: string): string {
  return `dp_${now.replace(/[^0-9]/g, '')}_${dexId}_${s.instances.length}`;
}

/** Ganha energia por uma atividade real do app (Survivor, minigame, Vila...); `amount` precisa ser positivo. */
export function earnEnergy(s: DigitalState, amount: number, reason: string, now: string): DigitalState {
  if (!(amount > 0)) return s;
  const energy = s.energy + Math.floor(amount);
  const tx: EnergyTx = { type: 'ganho', amount: Math.floor(amount), reason, at: now, balanceAfter: energy };
  return { ...s, energy, ledger: [...s.ledger, tx].slice(-LEDGER_MAX) };
}

function trySpend(s: DigitalState, amount: number, reason: string, now: string, instanceId?: string): DigitalState | null {
  if (amount > s.energy) return null;
  const energy = s.energy - amount;
  const tx: EnergyTx = { type: 'gasto', amount, reason, at: now, instanceId, balanceAfter: energy };
  return { ...s, energy, ledger: [...s.ledger, tx].slice(-LEDGER_MAX) };
}

export function canAffordSummon(s: DigitalState): boolean {
  return s.energy >= SUMMON_COST;
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

/** Invoca na Fonte por 500 energias; null se não tiver saldo. A operação é atômica: ou gasta e recebe, ou nada muda. */
export function summon(s: DigitalState, species: SpeciesRef, now: string): DigitalState | null {
  const spent = trySpend(s, SUMMON_COST, 'fonte', now);
  if (!spent) return null;
  const instance: DigitalPokemonInstance = {
    instanceId: makeInstanceId(spent, species.dexId, now),
    originCardId: species.cardId,
    dexId: species.dexId,
    name: species.name,
    isDigitalPokemon: true,
    source: 'fonte',
    grantedAt: now,
    stage: 0,
  };
  return { ...spent, instances: [...spent.instances, instance] };
}

/** As 3 condições da evolução (todas obrigatórias): 1000 energias, amizade nível 3+, e uma próxima forma real. */
export function canEvolve(s: DigitalState, instanceId: string, friendshipLevel: number, hasNextForm: boolean): boolean {
  return hasNextForm && friendshipLevel >= EVOLVE_FRIEND_LEVEL && s.energy >= EVOLVE_COST && s.instances.some((i) => i.instanceId === instanceId);
}

/** Evolui a instância para `next` (forma real, já resolvida por quem chamou); null se alguma condição falhar. */
export function evolve(s: DigitalState, instanceId: string, friendshipLevel: number, next: SpeciesRef, now: string): DigitalState | null {
  if (!canEvolve(s, instanceId, friendshipLevel, true)) return null;
  const spent = trySpend(s, EVOLVE_COST, 'evolucao', now, instanceId);
  if (!spent) return null;
  const instances = spent.instances.map((i) =>
    i.instanceId === instanceId ? { ...i, dexId: next.dexId, name: next.name, originCardId: next.cardId, stage: i.stage + 1, source: 'evolucao' as const } : i,
  );
  return { ...spent, instances };
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
