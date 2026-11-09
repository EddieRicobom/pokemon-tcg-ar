import {
  DataTexture, DoubleSide, Group, LinearFilter, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, RGBAFormat, ShaderMaterial, SRGBColorSpace, Sphere, Sprite, SpriteMaterial,
  UnsignedByteType, Vector2, Vector3,
} from 'three';
import type { Frustum } from 'three';
import { ShinyAura } from '../ar/shiny-aura';
import { BUBBLE_ASPECT, bubbleTexture } from './emoji-bubble';
import { enableRelight } from './fx-lights';
import type { FxLights } from './fx-lights';
import { frameIndexAt } from '../core/gif';
import type { DecodedGif } from '../core/gif';
import { DEFAULT_SMOOTHING, isLinearSmoothing, upscaleSprite } from '../core/pixel-upscale';
import type { SmoothingMode } from '../core/pixel-upscale';
import type { RgbaImage } from '../recognition/types';
import { speciesRelativeSize } from '../core/size-scale';
import { contentBounds } from '../village/local-sprite';
import type { ContentBounds } from '../village/local-sprite';
import { placeAccessory } from '../core/village/accessory-fit';
import type { AccessoryPos } from '../core/village/accessory-fit';
import type { WanderState } from './wander';

export interface CreatureInfo {
  id: string;
  name: string;
  dexId?: number;
  /** Linha de detalhe (coleção e número da carta). */
  detail: string;
  /** Carta shiny: brilho dourado em volta do Pokémon. */
  shiny?: boolean;
  /** Carta escaneada como Mega. */
  mega?: boolean;
  /** Digital Pokémon (não vem de carta física): batalha na Caixa, mas nunca vira alvo de scan/AR. */
  digital?: boolean;
}

/** Efeitos de batalha aplicados por cima da animação normal (a direção da batalha escreve aqui). */
export interface CreatureFx {
  /** Deslocamento (m) somado à posição no chão. */
  dx: number;
  dy: number;
  dz: number;
  /** Escala geral e achatamento vertical (agachar antes do golpe). */
  scale: number;
  squash: number;
  /** Cor multiplicada à textura (0xffffff = normal; vermelho = levou golpe). */
  tint: number;
  /** 0 = de pé, 1 = desmaiado (tombado e escurecido). */
  faint: number;
  /** Direção em que olha (no chão); null = segue o movimento. */
  facing: { x: number; z: number } | null;
}

export function neutralFx(): CreatureFx {
  return { dx: 0, dy: 0, dz: 0, scale: 1, squash: 1, tint: 0xffffff, faint: 0, facing: null };
}

/** Reações ao toque do usuário. */
export const TOUCH_EMOJIS = ['😆', '😊', '❗', '🥰', '😄'] as const;

/** Balão de emoji sobre a cabeça: aparece com um pulinho, balança de leve e some no fim. */
interface BubbleState {
  emoji: string;
  total: number;
  left: number;
  sprite: Sprite | null;
}

const BUBBLE_POP_MS = 200;
const BUBBLE_FADE_MS = 300;
/** Quanto dura o pulo de quem acaba de entrar na arena. */
const ENTER_MS = 520;

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export type CreatureSource = { kind: 'gif'; gif: DecodedGif } | { kind: 'image'; image: RgbaImage };

/** Metros de altura por pixel do sprite (96 px ≈ 0,34 m): Pokémon maiores no GIF ficam maiores na caixa. */
const METERS_PER_PIXEL = 0.0035;
const MIN_HEIGHT_M = 0.18;
const MAX_HEIGHT_M = 0.9;
/** Os sprites do Showdown olham para a esquerda da tela: ao andar para a direita, espelha. */
const SPRITE_FACES_LEFT = true;
/** Ampliação dentro da caixa (×2): a tela mostra o Pokémon pequeno e há muitos ao mesmo tempo. */
const BOX_MAX_UPSCALE = 2;
/** A partir de quantos Pokémon os quadros deixam de ser ampliados. */
const FULL_UPSCALE_MAX_CREATURES = 14;
/** Memória máxima de quadros suavizados por Pokémon quando a caixa tem poucos. */
const FRAME_CACHE_BYTES = 6 * 1024 * 1024;
/** Memória total (todos os Pokémon da caixa) para os quadros suavizados: com 40 na caixa, cada um fica com menos. */
export const BOX_FRAME_BUDGET_BYTES = 64 * 1024 * 1024;

/** Memória de quadros de cada Pokémon para uma caixa com `count` deles (dividida, com teto e um piso útil). */
export function frameCacheFor(count: number): number {
  const share = BOX_FRAME_BUDGET_BYTES / (Number.isFinite(count) ? Math.max(1, count) : 1);
  return Math.floor(Math.min(FRAME_CACHE_BYTES, Math.max(512 * 1024, share)));
}

/**
 * Ampliação dos quadros para uma caixa com `count` Pokémon. Com muita gente cada um ocupa pouco da tela, ampliar não
 * aparece, e sem ampliar todos os quadros cabem na memória de cada um (senão eles eram refeitos a cada volta do GIF).
 */
export function upscaleFor(count: number): 1 | 2 {
  return count > FULL_UPSCALE_MAX_CREATURES ? 1 : BOX_MAX_UPSCALE;
}

/** O que a cena entrega a cada quadro para poupar o que não aparece. */
export interface CreatureView {
  frustum: Frustum;
  /** Quantos quadros ainda podem ser ampliados agora (a conta é cara e não pode empilhar num quadro só). */
  budget: { left: number };
}

const scratchSphere = new Sphere();

interface PreparedFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
/** Inclinação do sprite para a câmera quando ela está acima: fração do ângulo de elevação, até este máximo. */
const LEAN_FRACTION = 0.6;
const MAX_LEAN_RAD = 0.75;

function asBytes(rgba: Uint8ClampedArray): Uint8Array {
  return new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
}

export function creatureHeightMeters(pixelHeight: number): number {
  return Math.min(MAX_HEIGHT_M, Math.max(MIN_HEIGHT_M, pixelHeight * METERS_PER_PIXEL));
}

/**
 * Na Arena, o desenho (sem a margem transparente) de um Pokémon de 1 m tem esta altura: Pikachu ≈ 0,18 m,
 * Snorlax ≈ 0,35 m — próximos do tamanho antigo pelo desenho, mas agora comparáveis entre espécies.
 */
export const BOX_METERS_PER_RELATIVE = 0.26;
/** A forma Mega cresce pela arte (desenho maior que o da forma base), até este fator. */
export const MEGA_MAX_GROWTH = 1.5;

const boundsCache = new WeakMap<object, ContentBounds>();

/** Medir varre todos os quadros do GIF: uma vez por sprite basta. */
function boundsOf(source: CreatureSource): ContentBounds {
  const key = source.kind === 'gif' ? source.gif : source.image;
  let bounds = boundsCache.get(key);
  if (!bounds) {
    bounds = contentBounds(source.kind === 'gif' ? source.gif : { width: source.image.width, height: source.image.height, frames: [{ rgba: source.image.data, delayMs: 0 }] });
    boundsCache.set(key, bounds);
  }
  return bounds;
}

/** Fração da altura do quadro ocupada pelo desenho, e a altura do desenho em pixels. */
function measure(source: CreatureSource): { frac: number; px: number } {
  const b = boundsOf(source);
  const frac = Math.max(0.2, b.bottom - b.top);
  return { frac, px: frac * (source.kind === 'gif' ? source.gif.height : source.image.height) };
}

/**
 * Altura do plano do Pokémon na Caixa: pela ALTURA REAL da espécie (`core/size-scale.ts`), com o desenho (sem a
 * margem) do tamanho certo; sem dado de altura, pelo tamanho do desenho, como antes.
 */
export function creatureSizeFor(dexId: number | undefined, source: CreatureSource): number {
  const rel = speciesRelativeSize(dexId);
  if (rel === undefined) return creatureHeightMeters(source.kind === 'gif' ? source.gif.height : source.image.height);
  return (BOX_METERS_PER_RELATIVE * rel) / measure(source).frac;
}

/**
 * Um Pokémon solto na caixa: plano em pé (sempre virado para a câmera, só girando em torno do eixo vertical),
 * sombra redonda no chão, GIF animado quadro a quadro e pulinho enquanto anda.
 */
export class BoxCreature {
  readonly group = new Group();
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  /** Tamanho da sombra neste quadro (a cena desenha todas juntas, ver shadow-batch.ts). */
  shadowX = 0;
  shadowZ = 0;
  /** Apareceu no último quadro? Fora da visão o GIF não é avançado. */
  onScreen = true;
  width: number;
  height: number;
  private texture: DataTexture;
  private silhouetteShadow: Mesh<PlaneGeometry, ShaderMaterial> | null = null;
  private smoothing: SmoothingMode = DEFAULT_SMOOTHING;
  /** Quadros já suavizados (a conta é cara e o GIF repete os mesmos quadros o tempo todo). */
  private readonly frameCache = new Map<number, PreparedFrame>();
  private frameCacheBytes = 0;
  private lastRgba: Uint8ClampedArray;
  private gif: DecodedGif | null;
  private spriteWidth: number;
  private spriteHeight: number;
  /** O sprite com que a carta nasceu: a troca de forma (Mega) sempre volta para ele. */
  private readonly baseSource: CreatureSource;
  private megaActive = false;
  private swapped = false;
  /** Altura do plano da forma base (a troca de forma volta para ela). */
  private readonly baseHeight: number;
  private startedAt = 0;
  private shownFrame = -1;
  private flip = 1;
  /** Brilho de "foi tocado" (ms restantes). */
  private pulseMs = 0;
  readonly fx: CreatureFx = neutralFx();
  /** Altura do relevo sob o Pokémon (m), escrita pela cena a cada quadro. */
  groundY = 0;
  private bubble: BubbleState | null = null;
  private aura: ShinyAura | null = null;
  /** Acessório da Vila (laço, chapéu, capa…), no lugar do corpo que a âncora dele indica. */
  private accessory: Sprite | null = null;
  private accessoryFit: { pos: AccessoryPos; w: number; h: number; nudge?: { dx?: number; dy?: number } } | null = null;
  /** Caixa dos pixels opacos do quadro atual (onde fica o corpo, para posicionar o acessório). */
  private bounds: ContentBounds;
  /** Reflexo na poça (de ponta-cabeça sob os pés); null até a primeira poça. */
  private reflection: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
  private reflectionStrength = 0;
  /** Movimento reduzido: sem pulinhos nem balanço (o GIF e o passeio continuam). */
  calm = false;
  private enterDelayMs = 0;
  private enterLeftMs = 0;
  /** Olhando para o lado de alguém por um instante; ao acabar o olhar volta a seguir o movimento. */
  private lookMs = 0;

  constructor(
    readonly info: CreatureInfo,
    source: CreatureSource,
    readonly state: WanderState,
    private frameCacheLimit = FRAME_CACHE_BYTES,
    private maxUpscale: 1 | 2 = BOX_MAX_UPSCALE,
  ) {
    this.baseSource = source;
    const first = source.kind === 'gif' ? source.gif.frames[0]?.rgba : source.image.data;
    const width = source.kind === 'gif' ? source.gif.width : source.image.width;
    const height = source.kind === 'gif' ? source.gif.height : source.image.height;
    if (!first) throw new Error('Sprite sem quadros.');
    this.gif = source.kind === 'gif' && source.gif.frames.length > 1 ? source.gif : null;
    this.spriteWidth = width;
    this.spriteHeight = height;
    this.lastRgba = first;
    this.texture = this.makeTexture(this.prepare(0, first));

    this.bounds = boundsOf(source);
    this.height = creatureSizeFor(info.dexId, source);
    this.baseHeight = this.height;
    this.width = this.height * (width / height);
    const geometry = new PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0); // origem nos pés
    this.mesh = new Mesh(geometry, new MeshBasicMaterial({ map: this.texture, alphaTest: 0.5, side: DoubleSide }));
    this.mesh.scale.set(this.width, this.height, 1);
    this.shadowX = this.width * 0.8;
    this.shadowZ = this.width * 0.45;
    this.group.add(this.mesh);
    this.mesh.userData.creature = this;
    if (info.shiny) this.setShiny(true);
  }

  /**
   * Troca o sprite por outro (a forma Mega, durante uma batalha): tamanho, quadros e animação passam a ser os do novo.
   * `restoreForm` devolve o original. Um pulinho e uma faísca marcam a transformação.
   */
  setForm(source: CreatureSource, mega = true): void {
    const first = source.kind === 'gif' ? source.gif.frames[0]?.rgba : source.image.data;
    const width = source.kind === 'gif' ? source.gif.width : source.image.width;
    const height = source.kind === 'gif' ? source.gif.height : source.image.height;
    if (!first) throw new Error('Sprite sem quadros.');
    this.gif = source.kind === 'gif' && source.gif.frames.length > 1 ? source.gif : null;
    this.spriteWidth = width;
    this.spriteHeight = height;
    this.lastRgba = first;
    this.frameCache.clear();
    this.frameCacheBytes = 0;
    const old = this.texture;
    this.texture = this.makeTexture(this.prepare(0, first));
    this.mesh.material.map = this.texture;
    this.updateShadowTexture();
    this.mesh.material.needsUpdate = true;
    old.dispose();
    this.height = this.formHeight(source);
    this.width = this.height * (width / height);
    this.bounds = boundsOf(source);
    this.startedAt = 0;
    this.shownFrame = -1;
    this.swapped = source !== this.baseSource;
    this.megaActive = mega && this.swapped;
    this.poke();
    if (this.megaActive) this.say('⚡', 1600);
  }

  /** Altura de outra forma: com dado de altura, a da base vezes o quanto o desenho cresceu (Mega maior, até 1,5×). */
  private formHeight(source: CreatureSource): number {
    if (source === this.baseSource) return this.baseHeight;
    if (speciesRelativeSize(this.info.dexId) === undefined) return creatureHeightMeters(source.kind === 'gif' ? source.gif.height : source.image.height);
    const base = measure(this.baseSource);
    const next = measure(source);
    const growth = Math.min(MEGA_MAX_GROWTH, Math.max(1, next.px / base.px));
    return (this.baseHeight * base.frac * growth) / next.frac;
  }

  /** Volta ao sprite com que a carta nasceu (fim da batalha na forma Mega). */
  restoreForm(): void {
    if (!this.swapped) return;
    this.setForm(this.baseSource, false);
    this.clearBubble();
  }

  /** Está na forma Mega agora. */
  get isMegaForm(): boolean {
    return this.megaActive;
  }

  /**
   * Põe (ou tira, com `null`) um acessório em pixel art (RGBA no tamanho real do desenho) no lugar do corpo de `pos`.
   * Um pixel do acessório tem o tamanho de um pixel do sprite do Pokémon.
   */
  setAccessory(rgba: { w: number; h: number; data: Uint8Array } | null, pos: AccessoryPos = 'hat', nudge?: { dx?: number; dy?: number }): void {
    if (this.accessory) {
      this.accessory.material.map?.dispose();
      this.accessory.material.dispose();
      this.accessory.removeFromParent();
      this.accessory = null;
    }
    this.accessoryFit = null;
    if (!rgba) return;
    this.accessoryFit = { pos, w: rgba.w, h: rgba.h, ...(nudge ? { nudge } : {}) };
    const tex = new DataTexture(rgba.data, rgba.w, rgba.h, RGBAFormat, UnsignedByteType);
    tex.colorSpace = SRGBColorSpace;
    tex.magFilter = NearestFilter;
    tex.minFilter = NearestFilter;
    tex.repeat.set(1, -1);
    tex.offset.set(0, 1);
    tex.needsUpdate = true;
    this.accessory = new Sprite(new SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.5 }));
    this.accessory.center.set(0.5, 0.5);
    this.group.add(this.accessory);
  }

  get hasAccessory(): boolean {
    return this.accessory !== null;
  }

  /** Força do reflexo na poça sob o Pokémon (0 = sem poça). A cena escreve a cada quadro. */
  setReflection(strength: number): void {
    this.reflectionStrength = Math.max(0, Math.min(1, strength));
    if (this.reflectionStrength > 0.02 && !this.reflection) {
      this.reflection = new Mesh(this.mesh.geometry, new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, alphaTest: 0.5, side: DoubleSide, color: 0xa8c4e6 }));
      this.reflection.renderOrder = 0;
      this.group.add(this.reflection);
    }
  }

  private updateReflection(): void {
    const r = this.reflection;
    if (!r) return;
    const on = this.reflectionStrength > 0.02 && this.fx.faint < 0.5;
    r.visible = on;
    if (!on) return;
    if (r.material.map !== this.mesh.material.map) {
      r.material.map = this.mesh.material.map;
      r.material.needsUpdate = true;
    }
    // De ponta-cabeça a partir dos pés, com o mesmo giro e o pulinho invertido.
    r.rotation.order = 'YXZ';
    r.rotation.y = this.mesh.rotation.y;
    r.rotation.x = -this.mesh.rotation.x;
    r.position.y = -this.mesh.position.y;
    r.scale.set(this.mesh.scale.x, -this.mesh.scale.y, 1);
    r.material.opacity = 0.42 * this.reflectionStrength;
  }

  /** Para testes: o reflexo está aparecendo? */
  get reflecting(): boolean {
    return this.reflection?.visible === true;
  }

  /** Liga ou desliga o brilho do shiny (halo dourado e estrelinhas) em volta do Pokémon. */
  setShiny(on: boolean): void {
    if (on === (this.aura !== null)) return;
    if (on) {
      // O plano do Pokémon tem a origem nos pés: o centro dele fica meio plano acima.
      this.aura = new ShinyAura(0.5);
      this.mesh.add(this.aura.group);
    } else {
      this.aura?.dispose();
      this.aura = null;
    }
  }

  get shiny(): boolean {
    return this.aura !== null;
  }

  /** Quadro ampliado (×2) e suavizado no modo escolhido; o resultado fica guardado até a memória acabar. */
  private prepare(index: number, rgba: Uint8ClampedArray): PreparedFrame {
    const cached = this.frameCache.get(index);
    if (cached) return cached;
    const up = upscaleSprite(rgba, this.spriteWidth, this.spriteHeight, this.maxUpscale, this.smoothing);
    const prepared: PreparedFrame = { data: up.data, width: up.width, height: up.height };
    if (this.frameCacheBytes + prepared.data.byteLength <= this.frameCacheLimit) {
      this.frameCache.set(index, prepared);
      this.frameCacheBytes += prepared.data.byteLength;
    }
    return prepared;
  }

  private makeTexture(frame: PreparedFrame): DataTexture {
    const texture = new DataTexture(asBytes(frame.data), frame.width, frame.height, RGBAFormat, UnsignedByteType);
    texture.colorSpace = SRGBColorSpace;
    const filter = isLinearSmoothing(this.smoothing) ? LinearFilter : NearestFilter;
    texture.magFilter = filter;
    texture.minFilter = filter;
    texture.generateMipmaps = false;
    texture.repeat.set(1, -1);
    texture.offset.set(0, 1);
    texture.needsUpdate = true;
    return texture;
  }

  /** Troca o modo de suavização dos pixels (refaz a textura com o quadro atual). */
  setSmoothing(mode: SmoothingMode): void {
    if (mode === this.smoothing) return;
    this.smoothing = mode;
    this.rebuildFrames();
  }

  /** Projeta o alfa do mesmo quadro do GIF no chão; o shader amostra a borda para suavizá-la. */
  setCinematicShadow(on: boolean): void {
    if (on && !this.silhouetteShadow) {
      const geometry = new PlaneGeometry(1, 1);
      geometry.translate(0, 0.5, 0);
      const material = new ShaderMaterial({
        transparent: true, depthWrite: false, side: DoubleSide,
        uniforms: { sprite: { value: this.texture }, texel: { value: new Vector2(1 / this.texture.image.width, 1 / this.texture.image.height) }, opacity: { value: 0.23 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform sampler2D sprite; uniform vec2 texel; uniform float opacity; varying vec2 vUv;
          float a(vec2 p) { if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return 0.0; return texture2D(sprite, vec2(p.x, 1.0-p.y)).a; }
          void main() { vec2 d = texel * 1.5; float alpha = a(vUv) * 0.28;
            alpha += (a(vUv+vec2(d.x,0.0))+a(vUv-vec2(d.x,0.0))+a(vUv+vec2(0.0,d.y))+a(vUv-vec2(0.0,d.y))) * 0.12;
            alpha += (a(vUv+d)+a(vUv-d)+a(vUv+vec2(d.x,-d.y))+a(vUv+vec2(-d.x,d.y))) * 0.06;
            gl_FragColor = vec4(0.0, 0.0, 0.0, alpha * opacity); }`,
      });
      this.silhouetteShadow = new Mesh(geometry, material);
      this.silhouetteShadow.name = 'cinematic-silhouette-shadow';
      this.silhouetteShadow.rotation.order = 'YXZ';
      this.silhouetteShadow.rotation.x = -Math.PI / 2;
      this.silhouetteShadow.position.y = 0.008;
      this.group.add(this.silhouetteShadow);
    }
    if (this.silhouetteShadow) this.silhouetteShadow.visible = on;
  }

  private updateShadowTexture(): void {
    if (!this.silhouetteShadow) return;
    this.silhouetteShadow.material.uniforms.sprite!.value = this.texture;
    (this.silhouetteShadow.material.uniforms.texel!.value as Vector2).set(1 / this.texture.image.width, 1 / this.texture.image.height);
  }

  private rebuildFrames(): void {
    this.frameCache.clear();
    this.frameCacheBytes = 0;
    const old = this.texture;
    this.texture = this.makeTexture(this.prepare(Math.max(0, this.shownFrame), this.lastRgba));
    this.mesh.material.map = this.texture;
    this.updateShadowTexture();
    this.mesh.material.needsUpdate = true;
    old.dispose();
  }

  /** Este Pokémon continua na caixa, que mudou de tamanho: ajusta a memória dos quadros sem recomeçar. */
  tune(frameCacheLimit: number, maxUpscale: 1 | 2): void {
    this.frameCacheLimit = frameCacheLimit;
    if (maxUpscale !== this.maxUpscale) {
      this.maxUpscale = maxUpscale;
      this.rebuildFrames();
    } else if (this.frameCacheBytes > frameCacheLimit) {
      this.frameCache.clear();
      this.frameCacheBytes = 0;
    }
  }

  /** É este o sprite com que o Pokémon nasceu? */
  hasSource(source: CreatureSource): boolean {
    return source === this.baseSource;
  }

  /** Chegada na arena: depois de `delayMs` cresce do chão com um pulinho. */
  enter(delayMs: number): void {
    this.enterDelayMs = Math.max(0, delayMs);
    this.enterLeftMs = ENTER_MS;
  }

  /** Olha para a direção (x, z) do chão por `ms` milissegundos. */
  lookToward(x: number, z: number, ms: number): void {
    const length = Math.hypot(x, z);
    if (length < 1e-4) return;
    this.fx.facing = { x: x / length, z: z / length };
    this.lookMs = ms;
  }

  /** Liga a iluminação dos golpes e do ambiente neste sprite (ver fx-lights.ts). */
  attachLights(lights: FxLights): void {
    enableRelight(this.mesh.material, lights);
  }

  /** Toque: o Pokémon dá um pulinho de confirmação. */
  poke(): void {
    this.pulseMs = 500;
  }

  /** Mostra um balão de emoji sobre a cabeça por `ms` milissegundos (um novo substitui o anterior). */
  say(emoji: string, ms: number): void {
    this.clearBubble();
    this.bubble = { emoji, total: Math.max(300, ms), left: Math.max(300, ms), sprite: null };
  }

  /** Reação a um toque do usuário: pulinho e um emoji. */
  react(rand: () => number = Math.random): void {
    this.poke();
    this.say(TOUCH_EMOJIS[Math.floor(rand() * TOUCH_EMOJIS.length)] ?? '😊', 1800);
  }

  clearBubble(): void {
    const sprite = this.bubble?.sprite;
    if (sprite) {
      sprite.removeFromParent();
      sprite.material.dispose();
    }
    this.bubble = null;
  }

  /** Emoji do balão no ar agora (null se não há). */
  get bubbleEmoji(): string | null {
    return this.bubble?.emoji ?? null;
  }

  private updateBubble(dtMs: number, nowMs: number): void {
    const b = this.bubble;
    if (!b) return;
    b.left -= dtMs;
    if (b.left <= 0) return this.clearBubble();
    if (!b.sprite) {
      const map = bubbleTexture(b.emoji);
      if (!map) return;
      b.sprite = new Sprite(new SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false }));
      b.sprite.center.set(0.5, 0);
      b.sprite.renderOrder = 20;
      this.group.add(b.sprite);
    }
    const age = b.total - b.left;
    const width = Math.min(0.3, Math.max(0.17, this.height * 0.6));
    const pop = !this.calm && age < BUBBLE_POP_MS ? Math.max(0, easeOutBack(age / BUBBLE_POP_MS)) : 1;
    b.sprite.scale.set(width * pop, width * BUBBLE_ASPECT * pop, 1);
    const bob = this.calm ? 0 : Math.sin(nowMs * 0.004) * 0.012;
    b.sprite.position.set(0, this.mesh.position.y + this.height * this.fx.scale * this.fx.squash + 0.03 + bob, 0);
    b.sprite.material.opacity = Math.min(1, b.left / BUBBLE_FADE_MS);
  }

  /**
   * `base` = ponto do chão no centro da caixa; `camera` = posição da câmera; `right` = eixo "direita da tela"
   * (para decidir para que lado espelhar); `view` poupa o que está fora da tela.
   */
  update(nowMs: number, dtMs: number, base: Vector3, camera: Vector3, right: Vector3, view?: CreatureView): void {
    const s = this.state;
    const fx = this.fx;
    this.group.position.set(base.x + s.x + fx.dx, base.y + this.groundY, base.z + s.z + fx.dz);
    if (view) {
      scratchSphere.center.set(this.group.position.x, this.group.position.y + this.height / 2, this.group.position.z);
      scratchSphere.radius = Math.max(this.width, this.height) * 0.8;
      this.onScreen = view.frustum.intersectsSphere(scratchSphere);
    } else {
      this.onScreen = true;
    }
    if (this.lookMs > 0) {
      this.lookMs -= dtMs;
      if (this.lookMs <= 0) fx.facing = null;
    }
    const toCameraX = camera.x - this.group.position.x;
    const toCameraZ = camera.z - this.group.position.z;
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = Math.atan2(toCameraX, toCameraZ);
    if (this.silhouetteShadow?.visible) this.silhouetteShadow.rotation.y = this.mesh.rotation.y;
    // Visto de cima, um Pokémon em pé fica achatado: inclina o sprite para a câmera (só parte do ângulo, para ainda parecer em pé).
    const elevation = Math.atan2(camera.y - this.group.position.y, Math.hypot(toCameraX, toCameraZ));
    // Com a câmera em +Z, um ângulo X positivo leva o topo do plano em direção à câmera.
    // O sinal negativo inclinava a arte para longe do observador e fazia os Pokémon parecerem virados.
    this.mesh.rotation.x = Math.min(MAX_LEAN_RAD, Math.max(0, elevation * LEAN_FRACTION));
    const moving = s.vx !== 0 || s.vz !== 0;
    if (fx.facing || moving) {
      const side = fx.facing ? fx.facing.x * right.x + fx.facing.z * right.z : s.vx * right.x + s.vz * right.z;
      if (Math.abs(side) > 0.02) this.flip = (side > 0) === SPRITE_FACES_LEFT ? -1 : 1;
    }
    // Entrada na arena: espera a vez, cresce do chão e cai com um pulinho.
    let appear = 1;
    let entryLift = 0;
    if (this.enterLeftMs > 0) {
      if (this.enterDelayMs > 0) {
        this.enterDelayMs = Math.max(0, this.enterDelayMs - dtMs);
        appear = 0;
      } else {
        this.enterLeftMs = Math.max(0, this.enterLeftMs - dtMs);
        const t = 1 - this.enterLeftMs / ENTER_MS;
        appear = Math.max(0, easeOutBack(t));
        entryLift = (1 - t) * (1 - t) * 0.45;
      }
    }
    this.mesh.visible = appear > 0.001;
    this.mesh.scale.x = this.width * this.flip * fx.scale * appear;
    this.mesh.scale.y = this.height * fx.scale * fx.squash * appear;
    this.mesh.rotation.z = fx.faint * 1.35 * -this.flip;
    // Desmaiado fica escuro; levar golpe tinge de vermelho.
    const dark = 1 - fx.faint * 0.6;
    this.mesh.material.color.setHex(fx.tint).multiplyScalar(dark);
    let hop = moving && !this.calm ? Math.abs(Math.sin(s.hopPhase)) * 0.05 : 0;
    if (this.pulseMs > 0) {
      this.pulseMs = Math.max(0, this.pulseMs - dtMs);
      if (!this.calm) hop += Math.sin((1 - this.pulseMs / 500) * Math.PI) * 0.12;
    }
    hop += fx.dy + entryLift;
    this.mesh.position.y = hop;
    this.updateBubble(dtMs, nowMs);
    this.updateReflection();
    if (this.accessory && this.accessoryFit) {
      // Posição em pixels do quadro (y para baixo), convertida para metros com a mesma escala do sprite.
      const W = this.spriteWidth;
      const H = this.spriteHeight;
      const b = this.bounds;
      const fit = this.accessoryFit;
      const at = placeAccessory(fit.pos, fit, 1, {
        left: b.left * W, top: b.top * H, w: (b.right - b.left) * W, h: (b.bottom - b.top) * H, headX: ((b.left + b.right) / 2) * W, headTop: b.top * H,
      }, 'front', fit.nudge);
      const kx = (this.width * fx.scale) / W;
      const ky = (this.height * fx.scale * fx.squash) / H;
      this.accessory.scale.set(at.w * kx * this.flip, at.h * ky, 1);
      this.accessory.position.set((at.x + at.w / 2 - W / 2) * kx * this.flip, this.mesh.position.y + (H - at.y - at.h / 2) * ky, at.behind ? -0.002 : 0.002);
      this.accessory.renderOrder = at.behind ? -1 : 1;
      this.accessory.visible = fx.faint < 0.5 && !at.hidden && appear > 0.98;
    }
    if (this.aura && this.onScreen) {
      this.aura.update(nowMs);
      this.aura.group.visible = fx.faint < 0.5;
    }
    const shadowScale = (1 - Math.min(0.3, Math.max(0, hop) * 2)) * appear;
    this.shadowX = this.width * 0.8 * shadowScale;
    this.shadowZ = this.width * 0.45 * shadowScale;
    if (this.silhouetteShadow?.visible) {
      this.silhouetteShadow.visible = this.onScreen && appear > 0.001;
      this.silhouetteShadow.scale.set(this.width * this.flip * fx.scale * appear, this.height * 0.5 * fx.scale * appear, 1);
    }

    if (this.gif && this.onScreen) {
      if (this.startedAt === 0) this.startedAt = nowMs;
      const index = frameIndexAt(this.gif, nowMs - this.startedAt);
      if (index !== this.shownFrame) {
        const frame = this.gif.frames[index];
        // Sem verba neste quadro, mostra o atual e tenta de novo no próximo.
        const affordable = !view || this.frameCache.has(index) || view.budget.left-- > 0;
        if (frame && affordable) {
          this.shownFrame = index;
          this.lastRgba = frame.rgba;
          this.texture.image.data = asBytes(this.prepare(index, frame.rgba).data);
          this.texture.needsUpdate = true;
        }
      }
    }
  }

  get currentFrame(): number {
    return this.shownFrame;
  }

  dispose(): void {
    this.clearBubble();
    this.setShiny(false);
    this.setAccessory(null);
    this.reflection?.material.dispose();
    this.reflection?.removeFromParent();
    this.silhouetteShadow?.geometry.dispose();
    this.silhouetteShadow?.material.dispose();
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.group.removeFromParent();
  }
}
