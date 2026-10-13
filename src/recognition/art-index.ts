import { FEATURE_VERSION, HASH_BITS } from './hash';
import type { CardFeatures } from './hash';

/**
 * Índice de ilustrações (opcional): uma "impressão digital" visual compacta por carta, gerada no GitHub
 * Actions (`scripts/build-art-index.ts`) e servida como arquivo estático. Nenhum catálogo de imagens é baixado
 * pelo celular: só estes ≈112 bytes por carta (hash da carta, hash da arte e grade de cor), os mesmos de
 * `computeFeatures`. Serve para sugerir candidatas quando o OCR não ajuda; quem confirma é a comparação
 * com a imagem de referência real (pipeline), e impressões com a mesma arte continuam ambíguas.
 */
export const ART_RECORD_BYTES = 112;
const FULL_OFFSET = 0;
const ART_OFFSET = 32;
const COLOR_OFFSET = 64;
const COLOR_BYTES = 48;
const HASH_BYTES = HASH_BITS / 8;

export interface ArtIndexMeta {
  version: 1;
  featureVersion: number;
  generatedAt: string;
  ids: string[];
}

export interface ArtMatch {
  id: string;
  /** Mesma combinação de `compareFeatures`, em [0, 1] (~0,5 = sem relação). */
  score: number;
  art: number;
}

/** Escreve as características de uma carta (112 bytes) em `out` a partir de `offset`. */
export function encodeRecord(features: CardFeatures, out: Uint8Array, offset = 0): void {
  out.set(features.fullHash.subarray(0, HASH_BYTES), offset + FULL_OFFSET);
  out.set(features.artHash.subarray(0, HASH_BYTES), offset + ART_OFFSET);
  out.set(features.color.subarray(0, COLOR_BYTES), offset + COLOR_OFFSET);
}

export function packArtIndex(entries: { id: string; record: Uint8Array }[], generatedAt: string): { meta: ArtIndexMeta; bin: Uint8Array } {
  const bin = new Uint8Array(entries.length * ART_RECORD_BYTES);
  entries.forEach((entry, i) => {
    if (entry.record.length !== ART_RECORD_BYTES) throw new Error(`Registro de ${entry.id} com ${entry.record.length} bytes (esperado ${ART_RECORD_BYTES}).`);
    bin.set(entry.record, i * ART_RECORD_BYTES);
  });
  return { meta: { version: 1, featureVersion: FEATURE_VERSION, generatedAt, ids: entries.map((e) => e.id) }, bin };
}

const POPCOUNT = Uint8Array.from({ length: 256 }, (_, n) => {
  let count = 0;
  for (let v = n; v; v >>= 1) count += v & 1;
  return count;
});

export class ArtIndex {
  readonly generatedAt: string;

  private constructor(private readonly meta: ArtIndexMeta, private readonly bin: Uint8Array) {
    this.generatedAt = meta.generatedAt;
  }

  /** null se os arquivos não combinam (tamanho) ou foram gerados com outra versão das características. */
  static from(meta: ArtIndexMeta, bin: Uint8Array): ArtIndex | null {
    if (!meta || meta.version !== 1 || meta.featureVersion !== FEATURE_VERSION || !Array.isArray(meta.ids)) return null;
    if (bin.length !== meta.ids.length * ART_RECORD_BYTES) return null;
    return new ArtIndex(meta, bin);
  }

  static async load(metaUrl: string, binUrl: string, fetchImpl: typeof fetch = (i, o) => fetch(i, o)): Promise<ArtIndex | null> {
    try {
      const [metaResponse, binResponse] = await Promise.all([fetchImpl(metaUrl), fetchImpl(binUrl)]);
      if (!metaResponse.ok || !binResponse.ok) return null;
      return ArtIndex.from((await metaResponse.json()) as ArtIndexMeta, new Uint8Array(await binResponse.arrayBuffer()));
    } catch {
      return null;
    }
  }

  get size(): number {
    return this.meta.ids.length;
  }

  /** As `limit` cartas mais parecidas com `features`, da mais para a menos parecida. */
  search(features: CardFeatures, limit = 6): ArtMatch[] {
    const { bin } = this;
    const count = this.meta.ids.length;
    const best: { index: number; score: number; art: number }[] = [];
    for (let i = 0; i < count; i++) {
      const base = i * ART_RECORD_BYTES;
      let fullDistance = 0;
      let artDistance = 0;
      for (let b = 0; b < HASH_BYTES; b++) {
        fullDistance += POPCOUNT[(bin[base + FULL_OFFSET + b] ?? 0) ^ (features.fullHash[b] ?? 0)] ?? 0;
        artDistance += POPCOUNT[(bin[base + ART_OFFSET + b] ?? 0) ^ (features.artHash[b] ?? 0)] ?? 0;
      }
      let colorSum = 0;
      for (let b = 0; b < COLOR_BYTES; b++) colorSum += Math.abs((bin[base + COLOR_OFFSET + b] ?? 0) - (features.color[b] ?? 0));
      const art = 1 - artDistance / HASH_BITS;
      const full = 1 - fullDistance / HASH_BITS;
      const color = 1 - colorSum / COLOR_BYTES / 255;
      const score = 0.6 * art + 0.25 * full + 0.15 * color;
      if (best.length < limit || score > (best[best.length - 1]?.score ?? -1)) {
        best.push({ index: i, score, art });
        best.sort((a, b) => b.score - a.score);
        if (best.length > limit) best.pop();
      }
    }
    return best.map((entry) => ({ id: this.meta.ids[entry.index] as string, score: entry.score, art: entry.art }));
  }
}
