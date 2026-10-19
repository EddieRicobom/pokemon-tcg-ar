import { describe, expect, it } from 'vitest';
import { POKEMON_TYPES } from '../pokemon-data';
import { chooseActivity, scoreActivity, TYPE_AFFINITIES, VILLAGE_ACTIVITIES } from './vocations';

describe('vocações da comunidade', () => {
  it('cobre os 18 tipos com atividades efetivas e identificadores válidos', () => {
    expect(Object.keys(TYPE_AFFINITIES).sort()).toEqual([...POKEMON_TYPES].sort());
    for (const activities of Object.values(TYPE_AFFINITIES)) {
      expect(activities.length).toBeGreaterThan(0);
      expect(activities.every((activity) => VILLAGE_ACTIVITIES.includes(activity))).toBe(true);
    }
  });

  it('combina duas aptidões sem dobrar o bônus inteiro', () => {
    const mono = scoreActivity({ available: [], types: ['grass'], interests: [], energy: 100, socialOpportunity: 0 }, 'agricultura');
    const dual = scoreActivity({ available: [], types: ['grass', 'bug'], interests: [], energy: 100, socialOpportunity: 0 }, 'agricultura');
    expect(mono.score).toBe(3);
    expect(dual.score).toBe(4);
  });

  it('uma preferência pode superar a aptidão e o descanso vence quando a energia está baixa', () => {
    const preferred = scoreActivity({ available: [], types: ['fire'], interests: ['agricultura'], energy: 100, socialOpportunity: 0 }, 'agricultura');
    expect(preferred).toMatchObject({ score: 4, reason: 'interesse' });

    const choice = chooseActivity({ available: ['agricultura', 'descanso'], types: ['grass'], interests: [], energy: 5, socialOpportunity: 0 }, () => 0.5);
    expect(choice.activity).toBe('descanso');
    expect(choice.reason).toBe('descanso');
  });

  it('ignora atividades indisponíveis e resolve empates de forma reproduzível', () => {
    const context = { available: ['acolhimento', 'brincadeira', 'descanso'] as const, types: [], interests: [], energy: 100, socialOpportunity: 0 };
    const first = chooseActivity(context, () => 0.25);
    const second = chooseActivity(context, () => 0.25);
    expect(first).toEqual(second);
    expect(chooseActivity({ ...context, available: [] }, () => 0)).toMatchObject({ activity: 'descanso' });
  });

  it('usa necessidades, memória e evita repetir a mesma rotina mecanicamente', () => {
    const context = { available: ['agricultura', 'pesquisa'] as const, types: ['grass'] as const, interests: [], energy: 80, socialOpportunity: 0 };
    const need = scoreActivity({ ...context, communityNeeds: [{ activity: 'pesquisa', urgency: 5 }] }, 'pesquisa');
    const remembered = scoreActivity({ ...context, rememberedActivity: 'pesquisa' }, 'pesquisa');
    const repeat = scoreActivity({ ...context, recentActivity: 'agricultura' }, 'agricultura');
    expect(need.score).toBe(5);
    expect(remembered.score).toBe(1.5);
    expect(repeat.score).toBe(0.5);
  });
});
