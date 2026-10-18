import { describe, expect, it } from 'vitest';
import { dailyRecap, needsDailyRecap } from './daily-recap';
import { emptyVillage, normalizeVillage } from './life';
import { celebiDiaryPage } from './legendary';

describe('abertura diária', () => {
  it('abre uma vez por data local, inclusive após trocar o mês', () => {
    expect(needsDailyRecap('', '2026-10-18')).toBe(true);
    expect(needsDailyRecap('2026-10-18', '2026-10-18')).toBe(false);
    expect(needsDailyRecap('2026-10-31', '2026-11-01')).toBe(true);
  });
  it('conta apenas registros posteriores à última abertura e até agora', () => {
    const state = emptyVillage(1, { x: 0, y: 0 });
    state.diary = [100, 200, 300, 400, 500].map((t) => celebiDiaryPage(t, '2026-10-18', 12));
    const recap = dailyRecap(state, 100, 400);
    expect(recap).toHaveLength(5);
    expect(recap[1]?.text).toContain(state.diary[1]!.lines[0]!.text);
    expect(recap[1]?.cast).toEqual(['Celebi']);
    expect(dailyRecap(state, 400, 400)).toHaveLength(2);
  });
  it('sem novidades, não inventa acontecimentos', () => {
    expect(dailyRecap(emptyVillage(1, { x: 0, y: 0 }), 0, 100)[0]?.text).toContain('Ainda não há acontecimentos novos');
  });
  it('preserva o dia após salvar e migra salvamentos antigos', () => {
    const state = emptyVillage(1, { x: 0, y: 0 });
    state.recap = { day: '2026-10-18', at: 200 };
    expect(normalizeVillage(JSON.parse(JSON.stringify(state)), 1, state.player).recap).toEqual(state.recap);
    expect(normalizeVillage({ ...state, recap: undefined }, 1, state.player).recap).toEqual({ day: '', at: 0 });
  });
  it('inclui a última visita lendária real e ignora ids desconhecidos', () => {
    const state = emptyVillage(1, { x: 0, y: 0 });
    state.legendary.history = [{ id: 'lugia', at: new Date(100).toISOString() }];
    expect(dailyRecap(state, 0, 200)[1]?.cast).toEqual(['Lugia']);
    state.legendary.history[0]!.id = 'inexistente';
    expect(dailyRecap(state, 0, 200)).toHaveLength(2);
  });
});
