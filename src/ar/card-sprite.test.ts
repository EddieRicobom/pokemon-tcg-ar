import { LinearFilter, Matrix4, NearestFilter, Quaternion, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { encodeGif } from '../core/__fixtures__/encode-gif';
import type { Rgb } from '../core/__fixtures__/encode-gif';
import { decodeGif } from '../core/gif';
import { cardSpaceMatrix, DEFAULT_LAYOUT } from './anchor';
import { CardSprite } from './card-sprite';
import { makePlaceholder } from './placeholder';

const PALETTE: [Rgb, Rgb, Rgb, Rgb] = [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255]];

/** GIF 2×1: quadro 1 vermelho (100 ms), quadro 2 azul (300 ms), quadro 3 verde (100 ms). */
function threeFrameGif() {
  const frame = (color: number, delayCs: number) => ({ left: 0, top: 0, width: 2, height: 1, indices: [color, color], delayCs, disposal: 1 });
  return decodeGif(encodeGif(2, 1, PALETTE, [frame(1, 10), frame(3, 30), frame(2, 10)]));
}

const pixelsOf = (sprite: CardSprite) => (sprite.mesh.material.map!.image as { data: Uint8Array }).data;

function planeCorners(sprite: CardSprite): Vector3[] {
  const m = sprite.worldMatrixOfPlane();
  return [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, y]) => new Vector3(x, y, 0).applyMatrix4(m));
}

describe('CardSprite: orientação', () => {
  const layout = { ...DEFAULT_LAYOUT, offsetX: 0, offsetY: 0, heightRatio: 0.8, anchor: 'base' as const, tiltDeg: 0 };

  it('plano vertical com a base na carta, sem deitar sobre ela', () => {
    const sprite = new CardSprite();
    sprite.setAnimation(threeFrameGif()); // 2×1 → proporção 2
    sprite.setLayout(layout);
    const [bl, br, tr, tl] = planeCorners(sprite);
    expect(bl!.z).toBeCloseTo(0, 6);
    expect(br!.z).toBeCloseTo(0, 6);
    expect(tr!.z).toBeCloseTo(0.8, 6);
    expect(tl!.z).toBeCloseTo(0.8, 6);
    // Todos no mesmo y: o plano é vertical (XZ), não está inclinado.
    expect(Math.abs(bl!.y - tr!.y)).toBeLessThan(1e-9);
    // Largura = altura × proporção (2).
    expect(br!.x - bl!.x).toBeCloseTo(1.6, 6);
  });

  it('a imagem não fica espelhada para quem olha a carta de frente (de baixo para cima)', () => {
    const sprite = new CardSprite();
    sprite.setStatic(makePlaceholder(8));
    sprite.setLayout(layout);
    const m = sprite.worldMatrixOfPlane();
    const right = new Vector3(1, 0, 0).transformDirection(m); // lado direito da imagem
    const up = new Vector3(0, 1, 0).transformDirection(m); // topo da imagem
    const normal = new Vector3(0, 0, 1).transformDirection(m); // para onde a imagem "olha"
    expect(right.x).toBeGreaterThan(0.99);
    expect(up.z).toBeGreaterThan(0.99);
    expect(normal.y).toBeLessThan(-0.99);
    // Observador em −Y olhando para +Y, com o topo da carta à frente: direita da imagem = +X (sem espelhar).
    const viewerRight = new Vector3(0, 1, 0).cross(new Vector3(0, 0, 1));
    expect(viewerRight.x).toBeGreaterThan(0.99);
  });

  it('segue o movimento e a rotação da carta (a matriz do rastreamento move o conjunto)', () => {
    const sprite = new CardSprite();
    sprite.setStatic(makePlaceholder(8));
    sprite.setLayout({ ...layout, heightRatio: 1 });
    // Carta a 5 unidades da câmera, girada 90° em Z: o "alto" do sprite continua perpendicular à carta.
    const world = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, -5, 1];
    sprite.setCardMatrix(cardSpaceMatrix(world, 1, 1.375));
    const m = sprite.worldMatrixOfPlane();
    const base = new Vector3(0, -0.5, 0).applyMatrix4(m);
    const top = new Vector3(0, 0.5, 0).applyMatrix4(m);
    expect(top.z - base.z).toBeCloseTo(1, 6);
    expect(Math.hypot(top.x - base.x, top.y - base.y)).toBeCloseTo(0, 6);
    // A base acompanha o centro da carta (a origem do espaço da carta no mundo).
    const cardCenter = new Vector3(0, 0, 0).applyMatrix4(sprite.group.matrix);
    expect(base.distanceTo(new Vector3(cardCenter.x, cardCenter.y, cardCenter.z))).toBeCloseTo(0, 6);
  });

  it('escala, deslocamento, elevação e rotação configuráveis mudam o plano', () => {
    const sprite = new CardSprite();
    sprite.setStatic(makePlaceholder(8));
    sprite.setLayout({ heightRatio: 0.5, offsetX: 0.2, offsetY: 0.1, lift: 0.05, yawDeg: 90, anchor: 'base' });
    const [bl, , tr] = planeCorners(sprite);
    expect(bl!.z).toBeCloseTo(0.05, 6);
    expect(tr!.z).toBeCloseTo(0.55, 6);
    const normal = new Vector3(0, 0, 1).transformDirection(sprite.worldMatrixOfPlane());
    expect(normal.x).toBeGreaterThan(0.99); // girou 90° em torno da carta
  });

  it('layout absurdo é limitado, não quebra a cena', () => {
    const sprite = new CardSprite();
    sprite.setStatic(makePlaceholder(8));
    sprite.setLayout({ heightRatio: 1e9, offsetX: Number.NaN, offsetY: 0, lift: 0, yawDeg: 0, anchor: 'base' });
    expect(sprite.getLayout().heightRatio).toBeLessThanOrEqual(1.6);
    expect(planeCorners(sprite).every((p) => Number.isFinite(p.x + p.y + p.z))).toBe(true);
  });
});

describe('CardSprite: suavização da pose', () => {
  const at = (x: number) => cardSpaceMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, -5, 1], 1, 1.375);
  // O espaço da carta tem origem no canto; o centro fica deslocado em meia largura (0,5).
  const px = (sprite: CardSprite) => sprite.group.matrix.elements[12]! - 0.5;

  it('a primeira pose aparece direto no lugar (sem deslizar da origem)', () => {
    const sprite = new CardSprite();
    sprite.setStatic(makePlaceholder(8));
    sprite.setCardMatrix(at(2));
    expect(px(sprite)).toBeCloseTo(2, 6);
  });

  it('uma pose nova é alcançada aos poucos, a cada quadro de tela, sem passar do alvo', () => {
    const sprite = new CardSprite();
    sprite.setStatic(makePlaceholder(8));
    sprite.setCardMatrix(at(0));
    sprite.update(1000);
    sprite.setCardMatrix(at(1));
    expect(px(sprite)).toBeCloseTo(0, 6);
    sprite.update(1016);
    const step1 = px(sprite);
    expect(step1).toBeGreaterThan(0.1);
    expect(step1).toBeLessThan(0.5);
    sprite.update(1032);
    expect(px(sprite)).toBeGreaterThan(step1);
    for (let t = 1100; t < 2000; t += 50) sprite.update(t);
    expect(px(sprite)).toBeCloseTo(1, 3);
  });

  it('depois de perder a carta, a próxima pose aparece direto no lugar novo', () => {
    const sprite = new CardSprite();
    sprite.setStatic(makePlaceholder(8));
    sprite.setCardMatrix(at(0));
    sprite.setTracked(false);
    sprite.setCardMatrix(at(3));
    expect(px(sprite)).toBeCloseTo(3, 6);
  });
});

describe('CardSprite: animação do GIF', () => {
  it('envia à textura o quadro certo em cada instante, respeitando os atrasos, e dá a volta', () => {
    const sprite = new CardSprite();
    const gif = threeFrameGif();
    expect(gif.durationMs).toBe(500);
    sprite.setAnimation(gif, 1000);
    const frameAt = (t: number) => {
      sprite.update(1000 + t);
      return sprite.currentFrame;
    };
    expect(frameAt(0)).toBe(0);
    expect(frameAt(99)).toBe(0);
    expect(frameAt(100)).toBe(1);
    expect(frameAt(399)).toBe(1);
    expect(frameAt(400)).toBe(2);
    expect(frameAt(499)).toBe(2);
    expect(frameAt(500)).toBe(0); // volta ao início (laço)
    expect(frameAt(2150)).toBe(1); // vários ciclos depois
  });

  it('só reenvia a textura quando o quadro muda e usa os pixels do quadro (animação contínua, não imagem parada)', () => {
    const sprite = new CardSprite();
    sprite.setAnimation(threeFrameGif(), 0);
    expect(sprite.update(10)).toBe(false);
    expect(sprite.update(50)).toBe(false);
    expect(sprite.update(120)).toBe(true);
    expect(pixelsOf(sprite)[2]).toBe(255); // quadro azul (índice 3 da paleta)
    expect(sprite.update(130)).toBe(false);
    expect(sprite.update(420)).toBe(true);
    expect(pixelsOf(sprite)[1]).toBe(255); // quadro verde
    expect(sprite.uploads).toBe(2);
  });

  it('preserva a transparência (alpha 0 no GIF vira alpha 0 na textura) e usa alphaTest', () => {
    const data = encodeGif(2, 1, PALETTE, [{ left: 0, top: 0, width: 2, height: 1, indices: [0, 1], delayCs: 10, disposal: 1, transparentIndex: 0 }]);
    const sprite = new CardSprite();
    sprite.setLayout({ ...DEFAULT_LAYOUT, smoothing: 'nitido' });
    sprite.setAnimation(decodeGif(data));
    const pixels = pixelsOf(sprite);
    expect(pixels[3]).toBe(0);
    expect(pixels[7]).toBe(255);
    expect(sprite.mesh.material.alphaTest).toBeGreaterThan(0);
  });

  it('suavizado (padrão): textura ampliada ×4 com filtro bilinear; a transparência continua', () => {
    const data = encodeGif(2, 1, PALETTE, [{ left: 0, top: 0, width: 2, height: 1, indices: [0, 1], delayCs: 10, disposal: 1, transparentIndex: 0 }]);
    const sprite = new CardSprite();
    sprite.setAnimation(decodeGif(data));
    const texture = sprite.mesh.material.map!;
    expect((texture.image as { width: number }).width).toBe(8);
    expect((texture.image as { height: number }).height).toBe(4);
    expect(texture.magFilter).toBe(LinearFilter);
    const pixels = pixelsOf(sprite);
    expect(pixels[3]).toBe(0); // canto esquerdo: transparente
    expect(pixels[7 * 4 + 3]).toBe(255); // canto direito: vermelho opaco
    expect(sprite.mesh.material.alphaTest).toBeGreaterThan(0);
  });

  it('ligar e desligar a suavização refaz a textura sem reiniciar a animação', () => {
    const sprite = new CardSprite();
    sprite.setAnimation(threeFrameGif(), 0);
    sprite.update(150);
    expect((sprite.mesh.material.map!.image as { width: number }).width).toBe(8);
    sprite.setLayout({ ...DEFAULT_LAYOUT, smoothing: 'nitido' });
    expect((sprite.mesh.material.map!.image as { width: number }).width).toBe(2);
    expect(sprite.mesh.material.map!.magFilter).toBe(NearestFilter);
    sprite.update(150);
    expect(sprite.currentFrame).toBe(1);
    sprite.setLayout({ ...DEFAULT_LAYOUT, smoothing: 'bordas' });
    expect((sprite.mesh.material.map!.image as { width: number }).width).toBe(8);
  });

  it('GIF de um quadro não anima; estático e marcador não chamam atualização de quadro', () => {
    const one = decodeGif(encodeGif(2, 1, PALETTE, [{ left: 0, top: 0, width: 2, height: 1, indices: [1, 1], delayCs: 10, disposal: 1 }]));
    const sprite = new CardSprite();
    sprite.setAnimation(one, 0);
    expect(sprite.update(5000)).toBe(false);
    sprite.setStatic(makePlaceholder(8));
    expect(sprite.mode).toBe('static');
    expect(sprite.update(9999)).toBe(false);
    sprite.setPlaceholder();
    expect(sprite.mode).toBe('placeholder');
    expect(sprite.mesh.visible).toBe(true);
  });

  it('GIF sem quadros é recusado', () => {
    expect(() => new CardSprite().setAnimation({ width: 1, height: 1, frames: [], durationMs: 0 })).toThrow();
  });
});

describe('CardSprite: estados e limpeza', () => {
  it('rastreamento perdido oculta o conjunto; reencontrado mostra de novo', () => {
    const sprite = new CardSprite();
    expect(sprite.group.visible).toBe(false);
    sprite.setTracked(true);
    expect(sprite.group.visible).toBe(true);
    sprite.setTracked(false);
    expect(sprite.group.visible).toBe(false);
  });

  it('trocar de sprite libera a textura anterior', () => {
    const sprite = new CardSprite();
    sprite.setAnimation(threeFrameGif());
    const first = sprite.mesh.material.map!;
    const disposeFirst = vi.spyOn(first, 'dispose');
    sprite.setStatic(makePlaceholder(8));
    expect(disposeFirst).toHaveBeenCalledTimes(1);
  });

  it('dispose libera textura, geometria e material', () => {
    const sprite = new CardSprite();
    sprite.setAnimation(threeFrameGif());
    const texture = vi.spyOn(sprite.mesh.material.map!, 'dispose');
    const geometry = vi.spyOn(sprite.mesh.geometry, 'dispose');
    const material = vi.spyOn(sprite.mesh.material, 'dispose');
    sprite.dispose();
    expect(texture).toHaveBeenCalled();
    expect(geometry).toHaveBeenCalled();
    expect(material).toHaveBeenCalled();
    expect(sprite.group.children).toHaveLength(0);
  });

  it('clear esconde o plano', () => {
    const sprite = new CardSprite();
    sprite.setPlaceholder();
    sprite.clear();
    expect(sprite.mode).toBe('empty');
    expect(sprite.mesh.visible).toBe(false);
  });
});

describe('CardSprite: suavização dos pixels', () => {
  const dims = (sprite: CardSprite) => sprite.mesh.material.map!.image as { width: number; height: number; data: Uint8Array };

  it('os quatro modos escolhem o tamanho e o filtro da textura', () => {
    const sprite = new CardSprite();
    sprite.setAnimation(threeFrameGif());
    for (const [mode, width, filter] of [['nitido', 2, NearestFilter], ['bordas', 8, LinearFilter], ['suave', 8, LinearFilter], ['macio', 8, LinearFilter]] as const) {
      sprite.setLayout({ ...DEFAULT_LAYOUT, smoothing: mode });
      expect(dims(sprite).width).toBe(width);
      expect(sprite.mesh.material.map!.magFilter).toBe(filter);
    }
  });

  it('layout antigo (smooth: false) vira "Nítido"', () => {
    const sprite = new CardSprite();
    sprite.setAnimation(threeFrameGif());
    sprite.setLayout({ ...DEFAULT_LAYOUT, smoothing: undefined, smooth: false } as never);
    expect(dims(sprite).width).toBe(2);
  });

  it('trocar o modo no meio da animação não reinicia os quadros', () => {
    const sprite = new CardSprite();
    sprite.setAnimation(threeFrameGif(), 0);
    sprite.update(150);
    sprite.setLayout({ ...DEFAULT_LAYOUT, smoothing: 'macio' });
    sprite.update(150);
    expect(sprite.currentFrame).toBe(1);
    expect(dims(sprite).width).toBe(8);
  });
});

describe('CardSprite: giroscópio', () => {
  const yaw = (deg: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (deg * Math.PI) / 180);
  const pose = cardSpaceMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -5, 1], 1, 1.375);
  const centerOnScreen = (sprite: CardSprite) => new Vector3(0, 0, 0).applyMatrix4(sprite.group.matrix);

  it('com a câmera parada a pose é a medida', () => {
    const sprite = new CardSprite();
    sprite.setStatic(makePlaceholder(8));
    sprite.setCardMatrix(pose, yaw(10));
    sprite.setViewOrientation(yaw(10));
    const here = centerOnScreen(sprite);
    const reference = new Vector3(0, 0, 0).applyMatrix4(new Matrix4().fromArray(Array.from(pose)));
    expect(here.distanceTo(reference)).toBeLessThan(1e-6);
  });

  it('girar o celular move a carta na tela na hora, em sentido oposto, sem novo resultado do rastreador', () => {
    const sprite = new CardSprite();
    sprite.setStatic(makePlaceholder(8));
    sprite.setCardMatrix(pose, yaw(0));
    sprite.setViewOrientation(yaw(0));
    const before = centerOnScreen(sprite);
    sprite.setViewOrientation(yaw(10)); // a câmera girou 10° (para a esquerda, em torno de Y)
    const after = centerOnScreen(sprite);
    // o mundo gira ao contrário: a distância à câmera se mantém e o x muda de sinal convenientemente
    expect(after.length()).toBeCloseTo(before.length(), 6);
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(0.3);
    // girar de volta restaura
    sprite.setViewOrientation(yaw(0));
    expect(centerOnScreen(sprite).distanceTo(before)).toBeLessThan(1e-6);
  });

  it('o resultado é exatamente a rotação inversa da câmera aplicada à pose medida', () => {
    const sprite = new CardSprite();
    sprite.setStatic(makePlaceholder(8));
    sprite.setCardMatrix(pose, yaw(5));
    sprite.setViewOrientation(yaw(25));
    const relative = yaw(25).invert().multiply(yaw(5));
    const expected = new Vector3(0, 0, 0).applyMatrix4(new Matrix4().fromArray(Array.from(pose))).applyQuaternion(relative);
    expect(centerOnScreen(sprite).distanceTo(expected)).toBeLessThan(1e-6);
  });

  it('sem orientação na pose, setViewOrientation não faz nada', () => {
    const sprite = new CardSprite();
    sprite.setStatic(makePlaceholder(8));
    sprite.setCardMatrix(pose);
    const before = centerOnScreen(sprite);
    sprite.setViewOrientation(yaw(40));
    expect(centerOnScreen(sprite).distanceTo(before)).toBeLessThan(1e-9);
  });

  it('passar a pose para o mundo e de volta não desliza (volta direto)', () => {
    const sprite = new CardSprite();
    sprite.setStatic(makePlaceholder(8));
    sprite.setCardMatrix(pose, yaw(0));
    sprite.setCardMatrix(pose); // giroscópio sumiu
    sprite.setViewOrientation(yaw(30));
    const reference = new Vector3(0, 0, 0).applyMatrix4(new Matrix4().fromArray(Array.from(pose)));
    expect(centerOnScreen(sprite).distanceTo(reference)).toBeLessThan(1e-6);
  });

  it('a suavização é adaptativa: salto grande converge mais rápido que tremor pequeno', () => {
    const run = (dx: number) => {
      const sprite = new CardSprite();
      sprite.setStatic(makePlaceholder(8));
      const at = (x: number) => cardSpaceMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, -5, 1], 1, 1.375);
      sprite.setCardMatrix(at(0));
      sprite.update(1000);
      sprite.setCardMatrix(at(dx));
      sprite.update(1016);
      return (sprite.group.matrix.elements[12]! - 0.5) / dx; // fração do caminho andada em um quadro
    };
    expect(run(1)).toBeGreaterThan(run(0.01) * 1.5);
  });
});

describe('CardSprite: inclinação e sombra no chão', () => {
  it('o padrão inclina o plano 30° para trás, com a borda de baixo encostada na carta no centro da ilustração', () => {
    const sprite = new CardSprite();
    sprite.setStatic(makePlaceholder(8));
    sprite.setLayout({ ...DEFAULT_LAYOUT, heightRatio: 1 });
    const [bl, br, tr] = planeCorners(sprite);
    expect(bl!.z).toBeCloseTo(0, 6);
    expect(br!.z).toBeCloseTo(0, 6);
    // Ângulo do "alto" com o plano da carta: 60°, com o topo para +Y.
    expect((Math.atan2(tr!.z - bl!.z, tr!.y - bl!.y) * 180) / Math.PI).toBeCloseTo(60, 5);
    // Centro do plano sobre o centro da ilustração.
    const m = sprite.worldMatrixOfPlane();
    const center = new Vector3(0, 0, 0).applyMatrix4(m);
    expect(center.x).toBeCloseTo(DEFAULT_LAYOUT.offsetX, 6);
    expect(center.y).toBeCloseTo(DEFAULT_LAYOUT.offsetY, 6);
  });

  it('a sombra e o brilho ficam no chão da carta, sob o centro do sprite, só com sprite e layout ligado', () => {
    const sprite = new CardSprite();
    expect(sprite.shadow.visible).toBe(false); // sem sprite não há sombra
    sprite.setStatic(makePlaceholder(8));
    sprite.setLayout({ ...DEFAULT_LAYOUT, offsetX: 0.1, offsetY: 0.3, heightRatio: 0.8 });
    expect(sprite.shadow.visible).toBe(true);
    expect(sprite.glow.visible).toBe(true);
    expect(sprite.shadow.position.x).toBeCloseTo(0.1, 6);
    expect(sprite.shadow.position.y).toBeCloseTo(0.3, 6);
    expect(sprite.shadow.position.z).toBeGreaterThan(0);
    expect(sprite.shadow.position.z).toBeLessThan(0.01);
    expect(sprite.shadow.material.transparent).toBe(true);
    expect(sprite.shadow.material.depthWrite).toBe(false);
    expect(sprite.shadow.scale.x).toBeGreaterThan(0);
    expect(sprite.shadow.scale.y).toBeGreaterThan(0);
  });

  it('showShadow = false esconde a sombra e o brilho; ligar de novo mostra', () => {
    const sprite = new CardSprite();
    sprite.setStatic(makePlaceholder(8));
    sprite.setLayout({ ...DEFAULT_LAYOUT, showShadow: false });
    expect(sprite.shadow.visible).toBe(false);
    expect(sprite.glow.visible).toBe(false);
    sprite.setLayout({ ...DEFAULT_LAYOUT, showShadow: true });
    expect(sprite.shadow.visible).toBe(true);
  });

  it('clear() esconde a sombra junto com o sprite', () => {
    const sprite = new CardSprite();
    sprite.setStatic(makePlaceholder(8));
    sprite.setLayout(DEFAULT_LAYOUT);
    sprite.clear();
    expect(sprite.shadow.visible).toBe(false);
    expect(sprite.glow.visible).toBe(false);
  });

  it('o brilho pulsa devagar com o tempo, sem passar da opacidade base', () => {
    const sprite = new CardSprite();
    sprite.setStatic(makePlaceholder(8));
    sprite.setLayout(DEFAULT_LAYOUT);
    const seen = new Set<number>();
    for (let t = 0; t < 4000; t += 250) {
      sprite.update(t);
      seen.add(Math.round(sprite.glow.material.opacity * 1000));
    }
    expect(seen.size).toBeGreaterThan(3);
    expect(Math.max(...seen) / 1000).toBeLessThanOrEqual(sprite.shadow.material.opacity * 0.4 + 1e-6);
  });

  it('a placement informa o quanto o sprite inclinado avança no chão (o painel começa depois)', () => {
    const sprite = new CardSprite();
    sprite.setLayout({ ...DEFAULT_LAYOUT, heightRatio: 0.7 });
    expect(sprite.placement.frontReach).toBeCloseTo(0.175, 9);
  });
});
