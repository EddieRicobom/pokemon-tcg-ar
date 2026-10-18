import { AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry } from 'three';
import { bondArrivalAt } from '../core/bond-arrival';

/** Geometria 2D: selos sobre a carta, fitas de luz e fragmentos em espiral. Nunca cria pose própria. */
export class BondArrival {
  readonly group = new Group();
  private readonly rings: Mesh<RingGeometry, MeshBasicMaterial>[] = [];
  private readonly shards: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly rays: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  constructor() {
    this.group.visible = false;
    for (let i = 0; i < 3; i++) {
      const ring = new Mesh(new RingGeometry(0.36 + i * 0.095, 0.37 + i * 0.095, 64, 1, 0, Math.PI * (i === 1 ? 1.65 : 2)), this.material(i === 1 ? 0xffd581 : 0x7af6ff));
      ring.position.z = 0.008 + i * 0.003;
      this.rings.push(ring);
      this.group.add(ring);
    }
    for (let i = 0; i < 24; i++) {
      const shard = new Mesh(new PlaneGeometry(0.024, 0.065), this.material(i % 3 === 0 ? 0xffd581 : 0xb5ffff));
      this.shards.push(shard);
      this.group.add(shard);
    }
    for (let i = 0; i < 8; i++) {
      const ray = new Mesh(new PlaneGeometry(0.025, 1), this.material(i % 2 ? 0xffd581 : 0x7af6ff));
      this.rays.push(ray);
      this.group.add(ray);
    }
  }
  private material(color: number): MeshBasicMaterial {
    return new MeshBasicMaterial({ color, transparent: true, opacity: 0, side: DoubleSide, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
  }
  update(elapsed: number, x: number, y: number): void {
    const f = bondArrivalAt(elapsed);
    this.group.visible = !f.done;
    this.group.position.set(x, y, 0);
    this.rings.forEach((ring, i) => {
      ring.rotation.z = elapsed / 900 * (i % 2 ? -1 : 1);
      ring.scale.setScalar((0.5 + f.portal * 0.5) * (1 + f.burst * 0.18));
      ring.material.opacity = f.portal * (i === 0 ? 0.85 : 0.6);
    });
    this.shards.forEach((shard, i) => {
      const phase = ((elapsed / 2100 + i / 24) % 1 + 1) % 1;
      const angle = i * 2.4 + elapsed / 650;
      const radius = 0.2 + phase * 0.42 + f.burst * 0.12;
      shard.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, phase * 1.1);
      shard.rotation.set(Math.PI / 2, 0, angle + elapsed / 1400);
      shard.material.opacity = f.portal * Math.sin(phase * Math.PI);
    });
    this.rays.forEach((ray, i) => {
      const angle = i / 8 * Math.PI * 2 + elapsed / 1600;
      ray.position.set(Math.cos(angle) * 0.35, Math.sin(angle) * 0.35, 0.48);
      ray.rotation.set(Math.PI / 2, angle, 0);
      ray.scale.set(1 + f.burst * 2, f.portal, 1);
      ray.material.opacity = f.portal * (1 - f.reveal * 0.7) * 0.34;
    });
  }
  dispose(): void {
    for (const mesh of [...this.rings, ...this.shards, ...this.rays]) { mesh.geometry.dispose(); mesh.material.dispose(); }
    this.group.removeFromParent();
  }
}
