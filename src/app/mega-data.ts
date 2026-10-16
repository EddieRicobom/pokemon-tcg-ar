import type { SpriteSource } from '../ar/sprite-source';
import { MEGA_ENERGY_COST, parseMegaName, pickMegaVariety } from '../core/mega';
import type { MegaForm } from '../core/mega';
import type { PokemonProfile } from '../core/pokemon-data';
import { getJson, POKEAPI } from './pokemon-data-service';
import type { BattleDataDeps } from './pokemon-data-service';

type Deps = Pick<BattleDataDeps, 'fetchImpl' | 'timeoutMs'> & { storage?: Pick<Storage, 'getItem' | 'setItem'> | null };

const key = (dex: number, variant: string | null) => `tcg-ar-mega-v1:${dex}:${variant ?? '-'}`;

function readForm(storage: Deps['storage'], k: string): MegaForm | null {
  try {
    const raw = storage?.getItem(k);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<MegaForm>;
    return typeof v.formId === 'number' && v.formId >= 10000 && typeof v.formName === 'string' ? { formId: v.formId, formName: v.formName } : null;
  } catch {
    return null;
  }
}

/**
 * Acha a forma Mega de uma espécie na PokéAPI (`/pokemon-species/{id}` lista as variedades; a Mega termina em `-mega`,
 * `-mega-x` ou `-mega-y`). O id da forma (≥ 10000) é o que o sprite do Showdown e `/pokemon/{id}` usam.
 * Devolve null quando a espécie não tem Mega (ou tem duas e a carta não diz qual): nunca escolhe uma ao acaso.
 * Falha de rede lança, para quem chama dizer o motivo.
 */
export async function resolveMegaForm(baseDexId: number, variant: 'x' | 'y' | null, deps: Deps = {}): Promise<MegaForm | null> {
  const k = key(baseDexId, variant);
  const cached = readForm(deps.storage, k);
  if (cached) return cached;
  const json = await getJson(`${POKEAPI}/pokemon-species/${baseDexId}`, deps);
  const varieties: { name: string; url: string }[] = [];
  const list = (json as { varieties?: unknown }).varieties;
  if (Array.isArray(list)) {
    for (const item of list) {
      const pokemon = (item as { pokemon?: { name?: unknown; url?: unknown } } | null)?.pokemon;
      if (pokemon && typeof pokemon.name === 'string' && typeof pokemon.url === 'string') varieties.push({ name: pokemon.name, url: pokemon.url });
    }
  }
  const chosen = pickMegaVariety(varieties, variant);
  if (!chosen) return null;
  const id = /\/pokemon\/(\d+)\/?$/.exec(chosen.url)?.[1];
  const formId = id ? Number.parseInt(id, 10) : NaN;
  if (!Number.isFinite(formId) || formId < 10000) return null;
  const form = { formId, formName: chosen.name };
  try {
    deps.storage?.setItem(k, JSON.stringify(form));
  } catch {
    /* sem espaço ou bloqueado: segue sem guardar */
  }
  return form;
}

export interface MegaReady {
  cardId: string;
  form: MegaForm;
  /** Tipos e atributos da forma Mega. */
  profile: PokemonProfile;
  sprite: SpriteSource;
}

export type MegaPrepared = { ok: true; ready: MegaReady } | { ok: false; reason: string };

export interface MegaPrepareDeps {
  resolve: (baseDexId: number, variant: 'x' | 'y' | null) => Promise<MegaForm | null>;
  loadProfile: (formId: number) => Promise<PokemonProfile | null>;
  fetchSprite: (formId: number, shiny: boolean) => Promise<SpriteSource | null>;
}

/** Motivo curto de uma falha, em português (os erros do navegador vêm em inglês: "Failed to fetch"). */
function failure(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (!message || /fetch|network|offline|load failed|abort/i.test(message)) return 'sem conexão';
  return message;
}

const reason = (name: string, why: string) => `${name}: ${why} Luta na forma normal e não gasta moedas.`;

/**
 * Deixa tudo pronto para a forma Mega de uma carta ANTES de cobrar as moedas: espécie e forma, tipos/atributos e o sprite.
 * Se qualquer coisa faltar, devolve o motivo e a carta luta na forma normal (nada é inventado nem cobrado).
 */
export async function prepareMegaForm(
  card: { id: string; name: string; baseDexId: number | undefined; shiny?: boolean },
  deps: MegaPrepareDeps,
): Promise<MegaPrepared> {
  const parsed = parseMegaName(card.name);
  if (card.baseDexId === undefined) return { ok: false, reason: reason(card.name, 'a carta não tem número da Pokédex.') };
  let form: MegaForm | null;
  try {
    form = await deps.resolve(card.baseDexId, parsed?.variant ?? null);
  } catch (error) {
    return { ok: false, reason: reason(card.name, `não consegui consultar a forma Mega (${failure(error)}).`) };
  }
  if (!form) return { ok: false, reason: reason(card.name, 'não achei a forma Mega deste Pokémon na PokéAPI.') };
  let profile: PokemonProfile | null = null;
  let sprite: SpriteSource | null = null;
  try {
    [profile, sprite] = await Promise.all([deps.loadProfile(form.formId), deps.fetchSprite(form.formId, card.shiny === true)]);
  } catch (error) {
    return { ok: false, reason: reason(card.name, `não consegui baixar a forma Mega (${failure(error)}).`) };
  }
  if (!profile) return { ok: false, reason: reason(card.name, 'a PokéAPI não devolveu os atributos da forma Mega.') };
  if (!sprite) return { ok: false, reason: reason(card.name, 'a forma Mega não tem sprite disponível.') };
  return { ok: true, ready: { cardId: card.id, form, profile, sprite } };
}

/** Quantas trocas de forma as moedas pagam, e quantas ficam sem. `wanted` = quantos Mega o jogador marcou. */
export function planMegaEvolutions(wanted: number, energy: number, cost = MEGA_ENERGY_COST): { afford: number; skipped: number; total: number } {
  const want = Math.max(0, Math.floor(wanted));
  const afford = Math.min(want, cost > 0 ? Math.max(0, Math.floor(energy / cost)) : want);
  return { afford, skipped: want - afford, total: afford * cost };
}
