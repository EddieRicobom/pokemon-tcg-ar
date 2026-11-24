import { describe, expect, it } from 'vitest';
import { survivorCoachHints, survivorNewRecords } from './survivor-coach';
import type { SurvivorSummary } from './survivor-types';

function summary(over: Partial<SurvivorSummary> = {}): SurvivorSummary {
  return {
    survivedMs: 300_000,
    level: 20,
    stage: 0,
    kills: 200,
    wave: 10,
    trainersBeaten: 2,
    bossesBeaten: 0,
    finalBossBeaten: false,
    infinite: false,
    digitalPokeballs: 0,
    ...over,
  };
}

const finalHit = (over: Partial<NonNullable<SurvivorSummary['finalHit']>> = {}): NonNullable<SurvivorSummary['finalHit']> => ({
  boss: false,
  grade: 'comum',
  kind: 'contato',
  damage: 10,
  hpBefore: 10,
  ...over,
});

describe('dicas para a próxima corrida', () => {
  it('prioriza sobreviver ao primeiro minuto e não passa de três dicas', () => {
    const hints = survivorCoachHints(summary({
      survivedMs: 30_000,
      level: 4,
      kills: 3,
      trainersBeaten: 0,
      finalHit: finalHit({ boss: true }),
    }), { bestMs: 40_000, trained: false });
    expect(hints.length).toBeLessThanOrEqual(3);
    expect(hints[0]?.id).toBe('primeiro-minuto');
    expect(hints.map((hint) => hint.id)).toContain('chefe');
  });

  it('reconhece o chefe, o elite, o projétil e o quase-recorde', () => {
    const boss = survivorCoachHints(summary({ finalHit: finalHit({ boss: true }) }));
    expect(boss.map((hint) => hint.id)).toContain('chefe');
    const elite = survivorCoachHints(summary({ finalHit: finalHit({ grade: 'elite' }) }));
    expect(elite.map((hint) => hint.id)).toContain('elite');
    const shot = survivorCoachHints(summary({ finalHit: finalHit({ kind: 'projétil' }) }));
    expect(shot.map((hint) => hint.id)).toContain('projetil');
    const close = survivorCoachHints(summary({ survivedMs: 291_000 }), { bestMs: 300_000 });
    const record = close.find((hint) => hint.id === 'recorde');
    expect(record?.text).toContain('9 s');
  });

  it('lembra o Dojô só quando a corrida não usou treino da Vila', () => {
    expect(survivorCoachHints(summary({ survivedMs: 120_000, kills: 30 }), { trained: false }).map((hint) => hint.id)).toContain('dojo');
    expect(survivorCoachHints(summary({ survivedMs: 120_000, kills: 30 }), { trained: true }).map((hint) => hint.id)).not.toContain('dojo');
  });

  it('cai numa sugestão de build quando nada específico aconteceu', () => {
    const hints = survivorCoachHints(summary(), { trained: true });
    expect(hints).toHaveLength(1);
    expect(hints[0]?.id).toBe('build');
  });

  it('é determinística para o mesmo resumo', () => {
    const input = summary({ survivedMs: 30_000, finalHit: finalHit({ grade: 'elite' }) });
    expect(survivorCoachHints(input, { bestMs: 40_000, trained: false })).toEqual(survivorCoachHints(input, { bestMs: 40_000, trained: false }));
  });

  it('detecta recordes de tempo, onda e nível acima do melhor anterior', () => {
    expect(survivorNewRecords(summary({ survivedMs: 300_000, wave: 10, level: 20 }), { ms: 0, wave: 0, level: 0 })).toEqual([]);
    expect(survivorNewRecords(summary({ survivedMs: 300_000, wave: 10, level: 20 }), { ms: 240_000, wave: 12, level: 18 }))
      .toEqual([{ id: 'tempo', from: 240_000, to: 300_000 }, { id: 'nivel', from: 18, to: 20 }]);
    expect(survivorNewRecords(summary({ survivedMs: 200_000, wave: 14, level: 19 }), { ms: 240_000, wave: 12, level: 18 }))
      .toEqual([{ id: 'onda', from: 12, to: 14 }, { id: 'nivel', from: 18, to: 19 }]);
  });
});
