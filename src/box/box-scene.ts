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
import { BattleDirector } from './battle-director';
import type { BattleHud } from './battle-director';
import { simulateBattle } from '../core/battle';
import type { BattleResult, Fighter } from '../core/battle';
import { DEFAULT_LOOK } from '../core/sprite-look';
import type { SpriteLook } from '../core/sprite-look';
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
  private look: SpriteLook = DEFAULT_LOOK;
  mode: BoxMode = 'passeio';
  private director: BattleDirector | null = null;
  private readonly rng: Rng;

  constructor(rng: Rng = Math.random) {
    this.rng = rng;
    this.camera.position.set(0, 0, 0);
    this.floor.visible = false;
    this.scene.add(this.floor);
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

  /** Tom de cor e contorno de todos os Pokémon da caixa. */
  setLook(look: SpriteLook): void {
    this.look = look;
    for (const creature of this.creatures) creature.setLook(look);
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
    this.director = new BattleDirector({
      fighters, creatures: this.creatures, result, scene: this.scene, camera: this.camera,
      anchor: () => this.anchor ?? new Vector3(), half: this.half, rng,
    });
    return result;
  }

  stopBattle(): void {
    this.director?.dispose();
    this.director = null;
  }

  /** Troca a população da caixa (até `MAX_CREATURES`). */
  setCreatures(entries: CreatureEntry[]): void {
    this.stopBattle();
    for (const creature of this.creatures) creature.dispose();
    this.creatures = [];
    for (const entry of entries.slice(0, MAX_CREATURES)) {
      const state = createWander(this.half, this.rng);
      const creature = new BoxCreature(entry.info, entry.source, state);
      creature.setLook(this.look);
      this.scene.add(creature.group);
      this.creatures.push(creature);
    }
  }

  update(nowMs: number): void {
    const dt = this.lastNow === 0 ? 0 : nowMs - this.lastNow;
    this.lastNow = nowMs;
    const base = this.anchor;
    for (const creature of this.creatures) creature.group.visible = base !== null;
    if (!base) return;
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
    this.camera.updateMatrixWorld(true);
    const right = new Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    right.y = 0;
    if (right.lengthSq() > 1e-6) right.normalize();
    const camera = this.camera.position;
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
