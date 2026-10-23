import type { HomeExteriorStyle } from '../core/village/town-layout';
import type { Rgba } from './tileset-art';

const STYLE_DETAILS: Record<HomeExteriorStyle, { facade: string; trim: number; shade: number }> = {
  rústico: { facade: 'home-orange', trim: 0x8d623f, shade: 0x563c2b },
  jardim: { facade: 'home-teal', trim: 0x548f69, shade: 0x315943 },
  festivo: { facade: 'home-pink', trim: 0xc46d6c, shade: 0x79434c },
  moderno: { facade: 'home-blue', trim: 0x7196b0, shade: 0x455f78 },
  praiano: { facade: 'home-blue', trim: 0x7db9b6, shade: 0x486e73 },
  serrano: { facade: 'house-brick', trim: 0x987253, shade: 0x604738 },
  tradicional: { facade: 'home-yellow', trim: 0xb4864c, shade: 0x6f512f },
  noturno: { facade: 'home-pink', trim: 0x8376aa, shade: 0x4d456f },
};

/** Fachadas existentes do mesmo conjunto; nunca substitui uma reforma por um prédio de outra função. */
export function homeTileset(level: number, style: HomeExteriorStyle): string {
  // Cada estilo já nasce na sua família de fachada. As reformas mudam os detalhes
  // arquitetônicos abaixo, sem transformar todas as casas intermediárias em tijolo.
  if (level <= 0) return style === 'serrano' || style === 'rústico' ? 'home-orange' : STYLE_DETAILS[style].facade;
  return STYLE_DETAILS[style].facade;
}

function setPixel(image: Rgba, x: number, y: number, rgb: number, onlyOnBuilding = false): void {
  if (x < 0 || x >= image.w || y < 0 || y >= image.h) return;
  const i = (y * image.w + x) * 4;
  if (onlyOnBuilding && !image.data[i + 3]) return;
  image.data[i] = (rgb >> 16) & 255;
  image.data[i + 1] = (rgb >> 8) & 255;
  image.data[i + 2] = rgb & 255;
  image.data[i + 3] = 255;
}

function tintRoof(source: Rgba, roof: number, roofEnd: number): Rgba {
  const out: Rgba = { ...source, data: new Uint8ClampedArray(source.data) };
  for (let y = 0; y < roofEnd; y++) for (let x = 0; x < out.w; x++) {
    const i = (y * out.w + x) * 4;
    if (!out.data[i + 3]) continue;
    const red = out.data[i]!, green = out.data[i + 1]!, blue = out.data[i + 2]!;
    const lightness = red * .25 + green * .6 + blue * .15;
    // Mantém contornos e brilhos neutros do tileset; só a cor do telhado muda.
    if (lightness < 55 || Math.max(red, green, blue) - Math.min(red, green, blue) < 16) continue;
    const factor = Math.max(.58, Math.min(1.08, lightness / 162));
    out.data[i] = Math.round(((roof >> 16) & 255) * factor);
    out.data[i + 1] = Math.round(((roof >> 8) & 255) * factor);
    out.data[i + 2] = Math.round((roof & 255) * factor);
  }
  return out;
}

function drawLine(image: Rgba, from: number, to: number, y: number, color: number): void {
  for (let x = from; x <= to; x++) setPixel(image, x, y, color, true);
}

/** Composição em pixels, feita uma vez e guardada pelo cache do renderizador. */
export function renovateHomeTileset(source: Rgba, level: number, style: HomeExteriorStyle, roof: number): Rgba {
  // Só o telhado recebe a tinta, preservando alvenaria, portas, vidro e sombras.
  const roofEnd = Math.min(48, source.h);
  const painted = tintRoof(source, roof, roofEnd);
  const extra = level >= 5 ? 24 : 0;
  const out: Rgba = { w: source.w, h: source.h + extra, data: new Uint8ClampedArray(source.w * (source.h + extra) * 4) };
  const stride = source.w * 4;
  out.data.set(painted.data.subarray(0, roofEnd * stride));
  if (extra) {
    // Acrescenta um segundo pavimento com a própria alvenaria, para manter a escala do atlas.
    out.data.set(source.data.subarray(roofEnd * stride, (roofEnd + extra) * stride), roofEnd * stride);
    for (let y = roofEnd; y < roofEnd + extra; y++) for (let x = 0; x < out.w; x++) {
      const i = (y * out.w + x) * 4;
      if (out.data[i + 3]) {
        out.data[i] = Math.round(out.data[i]! * .92);
        out.data[i + 1] = Math.round(out.data[i + 1]! * .92);
        out.data[i + 2] = Math.round(out.data[i + 2]! * .92);
      }
    }
  }
  out.data.set(source.data.subarray(roofEnd * stride), (roofEnd + extra) * stride);

  const details = STYLE_DETAILS[style];
  const eaveY = roofEnd + extra + 2;
  if (level >= 2) {
    drawLine(out, 9, out.w - 10, eaveY, details.shade);
    drawLine(out, 11, out.w - 12, eaveY + 1, details.trim);
  }
  if (level >= 3) {
    // Pequenas esquadrias coloridas mostram a reforma sem cobrir janelas do desenho original.
    for (const x of [14, out.w - 17]) {
      setPixel(out, x, eaveY + 6, details.trim, true);
      setPixel(out, x + 1, eaveY + 6, details.trim, true);
      setPixel(out, x, eaveY + 7, details.shade, true);
    }
  }
  if (level >= 4) {
    // Varanda central curta: parece uma ampliação da casa, não uma faixa atravessando o lote.
    const from = Math.floor(out.w * .25), to = Math.ceil(out.w * .75);
    const y = Math.max(eaveY + 13, out.h - 47);
    drawLine(out, from, to, y, 0xf2e4c4);
    drawLine(out, from, to, y + 8, details.shade);
    for (let x = from + 2; x < to; x += 5) for (let dy = 1; dy < 8; dy++) setPixel(out, x, y + dy, details.trim, true);
  }
  if (extra) {
    // A cumeeira separa os dois pavimentos e deixa a reforma máxima nítida à distância.
    drawLine(out, 8, out.w - 9, roofEnd + extra, details.shade);
    drawLine(out, 10, out.w - 11, roofEnd + extra + 1, details.trim);
  }
  return out;
}
