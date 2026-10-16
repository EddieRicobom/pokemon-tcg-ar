import { describe, expect, it } from 'vitest';
import { BASE_CHANCE, dismissActive, emptyLegendary, LEGENDARIES, legendaryOf, normalizeLegendary, rollLegendary } from './legendary';

const DAY = '2026-10-16';
const NOW = '2026-10-16T12:00:00.000Z';

/** rng determinístico que sempre devolve o mesmo valor (bom pra testar os dois lados do corte de chance). */
const fixedRng = (v: number) => () => v;

describe('encontros lendários — sorteio', () => {
  it('nunca sorteia duas vezes no mesmo dia', () => {
    const s = emptyLegendary();
    const r1 = rollLegendary(s, fixedRng(0), DAY, NOW); // rng=0 < BASE_CHANCE, "ganharia" se rolasse
    expect(r1.legendary).not.toBeNull();
    const r2 = rollLegendary(r1.state, fixedRng(0), DAY, NOW);
    expect(r2.legendary).toBeNull();
    expect(r2.state.attempts).toBe(r1.state.attempts); // não contou uma segunda tentativa no mesmo dia
  });

  it('não sorteia de novo enquanto um encontro está ativo, mesmo em outro dia', () => {
    const s = emptyLegendary();
    const r1 = rollLegendary(s, fixedRng(0), DAY, NOW);
    expect(r1.state.active).not.toBeNull();
    const r2 = rollLegendary(r1.state, fixedRng(0), '2026-10-17', NOW);
    expect(r2.legendary).toBeNull();
  });

  it('acima da chance-base, não aparece nada (mas conta a tentativa)', () => {
    const s = emptyLegendary();
    const r = rollLegendary(s, fixedRng(BASE_CHANCE + 0.0001), DAY, NOW);
    expect(r.legendary).toBeNull();
    expect(r.state.attempts).toBe(1);
    expect(r.state.active).toBeNull();
  });

  it('abaixo da chance-base, sorteia um lendário elegível e registra no histórico', () => {
    const s = emptyLegendary();
    const r = rollLegendary(s, fixedRng(0), DAY, NOW);
    expect(r.legendary).not.toBeNull();
    expect(LEGENDARIES.map((l) => l.id)).toContain(r.legendary!.id);
    expect(r.state.history).toEqual([{ id: r.legendary!.id, at: NOW }]);
    expect(r.state.active).toEqual({ id: r.legendary!.id });
  });

  it('dismissActive limpa o lendário ativo sem apagar o histórico', () => {
    const s = emptyLegendary();
    const r = rollLegendary(s, fixedRng(0), DAY, NOW);
    const closed = dismissActive(r.state);
    expect(closed.active).toBeNull();
    expect(closed.history).toEqual(r.state.history);
  });

  it('todo lendário sorteado existe em LEGENDARIES (legendaryOf nunca falha pra um id real)', () => {
    for (const l of LEGENDARIES) expect(legendaryOf(l.id)).toBe(l);
  });

  it('cada lendário tem cutscene, bônus e consequência próprios (nunca o mesmo texto genérico)', () => {
    const lines = LEGENDARIES.map((l) => l.lines.join('|'));
    const boons = LEGENDARIES.map((l) => l.boon);
    const consequences = LEGENDARIES.map((l) => l.consequence);
    expect(new Set(lines).size).toBe(LEGENDARIES.length);
    expect(new Set(boons).size).toBe(LEGENDARIES.length);
    expect(new Set(consequences).size).toBe(LEGENDARIES.length);
    for (const l of LEGENDARIES) expect(l.lines.length).toBeGreaterThanOrEqual(2);
  });
});

describe('encontros lendários — normalização', () => {
  it('estado ausente ou vazio vira um LegendaryState válido', () => {
    expect(normalizeLegendary(undefined)).toEqual(emptyLegendary());
    expect(normalizeLegendary(null)).toEqual(emptyLegendary());
  });

  it('descarta um `active` com id de lendário que não existe (nunca mostra cutscene fantasma)', () => {
    const out = normalizeLegendary({ active: { id: 'nao-existe' } });
    expect(out.active).toBeNull();
  });

  it('ida e volta preserva um estado válido', () => {
    const s = rollLegendary(emptyLegendary(), fixedRng(0), DAY, NOW).state;
    expect(normalizeLegendary(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
