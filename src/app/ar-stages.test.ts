import { describe, expect, it } from 'vitest';
import { arLoadHint, arLoadingMode, arStageTitle, arStatusText, arStepList, elapsedSeconds } from './ar-stages';

const states = (stage: Parameters<typeof arStepList>[0], sprite?: Parameters<typeof arStepList>[1], failedAt?: Parameters<typeof arStepList>[3]) =>
  arStepList(stage, sprite, true, failedAt).map((s) => `${s.key}:${s.state}`);

describe('etapas do AR', () => {
  it('sem carta escolhida não mostra etapas', () => {
    expect(arStepList('idle', undefined, false)).toEqual([]);
  });
  it('carta escolhida sem câmera: só a primeira etapa está feita', () => {
    expect(states('selected')[0]).toBe('selected:done');
    expect(states('selected')[1]).toBe('preparing:pending');
  });
  it('compilando o alvo: dados feitos, alvo ativo, o resto pendente', () => {
    expect(states('compiling')).toEqual([
      'selected:done', 'preparing:done', 'compiling:active', 'engine:pending', 'searching:pending', 'tracking:pending', 'rendering:pending',
    ]);
  });
  it('procurando: motor iniciado mas a carta ainda NÃO está rastreada nem o Pokémon exibido', () => {
    const s = states('searching', 'animated');
    expect(s).toContain('engine:done');
    expect(s).toContain('searching:active');
    expect(s).toContain('tracking:pending');
    expect(s).toContain('rendering:pending');
  });
  it('rastreada com GIF carregado: Pokémon exibido', () => {
    expect(states('tracking', 'animated').at(-1)).toBe('rendering:done');
  });
  it('rastreada mas o sprite ainda carrega ou falhou: NÃO conta como Pokémon exibido', () => {
    expect(states('tracking', 'loading').at(-1)).toBe('rendering:active');
    expect(states('tracking', 'error').at(-1)).toBe('rendering:active');
  });
  it('erro marca exatamente a etapa que falhou', () => {
    const s = states('error', undefined, 'compiling');
    expect(s).toContain('preparing:done');
    expect(s).toContain('compiling:failed');
    expect(s).toContain('engine:pending');
  });
  it('mensagens: nunca dizem "Pokémon em pé" sem sprite carregado', () => {
    expect(arStatusText('tracking', '', 'loading')).not.toMatch(/em pé/);
    expect(arStatusText('tracking', '', 'animated')).toMatch(/em pé/);
    expect(arStatusText('lost', '', undefined)).toMatch(/Perdi/);
  });
});

describe('feedback de carregamento', () => {
  it('a animação só aparece enquanto prepara ou procura', () => {
    expect(arLoadingMode('preparing')).toBe('loading');
    expect(arLoadingMode('compiling')).toBe('loading');
    expect(arLoadingMode('engine')).toBe('loading');
    expect(arLoadingMode('searching')).toBe('searching');
    for (const stage of ['idle', 'selected', 'tracking', 'lost', 'error'] as const) expect(arLoadingMode(stage)).toBeNull();
  });
  it('toda etapa animada tem título e dica; a dica muda quando a etapa demora', () => {
    for (const stage of ['preparing', 'compiling', 'engine', 'searching'] as const) {
      expect(arStageTitle(stage)).not.toBe('');
      expect(arLoadHint(stage, 0)).not.toBe('');
      expect(arLoadHint(stage, 60)).not.toBe(arLoadHint(stage, 0));
    }
    expect(arLoadHint('compiling', 0)).toMatch(/uma vez por carta/);
    expect(arLoadHint('tracking', 5)).toBe('');
  });
  it('tempo decorrido em segundos inteiros', () => {
    expect(elapsedSeconds(1000, 4999)).toBe(3);
    expect(elapsedSeconds(5000, 1000)).toBe(0);
  });
});
