import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CircleGeometry, Color, CylinderGeometry, DataTexture, DoubleSide, Group, InstancedMesh, LinearFilter, Matrix4, Mesh,
  MeshBasicMaterial, NearestFilter, PlaneGeometry, Points, PointsMaterial, RGBAFormat, RepeatWrapping, SRGBColorSpace, Sprite, SpriteMaterial, UnsignedByteType,
} from 'three';
import { createBuf } from './ground-art';
import type { PixelBuf } from './ground-art';
import { put, rect } from '../village/village-art';

/**
 * O cenário do Coliseu para a Arena (palco virtual, sem câmera): areia no chão, um muro de arcadas, a arquibancada
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

/**
 * Ponto da arquibancada (relativo ao centro da arena, no chão) no ângulo `angle` (π = o fundo, de frente para a câmera)
 * e na altura `row` (0 rente ao muro, 1 no topo): é onde a torcida se senta.
 */
export function standsPoint(angle: number, row: number, radius: number = SCENERY_RADIUS): { x: number; y: number; z: number } {
  const t = Math.min(1, Math.max(0, row));
  const r = radius + t * STANDS_DEPTH;
  return { x: Math.sin(angle) * r, y: WALL_HEIGHT + t * STANDS_RISE, z: Math.cos(angle) * r };
}
const TORCHES = 12;
const CROWD_ROWS = [0.2, 0.5, 0.8] as const;
const CROWD_PER_ROW = 36;
const PENNANTS = 16;
/** A torcida e as bandeiras se mexem a 12 quadros por segundo: já parece viva e quase não custa. */
const CROWD_STEP_MS = 80;
/** Quanto dura a ola, dando a volta nas arquibancadas. */
export const OLA_MS = 3400;
const OLA_WIDTH_RAD = 0.42;
const OLA_HEIGHT_M = 0.2;

/**
 * Quanto um torcedor sobe (m) no instante `nowMs`: um balanço miúdo e, se uma ola começou em `olaStartMs` (negativo =
 * nenhuma), o pulo quando a onda passa por ele no ângulo `angle`.
 */
export function crowdLift(angle: number, phase: number, nowMs: number, olaStartMs: number): number {
  const idle = 0.012 + 0.012 * Math.sin(nowMs / 420 + phase);
  if (olaStartMs < 0) return idle;
  const age = (nowMs - olaStartMs) / OLA_MS;
  if (age < 0 || age >= 1) return idle;
  const front = age * Math.PI * 2;
  const away = Math.abs(Math.atan2(Math.sin(angle - front), Math.cos(angle - front)));
  return idle + OLA_HEIGHT_M * Math.exp(-((away / OLA_WIDTH_RAD) ** 2));
}

const STONE = { light: 0xe0d4b2, mid: 0xc9bb96, dark: 0xa3956f, shade: 0x7a6e52, deep: 0x2a2218 } as const;
const SAND = { base: 0xc9b78a, light: 0xd9c9a0, dark: 0xb8a578 } as const;
const RED = { main: 0xd8463c, dark: 0xa02a24 } as const;
const BLUE = { main: 0x3f6fd0, dark: 0x2a4a98 } as const;
const CROWD = [0xf2c9a0, 0x3a2a22, 0x8a5a38, 0xf5f0e0, 0xffd84a, 0xd0804a] as const;
const SKIN = [0xf2c9a0, 0xd0a070, 0x8a5a38, 0x5a3a28] as const;

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

/** Bandeirinha da torcida (8×12): mastro claro e flâmula na cor da equipe (0 vermelha, 1 azul), com a ponta para a direita. */
export function paintPennant(team: 0 | 1): PixelBuf {
  const c = team === 0 ? RED : BLUE;
  const b = createBuf(8, 12);
  rect(b, 0, 0, 1, 12, STONE.light);
  put(b, 0, 11, STONE.shade);
  for (let y = 0; y < 7; y++) {
    const w = 7 - y;
    rect(b, 1, y, w, 1, c.main);
    put(b, w, y, c.dark);
  }
  rect(b, 1, 6, 1, 1, c.dark);
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

const flagMatrix = new Matrix4();
const flagSway = new Matrix4();

export class ColiseuScenery {
  readonly group = new Group();
  private readonly materials: MeshBasicMaterial[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly torches: { sprite: Sprite; phase: number }[] = [];
  /** Muro, arquibancada e tochas (desligado fica só a areia). */
  private readonly detailParts: { visible: boolean }[] = [];
  private detailOn = true;
  /** Torcida: duas chamadas de desenho (corpos e cabeças), a altura de cada um escrita direto na matriz. */
  private readonly fans: { angle: number; phase: number; y: number }[] = [];
  private bodies: InstancedMesh | null = null;
  private heads: InstancedMesh | null = null;
  private readonly flags: { mesh: InstancedMesh; x: number; y: number; z: number; yaw: number; phase: number; index: number }[] = [];
  private glow: Points | null = null;
  private olaStart = -1;
  private lastCrowdAt = -Infinity;
  private calm = false;
  private calmSettled = false;
  private night = 0;

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
    this.buildGlow(R);
    this.buildCrowd(R);
  }

  /** O brilho das tochas à noite: todos os halos num único `Points`, somado à imagem. Apagado de dia (não desenha). */
  private buildGlow(R: number): void {
    const size = 32;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
        const i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 255;
        data[i + 3] = Math.round(255 * Math.max(0, 1 - d) ** 2);
      }
    }
    const map = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
    map.magFilter = map.minFilter = LinearFilter;
    map.needsUpdate = true;
    const positions = new Float32Array(TORCHES * 3);
    this.torches.forEach(({ sprite }, i) => {
      positions[i * 3] = sprite.position.x * ((R - 0.3) / (R - 0.15));
      positions[i * 3 + 1] = sprite.position.y + 0.32;
      positions[i * 3 + 2] = sprite.position.z * ((R - 0.3) / (R - 0.15));
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const material = new PointsMaterial({ map, color: 0xff9a40, size: 1.5, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0, sizeAttenuation: true });
    material.visible = false;
    this.glow = new Points(geometry, material);
    this.glow.frustumCulled = false;
    this.disposables.push(map, geometry, material);
    this.group.add(this.glow);
    this.detailParts.push(this.glow);
  }

  /** A torcida em volta da arena e as bandeiras no topo. Sem textura para a torcida: são quadrados coloridos, como pixels. */
  private buildCrowd(R: number): void {
    const crowd = new Group();
    const flat = (): MeshBasicMaterial => {
      const m = new MeshBasicMaterial({ side: DoubleSide });
      this.materials.push(m);
      this.disposables.push(m);
      return m;
    };
    const total = CROWD_ROWS.length * CROWD_PER_ROW;
    const bodyGeo = new PlaneGeometry(0.2, 0.22);
    const headGeo = new PlaneGeometry(0.13, 0.13);
    const bodies = new InstancedMesh(bodyGeo, flat(), total);
    const heads = new InstancedMesh(headGeo, flat(), total);
    bodies.frustumCulled = heads.frustumCulled = false;
    this.disposables.push(bodyGeo, headGeo, bodies, heads);
    const matrix = new Matrix4();
    const color = new Color();
    let index = 0;
    CROWD_ROWS.forEach((row, r) => {
      for (let i = 0; i < CROWD_PER_ROW; i++) {
        const angle = ((i + r * 0.33) / CROWD_PER_ROW) * Math.PI * 2;
        const p = standsPoint(angle, row, R - 0.08);
        const y = p.y + 0.11;
        const yaw = Math.atan2(-p.x, -p.z);
        matrix.makeRotationY(yaw).setPosition(p.x, y, p.z);
        bodies.setMatrixAt(index, matrix);
        matrix.setPosition(p.x, y + 0.17, p.z);
        heads.setMatrixAt(index, matrix);
        const pick = (i * 7 + r * 13) % 10;
        const section = Math.floor((angle / (Math.PI * 2)) * 16) % 2 === 0 ? RED : BLUE;
        bodies.setColorAt(index, color.setHex(pick < 7 ? section.main : CROWD[(pick + r) % CROWD.length]!));
        heads.setColorAt(index, color.setHex(SKIN[(i * 3 + r) % SKIN.length]!));
        this.fans.push({ angle, phase: (i * 2.399 + r * 1.3) % (Math.PI * 2), y });
        index++;
      }
    });
    crowd.add(bodies, heads);
    this.bodies = bodies;
    this.heads = heads;

    const flagGeo = new PlaneGeometry(0.34, 0.5);
    flagGeo.translate(0.17, 0.25, 0);
    this.disposables.push(flagGeo);
    const perTeam = Math.ceil(PENNANTS / 2);
    const teams = ([0, 1] as const).map((team) => {
      const material = new MeshBasicMaterial({ map: texture(paintPennant(team)), side: DoubleSide, alphaTest: 0.5 });
      this.materials.push(material);
      this.disposables.push(material, material.map!);
      const mesh = new InstancedMesh(flagGeo, material, perTeam);
      mesh.frustumCulled = false;
      this.disposables.push(mesh);
      crowd.add(mesh);
      return mesh;
    });
    for (let i = 0; i < PENNANTS; i++) {
      const angle = (i / PENNANTS) * Math.PI * 2;
      const p = standsPoint(angle, 1, R - 0.05);
      const flag = { mesh: teams[i % 2]!, x: p.x, y: p.y, z: p.z, yaw: Math.atan2(-p.x, -p.z), phase: i * 1.1, index: Math.floor(i / 2) };
      this.flags.push(flag);
      flag.mesh.setMatrixAt(flag.index, matrix.makeRotationY(flag.yaw).setPosition(p.x, p.y, p.z));
    }
    this.group.add(crowd);
    this.detailParts.push(crowd);
  }

  /** Quanto o brilho das tochas pesa (0 de dia, 1 de noite). */
  setGlow(night: number): void {
    this.night = night;
    if (this.glow) (this.glow.material as PointsMaterial).visible = night > 0.05;
  }

  /** Movimento reduzido: chamas, torcida e bandeiras ficam paradas. */
  setCalm(on: boolean): void {
    this.calm = on;
    this.calmSettled = false;
    if (on) this.olaStart = -1;
  }

  /** A torcida faz a ola (ignorado se uma já está passando). */
  cheer(nowMs: number): void {
    if (this.calm || !this.detailOn) return;
    if (this.olaStart >= 0 && nowMs - this.olaStart < OLA_MS) return;
    this.olaStart = nowMs;
  }

  get olaActive(): boolean {
    return this.olaStart >= 0;
  }

  private animateCrowd(nowMs: number): void {
    if (!this.bodies || !this.heads) return;
    if (nowMs - this.lastCrowdAt < CROWD_STEP_MS) return;
    this.lastCrowdAt = nowMs;
    if (this.olaStart >= 0 && nowMs - this.olaStart >= OLA_MS) this.olaStart = -1;
    const bodies = this.bodies.instanceMatrix.array;
    const heads = this.heads.instanceMatrix.array;
    for (let i = 0; i < this.fans.length; i++) {
      const fan = this.fans[i]!;
      const y = fan.y + crowdLift(fan.angle, fan.phase, nowMs, this.olaStart);
      bodies[i * 16 + 13] = y;
      heads[i * 16 + 13] = y + 0.17;
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    for (const flag of this.flags) {
      flagMatrix.makeRotationY(flag.yaw);
      flagSway.makeRotationZ(0.16 * Math.sin(nowMs / 340 + flag.phase));
      flagMatrix.multiply(flagSway).setPosition(flag.x, flag.y, flag.z);
      flag.mesh.setMatrixAt(flag.index, flagMatrix);
      flag.mesh.instanceMatrix.needsUpdate = true;
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
    if (this.glow) (this.glow.material as PointsMaterial).opacity = this.night * (this.calm ? 0.6 : 0.56 + 0.1 * Math.sin(nowMs / 120));
    if (this.calm) {
      if (this.calmSettled) return;
      this.calmSettled = true;
      for (const { sprite } of this.torches) {
        sprite.scale.set(0.3, 0.6, 1);
        sprite.material.opacity = 0.95;
      }
      return;
    }
    this.animateCrowd(nowMs);
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
    this.fans.length = 0;
    this.flags.length = 0;
    this.bodies = this.heads = null;
    this.glow = null;
    this.group.removeFromParent();
    this.group.clear();
  }
}
