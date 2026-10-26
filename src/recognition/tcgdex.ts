/**
 * Cliente mínimo da API REST v2 do TCGdex (`https://api.tcgdex.net/v2/{idioma}/...`).
 * Medido no GitHub Actions em 2026-10-11: CORS `*` na API e no CDN de imagens, sem cabeçalhos de
 * limite de uso, 40 requisições paralelas responderam 200. Mesmo assim: poucas requisições,
 * novas tentativas com espera e respeito a `Retry-After`.
 */
export const TCGDEX_API = 'https://api.tcgdex.net/v2';
/** CDN das imagens das cartas (`<idioma>/<série>/<coleção>/<número>/low.webp`). */
export const TCGDEX_ASSETS = 'https://assets.tcgdex.net';

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
  /** Prazo por tentativa, incluindo leitura do corpo da resposta. */
  timeoutMs?: number;
  /** Evita repetir imediatamente uma consulta que acabou de falhar (0 desliga o cooldown). */
  failureCooldownMs?: number;
}

export type ImageQuality = 'low' | 'high';

export function cardImageUrl(imageBase: string, quality: ImageQuality = 'low', extension: 'webp' | 'png' | 'jpg' = 'webp'): string {
  return `${imageBase}/${quality}.${extension}`;
}

/** Idiomas do CDN de imagens do TCGdex tentados quando a imagem do idioma original não responde (a arte é a mesma). */
const FALLBACK_IMAGE_LANGUAGES = ['pt', 'fr', 'en'];

/**
 * Endereços para baixar a imagem de referência, do mais provável ao menos: a base como veio (baixa resolução WebP,
 * depois alta e PNG) e, se o arquivo não existir naquele idioma, a mesma carta em outros idiomas do CDN.
 * Sem repetições; `imageBase` fora do formato `.../{idioma}/...` só gera as tentativas de formato.
 */
export function referenceCandidates(imageBase: string): string[] {
  const urls = [cardImageUrl(imageBase, 'low', 'webp'), cardImageUrl(imageBase, 'high', 'webp'), cardImageUrl(imageBase, 'low', 'png')];
  const match = /^(https?:\/\/[^/]+\/)([a-z]{2}(?:-[a-z]{2})?)(\/.+)$/i.exec(imageBase);
  if (match) {
    const [, origin, language, rest] = match;
    for (const other of FALLBACK_IMAGE_LANGUAGES) {
      if (other.toLowerCase() === language!.toLowerCase()) continue;
      urls.push(cardImageUrl(`${origin}${other}${rest}`, 'low', 'webp'));
    }
  }
  return [...new Set(urls)];
}

/** Trecho curto do endereço para a mensagem de erro (sem o protocolo), por exemplo `assets.tcgdex.net/en/swsh/swsh1/081/low.webp`. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '');
}

export class TcgdexClient {
  readonly stats: RequestStats = { requests: 0, bytes: 0, failures: 0 };
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly language: string;
  private readonly retries: number;
  private readonly backoffMs: number;
  private readonly timeoutMs: number;
  private readonly failureCooldownMs: number;
  private readonly memory = new Map<string, Promise<TcgdexCard | null>>();
  private readonly searchMemory = new Map<string, Promise<TcgdexBrief[]>>();
  private readonly failedCards = new Map<string, { error: Error; until: number }>();

  constructor(options: TcgdexOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.baseUrl = options.baseUrl ?? TCGDEX_API;
    this.language = options.language ?? 'en';
    this.retries = options.retries ?? 2;
    this.backoffMs = options.backoffMs ?? 400;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.failureCooldownMs = Math.max(0, options.failureCooldownMs ?? 2_500);
  }

  /** Carta completa (com `dexId`), ou null se o id não existe. Repetições na mesma sessão não refazem a requisição. */
  getCard(id: string): Promise<TcgdexCard | null> {
    const failed = this.failedCards.get(id);
    if (failed) {
      if (failed.until > Date.now()) return Promise.reject(failed.error);
      this.failedCards.delete(id);
    }
    let pending = this.memory.get(id);
    if (!pending) {
      pending = this.fetchJson<TcgdexCard>(`${this.baseUrl}/${this.language}/cards/${encodeURIComponent(id)}`);
      pending.then(() => this.failedCards.delete(id), (error: unknown) => {
        this.memory.delete(id);
        if (this.failureCooldownMs > 0 && error instanceof Error) {
          this.failedCards.set(id, { error, until: Date.now() + this.failureCooldownMs });
        }
      });
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
    const key = `number:${official}:${value}`;
    const cached = this.searchMemory.get(key);
    if (cached) return cached;
    const pending = this.searchByNumberUncached(value, official);
    pending.catch(() => this.searchMemory.delete(key));
    this.searchMemory.set(key, pending);
    return pending;
  }

  private async searchByNumberUncached(value: number, official: number): Promise<TcgdexBrief[]> {
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

  /**
   * Cartas de uma espécie pelo número da Pokédex nacional, para achar uma carta real de origem pro Digital Pokémon
   * (presente inicial, Fonte) sem depender de uma carta já escaneada. Precisa de `eq:` (igualdade): medido em
   * 2026-10-16, `?dexId=1` casa por TRECHO do número e devolvia Unown (201) e Bellossom antes do Bulbasaur.
   */
  async searchByDexId(dexId: number): Promise<TcgdexBrief[]> {
    const key = `dex:${dexId}`;
    const cached = this.searchMemory.get(key);
    if (cached) return cached;
    const pending = this.fetchJson<TcgdexBrief[]>(`${this.baseUrl}/${this.language}/cards?dexId=eq:${encodeURIComponent(String(dexId))}`).then((list) => list ?? []);
    pending.catch(() => this.searchMemory.delete(key));
    this.searchMemory.set(key, pending);
    return pending;
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      this.stats.requests++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let delayMs = this.backoffMs * (attempt + 1);
      try {
        const response = await this.fetchImpl(url, { signal: controller.signal });
        if (response.status === 404) return null;
        if (response.status === 429 || response.status >= 500) {
          const header = response.headers.get('retry-after');
          if (header !== null && header.trim() !== '') {
            const seconds = Number(header);
            const retryMs = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
            if (Number.isFinite(retryMs) && retryMs >= 0) delayMs = retryMs;
          }
          throw new TcgdexError(`HTTP ${response.status}`, response.status);
        }
        if (!response.ok) throw new TcgdexError(`HTTP ${response.status}`, response.status);
        const text = await response.text();
        this.stats.bytes += text.length;
        return JSON.parse(text) as T;
      } catch (error) {
        this.stats.failures++;
        if (error instanceof TcgdexError && error.status && error.status < 500 && error.status !== 429) throw error;
        lastError = controller.signal.aborted
          ? new TcgdexError('Tempo esgotado ao consultar o TCGdex. Tente de novo.')
          : error;
      } finally {
        clearTimeout(timer);
      }
      // Não atrasar a mensagem de erro quando já não há outra tentativa.
      if (attempt < this.retries) await this.sleep(delayMs);
    }
    throw lastError instanceof Error ? lastError : new TcgdexError('Falha de rede ao consultar o TCGdex');
  }

  private sleep(ms: number): Promise<void> {
    return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
  }
}
