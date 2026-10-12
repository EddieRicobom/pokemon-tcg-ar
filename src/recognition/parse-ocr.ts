/**
 * Interpretação do texto lido pelo OCR. Pura e testável: recebe texto, devolve campos.
 * A ideia vem do pokeum (MIT): o OCR nunca é filtro rígido, só reforça ou penaliza candidatos.
 */
export interface CollectorNumber {
  /** Texto do prefixo, em maiúsculas ("" nas cartas comuns, "SWSH", "TG", "GG"...). */
  prefix: string;
  /** Parte numérica sem zeros à esquerda. */
  value: number;
  /** Como apareceu na carta ("058"). */
  raw: string;
  /** Total impresso depois da barra, se houver. */
  total?: { prefix: string; value: number };
}

export interface ParsedBottom {
  number?: CollectorNumber;
  /** Código do set impresso nas cartas modernas ("SVI", "PAL"), se lido. */
  setCode?: string;
  language?: string;
}

const LANGUAGE_TAGS = ['EN', 'PT', 'FR', 'DE', 'ES', 'IT', 'JP', 'KO'];

/** Troca letras que o OCR confunde com dígitos, só dentro de tokens que parecem número. */
function fixDigits(token: string): string {
  return token.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1');
}

export function parseBottomText(text: string): ParsedBottom {
  const cleaned = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ');
  const result: ParsedBottom = {};

  // Código do set + idioma ("SVI EN") saem do texto antes de ler o número: senão "EN 025"
  // seria lido como número com prefixo "EN".
  const tags = LANGUAGE_TAGS.join('|');
  const code = new RegExp(`(?:^|[^A-Za-z0-9])([A-Z][A-Z0-9]{1,4})\\s+(${tags})(?![A-Za-z])`).exec(cleaned);
  let rest = cleaned;
  if (code) {
    result.setCode = code[1];
    result.language = code[2];
    rest = cleaned.replace(code[0], ' ');
  } else {
    const language = new RegExp(`(?:^|[^A-Za-z0-9])(${tags})(?![A-Za-z])`).exec(cleaned);
    if (language) {
      result.language = language[1];
      rest = cleaned.replace(language[0], ' ');
    }
  }

  // 058/102, 25 / 198, TG05/TG30, SV015/SV094. O prefixo vem COLADO nos dígitos (TG05): letras soltas
  // antes do número ("W 58/102", ruído do OCR em "© 1999 ... W 58/102") não são prefixo.
  const slash = /(?:^|[^A-Za-z0-9])([A-Z]{0,5})([0-9OolI|]{1,3})\s*\/\s*([A-Z]{0,5})\s?([0-9OolI|]{1,3})(?![0-9])/.exec(rest);
  if (slash) {
    const raw = fixDigits(slash[2] ?? '');
    const total = fixDigits(slash[4] ?? '');
    if (/^\d+$/.test(raw) && /^\d+$/.test(total)) {
      result.number = {
        prefix: slash[1] ?? '',
        value: Number.parseInt(raw, 10),
        raw,
        total: { prefix: slash[3] ?? '', value: Number.parseInt(total, 10) },
      };
    }
  }
  if (!result.number) {
    // Promos sem total: SWSH123, SVP 045, SM12
    const promo = /(?:^|[^A-Za-z0-9])([A-Z]{2,5})\s?(\d{1,3})(?![0-9])/.exec(rest);
    if (promo) {
      result.number = { prefix: promo[1] ?? '', value: Number.parseInt(promo[2] ?? '0', 10), raw: promo[2] ?? '' };
    }
  }
  return result;
}

const NAME_STOPWORDS = new Set([
  'basic', 'basico', 'básico', 'stage', 'estagio', 'estágio', 'pokemon', 'pokémon', 'hp', 'ps', 'trainer', 'treinador',
  'energy', 'energia', 'supporter', 'apoiador', 'item', 'objeto', 'stadium', 'estadio', 'estádio', 'tool', 'ferramenta',
  'evolves', 'evolui', 'from', 'de', 'restored', 'mega', 'vmax', 'vstar', 'gx', 'tag', 'team',
]);

/**
 * Extrai possíveis nomes da faixa superior: linhas com letras, sem "HP 70", sem palavras de
 * estágio. Devolve do mais longo ao mais curto; o ranking decide qual combina com o catálogo.
 */
export function parseNameText(text: string): string[] {
  const lines = text.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
  const candidates: string[] = [];
  for (const line of lines) {
    const withoutHp = line.replace(/\b(?:HP|PS)\s*\d+\b/gi, ' ').replace(/\b\d+\s*(?:HP|PS)\b/gi, ' ');
    const words = withoutHp
      .replace(/[^\p{L}\p{N}'’.\- ]/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 0 && !NAME_STOPWORDS.has(word.toLowerCase()));
    const name = words.join(' ').replace(/^[-.' ]+|[-.' ]+$/g, '');
    if (name.replace(/[^\p{L}]/gu, '').length >= 3) candidates.push(name);
  }
  return candidates.sort((a, b) => b.length - a.length);
}
