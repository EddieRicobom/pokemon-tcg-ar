import { describe, expect, it } from 'vitest';
import { arStatusText, arStepList } from './ar-stages';

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
