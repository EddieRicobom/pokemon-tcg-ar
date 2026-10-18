import { describe, expect, it } from 'vitest';
import { BASE_CHANCE, CELEBI_ANIM_SPEED, celebiDiaryPage, dismissActive, emptyLegendary, LEGENDARIES, legendaryEffects, legendaryOf, NO_EFFECTS, normalizeLegendary, rollLegendary, SUICUNE_GROWTH_FACTOR, SUICUNE_QUIET_FACTOR, ZAPDOS_COIN_MULTIPLIER } from './legendary';

const DAY = '2026-10-16';
const NOW = '2026-10-16T12:00:00.000Z';

/** rng determinístico que sempre devolve o mesmo valor (bom pra testar os dois lados do corte de chance). */
const fixedRng = (v: number) => () => v;

describe('encontros lendários — sorteio', () => {
  it('o catálogo tem pelo menos treze espécies; só uma pode ficar ativa por vez', () => {
    expect(LEGENDARIES.length).toBeGreaterThanOrEqual(13);
    expect(new Set(LEGENDARIES.map((l) => l.dexId)).size).toBe(LEGENDARIES.length);
    const first = rollLegendary(emptyLegendary(), fixedRng(0), DAY, NOW);
    expect(rollLegendary(first.state, fixedRng(0), '2026-10-17', NOW).legendary).toBeNull();
    expect(dismissActive(first.state).active).toBeNull();
  });
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

describe('encontros lendários — efeitos de verdade', () => {
  const H = 3_600_000;
  const T0 = Date.parse('2026-10-16T10:00:00.000Z');
  const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const withEncounter = (id: string, atMs = T0) => ({ ...emptyLegendary(), history: [{ id, at: new Date(atMs).toISOString() }] });

  it('sem encontro, nada muda', () => {
    expect(legendaryEffects(emptyLegendary(), T0, '2026-10-16', dayOf)).toEqual(NO_EFFECTS);
  });

  it('Suicune: chuva, horta mais rápida e Pokémon mais quietos — só naquele dia', () => {
    const e = legendaryEffects(withEncounter('suicune'), T0 + 2 * H, '2026-10-16', dayOf);
    expect(e).toMatchObject({ rain: true, growthFactor: SUICUNE_GROWTH_FACTOR, quietFactor: SUICUNE_QUIET_FACTOR });
    expect(legendaryEffects(withEncounter('suicune'), T0 + 24 * H, '2026-10-17', dayOf).rain).toBe(false);
  });

  it('Zapdos: +25% de moedas por 3 horas; postes piscando no dia', () => {
    const s = withEncounter('zapdos');
    expect(legendaryEffects(s, T0 + 2 * H, '2026-10-16', dayOf)).toMatchObject({ coinMultiplier: ZAPDOS_COIN_MULTIPLIER, lampStorm: true });
    expect(legendaryEffects(s, T0 + 4 * H, '2026-10-16', dayOf)).toMatchObject({ coinMultiplier: 1, lampStorm: true });
  });

  it('Celebi: animações mais rápidas no dia, e a página do Diário é um momento válido', () => {
    expect(legendaryEffects(withEncounter('celebi'), T0 + H, '2026-10-16', dayOf).animSpeed).toBe(CELEBI_ANIM_SPEED);
    const page = celebiDiaryPage(T0, '2026-10-16', 10);
    expect(page.cast[0]?.name).toBe('Celebi');
    expect(page.lines.every((l) => l.who === 0)).toBe(true);
    expect(page.fav).toBe(true);
  });

  it('um encontro "do futuro" (relógio do aparelho voltou) não liga nada', () => {
    expect(legendaryEffects(withEncounter('zapdos', T0 + H), T0, '2026-10-16', dayOf)).toEqual(NO_EFFECTS);
  });
});


describe('novos visitantes lendários', () => {
  for (const def of LEGENDARIES.filter((l) => l.modifiers)) {
    it(`${def.name}: sorteável, com efeito real que expira`, () => {
      let call = 0;
      const index = LEGENDARIES.indexOf(def);
      const roll = rollLegendary(emptyLegendary(), () => call++ === 0 ? 0 : (index + 0.5) / LEGENDARIES.length, DAY, NOW);
      expect(roll.legendary?.id).toBe(def.id);
      const now = Date.parse(NOW);
      const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
      expect(legendaryEffects(roll.state, now, DAY, dayOf)).toMatchObject(def.modifiers!);
      expect(legendaryEffects(roll.state, now + 86400000, '2026-10-17', dayOf)).toEqual(NO_EFFECTS);
    });
  }
});
