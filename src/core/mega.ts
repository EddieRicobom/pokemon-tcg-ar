/**
 * Cartas Mega. O nome da carta diz se ela é Mega ("Mega Gallade ex", "M Charizard-EX", "Mega Charizard X ex"); o
 * escaneamento guarda esse fato (`mega`) e a interface mostra o selo MEGA. Na Caixa, uma carta Mega pode mudar de
 * forma por uma batalha, gastando `MEGA_ENERGY_COST` moedas (saldo único).
 */

/** Energia do Treinador gasta para uma batalha na forma Mega. */
export const MEGA_ENERGY_COST = 50;

export interface MegaCardLike {
  name: string;
  mega?: boolean;
}

export interface MegaName {
  /** Nome da espécie base ("Gallade", "Charizard"). */
  base: string;
  /** Variante da forma Mega quando a espécie tem duas (Charizard X/Y, Mewtwo X/Y). */
  variant: 'x' | 'y' | null;
}

/** "Mega Gallade ex", "M Gallade-EX", "Mega-Charizard X ex" → { base, variant }; nome que não é Mega → null. */
export function parseMegaName(name: string): MegaName | null {
  const match = /^\s*(?:mega|m)[\s-]+(.+?)\s*$/i.exec(name);
  if (!match?.[1]) return null;
  let rest = match[1];
  // Sufixos das cartas: "-EX", " ex", " EX", "-GX".
  rest = rest.replace(/[\s-]+(?:ex|gx|v|vmax)$/i, '').trim();
  let variant: MegaName['variant'] = null;
  const v = /^(.*?)[\s-]+([xy])$/i.exec(rest);
  if (v?.[1]) {
    rest = v[1].trim();
    variant = v[2]!.toLowerCase() === 'x' ? 'x' : 'y';
  }
  if (rest.length < 3) return null;
  return { base: rest, variant };
}

export function isMegaName(name: string): boolean {
  return parseMegaName(name) !== null;
}

/** A carta foi escaneada como Mega (marcada no escaneamento) ou tem nome de Mega. */
export function isMega(card: MegaCardLike): boolean {
  return card.mega === true || isMegaName(card.name);
}

/** Dados de uma forma Mega, vindos da PokéAPI (ver `app/mega-data.ts`). */
export interface MegaForm {
  /** Id de sprite da forma Mega (≥ 10000), usado para buscar o GIF. */
  formId: number;
  /** Nome da forma, como a PokéAPI chama ("gallade-mega"). */
  formName: string;
}

/**
 * Escolhe, entre as variedades de uma espécie, a forma Mega certa. Nome terminado em `-mega` (ou `-mega-x`/`-mega-y`);
 * com variante conhecida, usa a variante; sem variante e com duas formas, devolve null (ambíguo: não chuta).
 */
export function pickMegaVariety<T extends { name: string }>(varieties: readonly T[], variant: MegaName['variant']): T | null {
  const megas = varieties.filter((item) => /-mega(?:-[xy])?$/.test(item.name));
  if (variant) return megas.find((item) => item.name.endsWith(`-mega-${variant}`)) ?? (megas.length === 1 ? megas[0]! : null);
  return megas.length === 1 ? megas[0]! : null;
}
