import { describe, expect, it } from 'vitest';
import {
  cameraParamsFromProjection, cardHeightUnits, cardSpaceMatrix, clampLayout, DEFAULT_LAYOUT, mindArPostMatrix, multiply,
  spriteCorners, spriteMatrix, transformPoint,
} from './anchor';
import type { SpriteLayout } from './anchor';

const close = (a: number[], b: number[], digits = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const layout = (patch: Partial<SpriteLayout> = {}): SpriteLayout => ({ ...DEFAULT_LAYOUT, offsetX: 0, offsetY: 0, ...patch });

describe('espaço da carta do MindAR', () => {
  it('postMatrix leva o centro do alvo para a origem do espaço da carta e a largura para 1', () => {
    // Alvo 600×825 px: o ponto central (300, 412,5) deve virar (0,0,0)? Não: a postMatrix vai de carta → marcador.
    const post = mindArPostMatrix(600, 825);
    close(transformPoint(post, [0, 0, 0]), [300, 412.5, 0]); // origem da carta = centro do marcador
    close(transformPoint(post, [0.5, 0, 0]), [600, 412.5, 0]); // meia largura à direita = borda direita
    close(transformPoint(post, [0, 825 / 600 / 2, 0]), [300, 825, 0]); // metade da altura = borda de baixo (y do marcador cresce para baixo)
    expect(cardHeightUnits(600, 825)).toBeCloseTo(1.375, 6);
  });

  it('com mundo = identidade, cardSpaceMatrix é a própria postMatrix', () => {
    close(cardSpaceMatrix(IDENTITY, 600, 825), mindArPostMatrix(600, 825));
  });

  it('multiply é associativo e tem identidade', () => {
    const a = mindArPostMatrix(2, 3);
    close(multiply(a, IDENTITY), a);
    close(multiply(IDENTITY, a), a);
  });
});

describe('sprite em pé sobre a carta', () => {
  it('a base fica na superfície da carta (z = 0) e o topo acima dela (z = altura)', () => {
    const [bl, br, tr, tl] = spriteCorners(layout({ heightRatio: 0.8 }), 1);
    expect(bl[2]).toBeCloseTo(0, 9);
    expect(br[2]).toBeCloseTo(0, 9);
    expect(tr[2]).toBeCloseTo(0.8, 9);
    expect(tl[2]).toBeCloseTo(0.8, 9);
  });

  it('é vertical: não deita sobre a carta nem inclina (todos os pontos têm o mesmo y)', () => {
    const corners = spriteCorners(layout({ heightRatio: 0.9 }), 1.4);
    const ys = corners.map((c) => c[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0, 9);
  });

  it('largura = altura × proporção do GIF, centrada no ponto de ancoragem', () => {
    const [bl, br] = spriteCorners(layout({ heightRatio: 0.5, offsetX: 0.1 }), 2);
    expect(br[0] - bl[0]).toBeCloseTo(1.0, 9);
    expect((bl[0] + br[0]) / 2).toBeCloseTo(0.1, 9);
  });

  it('a frente do sprite olha para a borda inferior da carta (−Y) com yaw 0', () => {
    const m = spriteMatrix(layout(), 1);
    // A normal do plano (coluna Z) aponta para −Y.
    close([m[8]!, m[9]!, m[10]!], [0, -1, 0]);
  });

  it('o plano do sprite é perpendicular (90°) ao plano da carta em qualquer giro', () => {
    for (const yawDeg of [0, 37, 90, -135, 180]) {
      const m = spriteMatrix(layout({ yawDeg }), 0.8);
      // Normal do sprite = coluna Z; normal da carta = +Z. Produto escalar 0 => 90°.
      expect(m[10]).toBeCloseTo(0, 9);
      // E o "alto" do sprite (coluna Y) aponta exatamente para fora da carta.
      expect(m[4]).toBeCloseTo(0, 9);
      expect(m[5]).toBeCloseTo(0, 9);
      expect(m[6]).toBeGreaterThan(0);
    }
  });

  it('yaw gira em torno da normal da carta sem tirar o sprite da vertical', () => {
    const m = spriteMatrix(layout({ yawDeg: 90 }), 1);
    close([m[8]!, m[9]!, m[10]!], [1, 0, 0]);
    expect(m[10]!).toBeCloseTo(0, 9);
    const corners = spriteCorners(layout({ yawDeg: 90, heightRatio: 0.7 }), 1);
    expect(corners[2]![2]).toBeCloseTo(0.7, 9);
  });

  it('deslocamento move a base no plano da carta; elevação a levanta', () => {
    const [bl, br] = spriteCorners(layout({ offsetX: 0.2, offsetY: -0.3, lift: 0.05, heightRatio: 0.4 }), 1);
    expect((bl[0] + br[0]) / 2).toBeCloseTo(0.2, 9);
    expect(bl[1]).toBeCloseTo(-0.3, 9);
    expect(bl[2]).toBeCloseTo(0.05, 9);
  });

  it('anchor = centro coloca o centro do sprite na origem em vez da base', () => {
    const [bl, , tr] = spriteCorners(layout({ anchor: 'center', heightRatio: 0.6 }), 1);
    expect(bl[2]).toBeCloseTo(-0.3, 9);
    expect(tr[2]).toBeCloseTo(0.3, 9);
  });

  it('escala configurável muda altura e largura juntas', () => {
    const small = spriteCorners(layout({ heightRatio: 0.3 }), 1.5);
    const large = spriteCorners(layout({ heightRatio: 0.6 }), 1.5);
    expect(large[2]![2]! / small[2]![2]!).toBeCloseTo(2, 9);
    expect((large[1]![0] - large[0]![0]) / (small[1]![0] - small[0]![0])).toBeCloseTo(2, 9);
  });

  it('o sprite acompanha a carta: o movimento do mundo transforma todos os cantos da mesma forma', () => {
    // Carta transladada 3 unidades em x e girada 90° em torno de Z no mundo.
    const world = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 3, 0, 0, 1];
    const cardSpace = cardSpaceMatrix(world, 1, 1.375);
    // Marcador com largura 1: postMatrix = T(0,5; 0,6875) · S(1).
    const base = multiply(cardSpace, spriteMatrix(layout({ heightRatio: 1 }), 1));
    const bottom = transformPoint(base, [0, -0.5, 0]);
    const top = transformPoint(base, [0, 0.5, 0]);
    // O "alto" do sprite continua perpendicular à carta (mesma direção que o +Z da carta no mundo).
    close([top[0] - bottom[0], top[1] - bottom[1], top[2] - bottom[2]], [0, 0, 1]);
  });
});

describe('clampLayout', () => {
  it('limita valores absurdos e trata NaN', () => {
    const c = clampLayout({ heightRatio: 99, offsetX: -5, offsetY: Number.NaN, lift: -1, yawDeg: 400, anchor: 'base' });
    expect(c.heightRatio).toBe(1.6);
    expect(c.offsetX).toBe(-0.7);
    expect(c.offsetY).toBe(-0.7);
    expect(c.lift).toBe(0);
    expect(c.yawDeg).toBe(180);
  });
});

describe('cameraParamsFromProjection', () => {
  // Projeção do Controller para entrada 640×480: f = (480/2)/tan(22,5°).
  const f = 240 / Math.tan((45 * Math.PI) / 360);
  const proj = [f / 320, 0, 0, 0, 0, f / 240, 0, 0, 0, 0, -(100000 + 10) / (100000 - 10), -1, 0, 0, (-2 * 100000 * 10) / (100000 - 10), 0];

  it('com contêiner da mesma proporção do vídeo o campo de visão vertical é de 45°', () => {
    const p = cameraParamsFromProjection(proj, 640, 480, 640, 480);
    expect(p.fovDeg).toBeCloseTo(45, 4);
    expect(p.aspect).toBeCloseTo(640 / 480, 9);
  });

  it('contêiner mais "em pé" que o vídeo (cover pela altura): vídeo cortado dos lados, campo vertical igual', () => {
    expect(cameraParamsFromProjection(proj, 640, 480, 360, 640).fovDeg).toBeCloseTo(45, 4);
  });

  it('contêiner mais "deitado" que o vídeo (cover pela largura): vídeo cortado em cima/embaixo, campo vertical menor', () => {
    const p = cameraParamsFromProjection(proj, 640, 480, 640, 300);
    expect(p.fovDeg).toBeLessThan(45);
    // altura exibida do vídeo 480 > contêiner 300 → tan(fov/2) = tan(22,5°) × 300/480
    expect(Math.tan((p.fovDeg * Math.PI) / 360)).toBeCloseTo(Math.tan((22.5 * Math.PI) / 180) * (300 / 480), 6);
  });

  it('near e far saem da matriz', () => {
    const p = cameraParamsFromProjection(proj, 640, 480, 640, 480);
    expect(p.near).toBeCloseTo(10, 3);
    expect(p.far).toBeCloseTo(100000, 0);
  });
});
