import type { HomeExteriorStyle } from '../core/village/town-layout';
import type { Rgba } from './tileset-art';
import { recolor } from './tileset-art';

/** Fachadas existentes do mesmo conjunto; nunca substitui uma reforma por um prédio de outra função. */
export function homeTileset(level: number, style: HomeExteriorStyle): string {
  const facades: Record<HomeExteriorStyle, string> = {
    rústico: 'home-orange', jardim: 'home-teal', festivo: 'home-pink', moderno: 'home-blue',
    praiano: 'home-blue', serrano: 'house-brick', tradicional: 'home-yellow', noturno: 'home-pink',
  };
  if (level === 1) return style === 'jardim' || style === 'moderno' || style === 'praiano' ? 'home-yellow' : 'home-teal';
  if (level === 2) return style === 'serrano' ? 'home-orange' : 'house-brick';
  return facades[style];
}

/** Composição em pixels, feita uma vez e guardada pelo cache do renderizador. */
export function renovateHomeTileset(source: Rgba, level: number, style: HomeExteriorStyle, roof: number): Rgba {
  // Só o telhado recebe a tinta, preservando a cor nativa da fachada e o vidro.
  const roofEnd = Math.min(48, source.h);
  const painted = recolor(source, roof);
  const extra = level >= 5 ? 24 : 0;
  const out: Rgba = { w: source.w, h: source.h + extra, data: new Uint8ClampedArray(source.w * (source.h + extra) * 4) };
  const stride = source.w * 4;
  out.data.set(painted.data.subarray(0, roofEnd * stride));
  if (extra) {
    // Acrescenta um andar usando a alvenaria da própria folha, mantendo tamanho de pixel e largura do lote.
    out.data.set(source.data.subarray(roofEnd * stride, (roofEnd + extra) * stride), roofEnd * stride);
  }
  out.data.set(source.data.subarray(roofEnd * stride), (roofEnd + extra) * stride);
  const pixel = (x: number, y: number, rgb: number) => {
    if (x < 0 || x >= out.w || y < 0 || y >= out.h) return;
    const i = (y * out.w + x) * 4;
    out.data[i] = (rgb >> 16) & 255; out.data[i + 1] = (rgb >> 8) & 255; out.data[i + 2] = rgb & 255; out.data[i + 3] = 255;
  };
  if (level >= 4) {
    const y = out.h - 42;
    for (let x = 9; x < out.w - 9; x++) { pixel(x, y, 0xf2e4c4); pixel(x, y + 10, 0x68492f); }
    for (let x = 10; x < out.w - 9; x += 6) for (let dy = 1; dy < 10; dy++) pixel(x, y + dy, 0xc6af87);
  }
  const accents: Partial<Record<HomeExteriorStyle, number>> = { jardim: 0x558b53, festivo: 0xd8a747, praiano: 0xbbe2db, serrano: 0x8b6545, tradicional: 0xb68751, noturno: 0x8f78b0, moderno: 0x879fae };
  const accent = accents[style];
  if (accent) for (let x = 12; x < out.w - 12; x++) pixel(x, roofEnd + extra + 2, accent);
  return out;
}
