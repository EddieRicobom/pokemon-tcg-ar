import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import type { BattleHud } from '../box/battle-director';
import type { CreatureEntry } from '../box/box-scene';
import type { RunningBox } from '../box/start-box';
import type { BoxPvpTeam } from '../pvp/box-wire';
import { buildFighter, seededRng, simulateBattle } from '../core/battle';
import type { BattleResult, Fighter } from '../core/battle';

vi.mock('./services', () => ({
  fetchSprite: vi.fn(async (dex: number) => ({ kind: 'gif', url: `u/${dex}`, blob: new Blob([]) })),
  loadBattle: vi.fn(async () => undefined),
  prepareMegaFor: vi.fn(),
}));
vi.mock('../box/load-creatures', () => ({ browserDecoders: { gif: async () => ({ frames: [] }), image: async () => ({ data: new Uint8Array(4) }) } }));
vi.mock('./trainer-store', async (original) => ({ ...(await original<typeof import('./trainer-store')>()), recordEvent: vi.fn() }));

import { createBattleSession } from './box-battle-session';
import type { BattleSessionHost, BattleSessionUi, StagePhase } from './box-battle-session';
import { boxPvp } from './box-pvp-store';
import { pendingChallenge } from './league-store';
import { recordEvent } from './trainer-store';
import { resetRoster, setSlot } from './roster-store';
import { profile } from './profile-store';
import { coins } from './wallet';

const gifSource = { kind: 'gif', gif: { width: 1, height: 1, frames: [] } } as unknown as CreatureEntry['source'];

function entry(id: string, dexId = 1): CreatureEntry {
  return { info: { id, name: id.toUpperCase(), dexId, detail: 'Teste' }, source: gifSource };
}

interface FakeCreature { info: CreatureEntry['info']; setForm: ReturnType<typeof vi.fn>; restoreForm: ReturnType<typeof vi.fn> }

function fakeBox(): RunningBox & { startBattleCalls: { fighters: readonly Fighter[]; plan: unknown }[]; results: BattleResult[]; creatures: FakeCreature[]; fail: { startBattle: boolean } } {
  const box = {
    startBattleCalls: [] as { fighters: readonly Fighter[]; plan: unknown }[],
    results: [] as BattleResult[],
    creatures: [] as FakeCreature[],
    fail: { startBattle: false },
    scene: { get creatureList() { return box.creatures; } },
    setCreatures: vi.fn((entries: CreatureEntry[]) => {
      box.creatures = entries.map((e) => ({ info: e.info, setForm: vi.fn(), restoreForm: vi.fn() }));
    }),
    unlockAudio: vi.fn(),
    stopBattle: vi.fn(),
    startBattle: vi.fn((fighters: readonly Fighter[], plan?: { teams?: number[]; relay?: boolean; initialHp?: number[] }, rng?: () => number) => {
      if (box.fail.startBattle) throw new Error('cena indisponível');
      box.startBattleCalls.push({ fighters, plan });
      const result = simulateBattle(fighters, rng ?? seededRng(3), { teams: plan?.teams, relay: plan?.relay, initialHp: plan?.initialHp });
      box.results.push(result);
      return result;
    }),
  };
  return box as never;
}

const sessions: ReturnType<typeof createBattleSession>[] = [];

function setup(ids: string[]) {
  const box = fakeBox();
  const entries = ids.map((id, i) => entry(id, i + 1));
  box.setCreatures(entries);
  const state = { box: box as RunningBox | null, disposed: false, fullscreen: false };
  const calls = { populate: 0, toggle: 0, exit: 0, modes: 0, summary: 0, sheets: 0, refresh: 0 };
  const host: BattleSessionHost = {
    box: () => state.box,
    disposed: () => state.disposed,
    entries: () => entries,
    populate: async () => { calls.populate++; },
    shown: (_id, real) => real,
    bondOf: () => 0,
    refreshVillage: () => { calls.refresh++; },
    fullscreen: {
      active: () => state.fullscreen,
      toggle: () => { calls.toggle++; state.fullscreen = !state.fullscreen; },
      exit: () => { calls.exit++; state.fullscreen = false; },
    },
    closeSummary: () => { calls.summary++; },
    closeSheets: () => { calls.sheets++; },
    openModes: () => { calls.modes++; },
  };
  const ui: BattleSessionUi = { error: ref(''), hint: ref(''), phase: ref<StagePhase>('running'), endlessShortcut: ref(null), battleShortcut: ref(true) };
  const session = createBattleSession(host, ui);
  sessions.push(session);
  return { box, entries, state, calls, ui, session };
}

const finish = async (session: ReturnType<typeof setup>['session']) => {
  session.battleHud.value = { phase: 'finished' } as BattleHud;
  await nextTick();
};

function team(name: string, ids: string[]): BoxPvpTeam {
  return {
    name,
    trainer: 'red',
    mons: ids.map((id, i) => ({
      id, name: id.toUpperCase(), sprite: 10 + i, shiny: false,
      fighter: buildFighter({ id, name: id.toUpperCase(), profile: { dexId: 10 + i, types: ['normal'], stats: { hp: 60, attack: 60, defense: 60, spAttack: 60, spDefense: 60, speed: 60 + i } }, card: null, gameMoves: [] }),
    })),
  };
}

beforeEach(() => {
  localStorage.clear();
  resetRoster();
  pendingChallenge.value = null;
  boxPvp.peer = null;
  boxPvp.role = null;
  boxPvp.mine = null;
  boxPvp.friend = null;
  boxPvp.pending = null;
  vi.mocked(recordEvent).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  for (const session of sessions.splice(0)) session.dispose();
});

describe('batalha comum da Caixa', () => {
  it('todos da caixa lutam: pede a tela cheia, libera o áudio, mostra o resumo e limpa os avisos', async () => {
    const { box, calls, ui, session } = setup(['a', 'b', 'c']);
    await session.startBattle();
    expect(box.unlockAudio).toHaveBeenCalledTimes(1);
    expect(box.startBattleCalls).toHaveLength(1);
    expect(box.startBattleCalls[0]!.fighters).toHaveLength(3);
    expect(box.startBattleCalls[0]!.plan).toBeUndefined();
    expect(session.battleSummary.value?.mode).toBe('royale');
    expect(session.battleSummary.value?.turns).toBeGreaterThan(0);
    expect(session.battleFighters.value).toHaveLength(3);
    expect(session.preparing.value).toBe(false);
    expect(ui.hint.value).toBe('');
    expect(ui.error.value).toBe('');
    expect(calls.toggle).toBe(1);
    expect(calls.sheets).toBe(1);
    // Dados que faltam viram valores neutros e a interface é avisada, nunca inventados em silêncio.
    expect(session.battleFighters.value.every((f) => f.notes.length > 0)).toBe(true);
  });

  it('com menos de 2 Pokémon não faz nada', async () => {
    const { box, calls, ui, session } = setup(['a']);
    await session.startBattle();
    expect(box.startBattleCalls).toHaveLength(0);
    expect(box.unlockAudio).not.toHaveBeenCalled();
    expect(calls.toggle).toBe(0);
    expect(ui.error.value).toBe('');
  });

  it('uma escalação que não dá mostra o motivo e abre a folha dos modos, sem começar', async () => {
    const { box, calls, ui, session } = setup(['a', 'b', 'c']);
    setSlot('a', 'out');
    setSlot('b', 'out');
    await session.startBattle();
    expect(box.startBattleCalls).toHaveLength(0);
    expect(ui.error.value).not.toBe('');
    expect(calls.modes).toBe(1);
    expect(calls.toggle).toBe(0);
  });

  it('quando a luta acaba rende o XP e as moedas do dia, uma vez só, e apaga o destaque do Fliperama', async () => {
    const { calls, ui, session } = setup(['a', 'b']);
    const before = coins.value;
    await session.startBattle();
    await finish(session);
    expect(recordEvent).toHaveBeenCalledWith({ type: 'battle', team: false });
    expect(coins.value).toBeGreaterThan(before);
    expect(session.megaNotes.value[0]?.text).toMatch(/moedas/);
    expect(ui.battleShortcut.value).toBe(false);
    expect(calls.refresh).toBe(1);
    session.battleHud.value = { phase: 'fight' } as BattleHud;
    await nextTick();
    await finish(session);
    expect(recordEvent).toHaveBeenCalledTimes(1);
  });

  it('se a cena falha ao começar: avisa em português, devolve as formas e sai da tela cheia que a batalha abriu', async () => {
    const { box, calls, ui, session } = setup(['a', 'b']);
    box.fail.startBattle = true;
    await session.startBattle();
    expect(ui.error.value).toBe('Não consegui começar a batalha: cena indisponível');
    expect(box.creatures.every((c) => c.restoreForm.mock.calls.length > 0)).toBe(true);
    expect(calls.toggle).toBe(1);
    expect(calls.exit).toBe(1);
    expect(session.preparing.value).toBe(false);
    expect(session.battleSummary.value).toBeNull();
  });

  it('não sai de uma tela cheia em que já estava antes de batalhar', async () => {
    const { state, calls, session } = setup(['a', 'b']);
    state.fullscreen = true;
    await session.startBattle();
    session.stopBattle();
    expect(calls.toggle).toBe(0);
    expect(calls.exit).toBe(0);
  });

  it('parar volta ao passeio: para a cena, devolve as formas, limpa tudo e sai da tela cheia que a batalha abriu', async () => {
    const { box, calls, session } = setup(['a', 'b']);
    await session.startBattle();
    session.battleHud.value = { phase: 'fight' } as BattleHud;
    session.stopBattle();
    expect(box.stopBattle).toHaveBeenCalled();
    expect(session.battleHud.value).toBeNull();
    expect(session.battleSummary.value).toBeNull();
    expect(calls.summary).toBeGreaterThan(0);
    expect(calls.exit).toBe(1);
  });

  it('se a tela foi desmontada no meio da preparação, nada começa', async () => {
    const { box, state, session } = setup(['a', 'b']);
    const started = session.startBattle();
    state.disposed = true;
    await started;
    expect(box.startBattleCalls).toHaveLength(0);
    expect(session.preparing.value).toBe(false);
  });

  it('marcar uma carta Mega liga e desliga a escolha', () => {
    const { session } = setup(['a', 'b']);
    session.toggleMega('a');
    expect(session.megaPicks.value).toEqual(['a']);
    session.toggleMega('a');
    expect(session.megaPicks.value).toEqual([]);
  });
});

describe('desafio da Liga', () => {
  it('monta a sua equipe contra a do líder, em revezamento, com os dois treinadores nos cantos', async () => {
    const { box, ui, session } = setup(['a', 'b', 'c']);
    pendingChallenge.value = 'gym-0';
    await session.startBattle();
    expect(box.setCreatures).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ info: expect.objectContaining({ id: 'a' }) })]));
    const call = box.startBattleCalls.at(-1)!;
    expect(call.fighters.length).toBeGreaterThan(3);
    expect(call.plan).toMatchObject({ relay: true, teamNames: [profile.name, 'Roark'] });
    expect(session.versus.value?.them).toMatchObject({ name: 'Roark', role: 'Líder de Ginásio' });
    expect(session.stageSpeech.value?.name).toBe('Líder de Ginásio Roark');
    expect(ui.hint.value).toBe('');
  });

  it('só termina a conta quando a luta acaba: vitória limpa o desafio, derrota mantém e mostra a revanche', async () => {
    const { box, session } = setup(['a', 'b', 'c']);
    pendingChallenge.value = 'gym-0';
    await session.startBattle();
    await finish(session);
    const won = box.results.at(-1)!.winningTeam === 0;
    expect(pendingChallenge.value).toBe(won ? null : 'gym-0');
    expect(session.megaNotes.value).toHaveLength(1);
    expect(session.stageSpeech.value?.text).toBe(won ? 'Você rachou a minha defesa! Leve a Insígnia Carvão, você mereceu.' : 'Boa luta! Treine sua equipe e volte quando quiser a revanche.');
    // O resultado da Liga já conta a batalha (por `recordLeagueResult`); a sessão não conta uma segunda vez como batalha comum.
    expect(recordEvent).not.toHaveBeenCalledWith({ type: 'battle', team: false });
  });

  it('um desafio bloqueado não começa', async () => {
    const { box, ui, session } = setup(['a', 'b']);
    pendingChallenge.value = 'gym-1';
    await session.startBattle();
    expect(ui.error.value).toBe('Esse desafio ainda está bloqueado: vença os anteriores primeiro.');
    expect(box.startBattleCalls).toHaveLength(0);
  });

  it('caixa vazia: pede cartas, e se o sprite do líder não chega avisa e recarrega a equipe', async () => {
    const { box, calls, ui, session } = setup(['a', 'b']);
    pendingChallenge.value = 'gym-0';
    const services = await import('./services');
    vi.mocked(services.fetchSprite).mockResolvedValue(null);
    await session.startBattle();
    expect(ui.error.value).toContain('Não consegui começar o desafio');
    expect(calls.populate).toBeGreaterThan(0);
    expect(calls.exit).toBe(1);
    expect(box.startBattleCalls).toHaveLength(0);
    vi.mocked(services.fetchSprite).mockImplementation(async (dex: number) => ({ kind: 'gif', url: `u/${dex}`, blob: new Blob([]) }) as never);
  });

  it('cancelar tira o desafio marcado', () => {
    const { session } = setup(['a', 'b']);
    pendingChallenge.value = 'gym-0';
    expect(session.challenge.value?.leader).toBe('Roark');
    session.cancelChallenge();
    expect(session.challenge.value).toBeNull();
  });
});

describe('corrida 6×6 da Arena', () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('sem exatamente 6 na equipe mostra o motivo e abre os modos', async () => {
    const { calls, ui, session } = setup(['a', 'b', 'c']);
    ui.endlessShortcut.value = 'formatacao';
    await session.startEndless('formatacao');
    expect(ui.error.value).toContain('exatamente 6');
    expect(calls.modes).toBe(1);
    expect(session.endlessRun.value).toBeNull();
  });

  it('a equipe da corrida acompanha a caixa: se ela terminou de carregar depois, a lista já vale', () => {
    const { entries, ui, session } = setup(six);
    ui.endlessShortcut.value = 'formatacao';
    const loaded = entries.splice(0);
    expect(session.endlessTeam()).toHaveLength(0);
    entries.push(...loaded);
    expect(session.endlessTeam()).toHaveLength(6);
    // Sem o atalho da Arena valem só os marcados como Vermelha na escalação.
    ui.endlessShortcut.value = null;
    expect(session.endlessTeam()).toHaveLength(0);
    setSlot('a', 0);
    expect(session.endlessTeam().map((e) => e.info.id)).toEqual(['a']);
  });

  it('começa a primeira onda com 6 contra 6, e a seguinte sai sozinha depois da vitória', async () => {
    vi.useFakeTimers();
    const { box, ui, session } = setup(six);
    ui.endlessShortcut.value = 'formatacao';
    session.startSelectedBattle();
    await vi.advanceTimersByTimeAsync(0);
    expect(box.startBattleCalls).toHaveLength(1);
    expect(box.startBattleCalls[0]!.fighters).toHaveLength(12);
    expect(box.startBattleCalls[0]!.plan).toMatchObject({ relay: true });
    expect(session.endlessRun.value?.mode).toBe('formatacao');
    expect(session.versus.value?.them.role).toBe('Arena digital');
    expect(session.preparing.value).toBe(false);
    const result = box.results[0]!;
    session.battleHud.value = { phase: 'finished' } as BattleHud;
    await nextTick();
    if (result.winningTeam === 0) {
      expect(session.megaNotes.value[0]?.text).toContain('vitória 1');
      await vi.advanceTimersByTimeAsync(1800);
      expect(box.startBattleCalls).toHaveLength(2);
      expect(box.startBattleCalls[1]!.fighters).toHaveLength(12);
    } else {
      expect(session.endlessRun.value?.stopped).toBe(true);
      await vi.advanceTimersByTimeAsync(5000);
      expect(box.startBattleCalls).toHaveLength(1);
    }
  });

  it('desistir encerra a corrida com o placar e sai da tela cheia', async () => {
    vi.useFakeTimers();
    const { box, calls, ui, session } = setup(six);
    ui.endlessShortcut.value = 'restauracao';
    await session.startEndless('restauracao');
    await vi.advanceTimersByTimeAsync(0);
    expect(session.endlessRun.value).not.toBeNull();
    session.stopBattle();
    expect(session.endlessRun.value).toBeNull();
    expect(session.megaNotes.value[0]?.text).toContain('você desistiu da corrida');
    expect(box.stopBattle).toHaveBeenCalled();
    expect(calls.exit).toBe(1);
  });
});

describe('PvP da Caixa', () => {
  const peer = () => ({ send: vi.fn(() => true) }) as never;

  it('o convidado não começa a luta; o anfitrião espera a equipe do amigo', async () => {
    const { ui, session } = setup(['a', 'b']);
    boxPvp.peer = peer();
    boxPvp.role = 'guest';
    await session.startBattle();
    expect(ui.error.value).toBe('No PvP quem começa a luta é o anfitrião.');
    boxPvp.role = 'host';
    await session.startBattle();
    expect(ui.error.value).toBe('Esperando a equipe do amigo chegar.');
  });

  it('anfitrião com as duas equipes: encena 1 contra 1 com a semente combinada e conta a vitória no fim', async () => {
    const { box, ui, session } = setup(['a', 'b']);
    boxPvp.peer = peer();
    boxPvp.role = 'host';
    boxPvp.mode = '1x1';
    boxPvp.mine = team('Eu', ['a']);
    boxPvp.friend = team('Ana', ['z']);
    await session.startBattle();
    // `startBoxPvp` sorteia a semente; a luta combinada é a mesma para os dois celulares.
    expect(box.startBattleCalls).toHaveLength(1);
    expect(box.startBattleCalls[0]!.fighters.map((f) => f.id)).toEqual(['h:a', 'g:z']);
    expect(box.startBattleCalls[0]!.plan).toMatchObject({ relay: true, teamNames: ['Eu', 'Ana'] });
    expect(session.versus.value?.them.role).toBe('PvP · 1 contra 1');
    expect(ui.error.value).toBe('');
    const won = box.results[0]!.winningTeam === 0;
    await finish(session);
    expect(recordEvent).toHaveBeenCalledWith({ type: 'pvp', won });
    expect(session.megaNotes.value[0]?.text).toBe(won ? 'Você venceu Ana!' : 'Ana venceu desta vez.');
  });

  it('o resultado é o mesmo nos dois celulares: mesma semente, mesma luta', async () => {
    boxPvp.peer = peer();
    boxPvp.role = 'guest';
    boxPvp.mine = team('Ana', ['z']);
    boxPvp.friend = team('Eu', ['a']);
    boxPvp.pending = { mode: '1x1', seed: 99, host: 1, guest: 1 };
    const guestSide = setup(['z']);
    guestSide.ui.phase.value = 'placing';
    guestSide.ui.phase.value = 'running';
    await vi.waitFor(() => expect(guestSide.box.results).toHaveLength(1));
    const guestResult = guestSide.box.results[0]!;
    const direct = simulateBattle(guestSide.box.startBattleCalls[0]!.fighters, seededRng(99), { teams: [0, 1], relay: true });
    expect(guestResult.winner).toBe(direct.winner);
    expect(guestResult.turns).toHaveLength(direct.turns.length);
    expect(guestSide.session.versus.value?.me.name).toBe('Eu');
  });

  it('falha ao baixar o sprite do amigo: avisa e recarrega a sua equipe', async () => {
    const { calls, ui, session } = setup(['a', 'b']);
    boxPvp.peer = peer();
    boxPvp.role = 'host';
    boxPvp.mine = team('Eu', ['a']);
    boxPvp.friend = team('Ana', ['z']);
    const services = await import('./services');
    vi.mocked(services.fetchSprite).mockResolvedValueOnce(null);
    await session.startBattle();
    expect(ui.error.value).toContain('Não consegui montar a luta do PvP');
    expect(calls.populate).toBeGreaterThan(0);
  });
});

describe('fechar o palco', () => {
  it('reset esquece a corrida, os resumos e a tela cheia da batalha', async () => {
    vi.useFakeTimers();
    const { calls, ui, session } = setup(['a', 'b', 'c', 'd', 'e', 'f']);
    ui.endlessShortcut.value = 'formatacao';
    await session.startEndless('formatacao');
    await vi.advanceTimersByTimeAsync(0);
    session.reset();
    expect(session.endlessRun.value).toBeNull();
    expect(session.battleSummary.value).toBeNull();
    expect(session.battleHud.value).toBeNull();
    expect(session.battleFighters.value).toEqual([]);
    expect(session.preparing.value).toBe(false);
    // A tela cheia deixa de ser "da batalha": parar depois não tenta sair dela.
    session.stopBattle();
    expect(calls.exit).toBe(0);
    session.dispose();
  });
});
