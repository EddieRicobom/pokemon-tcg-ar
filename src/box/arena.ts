import { Ground } from './ground';
import { AdditiveBlending, CircleGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, Vector3 } from 'three';

/**
 * A arena da batalha: um disco pequeno no chão, logo à frente do olhar, do tamanho da tela. Assim dá para
 * acompanhar a luta inteira sem virar o celular. Tudo aqui é conta pura (`arenaRadii`, `arenaFrame`) mais um
 * pouco de desenho (`ArenaStage`).
 */

/** Meio-eixo da arena (m, em unidades da própria arena): x acompanha a largura da tela, z a profundidade. */
export function arenaRadii(fighters: number): { rx: number; rz: number } {
  const rx = 0.42 + 0.06 * Math.min(Math.max(fighters, 2), 6);
  return { rx, rz: rx * 0.5 };
}

export interface ArenaFrame {
  /** Centro da arena no mundo (no chão). */
  center: Vector3;
  /** Giro em Y para o eixo x da arena acompanhar a direita da tela e o z apontar para o celular. */
  yaw: number;
  /** Escala da arena inteira (Pokémon, golpes e partículas encolhem junto). */
  scale: number;
  /** Distância horizontal até o centro (m). */
  distance: number;
}

export const ARENA_MIN_DISTANCE = 0.9;
export const ARENA_MAX_DISTANCE = 1.7;
export const ARENA_DEFAULT_DISTANCE = 1.3;
/** Fração da meia-largura visível que a arena ocupa. */
export const ARENA_SCREEN_FILL = 0.7;
export const ARENA_SCALE_RANGE = { min: 0.25, max: 1 } as const;

/**
 * Onde pôr a arena para ficar de frente para o olhar: no ponto do chão sob o centro da tela (limitado a uma
 * distância confortável) e com a escala que faz a arena ocupar `ARENA_SCREEN_FILL` da largura da tela.
 *
 * `forward` = para onde a câmera olha; `floorY` = altura do chão (negativa: a câmera fica na origem);
 * `fallback` = direção horizontal a usar quando o celular aponta para cima ou direto para baixo.
 */
export function arenaFrame(
  forward: Vector3,
  floorY: number,
  verticalFovDeg: number,
  aspect: number,
  rx: number,
  fallback: { x: number; z: number } = { x: 0, z: -1 },
): ArenaFrame {
  const horizontal = Math.hypot(forward.x, forward.z);
  let dirX = fallback.x;
  let dirZ = fallback.z;
  if (horizontal > 0.15) {
    dirX = forward.x / horizontal;
    dirZ = forward.z / horizontal;
  } else {
    const len = Math.hypot(dirX, dirZ) || 1;
    dirX /= len;
    dirZ /= len;
  }
  let distance = ARENA_DEFAULT_DISTANCE;
  // O raio do centro da tela encontra o chão a `t`; só vale se o celular aponta para baixo.
  if (forward.y < -0.05 && floorY < 0) distance = (floorY / forward.y) * horizontal;
  distance = Math.min(ARENA_MAX_DISTANCE, Math.max(ARENA_MIN_DISTANCE, distance));
  const center = new Vector3(dirX * distance, floorY, dirZ * distance);
  const slant = Math.hypot(distance, floorY);
  const halfWidth = slant * Math.tan((verticalFovDeg * Math.PI) / 360) * Math.max(0.2, aspect);
  const scale = Math.min(ARENA_SCALE_RANGE.max, Math.max(ARENA_SCALE_RANGE.min, (ARENA_SCREEN_FILL * halfWidth) / rx));
  return { center, yaw: Math.atan2(-dirX, -dirZ), scale, distance };
}

/** Piso da arena: disco escuro, borda que acende na cor do golpe e anel interno. */
export class ArenaStage {
  readonly group = new Group();
  /** Chão em pixel art (null quando o terreno está desligado: só o disco escuro de antes). */
  readonly ground: Ground | null;
  private readonly disc: Mesh<CircleGeometry, MeshBasicMaterial>;
  private readonly rim: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly inner: Mesh<RingGeometry, MeshBasicMaterial>;
  private color = 0xffcb05;
  private glow = 0;
  private time = 0;
  private appear = 0;

  constructor(readonly rx: number, readonly rz: number, terrain = false, seed = 1) {
    // Com terreno o chão é maior que o disco de antes; a borda que acende acompanha a borda do chão.
    const ringX = terrain ? rx * 1.28 : rx * 1.15;
    const ringZ = terrain ? rz * 1.5 : rz * 1.25;
    const flat = (mesh: Mesh): void => {
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(ringX, ringZ, 1);
    };
    this.ground = terrain ? new Ground({ halfW: rx * 1.3, halfD: rz * 1.55, shape: 'ellipse', seed, cols: 30, decor: 24, decorUnit: Math.max(0.14, rx * 0.2), opacity: 0.96 }) : null;
    if (this.ground) this.group.add(this.ground.group);
    this.disc = new Mesh(new CircleGeometry(1, 48), new MeshBasicMaterial({ color: 0x0a0f1e, transparent: true, opacity: 0.45, depthWrite: false, side: DoubleSide }));
    this.rim = new Mesh(new RingGeometry(0.965, 1, 64), new MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    this.inner = new Mesh(new RingGeometry(0.55, 0.565, 64), new MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    for (const mesh of [this.disc, this.rim, this.inner]) {
      flat(mesh);
      mesh.position.y = 0.003;
      this.group.add(mesh);
    }
    this.group.scale.setScalar(0.01);
  }

  setColor(hex: number): void {
    this.color = hex;
    this.rim.material.color.setHex(hex);
    this.inner.material.color.setHex(hex);
  }

  /** 0 = calma, 1 = golpe em andamento (borda mais forte). */
  setGlow(value: number): void {
    this.glow = Math.min(1, Math.max(0, value));
  }

  get currentColor(): number {
    return this.color;
  }

  /** O disco "nasce" nos primeiros ~500 ms. */
  update(dtMs: number): void {
    this.time += dtMs;
    this.appear = Math.min(1, this.appear + dtMs / 500);
    const ease = 1 - Math.pow(1 - this.appear, 3);
    this.group.scale.setScalar(Math.max(0.01, ease));
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 0.004);
    this.rim.material.opacity = (0.45 + 0.25 * pulse + 0.45 * this.glow) * ease;
    this.inner.material.opacity = (0.12 + 0.12 * pulse + 0.3 * this.glow) * ease;
    this.disc.material.opacity = (this.ground ? 0 : 0.4) * ease;
  }

  get scaleNow(): number {
    return this.group.scale.x;
  }

  dispose(): void {
    for (const mesh of [this.disc, this.rim, this.inner]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.ground?.dispose();
    this.group.removeFromParent();
  }
}
