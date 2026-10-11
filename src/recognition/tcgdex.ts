/**
 * Cliente mínimo da API REST v2 do TCGdex (`https://api.tcgdex.net/v2/{idioma}/...`).
 * Medido no GitHub Actions em 2026-10-11: CORS `*` na API e no CDN de imagens, sem cabeçalhos de
 * limite de uso, 40 requisições paralelas responderam 200. Mesmo assim: poucas requisições,
 * novas tentativas com espera e respeito a `Retry-After`.
 */
export const TCGDEX_API = 'https://api.tcgdex.net/v2';

export interface TcgdexCard {
  id: string;
  localId: string;
  name: string;
  /** Base da imagem, sem extensão: acrescente `/low.webp`, `/high.webp`... */
  image?: string;
  /** Números oficiais da Pokédex Nacional (vazio/ausente em Treinador e Energia). */
  dexId?: number[];
  category?: string;
  rarity?: string;
  set: { id: string; name: string; cardCount?: { official: number; total: number } };
  variants?: Record<string, boolean>;
}

/** Resumo devolvido pelas buscas (sem dexId nem detalhes do set). */
export interface TcgdexBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

export interface RequestStats {
  requests: number;
  bytes: number;
  failures: number;
}

export class TcgdexError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'TcgdexError';
  }
}

export interface TcgdexOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  language?: string;
  retries?: number;
  /** Espera base entre tentativas, em ms (testes usam 0). */
  backoffMs?: number;
}

export type ImageQuality = 'low' | 'high';

export function cardImageUrl(imageBase: string, quality: ImageQuality = 'low', extension: 'webp' | 'png' | 'jpg' = 'webp'): string {
  return `${imageBase}/${quality}.${extension}`;
}

export class TcgdexClient {
  readonly stats: RequestStats = { requests: 0, bytes: 0, failures: 0 };
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly language: string;
  private readonly retries: number;
  private readonly backoffMs: number;
  private readonly memory = new Map<string, Promise<TcgdexCard | null>>();

  constructor(options: TcgdexOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.baseUrl = options.baseUrl ?? TCGDEX_API;
    this.language = options.language ?? 'en';
    this.retries = options.retries ?? 2;
    this.backoffMs = options.backoffMs ?? 400;
  }

  /** Carta completa (com `dexId`), ou null se o id não existe. Repetições na mesma sessão não refazem a requisição. */
  getCard(id: string): Promise<TcgdexCard | null> {
    let pending = this.memory.get(id);
    if (!pending) {
      pending = this.fetchJson<TcgdexCard>(`${this.baseUrl}/${this.language}/cards/${encodeURIComponent(id)}`);
      pending.catch(() => this.memory.delete(id));
      this.memory.set(id, pending);
    }
    return pending;
  }

  /**
   * Cartas com esse número e esse total oficial (sem usar o índice estático). Sintaxe medida no CI:
   * `cards?set.cardCount.official=102&localId=58`. O `localId` é exato e pode ter zeros à esquerda
   * (sets modernos usam "025"), então perguntamos pelas duas formas.
   */
  async searchByNumber(value: number, official: number): Promise<TcgdexBrief[]> {
    const forms = Array.from(new Set([String(value), String(value).padStart(3, '0')]));
    const lists = await Promise.all(
      forms.map((form) =>
        this.fetchJson<TcgdexBrief[]>(
          `${this.baseUrl}/${this.language}/cards?set.cardCount.official=${official}&localId=${encodeURIComponent(form)}`,
        ),
      ),
    );
    const seen = new Set<string>();
    return lists.flatMap((list) => list ?? []).filter((card) => (seen.has(card.id) ? false : (seen.add(card.id), true)));
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      this.stats.requests++;
      try {
        const response = await this.fetchImpl(url);
        if (response.status === 404) return null;
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = Number(response.headers.get('retry-after'));
          lastError = new TcgdexError(`HTTP ${response.status}`, response.status);
          this.stats.failures++;
          await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : this.backoffMs * (attempt + 1));
          continue;
        }
        if (!response.ok) throw new TcgdexError(`HTTP ${response.status}`, response.status);
        const text = await response.text();
        this.stats.bytes += text.length;
        return JSON.parse(text) as T;
      } catch (error) {
        if (error instanceof TcgdexError && error.status && error.status < 500 && error.status !== 429) throw error;
        lastError = error;
        this.stats.failures++;
        await this.sleep(this.backoffMs * (attempt + 1));
      }
    }
    throw lastError instanceof Error ? lastError : new TcgdexError('Falha de rede ao consultar o TCGdex');
  }

  private sleep(ms: number): Promise<void> {
    return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
  }
}
