import { seededRng } from './battle';
import type { Rng } from './battle';
import type { AttackProfile, MoveCategory, SurvivorMove } from './survivor-moves';
import { survivorBiomeDamageMultiplier, survivorBiomeMovementMultiplier, survivorBiomeProjectileSpeedMultiplier } from './survivor-biomes';
import { survivorElementalStatus, survivorSynergyFor } from './survivor-synergies';
import { survivorPreparation } from './survivor-preparations';
import type { SurvivorPreparationId } from './survivor-preparations';
import { advanceSpecialEncounter, createSurvivorSpecial, specialProtects, stepSurvivorSpecial } from './survivor-specials';
import type { SurvivorSpecialState } from './survivor-specials';
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
  /** Buffs temporários concedidos pelos artefatos coletados na arena. */
  artifactSpeedMs: number;
  artifactPowerMs: number;
  artifactShieldMs: number;
  /** -1 olhando para a esquerda, 1 para a direita (para virar o sprite). */
  facing: -1 | 1;
  /** Alcance para coletar orbe de XP ao passar perto (sobe com o upgrade "Ímã de XP"). */
  pickupRadius: number;
  /** Segundo golpe automático, desbloqueável uma vez por corrida. */
  secondMove?: SurvivorMove;
  secondAttackTimerMs?: number;
  secondAttackDamage?: number;
  secondAttackCooldownMs?: number;
  secondAttackRange?: number;
  secondAttackRadius?: number;
  /** Especializações escolhidas na corrida, indexadas pelo id para limitar ofertas repetidas. */
  upgradeLevels: Record<string, number>;
}

/** Dados congelados do Pokémon de apoio. Ele acompanha apenas no desenho: não é um segundo alvo de combate. */
export interface SurvivorSupport {
  dexId: number;
  name: string;
  move: SurvivorMove;
  /** Perfil capturado quando foi escolhido. Upgrades do protagonista não o alteram. */
  profile: AttackProfile;
  x: number;
  y: number;
  attackTimerMs: number;
  /** Fator deliberadamente abaixo do protagonista: apoio complementa, não duplica uma build. */
  damageFactor: number;
}

export interface SurvivorSupportCandidate {
  dexId: number;
  name: string;
  move: SurvivorMove;
  profile: AttackProfile;
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
  /** Efeitos dos golpes (ms restantes): queimadura, lentidão, atordoamento e marcadores de sinergia. */
  burnMs?: number;
  burnDps?: number;
  slowMs?: number;
  stunMs?: number;
  wetMs?: number;
  seededMs?: number;
  /** Acúmulos de frio. O congelamento é curto e tem intervalo por alvo. */
  frostStacks?: number;
  frostImmuneMs?: number;
  /** Comportamento de gameplay; não representa atributo oficial da espécie. */
  archetype?: SurvivorEnemyArchetype;
  /** Recarga do comportamento especial, em milissegundos. */
  specialTimerMs?: number;
  /** Proteção temporária recebida de um Protetor aliado. */
  protectedMs?: number;
}

/** Perfis internos de comportamento reutilizáveis entre regiões e espécies. */
export type SurvivorEnemyArchetype = 'perseguidor' | 'flanqueador' | 'atirador' | 'protetor' | 'suporte';

export interface SurvivorHostileProjectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  lifeMs: number;
  size: number;
  /** Ataques de Pokémon de treinadores têm leitura visual própria. */
  grade?: SurvivorEnemyGrade;
  effect?: 'burn' | 'slow' | 'stun';
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
  /** Identidade visual/efeito do golpe que criou o projétil. */
  move?: SurvivorMove;
  /** O apoio só muda a apresentação e a atribuição; continua saindo da posição do jogador. */
  source?: 'player' | 'support';
}

/** Marcas visuais de um instante (pulso da aura, explosão da área, brilho da evolução): só para o desenho. */
export interface SurvivorFx {
  kind: 'pulse' | 'blast' | 'evolve' | 'echo' | 'follow-up' | 'artifact';
  x: number;
  y: number;
  r: number;
  color: string;
  ageMs: number;
  lifeMs: number;
  /** Efeito secundário que parte do jogador depois do impacto principal. */
  element?: 'bug' | 'ghost';
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  delayMs?: number;
  count?: number;
  artifact?: SurvivorArtifactKind;
}

export type SurvivorArtifactKind = 'speed' | 'heal' | 'power';
export interface SurvivorArtifact {
  id: number;
  x: number;
  y: number;
  kind: SurvivorArtifactKind;
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

/** Afinidade rara: o segundo tipo da espécie reforça a corrida sem criar outro golpe. */
export interface SurvivorTypeAffinity {
  type: SurvivorMove['type'];
  effect: SurvivorMove['effect'];
}

export interface SurvivorState {
  special: SurvivorSpecialState;
  rng: Rng;
  /** Semente original desta corrida, usada também para objetivos determinísticos. */
  runSeed: number;
  /** Aparência por nascimento; não deve consumir o RNG de combate. */
  enemyDexId: ((enemy: Readonly<SurvivorEnemy>, elapsedMs: number) => number) | null;
  elapsedMs: number;
  player: SurvivorPlayer;
  enemies: SurvivorEnemy[];
  projectiles: SurvivorProjectile[];
  hostileProjectiles: SurvivorHostileProjectile[];
  orbs: SurvivorOrb[];
  artifacts: SurvivorArtifact[];
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
  enemyArchetypeFor: ((enemy: Pick<SurvivorEnemy, 'kind' | 'boss' | 'grade'>) => SurvivorEnemyArchetype) | null;
  /** Técnica que será desbloqueada no primeiro upgrade especial. */
  secondMoveCandidate: SurvivorMove | null;
  /** Candidato real fornecido pela Caixa. Sem candidato, a corrida não inventa um segundo Pokémon. */
  supportCandidate: SurvivorSupportCandidate | null;
  support: SurvivorSupport | null;
  secondAttackOffered: boolean;
  /** Efeito do segundo tipo escolhido no início; não causa dano extra nem recebe upgrades. */
  typeAffinity: SurvivorTypeAffinity | null;
}

export interface SurvivorEvolutionOption {
  dexId: number;
  name: string;
  /** Números pelos stats da próxima forma (mesma forma de golpe); sem isto, a evolução dá bônus fixos. */
  profile?: AttackProfile;
}

export interface SurvivorInput {
  /** Ativação solicitada uma única vez pelo botão ou teclado. */
  special?: boolean;
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

/** Marcos de corrida que só viram itens quando a partida termina de verdade na Vila. */
export const SURVIVOR_LOVE_CANDY_MS = 10 * 60_000;
export const SURVIVOR_MEGA_SHARD_MS = 20 * 60_000;

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
  | { type: 'milestone'; id: 'ten-minutes' | 'twenty-minutes'; reward: 'love-candy' | 'mega-stone-shard' }
  | { type: 'bossSpawn' }
  /** Treinador apareceu: solta um grupo de `count` Pokémon elite (3 no normal, 6 no chefão final e no infinito). */
  | { type: 'trainerSpawn'; count: number; final: boolean }
  /** Treinador derrotado (todos os Pokémon dele caíram). */
  | { type: 'trainerDown'; final: boolean }
  | { type: 'evolve'; dexId: number; name: string }
  | { type: 'secondAttack'; name: string }
  | { type: 'gameover'; summary: SurvivorSummary };

export interface SurvivorUpgrade {
  id: string;
  name: string;
  description: string;
  /** Categorias de golpe em que o upgrade faz sentido (sem lista = todas). */
  for?: readonly MoveCategory[];
  /** Especializações só aparecem para o tipo de quem está jogando. */
  type?: SurvivorMove['type'];
  /** Limite por corrida; evita cartas esgotadas e escolhas sem efeito. */
  maxLevels?: number;
  /** Nome e texto falando do golpe de quem joga (ex.: "Bola de fogo mais forte"). */
  describe?: (move: SurvivorMove) => { name: string; description: string };
  apply: (p: SurvivorPlayer) => void;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

const GENERIC_SURVIVOR_UPGRADES: readonly SurvivorUpgrade[] = [
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
  { id: 'velocity', name: 'Velocidade de saída', description: '+18% na velocidade dos projéteis.', for: ['projetil'], maxLevels: 1, apply: (p) => { p.projectileSpeed = round1(p.projectileSpeed * 1.18); } },
  { id: 'renewal', name: 'Renovação', description: '+15 de vida máxima e cura imediatamente.', maxLevels: 1, apply: (p) => { p.maxHp += 15; p.hp = p.maxHp; } },
  { id: 'tempo', name: 'Passo cadenciado', description: '+8% de velocidade de movimento.', maxLevels: 1, apply: (p) => { p.speed = round1(p.speed * 1.08); } },
  { id: 'resonance', name: 'Ressonância', description: '+10% de dano no golpe principal.', maxLevels: 1, apply: (p) => { p.attackDamage = Math.min(60, round1(p.attackDamage * 1.1)); } },
] as const;

/** Especializações enxutas por tipo. Todas têm limite de uma escolha para não soterrar as builds em bônus lineares. */
function typeUpgrade(type: PokemonType, id: string, name: string, description: string, apply: (p: SurvivorPlayer) => void, forCategories?: readonly MoveCategory[]): SurvivorUpgrade {
  return { id, type, name, description, maxLevels: 1, ...(forCategories ? { for: forCategories } : {}), apply };
}
function improveReach(p: SurvivorPlayer, factor: number): void {
  if (p.move.category === 'aura' || p.move.category === 'orbit') p.attackRadius = round1(p.attackRadius * factor);
  else p.attackRange = round1(p.attackRange * factor);
}

const TYPE_SURVIVOR_UPGRADES: readonly SurvivorUpgrade[] = [
  typeUpgrade('normal', 'normal-rhythm', 'Ritmo constante', '-10% na recarga do golpe principal.', (p) => { p.attackCooldownMs = Math.max(240, Math.round(p.attackCooldownMs * 0.9)); }),
  typeUpgrade('normal', 'normal-adapt', 'Ataque adaptável', '+12% de alcance ou raio do golpe principal.', (p) => { improveReach(p, 1.12); }),
  typeUpgrade('fire', 'fire-brasa', 'Brasa viajante', 'Queimaduras do golpe principal causam +25% de dano.', (p) => { p.upgradeLevels['fire-brasa'] = 0; }),
  typeUpgrade('fire', 'fire-combustion', 'Combustão controlada', '+12% de dano contra inimigos já queimando.', (p) => { p.upgradeLevels['fire-combustion'] = 0; }),
  typeUpgrade('water', 'water-tide', 'Maré de retorno', 'Empurrões do golpe principal ficam 50% mais fortes.', (p) => { p.upgradeLevels['water-tide'] = 0; }),
  typeUpgrade('water', 'water-current', 'Corrente favorável', '+10% de velocidade de movimento.', (p) => { p.speed = round1(p.speed * 1.1); }),
  typeUpgrade('electric', 'electric-arc', 'Arco residual', '+10% de dano contra inimigos molhados ou atordoados.', (p) => { p.upgradeLevels['electric-arc'] = 0; }),
  typeUpgrade('electric', 'electric-capacitor', 'Capacitor', '+12% de dano do golpe principal.', (p) => { p.attackDamage = Math.min(60, round1(p.attackDamage * 1.12)); }),
  typeUpgrade('grass', 'grass-roots', 'Raízes oportunistas', 'Acertos em inimigos semeados os atordoam por um instante.', (p) => { p.upgradeLevels['grass-roots'] = 0; }),
  typeUpgrade('grass', 'grass-harvest', 'Folhas amplas', '+18% de alcance ou raio do golpe principal.', (p) => { improveReach(p, 1.18); }),
  typeUpgrade('ice', 'ice-deep-cold', 'Frio profundo', 'Congela com 2 acúmulos de frio, mantendo o intervalo por alvo.', (p) => { p.upgradeLevels['ice-deep-cold'] = 0; }),
  typeUpgrade('ice', 'ice-shatter', 'Estilhaçar', '+15% de dano contra inimigos congelados.', (p) => { p.upgradeLevels['ice-shatter'] = 0; }),
  typeUpgrade('fighting', 'fighting-impact', 'Impacto firme', 'Empurrões do golpe principal ficam 50% mais fortes.', (p) => { p.upgradeLevels['fighting-impact'] = 0; }),
  typeUpgrade('fighting', 'fighting-stride', 'Passo de luta', '+12% de velocidade de movimento.', (p) => { p.speed = round1(p.speed * 1.12); }),
  typeUpgrade('poison', 'poison-dose', 'Dose concentrada', 'Dano por veneno do golpe principal aumenta 25%.', (p) => { p.upgradeLevels['poison-dose'] = 0; }),
  typeUpgrade('poison', 'poison-cloud', 'Nuvem persistente', '+18% de alcance ou raio do golpe principal.', (p) => { improveReach(p, 1.18); }),
  typeUpgrade('ground', 'ground-aftershock', 'Abalo secundário', '+15% de dano contra inimigos atordoados.', (p) => { p.upgradeLevels['ground-aftershock'] = 0; }),
  typeUpgrade('ground', 'ground-firm', 'Solo firme', '+20 de vida máxima e cura imediatamente.', (p) => { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); }),
  typeUpgrade('flying', 'flying-tailwind', 'Vento de cauda', '+12% de velocidade de movimento.', (p) => { p.speed = round1(p.speed * 1.12); }),
  typeUpgrade('flying', 'flying-gust', 'Rajada de abertura', '+15% de alcance ou raio do golpe principal.', (p) => { improveReach(p, 1.15); }),
  typeUpgrade('psychic', 'psychic-focus', 'Foco mental', '+12% de dano do golpe principal.', (p) => { p.attackDamage = Math.min(60, round1(p.attackDamage * 1.12)); }),
  typeUpgrade('psychic', 'psychic-field', 'Campo de distorção', 'Projéteis inimigos próximos ficam 10% mais lentos.', (p) => { p.upgradeLevels['psychic-field'] = 0; }),
  typeUpgrade('bug', 'bug-formation', 'Formação de enxame', 'Ecos de enxame passam de 20% para 25% do dano.', (p) => { p.upgradeLevels['bug-formation'] = 0; }),
  typeUpgrade('bug', 'bug-web', 'Teia de contenção', 'Inimigos atingidos ficam lentos por mais tempo.', (p) => { p.upgradeLevels['bug-web'] = 0; }),
  typeUpgrade('rock', 'rock-fragment', 'Fragmentação', '+15% de dano do golpe principal.', (p) => { p.attackDamage = Math.min(60, round1(p.attackDamage * 1.15)); }),
  typeUpgrade('rock', 'rock-armor', 'Pele rochosa', '+20 de vida máxima e cura imediatamente.', (p) => { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); }),
  typeUpgrade('ghost', 'ghost-haunt', 'Assombração', 'Ecos espectrais passam de 20% para 25% do dano.', (p) => { p.upgradeLevels['ghost-haunt'] = 0; }),
  typeUpgrade('ghost', 'ghost-phase', 'Travessia espectral', '+15% de alcance ou raio do golpe principal.', (p) => { improveReach(p, 1.15); }),
  typeUpgrade('dragon', 'dragon-pressure', 'Pressão dracônica', '+15% de dano contra chefes.', (p) => { p.upgradeLevels['dragon-pressure'] = 0; }),
  typeUpgrade('dragon', 'dragon-cadence', 'Cadência ancestral', '-10% na recarga do golpe principal.', (p) => { p.attackCooldownMs = Math.max(240, Math.round(p.attackCooldownMs * 0.9)); }),
  typeUpgrade('dark', 'dark-predation', 'Predação', '+12% de dano contra inimigos abaixo de metade da vida.', (p) => { p.upgradeLevels['dark-predation'] = 0; }),
  typeUpgrade('dark', 'dark-thirst', 'Sede disciplinada', 'Roubo de vida cura até 3 por ativação.', (p) => { p.upgradeLevels['dark-thirst'] = 0; }),
  typeUpgrade('steel', 'steel-plate', 'Placa reativa', 'Reduz 12% do dano recebido.', (p) => { p.upgradeLevels['steel-plate'] = 0; }),
  typeUpgrade('steel', 'steel-precision', 'Precisão de aço', '+12% de dano do golpe principal.', (p) => { p.attackDamage = Math.min(60, round1(p.attackDamage * 1.12)); }),
  typeUpgrade('fairy', 'fairy-charm', 'Encanto protetor', '+15 de vida máxima e cura imediatamente.', (p) => { p.maxHp += 15; p.hp = Math.min(p.maxHp, p.hp + 15); }),
  typeUpgrade('fairy', 'fairy-pulse', 'Pulso reconfortante', 'Roubo de vida cura até 3 por ativação.', (p) => { p.upgradeLevels['fairy-pulse'] = 0; }),
];

export const SURVIVOR_UPGRADES: readonly SurvivorUpgrade[] = [...GENERIC_SURVIVOR_UPGRADES, ...TYPE_SURVIVOR_UPGRADES];

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
 * Parâmetros centrais de ritmo e dificuldade. A comparação automatizada orienta regressões, mas não comprova equilíbrio;
 * o ajuste final ainda precisa de partidas reais em aparelho.
 */
export const BALANCE = {
  xpBase: 14,
  xpPerLevel: 9,
  bossHpBase: 150,
  bossHpPerWave: 45,
  bossSpeed: 62,
  bossDamageBase: 10,
  bossDamagePerWave: 2,
  enemyHpBase: 16,
  /** Vida extra a cada `enemyHpEverySec` segundos; a simulação agora usa os golpes reais das espécies. */
  enemyHpStep: 4,
  enemyHpEverySec: 30,
  enemyHpPerWave: 3,
  enemyDamageBase: 6,
  enemyDamageStep: 2,
  enemyDamageEverySec: 40,
  enemySpeedBase: 55,
  enemySpeedRandom: 25,
  /** Atiradores andam mais devagar para abrir espaço de reação. */
  rangedEnemySpeedMultiplier: 0.5,
  /** Velocidade dos projéteis inimigos (antes: 170). */
  hostileProjectileSpeed: 85,
  /** A aura reduz em 20% a velocidade de projéteis enquanto estiverem no seu raio. */
  auraProjectileSpeedMultiplier: 0.8,
  /** Intervalo entre nascimentos (ms) = início − porSegundo·t − porOnda·onda, nunca abaixo do piso. */
  spawnStartMs: 2400,
  spawnPerSecMs: 4,
  spawnPerWaveMs: 15,
  spawnFloorMs: 450,
  /** Intervalo de invulnerabilidade após qualquer acerto; dá tempo para reposicionar sem remover o perigo. */
  hitInvulnerabilityMs: 650,
  playerDamage: 10,
  playerCooldownMs: 600,
  /** Primeiro chefe e intervalo entre os seguintes (ms). */
  firstBossMs: 60_000,
  bossEveryMs: 90_000,
  /** Treinadores entram mais fortes sem alterar a curva dos inimigos comuns. */
  trainerStatMultiplier: 1.3,
  artifactDropChance: 0.08,
  artifactEliteDropChance: 0.2,
  artifactBossDropChance: 0.45,
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
  specialEffectsPerStep: 8,
} as const;

export function xpForLevel(level: number): number {
  return Math.round(BALANCE.xpBase + level * BALANCE.xpPerLevel);
}

export interface CreateSurvivorOptions {
  /** Resolve apenas a espécie visual, preservando os números da onda e do grau. */
  enemyDexId?: (enemy: Readonly<SurvivorEnemy>, elapsedMs: number) => number;
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
  /** Segundo Pokémon real elegível como apoio nesta corrida. */
  supportCandidate?: SurvivorSupportCandidate;
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
  /** Preparação estratégica opcional, liberada por objetivos de corridas concluídas. */
  preparation?: SurvivorPreparationId;
  /** Segundo tipo raro escolhido no início da corrida. */
  typeAffinity?: SurvivorTypeAffinity;
}

/** Técnica interna da Torre para que até Pokémon de um tipo tenham uma segunda opção desbloqueável. */
function secondaryMoveFor(move: SurvivorMove): SurvivorMove {
  const categories: readonly MoveCategory[] = ['projetil', 'area', 'cone', 'aura', 'orbit'];
  const category = categories[(categories.indexOf(move.category) + 1) % categories.length]!;
  return { ...move, category, name: `${move.name} secundário`, icon: '✦' };
}

export function createSurvivorState(seed: number, options: CreateSurvivorOptions): SurvivorState {
  const move = options.move ?? BASIC_MOVE;
  const prof = options.profile;
  const preparation = survivorPreparation(options.preparation);
  const secondMoveCandidate = options.secondMove ?? secondaryMoveFor(move);
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
    speed: (prof?.walkSpeed ?? 150) * preparation.speedMultiplier,
    level: 1,
    xp: 0,
    xpToNext: xpForLevel(1),
    attackDamage: (prof?.damage ?? BALANCE.playerDamage) * preparation.damageMultiplier,
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
    facing: 1,
    pickupRadius: PICKUP_RADIUS * preparation.pickupRadiusMultiplier,
    upgradeLevels: {},
    ...options.player,
  };
  return {
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
    enemyArchetypeFor: options.enemyArchetypeFor ?? null,
    secondMoveCandidate,
    supportCandidate: options.supportCandidate ?? null,
    support: null,
    secondAttackOffered: false,
    typeAffinity: options.typeAffinity ?? null,
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

function defaultArchetype(kind: number, boss: boolean, grade: SurvivorEnemyGrade, stableId = kind): SurvivorEnemyArchetype {
  if (boss || grade === 'chefao') return 'protetor';
  // O id nasce da mesma sequência nos modos normal e regional; usar ele mantém o combate idêntico
  // quando `kindCount` muda apenas a espécie visual.
  return (['perseguidor', 'flanqueador', 'atirador', 'suporte'] as const)[stableId % 4]!;
}

/**
 * Nasce um inimigo. `grade` muda o tamanho, HP, dano e orbe de XP:
 *  - `comum`: o inimigo normal, do grupo que vai aparecendo sozinho.
 *  - `elite`: Pokémon do treinador (minuto 5+): mais HP, mais dano, mais rápido, orbe maior ao morrer.
 *  - `chefao`: um dos 6 do chefão final (ou do infinito): maior ainda, dá bem mais XP.
 * `trainerId` liga os Pokémon do mesmo treinador para contarmos quando todos caíram.
 */
function spawnEnemy(state: SurvivorState, boss: boolean, grade: SurvivorEnemyGrade = 'comum', trainerId?: number): void {
  if (state.enemies.length >= ENEMY_BEHAVIOR_LIMITS.maxEnemies && !boss && grade === 'comum') return;
  const { x, y } = spawnPoint(state.rng);
  const t = state.elapsedMs / 1000;
  if (boss) {
    const hp = Math.round((BALANCE.bossHpBase + state.wave * BALANCE.bossHpPerWave) * state.infiniteScale);
    const id = state.nextId++;
    addEnemy(state, {
      id,
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
        archetype: state.enemyArchetypeFor?.({ kind: state.kindCount, boss: true, grade: 'comum' }) ?? defaultArchetype(state.kindCount, true, 'comum', id),
        specialTimerMs: 1800,
    });
    return;
  }
  const baseHp = BALANCE.enemyHpBase + Math.floor(t / BALANCE.enemyHpEverySec) * BALANCE.enemyHpStep + state.wave * BALANCE.enemyHpPerWave;
  const baseDmg = BALANCE.enemyDamageBase + Math.floor(t / BALANCE.enemyDamageEverySec) * BALANCE.enemyDamageStep;
  // Treinadores (elite) têm +5× HP e +2× dano; o chefão (do time dos 6) ainda mais pesado.
  const trainerMul = grade === 'comum' ? 1 : BALANCE.trainerStatMultiplier;
  const hpMul = (grade === 'chefao' ? 7 : grade === 'elite' ? 5 : 1) * trainerMul;
  const dmgMul = (grade === 'chefao' ? 2.5 : grade === 'elite' ? 2 : 1) * trainerMul;
  const speed = (grade === 'comum'
    ? BALANCE.enemySpeedBase + state.rng() * BALANCE.enemySpeedRandom
    : grade === 'elite' ? 72 + state.rng() * 18 : 60 + state.rng() * 15) * (0.9 + Math.min(0.4, state.infiniteScale * 0.1));
  const hp = Math.round(baseHp * hpMul * state.infiniteScale);
  const kind = Math.floor(state.rng() * state.kindCount);
  const id = state.nextId++;
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
    archetype: state.enemyArchetypeFor?.({ kind, boss: false, grade }) ?? defaultArchetype(kind, false, grade, id),
    specialTimerMs: grade === 'chefao' ? 1800 : 2400,
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
export function rollUpgrades(rng: Rng, count = 3, move: SurvivorMove = BASIC_MOVE, player?: SurvivorPlayer): SurvivorUpgradeOption[] {
  const pool = SURVIVOR_UPGRADES.filter((u) =>
    (!u.for || u.for.includes(move.category))
    && (!u.type || u.type === move.type)
    && (player?.upgradeLevels[u.id] ?? 0) < (u.maxLevels ?? Number.POSITIVE_INFINITY),
  );
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
  const options = rollUpgrades(state.rng, 3, state.player.move, state.player);
  const evolve = evolutionOffer(state);
  if (evolve) options.splice(options.length - 1, 1, evolve);
  else if (!state.secondAttackOffered && state.player.level >= 6 && state.supportCandidate) {
    state.secondAttackOffered = true;
    options.splice(options.length - 1, 1, {
      id: 'second-attack',
      name: `Chamar apoio: ${state.supportCandidate.name}`,
      description: `${state.supportCandidate.move.icon} Ataca da sua posição com recarga própria. Não recebe upgrades nem pode ser atingido.`,
    });
  }
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
  } else if (id === 'second-attack') {
    if (offered && state.supportCandidate && !state.support) {
      const candidate = state.supportCandidate;
      const move = candidate.move;
      const p = state.player;
      p.secondMove = move;
      p.secondAttackTimerMs = 0;
      p.secondAttackDamage = round1(candidate.profile.damage * 0.45);
      p.secondAttackCooldownMs = Math.max(500, Math.round(candidate.profile.cooldownMs * 1.45));
      p.secondAttackRange = candidate.profile.range;
      p.secondAttackRadius = candidate.profile.radius;
      state.support = {
        ...candidate,
        x: p.x - 24,
        y: p.y + 18,
        attackTimerMs: 0,
        damageFactor: 0.45,
      };
      state.secondMoveCandidate = null;
      state.supportCandidate = null;
      events.push({ type: 'secondAttack', name: candidate.name });
    }
  } else {
    const upgrade = SURVIVOR_UPGRADES.find((u) => u.id === id);
    // Upgrades comuns também precisam ser uma escolha real da rodada. Isso impede que uma
    // chamada atrasada ou manipulada aplique um bônus que nunca foi oferecido.
    if (upgrade && offered) {
      upgrade.apply(state.player);
      state.player.upgradeLevels[id] = (state.player.upgradeLevels[id] ?? 0) + 1;
    }
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
const hasUpgrade = (player: SurvivorPlayer, id: string): boolean => (player.upgradeLevels[id] ?? 0) > 0;

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
      e.stunMs = Math.max(e.stunMs ?? 0, e.boss ? 90 : 220);
      break;
    case 'empurrar': {
      const dx = e.x - from.x;
      const dy = e.y - from.y;
      const d = Math.hypot(dx, dy) || 1;
      const push = e.boss ? 1.5 : 5;
      e.x += (dx / d) * push;
      e.y += (dy / d) * push;
      break;
    }
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
function hitEnemy(state: SurvivorState, e: SurvivorEnemy, damage: number, from: { x: number; y: number }, attackMove = state.player.move, allowFollowUp = true): void {
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
  const environmentalDamage = damage * upgradeMultiplier
    * (synergy?.damageMultiplier ?? 1)
    * survivorBiomeDamageMultiplier(state.elapsedMs, from.x, from.y, move.type);
  const reducedDamage = e.protectedMs && e.protectedMs > 0 ? environmentalDamage * 0.75 : environmentalDamage;
  e.hp -= reducedDamage;
  e.hitFlashMs = 90;
  if (synergy?.consume) e[synergy.consume] = 0;
  if (synergy?.refreshSlowMs) e.slowMs = Math.max(e.slowMs ?? 0, synergy.refreshSlowMs);
  Object.assign(e, survivorElementalStatus(move.type));
  if (move === p.move && move.type === 'grass' && hasUpgrade(p, 'grass-roots') && wasSeeded) {
    e.stunMs = Math.max(e.stunMs ?? 0, e.boss ? 100 : 250);
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
          e.stunMs = e.boss ? Math.max(e.stunMs ?? 0, 150) : Math.max(e.stunMs ?? 0, 550);
        }
      }
      break;
    case 'atordoar':
      e.stunMs = e.boss ? EFFECT_MS.bossStun : EFFECT_MS.stun;
      break;
    case 'empurrar': {
      const dx = e.x - from.x;
      const dy = e.y - from.y;
      const d = Math.hypot(dx, dy) || 1;
       const strongerPush = move === p.move && ((move.type === 'water' && hasUpgrade(p, 'water-tide')) || (move.type === 'fighting' && hasUpgrade(p, 'fighting-impact')));
       const push = (e.boss ? 3 : 11) * (strongerPush ? 1.5 : 1);
      e.x += (dx / d) * push;
      e.y += (dy / d) * push;
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
    });
  }
}

/** Ataque do apoio: nasce sempre no jogador e usa o perfil congelado do Pokémon escolhido. */
function attackSupport(state: SurvivorState): boolean {
  const p = state.player;
  const support = state.support;
  if (!support) return false;
  const { move, profile } = support;
  const damage = round1(profile.damage * support.damageFactor);
  const range = profile.range;
  const radius = profile.radius;
  if (move.category === 'projetil') {
    const target = nearestEnemies(state, range, 1)[0];
    if (!target) return false;
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    state.projectiles.push({ id: state.nextId++, x: p.x, y: p.y, vx: Math.cos(angle) * profile.projectileSpeed, vy: Math.sin(angle) * profile.projectileSpeed, damage, pierce: move.effect === 'atravessar' ? 1 : 0, lifeMs: 1500, hit: [], canChain: move.effect === 'saltar', size: Math.max(3, profile.projectileSize * 0.8), move, source: 'support' });
    return true;
  }
  if (move.category === 'aura' || move.category === 'orbit') {
    let hits = 0;
    for (const enemy of state.enemies) {
      if (Math.hypot(enemy.x - p.x, enemy.y - p.y) <= radius + enemy.radius) { hitEnemy(state, enemy, damage, p, move); hits++; }
    }
    drain(state, hits, move);
    state.fx.push({ kind: 'pulse', x: p.x, y: p.y, r: radius, color: move.color, ageMs: 0, lifeMs: 260 });
    return true;
  }
  if (move.category === 'cone') {
    let hits = 0;
    for (const enemy of state.enemies) {
      const dx = enemy.x - p.x; const dy = enemy.y - p.y; const distance = Math.hypot(dx, dy);
      if (distance <= range + enemy.radius && dx * p.facing / (distance || 1) >= 0.35) { hitEnemy(state, enemy, damage, p, move); hits++; }
    }
    drain(state, hits, move);
    return hits > 0;
  }
  const target = nearestEnemies(state, range, 1)[0];
  if (!target) return false;
  let hits = 0;
  for (const enemy of state.enemies) {
    if (Math.hypot(enemy.x - target.x, enemy.y - target.y) <= radius + enemy.radius) { hitEnemy(state, enemy, damage, p, move); hits++; }
  }
  drain(state, hits, move);
  state.fx.push({ kind: 'blast', x: target.x, y: target.y, r: radius, color: move.color, ageMs: 0, lifeMs: 320 });
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
  if (move.category === 'aura' || move.category === 'orbit') {
    // A aura pulsa sempre (dá para ver o raio), mesmo sem ninguém dentro.
    const pulseRadius = p.attackRadius * 0.8;
    let hits = 0;
    for (const e of state.enemies) {
      const distance = Math.hypot(e.x - p.x, e.y - p.y);
      // A órbita também alcança quem encosta no jogador. Antes havia uma faixa interna sem dano,
      // que punia Inseto/Planta justamente quando precisavam de cobertura próxima.
       const inRange = distance <= pulseRadius + e.radius;
      if (inRange) {
        hitEnemy(state, e, artifactDamage(state), p);
        hits++;
      }
    }
    drain(state, hits, move);
    // A órbita intercepta no máximo um projétil por pulso e somente dentro do seu alcance.
    if (move.category === 'orbit') {
      const projectileIndex = state.hostileProjectiles.findIndex((projectile) =>
        Math.hypot(projectile.x - p.x, projectile.y - p.y) <= pulseRadius + projectile.size,
      );
      if (projectileIndex >= 0) state.hostileProjectiles.splice(projectileIndex, 1);
    }
    state.fx.push({ kind: 'pulse', x: p.x, y: p.y, r: pulseRadius, color: move.color, ageMs: 0, lifeMs: 360 });
    return true;
  }
  if (move.category === 'cone') {
    let hits = 0;
    const direction = p.facing;
    for (const e of state.enemies) {
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= attackRange + e.radius && dx * direction / (distance || 1) >= 0.35) {
        hitEnemy(state, e, artifactDamage(state), p);
        hits++;
      }
    }
    drain(state, hits, move);
    // O golpe frontal pode aparar um projétil próximo por ataque, sem limpar ondas inteiras.
    const projectileIndex = state.hostileProjectiles.findIndex((projectile) => {
      const dx = projectile.x - p.x;
      const dy = projectile.y - p.y;
      const distance = Math.hypot(dx, dy);
      return distance <= attackRange + projectile.size && dx * direction / (distance || 1) >= 0.35;
    });
    if (projectileIndex >= 0) state.hostileProjectiles.splice(projectileIndex, 1);
    state.fx.push({ kind: 'blast', x: p.x + direction * attackRange * 0.55, y: p.y, r: attackRange * 0.55, color: move.color, ageMs: 0, lifeMs: 300 });
    return true;
  }
  const targets = nearestEnemies(state, attackRange, p.shots);
  if (targets.length === 0) return false;
  let hits = 0;
  for (const t of targets) {
    const center = { x: t.x, y: t.y };
    for (const e of state.enemies) {
      if (Math.hypot(e.x - center.x, e.y - center.y) <= p.attackRadius + e.radius) {
        hitEnemy(state, e, artifactDamage(state), center);
        hits++;
      }
    }
    state.fx.push({ kind: 'blast', x: center.x, y: center.y, r: p.attackRadius, color: move.color, ageMs: 0, lifeMs: 420 });
  }
  drain(state, hits, move);
  return true;
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

function spawnHostileProjectile(state: SurvivorState, enemy: SurvivorEnemy, target: SurvivorPlayer): void {
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
    damage: Math.max(1, Math.round(enemy.damage * 0.7)), lifeMs: 2600, size: enemy.grade === 'chefao' ? 8 : enemy.grade === 'elite' ? 7 : 6,
    grade: enemy.grade, ...(effect ? { effect } : {}),
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
        let healed = 0;
        for (const other of state.enemies) {
          if (other === enemy || other.hp <= 0 || healed >= ENEMY_BEHAVIOR_LIMITS.healingTargetsPerPulse) continue;
          if (Math.hypot(other.x - enemy.x, other.y - enemy.y) <= 110 && other.hp < other.maxHp) {
            other.hp = Math.min(other.maxHp, other.hp + Math.max(1, Math.round(other.maxHp * 0.08)));
            healed++;
          }
        }
        enemy.specialTimerMs = 5200;
      }
      else enemy.specialTimerMs = 1200;
    }
  }
  return { x: targetX, y: targetY };
}

function artifactDamage(state: SurvivorState): number {
  return state.player.artifactPowerMs > 0 ? state.player.attackDamage * BALANCE.artifactPowerMultiplier : state.player.attackDamage;
}

function artifactKind(rng: Rng): SurvivorArtifactKind {
  const roll = rng();
  return roll < 0.34 ? 'speed' : roll < 0.67 ? 'heal' : 'power';
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
  const dt = dtMs / 1000;
  const previousElapsedMs = state.elapsedMs;
  state.elapsedMs += dtMs;
  if (previousElapsedMs < SURVIVOR_LOVE_CANDY_MS && state.elapsedMs >= SURVIVOR_LOVE_CANDY_MS) {
    events.push({ type: 'milestone', id: 'ten-minutes', reward: 'love-candy' });
  }
  if (previousElapsedMs < SURVIVOR_MEGA_SHARD_MS && state.elapsedMs >= SURVIVOR_MEGA_SHARD_MS) {
    events.push({ type: 'milestone', id: 'twenty-minutes', reward: 'mega-stone-shard' });
  }
  if (advanceSpecialEncounter(state, 0)) return events;
  const p = state.player;
  p.artifactSpeedMs = Math.max(0, p.artifactSpeedMs - dtMs);
  p.artifactPowerMs = Math.max(0, p.artifactPowerMs - dtMs);
  p.artifactShieldMs = Math.max(0, p.artifactShieldMs - dtMs);
  stepSurvivorSpecial(state, input, dtMs, ARENA_W, ARENA_H, PLAYER_RADIUS);

  // Movimento do jogador, com a arena como cerca.
  const len = Math.hypot(input.dx, input.dy);
  if (len > 0.001 && !(state.special.selected === 'dash' && state.special.activeMs > 0)) {
    const ux = input.dx / len;
    const uy = input.dy / len;
    const terrainSpeed = survivorBiomeMovementMultiplier(state.elapsedMs, p.x, p.y);
    const artifactSpeed = p.artifactSpeedMs > 0 ? BALANCE.artifactSpeedMultiplier : 1;
    p.x = clamp(p.x + ux * p.speed * artifactSpeed * terrainSpeed * dt, PLAYER_RADIUS, ARENA_W - PLAYER_RADIUS);
    p.y = clamp(p.y + uy * p.speed * artifactSpeed * terrainSpeed * dt, PLAYER_RADIUS, ARENA_H - PLAYER_RADIUS);
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

  // IA parametrizada: todos compartilham a mesma resolução de movimento/colisão, mas cada arquétipo
  // escolhe um alvo e uma ação especial limitada por recarga.
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
    const stunned = !!e.stunMs && e.stunMs > 0;
    if (stunned) e.stunMs = Math.max(0, (e.stunMs ?? 0) - dtMs);
    const target = updateEnemyBehavior(state, e, dtMs);
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const rangedMultiplier = e.archetype === 'atirador' ? BALANCE.rangedEnemySpeedMultiplier : 1;
    const statusMultiplier = e.slowMs && e.slowMs > 0 ? 0.5 : 1;
    const speed = stunned ? 0 : e.speed * rangedMultiplier * statusMultiplier;
    e.x += (dx / d) * speed * dt;
    e.y += (dy / d) * speed * dt;
    const playerDistance = Math.hypot(p.x - e.x, p.y - e.y);
    if (playerDistance < PLAYER_RADIUS + e.radius && p.invulnMs <= 0 && !specialProtects(state)) {
        const incoming = Math.ceil((hasUpgrade(p, 'steel-plate') ? e.damage * 0.88 : e.damage) * (p.artifactShieldMs > 0 ? 0.65 : 1));
      p.hp = Math.max(0, p.hp - incoming);
      p.invulnMs = BALANCE.hitInvulnerabilityMs;
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
         const incoming = Math.ceil((hasUpgrade(p, 'steel-plate') ? proj.damage * 0.88 : proj.damage) * (p.artifactShieldMs > 0 ? 0.65 : 1));
        p.hp = Math.max(0, p.hp - incoming);
        p.invulnMs = BALANCE.hitInvulnerabilityMs;
      }
      return false;
    }
    return true;
  });

  // Autoataque com o golpe do tipo (projétil, aura ou área).
  p.attackTimerMs = Math.max(0, p.attackTimerMs - dtMs);
  if (p.attackTimerMs <= 0 && attack(state)) p.attackTimerMs = p.attackCooldownMs;
  if (state.support) {
    const support = state.support;
    // Posição visual apenas: o apoio alcança o jogador com a mesma velocidade normal, sem criar uma hitbox.
    const desiredX = p.x - p.facing * 26;
    const desiredY = p.y + 18;
    const dxSupport = desiredX - support.x;
    const dySupport = desiredY - support.y;
    const distance = Math.hypot(dxSupport, dySupport);
    const follow = Math.min(distance, p.speed * dt);
    if (distance > 0.01) { support.x += dxSupport / distance * follow; support.y += dySupport / distance * follow; }
    support.attackTimerMs = Math.max(0, support.attackTimerMs - dtMs);
    if (support.attackTimerMs <= 0 && attackSupport(state)) support.attackTimerMs = Math.max(500, Math.round(support.profile.cooldownMs * 1.45));
    p.secondAttackTimerMs = support.attackTimerMs;
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
        hitEnemy(state, e, proj.damage, { x: proj.x - proj.vx * 0.05, y: proj.y - proj.vy * 0.05 }, proj.move);
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
            chained.push({ id: state.nextId++, x: e.x, y: e.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, damage: round1(proj.damage * 0.7), pierce: 0, lifeMs: 600, hit: [...proj.hit], canChain: false, size: proj.size, move: proj.move, source: proj.source });
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
      const dropChance = e.boss ? BALANCE.artifactBossDropChance : e.grade === 'chefao' || e.grade === 'elite' ? BALANCE.artifactEliteDropChance : BALANCE.artifactDropChance;
      if (state.rng() < dropChance) state.artifacts.push({ id: state.nextId++, x: e.x, y: e.y, kind: artifactKind(state.rng) });
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
        state.projectiles = [];
        state.hostileProjectiles = [];
        state.fx = [];
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
  state.artifacts = state.artifacts.filter((artifact) => {
    if (Math.hypot(artifact.x - p.x, artifact.y - p.y) > p.pickupRadius) return true;
    if (artifact.kind === 'speed') p.artifactSpeedMs = Math.max(p.artifactSpeedMs, BALANCE.artifactDurationMs);
    else if (artifact.kind === 'power') p.artifactPowerMs = Math.max(p.artifactPowerMs, BALANCE.artifactDurationMs);
    else {
      p.hp = Math.min(p.maxHp, p.hp + Math.max(18, Math.round(p.maxHp * 0.28)));
      p.artifactShieldMs = 3_000;
    }
    state.fx.push({ kind: 'artifact', artifact: artifact.kind, x: p.x, y: p.y, r: 24, color: artifact.kind === 'speed' ? '#7bdcff' : artifact.kind === 'power' ? '#ffb35c' : '#ff8fbb', ageMs: 0, lifeMs: 620 });
    return false;
  });
  levelUp(state, events);

  if (p.hp <= 0 && !state.over) {
    state.over = true;
    state.projectiles = [];
    state.hostileProjectiles = [];
    state.fx = [];
    events.push({
      type: 'gameover',
      summary: { survivedMs: state.elapsedMs, level: p.level, stage: p.stage, kills: state.kills, wave: state.wave, trainersBeaten: state.trainersBeaten, bossesBeaten: state.bossesBeaten, finalBossBeaten: state.finalBossBeaten, infinite: state.infinite },
    });
  }

  return events;
}
