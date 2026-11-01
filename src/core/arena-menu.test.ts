import { describe, expect, it } from 'vitest';
import { arenaPlan, choiceFromFlags, endlessFromFlags, isArenaChoice } from './arena-menu';
import type { ArenaPlanInput } from './arena-menu';

const base: ArenaPlanInput = { choice: 'livre', teamCount: 3, mode: 'royale', endless: 'formatacao', leader: null, pvpConnected: false };
const flags = (...names: string[]) => new Set(names);

describe('choiceFromFlags', () => {
  it('cada entrada cai na opção certa', () => {
    expect(choiceFromFlags(flags('pvp', 'vila'), false)).toBe('pvp');
    expect(choiceFromFlags(flags('batalha', 'vila'), false)).toBe('livre');
    expect(choiceFromFlags(flags('formatacao'), false)).toBe('corridas');
    expect(choiceFromFlags(flags('restauracao'), false)).toBe('corridas');
    expect(choiceFromFlags(flags('liga'), false)).toBe('liga');
  });

  it('um desafio da Liga pendente abre na Liga; o PvP vale mais', () => {
    expect(choiceFromFlags(flags(), true)).toBe('liga');
    expect(choiceFromFlags(flags('pvp'), true)).toBe('pvp');
  });

  it('sem pista, a pessoa escolhe', () => {
    expect(choiceFromFlags(flags(), false)).toBeNull();
    expect(choiceFromFlags(flags('vila', 'virtual', 'arena'), false)).toBeNull();
  });
});

describe('endlessFromFlags e isArenaChoice', () => {
  it('lê a corrida pedida', () => {
    expect(endlessFromFlags(flags('restauracao'))).toBe('restauracao');
    expect(endlessFromFlags(flags('formatacao'))).toBe('formatacao');
    expect(endlessFromFlags(flags('pvp'))).toBeNull();
  });
  it('reconhece só opções conhecidas', () => {
    expect(isArenaChoice('liga')).toBe(true);
    expect(isArenaChoice('torneio')).toBe(false);
  });
});

describe('arenaPlan', () => {
  it('sem opção escolhida, pede para escolher', () => {
    const plan = arenaPlan({ ...base, choice: null });
    expect(plan.ready).toBe(false);
    expect(plan.step).toBe(1);
    expect(plan.blocker).toContain('Escolha o que quer fazer');
  });

  it('batalha livre pede 2 Pokémon e depois libera o botão', () => {
    const few = arenaPlan({ ...base, teamCount: 1 });
    expect(few.ready).toBe(false);
    expect(few.blocker).toContain('2 Pokémon');
    const ok = arenaPlan(base);
    expect(ok.ready).toBe(true);
    expect(ok.blocker).toBeNull();
    expect(ok.step).toBe(4);
    expect(ok.summary).toContain('Todos contra todos');
    expect(ok.cta).toContain('Entrar na Arena');
  });

  it('batalha livre num formato que não cabe na equipe explica o motivo', () => {
    const plan = arenaPlan({ ...base, mode: 'tres', modeBlocker: '3 contra 3 precisa de 6 Pokémon na caixa (hoje há 3).' });
    expect(plan.ready).toBe(false);
    expect(plan.step).toBe(3);
    expect(plan.blocker).toContain('precisa de 6');
  });

  it('corrida 6×6 exige exatamente 6 e cita o modo escolhido', () => {
    expect(arenaPlan({ ...base, choice: 'corridas', teamCount: 5 }).blocker).toContain('hoje 5');
    const ok = arenaPlan({ ...base, choice: 'corridas', teamCount: 6, endless: 'restauracao' });
    expect(ok.ready).toBe(true);
    expect(ok.cta).toContain('Restauração digital');
  });

  it('Liga pede equipe, depois líder', () => {
    expect(arenaPlan({ ...base, choice: 'liga', teamCount: 0 }).step).toBe(2);
    const noLeader = arenaPlan({ ...base, choice: 'liga' });
    expect(noLeader.ready).toBe(false);
    expect(noLeader.blocker).toContain('líder');
    const ok = arenaPlan({ ...base, choice: 'liga', leader: 'Brock' });
    expect(ok.ready).toBe(true);
    expect(ok.cta).toContain('Brock');
  });

  it('PvP pede conexão antes da equipe e nomeia o amigo', () => {
    const offline = arenaPlan({ ...base, choice: 'pvp' });
    expect(offline.ready).toBe(false);
    expect(offline.blocker).toContain('Conecte');
    expect(arenaPlan({ ...base, choice: 'pvp', pvpConnected: true, teamCount: 0 }).ready).toBe(false);
    const ok = arenaPlan({ ...base, choice: 'pvp', pvpConnected: true, friend: 'Ash' });
    expect(ok.ready).toBe(true);
    expect(ok.summary).toContain('Ash');
  });
});
