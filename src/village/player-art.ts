import type { Dir } from '../core/village/actors';
import { createBuf } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';

/**
 * O seu personagem na Vila: 16×24 em pixel art, desenhado por código para os 4 lados, com um visual por treinador do
 * perfil (cabelo, chapéu, roupa e cores tiradas dos sprites de treinador do Showdown). Quem não está na lista cai numa
 * combinação sorteada pelo id.
 */

export type HairStyle = 'short' | 'long' | 'spiky' | 'bun' | 'twin' | 'pony' | 'bald';
export type HeadGear = 'cap' | 'beanie' | 'visor' | 'bandana' | 'hat' | 'headband' | 'beret' | 'none';
export type TopKind = 'jacket' | 'tee' | 'dress' | 'coat' | 'gi';
export type BottomKind = 'pants' | 'shorts' | 'skirt';

export interface Outfit {
  /** Cor do chapéu (e do detalhe, como a faixa). */
  cap: number;
  capShade: number;
  hair: number;
  skin: number;
  /** Roupa de cima, a parte de baixo dela, o que aparece por dentro (gola, emblema, listra) e a roupa de baixo (calça, bermuda, saia). */
  shirt: number;
  shirtShade: number;
  inner: number;
  pants: number;
  /** Mochila ou bolsa (a cor; `bag` diz se existe) e o detalhe (faixa preta do quimono). */
  accent: number;
  bag: boolean;
  shoes: number;
  /** Meia ou legging que aparece sob a bermuda/saia (null = a perna aparece). */
  socks: number | null;
  scarf: number | null;
  glasses: boolean;
  style: HairStyle;
  gear: HeadGear;
  top: TopKind;
  bottom: BottomKind;
}

const mul = (c: number, f: number): number => (Math.min(255, Math.round(((c >> 16) & 255) * f)) << 16) | (Math.min(255, Math.round(((c >> 8) & 255) * f)) << 8) | Math.min(255, Math.round((c & 255) * f));

function put(buf: PixelBuf, x: number, y: number, rgb: number): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
  const i = (y * buf.w + x) * 4;
  buf.data[i] = (rgb >> 16) & 255;
  buf.data[i + 1] = (rgb >> 8) & 255;
  buf.data[i + 2] = rgb & 255;
  buf.data[i + 3] = 255;
}
function rect(buf: PixelBuf, x: number, y: number, w: number, h: number, rgb: number): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(buf, x + i, y + j, rgb);
}
function disc(buf: PixelBuf, cx: number, cy: number, rx: number, ry: number, rgb: number): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(buf, x, y, rgb);
}
function outline(buf: PixelBuf, rgb: number): void {
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < buf.w && y < buf.h && (buf.data[(y * buf.w + x) * 4 + 3] ?? 0) > 0;
  const marks: [number, number][] = [];
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) marks.push([x, y]);
  for (const [x, y] of marks) put(buf, x, y, rgb);
}

// ----------------------------------------------------------------------------- os visuais

const S_PALE = 0xf8d8b8;
const S_LIGHT = 0xf8c8a8;
const S_TAN = 0xd8a878;
const S_DARK = 0x9a6a44;
const WHITE = 0xf4f4fa;

interface Look {
  skin: number;
  hair: number;
  style: HairStyle;
  gear?: HeadGear;
  cap?: number;
  top?: TopKind;
  shirt: number;
  inner?: number;
  bottom?: BottomKind;
  pants: number;
  shoes: number;
  socks?: number;
  scarf?: number;
  glasses?: boolean;
  bag?: number;
  belt?: number;
}

function build(l: Look): Outfit {
  const cap = l.cap ?? 0xc84848;
  return {
    cap,
    capShade: mul(cap, 0.78),
    hair: l.hair,
    skin: l.skin,
    shirt: l.shirt,
    shirtShade: mul(l.shirt, 0.78),
    inner: l.inner ?? WHITE,
    pants: l.pants,
    accent: l.bag ?? l.belt ?? 0x6a4a28,
    bag: l.bag !== undefined,
    shoes: l.shoes,
    socks: l.socks ?? null,
    scarf: l.scarf ?? null,
    glasses: l.glasses === true,
    style: l.style,
    gear: l.gear ?? 'none',
    top: l.top ?? 'jacket',
    bottom: l.bottom ?? 'pants',
  };
}

/** Um visual por treinador do perfil (`PLAYER_SPRITES`), conferido contra os sprites. */
const LOOKS: Record<string, Look> = {
  lucas: { skin: 0xe8b088, hair: 0x282838, style: 'short', gear: 'beret', cap: 0xc84858, shirt: 0x4878c8, inner: 0xd85868, pants: 0x282838, shoes: 0x282838, scarf: 0xe8e8f8 },
  dawn: { skin: S_LIGHT, hair: 0x282838, style: 'long', gear: 'beanie', cap: 0xe8e8f8, top: 'tee', shirt: 0xb82838, inner: 0xe8e8f8, bottom: 'skirt', pants: 0xd85888, shoes: 0xd878a8, socks: 0xe8e8f8, scarf: 0xe8e8f8 },
  red: { skin: 0xe8b898, hair: 0x383838, style: 'short', gear: 'cap', cap: 0xc84848, shirt: 0xc84848, inner: 0x383838, pants: 0x5888b8, shoes: 0xc84848, bag: 0xd8a828 },
  leaf: { skin: S_TAN, hair: 0x785858, style: 'long', gear: 'hat', cap: 0xf4f4f4, top: 'tee', shirt: 0x5888b8, inner: 0xf8f8f8, bottom: 'skirt', pants: 0xe86858, shoes: 0xe8e8f8, bag: 0x885838 },
  ethan: { skin: S_LIGHT, hair: 0x283838, style: 'short', gear: 'cap', cap: 0x283838, shirt: 0x981818, inner: WHITE, pants: 0x283838, shoes: 0xc84848 },
  lyra: { skin: S_LIGHT, hair: 0x583818, style: 'twin', gear: 'hat', cap: 0xe8e8f8, top: 'tee', shirt: 0x782838, bottom: 'shorts', pants: 0x182838, shoes: 0xc84858, socks: 0xe8e8f8, bag: 0xd8a828 },
  brendan: { skin: 0xf8d8c8, hair: 0x886858, style: 'short', gear: 'beanie', cap: 0xe8f0f0, shirt: 0x182858, inner: 0x68a858, pants: 0x182858, shoes: 0x383848 },
  may: { skin: 0xf8d8c8, hair: 0x785838, style: 'long', gear: 'bandana', cap: 0x689858, top: 'tee', shirt: 0xc84848, inner: 0xc84848, bottom: 'shorts', pants: 0x383838, shoes: 0xc84848 },
  hilbert: { skin: S_TAN, hair: 0x684838, style: 'short', gear: 'cap', cap: 0xc84848, shirt: 0x7898d8, inner: WHITE, pants: 0x383838, shoes: 0xc84848, bag: 0x484858 },
  hilda: { skin: S_PALE, hair: 0x483828, style: 'pony', gear: 'cap', cap: 0xe8e8f8, top: 'tee', shirt: 0xe8e8f8, inner: 0xc84868, bottom: 'shorts', pants: 0x88a8d8, shoes: 0x784848, bag: 0xc84868 },
  nate: { skin: S_PALE, hair: 0x684848, style: 'spiky', gear: 'visor', cap: 0xc85858, shirt: 0x3878a8, inner: WHITE, pants: 0x989898, shoes: 0xc85858, bag: 0x686878 },
  rosa: { skin: S_PALE, hair: 0x785848, style: 'twin', gear: 'visor', cap: 0xf0f0f8, shirt: 0x88b8d8, inner: WHITE, bottom: 'skirt', pants: 0xf8e888, shoes: 0xe8e8f8, socks: 0x383838 },
  blue: { skin: S_LIGHT, hair: 0xd8a030, style: 'spiky', top: 'tee', shirt: 0x384858, inner: 0x384858, pants: 0x785888, shoes: 0x383848 },
  silver: { skin: 0xf8d8c8, hair: 0xa83838, style: 'long', shirt: 0x382858, inner: 0x881838, pants: 0x484898, shoes: 0x681838 },
  barry: { skin: S_TAN, hair: 0xf8e888, style: 'spiky', top: 'tee', shirt: 0xf4f4f4, inner: 0xf8a828, pants: 0x888888, shoes: 0x886848, scarf: 0x98d848, bag: 0xa87858 },
  cheren: { skin: 0xf8d8c8, hair: 0x384848, style: 'short', glasses: true, shirt: 0x2898b8, inner: WHITE, pants: 0x384848, shoes: 0x2898b8 },
  bianca: { skin: 0xf8d8c8, hair: 0xe8e888, style: 'short', gear: 'beret', cap: 0x68b848, top: 'dress', shirt: 0xf8a828, inner: WHITE, pants: 0xeeeef8, shoes: 0xf8a828, bag: 0x68b848 },
  n: { skin: 0xf8d8c8, hair: 0x98d888, style: 'pony', gear: 'cap', cap: 0x484848, top: 'tee', shirt: 0xf8f8f8, inner: 0x986878, pants: 0xc8c8a8, shoes: 0x686858 },
  ace: { skin: S_PALE, hair: 0x689858, style: 'short', shirt: 0x684848, inner: 0xc87858, pants: 0x684848, shoes: 0x486848 },
  'ace-f': { skin: S_PALE, hair: 0x689858, style: 'long', shirt: 0x684848, inner: 0xc87858, bottom: 'shorts', pants: 0x684848, shoes: 0x486848, socks: 0x483848 },
  'battle-girl': { skin: S_TAN, hair: 0xe8d868, style: 'pony', gear: 'headband', cap: 0x3848a8, top: 'tee', shirt: 0xe87838, inner: 0xf8d8b8, bottom: 'shorts', pants: 0xe87838, shoes: 0x3848a8 },
  blackbelt: { skin: S_TAN, hair: 0x383858, style: 'short', gear: 'headband', cap: 0xc84848, top: 'gi', shirt: 0xe4dcd4, inner: S_TAN, pants: 0xdcd2ca, shoes: S_TAN, belt: 0x2c2c48 },
  ranger: { skin: S_PALE, hair: 0x483868, style: 'short', gear: 'cap', cap: 0xd85838, shirt: 0xd85838, inner: 0x484858, pants: 0x484858, shoes: 0xd85838 },
  'ranger-f': { skin: S_PALE, hair: 0x483868, style: 'pony', gear: 'cap', cap: 0xd85838, top: 'tee', shirt: 0xd85838, inner: 0xf8d8b8, bottom: 'skirt', pants: 0xd85838, shoes: 0xd85838, socks: 0x383838 },
  breeder: { skin: S_PALE, hair: 0x985838, style: 'short', gear: 'bandana', cap: 0x48a868, top: 'dress', shirt: 0x486848, inner: WHITE, pants: 0x588858, shoes: 0x48a868 },
  dragon: { skin: S_PALE, hair: 0x786878, style: 'short', top: 'coat', shirt: 0x584878, inner: 0x885898, pants: 0x584878, shoes: 0xb8a848 },
  ninja: { skin: S_TAN, hair: 0x583828, style: 'short', gear: 'bandana', cap: 0xe85838, top: 'tee', shirt: 0x484858, inner: 0x685878, pants: 0x484858, shoes: 0x484858, scarf: 0xe85838 },
  psychic: { skin: S_PALE, hair: 0x2c3c3c, style: 'long', top: 'tee', shirt: 0xa85898, inner: 0x685868, pants: 0x685868, shoes: S_PALE },
  scientist: { skin: S_PALE, hair: 0x485898, style: 'short', glasses: true, top: 'coat', shirt: 0xd0d0e0, inner: 0xe8e8f8, pants: 0xc8c8d8, shoes: 0x383858 },
  hiker: { skin: S_TAN, hair: 0x685858, style: 'short', gear: 'hat', cap: 0xb8a868, shirt: 0x488868, inner: 0xb8a868, pants: 0xb8a868, shoes: 0xd85838, bag: 0xe8d878 },
  cowgirl: { skin: S_PALE, hair: 0xe0c060, style: 'twin', gear: 'hat', cap: 0xa88848, shirt: 0x5868a8, inner: WHITE, pants: 0x5868a8, shoes: 0x785838 },
  artist: { skin: S_PALE, hair: 0xa8b8b8, style: 'short', gear: 'beret', cap: 0x586858, top: 'coat', shirt: 0xa88858, inner: 0xa8b8b8, pants: 0x586858, shoes: 0x383838 },
  idol: { skin: S_PALE, hair: 0x885838, style: 'short', gear: 'headband', cap: 0xe888a8, top: 'dress', shirt: 0xc85888, inner: WHITE, pants: 0xe888a8, shoes: 0xe888a8 },
  rich: { skin: S_PALE, hair: 0x585888, style: 'short', shirt: 0xf4f4f8, inner: 0x885898, pants: 0xe4e4ec, shoes: 0x585888 },
  lady: { skin: S_PALE, hair: 0x383858, style: 'long', gear: 'hat', cap: 0xf8f8f8, top: 'dress', shirt: 0xf8f8f8, inner: 0xe888b8, pants: 0xf8f0f8, shoes: 0xe8e8f8 },
  fisher: { skin: S_TAN, hair: 0x383848, style: 'short', gear: 'cap', cap: 0xe86838, shirt: 0xd87838, inner: WHITE, pants: 0xc89858, shoes: 0x484878 },
  bug: { skin: S_TAN, hair: 0x483828, style: 'short', gear: 'hat', cap: 0xc8c8a8, top: 'tee', shirt: 0xe0d8c0, inner: 0xe0d8c0, bottom: 'shorts', pants: 0x383848, shoes: 0xc89858, bag: 0x485848 },
  swimmer: { skin: S_PALE, hair: 0xb89858, style: 'bun', top: 'tee', shirt: 0x3898d8, inner: 0x3898d8, bottom: 'shorts', pants: 0x3898d8, shoes: S_TAN, bag: 0xd85858 },
  lass: { skin: S_PALE, hair: 0x787848, style: 'long', top: 'tee', shirt: 0x484858, inner: WHITE, bottom: 'skirt', pants: 0xe86838, shoes: 0x383828, socks: 0x484858 },
  youngster: { skin: S_PALE, hair: 0x886848, style: 'short', gear: 'cap', cap: 0x4868d8, top: 'tee', shirt: 0xe85848, inner: 0xe85848, bottom: 'shorts', pants: 0x3848a8, shoes: 0x3848a8 },
};

const SKINS = [0xf6d0a8, 0xe8b88c, 0xc88c5c, S_DARK, 0xffe0c8] as const;
const HAIRS = [0x3a2a1a, 0x1a1a24, 0x6a3a1a, 0xd8b060, 0xb8482a, 0x5a3a8a, 0x2a4a7a] as const;
const SHIRTS = [0x3a6ad8, 0xe86aa0, 0xf2c84a, 0xe86a3a, 0x4ac8c8, 0x4aa84a, 0x8a5ad8, 0xe04040] as const;
const CAPS = [0xe04040, 0xf6f6f6, 0x4aa84a, 0x3a3a4a, 0x8a5ad8, 0x3a8ad8, 0xf2c84a] as const;
const PANTS = [0x3a3a4a, 0x2a2a3a, 0x4a5a8a, 0x6a4a28, 0x3a6ad8, 0x5a5a68] as const;
const STYLES: readonly HairStyle[] = ['short', 'long', 'spiky', 'bun', 'twin', 'pony'];
const GEARS: readonly HeadGear[] = ['cap', 'cap', 'beanie', 'visor', 'bandana', 'none'];

function mix(id: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

/** O visual do treinador escolhido; um id fora da lista cai numa combinação própria (sempre a mesma para o mesmo id). */
export function outfitFor(trainerId: string): Outfit {
  const look = LOOKS[trainerId];
  if (look) return build(look);
  const pick = <T,>(list: readonly T[], salt: number): T => list[mix(trainerId, salt) % list.length]!;
  return build({
    skin: pick(SKINS, 41),
    hair: pick(HAIRS, 37),
    style: pick(STYLES, 71),
    gear: pick(GEARS, 83),
    cap: pick(CAPS, 11),
    shirt: pick(SHIRTS, 23),
    pants: pick(PANTS, 53),
    shoes: 0x5a3a24,
    bag: pick(CAPS, 61),
  });
}

/** Os ids de treinador que têm visual próprio (os testes conferem que são todos os do perfil). */
export const LOOK_IDS: readonly string[] = Object.keys(LOOKS);

// ----------------------------------------------------------------------------- o desenho

const INK = 0x1a1a24;

/** Luz de cima e sombra embaixo, como nos móveis. */
function shadeBuf(buf: PixelBuf): void {
  const a = (x: number, y: number) => (x >= 0 && y >= 0 && x < buf.w && y < buf.h ? (buf.data[(y * buf.w + x) * 4 + 3] ?? 0) : 0);
  const edits: [number, number, number][] = [];
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) if (a(x, y) > 0) { if (a(x, y - 1) === 0) edits.push([x, y, 1]); else if (a(x, y + 1) === 0) edits.push([x, y, -1]); }
  for (const [x, y, dir] of edits) {
    const i = (y * buf.w + x) * 4;
    for (let k = 0; k < 3; k++) {
      const v = buf.data[i + k] ?? 0;
      buf.data[i + k] = dir > 0 ? Math.min(255, Math.round(v + (255 - v) * 0.18)) : Math.round(v * 0.82);
    }
  }
}

function flipX(buf: PixelBuf): PixelBuf {
  const out = createBuf(buf.w, buf.h);
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) for (let k = 0; k < 4; k++) out.data[(y * buf.w + x) * 4 + k] = buf.data[(y * buf.w + (buf.w - 1 - x)) * 4 + k] ?? 0;
  return out;
}

type View = 'front' | 'back' | 'side';

/** O cabelo por cima da cabeça já desenhada: `front` deixa o rosto à mostra, `back` cobre tudo, `side` cobre a nuca. */
function hair(buf: PixelBuf, o: Outfit, view: View): void {
  if (o.style === 'bald') return;
  const h = o.hair;
  const hs = mul(h, 0.78);
  for (let y = 1; y < 15; y++) {
    for (let x = 2; x < 14; x++) {
      if (((x - 8) / 5.2) ** 2 + ((y - 7.5) / 5) ** 2 > 1) continue;
      const on = view === 'back' ? true : view === 'front' ? y <= 6 || (Math.abs(x - 8) >= 4 && y <= 9) : x <= 7 || y <= 5;
      if (on) put(buf, x, y, y >= 10 ? hs : h);
    }
  }
  for (const x of view === 'side' ? [4, 5, 6] : [6, 7, 8]) put(buf, x, 3, mul(h, 1.3));
  const cx = view === 'side' ? 5 : 8;
  if (o.style === 'spiky') for (const dx of [-4, -1, 2, 4]) rect(buf, cx + dx, dx === -1 ? 0 : 1, 2, 3, h);
  if (o.style === 'bun') disc(buf, cx, 1.5, 2.2, 2.2, h);
  if (o.style === 'long') {
    rect(buf, 2, 7, 3, 8, hs);
    if (view !== 'side') rect(buf, 11, 7, 3, 8, hs);
    if (view === 'back') rect(buf, 4, 11, 8, 4, hs);
  }
  if (o.style === 'twin') {
    if (view === 'side') disc(buf, 3, 10, 1.7, 3.2, hs);
    else {
      disc(buf, 1.8, 9.5, 1.6, 3.2, hs);
      disc(buf, 14.2, 9.5, 1.6, 3.2, hs);
    }
  }
  if (o.style === 'pony') {
    if (view === 'side') {
      rect(buf, 1, 6, 3, 3, h);
      rect(buf, 0, 9, 3, 5, hs);
    } else if (view === 'back') {
      rect(buf, 7, 11, 2, 7, hs);
      rect(buf, 7, 10, 2, 1, mul(h, 1.2));
    } else {
      rect(buf, 12, 5, 3, 3, h);
      rect(buf, 13, 8, 2, 5, hs);
    }
  }
}

function gear(buf: PixelBuf, o: Outfit, view: View): void {
  const c = o.cap;
  const cs = o.capShade;
  const front = view === 'front';
  const back = view === 'back';
  const side = view === 'side';
  const mid = side ? 7 : 8;
  switch (o.gear) {
    case 'cap':
      disc(buf, mid, 4, 5.2, 3.2, c);
      rect(buf, 3, 4, side ? 9 : 10, 1, c);
      rect(buf, 3, 5, side ? 9 : 10, 1, cs);
      if (front) { rect(buf, 3, 6, 10, 1, cs); disc(buf, 8, 3.2, 1.4, 1.4, 0xffffff); put(buf, 8, 3, c); }
      else if (back) rect(buf, 6, 5, 4, 1, mul(c, 1.2));
      else { rect(buf, 10, 5, 5, 2, cs); rect(buf, 11, 5, 4, 1, mul(c, 1.1)); }
      break;
    case 'beanie':
      disc(buf, mid, 4.2, 5, 3.4, c);
      rect(buf, 3, 5, side ? 9 : 10, 2, cs);
      for (let x = 3; x < 13; x += 2) put(buf, x, 5, mul(c, 1.15));
      disc(buf, side ? 6 : 8, 0.8, 1.6, 1.6, 0xf6f6f6);
      break;
    case 'visor':
      rect(buf, 3, 4, side ? 9 : 10, 2, c);
      if (front) rect(buf, 3, 6, 10, 1, cs);
      else if (side) rect(buf, 10, 5, 5, 2, cs);
      else rect(buf, 6, 5, 4, 1, mul(c, 1.2));
      if (front) put(buf, 8, 4, 0xffffff);
      break;
    case 'bandana':
      rect(buf, 3, 4, side ? 9 : 10, 2, c);
      if (front) { rect(buf, 3, 6, 10, 1, cs); rect(buf, 13, 5, 2, 3, c); }
      else if (back) rect(buf, 7, 6, 2, 4, c);
      else rect(buf, 1, 5, 3, 4, c);
      break;
    case 'hat':
      disc(buf, mid, 3.2, 4.2, 2.8, c);
      rect(buf, 1, 5, 14, 1, c);
      rect(buf, 2, 6, 12, 1, cs);
      rect(buf, side ? 4 : 4, 4, 8, 1, cs);
      break;
    case 'headband':
      rect(buf, 3, 5, side ? 9 : 10, 1, c);
      if (front) { rect(buf, 1, 6, 2, 4, c); rect(buf, 13, 6, 2, 4, c); }
      else rect(buf, 1, 6, 3, 5, c);
      break;
    case 'beret':
      disc(buf, side ? 7 : 9, 3.2, 5.2, 2.5, c);
      rect(buf, side ? 5 : 3, 5, 8, 1, cs);
      rect(buf, 10, 0, 2, 1, cs);
      break;
    default:
      break;
  }
}

/** Seu personagem, 16×24, olhando para `dir`; `step` alterna as pernas e os braços ao andar (−1 = parado). */
export function paintPlayer(dir: Dir, step: number, o: Outfit): PixelBuf {
  const side = dir === 'left' || dir === 'right';
  const back = dir === 'up';
  const ph = step < 0 ? -1 : step % 2;
  const buf = createBuf(16, 24);
  const skin = o.skin;
  const skinS = mul(skin, 0.86);
  const pants = o.pants;
  const pantsS = mul(pants, 0.78);
  const legCol = o.socks ?? skin;
  const long = o.top === 'dress' || o.top === 'coat';
  const skirtRows = long ? 3 : o.bottom === 'skirt' && o.top !== 'gi' ? 2 : 0;
  /** Quantas linhas da perna (a partir da 19) são a roupa de baixo. */
  const cover = skirtRows > 0 ? 0 : o.bottom === 'pants' ? 3 : 1;
  const sleeves = o.top === 'jacket' || o.top === 'coat' || o.top === 'gi';

  const leg = (x: number, w: number, lift: number, dark: boolean): void => {
    const rows = 3 - lift;
    const c = Math.min(cover, rows);
    rect(buf, x, 19, w, c, dark ? pantsS : pants);
    rect(buf, x, 19 + c, w, rows - c, dark ? mul(legCol, 0.86) : legCol);
  };
  const skirt = (x0: number, x1: number): void => {
    if (skirtRows === 0) return;
    rect(buf, x0 + 1, 18, x1 - x0 - 1, 1, pants);
    for (let r = 1; r < skirtRows; r++) rect(buf, x0, 18 + r, x1 - x0 + 1, 1, r === skirtRows - 1 ? mul(pants, 0.8) : pants);
  };
  const lArm = ph === 0 ? -1 : ph === 1 ? 1 : 0;

  if (!side) {
    const lUp = ph === 0 ? 1 : 0;
    const rUp = ph === 1 ? 1 : 0;
    leg(5, 3, lUp, false);
    leg(8, 3, rUp, true);
    rect(buf, 4, 22 - lUp, 4, 2, o.shoes);
    rect(buf, 8, 22 - rUp, 4, 2, o.shoes);
    // Torso.
    rect(buf, 4, 12, 8, 6, o.shirt);
    rect(buf, 4, 17, 8, 1, o.shirtShade);
    if (skirtRows === 0) rect(buf, 4, 18, 8, 1, mul(pants, 0.7));
    skirt(3, 12);
    if (!back) {
      if (o.top === 'jacket' || o.top === 'coat') {
        rect(buf, 7, 12, 2, 4, o.inner);
        rect(buf, 8, 14, 1, 4, o.shirtShade);
        rect(buf, 5, 15, 2, 2, o.shirtShade);
        if (o.top === 'jacket') put(buf, 8, 18, 0xffd84a);
      } else if (o.top === 'gi') {
        rect(buf, 7, 12, 2, 3, o.inner);
        rect(buf, 4, 17, 8, 1, o.accent);
        rect(buf, 7, 18, 2, 2, o.accent);
      } else {
        rect(buf, 7, 12, 2, 1, skinS);
        if (o.inner !== o.shirt) rect(buf, 4, 14, 8, 1, o.inner);
        if (o.top === 'dress') rect(buf, 4, 12, 8, 1, o.inner);
      }
    } else {
      rect(buf, 4, 12, 8, 1, o.shirtShade);
      if (o.bag) {
        rect(buf, 5, 13, 6, 5, o.accent);
        rect(buf, 5, 13, 6, 1, mul(o.accent, 1.2));
        rect(buf, 5, 17, 6, 1, mul(o.accent, 0.7));
        rect(buf, 7, 14, 2, 2, mul(o.accent, 0.8));
      } else {
        rect(buf, 8, 13, 1, 5, o.shirtShade);
        if (o.top === 'gi') rect(buf, 4, 17, 8, 1, o.accent);
      }
    }
    if (o.scarf !== null) {
      rect(buf, 5, 11, 6, 2, o.scarf);
      rect(buf, 5, 12, 6, 1, mul(o.scarf, 0.85));
      if (!back) rect(buf, 9, 13, 2, 4, o.scarf);
    }
    // Braços.
    const armLen = sleeves ? 5 : 2;
    rect(buf, 2, 13 + lArm, 2, armLen, o.shirt);
    rect(buf, 12, 13 - lArm, 2, armLen, o.shirt);
    rect(buf, 2, 13 + armLen + lArm, 2, 7 - armLen, skin);
    rect(buf, 12, 13 + armLen - lArm, 2, 7 - armLen, skin);
    // Cabeça.
    disc(buf, 8, 7.5, 4.6, 4.4, skin);
    if (back) hair(buf, o, 'back');
    else {
      rect(buf, 7, 12, 2, 1, skinS);
      hair(buf, o, 'front');
      for (const x of [5, 9]) {
        rect(buf, x, 8, 2, 2, INK);
        put(buf, x, 8, 0xffffff);
      }
      put(buf, 4, 10, 0xf2a0a0);
      put(buf, 11, 10, 0xf2a0a0);
      rect(buf, 7, 11, 2, 1, 0xa84a4a);
      if (o.glasses) {
        // Armação fina: barra em cima dos olhos, ponte no meio e hastes.
        rect(buf, 4, 7, 8, 1, 0x4a4a5a);
        rect(buf, 7, 8, 2, 1, 0x4a4a5a);
        put(buf, 3, 8, 0x4a4a5a);
        put(buf, 12, 8, 0x4a4a5a);
      }
    }
    gear(buf, o, back ? 'back' : 'front');
  } else {
    // De lado (desenhado olhando para a direita; a esquerda é o espelho).
    const stride = ph === 0 ? 1 : ph === 1 ? -1 : 0;
    const rowsB = ph < 0 ? 3 : 2 + (stride > 0 ? 0 : 1);
    const rowsF = ph < 0 ? 3 : 2 + (stride < 0 ? 0 : 1);
    const legSide = (x: number, rows: number, dark: boolean): void => {
      const c = Math.min(cover, rows);
      rect(buf, x, 19, 3, c, dark ? pantsS : pants);
      rect(buf, x, 19 + c, 3, rows - c, dark ? mul(legCol, 0.86) : legCol);
    };
    legSide(5 - stride, rowsB, true);
    rect(buf, 4 - stride, ph < 0 ? 22 : stride > 0 ? 21 : 22, 4, 2, o.shoes);
    legSide(8 + stride, rowsF, false);
    rect(buf, 8 + stride, ph < 0 ? 22 : stride < 0 ? 21 : 22, 5, 2, o.shoes);
    if (o.bag) {
      rect(buf, 2, 13, 3, 6, o.accent);
      rect(buf, 2, 13, 3, 1, mul(o.accent, 1.2));
    }
    rect(buf, 4, 12, 8, 6, o.shirt);
    rect(buf, 4, 17, 8, 1, o.shirtShade);
    if (skirtRows === 0) rect(buf, 4, 18, 8, 1, mul(pants, 0.7));
    skirt(3, 12);
    if (o.top === 'gi') rect(buf, 4, 17, 8, 1, o.accent);
    if (o.scarf !== null) {
      rect(buf, 4, 11, 7, 2, o.scarf);
      rect(buf, 4, 12, 7, 1, mul(o.scarf, 0.85));
      rect(buf, 1, 12, 4, 3, o.scarf);
    }
    const armLenS = sleeves ? 5 : 2;
    rect(buf, 6 + stride, 13, 3, armLenS, o.shirtShade);
    rect(buf, 6 + stride, 13 + armLenS, 3, 7 - armLenS, skin);
    disc(buf, 8, 7.5, 4.6, 4.4, skin);
    rect(buf, 12, 9, 1, 1, skin);
    hair(buf, o, 'side');
    rect(buf, 10, 8, 2, 2, INK);
    put(buf, 10, 8, 0xffffff);
    put(buf, 10, 10, 0xf2a0a0);
    rect(buf, 11, 11, 2, 1, 0xa84a4a);
    if (o.glasses) {
      rect(buf, 9, 7, 4, 1, 0x4a4a5a);
      rect(buf, 5, 8, 4, 1, 0x4a4a5a);
    }
    gear(buf, o, 'side');
  }
  shadeBuf(buf);
  outline(buf, INK);
  return dir === 'left' ? flipX(buf) : buf;
}
