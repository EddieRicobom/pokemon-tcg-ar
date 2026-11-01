import { GEM_KINDS, LEGENDARY_KINDS } from '../core/dungeon-gems';

/**
 * Provocações e avisos de buff entre os dois celulares (genérico: o Survival PvP pode reaproveitar). Nada de texto livre:
 * a provocação é o id de uma lista fixa e o aviso de buff leva só o tipo, o id e a raridade vindos das regras do jogo; o
 * texto que aparece é montado por quem recebe. Tudo o que chega é validado aqui, e os dois lados limitam a frequência.
 */

export const TAUNTS = [
  { id: 'sorte', text: 'Boa sorte!' },
  { id: 'vem', text: 'Vem!' },
  { id: 'consegue', text: 'Você consegue!' },
  { id: 'ops', text: 'Ops!' },
  { id: 'boa', text: 'Boa jogada!' },
  { id: 'calma', text: 'Calma aí…' },
] as const;
export type TauntId = (typeof TAUNTS)[number]['id'];

/** Recarga entre duas provocações de quem envia. */
export const TAUNT_COOLDOWN_MS = 3000;
/** Quem recebe ignora provocações mais próximas que isto (mesmo que o outro celular não respeite a recarga). */
export const TAUNT_ACCEPT_MS = 1500;

export const isTauntId = (v: unknown): v is TauntId => typeof v === 'string' && TAUNTS.some((t) => t.id === v);
export const tauntText = (id: TauntId): string => TAUNTS.find((t) => t.id === id)!.text;

/** Passou a recarga desde a última provocação enviada? (`last` = 0 quando ainda não enviou.) */
export const canTaunt = (last: number, now: number): boolean => last <= 0 || now - last >= TAUNT_COOLDOWN_MS || now < last;
export const acceptTaunt = (last: number, now: number): boolean => last <= 0 || now - last >= TAUNT_ACCEPT_MS || now < last;
/** Segundos que faltam para poder provocar de novo (0 = já pode). */
export const tauntWait = (last: number, now: number): number => (canTaunt(last, now) ? 0 : Math.ceil((TAUNT_COOLDOWN_MS - (now - last)) / 1000));

export type BuffKind = 'gem' | 'potion' | 'fusion' | 'weapon';
export type BuffRarity = 'comum' | 'raro' | 'lendario';
export const BUFF_KINDS: readonly BuffKind[] = ['gem', 'potion', 'fusion', 'weapon'];
export const BUFF_RARITIES: readonly BuffRarity[] = ['comum', 'raro', 'lendario'];

export type TauntMessage =
  | { t: 'taunt'; id: TauntId }
  /** `id`: tipo da gema ou id da arma (vazio nos itens sem id); `rarity` sai das regras (`buffRarity`). */
  | { t: 'buff-event'; kind: BuffKind; id: string; rarity: BuffRarity };

/** Raridade de uma gema pelas regras: lendária, ou comum de grau 3 em diante (raro). */
export function buffRarity(kind: BuffKind, gem?: { legendary: boolean; tier: number }): BuffRarity {
  if (kind === 'gem' && gem) return gem.legendary ? 'lendario' : gem.tier >= 3 ? 'raro' : 'comum';
  return 'comum';
}

const ID = /^[a-z0-9-]{0,24}$/;

/** Lê `taunt` e `buff-event` já decodificadas do JSON. Devolve null para qualquer coisa fora do formato. */
export function parseTauntMessage(v: Record<string, unknown>): TauntMessage | null {
  if (v.t === 'taunt') return isTauntId(v.id) ? { t: 'taunt', id: v.id } : null;
  if (v.t !== 'buff-event') return null;
  const { kind, id, rarity } = v;
  if (typeof kind !== 'string' || !(BUFF_KINDS as readonly string[]).includes(kind)) return null;
  if (typeof rarity !== 'string' || !(BUFF_RARITIES as readonly string[]).includes(rarity)) return null;
  if (typeof id !== 'string' || !ID.test(id)) return null;
  if (kind === 'gem') {
    // A raridade tem de combinar com a gema: lendária é sempre «lendario» e comum nunca é.
    const legendary = (LEGENDARY_KINDS as readonly string[]).includes(id);
    if (!legendary && !(GEM_KINDS as readonly string[]).includes(id)) return null;
    if (legendary !== (rarity === 'lendario')) return null;
  } else if (kind === 'weapon') {
    if (id.length === 0 || rarity !== 'comum') return null;
  } else if (id !== '' || rarity !== 'comum') return null;
  return { t: 'buff-event', kind: kind as BuffKind, id, rarity: rarity as BuffRarity };
}
