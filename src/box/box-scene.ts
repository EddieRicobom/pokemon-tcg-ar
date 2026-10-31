import {
  BufferGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial, LineLoop, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry,
  Quaternion, Raycaster, Scene, Sprite, SpriteMaterial, Vector2, Vector3,
} from 'three';
import type { DataTexture } from 'three';
import { BoxCreature, frameCacheFor, neutralFx } from './creature';
import type { CreatureInfo, CreatureSource } from './creature';
import { intersectFloor, keepBoxAway } from './floor';
import type { FloorResult } from './floor';
import { formationSlots } from './formation';
import { createWander, separate, stepToward, stepWander } from './wander';
import { arenaFrame, arenaRadii } from './arena';
import { BattleDirector } from './battle-director';
import { FxLights } from './fx-lights';
import { Ground } from './ground';
import { ColiseuScenery, pennantTexture, standsPoint } from './coliseu-scenery';
import { CrowdDirector, crowdSway, MAX_SPECTATORS, SPECTATOR_SCALE, seatLayout } from './crowd';
import type { Seat } from './crowd';
import { disposeBubbleTextures } from './emoji-bubble';
import { SocialDirector } from './social';
import type { SoundSink } from './sound-recipes';
import type { BattleHud } from './battle-director';
import { simulateBattle } from '../core/battle';
import type { BattleResult, Fighter } from '../core/battle';
import { DEFAULT_SMOOTHING } from '../core/pixel-upscale';
import type { SmoothingMode } from '../core/pixel-upscale';
import type { Rng } from './wander';

export const MAX_CREATURES = 40;
export const DEFAULT_HALF_SIZE_M = 1.2;

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
/** Quem luta e como: índices dos Pokémon da caixa, equipes, revezamento e (Ginásio/PvP) nomes e faixa de abertura. */
export interface BattlePlanLike {
  picks: readonly number[];
  teams?: readonly number[];
  relay?: boolean;
  teamNames?: readonly string[];
  banner?: { text: string; sub: string };
  initialHp?: readonly number[];
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
  /** Fora da luta (por exemplo, os que sobram no 3x3): ficam escondidos até a batalha acabar. */
  private benched = new Set<BoxCreature>();
  /** Arena 3D: quem não luta assiste da arquibancada (cada um no seu assento) e torce. */
  private spectators: { creature: BoxCreature; seat: Seat; flag: Sprite | null }[] = [];
  /** Bandeirinhas vermelha e azul (criadas na primeira torcida, compartilhadas). */
  private pennants: [DataTexture, DataTexture] | null = null;
  private crowd: CrowdDirector | null = null;
  private readonly seatPoint = new Vector3();
  private readonly worldRight = new Vector3(1, 0, 0);
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
  private impactFx = true;
  /** Chão em pixel art e terreno que muda com os golpes. */
  private terrain = true;
  private boxGround: Ground | null = null;
  /** O fundo da cena: a câmera do celular (AR) ou o palco virtual do Coliseu (sem câmera). */
  private backdrop: Backdrop = 'camera';
  private scenery: ColiseuScenery | null = null;
  private sceneryDetail = true;
  /** Encontros entre Pokémon e balões de emoji (só no passeio, nunca na batalha nem na formação). */
  private readonly social: SocialDirector;
  private socialOn = true;
  /** Quem toca os sons das próximas batalhas (null = mudo). */
  private sound: SoundSink | null = null;
  private readonly envTarget = new Vector3(1, 1, 1);
  private readonly env = new Vector3(1, 1, 1);
  /** Clima: ciclo automático, fixo ou desligado (opção "Clima"). */
  private weatherMode: WeatherMode = 'ciclo';
  private readonly weather: WeatherState;
  private readonly weatherFx = new WeatherFx();

  constructor(rng: Rng = Math.random) {
    this.rng = rng;
    this.social = new SocialDirector(rng);
    this.weather = createWeather(rng);
    this.camera.position.set(0, 0, 0);
    this.floor.visible = false;
    this.scene.add(this.floor, this.battleRoot);
  }

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
      this.scene.add(this.scenery.group);
    } else {
      this.scenery?.dispose();
      this.scenery = null;
    }
    this.floor.visible = this.anchor !== null && kind === 'camera' && !this.director;
    // O chão de grama só existe com a câmera de fundo; no palco virtual a areia é o chão.
    this.rebuildFloor();
    this.syncScenery();
  }

  /** Muro, arquibancada e tochas ligados ou desligados (desligado fica só a areia, bem mais leve). */
  setScenery(on: boolean): void {
    this.sceneryDetail = on;
    this.scenery?.setDetail(on);
  }

  /** Quem está na arquibancada agora (só no palco virtual, durante a batalha). */
  get crowdList(): readonly BoxCreature[] {
    return this.spectators.map((s) => s.creature);
  }

  /** A torcida só existe no palco virtual com a arquibancada ligada; sem ela, quem não luta fica escondido como antes. */
  private seatSpectators(benched: readonly BoxCreature[]): void {
    if (this.backdrop !== 'virtual' || !this.scenery) return;
    const seats = seatLayout(benched.length);
    this.pennants ??= [pennantTexture(0), pennantTexture(1)];
    const pennants = this.pennants;
    // Dois em cada três agitam uma bandeirinha da equipe do seu lado.
    this.spectators = seats.map((seat, i) => {
      let flag: Sprite | null = null;
      if (i % 3 !== 2) {
        flag = new Sprite(new SpriteMaterial({ map: pennants[seat.team], transparent: true, depthWrite: false }));
        flag.center.set(0, 0);
        flag.scale.set(0.11, 0.165, 1);
        benched[i]!.group.add(flag);
      }
      return { creature: benched[i]!, seat, flag };
    });
    for (const { creature, seat } of this.spectators) {
      creature.clearBubble();
      creature.state.vx = 0;
      creature.state.vz = 0;
      creature.state.x = 0;
      creature.state.z = 0;
      creature.groundY = 0;
      creature.group.scale.setScalar(SPECTATOR_SCALE);
      // A arquibancada é inclinada: a sombra redonda atravessaria os degraus.
      creature.shadow.visible = false;
      // Olham para o centro da arena (o lado do espelho do sprite segue para onde estão virados).
      creature.fx.facing = { x: -Math.sin(seat.angle), z: -Math.cos(seat.angle) };
      this.benched.delete(creature);
    }
    this.crowd = this.spectators.length > 0 ? new CrowdDirector(seats, this.rng) : null;
  }

  private unseatSpectators(): void {
    for (const { creature, flag } of this.spectators) {
      flag?.removeFromParent();
      flag?.material.dispose();
      creature.clearBubble();
      creature.group.scale.setScalar(1);
      creature.shadow.visible = true;
      Object.assign(creature.fx, neutralFx());
    }
    this.spectators = [];
    this.crowd = null;
  }

  /** O cenário fica no chão, no centro da caixa colocada (escondido enquanto não há caixa). */
  private syncScenery(): void {
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
    this.weatherFx.setGround(this.boxGround, h);
    this.floor.add(this.weatherFx.group);
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

  /** Liga ou desliga a luz dos golpes e do ambiente nos sprites, no chão e no vídeo. */
  setLighting(on: boolean): void {
    this.lighting = on;
    if (this.director) this.director.lighting = on;
  }

  /** Intensidade das partículas e ondas de choque dos golpes elementais. */
  setImpactEffects(on: boolean): void {
    this.impactFx = on;
    if (this.director) this.director.impactFx = on;
  }

  /** Liga ou desliga o chão em pixel art (na caixa e na arena) e as marcas dos golpes. Vale já na caixa e na próxima batalha. */
  setTerrain(on: boolean): void {
    if (this.terrain === on) return;
    this.terrain = on;
    this.rebuildFloor();
  }

  /** O chão da arena em batalha (null fora de batalha ou com o terreno desligado). */
  get battleGround(): Ground | null {
    return this.director?.ground ?? null;
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

  /** Define quem toca os sons da batalha (vale a partir da próxima batalha). */
  setSound(sink: SoundSink | null): void {
    this.sound = sink;
  }

  setMode(mode: BoxMode): void {
    this.mode = mode;
    if (mode === 'formacao') this.stopSocial();
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
  startBattle(fighters: readonly Fighter[], rng: Rng = this.rng, plan?: BattlePlanLike): BattleResult {
    if (!this.anchor) throw new Error('Coloque a caixa no chão antes de batalhar.');
    // Sem plano, todos da caixa lutam; com plano (equipes, 3x3) `fighters` segue a ordem de `picks`.
    const picks = plan?.picks ?? this.creatures.map((_, i) => i);
    const fighting = picks.map((i) => this.creatures[i]).filter((c): c is BoxCreature => c !== undefined);
    if (fighters.length < 2 || fighters.length !== fighting.length) throw new Error('A batalha precisa de um lutador para cada Pokémon que luta (mínimo 2).');
    this.stopBattle();
    this.stopSocial();
    for (const creature of this.creatures) creature.groundY = 0; // a arena da batalha é lisa
    const result = simulateBattle(fighters, rng, { teams: plan?.teams, relay: plan?.relay, initialHp: plan?.initialHp });
    // O 3x3 usa uma arena mais larga para caberem os reservas nas pontas.
    const { rx, rz } = arenaRadii(plan?.relay ? 4 : fighters.length);
    this.frameArena(rx);
    for (const creature of fighting) this.battleRoot.add(creature.group);
    this.benched = new Set(this.creatures.filter((c) => !fighting.includes(c)));
    this.seatSpectators(this.creatures.filter((c) => !fighting.includes(c)).slice(0, MAX_SPECTATORS));
    this.floor.visible = false;
    this.director = new BattleDirector({
      fighters, creatures: fighting, result, root: this.battleRoot, camera: this.camera, rx, rz, rng, sound: this.sound ?? undefined, terrain: this.terrain,
      teamNames: plan?.teamNames, banner: plan?.banner, arenaLayout: this.backdrop === 'virtual' ? 'coliseu' : undefined,
    });
    this.director.lighting = this.lighting;
    this.director.impactFx = this.impactFx;
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
    this.unseatSpectators();
    if (director) {
      // Os Pokémon voltam para a cena e para o passeio dentro da caixa.
      this.benched = new Set();
      this.social.reset(this.creatures);
      for (const creature of this.creatures) {
        this.scene.add(creature.group);
        Object.assign(creature.state, createWander(this.half, this.rng));
      }
      this.floor.visible = this.anchor !== null && this.backdrop === 'camera';
    }
  }

  /** Troca a população da caixa (até `MAX_CREATURES`). */
  setCreatures(entries: CreatureEntry[]): void {
    this.stopBattle();
    this.social.reset(this.creatures);
    for (const creature of this.creatures) creature.dispose();
    this.creatures = [];
    const chosen = entries.slice(0, MAX_CREATURES);
    const cacheLimit = frameCacheFor(chosen.length);
    for (const entry of chosen) {
      const state = createWander(this.half, this.rng);
      const creature = new BoxCreature(entry.info, entry.source, state, cacheLimit);
      creature.setSmoothing(this.smoothing);
      creature.attachLights(this.fx);
      this.scene.add(creature.group);
      this.creatures.push(creature);
    }
  }

  /** Retoma sem avançar uma batalha pelos minutos passados com a página escondida. */
  resetClock(): void { this.lastNow = 0; }

  update(nowMs: number): void {
    const dt = this.lastNow === 0 ? 0 : nowMs - this.lastNow;
    this.lastNow = nowMs;
    const placed = this.anchor;
    for (const creature of this.creatures) creature.group.visible = placed !== null && !this.benched.has(creature);
    // Sem a arquibancada (opção do cenário desligada) a torcida some junto.
    for (const { creature } of this.spectators) creature.group.visible = placed !== null && this.sceneryDetail && this.scenery !== null;
    if (!placed) return;
    // Na batalha tudo é medido dentro da arena (a origem dela é o centro).
    const base = this.director ? this.battleZero : placed;
    if (this.director) {
      this.director.update(dt);
      const events = this.director.crowdEvents.splice(0);
      if (this.crowd && this.sceneryDetail) {
        for (const e of events) this.crowd.event(e);
        this.crowd.update(dt, { bubble: (i, emoji, ms) => this.spectators[i]?.creature.say(emoji, ms), hop: (i) => this.spectators[i]?.creature.poke() });
      }
    } else if (this.mode === 'formacao') {
      // Em fila de frente para a câmera: cada um anda até a sua vaga.
      const slots = formationSlots(this.creatures.length, this.half, -base.x, -base.z);
      this.creatures.forEach((creature, i) => {
        const slot = slots[i];
        if (slot) stepToward(creature.state, slot.x, slot.z, dt, 0.9);
      });
    } else {
      if (this.socialOn) {
        this.social.update(dt, this.creatures, this.half, { bubble: (i, emoji, ms) => this.creatures[i]?.say(emoji, ms), hop: (i) => this.creatures[i]?.poke() });
      }
      this.creatures.forEach((creature, i) => {
        if (!this.socialOn || !this.social.isBusy(i)) stepWander(creature.state, dt, this.half, this.rng);
      });
      separate(this.creatures.map((c) => c.state), 0.28, this.half);
    }
    // Clima: segue andando (também na batalha); as camadas e partículas só aparecem na caixa.
    const weatherOn = this.weatherMode !== 'off';
    const mode = this.weatherMode;
    if (mode !== 'off') stepWeather(this.weather, dt / 1000, this.rng, mode === 'ciclo' ? null : mode);
    this.weatherFx.update(dt, weatherOn && !this.director ? this.weather : null, nowMs);
    // Luz: ambiente real (suave) escurecido no foco do golpe, mais as luzes dos golpes em curso; o clima tinge por cima.
    this.env.lerp(this.envTarget, Math.min(1, dt / 600));
    const [wr, wg, wb] = weatherOn ? weatherTint(this.weather) : [1, 1, 1];
    if (this.lighting) {
      const dim = 1 - Math.min(0.55, (this.director?.ambientDim ?? 0) * 1.6);
      this.fx.setAmbient(this.env.x * dim * wr, this.env.y * dim * wg, this.env.z * dim * wb);
      this.fx.setLights(this.director?.lights ?? [], this.director ? this.battleRoot : null);
    } else {
      this.fx.setAmbient(1, 1, 1);
      this.fx.setLights([], null);
    }
    // O chão e os enfeites seguem a luz do ambiente e escurecem no foco dos golpes, como os Pokémon.
    const groundDim = this.lighting ? 1 - Math.min(0.55, (this.director?.ambientDim ?? 0) * 1.6) : 1;
    const gx = this.lighting ? Math.min(1.1, this.env.x * groundDim * wr) : 1;
    const gy = this.lighting ? Math.min(1.1, this.env.y * groundDim * wg) : 1;
    const gz = this.lighting ? Math.min(1.1, this.env.z * groundDim * wb) : 1;
    this.boxGround?.setTint(gx, gy, gz);
    this.scenery?.setTint(gx, gy, gz);
    this.scenery?.update(nowMs);
    this.director?.ground?.setTint(gx, gy, gz);
    this.camera.updateMatrixWorld(true);
    const right = this.director ? this.battleRight : new Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    right.y = 0;
    if (right.lengthSq() > 1e-6) right.normalize();
    const camera = this.director ? this.battleRoot.worldToLocal(this.battleCamera.copy(this.camera.position)) : this.camera.position;
    // O relevo só existe na caixa (a arena da batalha é lisa): cada Pokémon pisa na altura do terreno sob ele.
    const seated = new Set(this.spectators.map((s) => s.creature));
    this.spectators.forEach(({ creature, seat, flag }, i) => {
      // Cada torcedor fica no seu degrau, em coordenadas do mundo (fora da raiz da arena, que é girada e encolhida).
      const p = standsPoint(seat.angle, seat.row, this.scenery?.radius);
      this.seatPoint.set(placed.x + p.x, placed.y + p.y, placed.z + p.z);
      creature.fx.dx = crowdSway(i, nowMs, this.crowd?.excitement(i) ?? 0) * SPECTATOR_SCALE;
      creature.update(nowMs, dt, this.seatPoint, this.camera.position, this.worldRight);
      if (flag) {
        // A bandeira acompanha o pulo e balança mais com a torcida empolgada.
        flag.position.set(creature.width * 0.32, creature.mesh.position.y + creature.height * 0.5, 0.01);
        flag.material.rotation = Math.sin(nowMs / 170 + i * 2.3) * (0.15 + 0.35 * (this.crowd?.excitement(i) ?? 0));
      }
    });
    for (const creature of this.creatures) {
      if (seated.has(creature)) continue;
      creature.groundY = this.director ? 0 : (this.boxGround?.heightAt(creature.state.x, creature.state.z) ?? 0);
      // Pisando numa poça: o Pokémon aparece refletido nela.
      creature.setReflection(this.director || !weatherOn ? 0 : this.weatherFx.puddleStrengthAt(creature.state.x, creature.state.z));
      creature.update(nowMs, dt, base, camera, right);
    }
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
    for (const t of this.pennants ?? []) t.dispose();
    this.pennants = null;
    this.scenery?.dispose();
    this.scenery = null;
    this.weatherFx.dispose();
    this.boxGround?.dispose();
    this.boxGround = null;
    for (const creature of this.creatures) creature.dispose();
    this.creatures = [];
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
