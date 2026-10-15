import { describe, expect, it } from 'vitest';
import { SOLO_EMOTIONS, SocialDirector, allEmojis } from './social';
import type { SocialActor } from './social';
import { createWander, stepWander } from './wander';

function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function crowd(n: number, half: number, rng: () => number): SocialActor[] {
  return Array.from({ length: n }, () => ({ state: createWander(half, rng), fx: { facing: null as { x: number; z: number } | null } }));
}

interface Log {
  bubbles: { t: number; i: number; emoji: string; ms: number }[];
  hops: number;
  kinds: Set<string>;
  maxBusy: number;
}

function simulate(n: number, seconds: number, seed: number, half = 1.2): { log: Log; actors: SocialActor[]; director: SocialDirector } {
  const rng = seeded(seed);
  const actors = crowd(n, half, rng);
  const director = new SocialDirector(rng);
  const log: Log = { bubbles: [], hops: 0, kinds: new Set(), maxBusy: 0 };
  let t = 0;
  for (; t < seconds * 1000; t += 50) {
    director.update(50, actors, half, { bubble: (i, emoji, ms) => log.bubbles.push({ t, i, emoji, ms }), hop: () => log.hops++ });
    actors.forEach((a, i) => {
      if (!director.isBusy(i)) stepWander(a.state, 50, half, rng);
    });
    for (const e of director.active) log.kinds.add(e.kind);
    log.maxBusy = Math.max(log.maxBusy, director.active.length * 2);
    // Invariantes a cada quadro.
    const ids = director.active.flatMap((e) => [e.a, e.b]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of actors) {
      expect(Math.abs(a.state.x)).toBeLessThanOrEqual(half * 0.9 + 1e-6);
      expect(Math.abs(a.state.z)).toBeLessThanOrEqual(half * 0.9 + 1e-6);
      expect(Number.isFinite(a.state.x + a.state.z)).toBe(true);
    }
  }
  return { log, actors, director };
}

describe('vida social da Caixa', () => {
  it('em alguns minutos acontecem os quatro tipos de encontro e várias emoções', () => {
    const kinds = new Set<string>();
    const emojis = new Set<string>();
    for (const seed of [1, 2, 3]) {
      const { log } = simulate(6, 240, seed);
      log.kinds.forEach((k) => kinds.add(k));
      log.bubbles.forEach((b) => emojis.add(b.emoji));
    }
    expect([...kinds].sort()).toEqual(['chase', 'dance', 'duel', 'greet']);
    expect(emojis.size).toBeGreaterThanOrEqual(10);
  });

  it('só usa emojis conhecidos, com duração positiva, e não enche a tela de balões', () => {
    const known = new Set(allEmojis());
    const { log } = simulate(8, 180, 5);
    for (const b of log.bubbles) {
      expect(known.has(b.emoji)).toBe(true);
      expect(b.ms).toBeGreaterThan(500);
      expect(b.ms).toBeLessThan(6000);
    }
    // "De vez em quando": em média bem menos de um balão novo por segundo na caixa inteira.
    expect(log.bubbles.length / 180).toBeLessThan(1.2);
    expect(log.bubbles.length).toBeGreaterThan(10);
    expect(log.hops).toBeGreaterThan(0);
  });

  it('acontece sem tumulto: nunca mais de metade da caixa ocupada num encontro de uma vez', () => {
    const { log } = simulate(10, 300, 9);
    expect(log.maxBusy).toBeLessThanOrEqual(10);
  });

  it('com um só Pokémon só há emoções sozinho (nada de encontro)', () => {
    const { log } = simulate(1, 120, 3);
    expect(log.kinds.size).toBe(0);
    expect(log.bubbles.length).toBeGreaterThan(3);
  });

  it('sem Pokémon não faz nada', () => {
    const d = new SocialDirector(seeded());
    d.update(100, [], 1.2, { bubble: () => { throw new Error('não deveria'); }, hop: () => undefined });
    expect(d.active).toEqual([]);
  });

  it('todo encontro termina: ninguém fica preso olhando para o outro, e o passeio volta', () => {
    const half = 1.2;
    const rng = seeded(4);
    const actors = crowd(4, half, rng);
    const d = new SocialDirector(rng, 1);
    const hooks = { bubble: () => undefined, hop: () => undefined };
    let sawBusy = false;
    for (let t = 0; t < 120_000; t += 50) {
      d.update(50, actors, half, hooks);
      if (d.active.length) sawBusy = true;
      actors.forEach((a, i) => {
        if (!d.isBusy(i)) stepWander(a.state, 50, half, rng);
      });
    }
    expect(sawBusy).toBe(true);
    // Para de iniciar coisas novas e deixa os encontros terminarem.
    (d as unknown as { nextMs: number }).nextMs = 1e9;
    for (let t = 0; t < 30_000; t += 50) d.update(50, actors, half, hooks);
    expect(d.active).toEqual([]);
    for (const a of actors) expect(a.fx.facing).toBeNull();
  });

  it('reset solta todos e limpa o olhar', () => {
    const rng = seeded(8);
    const actors = crowd(3, 1.2, rng);
    const d = new SocialDirector(rng, 1);
    for (let t = 0; t < 20_000 && d.active.length === 0; t += 50) d.update(50, actors, 1.2, { bubble: () => undefined, hop: () => undefined });
    expect(d.active.length).toBeGreaterThan(0);
    d.reset(actors);
    expect(d.active).toEqual([]);
    for (const a of actors) expect(a.fx.facing).toBeNull();
  });

  it('a lista de emoções tem pesos positivos e o conjunto de emojis inclui as emoções sozinhas', () => {
    for (const e of SOLO_EMOTIONS) expect(e.weight).toBeGreaterThan(0);
    const all = allEmojis();
    for (const e of SOLO_EMOTIONS) expect(all).toContain(e.emoji);
    expect(all.length).toBeLessThan(40);
  });
});
