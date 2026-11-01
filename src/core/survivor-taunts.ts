import type { SurvivorUpgradeRarity } from './survivor-types';

/**
 * Provocações do PvP do Survival: uma lista fixa de frases curtas (nunca texto livre), com recarga para não virar spam.
 * E o aviso de buff: quem pega uma carta de melhoria avisa o rival com o id e a raridade reais das regras.
 */

export const TAUNTS = [
  { id: 'boa-sorte', label: 'Boa sorte!' },
  { id: 'vem', label: 'Vem!' },
  { id: 'consegue', label: 'Você consegue!' },
  { id: 'ops', label: 'Ops!' },
  { id: 'boa-jogada', label: 'Boa jogada!' },
  { id: 'quase', label: 'Foi por pouco!' },
] as const;

export type TauntId = (typeof TAUNTS)[number]['id'];

/** Intervalo mínimo entre duas provocações enviadas por uma pessoa. */
export const TAUNT_COOLDOWN_MS = 3000;
/** Quem recebe ignora o que chega mais rápido que isto (um aparelho modificado não consegue inundar a tela). */
export const TAUNT_ACCEPT_MS = 1500;

const IDS = new Set<string>(TAUNTS.map((t) => t.id));
export const isTauntId = (v: unknown): v is TauntId => typeof v === 'string' && IDS.has(v);

export function tauntLabel(id: TauntId): string {
  return TAUNTS.find((t) => t.id === id)?.label ?? '';
}

/** Quanto falta (ms) para poder provocar de novo; 0 = já pode. */
export const tauntCooldownLeft = (lastSentAt: number, now: number): number => Math.max(0, Math.round(lastSentAt + TAUNT_COOLDOWN_MS - now));

/** Vale mostrar a provocação que chegou agora? */
export const acceptTaunt = (lastShownAt: number, now: number): boolean => now - lastShownAt >= TAUNT_ACCEPT_MS;

export const BUFF_RARITIES: readonly SurvivorUpgradeRarity[] = ['normal', 'raro', 'lendario', 'ancestral'];
export const isBuffRarity = (v: unknown): v is SurvivorUpgradeRarity => typeof v === 'string' && (BUFF_RARITIES as readonly string[]).includes(v);
/** Buff raro = qualquer raridade acima da normal. */
export const isRareBuff = (rarity: SurvivorUpgradeRarity): boolean => rarity !== 'normal';
