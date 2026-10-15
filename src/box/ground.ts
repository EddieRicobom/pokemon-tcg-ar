import { DataTexture, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, RGBAFormat, Sprite, SpriteMaterial, UnsignedByteType } from 'three';
import { seededRng } from '../core/battle';
import type { PokemonType } from '../core/pokemon-data';
import { planRelief, reliefShade } from '../core/relief';
import type { Relief } from '../core/relief';
import { applyTerrain, buildGrid, planDecor, TERRAIN_FOR_TYPE } from '../core/terrain';
import type { DecorKind, GroundShape, TerrainGrid, TerrainKind, TerrainReaction } from '../core/terrain';
import { createBuf, paintDecor, paintTerrainCell, TILE, touchedCells } from './ground-art';
import type { PixelBuf } from './ground-art';

export interface GroundOptions {
  /** Meia-largura e meia-profundidade do chão (unidades da cena onde ele mora). */
  halfW: number;
  halfD: number;
  shape: GroundShape;
  seed: number;
  /** Blocos na largura (a altura segue a proporção). */
  cols: number;
  /** Quantos enfeites de pé. */
  decor: number;
  /** Altura base de um enfeite. */
  decorUnit: number;
  opacity: number;
  /** Altura típica dos morrinhos (m). Omitido ou 0 = chão liso (a arena da batalha é lisa). */
  relief?: number;
}

export interface GroundHit {
  kind: TerrainKind;
  changed: number;
  reaction: TerrainReaction | null;
}

function texture(buf: PixelBuf): DataTexture {
  const t = new DataTexture(buf.data, buf.w, buf.h, RGBAFormat, UnsignedByteType);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/**
 * O chão em pixel art: um plano com a textura dos blocos (grama, flores, mato alto, trilha) mais enfeites de pé nas
 * bordas. `hit` repinta os blocos que um golpe elemental atinge. Tudo é código: sem imagens para baixar.
 */
export class Ground {
  readonly group = new Group();
  readonly grid: TerrainGrid;
  private readonly buf: PixelBuf;
  private readonly tex: DataTexture;
  private readonly material: MeshBasicMaterial;
  private readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly decorSprites: Sprite[] = [];
  private readonly decorTextures = new Map<DecorKind, DataTexture>();
  private readonly rng;
  private readonly relief: Relief;

  constructor(private readonly o: GroundOptions) {
    const rows = Math.max(6, Math.round(o.cols * (o.halfD / o.halfW)));
    this.grid = buildGrid(o.cols, rows, o.shape, o.seed);
    this.rng = seededRng(o.seed ^ 0x51ed);
    this.buf = createBuf(o.cols * TILE, rows * TILE);
    for (let i = 0; i < o.cols * rows; i++) this.paintCell(i);
    this.tex = texture(this.buf);
    this.material = new MeshBasicMaterial({ map: this.tex, transparent: true, opacity: o.opacity, depthWrite: false, vertexColors: (o.relief ?? 0) > 0 });
    this.relief = planRelief(o.halfW, o.halfD, o.seed, o.relief ?? 0);
    this.mesh = new Mesh(this.reliefGeometry(rows), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.002;
    this.mesh.renderOrder = -2;
    this.group.add(this.mesh);
    for (const item of planDecor(o.halfW, o.halfD, o.shape, o.seed, o.decor, o.decorUnit)) {
      const sprite = new Sprite(new SpriteMaterial({ map: this.decorTexture(item.kind), transparent: true, depthWrite: false }));
      sprite.center.set(0.5, 0.06);
      sprite.scale.set(item.flip ? -item.size : item.size, item.size, 1);
      sprite.position.set(item.x, this.relief.heightAt(item.x, item.z), item.z);
      this.group.add(sprite);
      this.decorSprites.push(sprite);
    }
  }

  /**
   * A malha do chão. Com relevo ela é subdividida (2 vértices por bloco), cada vértice sobe até a altura do terreno e leva um
   * brilho de sol fixo (encostas viradas para a luz clareiam, as outras escurecem), que multiplica a textura em pixel art.
   */
  private reliefGeometry(rows: number): PlaneGeometry {
    const { halfW, halfD } = this.o;
    if (!(this.o.relief && this.o.relief > 0)) return new PlaneGeometry(halfW * 2, halfD * 2);
    const geometry = new PlaneGeometry(halfW * 2, halfD * 2, this.o.cols * 2, rows * 2);
    const position = geometry.getAttribute('position');
    const colors: number[] = [];
    for (let i = 0; i < position.count; i++) {
      // Plano local (x, y) → chão (x, z = −y); a altura vira a coordenada local z (a malha é girada −90° em x).
      const x = position.getX(i);
      const z = -position.getY(i);
      position.setZ(i, this.relief.heightAt(x, z));
      const shade = reliefShade(this.relief.normalAt(x, z));
      colors.push(shade, shade, shade);
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    position.needsUpdate = true;
    geometry.computeBoundingSphere();
    return geometry;
  }

  /**
   * Uma camada por cima do chão com a mesma malha (acompanha o relevo): sombras de nuvem, poças, neve. Quem chama é dono
   * do material; a malha é a do chão (não descarte). `lift` sobe a camada uns milímetros para não brigar com o chão.
   */
  overlay(material: MeshBasicMaterial, lift: number): Mesh<PlaneGeometry, MeshBasicMaterial> {
    const mesh = new Mesh(this.mesh.geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = this.mesh.position.y + lift;
    mesh.renderOrder = -1;
    this.group.add(mesh);
    return mesh;
  }

  /** Profundidade relativa em (x, z): 0 no ponto mais alto da caixa, 1 no mais baixo (chão liso = 0,5 em todo lugar). */
  depthAt(x: number, z: number): number {
    const range = this.heightRange;
    if (range.max - range.min < 1e-4) return 0.5;
    return (range.max - this.relief.heightAt(x, z)) / (range.max - range.min);
  }

  private cachedRange: { min: number; max: number } | null = null;
  private get heightRange(): { min: number; max: number } {
    if (this.cachedRange) return this.cachedRange;
    let min = Infinity;
    let max = -Infinity;
    const n = 24;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const h = this.relief.heightAt(-this.o.halfW + (2 * this.o.halfW * i) / n, -this.o.halfD + (2 * this.o.halfD * j) / n);
        min = Math.min(min, h);
        max = Math.max(max, h);
      }
    }
    this.cachedRange = { min, max };
    return this.cachedRange;
  }

  /** Altura do chão em (x, z), relativa ao centro (0 se o chão é liso). */
  heightAt(x: number, z: number): number {
    return this.relief.heightAt(x, z);
  }

  private decorTexture(kind: DecorKind): DataTexture {
    let t = this.decorTextures.get(kind);
    if (!t) {
      t = texture(paintDecor(kind));
      this.decorTextures.set(kind, t);
    }
    return t;
  }

  /** Repinta um bloco (chão + marca do golpe), sempre com o mesmo sorteio para não "tremer" ao repintar. */
  private paintCell(i: number): void {
    paintTerrainCell(this.buf, this.grid, i, this.o.seed);
  }

  /** Um golpe de `type` cai em (x, z): marca o chão e devolve o que mudou (ou null se o tipo não deixa marca). */
  hit(type: PokemonType, x: number, z: number, power: number): GroundHit | null {
    const kind = TERRAIN_FOR_TYPE[type];
    if (!kind) return null;
    const { changed, reaction } = applyTerrain(this.grid, kind, x, z, this.o.halfW, this.o.halfD, power, this.rng);
    if (changed.length === 0) return null;
    // Os vizinhos também mudam de borda.
    for (const i of touchedCells(this.grid, changed)) this.paintCell(i);
    this.tex.needsUpdate = true;
    return { kind, changed: changed.length, reaction };
  }

  /** Tira todas as marcas dos golpes. */
  reset(): void {
    this.grid.clearOverlays();
    for (let i = 0; i < this.grid.over.length; i++) this.paintCell(i);
    this.tex.needsUpdate = true;
  }

  /** Cor do ambiente (e do escurecimento do foco do golpe) multiplicada no chão e nos enfeites. */
  setTint(r: number, g: number, b: number): void {
    this.material.color.setRGB(r, g, b);
    for (const sprite of this.decorSprites) sprite.material.color.setRGB(r, g, b);
  }

  get tint(): { r: number; g: number; b: number } {
    return { r: this.material.color.r, g: this.material.color.g, b: this.material.color.b };
  }

  /** Para testes e diagnóstico: os pixels do chão. */
  get pixels(): PixelBuf {
    return this.buf;
  }

  get decorCount(): number {
    return this.decorSprites.length;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.tex.dispose();
    for (const sprite of this.decorSprites) sprite.material.dispose();
    for (const t of this.decorTextures.values()) t.dispose();
    this.group.removeFromParent();
  }
}
