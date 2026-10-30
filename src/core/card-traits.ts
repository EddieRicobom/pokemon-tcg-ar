/**
 * Detalhes da carta física que o TCGdex informa e que o app passa a guardar no escaneamento (`CachedCard.traits`).
 * Cartas escaneadas antes disso são corrigidas sozinhas ao abrir o app (`CardCache.backfillTraits` busca os detalhes
 * no TCGdex, sem escanear de novo); até lá, os arquétipos que dependem deles só não aparecem. Tudo opcional e validado: o que a
 * fonte não mandar fica ausente, nunca inventado.
 */
export interface CardTraits {
  /** «Pokemon», «Trainer» ou «Energy», como o TCGdex escreve. */
  category?: string;
  hp?: number;
  /** Tipos de energia da carta (ex.: «Fire»), que podem diferir dos tipos da espécie. */
  types?: string[];
  /** Estágio impresso: «Basic», «Stage1», «Stage2», «VMAX», «VSTAR», «BREAK», «LEVEL-UP», «MEGA»… */
  stage?: string;
  /** Sufixo do nome no TCGdex: «EX», «GX», «V», «VMAX», «VSTAR», «ex»… */
  suffix?: string;
  evolveFrom?: string;
  attackCount?: number;
  /** Maior dano numérico impresso entre os ataques (ignora «+», «×» e «-»). */
  maxDamage?: number;
  abilityCount?: number;
  regulationMark?: string;
  illustrator?: string;
}

const str = (v: unknown, max = 40): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const int = (v: unknown, max: number): number | undefined => {
  const n = typeof v === 'string' ? parseInt(v, 10) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.min(max, Math.round(n)) : undefined;
};

/** Lê os detalhes do JSON de uma carta do TCGdex (`/v2/{idioma}/cards/{id}`). Sem nada útil, devolve `undefined`. */
export function traitsFromTcgdex(raw: unknown): CardTraits | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const attacks = Array.isArray(r.attacks) ? r.attacks : [];
  const damages = attacks.map((a) => int((a as Record<string, unknown> | null)?.damage, 9999)).filter((n): n is number => n !== undefined);
  const out: CardTraits = {
    category: str(r.category),
    hp: int(r.hp, 9999),
    types: Array.isArray(r.types) ? r.types.map((t) => str(t, 20)).filter((t): t is string => !!t).slice(0, 4) : undefined,
    stage: str(r.stage),
    suffix: str(r.suffix),
    evolveFrom: str(r.evolveFrom, 60),
    attackCount: Array.isArray(r.attacks) ? Math.min(9, attacks.length) : undefined,
    maxDamage: damages.length ? Math.max(...damages) : undefined,
    abilityCount: Array.isArray(r.abilities) ? Math.min(9, r.abilities.length) : undefined,
    regulationMark: str(r.regulationMark, 4),
    illustrator: str(r.illustrator, 60),
  };
  const clean = Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))) as CardTraits;
  return Object.keys(clean).length ? clean : undefined;
}

/** Valida `traits` vindos de um save (backup antigo, edição manual): o que não fizer sentido some. */
export function normalizeTraits(raw: unknown): CardTraits | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  return traitsFromTcgdex({
    category: r.category, hp: r.hp, types: r.types, stage: r.stage, suffix: r.suffix, evolveFrom: r.evolveFrom,
    attacks: Number.isInteger(r.attackCount) ? Array.from({ length: Math.min(9, r.attackCount as number) }, (_, i) => ({ damage: i === 0 ? r.maxDamage : undefined })) : undefined,
    abilities: Number.isInteger(r.abilityCount) ? Array.from({ length: Math.min(9, r.abilityCount as number) }) : undefined,
    regulationMark: r.regulationMark, illustrator: r.illustrator,
  });
}
