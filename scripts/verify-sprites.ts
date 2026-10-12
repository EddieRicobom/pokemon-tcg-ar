/**
 * Verificação com rede de verdade dos sprites do PokeAPI/sprites.
 *
 * Não é um teste unitário (depende de rede). Roda manualmente ou no workflow
 * "Verificação externa" e imprime um JSON com o que foi realmente medido.
 *
 *   node scripts/verify-sprites.ts
 *
 * O resultado descreve o estado do repositório de sprites naquele momento; o app
 * nunca assume isso: ele tenta o GIF e cai para o estático se não existir.
 */
import { pokemonSpriteUrl, pokemonStaticSpriteUrls } from '../src/ar/sprite-url.ts';
import { decodeGif } from '../src/core/gif.ts';

const CASES: { label: string; dexId: number; expected: 'gif' | 'static' | 'none' }[] = [
  { label: 'Pikachu', dexId: 25, expected: 'gif' },
  { label: 'Ditto', dexId: 132, expected: 'gif' },
  { label: 'Miraidon', dexId: 1008, expected: 'static' },
  { label: 'Walking Wake', dexId: 1009, expected: 'gif' },
  { label: 'Inexistente', dexId: 999999, expected: 'none' },
];

interface Probe {
  url: string;
  status: number | 'erro-de-rede';
  contentType?: string | null;
  corsAllowOrigin?: string | null;
  bytes?: number;
  fetchMs?: number;
}

interface Result {
  label: string;
  dexId: number;
  gif: Probe & {
    frames?: number;
    width?: number;
    height?: number;
    durationMs?: number;
    transparentPixelsInFirstFrame?: number;
    decodeError?: string;
  };
  staticFallbacks: Probe[];
  outcome: 'gif' | 'static' | 'none';
  expected: 'gif' | 'static' | 'none';
  matchesExpectation: boolean;
}

async function probe(url: string): Promise<Probe & { data?: ArrayBuffer }> {
  const started = performance.now();
  try {
    const response = await fetch(url);
    const base: Probe = {
      url,
      status: response.status,
      contentType: response.headers.get('content-type'),
      corsAllowOrigin: response.headers.get('access-control-allow-origin'),
      fetchMs: Math.round(performance.now() - started),
    };
    if (!response.ok) return base;
    const data = await response.arrayBuffer();
    return { ...base, bytes: data.byteLength, data };
  } catch {
    return { url, status: 'erro-de-rede' };
  }
}

async function check(item: (typeof CASES)[number]): Promise<Result> {
  const gifProbe = await probe(pokemonSpriteUrl(item.dexId));
  const { data, ...gifInfo } = gifProbe;
  const gif: Result['gif'] = { ...gifInfo };

  let gifWorks = false;
  if (data) {
    try {
      const decoded = decodeGif(data);
      const first = decoded.frames[0];
      let transparent = 0;
      if (first) {
        for (let i = 3; i < first.rgba.length; i += 4) if (first.rgba[i] === 0) transparent++;
      }
      gif.frames = decoded.frames.length;
      gif.width = decoded.width;
      gif.height = decoded.height;
      gif.durationMs = decoded.durationMs;
      gif.transparentPixelsInFirstFrame = transparent;
      gifWorks = true;
    } catch (error) {
      gif.decodeError = error instanceof Error ? error.message : String(error);
    }
  }

  const staticFallbacks: Probe[] = [];
  if (!gifWorks) {
    for (const url of pokemonStaticSpriteUrls(item.dexId)) {
      const { data: _ignored, ...info } = await probe(url);
      staticFallbacks.push(info);
    }
  }

  const outcome: Result['outcome'] = gifWorks
    ? 'gif'
    : staticFallbacks.some((p) => p.status === 200)
      ? 'static'
      : 'none';

  return {
    label: item.label,
    dexId: item.dexId,
    gif,
    staticFallbacks,
    outcome,
    expected: item.expected,
    matchesExpectation: outcome === item.expected,
  };
}

const results: Result[] = [];
for (const item of CASES) results.push(await check(item));

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
process.exitCode = results.every((r) => r.matchesExpectation) ? 0 : 1;
