import { describe, expect, it } from 'vitest';
import { add, count, emptyVillage, normalizeVillage } from './life';
import type { VillageState } from './life';
import { buyLesson, buyTraining, dojoOpen, lessonBlock, packLunch, readLuckLetter, settleTowerRun, startTowerRun, toggleTowerOption, trainingBlock, unpackLunch, upgradeDojo } from './dojo';
import { chooseInstructor, professionActive } from './professions';
import { emptyTower, LESSONS, normalizeTower, TRAININGS } from './tower-state';

const fresh = (): VillageState => emptyVillage(7, { x: 1, y: 1 });
function rich(): VillageState {
  const s = fresh();
  s.coins = 50_000;
  for (const id of ['tabua', 'tijolo', 'vidro', 'boneco-treino', 'faixa-treino', 'placa-armadura', 'sino-desejo', 'lente-foco']) add(s, id, 99);
  return s;
}

describe('Dojô da Torre', () => {
  it('só abre com 7 moradores e fica suspenso sem o Instrutor', () => {
    expect(dojoOpen(6)).toBe(false);
    expect(dojoOpen(7)).toBe(true);
    expect(buyTraining(rich(), 'folego', false).ok).toBe(false);
  });

  it('a reforma gasta moedas e materiais e sobe um nível por vez, até o último', () => {
    const s = rich();
    const coins = s.coins;
    expect(upgradeDojo(s).ok).toBe(true);
    expect(s.tower.dojoLevel).toBe(1);
    expect(s.coins).toBe(coins - 400);
    expect(count(s, 'tabua')).toBe(95);
    expect(upgradeDojo(s).ok).toBe(true);
    expect(upgradeDojo(s).ok).toBe(true);
    expect(s.tower.dojoLevel).toBe(3);
    expect(upgradeDojo(s).ok).toBe(false);
  });

  it('reforma e compras recusam sem moedas ou sem as peças, sem gastar nada', () => {
    const s = fresh();
    s.coins = 1000;
    expect(upgradeDojo(s)).toMatchObject({ ok: false });
    expect(s.coins).toBe(1000);
    s.coins = 400; add(s, 'tabua', 4);
    expect(upgradeDojo(s).ok).toBe(true);
    expect(trainingBlock(s, 'folego')).toMatch(/Faltam moedas/);
    s.coins = 500;
    expect(trainingBlock(s, 'folego')).toMatch(/Falta: Boneco de treino/);
    expect(buyTraining(s, 'folego').ok).toBe(false);
    expect(s.coins).toBe(500);
  });

  it('o nível do Dojô trava os degraus finais dos treinos e das lições', () => {
    const s = rich();
    upgradeDojo(s); // Tatame
    expect(buyTraining(s, 'folego').ok).toBe(true);
    expect(buyTraining(s, 'folego').ok).toBe(true);
    expect(trainingBlock(s, 'folego')).toMatch(/Exige Dojô/);
    expect(lessonBlock(s, 'recusa')).toMatch(/Exige Dojô/);
    expect(lessonBlock(s, 'olhar-treinado')).toBeNull();
    upgradeDojo(s); upgradeDojo(s);
    expect(buyTraining(s, 'folego').ok).toBe(true);
    expect(buyTraining(s, 'folego').ok).toBe(true);
    expect(trainingBlock(s, 'folego')).toBe('Treino no nível máximo.');
    expect(s.tower.training.folego).toBe(TRAININGS.folego.coins.length);
  });

  it('a Recusa firme exige a Recusa, e cada lição só é comprada uma vez', () => {
    const s = rich();
    for (let i = 0; i < 3; i++) upgradeDojo(s);
    expect(lessonBlock(s, 'recusa-firme')).toMatch(/Exige a lição Recusa/);
    expect(buyLesson(s, 'recusa').ok).toBe(true);
    expect(buyLesson(s, 'recusa').ok).toBe(false);
    expect(buyLesson(s, 'recusa-firme').ok).toBe(true);
    expect(s.tower.lessons).toEqual(['recusa', 'recusa-firme']);
  });

  it('o custo total fica por volta de 15 mil moedas', () => {
    const reforms = 400 + 1400 + 2800;
    const trainings = Object.values(TRAININGS).reduce((sum, t) => sum + t.coins.reduce((a, b) => a + b, 0), 0);
    const lessons = Object.values(LESSONS).reduce((sum, l) => sum + l.coins, 0);
    expect(reforms + trainings + lessons).toBeGreaterThanOrEqual(15_000);
    expect(reforms + trainings + lessons).toBeLessThanOrEqual(15_500);
  });

  it('desligar um treino comprado o tira da corrida; o que não foi comprado não liga', () => {
    const s = rich();
    upgradeDojo(s); buyTraining(s, 'passada');
    expect(toggleTowerOption(s, 'passada')).toBe(true);
    expect(s.tower.disabled).toEqual(['passada']);
    expect(startTowerRun(s, { pure: false }).loadout.speedBonus).toBe(0);
    expect(toggleTowerOption(s, 'passada')).toBe(true);
    expect(startTowerRun(s, { pure: false }).loadout.speedBonus).toBeCloseTo(0.02);
    expect(toggleTowerOption(s, 'faro')).toBe(false);
  });
});

describe('sorte do Carteiro', () => {
  it('dá uma vez por dia 1 desejo para a próxima corrida e não acumula', () => {
    const s = fresh();
    expect(readLuckLetter(s, '2026-10-26').ok).toBe(true);
    expect(s.tower.luckPending).toBe(true);
    expect(readLuckLetter(s, '2026-10-26').ok).toBe(false);
    expect(readLuckLetter(s, '2026-10-27').ok).toBe(true);
    expect(s.tower.luckPending).toBe(true);
    const run = startTowerRun(s, { pure: false });
    expect(run.loadout.startingRerolls).toBe(1);
    expect(s.tower.luckPending).toBe(false);
    expect(startTowerRun(s, { pure: false }).loadout.startingRerolls).toBe(0);
  });

  it('a corrida pura guarda a sorte para depois', () => {
    const s = fresh();
    readLuckLetter(s, '2026-10-26');
    const pure = startTowerRun(s, { pure: true }).loadout;
    expect(pure.trained).toBe(false);
    expect(pure.startingRerolls).toBe(0);
    expect(s.tower.luckPending).toBe(true);
  });

  it('lição e sorte juntas dão no máximo 2 desejos no início', () => {
    const s = rich();
    upgradeDojo(s); buyLesson(s, 'desejo'); readLuckLetter(s, '2026-10-26');
    expect(startTowerRun(s, { pure: false }).loadout.startingRerolls).toBe(2);
  });
});

describe('marmita do Café', () => {
  it('reserva uma comida da mochila, devolve a anterior ao trocar e só guarda uma', () => {
    const s = fresh();
    add(s, 'pipoca', 2); add(s, 'peixe-grelhado', 1);
    expect(packLunch(s, 'pipoca').ok).toBe(true);
    expect(s.tower.lunchbox).toBe('pipoca');
    expect(count(s, 'pipoca')).toBe(1);
    expect(packLunch(s, 'peixe-grelhado').ok).toBe(true);
    expect(count(s, 'pipoca')).toBe(2);
    expect(s.tower.lunchbox).toBe('peixe-grelhado');
    expect(unpackLunch(s).ok).toBe(true);
    expect(s.tower.lunchbox).toBeNull();
    expect(count(s, 'peixe-grelhado')).toBe(1);
  });

  it('recusa item que não é comida, comida que falta e Café fechado', () => {
    const s = fresh();
    add(s, 'madeira', 3);
    expect(packLunch(s, 'madeira').ok).toBe(false);
    expect(packLunch(s, 'pipoca').ok).toBe(false);
    add(s, 'pipoca', 1);
    expect(packLunch(s, 'pipoca', false).ok).toBe(false);
    expect(count(s, 'pipoca')).toBe(1);
  });

  it('corrida que contou gasta a marmita; desistência antes dos 20 s devolve', () => {
    const s = fresh();
    add(s, 'pipoca', 2);
    packLunch(s, 'pipoca');
    let run = startTowerRun(s, { pure: false });
    expect(run.loadout.lunch?.foodId).toBe('pipoca');
    settleTowerRun(s, run.loadout, 5_000);
    expect(s.tower.lunchbox).toBeNull();
    expect(count(s, 'pipoca')).toBe(2);
    packLunch(s, 'pipoca');
    run = startTowerRun(s, { pure: false });
    settleTowerRun(s, run.loadout, 60_000);
    expect(s.tower.lunchbox).toBeNull();
    expect(count(s, 'pipoca')).toBe(1);
  });

  it('a corrida pura não usa nem gasta a marmita', () => {
    const s = fresh();
    add(s, 'pipoca', 1);
    packLunch(s, 'pipoca');
    const run = startTowerRun(s, { pure: true });
    expect(run.loadout.lunch).toBeNull();
    settleTowerRun(s, run.loadout, 90_000);
    expect(s.tower.lunchbox).toBe('pipoca');
  });
});

describe('estado salvo e Instrutor', () => {
  it('saves antigos ganham o bloco zerado e valores inválidos são limpos', () => {
    const old = JSON.parse(JSON.stringify(fresh())) as Record<string, unknown>;
    delete old.tower; delete old.instructorId;
    const restored = normalizeVillage(old, 7, { x: 1, y: 1 });
    expect(restored.tower).toEqual(emptyTower());
    expect(restored.instructorId).toBeNull();
    expect(normalizeTower({ dojoLevel: 9, training: { folego: 99, nada: 3 }, lessons: ['desejo', 'desejo', 'x'], disabled: ['desejo', 'y'], lunchbox: 5 })).toEqual({
      dojoLevel: 0, training: { folego: 4 }, lessons: ['desejo'], disabled: ['desejo'], luckDay: '', luckPending: false, lunchbox: null,
    });
  });

  it('o progresso sobrevive a salvar e carregar', () => {
    const s = rich();
    upgradeDojo(s); buyTraining(s, 'faro'); buyLesson(s, 'desejo'); readLuckLetter(s, '2026-10-26');
    const restored = normalizeVillage(JSON.parse(JSON.stringify(s)), 7, { x: 1, y: 1 });
    expect(restored.tower).toEqual(s.tower);
  });

  it('o Instrutor nunca é o carteiro nem a garçonete e a escolha é estável', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `a${i}`);
    const instructor = chooseInstructor(ids, 'a0', 'a1', null);
    expect(instructor).not.toBeNull();
    expect(['a0', 'a1']).not.toContain(instructor);
    expect(chooseInstructor(ids.slice().reverse(), 'a0', 'a1', instructor)).toBe(instructor);
    expect(chooseInstructor(ids.slice(0, 6), 'a0', 'a1', instructor)).toBeNull();
    expect(professionActive('dojo', 7)).toBe(true);
    expect(professionActive('dojo', 6)).toBe(false);
  });
});
