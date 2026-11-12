import type { SurvivorEnemy, SurvivorEvent, SurvivorState } from './survivor-types';
import { ARENA_H, ARENA_W, PLAYER_RADIUS } from './survivor-types';

/**
 * Eventos-relâmpago da Torre: momentos curtos que quebram o ritmo da corrida sem pausar o jogo.
 *
 *  - **Chuva de orbes**: orbes de XP de verdade caem do céu em volta de você, cada um com a sombra marcando onde vai cair.
 *  - **Revoada**: uma coluna de Pokémon frágeis e rápidos atravessa a arena em linha reta, com a faixa avisada antes.
 *    Derrubar a revoada inteira deixa um artefato.
 *  - **Amigo selvagem**: um Pokémon da região aparece sem atacar; encoste nele e ele luta do seu lado por um tempo.
 *  - **Desafio relâmpago**: uma baliza opcional; encostar aceita "derrote N em 20 s", com N medido pelo seu próprio
 *    ritmo do último minuto. Cumprir dá uma chave de baú e orbes; falhar não tira nada.
 *
 * Lógica pura: o motor (`survivor.ts`) chama `stepSurvivorSurge` e entrega o que só ele sabe fazer pelos `SurgeHooks`.
 * O sorteio usa um hash da semente da corrida, não o RNG de combate: ligar os eventos não muda o resto da corrida até
 * o primeiro deles começar. Nada aqui inventa recompensa fora dos sistemas que já existem (orbes, chaves e artefatos).
 */

export type SurvivorSurgeKind = 'orb-rain' | 'swarm' | 'wild-friend' | 'trial';
export const SURVIVOR_SURGE_KINDS: readonly SurvivorSurgeKind[] = ['orb-rain', 'swarm', 'wild-friend', 'trial'];

export const SURVIVOR_SURGE_LABEL: Record<SurvivorSurgeKind, { icon: string; name: string }> = {
  'orb-rain': { icon: '🌠', name: 'Chuva de orbes' },
  swarm: { icon: '🪶', name: 'Revoada' },
  'wild-friend': { icon: '💚', name: 'Amigo selvagem' },
  trial: { icon: '⏱', name: 'Desafio relâmpago' },
};

/** Primeiro evento depois da fase de aprendizado (o primeiro especial chega aos 3 min); depois, um a cada 105 s jogados. */
export const SURGE_FIRST_MS = 150_000;
export const SURGE_EVERY_MS = 105_000;
/** Se a arena estiver ocupada (treinador, lendário, chefão final chegando), o evento espera um pouco. */
export const SURGE_RETRY_MS = 15_000;

/** Chuva de orbes: 20 orbes em 9 s, cada sombra avisa 0,7 s antes. */
export const ORB_RAIN_DROPS = 20;
export const ORB_RAIN_EVERY_MS = 450;
export const ORB_RAIN_FALL_MS = 700;
export const ORB_RAIN_MIN_DIST = 50;
export const ORB_RAIN_MAX_DIST = 230;
/** Valor de cada orbe da chuva: começa em 6 e sobe 2 a cada 4 min, até 14 (sempre par). */
export function orbRainValue(elapsedMs: number): number {
  return Math.min(14, 6 + 2 * Math.floor(Math.max(0, elapsedMs) / 240_000));
}

/** Revoada: só depois de 4 min, quando a pessoa já tem build para responder. */
export const SWARM_MIN_MS = 240_000;
export const SWARM_WARN_MS = 1800;
export const SWARM_SIZE = 10;
export const SWARM_SPEED = 230;
/** Distância percorrida pela revoada; quem não cair sai da arena sem dar nada. */
export const SWARM_TRAVEL = 1120;
/** Membros frágeis: 40% da vida e 60% do dano de um inimigo comum do mesmo momento. */
export const SWARM_HP_FACTOR = 0.4;
export const SWARM_DAMAGE_FACTOR = 0.6;

/** Amigo selvagem: 12 s para encostar nele, 24 s de ajuda, um golpe a cada 0,7 s em quem estiver a até 260 px. */
export const FRIEND_OFFER_MS = 12_000;
export const FRIEND_HELP_MS = 24_000;
export const FRIEND_ZAP_EVERY_MS = 700;
export const FRIEND_ZAP_RANGE = 260;
/** Fração do dano do golpe principal: o amigo ajuda, não joga por você. */
export const FRIEND_DAMAGE_FACTOR = 0.55;
export const FRIEND_TOUCH_RADIUS = 46;

/** Desafio relâmpago: 15 s para aceitar, 20 s para cumprir. */
export const TRIAL_OFFER_MS = 15_000;
export const TRIAL_MS = 20_000;
export const TRIAL_TOUCH_RADIUS = 58;
export const TRIAL_MIN_TARGET = 8;
export const TRIAL_MAX_TARGET = 40;
/** Pede 30% acima do ritmo do último minuto, para 20 s: exige ir atrás da multidão, sem ser impossível. */
export const TRIAL_PACE_FACTOR = 1.3;
export const TRIAL_REWARD_ORBS = 4;
export const TRIAL_REWARD_ORB_VALUE = 10;
/** Amostras de abates a cada 10 s, para medir o ritmo do último minuto. */
export const KILL_MARK_EVERY_MS = 10_000;
const KILL_MARKS = 7;

export interface SurgeDrop {
  x: number;
  y: number;
  /** Quanto falta para o orbe tocar o chão. */
  landInMs: number;
}

export interface SurvivorSurge {
  kind: SurvivorSurgeKind;
  /** `warn`: aviso antes (faixa da revoada); `offer`: amigo ou baliza esperando você; `active`: valendo. */
  phase: 'warn' | 'offer' | 'active';
  /** Tempo restante da fase atual. */
  leftMs: number;
  /** Número do evento na corrida, que alimenta o hash das posições. */
  index: number;
  // Chuva de orbes
  drops?: SurgeDrop[];
  dropsLeft?: number;
  dropTimerMs?: number;
  // Revoada: faixa de (x0, y0) andando (dx, dy) por SWARM_TRAVEL; meia largura `half`.
  lane?: { x: number; y: number; dx: number; dy: number; half: number };
  memberIds?: number[];
  escaped?: number;
  // Amigo selvagem
  friend?: { dexId: number | null; x: number; y: number; zapTimerMs: number };
  // Desafio relâmpago
  x?: number;
  y?: number;
  target?: number;
  startKills?: number;
}

export interface SurvivorSurgeTrack {
  clockMs: number;
  nextAtMs: number;
  count: number;
  /** Abates no começo de cada janela de 10 s (a mais antiga primeiro). */
  killMarks: number[];
  markTimerMs: number;
  /** Quantos eventos de cada tipo deram certo nesta corrida (resumo). */
  completed: number;
}

export type SurvivorSurgeEvent = Extract<SurvivorEvent, { type: 'surge' }>;

export interface SurgeHooks {
  /** Dano do golpe principal agora (com artefato de poder etc.). */
  attackDamage: number;
  /** Cria um inimigo comum do momento e devolve o objeto, já na lista (null se a arena está cheia). */
  spawnCommon(): SurvivorEnemy | null;
  /** Solta uma chave de baú no chão. */
  dropKey(x: number, y: number): void;
  /** Solta um artefato sorteado pelo sistema de itens da corrida. */
  dropArtifact(x: number, y: number): void;
  /** Dano para a conta do fim da corrida. */
  record(name: string, color: string, damage: number): void;
}

export function createSurgeTrack(): SurvivorSurgeTrack {
  return { clockMs: 0, nextAtMs: SURGE_FIRST_MS, count: 0, killMarks: [0], markTimerMs: KILL_MARK_EVERY_MS, completed: 0 };
}

/** Hash estável (0 a 1) de semente, evento e índice; não consome o RNG de combate. */
export function surgeRoll(seed: number, index: number, salt: number): number {
  let h = (Math.floor(seed) ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

/**
 * Ordem dos eventos da corrida: cada volta de quatro passa por todos os tipos, embaralhados pela semente. A revoada
 * nunca abre antes de `SWARM_MIN_MS`: se for a vez dela cedo demais, troca de lugar com o próximo tipo.
 */
export function surgeKindAt(seed: number, index: number, elapsedMs: number): SurvivorSurgeKind {
  const round = Math.floor(index / SURVIVOR_SURGE_KINDS.length);
  const order = [...SURVIVOR_SURGE_KINDS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(surgeRoll(seed, round, 100 + i) * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const slot = index % order.length;
  const kind = order[slot]!;
  if (kind !== 'swarm' || elapsedMs >= SWARM_MIN_MS) return kind;
  return order[(slot + 1) % order.length]!;
}

/** Meta do desafio: o ritmo do último minuto, levado a 20 s com folga de 30%, entre 8 e 40 abates. */
export function trialTarget(killsLastMinute: number, windowMs = 60_000): number {
  const perMs = Math.max(0, killsLastMinute) / Math.max(1, windowMs);
  return Math.max(TRIAL_MIN_TARGET, Math.min(TRIAL_MAX_TARGET, Math.round(perMs * TRIAL_MS * TRIAL_PACE_FACTOR)));
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Ponto a uma distância do jogador, dentro da arena. */
function pointAround(state: SurvivorState, angle: number, distance: number): { x: number; y: number } {
  return {
    x: clamp(state.player.x + Math.cos(angle) * distance, PLAYER_RADIUS + 10, ARENA_W - PLAYER_RADIUS - 10),
    y: clamp(state.player.y + Math.sin(angle) * distance, PLAYER_RADIUS + 10, ARENA_H - PLAYER_RADIUS - 10),
  };
}

/** A arena já está num momento grande: o evento espera para não empilhar ameaças nem disputar atenção. */
export function surgeBlocked(state: SurvivorState): boolean {
  if (state.enemies.some((e) => e.hp > 0 && (e.trainerId !== undefined || e.shadowBoss))) return true;
  if (state.shadowEncounter.phase === 'arrival' || state.shadowEncounter.phase === 'battle') return true;
  if (state.finalBossAtMs !== null && state.finalBossAtMs - state.elapsedMs < 30_000) return true;
  return false;
}

/** Eventos só na corrida de verdade: fora do laboratório, do PvP (sem itens) e do BONK (que tem câmera própria). */
export function surgesEnabled(state: SurvivorState): boolean {
  return !state.debugLaboratory && !state.heldDisabled && !state.bonk && state.surges !== undefined;
}

function killsLastMinute(track: SurvivorSurgeTrack, kills: number): { kills: number; windowMs: number } {
  const oldest = track.killMarks[0] ?? 0;
  const windowMs = Math.max(KILL_MARK_EVERY_MS, (track.killMarks.length - 1) * KILL_MARK_EVERY_MS + (KILL_MARK_EVERY_MS - track.markTimerMs));
  return { kills: kills - oldest, windowMs };
}

function startSurge(state: SurvivorState, track: SurvivorSurgeTrack, events: SurvivorEvent[]): void {
  const index = track.count;
  const seed = state.runSeed;
  const kind = surgeKindAt(seed, index, state.elapsedMs);
  const p = state.player;
  track.count += 1;
  if (kind === 'orb-rain') {
    state.surge = { kind, phase: 'active', index, leftMs: ORB_RAIN_DROPS * ORB_RAIN_EVERY_MS + ORB_RAIN_FALL_MS, drops: [], dropsLeft: ORB_RAIN_DROPS, dropTimerMs: 0 };
  } else if (kind === 'swarm') {
    const horizontal = surgeRoll(seed, index, 1) < 0.5;
    const sign = surgeRoll(seed, index, 2) < 0.5 ? -1 : 1;
    const dx = horizontal ? sign : 0;
    const dy = horizontal ? 0 : sign;
    // A faixa passa por onde você está no aviso: dá tempo de sair dela ou de se posicionar para colher.
    const lane = { x: p.x - dx * SWARM_TRAVEL / 2, y: p.y - dy * SWARM_TRAVEL / 2, dx, dy, half: 70 };
    state.surge = { kind, phase: 'warn', index, leftMs: SWARM_WARN_MS, lane, memberIds: [], escaped: 0 };
  } else if (kind === 'wild-friend') {
    const at = pointAround(state, surgeRoll(seed, index, 3) * Math.PI * 2, 170 + surgeRoll(seed, index, 4) * 70);
    const probe = { id: 900_000 + index, kind: 0, boss: false, grade: 'comum', x: at.x, y: at.y, hp: 1, maxHp: 1, speed: 0, damage: 0, radius: 13, hitFlashMs: 0 } satisfies SurvivorEnemy;
    const dexId = state.enemyDexId ? state.enemyDexId(probe, state.elapsedMs, state.runSeed) : null;
    state.surge = { kind, phase: 'offer', index, leftMs: FRIEND_OFFER_MS, friend: { dexId, x: at.x, y: at.y, zapTimerMs: 0 } };
  } else {
    const at = pointAround(state, surgeRoll(seed, index, 5) * Math.PI * 2, 220 + surgeRoll(seed, index, 6) * 80);
    state.surge = { kind, phase: 'offer', index, leftMs: TRIAL_OFFER_MS, x: at.x, y: at.y };
  }
  const surge = state.surge;
  events.push({ type: 'surge', kind, phase: surge.phase === 'active' ? 'start' : surge.phase, ...(surge.friend?.dexId ? { dexId: surge.friend.dexId } : {}) });
}

function finish(state: SurvivorState, track: SurvivorSurgeTrack, events: SurvivorEvent[], kind: SurvivorSurgeKind, phase: 'success' | 'fail' | 'end', value?: number): void {
  if (phase === 'success') track.completed += 1;
  state.surge = null;
  events.push({ type: 'surge', kind, phase, ...(value !== undefined ? { value } : {}) });
}

function stepOrbRain(state: SurvivorState, surge: SurvivorSurge, dtMs: number): void {
  surge.drops ??= [];
  surge.dropTimerMs = (surge.dropTimerMs ?? 0) - dtMs;
  while ((surge.dropsLeft ?? 0) > 0 && surge.dropTimerMs <= 0) {
    const n = ORB_RAIN_DROPS - (surge.dropsLeft ?? 0);
    const angle = surgeRoll(state.runSeed, surge.index, 200 + n) * Math.PI * 2;
    const distance = ORB_RAIN_MIN_DIST + surgeRoll(state.runSeed, surge.index, 300 + n) * (ORB_RAIN_MAX_DIST - ORB_RAIN_MIN_DIST);
    surge.drops.push({ ...pointAround(state, angle, distance), landInMs: ORB_RAIN_FALL_MS });
    surge.dropsLeft = (surge.dropsLeft ?? 0) - 1;
    surge.dropTimerMs += ORB_RAIN_EVERY_MS;
  }
  const value = orbRainValue(state.elapsedMs);
  surge.drops = surge.drops.filter((drop) => {
    drop.landInMs -= dtMs;
    if (drop.landInMs > 0) return true;
    state.orbs.push({ id: state.nextId++, x: drop.x, y: drop.y, value });
    state.fx.push({ kind: 'pulse', x: drop.x, y: drop.y, r: 18, color: '#9fe8ff', ageMs: 0, lifeMs: 320 });
    return false;
  });
}

function launchSwarm(surge: SurvivorSurge, hooks: SurgeHooks): void {
  const lane = surge.lane!;
  const ids: number[] = [];
  for (let i = 0; i < SWARM_SIZE; i++) {
    const e = hooks.spawnCommon();
    if (!e) break;
    // Cunha: o líder na frente, os outros alternando de lado e um pouco atrás.
    const side = i === 0 ? 0 : (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2);
    const back = Math.ceil(i / 2) * 30;
    const across = side * 22;
    e.x = clamp(lane.x - lane.dx * back - lane.dy * across, 0, ARENA_W);
    e.y = clamp(lane.y - lane.dy * back + lane.dx * across, 0, ARENA_H);
    e.hp = e.maxHp = Math.max(1, Math.round(e.maxHp * SWARM_HP_FACTOR));
    e.damage = Math.max(1, Math.round(e.damage * SWARM_DAMAGE_FACTOR));
    e.speed = SWARM_SPEED;
    e.archetype = 'perseguidor';
    e.radius = 12;
    delete e.supportRole;
    e.swarm = { vx: lane.dx * SWARM_SPEED, vy: lane.dy * SWARM_SPEED, leftMs: Math.round(((SWARM_TRAVEL + back) / SWARM_SPEED) * 1000) };
    ids.push(e.id);
  }
  surge.memberIds = ids;
  surge.phase = 'active';
  surge.leftMs = Math.round((SWARM_TRAVEL / SWARM_SPEED) * 1000) + 1500;
}

/** Membros da revoada que terminaram a travessia saem da arena sem deixar nada; devolve quantos saíram. */
export function removeEscapedSwarm(state: SurvivorState): number {
  let escaped = 0;
  state.enemies = state.enemies.filter((e) => {
    if (!e.swarm || e.hp <= 0 || e.swarm.leftMs > 0) return true;
    escaped++;
    return false;
  });
  if (escaped > 0 && state.surge?.kind === 'swarm') state.surge.escaped = (state.surge.escaped ?? 0) + escaped;
  return escaped;
}

function stepSwarm(state: SurvivorState, track: SurvivorSurgeTrack, surge: SurvivorSurge, dtMs: number, events: SurvivorEvent[], hooks: SurgeHooks): void {
  if (surge.phase === 'warn') {
    surge.leftMs -= dtMs;
    if (surge.leftMs <= 0) {
      launchSwarm(surge, hooks);
      events.push({ type: 'surge', kind: 'swarm', phase: 'start', value: surge.memberIds?.length ?? 0 });
      if ((surge.memberIds?.length ?? 0) === 0) finish(state, track, events, 'swarm', 'end');
    }
    return;
  }
  const ids = surge.memberIds ?? [];
  const alive = ids.filter((id) => state.enemies.some((e) => e.id === id));
  surge.leftMs -= dtMs;
  if (alive.length > 0 && surge.leftMs > 0) return;
  if (alive.length === 0 && (surge.escaped ?? 0) === 0 && ids.length > 0) {
    // Revoada inteira abatida: um artefato do sistema de itens da corrida, onde você está.
    hooks.dropArtifact(state.player.x, state.player.y - 30);
    finish(state, track, events, 'swarm', 'success', ids.length);
    return;
  }
  finish(state, track, events, 'swarm', 'end', ids.length - (surge.escaped ?? 0) - alive.length);
}

function stepFriend(state: SurvivorState, track: SurvivorSurgeTrack, surge: SurvivorSurge, dtMs: number, events: SurvivorEvent[], hooks: SurgeHooks): void {
  const friend = surge.friend!;
  const p = state.player;
  surge.leftMs -= dtMs;
  if (surge.phase === 'offer') {
    if (Math.hypot(friend.x - p.x, friend.y - p.y) <= FRIEND_TOUCH_RADIUS + PLAYER_RADIUS) {
      surge.phase = 'active';
      surge.leftMs = FRIEND_HELP_MS;
      friend.zapTimerMs = 300;
      state.fx.push({ kind: 'heal', x: friend.x, y: friend.y, r: 26, color: '#7dff9b', ageMs: 0, lifeMs: 700 });
      events.push({ type: 'surge', kind: 'wild-friend', phase: 'start', ...(friend.dexId ? { dexId: friend.dexId } : {}) });
      return;
    }
    if (surge.leftMs <= 0) finish(state, track, events, 'wild-friend', 'fail');
    return;
  }
  // Segue você pelo lado oposto ao da frente, sem hitbox própria (não apanha nem bloqueia).
  const wantX = p.x - p.facing * 34;
  const wantY = p.y - 26;
  const d = Math.hypot(wantX - friend.x, wantY - friend.y);
  const step = Math.min(d, p.speed * 1.15 * (dtMs / 1000));
  if (d > 0.01) { friend.x += ((wantX - friend.x) / d) * step; friend.y += ((wantY - friend.y) / d) * step; }
  friend.zapTimerMs -= dtMs;
  while (friend.zapTimerMs <= 0) {
    friend.zapTimerMs += FRIEND_ZAP_EVERY_MS;
    let best: SurvivorEnemy | null = null;
    let bestD = FRIEND_ZAP_RANGE;
    for (const e of state.enemies) {
      if (e.hp <= 0 || e.thief) continue;
      const ed = Math.hypot(e.x - friend.x, e.y - friend.y);
      if (ed <= bestD + e.radius) { best = e; bestD = ed; }
    }
    if (!best) break;
    const damage = Math.max(1, Math.round(hooks.attackDamage * FRIEND_DAMAGE_FACTOR));
    hooks.record(SURVIVOR_SURGE_LABEL['wild-friend'].name, '#7dff9b', Math.min(Math.max(0, best.hp), damage));
    best.hp -= damage;
    best.hitFlashMs = 120;
    state.fx.push({ kind: 'chain', x: best.x, y: best.y, r: 6, color: '#7dff9b', ageMs: 0, lifeMs: 200, fromX: friend.x, fromY: friend.y - 10, toX: best.x, toY: best.y });
  }
  if (surge.leftMs <= 0) finish(state, track, events, 'wild-friend', 'end');
}

function stepTrial(state: SurvivorState, track: SurvivorSurgeTrack, surge: SurvivorSurge, dtMs: number, events: SurvivorEvent[], hooks: SurgeHooks): void {
  const p = state.player;
  surge.leftMs -= dtMs;
  if (surge.phase === 'offer') {
    if (Math.hypot((surge.x ?? 0) - p.x, (surge.y ?? 0) - p.y) <= TRIAL_TOUCH_RADIUS) {
      const pace = killsLastMinute(track, state.kills);
      surge.phase = 'active';
      surge.leftMs = TRIAL_MS;
      surge.target = trialTarget(pace.kills, pace.windowMs);
      surge.startKills = state.kills;
      state.fx.push({ kind: 'blast', x: p.x, y: p.y, r: 60, color: '#ffd84a', ageMs: 0, lifeMs: 520 });
      events.push({ type: 'surge', kind: 'trial', phase: 'start', value: surge.target });
      return;
    }
    if (surge.leftMs <= 0) finish(state, track, events, 'trial', 'fail');
    return;
  }
  const done = state.kills - (surge.startKills ?? state.kills);
  if (done >= (surge.target ?? TRIAL_MIN_TARGET)) {
    hooks.dropKey(p.x + 20, p.y);
    for (let i = 0; i < TRIAL_REWARD_ORBS; i++) {
      const a = (Math.PI * 2 * i) / TRIAL_REWARD_ORBS;
      state.orbs.push({ id: state.nextId++, x: clamp(p.x + Math.cos(a) * 30, 0, ARENA_W), y: clamp(p.y + Math.sin(a) * 30, 0, ARENA_H), value: TRIAL_REWARD_ORB_VALUE });
    }
    state.fx.push({ kind: 'pulse', x: p.x, y: p.y, r: 90, color: '#ffd84a', ageMs: 0, lifeMs: 800 });
    finish(state, track, events, 'trial', 'success', surge.target);
    return;
  }
  if (surge.leftMs <= 0) finish(state, track, events, 'trial', 'fail', done);
}

/** Um passo dos eventos-relâmpago. Chame depois das mortes do quadro (o desafio conta abates de verdade). */
export function stepSurvivorSurge(state: SurvivorState, dtMs: number, events: SurvivorEvent[], hooks: SurgeHooks): void {
  const track = state.surges;
  if (!track || !surgesEnabled(state) || state.over) return;
  track.clockMs += Math.max(0, dtMs);
  track.markTimerMs -= dtMs;
  while (track.markTimerMs <= 0) {
    track.markTimerMs += KILL_MARK_EVERY_MS;
    track.killMarks.push(state.kills);
    if (track.killMarks.length > KILL_MARKS) track.killMarks.shift();
  }
  const surge = state.surge;
  if (!surge) {
    if (track.clockMs < track.nextAtMs) return;
    if (surgeBlocked(state)) { track.nextAtMs = track.clockMs + SURGE_RETRY_MS; return; }
    track.nextAtMs = track.clockMs + SURGE_EVERY_MS;
    startSurge(state, track, events);
    return;
  }
  if (surge.kind === 'orb-rain') {
    stepOrbRain(state, surge, dtMs);
    surge.leftMs -= dtMs;
    if (surge.leftMs <= 0 && (surge.drops?.length ?? 0) === 0 && (surge.dropsLeft ?? 0) === 0) finish(state, track, events, 'orb-rain', 'end', ORB_RAIN_DROPS);
  } else if (surge.kind === 'swarm') stepSwarm(state, track, surge, dtMs, events, hooks);
  else if (surge.kind === 'wild-friend') stepFriend(state, track, surge, dtMs, events, hooks);
  else stepTrial(state, track, surge, dtMs, events, hooks);
}

/** Texto do HUD para o evento em curso (null sem evento). */
export function surgeHudText(state: Pick<SurvivorState, 'surge' | 'kills' | 'player'>): string | null {
  const surge = state.surge;
  if (!surge) return null;
  const label = SURVIVOR_SURGE_LABEL[surge.kind];
  const seconds = Math.max(0, Math.ceil(surge.leftMs / 1000));
  const direction = (x: number, y: number): string => {
    const dx = x - state.player.x;
    const dy = y - state.player.y;
    return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? '←' : '→') : (dy < 0 ? '↑' : '↓');
  };
  if (surge.kind === 'orb-rain') return `${label.icon} ${label.name} · ${seconds}s`;
  if (surge.kind === 'swarm') return surge.phase === 'warn' ? `${label.icon} Revoada chegando!` : `${label.icon} ${label.name}: derrube todos`;
  if (surge.kind === 'wild-friend') {
    const friend = surge.friend!;
    return surge.phase === 'offer' ? `${label.icon} Amigo ${direction(friend.x, friend.y)} · ${seconds}s` : `${label.icon} Amigo ajudando · ${seconds}s`;
  }
  if (surge.phase === 'offer') return `${label.icon} Desafio ${direction(surge.x ?? 0, surge.y ?? 0)} · ${seconds}s`;
  const done = Math.max(0, state.kills - (surge.startKills ?? state.kills));
  return `${label.icon} ${Math.min(done, surge.target ?? 0)}/${surge.target ?? 0} · ${seconds}s`;
}
