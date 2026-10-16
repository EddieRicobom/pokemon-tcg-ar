/**
 * Acabamento metálico leve dos Digital Pokémon: mostra, sem precisar de texto, que aquele morador não veio de uma
 * carta física. Duas partes, ambas baratas: uma tinta fixa calculada uma vez por quadro do GIF (puxa as cores um
 * pouco para um cinza-aço frio, com um leve aumento de contraste) e um brilho que atravessa o sprite de tempos em
 * tempos (desenhado na tela por quem chama, usando `sheenAt`). Desligável em Visual ("Brilho metálico").
 */

/** Quanto da cor original vira aço (0 = nada, 1 = estátua de metal). Leve de propósito: a espécie continua reconhecível. */
export const METALLIC_MIX = 0.25;
const CONTRAST = 1.18;

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** Tinta metálica sobre um buffer RGBA (devolve um buffer novo; o alfa não muda e pixels transparentes ficam como estão). */
export function metallicTint(rgba: ArrayLike<number>, mix = METALLIC_MIX): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i] ?? 0;
    const g = rgba[i + 1] ?? 0;
    const b = rgba[i + 2] ?? 0;
    const a = rgba[i + 3] ?? 0;
    out[i + 3] = a;
    if (a === 0) {
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      continue;
    }
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const steel = (lum - 128) * CONTRAST + 128;
    // Aço frio: um pouco mais de azul que de vermelho.
    out[i] = clamp255(r * (1 - mix) + clamp255(steel * 0.94 + 6) * mix);
    out[i + 1] = clamp255(g * (1 - mix) + clamp255(steel * 0.98 + 9) * mix);
    out[i + 2] = clamp255(b * (1 - mix) + clamp255(steel * 1.04 + 16) * mix);
  }
  return out;
}

/** Duração de uma passada do brilho e da pausa até a próxima (ms). */
export const SHEEN_SWEEP_MS = 900;
export const SHEEN_PERIOD_MS = 3600;

/**
 * Posição do brilho no instante `now` (ms): de 0 (fora, à esquerda) a 1 (fora, à direita) durante a passada, ou
 * null na pausa. `offset` desencontra Pokémon diferentes para não brilharem todos juntos.
 */
export function sheenAt(now: number, offset = 0): number | null {
  const t = (((now + offset) % SHEEN_PERIOD_MS) + SHEEN_PERIOD_MS) % SHEEN_PERIOD_MS;
  return t < SHEEN_SWEEP_MS ? t / SHEEN_SWEEP_MS : null;
}

/** Desencontro estável por id (o mesmo Pokémon sempre brilha no mesmo ponto do ciclo). */
export function sheenOffset(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % SHEEN_PERIOD_MS;
}
