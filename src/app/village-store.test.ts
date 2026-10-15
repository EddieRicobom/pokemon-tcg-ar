import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyVillage, friendOf } from '../core/village/life';
import { MAX_DIARY } from '../core/village/social-state';
import type { Moment } from '../core/village/social-state';
import { loadVillage, requestPersistence, resetBackupClock, saveVillage, VILLAGE_BACKUP_KEY, VILLAGE_KEY, VILLAGE_SEED, villageMap } from './village-store';

const fresh = () => emptyVillage(VILLAGE_SEED, villageMap().spawn);
const moment = (i: number, fav = false): Moment => ({
  id: `m${i}`, t: 1000 + i, day: '2026-10-14', hour: 14, tpl: 'solo-espelho', kind: 'solo', title: 'Teste', emoji: '🪞',
  cast: [{ id: 'a', name: 'Ana' }], lines: [{ who: 0, text: 'Oi' }], result: [], ...(fav ? { fav: true } : {}),
});

beforeEach(() => {
  localStorage.clear();
  resetBackupClock();
});

describe('salvamento da Vila (tudo precisa persistir entre sessões)', () => {
  it('sem nada salvo, abre uma Vila nova', () => {
    const v = loadVillage();
    expect(v.coins).toBeGreaterThanOrEqual(0);
    expect(v.diary).toEqual([]);
  });

  it('o que foi salvo volta igual: moedas, amizades, Diário, Álbum e posição', () => {
    const s = fresh();
    s.coins = 777;
    friendOf(s, 'a').points = 55;
    s.diary.push(moment(1), moment(2, true));
    s.seen.push('solo-espelho', 'data-natal');
    s.rel['a|b'] = { bond: 40, spark: 20, flag: 'casal', since: '2026-10-14', met: 3 };
    s.lastSeen = 123456;
    s.diaryRead = 99;
    s.player.x = 7;
    s.player.y = 9;
    expect(saveVillage(s)).toBe(true);
    const back = loadVillage();
    expect(back.coins).toBe(777);
    expect(friendOf(back, 'a').points).toBe(55);
    expect(back.diary.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(back.diary[1]?.fav).toBe(true);
    expect(back.seen).toEqual(['solo-espelho', 'data-natal']);
    expect(back.rel['a|b']).toMatchObject({ bond: 40, flag: 'casal', met: 3 });
    expect(back.lastSeen).toBe(123456);
    expect(back.diaryRead).toBe(99);
    expect(back.player).toMatchObject({ x: 7, y: 9 });
  });

  it('se o salvamento principal estiver corrompido, volta da cópia de segurança', () => {
    const s = fresh();
    s.coins = 321;
    expect(saveVillage(s, 1_000_000)).toBe(true);
    // O segundo salvamento (depois de 5 min) guarda o primeiro como cópia.
    s.coins = 400;
    expect(saveVillage(s, 1_000_000 + 6 * 60_000)).toBe(true);
    expect(localStorage.getItem(VILLAGE_BACKUP_KEY)).toContain('321');
    localStorage.setItem(VILLAGE_KEY, '{isso não é json');
    expect(loadVillage().coins).toBe(321);
  });

  it('a cópia de segurança só é refeita a cada 5 minutos e nunca a partir de um salvamento ilegível', () => {
    const s = fresh();
    const t0 = 5_000_000;
    s.coins = 1;
    saveVillage(s, t0);
    s.coins = 2;
    saveVillage(s, t0 + 60_000);
    expect(localStorage.getItem(VILLAGE_BACKUP_KEY)).toContain('"coins":1');
    s.coins = 3;
    saveVillage(s, t0 + 2 * 60_000);
    expect(localStorage.getItem(VILLAGE_BACKUP_KEY)).toContain('"coins":1');
    localStorage.setItem(VILLAGE_KEY, 'lixo');
    s.coins = 4;
    saveVillage(s, t0 + 10 * 60_000);
    expect(localStorage.getItem(VILLAGE_BACKUP_KEY)).toContain('"coins":1');
    expect(loadVillage().coins).toBe(4);
  });

  it('se o aparelho recusar a gravação (sem espaço, modo privado), avisa com false e não quebra', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('cheio', 'QuotaExceededError');
    });
    try {
      expect(saveVillage(fresh())).toBe(false);
    } finally {
      spy.mockRestore();
    }
    expect(saveVillage(fresh())).toBe(true);
  });

  it('um salvamento antigo com Diário gigante é cortado ao abrir, mas o que está guardado no Álbum fica', () => {
    const s = fresh();
    const big: Moment[] = [];
    for (let i = 0; i < 300; i++) big.push(moment(i, i % 100 === 0));
    localStorage.setItem(VILLAGE_KEY, JSON.stringify({ ...s, diary: big }));
    const back = loadVillage();
    expect(back.diary.filter((m) => !m.fav)).toHaveLength(MAX_DIARY);
    expect(back.diary.filter((m) => m.fav).map((m) => m.id)).toEqual(['m0', 'm100', 'm200']);
  });

  it('pedir armazenamento persistente nunca quebra, mesmo sem suporte do navegador', async () => {
    await expect(requestPersistence()).resolves.toBeTypeOf('boolean');
  });
});
