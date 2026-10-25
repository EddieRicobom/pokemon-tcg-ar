import type { PixelBuf } from '../box/ground-art';
import { COLOR_NAMES, itemDef } from '../core/village/catalog';
import type { ColorKey } from '../core/village/catalog';
import { ACCESSORY_SPRITE_IDS, paintAccessoryArt, paintAccessoryIconArt } from './art/accessories';
import { FOOD_ICON_ART } from './art/foods';
import { furn, paintFurn } from './art/furniture';
import type { Furn } from './art/furniture';
import { GARDEN_FURNITURE, TALL_FURNITURE } from './art/furniture-garden';
import { fabric, FAMILY_DEFAULT, FAMILY_ROWS, HOME_FURNITURE } from './art/furniture-home';
import { NEW_FURNITURE, NEW_TALL_FURNITURE } from './art/furniture-new';
import { NEW_CROP_COLOR, NEW_CROP_ICONS, NEW_MATERIAL_ICONS, OLD_MATERIAL_ICONS, paintIcon, seedBagIcon } from './art/items';
import { render } from './art/pen';
import type { Draw } from './art/pen';

/**
 * Ícones e móveis da Vila em pixel art (16×16, ou 16×32 nos móveis altos), todos desenhados por código. Os desenhos
 * ficam em `art/`: móveis no estilo dos interiores da 3ª geração (`furniture*.ts`), ícones da mochila no estilo da 5ª
 * (`items.ts`, `foods.ts`) e acessórios no estilo da 4ª (`accessories.ts`). Cada móvel tem o mesmo desenho no chão e na
 * mochila; sementes viram saquinhos com a cor da planta.
 */

const GREEN = 0x4aa84a;
const GREEN_D = 0x2f7f36;
const GREEN_L = 0x6cc85c;
const GOLD = 0xffcb05;
const ORANGE = 0xf08a28;
const PINK = 0xf8a8c8;

const TALL: Record<string, Furn> = { ...TALL_FURNITURE, ...NEW_TALL_FURNITURE };
const FURNITURE: Record<string, Furn> = { ...HOME_FURNITURE, ...GARDEN_FURNITURE, ...NEW_FURNITURE, ...TALL };

// Famílias com variação de cor: o móvel original (cor padrão) e `<família>-<cor>` para cada cor.
for (const [base, rows] of Object.entries(FAMILY_ROWS)) {
  FURNITURE[base] = furn(rows, FAMILY_DEFAULT[base]!);
  for (const color of Object.keys(COLOR_NAMES) as ColorKey[]) FURNITURE[`${base}-${color}`] ??= furn(rows, fabric(color));
}

/** Materiais e colheitas (os desenhos ficam em `art/items.ts`). */
const MATERIAL_ICONS = { ...OLD_MATERIAL_ICONS, ...NEW_MATERIAL_ICONS, ...NEW_CROP_ICONS };

function draw(fn: Draw | null, h = 16): PixelBuf {
  return render(fn, 16, h);
}

/** Móvel no chão (`lit` à noite para luzes; `frame` para os móveis animados). Os altos têm 16×32. */
export function paintFurnitureItem(id: string, lit = false, frame = 0): PixelBuf {
  const f = FURNITURE[id];
  const h = id in TALL ? 32 : 16;
  return f ? paintFurn(f, lit, frame, h) : draw(null, h);
}

/** Ícone de qualquer item (mochila, loja, catálogo). */
export function paintItemIcon(id: string): PixelBuf {
  const def = itemDef(id);
  if (def?.kind === 'furniture') return paintFurnitureItem(id, true, 0);
  if (def?.kind === 'seed') return paintIcon(seedBagIcon(CROP_COLOR[def.grows?.crop ?? ''] ?? GREEN));
  if (def?.kind === 'accessory') return paintAccessoryIconArt(id);
  const icon = def?.kind === 'food' ? FOOD_ICON_ART[id] : MATERIAL_ICONS[id];
  return icon ? paintIcon(icon) : draw(null);
}

/** Acessório para vestir: o desenho no tamanho real (um pixel = um pixel do tileset), recortado. */
export function paintAccessory(id: string): PixelBuf {
  return paintAccessoryArt(id);
}

/** Tamanho do desenho do acessório, em pixels do tileset. */
export function accessorySize(id: string): { w: number; h: number } {
  const b = paintAccessoryArt(id);
  return { w: b.w, h: b.h };
}

const CROP_COLOR: Record<string, number> = { girassol: 0xffd84a, abobora: ORANGE, tomate: 0xe84a3a, morango: 0xe8344a, oran: 0x4a6ae8, pecha: PINK, cenoura: ORANGE, milho: 0xffd84a, uva: 0x8a3ad8, melancia: GREEN_D, batata: 0xc8a068, lavanda: 0x9a6ae8, ...NEW_CROP_COLOR };

/** Planta na horta: brotinho, folhas, planta crescida e a colheita aparecendo. */
export function paintCrop(cropId: string, stage: number, stages: number): PixelBuf {
  return draw((p) => {
    p.rect(2, 12, 12, 3, 0x8e6638);
    p.rect(3, 12, 10, 1, 0xb88a52);
    p.px(5, 13, 0x6a4a28);
    p.px(10, 14, 0x6a4a28);
    if (stage === 0) {
      p.rect(7, 10, 2, 2, 0x6a4a28);
      p.px(8, 9, GREEN_L);
      return;
    }
    const ripe = stage >= stages;
    const c = CROP_COLOR[cropId] ?? GOLD;
    const h = Math.min(10, 3 + stage * 3);
    if (cropId === 'melancia' && ripe) {
      p.disc(8, 10, 6, 4.5, GREEN_D);
      for (const x of [4, 7, 10]) p.rect(x, 7, 1, 7, GREEN_L);
      p.px(8, 5, GREEN);
      return;
    }
    if (cropId === 'batata' && ripe) {
      for (const [x, y] of [[4, 11], [8, 10], [12, 11]] as const) p.disc(x, y, 2.2, 1.6, c);
      p.rect(7, 4, 2, 6, GREEN_D);
      p.disc(5, 6, 2, 1.2, GREEN);
      p.disc(11, 7, 2, 1.2, GREEN);
      return;
    }
    if (cropId === 'cenoura' && ripe) {
      for (const x of [4, 8, 12]) { p.rect(x, 6, 1, 5, GREEN); p.rect(x - 1, 5, 3, 1, GREEN_L); p.tri(x, 12, x - 1, x + 1, 9, ORANGE); }
      return;
    }
    p.rect(7, 12 - h, 2, h, GREEN_D);
    p.disc(5, 12 - h / 2, 2, 1.2, GREEN);
    p.disc(11, 12 - h * 0.7, 2, 1.2, GREEN);
    if (ripe) {
      if (cropId === 'abobora') p.disc(8, 10, 4, 3, c);
      else if (cropId === 'milho') for (const [x, y] of [[5, 12 - h + 3], [11, 12 - h + 4]] as const) { p.rect(x, y, 2, 4, 0xffd84a); p.rect(x - 1, y + 2, 1, 2, GREEN); }
      else if (cropId === 'uva') for (const [x, y] of [[5, 12 - h + 2], [8, 12 - h + 3], [11, 12 - h + 2], [7, 12 - h + 5], [9, 12 - h + 5]] as const) p.disc(x, y, 1.4, 1.4, c);
      else if (cropId === 'lavanda') for (const [x, y] of [[8, 12 - h], [6, 12 - h + 2], [10, 12 - h + 2]] as const) p.rect(x - 1, y, 3, 3, c);
      else for (const [x, y] of [[5, 12 - h + 2], [11, 12 - h + 3], [8, 12 - h]] as const) p.disc(x, y, 1.6, 1.6, c);
    }
  });
}

/** Lista de itens desenhados (para conferir que todo item do catálogo tem arte). */
export const FURNITURE_ART_IDS = Object.keys(FURNITURE);
export const MATERIAL_ART_IDS = Object.keys(MATERIAL_ICONS);
export const FOOD_ART_IDS = Object.keys(FOOD_ICON_ART);
export const ACCESSORY_ART_IDS = ACCESSORY_SPRITE_IDS;
export const TALL_ART_IDS = Object.keys(TALL);
