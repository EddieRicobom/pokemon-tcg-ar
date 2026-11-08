import { describe, expect, it } from 'vitest';
import type { Mesh, MeshBasicMaterial, Points, PointsMaterial, Sprite } from 'three';
import { ColiseuScenery, crowdLift, OLA_MS, paintFlame, paintPennant, paintSand, paintStands, paintWallTile, SCENERY_RADIUS, STANDS_H, STANDS_W, standsPoint } from './coliseu-scenery';
import type { PixelBuf } from './ground-art';

const px = (b: PixelBuf, x: number, y: number) => (b.data[(y * b.w + x) * 4]! << 16) | (b.data[(y * b.w + x) * 4 + 1]! << 8) | b.data[(y * b.w + x) * 4 + 2]!;
const alpha = (b: PixelBuf, x: number, y: number) => b.data[(y * b.w + x) * 4 + 3]!;
const redish = (rgb: number) => ((rgb >> 16) & 255) > 170 && ((rgb >> 8) & 255) < 100 && (rgb & 255) < 90;
const blueish = (rgb: number) => (rgb & 255) > 170 && ((rgb >> 16) & 255) < 100;

describe('texturas do Coliseu', () => {
  it('a areia é opaca, sempre a mesma e tem pontinhos claros e escuros', () => {
    const sand = paintSand();
    expect([sand.w, sand.h]).toEqual([96, 96]);
    const colors = new Set<number>();
    for (let y = 0; y < sand.h; y++) for (let x = 0; x < sand.w; x++) {
      expect(alpha(sand, x, y)).toBe(255);
      colors.add(px(sand, x, y));
    }
    expect(colors.size).toBe(3);
    expect(paintSand().data).toEqual(sand.data);
  });

  it('o vão do muro tem pedra e um arco escuro no meio', () => {
    const tile = paintWallTile();
    expect([tile.w, tile.h]).toEqual([16, 8]);
    expect(px(tile, 8, 5)).toBe(0x2a2218);
    expect(px(tile, 1, 4)).not.toBe(0x2a2218);
  });

  it('a arquibancada é vermelha para a esquerda da tela e azul para a direita, a partir do centro do fundo', () => {
    const stands = paintStands();
    expect([stands.w, stands.h]).toEqual([STANDS_W, STANDS_H]);
    const count = (test: (rgb: number) => boolean, from: number, to: number) => {
      let n = 0;
      for (let y = 0; y < stands.h; y++) for (let x = from; x < to; x++) if (test(px(stands, x, y))) n++;
      return n;
    };
    const mid = STANDS_W / 2;
    // Do fundo, olhando para a arena, a esquerda da tela é onde a textura cresce (ver `paintStands`).
    expect(count(redish, mid + 4, mid + 60)).toBeGreaterThan(count(blueish, mid + 4, mid + 60) * 4);
    expect(count(blueish, mid - 60, mid - 4)).toBeGreaterThan(count(redish, mid - 60, mid - 4) * 4);
    for (let y = 0; y < stands.h; y++) for (let x = 0; x < stands.w; x++) expect(alpha(stands, x, y)).toBe(255);
  });

  it('tem torcida: cabecinhas de várias cores em posições fixas, e o desenho é sempre o mesmo', () => {
    const stands = paintStands();
    const heads = new Set<number>();
    for (let x = 100; x < 300; x++) heads.add(px(stands, x, 2));
    expect(heads.size).toBeGreaterThan(3);
    expect(paintStands().data).toEqual(stands.data);
  });

  it('a tocha tem chama em cima e braseiro embaixo, com fundo transparente', () => {
    const flame = paintFlame();
    expect([flame.w, flame.h]).toEqual([8, 16]);
    expect(alpha(flame, 3, 0)).toBe(255);
    expect(alpha(flame, 0, 0)).toBe(0);
    expect(alpha(flame, 3, 15)).toBe(255);
    expect(alpha(flame, 0, 15)).toBe(0);
  });
});

describe('torcida no Coliseu', () => {
  it('o ponto da arquibancada sobe e se afasta com a fileira; π é o fundo, de frente para a câmera', () => {
    const low = standsPoint(Math.PI, 0);
    const high = standsPoint(Math.PI, 1);
    expect(low.z).toBeCloseTo(-SCENERY_RADIUS, 6);
    expect(Math.abs(low.x)).toBeLessThan(1e-9);
    expect(high.y).toBeGreaterThan(low.y);
    expect(Math.hypot(high.x, high.z)).toBeGreaterThan(Math.hypot(low.x, low.z));
    expect(standsPoint(Math.PI, 7)).toEqual(high);
  });

  it('a bandeirinha tem mastro e flâmula na cor da equipe, com fundo transparente', () => {
    const red = paintPennant(0);
    const blue = paintPennant(1);
    expect(redish(px(red, 2, 1))).toBe(true);
    expect(blueish(px(blue, 2, 1))).toBe(true);
    expect(alpha(red, 0, 10)).toBe(255);
    expect(alpha(red, 6, 10)).toBe(0);
  });
});

describe('ColiseuScenery', () => {
  it('monta areia, muro, arquibancada e as tochas, sem precisar de WebGL', () => {
    const scenery = new ColiseuScenery();
    const meshes = scenery.group.children.filter((c): c is Mesh => (c as Mesh).isMesh === true);
    const sprites = scenery.group.children.filter((c): c is Sprite => 'isSprite' in c);
    expect(meshes).toHaveLength(3);
    expect(sprites.length).toBeGreaterThanOrEqual(8);
    expect(scenery.radius).toBe(SCENERY_RADIUS);
    // A areia fica por baixo do chão da arena (que está em y = 0,002) e não escreve profundidade.
    const sand = meshes[0]!;
    expect(sand.position.y).toBeLessThan(0.002);
    expect((sand.material as MeshBasicMaterial).depthWrite).toBe(false);
    scenery.dispose();
  });

  it('o muro e a arquibancada ficam em volta, para quem está dentro da arena', () => {
    const scenery = new ColiseuScenery();
    const [, wall, stands] = scenery.group.children as Mesh[];
    wall!.geometry.computeBoundingBox();
    stands!.geometry.computeBoundingBox();
    expect(wall!.geometry.boundingBox!.max.x).toBeCloseTo(SCENERY_RADIUS, 5);
    // A arquibancada começa no muro e sobe para fora.
    expect(stands!.geometry.boundingBox!.max.x).toBeGreaterThan(SCENERY_RADIUS + 3);
    expect(stands!.position.y).toBeGreaterThan(wall!.position.y);
    scenery.dispose();
  });

  it('a cor da cena (luz do ambiente e escurecimento dos golpes) multiplica todas as texturas', () => {
    const scenery = new ColiseuScenery();
    scenery.setTint(0.5, 0.6, 0.7);
    for (const child of scenery.group.children) {
      if (!(child as Mesh).isMesh) continue;
      const color = ((child as Mesh).material as MeshBasicMaterial).color;
      expect([color.r, color.g, color.b]).toEqual([0.5, 0.6, 0.7].map((v) => expect.closeTo(v, 5)));
    }
    scenery.dispose();
  });

  it('as chamas tremem de um quadro para o outro', () => {
    const scenery = new ColiseuScenery();
    const torch = scenery.group.children.find((c): c is Sprite => 'isSprite' in c)!;
    scenery.update(0);
    const a = torch.scale.y;
    scenery.update(40);
    expect(torch.scale.y).not.toBe(a);
    expect(torch.scale.y).toBeGreaterThan(0.3);
    expect(torch.scale.y).toBeLessThan(1);
    scenery.dispose();
  });

  it('desligar o detalhe deixa só a areia e as chamas param de ser atualizadas', () => {
    const scenery = new ColiseuScenery();
    const torch = scenery.group.children.find((c): c is Sprite => 'isSprite' in c)!;
    scenery.update(0);
    const before = torch.scale.y;
    scenery.setDetail(false);
    expect(scenery.detail).toBe(false);
    const visible = scenery.group.children.filter((c) => c.visible);
    expect(visible).toHaveLength(1);
    expect((visible[0] as Mesh).position.y).toBeLessThan(0.002);
    scenery.update(40);
    expect(torch.scale.y).toBe(before);
    scenery.setDetail(true);
    expect(scenery.group.children.every((c) => c.visible)).toBe(true);
    scenery.dispose();
  });

  it('soltar o cenário esvazia o grupo e tira da cena', () => {
    const scenery = new ColiseuScenery();
    scenery.dispose();
    expect(scenery.group.children).toHaveLength(0);
    expect(scenery.group.parent).toBeNull();
  });

  it('a torcida balança e a ola levanta quem está na frente da onda', () => {
    expect(crowdLift(0, 0, 1000, -1)).toBeLessThan(0.05);
    // A onda nasce no ângulo 0 e dá a volta: a um quarto do tempo ela está em π/2.
    const start = 1000;
    const at = start + OLA_MS / 4;
    expect(crowdLift(Math.PI / 2, 0, at, start)).toBeGreaterThan(0.15);
    expect(crowdLift(Math.PI * 1.5, 0, at, start)).toBeLessThan(0.05);
    expect(crowdLift(Math.PI / 2, 0, start + OLA_MS + 1, start)).toBeLessThan(0.05);
  });

  it('a torcida e o brilho das tochas fazem parte do detalhe; o brilho só desenha à noite', () => {
    const scenery = new ColiseuScenery();
    const glow = scenery.group.children.find((c): c is Points => 'isPoints' in c)!;
    expect(glow.material).toBeTruthy();
    expect((glow.material as PointsMaterial).visible).toBe(false);
    scenery.setGlow(1);
    expect((glow.material as PointsMaterial).visible).toBe(true);
    scenery.setGlow(0);
    expect((glow.material as PointsMaterial).visible).toBe(false);
    scenery.dispose();
  });

  it('a ola começa com cheer, não reinicia no meio e não roda em movimento reduzido', () => {
    const scenery = new ColiseuScenery();
    scenery.cheer(100);
    expect(scenery.olaActive).toBe(true);
    scenery.setCalm(true);
    expect(scenery.olaActive).toBe(false);
    scenery.cheer(200);
    expect(scenery.olaActive).toBe(false);
    scenery.dispose();
  });
});
