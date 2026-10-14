import {
  BufferGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial, LineLoop, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry,
  Quaternion, Raycaster, Scene, Vector2, Vector3,
} from 'three';
import { BoxCreature } from './creature';
import type { CreatureInfo, CreatureSource } from './creature';
import { intersectFloor } from './floor';
import type { FloorResult } from './floor';
import { formationSlots } from './formation';
import { createWander, separate, stepToward, stepWander } from './wander';
import { arenaFrame, arenaRadii } from './arena';
import { BattleDirector } from './battle-director';
import { FxLights } from './fx-lights';
import type { SoundSink } from './sound-recipes';
import type { BattleHud } from './battle-director';
import { simulateBattle } from '../core/battle';
import type { BattleResult, Fighter } from '../core/battle';
import { DEFAULT_SMOOTHING } from '../core/pixel-upscale';
import type { SmoothingMode } from '../core/pixel-upscale';
import type { Rng } from './wander';

export const MAX_CREATURES = 30;
export const DEFAULT_HALF_SIZE_M = 1.2;

export type BoxMode = 'passeio' | 'formacao';

export interface CreatureEntry {
  info: CreatureInfo;
  source: CreatureSource;
}

/**
 * Cena da Caixa: a câmera fica na origem (só gira, seguindo os sensores); o chão é um plano horizontal abaixo
 * dela; a caixa é um quadrado desse chão onde os Pokémon passeiam. Sem WebGL aqui: o desenho é injetado
 * (a cena é testada sem navegador).
 */
export class BoxScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(60, 0.75, 0.05, 50);
  private readonly floor = new Group();
  private readonly raycaster = new Raycaster();
  private creatures: BoxCreature[] = [];
  private anchor: Vector3 | null = null;
  private half = DEFAULT_HALF_SIZE_M;
  private lastNow = 0;
  private smoothing: SmoothingMode = DEFAULT_SMOOTHING;
  mode: BoxMode = 'passeio';
  private director: BattleDirector | null = null;
  /** Raiz da arena da batalha: no chão, girada para a tela e encolhida. Os Pokémon moram nela só durante a luta. */
  private readonly battleRoot = new Group();
  private readonly battleCamera = new Vector3();
  private readonly battleZero = new Vector3();
  private readonly battleRight = new Vector3(1, 0, 0);
  private readonly rng: Rng;
  /** Luzes dos golpes e do ambiente, compartilhadas por todos os sprites. */
  readonly fx = new FxLights();
  private lighting = true;
  /** Quem toca os sons das próximas batalhas (null = mudo). */
  private sound: SoundSink | null = null;
  private readonly envTarget = new Vector3(1, 1, 1);
  private readonly env = new Vector3(1, 1, 1);

  constructor(rng: Rng = Math.random) {
    this.rng = rng;
    this.camera.position.set(0, 0, 0);
    this.floor.visible = false;
    this.scene.add(this.floor, this.battleRoot);
  }

  get placed(): boolean {
    return this.anchor !== null;
  }

  get halfSize(): number {
    return this.half;
  }

  get creatureList(): readonly BoxCreature[] {
    return this.creatures;
  }

  get center(): Vector3 | null {
    return this.anchor?.clone() ?? null;
  }

  setView(width: number, height: number, verticalFovDeg: number): void {
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.fov = verticalFovDeg;
    this.camera.updateProjectionMatrix();
  }

  setCameraQuaternion(q: Quaternion): void {
    this.camera.quaternion.copy(q);
    this.camera.updateMatrixWorld(true);
  }

  /** Chão sob um ponto da tela (coordenadas normalizadas), para colocar a caixa. */
  floorAt(ndcX: number, ndcY: number, phoneHeight: number): FloorResult {
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    return intersectFloor(this.raycaster.ray.direction, phoneHeight);
  }

  /** Coloca (ou move) a caixa com o centro em `point`, um ponto do chão. */
  place(point: Vector3, half: number = this.half): void {
    this.anchor = point.clone();
    this.floor.position.copy(point);
    this.setHalfSize(half);
    this.floor.visible = true;
  }

  clearPlacement(): void {
    this.anchor = null;
    this.floor.visible = false;
  }

  setHalfSize(half: number): void {
    this.half = Math.min(3, Math.max(0.5, half));
    this.rebuildFloor();
    for (const creature of this.creatures) {
      creature.state.x = Math.min(this.half * 0.9, Math.max(-this.half * 0.9, creature.state.x));
      creature.state.z = Math.min(this.half * 0.9, Math.max(-this.half * 0.9, creature.state.z));
    }
  }

  private rebuildFloor(): void {
    for (const child of [...this.floor.children]) {
      const disposable = child as Mesh | Line;
      disposable.geometry?.dispose();
      (disposable.material as MeshBasicMaterial | LineBasicMaterial | undefined)?.dispose();
      this.floor.remove(child);
    }
    const y = 0.002;
    const h = this.half;
    const plane = new Mesh(
      new PlaneGeometry(h * 2, h * 2),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = y;
    const outline = new LineLoop(
      new BufferGeometry().setAttribute('position', new Float32BufferAttribute([-h, y, -h, h, y, -h, h, y, h, -h, y, h], 3)),
      new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
    );
    this.floor.add(plane, outline);
    // Cantos em "L" para a caixa parecer uma caixa.
    const tick = Math.min(0.25, h * 0.3);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const corner = new Line(
        new BufferGeometry().setAttribute(
          'position',
          new Float32BufferAttribute([sx * (h - tick), y + 0.001, sz * h, sx * h, y + 0.001, sz * h, sx * h, y + 0.001, sz * (h - tick)], 3),
        ),
        new LineBasicMaterial({ color: 0xffcb05 }),
      );
      this.floor.add(corner);
    }
  }

  /** Suavização de pixels de todos os Pokémon da caixa. */
  setSmoothing(mode: SmoothingMode): void {
    this.smoothing = mode;
    for (const creature of this.creatures) creature.setSmoothing(mode);
  }

  /** Luz do ambiente real (da câmera): multiplica a cor dos sprites. Mudanças são suavizadas. */
  setEnvironment(r: number, g: number, b: number): void {
    this.envTarget.set(r, g, b);
  }

  /** Liga ou desliga a luz dos golpes e do ambiente nos sprites, no chão e no vídeo. */
  setLighting(on: boolean): void {
    this.lighting = on;
    if (this.director) this.director.lighting = on;
  }

  /** Define quem toca os sons da batalha (vale a partir da próxima batalha). */
  setSound(sink: SoundSink | null): void {
    this.sound = sink;
  }

  setMode(mode: BoxMode): void {
    this.mode = mode;
  }

  /** Há uma batalha em cena (rodando ou com o resultado na tela). */
  get battling(): boolean {
    return this.director !== null;
  }

  /** Texto e posições da batalha para a interface desenhar por cima; null fora de batalha. */
  get battleHud(): BattleHud | null {
    return this.director?.hud ?? null;
  }

  /**
   * Começa uma batalha automática entre os Pokémon da caixa. `fighters` vem na mesma ordem das criaturas
   * (um por Pokémon, mesmo `id`); precisa de pelo menos 2. Devolve o resultado simulado.
   */
  startBattle(fighters: readonly Fighter[], rng: Rng = this.rng): BattleResult {
    if (!this.anchor) throw new Error('Coloque a caixa no chão antes de batalhar.');
    if (fighters.length < 2 || fighters.length !== this.creatures.length) throw new Error('A batalha precisa de um lutador para cada Pokémon da caixa (mínimo 2).');
    this.stopBattle();
    const result = simulateBattle(fighters, rng);
    const { rx, rz } = arenaRadii(fighters.length);
    this.frameArena(rx);
    for (const creature of this.creatures) this.battleRoot.add(creature.group);
    this.floor.visible = false;
    this.director = new BattleDirector({
      fighters, creatures: this.creatures, result, root: this.battleRoot, camera: this.camera, rx, rz, rng, sound: this.sound ?? undefined,
    });
    this.director.lighting = this.lighting;
    return result;
  }

  /**
   * Põe a arena logo à frente do olhar, no chão, com o tamanho que cabe na tela. Vale no começo da luta e quando
   * o jogador pede para recentralizar (virou o celular para outro lado).
   */
  private frameArena(rx: number): void {
    if (!this.anchor) return;
    this.camera.updateMatrixWorld(true);
    const forward = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const fallback = { x: this.anchor.x, z: this.anchor.z };
    const frame = arenaFrame(forward, this.anchor.y, this.camera.fov, this.camera.aspect, rx, fallback);
    this.battleRoot.position.copy(frame.center);
    this.battleRoot.rotation.set(0, frame.yaw, 0);
    this.battleRoot.scale.setScalar(frame.scale);
    this.battleRoot.updateMatrixWorld(true);
  }

  /** Traz a arena de volta para a frente do olhar, sem reiniciar a luta. */
  recenterBattle(): void {
    if (!this.director) return;
    this.frameArena(this.director.arenaRx);
  }

  stopBattle(): void {
    const director = this.director;
    this.director?.dispose();
    this.director = null;
    if (director) {
      // Os Pokémon voltam para a cena e para o passeio dentro da caixa.
      for (const creature of this.creatures) {
        this.scene.add(creature.group);
        Object.assign(creature.state, createWander(this.half, this.rng));
      }
      this.floor.visible = this.anchor !== null;
    }
  }

  /** Troca a população da caixa (até `MAX_CREATURES`). */
  setCreatures(entries: CreatureEntry[]): void {
    this.stopBattle();
    for (const creature of this.creatures) creature.dispose();
    this.creatures = [];
    for (const entry of entries.slice(0, MAX_CREATURES)) {
      const state = createWander(this.half, this.rng);
      const creature = new BoxCreature(entry.info, entry.source, state);
      creature.setSmoothing(this.smoothing);
      creature.attachLights(this.fx);
      this.scene.add(creature.group);
      this.creatures.push(creature);
    }
  }

  update(nowMs: number): void {
    const dt = this.lastNow === 0 ? 0 : nowMs - this.lastNow;
    this.lastNow = nowMs;
    const placed = this.anchor;
    for (const creature of this.creatures) creature.group.visible = placed !== null;
    if (!placed) return;
    // Na batalha tudo é medido dentro da arena (a origem dela é o centro).
    const base = this.director ? this.battleZero : placed;
    if (this.director) {
      this.director.update(dt);
    } else if (this.mode === 'formacao') {
      // Em fila de frente para a câmera: cada um anda até a sua vaga.
      const slots = formationSlots(this.creatures.length, this.half, -base.x, -base.z);
      this.creatures.forEach((creature, i) => {
        const slot = slots[i];
        if (slot) stepToward(creature.state, slot.x, slot.z, dt, 0.9);
      });
    } else {
      for (const creature of this.creatures) stepWander(creature.state, dt, this.half, this.rng);
      separate(this.creatures.map((c) => c.state), 0.28, this.half);
    }
    // Luz: ambiente real (suave) escurecido no foco do golpe, mais as luzes dos golpes em curso.
    this.env.lerp(this.envTarget, Math.min(1, dt / 600));
    if (this.lighting) {
      const dim = 1 - Math.min(0.55, (this.director?.ambientDim ?? 0) * 1.6);
      this.fx.setAmbient(this.env.x * dim, this.env.y * dim, this.env.z * dim);
      this.fx.setLights(this.director?.lights ?? [], this.director ? this.battleRoot : null);
    } else {
      this.fx.setAmbient(1, 1, 1);
      this.fx.setLights([], null);
    }
    this.camera.updateMatrixWorld(true);
    const right = this.director ? this.battleRight : new Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    right.y = 0;
    if (right.lengthSq() > 1e-6) right.normalize();
    const camera = this.director ? this.battleRoot.worldToLocal(this.battleCamera.copy(this.camera.position)) : this.camera.position;
    for (const creature of this.creatures) creature.update(nowMs, dt, base, camera, right);
  }

  /** O Pokémon mais próximo sob um ponto da tela, ou null. */
  pick(ndcX: number, ndcY: number): BoxCreature | null {
    if (!this.anchor) return null;
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    const hits = this.raycaster.intersectObjects(this.creatures.map((c) => c.mesh), false);
    const creature = hits[0]?.object.userData.creature as BoxCreature | undefined;
    return creature ?? null;
  }

  dispose(): void {
    this.stopBattle();
    for (const creature of this.creatures) creature.dispose();
    this.creatures = [];
    for (const child of [...this.floor.children]) {
      const d = child as Mesh | Line;
      d.geometry?.dispose();
      (d.material as MeshBasicMaterial | LineBasicMaterial | undefined)?.dispose();
    }
    this.floor.clear();
    this.scene.clear();
  }
}
