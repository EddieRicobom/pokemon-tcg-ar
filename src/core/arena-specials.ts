import type { PokemonType } from './pokemon-data';

/**
 * O Especial de cada elemento: forma do golpe, efeito e a faixa do cut-in. Quem decide é o tipo do ataque em uso, então
 * trocar de ataque também troca o Especial. Os nomes são nossos e tudo aqui é dado puro: o motor (`survivor-pvp.ts`)
 * transforma cada `SpecialStrike` em marca no chão, linha ou salto, e o golpe só acerta quem continua na marca.
 */

/** O que acontece a mais em quem leva o golpe (ou em quem lançou, no caso do roubo de vida). */
export type SpecialRider = 'burn' | 'toxin' | 'slow' | 'stun' | 'push' | 'gust' | 'drain' | 'siphon';

type SpecialPattern =
  /** Círculo em volta de quem lança. */
  | { k: 'self'; radius: number }
  /** Círculo no ponto onde o rival está agora. */
  | { k: 'foe'; radius: number }
  /** Círculos que caminham de quem lança até o rival, um depois do outro. */
  | { k: 'march'; radius: number; start: number; step: number; count: number; delayMs: number }
  /** Paredão de círculos atravessado na frente do rival. */
  | { k: 'wall'; radius: number; gap: number }
  /** Um círculo no rival e outros em volta, caindo em sequência. */
  | { k: 'swarm'; radius: number; ring: number; count: number; delayMs: number }
  /** Leque saindo de quem lança. */
  | { k: 'cone'; range: number }
  | { k: 'beam'; width: number; length: number }
  /** Duas linhas em X, cruzando no rival. */
  | { k: 'cross'; width: number; length: number }
  /** Arranque em linha até o rival (e `past` além dele). */
  | { k: 'dash'; travel: number; past: number };

export interface ArenaSpecialDef {
  type: PokemonType;
  name: string;
  /** Tempo do aviso: quanto maior e mais forte o golpe, mais tempo para sair. */
  windupMs: number;
  /** Multiplica o dano-base do Especial. */
  power: number;
  /** A que distância do rival vale lançar. */
  reach: number;
  /** Fração do dano que é cura de quem lança, antes de o golpe sair. */
  healPct?: number;
  /** Fica protegido por este tempo ao lançar. */
  guardMs?: number;
  rider?: SpecialRider;
  pattern: SpecialPattern;
  /** Segunda cor e ângulo das listras do cut-in. */
  tint: string;
  stripe: number;
}

export type SpecialStrike =
  | { kind: 'circle'; x: number; y: number; radius: number; delayMs: number; share: number }
  | { kind: 'cone'; x: number; y: number; angle: number; range: number; delayMs: number; share: number }
  | { kind: 'beam'; x0: number; y0: number; x1: number; y1: number; width: number; delayMs: number; share: number }
  | { kind: 'dash'; x: number; y: number; delayMs: number; share: number };

export const ARENA_SPECIALS: Readonly<Record<PokemonType, ArenaSpecialDef>> = {
  normal: { type: 'normal', name: 'Impacto Total', windupMs: 650, power: 1.1, reach: 110, rider: 'push', pattern: { k: 'self', radius: 130 }, tint: '#f4efe0', stripe: 90 },
  fire: { type: 'fire', name: 'Sol Cadente', windupMs: 750, power: 1.15, reach: 430, rider: 'burn', pattern: { k: 'foe', radius: 88 }, tint: '#ffd166', stripe: 62 },
  water: { type: 'water', name: 'Maré Furiosa', windupMs: 650, power: 1.05, reach: 260, rider: 'push', pattern: { k: 'cone', range: 300 }, tint: '#9fe7ff', stripe: 15 },
  electric: { type: 'electric', name: 'Cruz Elétrica', windupMs: 700, power: 1.1, reach: 430, rider: 'stun', pattern: { k: 'cross', width: 20, length: 460 }, tint: '#fff7a8', stripe: 118 },
  grass: { type: 'grass', name: 'Raízes Sedentas', windupMs: 650, power: 0.92, reach: 105, rider: 'drain', pattern: { k: 'self', radius: 125 }, tint: '#c8f58a', stripe: 75 },
  ice: { type: 'ice', name: 'Inverno Eterno', windupMs: 700, power: 0.92, reach: 430, rider: 'slow', pattern: { k: 'foe', radius: 100 }, tint: '#e3fbff', stripe: 135 },
  fighting: { type: 'fighting', name: 'Punho Cometa', windupMs: 480, power: 1.25, reach: 280, rider: 'gust', pattern: { k: 'dash', travel: 300, past: 0 }, tint: '#ffb199', stripe: 100 },
  poison: { type: 'poison', name: 'Nuvem Tóxica', windupMs: 650, power: 0.72, reach: 430, rider: 'toxin', pattern: { k: 'foe', radius: 100 }, tint: '#e3a8ff', stripe: 45 },
  ground: { type: 'ground', name: 'Fenda Sísmica', windupMs: 620, power: 1.05, reach: 320, rider: 'slow', pattern: { k: 'march', radius: 58, start: 95, step: 105, count: 3, delayMs: 150 }, tint: '#ecd199', stripe: 8 },
  flying: { type: 'flying', name: 'Ciclone Cortante', windupMs: 650, power: 1, reach: 430, rider: 'gust', pattern: { k: 'beam', width: 40, length: 560 }, tint: '#e8e2ff', stripe: 28 },
  psychic: { type: 'psychic', name: 'Colapso Mental', windupMs: 520, power: 1.1, reach: 430, rider: 'stun', pattern: { k: 'foe', radius: 70 }, tint: '#ffc2e0', stripe: 150 },
  bug: { type: 'bug', name: 'Enxame Feroz', windupMs: 620, power: 1, reach: 400, pattern: { k: 'swarm', radius: 40, ring: 84, count: 4, delayMs: 70 }, tint: '#e5f28a', stripe: 170 },
  rock: { type: 'rock', name: 'Avalanche', windupMs: 720, power: 1.15, reach: 400, pattern: { k: 'wall', radius: 54, gap: 150 }, tint: '#e6dcb0', stripe: 2 },
  ghost: { type: 'ghost', name: 'Sombra Devoradora', windupMs: 600, power: 0.95, reach: 430, rider: 'siphon', pattern: { k: 'foe', radius: 80 }, tint: '#c8b6ff', stripe: 55 },
  dragon: { type: 'dragon', name: 'Sopro Ancestral', windupMs: 850, power: 1.35, reach: 450, pattern: { k: 'beam', width: 52, length: 560 }, tint: '#c7b2ff', stripe: 125 },
  dark: { type: 'dark', name: 'Bote Noturno', windupMs: 420, power: 1.05, reach: 240, rider: 'slow', pattern: { k: 'dash', travel: 260, past: 40 }, tint: '#b5a8a0', stripe: 72 },
  steel: { type: 'steel', name: 'Muralha de Aço', windupMs: 650, power: 0.95, reach: 100, guardMs: 1300, pattern: { k: 'self', radius: 112 }, tint: '#eef2fb', stripe: 38 },
  fairy: { type: 'fairy', name: 'Bênção Lunar', windupMs: 650, power: 0.82, reach: 115, healPct: 0.14, pattern: { k: 'self', radius: 140 }, tint: '#ffe0f0', stripe: 160 },
};

export const arenaSpecialOf = (type: PokemonType): ArenaSpecialDef => ARENA_SPECIALS[type];

interface Field {
  w: number;
  h: number;
  margin: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/**
 * Onde cada parte do Especial cai, a partir de onde os dois estão agora. Nada acompanha o alvo depois disso. `share` é a
 * fração do dano daquela parte: quem fica parado no meio leva o golpe inteiro, mas nunca mais do que o golpe vale.
 */
export function planSpecial(def: ArenaSpecialDef, me: { x: number; y: number }, foe: { x: number; y: number }, field: Field): SpecialStrike[] {
  const dx = foe.x - me.x;
  const dy = foe.y - me.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const px = (n: number): number => round1(clamp(n, field.margin, field.w - field.margin));
  const py = (n: number): number => round1(clamp(n, field.margin, field.h - field.margin));
  const p = def.pattern;
  switch (p.k) {
    case 'self':
      return [{ kind: 'circle', x: px(me.x), y: py(me.y), radius: p.radius, delayMs: 0, share: 1 }];
    case 'foe':
      return [{ kind: 'circle', x: px(foe.x), y: py(foe.y), radius: p.radius, delayMs: 0, share: 1 }];
    case 'march':
      return Array.from({ length: p.count }, (_, i) => {
        const along = p.start + p.step * i;
        return { kind: 'circle' as const, x: px(me.x + ux * along), y: py(me.y + uy * along), radius: p.radius, delayMs: p.delayMs * i, share: 0.5 };
      });
    case 'wall':
      return [-1, 0, 1].map((n) => ({ kind: 'circle' as const, x: px(foe.x - uy * p.gap * n), y: py(foe.y + ux * p.gap * n), radius: p.radius, delayMs: 0, share: 1 }));
    case 'swarm': {
      const ring = Array.from({ length: p.count }, (_, i) => {
        const a = Math.atan2(uy, ux) + Math.PI / p.count + (i * 2 * Math.PI) / p.count;
        return { kind: 'circle' as const, x: px(foe.x + Math.cos(a) * p.ring), y: py(foe.y + Math.sin(a) * p.ring), radius: p.radius, delayMs: p.delayMs * (i + 1), share: 0.25 };
      });
      return [{ kind: 'circle', x: px(foe.x), y: py(foe.y), radius: p.radius, delayMs: 0, share: 0.75 }, ...ring];
    }
    case 'cone':
      return [{ kind: 'cone', x: px(me.x), y: py(me.y), angle: Math.round(Math.atan2(uy, ux) * 100) / 100, range: p.range, delayMs: 0, share: 1 }];
    case 'beam':
      return [{ kind: 'beam', x0: round1(me.x), y0: round1(me.y), x1: round1(me.x + ux * p.length), y1: round1(me.y + uy * p.length), width: p.width, delayMs: 0, share: 1 }];
    case 'cross': {
      const half = p.length / 2;
      return [Math.PI / 4, -Math.PI / 4].map((turn) => {
        const a = Math.atan2(uy, ux) + turn;
        const cx = Math.cos(a) * half;
        const cy = Math.sin(a) * half;
        return { kind: 'beam' as const, x0: round1(foe.x - cx), y0: round1(foe.y - cy), x1: round1(foe.x + cx), y1: round1(foe.y + cy), width: p.width, delayMs: 0, share: 0.5 };
      });
    }
    case 'dash': {
      const travel = Math.max(0, Math.min(p.travel, dist + p.past - field.margin * 2));
      return [{ kind: 'dash', x: px(me.x + ux * travel), y: py(me.y + uy * travel), delayMs: 0, share: 1 }];
    }
    default:
      return [];
  }
}
