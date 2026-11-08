import { describe, expect, it } from 'vitest';
import { ArenaDirector, arenaResultText, CINEMA_MAX_STOP_MS, CINEMA_STOP_GAP_MS, shotEnvelope, speedLineWedges } from './arena-cinema';
import type { ArenaEvent } from './survivor-pvp';

const alive = (a: number, b: number) => (side: 0 | 1): number => (side === 0 ? a : b);
const superHit: ArenaEvent = { k: 'hit', side: 1, damage: 30, mult: 2 };

describe('direção de cena da luta', () => {
  it('o golpe comum não congela a imagem nem mexe na câmera', () => {
    const d = new ArenaDirector();
    expect(d.take([{ k: 'hit', side: 1, damage: 9, mult: 1 }], alive(3, 3), 1000)).toEqual([]);
    expect(d.frozen(1001)).toBe(false);
    expect(d.camera(1001)).toBeNull();
  });

  it('o congelamento é curto e acaba sozinho', () => {
    const d = new ArenaDirector();
    d.take([{ k: 'faint', side: 1, index: 0 }], alive(3, 0), 1000);
    expect(d.frozen(1000 + CINEMA_MAX_STOP_MS - 1)).toBe(true);
    expect(d.frozen(1000 + CINEMA_MAX_STOP_MS)).toBe(false);
  });

  it('rajadas super efetivas não viram engasgo', () => {
    const d = new ArenaDirector();
    d.take([superHit], alive(3, 3), 1000);
    d.take([superHit], alive(3, 3), 1100);
    expect(d.frozen(1000 + 56)).toBe(false);
    d.take([superHit], alive(3, 3), 1000 + CINEMA_STOP_GAP_MS);
    expect(d.frozen(1000 + CINEMA_STOP_GAP_MS + 10)).toBe(true);
  });

  it('o nocaute anuncia, aproxima a câmera no caído e avisa o último Pokémon uma vez só', () => {
    const d = new ArenaDirector();
    const beats = d.take([{ k: 'faint', side: 0, index: 2 }], alive(1, 3), 500);
    expect(beats.map((b) => b.kind)).toEqual(['ko', 'last-stand']);
    expect(d.camera(650)?.side).toBe(0);
    expect(d.camera(650)!.scale).toBeGreaterThan(1.1);
    expect(d.take([{ k: 'faint', side: 0, index: 1 }], alive(1, 3), 9000).map((b) => b.kind)).toEqual(['ko']);
  });

  it('o nocaute final é o plano mais forte e não vira aviso de último Pokémon', () => {
    const d = new ArenaDirector();
    const [beat, ...rest] = d.take([{ k: 'faint', side: 1, index: 0 }], alive(2, 0), 0);
    expect(beat?.final).toBe(true);
    expect(rest).toEqual([]);
    expect(d.camera(200)!.scale).toBeGreaterThan(1.25);
  });

  it('o Especial pede cut-in e um feixe não interrompe um plano mais forte', () => {
    const d = new ArenaDirector();
    expect(d.take([{ k: 'special', side: 1, index: 4, shape: 'beam' }], alive(3, 3), 0)).toEqual([{ kind: 'cut-in', side: 1, index: 4 }]);
    d.take([{ k: 'faint', side: 0, index: 0 }], alive(2, 3), 50);
    d.take([{ k: 'beam', side: 1, x0: 0, y0: 0, x1: 1, y1: 1, width: 20, leftMs: 0 }], alive(2, 3), 120);
    expect(d.camera(200)!.side).toBe(0);
  });

  it('a câmera sobe, segura e volta a zero', () => {
    expect(shotEnvelope(0)).toBe(0);
    expect(shotEnvelope(0.4)).toBe(1);
    expect(shotEnvelope(1)).toBe(0);
    expect(shotEnvelope(0.9)).toBeLessThan(shotEnvelope(0.7));
  });

  it('as linhas de velocidade são iguais a cada quadro', () => {
    expect(speedLineWedges(12, 3)).toEqual(speedLineWedges(12, 3));
    expect(speedLineWedges(12, 3)).toHaveLength(12);
  });
});

describe('texto do fim da luta', () => {
  it('não diz que a equipe caiu quando o tempo decidiu', () => {
    expect(arenaResultText(0, 0, 'Beto', 3, 0).detail).toContain('sem Pokémon de pé');
    expect(arenaResultText(0, 0, 'Beto', 3, 1).detail).toContain('O tempo acabou');
    expect(arenaResultText(1, 0, 'Beto', 2, 3).detail).toContain('O tempo acabou');
    expect(arenaResultText('draw', 0, 'Beto', 1, 1).detail).toContain('O tempo acabou');
    expect(arenaResultText('draw', 0, 'Beto', 0, 0).detail).toContain('caíram');
  });
});
