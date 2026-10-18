import { seededRng } from './battle';
import type { Rng } from './battle';
import type { AttackProfile, MoveCategory, SurvivorMove } from './survivor-moves';

/**
 * Motor puro do modo Sobrevivência (Zona de Sobrevivência, dentro da Vila): você anda pela arena, seu Pokémon ataca
 * sozinho quem estiver mais perto, orbes de XP derrubados pelos inimigos sobem de nível e abrem a escolha de um
 * upgrade, as ondas ficam mais difíceis com o tempo e um chefe aparece de tempos em tempos. Espelha o LAÇO do
 * https://github.com/JayElDragon/poke-survivor (e do PokéSurvivor original) — andar, autoataque, XP, upgrades,
 * ondas, chefes — com números e upgrades próprios, não um port do GDScript; nada do sistema de gacha, missões,
 * 130 conquistas ou fendas de lendários de lá está aqui. Só a lógica; desenho e sprites ficam em `village/`.
 *
 * Cada Pokémon ataca com um golpe próprio (`core/survivor-moves.ts`): o elemento vem do 1º tipo e a forma (projétil,
 * aura ou área) e os números vêm dos stats reais da espécie (`AttackProfile`), e a partir dos níveis `EVOLVE_LEVELS` a escolha de upgrade traz a carta "Evoluir" para a próxima forma real
 * (`core/survivor-evolution.ts`, resolvida por quem chama). A evolução só vale na corrida.
 *
 * Sem DOM: funciona em `happy-dom`/`vitest` (ver docs/TESTING.md) e é determinístico com `seededRng`.
 */

export const ARENA_W = 960;
export const ARENA_H = 640;
export const PLAYER_RADIUS = 14;
export const PICKUP_RADIUS = 46;
/** Margem fora da arena onde os inimigos nascem (entram andando, nunca "aparecem" em cima de você). */
const SPAWN_MARGIN = 48;

export interface SurvivorPlayer {
  /** Espécie de agora (muda ao evoluir). 0 = sem espécie (testes e simulação). */
  dexId: number;
  /** Quantas vezes evoluiu nesta corrida. */
  stage: number;
  /** O golpe (decidido pelo 1º tipo da espécie escolhida; não muda ao evoluir). */
  move: SurvivorMove;
  /** Aura: raio em volta do Pokémon. Área: raio da explosão. Projétil: não usa. */
  attackRadius: number;
  /** Raio do disparo no desenho (a Defesa deixa maior). */
  projectileSize: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  level: number;
  xp: number;
  xpToNext: number;
  attackDamage: number;
  attackRange: number;
  attackCooldownMs: number;
  attackTimerMs: number;
  projectileSpeed: number;
  /** Quantos inimigos extras um projétil atravessa antes de sumir. */
  pierce: number;
  /** Projéteis disparados por rajada (em leque, a partir de 2); na área, quantos inimigos diferentes recebem explosão. */
  shots: number;
  /** Janela de invencibilidade após levar dano (ms restantes). */
  invulnMs: number;
  /** -1 olhando para a esquerda, 1 para a direita (para virar o sprite). */
  facing: -1 | 1;
  /** Alcance para coletar orbe de XP ao passar perto (sobe com o upgrade "Ímã de XP"). */
  pickupRadius: number;
}

/** Grau do inimigo: `comum` (os de sempre), `elite` (do treinador do minuto 5+) e `chefao` (do 20º minuto e do infinito). */
export type SurvivorEnemyGrade = 'comum' | 'elite' | 'chefao';

export interface SurvivorEnemy {
  id: number;
  /** Espécie fixada no nascimento, independente dos atributos de combate. */
  dexId?: number;
  /** Índice da espécie no elenco desta corrida (ver `kindCount` em `createSurvivorState`); chefes usam `kindCount`. */
  kind: number;
  boss: boolean;
  /** Grau: muda o tamanho, HP, dano, cor do contorno e orbe de XP ao morrer. */
  grade: SurvivorEnemyGrade;
  /** Treinador a que esse Pokémon pertence (apenas elites e chefões): quando todos de um id caem, o treinador perdeu. */
  trainerId?: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  radius: number;
  /** Ms restantes do "flash" de ter sido atingido (só para o desenho). */
  hitFlashMs: number;
  /** Efeitos dos golpes (ms restantes): queimadura (com o dano por segundo), lentidão e atordoamento. */
  burnMs?: number;
  burnDps?: number;
  slowMs?: number;
  stunMs?: number;
}

export interface SurvivorProjectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  pierce: number;
  lifeMs: number;
  /** Inimigos já atingidos por este projétil: atravessar não pode acertar o mesmo de novo a cada quadro. */
  hit: number[];
  /** Golpe que salta (Elétrico): ao acertar, ainda pode pular para mais um inimigo. */
  canChain?: boolean;
  /** Raio do desenho (a Pedrada é maior). */
  size?: number;
}

/** Marcas visuais de um instante (pulso da aura, explosão da área, brilho da evolução): só para o desenho. */
export interface SurvivorFx {
  kind: 'pulse' | 'blast' | 'evolve';
  x: number;
  y: number;
  r: number;
  color: string;
  ageMs: number;
  lifeMs: number;
}

export interface SurvivorOrb {
  id: number;
  x: number;
  y: number;
  value: number;
}

export interface SurvivorUpgradeOption {
  id: string;
  name: string;
  description: string;
}

export interface SurvivorState {
  rng: Rng;
  /** Aparência por nascimento; não deve consumir o RNG de combate. */
  enemyDexId: ((enemy: Readonly<SurvivorEnemy>, elapsedMs: number) => number) | null;
  elapsedMs: number;
  player: SurvivorPlayer;
  enemies: SurvivorEnemy[];
  projectiles: SurvivorProjectile[];
  orbs: SurvivorOrb[];
  fx: SurvivorFx[];
  kills: number;
  wave: number;
  spawnAccumMs: number;
  nextBossAtMs: number;
  /** Quantas espécies "comuns" existem no elenco desta corrida (chefes usam o índice `kindCount`). */
  kindCount: number;
  over: boolean;
  /** Agenda dos treinadores (ver `TRAINER_FIRST_MS`, `TRAINER_EVERY_MS`, `FINAL_BOSS_MS`). */
  nextTrainerAtMs: number;
  /** Minuto em que o chefão final aparece (null depois dele ou no modo infinito). */
  finalBossAtMs: number | null;
  /** Treinadores já derrotados (o chefão final conta como um; no infinito segue contando). */
  trainersBeaten: number;
  /** Chefões (minuto 20 + os do infinito) já derrotados. */
  bossesBeaten: number;
  /** O chefão final foi derrotado nesta corrida (destrava o modo infinito, uma só vez). */
  finalBossBeaten: boolean;
  /** Modo infinito: treinadores com 6 Pokémon a cada 5 min, inimigos escalam com o tempo. */
  infinite: boolean;
  /** Multiplicador do HP/dano que o infinito aplica sobre `elapsedMs` (sem o infinito, sempre 1). */
  infiniteScale: number;
  /** Não-nulo pausa o avanço (ver `stepSurvivor`): espera `applyUpgrade`. */
  pendingUpgrade: SurvivorUpgradeOption[] | null;
  /** Níveis ganhos que ainda vão virar escolha de upgrade (subir 2 níveis de uma vez dá 2 escolhas, uma depois da outra). */
  upgradesOwed: number;
  nextId: number;
  /** Próximas formas reais de uma espécie (ver `CreateSurvivorOptions.evolutions`). */
  evolutions: (dexId: number) => readonly SurvivorEvolutionOption[];
  /** Números dos stats da espécie de agora (para a evolução recalcular pelos stats da próxima forma). */
  profile: AttackProfile | null;
}

export interface SurvivorEvolutionOption {
  dexId: number;
  name: string;
  /** Números pelos stats da próxima forma (mesma forma de golpe); sem isto, a evolução dá bônus fixos. */
  profile?: AttackProfile;
}

export interface SurvivorInput {
  /** Vetor de direção do analógico/arraste; não precisa estar normalizado (0,0 = parado). */
  dx: number;
  dy: number;
}

export interface SurvivorSummary {
  survivedMs: number;
  level: number;
  /** Quantas vezes evoluiu na corrida. */
  stage: number;
  kills: number;
  wave: number;
  /** Treinadores derrotados (3 Pokémon cada; o chefão final conta como um). */
  trainersBeaten: number;
  /** Chefões (chefão final + os do infinito, de 6 Pokémon). */
  bossesBeaten: number;
  /** O chefão final caiu nesta corrida (destrava o modo infinito no 1º ao vencer). */
  finalBossBeaten: boolean;
  /** Era uma corrida do modo infinito? */
  infinite: boolean;
}

/** Pontuação da corrida (0–100): tempo vivo, derrotas e nível. */
export function survivorScore(s: Pick<SurvivorSummary, 'survivedMs' | 'kills' | 'level'>): number {
  return Math.max(0, Math.min(100, Math.round(s.survivedMs / 1000 + s.kills * 2 + s.level * 5)));
}

/** Uma corrida que só conta se você durou um pouco ou derrotou alguém (sair logo não vira fazenda de moedas). */
export const SURVIVOR_MIN_MS = 20_000;

/** Prêmio por zerar a Torre (chefão final caído): só uma vez por dia (`today.clearedTorre`). */
export const SURVIVOR_CLEAR_BONUS = 500;

/**
 * Moedas da corrida (além das moedas do XP e do bônus por zerar):
 *  - metade da pontuação, de 5 a 50, se durou/derrotou algo (como antes);
 *  - +40 por treinador comum derrotado, +80 por chefão (6 Pokémon).
 */
export function survivorCoins(s: Pick<SurvivorSummary, 'survivedMs' | 'kills' | 'level' | 'trainersBeaten' | 'bossesBeaten'>): number {
  const base = (s.kills === 0 && s.survivedMs < SURVIVOR_MIN_MS) ? 0 : Math.max(5, Math.round(survivorScore(s) / 2));
  return base + (s.trainersBeaten - s.bossesBeaten) * 40 + s.bossesBeaten * 80;
}

export type SurvivorEvent =
  | { type: 'levelup'; level: number }
  | { type: 'bossSpawn' }
  /** Treinador apareceu: solta um grupo de `count` Pokémon elite (3 no normal, 6 no chefão final e no infinito). */
  | { type: 'trainerSpawn'; count: number; final: boolean }
  /** Treinador derrotado (todos os Pokémon dele caíram). */
  | { type: 'trainerDown'; final: boolean }
  | { type: 'evolve'; dexId: number; name: string }
  | { type: 'gameover'; summary: SurvivorSummary };

export interface SurvivorUpgrade {
  id: string;
  name: string;
  description: string;
  /** Categorias de golpe em que o upgrade faz sentido (sem lista = todas). */
  for?: readonly MoveCategory[];
  /** Nome e texto falando do golpe de quem joga (ex.: "Bola de fogo mais forte"). */
  describe?: (move: SurvivorMove) => { name: string; description: string };
  apply: (p: SurvivorPlayer) => void;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export const SURVIVOR_UPGRADES: readonly SurvivorUpgrade[] = [
  {
    id: 'power', name: 'Golpe mais forte', description: '+20% de dano no ataque.',
    describe: (m) => ({ name: 'Golpe mais forte', description: `${m.name}: +20% de dano, até 60.` }),
    apply: (p) => {
      // teto absoluto em 60 para o dano (o teste espera 60)
      if (p.attackDamage >= 60) return;
      p.attackDamage = Math.min(60, round1(p.attackDamage * 1.2));
    },
  },
  {
    id: 'haste', name: 'Recarga menor', description: '-15% no tempo entre ataques.',
    describe: (m) => ({ name: 'Recarga menor', description: `${m.name}: ${m.category === 'aura' ? '-15% no tempo entre os pulsos.' : '-15% no tempo entre ataques.'}` }),
    apply: (p) => {
      // não deixa cair abaixo de 240 ms (o teste espera 240)
      if (p.attackCooldownMs <= 240) return;
      p.attackCooldownMs = Math.max(240, Math.round(p.attackCooldownMs * 0.85));
    },
  },
  { id: 'legs', name: 'Passo mais rápido', description: '+12% de velocidade ao andar.', apply: (p) => { p.speed = round1(p.speed * 1.12); } },
  { id: 'vigor', name: 'Mais vida', description: '+25 no HP máximo (e cura na hora).', apply: (p) => { p.maxHp += 25; p.hp = p.maxHp; } },
  {
    id: 'range', name: 'Alcance maior', description: '+20% no alcance do golpe.', for: ['projetil', 'area', 'cone'],
    apply: (p) => { p.attackRange = round1(p.attackRange * 1.2); },
  },
  {
    id: 'multishot', name: 'Disparo múltiplo', description: '+1 projétil por disparo, em leque.', for: ['projetil', 'area'],
    describe: (m) => (m.category === 'area'
      ? { name: 'Explosão extra', description: `${m.name}: +1 explosão por ataque, em outro inimigo.` }
      : { name: 'Disparo múltiplo', description: '+1 projétil por disparo, em leque.' }),
    apply: (p) => { p.shots = Math.min(5, p.shots + 1); },
  },
  {
    id: 'pierce', name: 'Golpe perfurante', description: 'O golpe atravessa +1 inimigo antes de sumir.', for: ['projetil'],
    apply: (p) => { p.pierce = Math.min(4, p.pierce + 1); },
  },
  {
    id: 'radius', name: 'Golpe maior', description: '+20% no raio do golpe.', for: ['aura', 'area', 'orbit'],
    describe: (m) => ({ name: 'Golpe maior', description: `${m.name}: ${m.category === 'aura' ? '+20% no raio da aura.' : '+20% no tamanho da explosão.'}` }),
    apply: (p) => { p.attackRadius = round1(p.attackRadius * 1.2); },
  },
  { id: 'magnet', name: 'Ímã de XP', description: '+30% no alcance para coletar orbes de XP.', apply: (p) => { p.pickupRadius = round1(p.pickupRadius * 1.3); } },
] as const;

/** Níveis a partir dos quais a carta "Evoluir" aparece: o 1º para a 1ª evolução, o 2º para a 2ª. */
export const EVOLVE_LEVELS = [8, 16] as const;
const EVOLVE_PREFIX = 'evolve:';

// ----------------------------------------------------------------------------- treinadores e chefão

/** Quando o primeiro treinador aparece (ms); depois, de `TRAINER_EVERY_MS` em `TRAINER_EVERY_MS`. */
export const TRAINER_FIRST_MS = 300_000;
export const TRAINER_EVERY_MS = 300_000;
/** Quando o chefão final aparece (ms). Vence-lo destrava o modo infinito. */
export const FINAL_BOSS_MS = 1_200_000;
/** Depois do chefão final (modo infinito), outro chefão (6 Pokémon) a cada tanto. */
export const INFINITE_BOSS_EVERY_MS = 300_000;
/** Cada minuto no infinito dá +`INFINITE_SCALE_PER_MIN` ao HP e ao dano de todos os inimigos novos. */
export const INFINITE_SCALE_PER_MIN = 0.15;

/** Golpe padrão do motor (testes e simulação): um projétil simples, sem efeito. A Torre sempre passa o golpe do tipo. */
export const BASIC_MOVE: SurvivorMove = { type: 'normal', name: 'Golpe', category: 'projetil', effect: 'nenhum', color: '#fffbe0', icon: '✦' };

/**
 * Números de dificuldade, ajustados com o robô de `scripts/survivor-sim.eval.ts` (200 corridas, upgrades ao acaso).
 * Antes (2026-10-16): mediana de 74 s e 0% de chefes derrotados — o 1º chefe (60 s, 440 de HP) era uma parede.
 * Ver o plano (Fase C) para os números depois do ajuste.
 */
export const BALANCE = {
  xpBase: 14,
  xpPerLevel: 9,
  bossHpBase: 150,
  bossHpPerWave: 45,
  bossSpeed: 62,
  bossDamageBase: 10,
  bossDamagePerWave: 2,
  enemyHpBase: 20,
  /** Vida extra a cada `enemyHpEverySec` segundos de corrida (dobrou, para a Torre não ficar fácil). */
  enemyHpStep: 6,
  enemyHpEverySec: 30,
  enemyHpPerWave: 4,
  /** Intervalo entre nascimentos (ms) = início − porSegundo·t − porOnda·onda, nunca abaixo do piso. */
  spawnStartMs: 1700,
  spawnPerSecMs: 7,
  spawnPerWaveMs: 26,
  spawnFloorMs: 220,
  playerDamage: 10,
  playerCooldownMs: 600,
  /** Primeiro chefe e intervalo entre os seguintes (ms). */
  firstBossMs: 60_000,
  bossEveryMs: 90_000,
} as const;

export function xpForLevel(level: number): number {
  return Math.round(BALANCE.xpBase + level * BALANCE.xpPerLevel);
}

export interface CreateSurvivorOptions {
  /** Resolve apenas a espécie visual, preservando os números da onda e do grau. */
  enemyDexId?: (enemy: Readonly<SurvivorEnemy>, elapsedMs: number) => number;
  /** Quantas espécies "comuns" o elenco desta corrida tem (o chefe usa o índice seguinte). Mínimo 1. */
  kindCount: number;
  /** Golpe de quem joga (ver `moveFor`); padrão `BASIC_MOVE`. */
  move?: SurvivorMove;
  /** Números pelos stats da espécie (ver `attackProfile`); sem isto, os números padrão do motor. */
  profile?: AttackProfile;
  /** Espécie de quem joga (para a evolução). */
  dexId?: number;
  /**
   * Próximas formas REAIS de uma espécie que a Torre consegue mostrar (quem chama filtra as que não têm sprite).
   * Sem isto (ou com lista vazia), a carta "Evoluir" nunca aparece.
   */
  evolutions?: (dexId: number) => readonly SurvivorEvolutionOption[];
  player?: Partial<SurvivorPlayer>;
  /** Começa já no modo infinito (precisa ser destravado antes: `TrainerState.torre.infiniteUnlocked`). */
  infinite?: boolean;
}

export function createSurvivorState(seed: number, options: CreateSurvivorOptions): SurvivorState {
  const move = options.move ?? BASIC_MOVE;
  const prof = options.profile;
  const player: SurvivorPlayer = {
    dexId: options.dexId ?? 0,
    stage: 0,
    move,
    attackRadius: prof?.radius ?? 0,
    projectileSize: prof?.projectileSize ?? 4,
    x: ARENA_W / 2,
    y: ARENA_H / 2,
    hp: prof?.maxHp ?? 100,
    maxHp: prof?.maxHp ?? 100,
    speed: prof?.walkSpeed ?? 150,
    level: 1,
    xp: 0,
    xpToNext: xpForLevel(1),
    attackDamage: prof?.damage ?? BALANCE.playerDamage,
    attackRange: prof?.range ?? 170,
    attackCooldownMs: prof?.cooldownMs ?? BALANCE.playerCooldownMs,
    attackTimerMs: 0,
    projectileSpeed: prof?.projectileSpeed ?? 360,
    pierce: 0,
    shots: 1,
    invulnMs: 0,
    facing: 1,
    pickupRadius: PICKUP_RADIUS,
    ...options.player,
  };
  return {
    rng: seededRng(seed),
    enemyDexId: options.enemyDexId ?? null,
    elapsedMs: 0,
    player,
    enemies: [],
    projectiles: [],
    orbs: [],
    fx: [],
    kills: 0,
    wave: 1,
    spawnAccumMs: 0,
    nextBossAtMs: BALANCE.firstBossMs,
    kindCount: Math.max(1, Math.floor(options.kindCount)),
    over: false,
    nextTrainerAtMs: TRAINER_FIRST_MS,
    finalBossAtMs: FINAL_BOSS_MS,
    trainersBeaten: 0,
    bossesBeaten: 0,
    finalBossBeaten: false,
    infinite: options.infinite === true,
    infiniteScale: options.infinite === true ? 1.25 : 1,
    pendingUpgrade: null,
    upgradesOwed: 0,
    nextId: 1,
    evolutions: options.evolutions ?? (() => []),
    profile: prof ?? null,
  };
}

/** Intervalo entre nascimentos (ms): começa folgado e aperta com o tempo e a onda, nunca abaixo do piso. */
function spawnIntervalMs(state: SurvivorState): number {
  const t = state.elapsedMs / 1000;
  return Math.max(BALANCE.spawnFloorMs, BALANCE.spawnStartMs - t * BALANCE.spawnPerSecMs - state.wave * BALANCE.spawnPerWaveMs);
}

function spawnPoint(rng: Rng): { x: number; y: number } {
  const side = Math.floor(rng() * 4);
  if (side === 0) return { x: rng() * ARENA_W, y: -SPAWN_MARGIN };
  if (side === 1) return { x: ARENA_W + SPAWN_MARGIN, y: rng() * ARENA_H };
  if (side === 2) return { x: rng() * ARENA_W, y: ARENA_H + SPAWN_MARGIN };
  return { x: -SPAWN_MARGIN, y: rng() * ARENA_H };
}

/**
 * Nasce um inimigo. `grade` muda o tamanho, HP, dano e orbe de XP:
 *  - `comum`: o inimigo normal, do grupo que vai aparecendo sozinho.
 *  - `elite`: Pokémon do treinador (minuto 5+): mais HP, mais dano, mais rápido, orbe maior ao morrer.
 *  - `chefao`: um dos 6 do chefão final (ou do infinito): maior ainda, dá bem mais XP.
 * `trainerId` liga os Pokémon do mesmo treinador para contarmos quando todos caíram.
 */
function spawnEnemy(state: SurvivorState, boss: boolean, grade: SurvivorEnemyGrade = 'comum', trainerId?: number): void {
  const { x, y } = spawnPoint(state.rng);
  const t = state.elapsedMs / 1000;
  if (boss) {
    const hp = Math.round((BALANCE.bossHpBase + state.wave * BALANCE.bossHpPerWave) * state.infiniteScale);
    addEnemy(state, {
      id: state.nextId++,
      kind: state.kindCount,
      boss: true,
      grade: 'comum',
      x,
      y,
      hp,
      maxHp: hp,
      speed: BALANCE.bossSpeed,
      damage: Math.round((BALANCE.bossDamageBase + state.wave * BALANCE.bossDamagePerWave) * state.infiniteScale),
      radius: 28,
      hitFlashMs: 0,
    });
    return;
  }
  const baseHp = BALANCE.enemyHpBase + Math.floor(t / BALANCE.enemyHpEverySec) * BALANCE.enemyHpStep + state.wave * BALANCE.enemyHpPerWave;
  const baseDmg = 6 + Math.floor(t / 40) * 2;
  // Treinadores (elite) têm +5× HP e +2× dano; o chefão (do time dos 6) ainda mais pesado.
  const hpMul = grade === 'chefao' ? 7 : grade === 'elite' ? 5 : 1;
  const dmgMul = grade === 'chefao' ? 2.5 : grade === 'elite' ? 2 : 1;
  const speed = (grade === 'comum' ? 55 + state.rng() * 25 : grade === 'elite' ? 72 + state.rng() * 18 : 60 + state.rng() * 15) * (0.9 + Math.min(0.4, state.infiniteScale * 0.1));
  const hp = Math.round(baseHp * hpMul * state.infiniteScale);
  addEnemy(state, {
    id: state.nextId++,
    kind: Math.floor(state.rng() * state.kindCount),
    boss: false,
    grade,
    trainerId,
    x,
    y,
    hp,
    maxHp: hp,
    speed,
    damage: Math.round(baseDmg * dmgMul * state.infiniteScale),
    radius: grade === 'chefao' ? 20 : grade === 'elite' ? 16 : 13,
    hitFlashMs: 0,
  });
}

/** Chama um treinador: `count` Pokémon elite nascem juntos, com o mesmo `trainerId` (para marcarmos a derrota). */
function spawnTrainer(state: SurvivorState, count: number, final: boolean, events: SurvivorEvent[]): void {
  const trainerId = state.nextId++;
  const grade: SurvivorEnemyGrade = final ? 'chefao' : 'elite';
  for (let i = 0; i < count; i++) spawnEnemy(state, false, grade, trainerId);
  events.push({ type: 'trainerSpawn', count, final });
}

/** Resolve a aparência uma vez, depois de sortear os números de combate. */
function addEnemy(state: SurvivorState, enemy: SurvivorEnemy): void {
  if (state.enemyDexId) enemy.dexId = state.enemyDexId(enemy, state.elapsedMs);
  state.enemies.push(enemy);
}

/** Sorteia `count` upgrades distintos que fazem sentido para o golpe (`move`), com o texto falando do golpe. */
export function rollUpgrades(rng: Rng, count = 3, move: SurvivorMove = BASIC_MOVE): SurvivorUpgradeOption[] {
  const pool = SURVIVOR_UPGRADES.filter((u) => !u.for || u.for.includes(move.category));
  const picked: SurvivorUpgradeOption[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    const u = pool.splice(idx, 1)[0]!;
    const text = u.describe?.(move) ?? { name: u.name, description: u.description };
    picked.push({ id: u.id, ...text });
  }
  return picked;
}

/** A carta "Evoluir" desta escolha, se o nível já permite e existe uma próxima forma real (ramos: sorteia um). */
function evolutionOffer(state: SurvivorState): SurvivorUpgradeOption | null {
  const p = state.player;
  const needed = EVOLVE_LEVELS[p.stage];
  if (needed === undefined || p.level < needed || p.dexId <= 0) return null;
  const options = state.evolutions(p.dexId);
  if (options.length === 0) return null;
  const next = options[Math.floor(state.rng() * options.length)]!;
  return { id: `${EVOLVE_PREFIX}${next.dexId}`, name: `Evoluir para ${next.name}`, description: 'Os números passam a ser os dos stats da nova forma, com +30 de HP (cura tudo) e golpe mais forte.[...]'}
}

function levelUp(state: SurvivorState, events: SurvivorEvent[]): void {
  while (state.player.xp >= state.player.xpToNext) {
    state.player.xp -= state.player.xpToNext;
    state.player.level += 1;
    state.player.xpToNext = xpForLevel(state.player.level);
    state.upgradesOwed += 1;
    events.push({ type: 'levelup', level: state.player.level });
  }
  offerOwedUpgrade(state);
}

/** Abre a próxima escolha de upgrade devida, se não houver uma aberta. */
function offerOwedUpgrade(state: SurvivorState): void {
  if (state.pendingUpgrade || state.upgradesOwed <= 0) return;
  state.upgradesOwed -= 1;
  const options = rollUpgrades(state.rng, 3, state.player.move);
  const evolve = evolutionOffer(state);
  if (evolve) options.splice(options.length - 1, 1, evolve);
  state.pendingUpgrade = options;
}

/**
 * Aplica o upgrade escolhido e libera o jogo (ver `pendingUpgrade`). `id` fora do catálogo não faz nada. Se ainda
 * houver níveis devidos (subiu mais de um de uma vez), a próxima escolha abre em seguida.
 */
export function applyUpgrade(state: SurvivorState, id: string): SurvivorEvent[] {
  const events: SurvivorEvent[] = [];
  const offered = state.pendingUpgrade?.some((o) => o.id === id) ?? false;
  if (id.startsWith(EVOLVE_PREFIX)) {
    // Só evolui para a forma que foi oferecida nesta escolha (nunca para um id qualquer).
    const dexId = Number(id.slice(EVOLVE_PREFIX.length));
    const next = offered ? state.evolutions(state.player.dexId).find((o) => o.dexId === dexId) : undefined;
    if (next) {
      evolvePlayer(state, next);
      events.push({ type: 'evolve', dexId: next.dexId, name: next.name });
    }
  } else {
    const upgrade = SURVIVOR_UPGRADES.find((u) => u.id === id);
    // Upgrades comuns também precisam ser uma escolha real da rodada. Isso impede que uma
    // chamada atrasada ou manipulada aplique um bônus que nunca foi oferecido.
    if (upgrade && offered) upgrade.apply(state.player);
  }
  state.pendingUpgrade = null;
  offerOwedUpgrade(state);
  return events;
}

/**
 * Evolui: com os stats das duas formas, cada número muda na proporção dos stats novos (os upgrades já pegos continuam
 * valendo) e ainda ganha o bônus da evolução; sem stats, só os bônus fixos.
 */
function evolvePlayer(state: SurvivorState, next: SurvivorEvolutionOption): void {
  const p = state.player;
  const old = state.profile;
  const now = next.profile;
  const ratio = (a: number, b: number): number => (a > 0 && b > 0 ? b / a : 1);
  p.dexId = next.dexId;
  p.stage += 1;
  if (old && now) {
    p.maxHp = Math.round(p.maxHp * ratio(old.maxHp, now.maxHp)) + 30;
    p.attackDamage = round1(p.attackDamage * ratio(old.damage, now.damage) * 1.15);
    p.attackCooldownMs = Math.max(120, Math.round(p.attackCooldownMs * ratio(old.cooldownMs, now.cooldownMs)));
    p.attackRadius = round1(p.attackRadius * ratio(old.radius, now.radius) * 1.1);
    p.attackRange = round1(p.attackRange * 1.1);
    p.speed = round1(p.speed * ratio(old.walkSpeed, now.walkSpeed));
    p.projectileSpeed = round1(p.projectileSpeed * ratio(old.projectileSpeed, now.projectileSpeed));
    p.projectileSize = now.projectileSize;
    state.profile = now;
  } else {
    p.maxHp += 30;
    p.attackDamage = round1(p.attackDamage * 1.35);
    p.attackRadius = round1(p.attackRadius * 1.15);
    p.attackRange = round1(p.attackRange * 1.1);
  }
  p.hp = p.maxHp;
  state.fx.push({ kind: 'evolve', x: p.x, y: p.y, r: 60, color: '#ffffff', ageMs: 0, lifeMs: 900 });
}

const EFFECT_MS = { burn: 2000, slow: 1500, stun: 400, bossStun: 150 } as const;

/** Dano de um golpe num inimigo, com o efeito do tipo. `from` é de onde o golpe veio (para empurrar). */
function hitEnemy(state: SurvivorState, e: SurvivorEnemy, damage: number, from: { x: number; y: number }): void {
  const move = state.player.move;
  e.hp -= damage;
  e.hitFlashMs = 90;
  switch (move.effect) {
    case 'queimar':
      e.burnMs = EFFECT_MS.burn;
      e.burnDps = Math.max(e.burnDps ?? 0, round1(damage * 0.35));
      break;
    case 'lentidao':
      e.slowMs = EFFECT_MS.slow;
      break;
    case 'atordoar':
      e.stunMs = e.boss ? EFFECT_MS.bossStun : EFFECT_MS.stun;
      break;
    case 'empurrar': {
      const dx = e.x - from.x;
      const dy = e.y - from.y;
      const d = Math.hypot(dx, dy) || 1;
      const push = e.boss ? 6 : 22;
      e.x += (dx / d) * push;
      e.y += (dy / d) * push;
      break;
    }
    default:
      break;
  }
}

/** Roubar vida: cura um pouco por ataque que acertou alguém (no máximo 2 por ataque, para a aura não curar demais). */
function drain(state: SurvivorState, hits: number): void {
  if (state.player.move.effect !== 'roubar' || hits <= 0) return;
  const p = state.player;
  p.hp = Math.min(p.maxHp, p.hp + Math.min(2, hits));
}

/** Os `count` inimigos mais próximos dentro de `range`, do mais perto ao mais longe. */
function nearestEnemies(state: SurvivorState, range: number, count: number): SurvivorEnemy[] {
  const p = state.player;
  return state.enemies
    .map((e) => ({ e, d: Math.hypot(e.x - p.x, e.y - p.y) }))
    .filter((x) => x.d <= range)
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((x) => x.e);
}

function fireProjectiles(state: SurvivorState, target: SurvivorEnemy): void {
  const p = state.player;
  const move = p.move;
  const baseAngle = Math.atan2(target.y - p.y, target.x - p.x);
  const spread = 0.26;
  for (let i = 0; i < p.shots; i++) {
    const offset = p.shots === 1 ? 0 : (i - (p.shots - 1) / 2) * spread;
    const angle = baseAngle + offset;
    state.projectiles.push({
      id: state.nextId++,
      x: p.x,
      y: p.y,
      vx: Math.cos(angle) * p.projectileSpeed,
      vy: Math.sin(angle) * p.projectileSpeed,
      damage: p.attackDamage,
      pierce: p.pierce + (move.effect === 'atravessar' ? 1 : 0),
      lifeMs: 1600,
      hit: [],
      canChain: move.effect === 'saltar',
      size: p.projectileSize,
    });
  }
}

/** Um ataque do golpe de quem joga; devolve false se não havia alvo (o tempo de recarga não começa). */
function attack(state: SurvivorState): boolean {
  const p = state.player;
  const move = p.move;
  if (move.category === 'projetil') {
    const [target] = nearestEnemies(state, p.attackRange, 1);
    if (!target) return false;
    fireProjectiles(state, target);
    return true;
  }
  if (move.category === 'aura' || move.category === 'orbit') {
    // A aura pulsa sempre (dá para ver o raio), mesmo sem ninguém dentro.
    let hits = 0;
    for (const e of state.enemies) {
      const distance = Math.hypot(e.x - p.x, e.y - p.y);
      const inRange = move.category === 'orbit'
        ? distance >= p.attackRadius * 0.48 - e.radius && distance <= p.attackRadius + e.radius
        : distance <= p.attackRadius + e.radius;
      if (inRange) {
        hitEnemy(state, e, p.attackDamage, p);
        hits++;
      }
    }
    drain(state, hits);
    state.fx.push({ kind: 'pulse', x: p.x, y: p.y, r: p.attackRadius, color: move.color, ageMs: 0, lifeMs: 360 });
    return true;
  }
  if (move.category === 'cone') {
    let hits = 0;
    const direction = p.facing;
    for (const e of state.enemies) {
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= p.attackRange + e.radius && dx * direction / (distance || 1) >= 0.35) {
        hitEnemy(state, e, p.attackDamage, p);
        hits++;
      }
    }
    drain(state, hits);
    state.fx.push({ kind: 'blast', x: p.x + direction * p.attackRange * 0.55, y: p.y, r: p.attackRange * 0.55, color: move.color, ageMs: 0, lifeMs: 300 });
    return true;
  }
  const targets = nearestEnemies(state, p.attackRange, p.shots);
  if (targets.length === 0) return false;
  let hits = 0;
  for (const t of targets) {
    const center = { x: t.x, y: t.y };
    for (const e of state.enemies) {
      if (Math.hypot(e.x - center.x, e.y - center.y) <= p.attackRadius + e.radius) {
        hitEnemy(state, e, p.attackDamage, center);
        hits++;
      }
    }
    state.fx.push({ kind: 'blast', x: center.x, y: center.y, r: p.attackRadius, color: move.color, ageMs: 0, lifeMs: 420 });
  }
  drain(state, hits);
  return true;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Avança `dtMs` de jogo. Não faz nada (devolve `[]`) se `state.over` ou se há um upgrade pendente — quem chama
 * (o componente Vue) deve pausar o laço de desenho/tempo nesses casos e só retomar depois de `applyUpgrade`.
 */
export function stepSurvivor(state: SurvivorState, input: SurvivorInput, dtMs: number): SurvivorEvent[] {
  const events: SurvivorEvent[] = [];
  if (state.over || state.pendingUpgrade) return events;
  const dt = dtMs / 1000;
  state.elapsedMs += dtMs;
  const p = state.player;

  // Movimento do jogador, com a arena como cerca.
  const len = Math.hypot(input.dx, input.dy);
  if (len > 0.001) {
    const ux = input.dx / len;
    const uy = input.dy / len;
    p.x = clamp(p.x + ux * p.speed * dt, PLAYER_RADIUS, ARENA_W - PLAYER_RADIUS);
    p.y = clamp(p.y + uy * p.speed * dt, PLAYER_RADIUS, ARENA_H - PLAYER_RADIUS);
    if (Math.abs(ux) > 0.01) p.facing = ux < 0 ? -1 : 1;
  }
  if (p.invulnMs > 0) p.invulnMs = Math.max(0, p.invulnMs - dtMs);

  // Nascimento de inimigos (onda cresce com o tempo) e do chefe periódico.
  state.wave = 1 + Math.floor(state.elapsedMs / 30_000);
  state.spawnAccumMs += dtMs;
  const interval = spawnIntervalMs(state);
  while (state.spawnAccumMs >= interval) {
    state.spawnAccumMs -= interval;
    spawnEnemy(state, false);
  }
  if (state.elapsedMs >= state.nextBossAtMs) {
    state.nextBossAtMs += BALANCE.bossEveryMs;
    spawnEnemy(state, true);
    events.push({ type: 'bossSpawn' });
  }

  // Treinadores (minuto 5, 10, 15, …): 3 Pokémon elite juntos. O chefão final (minuto 20) tem 6 Pokémon.
  // No modo infinito, depois do chefão final, cai outro chefão de 6 a cada `INFINITE_BOSS_EVERY_MS`.
  if (state.infinite) state.infiniteScale = 1.25 + (state.elapsedMs / 60_000) * INFINITE_SCALE_PER_MIN;
  const finalDue = state.finalBossAtMs !== null && state.elapsedMs >= state.finalBossAtMs;
  if (finalDue) {
    state.finalBossAtMs = null;
    spawnTrainer(state, 6, true, events);
    if (state.infinite) state.nextTrainerAtMs = state.elapsedMs + INFINITE_BOSS_EVERY_MS;
  } else if (state.elapsedMs >= state.nextTrainerAtMs && (state.finalBossAtMs === null || state.elapsedMs + 15_000 < state.finalBossAtMs)) {
    state.nextTrainerAtMs += state.infinite ? INFINITE_BOSS_EVERY_MS : TRAINER_EVERY_MS;
    spawnTrainer(state, state.infinite ? 6 : 3, false, events);
  }

  // Inimigos perseguem o jogador e batem de perto (atordoado não anda; lento anda pela metade; queimado perde vida).
  for (const e of state.enemies) {
    if (e.hitFlashMs > 0) e.hitFlashMs = Math.max(0, e.hitFlashMs - dtMs);
    if (e.burnMs && e.burnMs > 0) {
      e.hp -= (e.burnDps ?? 0) * (Math.min(dtMs, e.burnMs) / 1000);
      e.burnMs = Math.max(0, e.burnMs - dtMs);
      if (e.burnMs === 0) e.burnDps = 0;
    }
    if (e.slowMs && e.slowMs > 0) e.slowMs = Math.max(0, e.slowMs - dtMs);
    const stunned = !!e.stunMs && e.stunMs > 0;
    if (stunned) e.stunMs = Math.max(0, (e.stunMs ?? 0) - dtMs);
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = stunned ? 0 : e.slowMs && e.slowMs > 0 ? e.speed * 0.5 : e.speed;
    e.x += (dx / d) * speed * dt;
    e.y += (dy / d) * speed * dt;
    if (d < PLAYER_RADIUS + e.radius && p.invulnMs <= 0) {
      p.hp = Math.max(0, p.hp - e.damage);
      p.invulnMs = 500;
    }
  }

  // Autoataque com o golpe do tipo (projétil, aura ou área).
  p.attackTimerMs = Math.max(0, p.attackTimerMs - dtMs);
  if (p.attackTimerMs <= 0 && attack(state)) p.attackTimerMs = p.attackCooldownMs;

  // Projéteis: avançam, somem com o tempo/fora da arena, acertam o inimigo mais próximo no caminho.
  const chained: SurvivorProjectile[] = [];
  state.projectiles = state.projectiles.filter((proj) => {
    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;
    proj.lifeMs -= dtMs;
    if (proj.lifeMs <= 0) return false;
    if (proj.x < -40 || proj.x > ARENA_W + 40 || proj.y < -40 || proj.y > ARENA_H + 40) return false;
    for (const e of state.enemies) {
      if (proj.hit.includes(e.id)) continue;
      if (Math.hypot(e.x - proj.x, e.y - proj.y) < e.radius + 5) {
        hitEnemy(state, e, proj.damage, { x: proj.x - proj.vx * 0.05, y: proj.y - proj.vy * 0.05 });
        drain(state, 1);
        proj.hit.push(e.id);
        if (proj.canChain) {
          // Salta uma vez para o inimigo mais próximo deste (que ainda não foi atingido), com 70% do dano.
          proj.canChain = false;
          const next = state.enemies
            .filter((o) => o !== e && !proj.hit.includes(o.id) && Math.hypot(o.x - e.x, o.y - e.y) <= 140)
            .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
          if (next) {
            const ang = Math.atan2(next.y - e.y, next.x - e.x);
            const speed = Math.hypot(proj.vx, proj.vy);
            chained.push({ id: state.nextId++, x: e.x, y: e.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, damage: round1(proj.damage * 0.7), pierce: 0, lifeMs: 600, hit: [...proj.hit], canChain: false, size: proj.size });
          }
        }
        if (proj.pierce <= 0) return false;
        proj.pierce -= 1;
        break;
      }
    }
    return true;
  });

  state.projectiles.push(...chained);

  // Marcas visuais envelhecem e somem.
  if (state.fx.length > 0) {
    for (const f of state.fx) f.ageMs += dtMs;
    state.fx = state.fx.filter((f) => f.ageMs < f.lifeMs);
  }

  // Inimigos derrotados viram orbe de XP e contam na pontuação.
  const dead = state.enemies.filter((e) => e.hp <= 0);
  if (dead.length > 0) {
    state.enemies = state.enemies.filter((e) => e.hp > 0);
    state.kills += dead.length;
    for (const e of dead) {
      const value = e.boss ? 40 : e.grade === 'chefao' ? 30 : e.grade === 'elite' ? 16 : 6;
      state.orbs.push({ id: state.nextId++, x: e.x, y: e.y, value });
    }
    // Treinador derrotado: nenhum Pokémon dele continua em pé.
    const trainerIds = new Set(dead.map((e) => e.trainerId).filter((id): id is number => id !== undefined));
    for (const id of trainerIds) {
      if (state.enemies.some((e) => e.trainerId === id)) continue;
      const sample = dead.find((e) => e.trainerId === id);
      const final = sample?.grade === 'chefao';
      state.trainersBeaten += 1;
      if (final) state.bossesBeaten += 1;
      if (final && !state.infinite) state.finalBossBeaten = true;
      events.push({ type: 'trainerDown', final });
      // Chefão final caído no modo normal: a corrida termina com vitória (fecha o resumo e destrava o infinito).
      if (final && !state.infinite && !state.over) {
        state.over = true;
        events.push({
          type: 'gameover',
          summary: { survivedMs: state.elapsedMs, level: state.player.level, stage: state.player.stage, kills: state.kills, wave: state.wave, trainersBeaten: state.trainersBeaten, bossesBeaten: state.bossesBeaten, finalBossBeaten: state.finalBossBeaten, infinite: state.infinite },
        });
      }
    }
  }

  // Coleta de orbes de XP (e nível, se passou da marca).
  state.orbs = state.orbs.filter((orb) => {
    if (Math.hypot(orb.x - p.x, orb.y - p.y) <= p.pickupRadius) {
      p.xp += orb.value;
      return false;
    }
    return true;
  });
  levelUp(state, events);

  if (p.hp <= 0 && !state.over) {
    state.over = true;
    events.push({
      type: 'gameover',
      summary: { survivedMs: state.elapsedMs, level: p.level, stage: p.stage, kills: state.kills, wave: state.wave, trainersBeaten: state.trainersBeaten, bossesBeaten: state.bossesBeaten, finalBossBeaten: state.finalBossBeaten, infinite: state.infinite },
    });
  }

  return events;
}
