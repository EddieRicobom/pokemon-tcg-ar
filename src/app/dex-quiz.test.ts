import { describe, expect, it } from 'vitest';
import { seededRng } from '../core/battle';
import { dexPieces } from '../core/dex';
import { prepareDexRound } from './dex-quiz';

const names = new Map<number, string>(Array.from({ length: 60 }, (_, i) => [i + 1, `Mon ${i + 1}`]));
const pool = dexPieces([...names.keys()], names);
const sprite = (id: number) => ({ kind: 'gif' as const, url: `u${id}`, blob: new Blob([String(id)]) });

describe('rodada sorteada', () => {
  it('baixa só a imagem dos sorteados e entrega 5 perguntas', async () => {
    const asked: number[] = [];
    const revoked: string[] = [];
    const round = await prepareDexRound(pool, seededRng(4), async (id) => (asked.push(id), sprite(id)), () => `blob:${Math.random()}`, (u) => revoked.push(u));
    expect(round.questions).toHaveLength(5);
    expect(asked.length).toBeLessThanOrEqual(8);
    expect(round.urls.size).toBe(5);
    round.release();
    expect(revoked).toHaveLength(5);
  });

  it('troca Pokémon sem imagem por reservas', async () => {
    const round = await prepareDexRound(pool, seededRng(4), async (id) => (id % 2 === 0 ? null : sprite(id)), () => `blob:${Math.random()}`, () => {});
    expect(round.questions.length).toBeGreaterThanOrEqual(3);
    for (const q of round.questions) expect(round.urls.has(q.piece.id)).toBe(true);
  });

  it('falha com mensagem clara quando quase nada baixa', async () => {
    await expect(prepareDexRound(pool, seededRng(4), async () => { throw new Error('rede'); })).rejects.toThrow('imagens');
  });
});
