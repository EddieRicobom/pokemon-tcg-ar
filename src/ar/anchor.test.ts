import { describe, expect, it } from 'vitest';
import {
  cameraParamsFromProjection, cardHeightUnits, panelPlacement, cardSpaceMatrix, clampLayout, DEFAULT_LAYOUT, mindArPostMatrix, multiply,
  frontReach, ILLUSTRATION_CENTER_Y, speciesLayout, spriteCorners, spriteMatrix, transformPoint, cameraPositionInCardSpace, yawTowardCamera,
} from './anchor';
import type { SpriteLayout } from './anchor';

const close = (a: number[], b: number[], digits = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const layout = (patch: Partial<SpriteLayout> = {}): SpriteLayout => ({ ...DEFAULT_LAYOUT, offsetX: 0, offsetY: 0, anchor: 'base', tiltDeg: 0, ...patch });

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

describe('sprite de frente para a câmera, sem deixar de ficar em pé', () => {
  const at = (p: [number, number, number]): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -p[0], -p[1], -p[2], 1];

  it('posição da câmera no espaço da carta é recuperada da matriz', () => {
    expect(cameraPositionInCardSpace(at([1, -2, 3]))).toEqual([1, -2, 3].map((v) => expect.closeTo(v, 9)));
  });
  it('câmera do lado da borda inferior da carta: giro 0 (o padrão original)', () => {
    expect(yawTowardCamera(at([0, -2, 2]))).toBeCloseTo(0, 6);
  });
  it('câmera à direita e abaixo: o sprite gira para ela', () => {
    expect(yawTowardCamera(at([1, -2, 3]))).toBeCloseTo((Math.atan2(1, 2) * 180) / Math.PI, 6);
  });
  it('a frente do sprite aponta para a câmera depois do giro', () => {
    const yaw = yawTowardCamera(at([-2, 1, 3]))!;
    const m = spriteMatrix({ ...DEFAULT_LAYOUT, tiltDeg: 0, anchor: 'base' }, 1, yaw);
    // Eixo Z do plano = normal (frente): deve ter a mesma direção horizontal da câmera.
    const normal = [m[8]!, m[9]!];
    const len = Math.hypot(normal[0]!, normal[1]!);
    expect(normal[0]! / len).toBeCloseTo(-2 / Math.hypot(-2, 1), 6);
    expect(normal[1]! / len).toBeCloseTo(1 / Math.hypot(-2, 1), 6);
    // Continua a 90° da carta: nenhum componente do eixo "alto" do sprite no plano da carta.
    expect(m[4]).toBeCloseTo(0, 9);
    expect(m[5]).toBeCloseTo(0, 9);
  });
  it('câmera quase na vertical da carta: direção instável, mantém o giro anterior (null)', () => {
    expect(yawTowardCamera(at([0.01, -0.02, 5]))).toBeNull();
  });
});


describe('painel de status logo abaixo da ilustração', () => {
  it('sem giro: fica à frente dos pés (para a borda inferior da carta), sem tocar nos pés', () => {
    const p = panelPlacement({ x: 0.1, y: 0.2, yawDeg: 0, heightRatio: 0.7 }, 0.75);
    expect(p.x).toBeCloseTo(0.1, 6);
    expect(p.y).toBeLessThan(0.2);
    // A borda de cima do painel (a mais próxima dos pés) fica logo depois dos pés: só a folga.
    expect(p.y + p.height / 2).toBeCloseTo(0.2 - 0.04, 6);
    expect(p.yawRad).toBe(0);
  });
  it('gira junto com o Pokémon: o painel continua no lado para onde ele olha', () => {
    const yaw = 90;
    const p = panelPlacement({ x: 0, y: 0, yawDeg: yaw, heightRatio: 0.7 }, 0.75);
    // Com 90° o Pokémon olha para +X: o painel fica em +X e o "alto" dele (yawRad) aponta de volta para o Pokémon.
    expect(p.x).toBeGreaterThan(0.2);
    expect(Math.abs(p.y)).toBeLessThan(1e-9);
    expect(p.yawRad).toBeCloseTo(Math.PI / 2, 9);
  });
  it('painel e Pokémon crescem juntos, com limites', () => {
    const small = panelPlacement({ x: 0, y: 0, yawDeg: 0, heightRatio: 0.5 }, 0.75).width;
    const big = panelPlacement({ x: 0, y: 0, yawDeg: 0, heightRatio: 1 }, 0.75).width;
    expect(big).toBeGreaterThan(small);
    expect(panelPlacement({ x: 0, y: 0, yawDeg: 0, heightRatio: 0.01 }, 0.75).width).toBe(0.4);
    expect(panelPlacement({ x: 0, y: 0, yawDeg: 0, heightRatio: 50 }, 0.75).width).toBe(1.6);
  });
});

describe('inclinação para trás e ponto sobre a ilustração', () => {
  const tilted = (patch: Partial<SpriteLayout> = {}): SpriteLayout => ({ ...DEFAULT_LAYOUT, offsetX: 0, offsetY: 0, ...patch });

  it('o padrão põe o Pokémon no centro da ilustração, inclinado 30° para trás', () => {
    expect(DEFAULT_LAYOUT.tiltDeg).toBe(30);
    expect(DEFAULT_LAYOUT.anchor).toBe('rest');
    expect(DEFAULT_LAYOUT.offsetX).toBe(0);
    // A ilustração vai de 10% a 56% da altura da carta: o centro (33%) fica 17% da altura acima do centro da carta.
    expect(DEFAULT_LAYOUT.offsetY).toBeCloseTo(0.17 * (88 / 63), 3);
    expect(ILLUSTRATION_CENTER_Y).toBeCloseTo(0.2375, 3);
  });

  it('o topo se afasta de quem olha (+Y) e o sprite faz 60° com a carta', () => {
    const [bl, , , tl] = spriteCorners(tilted({ anchor: 'base', heightRatio: 1 }), 1);
    const up = [tl[0] - bl[0], tl[1] - bl[1], tl[2] - bl[2]];
    close(up, [0, Math.cos((60 * Math.PI) / 180), Math.sin((60 * Math.PI) / 180)]);
    // Inclinar 30° a partir da vertical = 30° a partir da normal: o ângulo com o plano da carta é 60°.
    expect((Math.atan2(up[2]!, up[1]!) * 180) / Math.PI).toBeCloseTo(60, 6);
  });

  it('o comprimento do sprite não muda ao inclinar', () => {
    const [bl, , , tl] = spriteCorners(tilted({ heightRatio: 0.9 }), 1);
    expect(Math.hypot(tl[0] - bl[0], tl[1] - bl[1], tl[2] - bl[2])).toBeCloseTo(0.9, 9);
  });

  it('anchor "rest": o centro fica sobre o ponto, a borda de baixo encosta na carta e a pegada fica centrada', () => {
    const [bl, br, tr, tl] = spriteCorners(tilted({ offsetX: 0.1, offsetY: 0.2, heightRatio: 0.8 }), 1.5);
    expect(bl[2]).toBeCloseTo(0, 9);
    expect(br[2]).toBeCloseTo(0, 9);
    // Centro (média dos quatro cantos) exatamente sobre (0,1; 0,2).
    const cx = (bl[0] + br[0] + tr[0] + tl[0]) / 4;
    const cy = (bl[1] + br[1] + tr[1] + tl[1]) / 4;
    expect(cx).toBeCloseTo(0.1, 9);
    expect(cy).toBeCloseTo(0.2, 9);
    // A borda de baixo avança frontReach na frente do ponto.
    expect(bl[1]).toBeCloseTo(0.2 - frontReach(tilted({ heightRatio: 0.8 })), 9);
  });

  it('"rest" com elevação sobe o sprite inteiro', () => {
    const [bl] = spriteCorners(tilted({ lift: 0.1 }), 1);
    expect(bl[2]).toBeCloseTo(0.1, 9);
  });

  it('o giro (yaw) leva a inclinação junto: o topo sempre se afasta de onde o sprite olha', () => {
    for (const yawDeg of [0, 90, 180, -60]) {
      const m = spriteMatrix(tilted({ yawDeg, heightRatio: 1 }), 1);
      const up = [m[4]!, m[5]!, m[6]!];
      const normal = [m[8]!, m[9]!, m[10]!];
      // Topo e frente (horizontais) apontam em sentidos opostos; a frente sobe um pouco (olha para cima).
      expect(up[0]! * normal[0]! + up[1]! * normal[1]!).toBeLessThan(0);
      expect(normal[2]!).toBeCloseTo(Math.cos((60 * Math.PI) / 180), 9);
      // Eixos continuam perpendiculares entre si.
      expect(up[0]! * normal[0]! + up[1]! * normal[1]! + up[2]! * normal[2]!).toBeCloseTo(0, 9);
    }
  });

  it('tiltDeg omitido vale 0 (layouts antigos continuam em pé) e o excesso é limitado', () => {
    expect(clampLayout({ heightRatio: 0.7, offsetX: 0, offsetY: 0, lift: 0, yawDeg: 0, anchor: 'base' }).tiltDeg).toBe(0);
    expect(clampLayout({ ...DEFAULT_LAYOUT, tiltDeg: 200 }).tiltDeg).toBe(75);
    expect(clampLayout({ ...DEFAULT_LAYOUT, tiltDeg: -5 }).tiltDeg).toBe(0);
    expect(clampLayout({ ...DEFAULT_LAYOUT, anchor: 'xyz' as never }).anchor).toBe('base');
  });

  it('a sombra vem ligada por padrão e só desliga com false', () => {
    expect(clampLayout(DEFAULT_LAYOUT).showShadow).toBe(true);
    expect(clampLayout({ ...DEFAULT_LAYOUT, showShadow: false }).showShadow).toBe(false);
  });

  it('frontReach: 0 sobre os pés ou sem inclinação com centro no chão; cresce com a altura e a inclinação', () => {
    expect(frontReach(tilted({ anchor: 'base' }))).toBe(0);
    expect(frontReach(tilted({ anchor: 'rest', tiltDeg: 0 }))).toBeCloseTo(0, 9);
    expect(frontReach(tilted({ heightRatio: 0.7 }))).toBeCloseTo(0.175, 9);
    expect(frontReach(tilted({ heightRatio: 1.4 }))).toBeCloseTo(0.35, 9);
  });

  it('o painel começa depois da borda de baixo do sprite inclinado', () => {
    const near = panelPlacement({ x: 0, y: 0.2, yawDeg: 0, heightRatio: 0.7 }, 0.75);
    const far = panelPlacement({ x: 0, y: 0.2, yawDeg: 0, heightRatio: 0.7, frontReach: 0.175 }, 0.75);
    expect(near.y - far.y).toBeCloseTo(0.175, 9);
    const turned = panelPlacement({ x: 0, y: 0, yawDeg: 90, heightRatio: 0.7, frontReach: 0.2 }, 0.75);
    const turnedBase = panelPlacement({ x: 0, y: 0, yawDeg: 90, heightRatio: 0.7 }, 0.75);
    expect(turned.x - turnedBase.x).toBeCloseTo(0.2, 9);
  });
});

describe('tamanho pela altura real no AR da carta', () => {
  it('escala pela espécie e desconta a margem do quadro', () => {
    const l = { ...DEFAULT_LAYOUT, heightRatio: 0.7 };
    expect(speciesLayout(l, 0.5, 1).heightRatio).toBeCloseTo(0.35, 6);
    expect(speciesLayout(l, 1, 0.5).heightRatio).toBeCloseTo(1.4, 6);
    expect(speciesLayout(l, 1, 0.01).heightRatio).toBeCloseTo(0.7 / 0.2, 6);
  });

  it('sem dado de altura ou com a opção desligada, fica como está', () => {
    const l = { ...DEFAULT_LAYOUT, heightRatio: 0.7 };
    expect(speciesLayout(l, undefined, 0.5)).toBe(l);
    expect(speciesLayout({ ...l, realSize: false }, 2, 0.5).heightRatio).toBe(0.7);
  });

  it('clampLayout mantém a opção (ligada quando omitida)', () => {
    expect(clampLayout(DEFAULT_LAYOUT).realSize).toBe(true);
    expect(clampLayout({ ...DEFAULT_LAYOUT, realSize: false }).realSize).toBe(false);
  });
});
