/**
 * Onde cada acessório vai no corpo, para qualquer sprite (Pokémon de qualquer tamanho ou o treinador). O desenho do
 * acessório tem tamanho real em pixels e é desenhado com o pixel do mesmo tamanho do tileset da Vila (`unit`); a
 * posição sai de uma âncora genérica relativa à caixa do corpo e ao topo da cabeça, sem ajuste por espécie.
 *
 * Âncoras: `hat` assenta sobre a cabeça; `ear` fica no alto da cabeça, de lado (laços, flores, presilhas); `face` na
 * altura dos olhos; `mouth` logo abaixo; `neck` na base da cabeça; `chest` no peito; `waist` na cintura; `back` atrás
 * do corpo (capas, asas, mochilas); `hand` ao lado do corpo, como algo segurado.
 */

export type AccessoryPos = 'hat' | 'ear' | 'face' | 'mouth' | 'neck' | 'chest' | 'waist' | 'back' | 'hand';

export const ACCESSORY_POSITIONS: readonly AccessoryPos[] = ['hat', 'ear', 'face', 'mouth', 'neck', 'chest', 'waist', 'back', 'hand'];

/** Nome de cada lugar na interface. */
export const ACCESSORY_POS_NAMES: Record<AccessoryPos, string> = {
  hat: 'Cabeça', ear: 'Enfeite de cabelo', face: 'Olhos', mouth: 'Boca', neck: 'Pescoço', chest: 'Peito', waist: 'Cintura', back: 'Costas', hand: 'Na mão',
};

/** Caixa do corpo na tela (pixels opacos do sprite) e o topo/centro da cabeça. */
export interface BodyBox {
  left: number;
  top: number;
  w: number;
  h: number;
  /** Centro horizontal da cabeça (pixels de tela). */
  headX: number;
  /** Primeira linha opaca da cabeça (pixels de tela). */
  headTop: number;
}

/** Para onde o corpo olha na tela: de frente, de costas ou de perfil para um dos lados. */
export type Facing = 'front' | 'back' | 'left' | 'right';

export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Desenhar antes do corpo (fica atrás). */
  behind: boolean;
  /** Não aparece nesta pose (ex.: óculos de costas). */
  hidden: boolean;
}

/** Altura estimada da cabeça: metade do corpo nos altos, quase o corpo todo nos redondos e baixinhos. */
export function headHeight(body: BodyBox): number {
  return Math.max(1, Math.min(body.h * 0.5, body.w * 0.85));
}

/**
 * Retângulo do acessório na tela. `art` em pixels do desenho; `unit` = tamanho na tela de um pixel do tileset;
 * `nudge` = ajuste fino do item, em pixels do desenho.
 */
export function placeAccessory(pos: AccessoryPos, art: { w: number; h: number }, unit: number, body: BodyBox, facing: Facing = 'front', nudge: { dx?: number; dy?: number } = {}): Placement {
  const w = art.w * unit;
  const h = art.h * unit;
  const head = headHeight(body);
  const cx = body.headX;
  const bodyCx = body.left + body.w / 2;
  const bottom = body.top + body.h;
  const front = facing !== 'back';
  // De perfil: +1 se olha para a direita, -1 para a esquerda (o lado da frente do corpo).
  const side = facing === 'right' ? 1 : facing === 'left' ? -1 : 0;
  let x = cx - w / 2;
  let y = body.headTop;
  let behind = false;
  let hidden = false;
  switch (pos) {
    case 'hat':
      // A aba assenta um pouco abaixo do topo, para o chapéu "vestir" a cabeça em vez de flutuar.
      y = body.headTop - h + Math.min(h * 0.45, head * 0.3);
      break;
    case 'ear':
      // De frente fica de um lado da cabeça; de perfil, no lado de trás (o que aparece).
      x = cx + (side === 0 ? head * 0.3 : -side * head * 0.2) - w / 2;
      y = body.headTop - h * 0.35;
      break;
    case 'face':
      x = cx + side * body.w * 0.18 - w / 2;
      y = body.headTop + head * 0.5 - h / 2;
      hidden = !front;
      break;
    case 'mouth':
      x = cx + side * body.w * 0.2 - w / 2;
      y = body.headTop + head * 0.78 - h / 2;
      hidden = !front;
      break;
    case 'neck':
      y = body.headTop + head * 0.95 - h * 0.3;
      break;
    case 'chest':
      y = body.headTop + head + (bottom - body.headTop - head) * 0.25 - h / 2;
      hidden = !front;
      break;
    case 'waist':
      x = bodyCx - w / 2;
      y = body.top + body.h * 0.66 - h / 2;
      break;
    case 'back':
      // Atrás dos ombros (aparece por cima deles e pelos lados); de perfil, desloca para as costas.
      x = bodyCx - side * body.w * 0.3 - w / 2;
      y = body.headTop + head * 0.55;
      behind = front;
      break;
    case 'hand':
      // Segura pela parte de baixo do desenho, ao lado do corpo (de perfil, do lado da frente).
      x = (side === 0 ? body.left + body.w * 0.9 : bodyCx + side * body.w * 0.4) - w / 2;
      y = body.top + body.h * 0.62 - h * 0.75;
      behind = !front;
      break;
  }
  x += (nudge.dx ?? 0) * unit;
  y += (nudge.dy ?? 0) * unit;
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), behind, hidden };
}

/** Acessórios de cabeça tiram o boné/chapéu próprio do treinador (senão um fica por cima do outro). */
export const replacesHeadGear = (pos: AccessoryPos | undefined): boolean => pos === 'hat';
