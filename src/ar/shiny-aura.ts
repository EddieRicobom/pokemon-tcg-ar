import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DataTexture, DynamicDrawUsage, Group, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, RGBAFormat, UnsignedByteType } from 'three';
import { haloAlpha, haloPulse, sparkleAt, starAlpha } from '../core/shiny-fx';

const TEXTURE_SIZE = 64;
const SPARKLES = 6;
/** Dourado do halo; as estrelas são quase brancas. */
const GOLD = new Color(1, 0.8, 0.28);
const STAR = new Color(1, 0.97, 0.78);
/** O halo é maior que o sprite: 1,7× a largura e a altura. */
const HALO_SCALE = 1.7;
/** Quanto o halo e as estrelas recuam atrás do plano do Pokémon (unidades do plano), para o Pokémon ficar na frente. */
const BEHIND = -0.01;

function alphaTexture(alphaAt: (x: number, y: number) => number): DataTexture {
  const n = TEXTURE_SIZE;
  const data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 4;
      const x = ((i + 0.5) / n) * 2 - 1;
      const y = ((j + 0.5) / n) * 2 - 1;
      data[k] = data[k + 1] = data[k + 2] = 255;
      data[k + 3] = Math.round(255 * alphaAt(x, y));
    }
  }
  const texture = new DataTexture(data, n, n, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Texturas e plano do halo valem para todos os shinies e só somem da GPU quando o último sai de cena. */
interface SharedAssets {
  haloMap: DataTexture;
  starMap: DataTexture;
  plane: PlaneGeometry;
  users: number;
}
let shared: SharedAssets | null = null;

function acquireShared(): SharedAssets {
  shared ??= {
    haloMap: alphaTexture((x, y) => haloAlpha(Math.hypot(x, y))),
    starMap: alphaTexture(starAlpha),
    plane: new PlaneGeometry(1, 1),
    users: 0,
  };
  shared.users++;
  return shared;
}

function releaseShared(): void {
  if (!shared || --shared.users > 0) return;
  shared.haloMap.dispose();
  shared.starMap.dispose();
  shared.plane.dispose();
  shared = null;
}

function glowMaterial(map: DataTexture, color: Color, vertexColors = false): MeshBasicMaterial {
  return new MeshBasicMaterial({ map, color, vertexColors, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 1 });
}

/** As estrelas num único desenho: um quadrado por estrela, com cor e alfa por vértice (alfa de verdade, o canvas do AR é transparente). */
function starsGeometry(count: number): BufferGeometry {
  const geometry = new BufferGeometry();
  const uv = new Float32Array(count * 8);
  const color = new Float32Array(count * 16);
  const index = new Uint16Array(count * 6);
  for (let i = 0; i < count; i++) {
    uv.set([0, 1, 1, 1, 0, 0, 1, 0], i * 8);
    const v = i * 4;
    index.set([v, v + 2, v + 1, v + 2, v + 3, v + 1], i * 6);
    for (let corner = 0; corner < 4; corner++) color.set([1, 1, 1, 0], v * 4 + corner * 4);
  }
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 12), 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setAttribute('color', new BufferAttribute(color, 4).setUsage(DynamicDrawUsage));
  geometry.setIndex(new BufferAttribute(index, 1));
  return geometry;
}

/**
 * O brilho do Pokémon shiny: um halo dourado que pulsa em volta da silhueta e estrelinhas que giram e piscam. É um grupo
 * para pendurar **no plano do Pokémon** (as medidas são frações do plano de 1×1, então ele acompanha tamanho e
 * espelhamento do sprite). `centerY` é o centro do plano (0 no AR, 0,5 na Caixa, onde a origem fica nos pés).
 * Custa dois desenhos por shiny, e todos dividem as mesmas texturas.
 */
export class ShinyAura {
  readonly group = new Group();
  private readonly halo: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly stars: Mesh<BufferGeometry, MeshBasicMaterial>;
  private disposed = false;

  constructor(private readonly centerY = 0) {
    const assets = acquireShared();
    this.halo = new Mesh(assets.plane, glowMaterial(assets.haloMap, GOLD));
    this.halo.scale.set(HALO_SCALE, HALO_SCALE, 1);
    this.halo.position.set(0, centerY, BEHIND);
    this.halo.renderOrder = 3;
    this.group.add(this.halo);
    this.stars = new Mesh(starsGeometry(SPARKLES), glowMaterial(assets.starMap, STAR, true));
    this.stars.renderOrder = 4;
    // Os vértices mudam a cada quadro: a esfera calculada uma vez ficaria velha.
    this.stars.frustumCulled = false;
    this.group.add(this.stars);
    this.update(0);
  }

  /** Anima para o instante `nowMs`. */
  update(nowMs: number): void {
    const seconds = nowMs / 1000;
    this.halo.material.opacity = haloPulse(seconds);
    const position = this.stars.geometry.getAttribute('position') as BufferAttribute;
    const color = this.stars.geometry.getAttribute('color') as BufferAttribute;
    const z = BEHIND * 0.5;
    for (let i = 0; i < SPARKLES; i++) {
      const s = sparkleAt(i, SPARKLES, seconds);
      const shown = s.alpha > 0.02;
      const half = shown ? s.size / 2 : 0;
      const cy = this.centerY + s.y;
      const v = i * 4;
      position.setXYZ(v, s.x - half, cy + half, z);
      position.setXYZ(v + 1, s.x + half, cy + half, z);
      position.setXYZ(v + 2, s.x - half, cy - half, z);
      position.setXYZ(v + 3, s.x + half, cy - half, z);
      for (let corner = 0; corner < 4; corner++) color.setW(v + corner, shown ? s.alpha : 0);
    }
    position.needsUpdate = true;
    color.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.halo.material.dispose();
    this.stars.material.dispose();
    this.stars.geometry.dispose();
    releaseShared();
    this.group.removeFromParent();
  }
}
