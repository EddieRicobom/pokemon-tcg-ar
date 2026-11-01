import { computed, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { fetchSprite, loadBattle, prepareMegaFor } from './services';
import { cardJourneyError, recordCardVictories } from './card-evolution-store';
import { battleWinners } from '../core/card-evolution';
import type { CardCompanion } from '../core/card-evolution';
import { challengePlan, isLeaderCreature, leaderFighter, leaderLoader, loadArenaEntries, loadLeaderEntries, MAX_CHALLENGE_TEAM } from './challenge-battle';
import { league, pendingChallenge, recordLeagueResult } from './league-store';
import { profile } from './profile-store';
import { challengeById, statusOf } from '../core/league';
import type { Challenge } from '../core/league';
import { trainerSpriteUrl } from '../core/trainer-sprites';
import type { CreatureEntry } from '../box/box-scene';
import type { BattleResult } from '../core/battle';
import { prepareFighters } from './battle-setup';
import { savedBattleMoves } from './moveset-store';
import { megaAwareLoader, planMegaBattle } from './mega-battle';
import { rosterFor, slotOf } from './roster-store';
import { battleMode } from './battle-mode-store';
import { recordEvent } from './trainer-store';
import { coins, spendCoins, withVillage } from './wallet';
import { BATTLE_REWARDS_PER_DAY, battleRewardsLeft, claimBattleReward } from '../core/village/life';
import { dayKey } from '../core/trainer';
import { boxPvp, sendTeam, startBoxPvp, syncPvpStart } from './box-pvp-store';
import type { BoxPvpStart } from './box-pvp-store';
import { boxPvpBattle, BOX_PVP_LABELS_PT, BOX_PVP_MAX } from '../pvp/box-wire';
import type { BoxPvpMon, BoxPvpTeam } from '../pvp/box-wire';
import { browserDecoders } from '../box/load-creatures';
import type { RunningBox } from '../box/start-box';
import type { BattleHud } from '../box/battle-director';
import { TEAM_NAMES_PT, planBattle, rosterBlocker, seededRng, summarizeBattle } from '../core/battle';
import type { BattleMode, BattleSummary, Fighter } from '../core/battle';
import { abandonEndlessArena, ENDLESS_ARENA_LABELS, nextEndlessOpponent, resolveEndlessBattle, startEndlessArena } from '../core/endless-arena';
import type { EndlessArenaMode, EndlessArenaRun } from '../core/endless-arena';

/**
 * A sessão de batalha da Caixa: tudo o que acontece entre tocar em «Batalhar» e a luta acabar (batalha comum, desafio da
 * Liga, corrida 6×6 da Arena e PvP), separado da tela. Quem hospeda (a Arena 3D) cuida da
 * câmera e da cena e entrega à sessão, por `BattleSessionHost`, só o que ela precisa: a cena em execução, os Pokémon
 * carregados, a tela cheia e as folhas abertas. Não toca em DOM, câmera nem WebGL.
 */

export type StagePhase = 'idle' | 'starting' | 'placing' | 'running';

export interface BattleNote {
  text: string;
  tone: 'ok' | 'warn';
}

export interface BattleSummaryView {
  winner: string;
  turns: number;
  rounds: number;
  stats: BattleSummary;
  mode: BattleMode;
}

export interface VersusView {
  me: { name: string; sprite: string };
  them: { name: string; sprite: string; role: string };
}

export interface BattleSessionHost {
  /** A cena em execução (null com o palco fechado). */
  box(): RunningBox | null;
  /** A tela foi desmontada: nada mais deve ser feito. */
  disposed(): boolean;
  /** Os Pokémon da sua equipe que estão na caixa (sem os do adversário). */
  entries(): CreatureEntry[];
  /** Recarrega a equipe na caixa (tira o adversário). */
  populate(): Promise<void>;
  /** O nome na tela: o apelido da Vila, se tem, ou o da carta. */
  shown(id: string, real: string): string;
  /** Intimidade (0 a 4) deste Pokémon com você. */
  bondOf(id: string): number;
  /** Relê o arquivo da Vila (a carteira pode ter gravado moedas nele). */
  refreshVillage(): void;
  /** Tela cheia: a batalha entra nela (se ainda não está) e sai só se foi ela que entrou. */
  fullscreen: { active(): boolean; toggle(): void; exit(): void };
  /** Fecha o resumo. */
  closeSummary(): void;
  /** Fecha as folhas de filtros, equipe, ajustes e modos (a batalha começa limpa). */
  closeSheets(): void;
  /** Abre a folha dos modos (para mostrar por que a escalação não dá). */
  openModes(): void;
}

export interface BattleSessionUi {
  error: Ref<string>;
  hint: Ref<string>;
  phase: Ref<StagePhase>;
  /** Vindo da Arena (`?formatacao=1` / `?restauracao=1`): o botão principal começa a corrida 6×6. */
  endlessShortcut: Ref<EndlessArenaMode | null>;
  /** Vindo do Fliperama (`?batalha=1`): o Batalhar fica em destaque até a primeira luta acabar. */
  battleShortcut: Ref<boolean>;
}

export async function decodeSprite(sprite: { kind: 'gif' | 'static'; blob: Blob }) {
  return sprite.kind === 'gif'
    ? ({ kind: 'gif', gif: await browserDecoders.gif(sprite.blob) } as const)
    : ({ kind: 'image', image: await browserDecoders.image(sprite.blob) } as const);
}

async function decodeMegaSprite(ready: { sprite: { kind: 'gif' | 'static'; blob: Blob } }) {
  return decodeSprite(ready.sprite);
}

export function createBattleSession(host: BattleSessionHost, ui: BattleSessionUi) {
  const { error, hint, phase, endlessShortcut, battleShortcut } = ui;

  const battleHud = ref<BattleHud | null>(null);
  const preparing = ref(false);
  const battleFighters = ref<Fighter[]>([]);
  const battleSummary = ref<BattleSummaryView | null>(null);
  /** Cartas Mega marcadas para mudar de forma na próxima batalha (cada uma custa MEGA_ENERGY_COST moedas). */
  const megaPicks = ref<string[]>([]);
  /** O que aconteceu com a forma Mega na última batalha montada (quem trocou, quem ficou normal e por quê). */
  const megaNotes = ref<BattleNote[]>([]);
  let megaNotesTimer: ReturnType<typeof setTimeout> | null = null;
  /** Saldo único de moedas (`app/wallet.ts`): paga a forma Mega (antes era a energia do Treinador). */
  const energy = computed(() => coins.value);

  /** Entramos em tela cheia só para a batalha (e saímos dela ao parar). */
  let fullscreenForBattle = false;
  function enterBattleFullscreen(): void {
    if (host.fullscreen.active()) return;
    fullscreenForBattle = true;
    host.fullscreen.toggle();
  }
  function leaveBattleFullscreen(): void {
    if (!fullscreenForBattle) return;
    fullscreenForBattle = false;
    host.fullscreen.exit();
  }

  function toggleMega(id: string): void {
    megaPicks.value = megaPicks.value.includes(id) ? megaPicks.value.filter((x) => x !== id) : [...megaPicks.value, id];
  }
  function showMegaNotes(notes: BattleNote[]): void {
    megaNotes.value = notes;
    if (megaNotesTimer) clearTimeout(megaNotesTimer);
    megaNotesTimer = notes.length > 0 ? setTimeout(() => (megaNotes.value = []), 9000) : null;
  }

  /** Põe a intimidade nos lutadores da sua equipe (crítico e "aguentou firme"). */
  function withBond(fighters: Fighter[]): Fighter[] {
    return fighters.map((f) => {
      const bond = host.bondOf(f.id);
      return bond > 0 ? { ...f, bond } : f;
    });
  }

  // ---- Liga: desafio de Ginásio, Elite 4 ou Campeã (escolhido no Treinador)
  const challenge = computed<Challenge | null>(() => (pendingChallenge.value ? challengeById(pendingChallenge.value) : null));
  /** Os dois treinadores da batalha em cena (desafio ou PvP): aparecem nos cantos do visor. */
  const versus = ref<VersusView | null>(null);
  /** Fala dentro do visor (funciona também em tela cheia, onde o resto do app não aparece). */
  const stageSpeech = ref<{ name: string; text: string; sprite: string } | null>(null);
  let stageSpeechTimer: ReturnType<typeof setTimeout> | null = null;
  let activeChallenge: Challenge | null = null;
  let lastResult: BattleResult | null = null;
  const endlessRun = ref<EndlessArenaRun | null>(null);
  let endlessEntries: CreatureEntry[] = [];
  let endlessFighters: Fighter[] = [];
  let endlessTimer: ReturnType<typeof setTimeout> | null = null;

  function clearEndlessTimer(): void {
    if (!endlessTimer) return;
    clearTimeout(endlessTimer);
    endlessTimer = null;
  }

  const endlessLabel = computed(() => endlessRun.value ? ENDLESS_ARENA_LABELS[endlessRun.value.mode] : null);

  /** Encerra só a corrida contínua; a Caixa continua no chão para o jogador decidir o próximo passo. */
  function finishEndlessRun(reason: string): void {
    const run = endlessRun.value;
    if (!run) return;
    clearEndlessTimer();
    const ended = abandonEndlessArena(run);
    const label = ENDLESS_ARENA_LABELS[ended.mode].title;
    showMegaNotes([{ text: `${label}: ${reason} Placar final ${ended.score} · ${ended.wins} vitória${ended.wins === 1 ? '' : 's'}.`, tone: ended.wins > 0 ? 'ok' : 'warn' }]);
    endlessRun.value = null;
    endlessEntries = [];
    endlessFighters = [];
  }

  /** Uma falha de carregamento não troca silenciosamente a corrida por uma batalha comum: ela fica encerrada até Desistir. */
  function interruptEndlessRun(reason: string): void {
    const run = endlessRun.value;
    if (!run) return;
    clearEndlessTimer();
    const ended = abandonEndlessArena(run);
    const label = ENDLESS_ARENA_LABELS[ended.mode].title;
    endlessRun.value = ended;
    showMegaNotes([{ text: `${label}: ${reason} Placar ${ended.score} · ${ended.wins} vitória${ended.wins === 1 ? '' : 's'}.`, tone: ended.wins > 0 ? 'ok' : 'warn' }]);
  }

  function say(name: string, text: string, sprite: string, ms = 7000): void {
    stageSpeech.value = { name, text, sprite };
    if (stageSpeechTimer) clearTimeout(stageSpeechTimer);
    stageSpeechTimer = setTimeout(() => (stageSpeech.value = null), ms);
  }

  function cancelChallenge(): void {
    pendingChallenge.value = null;
  }

  /** Tira os Pokémon do adversário da caixa e volta a sua equipe. */
  async function endVersus(): Promise<void> {
    if (!versus.value && !(host.box()?.scene.creatureList.some((c) => isLeaderCreature(c.info.id)) ?? false)) return;
    versus.value = null;
    activeChallenge = null;
    activePvp = null;
    await host.populate();
  }

  // ---- PvP da Caixa (dois celulares)
  const pvpOn = computed(() => boxPvp.peer !== null);
  let activePvp: { myTeam: number; friend: string } | null = null;
  let pvpTeamKey = '';
  let pvpFighters: Fighter[] = [];

  /** Monta (uma vez por equipe) os lutadores da sua equipe e manda ao amigo, com o aviso de caixa no chão. */
  async function syncPvpTeam(): Promise<void> {
    if (!boxPvp.peer) return;
    const mine = host.entries().slice(0, BOX_PVP_MAX);
    if (mine.length === 0) return;
    const key = mine.map((e) => e.info.id).join('|');
    if (key !== pvpTeamKey) {
      pvpTeamKey = key;
      pvpFighters = withBond(await prepareFighters(mine.map((e) => ({ id: e.info.id, name: host.shown(e.info.id, e.info.name), dexId: e.info.dexId, moves: savedBattleMoves(e.info.id, e.info.dexId) })), loadBattle));
      if (key !== pvpTeamKey) return;
    }
    const mons: BoxPvpMon[] = mine.map((e, i) => ({ id: e.info.id, name: host.shown(e.info.id, e.info.name), sprite: e.info.dexId ?? 1, shiny: e.info.shiny === true, fighter: pvpFighters[i]! }));
    const team: BoxPvpTeam = { name: profile.name, trainer: profile.sprite, mons };
    sendTeam(team, phase.value === 'running');
  }

  const stopWatchers: (() => void)[] = [];
  stopWatchers.push(watch(() => [boxPvp.peer, phase.value] as const, () => void syncPvpTeam()));

  /** Encena a luta combinada: as duas equipes na caixa, na ordem anfitrião → convidado, com a semente combinada. */
  async function runPvp(start: BoxPvpStart): Promise<void> {
    const current = host.box();
    const mine = boxPvp.mine;
    const friend = boxPvp.friend;
    if (!current || !mine || !friend || !boxPvp.role || preparing.value) return;
    boxPvp.pending = null;
    const hostTeam = boxPvp.role === 'host' ? mine : friend;
    const guestTeam = boxPvp.role === 'host' ? friend : mine;
    const battle = boxPvpBattle(hostTeam, guestTeam, { host: start.host, guest: start.guest });
    preparing.value = true;
    error.value = '';
    hint.value = `Chamando a equipe de ${friend.name}…`;
    enterBattleFullscreen();
    try {
      if (versus.value) {
        current.stopBattle();
        await endVersus();
      }
      const myIds = new Set(mine.mons.map((m) => m.id));
      const isMine = (k: number) => (boxPvp.role === 'host' ? k < start.host : k >= start.host);
      const entries: CreatureEntry[] = [];
      for (let k = 0; k < battle.mons.length; k++) {
        const m = battle.mons[k]!;
        const own = isMine(k) && myIds.has(m.id) ? host.entries().find((e) => e.info.id === m.id) : undefined;
        const info = { id: m.fighter.id, name: m.name, dexId: m.sprite, detail: isMine(k) ? mine.name : friend.name, shiny: m.shiny };
        if (own) {
          entries.push({ info, source: own.source });
          continue;
        }
        const sprite = await fetchSprite(m.sprite, undefined, { shiny: m.shiny });
        if (!sprite) throw new Error(`sem sprite para ${m.name}`);
        entries.push({ info, source: await decodeSprite(sprite) });
      }
      if (host.disposed() || host.box() !== current) return;
      current.setCreatures(entries);
      current.unlockAudio();
      // Largada em conjunto: espera o amigo terminar de montar também e começa junto com ele.
      hint.value = `Esperando ${friend.name} ficar pronto…`;
      const together = await syncPvpStart(start.seed, true);
      if (host.disposed() || host.box() !== current) return;
      if (!together) {
        error.value = `${friend.name} não ficou pronto a tempo (ou a conexão caiu). A luta não começou; ela não se perde, é só tocar em Batalhar de novo.`;
        activePvp = null;
        await host.populate();
        return;
      }
      battleCounted = false;
      activePvp = { myTeam: boxPvp.role === 'host' ? 0 : 1, friend: friend.name };
      const result = current.startBattle(battle.fighters, battle.plan, seededRng(start.seed));
      lastResult = result;
      battleFighters.value = battle.fighters;
      battleSummary.value = {
        mode: 'tres',
        winner: battle.plan.teamNames[result.winningTeam ?? 0] ?? '',
        turns: result.turns.length,
        rounds: result.turns.at(-1)?.round ?? 0,
        stats: summarizeBattle(battle.fighters, result),
      };
      // Os cantos seguem as cores das equipes: anfitrião à esquerda (vermelha), convidado à direita (azul).
      versus.value = {
        me: { name: hostTeam.name, sprite: trainerSpriteUrl(hostTeam.trainer) },
        them: { name: guestTeam.name, sprite: trainerSpriteUrl(guestTeam.trainer), role: `PvP · ${BOX_PVP_LABELS_PT[start.mode].title}` },
      };
    } catch (e) {
      error.value = `Não consegui montar a luta do PvP: ${e instanceof Error ? e.message : String(e)}`;
      activePvp = null;
      void syncPvpStart(start.seed, false);
      await host.populate();
    } finally {
      preparing.value = false;
      hint.value = '';
    }
  }

  // O convidado encena quando a luta chega e a caixa dele está no chão.
  stopWatchers.push(watch(
    () => [boxPvp.pending, phase.value] as const,
    ([pending, ph]) => {
      if (pending && boxPvp.role === 'guest' && ph === 'running') void runPvp(pending);
    },
  ));

  /**
   * A Arena usa deliberadamente os seis marcados como Vermelha: a escalação deixa de ser um detalhe escondido. É uma função
   * (não um `computed`): a lista de Pokémon da caixa não é reativa, e um valor guardado ficava vazio para sempre se a caixa
   * fosse colocada antes de a equipe terminar de carregar.
   */
  function endlessTeam(): CreatureEntry[] {
    return endlessShortcut.value ? host.entries().slice(0, MAX_CHALLENGE_TEAM) : host.entries().filter((entry) => slotOf(entry.info.id) === 0);
  }
  const battling = computed(() => battleHud.value !== null);

  /** A batalha em cena já rendeu XP ao Treinador (só conta quando termina). */
  let battleCounted = false;
  let battleCompanions: CardCompanion[] = [];
  stopWatchers.push(watch(
    () => battleHud.value?.phase,
    (hudPhase) => {
      if (hudPhase !== 'finished' || battleCounted) return;
      battleCounted = true;
      if (endlessRun.value && lastResult) {
        const previous = endlessRun.value;
        const next = resolveEndlessBattle(previous, endlessFighters, lastResult);
        endlessRun.value = next;
        const label = ENDLESS_ARENA_LABELS[next.mode].title;
        if (next.stopped) {
          showMegaNotes([{ text: `${label}: a corrida terminou. Placar ${next.score} · ${next.wins} vitória${next.wins === 1 ? '' : 's'}.`, tone: next.wins > 0 ? 'ok' : 'warn' }]);
          return;
        }
        showMegaNotes([{ text: `${label}: vitória ${next.wins}! Próxima batalha em instantes · ${next.score} pontos.`, tone: 'ok' }]);
        clearEndlessTimer();
        endlessTimer = setTimeout(() => void startEndlessWave(), 1800);
        return;
      }
      if (activePvp && lastResult) {
        const won = lastResult.winningTeam === activePvp.myTeam;
        recordEvent({ type: 'pvp', won });
        showMegaNotes([{ text: won ? `Você venceu ${activePvp.friend}!` : `${activePvp.friend} venceu desta vez.`, tone: won ? 'ok' : 'warn' }]);
        return;
      }
      const ch = activeChallenge;
      if (ch && lastResult) {
        const won = lastResult.winningTeam === 0;
        const outcome = recordLeagueResult(ch, won);
        say(`${ch.role} ${ch.leader}`, won ? ch.defeat : 'Boa luta! Treine sua equipe e volte quando quiser a revanche.', trainerSpriteUrl(ch.sprite), 9000);
        showMegaNotes([{ text: outcome.message, tone: won ? 'ok' : 'warn' }]);
        if (won) pendingChallenge.value = null;
        return;
      }
      if (lastResult) {
        const winners = new Set(battleWinners(battleFighters.value, lastResult));
        if (!recordCardVictories(battleCompanions.filter((mon) => winners.has(mon.id)), 'battle')) {
          error.value = cardJourneyError.value;
        }
      }
      recordEvent({ type: 'battle', team: battleSummary.value ? battleSummary.value.mode !== 'royale' : false });
      // Moedas da Vila: cada batalha terminada rende moedas, até BATTLE_REWARDS_PER_DAY vezes por dia.
      // Pela carteira (saldo único): grava na Vila viva ou na guardada, e o saldo mostrado acompanha.
      const today = dayKey(new Date());
      let gained = 0;
      let left = 0;
      withVillage((v) => {
        gained = claimBattleReward(v, today);
        left = battleRewardsLeft(v, today);
        return gained > 0;
      });
      host.refreshVillage();
      if (gained > 0) {
        showMegaNotes([{ text: `+${gained} moedas! (${BATTLE_REWARDS_PER_DAY - left} de ${BATTLE_REWARDS_PER_DAY} hoje)`, tone: 'ok' }]);
      } else {
        showMegaNotes([{ text: `As batalhas de hoje já renderam as moedas (${BATTLE_REWARDS_PER_DAY} de ${BATTLE_REWARDS_PER_DAY}). Amanhã tem mais.`, tone: 'warn' }]);
      }
      battleShortcut.value = false;
    },
  ));

  /** Desafio da Liga: até 6 da sua caixa contra a equipe do líder, em revezamento. */
  async function startChallenge(ch: Challenge): Promise<void> {
    const current = host.box();
    if (!current || preparing.value) return;
    if (statusOf(league.value, ch) === 'locked') {
      error.value = 'Esse desafio ainda está bloqueado: vença os anteriores primeiro.';
      return;
    }
    current.unlockAudio();
    if (versus.value) {
      current.stopBattle();
      await endVersus();
    }
    const mine = host.entries().slice(0, MAX_CHALLENGE_TEAM);
    if (mine.length === 0) {
      error.value = 'Sua Caixa está vazia: escaneie cartas ou escolha moradores da Vila antes do desafio.';
      return;
    }
    preparing.value = true;
    host.closeSummary();
    host.closeSheets();
    enterBattleFullscreen();
    error.value = '';
    hint.value = `Chamando a equipe de ${ch.leader}…`;
    try {
      const leader = await loadLeaderEntries(ch, { fetchSprite: (dex) => fetchSprite(dex), decode: decodeSprite });
      if (leader.entries.length === 0) throw new Error('não consegui baixar a equipe do líder (sem conexão?)');
      if (host.disposed() || host.box() !== current) return;
      current.setCreatures([...mine, ...leader.entries]);
      hint.value = 'Preparando a batalha: buscando atributos e golpes…';
      const creatures = current.scene.creatureList;
      const raw = await prepareFighters(creatures.map((c) => ({ id: c.info.id, name: host.shown(c.info.id, c.info.name), dexId: c.info.dexId, moves: savedBattleMoves(c.info.id, c.info.dexId) })), leaderLoader(loadBattle));
      if (host.disposed() || host.box() !== current) return;
      const fighters = raw.map((f, i) => (i >= mine.length ? leaderFighter(f, ch.power) : withBond([f])[0]!));
      const plan = challengePlan(mine.length, leader.entries.length, ch, profile.name);
      battleCounted = false;
      activeChallenge = ch;
      const result = current.startBattle(fighters, plan);
      lastResult = result;
      battleFighters.value = fighters;
      battleSummary.value = {
        mode: 'tres',
        winner: result.winningTeam === 0 ? profile.name : ch.leader,
        turns: result.turns.length,
        rounds: result.turns.at(-1)?.round ?? 0,
        stats: summarizeBattle(fighters, result),
      };
      versus.value = { me: { name: profile.name, sprite: trainerSpriteUrl(profile.sprite) }, them: { name: ch.leader, sprite: trainerSpriteUrl(ch.sprite), role: ch.role } };
      say(`${ch.role} ${ch.leader}`, ch.intro, trainerSpriteUrl(ch.sprite));
      if (leader.failed.length > 0) showMegaNotes([{ text: `Não carregaram da equipe do líder: ${leader.failed.join(', ')}.`, tone: 'warn' }]);
    } catch (e) {
      error.value = `Não consegui começar o desafio: ${e instanceof Error ? e.message : String(e)}`;
      activeChallenge = null;
      await host.populate();
      leaveBattleFullscreen();
    } finally {
      preparing.value = false;
      hint.value = '';
    }
  }

  /** Abre uma corrida 6×6 da Arena. A equipe fica fixa, mas o oponente é materializado de verdade a cada onda. */
  async function startEndless(mode: EndlessArenaMode): Promise<void> {
    const current = host.box();
    if (!current || preparing.value || pvpOn.value) return;
    const mine = endlessTeam();
    if (mine.length !== MAX_CHALLENGE_TEAM) {
      error.value = endlessShortcut.value
        ? 'A Arena contínua precisa de uma equipe de batalha com exatamente 6 Pokémon. Volte à Arena para organizá-la.'
        : 'A Arena contínua precisa de exatamente 6 Pokémon marcados em Vermelha na escalação.';
      host.openModes();
      return;
    }
    current.unlockAudio();
    if (versus.value) {
      current.stopBattle();
      await endVersus();
    }
    pendingChallenge.value = null;
    preparing.value = true;
    host.closeSummary();
    host.closeSheets();
    enterBattleFullscreen();
    error.value = '';
    hint.value = 'Conferindo a sua equipe de 6 para a Arena…';
    try {
      const fighters = withBond(await prepareFighters(mine.map((c) => ({ id: c.info.id, name: host.shown(c.info.id, c.info.name), dexId: c.info.dexId, moves: savedBattleMoves(c.info.id, c.info.dexId) })), loadBattle));
      if (host.disposed() || host.box() !== current) return;
      const run = startEndlessArena(mode, fighters);
      if (!run) throw new Error('a sua equipe precisa ter exatamente 6 Pokémon');
      endlessEntries = mine;
      endlessFighters = fighters;
      endlessRun.value = run;
      await startEndlessWave();
    } catch (e) {
      finishEndlessRun('não foi possível preparar a equipe.');
      error.value = `Não consegui começar a Arena: ${e instanceof Error ? e.message : String(e)}`;
      leaveBattleFullscreen();
    } finally {
      preparing.value = false;
      hint.value = '';
    }
  }

  /** Materializa a próxima equipe adversária e começa outra batalha automática sem curar indevidamente o jogador. */
  async function startEndlessWave(): Promise<void> {
    const current = host.box();
    const run = endlessRun.value;
    if (!current || !run || run.stopped || preparing.value && endlessFighters.length === 0) return;
    clearEndlessTimer();
    preparing.value = true;
    error.value = '';
    const label = ENDLESS_ARENA_LABELS[run.mode].title;
    hint.value = `${label}: escolhendo o próximo treinador…`;
    try {
      const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff) ^ (run.battles + 1) * 0x45d9f3b) >>> 0;
      const opponent = nextEndlessOpponent(seededRng(seed));
      const loaded = await loadArenaEntries(run.battles + 1, opponent.trainer, opponent.dexIds, { fetchSprite: (dex) => fetchSprite(dex), decode: decodeSprite });
      if (loaded.entries.length !== MAX_CHALLENGE_TEAM) {
        const missing = loaded.failed.length > 0 ? loaded.failed.join(', ') : 'a equipe adversária completa';
        throw new Error(`a onda não abriu porque não carregou: ${missing}`);
      }
      if (host.disposed() || host.box() !== current || endlessRun.value !== run || run.stopped) return;
      hint.value = 'Preparando atributos e golpes da próxima equipe…';
      current.setCreatures([...endlessEntries, ...loaded.entries]);
      const creatures = current.scene.creatureList;
      const raw = await prepareFighters(creatures.map((c) => ({ id: c.info.id, name: host.shown(c.info.id, c.info.name), dexId: c.info.dexId, moves: savedBattleMoves(c.info.id, c.info.dexId) })), leaderLoader(loadBattle));
      if (host.disposed() || host.box() !== current || endlessRun.value !== run || run.stopped) return;
      if (raw.length !== MAX_CHALLENGE_TEAM * 2) throw new Error('a equipe adversária não ficou completa');
      const power = Math.min(1.72, 1.2 + run.wins * 0.035);
      const foes = raw.slice(MAX_CHALLENGE_TEAM).map((fighter) => leaderFighter(fighter, power));
      const fighters = [...endlessFighters, ...foes];
      const plan = {
        picks: Array.from({ length: fighters.length }, (_, i) => i),
        teams: fighters.map((_, i) => i < MAX_CHALLENGE_TEAM ? 0 : 1),
        relay: true,
        initialHp: [...run.hp, ...foes.map((fighter) => fighter.maxHp)],
        teamNames: [profile.name, opponent.trainer],
        banner: { text: label, sub: `Batalha ${run.battles + 1} · ${run.wins} vitórias · ${run.score} pontos` },
      };
      battleCounted = false;
      activeChallenge = null;
      const result = current.startBattle(fighters, plan, seededRng(seed ^ 0x9e3779b9));
      lastResult = result;
      battleCompanions = [];
      battleFighters.value = fighters;
      battleSummary.value = {
        mode: 'tres',
        winner: result.winningTeam === 0 ? profile.name : opponent.trainer,
        turns: result.turns.length,
        rounds: result.turns.at(-1)?.round ?? 0,
        stats: summarizeBattle(fighters, result),
      };
      versus.value = { me: { name: profile.name, sprite: trainerSpriteUrl(profile.sprite) }, them: { name: opponent.trainer, sprite: trainerSpriteUrl('ace'), role: 'Arena digital' } };
      say(opponent.trainer, `Seis contra seis. Vamos ver até onde sua equipe aguenta!`, trainerSpriteUrl('ace'));
    } catch (e) {
      if (endlessRun.value === run) interruptEndlessRun('a conexão não conseguiu montar a próxima onda.');
      error.value = `Não consegui abrir a próxima batalha da Arena: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      preparing.value = false;
      hint.value = '';
    }
  }

  async function startBattle(): Promise<void> {
    if (pvpOn.value) {
      if (boxPvp.role !== 'host') {
        error.value = 'No PvP quem começa a luta é o anfitrião.';
        return;
      }
      const start = startBoxPvp();
      if (!start) {
        error.value = 'Esperando a equipe do amigo chegar.';
        return;
      }
      return runPvp(start);
    }
    if (challenge.value) return startChallenge(challenge.value);
    const current = host.box();
    if (!current || preparing.value) return;
    if (versus.value) {
      current.stopBattle();
      await endVersus();
    }
    const creatures = current.scene.creatureList;
    if (creatures.length < 2) return;
    const slots = rosterFor(creatures.map((c) => c.info.id));
    const blocker = rosterBlocker(battleMode.value, creatures.length, slots);
    if (blocker) {
      error.value = blocker;
      host.openModes();
      return;
    }
    // O navegador só libera o áudio dentro de um toque: isso vem antes de qualquer espera.
    current.unlockAudio();
    preparing.value = true;
    host.closeSummary();
    // A arena é pequena: a tela cheia (pedida já no toque, antes de esperar a rede) dá mais espaço para ver o que acontece.
    enterBattleFullscreen();
    error.value = '';
    hint.value = 'Preparando a batalha: buscando atributos e golpes…';
    host.closeSheets();
    try {
      // Todos da caixa lutam por padrão; equipes e 3x3 sorteiam os lados (e, no 3x3, quem entra) a cada batalha,
      // a menos que o jogador tenha montado a escalação (equipe fixa ou fora da luta).
      const plan = planBattle(battleMode.value, creatures.length, seededRng((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0), slots);
      const fighting = plan.picks.map((i) => creatures[i]!);
      // Forma Mega (só desta batalha): deixa tudo pronto antes; as moedas só são cobradas depois que a batalha começa.
      restoreForms(current);
      const wanted = fighting.filter((c) => c.info.mega === true && megaPicks.value.includes(c.info.id));
      if (wanted.length > 0) hint.value = 'Preparando a forma Mega…';
      const megaPlan = await planMegaBattle(
        wanted.map((c) => ({ id: c.info.id, name: c.info.name, baseDexId: c.info.dexId, shiny: c.info.shiny })),
        energy.value,
        { prepare: prepareMegaFor, decode: decodeMegaSprite },
      );
      const fighters = withBond(await prepareFighters(fighting.map((c) => ({ id: c.info.id, name: host.shown(c.info.id, c.info.name), dexId: c.info.dexId, moves: savedBattleMoves(c.info.id, c.info.dexId) })), megaAwareLoader(loadBattle, megaPlan.entries)));
      if (host.disposed() || host.box() !== current) return;
      battleCounted = false;
      for (const entry of megaPlan.entries) fighting.find((c) => c.info.id === entry.cardId)?.setForm(entry.source);
      let result;
      try {
        result = current.startBattle(fighters, plan.mode === 'royale' ? undefined : plan);
        lastResult = result;
        battleCompanions = fighting.flatMap((c) => c.info.dexId === undefined || c.info.digital ? [] : [{ id: c.info.id, dexId: c.info.dexId, name: c.info.name }]);
      } catch (e) {
        restoreForms(current);
        throw e;
      }
      const notes: BattleNote[] = megaPlan.notes.map((text) => ({ text, tone: 'warn' }));
      if (megaPlan.cost > 0) {
        if (spendCoins(megaPlan.cost)) {
          const names = megaPlan.entries.map((e) => fighting.find((c) => c.info.id === e.cardId)?.info.name ?? 'Pokémon').join(', ');
          notes.unshift({ text: `${names}: forma Mega só nesta batalha (−${megaPlan.cost} moedas).`, tone: 'ok' });
          megaPicks.value = megaPicks.value.filter((id) => !megaPlan.entries.some((e) => e.cardId === id));
        } else {
          notes.unshift({ text: 'As moedas acabaram antes de a batalha começar; nada foi cobrado.', tone: 'warn' });
        }
      }
      showMegaNotes(notes);
      battleFighters.value = fighters;
      battleSummary.value = {
        mode: plan.mode,
        winner: result.winningTeam === undefined ? (fighters[result.winner]?.name ?? '') : `${TEAM_NAMES_PT[result.winningTeam] ?? 'A equipe'} (${fighters[result.winner]?.name ?? ''})`,
        turns: result.turns.length,
        rounds: result.turns.at(-1)?.round ?? 0,
        stats: summarizeBattle(fighters, result),
      };
    } catch (e) {
      restoreForms(current);
      error.value = `Não consegui começar a batalha: ${e instanceof Error ? e.message : String(e)}`;
      leaveBattleFullscreen();
    } finally {
      preparing.value = false;
      hint.value = '';
    }
  }

  function startSelectedBattle(): void {
    if (endlessShortcut.value) void startEndless(endlessShortcut.value);
    else void startBattle();
  }

  /** Volta cada Pokémon à forma da carta (a Mega dura uma batalha só). */
  function restoreForms(running: RunningBox | null): void {
    for (const creature of running?.scene.creatureList ?? []) creature.restoreForm();
  }

  function stopBattle(): void {
    if (endlessRun.value) finishEndlessRun('você desistiu da corrida.');
    const box = host.box();
    box?.stopBattle();
    restoreForms(box);
    stageSpeech.value = null;
    void endVersus();
    battleHud.value = null;
    battleSummary.value = null;
    host.closeSummary();
    leaveBattleFullscreen();
  }

  /** O palco fechou: esquece a corrida, os resumos e a tela cheia da batalha (a cena em si quem para é o hospedeiro). */
  function reset(): void {
    clearEndlessTimer();
    endlessRun.value = null;
    endlessEntries = [];
    endlessFighters = [];
    battleFighters.value = [];
    battleHud.value = null;
    battleSummary.value = null;
    preparing.value = false;
    fullscreenForBattle = false;
  }

  /** A tela foi desmontada: solta os relógios e os observadores da sessão. */
  function dispose(): void {
    for (const stop of stopWatchers) stop();
    stopWatchers.length = 0;
    if (stageSpeechTimer) clearTimeout(stageSpeechTimer);
    if (megaNotesTimer) clearTimeout(megaNotesTimer);
    clearEndlessTimer();
  }

  return {
    battleHud, preparing, battleFighters, battleSummary, megaPicks, megaNotes, versus, stageSpeech, endlessRun, endlessLabel,
    challenge, pvpOn, battling, endlessTeam, energy,
    toggleMega, showMegaNotes, cancelChallenge, startBattle, startSelectedBattle, startEndless, stopBattle, restoreForms, syncPvpTeam,
    reset, dispose,
  };
}

export type BattleSession = ReturnType<typeof createBattleSession>;
