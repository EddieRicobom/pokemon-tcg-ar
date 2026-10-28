import { seededRng } from './battle';
import { statsOfDex } from './survivor-stats';
import type { Rng } from './battle';
import type { AttackProfile, MoveCategory, SurvivorMove } from './survivor-moves';
import { survivorBiomeDamageMultiplier, survivorBiomeMovementMultiplier, survivorBiomeProjectileSpeedMultiplier } from './survivor-biomes';
import { survivorElementalStatus, survivorSynergyFor } from './survivor-synergies';
import { survivorPreparation } from './survivor-preparations';
import { MAX_OFFER_CHOICES, PURE_LOADOUT } from './survivor-loadout';
import type { TowerLoadout } from './survivor-loadout';
import { LUNCH_HEAL_CAP_FRACTION, TRAINING_DEFENSE_CAP, TRAINING_SPEED_CAP } from './survivor-lunch';
import { endSurvivorMega, startSurvivorMega, stepSurvivorMega, survivorPlayerStats } from './survivor-mega';
import type { SurvivorMegaForm } from './survivor-mega';
import type { SurvivorPreparationId } from './survivor-preparations';
import { advanceSpecialEncounter, breakSurvivorShield, createSurvivorSpecial, DASH_DAMAGE_MULTIPLIER, DASH_TRIPLE_DAMAGE_MULTIPLIER, SPECIAL_GUARDIANS, specialProtects, stepSurvivorSpecial } from './survivor-specials';
import { inSurvivorCone, SURVIVOR_CONE_HALF_ANGLE, SURVIVOR_ORBIT_BASE, SURVIVOR_ORBIT_MAX, survivorAimAngle, survivorOrbitAngularSpeed, survivorOrbiterHitRadius, survivorOrbiters, survivorOrbitHitIntervalMs } from './survivor-shapes';
import type { PokemonType } from './pokemon-data';

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

export * from './survivor-types';
import { ARENA_H, ARENA_W, DIGITAL_DANGER_COOLDOWN_MS, DIGITAL_DANGER_MAX, DIGITAL_DANGER_UNLOCK_MS, DIGITAL_DANGER_VISIBLE_RADIUS, MAGNET_PICKUP_RADIUS_CAP, MAX_DIGITAL_POKEBALLS_PER_RUN, MAX_SURVIVOR_SUPPORTS, PICKUP_RADIUS, PLAYER_RADIUS, SPAWN_MARGIN, SURVIVOR_LOVE_CANDY_MS, SURVIVOR_MEGA_SHARD_MS, SURVIVOR_SHADOW_BALL_EVERY_MS, SURVIVOR_SHADOW_BALL_FIRST_MS, SURVIVOR_SHADOW_BALL_MAX_PER_RUN, SURVIVOR_SHADOW_CUTSCENE_MS, SURVIVOR_SPAWN_DISTANCE, SURVIVOR_SUPPORT_EVOLUTION_OFFER_CHANCE, SURVIVOR_SUPPORT_RARE_OFFER_CHANCE, SURVIVOR_TRUST_STONE_MS, SURVIVOR_UPGRADE_RARITIES } from './survivor-types';
import type { SurvivorArtifactKind, SurvivorFinalHit, SurvivorHitSource, SurvivorEnemy, SurvivorEnemyArchetype, SurvivorEnemyGrade, SurvivorEvent, SurvivorEvolutionOption, SurvivorInput, SurvivorPlayer, SurvivorProjectile, SurvivorState, SurvivorSupport, SurvivorSupportCandidate, SurvivorSupportRole, SurvivorTypeAffinity, SurvivorUpgrade, SurvivorUpgradeOption, SurvivorUpgradeRarity } from './survivor-types';
import { SURVIVOR_UPGRADES, SURVIVOR_RARITY_ORDER, round1 } from './survivor-upgrades';
import { survivorProjectileLook } from './survivor-projectile-power';
export { SURVIVOR_UPGRADES };

/** Estoque máximo de Desejos de Jirachi (a carta, a lição do Dojô e a sorte do Carteiro somam até aqui). */
export const MAX_STARTING_REROLLS_STOCK = 3;

/** Níveis a partir dos quais a carta "Evoluir" aparece: o 1º para a 1ª evolução, o 2º para a 2ª. */
export const EVOLVE_LEVELS = [8, 16] as const;
const EVOLVE_PREFIX = 'evolve:';
const SUPPORT_EVOLVE_PREFIX = 'support-evolve:';
/** Lendários reais que podem atravessar uma Pokébola Sombria; o sorteio usa o RNG da corrida. */
const SHADOW_GUARDIANS = Object.values(SPECIAL_GUARDIANS);

// ----------------------------------------------------------------------------- treinadores e chefão

/** Quando o primeiro treinador aparece (ms); depois, de `TRAINER_EVERY_MS` em `TRAINER_EVERY_MS`. */
export const TRAINER_FIRST_MS = 300_000;
export const TRAINER_EVERY_MS = 300_000;
/** Quando o chefão final aparece (ms). Vence-lo destrava o modo infinito. */
export const FINAL_BOSS_MS = 1_200_000;
/** O Ritmo acelerado encerra no minuto 10 do relógio exibido (cinco minutos reais). */
export const FAST_FINAL_BOSS_MS = 600_000;
/** O laço visual passa este fator ao motor; a arte continua no ritmo normal. */
export const FAST_TIME_SCALE = 2;
/** Bônus por orbe no Ritmo acelerado: compensa a corrida curta sem pular níveis demais. */
export const FAST_XP_MULTIPLIER = 1.75;
/** Depois do chefão final (modo infinito), outro chefão (6 Pokémon) a cada tanto. */
export const INFINITE_BOSS_EVERY_MS = 300_000;
/** Cada minuto no infinito dá +`INFINITE_SCALE_PER_MIN` ao HP e ao dano de todos os inimigos novos. */
export const INFINITE_SCALE_PER_MIN = 0.06;

/** Golpe padrão do motor (testes e simulação): um projétil simples, sem efeito. A Torre sempre passa o golpe do tipo. */
export const BASIC_MOVE: SurvivorMove = { type: 'normal', name: 'Golpe', category: 'projetil', effect: 'nenhum', color: '#fffbe0', icon: '✦' };

/**
 * Parâmetros centrais de ritmo e dificuldade. A comparação automatizada orienta regressões, mas não comprova equilíbrio;
 * o ajuste final ainda precisa de partidas reais em aparelho.
 */
export const BALANCE = {
  xpBase: 12,
  xpPerLevel: 8,
  /** Orbes soltam 65% da XP anterior; o resto fracionário é carregado para o próximo orbe. */
  xpOrbMultiplier: 0.65,
  /** Chefes periódicos: ameaças raras, mas com vida suficiente para exigir reposicionamento e coleta sob pressão. */
  bossHpBase: 220,
  bossHpPerWave: 55,
  bossSpeed: 72,
  bossDamageBase: 15,
  bossDamagePerWave: 1.5,
  /** Lendários de Pokébola Sombria: encontros opcionais de risco médio-alto. */
  shadowBossHpMultiplier: 4.5,
  shadowBossDamageMultiplier: 2.2,
  shadowBossSpeed: 88,
  enemyHpBase: 16,
  /** Vida extra a cada `enemyHpEverySec` segundos; a simulação agora usa os golpes reais das espécies. */
  enemyHpStep: 2,
  enemyHpEverySec: 30,
  enemyHpPerWave: 2,
  enemyDamageBase: 6,
  enemyDamageStep: 1,
  enemyDamageEverySec: 40,
  enemySpeedBase: 50,
  enemySpeedRandom: 20,
  /** Curva de proteção inicial: converge para 1 aos 8 min, suavizando a chegada aos ramos de 7 min. */
  earlyGameMs: 480_000,
  earlySpawnIntervalBonus: 0.75,
  earlyEnemyHpMultiplier: 0.70,
  earlyEnemyDamageMultiplier: 0.48,
  earlyEnemySpeedMultiplier: 0.68,
  /** Ataques de exposição recebem uma margem curta contra colisões e projéteis. */
  closeRangeDamageMultiplier: 0.88,
  /** Atiradores andam mais devagar para abrir espaço de reação. */
  rangedEnemySpeedMultiplier: 0.5,
  /** Velocidade dos projéteis inimigos (antes: 170). */
  hostileProjectileSpeed: 85,
  /** A aura reduz em 20% a velocidade de projéteis enquanto estiverem no seu raio. */
  auraProjectileSpeedMultiplier: 0.8,
  /** Compensação moderada para golpes de exposição: melhora o dano sem apagar a vantagem do alcance. */
  closeRangeAttackDamageMultiplier: 1.12,
  /** Intervalo entre nascimentos (ms) = início − porSegundo·t − porOnda·onda, nunca abaixo do piso. */
  spawnStartMs: 2400,
  spawnPerSecMs: 4,
  spawnPerWaveMs: 15,
  spawnFloorMs: 450,
  /** Pequeno aumento de densidade, sem reduzir o piso de segurança da arena. */
  spawnRateMultiplier: 0.90,
  /** Intervalo de invulnerabilidade após qualquer acerto; dá tempo para reposicionar sem remover o perigo. */
  hitInvulnerabilityMs: 750,
  playerDamage: 10,
  playerCooldownMs: 600,
  /** Distância inicial usada para normalizar a queda de dano dos golpes diretos. */
  defaultAttackDistance: 170,
  /** Mesmo no limite do alcance, um golpe direto mantém impacto suficiente para não invalidar builds de alcance. */
  directDamageMinMultiplier: 0.55,
  /** Primeiro chefe e intervalo entre os seguintes (ms). */
  /** O primeiro chefe respeita o aprendizado; depois a Torre chama um novo a cada minuto. */
  firstBossMs: 60_000,
  bossEveryMs: 60_000,
  /** Treinadores entram mais fortes sem alterar a curva dos inimigos comuns. */
  trainerStatMultiplier: 1.3,
  /** Artefatos são uma válvula de recuperação: um pouco mais comuns após a escalada de inimigos. */
  artifactDropChance: 0.15,
  artifactEliteDropChance: 0.3,
  artifactBossDropChance: 0.5,
  /** Depois dos 10 minutos, uma morte pode deixar uma Pokébola especial. A chance varia por grau. */
  digitalPokeballDropChance: {
    comum: 0.005,
    elite: 0.02,
    chefao: 0.10,
  },
  /** Chance independente de qualquer inimigo deixar um orbe de XP dobrada. */
  doubleXpOrbChance: 0.08,
  artifactSpeedMultiplier: 1.35,
  artifactPowerMultiplier: 1.25,
  artifactDurationMs: 8_000,
} as const;

/** Limites de segurança para comportamentos especiais; são limites do motor, não atributos oficiais. */
export const ENEMY_BEHAVIOR_LIMITS = {
  maxEnemies: 220,
  hostileProjectiles: 48,
  healingTargetsPerPulse: 3,
  maxProtectionTargets: 4,
  /** Limite de suportes vivos no elenco padrão; evita uma tela dominada por curas/efeitos. */
  maxSupportEnemiesEarly: 1,
  maxSupportEnemiesMid: 2,
  maxSupportEnemiesLate: 3,
  specialEffectsPerStep: 8,
} as const;

/**
 * A progressão de XP usa passos de duas unidades. As recompensas atuais já são
 * pares; a normalização também protege corridas/saves antigas caso um valor
 * ímpar chegue ao motor no futuro.
 */
export const SURVIVOR_XP_UNIT = 2;

export function normalizeSurvivorXp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value / SURVIVOR_XP_UNIT) * SURVIVOR_XP_UNIT);
}

export function xpForLevel(level: number): number {
  return normalizeSurvivorXp(Math.round(BALANCE.xpBase + level * BALANCE.xpPerLevel));
}

export interface CreateSurvivorOptions {
  /** Resolve apenas a espécie visual, preservando os números da onda e do grau. */
  enemyDexId?: (enemy: Readonly<SurvivorEnemy>, elapsedMs: number, runSeed: number) => number;
  /** Perfil interno do inimigo. Se omitido, os quatro tipos comuns alternam por `kind`. */
  enemyArchetypeFor?: (enemy: Pick<SurvivorEnemy, 'kind' | 'boss' | 'grade'>) => SurvivorEnemyArchetype;
  /** Quantas espécies "comuns" o elenco desta corrida tem (o chefe usa o índice seguinte). Mínimo 1. */
  kindCount: number;
  /** Golpe de quem joga (ver `moveFor`); padrão `BASIC_MOVE`. */
  move?: SurvivorMove;
  /** Números pelos stats da espécie (ver `attackProfile`); sem isto, os números padrão do motor. */
  profile?: AttackProfile;
  /** Golpe secundário real (por exemplo, o segundo tipo). Se omitido, o motor cria uma técnica interna compatível. */
  secondMove?: SurvivorMove;
  /** Segundo Pokémon real elegível como apoio nesta corrida (compatibilidade com chamadas antigas). */
  supportCandidate?: SurvivorSupportCandidate;
  /** Até cinco Pokémon reais elegíveis como apoio nesta corrida. */
  supportCandidates?: readonly SurvivorSupportCandidate[];
  /** Espécie de quem joga (para a evolução). */
  dexId?: number;
  /**
   * Próximas formas REAIS de uma espécie que a Torre consegue mostrar (quem chama filtra as que não têm sprite).
   * Sem isto (ou com lista vazia), a carta "Evoluir" nunca aparece.
   */
  evolutions?: (dexId: number, move?: SurvivorMove) => readonly SurvivorEvolutionOption[];
  player?: Partial<SurvivorPlayer>;
  /** Começa já no modo infinito (precisa ser destravado antes: `TrainerState.torre.infiniteUnlocked`). */
  infinite?: boolean;
  /** Corrida curta desbloqueada após zerar a Torre: relógio 2×, orbes 1,75× XP e chefão aos 10 min. */
  fast?: boolean;
  /** Variante opcional com câmera em terceira pessoa, terreno físico e salto. */
  bonk?: boolean;
  /** Preparação estratégica opcional, liberada por objetivos de corridas concluídas. */
  preparation?: SurvivorPreparationId;
  /** O que a Vila entrega (Dojô, sorte do Carteiro, marmita). Sem isto a corrida é a de sempre; vale também no BONK. */
  loadout?: TowerLoadout;
  /** Segundo tipo raro escolhido no início da corrida. */
  typeAffinity?: SurvivorTypeAffinity;
  /** Tipos secundários reais da espécie; a escolha só aparece após o primeiro líder derrotado. */
  typeAffinityChoices?: readonly PokemonType[];
  /** Forma Mega temporária escolhida na seleção (`core/survivor-mega.ts`); começa ativa e dura `megaDurationMs`. */
  mega?: SurvivorMegaForm;
  megaDurationMs?: number;
}

/** Técnica interna da Torre para que até Pokémon de um tipo tenham uma segunda opção desbloqueável. */
function secondaryMoveFor(move: SurvivorMove): SurvivorMove {
  const categories: readonly MoveCategory[] = ['projetil', 'area', 'cone', 'aura', 'orbit'];
  const category = categories[(categories.indexOf(move.category) + 1) % categories.length]!;
  return { ...move, category, name: `${move.name} secundário`, icon: '✦' };
}

export function createSurvivorState(seed: number, options: CreateSurvivorOptions): SurvivorState {
  const move = options.move ?? BASIC_MOVE;
  const fast = options.fast === true && options.infinite !== true;
  const shadowGuardian = SHADOW_GUARDIANS[0]!;
  const prof = options.profile;
  const preparation = survivorPreparation(options.preparation);
  const loadout = options.loadout ?? PURE_LOADOUT;
  const lunch = loadout.lunch;
  const baseMaxHp = (prof?.maxHp ?? 100) + loadout.maxHpBonus;
  const secondMoveCandidate = options.secondMove ?? secondaryMoveFor(move);
  const supportCandidates = [...(options.supportCandidates ?? (options.supportCandidate ? [options.supportCandidate] : []))].slice(0, MAX_SURVIVOR_SUPPORTS);
  const player: SurvivorPlayer = {
    dexId: options.dexId ?? 0,
    stage: 0,
    move,
    attackRadius: prof?.radius ?? 0,
    projectileSize: prof?.projectileSize ?? 4,
    x: ARENA_W / 2,
    y: ARENA_H / 2,
    hp: baseMaxHp,
    maxHp: baseMaxHp,
    speed: (prof?.walkSpeed ?? 150) * preparation.speedMultiplier * (1 + loadout.speedBonus),
    level: 1,
    xp: 0,
    xpToNext: xpForLevel(1),
    xpMultiplier: fast ? FAST_XP_MULTIPLIER : 1,
    attackDamage: (prof?.damage ?? BALANCE.playerDamage) * preparation.damageMultiplier,
    areaDamageMultiplier: move.category === 'area' ? 0.15 : 1,
    attackRange: (prof?.range ?? 170) * preparation.rangeMultiplier,
    attackCooldownMs: prof?.cooldownMs ?? BALANCE.playerCooldownMs,
    attackTimerMs: 0,
    projectileSpeed: prof?.projectileSpeed ?? 360,
    pierce: 0,
    shots: 1,
    invulnMs: 0,
    artifactSpeedMs: 0,
    artifactPowerMs: 0,
    artifactShieldMs: 0,
    artifactMagnetMs: 0,
    artifactFocusMs: 0,
    facing: 1,
    aimAngle: 0,
    orbitAngle: 0,
    pickupRadius: PICKUP_RADIUS * preparation.pickupRadiusMultiplier * (1 + loadout.pickupBonus),
    upgradeChoices: 3,
    upgradeRerolls: Math.min(MAX_STARTING_REROLLS_STOCK, loadout.startingRerolls),
    ...(loadout.defenseBonus > 0 ? { trainingDefense: loadout.defenseBonus } : {}),
    ...(lunch ? {
      lunch: { effect: lunch, healed: 0, active: true },
      // A marmita de Raiz e a de Fresco somam com o Dojô até o teto combinado; o excedente simplesmente não vale.
      lunchDefense: Math.min(lunch.defense, Math.max(0, TRAINING_DEFENSE_CAP - loadout.defenseBonus)),
      lunchSpeedBonus: Math.min(lunch.speedBonus, Math.max(0, TRAINING_SPEED_CAP - loadout.speedBonus)),
      lunchPickupBonus: lunch.pickupBonus,
      lunchHitInvulnBonus: lunch.hitInvulnBonus,
    } : {}),
    bonkJumpPower: 470,
    bonkAirJumps: 0,
    bonkGravityFactor: 1,
    bonkMode: options.bonk === true,
    upgradeLevels: {},
    ...options.player,
  };
  const state: SurvivorState = {
    special: createSurvivorSpecial(move.type),
    rng: seededRng(seed),
    runSeed: Math.floor(seed) >>> 0,
    enemyDexId: options.enemyDexId ?? null,
    elapsedMs: 0,
    player,
    enemies: [],
    projectiles: [],
    hostileProjectiles: [],
    orbs: [],
    artifacts: [],
    digitalPokeballs: 0,
    digitalDanger: 0,
    digitalDangerCooldownMs: 0,
    shadowEncounter: { phase: 'idle', dexId: shadowGuardian.dexId, name: shadowGuardian.name, arrivalMs: 0 },
    nextShadowBallAtMs: SURVIVOR_SHADOW_BALL_FIRST_MS,
    shadowBallsSpawned: 0,
    shadowTrustStones: 0,
    fx: [],
    kills: 0,
    wave: 1,
    spawnAccumMs: 0,
    // O relógio do rápido corre 2×; alongar as janelas mantém a pressão por segundo real próxima da corrida normal.
    nextBossAtMs: BALANCE.firstBossMs * (fast ? FAST_TIME_SCALE : 1),
    kindCount: Math.max(1, Math.floor(options.kindCount)),
    over: false,
    nextTrainerAtMs: TRAINER_FIRST_MS,
    finalBossAtMs: fast ? FAST_FINAL_BOSS_MS : FINAL_BOSS_MS,
    trainersBeaten: 0,
    bossesBeaten: 0,
    finalBossBeaten: false,
    infinite: options.infinite === true,
    fast,
    bonk: options.bonk === true,
    infiniteScale: options.infinite === true ? 1.15 : 1,
    pendingUpgrade: null,
    upgradesOwed: 0,
    bansLeft: loadout.bans,
    bannedUpgradeIds: [],
    firstOfferBonus: loadout.firstOfferExtraChoices,
    towerSummary: [...loadout.summary],
    trained: loadout.trained,
    nextId: 1,
    evolutions: options.evolutions ?? (() => []),
    profile: prof ?? null,
    enemyArchetypeFor: options.enemyArchetypeFor ?? null,
    secondMoveCandidate,
    supportCandidate: null,
    supportCandidates,
    supports: [],
    support: null,
    supportCandidateGuaranteed: false,
    secondAttackOffered: false,
    typeAffinity: options.typeAffinity ?? null,
    typeAffinityChoices: [...(options.typeAffinityChoices ?? [])],
    typeAffinityOffered: false,
  };
  if (options.mega) startSurvivorMega(state, options.mega, options.megaDurationMs);
  return state;
}

/** Ativa a afinidade oferecida pelo primeiro treinador; rejeita tipos que não pertencem à espécie. */
export function chooseSurvivorTypeAffinity(state: SurvivorState, type: PokemonType): boolean {
  if (!state.typeAffinityOffered || state.typeAffinity || !state.typeAffinityChoices.includes(type)) return false;
  const effect = ({
    fire: 'queimar', water: 'empurrar', electric: 'saltar', rock: 'atordoar', ice: 'lentidao', dragon: 'atravessar',
    steel: 'atravessar', poison: 'queimar', ghost: 'lentidao', psychic: 'empurrar', fairy: 'roubar', grass: 'nenhum',
    dark: 'roubar', flying: 'empurrar', ground: 'atordoar', fighting: 'empurrar', bug: 'lentidao', normal: 'nenhum',
  } as const)[type];
  state.typeAffinity = { type, effect };
  return true;
}

/** Intervalo entre nascimentos (ms): começa folgado e aperta com o tempo e a onda, nunca abaixo do piso. */
function spawnIntervalMs(state: SurvivorState): number {
  const t = state.elapsedMs / 1000;
  const base = Math.max(BALANCE.spawnFloorMs, BALANCE.spawnStartMs - t * BALANCE.spawnPerSecMs - state.wave * BALANCE.spawnPerWaveMs);
  const early = Math.max(0, 1 - state.elapsedMs / BALANCE.earlyGameMs);
  const interval = base * (1 + BALANCE.earlySpawnIntervalBonus * early) * BALANCE.spawnRateMultiplier / survivorDifficultyDensityMultiplier(state.player.difficultyStacks ?? 0);
  return interval;
}

/** Dificuldade voluntária: mais inimigos e atributos mais fortes, sem teto de acúmulos da carta. */
export function survivorDifficultyDensityMultiplier(stacks: number): number {
  return 1 + Math.max(0, Math.floor(Number.isFinite(stacks) ? stacks : 0)) * 0.15;
}

export function survivorDifficultyEnemyMultiplier(stacks: number): number {
  return 1 + Math.max(0, Math.floor(Number.isFinite(stacks) ? stacks : 0)) * 0.12;
}

function earlyCurve(elapsedMs: number, start: number): number {
  const progress = Math.max(0, Math.min(1, elapsedMs / BALANCE.earlyGameMs));
  return start + (1 - start) * progress;
}

function closeRangeDamageMultiplier(state: SurvivorState): number {
  const category = state.player.move.category;
  return category === 'aura' || category === 'orbit' || category === 'cone' ? BALANCE.closeRangeDamageMultiplier : 1;
}

function spawnPoint(rng: Rng, player: Pick<SurvivorPlayer, 'x' | 'y'>, boss: boolean): { x: number; y: number } {
  const minDistance = boss ? SURVIVOR_SPAWN_DISTANCE.bossMin : SURVIVOR_SPAWN_DISTANCE.commonMin;
  const maxDistance = boss ? SURVIVOR_SPAWN_DISTANCE.bossMax : SURVIVOR_SPAWN_DISTANCE.commonMax;
  // Se o jogador estiver junto da borda, tenta outro ângulo sem reduzir a distância segura.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = minDistance + rng() * (maxDistance - minDistance);
    const x = player.x + Math.cos(angle) * distance;
    const y = player.y + Math.sin(angle) * distance;
    if (x >= SPAWN_MARGIN && x <= ARENA_W - SPAWN_MARGIN && y >= SPAWN_MARGIN && y <= ARENA_H - SPAWN_MARGIN) return { x, y };
  }
  // Sempre há espaço para o centro; este plano B preserva a distância mínima até no canto da arena.
  const towardCenter = Math.atan2(ARENA_H / 2 - player.y, ARENA_W / 2 - player.x);
  return {
    x: clamp(player.x + Math.cos(towardCenter) * minDistance, SPAWN_MARGIN, ARENA_W - SPAWN_MARGIN),
    y: clamp(player.y + Math.sin(towardCenter) * minDistance, SPAWN_MARGIN, ARENA_H - SPAWN_MARGIN),
  };
}

function defaultArchetype(kind: number, boss: boolean, grade: SurvivorEnemyGrade, stableId = kind): SurvivorEnemyArchetype {
  if (boss || grade === 'chefao') return 'protetor';
  // O id nasce da mesma sequência nos modos normal e regional; usar ele mantém o combate idêntico
  // quando `kindCount` muda apenas a espécie visual.
  return (['perseguidor', 'flanqueador', 'atirador', 'suporte', 'investida', 'explosivo'] as const)[stableId % 6]!;
}

function supportRoleFor(stableId: number): SurvivorSupportRole {
  return stableId % 3 === 0 ? 'cura' : stableId % 3 === 1 ? 'impulso' : 'disparo';
}

function maxSupportEnemiesAt(elapsedMs: number): number {
  if (elapsedMs < 180_000) return ENEMY_BEHAVIOR_LIMITS.maxSupportEnemiesEarly;
  if (elapsedMs < 420_000) return ENEMY_BEHAVIOR_LIMITS.maxSupportEnemiesMid;
  return ENEMY_BEHAVIOR_LIMITS.maxSupportEnemiesLate;
}

function liveSupportCount(state: SurvivorState): number {
  return state.enemies.filter((enemy) => enemy.hp > 0 && enemy.archetype === 'suporte').length;
}

function resolveEnemyArchetype(
  state: SurvivorState,
  kind: number,
  boss: boolean,
  grade: SurvivorEnemyGrade,
  stableId: number,
): SurvivorEnemyArchetype {
  const custom = state.enemyArchetypeFor?.({ kind, boss, grade });
  if (custom) return custom;
  const candidate = defaultArchetype(kind, boss, grade, stableId);
  if (candidate !== 'suporte' || liveSupportCount(state) < maxSupportEnemiesAt(state.elapsedMs)) return candidate;
  // Quando a cota está cheia, mantém a variedade de movimento sem adicionar outra habilidade de suporte.
  return stableId % 2 === 0 ? 'flanqueador' : 'perseguidor';
}

/**
 * Nasce um inimigo. `grade` muda o tamanho, HP, dano e orbe de XP:
 *  - `comum`: o inimigo normal, do grupo que vai aparecendo sozinho.
 *  - `elite`: Pokémon do treinador (minuto 5+): mais HP, mais dano, mais rápido, orbe maior ao morrer.
 *  - `chefao`: um dos 6 do chefão final (ou do infinito): maior ainda, dá bem mais XP.
 * `trainerId` liga os Pokémon do mesmo treinador para contarmos quando todos caíram.
 */
function spawnEnemy(
  state: SurvivorState,
  boss: boolean,
  grade: SurvivorEnemyGrade = 'comum',
  trainerId?: number,
  options?: { shadowBoss?: boolean; dexId?: number },
): void {
  if (state.enemies.length >= ENEMY_BEHAVIOR_LIMITS.maxEnemies && !boss && grade === 'comum') return;
  const { x, y } = spawnPoint(state.rng, state.player, boss);
  const t = state.elapsedMs / 1000;
  if (boss) {
    const shadow = options?.shadowBoss === true;
    const hp = Math.round((BALANCE.bossHpBase + state.wave * BALANCE.bossHpPerWave) * state.infiniteScale * (shadow ? BALANCE.shadowBossHpMultiplier : 1));
    const id = state.nextId++;
    addEnemy(state, {
      id,
      kind: state.kindCount,
      boss: true,
      ...(shadow ? { shadowBoss: true } : {}),
      grade: 'comum',
      x,
      y,
      hp,
      maxHp: hp,
      speed: shadow ? BALANCE.shadowBossSpeed : BALANCE.bossSpeed,
      damage: Math.round((BALANCE.bossDamageBase + state.wave * BALANCE.bossDamagePerWave) * state.infiniteScale * (shadow ? BALANCE.shadowBossDamageMultiplier : 1)),
      radius: shadow ? 36 : 28,
      hitFlashMs: 0,
        archetype: resolveEnemyArchetype(state, state.kindCount, true, 'comum', id),
      specialTimerMs: shadow ? 1200 : 1800,
      ...(options?.dexId !== undefined ? { dexId: options.dexId } : {}),
    });
    return;
  }
  const baseHp = (BALANCE.enemyHpBase + Math.floor(t / BALANCE.enemyHpEverySec) * BALANCE.enemyHpStep + state.wave * BALANCE.enemyHpPerWave)
    * earlyCurve(state.elapsedMs, BALANCE.earlyEnemyHpMultiplier);
  const baseDmg = (BALANCE.enemyDamageBase + Math.floor(t / BALANCE.enemyDamageEverySec) * BALANCE.enemyDamageStep)
    * earlyCurve(state.elapsedMs, BALANCE.earlyEnemyDamageMultiplier);
  // Treinadores (elite) têm +5× HP e +2× dano; o chefão (do time dos 6) ainda mais pesado.
  const trainerMul = grade === 'comum' ? 1 : BALANCE.trainerStatMultiplier;
  const hpMul = (grade === 'chefao' ? 7 : grade === 'elite' ? 5 : 1) * trainerMul;
  const dmgMul = (grade === 'chefao' ? 2.5 : grade === 'elite' ? 2 : 1) * trainerMul;
  const speed = (grade === 'comum'
    ? BALANCE.enemySpeedBase + state.rng() * BALANCE.enemySpeedRandom
    : grade === 'elite' ? 72 + state.rng() * 18 : 60 + state.rng() * 15)
    * earlyCurve(state.elapsedMs, BALANCE.earlyEnemySpeedMultiplier)
    * (0.9 + Math.min(0.4, state.infiniteScale * 0.1));
  const hp = Math.round(baseHp * hpMul * state.infiniteScale);
  const kind = Math.floor(state.rng() * state.kindCount);
  const id = state.nextId++;
  const archetype = resolveEnemyArchetype(state, kind, false, grade, id);
  addEnemy(state, {
    id,
    kind,
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
    archetype,
    specialTimerMs: grade === 'chefao' ? 1800 : 2400,
    ...(archetype === 'suporte' ? { supportRole: supportRoleFor(id) } : {}),
  });
}

/** Chama um treinador: `count` Pokémon elite nascem juntos, com o mesmo `trainerId` (para marcarmos a derrota). */
function spawnTrainer(state: SurvivorState, count: number, final: boolean, events: SurvivorEvent[], trigger?: 'digital-danger'): void {
  const trainerId = state.nextId++;
  const grade: SurvivorEnemyGrade = final ? 'chefao' : 'elite';
  for (let i = 0; i < count; i++) spawnEnemy(state, false, grade, trainerId);
  events.push({ type: 'trainerSpawn', count, final, trainerId, ...(trigger ? { trigger } : {}) });
}

/** Resolve a aparência uma vez, depois de sortear os números de combate. */
function addEnemy(state: SurvivorState, enemy: SurvivorEnemy): void {
  if (enemy.dexId === undefined && state.enemyDexId) enemy.dexId = state.enemyDexId(enemy, state.elapsedMs, state.runSeed);
  state.enemies.push(enemy);
}

/** Sorteia raridade primeiro; o tamanho do catálogo não altera a chance de cada faixa. */
function rollUpgradeRarity(rng: Rng, pool: readonly SurvivorUpgrade[]): SurvivorUpgradeRarity {
  const rarities = (Object.keys(SURVIVOR_UPGRADE_RARITIES) as SurvivorUpgradeRarity[])
    .filter((rarity) => pool.some((upgrade) => upgrade.rarity === rarity));
  const total = rarities.reduce((sum, rarity) => sum + SURVIVOR_UPGRADE_RARITIES[rarity].weight, 0);
  let draw = rng() * total;
  for (const rarity of rarities) {
    draw -= SURVIVOR_UPGRADE_RARITIES[rarity].weight;
    if (draw < 0) return rarity;
  }
  return rarities[rarities.length - 1]!;
}

/** Sorteia cartas distintas, com potência variável nos bônus numéricos. */
export interface SurvivorUpgradeRollOptions {
  /** IDs já exibidos nesta oferta, usados para que um reroll não devolva a mesma carta. */
  excludeIds?: readonly string[];
  /** Raridade mínima da nova carta (usado pelo desejo de Jirachi quando a oferta já é rara). */
  minimumRarity?: SurvivorUpgradeRarity;
}

export function rollUpgrades(
  rng: Rng,
  count = 3,
  move: SurvivorMove = BASIC_MOVE,
  player?: SurvivorPlayer,
  options?: SurvivorUpgradeRollOptions,
): SurvivorUpgradeOption[] {
  const level = player?.level ?? 1;
  const excludedIds = new Set(options?.excludeIds ?? []);
  const minimumRank = options?.minimumRarity === undefined ? 0 : SURVIVOR_RARITY_ORDER.indexOf(options.minimumRarity);
  const alreadyAncestral = SURVIVOR_UPGRADES.some((upgrade) => upgrade.rarity === 'ancestral' && (player?.upgradeLevels[upgrade.id] ?? 0) > 0);
  const pool = SURVIVOR_UPGRADES.filter((u) =>
    (!u.for || u.for.includes(move.category))
    && (!u.type || u.type === move.type)
    && (!u.bonkOnly || player?.bonkMode === true)
    && level >= SURVIVOR_UPGRADE_RARITIES[u.rarity].minLevel
    && SURVIVOR_RARITY_ORDER.indexOf(u.rarity) >= minimumRank
    && !excludedIds.has(u.id)
    && (!u.requires || (player?.upgradeLevels[u.requires] ?? 0) > 0)
    && (u.rarity !== 'ancestral' || !alreadyAncestral)
    && (player?.upgradeLevels[u.id] ?? 0) < (u.maxLevels ?? Number.POSITIVE_INFINITY)
    && (!player || (u.id !== 'power' && u.id !== 'resonance' || player.attackDamage < 60))
    && (!player || u.id !== 'haste' || player.attackCooldownMs > 240)
    && (!player || u.id !== 'multishot' || player.shots < (move.category === 'orbit' ? 1 + SURVIVOR_ORBIT_MAX - SURVIVOR_ORBIT_BASE : 5))
    && (!player || u.id !== 'pierce' || player.pierce < 4)
    && (!player || u.id !== 'heal-30' || player.hp < player.maxHp)
    && (!player || u.id !== 'jirachi-reroll' || player.upgradeRerolls < MAX_STARTING_REROLLS_STOCK)
    && (!player || !u.id.startsWith('guard-') || statsOfDex(player.dexId) !== null),
  );
  const picked: SurvivorUpgradeOption[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const rarity = rollUpgradeRarity(rng, pool);
    const matching = pool.filter((upgrade) => upgrade.rarity === rarity);
    const u = matching[Math.floor(rng() * matching.length)]!;
    pool.splice(pool.indexOf(u), 1);
    const value = u.valueRange
      ? u.valueRange[0] + Math.floor(rng() * (u.valueRange[1] - u.valueRange[0] + 1))
      : undefined;
    const copy = value !== undefined ? u.describeValue?.(move, value) : undefined;
    const description = copy ?? u.describe?.(move) ?? { name: u.name, description: u.description };
    picked.push({ id: u.id, family: u.family, rarity, ...(u.icon ? { icon: u.icon } : {}), ...(value === undefined ? {} : { value }), ...description });
    if (rarity === 'ancestral') {
      for (let j = pool.length - 1; j >= 0; j--) if (pool[j]!.rarity === 'ancestral') pool.splice(j, 1);
    }
  }
  return picked;
}

function rerollMinimumRarity(player: SurvivorPlayer, currentFloor: SurvivorUpgradeRarity): SurvivorUpgradeRarity {
  const currentRank = SURVIVOR_RARITY_ORDER.indexOf(currentFloor);
  for (let index = currentRank + 1; index < SURVIVOR_RARITY_ORDER.length; index += 1) {
    const rarity = SURVIVOR_RARITY_ORDER[index]!;
    if (player.level >= SURVIVOR_UPGRADE_RARITIES[rarity].minLevel) return rarity;
  }
  return currentFloor === 'normal' ? 'raro' : currentFloor;
}

/**
 * Gasta um desejo de Jirachi para trocar a oferta atual. Cada vaga usa a rolagem
 * normal de raridade; cartas raras já oferecidas continuam preservadas quando há
 * cartas normais para trocar. Se toda a oferta já é rara ou melhor, uma vaga é
 * trocada naturalmente e só recebe uma segunda rolagem garantida caso o conjunto
 * final não tenha nenhuma opção acima da menor raridade anterior.
 */
export function rerollSurvivorUpgradeOffer(state: SurvivorState): boolean {
  const current = state.pendingUpgrade;
  if (!current || current.length === 0 || state.player.upgradeRerolls <= 0) return false;

  state.player.upgradeRerolls -= 1;
  const nonRare = current.filter((option) => (option.rarity ? SURVIVOR_RARITY_ORDER.indexOf(option.rarity) : 0) < 1);
  const allRareOrBetter = nonRare.length === 0;
  const preserved = allRareOrBetter ? current.slice(0, Math.max(0, current.length - 1)) : current.filter((option) => option.rarity !== undefined && SURVIVOR_RARITY_ORDER.indexOf(option.rarity) >= 1);
  const rerollCount = Math.max(1, current.length - preserved.length);
  const floor = current.reduce<SurvivorUpgradeRarity>((lowest, option) => {
    const rarity = option.rarity ?? 'normal';
    return SURVIVOR_RARITY_ORDER.indexOf(rarity) < SURVIVOR_RARITY_ORDER.indexOf(lowest) ? rarity : lowest;
  }, 'ancestral');
  const banned = state.bannedUpgradeIds ?? [];
  const naturalRerolled = rollUpgrades(state.rng, rerollCount, state.player.move, state.player, {
    excludeIds: [...current.map((option) => option.id), ...banned],
  });
  let rerolled = naturalRerolled;
  if (allRareOrBetter) {
    const hasHigherRarity = [...preserved, ...naturalRerolled].some((option) => {
      const rarity = option.rarity ?? 'normal';
      return SURVIVOR_RARITY_ORDER.indexOf(rarity) > SURVIVOR_RARITY_ORDER.indexOf(floor);
    });
    if (!hasHigherRarity) {
      const guaranteed = rollUpgrades(state.rng, rerollCount, state.player.move, state.player, {
        excludeIds: [...current.map((option) => option.id), ...banned],
        minimumRarity: rerollMinimumRarity(state.player, floor),
      });
      if (guaranteed.length > 0) rerolled = guaranteed;
    }
  }
  state.pendingUpgrade = [...preserved, ...rerolled];
  return true;
}

/** Por que uma carta da oferta não pode ser banida; null quando pode. Serve também para a interface explicar o botão. */
export function survivorBanBlockReason(state: SurvivorState, id: string): string | null {
  if (!state.pendingUpgrade?.some((option) => option.id === id)) return 'Essa carta não está na escolha.';
  if ((state.bansLeft ?? 0) <= 0) return 'Sem banimentos restantes.';
  // Só cartas do catálogo: evolução, apoio e segundo golpe não são upgrades sorteados.
  if (!SURVIVOR_UPGRADES.some((upgrade) => upgrade.id === id)) return 'Esta oferta especial não pode ser banida.';
  if ((state.player.upgradeLevels[id] ?? 0) > 0) return 'Você já tem esta carta nesta corrida.';
  return null;
}

/**
 * Bane uma carta da escolha aberta: ela não volta nesta corrida e a vaga é reposta por outra. Se não houver outra carta
 * possível para repor, o banimento é recusado (a oferta nunca fica menor nem vazia).
 */
export function banSurvivorUpgrade(state: SurvivorState, id: string): boolean {
  if (survivorBanBlockReason(state, id) !== null) return false;
  const current = state.pendingUpgrade!;
  const banned = state.bannedUpgradeIds ?? [];
  const [replacement] = rollUpgrades(state.rng, 1, state.player.move, state.player, { excludeIds: [...current.map((option) => option.id), ...banned, id] });
  if (!replacement) return false;
  state.pendingUpgrade = current.map((option) => (option.id === id ? replacement : option));
  state.bannedUpgradeIds = [...banned, id];
  state.bansLeft = Math.max(0, (state.bansLeft ?? 0) - 1);
  return true;
}

/** A carta "Evoluir" desta escolha, se o nível já permite e existe uma próxima forma real (ramos: sorteia um). */
function evolutionOffer(state: SurvivorState): SurvivorUpgradeOption | null {
  const p = state.player;
  const needed = EVOLVE_LEVELS[p.stage];
  if (needed === undefined || p.level < needed || p.dexId <= 0) return null;
  const options = state.evolutions(p.dexId);
  if (options.length === 0) return null;
  const next = options[Math.floor(state.rng() * options.length)]!;
  return { id: `${EVOLVE_PREFIX}${next.dexId}`, rarity: 'lendario', name: `Evoluir para ${next.name}`, description: 'Assume os stats da nova forma, ganha +30 de HP, cura tudo e fortalece o golpe.' };
}

/** Escolhe uma evolução real de um dos apoios atuais. O índice impede evoluir um apoio que não foi oferecido. */
function supportEvolutionOffer(state: SurvivorState): SurvivorUpgradeOption | null {
  if (state.player.level < 10 || state.supports.length === 0 || state.rng() >= SURVIVOR_SUPPORT_EVOLUTION_OFFER_CHANCE) return null;
  const choices = state.supports.flatMap((support, supportIndex) => state.evolutions(support.dexId, support.move).map((next) => ({ support, supportIndex, next })));
  if (choices.length === 0) return null;
  const choice = choices[Math.floor(state.rng() * choices.length)]!;
  return {
    id: `${SUPPORT_EVOLVE_PREFIX}${choice.supportIndex}:${choice.next.dexId}`,
    family: 'aliado',
    rarity: 'raro',
    name: `Laço evolutivo: ${choice.support.name}`,
    description: `${choice.support.name} evolui para ${choice.next.name}. Mantém seu golpe e continua sem vida, hitbox ou upgrades do protagonista.`,
  };
}

function levelUp(state: SurvivorState, events: SurvivorEvent[]): void {
  // Mantém a sobra par mesmo se uma corrida antiga ou uma recompensa futura
  // trouxer XP ímpar. Arredondar para baixo nunca concede um nível adiantado.
  state.player.xp = normalizeSurvivorXp(state.player.xp);
  while (state.player.xp >= state.player.xpToNext) {
    state.player.xp = normalizeSurvivorXp(state.player.xp - state.player.xpToNext);
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
  // Olhar treinado (Dojô): só a primeira oferta mostra a carta a mais, e nunca passa do teto de 5.
  const choices = Math.min(MAX_OFFER_CHOICES, Math.max(state.player.upgradeChoices, state.player.upgradeChoices + (state.firstOfferBonus ?? 0)));
  state.firstOfferBonus = 0;
  const options = rollUpgrades(state.rng, choices, state.player.move, state.player, { excludeIds: state.bannedUpgradeIds ?? [] });
  const evolve = evolutionOffer(state);
  if (evolve) options.splice(options.length - 1, 1, evolve);
  else if (!state.supportCandidate && !state.secondAttackOffered && state.player.level >= 6 && state.supportCandidates.length > 0) {
    const candidate = state.supportCandidates[0]!;
    state.supportCandidate = candidate;
    state.supportCandidateGuaranteed = true;
    state.secondAttackOffered = true;
    options.splice(options.length - 1, 1, {
      id: 'second-attack',
      family: 'aliado',
      rarity: 'lendario',
      name: `Chamar apoio: ${candidate.name}`,
      description: `${candidate.move.icon} Ataca da sua posição com recarga própria. Não recebe upgrades nem pode ser atingido. Apoio ${state.supports.length + 1}/${MAX_SURVIVOR_SUPPORTS}.`,
    });
  } else if (
    !state.supportCandidate
    && state.secondAttackOffered
    && state.supports.length > 0
    && state.supportCandidates.length > 0
    && state.rng() < SURVIVOR_SUPPORT_RARE_OFFER_CHANCE
  ) {
    // Os quatro apoios restantes não entram em sequência: cada um disputa uma
    // vaga rara em uma oferta futura e continua disponível se for recusado.
    const candidate = state.supportCandidates[Math.floor(state.rng() * state.supportCandidates.length)]!;
    state.supportCandidate = candidate;
    state.supportCandidateGuaranteed = false;
    options.splice(options.length - 1, 1, {
      id: 'second-attack',
      family: 'aliado',
      rarity: 'raro',
      name: `Chamar apoio: ${candidate.name}`,
      description: `${candidate.move.icon} Ataca da sua posição com recarga própria. Não recebe upgrades nem pode ser atingido. Apoio ${state.supports.length + 1}/${MAX_SURVIVOR_SUPPORTS}.`,
    });
  }
  if (!evolve && !state.supportCandidate) {
    const supportEvolution = supportEvolutionOffer(state);
    if (supportEvolution) options.splice(options.length - 1, 1, supportEvolution);
  }
  state.pendingUpgrade = options;
}

function consumeSupportCandidate(state: SurvivorState, candidate: SurvivorSupportCandidate): void {
  state.supportCandidates = state.supportCandidates.filter((item) => item !== candidate);
  state.supportCandidate = null;
  state.supportCandidateGuaranteed = false;
}

/**
 * Aplica o upgrade escolhido e libera o jogo (ver `pendingUpgrade`). `id` fora do catálogo não faz nada. Se ainda
 * houver níveis devidos (subiu mais de um de uma vez), a próxima escolha abre em seguida.
 */
export function applyUpgrade(state: SurvivorState, id: string): SurvivorEvent[] {
  const events: SurvivorEvent[] = [];
  const offeredOption = state.pendingUpgrade?.find((option) => option.id === id);
  const offered = !!offeredOption;
  if (id.startsWith(EVOLVE_PREFIX)) {
    // Só evolui para a forma que foi oferecida nesta escolha (nunca para um id qualquer).
    const dexId = Number(id.slice(EVOLVE_PREFIX.length));
    const next = offered ? state.evolutions(state.player.dexId).find((o) => o.dexId === dexId) : undefined;
    if (next) {
      // A forma Mega é da espécie de agora: evoluir encerra a Mega antes (Floette, por exemplo, ainda vira Florges).
      endSurvivorMega(state);
      evolvePlayer(state, next);
      events.push({ type: 'evolve', dexId: next.dexId, name: next.name });
    }
  } else if (id.startsWith(SUPPORT_EVOLVE_PREFIX)) {
    const [supportIndexText, dexIdText] = id.slice(SUPPORT_EVOLVE_PREFIX.length).split(':');
    const supportIndex = Number(supportIndexText);
    const dexId = Number(dexIdText);
    const support = Number.isInteger(supportIndex) && Number.isInteger(dexId) ? state.supports[supportIndex] : undefined;
    const next = offered && support ? state.evolutions(support.dexId, support.move).find((option) => option.dexId === dexId) : undefined;
    if (support && next) {
      support.dexId = next.dexId;
      support.name = next.name;
      // O perfil passa a ser o da forma real, mas o golpe e o fator de apoio continuam independentes da build do jogador.
      support.profile = next.profile ?? support.profile;
      state.fx.push({ kind: 'evolve', x: support.x, y: support.y, r: 42, color: '#cba6ff', ageMs: 0, lifeMs: 700 });
      events.push({ type: 'supportEvolve', dexId: next.dexId, name: next.name });
    }
  } else if (id === 'second-attack') {
    const candidate = state.supportCandidate ?? state.supportCandidates[0];
    if (offered && candidate && state.supports.length < MAX_SURVIVOR_SUPPORTS) {
      const move = candidate.move;
      const p = state.player;
      const support: SurvivorSupport = {
        ...candidate,
        x: p.x - 24,
        y: p.y + 18,
        attackTimerMs: 0,
        damageFactor: 0.45,
      };
      state.supports.push(support);
      state.support ??= support;
      p.secondMove ??= move;
      p.secondAttackTimerMs ??= 0;
      p.secondAttackDamage ??= round1(candidate.profile.damage * 0.45);
      p.secondAttackCooldownMs ??= Math.max(500, Math.round(candidate.profile.cooldownMs * 1.45));
      p.secondAttackRange ??= candidate.profile.range;
      p.secondAttackRadius ??= candidate.profile.radius;
      consumeSupportCandidate(state, candidate);
      events.push({ type: 'secondAttack', name: candidate.name });
    }
  } else {
    const upgrade = SURVIVOR_UPGRADES.find((u) => u.id === id);
    // Upgrades comuns também precisam ser uma escolha real da rodada. Isso impede que uma
    // chamada atrasada ou manipulada aplique um bônus que nunca foi oferecido.
    if (upgrade && offered && (state.player.upgradeLevels[id] ?? 0) < (upgrade.maxLevels ?? Number.POSITIVE_INFINITY)) {
      upgrade.apply(state.player, offeredOption?.value);
      state.player.upgradeLevels[id] = (state.player.upgradeLevels[id] ?? 0) + 1;
    }
  }
  const offeredSupport = state.supportCandidate;
  if (offeredSupport && id !== 'second-attack' && state.supportCandidateGuaranteed) consumeSupportCandidate(state, offeredSupport);
  if (offeredSupport && id !== 'second-attack') state.supportCandidate = null;
  state.supportCandidateGuaranteed = false;
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
/** Raio da explosão do Pokémon explosivo ao cair (só atinge o jogador). */
const EXPLOSION_RADIUS = 70;
/** Um inimigo só pode ser atordoado de novo 5 s depois do último atordoamento (evita travar a arena com golpes de área). */
export const STUN_COOLDOWN_MS = 5_000;

/** Aplica atordoamento respeitando a recarga. Enquanto ela corre, o novo atordoamento é ignorado (não estende o atual). */
function applyStun(e: SurvivorEnemy, ms: number): void {
  if ((e.stunCooldownMs ?? 0) > 0) return;
  e.stunMs = Math.max(e.stunMs ?? 0, ms);
  e.stunCooldownMs = STUN_COOLDOWN_MS;
}
/** Depois de um empurrão, o inimigo só pode ser empurrado de novo daqui a 5 s (golpes de área não o mandam longe sem parar). */
export const KNOCKBACK_COOLDOWN_MS = 5_000;
/** Empurra `e` para longe de `from` em `push` unidades, se a recarga permitir; devolve se empurrou. */
function applyKnockback(e: SurvivorEnemy, from: { x: number; y: number }, push: number): boolean {
  if ((e.knockbackCooldownMs ?? 0) > 0) return false;
  const dx = e.x - from.x;
  const dy = e.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  e.x += (dx / d) * push;
  e.y += (dy / d) * push;
  e.knockbackCooldownMs = KNOCKBACK_COOLDOWN_MS;
  return true;
}
const hasUpgrade = (player: SurvivorPlayer, id: string): boolean => (player.upgradeLevels[id] ?? 0) > 0;

export function survivorDirectDamageMultiplier(distance: number): number {
  const normalized = Math.max(0, Math.min(1, (distance - BALANCE.defaultAttackDistance) / BALANCE.defaultAttackDistance));
  return 1 - (1 - BALANCE.directDamageMinMultiplier) * normalized;
}

/**
 * Opacidade visual do projétil do jogador.
 *
 * Usa a mesma curva do dano direto: no alcance padrão o golpe permanece
 * totalmente legível; depois disso a transparência cresce gradualmente até o
 * limite mínimo do dano. A curva é pura para manter gameplay e apresentação
 * sincronizados e não afeta projéteis hostis.
 */
export function survivorProjectileOpacity(distance: number): number {
  return survivorDirectDamageMultiplier(distance);
}

export function survivorRapidAttackDamageMultiplier(player: Pick<SurvivorPlayer, 'attackCooldownMs'>): number {
  const attacksPerSecond = 1000 / Math.max(1, player.attackCooldownMs);
  if (attacksPerSecond > 3) return 0.25;
  if (attacksPerSecond > 2) return 0.5;
  return 1;
}

/** Aplica apenas o efeito do tipo secundário, com intensidade menor e sem upgrades do golpe principal. */
function applyTypeAffinity(state: SurvivorState, e: SurvivorEnemy, damage: number, from: { x: number; y: number }): void {
  const affinity = state.typeAffinity;
  if (!affinity || affinity.effect === 'nenhum') return;
  switch (affinity.effect) {
    case 'queimar':
      e.burnMs = Math.max(e.burnMs ?? 0, Math.round(EFFECT_MS.burn * 0.65));
      e.burnDps = Math.max(e.burnDps ?? 0, round1(damage * 0.18));
      break;
    case 'lentidao':
      e.slowMs = Math.max(e.slowMs ?? 0, 900);
      break;
    case 'atordoar':
      applyStun(e, e.boss ? 90 : 220);
      break;
    case 'empurrar':
      applyKnockback(e, from, e.boss ? 1.5 : 5);
      break;
    case 'roubar':
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1);
      break;
    case 'atravessar':
      // O tipo já foi escolhido como afinidade; atravessar não precisa de estado no inimigo.
      break;
    default:
      break;
  }
}

/** Dano de um golpe num inimigo, com o efeito do tipo. `from` é de onde o golpe veio (para empurrar). */
function hitEnemy(state: SurvivorState, e: SurvivorEnemy, damage: number, from: { x: number; y: number }, attackMove = state.player.move, allowFollowUp = true, distanceFromPlayer = Math.hypot(e.x - state.player.x, e.y - state.player.y)): void {
  const move = attackMove;
  const p = state.player;
  const wasSeeded = (e.seededMs ?? 0) > 0;
  const synergy = survivorSynergyFor(move.type, e);
  let upgradeMultiplier = 1;
  if (move === p.move) {
    if (move.type === 'fire' && hasUpgrade(p, 'fire-combustion') && (e.burnMs ?? 0) > 0) upgradeMultiplier *= 1.12;
    if (move.type === 'electric' && hasUpgrade(p, 'electric-arc') && ((e.wetMs ?? 0) > 0 || (e.stunMs ?? 0) > 0)) upgradeMultiplier *= 1.1;
    if (move.type === 'ice' && hasUpgrade(p, 'ice-shatter') && (e.stunMs ?? 0) > 0) upgradeMultiplier *= 1.15;
    if (move.type === 'ground' && hasUpgrade(p, 'ground-aftershock') && (e.stunMs ?? 0) > 0) upgradeMultiplier *= 1.15;
    if (move.type === 'dragon' && hasUpgrade(p, 'dragon-pressure') && e.boss) upgradeMultiplier *= 1.15;
    if (move.type === 'dark' && hasUpgrade(p, 'dark-predation') && e.hp <= e.maxHp * 0.5) upgradeMultiplier *= 1.12;
  }
  // Crítico: sorteado só quando a carta existe, para não consumir o RNG das corridas sem ela.
  if (move === p.move && (p.critChance ?? 0) > 0 && state.rng() < (p.critChance ?? 0)) upgradeMultiplier *= 2;
  const environmentalDamage = damage * survivorDirectDamageMultiplier(distanceFromPlayer) * survivorRapidAttackDamageMultiplier(p) * upgradeMultiplier
    * (synergy?.damageMultiplier ?? 1)
    * survivorBiomeDamageMultiplier(state.elapsedMs, from.x, from.y, move.type);
  const reducedDamage = e.protectedMs && e.protectedMs > 0 ? environmentalDamage * 0.75 : environmentalDamage;
  e.hp -= reducedDamage;
  e.hitFlashMs = 90;
  if (synergy?.consume) e[synergy.consume] = 0;
  if (synergy?.refreshSlowMs) e.slowMs = Math.max(e.slowMs ?? 0, synergy.refreshSlowMs);
  Object.assign(e, survivorElementalStatus(move.type));
  if (move === p.move && move.type === 'grass' && hasUpgrade(p, 'grass-roots') && wasSeeded) {
    applyStun(e, e.boss ? 100 : 250);
  }
  switch (move.effect) {
    case 'queimar':
      e.burnMs = EFFECT_MS.burn;
      e.burnDps = Math.max(e.burnDps ?? 0, round1(environmentalDamage * (move === p.move && (move.type === 'fire' && hasUpgrade(p, 'fire-brasa') || move.type === 'poison' && hasUpgrade(p, 'poison-dose')) ? 0.44 : 0.35)));
      break;
    case 'lentidao':
      e.slowMs = move === p.move && move.type === 'bug' && hasUpgrade(p, 'bug-web') ? EFFECT_MS.slow + 700 : EFFECT_MS.slow;
      if (move.type === 'ice' && (e.frostImmuneMs ?? 0) <= 0) {
        const frostThreshold = move === p.move && hasUpgrade(p, 'ice-deep-cold') ? 2 : 3;
        e.frostStacks = Math.min(frostThreshold, (e.frostStacks ?? 0) + 1);
        if (e.frostStacks >= frostThreshold) {
          e.frostStacks = 0;
          e.frostImmuneMs = e.boss ? 2200 : 1500;
          applyStun(e, e.boss ? 150 : 550);
        }
      }
      break;
    case 'atordoar':
      applyStun(e, e.boss ? EFFECT_MS.bossStun : EFFECT_MS.stun);
      break;
    case 'empurrar': {
      const strongerPush = move === p.move && ((move.type === 'water' && hasUpgrade(p, 'water-tide')) || (move.type === 'fighting' && hasUpgrade(p, 'fighting-impact')));
      applyKnockback(e, from, (e.boss ? 3 : 11) * (strongerPush ? 1.5 : 1));
      break;
    }
    default:
      break;
  }
  if (move === p.move && state.typeAffinity?.type !== move.type) {
    applyTypeAffinity(state, e, environmentalDamage, from);
  }
  // Inseto e Fantasma atacam em dupla: um único eco visual e de dano por impacto, sem efeitos, cura ou recursão.
  if (allowFollowUp && (move.type === 'bug' || move.type === 'ghost') && e.hp > 0) {
    const enhancedEcho = move === p.move && ((move.type === 'bug' && hasUpgrade(p, 'bug-formation')) || (move.type === 'ghost' && hasUpgrade(p, 'ghost-haunt')));
    const echoDamage = reducedDamage * (enhancedEcho ? 0.25 : 0.2);
    e.hp -= echoDamage;
    state.fx.push({ kind: 'echo', x: e.x, y: e.y, r: Math.max(10, e.radius * 1.8), color: move.color, ageMs: 0, lifeMs: 220 });
    state.fx.push({
      kind: 'follow-up', x: e.x, y: e.y, r: Math.max(8, e.radius * 0.75), color: move.color, ageMs: 0, lifeMs: 480,
      element: move.type, fromX: p.x, fromY: p.y, toX: e.x, toY: e.y, delayMs: 85, count: move.type === 'bug' ? 4 : 3,
    });
  }
}

/** Distância mínima de um inimigo ao trecho percorrido pela investida. */
function distanceToPath(x: number, y: number, from: { x: number; y: number }, to: { x: number; y: number }): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(x - from.x, y - from.y);
  const t = Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / lengthSq));
  return Math.hypot(x - (from.x + dx * t), y - (from.y + dy * t));
}

/** A bênção do dash bate uma vez em cada inimigo atravessado, sem depender do autoataque. */
function hitDashPath(state: SurvivorState, path: { from: { x: number; y: number }; to: { x: number; y: number } }): void {
  const special = state.special;
  const multiplier = special.branch === 'dash-triple' ? DASH_TRIPLE_DAMAGE_MULTIPLIER : DASH_DAMAGE_MULTIPLIER;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || special.dashHitEnemyIds.includes(enemy.id)) continue;
    if (distanceToPath(enemy.x, enemy.y, path.from, path.to) > PLAYER_RADIUS + enemy.radius) continue;
    const damage = state.player.attackDamage * multiplier * ((enemy.protectedMs ?? 0) > 0 ? 0.75 : 1);
    enemy.hp -= damage;
    enemy.hitFlashMs = 90;
    special.dashHitEnemyIds.push(enemy.id);
  }
}

/** Roubar vida: cura um pouco por ataque que acertou alguém (no máximo 2 por ataque, para a aura não curar demais). */
function drain(state: SurvivorState, hits: number, move: SurvivorMove): void {
  if (move.effect !== 'roubar' || hits <= 0) return;
  const p = state.player;
  const strongerDrain = move === p.move && ((move.type === 'dark' && hasUpgrade(p, 'dark-thirst')) || (move.type === 'fairy' && hasUpgrade(p, 'fairy-pulse')));
  p.hp = Math.min(p.maxHp, p.hp + Math.min(strongerDrain ? 3 : 2, hits));
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
  const look = survivorProjectileLook(p);
  for (let i = 0; i < p.shots; i++) {
    const offset = p.shots === 1 ? 0 : (i - (p.shots - 1) / 2) * spread;
    const angle = baseAngle + offset;
    state.projectiles.push({
      id: state.nextId++,
      x: p.x,
      y: p.y,
      vx: Math.cos(angle) * p.projectileSpeed,
      vy: Math.sin(angle) * p.projectileSpeed,
      damage: artifactDamage(state),
      pierce: p.pierce + (move.effect === 'atravessar' ? 1 : 0),
      lifeMs: 1600,
      hit: [],
      canChain: move.effect === 'saltar',
      size: p.projectileSize,
      move,
      distanceFromPlayer: Math.hypot(target.x - p.x, target.y - p.y),
      look,
    });
  }
}

/** Ataque de um apoio: nasce sempre no jogador e usa o perfil congelado do Pokémon escolhido. */
function attackSupport(state: SurvivorState, support: SurvivorSupport): boolean {
  const p = state.player;
  const { move, profile } = support;
  const damage = round1(profile.damage * support.damageFactor);
  const range = profile.range;
  const radius = profile.radius;
  if (move.category === 'projetil') {
    const target = nearestEnemies(state, range, 1)[0];
    if (!target) return false;
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    state.projectiles.push({ id: state.nextId++, x: p.x, y: p.y, vx: Math.cos(angle) * profile.projectileSpeed, vy: Math.sin(angle) * profile.projectileSpeed, damage, pierce: move.effect === 'atravessar' ? 1 : 0, lifeMs: 1500, hit: [], canChain: move.effect === 'saltar', size: Math.max(3, profile.projectileSize * 0.8), move, source: 'support', distanceFromPlayer: Math.hypot(target.y - p.y, target.x - p.x) });
    return true;
  }
  if (move.category === 'aura' || move.category === 'orbit') {
    let hits = 0;
    for (const enemy of state.enemies) {
      if (Math.hypot(enemy.x - p.x, enemy.y - p.y) <= radius + enemy.radius) { hitEnemy(state, enemy, damage, p, move, true, Math.hypot(enemy.x - p.x, enemy.y - p.y)); hits++; }
    }
    drain(state, hits, move);
    state.fx.push({ kind: 'pulse', x: p.x, y: p.y, r: radius, color: move.color, ageMs: 0, lifeMs: 260, moveType: move.type });
    return true;
  }
  if (move.category === 'cone') {
    let hits = 0;
    for (const enemy of state.enemies) {
      const distance = Math.hypot(enemy.x - p.x, enemy.y - p.y);
      if (inSurvivorCone(p, enemy.x, enemy.y, range, enemy.radius)) { hitEnemy(state, enemy, damage, p, move, true, distance); hits++; }
    }
    drain(state, hits, move);
    if (hits > 0) state.fx.push({ kind: 'cone', x: p.x, y: p.y, r: range, color: move.color, ageMs: 0, lifeMs: 280, moveType: move.type, angle: survivorAimAngle(p), spread: SURVIVOR_CONE_HALF_ANGLE });
    return hits > 0;
  }
  const target = nearestEnemies(state, range, 1)[0];
  if (!target) return false;
  let hits = 0;
  for (const enemy of state.enemies) {
    if (Math.hypot(enemy.x - target.x, enemy.y - target.y) <= radius + enemy.radius) { hitEnemy(state, enemy, damage, p, move); hits++; }
  }
  drain(state, hits, move);
  state.fx.push({ kind: 'blast', x: target.x, y: target.y, r: radius, color: move.color, ageMs: 0, lifeMs: 320, moveType: move.type });
  return true;
}

/** Um ataque do golpe de quem joga; devolve false se não havia alvo (o tempo de recarga não começa). */
function attack(state: SurvivorState): boolean {
  const p = state.player;
  const move = p.move;
  const attackRange = state.typeAffinity?.effect === 'atravessar' ? p.attackRange * 1.12 : p.attackRange;
  if (move.category === 'projetil') {
    const [target] = nearestEnemies(state, attackRange, 1);
    if (!target) return false;
    fireProjectiles(state, target);
    return true;
  }
  if (move.category === 'aura') {
    // A aura pulsa sempre (dá para ver o raio), mesmo sem ninguém dentro.
    const pulseRadius = p.attackRadius * 0.8;
    let hits = 0;
    const damage = playerAttackDamage(state);
    for (const e of state.enemies) {
      if (Math.hypot(e.x - p.x, e.y - p.y) <= pulseRadius + e.radius) {
        hitEnemy(state, e, damage, p);
        hits++;
      }
    }
    drain(state, hits, move);
    state.fx.push({ kind: 'pulse', x: p.x, y: p.y, r: pulseRadius, color: move.color, ageMs: 0, lifeMs: 360, moveType: move.type });
    return true;
  }
  if (move.category === 'orbit') {
    // O dano da órbita vem do contato dos orbitais (`stepOrbiters`). A recarga só limita o bloqueio:
    // um orbital que encosta num projétil inimigo o desfaz, no máximo um por recarga.
    if (!p.projectileDeflection) return false;
    const hitRadius = survivorOrbiterHitRadius(p);
    const orbiters = survivorOrbiters(p);
    const projectileIndex = state.hostileProjectiles.findIndex((projectile) =>
      orbiters.some((orbiter) => Math.hypot(projectile.x - orbiter.x, projectile.y - orbiter.y) <= hitRadius + projectile.size),
    );
    if (projectileIndex < 0) return false;
    const [blocked] = state.hostileProjectiles.splice(projectileIndex, 1);
    if (blocked) state.fx.push({ kind: 'orbit-hit', x: blocked.x, y: blocked.y, r: hitRadius, color: move.color, ageMs: 0, lifeMs: 260, moveType: move.type });
    return true;
  }
  if (move.category === 'cone') {
    let hits = 0;
    for (const e of state.enemies) {
      if (inSurvivorCone(p, e.x, e.y, attackRange, e.radius)) {
        hitEnemy(state, e, artifactDamage(state), p);
        hits++;
      }
    }
    drain(state, hits, move);
    // A carta lendária pode aparar só um projétil por ataque, sem limpar ondas inteiras.
    if (p.projectileDeflection) {
      const projectileIndex = state.hostileProjectiles.findIndex((projectile) => inSurvivorCone(p, projectile.x, projectile.y, attackRange, projectile.size));
      if (projectileIndex >= 0) state.hostileProjectiles.splice(projectileIndex, 1);
    }
    state.fx.push({ kind: 'cone', x: p.x, y: p.y, r: attackRange, color: move.color, ageMs: 0, lifeMs: 300, moveType: move.type, angle: survivorAimAngle(p), spread: SURVIVOR_CONE_HALF_ANGLE });
    return true;
  }
  const targets = nearestEnemies(state, attackRange, p.shots);
  if (targets.length === 0) return false;
  let hits = 0;
  for (const t of targets) {
    const center = { x: t.x, y: t.y };
    for (const e of state.enemies) {
      if (Math.hypot(e.x - center.x, e.y - center.y) <= p.attackRadius + e.radius) {
        const direct = e.id === t.id;
        const damage = direct ? artifactDamage(state) : artifactDamage(state) * p.areaDamageMultiplier;
        hitEnemy(state, e, damage, center, move, true, Math.hypot(e.x - p.x, e.y - p.y));
        hits++;
      }
    }
    state.fx.push({ kind: 'blast', x: center.x, y: center.y, r: p.attackRadius, color: move.color, ageMs: 0, lifeMs: 420, moveType: move.type });
  }
  drain(state, hits, move);
  return true;
}

/**
 * Órbita: os orbitais giram em volta do jogador o tempo todo e acertam quem tocam. Cada inimigo tem um intervalo
 * curto entre toques (`orbitHitMs`), para um orbital que passa por cima não acertar a cada quadro.
 */
function stepOrbiters(state: SurvivorState, dtMs: number): void {
  const p = state.player;
  const cooldownMs = p.attackCooldownMs * (p.artifactFocusMs > 0 ? 0.8 : 1);
  p.orbitAngle = ((p.orbitAngle ?? 0) + survivorOrbitAngularSpeed(cooldownMs) * dtMs) % (Math.PI * 2);
  const orbiters = survivorOrbiters(p);
  const hitRadius = survivorOrbiterHitRadius(p);
  const intervalMs = survivorOrbitHitIntervalMs(p, cooldownMs);
  const damage = playerAttackDamage(state);
  let hits = 0;
  for (const e of state.enemies) {
    if (e.hp <= 0 || (e.orbitHitMs ?? 0) > 0) continue;
    const orbiter = orbiters.find((candidate) => Math.hypot(e.x - candidate.x, e.y - candidate.y) <= hitRadius + e.radius);
    if (!orbiter) continue;
    e.orbitHitMs = intervalMs;
    // O empurrão (Planta/Inseto não empurram, mas afinidades podem) sai do jogador, nunca puxa para dentro do giro.
    hitEnemy(state, e, damage, p, p.move, true, Math.hypot(e.x - p.x, e.y - p.y));
    state.fx.push({ kind: 'orbit-hit', x: e.x, y: e.y, r: Math.max(10, e.radius), color: p.move.color, ageMs: 0, lifeMs: 220, moveType: p.move.type });
    hits++;
  }
  drain(state, Math.min(2, hits), p.move);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function nearestAlly(state: SurvivorState, source: SurvivorEnemy, maxDistance: number): SurvivorEnemy | null {
  let best: SurvivorEnemy | null = null;
  let bestDistance = maxDistance;
  for (const other of state.enemies) {
    if (other === source || other.hp <= 0) continue;
    const distance = Math.hypot(other.x - source.x, other.y - source.y);
    if (distance < bestDistance) {
      best = other;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Marmita da Vila: cura aos poucos (com teto por corrida) e some quando o tempo do prato acaba. Os bônus de defesa,
 * velocidade, coleta e proteção são campos do jogador zerados na expiração.
 */
function stepLunch(state: SurvivorState, dt: number): void {
  const p = state.player;
  const lunch = p.lunch;
  if (!lunch?.active) return;
  if (state.elapsedMs >= lunch.effect.durationMs) {
    lunch.active = false;
    p.lunchDefense = 0;
    p.lunchSpeedBonus = 0;
    p.lunchPickupBonus = 0;
    p.lunchHitInvulnBonus = 0;
    return;
  }
  if (lunch.effect.regenPerSec <= 0 || p.hp <= 0) return;
  const room = Math.max(0, p.maxHp * LUNCH_HEAL_CAP_FRACTION - lunch.healed);
  const heal = Math.min(lunch.effect.regenPerSec * dt, room, Math.max(0, p.maxHp - p.hp));
  p.hp += heal;
  lunch.healed += heal;
}

/** Alcance de coleta com a marmita de Grão (enquanto dura). */
function effectivePickupRadius(p: SurvivorPlayer): number {
  return p.pickupRadius * (1 + (p.lunchPickupBonus ?? 0));
}

/** Janela de proteção depois de levar um golpe; a marmita de Fruta a alonga enquanto dura. */
function hitInvulnerabilityMs(p: SurvivorPlayer): number {
  return Math.round(BALANCE.hitInvulnerabilityMs * (1 + (p.lunchHitInvulnBonus ?? 0)));
}

function hitSource(enemy: SurvivorEnemy): SurvivorHitSource {
  return { ...(enemy.dexId !== undefined ? { dexId: enemy.dexId } : {}), boss: enemy.boss, grade: enemy.grade, ...(enemy.shadowBoss ? { shadowBoss: true } : {}) };
}

/** Contato e explosão são físicos; projéteis são especiais. Cada defesa dá retornos decrescentes. */
export function survivorDefenseReduction(player: Pick<SurvivorPlayer, 'dexId' | 'defenseBonus' | 'spDefenseBonus' | 'trainingDefense' | 'lunchDefense' | 'mega'>, kind: SurvivorFinalHit['kind']): number | null {
  const stats = survivorPlayerStats(player);
  if (!stats) return null;
  // Dojô e marmita têm campo próprio e teto combinado: não furam o limite de cartas `guard-*`.
  const trained = Math.min(TRAINING_DEFENSE_CAP, (player.trainingDefense ?? 0) + (player.lunchDefense ?? 0));
  const defense = kind === 'projétil' ? stats.spDefense + (player.spDefenseBonus ?? 0) + trained : stats.defense + (player.defenseBonus ?? 0) + trained;
  return defense / (200 + defense);
}

function damagePlayer(state: SurvivorState, damage: number, kind: SurvivorFinalHit['kind'], source: SurvivorHitSource): void {
  const p = state.player;
  const reduction = survivorDefenseReduction(p, kind);
  const effectiveDamage = damage > 0 ? Math.max(1, Math.ceil(damage * (1 - (reduction ?? 0)))) : 0;
  state.lastHit = { ...source, kind, damage: effectiveDamage, hpBefore: p.hp };
  p.hp = Math.max(0, p.hp - effectiveDamage);
}

function spawnHostileProjectile(state: SurvivorState, enemy: SurvivorEnemy, target: SurvivorPlayer, damageMultiplier = 0.7): void {
  if (state.hostileProjectiles.length >= ENEMY_BEHAVIOR_LIMITS.hostileProjectiles) return;
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const speed = BALANCE.hostileProjectileSpeed;
  // O efeito acompanha o nascimento do inimigo, não a espécie usada apenas para desenhá-lo.
  // Assim, trocar o elenco regional não altera o combate nem o RNG da mesma corrida.
  const effect = enemy.grade === 'comum' ? undefined : (enemy.id % 3 === 0 ? 'burn' : enemy.id % 3 === 1 ? 'slow' : 'stun');
  state.hostileProjectiles.push({
    id: state.nextId++, x: enemy.x, y: enemy.y, vx: (dx / distance) * speed, vy: (dy / distance) * speed,
     damage: Math.max(1, Math.round(enemy.damage * damageMultiplier)), lifeMs: 2600, size: enemy.grade === 'chefao' ? 8 : enemy.grade === 'elite' ? 7 : 6,
    grade: enemy.grade, source: hitSource(enemy), ...(effect ? { effect } : {}),
  });
}

function updateEnemyBehavior(state: SurvivorState, enemy: SurvivorEnemy, dtMs: number): { x: number; y: number } {
  const p = state.player;
  const archetype = enemy.archetype ?? 'perseguidor';
  let targetX = p.x;
  let targetY = p.y;
  const dxToPlayer = p.x - enemy.x;
  const dyToPlayer = p.y - enemy.y;
  const distance = Math.hypot(dxToPlayer, dyToPlayer) || 1;
  enemy.specialTimerMs = (enemy.specialTimerMs ?? 2000) - dtMs;
  if (enemy.protectedMs && enemy.protectedMs > 0) enemy.protectedMs = Math.max(0, enemy.protectedMs - dtMs);

  if (archetype === 'flanqueador') {
    const side = enemy.id % 2 === 0 ? 1 : -1;
    const offset = 120;
    targetX = p.x - (dyToPlayer / distance) * side * offset;
    targetY = p.y + (dxToPlayer / distance) * side * offset;
  } else if (archetype === 'atirador') {
    // Mantém distância legível: aproxima-se até 280 e recua quando fica perto de 170.
    const desired = distance < 170 ? -1 : distance > 280 ? 1 : 0;
    targetX = enemy.x + (dxToPlayer / distance) * desired * 180;
    targetY = enemy.y + (dyToPlayer / distance) * desired * 180;
    if (enemy.specialTimerMs <= 0 && distance <= 420) {
      spawnHostileProjectile(state, enemy, p);
      enemy.specialTimerMs = 2400;
    }
  } else if (archetype === 'protetor') {
    // A busca espacial só ocorre quando a habilidade pode disparar; o deslocamento normal continua barato.
    if (enemy.specialTimerMs <= 0) {
      const ally = nearestAlly(state, enemy, 260);
      if (ally) {
        targetX = ally.x;
        targetY = ally.y;
        let protectedCount = 0;
        for (const other of state.enemies) {
          if (other === enemy || other.hp <= 0 || protectedCount >= ENEMY_BEHAVIOR_LIMITS.maxProtectionTargets) continue;
          if (Math.hypot(other.x - enemy.x, other.y - enemy.y) <= 120) {
            other.protectedMs = Math.max(other.protectedMs ?? 0, 1400);
            protectedCount++;
          }
        }
        enemy.specialTimerMs = 4200;
      }
      else enemy.specialTimerMs = 1000;
    }
  } else if (archetype === 'suporte') {
    if (enemy.specialTimerMs <= 0) {
      const ally = nearestAlly(state, enemy, 320);
      if (ally) {
        targetX = ally.x;
        targetY = ally.y;
        const supportRole = enemy.supportRole ?? 'cura';
        if (supportRole === 'cura') {
          let healed = 0;
          for (const other of state.enemies) {
            if (other === enemy || other.hp <= 0 || healed >= ENEMY_BEHAVIOR_LIMITS.healingTargetsPerPulse) continue;
            if (Math.hypot(other.x - enemy.x, other.y - enemy.y) <= 110 && other.hp < other.maxHp) {
              const amount = Math.max(1, Math.round(other.maxHp * 0.08));
              other.hp = Math.min(other.maxHp, other.hp + amount);
              state.fx.push({ kind: 'heal', x: other.x, y: other.y, r: 15, color: '#ff78b7', ageMs: 0, lifeMs: 850, count: amount });
              healed++;
            }
          }
        } else if (supportRole === 'impulso') {
          let hastened = 0;
          for (const other of state.enemies) {
            if (other === enemy || other.hp <= 0 || hastened >= ENEMY_BEHAVIOR_LIMITS.maxProtectionTargets) continue;
            if (Math.hypot(other.x - enemy.x, other.y - enemy.y) <= 130) {
              other.hastenedMs = Math.max(other.hastenedMs ?? 0, 1800);
              hastened++;
            }
          }
          state.fx.push({ kind: 'pulse', x: enemy.x, y: enemy.y, r: 110, color: '#74e2a3', ageMs: 0, lifeMs: 500 });
        } else if (distance <= 420) {
          // O suporte ofensivo cria pressão legível, mas com dano menor e recarga mais longa que um atirador.
          spawnHostileProjectile(state, enemy, p, 0.45);
        }
        enemy.specialTimerMs = supportRole === 'cura' ? 5200 : supportRole === 'impulso' ? 4600 : 3600;
      }
      else enemy.specialTimerMs = 1200;
    }
  }
  if (archetype === 'investida') {
    // Leitura antes do golpe: o inimigo para por meio segundo, fica marcado em vermelho e então avança rápido.
    if (enemy.chargeMs && enemy.chargeMs > 0) {
      enemy.chargeMs = Math.max(0, enemy.chargeMs - dtMs);
      if (enemy.chargeMs === 0) enemy.dashMs = 450;
      else {
        targetX = enemy.x;
        targetY = enemy.y;
      }
    } else if (enemy.dashMs && enemy.dashMs > 0) {
      enemy.dashMs = Math.max(0, enemy.dashMs - dtMs);
    } else if (enemy.specialTimerMs <= 0 && distance <= 360) {
      enemy.chargeMs = 500;
      enemy.specialTimerMs = 2600;
      targetX = enemy.x;
      targetY = enemy.y;
    }
  }
  return { x: targetX, y: targetY };
}

/** Explosão do Pokémon explosivo ao cair: fere só o jogador (sem fogo amigo) e some se ele estiver longe. */
function explodeOnDeath(state: SurvivorState, enemy: SurvivorEnemy): void {
  const p = state.player;
  state.fx.push({ kind: 'blast', x: enemy.x, y: enemy.y, r: EXPLOSION_RADIUS, color: '#ff8c3a', ageMs: 0, lifeMs: 380 });
  if (Math.hypot(enemy.x - p.x, enemy.y - p.y) > EXPLOSION_RADIUS + PLAYER_RADIUS || p.invulnMs > 0) return;
  if (specialProtects(state)) {
    breakSurvivorShield(state);
    return;
  }
  const incoming = Math.ceil(enemy.damage * survivorDifficultyEnemyMultiplier(p.difficultyStacks ?? 0) * 0.8 * (p.artifactShieldMs > 0 ? 0.65 : 1));
  damagePlayer(state, incoming, 'explosão', hitSource(enemy));
  p.invulnMs = hitInvulnerabilityMs(p);
}

function artifactDamage(state: SurvivorState): number {
  return state.player.artifactPowerMs > 0 ? state.player.attackDamage * BALANCE.artifactPowerMultiplier : state.player.attackDamage;
}

function playerAttackDamage(state: SurvivorState): number {
  const base = artifactDamage(state);
  return state.player.move.category === 'aura' ? base * BALANCE.closeRangeAttackDamageMultiplier : base;
}

function artifactKind(rng: Rng): SurvivorArtifactKind {
  const roll = rng();
  return roll < 0.24 ? 'speed' : roll < 0.48 ? 'heal' : roll < 0.72 ? 'power' : roll < 0.86 ? 'magnet' : 'focus';
}

function nearbyVisibleEnemyCount(state: SurvivorState): number {
  const p = state.player;
  return state.enemies.filter((enemy) => enemy.hp > 0 && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= DIGITAL_DANGER_VISIBLE_RADIUS).length;
}

/**
 * O medidor só pune uma espera segura: se há inimigos visíveis, o jogador pode
 * parar para mirar; se a tela fica vazia, a Torre chama atenção para impedir
 * que a corrida vire uma espera sem risco.
 */
function updateDigitalDanger(state: SurvivorState, input: SurvivorInput, dtMs: number, trainerSpawnedThisStep: boolean, events: SurvivorEvent[]): void {
  if (state.over) return;
  state.digitalDangerCooldownMs = Math.max(0, state.digitalDangerCooldownMs - dtMs);
  if (state.elapsedMs < DIGITAL_DANGER_UNLOCK_MS) {
    state.digitalDanger = 0;
    return;
  }
  const visibleEnemies = input.visibleEnemies ?? nearbyVisibleEnemyCount(state);
  const moving = Math.hypot(input.dx, input.dy) > 0.15;
  const trainerActive = state.enemies.some((enemy) => enemy.hp > 0 && enemy.trainerId !== undefined);
  if (state.digitalDangerCooldownMs > 0 || trainerSpawnedThisStep || trainerActive) {
    state.digitalDanger = Math.max(0, state.digitalDanger - (dtMs / 1000) * 4);
    return;
  }
  if (!moving && visibleEnemies === 0) {
    state.digitalDanger = Math.min(DIGITAL_DANGER_MAX, state.digitalDanger + (dtMs / 1000) * 2.5);
  } else {
    state.digitalDanger = Math.max(0, state.digitalDanger - (dtMs / 1000) * (moving ? 4 : 1.5));
  }
  if (state.digitalDanger < DIGITAL_DANGER_MAX) return;

  state.digitalDanger = 0;
  state.digitalDangerCooldownMs = DIGITAL_DANGER_COOLDOWN_MS;
  // Dois Pokémon mantêm a convocação ameaçadora sem antecipar o grupo normal de três.
  spawnTrainer(state, 2, false, events, 'digital-danger');
}

function shadowBallPoint(state: SurvivorState): { x: number; y: number } {
  const p = state.player;
  for (let attempt = 0; attempt < 8; attempt++) {
    const x = PLAYER_RADIUS + state.rng() * (ARENA_W - PLAYER_RADIUS * 2);
    const y = PLAYER_RADIUS + state.rng() * (ARENA_H - PLAYER_RADIUS * 2);
    if (Math.hypot(x - p.x, y - p.y) >= 360) return { x, y };
  }
  return { x: Math.max(PLAYER_RADIUS, ARENA_W - p.x), y: Math.max(PLAYER_RADIUS, ARENA_H - p.y) };
}

/** A cutscene congela a Torre: o lendário só entra depois que a chegada fica legível. */
function advanceShadowEncounter(state: SurvivorState, dtMs: number, events: SurvivorEvent[]): boolean {
  const encounter = state.shadowEncounter;
  if (encounter.phase !== 'arrival') return false;
  encounter.arrivalMs = Math.min(SURVIVOR_SHADOW_CUTSCENE_MS, encounter.arrivalMs + dtMs);
  if (encounter.arrivalMs < SURVIVOR_SHADOW_CUTSCENE_MS) return true;
  encounter.phase = 'battle';
  spawnEnemy(state, true, 'comum', undefined, { shadowBoss: true, dexId: encounter.dexId });
  events.push({ type: 'shadowBossArrival', dexId: encounter.dexId, name: encounter.name });
  return false;
}

function spawnShadowBallIfDue(state: SurvivorState, events: SurvivorEvent[]): void {
  const encounter = state.shadowEncounter;
  if (encounter.phase !== 'idle' || state.shadowBallsSpawned >= SURVIVOR_SHADOW_BALL_MAX_PER_RUN || state.elapsedMs < state.nextShadowBallAtMs) return;
  // Cada Pokébola tem seu próprio sorteio. Como usa `state.rng`, uma seed continua reproduzindo a mesma aventura.
  const guardian = SHADOW_GUARDIANS[Math.floor(state.rng() * SHADOW_GUARDIANS.length)]!;
  encounter.dexId = guardian.dexId;
  encounter.name = guardian.name;
  const point = shadowBallPoint(state);
  state.artifacts.push({ id: state.nextId++, ...point, kind: 'shadow-ball' });
  state.shadowBallsSpawned += 1;
  encounter.phase = 'available';
  events.push({ type: 'shadowBallSpawn', dexId: encounter.dexId, name: encounter.name });
}

/**
 * Avança `dtMs` de jogo. Não faz nada (devolve `[]`) se `state.over` ou se há um upgrade pendente — quem chama
 * (o componente Vue) deve pausar o laço de desenho/tempo nesses casos e só retomar depois de `applyUpgrade`.
 */
export function stepSurvivor(state: SurvivorState, input: SurvivorInput, dtMs: number): SurvivorEvent[] {
  const events: SurvivorEvent[] = [];
  if (state.over || state.pendingUpgrade) return events;
  if (!Number.isFinite(dtMs) || dtMs <= 0) return events;
  if (advanceSpecialEncounter(state, dtMs)) return events;
  if (advanceShadowEncounter(state, dtMs, events)) return events;
  const dt = dtMs / 1000;
  const previousElapsedMs = state.elapsedMs;
  state.elapsedMs += dtMs;
  if (previousElapsedMs < SURVIVOR_LOVE_CANDY_MS && state.elapsedMs >= SURVIVOR_LOVE_CANDY_MS) {
    events.push({ type: 'milestone', id: 'ten-minutes', reward: 'love-candy' });
  }
  if (previousElapsedMs < SURVIVOR_TRUST_STONE_MS && state.elapsedMs >= SURVIVOR_TRUST_STONE_MS) {
    events.push({ type: 'milestone', id: 'fifteen-minutes', reward: 'trust-stone' });
  }
  if (previousElapsedMs < SURVIVOR_MEGA_SHARD_MS && state.elapsedMs >= SURVIVOR_MEGA_SHARD_MS) {
    events.push({ type: 'milestone', id: 'twenty-minutes', reward: 'mega-stone-shard' });
  }
  spawnShadowBallIfDue(state, events);
  if (advanceSpecialEncounter(state, 0)) return events;
  const p = state.player;
  p.artifactSpeedMs = Math.max(0, p.artifactSpeedMs - dtMs);
  p.artifactPowerMs = Math.max(0, p.artifactPowerMs - dtMs);
  p.artifactShieldMs = Math.max(0, p.artifactShieldMs - dtMs);
  p.artifactMagnetMs = Math.max(0, p.artifactMagnetMs - dtMs);
  p.artifactFocusMs = Math.max(0, p.artifactFocusMs - dtMs);
  const dashPath = stepSurvivorSpecial(state, input, dtMs, ARENA_W, ARENA_H, PLAYER_RADIUS);
  if (dashPath) hitDashPath(state, dashPath);

  // Movimento do jogador, com a arena como cerca.
  const len = Math.hypot(input.dx, input.dy);
  if (len > 0.001 && !(state.special.selected === 'dash' && state.special.activeMs > 0)) {
    const ux = input.dx / len;
    const uy = input.dy / len;
    const terrainSpeed = survivorBiomeMovementMultiplier(state.elapsedMs, p.x, p.y);
    const artifactSpeed = (p.artifactSpeedMs > 0 ? BALANCE.artifactSpeedMultiplier : 1) * (1 + (p.lunchSpeedBonus ?? 0));
    p.x = clamp(p.x + ux * p.speed * artifactSpeed * terrainSpeed * dt, PLAYER_RADIUS, ARENA_W - PLAYER_RADIUS);
    p.y = clamp(p.y + uy * p.speed * artifactSpeed * terrainSpeed * dt, PLAYER_RADIUS, ARENA_H - PLAYER_RADIUS);
    if (Math.abs(ux) > 0.01) p.facing = ux < 0 ? -1 : 1;
    p.aimAngle = Math.atan2(uy, ux);
  }
  // No BONK a frente é a câmera: o cone sempre acerta o que está adiante na tela, nunca ao lado.
  if (input.aimAngle !== undefined && Number.isFinite(input.aimAngle)) p.aimAngle = input.aimAngle;
  if (p.invulnMs > 0) p.invulnMs = Math.max(0, p.invulnMs - dtMs);
  if ((p.regenPerSec ?? 0) > 0 && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + (p.regenPerSec ?? 0) * dt);
  stepLunch(state, dt);
  stepSurvivorMega(state);

  // Nascimento de inimigos (onda cresce com o tempo) e do chefe periódico.
  let trainerSpawnedThisStep = false;
  state.wave = 1 + Math.floor(state.elapsedMs / 30_000);
  state.spawnAccumMs += dtMs;
  const interval = spawnIntervalMs(state);
  while (state.spawnAccumMs >= interval) {
    state.spawnAccumMs -= interval;
    spawnEnemy(state, false);
  }
  if (state.elapsedMs >= state.nextBossAtMs) {
    state.nextBossAtMs += BALANCE.bossEveryMs * (state.fast ? FAST_TIME_SCALE : 1);
    spawnEnemy(state, true);
    events.push({ type: 'bossSpawn' });
  }

  // Treinadores (minuto 5, 10, 15, …): 3 Pokémon elite juntos. O chefão final (minuto 20) tem 6 Pokémon.
  // No modo infinito, depois do chefão final, cai outro chefão de 6 a cada `INFINITE_BOSS_EVERY_MS`.
  if (state.infinite) state.infiniteScale = 1.15 + (state.elapsedMs / 60_000) * INFINITE_SCALE_PER_MIN;
  const finalDue = state.finalBossAtMs !== null && state.elapsedMs >= state.finalBossAtMs;
  if (finalDue) {
    state.finalBossAtMs = null;
    spawnTrainer(state, 6, true, events);
    trainerSpawnedThisStep = true;
    if (state.infinite) state.nextTrainerAtMs = state.elapsedMs + INFINITE_BOSS_EVERY_MS;
  } else if (state.elapsedMs >= state.nextTrainerAtMs && (state.finalBossAtMs === null || state.elapsedMs + 15_000 < state.finalBossAtMs)) {
    state.nextTrainerAtMs += state.infinite ? INFINITE_BOSS_EVERY_MS : TRAINER_EVERY_MS;
    spawnTrainer(state, state.infinite ? 6 : 3, false, events);
    trainerSpawnedThisStep = true;
  }

  // IA parametrizada: cada arquétipo escolhe um alvo e uma ação especial limitada por recarga.
  // No Survival comum, árvores, mato e itens são só cenário: inimigos os atravessam. O BONK aplica
  // sua própria colisão física depois deste passo, sem mudar este comportamento do modo normal.
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    if (e.hitFlashMs > 0) e.hitFlashMs = Math.max(0, e.hitFlashMs - dtMs);
    if (e.burnMs && e.burnMs > 0) {
      e.hp -= (e.burnDps ?? 0) * (Math.min(dtMs, e.burnMs) / 1000);
      e.burnMs = Math.max(0, e.burnMs - dtMs);
      if (e.burnMs === 0) e.burnDps = 0;
    }
    if (e.slowMs && e.slowMs > 0) e.slowMs = Math.max(0, e.slowMs - dtMs);
    if (e.frostImmuneMs && e.frostImmuneMs > 0) e.frostImmuneMs = Math.max(0, e.frostImmuneMs - dtMs);
    if (e.wetMs && e.wetMs > 0) e.wetMs = Math.max(0, e.wetMs - dtMs);
    if (e.seededMs && e.seededMs > 0) e.seededMs = Math.max(0, e.seededMs - dtMs);
    if (e.hastenedMs && e.hastenedMs > 0) e.hastenedMs = Math.max(0, e.hastenedMs - dtMs);
    const stunned = !!e.stunMs && e.stunMs > 0;
    if (stunned) e.stunMs = Math.max(0, (e.stunMs ?? 0) - dtMs);
    if ((e.stunCooldownMs ?? 0) > 0) e.stunCooldownMs = Math.max(0, (e.stunCooldownMs ?? 0) - dtMs);
    if ((e.knockbackCooldownMs ?? 0) > 0) e.knockbackCooldownMs = Math.max(0, (e.knockbackCooldownMs ?? 0) - dtMs);
    if ((e.orbitHitMs ?? 0) > 0) e.orbitHitMs = Math.max(0, (e.orbitHitMs ?? 0) - dtMs);
    const target = updateEnemyBehavior(state, e, dtMs);
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const rangedMultiplier = e.archetype === 'atirador' ? BALANCE.rangedEnemySpeedMultiplier : 1;
    const statusMultiplier = e.slowMs && e.slowMs > 0 ? 0.5 : 1;
    const hasteMultiplier = e.hastenedMs && e.hastenedMs > 0 ? 1.18 : 1;
    const dashMultiplier = e.dashMs && e.dashMs > 0 ? 2.5 : 1;
    const speed = stunned ? 0 : e.speed * survivorDifficultyEnemyMultiplier(p.difficultyStacks ?? 0) * rangedMultiplier * statusMultiplier * hasteMultiplier * dashMultiplier;
    e.x += (dx / d) * speed * dt;
    e.y += (dy / d) * speed * dt;
    const playerDistance = Math.hypot(p.x - e.x, p.y - e.y);
    // Espinhos: quem encosta em você apanha, mesmo durante a janela de invulnerabilidade do jogador.
    if ((p.thornsDamage ?? 0) > 0 && playerDistance < PLAYER_RADIUS + e.radius) e.hp -= (p.thornsDamage ?? 0) * dt;
    if (playerDistance < PLAYER_RADIUS + e.radius && p.invulnMs <= 0) {
      if (specialProtects(state)) {
        breakSurvivorShield(state);
        continue;
      }
        const incoming = Math.ceil((hasUpgrade(p, 'steel-plate') ? e.damage * 0.88 : e.damage) * survivorDifficultyEnemyMultiplier(p.difficultyStacks ?? 0) * closeRangeDamageMultiplier(state) * (p.artifactShieldMs > 0 ? 0.65 : 1));
      damagePlayer(state, incoming, 'contato', hitSource(e));
      p.invulnMs = hitInvulnerabilityMs(p);
    }
  }

  // Projéteis hostis têm alcance, dano e quantidade limitados; cada um some ao tocar o jogador.
  state.hostileProjectiles = state.hostileProjectiles.filter((proj) => {
    const nearAura = p.move.category === 'aura'
      && Math.hypot(proj.x - p.x, proj.y - p.y) <= p.attackRadius + proj.size;
    const psychicField = p.move.type === 'psychic' && hasUpgrade(p, 'psychic-field')
      && Math.hypot(proj.x - p.x, proj.y - p.y) <= Math.max(90, p.attackRadius || 90);
    const speedMultiplier = (nearAura ? BALANCE.auraProjectileSpeedMultiplier : 1) * (psychicField ? 0.9 : 1);
    proj.x += proj.vx * speedMultiplier * dt;
    proj.y += proj.vy * speedMultiplier * dt;
    proj.lifeMs -= dtMs;
    if (proj.lifeMs <= 0 || proj.x < -40 || proj.x > ARENA_W + 40 || proj.y < -40 || proj.y > ARENA_H + 40) return false;
    if (Math.hypot(proj.x - p.x, proj.y - p.y) <= PLAYER_RADIUS + proj.size) {
      if (p.invulnMs <= 0 && !specialProtects(state)) {
          const incoming = Math.ceil((hasUpgrade(p, 'steel-plate') ? proj.damage * 0.88 : proj.damage) * survivorDifficultyEnemyMultiplier(p.difficultyStacks ?? 0) * closeRangeDamageMultiplier(state) * (p.artifactShieldMs > 0 ? 0.65 : 1));
        damagePlayer(state, incoming, 'projétil', proj.source ?? { boss: false, grade: proj.grade ?? 'comum' });
        p.invulnMs = hitInvulnerabilityMs(p);
      }
      return false;
    }
    return true;
  });

  // Autoataque com o golpe do tipo (projétil, aura ou área).
  p.attackTimerMs = Math.max(0, p.attackTimerMs - dtMs);
  if (p.attackTimerMs <= 0 && attack(state)) p.attackTimerMs = p.attackCooldownMs * (p.artifactFocusMs > 0 ? 0.8 : 1);
  if (p.move.category === 'orbit') stepOrbiters(state, dtMs);
  if (state.supports.length > 0) {
    // Formação visual: cada apoio tem uma posição própria e alcança o jogador
    // com a mesma velocidade normal, sem criar vida ou hitbox adicional.
    const supportOffsets = [
      { x: -28, y: 22 },
      { x: -54, y: -18 },
      { x: -54, y: 62 },
      { x: -80, y: 8 },
      { x: -80, y: 86 },
    ] as const;
    for (const [index, support] of state.supports.entries()) {
      const offset = supportOffsets[index] ?? supportOffsets[supportOffsets.length - 1]!;
      const desiredX = p.x + p.facing * offset.x;
      const desiredY = p.y + offset.y;
      const dxSupport = desiredX - support.x;
      const dySupport = desiredY - support.y;
      const distance = Math.hypot(dxSupport, dySupport);
      const follow = Math.min(distance, p.speed * dt);
      if (distance > 0.01) { support.x += dxSupport / distance * follow; support.y += dySupport / distance * follow; }
      support.attackTimerMs = Math.max(0, support.attackTimerMs - dtMs);
      if (support.attackTimerMs <= 0 && attackSupport(state, support)) support.attackTimerMs = Math.max(500, Math.round(support.profile.cooldownMs * 1.45));
    }
    const firstSupport = state.supports[0];
    if (firstSupport) p.secondAttackTimerMs = firstSupport.attackTimerMs;
  }

  // Projéteis: avançam, somem com o tempo/fora da arena, acertam o inimigo mais próximo no caminho.
  const chained: SurvivorProjectile[] = [];
  state.projectiles = state.projectiles.filter((proj) => {
    const terrainSpeed = survivorBiomeProjectileSpeedMultiplier(state.elapsedMs, proj.x, proj.y);
    proj.x += proj.vx * terrainSpeed * dt;
    proj.y += proj.vy * terrainSpeed * dt;
    proj.lifeMs -= dtMs;
    if (proj.lifeMs <= 0) return false;
    if (proj.x < -40 || proj.x > ARENA_W + 40 || proj.y < -40 || proj.y > ARENA_H + 40) return false;
    for (const e of state.enemies) {
      if (proj.hit.includes(e.id)) continue;
      if (Math.hypot(e.x - proj.x, e.y - proj.y) < e.radius + 5) {
        hitEnemy(state, e, proj.damage, { x: proj.x - proj.vx * 0.05, y: proj.y - proj.vy * 0.05 }, proj.move, true, proj.distanceFromPlayer ?? Math.hypot(e.x - p.x, e.y - p.y));
        drain(state, 1, proj.move ?? state.player.move);
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
            chained.push({ id: state.nextId++, x: e.x, y: e.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, damage: round1(proj.damage * 0.7), pierce: 0, lifeMs: 600, hit: [...proj.hit], canChain: false, size: proj.size, move: proj.move, source: proj.source, distanceFromPlayer: proj.distanceFromPlayer, look: proj.look });
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
      const value = normalizeSurvivorXp(e.boss ? 48 : e.grade === 'chefao' ? 36 : e.grade === 'elite' ? 20 : 8);
      const doubleXp = state.rng() < BALANCE.doubleXpOrbChance;
      state.orbs.push({ id: state.nextId++, x: e.x, y: e.y, value, ...(doubleXp ? { doubleXp: true } : {}) });
      const dropChance = (e.boss ? BALANCE.artifactBossDropChance : e.grade === 'chefao' || e.grade === 'elite' ? BALANCE.artifactEliteDropChance : BALANCE.artifactDropChance) * (1 + (p.artifactLuck ?? 0));
      if (state.rng() < dropChance) state.artifacts.push({ id: state.nextId++, x: e.x, y: e.y, kind: artifactKind(state.rng) });
      if (e.archetype === 'explosivo') explodeOnDeath(state, e);
      const pokeballsOnGround = state.artifacts.reduce((total, artifact) => total + (artifact.kind === 'pokeball' ? 1 : 0), 0);
      const pokeballChance = e.boss || e.grade === 'chefao'
        ? BALANCE.digitalPokeballDropChance.chefao
        : e.grade === 'elite'
          ? BALANCE.digitalPokeballDropChance.elite
          : BALANCE.digitalPokeballDropChance.comum;
      if (
        state.elapsedMs >= SURVIVOR_LOVE_CANDY_MS
        && state.digitalPokeballs + pokeballsOnGround < MAX_DIGITAL_POKEBALLS_PER_RUN
        && state.rng() < pokeballChance
      ) {
         state.artifacts.push({ id: state.nextId++, x: e.x, y: e.y, kind: 'pokeball' });
      }
      if (e.shadowBoss) {
        state.shadowTrustStones += 1;
        state.shadowEncounter.phase = 'idle';
        state.shadowEncounter.arrivalMs = 0;
        state.nextShadowBallAtMs = state.elapsedMs + SURVIVOR_SHADOW_BALL_EVERY_MS;
        events.push({ type: 'shadowBossDefeated', dexId: state.shadowEncounter.dexId, name: state.shadowEncounter.name, trustStones: state.shadowTrustStones });
      }
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
      if (!final && state.trainersBeaten === 1 && !state.typeAffinityOffered && state.typeAffinityChoices.length > 0) {
        state.typeAffinityOffered = true;
        events.push({ type: 'typeAffinityOffer', types: [...state.typeAffinityChoices] });
      }
      // Chefão final caído no modo normal: a corrida termina com vitória (fecha o resumo e destrava o infinito).
      if (final && !state.infinite && !state.over) {
        state.over = true;
        state.projectiles = [];
        state.hostileProjectiles = [];
        state.fx = [];
        events.push({
          type: 'gameover',
          summary: { survivedMs: state.elapsedMs, level: state.player.level, stage: state.player.stage, kills: state.kills, wave: state.wave, trainersBeaten: state.trainersBeaten, bossesBeaten: state.bossesBeaten, finalBossBeaten: state.finalBossBeaten, infinite: state.infinite, fast: state.fast, digitalPokeballs: state.digitalPokeballs, shadowTrustStones: state.shadowTrustStones, bonusCoins: state.player.bonusCoins ?? 0 },
        });
      }
    }
  }

  // Coleta de orbes de XP (e nível, se passou da marca).
  state.orbs = state.orbs.filter((orb) => {
    if (Math.hypot(orb.x - p.x, orb.y - p.y) <= effectivePickupRadius(p)) {
      // A marmita de Peixe não multiplica o ritmo acelerado: vale o maior dos dois.
      const multiplier = Math.max(p.xpMultiplier ?? 1, p.lunch?.active ? 1 + p.lunch.effect.xpBonus : 1);
      const orbValue = orb.doubleXp ? orb.value * 2 : orb.value;
      const xpWithCarry = orbValue * multiplier * BALANCE.xpOrbMultiplier + (p.xpCarry ?? 0);
      const boostedValue = normalizeSurvivorXp(xpWithCarry);
      p.xpCarry = Math.max(0, xpWithCarry - boostedValue);
      p.xp = normalizeSurvivorXp(p.xp + boostedValue);
      return false;
    }
    return true;
  });
  state.artifacts = state.artifacts.filter((artifact) => {
    const pickupRadius = Math.min(MAGNET_PICKUP_RADIUS_CAP, effectivePickupRadius(p) * (p.artifactMagnetMs > 0 ? 1.7 : 1));
    if (Math.hypot(artifact.x - p.x, artifact.y - p.y) > pickupRadius) return true;
    if (artifact.kind === 'shadow-ball') {
      state.shadowEncounter.phase = 'arrival';
      state.shadowEncounter.arrivalMs = 0;
    } else if (artifact.kind === 'pokeball') state.digitalPokeballs += 1;
    else if (artifact.kind === 'speed') p.artifactSpeedMs = Math.max(p.artifactSpeedMs, BALANCE.artifactDurationMs);
    else if (artifact.kind === 'power') p.artifactPowerMs = Math.max(p.artifactPowerMs, BALANCE.artifactDurationMs);
    else if (artifact.kind === 'magnet') p.artifactMagnetMs = Math.max(p.artifactMagnetMs, BALANCE.artifactDurationMs);
    else if (artifact.kind === 'focus') p.artifactFocusMs = Math.max(p.artifactFocusMs, BALANCE.artifactDurationMs);
    else if (artifact.kind === 'heal') {
      p.hp = Math.min(p.maxHp, p.hp + Math.max(18, Math.round(p.maxHp * 0.28)));
      p.artifactShieldMs = 3_000;
    }
    state.fx.push({ kind: 'artifact', artifact: artifact.kind, x: p.x, y: p.y, r: artifact.kind === 'pokeball' || artifact.kind === 'shadow-ball' ? 30 : 24, color: artifact.kind === 'shadow-ball' ? '#a66bff' : artifact.kind === 'pokeball' ? '#ff5b5b' : artifact.kind === 'speed' ? '#7bdcff' : artifact.kind === 'power' ? '#ffb35c' : artifact.kind === 'magnet' ? '#d68cff' : artifact.kind === 'focus' ? '#ffe071' : '#ff8fbb', ageMs: 0, lifeMs: artifact.kind === 'pokeball' || artifact.kind === 'shadow-ball' ? 900 : 620 });
    events.push({ type: 'artifactCollected', kind: artifact.kind });
    return false;
  });
  levelUp(state, events);

  // Segundo fôlego: uma vez por corrida, ao cair até 25% de vida, o jogador volta com 35% do máximo.
  if (p.secondWindReady && p.hp <= p.maxHp * 0.25) {
    p.secondWindReady = false;
    const healed = Math.round(p.maxHp * 0.35);
    p.hp = Math.min(p.maxHp, p.hp + healed);
    p.invulnMs = Math.max(p.invulnMs, BALANCE.hitInvulnerabilityMs);
    state.fx.push({ kind: 'heal', x: p.x, y: p.y, r: 34, color: '#7bdcff', ageMs: 0, lifeMs: 850, count: healed });
  }
  if (p.hp <= 0 && !state.over) {
    state.over = true;
    state.projectiles = [];
    state.hostileProjectiles = [];
    state.fx = [];
    events.push({
      type: 'gameover',
      summary: { survivedMs: state.elapsedMs, level: p.level, stage: p.stage, kills: state.kills, wave: state.wave, trainersBeaten: state.trainersBeaten, bossesBeaten: state.bossesBeaten, finalBossBeaten: state.finalBossBeaten, infinite: state.infinite, fast: state.fast, digitalPokeballs: state.digitalPokeballs, shadowTrustStones: state.shadowTrustStones, bonusCoins: p.bonusCoins ?? 0, ...(state.lastHit ? { finalHit: state.lastHit } : {}) },
    });
  }

  updateDigitalDanger(state, input, dtMs, trainerSpawnedThisStep, events);

  return events;
}
