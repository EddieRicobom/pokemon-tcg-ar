import { AdditiveBlending, Color, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three';
import type { MeshBasicMaterial as BasicMaterial, Object3D, WebGLProgramParametersWithUniforms } from 'three';
import { glowMap } from './effects';

/**
 * Luz dos golpes. Os Pokémon são planos com o GIF (material sem luz); aqui eles ganham até `MAX_FX_LIGHTS` luzes
 * de ponto (a carga, o projétil, o impacto) que clareiam e tingem o sprite do lado de onde vem a luz, mais uma
 * luz ambiente (que escurece no foco do golpe e acompanha a luz do ambiente real). O chão recebe poças de luz.
 */

export const MAX_FX_LIGHTS = 4;

/** Uma luz, em coordenadas da arena (a raiz da batalha). */
export interface FxLight {
  x: number;
  y: number;
  z: number;
  /** Cor 0xRRGGBB (sRGB). */
  color: number;
  /** 0–1.5 aproximadamente; 0 apaga. */
  intensity: number;
  /** Alcance, em unidades da arena. */
  radius: number;
}

/** Quanto da luz chega a uma distância `d` (1 no ponto, cai suave e zera em 2,5 × `radius`). Espelha o GLSL. */
export function lightFalloff(d: number, radius: number): number {
  const r = Math.max(radius, 1e-4);
  const x = d / r;
  const base = 1 / (1 + x * x);
  const fade = Math.min(1, Math.max(0, (2.5 - x) / 1.5));
  return base * fade * fade;
}

export interface RelightUniforms {
  uLightPos: { value: Vector3[] };
  uLightCol: { value: Vector3[] };
  uLightRad: { value: number[] };
  uAmbient: { value: Vector3 };
}

/** Estado compartilhado entre todos os materiais dos Pokémon (um só conjunto de uniformes). */
export class FxLights {
  readonly uniforms: RelightUniforms = {
    uLightPos: { value: Array.from({ length: MAX_FX_LIGHTS }, () => new Vector3()) },
    uLightCol: { value: Array.from({ length: MAX_FX_LIGHTS }, () => new Vector3()) },
    uLightRad: { value: new Array<number>(MAX_FX_LIGHTS).fill(1) },
    uAmbient: { value: new Vector3(1, 1, 1) },
  };
  private readonly scratch = new Vector3();
  private readonly color = new Color();
  private active = 0;

  /** Quantas luzes estão acesas. */
  get count(): number {
    return this.active;
  }

  /**
   * Copia as luzes (em coordenadas de `root`) para o espaço do mundo, onde o shader trabalha. As mais fortes ganham
   * as vagas.
   */
  setLights(lights: readonly FxLight[], root: Object3D | null): void {
    const sorted = lights.filter((l) => l.intensity > 0.01).sort((a, b) => b.intensity - a.intensity).slice(0, MAX_FX_LIGHTS);
    root?.updateMatrixWorld(true);
    const scale = root ? root.scale.x : 1;
    for (let i = 0; i < MAX_FX_LIGHTS; i++) {
      const l = sorted[i];
      if (!l) {
        this.uniforms.uLightCol.value[i]!.set(0, 0, 0);
        continue;
      }
      this.scratch.set(l.x, l.y, l.z);
      if (root) root.localToWorld(this.scratch);
      this.uniforms.uLightPos.value[i]!.copy(this.scratch);
      this.color.setHex(l.color);
      this.uniforms.uLightCol.value[i]!.set(this.color.r, this.color.g, this.color.b).multiplyScalar(l.intensity);
      this.uniforms.uLightRad.value[i] = l.radius * scale;
    }
    this.active = sorted.length;
  }

  /** Luz ambiente que multiplica a cor do sprite (1 = sem mudança). */
  setAmbient(r: number, g: number, b: number): void {
    this.uniforms.uAmbient.value.set(r, g, b);
  }
}

const VERTEX_PARS = /* glsl */ `
varying vec3 vRlWorld;
varying vec3 vRlRight;
varying vec3 vRlUp;
varying vec2 vRlLocal;
`;

const VERTEX_BODY = /* glsl */ `
vRlWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vRlRight = normalize((modelMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
vRlUp = normalize((modelMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
vRlLocal = position.xy;
`;

export const FRAGMENT_PARS = /* glsl */ `
varying vec3 vRlWorld;
varying vec3 vRlRight;
varying vec3 vRlUp;
varying vec2 vRlLocal;
uniform vec3 uLightPos[${MAX_FX_LIGHTS}];
uniform vec3 uLightCol[${MAX_FX_LIGHTS}];
uniform float uLightRad[${MAX_FX_LIGHTS}];
uniform vec3 uAmbient;

vec3 relight(vec3 albedo) {
  // O sprite é plano: finge uma barriga (normal inclinada pelo lado e pela altura) para a luz de lado pegar de lado.
  vec3 toCam = normalize(cameraPosition - vRlWorld);
  vec3 n = normalize(toCam + vRlRight * (vRlLocal.x * 1.4) + vRlUp * ((vRlLocal.y - 0.5) * 0.9));
  vec3 lit = vec3(0.0);
  for (int i = 0; i < ${MAX_FX_LIGHTS}; i++) {
    vec3 toL = uLightPos[i] - vRlWorld;
    float d = length(toL);
    float x = d / max(uLightRad[i], 0.0001);
    float fade = clamp((2.5 - x) / 1.5, 0.0, 1.0);
    float fall = fade * fade / (1.0 + x * x);
    float wrap = clamp(dot(n, toL / max(d, 0.0001)) * 0.5 + 0.5, 0.0, 1.0);
    lit += uLightCol[i] * fall * (0.35 + 0.95 * wrap);
  }
  // Clareia pelo albedo e deixa um pouco de brilho próprio (sprite escuro ainda "acende" com um golpe forte).
  return albedo * uAmbient * (1.0 + lit * 1.1) + lit * 0.08;
}
`;

/** Troca os trechos do shader do MeshBasicMaterial. Separado para testar sem WebGL. */
export function patchRelightShader(shader: Pick<WebGLProgramParametersWithUniforms, 'vertexShader' | 'fragmentShader' | 'uniforms'>, lights: FxLights): void {
  Object.assign(shader.uniforms, lights.uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
    .replace('#include <opaque_fragment>', 'outgoingLight = relight(outgoingLight);\n#include <opaque_fragment>');
}

/** Liga o relight a um material de sprite (todos os sprites compartilham o mesmo programa). */
export function enableRelight(material: BasicMaterial, lights: FxLights): void {
  material.onBeforeCompile = (shader) => patchRelightShader(shader, lights);
  material.customProgramCacheKey = () => 'tcg-relight-v1';
  material.needsUpdate = true;
}

// ----------------------------------------------------------------------------- ambiente real

/**
 * A luz do ambiente a partir de uma amostra pequena do vídeo da câmera (RGBA, tipicamente 8×6). Devolve a
 * multiplicação para o sprite não parecer "colado" num lugar mais escuro ou colorido que ele:
 * `r, g, b` em ~0,7–1,3, com a cor suavizada para não tingir demais.
 */
export function ambientFromSample(rgba: ArrayLike<number>): { r: number; g: number; b: number; luma: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  const n = Math.floor(rgba.length / 4);
  if (n === 0) return { r: 1, g: 1, b: 1, luma: 0.7 };
  for (let i = 0; i < n; i++) {
    r += rgba[i * 4]!;
    g += rgba[i * 4 + 1]!;
    b += rgba[i * 4 + 2]!;
  }
  r /= n * 255;
  g /= n * 255;
  b /= n * 255;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  // Brilho (sutil: o GIF já tem cor própria): cena escura (luma 0,1) → ~0,84; normal (0,4) → 1; clara → 1,06.
  const level = Math.min(1.06, Math.max(0.8, 0.78 + luma * 0.55));
  // Cor: só 35 % da diferença para o cinza, para uma sala amarelada esquentar o sprite sem pintá-lo.
  const mean = (r + g + b) / 3 || 1;
  const tint = (c: number) => 1 + (Math.min(1.25, Math.max(0.8, c / mean)) - 1) * 0.35;
  return { r: level * tint(r), g: level * tint(g), b: level * tint(b), luma };
}

// ----------------------------------------------------------------------------- poças de luz no chão

/** Manchas de luz aditivas no chão da arena, uma por luz (a luz do golpe "cai" no chão em volta). */
export class FloorPools {
  readonly group = new Group();
  private readonly pools: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly color = new Color();

  constructor() {
    const geometry = new PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX_FX_LIGHTS; i++) {
      const material = new MeshBasicMaterial({ map: glowMap(), color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 });
      const pool = new Mesh(geometry, material);
      pool.visible = false;
      pool.renderOrder = 1;
      this.pools.push(pool);
      this.group.add(pool);
    }
  }

  /** Posiciona cada poça sob a sua luz, em coordenadas da arena. */
  update(lights: readonly FxLight[]): void {
    const sorted = lights.filter((l) => l.intensity > 0.01).sort((a, b) => b.intensity - a.intensity).slice(0, MAX_FX_LIGHTS);
    this.pools.forEach((pool, i) => {
      const l = sorted[i];
      pool.visible = !!l;
      if (!l) return;
      pool.position.set(l.x, 0.012, l.z);
      // A poça é mais larga que alta: o chão está de lado para a câmera.
      pool.scale.set(l.radius * 2.6, 1, l.radius * 1.6);
      this.color.setHex(l.color);
      pool.material.color.copy(this.color);
      pool.material.opacity = Math.min(0.85, l.intensity * 0.6);
    });
  }

  dispose(): void {
    this.pools[0]?.geometry.dispose();
    for (const pool of this.pools) pool.material.dispose();
    this.group.removeFromParent();
  }
}
