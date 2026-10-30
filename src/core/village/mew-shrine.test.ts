import { describe, expect, it } from 'vitest';
import { seededRng } from '../battle';
import { emptyVillage } from './life';
import { behindMewStatue, MEDITATION_VARIANTS, MEW_BLESSING, MEW_SHRINE, MOUNTAIN_REMARKS, MOUNTAIN_TALK_LINES, STATUE_REMARKS, meditationMessage } from './mew-shrine';
import { MEW_STATUE } from './mountain';
import { MIRAGEM_MOMENTS } from './moments/miragem';
import { PERSONALITIES } from './personality';
import { makeEnv, pickMoment, TEMPLATE_BY_ID } from './social';
import type { Actor } from './social';

/** Nada pode prometer ou insinuar efeito de jogo. */
const BONUS_WORDS = /b[ôo]nus|ganhou|ganha |\+|\bxp\b|moeda|chance|pr[êe]mio|recompensa|sorteio|amizade/i;

const days = (n: number): string[] => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10));

describe('Estátua do Mew: meditação', () => {
  it('tem os nomes do lugar e da ação', () => {
    expect(MEW_SHRINE).toEqual({ mountain: 'Monte Miragem', statue: 'Estátua do Mew', action: 'Meditar' });
  });

  it('revela uma única bênção ao esperar atrás da estátua', () => {
    expect(MEW_BLESSING).toEqual({ waitMs: 10_000, xp: 10_000, coins: 10_000 });
    expect(behindMewStatue({ x: MEW_STATUE.x, y: MEW_STATUE.y - 1 })).toBe(true);
    expect(behindMewStatue({ x: MEW_STATUE.x + 1, y: MEW_STATUE.y - 1 })).toBe(true);
    expect(behindMewStatue({ x: MEW_STATUE.x, y: MEW_STATUE.y + 1 })).toBe(false);
  });

  it('é a mesma o dia inteiro e muda com o sal', () => {
    expect(meditationMessage('2026-10-28')).toEqual(meditationMessage('2026-10-28'));
    expect(meditationMessage('2026-10-28', 1)).toEqual(meditationMessage('2026-10-28', 1));
    const salted = new Set([0, 1, 2, 3, 4].map((s) => meditationMessage('2026-10-28', s).lines.join('|')));
    expect(salted.size).toBeGreaterThan(1);
  });

  it('varia de um dia para o outro e tem muitas combinações', () => {
    expect(MEDITATION_VARIANTS).toBeGreaterThanOrEqual(216);
    const seen = new Set(days(30).map((d) => meditationMessage(d).lines.join('|')));
    expect(seen.size).toBeGreaterThanOrEqual(10);
  });

  it('tem título curto, 2 a 3 linhas curtas e nenhuma palavra de bônus', () => {
    for (const d of days(120)) {
      for (const salt of [0, 1]) {
        const m = meditationMessage(d, salt);
        expect(m.title.length).toBeLessThanOrEqual(45);
        expect(m.title).not.toMatch(BONUS_WORDS);
        expect(m.lines.length).toBeGreaterThanOrEqual(2);
        expect(m.lines.length).toBeLessThanOrEqual(3);
        for (const line of m.lines) {
          expect(line.length).toBeLessThanOrEqual(100);
          expect(line).not.toMatch(BONUS_WORDS);
          expect(line).toMatch(/[ãáâéêíóôõúç]|\b(o|a|de|que|do|da)\b/i);
        }
      }
    }
  });
});

describe('Monte Miragem: falas', () => {
  it('as frases do monte e da estátua são curtas, únicas e sem efeito de jogo', () => {
    expect(MOUNTAIN_REMARKS.length).toBeGreaterThanOrEqual(10);
    expect(MOUNTAIN_REMARKS.length).toBeLessThanOrEqual(16);
    expect(STATUE_REMARKS.length).toBeGreaterThanOrEqual(6);
    expect(STATUE_REMARKS.length).toBeLessThanOrEqual(10);
    const all = [...MOUNTAIN_REMARKS, ...STATUE_REMARKS];
    expect(new Set(all).size).toBe(all.length);
    for (const line of all) {
      expect(line.length).toBeLessThanOrEqual(70);
      expect(line).not.toMatch(/\n/);
      expect(line).not.toMatch(BONUS_WORDS);
    }
  });

  it('tem uma fala de conversa para cada jeito, sem efeito de jogo', () => {
    for (const p of PERSONALITIES) {
      const line = MOUNTAIN_TALK_LINES[p.name];
      expect(line, p.name).toBeTruthy();
      expect(line).not.toMatch(BONUS_WORDS);
    }
  });

  it('os momentos do monte não dão itens, moedas nem amizade com você, e as falas não prometem nada', () => {
    expect(MIRAGEM_MOMENTS.length).toBeGreaterThanOrEqual(10);
    for (const t of MIRAGEM_MOMENTS) {
      expect(TEMPLATE_BY_ID.get(t.id), t.id).toBe(t);
      const o = typeof t.outcome === 'function' ? null : t.outcome;
      expect(o, t.id).not.toBeNull();
      expect(o!.coins, t.id).toBeUndefined();
      expect(o!.items, t.id).toBeUndefined();
      expect(o!.friend, t.id).toBeUndefined();
      expect(o!.friendBy, t.id).toBeUndefined();
      expect(t.choice, t.id).toBeUndefined();
      for (const who of [0, 1]) {
        const after = t.after?.(['Ana', 'Beto', 'Caio'], who);
        if (after) expect(after, t.id).not.toMatch(BONUS_WORDS);
      }
    }
  });

  it('o Pokémon reage ao monte do jeito do seu tipo', () => {
    const tpl = TEMPLATE_BY_ID.get('mir-do-seu-jeito')!;
    const s = emptyVillage(1, { x: 1, y: 1 });
    const env = makeEnv(s, '2026-10-14', 14, null);
    const textFor = (types: Actor['types']) => {
      const ctx = { n: ['X'], p: ['Calmo'], types: [types], rel: undefined, rel02: undefined, rel12: undefined, env, seen: new Set<string>(), rng: seededRng(1), memo: {}, pts: () => 0, has: () => false, rolling: false, ids: ['x'], date: { y: 2026, m: 10, d: 14, dow: 3 } } as Parameters<typeof tpl.lines>[0];
      return tpl.lines(ctx).map((l) => l.text).join(' ');
    };
    const texts = new Set((['fire', 'water', 'grass', 'ghost', 'psychic', 'normal'] as const).map((t) => textFor([t])));
    expect(texts.size).toBe(6);
  });

  it('não dominam o sorteio dos momentos (entre 1% e 10%)', () => {
    const cast: Actor[] = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, name: `Mon${i}`, types: [(['water', 'fire', 'grass', 'ghost'] as const)[i % 4]!] }));
    const s = emptyVillage(20261014, { x: 1, y: 1 });
    const ids = new Set(MIRAGEM_MOMENTS.map((t) => t.id));
    let total = 0;
    let mountain = 0;
    for (const hour of [6, 10, 14, 18, 22]) {
      for (const weather of [null, 'chuva']) {
        const env = makeEnv(s, '2026-10-14', hour, weather);
        for (let seed = 1; seed <= 200; seed++) {
          const sc = pickMoment(cast, s, env, seededRng(seed * 7 + hour));
          if (!sc) continue;
          total++;
          if (ids.has(sc.tpl.id)) mountain++;
        }
      }
    }
    const share = mountain / total;
    expect(share).toBeGreaterThan(0.01);
    expect(share).toBeLessThan(0.1);
  }, 30_000);
});
