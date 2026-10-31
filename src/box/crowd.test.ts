import { describe, expect, it } from 'vitest';
import { CrowdDirector, crowdSway, MAX_SPECTATORS, seatLayout } from './crowd';

function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function record() {
  const bubbles: { i: number; emoji: string }[] = [];
  const hops: number[] = [];
  return { bubbles, hops, hooks: { bubble: (i: number, emoji: string) => bubbles.push({ i, emoji }), hop: (i: number) => hops.push(i) } };
}

describe('assentos da torcida', () => {
  it('ficam no fundo, sem passar do limite, com os dois lados equilibrados', () => {
    expect(seatLayout(0)).toEqual([]);
    expect(seatLayout(40)).toHaveLength(MAX_SPECTATORS);
    const seats = seatLayout(10);
    for (const s of seats) {
      expect(Math.abs(s.angle - Math.PI)).toBeLessThan(0.7);
      expect(s.row).toBeGreaterThanOrEqual(0);
      expect(s.row).toBeLessThanOrEqual(0.5);
    }
    const red = seats.filter((s) => s.team === 0).length;
    expect(Math.abs(red - (seats.length - red))).toBeLessThanOrEqual(1);
    expect(new Set(seats.map((s) => `${s.angle},${s.row}`)).size).toBe(seats.length);
  });

  it('o lado vermelho é o da esquerda da tela (x negativo), como a pintura da arquibancada', () => {
    for (const s of seatLayout(MAX_SPECTATORS)) expect(Math.sin(s.angle) < 0).toBe(s.team === 0);
  });
});

describe('reações da torcida', () => {
  it('nocaute: quem torce para o lado que derrubou comemora e pula; o outro lado lamenta sem pular', () => {
    const seats = seatLayout(12);
    const crowd = new CrowdDirector(seats, () => 0);
    const r = record();
    crowd.event({ kind: 'ko', team: 0 });
    crowd.update(1000, r.hooks);
    const happy = ['🎉', '🙌', '💥', '🔥'];
    for (const b of r.bubbles.filter((b) => seats[b.i]?.team === 0)) expect(happy).toContain(b.emoji);
    for (const b of r.bubbles.filter((b) => seats[b.i]?.team === 1)) expect(['😭', '😱', '💔']).toContain(b.emoji);
    expect(r.hops.every((i) => seats[i]?.team === 0)).toBe(true);
    expect(r.hops.length).toBeGreaterThan(0);
  });

  it('vitória vira ola: os vencedores pulam um depois do outro, da esquerda para a direita, e pulam de novo', () => {
    const seats = seatLayout(12);
    const crowd = new CrowdDirector(seats, () => 0);
    const r = record();
    crowd.event({ kind: 'win', team: 1 });
    crowd.update(16, r.hooks);
    const first = r.hops.length;
    expect(first).toBeLessThan(seats.length);
    for (let t = 0; t < 200; t++) crowd.update(16, r.hooks);
    const winners = seats.filter((s) => s.team === 1).length;
    expect(r.hops.filter((i) => seats[i]?.team === 1).length).toBeGreaterThanOrEqual(winners * 2);
    expect(crowd.pending).toBe(0);
  });

  it('em todos contra todos ninguém lamenta; a empolgação sobe com o lance e desce sozinha', () => {
    const seats = seatLayout(6);
    const crowd = new CrowdDirector(seats, seeded(3));
    const r = record();
    const before = crowd.excitement(0);
    crowd.event({ kind: 'win', team: null });
    expect(crowd.excitement(0)).toBeGreaterThan(before);
    crowd.update(3000, r.hooks);
    expect(r.bubbles.some((b) => ['😭', '💔', '😱'].includes(b.emoji))).toBe(false);
    for (let t = 0; t < 100; t++) crowd.update(100, record().hooks);
    expect(crowd.excitement(0)).toBeLessThan(0.3);
  });

  it('sem lances, alguém puxa coro de vez em quando', () => {
    const crowd = new CrowdDirector(seatLayout(8), seeded(7));
    const r = record();
    for (let t = 0; t < 600; t++) crowd.update(16, r.hooks);
    expect(r.bubbles.length).toBeGreaterThanOrEqual(3);
  });

  it('sem torcedores não faz nada; o balanço cresce com a empolgação', () => {
    const r = record();
    new CrowdDirector([], seeded()).update(5000, r.hooks);
    expect(r.bubbles).toHaveLength(0);
    const calm = Math.max(...Array.from({ length: 50 }, (_, t) => Math.abs(crowdSway(0, t * 37, 0))));
    const wild = Math.max(...Array.from({ length: 50 }, (_, t) => Math.abs(crowdSway(0, t * 37, 1))));
    expect(wild).toBeGreaterThan(calm * 2);
  });
});
