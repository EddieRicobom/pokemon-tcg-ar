import { applyArenaSnapshot, createArena, NO_INPUT, SV_SNAPSHOT_MS, snapshotArena, stepArena } from '../core/survivor-pvp';
import type { ArenaEvent, ArenaInput, ArenaSnapshot, ArenaState, SvMonSpec } from '../core/survivor-pvp';
import { inputOf } from './survival-wire';
import type { WireMessage } from './wire';

/**
 * A ligação da arena do Survival, sem tela. O anfitrião é a autoridade: roda a simulação com a própria entrada e a
 * última entrada do convidado, e manda instantâneos (~15 Hz). O convidado manda só as entradas e desenha o que recebe,
 * suavizando entre dois instantâneos. Testável com um canal falso (`survival-link.test.ts`).
 */

export interface LinkTransport {
  send(msg: WireMessage): boolean;
}

const MAX_EVENTS_PER_SNAPSHOT = 40;
/** Depois do fim da luta o instantâneo final vai algumas vezes, para não depender de um só. */
const FINAL_REPEATS = 3;

/** Quem joga no lugar do amigo na luta contra um rival do jogo: lê a arena e decide a entrada de cada quadro. */
export type ArenaBot = (state: ArenaState, dtMs: number) => ArenaInput;

/** Luta sem rede: o rival é o `bot` e o transporte não leva nada a lugar nenhum. */
export const LOCAL_TRANSPORT: LinkTransport = { send: () => true };

export class SurvivalHostLink {
  readonly state: ArenaState;
  private guestInput: ArenaInput = NO_INPUT;
  private lastSeq = -1;
  private pending: ArenaEvent[] = [];
  private sinceSnapshot = SV_SNAPSHOT_MS;
  private tick = 0;
  private finals = 0;

  constructor(private readonly tx: LinkTransport, hostTeam: readonly SvMonSpec[], guestTeam: readonly SvMonSpec[], private readonly bot?: ArenaBot) {
    this.state = createArena(hostTeam, guestTeam);
  }

  /** Entrada do convidado. Mensagens repetidas ou fora de ordem são ignoradas. */
  receive(msg: WireMessage): void {
    if (msg.t !== 'sv-input' || msg.seq <= this.lastSeq) return;
    this.lastSeq = msg.seq;
    const input = inputOf(msg);
    // A direção mais recente vence, mas um toque recebido só é consumido pelo próximo passo.
    this.guestInput = {
      ...input,
      switchTo: input.switchTo >= 0 ? input.switchTo : this.guestInput.switchTo,
      shield: input.shield || this.guestInput.shield,
      swapAttack: input.swapAttack || this.guestInput.swapAttack,
      dodge: input.dodge || this.guestInput.dodge,
      special: input.special || this.guestInput.special,
    };
  }

  /** Avança `dtMs` com a entrada local e manda o instantâneo quando chega a hora. Devolve o que aconteceu (para a tela do anfitrião). */
  step(dtMs: number, local: ArenaInput): ArenaEvent[] {
    if (this.bot) this.guestInput = this.bot(this.state, dtMs);
    const events = stepArena(this.state, [local, this.guestInput], dtMs);
    // Cada ação vale uma vez só. A direção continua até chegar outra.
    this.guestInput = { ...this.guestInput, switchTo: -1, shield: false, swapAttack: false, dodge: false, special: false };
    this.pending.push(...events);
    this.sinceSnapshot += Math.min(Math.max(dtMs, 0), 1000);
    const over = this.state.winner !== null;
    if (this.sinceSnapshot >= SV_SNAPSHOT_MS || (over && this.finals < FINAL_REPEATS)) {
      this.sinceSnapshot = 0;
      if (over) this.finals++;
      this.tx.send({ t: 'sv-snap', snap: snapshotArena(this.state, ++this.tick), events: this.pending.splice(0).slice(-MAX_EVENTS_PER_SNAPSHOT) });
    }
    return events;
  }
}

export interface ArenaView {
  sides: [{ x: number; y: number }, { x: number; y: number }];
  shots: { id: number; side: 0 | 1; x: number; y: number; type: ArenaState['shots'][number]['type']; radius: number }[];
  markers: { id: number; side: 0 | 1; x: number; y: number; radius: number; type: ArenaState['markers'][number]['type']; leftMs: number }[];
}

export class SurvivalGuestLink {
  readonly state: ArenaState;
  /** Eventos recebidos que a tela ainda não mostrou. */
  events: ArenaEvent[] = [];
  private seq = 0;
  private lastSent: ArenaInput = NO_INPUT;
  private lastSentAt = -Infinity;
  private lastTick = -1;
  private prev: ArenaSnapshot | null = null;
  private cur: ArenaSnapshot | null = null;
  private curAt = 0;

  constructor(private readonly tx: LinkTransport, hostTeam: readonly SvMonSpec[], guestTeam: readonly SvMonSpec[]) {
    this.state = createArena(hostTeam, guestTeam);
  }

  /** Quantos instantâneos já chegaram (a tela usa para avisar «sem sinal do anfitrião»). */
  get received(): number {
    return this.lastTick + 1;
  }

  /** Quando chegou o último instantâneo (0 = nenhum ainda). */
  get lastAt(): number {
    return this.curAt;
  }

  receive(msg: WireMessage, nowMs: number): void {
    if (msg.t !== 'sv-snap' || msg.snap.tick <= this.lastTick) return;
    if (!applyArenaSnapshot(this.state, msg.snap)) return;
    this.lastTick = msg.snap.tick;
    this.prev = this.cur;
    this.cur = msg.snap;
    this.curAt = nowMs;
    this.events.push(...msg.events);
  }

  /** Manda a entrada quando mudou (ou quando há troca pedida). A direção segue no mundo do anfitrião: quem chama já desvirou. */
  sendInput(input: ArenaInput, nowMs: number): void {
    const changed = input.dx !== this.lastSent.dx || input.dy !== this.lastSent.dy;
    if (input.switchTo < 0 && !input.shield && !input.swapAttack && !input.dodge && !input.special && (!changed || nowMs - this.lastSentAt < 33)) return;
    this.lastSentAt = nowMs;
    this.lastSent = { dx: input.dx, dy: input.dy, switchTo: -1 };
    this.tx.send({ t: 'sv-input', seq: this.seq++, dx: input.dx, dy: input.dy, switchTo: input.switchTo, shield: input.shield === true, swapAttack: input.swapAttack === true, dodge: input.dodge === true, special: input.special === true });
  }

  /** Posições suavizadas entre o instantâneo anterior e o atual. */
  view(nowMs: number): ArenaView {
    const cur = this.cur;
    if (!cur) {
      return {
        sides: [{ x: this.state.sides[0].x, y: this.state.sides[0].y }, { x: this.state.sides[1].x, y: this.state.sides[1].y }],
        shots: this.state.shots.map((s) => ({ id: s.id, side: s.side, x: s.x, y: s.y, type: s.type, radius: s.radius })),
        markers: this.state.markers.map((m) => ({ id: m.id, side: m.side, x: m.x, y: m.y, radius: m.radius, type: m.type, leftMs: m.leftMs })),
      };
    }
    const prev = this.prev ?? cur;
    const a = Math.max(0, Math.min(1, (nowMs - this.curAt) / SV_SNAPSHOT_MS));
    const lerp = (from: number, to: number): number => from + (to - from) * a;
    const before = new Map(prev.shots.map((s) => [s.id, s]));
    return {
      sides: [
        { x: lerp(prev.sides[0].x, cur.sides[0].x), y: lerp(prev.sides[0].y, cur.sides[0].y) },
        { x: lerp(prev.sides[1].x, cur.sides[1].x), y: lerp(prev.sides[1].y, cur.sides[1].y) },
      ],
      shots: cur.shots.map((s) => {
        const p = before.get(s.id);
        return { id: s.id, side: s.side, x: p ? lerp(p.x, s.x) : s.x, y: p ? lerp(p.y, s.y) : s.y, type: s.type, radius: s.radius };
      }),
      markers: cur.markers,
    };
  }
}
