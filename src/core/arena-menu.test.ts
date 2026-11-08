import { describe, expect, it } from 'vitest';
import { ARENA_CHOICES, ARENA_PITCH, arenaPlan, choiceFromFlags, endlessFromFlags, isArenaChoice } from './arena-menu';
import type { ArenaPlanInput } from './arena-menu';

const input = (over: Partial<ArenaPlanInput>): ArenaPlanInput => ({ choice: 'treino', teamCount: 6, endless: 'formatacao', leader: null, ...over });

describe('choiceFromFlags', () => {
  it('cada entrada cai na opção certa', () => {
    expect(choiceFromFlags(new Set(['pvp']), false)).toBe('pvp');
    expect(choiceFromFlags(new Set(['corridas']), false)).toBe('corridas');
    expect(choiceFromFlags(new Set(['restauracao']), false)).toBe('corridas');
    expect(choiceFromFlags(new Set(['liga', 'vila']), false)).toBe('liga');
    expect(choiceFromFlags(new Set(['batalha']), false)).toBe('treino');
  });

  it('um desafio guardado abre na Liga, mas o pedido do endereço vale mais', () => {
    expect(choiceFromFlags(new Set(), true)).toBe('liga');
    expect(choiceFromFlags(new Set(['vila']), true)).toBe('liga');
    expect(choiceFromFlags(new Set(['pvp']), true)).toBe('pvp');
    expect(choiceFromFlags(new Set(['batalha']), true)).toBe('treino');
  });

  it('sem pista, a pessoa escolhe', () => {
    expect(choiceFromFlags(new Set(), false)).toBeNull();
    expect(choiceFromFlags(new Set(['vila']), false)).toBeNull();
  });

  it('lê a corrida pedida', () => {
    expect(endlessFromFlags(new Set(['restauracao']))).toBe('restauracao');
    expect(endlessFromFlags(new Set(['formatacao']))).toBe('formatacao');
    expect(endlessFromFlags(new Set())).toBeNull();
  });

  it('reconhece só as opções que existem hoje', () => {
    expect(isArenaChoice('treino')).toBe(true);
    expect(isArenaChoice('duelo')).toBe(false);
    expect(isArenaChoice('livre')).toBe(false);
  });
});

describe('arenaPlan', () => {
  it('sem opção escolhida, pede para escolher', () => {
    const plan = arenaPlan(input({ choice: null }));
    expect(plan.ready).toBe(false);
    expect(plan.step).toBe(1);
  });

  it.each(ARENA_CHOICES.map((c) => c.id))('%s exige exatamente 6 Pokémon', (choice) => {
    const plan = arenaPlan(input({ choice, teamCount: 5, leader: 'Roark' }));
    expect(plan.ready).toBe(false);
    expect(plan.step).toBe(2);
    expect(plan.blocker).toContain('hoje 5');
  });

  it('Pokémon sem número da Pokédex barra a luta e o motivo aparece', () => {
    const plan = arenaPlan(input({ teamBlocker: 'Sem número da Pokédex: Mew.' }));
    expect(plan.ready).toBe(false);
    expect(plan.blocker).toContain('Mew');
  });

  it('a luta avisa dos 10 níveis', () => {
    expect(arenaPlan(input({})).ready).toBe(true);
    expect(ARENA_PITCH).toContain('10 níveis');
  });

  it('com menos de 6 na coleção, diz quantos faltam em vez de pedir para escolher 6', () => {
    const plan = arenaPlan(input({ teamCount: 3, available: 3 }));
    expect(plan.ready).toBe(false);
    expect(plan.blocker).toContain('mais 3');
    expect(plan.cta).toContain('Faltam 3');
  });

  it('com 6 ou mais na coleção, volta a pedir a escolha', () => {
    expect(arenaPlan(input({ teamCount: 3, available: 8 })).blocker).toContain('hoje 3');
  });

  it('não libera a entrada enquanto a equipe ainda está sendo lida', () => {
    const plan = arenaPlan(input({ teamLoading: true }));
    expect(plan.ready).toBe(false);
    expect(plan.step).toBe(2);
  });

  it('corrida cita o modo escolhido', () => {
    expect(arenaPlan(input({ choice: 'corridas', endless: 'restauracao' })).cta).toContain('Restauração');
  });

  it('Liga pede líder e recusa líder bloqueado', () => {
    expect(arenaPlan(input({ choice: 'liga' })).blocker).toContain('líder');
    const locked = arenaPlan(input({ choice: 'liga', leader: 'Cynthia', leaderLocked: true }));
    expect(locked.ready).toBe(false);
    expect(locked.blocker).toContain('bloqueado');
    const open = arenaPlan(input({ choice: 'liga', leader: 'Roark' }));
    expect(open.ready).toBe(true);
    expect(open.cta).toContain('Roark');
  });

  it('PvP abre a conexão dentro da luta', () => {
    const plan = arenaPlan(input({ choice: 'pvp' }));
    expect(plan.ready).toBe(true);
    expect(plan.cta).toContain('amigo');
  });
});
