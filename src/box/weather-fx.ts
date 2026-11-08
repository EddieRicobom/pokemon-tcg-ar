import {
  BufferAttribute, BufferGeometry, CircleGeometry, DataTexture, Group, LinearFilter, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, NearestFilter,
  Points, PointsMaterial, RepeatWrapping, RGBAFormat, UnsignedByteType,
} from 'three';
import { cloudShadow, puddleAt, snowAt, tileNoise } from '../core/weather';
import type { WeatherState } from '../core/weather';
import type { Ground } from './ground';

const MAX_RAIN = 900;
const MAX_SNOW = 520;
const RAIN_SPEED = 4.2;
const SNOW_SPEED = 0.32;
/** Resolução dos mapas de poça e de neve (pixel art, como o chão). */
const MAP = 64;
const CLOUD_TEX = 128;
/** Tamanho (m) de um "quadro" de nuvens no chão. */
const CLOUD_TILE_M = 2.6;

/** Até onde a chuva e a neve vão, e quantas: na caixa sobre a câmera é um volume pequeno; no Coliseu, a arena à vista. */
interface WeatherVolume {
  /** Altura (m) de onde a chuva e a neve caem. */
  sky: number;
  rain: number;
  snow: number;
  rainLen: number;
  flake: number;
}
const BOX_VOLUME: WeatherVolume = { sky: 1.1, rain: 420, snow: 360, rainLen: 0.075, flake: 0.028 };
const ARENA_VOLUME: WeatherVolume = { sky: 3, rain: MAX_RAIN, snow: MAX_SNOW, rainLen: 0.17, flake: 0.05 };

function dataTexture(size: number, nearest: boolean): DataTexture {
  const tex = new DataTexture(new Uint8Array(size * size * 4), size, size, RGBAFormat, UnsignedByteType);
  tex.magFilter = nearest ? NearestFilter : LinearFilter;
  tex.minFilter = nearest ? NearestFilter : LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function roundDot(): DataTexture {
  const n = 16;
  const tex = dataTexture(n, false);
  const data = tex.image.data as Uint8Array;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * Math.max(0, 1 - d * d));
    }
  }
  tex.needsUpdate = true;
  return tex;
}

/**
 * O clima desenhado na caixa. Mora no grupo do chão (coordenadas da caixa, origem no centro): sombras de nuvem que
 * passam com o vento, poças que enchem as baixadas e brilham, neve que cobre o chão aos poucos, gotas e flocos caindo.
 * As poças devolvem a força do reflexo em cada ponto (`puddleStrengthAt`), para os Pokémon se refletirem nelas.
 * No Coliseu (`setArena`) não há relevo: as mesmas camadas cobrem a areia e as baixadas vêm de um ruído fixo.
 */
export class WeatherFx {
  readonly group = new Group();
  private readonly rain: LineSegments;
  private readonly rainPos: Float32Array;
  private readonly snow: Points;
  private readonly snowPos: Float32Array;
  private readonly snowPhase: Float32Array;
  private readonly cloudTex = dataTexture(CLOUD_TEX, false);
  private readonly puddleTex = dataTexture(MAP, true);
  private readonly snowTex = dataTexture(MAP, true);
  private readonly dotTex = roundDot();
  private readonly cloudMat = new MeshBasicMaterial({ map: this.cloudTex, transparent: true, depthWrite: false, opacity: 0 });
  private readonly puddleMat = new MeshBasicMaterial({ map: this.puddleTex, transparent: true, depthWrite: false });
  private readonly snowMat = new MeshBasicMaterial({ map: this.snowTex, transparent: true, depthWrite: false });
  private overlays: Mesh[] = [];
  private ground: Ground | null = null;
  /** Disco sobre a areia do Coliseu (null na caixa sobre a câmera). */
  private arenaGeometry: CircleGeometry | null = null;
  private volume = BOX_VOLUME;
  /** Meio-lado do volume da chuva e da neve (m). */
  private half = 1.2;
  /** Meio-lado da área coberta pelos mapas de poça e de neve (m). */
  private mapHalf = 1.2;
  private off = false;
  /** Movimento reduzido: sem partículas caindo, nuvem andando nem água tremendo. */
  private calm = false;
  /** Profundidade (0 alto … 1 baixo) e ruído de cada célula dos mapas. */
  private depth = new Float32Array(MAP * MAP).fill(0.5);
  private readonly noise = new Float32Array(MAP * MAP);
  private readonly noise2 = new Float32Array(MAP * MAP);
  private puddle = new Float32Array(MAP * MAP);
  private paintedWet = -1;
  private paintedSnow = -1;
  private cloudU = 0;
  private cloudV = 0;
  private seed = 1;

  constructor() {
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        this.noise[y * MAP + x] = tileNoise(x / 6, y / 6, 1e6, 3);
        this.noise2[y * MAP + x] = 0.6 * tileNoise(x / 5, y / 5, 1e6, 5) + 0.4 * tileNoise(x / 2, y / 2, 1e6, 6);
      }
    }
    this.paintClouds();
    this.cloudTex.wrapS = RepeatWrapping;
    this.cloudTex.wrapT = RepeatWrapping;
    // Gotas: um segmento por gota (2 vértices).
    this.rainPos = new Float32Array(MAX_RAIN * 6);
    const rainGeo = new BufferGeometry();
    rainGeo.setAttribute('position', new BufferAttribute(this.rainPos, 3));
    rainGeo.setDrawRange(0, 0);
    this.rain = new LineSegments(rainGeo, new LineBasicMaterial({ color: 0xb8cfea, transparent: true, opacity: 0.55, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.snowPos = new Float32Array(MAX_SNOW * 3);
    this.snowPhase = new Float32Array(MAX_SNOW);
    const snowGeo = new BufferGeometry();
    snowGeo.setAttribute('position', new BufferAttribute(this.snowPos, 3));
    snowGeo.setDrawRange(0, 0);
    this.snow = new Points(snowGeo, new PointsMaterial({ color: 0xffffff, size: 0.028, map: this.dotTex, transparent: true, depthWrite: false, sizeAttenuation: true }));
    this.snow.frustumCulled = false;
    this.group.add(this.rain, this.snow);
    this.respawnAll();
  }

  private rand(): number {
    // Sorteio barato e repetível para as partículas.
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private respawnAll(): void {
    const { sky } = this.volume;
    for (let i = 0; i < MAX_RAIN; i++) this.spawnDrop(i, this.rand() * sky);
    for (let i = 0; i < MAX_SNOW; i++) {
      this.spawnFlake(i, this.rand() * sky);
      this.snowPhase[i] = this.rand() * Math.PI * 2;
    }
  }

  private spawnDrop(i: number, y: number): void {
    const x = (this.rand() * 2 - 1) * this.half;
    const z = (this.rand() * 2 - 1) * this.half;
    const pos = this.rainPos;
    const o = i * 6;
    pos[o] = pos[o + 3] = x;
    pos[o + 1] = y;
    pos[o + 4] = y + this.volume.rainLen;
    pos[o + 2] = pos[o + 5] = z;
  }

  private spawnFlake(i: number, y: number): void {
    const o = i * 3;
    this.snowPos[o] = (this.rand() * 2 - 1) * this.half;
    this.snowPos[o + 1] = y;
    this.snowPos[o + 2] = (this.rand() * 2 - 1) * this.half;
  }

  private paintClouds(): void {
    const data = this.cloudTex.image.data as Uint8Array;
    for (let y = 0; y < CLOUD_TEX; y++) {
      for (let x = 0; x < CLOUD_TEX; x++) {
        const i = (y * CLOUD_TEX + x) * 4;
        data[i] = 20;
        data[i + 1] = 24;
        data[i + 2] = 40;
        data[i + 3] = Math.round(255 * 0.55 * cloudShadow(x / CLOUD_TEX, y / CLOUD_TEX));
      }
    }
    this.cloudTex.needsUpdate = true;
  }

  /** Tira as camadas atuais e aponta os mapas para o novo chão. */
  private resetLayers(ground: Ground | null, mapHalf: number, particleHalf: number, volume: WeatherVolume): void {
    for (const mesh of this.overlays) mesh.removeFromParent();
    this.overlays = [];
    this.ground = ground;
    this.mapHalf = mapHalf;
    this.half = particleHalf;
    this.volume = volume;
    (this.snow.material as PointsMaterial).size = volume.flake;
    this.respawnAll();
    this.paintedWet = -1;
    this.paintedSnow = -1;
    const repeat = (mapHalf * 2) / CLOUD_TILE_M;
    this.cloudTex.repeat.set(repeat, repeat);
  }

  /** Liga as camadas ao chão da caixa (ou tira, com `null`). Chame de novo quando o chão for refeito. */
  setGround(ground: Ground | null, half: number): void {
    this.dropArena();
    this.resetLayers(ground, half, half, BOX_VOLUME);
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        // Célula → ponto da caixa (a textura do chão tem v para cima = −z).
        const wx = ((x + 0.5) / MAP) * 2 * half - half;
        const wz = half - ((y + 0.5) / MAP) * 2 * half;
        this.depth[y * MAP + x] = ground ? ground.depthAt(wx, wz) : 0.5;
      }
    }
    if (!ground) return;
    this.overlays = [ground.overlay(this.cloudMat, 0.001), ground.overlay(this.puddleMat, 0.002), ground.overlay(this.snowMat, 0.003)];
    for (const mesh of this.overlays) mesh.visible = !this.off;
  }

  /** O clima sobre a areia do Coliseu: camadas num disco de raio `radius`; chuva e neve na parte da arena à vista. */
  setArena(radius: number, particleHalf: number): void {
    this.dropArena();
    this.resetLayers(null, radius, particleHalf, ARENA_VOLUME);
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) this.depth[y * MAP + x] = 0.2 + 0.8 * tileNoise(x / 10, y / 10, 1e6, 9);
    }
    const geometry = new CircleGeometry(radius, 48);
    geometry.rotateX(-Math.PI / 2);
    this.arenaGeometry = geometry;
    const layers = [this.cloudMat, this.puddleMat, this.snowMat];
    this.overlays = layers.map((material, i) => {
      const mesh = new Mesh(geometry, material);
      mesh.position.y = 0.001 + i * 0.001;
      mesh.renderOrder = -2;
      mesh.visible = !this.off;
      this.group.add(mesh);
      return mesh;
    });
  }

  private dropArena(): void {
    if (!this.arenaGeometry) return;
    for (const mesh of this.overlays) mesh.removeFromParent();
    this.overlays = [];
    this.arenaGeometry.dispose();
    this.arenaGeometry = null;
  }

  private paintPuddles(wet: number): void {
    const data = this.puddleTex.image.data as Uint8Array;
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const k = y * MAP + x;
        const a = puddleAt(this.depth[k]!, this.noise[k]!, wet);
        this.puddle[k] = a;
        const i = k * 4;
        // Água refletindo o céu: azul-acinzentado, mais claro na borda de cima de cada poça (brilho).
        const lit = y > 0 && puddleAt(this.depth[k - MAP]!, this.noise[k - MAP]!, wet) < 0.3 ? 40 : 0;
        data[i] = 96 + lit * 2;
        data[i + 1] = 128 + lit * 2;
        data[i + 2] = 178 + lit;
        data[i + 3] = Math.round(255 * 0.78 * a);
      }
    }
    this.puddleTex.needsUpdate = true;
  }

  private paintSnow(cover: number): void {
    const data = this.snowTex.image.data as Uint8Array;
    for (let k = 0; k < MAP * MAP; k++) {
      const a = snowAt(this.noise2[k]!, cover);
      const i = k * 4;
      const shade = 236 + Math.round(this.noise2[k]! * 19);
      data[i] = shade;
      data[i + 1] = shade + 2 > 255 ? 255 : shade + 2;
      data[i + 2] = 255;
      data[i + 3] = Math.round(255 * 0.94 * a);
    }
    this.snowTex.needsUpdate = true;
  }

  /** Força do reflexo (0 a 1) da poça sob o ponto (x, z) da caixa. */
  puddleStrengthAt(x: number, z: number): number {
    if (!this.ground && !this.arenaGeometry) return 0;
    const cx = Math.floor(((x + this.mapHalf) / (2 * this.mapHalf)) * MAP);
    const cy = Math.floor(((this.mapHalf - z) / (2 * this.mapHalf)) * MAP);
    if (cx < 0 || cy < 0 || cx >= MAP || cy >= MAP) return 0;
    return this.puddle[cy * MAP + cx] ?? 0;
  }

  /** Avança `dtMs` com o clima `state` (null = clima desligado: some tudo). */
  update(dtMs: number, state: WeatherState | null, nowMs: number): void {
    const dt = Math.min(0.1, Math.max(0, dtMs / 1000));
    if (!state) {
      if (this.off) return;
      this.off = true;
      this.group.visible = false;
      for (const mesh of this.overlays) mesh.visible = false;
      this.puddle.fill(0);
      // Ao religar, as poças e a neve precisam ser repintadas: sem isso o reflexo só voltava quando o chão mudasse.
      this.paintedWet = -1;
      this.paintedSnow = -1;
      return;
    }
    if (this.off) {
      this.off = false;
      this.group.visible = true;
      for (const mesh of this.overlays) mesh.visible = true;
    }
    // Nuvens: a sombra anda com o vento.
    if (!this.calm) {
      this.cloudU += (state.windX * dt) / CLOUD_TILE_M;
      this.cloudV += (state.windZ * dt) / CLOUD_TILE_M;
    }
    this.cloudTex.offset.set(this.cloudU % 1, this.cloudV % 1);
    this.cloudMat.opacity = Math.min(1, state.cloud * 1.1);
    if (Math.abs(state.wet - this.paintedWet) > 0.015) {
      this.paintedWet = state.wet;
      this.paintPuddles(state.wet);
    }
    // A água brilha de leve (mais com chuva: os pingos agitam a poça).
    this.puddleMat.opacity = this.calm ? 0.9 : 0.85 + 0.15 * Math.sin(nowMs / (state.rain > 0.3 ? 140 : 700));
    if (Math.abs(state.snowCover - this.paintedSnow) > 0.015) {
      this.paintedSnow = state.snowCover;
      this.paintSnow(state.snowCover);
    }
    // Chuva: gotas inclinadas pelo vento. Sem gota no ar não há por que reenviar o buffer à GPU.
    const drops = this.calm ? 0 : Math.round(this.volume.rain * state.rain);
    this.rain.geometry.setDrawRange(0, drops * 2);
    const { rainLen, sky } = this.volume;
    const pos = this.rainPos;
    const dy = RAIN_SPEED * dt;
    const tiltX = state.windX * 0.02;
    const tiltZ = state.windZ * 0.02;
    for (let i = 0; i < drops; i++) {
      const o = i * 6;
      const y = pos[o + 1]! - dy;
      if (y < 0) {
        this.spawnDrop(i, sky + this.rand() * 0.2);
        continue;
      }
      const x = pos[o]! + state.windX * dt * 2;
      const z = pos[o + 2]! + state.windZ * dt * 2;
      pos[o] = x;
      pos[o + 1] = y;
      pos[o + 2] = z;
      pos[o + 3] = x - tiltX;
      pos[o + 4] = y + rainLen;
      pos[o + 5] = z - tiltZ;
    }
    if (drops > 0) this.rain.geometry.attributes.position!.needsUpdate = true;
    // Neve: flocos que descem devagar, balançando.
    const flakes = this.calm ? 0 : Math.round(this.volume.snow * state.snow);
    this.snow.geometry.setDrawRange(0, flakes);
    const t = nowMs / 1000;
    for (let i = 0; i < flakes; i++) {
      const o = i * 3;
      const y = this.snowPos[o + 1]! - SNOW_SPEED * dt;
      if (y < 0) {
        this.spawnFlake(i, sky);
        continue;
      }
      const sway = Math.sin(t * 1.3 + this.snowPhase[i]!) * 0.12;
      this.snowPos[o] = Math.max(-this.half, Math.min(this.half, this.snowPos[o]! + (state.windX + sway) * dt));
      this.snowPos[o + 1] = y;
      this.snowPos[o + 2] = Math.max(-this.half, Math.min(this.half, this.snowPos[o + 2]! + state.windZ * dt));
    }
    if (flakes > 0) this.snow.geometry.attributes.position!.needsUpdate = true;
  }

  /** Movimento reduzido (`prefers-reduced-motion`): as camadas no chão ficam, o que cai e o que treme para. */
  setCalm(on: boolean): void {
    this.calm = on;
  }

  /** Para testes: quantas gotas e flocos estão no ar. */
  get counts(): { rain: number; snow: number } {
    return { rain: (this.rain.geometry.drawRange.count ?? 0) / 2, snow: this.snow.geometry.drawRange.count ?? 0 };
  }

  dispose(): void {
    this.dropArena();
    for (const mesh of this.overlays) mesh.removeFromParent();
    this.overlays = [];
    this.rain.geometry.dispose();
    (this.rain.material as LineBasicMaterial).dispose();
    this.snow.geometry.dispose();
    (this.snow.material as PointsMaterial).dispose();
    for (const m of [this.cloudMat, this.puddleMat, this.snowMat]) m.dispose();
    for (const t of [this.cloudTex, this.puddleTex, this.snowTex, this.dotTex]) t.dispose();
    this.group.removeFromParent();
  }
}

