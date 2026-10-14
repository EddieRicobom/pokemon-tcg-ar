import { DataTexture, Group, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, RGBAFormat, Sprite, SpriteMaterial, UnsignedByteType } from 'three';
import { seededRng } from '../core/battle';
import type { PokemonType } from '../core/pokemon-data';
import { applyTerrain, buildGrid, planDecor, TERRAIN_FOR_TYPE, TERRAIN_KINDS } from '../core/terrain';
import type { DecorKind, GroundShape, TerrainGrid, TerrainKind, TerrainReaction } from '../core/terrain';
import { createBuf, EDGE, fadeEdges, paintDecor, paintGround, paintOverlay, TILE } from './ground-art';
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

  constructor(private readonly o: GroundOptions) {
    const rows = Math.max(6, Math.round(o.cols * (o.halfD / o.halfW)));
    this.grid = buildGrid(o.cols, rows, o.shape, o.seed);
    this.rng = seededRng(o.seed ^ 0x51ed);
    this.buf = createBuf(o.cols * TILE, rows * TILE);
    for (let i = 0; i < o.cols * rows; i++) this.paintCell(i);
    this.tex = texture(this.buf);
    this.material = new MeshBasicMaterial({ map: this.tex, transparent: true, opacity: o.opacity, depthWrite: false });
    this.mesh = new Mesh(new PlaneGeometry(o.halfW * 2, o.halfD * 2), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.002;
    this.mesh.renderOrder = -2;
    this.group.add(this.mesh);
    for (const item of planDecor(o.halfW, o.halfD, o.shape, o.seed, o.decor, o.decorUnit)) {
      const sprite = new Sprite(new SpriteMaterial({ map: this.decorTexture(item.kind), transparent: true, depthWrite: false }));
      sprite.center.set(0.5, 0.06);
      sprite.scale.set(item.flip ? -item.size : item.size, item.size, 1);
      sprite.position.set(item.x, 0, item.z);
      this.group.add(sprite);
      this.decorSprites.push(sprite);
    }
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
    const { grid } = this;
    const c = i % grid.cols;
    const r = Math.floor(i / grid.cols);
    const ox = c * TILE;
    const oy = r * TILE;
    for (let y = 0; y < TILE; y++) this.buf.data.fill(0, ((oy + y) * this.buf.w + ox) * 4, ((oy + y) * this.buf.w + ox + TILE) * 4);
    if (!grid.inside[i]) return;
    const salt = (this.o.seed * 31 + i * 2654435761) >>> 0;
    const neighbor = (dc: number, dr: number): number | null => {
      const nc = c + dc;
      const nr = r + dr;
      return nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows ? null : grid.index(nc, nr);
    };
    const around = [
      [EDGE.north, neighbor(0, -1)],
      [EDGE.east, neighbor(1, 0)],
      [EDGE.south, neighbor(0, 1)],
      [EDGE.west, neighbor(-1, 0)],
    ] as const;
    paintGround(this.buf, ox, oy, grid.groundAt(i), seededRng(salt));
    let shape = 0;
    for (const [bit, n] of around) if (n === null || !grid.inside[n]) shape |= bit;
    if (grid.shape === 'ellipse') fadeEdges(this.buf, ox, oy, shape, seededRng(salt ^ 0xabcdef));
    const kind = grid.overlayAt(i);
    if (kind) {
      let edges = 0;
      for (const [bit, n] of around) if (n === null || grid.over[n] !== grid.over[i]) edges |= bit;
      paintOverlay(this.buf, ox, oy, kind, edges, seededRng(salt ^ (0x1234567 + TERRAIN_KINDS.indexOf(kind))));
    }
  }

  /** Um golpe de `type` cai em (x, z): marca o chão e devolve o que mudou (ou null se o tipo não deixa marca). */
  hit(type: PokemonType, x: number, z: number, power: number): GroundHit | null {
    const kind = TERRAIN_FOR_TYPE[type];
    if (!kind) return null;
    const { changed, reaction } = applyTerrain(this.grid, kind, x, z, this.o.halfW, this.o.halfD, power, this.rng);
    if (changed.length === 0) return null;
    // Os vizinhos também mudam de borda.
    const touched = new Set<number>();
    for (const i of changed) {
      touched.add(i);
      const c = i % this.grid.cols;
      const r = Math.floor(i / this.grid.cols);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (c + dc >= 0 && c + dc < this.grid.cols && r + dr >= 0 && r + dr < this.grid.rows) touched.add(this.grid.index(c + dc, r + dr));
      }
    }
    for (const i of touched) this.paintCell(i);
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
