import { AdditiveBlending, Color, DataTexture, Group, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, RGBAFormat, UnsignedByteType } from 'three';
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

function glowMaterial(map: DataTexture, color: Color): MeshBasicMaterial {
  return new MeshBasicMaterial({ map, color, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 1 });
}

/**
 * O brilho do Pokémon shiny: um halo dourado que pulsa em volta da silhueta e estrelinhas que giram e piscam. É um grupo
 * para pendurar **no plano do Pokémon** (as medidas são frações do plano de 1×1, então ele acompanha tamanho e
 * espelhamento do sprite). `centerY` é o centro do plano (0 no AR, 0,5 na Caixa, onde a origem fica nos pés).
 */
export class ShinyAura {
  readonly group = new Group();
  private readonly halo: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly stars: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly textures: DataTexture[] = [];

  constructor(private readonly centerY = 0) {
    const haloMap = alphaTexture((x, y) => haloAlpha(Math.hypot(x, y)));
    const starMap = alphaTexture(starAlpha);
    this.textures.push(haloMap, starMap);
    this.halo = new Mesh(new PlaneGeometry(1, 1), glowMaterial(haloMap, GOLD));
    this.halo.scale.set(HALO_SCALE, HALO_SCALE, 1);
    this.halo.position.set(0, centerY, BEHIND);
    this.halo.renderOrder = 3;
    this.group.add(this.halo);
    for (let i = 0; i < SPARKLES; i++) {
      const star = new Mesh(new PlaneGeometry(1, 1), glowMaterial(starMap, STAR));
      star.renderOrder = 4;
      this.stars.push(star);
      this.group.add(star);
    }
    this.update(0);
  }

  /** Anima para o instante `nowMs`. */
  update(nowMs: number): void {
    const seconds = nowMs / 1000;
    this.halo.material.opacity = haloPulse(seconds);
    this.stars.forEach((star, i) => {
      const s = sparkleAt(i, this.stars.length, seconds);
      star.position.set(s.x, this.centerY + s.y, BEHIND * 0.5);
      star.scale.set(s.size, s.size, 1);
      star.material.opacity = s.alpha;
      star.visible = s.alpha > 0.02;
    });
  }

  dispose(): void {
    for (const mesh of [this.halo, ...this.stars]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    for (const texture of this.textures) texture.dispose();
    this.group.removeFromParent();
  }
}
