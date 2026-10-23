import { CircleGeometry, CylinderGeometry, DataTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, NearestFilter, RGBAFormat, RepeatWrapping, SRGBColorSpace, Sprite, SpriteMaterial, UnsignedByteType } from 'three';
import { createBuf } from './ground-art';
import type { PixelBuf } from './ground-art';
import { put, rect } from '../village/village-art';

/**
 * O cenário do Coliseu para a Arena 3D (palco virtual, sem câmera): areia no chão, um muro de arcadas, a arquibancada
 * em volta com torcida vermelha e azul (as duas equipes) e tochas que tremem. Tudo é código (texturas pixeladas
 * geradas aqui, sem imagens para baixar) e fica no chão ao redor do ponto onde a arena é colocada. O céu é um degradê
 * do próprio palco (CSS), atrás do canvas transparente.
 *
 * Escala: um pixel das texturas vale ~12 cm, a mesma ordem de grandeza dos sprites dos Pokémon na cena.
 */

/** Raio da areia (m) e do muro. A câmera fica a ~3,2 m do centro, então cabe dentro. */
export const SCENERY_RADIUS = 5;
const WALL_HEIGHT = 0.96;
const STANDS_DEPTH = 3.2;
const STANDS_RISE = 2.2;
const TORCHES = 12;

const STONE = { light: 0xe0d4b2, mid: 0xc9bb96, dark: 0xa3956f, shade: 0x7a6e52, deep: 0x2a2218 } as const;
const SAND = { base: 0xc9b78a, light: 0xd9c9a0, dark: 0xb8a578 } as const;
const RED = { main: 0xd8463c, dark: 0xa02a24 } as const;
const BLUE = { main: 0x3f6fd0, dark: 0x2a4a98 } as const;
const CROWD = [0xf2c9a0, 0x3a2a22, 0x8a5a38, 0xf5f0e0, 0xffd84a, 0xd0804a] as const;

/** Areia: base lisa com pontinhos claros e escuros em posições fixas. */
export function paintSand(size = 96): PixelBuf {
  const b = createBuf(size, size);
  rect(b, 0, 0, size, size, SAND.base);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h = (x * 73856093 ^ y * 19349663) >>> 0;
      const r = h % 29;
      if (r === 0) put(b, x, y, SAND.light);
      else if (r === 1) put(b, x, y, SAND.dark);
      else if (r === 2 && x + 1 < size) { put(b, x, y, SAND.dark); put(b, x + 1, y, SAND.dark); }
    }
  }
  return b;
}

/** Um vão do muro (16×8 px): pedra com um arco escuro no meio. Repetido em volta da arena. */
export function paintWallTile(): PixelBuf {
  const b = createBuf(16, 8);
  rect(b, 0, 0, 16, 8, STONE.mid);
  rect(b, 0, 0, 16, 1, STONE.light);
  rect(b, 0, 7, 16, 1, STONE.dark);
  rect(b, 4, 2, 8, 6, STONE.deep);
  rect(b, 5, 1, 6, 1, STONE.deep);
  rect(b, 4, 1, 1, 1, STONE.dark);
  rect(b, 11, 1, 1, 1, STONE.dark);
  put(b, 8, 0, STONE.shade);
  put(b, 0, 3, STONE.dark);
  put(b, 15, 5, STONE.dark);
  return b;
}

export const STANDS_W = 384;
export const STANDS_H = 36;
const TIER = 6;
const SECTION = 24;

/**
 * Arquibancada (a volta toda numa textura só): degraus de pedra, seções vermelha e azul e torcida em posições fixas.
 * Do centro do fundo (x = metade) para a esquerda da tela é vermelho (equipe 0, à esquerda na batalha) e para a
 * direita, azul; atrás da câmera as cores se alternam. Um corredor de pedra separa as seções.
 */
export function paintStands(): PixelBuf {
  const b = createBuf(STANDS_W, STANDS_H);
  for (let x = 0; x < STANDS_W; x++) {
    // A coluna 0 da textura é o ponto da frente (atrás de quem olha); a metade é o fundo, de frente para a câmera.
    const offset = x - STANDS_W / 2;
    const k = Math.floor((offset + STANDS_W) / SECTION);
    const aisle = ((offset + STANDS_W) % SECTION) < 2;
    const team = offset >= 0 ? RED : BLUE;
    const alt = Math.abs(offset) > SECTION * 3 && k % 2 === 0;
    const section = alt ? (offset >= 0 ? BLUE : RED) : team;
    for (let y = 0; y < STANDS_H; y++) {
      const row = y % TIER;
      if (aisle) { put(b, x, y, row === 0 ? STONE.light : STONE.mid); continue; }
      if (row === 0) put(b, x, y, STONE.light);
      else if (row === TIER - 1) put(b, x, y, section.dark);
      else put(b, x, y, section.main);
      if (row === 2) {
        const h = (x * 7 + y * 13 + k * 5) % 11;
        if (h < 6) put(b, x, y, CROWD[(x * 3 + y + k) % CROWD.length]!);
      }
    }
  }
  return b;
}

/** Tocha (8×16): chama com miolo claro e ponta vermelha em cima, braseiro de pedra embaixo. */
export function paintFlame(): PixelBuf {
  const b = createBuf(8, 16);
  const rows: [number, number, number][] = [[3, 2, 0xff5a2a], [2, 4, 0xff7a2a], [1, 6, 0xff9a2a], [1, 6, 0xffb43a], [0, 8, 0xff9a2a], [0, 8, 0xffb43a], [0, 8, 0xffd84a], [1, 6, 0xffd84a], [1, 6, 0xffe88a], [2, 4, 0xffe88a], [2, 4, 0xfff4c0], [3, 2, 0xfff4c0]];
  rows.forEach(([x, w, rgb], i) => rect(b, x, i, w, 1, rgb));
  rect(b, 1, 12, 6, 1, STONE.dark);
  rect(b, 2, 13, 4, 1, STONE.shade);
  rect(b, 3, 14, 2, 1, STONE.shade);
  rect(b, 3, 15, 2, 1, STONE.deep);
  return b;
}

/** Os buffers RGBA começam no topo e o UV tem a origem embaixo: `repeat.y = -1` desvira sem custo (como em `ground.ts`). */
function texture(buf: PixelBuf, repeatX = 1): DataTexture {
  const t = new DataTexture(buf.data, buf.w, buf.h, RGBAFormat, UnsignedByteType);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.colorSpace = SRGBColorSpace;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeatX, -1);
  t.offset.set(0, 1);
  t.needsUpdate = true;
  return t;
}

export class ColiseuScenery {
  readonly group = new Group();
  private readonly materials: MeshBasicMaterial[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly torches: { sprite: Sprite; phase: number }[] = [];
  /** Muro, arquibancada e tochas (desligado fica só a areia). */
  private readonly detailParts: { visible: boolean }[] = [];
  private detailOn = true;

  constructor(readonly radius: number = SCENERY_RADIUS) {
    const R = radius;
    const basic = (map: DataTexture): MeshBasicMaterial => {
      const m = new MeshBasicMaterial({ map, side: DoubleSide });
      this.materials.push(m);
      this.disposables.push(m, map);
      return m;
    };
    const geo = <T extends { dispose(): void }>(g: T): T => { this.disposables.push(g); return g; };

    // Areia: o chão da arena inteira, por baixo de tudo.
    const sand = new Mesh(geo(new CircleGeometry(R, 48)), basic(texture(paintSand())));
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = 0.0006;
    sand.renderOrder = -3;
    (sand.material as MeshBasicMaterial).depthWrite = false;
    this.group.add(sand);

    // Muro de arcadas em volta (a parte de baixo).
    const wall = new Mesh(geo(new CylinderGeometry(R, R, WALL_HEIGHT, 64, 1, true)), basic(texture(paintWallTile(), 16)));
    wall.position.y = WALL_HEIGHT / 2;
    this.group.add(wall);
    this.detailParts.push(wall);

    // Arquibancada inclinada, subindo do muro para fora.
    const stands = new Mesh(geo(new CylinderGeometry(R + STANDS_DEPTH, R, STANDS_RISE, 96, 1, true)), basic(texture(paintStands())));
    stands.position.y = WALL_HEIGHT + STANDS_RISE / 2;
    this.group.add(stands);
    this.detailParts.push(stands);

    // Tochas no alto do muro, de frente para o centro; a do fundo (de frente para a câmera) sempre aparece.
    const flame = texture(paintFlame());
    this.disposables.push(flame);
    for (let i = 0; i < TORCHES; i++) {
      const angle = Math.PI + ((i - (TORCHES - 1) / 2) / TORCHES) * Math.PI * 2 * 0.62;
      const material = new SpriteMaterial({ map: flame, transparent: true, depthWrite: false });
      this.disposables.push(material);
      const sprite = new Sprite(material);
      sprite.center.set(0.5, 0);
      sprite.position.set(Math.sin(angle) * (R - 0.15), WALL_HEIGHT + 0.05, Math.cos(angle) * (R - 0.15));
      sprite.scale.set(0.3, 0.6, 1);
      this.group.add(sprite);
      this.detailParts.push(sprite);
      this.torches.push({ sprite, phase: i * 1.7 });
    }
  }

  get detail(): boolean {
    return this.detailOn;
  }

  /** Liga ou desliga o muro, a arquibancada e as tochas; sem eles só a areia é desenhada e as chamas não são atualizadas. */
  setDetail(on: boolean): void {
    this.detailOn = on;
    for (const part of this.detailParts) part.visible = on;
  }

  /** Cor multiplicada nas texturas (acompanha a luz da cena e escurece no foco dos golpes). */
  setTint(r: number, g: number, b: number): void {
    for (const m of this.materials) m.color.setRGB(r, g, b);
  }

  /** As chamas tremem (só escala e brilho, de graça para a GPU). */
  update(nowMs: number): void {
    if (!this.detailOn) return;
    for (const { sprite, phase } of this.torches) {
      const wobble = 1 + 0.14 * Math.sin(nowMs / 85 + phase) + 0.06 * Math.sin(nowMs / 37 + phase * 2);
      sprite.scale.set(0.3 * (1 + 0.06 * Math.sin(nowMs / 61 + phase)), 0.6 * (1 + (wobble - 1) * 0.6), 1);
      sprite.material.opacity = 0.82 + 0.18 * Math.sin(nowMs / 110 + phase);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.materials.length = 0;
    this.torches.length = 0;
    this.detailParts.length = 0;
    this.group.removeFromParent();
    this.group.clear();
  }
}
