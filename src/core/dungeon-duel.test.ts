import { describe, expect, it } from 'vitest';
import { createMember, GRID_H, GRID_W, key } from './dungeon';
import type { Cell, MemberInput } from './dungeon';
import {
  applyAction, checkOver, concede, DUEL_DAMAGE, DUEL_MAX_ROUNDS, DUEL_SPAWN, duelDigest, duelPreview, duelReachable, duelTargets, duelView, duelWalls, endDuelTurn, mirrorCell,
  other, startDuel,
} from './dungeon-duel';
import type { DuelAction, DuelRoster, DuelState, Side } from './dungeon-duel';
import type { BaseStats } from './survivor-moves';

const stats = (o: Partial<BaseStats> = {}): BaseStats => ({ hp: 60, attack: 80, defense: 60, spAttack: 50, spDefense: 60, speed: 90, ...o });
const input = (id: string, dexId = 68): MemberInput => ({ id, dexId, name: id, types: ['fighting'], stats: stats() });
/** Todos com as Lâminas duplas (adjacente, 1 PA, 1 de carga): os testes não dependem da arma que a espécie recebe. */
const fighter = (id: string) => {
  const m = createMember(input(id));
  m.weapon = 'laminas';
  return m;
};
const roster = (ids: string[], potions = 2, fusionCharges = 1): DuelRoster => ({ members: ids.map(fighter), potions, fusionCharges });

/** Duelo novo com o tabuleiro vazio (os testes não dependem do sorteio dos pilares). */
function duel(seed = 0, host = ['a', 'b'], guest = ['x', 'y']): DuelState {
  const d = startDuel(seed, roster(host), roster(guest));
  d.walls = [];
  return d;
}

describe('tabuleiro do duelo', () => {
  it('girar 180° duas vezes volta à mesma casa', () => {
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) expect(mirrorCell(mirrorCell({ x, y }))).toEqual({ x, y });
    expect(mirrorCell(DUEL_SPAWN[0])).toEqual(DUEL_SPAWN[1]);
  });

  it('os pilares são espelhados, não tocam as entradas e nunca isolam uma casa', () => {
    for (let seed = 0; seed < 200; seed++) {
      const walls = duelWalls(seed);
      const keys = new Set(walls.map(key));
      expect(walls.length).toBeGreaterThanOrEqual(2);
      for (const w of walls) {
        expect(keys.has(key(mirrorCell(w)))).toBe(true);
        expect(w.y).toBeGreaterThanOrEqual(1);
        expect(w.y).toBeLessThanOrEqual(GRID_H - 2);
      }
      // Todas as casas livres se alcançam a partir da entrada do anfitrião.
      const seen = new Set([key(DUEL_SPAWN[0])]);
      const queue: Cell[] = [DUEL_SPAWN[0]];
      while (queue.length) {
        const c = queue.shift()!;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
          const n = { x: c.x + dx, y: c.y + dy };
          if (n.x < 0 || n.y < 0 || n.x >= GRID_W || n.y >= GRID_H || keys.has(key(n)) || seen.has(key(n))) continue;
          seen.add(key(n));
          queue.push(n);
        }
      }
      expect(seen.size).toBe(GRID_W * GRID_H - keys.size);
      expect(seen.has(key(DUEL_SPAWN[1]))).toBe(true);
    }
  });

  it('a mesma semente dá o mesmo tabuleiro e a mesma vez de começar nos dois celulares', () => {
    const a = startDuel(77, roster(['a']), roster(['x']));
    const b = startDuel(77, roster(['a']), roster(['x']));
    expect(a.walls).toEqual(b.walls);
    expect(a.turn).toBe(b.turn);
    expect(a.biome).toBe(b.biome);
    expect(duelDigest(a)).toBe(duelDigest(b));
  });
});

describe('começo do duelo', () => {
  it('cada lado começa na sua entrada, com os PA do turno e as equipes como chegaram', () => {
    const d = duel();
    expect(d.sides[0].pos).toEqual(DUEL_SPAWN[0]);
    expect(d.sides[1].pos).toEqual(DUEL_SPAWN[1]);
    expect(d.ap).toBe(6);
    expect(d.phase).toBe('duel');
    expect(d.sides[0].potions).toBe(2);
    expect(d.sides[0].team).toHaveLength(2);
  });

  it('recusa equipe sem ninguém de pé', () => {
    const dead = roster(['a']);
    dead.members[0]!.hp = 0;
    expect(() => startDuel(1, dead, roster(['x']))).toThrow();
    expect(() => startDuel(1, { members: [], potions: 0, fusionCharges: 0 }, roster(['x']))).toThrow();
  });

  it('quem chega com membros caídos os mantém caídos e o ativo é um que está de pé', () => {
    const r = roster(['a', 'b']);
    r.members[0]!.hp = 0;
    const d = startDuel(0, r, roster(['x']));
    expect(d.sides[0].team[0]!.status).toBe('down');
    expect(d.sides[0].active).toBe(1);
  });
});

describe('jogadas', () => {
  it('só joga quem tem a vez', () => {
    const d = duel();
    const r = applyAction(d, other(d.turn), { k: 'end' });
    expect(r.ok).toBe(false);
  });

  it('atacar tira vida do adversário (com a redução do duelo), gasta PA e não machuca quem ataca', () => {
    const d = duel();
    d.sides[1].pos = { x: 3, y: GRID_H - 2 };
    const mine = d.sides[0].team[0]!.hp;
    const theirs = d.sides[1].team[0]!.hp;
    const preview = duelPreview(d, 0, { x: 3, y: GRID_H - 2 });
    expect(preview.reason).toBeNull();
    expect(preview.damage).toBeGreaterThan(0);
    const r = applyAction(d, 0, { k: 'attack', x: 3, y: GRID_H - 2 });
    expect(r.ok).toBe(true);
    expect(d.sides[1].team[0]!.hp).toBeLessThan(theirs);
    expect(d.sides[0].team[0]!.hp).toBe(mine);
    expect(d.ap).toBeLessThan(6);
    expect(DUEL_DAMAGE).toBeLessThan(1);
  });

  it('jogada ilegal não muda nada: casa fora do tabuleiro, fora de alcance, sem PA, parede', () => {
    const d = duel();
    d.walls = [{ x: 3, y: GRID_H - 2 }];
    const before = duelDigest(d);
    const bad: DuelAction[] = [
      { k: 'move', x: -1, y: 0 }, { k: 'move', x: 99, y: 2 }, { k: 'move', x: 1.5, y: 2 }, { k: 'move', x: 3, y: GRID_H - 2 }, { k: 'move', x: 0, y: 0 },
      { k: 'attack', x: 3, y: 0 }, { k: 'attack', x: 7, y: 7 }, { k: 'switch', i: 9 }, { k: 'switch', i: 0 }, { k: 'fuse', a: 0, b: 0 }, { k: 'fuse', a: 0, b: 5 },
      { k: 'ammo', m: 0, ammo: ['water'] }, { k: 'ammo', m: 5, ammo: ['fighting'] },
    ];
    for (const act of bad) {
      const r = applyAction(d, 0, act);
      expect(r.ok, JSON.stringify(act)).toBe(false);
    }
    expect(duelDigest(d)).toBe(before);
  });

  it('mover gasta PA por casa e o PA acaba', () => {
    const d = duel();
    expect(applyAction(d, 0, { k: 'move', x: 3, y: GRID_H - 3 }).ok).toBe(true);
    expect(d.ap).toBe(4);
    expect(d.sides[0].pos).toEqual({ x: 3, y: GRID_H - 3 });
    // 4 PA restantes: 5 casas já não cabem.
    expect(applyAction(d, 0, { k: 'move', x: 3, y: 0 }).ok).toBe(false);
  });

  it('o adversário bloqueia a casa dele', () => {
    const d = duel();
    d.sides[1].pos = { x: 3, y: GRID_H - 2 };
    expect(duelReachable(d, 0).has(key({ x: 3, y: GRID_H - 2 }))).toBe(false);
    expect(applyAction(d, 0, { k: 'move', x: 3, y: GRID_H - 2 }).ok).toBe(false);
  });

  it('encerrar o turno passa a vez, dá os PA ao outro e conta a rodada quando volta a quem começou', () => {
    const d = duel();
    const first = d.turn;
    d.ap = 0;
    expect(applyAction(d, first, { k: 'end' }).ok).toBe(true);
    expect(d.turn).toBe(other(first));
    expect(d.ap).toBe(6);
    expect(d.round).toBe(1);
    expect(applyAction(d, other(first), { k: 'end' }).ok).toBe(true);
    expect(d.turn).toBe(first);
    expect(d.round).toBe(2);
  });

  it('poção cura quem está em campo e custa PA', () => {
    const d = duel();
    const member = d.sides[0].team[0]!;
    member.hp = 10;
    expect(applyAction(d, 0, { k: 'potion' }).ok).toBe(true);
    expect(member.hp).toBeGreaterThan(10);
    expect(d.sides[0].potions).toBe(1);
    expect(d.ap).toBe(4);
  });

  it('trocar custa 1 PA e põe outro em campo', () => {
    const d = duel();
    expect(applyAction(d, 0, { k: 'switch', i: 1 }).ok).toBe(true);
    expect(d.sides[0].active).toBe(1);
    expect(d.ap).toBe(5);
  });

  it('armadilha do adversário dispara em quem pisa na casa e some', () => {
    const d = duel();
    d.sides[1].traps.push({ pos: { x: 3, y: GRID_H - 2 }, power: 40, atk: 100, kind: 'physical', ammo: ['normal'], types: ['normal'] });
    const hp = d.sides[0].team[0]!.hp;
    expect(applyAction(d, 0, { k: 'move', x: 3, y: GRID_H - 2 }).ok).toBe(true);
    expect(d.sides[0].team[0]!.hp).toBeLessThan(hp);
    expect(d.sides[1].traps).toHaveLength(0);
  });

  it('só enxerga o adversário como alvo, nunca a si mesmo', () => {
    const d = duel();
    expect(duelTargets(d, 0)).toEqual([]);
    d.sides[1].pos = { x: 3, y: GRID_H - 2 };
    expect(duelTargets(d, 0).map(key)).toContain(key({ x: 3, y: GRID_H - 2 }));
    expect(duelTargets(d, 1)).toEqual([]);
    expect(duelView(d, 0).enemies).toHaveLength(1);
  });
});

describe('fim do duelo', () => {
  it('vence quem derruba o último Pokémon do adversário', () => {
    const d = duel(0, ['a'], ['x']);
    d.sides[1].pos = { x: 3, y: GRID_H - 2 };
    d.sides[1].team[0]!.hp = 1;
    expect(applyAction(d, 0, { k: 'attack', x: 3, y: GRID_H - 2 }).ok).toBe(true);
    expect(d.phase).toBe('over');
    expect(d.winner).toBe(0);
    expect(d.reason).toBe('down');
    expect(applyAction(d, 0, { k: 'end' }).ok).toBe(false);
  });

  it('com o ativo caído, o próximo pronto assume sozinho e o duelo continua', () => {
    const d = duel(0, ['a'], ['x', 'y']);
    d.sides[1].pos = { x: 3, y: GRID_H - 2 };
    d.sides[1].team[0]!.hp = 1;
    expect(applyAction(d, 0, { k: 'attack', x: 3, y: GRID_H - 2 }).ok).toBe(true);
    expect(d.phase).toBe('duel');
    expect(d.sides[1].team[0]!.status).toBe('down');
    expect(d.sides[1].active).toBe(1);
  });

  it('desistir e sair dão a vitória ao outro; divergência encerra sem vencedor', () => {
    const a = duel();
    concede(a, 0, 'forfeit');
    expect([a.phase, a.winner, a.reason]).toEqual(['over', 1, 'forfeit']);
    const b = duel();
    concede(b, 1, 'left');
    expect([b.winner, b.reason]).toEqual([0, 'left']);
    const c = duel();
    concede(c, 0, 'desync');
    expect([c.winner, c.reason]).toEqual([null, 'desync']);
    concede(c, 1, 'forfeit');
    expect(c.reason).toBe('desync');
  });

  it('empate quando as duas equipes caem ao mesmo tempo', () => {
    const d = duel(0, ['a'], ['x']);
    d.sides[0].team[0]!.hp = 0;
    d.sides[1].team[0]!.hp = 0;
    checkOver(d);
    expect([d.winner, d.reason]).toEqual([null, 'draw']);
  });

  it('no limite de rodadas vence quem tem mais vida (ou empata)', () => {
    const d = duel(0, ['a'], ['x']);
    d.round = DUEL_MAX_ROUNDS;
    d.turn = other(d.first);
    d.sides[1].team[0]!.hp -= 20;
    expect(endDuelTurn(d).ok).toBe(true);
    expect(d.phase).toBe('over');
    expect(d.reason).toBe('rounds');
    expect(d.winner).toBe(0);

    const tie = duel(0, ['a'], ['x']);
    tie.round = DUEL_MAX_ROUNDS;
    tie.turn = other(tie.first);
    endDuelTurn(tie);
    expect([tie.winner, tie.reason]).toEqual([null, 'draw']);
  });
});

/** Uma jogada simples: troca se precisa, ataca se pode, aproxima do adversário, senão encerra. */
function nextAction(d: DuelState, side: Side): DuelAction {
  const me = d.sides[side];
  if (me.mustSwitch) {
    const i = me.team.findIndex((m, k) => k !== me.active && m.hp > 0 && m.status === 'ready');
    if (i >= 0) return { k: 'switch', i };
  }
  for (const t of duelTargets(d, side)) if (!duelPreview(d, side, t).reason) return { k: 'attack', x: t.x, y: t.y };
  const foe = d.sides[other(side)].pos;
  let best: Cell | null = null;
  let bestDist = Math.abs(me.pos.x - foe.x) + Math.abs(me.pos.y - foe.y);
  for (const k of duelReachable(d, side).keys()) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    const dist = Math.abs(x - foe.x) + Math.abs(y - foe.y);
    if (dist < bestDist) { bestDist = dist; best = { x, y }; }
  }
  return best ? { k: 'move', x: best.x, y: best.y } : { k: 'end' };
}

describe('dois celulares, o mesmo duelo', () => {
  it('aplicando as mesmas jogadas, o resumo do estado bate a cada passo até o fim', () => {
    for (const seed of [0, 16, 5, 1234567]) {
      const host = duel(seed, ['a', 'b', 'c'], ['x', 'y']);
      const guest = duel(seed, ['a', 'b', 'c'], ['x', 'y']);
      host.walls = guest.walls = duelWalls(seed);
      expect(duelDigest(host)).toBe(duelDigest(guest));
      let steps = 0;
      while (host.phase === 'duel' && steps++ < 3000) {
        const side = host.turn;
        const act = nextAction(host, side);
        const mine = applyAction(host, side, act);
        expect(mine.ok, JSON.stringify(act)).toBe(true);
        const theirs = applyAction(guest, side, act);
        expect(theirs.ok, JSON.stringify(act)).toBe(true);
        expect(duelDigest(guest)).toBe(duelDigest(host));
      }
      expect(host.phase).toBe('over');
      expect(guest.phase).toBe('over');
      expect(guest.winner).toBe(host.winner);
    }
  });

  it('o resumo muda quando os jogos divergem', () => {
    const a = duel(0);
    const b = duel(0);
    b.sides[1].team[0]!.hp -= 1;
    expect(duelDigest(a)).not.toBe(duelDigest(b));
  });
});
