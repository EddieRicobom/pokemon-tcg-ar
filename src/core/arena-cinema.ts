import type { ArenaEvent, ArenaSide, ArenaWinner } from './survivor-pvp';

/**
 * A direção de cena da luta da Arena: decide, a partir dos eventos que os dois celulares já recebem, quando há congelamento
 * de impacto, corte de câmera, cut-in e drama de último Pokémon. Tudo aqui é só visual: não toca no estado da luta, então
 * anfitrião e convidado não dessincronizam, e o toque continua valendo enquanto a imagem segura.
 */

/** Um plano de câmera em andamento, com o foco em coordenadas do campo. */
export interface CinemaShot {
  side: ArenaSide;
  bornMs: number;
  durMs: number;
  /** Zoom no auge (1 = sem zoom). */
  scale: number;
  /** Força das linhas de velocidade no auge (0 = sem linhas). */
  lines: number;
}

export interface CinemaFrame {
  side: ArenaSide;
  scale: number;
  lines: number;
}

export interface CinemaBeat {
  kind: 'cut-in' | 'ko' | 'last-stand';
  side: ArenaSide;
  /** Pokémon do cut-in ou do nocaute. */
  index: number;
  /** Nocaute que encerra a luta. */
  final?: boolean;
}

/** O maior congelamento: curto o bastante para nunca parecer travamento. */
export const CINEMA_MAX_STOP_MS = 200;
/** Intervalo mínimo entre dois congelamentos, para rajadas não virarem engasgo. */
export const CINEMA_STOP_GAP_MS = 380;

const STOP = { final: CINEMA_MAX_STOP_MS, ko: 130, special: 110, beam: 80, super: 55 } as const;
const SHOT = {
  final: { scale: 1.3, durMs: 820, lines: 1 },
  ko: { scale: 1.18, durMs: 520, lines: 0.8 },
  special: { scale: 1.12, durMs: 460, lines: 0.75 },
  cast: { scale: 1.07, durMs: 420, lines: 0.5 },
  beam: { scale: 1.06, durMs: 360, lines: 0.45 },
} as const;

/** Sobe rápido, segura e desce: 0 nas pontas, 1 no meio do plano. */
export function shotEnvelope(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  if (t < 0.18) {
    const p = t / 0.18;
    return 1 - (1 - p) * (1 - p);
  }
  if (t < 0.6) return 1;
  const p = (t - 0.6) / 0.4;
  return 1 - p * p;
}

/** Quantos ficam de pé em cada lado agora. */
export type AliveOf = (side: ArenaSide) => number;

export class ArenaDirector {
  private frozenUntil = -Infinity;
  private lastStop = -Infinity;
  private shot: CinemaShot | null = null;
  private lastCut: [number, number] = [-Infinity, -Infinity];
  private lastStand: [boolean, boolean] = [false, false];

  /** Lê os eventos do quadro e devolve o que a tela deve anunciar. O estado já vem atualizado (`aliveOf` conta depois do golpe). */
  take(events: readonly ArenaEvent[], aliveOf: AliveOf, now: number): CinemaBeat[] {
    const beats: CinemaBeat[] = [];
    for (const e of events) {
      if (e.k === 'faint') {
        const final = aliveOf(e.side) === 0;
        beats.push({ kind: 'ko', side: e.side, index: e.index, final });
        this.stop(final ? STOP.final : STOP.ko, now, true);
        this.frame(e.side, final ? SHOT.final : SHOT.ko, now);
        if (!final && aliveOf(e.side) === 1 && !this.lastStand[e.side]) {
          this.lastStand[e.side] = true;
          beats.push({ kind: 'last-stand', side: e.side, index: e.index });
        }
      } else if (e.k === 'special') {
        // O cut-in do Especial sempre aparece; o limite só evita dois seguidos do mesmo lado.
        if (now - this.lastCut[e.side] >= 1200) {
          this.lastCut[e.side] = now;
          beats.push({ kind: 'cut-in', side: e.side, index: e.index });
        }
        this.frame(e.side, SHOT.cast, now);
      } else if (e.k === 'hit' && e.special) {
        this.stop(STOP.special, now);
        this.frame(e.side, SHOT.special, now);
      } else if (e.k === 'beam' && e.leftMs === 0) {
        this.stop(STOP.beam, now);
        this.frame(e.side === 0 ? 1 : 0, SHOT.beam, now);
      } else if (e.k === 'hit' && e.mult > 1 && e.damage > 0) {
        this.stop(STOP.super, now);
      }
    }
    return beats;
  }

  private stop(ms: number, now: number, force = false): void {
    if (!force && now - this.lastStop < CINEMA_STOP_GAP_MS) return;
    this.lastStop = now;
    this.frozenUntil = Math.max(this.frozenUntil, now + Math.min(ms, CINEMA_MAX_STOP_MS));
  }

  /** Um plano mais forte substitui o atual; um mais fraco não interrompe o que ainda está no ar. */
  private frame(side: ArenaSide, shot: { scale: number; durMs: number; lines: number }, now: number): void {
    const running = this.shot !== null && now - this.shot.bornMs < this.shot.durMs;
    if (running && this.shot!.scale > shot.scale) return;
    this.shot = { side, bornMs: now, ...shot };
  }

  /** A imagem está segurando o impacto? A simulação e o toque continuam correndo por baixo. */
  frozen(now: number): boolean {
    return now < this.frozenUntil;
  }

  /** Câmera deste instante; null quando não há plano no ar. */
  camera(now: number): CinemaFrame | null {
    const shot = this.shot;
    if (!shot) return null;
    const t = (now - shot.bornMs) / shot.durMs;
    if (t >= 1) {
      this.shot = null;
      return null;
    }
    const k = shotEnvelope(t);
    return { side: shot.side, scale: 1 + (shot.scale - 1) * k, lines: shot.lines * k };
  }
}

/** Título e texto do fim da luta: só diz que a equipe caiu quando caiu de verdade (o limite de tempo também encerra). */
export function arenaResultText(winner: ArenaWinner, mySide: ArenaSide, friendName: string, mine: number, foe: number): { title: string; detail: string } {
  if (winner === 'draw') return { title: 'Empate', detail: mine === 0 && foe === 0 ? 'As duas equipes caíram ao mesmo tempo.' : 'O tempo acabou com as duas equipes iguais.' };
  if (winner === mySide) return { title: 'Você venceu!', detail: foe === 0 ? `${friendName} ficou sem Pokémon de pé. Sobraram ${mine} na sua equipe.` : `O tempo acabou e a sua equipe estava na frente: ${mine} contra ${foe} de pé.` };
  return { title: `${friendName} venceu`, detail: mine === 0 ? `A sua equipe ficou sem Pokémon de pé. Sobraram ${foe} na equipe rival.` : `O tempo acabou e a equipe rival estava na frente: ${foe} contra ${mine} de pé.` };
}

/**
 * Linhas de velocidade: cunhas finas apontando para o foco, com posição fixa pelo índice (nada de sorteio por quadro).
 * Devolve frações do raio externo para a tela desenhar num único caminho.
 */
export function speedLineWedges(count: number, seed: number): { angle: number; inner: number; half: number }[] {
  const out: { angle: number; inner: number; half: number }[] = [];
  const n = Math.max(0, Math.floor(count));
  for (let i = 0; i < n; i++) {
    const h = Math.abs(Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453);
    const f = h - Math.floor(h);
    out.push({ angle: (i / n) * Math.PI * 2 + (f - 0.5) * 0.22, inner: 0.42 + f * 0.26, half: 0.006 + f * 0.012 });
  }
  return out;
}
