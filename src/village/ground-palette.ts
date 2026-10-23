import { createBuf, EDGE } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';
import type { Rgba } from './tileset-art';

/** Paleta comum ao gramado, às bordas dos autotiles e à areia; só pixels estáticos. */
export const VILLAGE_GROUND = { grass: 0x80ac75, grassLight: 0x8fb980, grassDark: 0x709e66, sand: 0xe6d4a2, sandDark: 0xd2bf8d, sandLight: 0xeee0b8, wood: 0xa4845d, woodDark: 0x765d45, woodLight: 0xc2a17a } as const;
function pixel(buf: PixelBuf, x: number, y: number, color: number): void {
  const i = (y * buf.w + x) * 4;
  buf.data[i] = color >> 16 & 255; buf.data[i + 1] = color >> 8 & 255; buf.data[i + 2] = color & 255; buf.data[i + 3] = 255;
}
function fill(buf: PixelBuf, color: number): void {
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) pixel(buf, x, y, color);
}

/** Quatro variantes com o MESMO fundo; detalhe esparso evita xadrez de grandes manchas. */
export function villageGrassSheet(): PixelBuf {
  const buf = createBuf(32, 32);
  fill(buf, VILLAGE_GROUND.grass);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const h = ((x * 37 + y * 61 + x * y * 3) >>> 0) % 113;
    if (h < 4) pixel(buf, x, y, VILLAGE_GROUND.grassLight);
    else if (h === 17) pixel(buf, x, y, VILLAGE_GROUND.grassDark);
  }
  return buf;
}

export function villageSandTile(c: number, r: number): PixelBuf {
  const buf = createBuf(16, 16);
  fill(buf, VILLAGE_GROUND.sand);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const h = ((x + c * 16) * 17 + (y + r * 16) * 31) % 83;
    if (h === 0) pixel(buf, x, y, VILLAGE_GROUND.sandDark);
    else if (h === 2) pixel(buf, x, y, VILLAGE_GROUND.sandLight);
  }
  return buf;
}

/** Bordas só no perímetro do píer. As tábuas emendam entre blocos; pregos ficam junto às vigas. */
export function villagePierTile(edges: number, c: number, r: number): PixelBuf {
  const buf = createBuf(16, 16);
  fill(buf, VILLAGE_GROUND.wood);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const row = y % 4;
    if (row === 0) pixel(buf, x, y, VILLAGE_GROUND.woodDark);
    else if (row === 1) pixel(buf, x, y, VILLAGE_GROUND.woodLight);
    else if ((x + c * 16 + r * 5) % 23 === 0) pixel(buf, x, y, 0x977851);
    if ((edges & EDGE.west && x < 2) || (edges & EDGE.east && x > 13)) pixel(buf, x, y, x % 2 ? VILLAGE_GROUND.woodLight : VILLAGE_GROUND.woodDark);
    if ((edges & EDGE.north && y < 2) || (edges & EDGE.south && y > 13)) pixel(buf, x, y, y % 2 ? VILLAGE_GROUND.woodLight : VILLAGE_GROUND.woodDark);
  }
  for (const x of [3, 12]) for (const y of [2, 10]) pixel(buf, x, y, 0x5f5e57);
  return buf;
}

/** Recolore só verdes e areia dos recortes de chão, preservando transparência, sombras e água. */
export function harmonizeTerrain(source: { w: number; h: number; data: Uint8Array | Uint8ClampedArray }): Rgba {
  const out = { ...source, data: new Uint8ClampedArray(source.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (!out.data[i + 3]) continue;
    const r = source.data[i]!, g = source.data[i + 1]!, b = source.data[i + 2]!;
    const green = g > r * 1.08 && g > b * 1.1;
    const sand = r > 150 && g > 130 && r >= g && g > b * 1.12;
    if (!green && !sand) continue;
    const target = green ? [128, 172, 117] : [230, 212, 162];
    const luminance = (r * .25 + g * .6 + b * .15) / (green ? 155 : 211);
    for (let k = 0; k < 3; k++) out.data[i + k] = Math.round(Math.min(255, target[k]! * Math.max(.62, Math.min(1.15, luminance))));
  }
  return out;
}
