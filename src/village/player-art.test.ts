import { describe, expect, it } from 'vitest';
import { PLAYER_SPRITES } from '../core/trainer-sprites';
import { LOOK_IDS, outfitFor, paintPlayer } from './player-art';
import type { Outfit } from './player-art';
import type { PixelBuf } from '../box/ground-art';

const solid = (b: PixelBuf) => {
  let n = 0;
  for (let i = 3; i < b.data.length; i += 4) if (b.data[i]! > 0) n++;
  return n;
};

describe('o personagem acompanha o treinador escolhido no perfil', () => {
  it('cada um dos treinadores do perfil tem um visual feito à mão', () => {
    const sem = PLAYER_SPRITES.filter((s) => !LOOK_IDS.includes(s.id)).map((s) => s.id);
    expect(sem, `treinadores sem visual: ${sem.join(', ')}`).toEqual([]);
  });

  it('os visuais são diferentes entre si (cor, cabelo, chapéu ou roupa)', () => {
    const seen = new Map<string, string>();
    const dup: string[] = [];
    for (const s of PLAYER_SPRITES) {
      const key = JSON.stringify(outfitFor(s.id));
      const prev = seen.get(key);
      if (prev) dup.push(`${prev}=${s.id}`);
      seen.set(key, s.id);
    }
    expect(dup).toEqual([]);
    // A figura desenhada também muda, não só os dados.
    const frames = new Set(PLAYER_SPRITES.map((s) => paintPlayer('down', -1, outfitFor(s.id)).data.join()));
    expect(frames.size).toBe(PLAYER_SPRITES.length);
  });

  it('desenha corpo inteiro nas quatro direções e em todos os passos, para todos os treinadores', () => {
    for (const s of PLAYER_SPRITES) {
      const o = outfitFor(s.id);
      for (const d of ['down', 'up', 'left', 'right'] as const) {
        for (const step of [-1, 0, 1, 2, 3]) {
          const b = paintPlayer(d, step, o);
          expect(b.w).toBe(16);
          expect(b.h).toBe(24);
          expect(solid(b), `${s.id} ${d} ${step}`).toBeGreaterThan(100);
        }
      }
    }
  });

  it('um treinador desconhecido ganha um visual estável (o mesmo sempre) em vez de um quadrado vazio', () => {
    const a = outfitFor('treinador-que-nao-existe');
    expect(outfitFor('treinador-que-nao-existe')).toEqual(a);
    expect(solid(paintPlayer('down', 0, a))).toBeGreaterThan(100);
    expect(JSON.stringify(outfitFor('outro-desconhecido'))).not.toBe(JSON.stringify(a));
  });

  it('chapéu, óculos, lenço e mochila aparecem de verdade no desenho', () => {
    const base: Outfit = { ...outfitFor('red'), gear: 'none', glasses: false, scarf: null, bag: false };
    const plain = paintPlayer('down', -1, base).data.join();
    expect(paintPlayer('down', -1, { ...base, gear: 'cap', cap: 0xc84848 }).data.join()).not.toBe(plain);
    expect(paintPlayer('down', -1, { ...base, glasses: true }).data.join()).not.toBe(plain);
    expect(paintPlayer('down', -1, { ...base, scarf: 0xe8e8f8 }).data.join()).not.toBe(plain);
    expect(paintPlayer('up', -1, { ...base, bag: true, accent: 0xd8a828 }).data.join()).not.toBe(paintPlayer('up', -1, base).data.join());
  });

  it('o lado esquerdo é o espelho do direito', () => {
    const o = outfitFor('dawn');
    const r = paintPlayer('right', 0, o);
    const l = paintPlayer('left', 0, o);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const i = (y * r.w + x) * 4;
      const j = (y * l.w + (l.w - 1 - x)) * 4;
      expect([l.data[j], l.data[j + 1], l.data[j + 2], l.data[j + 3]]).toEqual([r.data[i], r.data[i + 1], r.data[i + 2], r.data[i + 3]]);
    }
  });
});
