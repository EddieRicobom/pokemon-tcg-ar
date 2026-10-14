import { parseCardBattleInfo, parseGameMove, parsePokeApiProfile, pickLevelUpMoves } from '../core/pokemon-data';
import type { CardBattleInfo, GameMove, PokemonProfile } from '../core/pokemon-data';

export const POKEAPI = 'https://pokeapi.co/api/v2';

/** Estado de cada fonte, independente das outras: uma falha não derruba as demais. */
export type Part<T> = { state: 'loading' } | { state: 'ok'; value: T } | { state: 'error'; message: string };
export type PartName = 'profile' | 'moves' | 'card';

export interface BattleData {
  profile: Part<PokemonProfile>;
  moves: Part<GameMove[]>;
  card: Part<CardBattleInfo>;
}

export function emptyBattleData(): BattleData {
  return { profile: { state: 'loading' }, moves: { state: 'loading' }, card: { state: 'loading' } };
}

export interface BattleDataDeps {
  fetchImpl?: typeof fetch;
  /** localStorage (ou falso nos testes). Os dados dos jogos e da carta quase não mudam, então ficam guardados. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Carta completa do TCGdex (`TcgdexClient.getCard`). */
  getCard: (id: string) => Promise<unknown | null>;
  timeoutMs?: number;
}

export interface BattleRequest {
  cardId: string;
  dexId: number | undefined;
}

type Notify = <K extends PartName>(part: K, result: BattleData[K]) => void;

const KEYS = {
  profile: (dex: number) => `tcg-ar-profile-v1:${dex}`,
  moves: (dex: number) => `tcg-ar-moves-v1:${dex}`,
  card: (id: string) => `tcg-ar-card-battle-v1:${id}`,
};

function readCache<T>(storage: BattleDataDeps['storage'], key: string, valid: (value: unknown) => value is T): T | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value : null;
  } catch {
    return null;
  }
}

function writeCache(storage: BattleDataDeps['storage'], key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* sem espaço ou bloqueado: segue sem guardar */
  }
}

const isProfile = (v: unknown): v is PokemonProfile =>
  typeof v === 'object' && v !== null && 'stats' in v && 'types' in v && Array.isArray((v as PokemonProfile).types);
/** Perfil guardado: sem peso na resposta vira 0 ("já consultado, sem peso"), para não consultar de novo a cada vez. */
const withWeightChecked = (profile: PokemonProfile): PokemonProfile => ({ ...profile, weightKg: profile.weightKg ?? 0 });
const isMoves = (v: unknown): v is GameMove[] => Array.isArray(v);
const isCardInfo = (v: unknown): v is CardBattleInfo =>
  typeof v === 'object' && v !== null && Array.isArray((v as CardBattleInfo).attacks);

export async function getJson(url: string, deps: Pick<BattleDataDeps, 'fetchImpl' | 'timeoutMs'>): Promise<unknown> {
  const fetchImpl = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 10000);
    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (response.status === 404) throw new Error('não encontrado (404)');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as unknown;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.message.includes('404')) break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('falha de rede');
}

const describeError = (error: unknown): string => (error instanceof Error && error.message ? error.message : 'falha de rede');

async function loadGame(dexId: number | undefined, deps: BattleDataDeps, notify: Notify): Promise<void> {
  if (dexId === undefined) {
    const message = 'Esta carta não é de um Pokémon (sem número da Pokédex).';
    notify('profile', { state: 'error', message });
    notify('moves', { state: 'error', message });
    return;
  }
  const cachedProfile = readCache(deps.storage, KEYS.profile(dexId), isProfile);
  const cachedMoves = readCache(deps.storage, KEYS.moves(dexId), isMoves);
  if (cachedProfile) notify('profile', { state: 'ok', value: cachedProfile });
  if (cachedMoves) notify('moves', { state: 'ok', value: cachedMoves });
  // Perfil guardado antes de existir o peso (Pin Mode): serve para a batalha, mas é buscado de novo para ganhar o peso.
  const profileComplete = cachedProfile !== null && typeof cachedProfile.weightKg === 'number';
  if (profileComplete && cachedMoves) return;

  let pokemonJson: unknown;
  try {
    pokemonJson = await getJson(`${POKEAPI}/pokemon/${dexId}`, deps);
  } catch (error) {
    const message = `Não consegui os dados dos jogos (PokéAPI): ${describeError(error)}.`;
    if (!cachedProfile) notify('profile', { state: 'error', message });
    if (!cachedMoves) notify('moves', { state: 'error', message });
    return;
  }

  if (!profileComplete) {
    const profile = parsePokeApiProfile(pokemonJson, dexId);
    if (profile) {
      writeCache(deps.storage, KEYS.profile(dexId), withWeightChecked(profile));
      notify('profile', { state: 'ok', value: profile });
    } else if (cachedProfile) {
      // Sem o peso na resposta, fica com o perfil guardado.
    } else {
      notify('profile', { state: 'error', message: 'A PokéAPI respondeu sem os atributos deste Pokémon.' });
    }
  }

  if (!cachedMoves) {
    const refs = pickLevelUpMoves(pokemonJson);
    if (refs.length === 0) {
      notify('moves', { state: 'ok', value: [] });
      return;
    }
    const results = await Promise.allSettled(refs.map(async (ref) => parseGameMove(await getJson(ref.url, deps))));
    const moves = results.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
    if (moves.length === 0) {
      notify('moves', { state: 'error', message: 'Não consegui carregar os golpes (PokéAPI).' });
      return;
    }
    // Só guarda a lista completa: com falha parcial, tenta de novo na próxima vez.
    if (moves.length === refs.length) writeCache(deps.storage, KEYS.moves(dexId), moves);
    notify('moves', { state: 'ok', value: moves });
  }
}

async function loadCard(cardId: string, deps: BattleDataDeps, notify: Notify): Promise<void> {
  const cached = readCache(deps.storage, KEYS.card(cardId), isCardInfo);
  if (cached) {
    notify('card', { state: 'ok', value: cached });
    return;
  }
  try {
    const json = await deps.getCard(cardId);
    const info = parseCardBattleInfo(json);
    if (!info) {
      notify('card', { state: 'error', message: 'O TCGdex não devolveu os dados desta carta.' });
      return;
    }
    writeCache(deps.storage, KEYS.card(cardId), info);
    notify('card', { state: 'ok', value: info });
  } catch (error) {
    notify('card', { state: 'error', message: `Não consegui os ataques da carta (TCGdex): ${describeError(error)}.` });
  }
}

/**
 * Carrega, em paralelo, os atributos/tipos (PokéAPI), os golpes do jogo (PokéAPI) e os ataques da carta (TCGdex).
 * Cada parte avisa quando chega; nenhuma rejeita (falhas viram `error` na parte correspondente).
 */
export async function loadBattleData(request: BattleRequest, deps: BattleDataDeps, onPart: Notify): Promise<void> {
  await Promise.all([loadGame(request.dexId, deps, onPart), loadCard(request.cardId, deps, onPart)]);
}

/**
 * Só o perfil (tipos, atributos e peso) de um Pokémon, do aparelho ou da PokéAPI: é o que o Pin Mode usa.
 * Devolve null se não der (sem número da Pokédex, sem rede e sem cópia guardada): quem chama diz que falta dado.
 */
export async function loadProfile(dexId: number | undefined, deps: Pick<BattleDataDeps, 'fetchImpl' | 'storage' | 'timeoutMs'>): Promise<PokemonProfile | null> {
  if (dexId === undefined) return null;
  const full = deps as BattleDataDeps;
  const cached = readCache(deps.storage, KEYS.profile(dexId), isProfile);
  if (cached && typeof cached.weightKg === 'number') return cached;
  try {
    const profile = parsePokeApiProfile(await getJson(`${POKEAPI}/pokemon/${dexId}`, full), dexId);
    if (profile) {
      writeCache(deps.storage, KEYS.profile(dexId), withWeightChecked(profile));
      return profile;
    }
  } catch {
    // Cai no perfil guardado, se houver.
  }
  return cached;
}

/**
 * Só os ataques impressos na carta (TCGdex), do aparelho ou da rede. É o que dá os golpes do Pin Mode.
 * Devolve null se não der (sem rede e sem cópia guardada): o pin fica só com o disparo normal.
 */
export async function loadCardInfo(cardId: string, deps: Pick<BattleDataDeps, 'storage' | 'getCard'>): Promise<CardBattleInfo | null> {
  const cached = readCache(deps.storage, KEYS.card(cardId), isCardInfo);
  if (cached) return cached;
  try {
    const info = parseCardBattleInfo(await deps.getCard(cardId));
    if (info) writeCache(deps.storage, KEYS.card(cardId), info);
    return info;
  } catch {
    return null;
  }
}
