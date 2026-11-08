import { CircleGeometry, InstancedMesh, MeshBasicMaterial } from 'three';

/**
 * As sombras redondas de todos os Pokémon numa chamada de desenho só (eram 40, uma por sprite). A cena escreve onde cada
 * uma fica a cada quadro; não há mais o que soltar por Pokémon.
 */
export class ShadowBatch {
  readonly mesh: InstancedMesh<CircleGeometry, MeshBasicMaterial>;
  private written = 0;

  constructor(capacity: number) {
    const geometry = new CircleGeometry(0.5, 20);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new InstancedMesh(geometry, new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }), capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  begin(): void {
    this.written = 0;
  }

  /** Uma sombra no chão, centrada em (x, y, z), com os diâmetros `sx` e `sz`. Sem alocar nada. */
  add(x: number, y: number, z: number, sx: number, sz: number): void {
    if (this.written >= this.mesh.instanceMatrix.count) return;
    const m = this.mesh.instanceMatrix.array;
    const o = this.written * 16;
    m[o] = sx; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = sz; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
    this.written++;
  }

  end(): void {
    this.mesh.count = this.written;
    if (this.written > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }

  get count(): number {
    return this.mesh.count;
  }

  setOpacity(opacity: number): void {
    this.mesh.material.opacity = opacity;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
    this.mesh.removeFromParent();
  }
}
