import { describe, expect, it } from 'vitest';
import {
  canAffordSummon,
  canEvolve,
  COIN_SUMMON_COST,
  COIN_SUMMON_ENABLED,
  digitalRows,
  LAST_DEX_ID,
  pickAnySpecies,
  summonWithCoins,
  earnEnergy,
  emptyDigital,
  evolve,
  EVOLVE_COST,
  grantStarter,
  isDigitalInstanceId,
  normalizeDigital,
  pickFonteSpecies,
  SUMMON_COST,
  summon,
} from './digital';
import { seededRng } from '../battle';

const NOW = '2026-10-16T12:00:00.000Z';
const BULBASAUR = { dexId: 1, name: 'Bulbasaur', cardId: 'base1-44' };
const IVYSAUR = { dexId: 2, name: 'Ivysaur', cardId: 'base1-30' };

describe('digital pokémon — energia', () => {
  it('ganhar energia soma ao saldo e registra no histórico', () => {
    let s = emptyDigital();
    s = earnEnergy(s, 50, 'sobrevivencia', NOW);
    s = earnEnergy(s, 30, 'minigame', NOW);
    expect(s.energy).toBe(80);
    expect(s.ledger.map((t) => t.amount)).toEqual([50, 30]);
    expect(s.ledger.every((t) => t.type === 'ganho')).toBe(true);
  });

  it('ignora ganho de energia não positivo (nunca diminui por engano)', () => {
    const s = earnEnergy(emptyDigital(), 0, 'x', NOW);
    expect(s.energy).toBe(0);
    expect(earnEnergy(emptyDigital(), -5, 'x', NOW).energy).toBe(0);
  });

  it('o histórico guarda só as últimas transações (não cresce sem fim)', () => {
    let s = emptyDigital();
    for (let i = 0; i < 60; i++) s = earnEnergy(s, 1, `e${i}`, NOW);
    expect(s.ledger.length).toBeLessThanOrEqual(40);
    expect(s.energy).toBe(60);
  });
});

describe('digital pokémon — presente inicial', () => {
  it('dá exatamente uma vez; a segunda tentativa não muda nada', () => {
    let s = emptyDigital();
    const withGift = grantStarter(s, BULBASAUR, NOW);
    expect(withGift).not.toBeNull();
    expect(withGift!.starterGiven).toBe(true);
    expect(withGift!.instances).toHaveLength(1);
    expect(withGift!.instances[0]!.isDigitalPokemon).toBe(true);
    expect(withGift!.instances[0]!.source).toBe('presente');
    expect(grantStarter(withGift!, IVYSAUR, NOW)).toBeNull();
  });

  it('instâncias digitais têm um id reconhecível (isDigitalInstanceId)', () => {
    const s = grantStarter(emptyDigital(), BULBASAUR, NOW)!;
    expect(isDigitalInstanceId(s.instances[0]!.instanceId)).toBe(true);
    expect(isDigitalInstanceId('carta-escaneada-123')).toBe(false);
  });
});

describe('digital pokémon — Fonte (invocação por 500)', () => {
  it('sem saldo, não invoca (nem gasta nem concede nada)', () => {
    const s = emptyDigital();
    expect(canAffordSummon(s)).toBe(false);
    expect(summon(s, BULBASAUR, NOW)).toBeNull();
  });

  it('com 500 ou mais, invoca e desconta exatamente o custo', () => {
    const s = earnEnergy(emptyDigital(), 600, 'x', NOW);
    expect(canAffordSummon(s)).toBe(true);
    const result = summon(s, BULBASAUR, NOW);
    expect(result).not.toBeNull();
    expect(result!.energy).toBe(600 - SUMMON_COST);
    expect(result!.instances).toHaveLength(1);
    expect(result!.instances[0]!.source).toBe('fonte');
    expect(result!.ledger.at(-1)!.type).toBe('gasto');
    expect(result!.ledger.at(-1)!.amount).toBe(SUMMON_COST);
  });

  it('pickFonteSpecies evita repetir uma espécie que o jogador já tem, se possível', () => {
    const s = grantStarter(emptyDigital(), BULBASAUR, NOW)!;
    const pool = [BULBASAUR, IVYSAUR];
    // Sempre o mesmo rng "determinístico": roda muitas vezes e nunca deve escolher BULBASAUR (já tem).
    for (let seed = 0; seed < 20; seed++) {
      const picked = pickFonteSpecies(s, pool, seededRng(seed));
      expect(picked!.dexId).toBe(IVYSAUR.dexId);
    }
  });

  it('pickFonteSpecies cai pro pool inteiro se tudo já foi conseguido', () => {
    let s = grantStarter(emptyDigital(), BULBASAUR, NOW)!;
    s = { ...s, instances: [...s.instances, { ...s.instances[0]!, instanceId: 'dp_x', dexId: IVYSAUR.dexId }] };
    const pool = [BULBASAUR, IVYSAUR];
    const picked = pickFonteSpecies(s, pool, seededRng(1));
    expect([BULBASAUR.dexId, IVYSAUR.dexId]).toContain(picked!.dexId);
  });

  it('pool vazio não quebra (null, sem inventar espécie)', () => {
    expect(pickFonteSpecies(emptyDigital(), [], seededRng(1))).toBeNull();
  });
});

describe('digital pokémon — evolução', () => {
  it('exige as 3 condições ao mesmo tempo: 1000 energia, amizade nível 3+, próxima forma real', () => {
    let s = grantStarter(emptyDigital(), BULBASAUR, NOW)!;
    const id = s.instances[0]!.instanceId;
    expect(canEvolve(s, id, 3, true)).toBe(false); // falta energia
    s = earnEnergy(s, EVOLVE_COST, 'x', NOW);
    expect(canEvolve(s, id, 2, true)).toBe(false); // amizade baixa
    expect(canEvolve(s, id, 3, false)).toBe(false); // sem próxima forma
    expect(canEvolve(s, id, 3, true)).toBe(true);
  });

  it('evolui, troca a espécie, soma 1 ao stage e desconta 1000 — sem perder a instância', () => {
    let s = grantStarter(emptyDigital(), BULBASAUR, NOW)!;
    const id = s.instances[0]!.instanceId;
    s = earnEnergy(s, EVOLVE_COST, 'x', NOW);
    const evolved = evolve(s, id, 3, IVYSAUR, NOW);
    expect(evolved).not.toBeNull();
    expect(evolved!.energy).toBe(0);
    const inst = evolved!.instances.find((i) => i.instanceId === id)!;
    expect(inst.dexId).toBe(IVYSAUR.dexId);
    expect(inst.stage).toBe(1);
    expect(inst.instanceId).toBe(id); // a instância continua a mesma (amizade/histórico não se perdem)
    expect(inst.isDigitalPokemon).toBe(true); // continua Digital Pokémon, inelegível pra scan
  });

  it('evolução falha de forma atômica: energia insuficiente não muda nada', () => {
    let s = grantStarter(emptyDigital(), BULBASAUR, NOW)!;
    const id = s.instances[0]!.instanceId;
    s = earnEnergy(s, EVOLVE_COST - 1, 'x', NOW);
    const result = evolve(s, id, 3, IVYSAUR, NOW);
    expect(result).toBeNull();
  });
});

describe('digital pokémon — normalização (nunca trava com dado salvo estranho)', () => {
  it('estado ausente ou vazio vira um DigitalState válido', () => {
    expect(normalizeDigital(undefined)).toEqual(emptyDigital());
    expect(normalizeDigital(null)).toEqual(emptyDigital());
    expect(normalizeDigital({})).toEqual(emptyDigital());
  });

  it('descarta lixo (negativos, tipos errados, instâncias sem isDigitalPokemon)', () => {
    const out = normalizeDigital({ energy: -5, starterGiven: 'sim', instances: [{ instanceId: 'x' }, { instanceId: 'y', dexId: 1, isDigitalPokemon: true }], ledger: 'nada' });
    expect(out.energy).toBe(0);
    expect(out.starterGiven).toBe(false);
    expect(out.instances).toHaveLength(1);
    expect(out.ledger).toEqual([]);
    expect(out.introSeen).toBe(false);
    expect(out.tutorialSeen).toBe(false);
  });

  it('introSeen e tutorialSeen (Fase 4) só viram true com o valor exato `true`', () => {
    expect(normalizeDigital({ introSeen: true, tutorialSeen: true }).introSeen).toBe(true);
    expect(normalizeDigital({ introSeen: true, tutorialSeen: true }).tutorialSeen).toBe(true);
    expect(normalizeDigital({ introSeen: 'sim' }).introSeen).toBe(false);
  });

  it('ida e volta preserva um estado válido', () => {
    let s = grantStarter(emptyDigital(), BULBASAUR, NOW)!;
    s = earnEnergy(s, 200, 'x', NOW);
    expect(normalizeDigital(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

describe('invocação na sorte por moedas (pronta, desligada)', () => {
  it('fica desligada até o dono pedir', () => {
    expect(COIN_SUMMON_ENABLED).toBe(false);
  });

  it('custa 700 moedas, é atômica e pode trazer qualquer espécie', () => {
    const s = emptyDigital();
    expect(summonWithCoins(s, 699, { dexId: 448, name: 'Lucario', cardId: 'x' }, '2026-10-16T00:00:00Z')).toBeNull();
    const r = summonWithCoins(s, 1000, { dexId: 448, name: 'Lucario', cardId: 'x' }, '2026-10-16T00:00:00Z')!;
    expect(r.coins).toBe(1000 - COIN_SUMMON_COST);
    expect(r.state.instances[0]).toMatchObject({ dexId: 448, isDigitalPokemon: true, source: 'fonte' });
    expect(r.state.energy).toBe(s.energy); // moedas, não energia
  });

  it('sorteia de 1 até a última espécie, evitando repetidas', () => {
    let s = emptyDigital();
    s = grantStarter(s, { dexId: 1, name: 'Bulbasaur', cardId: 'x' }, '2026-10-16T00:00:00Z')!;
    const seq = [0, 0.5]; // 0 → nº 1 (já tem) → tenta de novo
    let i = 0;
    const id = pickAnySpecies(s, () => seq[Math.min(i++, seq.length - 1)]!);
    expect(id).toBe(1 + Math.floor(0.5 * LAST_DEX_ID));
    for (let k = 0; k < 50; k++) {
      const any = pickAnySpecies(emptyDigital(), Math.random);
      expect(any).toBeGreaterThanOrEqual(1);
      expect(any).toBeLessThanOrEqual(LAST_DEX_ID);
    }
  });
});

describe('Digital Pokémon na lista de cartas', () => {
  it('cada instância vira uma linha marcada com a origem, sem virar carta escaneável', () => {
    let s = emptyDigital();
    s = grantStarter(s, { dexId: 1, name: 'Bulbasaur', cardId: 'det1-1' }, '2026-10-16T10:00:00.000Z')!;
    s = earnEnergy(s, 600, 'teste', '2026-10-16T11:00:00.000Z');
    s = summon(s, { dexId: 4, name: 'Charmander', cardId: 'sm7.5-1' }, '2026-10-16T12:00:00.000Z')!;
    const rows = digitalRows(s);
    expect(rows.map((r) => [r.name, r.origin, r.since])).toEqual([
      ['Bulbasaur', 'Presente inicial', '2026-10-16'],
      ['Charmander', 'Invocado na Fonte', '2026-10-16'],
    ]);
    expect(rows.every((r) => isDigitalInstanceId(r.instanceId))).toBe(true);
  });
});
