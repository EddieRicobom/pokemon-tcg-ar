import {
  BufferGeometry, Float32BufferAttribute, Frustum, Group, Line, LineBasicMaterial, LineLoop, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry,
  Quaternion, Raycaster, Scene, Vector2, Vector3,
} from 'three';
import { BoxCreature, frameCacheFor, upscaleFor } from './creature';
import type { CreatureInfo, CreatureSource, CreatureView } from './creature';
import { ShadowBatch } from './shadow-batch';
import { intersectFloor, keepBoxAway } from './floor';
import type { FloorResult } from './floor';
import { formationSlots } from './formation';
import { createWander, separate, stepToward, stepWander } from './wander';
import { FxLights } from './fx-lights';
import { Ground } from './ground';
import { ColiseuScenery, SCENERY_RADIUS } from './coliseu-scenery';
import { disposeBubbleTextures } from './emoji-bubble';
import { SocialDirector } from './social';
import type { SocialHooks } from './social';
import { DEFAULT_SMOOTHING } from '../core/pixel-upscale';
import type { SmoothingMode } from '../core/pixel-upscale';
import type { Rng } from './wander';

export const MAX_CREATURES = 40;
export const DEFAULT_HALF_SIZE_M = 1.2;
/** Meio-lado (m) da chuva e da neve no Coliseu: cobre a arena à vista da câmera, não só a caixa dos Pokémon. */
const ARENA_WEATHER_HALF_M = 3;
/** Quantos quadros de GIF podem ser ampliados num mesmo quadro da tela, somando todos os Pokémon. */
const FRAME_PREPARE_BUDGET = 4;
/** A luz nunca desce disto: noite com chuva escurece, mas o Pokémon continua visível. */
const MIN_AMBIENT = 0.45;
/** Até onde (m) os vizinhos notam que um Pokémon foi tocado, e quantos reagem. */
const NOTICE_RADIUS_M = 0.75;
const NOTICE_MAX = 3;
const BASE_SHADOW_OPACITY = 0.28;

export type BoxMode = 'passeio' | 'formacao';
/** O que fica atrás da cena: a câmera do celular (AR) ou o palco virtual do Coliseu. */
export type Backdrop = 'camera' | 'virtual';

/** Altura típica dos morrinhos da caixa (m) para o meio-lado `half`: dá relevo visível sem esconder os Pokémon. */
export function reliefAmplitude(half: number): number {
  return Math.min(0.3, 0.1 + 0.08 * half);
}

export interface CreatureEntry {
  info: CreatureInfo;
  source: CreatureSource;
}

import { WeatherFx } from './weather-fx';
import { createWeather, stepWeather, weatherTint } from '../core/weather';
import type { WeatherKind, WeatherMode, WeatherState } from '../core/weather';
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
  /** Os `state` de `creatures`, para não remontar a lista a cada quadro. */
  private states: BoxCreature['state'][] = [];
  private readonly shadows = new ShadowBatch(MAX_CREATURES);
  private readonly frustum = new Frustum();
  private readonly projView = new Matrix4();
  private readonly view: CreatureView = { frustum: this.frustum, budget: { left: FRAME_PREPARE_BUDGET } };
  private readonly right = new Vector3();
  private tickCount = 0;
  /** Movimento reduzido (`prefers-reduced-motion`). */
  private calm = false;
  /** 0 de dia, 1 de noite (no Coliseu, pela hora do aparelho). */
  private night = 0;
  private anchor: Vector3 | null = null;
  private half = DEFAULT_HALF_SIZE_M;
  private lastNow = 0;
  private smoothing: SmoothingMode = DEFAULT_SMOOTHING;
  mode: BoxMode = 'passeio';
  private readonly rng: Rng;
  /** Luz do ambiente, compartilhada por todos os sprites. */
  readonly fx = new FxLights();
  private lighting = true;
  /** Chão em pixel art. */
  private terrain = true;
  private boxGround: Ground | null = null;
  /** O fundo da cena: a câmera do celular (AR) ou o palco virtual do Coliseu (sem câmera). */
  private backdrop: Backdrop = 'camera';
  private scenery: ColiseuScenery | null = null;
  private sceneryDetail = true;
  /** Encontros entre Pokémon e balões de emoji (só no passeio, nunca na formação). */
  private readonly social: SocialDirector;
  private socialOn = true;
  private readonly envTarget = new Vector3(1, 1, 1);
  private readonly env = new Vector3(1, 1, 1);
  /** Clima: ciclo automático, fixo ou desligado (opção "Clima"). */
  private weatherMode: WeatherMode = 'ciclo';
  private readonly weather: WeatherState;
  private readonly weatherFx = new WeatherFx();
  /** O clima fica fora do grupo do chão: o chão da caixa some no Coliseu, e a chuva sumia junto. */
  private readonly weatherRoot = new Group();

  constructor(rng: Rng = Math.random) {
    this.rng = rng;
    this.social = new SocialDirector(rng);
    this.weather = createWeather(rng);
    this.camera.position.set(0, 0, 0);
    this.floor.visible = false;
    this.weatherRoot.visible = false;
    this.weatherRoot.add(this.weatherFx.group);
    this.shadows.mesh.visible = false;
    this.scene.add(this.floor, this.weatherRoot, this.shadows.mesh);
  }

  private readonly socialHooks: SocialHooks = {
    bubble: (i, emoji, ms) => this.creatures[i]?.say(emoji, ms),
    hop: (i) => this.creatures[i]?.poke(),
    cheer: () => this.scenery?.cheer(this.lastNow),
  };

  get placed(): boolean {
    return this.anchor !== null;
  }

  get backdropKind(): Backdrop {
    return this.backdrop;
  }

  /** O cenário do Coliseu (null com a câmera como fundo). */
  get coliseu(): ColiseuScenery | null {
    return this.scenery;
  }

  /**
   * Troca o fundo. No palco virtual o cenário do Coliseu (areia, muro, arquibancada e tochas) acompanha o ponto onde a caixa
   * foi colocada e o chão de grama da caixa some (a areia é o chão); na câmera (AR) o cenário não existe.
   */
  setBackdrop(kind: Backdrop): void {
    if (this.backdrop === kind) return;
    this.backdrop = kind;
    if (kind === 'virtual') {
      this.scenery = new ColiseuScenery();
      this.scenery.setDetail(this.sceneryDetail);
      this.scenery.setCalm(this.calm);
      this.scenery.setGlow(this.night);
      this.scene.add(this.scenery.group);
    } else {
      this.scenery?.dispose();
      this.scenery = null;
    }
    this.floor.visible = this.anchor !== null && kind === 'camera';
    // O chão de grama só existe com a câmera de fundo; no palco virtual a areia é o chão.
    this.rebuildFloor();
    this.syncScenery();
  }

  /** Muro, arquibancada e tochas ligados ou desligados (desligado fica só a areia, bem mais leve). */
  setScenery(on: boolean): void {
    this.sceneryDetail = on;
    this.scenery?.setDetail(on);
  }

  /** O cenário fica no chão, no centro da caixa colocada (escondido enquanto não há caixa). */
  private syncScenery(): void {
    this.weatherRoot.visible = this.anchor !== null;
    if (this.anchor) this.weatherRoot.position.copy(this.anchor);
    if (!this.scenery) return;
    this.scenery.group.visible = this.anchor !== null;
    if (this.anchor) this.scenery.group.position.copy(this.anchor);
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
  place(point: Vector3, half: number = this.half): { moved: boolean } {
    this.half = Math.min(3, Math.max(0.5, half));
    // Nunca nasce colada na câmera: afasta ao longo da mesma direção até sobrar a folga mínima.
    const forward = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const kept = keepBoxAway(point, this.half, { x: forward.x, z: forward.z });
    this.anchor = kept.point.clone();
    this.floor.position.copy(kept.point);
    this.setHalfSize(this.half);
    this.floor.visible = this.backdrop === 'camera';
    this.syncScenery();
    return { moved: kept.moved };
  }

  clearPlacement(): void {
    this.anchor = null;
    this.floor.visible = false;
    this.syncScenery();
  }

  setHalfSize(half: number): void {
    this.half = Math.min(3, Math.max(0.5, half));
    // Caixa maior pede mais folga: se já está no chão e ficou perto demais, afasta de novo.
    if (this.anchor) {
      const forward = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const kept = keepBoxAway(this.anchor, this.half, { x: forward.x, z: forward.z });
      if (kept.moved) {
        this.anchor = kept.point.clone();
        this.floor.position.copy(kept.point);
        this.syncScenery();
      }
    }
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
    this.boxGround?.dispose();
    this.boxGround = null;
    const y = 0.002;
    const h = this.half;
    const plane = new Mesh(
      new PlaneGeometry(h * 2, h * 2),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: this.terrain ? 0 : 0.1, depthWrite: false }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = y;
    if (this.terrain && this.backdrop === 'camera') {
      // Chão em pixel art do tamanho da caixa; os enfeites ficam só na borda, para não tapar quem passeia.
      // Com relevo: morrinhos e baixadas suaves que somem na borda (a caixa fica rente ao chão de verdade).
      this.boxGround = new Ground({ halfW: h, halfD: h, shape: 'square', seed: 11, cols: Math.min(48, Math.max(12, Math.round((h * 2) / 0.12))), decor: Math.round(10 + h * 6), decorUnit: 0.16, opacity: 0.97, relief: reliefAmplitude(h) });
      this.floor.add(this.boxGround.group);
    }
    const outline = new LineLoop(
      new BufferGeometry().setAttribute('position', new Float32BufferAttribute([-h, y, -h, h, y, -h, h, y, h, -h, y, h], 3)),
      new LineBasicMaterial({ color: 0xc4d3b5, transparent: true, opacity: this.terrain ? 0 : 0.85 }),
    );
    this.floor.add(plane, outline);
    // O clima mora no chão da caixa: camadas sobre o chão em pixel art e as gotas e flocos no volume da caixa.
    if (this.backdrop === 'virtual') this.weatherFx.setArena(SCENERY_RADIUS, ARENA_WEATHER_HALF_M);
    else this.weatherFx.setGround(this.boxGround, h);
    // Cantos em "L" para a caixa parecer uma caixa.
    const tick = Math.min(0.25, h * 0.3);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const corner = new Line(
        new BufferGeometry().setAttribute(
          'position',
          new Float32BufferAttribute([sx * (h - tick), y + 0.001, sz * h, sx * h, y + 0.001, sz * h, sx * h, y + 0.001, sz * (h - tick)], 3),
        ),
        new LineBasicMaterial({ color: 0xffcb05, transparent: true, opacity: this.terrain ? 0 : 1 }),
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

  /** A luz da hora do dia no Coliseu (`night` de 0 a 1 acende as tochas e deixa a turma com sono). */
  setDaylight(r: number, g: number, b: number, night: number): void {
    this.setEnvironment(r, g, b);
    this.night = night;
    this.scenery?.setGlow(night);
  }

  /** Movimento reduzido: tira pulinhos, ola, chuva caindo e o tremor das chamas; o Pokémon continua passeando. */
  setCalm(on: boolean): void {
    this.calm = on;
    this.weatherFx.setCalm(on);
    this.scenery?.setCalm(on);
    for (const creature of this.creatures) creature.calm = on;
  }

  /** Liga ou desliga a luz do ambiente nos sprites e no chão. */
  setLighting(on: boolean): void {
    this.lighting = on;
  }

  /** Liga ou desliga o chão em pixel art da caixa. */
  setTerrain(on: boolean): void {
    if (this.terrain === on) return;
    this.terrain = on;
    this.rebuildFloor();
  }

  /** O chão em pixel art da caixa (null com o terreno desligado). */
  get groundOfBox(): Ground | null {
    return this.boxGround;
  }

  /** Clima da caixa: `ciclo` muda sozinho, um clima fixo fica, `off` some com tudo. */
  setWeather(mode: WeatherMode): void {
    this.weatherMode = mode;
  }

  /** O clima de agora (null com o clima desligado). */
  get weatherNow(): { kind: WeatherKind; mode: WeatherMode; state: Readonly<WeatherState> } | null {
    return this.weatherMode === 'off' ? null : { kind: this.weather.kind, mode: this.weatherMode, state: this.weather };
  }

  /** Liga ou desliga os encontros e os balões de emoji. */
  setSocial(on: boolean): void {
    this.socialOn = on;
    if (!on) this.stopSocial();
  }

  private stopSocial(): void {
    this.social.reset(this.creatures);
    for (const creature of this.creatures) creature.clearBubble();
  }

  setMode(mode: BoxMode): void {
    this.mode = mode;
    if (mode === 'formacao') this.stopSocial();
  }

  /**
   * Troca a população da caixa (até `MAX_CREATURES`). Quem continua fica onde está, com a textura e os quadros que já
   * tinha: mexer em «Quem passeia» não teletransporta a turma nem recomeça o trabalho de todo mundo.
   */
  setCreatures(entries: CreatureEntry[], options: { entrance?: boolean } = {}): void {
    this.social.reset(this.creatures);
    const chosen = entries.slice(0, MAX_CREATURES);
    const cacheLimit = frameCacheFor(chosen.length);
    const upscale = upscaleFor(chosen.length);
    const leaving = new Map(this.creatures.map((c) => [c.info.id, c]));
    const next: BoxCreature[] = [];
    let arrivals = 0;
    for (const entry of chosen) {
      const kept = leaving.get(entry.info.id);
      if (kept?.hasSource(entry.source)) {
        leaving.delete(entry.info.id);
        kept.tune(cacheLimit, upscale);
        next.push(kept);
        continue;
      }
      const state = createWander(this.half, this.rng);
      const creature = new BoxCreature(entry.info, entry.source, state, cacheLimit, upscale);
      creature.setSmoothing(this.smoothing);
      creature.attachLights(this.fx);
      creature.calm = this.calm;
      if (options.entrance && !this.calm) creature.enter(Math.min(1200, arrivals * 70));
      arrivals++;
      this.scene.add(creature.group);
      next.push(creature);
    }
    for (const creature of leaving.values()) creature.dispose();
    this.creatures = next;
    this.states = next.map((c) => c.state);
  }

  /** Os vizinhos de quem foi tocado param, olham para ele e levam um susto. */
  reactAround(target: BoxCreature): void {
    if (!this.socialOn || this.mode !== 'passeio') return;
    let noticed = 0;
    for (let i = 0; i < this.creatures.length && noticed < NOTICE_MAX; i++) {
      const creature = this.creatures[i]!;
      if (creature === target || this.social.isBusy(i)) continue;
      const dx = target.state.x - creature.state.x;
      const dz = target.state.z - creature.state.z;
      if (dx * dx + dz * dz > NOTICE_RADIUS_M * NOTICE_RADIUS_M) continue;
      noticed++;
      creature.state.vx = 0;
      creature.state.vz = 0;
      creature.state.pauseMs = Math.max(creature.state.pauseMs, 1000);
      creature.lookToward(dx, dz, 1100);
      creature.poke();
      if (!creature.bubbleEmoji) creature.say('❗', 1100);
    }
  }

  /** Retoma sem avançar o passeio pelos minutos passados com a página escondida. */
  resetClock(): void { this.lastNow = 0; }

  update(nowMs: number): void {
    const dt = this.lastNow === 0 ? 0 : nowMs - this.lastNow;
    this.lastNow = nowMs;
    const placed = this.anchor;
    for (const creature of this.creatures) creature.group.visible = placed !== null;
    this.shadows.mesh.visible = placed !== null;
    if (!placed) return;
    const base = placed;
    const creatures = this.creatures;
    if (this.mode === 'formacao') {
      // Em fila de frente para a câmera: cada um anda até a sua vaga.
      const slots = formationSlots(creatures.length, this.half, -base.x, -base.z);
      for (let i = 0; i < creatures.length; i++) {
        const slot = slots[i];
        if (slot) stepToward(creatures[i]!.state, slot.x, slot.z, dt, 0.9);
      }
    } else {
      if (this.socialOn) {
        this.social.setMood(this.weatherMode === 'off' ? null : this.weather.kind, this.night > 0.6);
        this.social.update(dt, creatures, this.half, this.socialHooks);
      }
      for (let i = 0; i < creatures.length; i++) {
        if (!this.socialOn || !this.social.isBusy(i)) stepWander(creatures[i]!.state, dt, this.half, this.rng);
      }
      separate(this.states, 0.28, this.half);
    }
    const weatherOn = this.weatherMode !== 'off';
    const mode = this.weatherMode;
    if (mode !== 'off') stepWeather(this.weather, dt / 1000, this.rng, mode === 'ciclo' ? null : mode);
    this.weatherFx.update(dt, weatherOn ? this.weather : null, nowMs);
    // Luz: ambiente real (suave), e o clima tinge por cima.
    this.env.lerp(this.envTarget, Math.min(1, dt / 600));
    const [wr, wg, wb] = weatherOn ? weatherTint(this.weather) : [1, 1, 1];
    const lightX = this.lighting ? Math.max(MIN_AMBIENT, this.env.x * wr) : 1;
    const lightY = this.lighting ? Math.max(MIN_AMBIENT, this.env.y * wg) : 1;
    const lightZ = this.lighting ? Math.max(MIN_AMBIENT, this.env.z * wb) : 1;
    this.fx.setAmbient(lightX, lightY, lightZ);
    // O chão e os enfeites seguem a luz do ambiente, como os Pokémon.
    const gx = Math.min(1.1, lightX);
    const gy = Math.min(1.1, lightY);
    const gz = Math.min(1.1, lightZ);
    this.boxGround?.setTint(gx, gy, gz);
    this.weatherFx.setTint(gx, gy, gz);
    this.scenery?.setTint(gx, gy, gz);
    this.scenery?.update(nowMs);
    this.camera.updateMatrixWorld(true);
    const right = this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    right.y = 0;
    if (right.lengthSq() > 1e-6) right.normalize();
    this.frustum.setFromProjectionMatrix(this.projView.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    this.view.budget.left = FRAME_PREPARE_BUDGET;
    // Debaixo de nuvem (e à noite) a sombra fica mais fraca.
    this.shadows.setOpacity(BASE_SHADOW_OPACITY * (1 - 0.5 * (weatherOn ? this.weather.cloud : 0)) * (1 - 0.35 * (this.lighting ? this.night : 0)));
    this.shadows.begin();
    // O primeiro da fila muda a cada quadro, para a verba de ampliação não favorecer sempre os mesmos.
    const count = creatures.length;
    const first = count > 0 ? this.tickCount++ % count : 0;
    for (let k = 0; k < count; k++) {
      const creature = creatures[(first + k) % count]!;
      // Cada Pokémon pisa na altura do terreno sob ele.
      creature.groundY = this.boxGround?.heightAt(creature.state.x, creature.state.z) ?? 0;
      // Pisando numa poça: o Pokémon aparece refletido nela.
      creature.setReflection(weatherOn ? this.weatherFx.puddleStrengthAt(creature.state.x, creature.state.z) : 0);
      creature.update(nowMs, dt, base, this.camera.position, right, this.view);
      const at = creature.group.position;
      this.shadows.add(at.x, at.y + 0.004, at.z, creature.shadowX, creature.shadowZ);
    }
    this.shadows.end();
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
    this.scenery?.dispose();
    this.scenery = null;
    this.weatherFx.dispose();
    this.boxGround?.dispose();
    this.boxGround = null;
    for (const creature of this.creatures) creature.dispose();
    this.creatures = [];
    this.states = [];
    this.shadows.dispose();
    this.anchor = null;
    for (const child of [...this.floor.children]) {
      const d = child as Mesh | Line;
      d.geometry?.dispose();
      (d.material as MeshBasicMaterial | LineBasicMaterial | undefined)?.dispose();
    }
    this.floor.clear();
    this.scene.clear();
    disposeBubbleTextures();
  }
}
