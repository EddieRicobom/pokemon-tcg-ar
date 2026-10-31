import { Color, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Sprite, SpriteMaterial } from 'three';
import type { CanvasTexture, Object3D } from 'three';
import { FX_LANE_HEIGHT, layerProgress, particleAt, planDurationMs } from '../core/archetype-fx';
import type { FxLayer } from '../core/archetype-fx';
import { fxSheet, fxTexture } from './archetype-sprites';

/** Onde está o Pokémon no espaço da carta (largura da carta = 1): ponto do chão sob ele e tamanho visível. */
export interface FxAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Partículas acima do Pokémon e do círculo no chão; o Pokémon (opaco, grava profundidade) esconde as que passam atrás. */
const SPRITE_ORDER = 6;
const RING_ORDER = 3;
/** Raio mínimo em volta do Pokémon (larguras de carta), para Pokémon fininhos não sumirem atrás das partículas. */
const MIN_RADIUS = 0.28;
/** Ampliação das partículas e dos selos sobre o tamanho da receita (calibrada vendo a cena na distância de uso). */
const PARTICLE_GAIN = 2;
const BADGE_GAIN = 1.15;

interface LiveLayer {
  objects: (Sprite | Mesh<PlaneGeometry, MeshBasicMaterial>)[];
  textures: CanvasTexture[];
  frames: number;
  aspect: number;
}

/**
 * As animações dos arquétipos de uma carta, tocando juntas conforme o plano (`planArchetypeFx`). Cada camada cria as
 * partículas quando começa e as libera quando termina, então só há na GPU o que está na tela. Partículas são `Sprite`
 * (sempre de frente para a câmera, como sprites de jogo 2D); o círculo mágico é um plano deitado na carta.
 */
export class ArchetypeFx {
  readonly group = new Group();
  private readonly live = new Map<number, LiveLayer>();
  private readonly totalMs: number;

  constructor(private readonly plan: readonly FxLayer[]) {
    this.totalMs = planDurationMs(plan);
  }

  /** Anima para `elapsedMs` desde o começo. Devolve true quando tudo terminou. */
  update(elapsedMs: number, anchor: FxAnchor): boolean {
    const radius = Math.max(MIN_RADIUS, anchor.width * 0.6);
    this.plan.forEach((layer, index) => {
      const t = layerProgress(layer, elapsedMs);
      if (t === null) {
        if (elapsedMs > layer.startMs) this.release(index);
        return;
      }
      const live = this.live.get(index) ?? this.create(index, layer);
      const { recipe } = layer;
      live.objects.forEach((object, i) => {
        const p = particleAt(recipe.motion, i, live.objects.length, t);
        const visible = p.alpha > 0.01 && p.scale > 0.01;
        object.visible = visible;
        if (!visible) return;
        const material = object.material;
        material.opacity = p.alpha;
        if (object instanceof Sprite) {
          const size = recipe.size * anchor.height * p.scale * (recipe.shape === 'badge' ? BADGE_GAIN : PARTICLE_GAIN);
          const texture = live.textures[i]!;
          texture.offset.x = Math.min(live.frames - 1, Math.floor(p.frame * live.frames)) / live.frames;
          object.material.rotation = p.rot;
          object.scale.set(size * live.aspect, size, 1);
          // O centro do sprite fica no ponto: sobe meia altura para o desenho não afundar na carta.
          object.position.set(anchor.x + p.x * radius, anchor.y + p.y * radius, (p.z + layer.lane * FX_LANE_HEIGHT) * anchor.height + size / 2);
        } else {
          const size = recipe.size * radius * 2 * p.scale;
          object.scale.set(size, size, 1);
          object.rotation.z = p.rot;
          object.position.set(anchor.x, anchor.y, 0.003 + index * 0.0004);
        }
      });
    });
    const done = elapsedMs >= this.totalMs;
    if (done) for (const index of [...this.live.keys()]) this.release(index);
    return done;
  }

  private create(index: number, layer: FxLayer): LiveLayer {
    const { recipe } = layer;
    const sheet = fxSheet(recipe);
    const base = fxTexture(sheet);
    const live: LiveLayer = { objects: [], textures: [base], frames: sheet.frames, aspect: sheet.aspect };
    const tint = (i: number) => new Color(recipe.tints?.length ? recipe.tints[i % recipe.tints.length]! : '#ffffff');
    if (recipe.motion === 'ring') {
      const ring = new Mesh(
        new PlaneGeometry(1, 1),
        new MeshBasicMaterial({ map: base, color: tint(0), transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false }),
      );
      ring.renderOrder = RING_ORDER;
      live.objects.push(ring);
    } else {
      for (let i = 0; i < recipe.count; i++) {
        const map = i === 0 ? base : base.clone();
        if (i > 0) live.textures.push(map);
        const sprite = new Sprite(new SpriteMaterial({ map, color: tint(i), transparent: true, depthWrite: false, toneMapped: false }));
        sprite.renderOrder = SPRITE_ORDER;
        live.objects.push(sprite);
      }
    }
    for (const object of live.objects as Object3D[]) {
      object.visible = false;
      this.group.add(object);
    }
    this.live.set(index, live);
    return live;
  }

  private release(index: number): void {
    const live = this.live.get(index);
    if (!live) return;
    this.live.delete(index);
    for (const object of live.objects) {
      object.removeFromParent();
      object.material.dispose();
      if (object instanceof Mesh) object.geometry.dispose();
    }
    for (const texture of live.textures) texture.dispose();
  }

  dispose(): void {
    for (const index of [...this.live.keys()]) this.release(index);
    this.group.removeFromParent();
  }
}
