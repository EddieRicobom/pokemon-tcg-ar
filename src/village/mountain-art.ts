import { createBuf } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';
import { put, rect } from './village-art';
import { inkOutline } from './building-style';

/**
 * Peças desenhadas por código da Montanha do Mew (o resto da montanha são recortes de `tilesets/All Cliffs.png`, ver
 * `atlas-spec.ts`). A estátua do topo: pedestal de pedra cinza-lilás em 3/4 (tampo, face com plaquinha e um degrau
 * mais largo) e o Mew de pedra clara sentado em cima, com as orelhas grandes, os pés para a frente e a cauda longa
 * subindo em S por trás até a ponta oval acima da cabeça. Mesmo contorno e sombreado dos prédios (`building-style.ts`),
 * sem cores vivas. 32×48, base apoiada na última linha.
 */

export const MEW_STATUE_W = 32;
export const MEW_STATUE_H = 48;

/** Pedra do Mew (clara) e do pedestal (mais escura), do claro ao escuro. */
const MEW = [0xf0ecf4, 0xd8d0e2, 0xb6acc8, 0x928aa6] as const;
const BASE = [0xd0cad6, 0xb2aabc, 0x908aa0, 0x6e6880] as const;

/** Os olhos do Mew: o jogo acende este retângulo de leve à noite. Em pixels do desenho. */
export const MEW_STATUE_GLOW = { x: 11, y: 11, w: 7, h: 3 } as const;

/** Mancha do Mew (máscara), para sombrear depois pela vizinhança. */
function mewMask(): boolean[] {
  const m: boolean[] = Array.from({ length: MEW_STATUE_W * MEW_STATUE_H }, () => false);
  const set = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < MEW_STATUE_W && y < MEW_STATUE_H) m[y * MEW_STATUE_W + x] = true; };
  const ellipse = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) set(x, y);
    }
  };
  const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
    for (let y = 0; y < MEW_STATUE_H; y++) for (let x = 0; x < MEW_STATUE_W; x++) {
      const px = x + 0.5, py = y + 0.5;
      const s1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      const s2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
      const s3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
      if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) set(x, y);
    }
  };
  // Cabeça grande e redonda, com as orelhas largas apontando para cima e para fora.
  ellipse(14.5, 11.5, 6.6, 5.8);
  tri(6.5, 2.5, 8.8, 9.5, 12.5, 6.5);
  tri(22.5, 2.5, 16.5, 6.5, 20.2, 9.5);
  // Corpo pequeno, bracinhos junto ao peito e os pés grandes para a frente, apoiados no tampo.
  ellipse(14.8, 20.5, 3.6, 4.4);
  ellipse(11.2, 19.2, 1.3, 1.1);
  ellipse(18.4, 19.2, 1.3, 1.1);
  ellipse(12.6, 25, 1.4, 2.2);
  ellipse(17, 25, 1.4, 2.2);
  ellipse(11.4, 27.2, 2.4, 1.3);
  ellipse(18.2, 27.2, 2.4, 1.3);
  // Cauda: sai das costas, vai para a direita e sobe em S até a ponta oval no alto.
  const tail: readonly (readonly [number, number])[] = [[17.5, 23], [21, 24.5], [24, 23.5], [26, 20.5], [26.6, 16.5], [25.8, 12.5], [24.4, 9], [24.4, 5.5], [25.8, 3.6]];
  for (let i = 0; i + 1 < tail.length; i++) {
    const [ax, ay] = tail[i]!;
    const [bx, by] = tail[i + 1]!;
    for (let s = 0; s <= 8; s++) ellipse(ax + ((bx - ax) * s) / 8, ay + ((by - ay) * s) / 8, 0.9, 0.9);
  }
  ellipse(27, 2.9, 2.2, 2.5);
  return m;
}

function paintPedestal(b: PixelBuf): void {
  // Degrau de baixo, mais largo: tampo claro e face.
  rect(b, 1, 41, 30, 2, BASE[0]);
  rect(b, 1, 43, 30, 4, BASE[1]);
  rect(b, 25, 43, 6, 4, BASE[2]);
  rect(b, 1, 46, 30, 1, BASE[3]);
  // Bloco do pedestal: tampo visto de cima, face da frente e a lateral direita na sombra.
  rect(b, 4, 27, 24, 4, BASE[0]);
  rect(b, 4, 27, 24, 1, MEW[1]);
  rect(b, 4, 31, 24, 10, BASE[1]);
  rect(b, 4, 31, 24, 1, BASE[2]);
  rect(b, 24, 31, 4, 10, BASE[2]);
  rect(b, 4, 40, 24, 1, BASE[3]);
  // Plaquinha com o nome gravado (traços).
  rect(b, 9, 33, 12, 6, BASE[3]);
  rect(b, 10, 34, 10, 4, BASE[2]);
  rect(b, 11, 35, 3, 1, BASE[0]);
  rect(b, 15, 35, 4, 1, BASE[0]);
  rect(b, 12, 37, 6, 1, BASE[1]);
  // Fissuras e lascas da pedra velha.
  put(b, 6, 36, BASE[2]);
  put(b, 7, 37, BASE[2]);
  put(b, 26, 44, BASE[3]);
  put(b, 3, 44, BASE[2]);
}

export function paintMewStatue(): PixelBuf {
  const b = createBuf(MEW_STATUE_W, MEW_STATUE_H);
  paintPedestal(b);
  const m = mewMask();
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < MEW_STATUE_W && y < MEW_STATUE_H && m[y * MEW_STATUE_W + x]!;
  for (let y = 0; y < MEW_STATUE_H; y++) for (let x = 0; x < MEW_STATUE_W; x++) {
    if (!at(x, y)) continue;
    // Luz de cima-esquerda: borda de cima/esquerda clara, de baixo/direita escura, o resto no meio-tom.
    const lit = !at(x - 1, y - 1) || !at(x, y - 1);
    const shade = !at(x + 1, y + 1) || !at(x + 1, y);
    put(b, x, y, shade && !lit ? MEW[2] : lit && !shade ? MEW[0] : MEW[1]);
  }
  // Sulcos que separam a cabeça do corpo, as pernas e o miolo das orelhas.
  for (const [x, y] of [[12, 17], [13, 17], [16, 17], [17, 17], [9, 7], [10, 8], [20, 7], [19, 8], [12, 20], [17, 20]] as const) put(b, x, y, MEW[2]);
  for (const [x, y] of [[14, 26], [15, 26], [17, 22], [9, 27], [20, 27]] as const) put(b, x, y, MEW[3]);
  // Olhos grandes entalhados (o retângulo de `MEW_STATUE_GLOW`) e o focinho.
  rect(b, 11, 11, 2, 3, MEW[3]);
  rect(b, 16, 11, 2, 3, MEW[3]);
  put(b, 11, 11, MEW[2]);
  put(b, 16, 11, MEW[2]);
  put(b, 14, 14, MEW[2]);
  put(b, 15, 14, MEW[2]);
  // Sombra do Mew no tampo do pedestal.
  for (const x of [9, 10, 19, 20, 21]) put(b, x, 28, BASE[1]);
  inkOutline(b);
  return b;
}
