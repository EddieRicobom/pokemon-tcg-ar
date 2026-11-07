import { healSurvivor } from './survivor-healing';
import { seededRng } from './battle';
import { statsOfDex } from './survivor-stats';
import type { Rng } from './battle';
import { BASIC_ATTACK_DAMAGE_FACTOR, moveWith, type AttackProfile, type MoveCategory, type SurvivorMove } from './survivor-moves';
import { destinyLinkRule, HELD_ITEM_BY_ID, HELD_OFFER_PREFIX, heldChargePosition, heldItemText, heldMods, isHeldItemId, mirrorOrbiters, rollHeldOffer, timeBubbleRule } from './survivor-held';
import type { HeldItemId } from './survivor-held';
import { survivorBiomeDamageMultiplier, survivorBiomeMovementMultiplier, survivorBiomeProjectileSpeedMultiplier } from './survivor-biomes';
import { survivorElementalStatus, survivorSynergyFor } from './survivor-synergies';
import { HYPOTHETICAL_TYPE_ACTIVATION_MS, hypotheticalSecondaryTypeFor, hypotheticalTypeRuleFor } from './survivor-type-mix';
import { survivorPreparation } from './survivor-preparations';
import { MAX_OFFER_CHOICES, PURE_LOADOUT } from './survivor-loadout';
import type { TowerLoadout } from './survivor-loadout';
import { LUNCH_HEAL_CAP_FRACTION, TRAINING_DEFENSE_CAP, TRAINING_SPEED_CAP } from './survivor-lunch';
import { endSurvivorMega, startSurvivorMega, survivorPlayerStats } from './survivor-mega';
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
import { createBonkObstacles } from './survivor-bonk';
import {
  ADAPTIVE_START, adaptiveTarget, applyLevelBonus, damageRanking, emptyRunStats, LEVEL_BONUS_TEXT, recordDamage, sampleTimeline, stepAdaptive,
  SURVIVOR_THIEF_DEX, SURVIVOR_THIEF_EVERY_MS, SURVIVOR_THIEF_FIRST_MS, SURVIVOR_THIEF_LIFE_MS, SURVIVOR_THIEF_SPEED, thiefFleeTarget, thiefReward,
} from './survivor-extras';
import { ARENA_H, ARENA_W, DIGITAL_DANGER_COOLDOWN_MS, DIGITAL_DANGER_MAX, DIGITAL_DANGER_UNLOCK_MS, DIGITAL_DANGER_VISIBLE_RADIUS, MAGNET_PICKUP_RADIUS_CAP, MAX_DIGITAL_POKEBALLS_PER_RUN, MAX_SURVIVOR_SUPPORTS, PICKUP_RADIUS, PLAYER_RADIUS, SPAWN_MARGIN, SURVIVOR_FIELD_EVENT_BEACON_MS, SURVIVOR_FIELD_EVENT_EVERY_MS, SURVIVOR_FIELD_EVENT_FIRST_MS, SURVIVOR_FIELD_EVENT_HUNT_MS, SURVIVOR_FIELD_EVENT_REACH_RADIUS, SURVIVOR_LOVE_CANDY_MS, SURVIVOR_OMEGA_SHARD_MS, SURVIVOR_SHADOW_BALL_EVERY_MS, SURVIVOR_SHADOW_BALL_FIRST_MS, SURVIVOR_SHADOW_BALL_MAX_PER_RUN, SURVIVOR_SHADOW_CUTSCENE_MS, SURVIVOR_SPAWN_DISTANCE, SURVIVOR_SUPPORT_EVOLUTION_OFFER_CHANCE, SURVIVOR_SUPPORT_RARE_OFFER_CHANCE, SURVIVOR_TRUST_STONE_MS, SURVIVOR_UPGRADE_RARITIES, SURVIVOR_FAST_TRAINER_COIN_SCALE, survivorMilestoneMs } from './survivor-types';
import type { SurvivorSummary, SurvivorArtifactKind, SurvivorChest, SurvivorGravityWell, SurvivorHeldStrike, SurvivorTimeBubble, SurvivorFinalHit, SurvivorHitSource, SurvivorEnemy, SurvivorEnemyArchetype, SurvivorEnemyGrade, SurvivorEvent, SurvivorEvolutionOption, SurvivorInput, SurvivorPlayer, SurvivorProjectile, SurvivorState, SurvivorSupport, SurvivorSupportCandidate, SurvivorSupportRole, SurvivorTypeAffinity, SurvivorUpgrade, SurvivorUpgradeOption, SurvivorUpgradeRarity } from './survivor-types';
import { cadenceCanImprove, CHARGE_FOCUS_RATE_ID, CHARGE_RUSH_LENGTH_ID, SURVIVOR_ATTACK_DAMAGE_CAP, SURVIVOR_UPGRADES, SURVIVOR_RARITY_ORDER, round1 } from './survivor-upgrades';
import { cancelTeleportHold, createSurvivorCharge, distanceToSegment, FOCUS_CHARGE_PER_SEC, FOCUS_HIT_CHARGE, FOCUS_SHOT_PIERCE, FOCUS_SHOT_SIZE_MULTIPLIER, FOCUS_SHOT_SPEED_MULTIPLIER, FOCUS_SLOW_MULTIPLIER, focusBeam, TELEPORT_MAX_RANGE, RAPID_BURST_MIN_CYCLE_MS, RAPID_BURST_SHOT_INTERVAL_MS, RAPID_BURST_SHOTS, RAPID_BURST_SPREAD, RUSH_REFERENCE_SPEED, stepChargeMeter, teleportReach } from './survivor-charge';
import type { ChargeStyle } from './survivor-charge';
import { survivorProjectileLook } from './survivor-projectile-power';
import { healersReaching, healShare, SUPPORT_HEAL_RADIUS } from './survivor-heal';
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
  enemyHpStep: 2.5,
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
  /** Runs do PvP: sem baús, chaves nem itens segurados, para os dois lados começarem iguais. */
  noHeld?: boolean;
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
  /** Tipo da Mistura dos 9 minutos; sem isto, sai da semente. A troca de golpe na seleção usa o tipo do golpe antigo. */
  hypotheticalSecondaryType?: PokemonType;
  /** Segundo tipo raro escolhido no início da corrida. */
  typeAffinity?: SurvivorTypeAffinity;
  /** Tipos secundários reais da espécie; a escolha só aparece após o primeiro líder derrotado. */
  typeAffinityChoices?: readonly PokemonType[];
  /** Forma Mega escolhida na seleção (`core/survivor-mega.ts`); começa ativa e dura até o fim da corrida. */
  mega?: SurvivorMegaForm;
  /** Desafio que se adapta à força do Pokémon (`core/survivor-extras.ts`). Desligado por padrão. */
  adaptive?: boolean;
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
    ...(move.category === 'trilha' ? { trailCharge: 0, trailActiveMs: 0, trailPath: [] } : {}),
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
    bonkJumpPower: 540,
    bonkAirJumps: 0,
    bonkGravityFactor: 1,
    bonkMode: options.bonk === true,
    upgradeLevels: {},
    held: {},
    critChance: 0.05,
    ...options.player,
  };
  const state: SurvivorState = {
    criticalHits: [],
    critRng: seededRng((seed ^ 0x5a17c9e3) >>> 0),
    special: createSurvivorSpecial(move.type),
    charge: createSurvivorCharge(),
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
    elementalTerrain: [],
    digitalPokeballs: 0,
    digitalDanger: 0,
    digitalDangerCooldownMs: 0,
    shadowEncounter: { phase: 'idle', dexId: shadowGuardian.dexId, name: shadowGuardian.name, arrivalMs: 0 },
    nextShadowBallAtMs: survivorMilestoneMs(SURVIVOR_SHADOW_BALL_FIRST_MS, fast),
    shadowBallsSpawned: 0,
    shadowTrustStones: 0,
    fieldEvent: null,
    nextFieldEventAtMs: SURVIVOR_FIELD_EVENT_FIRST_MS,
    thief: null,
    nextThiefAtMs: SURVIVOR_THIEF_FIRST_MS,
    adaptive: options.adaptive ? { value: ADAPTIVE_START } : null,
    runStats: emptyRunStats(),
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
    keys: 0,
    keyDrops: [],
    chests: [],
    nextChestAtMs: survivorMilestoneMs(CHEST_FIRST_MS, fast),
    heldMines: [],
    heldDisabled: options.noHeld === true,
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
    hypotheticalSecondaryType: options.hypotheticalSecondaryType ?? hypotheticalSecondaryTypeFor(move.type, seed),
    hypotheticalSecondaryActive: false,
  };
  if (options.mega) startSurvivorMega(state, options.mega);
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
  const interval = base * (1 + BALANCE.earlySpawnIntervalBonus * early) * BALANCE.spawnRateMultiplier / survivorDifficultyDensityMultiplier(state.player.difficultyStacks ?? 0)
    / Math.sqrt(state.adaptive?.value ?? 1);
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
): number | null {
  if (state.enemies.length >= ENEMY_BEHAVIOR_LIMITS.maxEnemies && !boss && grade === 'comum') return null;
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
    return id;
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
  // Treinadores e chefões ficam de fora do desafio adaptável: são os marcos da corrida.
  const adaptive = trainerId === undefined ? state.adaptive?.value ?? 1 : 1;
  const hp = Math.round(baseHp * hpMul * state.infiniteScale * adaptive);
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
    damage: Math.round(baseDmg * dmgMul * state.infiniteScale * adaptive),
    radius: grade === 'chefao' ? 20 : grade === 'elite' ? 16 : 13,
    hitFlashMs: 0,
    archetype,
    specialTimerMs: grade === 'chefao' ? 1800 : 2400,
    ...(archetype === 'suporte' ? { supportRole: supportRoleFor(id) } : {}),
  });
  return id;
}

/** Chama um treinador: `count` Pokémon elite nascem juntos, com o mesmo `trainerId` (para marcarmos a derrota). */
function spawnTrainer(state: SurvivorState, count: number, final: boolean, events: SurvivorEvent[], trigger?: 'digital-danger'): void {
  const trainerId = state.nextId++;
  const grade: SurvivorEnemyGrade = final ? 'chefao' : 'elite';
  for (let i = 0; i < count; i++) {
    const id = spawnEnemy(state, false, grade, trainerId);
    if (trigger === 'digital-danger') {
      const enemy = state.enemies.find((entry) => entry.id === id);
      if (enemy) { enemy.digitalThreat = true; enemy.maxHp = Math.round(enemy.maxHp * 1.5); enemy.hp = enemy.maxHp; enemy.damage = Math.round(enemy.damage * 1.25); enemy.speed *= 1.2; }
    }
  }
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
    && (!player || (u.id !== 'power' && u.id !== 'resonance' || player.attackDamage < SURVIVOR_ATTACK_DAMAGE_CAP))
    && (!player || u.id !== 'haste' || cadenceCanImprove(player))
    && (!player || u.id !== 'multishot' || !['projetil', 'area', 'orbit', 'rapido', 'teleporte'].includes(move.category) || player.shots < (move.category === 'orbit' ? 1 + SURVIVOR_ORBIT_MAX - SURVIVOR_ORBIT_BASE : 5))
    && (!player || u.id !== 'patient-shooter' && u.id !== CHARGE_RUSH_LENGTH_ID || cadenceCanImprove(player))
    && (!player || u.id !== 'range' || move.category !== 'teleporte' || player.attackRange < TELEPORT_MAX_RANGE)
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
  // A escolha do baú é um sorteio próprio: trocar as cartas viraria upgrades comuns no lugar dos itens.
  if (current.some((option) => option.id.startsWith(HELD_OFFER_PREFIX))) return false;

  state.player.upgradeRerolls -= 1;
  const nonRare = current.filter((option) => (option.rarity ? SURVIVOR_RARITY_ORDER.indexOf(option.rarity) : 0) < 1);
  const allRareOrBetter = nonRare.length === 0;
  // Tudo raro ou melhor: troca a última carta comum da oferta, nunca evolução nem o apoio garantido.
  const guaranteedCard = (id: string): boolean => id.startsWith('evolve') || id === 'support-evolve' || id === 'second-attack';
  const swapIndex = current.reduce((found, option, index) => (guaranteedCard(option.id) ? found : index), current.length - 1);
  const preserved = allRareOrBetter ? current.filter((_, index) => index !== swapIndex) : current.filter((option) => option.rarity !== undefined && SURVIVOR_RARITY_ORDER.indexOf(option.rarity) >= 1);
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
  offerOwedUpgrade(state, events);
}

/** Abre a próxima escolha de upgrade devida, se não houver uma aberta. */
function offerOwedUpgrade(state: SurvivorState, events?: SurvivorEvent[]): void {
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
  if (options.length === 0) {
    // Sem nenhuma carta para escolher, o nível rende um bônus na hora em vez de abrir uma tela vazia.
    const kind = applyLevelBonus(state.player, state.rng());
    events?.push({ type: 'levelBonus', text: LEVEL_BONUS_TEXT[kind] });
    offerOwedUpgrade(state, events);
    return;
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
  const hpBeforeUpgrade = state.player.hp;
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
  } else if (id.startsWith(HELD_OFFER_PREFIX)) {
    const heldId = id.slice(HELD_OFFER_PREFIX.length);
    if (offered && isHeldItemId(heldId)) grantHeldItem(state, heldId, events);
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
  if ((state.player.healBlockMs ?? 0) > 0) state.player.hp = Math.min(state.player.hp, hpBeforeUpgrade);
  const offeredSupport = state.supportCandidate;
  if (offeredSupport && id !== 'second-attack' && state.supportCandidateGuaranteed) consumeSupportCandidate(state, offeredSupport);
  if (offeredSupport && id !== 'second-attack') state.supportCandidate = null;
  state.supportCandidateGuaranteed = false;
  state.pendingUpgrade = null;
  offerOwedUpgrade(state, events);
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
  healSurvivor(p, p.maxHp);
  p.hp = Math.min(p.hp, p.maxHp);
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

/** Pedra/Terra não paralisa: deixa um terreno que pulsa três vezes com metade do dano do golpe. */
function leaveElementalTerrain(state: SurvivorState, e: SurvivorEnemy, damage: number, move: SurvivorMove): void {
  state.elementalTerrain.push({ x: e.x, y: e.y, radius: Math.max(28, e.radius * 2), damage, ticksLeft: 3, nextTickMs: 0, move });
  // Evita centenas de marcas quando uma Trilha ou Rajada encontra uma multidão.
  if (state.elementalTerrain.length > 48) state.elementalTerrain.splice(0, state.elementalTerrain.length - 48);
}

function stepElementalTerrain(state: SurvivorState, dtMs: number): void {
  for (const terrain of state.elementalTerrain) {
    terrain.nextTickMs -= dtMs;
    while (terrain.ticksLeft > 0 && terrain.nextTickMs <= 0) {
      const pulseDamage = terrain.damage * 0.5;
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0 || Math.hypot(enemy.x - terrain.x, enemy.y - terrain.y) > terrain.radius + enemy.radius) continue;
        enemy.hp -= pulseDamage;
        enemy.hitFlashMs = 90;
      }
      state.fx.push({ kind: 'blast', x: terrain.x, y: terrain.y, r: terrain.radius, color: terrain.move.color, ageMs: 0, lifeMs: 240, moveType: terrain.move.type });
      terrain.ticksLeft--;
      terrain.nextTickMs += 420;
    }
  }
  state.elementalTerrain = state.elementalTerrain.filter((terrain) => terrain.ticksLeft > 0);
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

// ----------------------------------------------------------------------------- itens segurados, chaves e baús

/** Baús: o primeiro aos 2:30 e depois a cada 2:30 (no Ritmo acelerado, na mesma fração da corrida); no máximo 2 no chão. */
export const CHEST_FIRST_MS = 150_000;
export const CHEST_EVERY_MS = 150_000;
export const MAX_CHESTS_ON_FIELD = 2;
/** Chance de um elite solto (fora de time de treinador) derrubar uma chave. */
export const LOOSE_ELITE_KEY_CHANCE = 0.35;
const CHEST_OPEN_REACH = PLAYER_RADIUS + 26;
const MAX_HELD_MINES = 16;
const MAX_PROJECTILES_FOR_SHARDS = 220;
const HELD_GRASS_MOVE = moveWith('grass', 'area', null);

/** Acertos disparados por um item (raio, estilhaço, farpa) não disparam os itens de novo. */
let heldGuard = 0;
const heldShardQueues = new WeakMap<SurvivorState, SurvivorProjectile[]>();

function grantHeldItem(state: SurvivorState, id: HeldItemId, events: SurvivorEvent[]): void {
  const p = state.player;
  p.held ??= {};
  const copies = (p.held[id] ?? 0) + 1;
  p.held[id] = copies;
  HELD_ITEM_BY_ID[id].applyStats?.(p);
  p.heldMods = heldMods(p.held);
  p.heldLeechBudget ??= 0;
  state.fx.push({ kind: 'evolve', x: p.x, y: p.y, r: 38, color: HELD_ITEM_BY_ID[id].color, ageMs: 0, lifeMs: 600 });
  events.push({ type: 'heldItem', id, name: HELD_ITEM_BY_ID[id].name, copies });
}

function refillHeldLeech(p: SurvivorPlayer, dtMs: number): void {
  const cap = p.heldMods?.leechCapPerSec ?? 0;
  if (cap <= 0) return;
  p.heldLeechBudget = Math.min(cap, (p.heldLeechBudget ?? 0) + cap * dtMs / 1000);
}

/** Multiplicador de dano dos itens: Orbe da Vida e Faixa, Cinto Expert contra os fortes e a sequência do Metrônomo. */
function heldDamageFactor(state: SurvivorState, e: SurvivorEnemy): number {
  const p = state.player;
  const mods = p.heldMods!;
  let factor = mods.damageMul * (mods.typeBoost[p.move.type] ?? 1);
  if (e.boss || e.grade !== 'comum' || e.trainerId !== undefined) factor *= mods.eliteMul;
  if (mods.metronomeStep > 0) {
    // Sequência por inimigo: vale igual para quem acerta um alvo só (projétil) e para quem acerta vários (aura, trilha).
    const fresh = state.elapsedMs - (e.heldLastHitMs ?? -Infinity) > 1500;
    e.heldHits = fresh ? 0 : Math.min(5, (e.heldHits ?? 0) + 1);
    e.heldLastHitMs = state.elapsedMs;
    factor *= 1 + mods.metronomeStep * e.heldHits;
  }
  return factor;
}

function heldHoming(p: SurvivorPlayer): { homing?: number } {
  const homing = p.heldMods?.homing ?? 0;
  return homing > 0 ? { homing } : {};
}

/** Pena Rápida: o disparo vira aos poucos para o inimigo mais perto que ainda não acertou. */
const HOMING_RANGE = 240;
const HOMING_RETARGET_MS = 120;

function steerHomingProjectile(state: SurvivorState, proj: SurvivorProjectile, dt: number): void {
  // Mantém o alvo por alguns quadros; só procura de novo quando o tempo vence ou o alvo some.
  proj.homingRetargetMs = (proj.homingRetargetMs ?? 0) - dt * 1000;
  let best: SurvivorEnemy | undefined;
  if (proj.homingTargetId !== undefined && proj.homingRetargetMs > 0) {
    best = state.enemies.find((e) => e.id === proj.homingTargetId && e.hp > 0 && !proj.hit.includes(e.id));
  }
  if (!best) {
    let bestD2 = HOMING_RANGE * HOMING_RANGE;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      const dx = e.x - proj.x;
      const dy = e.y - proj.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2 && !proj.hit.includes(e.id)) { bestD2 = d2; best = e; }
    }
    proj.homingTargetId = best?.id;
    proj.homingRetargetMs = HOMING_RETARGET_MS;
  }
  if (!best) return;
  const speed = Math.hypot(proj.vx, proj.vy);
  const current = Math.atan2(proj.vy, proj.vx);
  let diff = Math.atan2(best.y - proj.y, best.x - proj.x) - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const limit = (proj.homing ?? 0) * dt;
  const turn = Math.max(-limit, Math.min(limit, diff));
  proj.vx = Math.cos(current + turn) * speed;
  proj.vy = Math.sin(current + turn) * speed;
}

function heldNeighbors(state: SurvivorState, origin: SurvivorEnemy, range: number, count: number): SurvivorEnemy[] {
  // Distância calculada uma vez por inimigo (antes era refeita a cada comparação da ordenação).
  const range2 = range * range;
  const near: { e: SurvivorEnemy; d2: number }[] = [];
  for (const o of state.enemies) {
    if (o === origin || o.hp <= 0) continue;
    const dx = o.x - origin.x;
    const dy = o.y - origin.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= range2) near.push({ e: o, d2 });
  }
  near.sort((a, b) => a.d2 - b.d2);
  return near.slice(0, count).map((entry) => entry.e);
}

const PLATE_ITEM: Partial<Record<string, HeldItemId>> = { fire: 'placa-chama', electric: 'placa-zap', ice: 'placa-gelo' };

/** Efeitos de cada acerto do golpe de quem joga, somando todos os itens. Os acertos extras não disparam itens de novo. */
function applyHeldOnHit(state: SurvivorState, e: SurvivorEnemy, damage: number, from: { x: number; y: number }, critical: boolean): void {
  const p = state.player;
  const mods = p.heldMods;
  if (!mods) return;
  heldGuard++;
  try {
    const duration = mods.statusDurationMul;
    if (mods.selfDamagePerAttack > 0 && state.elapsedMs - (p.heldLifeCostAtMs ?? -Infinity) >= 400) {
      p.heldLifeCostAtMs = state.elapsedMs;
      const floor = p.maxHp * 0.25;
      if (p.hp > floor) p.hp = Math.max(floor, p.hp - mods.selfDamagePerAttack);
    }
    if (mods.leech > 0) {
      const heal = Math.min(p.heldLeechBudget ?? 0, damage * mods.leech);
      if (heal > 0) { healSurvivor(p, heal); p.heldLeechBudget = (p.heldLeechBudget ?? 0) - heal; }
    }
    if (mods.knockback > 0 && !e.boss && e.grade === 'comum') applyKnockback(e, from, mods.knockback);
    for (const type of mods.plates) {
      e.hp -= damage * 0.25;
      Object.assign(e, survivorElementalStatus(type));
    }
    const firstPlate = mods.plates[0] ? PLATE_ITEM[mods.plates[0]] : undefined;
    if (firstPlate) state.fx.push({ kind: 'echo', x: e.x, y: e.y, r: Math.max(10, e.radius * 1.6), color: HELD_ITEM_BY_ID[firstPlate].color, ageMs: 0, lifeMs: 220 });
    if (e.hp > 0 && mods.stunChance > 0 && state.rng() < mods.stunChance) {
      applyStun(e, Math.round((e.boss || e.grade === 'chefao' ? 120 : 450) * duration));
      state.fx.push({ kind: 'echo', x: e.x, y: e.y - 6, r: e.radius * 1.4, color: HELD_ITEM_BY_ID['pedra-rei'].color, ageMs: 0, lifeMs: 320 });
    }
    if (e.hp > 0 && mods.burnChance > 0 && state.rng() < mods.burnChance) {
      e.burnMs = Math.max(e.burnMs ?? 0, Math.round(2000 * duration));
      e.burnDps = Math.max(e.burnDps ?? 0, round1(damage * 0.3));
    }
    if (e.hp > 0 && mods.poisonChance > 0 && state.rng() < mods.poisonChance) {
      // O veneno acumula: cada aplicação soma ao que já corre, até 1,5× o acerto.
      e.burnMs = Math.max(e.burnMs ?? 0, Math.round(3000 * duration));
      e.burnDps = round1(Math.min(damage * 1.5, (e.burnDps ?? 0) + damage * 0.12));
    }
    if (mods.rootChance > 0 && state.rng() < mods.rootChance) {
      leaveElementalTerrain(state, e, damage, HELD_GRASS_MOVE);
      const root = state.elementalTerrain[state.elementalTerrain.length - 1];
      if (root) root.ticksLeft = Math.max(1, Math.round(3 * duration));
    }
    if (e.hp > 0 && mods.stickyChance > 0 && (state.heldMines?.length ?? 0) < MAX_HELD_MINES && state.rng() < mods.stickyChance) {
      (state.heldMines ??= []).push({ id: state.nextId++, enemyId: e.id, x: e.x, y: e.y, timerMs: 1000, damage: round1(damage * 1.2), radius: 48 });
    }
    const chainChance = mods.electricChainBonus && p.move.type === 'electric' ? Math.min(0.9, mods.chainChance * 2) : mods.chainChance;
    if (chainChance > 0 && state.rng() < chainChance) {
      for (const other of heldNeighbors(state, e, 150, 2)) {
        hitEnemy(state, other, damage * 0.4, { x: e.x, y: e.y }, p.move, false, 0);
        state.fx.push({ kind: 'chain', x: other.x, y: other.y, r: 6, color: HELD_ITEM_BY_ID['bola-luz'].color, ageMs: 0, lifeMs: 260, fromX: e.x, fromY: e.y, toX: other.x, toY: other.y });
      }
    }
    if (critical && mods.critBounces > 0) {
      for (const other of heldNeighbors(state, e, 180, mods.critBounces)) {
        hitEnemy(state, other, damage * 0.6, { x: e.x, y: e.y }, p.move, false, 0);
        state.fx.push({ kind: 'chain', x: other.x, y: other.y, r: 4, color: HELD_ITEM_BY_ID['garra-afiada'].color, ageMs: 0, lifeMs: 200, fromX: e.x, fromY: e.y, toX: other.x, toY: other.y });
      }
    }
    if (mods.shards > 0) queueHeldShards(state, e, damage, from, mods.shards);
    if (mods.time > 0) maybeTimeBubble(state, e, damage, from, mods.time);
    if (mods.gravity > 0) maybeImpactWell(state, e, damage, mods.gravity);
    if (mods.destiny > 0) applyDestinyKnot(state, e, damage, mods.destiny, duration);
    // Faísca da cor de um dos itens em todo acerto: toda forma de ataque mostra que está carregando itens.
    if (state.fx.length < 160 && mods.ids.length > 0) {
      const pick = mods.ids[state.nextId % mods.ids.length]!;
      state.fx.push({ kind: 'held-hit', x: e.x, y: e.y, r: Math.max(8, e.radius), color: HELD_ITEM_BY_ID[pick].color, ageMs: 0, lifeMs: 260, count: Math.min(4, mods.ids.length) });
    }
  } finally {
    heldGuard--;
  }
}

/** Fragmento de Estrela: estilhaços saem do alvo para longe de onde veio o golpe, num leque. */
function queueHeldShards(state: SurvivorState, e: SurvivorEnemy, damage: number, from: { x: number; y: number }, count: number): void {
  const queue = heldShardQueues.get(state) ?? [];
  if (state.projectiles.length + queue.length + count > MAX_PROJECTILES_FOR_SHARDS) return;
  const p = state.player;
  const dx = e.x - from.x;
  const dy = e.y - from.y;
  const base = dx === 0 && dy === 0 ? state.rng() * Math.PI * 2 : Math.atan2(dy, dx);
  const speed = 300;
  for (let i = 0; i < count; i++) {
    const angle = base + (count === 1 ? 0 : (i / (count - 1) - 0.5) * 1.8);
    queue.push({
      id: state.nextId++, x: e.x, y: e.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      damage: round1(damage * 0.35), pierce: 0, lifeMs: 420, hit: [e.id], size: Math.max(3, p.projectileSize * 0.7), collisionRadius: 6,
      move: p.move, distanceFromPlayer: 0, noHeld: true,
      look: { tier: 0, piercing: false, critical: false, held: { colors: [HELD_ITEM_BY_ID['po-prateado'].color], spikes: false, crown: false, sparks: false, star: true, wings: false, heavy: 0 } },
    });
  }
  heldShardQueues.set(state, queue);
}

function flushHeldShards(state: SurvivorState): void {
  const queue = heldShardQueues.get(state);
  if (!queue || queue.length === 0) return;
  state.projectiles.push(...queue);
  heldShardQueues.set(state, []);
}

/** Farpas: seguem o inimigo em que grudaram e explodem em volta dele depois de 1 s. */
function stepHeldMines(state: SurvivorState, dtMs: number): void {
  const mines = state.heldMines;
  if (!mines || mines.length === 0) return;
  for (const mine of mines) {
    const host = state.enemies.find((e) => e.id === mine.enemyId && e.hp > 0);
    if (host) { mine.x = host.x; mine.y = host.y; }
    mine.timerMs -= dtMs;
  }
  const ready = mines.filter((mine) => mine.timerMs <= 0);
  state.heldMines = mines.filter((mine) => mine.timerMs > 0);
  if (ready.length === 0) return;
  heldGuard++;
  try {
    for (const mine of ready) {
      for (const e of state.enemies) {
        if (e.hp <= 0 || Math.hypot(e.x - mine.x, e.y - mine.y) > mine.radius + e.radius) continue;
        hitEnemy(state, e, mine.damage, { x: mine.x, y: mine.y }, state.player.move, false, 0);
      }
      state.fx.push({ kind: 'blast', x: mine.x, y: mine.y, r: mine.radius, color: HELD_ITEM_BY_ID['farpa-grudenta'].color, ageMs: 0, lifeMs: 320, moveType: 'grass' });
    }
  } finally {
    heldGuard--;
  }
}

/** Depois de cada ataque: a Garra Rápida pode atacar de novo na hora. */
function heldAfterAttack(state: SurvivorState): void {
  const p = state.player;
  const mods = p.heldMods;
  if (!mods) return;
  if (mods.recastChance > 0 && state.rng() < mods.recastChance) p.attackTimerMs = Math.min(p.attackTimerMs, 90);
}

function dropKey(state: SurvivorState, x: number, y: number): void {
  if (state.heldDisabled) return;
  (state.keyDrops ??= []).push({ id: state.nextId++, x: clamp(x, 20, ARENA_W - 20), y: clamp(y, 20, ARENA_H - 20) });
}


// ----------------------------------------------------------------------------- transformadores (Orbes e Laço do Destino)

const TIME_BUBBLE_LIFE_MS = 1400;
const MAX_TIME_BUBBLES = 10;
const PORTAL_OFFSET = 80;
const DESTINY_LINK_RANGE = 170;
const DESTINY_LINK_MS = 3000;

const portalFactor = (copies: number): number => 0.5 + 0.25 * Math.max(0, copies - 1);
const mirrorFactor = (copies: number): number => 0.6 + 0.2 * Math.max(0, copies - 1);

function unitFrom(ax: number, ay: number, bx: number, by: number, fallback: number): { x: number; y: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  return length > 0.001 ? { x: dx / length, y: dy / length } : { x: Math.cos(fallback), y: Math.sin(fallback) };
}

/** Acerto em área criado por um transformador: não dispara itens de novo. */
function heldAreaStrike(state: SurvivorState, x: number, y: number, radius: number, damage: number): number {
  let hits = 0;
  heldGuard++;
  try {
    for (const e of state.enemies) {
      if (e.hp <= 0 || Math.hypot(e.x - x, e.y - y) > radius + e.radius) continue;
      hitEnemy(state, e, damage, { x, y }, state.player.move, false, 0);
      hits++;
    }
  } finally {
    heldGuard--;
  }
  return hits;
}

/** Leque em qualquer ponto e direção (o cone do jogador só sai dele). */
function heldConeStrike(state: SurvivorState, x: number, y: number, angle: number, range: number, damage: number): number {
  let hits = 0;
  heldGuard++;
  try {
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > range + e.radius) continue;
      let diff = Math.atan2(e.y - y, e.x - x) - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > SURVIVOR_CONE_HALF_ANGLE + Math.atan2(e.radius, Math.max(1, d))) continue;
      hitEnemy(state, e, damage, { x, y }, state.player.move, false, 0);
      hits++;
    }
  } finally {
    heldGuard--;
  }
  return hits;
}

function heldLineStrike(state: SurvivorState, ax: number, ay: number, bx: number, by: number, halfWidth: number, damage: number): number {
  let hits = 0;
  heldGuard++;
  try {
    for (const e of state.enemies) {
      if (e.hp <= 0 || distanceToSegment(e.x, e.y, ax, ay, bx, by) > halfWidth + e.radius) continue;
      hitEnemy(state, e, damage, { x: ax, y: ay }, state.player.move, false, 0);
      hits++;
    }
  } finally {
    heldGuard--;
  }
  return hits;
}

function portalFx(state: SurvivorState, x: number, y: number, r = 26): void {
  state.fx.push({ kind: 'portal', x, y, r, color: HELD_ITEM_BY_ID['orbe-lustroso'].color, ageMs: 0, lifeMs: 520 });
}
function distortFx(state: SurvivorState, x: number, y: number, r: number): void {
  state.fx.push({ kind: 'distort', x, y, r, color: HELD_ITEM_BY_ID['orbe-grisea'].color, ageMs: 0, lifeMs: 420 });
}

/** Disparo extra de um transformador (gêmeo do portal ou espelho): mesmo tamanho e velocidade, sem disparar itens. */
function spawnHeldShot(state: SurvivorState, x: number, y: number, angle: number, damage: number, speedFactor = 1, trigger = false): void {
  // Teto de projéteis: portal, espelho, carga e estilhaços juntos nunca enchem a arena além disso.
  if (state.projectiles.length >= MAX_HELD_PROJECTILES) return;
  const p = state.player;
  const speed = p.projectileSpeed * speedFactor;
  state.projectiles.push({
    id: state.nextId++, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    damage: round1(damage), pierce: p.pierce, lifeMs: Math.max(900, Math.ceil((p.attackRange + 60) / Math.max(1, speed) * 1000)), hit: [],
    size: p.projectileSize, collisionRadius: 5 * (p.projectileHitRadiusFactor ?? 1), move: p.move, distanceFromPlayer: 0, ...(trigger ? {} : { noHeld: true }),
    look: survivorProjectileLook(p),
    ...(trigger ? heldHoming(p) : {}),
  });
}

/** Projétil, rajada e disparo do Foco: gêmeo saindo de um portal atrás do alvo e/ou cópia espelhada para trás. */
function heldShotCopies(state: SurvivorState, target: SurvivorEnemy, damage: number, speedFactor = 1): void {
  const mods = state.player.heldMods;
  if (!mods || (mods.portal <= 0 && mods.mirror <= 0)) return;
  const p = state.player;
  const angle = Math.atan2(target.y - p.y, target.x - p.x);
  if (mods.portal > 0) {
    const px = clamp(target.x + Math.cos(angle) * PORTAL_OFFSET, 10, ARENA_W - 10);
    const py = clamp(target.y + Math.sin(angle) * PORTAL_OFFSET, 10, ARENA_H - 10);
    spawnHeldShot(state, px, py, angle + Math.PI, damage * portalFactor(mods.portal), speedFactor);
    portalFx(state, px, py);
  }
  if (mods.mirror > 0) {
    spawnHeldShot(state, p.x, p.y, angle + Math.PI, damage * mirrorFactor(mods.mirror), speedFactor);
    distortFx(state, p.x, p.y, 20);
  }
}

/** Área: a explosão se repete num portal atrás do grupo e/ou no ponto espelhado do outro lado do Pokémon. */
function heldAreaCopies(state: SurvivorState, center: { x: number; y: number }, damage: number): void {
  const mods = state.player.heldMods;
  if (!mods || (mods.portal <= 0 && mods.mirror <= 0)) return;
  const p = state.player;
  const dir = unitFrom(p.x, p.y, center.x, center.y, survivorAimAngle(p));
  if (mods.portal > 0) {
    const px = clamp(center.x + dir.x * PORTAL_OFFSET * 1.1, 20, ARENA_W - 20);
    const py = clamp(center.y + dir.y * PORTAL_OFFSET * 1.1, 20, ARENA_H - 20);
    heldAreaStrike(state, px, py, p.attackRadius, damage * portalFactor(mods.portal));
    state.fx.push({ kind: 'blast', x: px, y: py, r: p.attackRadius, color: p.move.color, ageMs: 0, lifeMs: 420, moveType: p.move.type });
    portalFx(state, px, py, p.attackRadius * 0.7);
  }
  if (mods.mirror > 0) {
    const mx = clamp(2 * p.x - center.x, 20, ARENA_W - 20);
    const my = clamp(2 * p.y - center.y, 20, ARENA_H - 20);
    heldAreaStrike(state, mx, my, p.attackRadius, damage * mirrorFactor(mods.mirror));
    state.fx.push({ kind: 'blast', x: mx, y: my, r: p.attackRadius, color: p.move.color, ageMs: 0, lifeMs: 420, moveType: p.move.type });
    distortFx(state, mx, my, p.attackRadius);
  }
}

/** Aura: segunda aura num portal sobre o grupo mais denso e/ou anel distorcido do lado de fora. */
function heldAuraCopies(state: SurvivorState, radius: number, damage: number): void {
  const mods = state.player.heldMods;
  if (!mods || (mods.portal <= 0 && mods.mirror <= 0)) return;
  const p = state.player;
  if (mods.portal > 0) {
    let best: SurvivorEnemy | undefined;
    let bestCount = 0;
    for (const e of state.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (e.hp <= 0 || d <= radius || d > 340) continue;
      let count = 0;
      for (const o of state.enemies) if (o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= radius) count++;
      if (count > bestCount) { bestCount = count; best = e; }
    }
    if (best) {
      heldAreaStrike(state, best.x, best.y, radius, damage * portalFactor(mods.portal));
      state.fx.push({ kind: 'pulse', x: best.x, y: best.y, r: radius, color: p.move.color, ageMs: 0, lifeMs: 360, moveType: p.move.type });
      portalFx(state, best.x, best.y, radius * 0.6);
    }
  }
  if (mods.mirror > 0) {
    const outer = radius * (1.8 + 0.4 * Math.max(0, mods.mirror - 1));
    heldGuard++;
    try {
      for (const e of state.enemies) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (e.hp <= 0 || d <= radius + e.radius || d > outer + e.radius) continue;
        hitEnemy(state, e, damage * mirrorFactor(mods.mirror) * 0.85, p, p.move, false, d);
      }
    } finally {
      heldGuard--;
    }
    distortFx(state, p.x, p.y, outer);
  }
}

/** Cone: leque invertido saindo de um portal à frente e/ou leque espelhado para trás. */
function heldConeCopies(state: SurvivorState, range: number, damage: number): void {
  const mods = state.player.heldMods;
  if (!mods || (mods.portal <= 0 && mods.mirror <= 0)) return;
  const p = state.player;
  const aim = survivorAimAngle(p);
  if (mods.portal > 0) {
    const px = clamp(p.x + Math.cos(aim) * (range + 40), 10, ARENA_W - 10);
    const py = clamp(p.y + Math.sin(aim) * (range + 40), 10, ARENA_H - 10);
    heldConeStrike(state, px, py, aim + Math.PI, range * 0.75, damage * portalFactor(mods.portal));
    state.fx.push({ kind: 'cone', x: px, y: py, r: range * 0.75, color: p.move.color, ageMs: 0, lifeMs: 300, moveType: p.move.type, angle: aim + Math.PI, spread: SURVIVOR_CONE_HALF_ANGLE });
    portalFx(state, px, py);
  }
  if (mods.mirror > 0) {
    heldConeStrike(state, p.x, p.y, aim + Math.PI, range, damage * mirrorFactor(mods.mirror));
    state.fx.push({ kind: 'cone', x: p.x, y: p.y, r: range, color: p.move.color, ageMs: 0, lifeMs: 300, moveType: p.move.type, angle: aim + Math.PI, spread: SURVIVOR_CONE_HALF_ANGLE });
    distortFx(state, p.x, p.y, 24);
  }
}

/** Feixe carregado do Foco: segundo feixe em cruz saindo de um portal e/ou feixe espelhado para trás. */
function heldBeamCopies(state: SurvivorState, angle: number, length: number, halfWidth: number, damage: number, tier: number): void {
  const mods = state.player.heldMods;
  if (!mods || (mods.portal <= 0 && mods.mirror <= 0)) return;
  const p = state.player;
  if (mods.portal > 0) {
    const reach = Math.min(length, p.attackRange);
    const cx = p.x + Math.cos(angle) * reach;
    const cy = p.y + Math.sin(angle) * reach;
    const cross = angle + Math.PI / 2;
    const half = Math.min(length, p.attackRange * 1.5) / 2;
    const ax = cx - Math.cos(cross) * half;
    const ay = cy - Math.sin(cross) * half;
    const bx = cx + Math.cos(cross) * half;
    const by = cy + Math.sin(cross) * half;
    heldLineStrike(state, ax, ay, bx, by, halfWidth, damage * portalFactor(mods.portal));
    state.fx.push({ kind: 'beam', x: ax, y: ay, r: halfWidth, color: p.move.color, ageMs: 0, lifeMs: 520, moveType: p.move.type, angle: cross, fromX: ax, fromY: ay, toX: bx, toY: by, count: tier });
    portalFx(state, ax, ay);
    portalFx(state, bx, by);
  }
  if (mods.mirror > 0) {
    const back = angle + Math.PI;
    const bx = p.x + Math.cos(back) * length;
    const by = p.y + Math.sin(back) * length;
    heldLineStrike(state, p.x, p.y, bx, by, halfWidth, damage * mirrorFactor(mods.mirror));
    state.fx.push({ kind: 'beam', x: p.x, y: p.y, r: halfWidth, color: p.move.color, ageMs: 0, lifeMs: 520, moveType: p.move.type, angle: back, fromX: p.x, fromY: p.y, toX: bx, toY: by, count: tier });
    distortFx(state, p.x, p.y, 28);
  }
}

/** Teleporte: segundo impacto num portal além do pouso e/ou impacto espelhado do outro lado da partida. */
function heldTeleportCopies(state: SurvivorState, fromX: number, fromY: number, radius: number, damage: number): void {
  const mods = state.player.heldMods;
  if (!mods || (mods.portal <= 0 && mods.mirror <= 0)) return;
  const p = state.player;
  const dir = unitFrom(fromX, fromY, p.x, p.y, survivorAimAngle(p));
  if (mods.portal > 0) {
    const px = clamp(p.x + dir.x * PORTAL_OFFSET, 20, ARENA_W - 20);
    const py = clamp(p.y + dir.y * PORTAL_OFFSET, 20, ARENA_H - 20);
    heldAreaStrike(state, px, py, radius * 0.8, damage * portalFactor(mods.portal));
    state.fx.push({ kind: 'blast', x: px, y: py, r: radius * 0.8, color: p.move.color, ageMs: 0, lifeMs: 380, moveType: p.move.type });
    portalFx(state, px, py, radius * 0.6);
  }
  if (mods.mirror > 0) {
    const mx = clamp(2 * fromX - p.x, 20, ARENA_W - 20);
    const my = clamp(2 * fromY - p.y, 20, ARENA_H - 20);
    heldAreaStrike(state, mx, my, radius, damage * mirrorFactor(mods.mirror));
    state.fx.push({ kind: 'blast', x: mx, y: my, r: radius, color: p.move.color, ageMs: 0, lifeMs: 380, moveType: p.move.type });
    distortFx(state, mx, my, radius);
  }
}

/** Órbita: anel espelhado girando ao contrário e/ou um orbital que atravessa um portal até um inimigo longe. */
function heldOrbitCopies(state: SurvivorState, dtMs: number, damage: number, hitRadius: number, intervalMs: number): void {
  const mods = state.player.heldMods;
  if (!mods || (mods.portal <= 0 && mods.mirror <= 0)) return;
  const p = state.player;
  if (mods.mirror > 0) {
    const mirrored = mirrorOrbiters(p, mods.mirror);
    heldGuard++;
    try {
      for (const e of state.enemies) {
        if (e.hp <= 0 || (e.mirrorOrbitHitMs ?? 0) > 0) continue;
        const orbiter = mirrored.find((candidate) => Math.hypot(e.x - candidate.x, e.y - candidate.y) <= hitRadius + e.radius);
        if (!orbiter) continue;
        e.mirrorOrbitHitMs = intervalMs;
        hitEnemy(state, e, damage * mirrorFactor(mods.mirror), p, p.move, false, Math.hypot(e.x - p.x, e.y - p.y));
        state.fx.push({ kind: 'orbit-hit', x: e.x, y: e.y, r: Math.max(10, e.radius), color: HELD_ITEM_BY_ID['orbe-grisea'].color, ageMs: 0, lifeMs: 220, moveType: p.move.type });
      }
    } finally {
      heldGuard--;
    }
  }
  if (mods.portal > 0) {
    p.heldPortalOrbitMs = (p.heldPortalOrbitMs ?? 0) - dtMs;
    if (p.heldPortalOrbitMs <= 0) {
      p.heldPortalOrbitMs = Math.round(1100 / mods.portal);
      const ring = p.attackRadius * 1.2;
      const far = state.enemies
        .filter((e) => e.hp > 0)
        .map((e) => ({ e, d: Math.hypot(e.x - p.x, e.y - p.y) }))
        .filter((x) => x.d > ring && x.d <= 340)
        .sort((a, b) => a.d - b.d)[0]?.e;
      if (far) {
        heldAreaStrike(state, far.x, far.y, hitRadius * 1.6, damage * 1.2 * (1 + 0.25 * (mods.portal - 1)));
        state.fx.push({ kind: 'orbit-hit', x: far.x, y: far.y, r: hitRadius * 1.6, color: p.move.color, ageMs: 0, lifeMs: 300, moveType: p.move.type });
        portalFx(state, far.x, far.y);
      }
    }
  }
}

/** Trilha: faixa sombra ao lado (espelho) e portais que deixam terreno pulsante sob inimigos distantes. */
function heldTrailCopies(state: SurvivorState, dtMs: number, newPoint: { x: number; y: number } | null, previous: { x: number; y: number } | undefined, damage: number): void {
  const mods = state.player.heldMods;
  const p = state.player;
  if (mods && mods.mirror > 0) {
    p.trailMirrorPath ??= [];
    if (newPoint && previous) {
      const dir = unitFrom(previous.x, previous.y, newPoint.x, newPoint.y, 0);
      const offset = 56 * (1 + 0.2 * Math.max(0, mods.mirror - 1));
      p.trailMirrorPath.push({ x: clamp(newPoint.x - dir.y * offset, 0, ARENA_W), y: clamp(newPoint.y + dir.x * offset, 0, ARENA_H), bornMs: state.elapsedMs });
    }
    p.trailMirrorPath = p.trailMirrorPath.filter((point) => state.elapsedMs - point.bornMs < TRAIL_LIFE_MS);
  }
  if (mods && mods.portal > 0 && (p.trailActiveMs ?? 0) > 0) {
    p.heldPortalTrailMs = (p.heldPortalTrailMs ?? 0) - dtMs;
    if (p.heldPortalTrailMs <= 0) {
      p.heldPortalTrailMs = Math.round(700 / mods.portal);
      const candidates = state.enemies.filter((e) => e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) <= 320 && Math.hypot(e.x - p.x, e.y - p.y) > p.attackRadius * 2);
      const target = candidates[Math.floor(state.rng() * candidates.length)];
      if (target) {
        leaveElementalTerrain(state, target, damage * portalFactor(mods.portal) * 2, p.move);
        portalFx(state, target.x, target.y, 30);
      }
    }
  }
}

/** Orbe Adamante: bolha de tempo que congela quem está dentro e repete o acerto ao estourar. */
function maybeTimeBubble(state: SurvivorState, e: SurvivorEnemy, damage: number, from: { x: number; y: number }, copies: number): void {
  const p = state.player;
  const rule = timeBubbleRule(p.move.category, p.attackRadius, copies);
  if (state.elapsedMs - (p.heldBubbleAtMs ?? -Infinity) < rule.cooldownMs) return;
  const x = rule.atSource ? from.x : e.x;
  const y = rule.atSource ? from.y : e.y;
  const bubbles = (state.timeBubbles ??= []);
  if (bubbles.length >= MAX_TIME_BUBBLES) return;
  // Uma explosão acerta vários de uma vez: uma bolha só por centro.
  if (bubbles.some((b) => b.ageMs < 100 && Math.hypot(b.x - x, b.y - y) < 6)) return;
  p.heldBubbleAtMs = state.elapsedMs;
  bubbles.push({ id: state.nextId++, x, y, radius: rule.radius, ageMs: 0, lifeMs: TIME_BUBBLE_LIFE_MS, damage: round1(damage * 0.6), repeats: copies });
}

function stepTimeBubbles(state: SurvivorState, dtMs: number): void {
  const bubbles = state.timeBubbles;
  if (!bubbles || bubbles.length === 0) return;
  const popped: SurvivorTimeBubble[] = [];
  for (const bubble of bubbles) {
    bubble.ageMs += dtMs;
    const remaining = Math.max(0, bubble.lifeMs - bubble.ageMs);
    for (const e of state.enemies) {
      if (e.hp <= 0 || Math.hypot(e.x - bubble.x, e.y - bubble.y) > bubble.radius + e.radius) continue;
      // Chefões não param: só ficam bem mais lentos dentro da bolha.
      if (e.boss || e.grade === 'chefao') e.slowMs = Math.max(e.slowMs ?? 0, 300);
      else e.timeFrozenMs = Math.max(e.timeFrozenMs ?? 0, remaining);
    }
    if (bubble.ageMs >= bubble.lifeMs) popped.push(bubble);
  }
  if (popped.length === 0) return;
  state.timeBubbles = bubbles.filter((b) => !popped.includes(b));
  for (const bubble of popped) {
    for (let i = 0; i < bubble.repeats; i++) heldAreaStrike(state, bubble.x, bubble.y, bubble.radius, bubble.damage);
    state.fx.push({ kind: 'bubble-pop', x: bubble.x, y: bubble.y, r: bubble.radius, color: HELD_ITEM_BY_ID['orbe-adamante'].color, ageMs: 0, lifeMs: 420, count: bubble.repeats });
  }
}

/** Laço do Destino: liga o alvo aos vizinhos e espalha parte do dano pelos ligados. Roda dentro do `heldGuard`. */
function applyDestinyKnot(state: SurvivorState, e: SurvivorEnemy, damage: number, copies: number, duration: number): void {
  const p = state.player;
  const rule = destinyLinkRule(p.move.category, copies);
  if (e.linkId === undefined || (e.linkMs ?? 0) <= 0) {
    const partners = heldNeighbors(state, e, DESTINY_LINK_RANGE, 12).filter((o) => o.linkId === undefined || (o.linkMs ?? 0) <= 0).slice(0, rule.links);
    if (partners.length === 0) return;
    const linkId = state.nextId++;
    const linkMs = Math.round(DESTINY_LINK_MS * duration);
    for (const member of [e, ...partners]) { member.linkId = linkId; member.linkMs = linkMs; }
  }
  if (damage <= 0) return;
  for (const other of state.enemies) {
    if (other === e || other.hp <= 0 || other.linkId !== e.linkId || (other.linkMs ?? 0) <= 0) continue;
    hitEnemy(state, other, damage * rule.share, { x: e.x, y: e.y }, p.move, false, 0);
  }
}

const MAX_GRAVITY_WELLS = 8;
const MAX_HELD_PROJECTILES = 300;
const MAX_HELD_QUEUE = 24;

/** Bola de Ferro: poço de gravidade que puxa os inimigos para o centro e implode no fim. */
function createGravityWell(state: SurvivorState, x: number, y: number, radius: number, lifeMs: number, pull: number, damage: number): void {
  const wells = (state.gravityWells ??= []);
  if (wells.length >= MAX_GRAVITY_WELLS) return;
  if (wells.some((w) => w.ageMs < 100 && Math.hypot(w.x - x, w.y - y) < 6)) return;
  wells.push({ id: state.nextId++, x: clamp(x, 10, ARENA_W - 10), y: clamp(y, 10, ARENA_H - 10), radius, ageMs: 0, lifeMs, pull, damage: round1(damage) });
}

/** Puxa um inimigo em direção a um ponto (chefões resistem), sem passar do ponto. */
function pullEnemy(e: SurvivorEnemy, x: number, y: number, amount: number): void {
  if (amount <= 0) return;
  const resistance = e.boss || e.grade === 'chefao' ? 0.2 : e.trainerId !== undefined ? 0.5 : 1;
  const dx = x - e.x;
  const dy = y - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 2) return;
  const step = Math.min(d - 1, amount * resistance);
  e.x = clamp(e.x + dx / d * step, e.radius, ARENA_W - e.radius);
  e.y = clamp(e.y + dy / d * step, e.radius, ARENA_H - e.radius);
}

function stepGravityWells(state: SurvivorState, dt: number, dtMs: number): void {
  const wells = state.gravityWells;
  if (!wells || wells.length === 0) return;
  const done: SurvivorGravityWell[] = [];
  for (const well of wells) {
    well.ageMs += dtMs;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - well.x, e.y - well.y);
      if (d > well.radius + e.radius) continue;
      pullEnemy(e, well.x, well.y, well.pull * dt * (1.2 - 0.6 * d / Math.max(1, well.radius)));
    }
    if (well.ageMs >= well.lifeMs) done.push(well);
  }
  if (done.length === 0) return;
  state.gravityWells = wells.filter((w) => !done.includes(w));
  for (const well of done) {
    heldAreaStrike(state, well.x, well.y, well.radius * 0.45, well.damage);
    state.fx.push({ kind: 'implode', x: well.x, y: well.y, r: well.radius, color: HELD_ITEM_BY_ID['bola-ferro'].color, ageMs: 0, lifeMs: 380 });
  }
}

/** Gravidade contínua: aura que suga, órbita que prende e trilha que arrasta para cima dela. */
function stepGravityFields(state: SurvivorState, dt: number): void {
  const p = state.player;
  const copies = p.heldMods?.gravity ?? 0;
  if (copies <= 0) return;
  const strength = 1 + 0.3 * (copies - 1);
  const category = p.move.category;
  if (category === 'aura') {
    const reach = p.attackRadius * 2.2 * (1 + 0.2 * (copies - 1));
    for (const e of state.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (e.hp > 0 && d <= reach && d > p.attackRadius * 0.35) pullEnemy(e, p.x, p.y, 70 * strength * dt);
    }
  } else if (category === 'orbit') {
    const orbiters = survivorOrbiters(p);
    const reach = 70 * (1 + 0.2 * (copies - 1));
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      let best: { x: number; y: number } | undefined;
      let bestD = reach;
      for (const o of orbiters) {
        const d = Math.hypot(e.x - o.x, e.y - o.y);
        if (d < bestD) { bestD = d; best = o; }
      }
      if (best) pullEnemy(e, best.x, best.y, 60 * strength * dt);
    }
  } else if (category === 'trilha') {
    const path = p.trailPath ?? [];
    if (path.length === 0) return;
    const reach = 80 * (1 + 0.2 * (copies - 1));
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      let best: { x: number; y: number } | undefined;
      let bestD = reach;
      for (let i = 0; i < path.length; i += 3) {
        const point = path[i]!;
        const d = Math.hypot(e.x - point.x, e.y - point.y);
        if (d < bestD) { bestD = d; best = point; }
      }
      if (best) pullEnemy(e, best.x, best.y, 90 * strength * dt);
    }
  }
}

/** Ataques e golpes enfileirados pela Erva Poderosa (bombas que caem, leque duplo, feixes em série, saltos em cadeia). */
function queueHeldStrike(state: SurvivorState, strike: Omit<SurvivorHeldStrike, 'id'>): void {
  const queue = (state.heldQueue ??= []);
  if (queue.length >= MAX_HELD_QUEUE) return;
  queue.push({ id: state.nextId++, ...strike });
}

function stepHeldQueue(state: SurvivorState): void {
  const queue = state.heldQueue;
  if (!queue || queue.length === 0) return;
  const due = queue.filter((s) => s.atMs <= state.elapsedMs);
  if (due.length === 0) return;
  state.heldQueue = queue.filter((s) => s.atMs > state.elapsedMs);
  const p = state.player;
  for (const strike of due) {
    if (strike.kind === 'blast') {
      heldAreaStrike(state, strike.x, strike.y, strike.radius, strike.damage);
      state.fx.push({ kind: 'blast', x: strike.x, y: strike.y, r: strike.radius, color: p.move.color, ageMs: 0, lifeMs: 420, moveType: p.move.type });
    } else if (strike.kind === 'cone') {
      const aim = survivorAimAngle(p);
      heldConeStrike(state, p.x, p.y, aim, strike.radius, strike.damage);
      state.fx.push({ kind: 'cone', x: p.x, y: p.y, r: strike.radius, color: p.move.color, ageMs: 0, lifeMs: 320, moveType: p.move.type, angle: aim, spread: SURVIVOR_CONE_HALF_ANGLE });
    } else if (strike.kind === 'beam') {
      const [target] = nearestEnemies(state, strike.radius, 1);
      const angle = target ? Math.atan2(target.y - p.y, target.x - p.x) : survivorAimAngle(p);
      const toX = p.x + Math.cos(angle) * strike.radius;
      const toY = p.y + Math.sin(angle) * strike.radius;
      heldLineStrike(state, p.x, p.y, toX, toY, strike.width, strike.damage);
      state.fx.push({ kind: 'beam', x: p.x, y: p.y, r: strike.width, color: p.move.color, ageMs: 0, lifeMs: 420, moveType: p.move.type, angle, fromX: p.x, fromY: p.y, toX, toY, count: strike.tier });
    } else if (strike.kind === 'jump') {
      // Salto em cadeia: pousa no próximo inimigo perto e golpeia em volta, com proteção curta.
      const next = state.enemies
        .filter((e) => e.hp > 0)
        .map((e) => ({ e, d: Math.hypot(e.x - p.x, e.y - p.y) }))
        .filter((x) => x.d > 20 && x.d <= 260)
        .sort((a, b) => a.d - b.d)[0]?.e;
      if (!next) continue;
      const fromX = p.x;
      const fromY = p.y;
      p.x = clamp(next.x, PLAYER_RADIUS, ARENA_W - PLAYER_RADIUS);
      p.y = clamp(next.y, PLAYER_RADIUS, ARENA_H - PLAYER_RADIUS);
      p.invulnMs = Math.max(p.invulnMs, 250);
      heldAreaStrike(state, p.x, p.y, strike.radius, strike.damage);
      state.fx.push({ kind: 'rush', x: p.x, y: p.y, r: strike.radius, color: p.move.color, ageMs: 0, lifeMs: 360, moveType: p.move.type, fromX, fromY, toX: p.x, toY: p.y });
    }
  }
}

/**
 * Erva Poderosa na rajada e no projétil: os disparos ficam flutuando em volta do Pokémon e depois saem.
 * Rajada: em sequência, como metralhadora. Projétil: todos juntos, num leque.
 */
function chargeHeldShots(state: SurvivorState, count: number, damage: number, mode: 'gun' | 'volley', holdMs: number): void {
  const charges = (state.heldCharges ??= []);
  if (charges.length > 0) return;
  for (let i = 0; i < count; i++) {
    charges.push({ id: state.nextId++, slot: i, total: count, releaseAtMs: state.elapsedMs + holdMs + (mode === 'gun' ? i * 70 : 0), damage: round1(damage), mode });
  }
}

function stepHeldCharges(state: SurvivorState): void {
  const charges = state.heldCharges;
  if (!charges || charges.length === 0) return;
  const due = charges.filter((c) => c.releaseAtMs <= state.elapsedMs);
  if (due.length === 0) return;
  state.heldCharges = charges.filter((c) => c.releaseAtMs > state.elapsedMs);
  const p = state.player;
  const [target] = nearestEnemies(state, p.attackRange * 1.2, 1);
  const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : survivorAimAngle(p);
  for (const charge of due) {
    const pos = heldChargePosition(p, charge, state.elapsedMs);
    const spread = charge.mode === 'volley' && charge.total > 1 ? (charge.slot / (charge.total - 1) - 0.5) * 0.9 : (state.rng() - 0.5) * 0.12;
    spawnHeldShot(state, pos.x, pos.y, base + spread, charge.damage, 1.15, true);
  }
  if (target && state.heldCharges.length === 0) heldShotCopies(state, target, due[0]?.damage ?? 0);
}

/** Área, cone, feixe e teleporte com gravidade ou carga: chamados depois do golpe normal. */
function heldAreaExtras(state: SurvivorState, center: { x: number; y: number }, damage: number): void {
  const mods = state.player.heldMods;
  if (!mods) return;
  const p = state.player;
  if (mods.gravity > 0) {
    // O buraco negro: três vezes a área, puxa todo mundo para o centro e implode.
    createGravityWell(state, center.x, center.y, p.attackRadius * 3 * (1 + 0.25 * (mods.gravity - 1)), 900, 260 * (1 + 0.3 * (mods.gravity - 1)), damage);
  }
  if (mods.power > 0) {
    const drops = 3 + (mods.power - 1);
    for (let i = 0; i < drops; i++) {
      const a = state.rng() * Math.PI * 2;
      const r = state.rng() * p.attackRadius;
      queueHeldStrike(state, { kind: 'blast', atMs: state.elapsedMs + 180 * (i + 1), x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r, radius: p.attackRadius * 0.8, damage: damage * 0.6, width: 0, tier: 1 });
    }
  }
}

function heldConeExtras(state: SurvivorState, range: number, damage: number): void {
  const mods = state.player.heldMods;
  if (!mods) return;
  const p = state.player;
  const aim = survivorAimAngle(p);
  if (mods.gravity > 0) {
    // Vácuo: quem está no leque (um pouco além do alcance) é arrastado para a frente do Pokémon.
    const fx = p.x + Math.cos(aim) * 28;
    const fy = p.y + Math.sin(aim) * 28;
    const reach = range * 1.3;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > reach + e.radius) continue;
      let diff = Math.atan2(e.y - p.y, e.x - p.x) - aim;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) <= SURVIVOR_CONE_HALF_ANGLE * 1.15) pullEnemy(e, fx, fy, 45 * (1 + 0.3 * (mods.gravity - 1)));
    }
    state.fx.push({ kind: 'implode', x: fx, y: fy, r: range * 0.5, color: HELD_ITEM_BY_ID['bola-ferro'].color, ageMs: 0, lifeMs: 300 });
  }
  if (mods.power > 0) {
    for (let i = 0; i < mods.power; i++) queueHeldStrike(state, { kind: 'cone', atMs: state.elapsedMs + 200 * (i + 1), x: p.x, y: p.y, radius: range * 1.5, damage: damage * 0.8, width: 0, tier: 1 });
  }
}

function heldBeamExtras(state: SurvivorState, angle: number, length: number, halfWidth: number, damage: number, tier: number): void {
  const mods = state.player.heldMods;
  if (!mods) return;
  const p = state.player;
  if (mods.gravity > 0) {
    const reach = Math.min(length, p.attackRange * 1.4);
    createGravityWell(state, p.x + Math.cos(angle) * reach, p.y + Math.sin(angle) * reach, 140 * (1 + 0.25 * (mods.gravity - 1)), 700, 300, damage * 0.6);
  }
  if (mods.power > 0) {
    for (let i = 0; i < 2 * mods.power; i++) queueHeldStrike(state, { kind: 'beam', atMs: state.elapsedMs + 260 * (i + 1), x: p.x, y: p.y, radius: Math.min(length, p.attackRange * 2.2), damage: damage * 0.6, width: halfWidth, tier });
  }
}

function heldTeleportExtras(state: SurvivorState, radius: number, damage: number): void {
  const mods = state.player.heldMods;
  if (!mods) return;
  const p = state.player;
  if (mods.gravity > 0) createGravityWell(state, p.x, p.y, 200 * (1 + 0.25 * (mods.gravity - 1)), 600, 320, damage * 0.8);
  if (mods.power > 0) {
    for (let i = 0; i < 2 * mods.power; i++) queueHeldStrike(state, { kind: 'jump', atMs: state.elapsedMs + 240 * (i + 1), x: p.x, y: p.y, radius: radius * 0.8, damage: damage * 0.6, width: 0, tier: 1 });
  }
}

/** Aura com Erva Poderosa: a cada 3 pulsos, um estouro maior. */
function heldAuraExtras(state: SurvivorState, radius: number, damage: number): void {
  const mods = state.player.heldMods;
  if (!mods || mods.power <= 0) return;
  const p = state.player;
  p.heldPowerPulses = (p.heldPowerPulses ?? 0) + 1;
  if (p.heldPowerPulses < 3) return;
  p.heldPowerPulses = 0;
  const burst = radius * (1.8 + 0.3 * (mods.power - 1));
  heldAreaStrike(state, p.x, p.y, burst, damage * (2 + 0.5 * (mods.power - 1)));
  state.fx.push({ kind: 'pulse', x: p.x, y: p.y, r: burst, color: p.move.color, ageMs: 0, lifeMs: 460, moveType: p.move.type });
  state.fx.push({ kind: 'implode', x: p.x, y: p.y, r: burst, color: HELD_ITEM_BY_ID['erva-poderosa'].color, ageMs: 0, lifeMs: 320 });
}

/** Órbita com Erva Poderosa: os orbitais se soltam em disparo para fora de tempos em tempos (e voltam a girar). */
function heldOrbitExtras(state: SurvivorState, dtMs: number, damage: number): void {
  const mods = state.player.heldMods;
  if (!mods || mods.power <= 0) return;
  const p = state.player;
  p.heldPowerOrbitMs = (p.heldPowerOrbitMs ?? 1600) - dtMs;
  if (p.heldPowerOrbitMs > 0) return;
  p.heldPowerOrbitMs = Math.round(1600 / mods.power);
  if (!state.enemies.some((e) => e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) <= p.attackRange + p.attackRadius)) return;
  for (const orbiter of survivorOrbiters(p)) spawnHeldShot(state, orbiter.x, orbiter.y, orbiter.angle, damage * 1.5, 1, true);
}

/** Trilha com Erva Poderosa: quando a faixa acaba, ela explode inteira de uma vez. */
function heldTrailRelease(state: SurvivorState, damage: number): void {
  const mods = state.player.heldMods;
  if (!mods || mods.power <= 0) return;
  const p = state.player;
  const path = p.trailPath ?? [];
  if (path.length === 0) return;
  const step = Math.max(1, Math.ceil(path.length / (10 + 4 * (mods.power - 1))));
  for (let i = 0; i < path.length; i += step) {
    const point = path[i]!;
    queueHeldStrike(state, { kind: 'blast', atMs: state.elapsedMs + (i / step) * 40, x: point.x, y: point.y, radius: p.attackRadius * 1.4, damage: damage * (0.9 + 0.3 * (mods.power - 1)), width: 0, tier: 1 });
  }
}

/** Gravidade no golpe que acerta um alvo só (projétil, rajada, disparo do foco): mini buraco no impacto. */
function maybeImpactWell(state: SurvivorState, e: SurvivorEnemy, damage: number, copies: number): void {
  const p = state.player;
  const category = p.move.category;
  if (category !== 'projetil' && category !== 'rapido' && category !== 'foco') return;
  if (state.elapsedMs - (p.heldWellAtMs ?? -Infinity) < 250) return;
  p.heldWellAtMs = state.elapsedMs;
  createGravityWell(state, e.x, e.y, 80 * (1 + 0.25 * (copies - 1)), 450, 200, damage * 0.4);
}

/** Ponto de um baú novo; no BONK, nunca dentro de pedras e muretas (o jogador não alcançaria). */
function chestSpawnPoint(state: SurvivorState): { x: number; y: number } {
  const p = state.player;
  const obstacles = state.bonk ? createBonkObstacles(state.runSeed) : [];
  let point = { x: p.x, y: p.y };
  for (let attempt = 0; attempt < 10; attempt++) {
    const angle = state.rng() * Math.PI * 2;
    const distance = 260 + state.rng() * 160;
    point = { x: clamp(p.x + Math.cos(angle) * distance, 60, ARENA_W - 60), y: clamp(p.y + Math.sin(angle) * distance, 60, ARENA_H - 60) };
    const blocked = obstacles.some((o) => o.kind !== 'bridge' && point.x >= o.x - 30 && point.x <= o.x + o.w + 30 && point.y >= o.y - 30 && point.y <= o.y + o.h + 30);
    if (!blocked) break;
  }
  return point;
}

/** Baús surgem com o tempo; chaves são coletadas como orbes; encostar num baú com chave abre a escolha de itens. */
function stepChests(state: SurvivorState, events: SurvivorEvent[]): void {
  if (state.debugLaboratory || state.over || state.heldDisabled) return;
  const p = state.player;
  state.chests ??= [];
  state.keyDrops ??= [];
  state.keys ??= 0;
  state.nextChestAtMs ??= survivorMilestoneMs(CHEST_FIRST_MS, state.fast);
  if (state.elapsedMs >= state.nextChestAtMs) {
    state.nextChestAtMs += survivorMilestoneMs(CHEST_EVERY_MS, state.fast);
    // Campo cheio: o baú mais distante dá lugar ao novo, para dois baús esquecidos não encerrarem a oferta da corrida.
    if (state.chests.length >= MAX_CHESTS_ON_FIELD) {
      const farthest = state.chests.reduce((a, b) => (Math.hypot(b.x - p.x, b.y - p.y) > Math.hypot(a.x - p.x, a.y - p.y) ? b : a));
      state.chests = state.chests.filter((chest) => chest !== farthest);
    }
    state.chests.push({ id: state.nextId++, ...chestSpawnPoint(state) });
    events.push({ type: 'chestSpawn' });
  }
  const reach = Math.min(MAGNET_PICKUP_RADIUS_CAP, effectivePickupRadius(p) * (p.artifactMagnetMs > 0 ? 1.7 : 1));
  if (state.keyDrops.length > 0) {
    state.keyDrops = state.keyDrops.filter((key) => {
      if (Math.hypot(key.x - p.x, key.y - p.y) > reach) return true;
      state.keys = (state.keys ?? 0) + 1;
      events.push({ type: 'keyPicked', keys: state.keys });
      return false;
    });
  }
  if (state.pendingUpgrade) return;
  for (const chest of state.chests) {
    if (Math.hypot(chest.x - p.x, chest.y - p.y) > CHEST_OPEN_REACH) continue;
    if (state.keys <= 0) {
      if (!chest.lockedNotified) { chest.lockedNotified = true; events.push({ type: 'chestLocked' }); }
      continue;
    }
    openChest(state, chest, events);
    break;
  }
}

function openChest(state: SurvivorState, chest: SurvivorChest, events: SurvivorEvent[]): void {
  const p = state.player;
  const offer = rollHeldOffer(state.rng, p.held ?? {}, 2, p.move.category);
  if (offer.length === 0) {
    // Todos os itens que servem para o seu golpe já estão no teto: o baú vira orbes e a chave fica com você.
    state.chests = (state.chests ?? []).filter((c) => c !== chest);
    for (let index = 0; index < 6; index++) {
      const angle = (Math.PI * 2 * index) / 6;
      state.orbs.push({ id: state.nextId++, x: chest.x + Math.cos(angle) * 24, y: chest.y + Math.sin(angle) * 24, value: 10, doubleXp: false });
    }
    state.fx.push({ kind: 'chest', x: chest.x, y: chest.y, r: 46, color: '#ffd84a', ageMs: 0, lifeMs: 700 });
    events.push({ type: 'chestEmpty' });
    return;
  }
  state.keys = Math.max(0, (state.keys ?? 0) - 1);
  state.chests = (state.chests ?? []).filter((c) => c !== chest);
  state.fx.push({ kind: 'chest', x: chest.x, y: chest.y, r: 46, color: '#ffd84a', ageMs: 0, lifeMs: 700 });
  state.pendingUpgrade = offer.map((id) => {
    const item = HELD_ITEM_BY_ID[id];
    return { id: `${HELD_OFFER_PREFIX}${id}`, name: item.name, icon: item.icon, rarity: item.rarity, family: 'item' as const, description: heldItemText(id, p.move.category, p.held?.[id] ?? 0) };
  });
  events.push({ type: 'chestOpened', keys: state.keys });
}

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

/**
 * Acima de 2 ataques por segundo, cada golpe perde dano de forma contínua (expoente 0,7): o dano por segundo continua
 * subindo com a cadência, só com retornos decrescentes, e uma carta de recarga nunca piora o golpe.
 * A Rajada (três tiros por ciclo) e o Teleporte (golpe de hold) ficam fora deste corte (ver `hitEnemy`).
 */
export function survivorRapidAttackDamageMultiplier(player: Pick<SurvivorPlayer, 'attackCooldownMs'>): number {
  const attacksPerSecond = 1000 / Math.max(1, player.attackCooldownMs);
  return attacksPerSecond <= 2 ? 1 : Math.pow(2 / attacksPerSecond, 0.7);
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
      leaveElementalTerrain(state, e, damage, state.player.move);
      break;
    case 'empurrar':
      applyKnockback(e, from, e.boss ? 1.5 : 5);
      break;
    case 'roubar':
      healSurvivor(state.player, 1);
      break;
    case 'atravessar':
      // O tipo já foi escolhido como afinidade; atravessar não precisa de estado no inimigo.
      break;
    default:
      break;
  }
}

/** Aplica a propriedade tabelada do segundo tipo hipotético, depois que ele desperta aos nove minutos. */
function applyHypotheticalTypeEffect(state: SurvivorState, e: SurvivorEnemy, damage: number, from: { x: number; y: number }): void {
  if (!state.hypotheticalSecondaryActive) return;
  const rule = hypotheticalTypeRuleFor(state.player.move.type, state.hypotheticalSecondaryType);
  switch (rule.effect) {
    case 'queimar':
      e.burnMs = Math.max(e.burnMs ?? 0, 1600);
      e.burnDps = Math.max(e.burnDps ?? 0, round1(damage * 0.16));
      break;
    case 'lentidao': e.slowMs = Math.max(e.slowMs ?? 0, 700); break;
    case 'atordoar': leaveElementalTerrain(state, e, damage, state.player.move); break;
    case 'empurrar': applyKnockback(e, from, e.boss ? 2 : 6); break;
    case 'roubar': healSurvivor(state.player, 1); break;
    case 'semente': e.seededMs = Math.max(e.seededMs ?? 0, 1500); break;
    case 'saltar': {
      const target = state.enemies.find((other) => other !== e && other.hp > 0 && Math.hypot(other.x - e.x, other.y - e.y) <= 130);
      if (target) { target.hp -= damage * 0.3; target.hitFlashMs = 90; }
      break;
    }
    case 'atravessar':
    case 'precisao':
      break;
  }
}

/** Dano de um golpe num inimigo, com o efeito do tipo. `from` é de onde o golpe veio (para empurrar). */
function hitEnemy(state: SurvivorState, e: SurvivorEnemy, damage: number, from: { x: number; y: number }, attackMove = state.player.move, allowFollowUp = true, distanceFromPlayer = Math.hypot(e.x - state.player.x, e.y - state.player.y)): void {
  const move = attackMove;
  const p = state.player;
  const wasSeeded = (e.seededMs ?? 0) > 0;
  const synergy = survivorSynergyFor(move.type, e);
  const hypotheticalRule = move === p.move && state.hypotheticalSecondaryActive ? hypotheticalTypeRuleFor(move.type, state.hypotheticalSecondaryType) : null;
  let upgradeMultiplier = 1;
  // Caçador de ameaças entra depois de todos os outros modificadores de dano.
  // Isso mantém a carta explicitamente multiplicativa, inclusive sobre sinergias e terreno.
  let finalThreatHunterMultiplier = 1;
  if (hypotheticalRule) upgradeMultiplier *= 1 + hypotheticalRule.damageBonus;
  if (move === p.move) {
    const openingStrike = p.upgradeLevels['opening-strike'] ?? 0;
    const lastStand = p.upgradeLevels['last-stand'] ?? 0;
    const closeQuarters = p.upgradeLevels['close-quarters'] ?? 0;
    const longShot = p.upgradeLevels['long-shot'] ?? 0;
    if (openingStrike > 0 && e.hp >= e.maxHp) upgradeMultiplier *= 1 + openingStrike * 0.36;
    if (lastStand > 0 && p.hp <= p.maxHp * 0.3) upgradeMultiplier *= 1 + lastStand * 0.44;
    const upgradeDistance = Math.hypot(e.x - p.x, e.y - p.y);
    if (closeQuarters > 0 && upgradeDistance <= BALANCE.defaultAttackDistance) upgradeMultiplier *= 1 + closeQuarters * 0.24;
    if (longShot > 0 && upgradeDistance > BALANCE.defaultAttackDistance) upgradeMultiplier *= 1 + longShot * 0.24;
    const threatHunter = p.upgradeLevels['threat-hunter'] ?? 0;
    if (threatHunter > 0 && (e.boss || e.trainerId !== undefined)) finalThreatHunterMultiplier = 1 + threatHunter * 0.2;
    if (move.type === 'fire' && hasUpgrade(p, 'fire-combustion') && (e.burnMs ?? 0) > 0) upgradeMultiplier *= 1.24;
    if (move.type === 'electric' && hasUpgrade(p, 'electric-arc') && ((e.wetMs ?? 0) > 0 || (e.stunMs ?? 0) > 0)) upgradeMultiplier *= 1.2;
    if (move.type === 'ice' && hasUpgrade(p, 'ice-shatter') && (e.stunMs ?? 0) > 0) upgradeMultiplier *= 1.3;
    if (move.type === 'ground' && hasUpgrade(p, 'ground-aftershock') && (e.stunMs ?? 0) > 0) upgradeMultiplier *= 1.3;
    if (move.type === 'dragon' && hasUpgrade(p, 'dragon-pressure') && e.boss) upgradeMultiplier *= 1.3;
    if (move.type === 'dark' && hasUpgrade(p, 'dark-predation') && e.hp <= e.maxHp * 0.5) upgradeMultiplier *= 1.24;
  }
  const baseChance = Math.max(0, Math.min(1, p.critChance ?? 0.05));
  const chance = Math.min(Math.max(0.4, baseChance), baseChance + (e.hp <= e.maxHp * 0.3 ? (p.upgradeLevels['crit-finish'] ?? 0) * 0.05 : 0));
  const critical = move === p.move && chance > 0 && state.critRng() < chance;
  if (critical) upgradeMultiplier *= 2 + (p.upgradeLevels['crit-power'] ?? 0) * 0.25;
  const heldActive = move === p.move && heldGuard === 0 && p.heldMods !== undefined;
  if (heldActive) upgradeMultiplier *= heldDamageFactor(state, e);
  const environmentalDamage = damage * survivorDirectDamageMultiplier(distanceFromPlayer) * (p.move.category === 'rapido' || p.move.category === 'teleporte' ? 1 : survivorRapidAttackDamageMultiplier(p)) * upgradeMultiplier
    * (synergy?.damageMultiplier ?? 1)
    * survivorBiomeDamageMultiplier(state.elapsedMs, from.x, from.y, move.type);
  const reducedDamage = e.protectedMs && e.protectedMs > 0 ? environmentalDamage * 0.75 : environmentalDamage;
  const finalDamage = reducedDamage * finalThreatHunterMultiplier;
  if (critical && state.criticalHits.length < 64) state.criticalHits.push({ enemyId: e.id, x: e.x, y: e.y, damage: finalDamage, boss: e.boss || e.grade === 'chefao' || e.shadowBoss === true });
  const hpBefore = Math.max(0, e.hp);
  e.hp -= finalDamage;
  e.hitFlashMs = 90;
  if (state.runStats) recordDamage(state.runStats, move.name, move.color, Math.min(hpBefore, finalDamage));
  if (synergy?.consume) e[synergy.consume] = 0;
  if (synergy?.refreshSlowMs) e.slowMs = Math.max(e.slowMs ?? 0, synergy.refreshSlowMs);
  Object.assign(e, survivorElementalStatus(move.type));
  if (move === p.move) {
    const slowField = p.upgradeLevels['slow-field'] ?? 0;
    if (slowField > 0) e.slowMs = Math.max(e.slowMs ?? 0, slowField * 250);
  }
  if (move === p.move && move.type === 'grass' && hasUpgrade(p, 'grass-roots') && wasSeeded) {
    applyStun(e, e.boss ? 100 : 250);
  }
  switch (move.effect) {
    case 'queimar':
      e.burnMs = EFFECT_MS.burn;
      e.burnDps = Math.max(e.burnDps ?? 0, round1(finalDamage * (move === p.move && (move.type === 'fire' && hasUpgrade(p, 'fire-brasa') || move.type === 'poison' && hasUpgrade(p, 'poison-dose')) ? 0.525 : 0.35)));
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
      leaveElementalTerrain(state, e, finalDamage, move);
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
  if (hypotheticalRule) applyHypotheticalTypeEffect(state, e, environmentalDamage, from);
  // Inseto e Fantasma atacam em dupla: um único eco visual e de dano por impacto, sem efeitos, cura ou recursão.
  if (allowFollowUp && (move.type === 'bug' || move.type === 'ghost') && e.hp > 0) {
    const enhancedEcho = move === p.move && ((move.type === 'bug' && hasUpgrade(p, 'bug-formation')) || (move.type === 'ghost' && hasUpgrade(p, 'ghost-haunt')));
    const echoDamage = finalDamage * (enhancedEcho ? 0.3 : 0.2);
    e.hp -= echoDamage;
    state.fx.push({ kind: 'echo', x: e.x, y: e.y, r: Math.max(10, e.radius * 1.8), color: move.color, ageMs: 0, lifeMs: 220 });
    state.fx.push({
      kind: 'follow-up', x: e.x, y: e.y, r: Math.max(8, e.radius * 0.75), color: move.color, ageMs: 0, lifeMs: 480,
      element: move.type, fromX: p.x, fromY: p.y, toX: e.x, toY: e.y, delayMs: 85, count: move.type === 'bug' ? 4 : 3,
    });
  }
  if (heldActive) applyHeldOnHit(state, e, finalDamage, from, critical);
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
  healSurvivor(p, Math.min(strongerDrain ? 3 : 2, hits));
}

const TRAIL_DISTANCE_TO_CHARGE = 150 * 15;
const TRAIL_DRAW_MS = 4000;
const TRAIL_LIFE_MS = 3500;
const TRAIL_POINT_SPACING = 12;
const TRAIL_TICK_MS = 420;
/** Enquanto a Trilha esta sendo desenhada, o jogador anda 25% mais rapido (ate acabar e voltar a carregar). */
const TRAIL_SPEED_MULTIPLIER = 1.25;

/** Atualiza a faixa da Trilha; inimigos em contato recebem pulsos conforme a cadência. */
function stepTrail(state: SurvivorState, movedPx: number, dtMs: number, activate: boolean): void {
  const p = state.player;
  if (p.move.category !== 'trilha') return;
  p.trailPath ??= [];
  p.trailCharge ??= 0;
  p.trailActiveMs ??= 0;
  if (p.trailActiveMs <= 0) {
    const bonus = 1 + 0.2 * (p.upgradeLevels['trail-charge-distance'] ?? 0);
    p.trailCharge = Math.min(1, p.trailCharge + movedPx * bonus / TRAIL_DISTANCE_TO_CHARGE);
    if (activate && p.trailCharge >= 1) { p.trailCharge = 0; p.trailActiveMs = TRAIL_DRAW_MS; }
  }
  p.trailPath = p.trailPath.filter((point) => state.elapsedMs - point.bornMs < TRAIL_LIFE_MS);
  const damage = artifactDamage(state) * 0.9 / BASIC_ATTACK_DAMAGE_FACTOR;
  let newPoint: { x: number; y: number } | null = null;
  let previousPoint: { x: number; y: number } | undefined;
  if (p.trailActiveMs > 0) {
    p.trailActiveMs = Math.max(0, p.trailActiveMs - dtMs);
    const last = p.trailPath[p.trailPath.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) >= TRAIL_POINT_SPACING) {
      previousPoint = last;
      newPoint = { x: p.x, y: p.y };
      p.trailPath.push({ x: p.x, y: p.y, bornMs: state.elapsedMs });
    }
    // Erva Poderosa: a faixa explode inteira quando termina de ser desenhada.
    if (p.trailActiveMs === 0) heldTrailRelease(state, damage);
  }
  heldTrailCopies(state, dtMs, newPoint, previousPoint, damage);
  const mirrorPath = p.trailMirrorPath ?? [];
  const tickMs = Math.max(160, TRAIL_TICK_MS * (p.trailCadenceFactor ?? 1) * (p.artifactFocusMs > 0 ? 0.8 : 1));
  let hits = 0;
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const touching = p.trailPath.some((point) => Math.hypot(e.x - point.x, e.y - point.y) <= p.attackRadius + e.radius)
      || mirrorPath.some((point) => Math.hypot(e.x - point.x, e.y - point.y) <= p.attackRadius + e.radius);
    if (!touching || state.elapsedMs < (e.trailNextHitMs ?? 0)) continue;
    e.trailNextHitMs = state.elapsedMs + tickMs;
    hitEnemy(state, e, damage, { x: e.x, y: e.y }, p.move, true, 0);
    hits++;
  }
  drain(state, hits, p.move);
}

/** Os `count` inimigos mais próximos dentro de `range`, do mais perto ao mais longe. */
function nearestEnemies(state: SurvivorState, range: number, count: number, countBody = false): SurvivorEnemy[] {
  const p = state.player;
  const priority = p.targetPriority;
  return state.enemies
    .map((e) => ({ e, d: Math.hypot(e.x - p.x, e.y - p.y) }))
    .filter((x) => x.d <= range + (countBody ? x.e.radius : 0))
    .sort((a, b) => {
      if (priority === 'boss') {
        const aBoss = a.e.boss || a.e.grade === 'chefao' || a.e.trainerId !== undefined;
        const bBoss = b.e.boss || b.e.grade === 'chefao' || b.e.trainerId !== undefined;
        if (aBoss !== bBoss) return aBoss ? -1 : 1;
      } else if (priority === 'healer') {
        const aHealer = a.e.archetype === 'suporte' && (a.e.supportRole ?? 'cura') === 'cura';
        const bHealer = b.e.archetype === 'suporte' && (b.e.supportRole ?? 'cura') === 'cura';
        if (aHealer !== bHealer) return aHealer ? -1 : 1;
      } else if (priority === 'lowest-hp') {
        const hp = a.e.hp / Math.max(1, a.e.maxHp) - b.e.hp / Math.max(1, b.e.maxHp);
        if (hp !== 0) return hp;
      }
      return a.d - b.d;
    })
    .slice(0, count)
    .map((x) => x.e);
}

/**
 * Vira o cone para o inimigo mais próximo, como os outros golpes escolhem o alvo. O corpo conta no alcance, igual ao
 * acerto (`inSurvivorCone`): um chefão grande com o centro fora do alcance ainda é alvo. Sem alvo, a frente não muda.
 */
function aimConeAtNearest(state: SurvivorState, range: number): SurvivorEnemy | undefined {
  const p = state.player;
  const [target] = nearestEnemies(state, range, 1, true);
  if (target) p.aimAngle = Math.atan2(target.y - p.y, target.x - p.x);
  return target;
}

function fireProjectiles(state: SurvivorState, target: SurvivorEnemy): void {
  const p = state.player;
  // Erva Poderosa: os disparos ficam flutuando em volta e saem todos juntos.
  if ((p.heldMods?.power ?? 0) > 0) {
    chargeHeldShots(state, p.shots + 2 + 2 * ((p.heldMods?.power ?? 1) - 1), artifactDamage(state), 'volley', 380);
    return;
  }
  const move = p.move;
  const baseAngle = Math.atan2(target.y - p.y, target.x - p.x);
  const spread = 0.26;
  const look = survivorProjectileLook(p);
  const hypotheticalPierce = state.hypotheticalSecondaryActive && hypotheticalTypeRuleFor(move.type, state.hypotheticalSecondaryType).effect === 'atravessar' ? 1 : 0;
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
      pierce: p.pierce + (move.effect === 'atravessar' ? 1 : 0) + hypotheticalPierce,
      lifeMs: Math.max(1600, Math.ceil((p.attackRange + 30) / Math.max(1, p.projectileSpeed) * 1000) + 50),
      hit: [],
      canChain: move.effect === 'saltar',
      size: p.projectileSize, collisionRadius: 5 * (p.projectileHitRadiusFactor ?? 1),
      move,
      distanceFromPlayer: Math.hypot(target.x - p.x, target.y - p.y),
      look,
      ...heldHoming(p),
    });
  }
  heldShotCopies(state, target, artifactDamage(state));
}

/** Um dos três tiros da Rajada. A onda inteira preserva o DPS anterior, em vez de triplicá-lo. */
function fireRapidShot(state: SurvivorState, target: SurvivorEnemy): void {
  const p = state.player;
  const baseAngle = Math.atan2(target.y - p.y, target.x - p.x);
  const look = survivorProjectileLook(p);
  // `shots` é a largura da salva: cada um dos três instantes lança o leque inteiro.
  for (let i = 0; i < p.shots; i++) {
    const angle = baseAngle + (p.shots === 1 ? 0 : (i - (p.shots - 1) / 2) * RAPID_BURST_SPREAD);
    state.projectiles.push({
      id: state.nextId++, x: p.x, y: p.y,
      vx: Math.cos(angle) * p.projectileSpeed, vy: Math.sin(angle) * p.projectileSpeed,
      damage: artifactDamage(state) * 0.62,
      pierce: p.pierce + (p.move.effect === 'atravessar' ? 1 : 0), lifeMs: Math.max(1600, Math.ceil((p.attackRange + 30) / Math.max(1, p.projectileSpeed) * 1000) + 50), hit: [],
      canChain: p.move.effect === 'saltar', size: p.projectileSize, collisionRadius: 5 * (p.projectileHitRadiusFactor ?? 1), move: p.move,
      distanceFromPlayer: Math.hypot(target.x - p.x, target.y - p.y), look,
      ...heldHoming(p),
    });
  }
  heldShotCopies(state, target, artifactDamage(state) * 0.62);
}

/** Foco: um disparo largo e lento em linha reta, que atravessa alguns inimigos. */
function fireFocusShot(state: SurvivorState, target: SurvivorEnemy): void {
  const p = state.player;
  const move = p.move;
  const angle = Math.atan2(target.y - p.y, target.x - p.x);
  const speed = p.projectileSpeed * FOCUS_SHOT_SPEED_MULTIPLIER;
  state.projectiles.push({
    id: state.nextId++,
    x: p.x,
    y: p.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage: artifactDamage(state),
    pierce: FOCUS_SHOT_PIERCE + p.pierce + (move.effect === 'atravessar' ? 1 : 0),
    lifeMs: Math.round(1000 * p.attackRange * 1.4 / Math.max(1, speed)),
    hit: [],
    size: round1(p.projectileSize * FOCUS_SHOT_SIZE_MULTIPLIER),
    move,
    distanceFromPlayer: Math.hypot(target.x - p.x, target.y - p.y),
    look: survivorProjectileLook(p),
    ...heldHoming(p),
  });
  heldShotCopies(state, target, artifactDamage(state), FOCUS_SHOT_SPEED_MULTIPLIER);
}

/** Foco: o feixe solto pela carga. Atravessa todo inimigo na linha; cheio, cruza a arena. */
function fireFocusBeam(state: SurvivorState, level: number): string {
  const p = state.player;
  const beam = focusBeam(level, p.attackRange);
  beam.halfWidth *= p.focusBeamWidthFactor ?? 1;
  const [target] = nearestEnemies(state, beam.length, 1);
  const angle = target ? Math.atan2(target.y - p.y, target.x - p.x) : survivorAimAngle(p);
  const toX = p.x + Math.cos(angle) * beam.length;
  const toY = p.y + Math.sin(angle) * beam.length;
  const damage = artifactDamage(state) * beam.damageMultiplier / BASIC_ATTACK_DAMAGE_FACTOR;
  let hits = 0;
  for (const e of state.enemies) {
    if (e.hp <= 0 || distanceToSegment(e.x, e.y, p.x, p.y, toX, toY) > beam.halfWidth + e.radius) continue;
    // O feixe não perde força com a distância: o falloff é calculado como se o alvo estivesse colado.
    hitEnemy(state, e, damage, p, p.move, true, 0);
    if (beam.stunMs > 0) e.stunMs = Math.max(e.stunMs ?? 0, beam.stunMs);
    if (beam.slowMs > 0) e.slowMs = Math.max(e.slowMs ?? 0, beam.slowMs);
    hits++;
  }
  drain(state, hits, p.move);
  state.fx.push({ kind: 'beam', x: p.x, y: p.y, r: beam.halfWidth, color: p.move.color, ageMs: 0, lifeMs: beam.tier === 3 ? 700 : 420, moveType: p.move.type, angle, fromX: p.x, fromY: p.y, toX, toY, count: beam.tier });
  heldBeamCopies(state, angle, beam.length, beam.halfWidth, damage, beam.tier);
  heldBeamExtras(state, angle, beam.length, beam.halfWidth, damage, beam.tier);
  return beam.name;
}

/** Teleporte: busca o alvo priorizado (ou o mais próximo), pousa nele e ganha proteção curta. */
function releaseTeleport(state: SurvivorState, action: Extract<NonNullable<ReturnType<typeof stepChargeMeter>>, { kind: 'teleport-release' }>): boolean {
  const p = state.player;
  const fromX = p.x;
  const fromY = p.y;
  const reach = teleportReach(p.attackRange, p.attackRadius, p.shots);
  const target = nearestEnemies(state, reach.range, 1)[0];
  const angle = target ? Math.atan2(target.y - p.y, target.x - p.x) : survivorAimAngle(p);
  const chargedDistance = reach.range * (0.45 + 0.55 * action.level);
  const distance = target ? Math.min(chargedDistance, Math.hypot(target.x - p.x, target.y - p.y)) : chargedDistance;
  p.x = clamp(p.x + Math.cos(angle) * distance, PLAYER_RADIUS, ARENA_W - PLAYER_RADIUS);
  p.y = clamp(p.y + Math.sin(angle) * distance, PLAYER_RADIUS, ARENA_H - PLAYER_RADIUS);
  if (Math.abs(Math.cos(angle)) > 0.01) p.facing = Math.cos(angle) < 0 ? -1 : 1;
  p.aimAngle = angle;
  const damage = artifactDamage(state) * action.damageMultiplier / BASIC_ATTACK_DAMAGE_FACTOR;
  let hits = 0;
  for (const e of state.enemies) {
    if (e.hp <= 0 || Math.hypot(e.x - p.x, e.y - p.y) > reach.hitRadius + e.radius) continue;
    hitEnemy(state, e, damage, { x: p.x, y: p.y }, p.move, true, 0);
    hits++;
  }
  drain(state, hits, p.move);
  p.invulnMs = Math.max(p.invulnMs, action.invulnMs);
  if (action.wave) {
    for (const e of state.enemies) {
      if (e.hp <= 0 || Math.hypot(e.x - p.x, e.y - p.y) > reach.waveRadius + e.radius) continue;
      const resistance = e.boss ? 0.25 : e.trainerId !== undefined ? 0.5 : 1;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const length = Math.hypot(dx, dy) || 1;
      e.x = clamp(e.x + dx / length * 180 * resistance, e.radius, ARENA_W - e.radius);
      e.y = clamp(e.y + dy / length * 180 * resistance, e.radius, ARENA_H - e.radius);
    }
  }
  state.fx.push({ kind: 'rush', x: p.x, y: p.y, r: action.wave ? reach.waveRadius : reach.hitRadius, color: p.move.color, ageMs: 0, lifeMs: action.wave ? 520 : 380, moveType: p.move.type, fromX, fromY, toX: p.x, toY: p.y, ...(action.wave ? { count: 2 } : {}) });
  heldTeleportCopies(state, fromX, fromY, reach.hitRadius, damage);
  heldTeleportExtras(state, reach.hitRadius, damage);
  return true;
}

function chargeStyleOf(state: SurvivorState): ChargeStyle | null {
  const category = state.player.move.category;
  return category === 'foco' || category === 'teleporte' ? category : null;
}

/**
 * Ataque de um apoio: nasce sempre no jogador e usa o perfil congelado do Pokémon escolhido.
 * Apoios não seguram botão, então os golpes de carga têm política própria e fixa:
 * Foco e Rajada soltam um único projétil por ciclo (a Rajada, com o dano de um tiro cheio e sem a salva de três);
 * o Foco ainda carrega sozinho e solta o feixe cheio (`stepSupportFocus`), e a Trilha não passa por aqui
 * (`stepSupportTrail`). Teleporte não chega a apoio: a tela troca o golpe pelo alternativo da espécie
 * (`survivorSupportMove`); se chegar, golpeia o inimigo mais próximo com um impacto em área do raio do perfil.
 */
function attackSupport(state: SurvivorState, support: SurvivorSupport): boolean {
  const p = state.player;
  const { move, profile } = support;
  const damage = round1(profile.damage * support.damageFactor);
  const range = profile.range;
  const radius = profile.radius;
  if (move.category === 'projetil' || move.category === 'foco' || move.category === 'rapido') {
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
    aimConeAtNearest(state, range);
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

/**
 * Foco de um apoio: a carga enche sozinha no mesmo ritmo do jogador e, cheia, solta o feixe na direção do inimigo
 * mais próximo assim que houver alvo na linha. Nasce no jogador, como os outros golpes de apoio.
 */
function stepSupportFocus(state: SurvivorState, support: SurvivorSupport, dtMs: number): void {
  support.focusCharge = Math.min(1, (support.focusCharge ?? 0) + FOCUS_CHARGE_PER_SEC * dtMs / 1000);
  if (support.focusCharge < 1) return;
  const p = state.player;
  const beam = focusBeam(1, support.profile.range);
  const [target] = nearestEnemies(state, Math.min(beam.length, support.profile.range * 2.2), 1);
  if (!target) return;
  support.focusCharge = 0;
  const angle = Math.atan2(target.y - p.y, target.x - p.x);
  const toX = p.x + Math.cos(angle) * beam.length;
  const toY = p.y + Math.sin(angle) * beam.length;
  const damage = round1(support.profile.damage * support.damageFactor * beam.damageMultiplier / BASIC_ATTACK_DAMAGE_FACTOR);
  let hits = 0;
  for (const e of state.enemies) {
    if (e.hp <= 0 || distanceToSegment(e.x, e.y, p.x, p.y, toX, toY) > beam.halfWidth + e.radius) continue;
    hitEnemy(state, e, damage, p, support.move, true, 0);
    if (beam.stunMs > 0) e.stunMs = Math.max(e.stunMs ?? 0, beam.stunMs);
    if (beam.slowMs > 0) e.slowMs = Math.max(e.slowMs ?? 0, beam.slowMs);
    hits++;
  }
  drain(state, hits, support.move);
  state.fx.push({ kind: 'beam', x: p.x, y: p.y, r: beam.halfWidth, color: support.move.color, ageMs: 0, lifeMs: 700, moveType: support.move.type, angle, fromX: p.x, fromY: p.y, toX, toY, count: beam.tier });
}

/**
 * Trilha de um apoio: carrega com a distância que ele anda seguindo o jogador e, cheia, desenha a própria faixa
 * por onde passa. Os pulsos têm cadência própria por inimigo, sem disputar com a faixa do jogador.
 */
function stepSupportTrail(state: SurvivorState, support: SurvivorSupport, movedPx: number, dtMs: number): void {
  support.trailPath ??= [];
  support.trailCharge ??= 0;
  support.trailActiveMs ??= 0;
  support.trailNextHitMs ??= {};
  if (support.trailActiveMs <= 0) {
    support.trailCharge = Math.min(1, support.trailCharge + movedPx / TRAIL_DISTANCE_TO_CHARGE);
    if (support.trailCharge >= 1) { support.trailCharge = 0; support.trailActiveMs = TRAIL_DRAW_MS; }
  }
  support.trailPath = support.trailPath.filter((point) => state.elapsedMs - point.bornMs < TRAIL_LIFE_MS);
  if (support.trailActiveMs > 0) {
    support.trailActiveMs = Math.max(0, support.trailActiveMs - dtMs);
    const last = support.trailPath[support.trailPath.length - 1];
    if (!last || Math.hypot(last.x - support.x, last.y - support.y) >= TRAIL_POINT_SPACING) support.trailPath.push({ x: support.x, y: support.y, bornMs: state.elapsedMs });
  }
  if (support.trailPath.length === 0) return;
  const damage = round1(support.profile.damage * support.damageFactor * 0.9 / BASIC_ATTACK_DAMAGE_FACTOR);
  const radius = support.profile.radius;
  const nextHit = support.trailNextHitMs;
  let hits = 0;
  for (const e of state.enemies) {
    if (e.hp <= 0 || state.elapsedMs < (nextHit[e.id] ?? 0)) continue;
    if (!support.trailPath.some((point) => Math.hypot(e.x - point.x, e.y - point.y) <= radius + e.radius)) continue;
    nextHit[e.id] = state.elapsedMs + TRAIL_TICK_MS;
    hitEnemy(state, e, damage, { x: e.x, y: e.y }, support.move, true, 0);
    hits++;
  }
  for (const id of Object.keys(nextHit)) if (nextHit[Number(id)]! <= state.elapsedMs) delete nextHit[Number(id)];
  drain(state, hits, support.move);
}

const playerAttackRange = (state: SurvivorState): number => (state.typeAffinity?.effect === 'atravessar' ? state.player.attackRange * 1.12 : state.player.attackRange);

/** Um ataque do golpe de quem joga; devolve false se não havia alvo (o tempo de recarga não começa). */
function attack(state: SurvivorState): boolean {
  const p = state.player;
  const move = p.move;
  const attackRange = playerAttackRange(state);
  if (move.category === 'foco') {
    const [target] = nearestEnemies(state, attackRange, 1);
    if (!target) return false;
    fireFocusShot(state, target);
    return true;
  }
  if (move.category === 'projetil') {
    const [target] = nearestEnemies(state, attackRange, 1);
    if (!target) return false;
    fireProjectiles(state, target);
    return true;
  }
  if (move.category === 'rapido') {
    const [target] = nearestEnemies(state, attackRange, 1);
    if (!target) return false;
    // Erva Poderosa: junta 6 tiros flutuando em volta e solta como metralhadora, no lugar da salva de 3.
    if ((p.heldMods?.power ?? 0) > 0) {
      chargeHeldShots(state, 6 + 3 * ((p.heldMods?.power ?? 1) - 1), artifactDamage(state) * 0.62, 'gun', 450);
      return true;
    }
    fireRapidShot(state, target);
    state.charge.rapidShotsPending = RAPID_BURST_SHOTS - 1;
    state.charge.rapidShotDelayMs = RAPID_BURST_SHOT_INTERVAL_MS;
    return true;
  }
  // Teleporte não tem autoataque: a única ofensiva é a soltura deliberada do hold.
  if (move.category === 'teleporte') return false;
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
    heldAuraCopies(state, pulseRadius, damage);
    heldAuraExtras(state, pulseRadius, damage);
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
    const target = aimConeAtNearest(state, attackRange);
    // A carta lendária pode aparar só um projétil por ataque, sem limpar ondas inteiras.
    const projectileIndex = p.projectileDeflection ? state.hostileProjectiles.findIndex((projectile) => inSurvivorCone(p, projectile.x, projectile.y, attackRange, projectile.size)) : -1;
    if (!target && projectileIndex < 0) return false;
    if (projectileIndex >= 0) state.hostileProjectiles.splice(projectileIndex, 1);
    let hits = 0;
    for (const e of state.enemies) {
      if (inSurvivorCone(p, e.x, e.y, attackRange, e.radius)) {
        hitEnemy(state, e, artifactDamage(state), p);
        hits++;
      }
    }
    drain(state, hits, move);
    state.fx.push({ kind: 'cone', x: p.x, y: p.y, r: attackRange, color: move.color, ageMs: 0, lifeMs: 300, moveType: move.type, angle: survivorAimAngle(p), spread: SURVIVOR_CONE_HALF_ANGLE });
    heldConeCopies(state, attackRange, artifactDamage(state));
    heldConeExtras(state, attackRange, artifactDamage(state));
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
    heldAreaCopies(state, center, artifactDamage(state));
    heldAreaExtras(state, center, artifactDamage(state));
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
  heldOrbitCopies(state, dtMs, damage, hitRadius, intervalMs);
  heldOrbitExtras(state, dtMs, damage);
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
  lunch.healed += healSurvivor(p, heal);
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
  return { ...(enemy.dexId !== undefined ? { dexId: enemy.dexId } : {}), ...(enemy.digitalThreat ? { digitalThreat: true } : {}), boss: enemy.boss, grade: enemy.grade, ...(enemy.shadowBoss ? { shadowBoss: true } : {}) };
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
  const contactGuard = kind === 'projétil' ? 0 : (p.upgradeLevels['contact-guard'] ?? 0) * 0.12;
  const projectileGuard = kind === 'projétil' ? (p.upgradeLevels['projectile-guard'] ?? 0) * 0.12 : 0;
  const effectiveDamage = damage > 0 ? Math.max(1, Math.ceil(damage * (1 - (reduction ?? 0)) * (1 - Math.min(0.5, contactGuard + projectileGuard)))) : 0;
  state.lastHit = { ...source, kind, damage: effectiveDamage, hpBefore: p.hp };
  p.hp = Math.max(0, p.hp - effectiveDamage);
  if (effectiveDamage > 0 && source.digitalThreat) p.healBlockMs = 8000;
  const retaliation = p.upgradeLevels['retaliation-wave'] ?? 0;
  if (effectiveDamage > 0 && retaliation > 0) {
    const retaliationDamage = p.attackDamage * 0.3 * retaliation;
    for (const enemy of state.enemies) {
      if (enemy.hp > 0 && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= PLAYER_RADIUS + enemy.radius + 54) {
        enemy.hp -= retaliationDamage;
        enemy.hitFlashMs = 90;
      }
    }
  }
}

function spawnHostileProjectile(state: SurvivorState, enemy: SurvivorEnemy, target: SurvivorPlayer, damageMultiplier = 0.7): void {
  // Parar o tempo interrompe também a decisão de atirar: nenhum projétil novo
  // nasce durante a estase.
  if (state.special.selected === 'stasis' && state.special.activeMs > 0) return;
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
          const healers = state.enemies.filter((e) => e.hp > 0 && e.archetype === 'suporte' && (e.supportRole ?? 'cura') === 'cura');
          for (const other of state.enemies) {
            if (other === enemy || other.hp <= 0 || healed >= ENEMY_BEHAVIOR_LIMITS.healingTargetsPerPulse) continue;
            if (Math.hypot(other.x - enemy.x, other.y - enemy.y) <= SUPPORT_HEAL_RADIUS && other.hp < other.maxHp) {
              // Curadores em volta dividem a cura do alvo: um grupo não se cura em cadeia e fica imortal.
              const amount = healShare(other.maxHp, healersReaching(other, healers));
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

/** Uma corrida dominante limpa a pressão sem perder vida nem ficar sem níveis. */
function isOverwhelmingRun(state: SurvivorState, visibleEnemies: number): boolean {
  const p = state.player;
  const minutes = state.elapsedMs / 60_000;
  const expectedKills = 100 + Math.floor(Math.max(0, minutes - 10) * 12);
  return p.hp >= p.maxHp * 0.9 && p.level >= 12 && state.kills >= expectedKills && visibleEnemies <= 2;
}

/**
 * O Perigo Digital é resposta a uma corrida muito fácil, não punição por parar.
 * Depois de 10 min, HP alto, nível forte, muitas derrotas e tela limpa precisam
 * permanecer juntos por tempo suficiente; qualquer pressão real drena a barra.
 */
function updateDigitalDanger(state: SurvivorState, input: SurvivorInput, dtMs: number, trainerSpawnedThisStep: boolean, events: SurvivorEvent[]): void {
  if (state.over) return;
  state.digitalDangerCooldownMs = Math.max(0, state.digitalDangerCooldownMs - dtMs);
  if (state.elapsedMs < survivorMilestoneMs(DIGITAL_DANGER_UNLOCK_MS, state.fast)) {
    state.digitalDanger = 0;
    return;
  }
  const visibleEnemies = input.visibleEnemies ?? nearbyVisibleEnemyCount(state);
  const trainerActive = state.enemies.some((enemy) => enemy.hp > 0 && enemy.trainerId !== undefined);
  if (state.digitalDangerCooldownMs > 0 || trainerSpawnedThisStep || trainerActive) {
    state.digitalDanger = Math.max(0, state.digitalDanger - (dtMs / 1000) * 4);
    return;
  }
  if (isOverwhelmingRun(state, visibleEnemies)) {
    state.digitalDanger = Math.min(DIGITAL_DANGER_MAX, state.digitalDanger + (dtMs / 1000) * 1.2);
  } else {
    state.digitalDanger = Math.max(0, state.digitalDanger - (dtMs / 1000) * 2.5);
  }
  if (state.digitalDanger < DIGITAL_DANGER_MAX) return;

  state.digitalDanger = 0;
  state.digitalDangerCooldownMs = DIGITAL_DANGER_COOLDOWN_MS;
  spawnTrainer(state, 3, false, events, 'digital-danger');
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

/** Ponto fora da tela imediata, mas alcançável na janela curta do encontro. */
function fieldEventPoint(state: SurvivorState): { x: number; y: number } {
  const p = state.player;
  const angle = state.rng() * Math.PI * 2;
  const distance = 300 + state.rng() * 110;
  return {
    x: clamp(p.x + Math.cos(angle) * distance, PLAYER_RADIUS, ARENA_W - PLAYER_RADIUS),
    y: clamp(p.y + Math.sin(angle) * distance, PLAYER_RADIUS, ARENA_H - PLAYER_RADIUS),
  };
}

/** Gráficos do resumo: as fontes de dano e a linha do tempo, fechada com o momento do fim. */
function runStatsSummary(state: SurvivorState): Partial<Pick<SurvivorSummary, 'damageBySource' | 'timeline' | 'thievesCaught' | 'adaptive'>> {
  const stats = state.runStats;
  if (!stats) return {};
  const last = stats.timeline[stats.timeline.length - 1];
  const timeline = last && last.ms < state.elapsedMs ? [...stats.timeline, { ms: state.elapsedMs, kills: state.kills, level: state.player.level }] : [...stats.timeline];
  return { damageBySource: damageRanking(stats), timeline, thievesCaught: stats.thievesCaught, ...(state.adaptive ? { adaptive: Math.round(state.adaptive.value * 100) / 100 } : {}) };
}

/** O ladrão de tesouro aparece de tempos em tempos, longe o bastante para exigir ir atrás. */
function spawnThiefIfDue(state: SurvivorState, dtMs: number, events: SurvivorEvent[]): void {
  // Conta só o tempo jogado de verdade (não o relógio da corrida, que cenários e o modo rápido pulam).
  state.thiefClockMs = (state.thiefClockMs ?? 0) + Math.max(0, dtMs);
  if (state.debugLaboratory || state.heldDisabled || state.thief || state.thiefClockMs < (state.nextThiefAtMs ?? Infinity)) return;
  state.nextThiefAtMs = state.thiefClockMs + SURVIVOR_THIEF_EVERY_MS;
  const id = spawnEnemy(state, false, 'elite');
  const thief = id === null ? undefined : state.enemies.find((e) => e.id === id);
  if (!thief) return;
  thief.thief = true;
  thief.dexId = SURVIVOR_THIEF_DEX;
  thief.speed = SURVIVOR_THIEF_SPEED;
  thief.damage = 0;
  thief.hp = thief.maxHp = Math.round(thief.maxHp * 0.6);
  thief.archetype = 'perseguidor';
  // Não conta como elite: não é de treinador, não solta chave e não entra nas contas de elites.
  thief.grade = 'comum';
  thief.radius = 15;
  delete thief.supportRole;
  state.thief = { enemyId: thief.id, leftMs: SURVIVOR_THIEF_LIFE_MS };
  events.push({ type: 'thiefSpawn', dexId: SURVIVOR_THIEF_DEX, leftMs: SURVIVOR_THIEF_LIFE_MS });
}

/** O tempo do ladrão corre; se ele não foi pego, some do campo sem deixar nada. */
function updateThief(state: SurvivorState, dtMs: number, events: SurvivorEvent[]): void {
  const thief = state.thief;
  if (!thief) return;
  if (!state.enemies.some((e) => e.id === thief.enemyId)) {
    state.thief = null;
    return;
  }
  thief.leftMs = Math.max(0, thief.leftMs - dtMs);
  if (thief.leftMs > 0) return;
  const escaped = state.enemies.find((e) => e.id === thief.enemyId);
  if (escaped) state.fx.push({ kind: 'pulse', x: escaped.x, y: escaped.y, r: 40, color: '#ffd84a', ageMs: 0, lifeMs: 500 });
  state.enemies = state.enemies.filter((e) => e.id !== thief.enemyId);
  state.thief = null;
  events.push({ type: 'thiefEscaped' });
}

function spawnFieldEventIfDue(state: SurvivorState, events: SurvivorEvent[]): void {
  if (state.fieldEvent || state.elapsedMs < state.nextFieldEventAtMs) return;
  const kind = state.rng() < 0.5 ? 'resonance' : 'hunt';
  const point = fieldEventPoint(state);
  state.fieldEvent = { phase: 'beacon', kind, ...point, remainingMs: SURVIVOR_FIELD_EVENT_BEACON_MS, enemyIds: [] };
  state.nextFieldEventAtMs = state.elapsedMs + SURVIVOR_FIELD_EVENT_EVERY_MS;
  events.push({ type: 'fieldEventSpawn', kind, ...point, remainingMs: SURVIVOR_FIELD_EVENT_BEACON_MS });
}

/** Concluir a ressonância compensa desviar a rota com buffs curtos e orbes reais no local. */
function completeResonance(state: SurvivorState, event: NonNullable<SurvivorState['fieldEvent']>): void {
  const p = state.player;
  p.artifactSpeedMs = Math.max(p.artifactSpeedMs, 12_000);
  p.artifactPowerMs = Math.max(p.artifactPowerMs, 12_000);
  for (let index = 0; index < 4; index++) {
    const angle = (Math.PI * 2 * index) / 4;
    state.orbs.push({ id: state.nextId++, x: event.x + Math.cos(angle) * 26, y: event.y + Math.sin(angle) * 26, value: 10, doubleXp: index === 0 });
  }
  state.fx.push({ kind: 'pulse', x: event.x, y: event.y, r: 96, color: '#7be6ff', ageMs: 0, lifeMs: 900 });
  state.fx.push({ kind: 'pulse', x: event.x, y: event.y, r: 66, color: '#ffbd63', ageMs: 0, lifeMs: 720 });
}

/** Atualiza o desvio opcional de rota depois que o movimento e as mortes deste quadro já foram resolvidos. */
function updateFieldEvent(state: SurvivorState, dtMs: number, events: SurvivorEvent[]): void {
  const event = state.fieldEvent;
  if (!event) return;
  if (event.phase === 'beacon') {
    if (Math.hypot(event.x - state.player.x, event.y - state.player.y) <= SURVIVOR_FIELD_EVENT_REACH_RADIUS) {
      if (event.kind === 'resonance') {
        completeResonance(state, event);
        state.fieldEvent = null;
        events.push({ type: 'fieldEventComplete', kind: 'resonance' });
        return;
      }
      const enemyIds: number[] = [];
      // Dois elites tornam a recompensa merecida sem competir com o grupo completo de treinador.
      for (let index = 0; index < 2; index++) {
        const id = spawnEnemy(state, false, 'elite');
        if (id !== null) enemyIds.push(id);
      }
      event.phase = 'hunt';
      event.enemyIds = enemyIds;
      event.remainingMs = SURVIVOR_FIELD_EVENT_HUNT_MS;
      state.fx.push({ kind: 'blast', x: event.x, y: event.y, r: 72, color: '#ff6b72', ageMs: 0, lifeMs: 620 });
      events.push({ type: 'fieldEventStarted', kind: 'hunt' });
      return;
    }
    event.remainingMs = Math.max(0, event.remainingMs - dtMs);
    if (event.remainingMs === 0) {
      state.fieldEvent = null;
      events.push({ type: 'fieldEventExpired', kind: event.kind });
    }
    return;
  }
  if (event.enemyIds.every((id) => !state.enemies.some((enemy) => enemy.id === id))) {
    // A Caçada paga dois artefatos do mesmo sistema de itens da corrida; não há recompensa inventada fora dele.
    for (const offset of [-22, 22]) state.artifacts.push({ id: state.nextId++, x: event.x + offset, y: event.y, kind: artifactKind(state.rng) });
    state.fx.push({ kind: 'artifact', artifact: 'power', x: event.x, y: event.y, r: 46, color: '#ffcf5c', ageMs: 0, lifeMs: 800 });
    state.fieldEvent = null;
    events.push({ type: 'fieldEventComplete', kind: 'hunt' });
    return;
  }
  // Os elites seguem na arena como inimigos comuns; só o encontro (e o prêmio) acaba.
  event.remainingMs = Math.max(0, event.remainingMs - dtMs);
  if (event.remainingMs === 0) {
    state.fieldEvent = null;
    events.push({ type: 'fieldEventExpired', kind: 'hunt' });
  }
}

/**
 * Avança `dtMs` de jogo. Não faz nada (devolve `[]`) se `state.over` ou se há um upgrade pendente — quem chama
 * (o componente Vue) deve pausar o laço de desenho/tempo nesses casos e só retomar depois de `applyUpgrade`.
 */
export function stepSurvivor(state: SurvivorState, input: SurvivorInput, dtMs: number): SurvivorEvent[] {
  const events: SurvivorEvent[] = [];
  state.criticalHits = [];
  if (state.over || state.pendingUpgrade) return events;
  if (!Number.isFinite(dtMs) || dtMs <= 0) return events;
  if (!state.debugLaboratory && advanceSpecialEncounter(state, dtMs)) return events;
  if (!state.debugLaboratory && advanceShadowEncounter(state, dtMs, events)) return events;
  const dt = dtMs / 1000;
  const healBlockBeforeStep = state.player.healBlockMs ?? 0;
  const previousElapsedMs = state.elapsedMs;
  state.elapsedMs += dtMs;
  flushHeldShards(state);
  refillHeldLeech(state.player, dtMs);
  stepElementalTerrain(state, dtMs);
  if (!state.hypotheticalSecondaryActive && previousElapsedMs < HYPOTHETICAL_TYPE_ACTIVATION_MS && state.elapsedMs >= HYPOTHETICAL_TYPE_ACTIVATION_MS) {
    state.hypotheticalSecondaryActive = true;
    events.push({ type: 'hypotheticalTypeActivated', secondaryType: state.hypotheticalSecondaryType });
  }
  // No Ritmo acelerado os marcos chegam na mesma fração da corrida (metade do relógio).
  const loveCandyMs = survivorMilestoneMs(SURVIVOR_LOVE_CANDY_MS, state.fast);
  const trustStoneMs = survivorMilestoneMs(SURVIVOR_TRUST_STONE_MS, state.fast);
  const omegaShardMs = survivorMilestoneMs(SURVIVOR_OMEGA_SHARD_MS, state.fast);
  if (previousElapsedMs < loveCandyMs && state.elapsedMs >= loveCandyMs) {
    events.push({ type: 'milestone', id: 'ten-minutes', reward: 'love-candy' });
  }
  if (previousElapsedMs < trustStoneMs && state.elapsedMs >= trustStoneMs) {
    events.push({ type: 'milestone', id: 'fifteen-minutes', reward: 'trust-stone' });
  }
  if (previousElapsedMs < omegaShardMs && state.elapsedMs >= omegaShardMs) {
    events.push({ type: 'milestone', id: 'twenty-minutes', reward: 'omega-shard' });
  }
  spawnShadowBallIfDue(state, events);
  spawnFieldEventIfDue(state, events);
  spawnThiefIfDue(state, dtMs, events);
  if (state.adaptive) state.adaptive.value = stepAdaptive(state.adaptive.value, adaptiveTarget(state.player), dtMs);
  if (state.runStats) sampleTimeline(state.runStats, state.elapsedMs, state.kills, state.player.level);
  if (!state.debugLaboratory && advanceSpecialEncounter(state, 0)) return events;
  const p = state.player;
  p.artifactSpeedMs = Math.max(0, p.artifactSpeedMs - dtMs);
  p.artifactPowerMs = Math.max(0, p.artifactPowerMs - dtMs);
  p.artifactShieldMs = Math.max(0, p.artifactShieldMs - dtMs);
  p.artifactMagnetMs = Math.max(0, p.artifactMagnetMs - dtMs);
  p.artifactFocusMs = Math.max(0, p.artifactFocusMs - dtMs);
  const dashPath = stepSurvivorSpecial(state, input, dtMs, ARENA_W, ARENA_H, PLAYER_RADIUS);
  if (dashPath) hitDashPath(state, dashPath);

  // Movimento do jogador, com a arena como cerca.
  const chargeStyle = chargeStyleOf(state);
  const focusSlow = chargeStyle === 'foco' && input.charge === true ? FOCUS_SLOW_MULTIPLIER : 1;
  const beforeMoveX = p.x;
  const beforeMoveY = p.y;
  const len = Math.hypot(input.dx, input.dy);
  if (len > 0.001 && !(state.special.selected === 'dash' && state.special.activeMs > 0)) {
    const ux = input.dx / len;
    const uy = input.dy / len;
    const terrainSpeed = survivorBiomeMovementMultiplier(state.elapsedMs, p.x, p.y);
    const artifactSpeed = (p.artifactSpeedMs > 0 ? BALANCE.artifactSpeedMultiplier : 1) * (1 + (p.lunchSpeedBonus ?? 0)) * ((p.trailActiveMs ?? 0) > 0 ? TRAIL_SPEED_MULTIPLIER : 1);
    p.x = clamp(p.x + ux * p.speed * artifactSpeed * terrainSpeed * focusSlow * dt, PLAYER_RADIUS, ARENA_W - PLAYER_RADIUS);
    p.y = clamp(p.y + uy * p.speed * artifactSpeed * terrainSpeed * focusSlow * dt, PLAYER_RADIUS, ARENA_H - PLAYER_RADIUS);
    if (Math.abs(ux) > 0.01) p.facing = ux < 0 ? -1 : 1;
    p.aimAngle = Math.atan2(uy, ux);
  }
  // No BONK a frente é a câmera.
  if (input.aimAngle !== undefined && Number.isFinite(input.aimAngle)) p.aimAngle = input.aimAngle;
  // Todo quadro, não só no ataque: o guia do leque e o sprite já apontam para quem vai levar o golpe.
  if (p.move.category === 'cone') aimConeAtNearest(state, playerAttackRange(state));
  // Barra de carga: só anda com o golpe de Foco ou Rápido. A investida do especial não conta como corrida.
  const movedPx = state.special.selected === 'dash' && state.special.activeMs > 0 ? 0 : Math.hypot(p.x - beforeMoveX, p.y - beforeMoveY);
  stepTrail(state, movedPx, dtMs, input.charge === true);
  state.charge.moveRatio = dt > 0 ? movedPx / dt / RUSH_REFERENCE_SPEED : 0;
  if (input.cancelCharge) cancelTeleportHold(state.charge);
  const chargeBonus = chargeStyle === 'foco' ? (p.upgradeLevels[CHARGE_FOCUS_RATE_ID] ?? 0) : chargeStyle === 'teleporte' ? (p.upgradeLevels[CHARGE_RUSH_LENGTH_ID] ?? 0) : 0;
  const chargeAction = stepChargeMeter(state.charge, chargeStyle, input.charge === true, movedPx, dtMs, chargeBonus, p.attackCooldownMs * (p.artifactFocusMs > 0 ? 0.8 : 1));
  if (chargeAction?.kind === 'focus-release') {
    const name = fireFocusBeam(state, chargeAction.level);
    events.push({ type: 'chargeRelease', style: 'foco', name, level: chargeAction.level });
  } else if (chargeAction?.kind === 'teleport-release') {
    p.attackTimerMs = 0;
    if (releaseTeleport(state, chargeAction)) events.push({ type: 'chargeRelease', style: 'teleporte', name: chargeAction.wave ? 'Onda total' : 'Teleporte', level: chargeAction.level });
  }
  if (p.invulnMs > 0) p.invulnMs = Math.max(0, p.invulnMs - dtMs);
  if ((p.regenPerSec ?? 0) > 0 && p.hp > 0) healSurvivor(p, (p.regenPerSec ?? 0) * dt);
  stepLunch(state, dt);

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
    if ((e.timeFrozenMs ?? 0) > 0) e.timeFrozenMs = Math.max(0, (e.timeFrozenMs ?? 0) - dtMs);
    if ((e.mirrorOrbitHitMs ?? 0) > 0) e.mirrorOrbitHitMs = Math.max(0, (e.mirrorOrbitHitMs ?? 0) - dtMs);
    if (e.linkId !== undefined) {
      e.linkMs = Math.max(0, (e.linkMs ?? 0) - dtMs);
      if (e.linkMs === 0) { delete e.linkId; delete e.linkMs; }
    }
    // Orbe Adamante: o inimigo dentro de uma bolha fica parado no tempo, como na estase.
    const timeStopped = (state.special.selected === 'stasis' && state.special.activeMs > 0) || (e.timeFrozenMs ?? 0) > 0;
    const stunned = timeStopped || !!e.stunMs && e.stunMs > 0;
    if (stunned) e.stunMs = Math.max(0, (e.stunMs ?? 0) - dtMs);
    if ((e.stunCooldownMs ?? 0) > 0) e.stunCooldownMs = Math.max(0, (e.stunCooldownMs ?? 0) - dtMs);
    if ((e.knockbackCooldownMs ?? 0) > 0) e.knockbackCooldownMs = Math.max(0, (e.knockbackCooldownMs ?? 0) - dtMs);
    if ((e.orbitHitMs ?? 0) > 0) e.orbitHitMs = Math.max(0, (e.orbitHitMs ?? 0) - dtMs);
    // Em estase, a IA não decide cura, proteção, investida ou novos tiros.
    // O restante do quadro ainda reduz efeitos temporários de forma previsível.
    const target = timeStopped ? { x: e.x, y: e.y } : e.thief ? thiefFleeTarget(e, p, { w: ARENA_W, h: ARENA_H }) : updateEnemyBehavior(state, e, dtMs);
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
    if (state.special.selected === 'gravity' && state.special.activeMs > 0) {
      const gravityDx = p.x - e.x;
      const gravityDy = p.y - e.y;
      const gravityDistance = Math.hypot(gravityDx, gravityDy) || 1;
      const direction = state.special.branch === 'gravity-repel' ? -1 : 1;
      e.x += direction * gravityDx / gravityDistance * 220 * dt;
      e.y += direction * gravityDy / gravityDistance * 220 * dt;
    }
    const playerDistance = Math.hypot(p.x - e.x, p.y - e.y);
    // Espinhos: quem encosta em você apanha, mesmo durante a janela de invulnerabilidade do jogador.
    if ((p.thornsDamage ?? 0) > 0 && playerDistance < PLAYER_RADIUS + e.radius) e.hp -= (p.thornsDamage ?? 0) * dt;
    // Congelado no tempo não ataca: a bolha do Orbe Adamante e a Estase protegem de verdade.
    // No BONK, quem está no alto passa por cima de quem encosta.
    if (!e.thief && !timeStopped && !input.airborne && playerDistance < PLAYER_RADIUS + e.radius && p.invulnMs <= 0) {
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
    if (!input.airborne && Math.hypot(proj.x - p.x, proj.y - p.y) <= PLAYER_RADIUS + proj.size) {
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
  // Rajada: os dois tiros seguintes acontecem no tempo certo, sem duplicar p.shots no mesmo quadro.
  if (p.move.category === 'rapido' && state.charge.rapidShotsPending > 0) {
    state.charge.rapidShotDelayMs -= dtMs;
    while (state.charge.rapidShotsPending > 0 && state.charge.rapidShotDelayMs <= 0) {
      const [target] = nearestEnemies(state, p.attackRange, 1);
      if (target) fireRapidShot(state, target);
      state.charge.rapidShotsPending--;
      state.charge.rapidShotDelayMs += RAPID_BURST_SHOT_INTERVAL_MS;
    }
  }
  if (p.attackTimerMs <= 0 && state.charge.rapidShotsPending <= 0 && p.move.category !== 'trilha' && attack(state)) {
    const cooldownMs = p.attackCooldownMs * (p.artifactFocusMs > 0 ? 0.8 : 1);
    p.attackTimerMs = p.move.category === 'rapido' ? Math.max(RAPID_BURST_MIN_CYCLE_MS, cooldownMs) : cooldownMs;
    heldAfterAttack(state);
  }
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
      // Trilha e Foco não esperam botão: o apoio carrega e usa o golpe sozinho.
      if (support.move.category === 'trilha') { stepSupportTrail(state, support, distance > 0.01 ? follow : 0, dtMs); continue; }
      if (support.move.category === 'foco') stepSupportFocus(state, support, dtMs);
      support.attackTimerMs = Math.max(0, support.attackTimerMs - dtMs);
      if (support.attackTimerMs <= 0 && attackSupport(state, support)) support.attackTimerMs = Math.max(500, Math.round(support.profile.cooldownMs * 1.45));
    }
    const firstSupport = state.supports[0];
    if (firstSupport) p.secondAttackTimerMs = firstSupport.attackTimerMs;
  }

  // Projéteis: avançam, somem com o tempo/fora da arena, acertam o inimigo mais próximo no caminho.
  stepHeldMines(state, dtMs);
  stepTimeBubbles(state, dtMs);
  stepGravityWells(state, dt, dtMs);
  stepGravityFields(state, dt);
  stepHeldQueue(state);
  stepHeldCharges(state);
  const chained: SurvivorProjectile[] = [];
  state.projectiles = state.projectiles.filter((proj) => {
    if (proj.homing) steerHomingProjectile(state, proj, dt);
    const terrainSpeed = survivorBiomeProjectileSpeedMultiplier(state.elapsedMs, proj.x, proj.y);
    proj.x += proj.vx * terrainSpeed * dt;
    proj.y += proj.vy * terrainSpeed * dt;
    proj.lifeMs -= dtMs;
    if (proj.lifeMs <= 0) return false;
    if (proj.x < -40 || proj.x > ARENA_W + 40 || proj.y < -40 || proj.y > ARENA_H + 40) return false;
    for (const e of state.enemies) {
      if (proj.hit.includes(e.id)) continue;
      const focusShot = proj.move?.category === 'foco' && proj.source !== 'support';
      if (Math.hypot(e.x - proj.x, e.y - proj.y) < e.radius + (focusShot ? Math.max(5, proj.size ?? 5) : proj.collisionRadius ?? 5)) {
        if (focusShot) state.charge.level = Math.min(1, state.charge.level + FOCUS_HIT_CHARGE);
        if (proj.noHeld) heldGuard++;
        try {
          hitEnemy(state, e, proj.damage, { x: proj.x - proj.vx * 0.05, y: proj.y - proj.vy * 0.05 }, proj.move, true, proj.distanceFromPlayer ?? Math.hypot(e.x - p.x, e.y - p.y));
        } finally {
          if (proj.noHeld) heldGuard--;
        }
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
            chained.push({ id: state.nextId++, x: e.x, y: e.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, damage: round1(proj.damage * 0.7), pierce: 0, lifeMs: 600, hit: [...proj.hit], canChain: false, size: proj.size, collisionRadius: proj.collisionRadius, move: proj.move, source: proj.source, distanceFromPlayer: proj.distanceFromPlayer, look: proj.look });
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
  flushHeldShards(state);

  // Marcas visuais envelhecem e somem.
  if (state.fx.length > 0) {
    for (const f of state.fx) f.ageMs += dtMs;
    state.fx = state.fx.filter((f) => f.ageMs < f.lifeMs);
  }

  // No laboratório, alvos não concedem recompensas nem encerram a corrida.
  if (state.debugLaboratory) state.enemies = state.enemies.filter((e) => e.hp > 0);
  // Inimigos derrotados viram orbe de XP e contam na pontuação.
  const dead = state.enemies.filter((e) => e.hp <= 0);
  if (dead.length > 0) {
    state.enemies = state.enemies.filter((e) => e.hp > 0);
    state.kills += dead.length;
    for (const e of dead) {
      if (e.thief && !state.debugLaboratory) {
        const coins = thiefReward(state.elapsedMs);
        p.bonusCoins = (p.bonusCoins ?? 0) + coins;
        if (state.runStats) state.runStats.thievesCaught += 1;
        if (state.thief?.enemyId === e.id) state.thief = null;
        state.fx.push({ kind: 'pulse', x: e.x, y: e.y, r: 70, color: '#ffd84a', ageMs: 0, lifeMs: 700 });
        events.push({ type: 'thiefCaught', coins });
      }
      state.fx.push({ kind: 'defeat', x: e.x, y: e.y, r: e.boss || e.grade === 'chefao' ? 26 : 14, color: e.archetype === 'suporte' ? '#ff78b7' : e.grade === 'elite' ? '#ffd84a' : '#e8f2ff', ageMs: 0, lifeMs: 360 });
      const value = normalizeSurvivorXp(e.boss ? 48 : e.grade === 'chefao' ? 36 : e.grade === 'elite' ? 20 : 8);
      const doubleXp = state.rng() < BALANCE.doubleXpOrbChance;
      state.orbs.push({ id: state.nextId++, x: e.x, y: e.y, value, ...(doubleXp ? { doubleXp: true } : {}) });
      const dropChance = (e.boss ? BALANCE.artifactBossDropChance : e.grade === 'chefao' || e.grade === 'elite' ? BALANCE.artifactEliteDropChance : BALANCE.artifactDropChance) * (1 + (p.artifactLuck ?? 0));
      if (state.rng() < dropChance) state.artifacts.push({ id: state.nextId++, x: e.x, y: e.y, kind: artifactKind(state.rng) });
      // Elites soltos (caçadas) às vezes derrubam uma chave; os de treinador entregam a chave quando o time cai.
      if (e.grade === 'elite' && e.trainerId === undefined && !state.debugLaboratory && state.rng() < LOOSE_ELITE_KEY_CHANCE) dropKey(state, e.x, e.y);
      if (e.archetype === 'explosivo') explodeOnDeath(state, e);
      const pokeballsOnGround = state.artifacts.reduce((total, artifact) => total + (artifact.kind === 'pokeball' ? 1 : 0), 0);
      const pokeballChance = e.boss || e.grade === 'chefao'
        ? BALANCE.digitalPokeballDropChance.chefao
        : e.grade === 'elite'
          ? BALANCE.digitalPokeballDropChance.elite
          : BALANCE.digitalPokeballDropChance.comum;
      if (
        state.elapsedMs >= survivorMilestoneMs(SURVIVOR_LOVE_CANDY_MS, state.fast)
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
      // Treinador comum derrotado deixa chave para os baús; no Ritmo acelerado, na mesma proporção da corrida normal.
      if (!final && sample && !state.debugLaboratory) {
        for (let k = 0; k < (state.fast ? SURVIVOR_FAST_TRAINER_COIN_SCALE : 1); k++) dropKey(state, sample.x + k * 14, sample.y);
      }
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
          summary: { survivedMs: state.elapsedMs, level: state.player.level, stage: state.player.stage, kills: state.kills, wave: state.wave, trainersBeaten: state.trainersBeaten, bossesBeaten: state.bossesBeaten, finalBossBeaten: state.finalBossBeaten, infinite: state.infinite, fast: state.fast, digitalPokeballs: state.digitalPokeballs, shadowTrustStones: state.shadowTrustStones, bonusCoins: state.player.bonusCoins ?? 0, ...runStatsSummary(state) },
        });
      }
    }
  }

  updateFieldEvent(state, dtMs, events);
  updateThief(state, dtMs, events);
  stepChests(state, events);

  // Coleta de orbes de XP (e nível, se passou da marca).
  if (state.special.selected === 'gravity' && state.special.branch === 'gravity-vacuum' && state.special.activeMs > 0) {
    for (const orb of state.orbs) { orb.x = p.x; orb.y = p.y; }
  }
  if (p.artifactMagnetMs > 0) {
    for (const orb of state.orbs) { orb.x = p.x; orb.y = p.y; }
    for (const artifact of state.artifacts) { artifact.x = p.x; artifact.y = p.y; }
  }
  state.orbs = state.orbs.filter((orb) => {
    if (Math.hypot(orb.x - p.x, orb.y - p.y) <= effectivePickupRadius(p)) {
      // A marmita de Peixe não multiplica o ritmo acelerado: vale o maior dos dois.
      const multiplier = Math.max(p.xpMultiplier ?? 1, p.lunch?.active ? 1 + p.lunch.effect.xpBonus : 1);
      const orbValue = orb.doubleXp ? orb.value * 2 : orb.value;
      const xpWithCarry = orbValue * multiplier * BALANCE.xpOrbMultiplier + (p.xpCarry ?? 0);
      const boostedValue = normalizeSurvivorXp(xpWithCarry);
      p.xpCarry = Math.max(0, xpWithCarry - boostedValue);
      p.xp = normalizeSurvivorXp(p.xp + boostedValue);
      const orbMedicine = p.upgradeLevels['orb-medicine'] ?? 0;
      if (orbMedicine > 0) healSurvivor(p, orbMedicine);
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
      healSurvivor(p, Math.max(18, Math.round(p.maxHp * 0.28)));
      p.artifactShieldMs = 3_000;
    }
    state.fx.push({ kind: 'artifact', artifact: artifact.kind, x: p.x, y: p.y, r: artifact.kind === 'pokeball' || artifact.kind === 'shadow-ball' ? 30 : 24, color: artifact.kind === 'shadow-ball' ? '#a66bff' : artifact.kind === 'pokeball' ? '#ff5b5b' : artifact.kind === 'speed' ? '#7bdcff' : artifact.kind === 'power' ? '#ffb35c' : artifact.kind === 'magnet' ? '#d68cff' : artifact.kind === 'focus' ? '#ffe071' : '#ff8fbb', ageMs: 0, lifeMs: artifact.kind === 'pokeball' || artifact.kind === 'shadow-ball' ? 900 : 620 });
    events.push({ type: 'artifactCollected', kind: artifact.kind });
    return false;
  });
  levelUp(state, events);

  // Segundo fôlego: uma vez por corrida, ao cair até 25% de vida, o jogador volta com 35% do máximo.
  if (p.secondWindReady && (p.healBlockMs ?? 0) <= 0 && p.hp <= p.maxHp * 0.25) {
    p.secondWindReady = false;
    const healed = Math.round(p.maxHp * 0.35);
    healSurvivor(p, healed);
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
      summary: { survivedMs: state.elapsedMs, level: p.level, stage: p.stage, kills: state.kills, wave: state.wave, trainersBeaten: state.trainersBeaten, bossesBeaten: state.bossesBeaten, finalBossBeaten: state.finalBossBeaten, infinite: state.infinite, fast: state.fast, digitalPokeballs: state.digitalPokeballs, shadowTrustStones: state.shadowTrustStones, bonusCoins: p.bonusCoins ?? 0, ...runStatsSummary(state), ...(state.lastHit ? { finalHit: state.lastHit } : {}) },
    });
  }

  if (!state.debugLaboratory) updateDigitalDanger(state, input, dtMs, trainerSpawnedThisStep, events);
  if ((p.healBlockMs ?? 0) > 0 && (p.healBlockMs ?? 0) <= healBlockBeforeStep) p.healBlockMs = Math.max(0, (p.healBlockMs ?? 0) - dtMs);

  return events;
}
