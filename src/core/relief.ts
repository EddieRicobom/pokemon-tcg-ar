import { seededRng } from './battle';

/**
 * Relevo da Caixa: um campo de alturas suave (morrinhos e algumas baixadas) que sempre volta a zero na borda, para a caixa
 * ficar rente ao chão de verdade. Lógica pura: o desenho (malha, sombreado) fica em `box/ground.ts`.
 *
 * Coordenadas: x e z em metros, relativos ao centro da caixa (a mesma convenção do passeio dos Pokémon).
 */

export interface ReliefBump {
  x: number;
  z: number;
  /** Raio de influência (m) e altura (m; negativa = baixada). */
  r: number;
  h: number;
}

export interface Relief {
  readonly halfW: number;
  readonly halfD: number;
  readonly bumps: readonly ReliefBump[];
  /** Altura do chão em (x, z). 0 fora da caixa e rente à borda. */
  heightAt(x: number, z: number): number;
  /** Normal da superfície (unitária) em (x, z). */
  normalAt(x: number, z: number): { x: number; y: number; z: number };
}

/** Fração da meia-largura, junto à borda, onde o relevo é amortecido até zero. */
const EDGE_FRACTION = 0.22;

function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/**
 * `amplitude` é a altura típica dos morrinhos em metros (0 = chão liso). A mesma `seed` dá sempre o mesmo relevo.
 * Os morrinhos ficam espalhados por sorteio com folga mínima entre eles, para sobrar espaço plano onde os Pokémon andam.
 */
export function planRelief(halfW: number, halfD: number, seed: number, amplitude: number, bumpCount?: number): Relief {
  const rng = seededRng(seed ^ 0x7e11ef);
  const bumps: ReliefBump[] = [];
  if (amplitude > 0) {
    const area = (halfW * 2) * (halfD * 2);
    const count = bumpCount ?? Math.max(3, Math.min(14, Math.round(area * 1.3)));
    const scale = Math.min(halfW, halfD);
    for (let tries = 0; bumps.length < count && tries < count * 20; tries++) {
      const r = scale * (0.28 + rng() * 0.3);
      const x = (rng() * 2 - 1) * (halfW - r * 0.4);
      const z = (rng() * 2 - 1) * (halfD - r * 0.4);
      if (bumps.some((b) => Math.hypot(b.x - x, b.z - z) < (b.r + r) * 0.55)) continue;
      // Quase todos são morrinhos; de vez em quando uma baixada suave.
      const dip = rng() < 0.22;
      bumps.push({ x, z, r, h: (dip ? -0.55 : 1) * amplitude * (0.55 + rng() * 0.45) });
    }
  }
  const edge = (x: number, z: number): number => {
    const ex = (halfW - Math.abs(x)) / (halfW * EDGE_FRACTION);
    const ez = (halfD - Math.abs(z)) / (halfD * EDGE_FRACTION);
    return smooth(ex) * smooth(ez);
  };
  const heightAt = (x: number, z: number): number => {
    if (bumps.length === 0 || Math.abs(x) >= halfW || Math.abs(z) >= halfD) return 0;
    let h = 0;
    for (const b of bumps) {
      const d2 = ((x - b.x) ** 2 + (z - b.z) ** 2) / (b.r * b.r);
      if (d2 < 9) h += b.h * Math.exp(-2 * d2);
    }
    return h * edge(x, z);
  };
  const normalAt = (x: number, z: number) => {
    const e = Math.min(halfW, halfD) / 60;
    const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
    const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    const len = Math.hypot(dx, 1, dz);
    return { x: -dx / len, y: 1 / len, z: -dz / len };
  };
  return { halfW, halfD, bumps, heightAt, normalAt };
}

/** Luz do sol do relevo (de cima, um pouco de trás e da esquerda), usada para sombrear a malha. */
const LIGHT = (() => {
  const v = { x: -0.45, y: 0.8, z: -0.4 };
  const len = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / len, y: v.y / len, z: v.z / len };
})();

/** Brilho (1 = chão plano) de uma superfície com esta normal: encostas viradas para a luz clareiam, as outras escurecem. */
export function reliefShade(normal: { x: number; y: number; z: number }): number {
  const lit = normal.x * LIGHT.x + normal.y * LIGHT.y + normal.z * LIGHT.z;
  return Math.min(1.16, Math.max(0.55, 1 + 1.6 * (lit - LIGHT.y)));
}
