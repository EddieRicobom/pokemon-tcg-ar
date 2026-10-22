import { seededRng } from './battle';
import type { Rng } from './battle';
import type { AttackProfile, MoveCategory, SurvivorMove } from './survivor-moves';
import { survivorBiomeDamageMultiplier, survivorBiomeMovementMultiplier, survivorBiomeProjectileSpeedMultiplier } from './survivor-biomes';
import { survivorElementalStatus, survivorSynergyFor } from './survivor-synergies';
import { survivorPreparation } from './survivor-preparations';
import type { SurvivorPreparationId } from './survivor-preparations';
import { advanceSpecialEncounter, breakSurvivorShield, createSurvivorSpecial, specialProtects, stepSurvivorSpecial } from './survivor-specials';
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

/** Dimensões do mundo jogável. A malha foi ampliada em 3× nos dois eixos; a câmera continua mostrando só uma janela. */
export const ARENA_W = 2880;
export const ARENA_H = 1920;
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
  /** Multiplicador acumulado de XP dos buffs de experiência da corrida. */
  xpMultiplier: number;
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
  artifactMagnetMs: number;
  artifactFocusMs: number;
  /** -1 olhando para a esquerda, 1 para a direita (para virar o sprite). */
  facing: -1 | 1;
  /** Alcance para coletar orbe de XP ao passar perto (sobe com o upgrade "Ímã de XP"). */
  pickupRadius: number;
  /** Quantas cartas aparecem em cada oferta; o jogador continua escolhendo apenas uma. */
  upgradeChoices: number;
  /** Rerrolagens de ofertas de upgrade concedidas pelo Desejo de Jirachi. */
  upgradeRerolls: number;
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

/** Limite de apoios simultâneos: complementam o protagonista sem substituir a build dele. */
export const MAX_SURVIVOR_SUPPORTS = 5;
/** Depois do primeiro apoio garantido, cada novo candidato entra como uma carta rara comum. */
export const SURVIVOR_SUPPORT_RARE_OFFER_CHANCE = 0.3;

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

export type SurvivorArtifactKind = 'speed' | 'heal' | 'power' | 'magnet' | 'focus' | 'pokeball';

/** Texto único para HUD e avisos: descreve exatamente os bônus temporários aplicados pelo motor. */
export const SURVIVOR_ARTIFACT_DETAILS: Record<SurvivorArtifactKind, { icon: string; name: string; description: string }> = {
  speed: { icon: '⚡', name: 'Passo relâmpago', description: '+35% de velocidade por 8 s.' },
  power: { icon: '✦', name: 'Núcleo de poder', description: '+25% de dano por 8 s.' },
  heal: { icon: '♥', name: 'Pulso vital', description: 'Cura 28% da vida (mín. 18) e protege por 3 s.' },
  magnet: { icon: '🧲', name: 'Ímã de experiência', description: '+70% de alcance para coletar orbes por 8 s.' },
  focus: { icon: '◈', name: 'Foco preciso', description: 'Reduz em 20% a recarga do golpe por 8 s.' },
  pokeball: { icon: '★', name: 'Pokébola errante', description: 'Reúne opções de Digital Pokémon para escolher ao fim da corrida.' },
};

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
  /** Orbe raro que concede o dobro do valor base ao ser coletado. Opcional para compatibilidade com estados antigos. */
  doubleXp?: boolean;
}

export interface SurvivorUpgradeOption {
  id: string;
  name: string;
  description: string;
  rarity?: SurvivorUpgradeRarity;
  /** Valor já sorteado para esta carta; aplicar a escolha não sorteia novamente. */
  value?: number;
}

export type SurvivorUpgradeRarity = 'normal' | 'raro' | 'lendario' | 'ancestral';
export const SURVIVOR_UPGRADE_RARITIES: Record<SurvivorUpgradeRarity, { label: string; icon: string; weight: number; minLevel: number; impact: string }> = {
  normal: { label: 'Poké Ball', icon: '⚪', weight: 60, minLevel: 1, impact: 'Ajuste pequeno e útil' },
  raro: { label: 'Great Ball', icon: '🔵', weight: 30, minLevel: 3, impact: 'Muda a força ou o alcance da estratégia' },
  lendario: { label: 'Ultra Ball', icon: '🟡', weight: 8, minLevel: 8, impact: 'Abre uma vantagem marcante' },
  ancestral: { label: 'Master Ball', icon: '🟣', weight: 2, minLevel: 12, impact: 'Transforma a corrida; uma escolha por partida' },
};

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
  /** Pokébolas especiais recolhidas nesta corrida; cada uma amplia a seleção no fim. */
  digitalPokeballs: number;
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
  /** Candidatos restantes para as próximas ofertas de apoio. */
  supportCandidates: SurvivorSupportCandidate[];
  /** Apoios recrutados nesta corrida; nenhum recebe upgrades, vida ou hitbox própria. */
  supports: SurvivorSupport[];
  support: SurvivorSupport | null;
  /** Distingue a primeira oferta garantida das ofertas raras que podem voltar depois de recusadas. */
  supportCandidateGuaranteed: boolean;
  secondAttackOffered: boolean;
  /** Efeito do segundo tipo escolhido no início; não causa dano extra nem recebe upgrades. */
  typeAffinity: SurvivorTypeAffinity | null;
  /** Tipos secundários reais que podem ser escolhidos depois do primeiro treinador. */
  typeAffinityChoices: PokemonType[];
  /** A oferta já apareceu; evita repetir a mesma escolha na corrida. */
  typeAffinityOffered: boolean;
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
  /** Quantas Pokébolas especiais foram realmente recolhidas durante a corrida. */
  digitalPokeballs: number;
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
  | { type: 'trainerSpawn'; count: number; final: boolean; trainerId: number }
  /** Treinador derrotado (todos os Pokémon dele caíram). */
  | { type: 'trainerDown'; final: boolean }
  /** Primeiro treinador derrotado: oferece a afinidade do segundo tipo real da espécie. */
  | { type: 'typeAffinityOffer'; types: PokemonType[] }
  | { type: 'evolve'; dexId: number; name: string }
  | { type: 'secondAttack'; name: string }
  /** Artefato do chão realmente alcançado pelo jogador; a UI explica o efeito aplicado. */
  | { type: 'artifactCollected'; kind: SurvivorArtifactKind }
  | { type: 'gameover'; summary: SurvivorSummary };

export interface SurvivorUpgrade {
  id: string;
  name: string;
  description: string;
  rarity: SurvivorUpgradeRarity;
  /** Categorias de golpe em que o upgrade faz sentido (sem lista = todas). */
  for?: readonly MoveCategory[];
  /** Especializações só aparecem para o tipo de quem está jogando. */
  type?: SurvivorMove['type'];
  /** Limite por corrida; ausente em bônus incrementais que podem empilhar. */
  maxLevels?: number;
  /** Upgrade anterior necessário para liberar esta carta em uma trilha. */
  requires?: string;
  /** Pequena variação numérica, sorteada quando a carta aparece. */
  valueRange?: readonly [number, number];
  describeValue?: (move: SurvivorMove, value: number) => { name: string; description: string };
  /** Nome e texto falando do golpe de quem joga (ex.: "Bola de fogo mais forte"). */
  describe?: (move: SurvivorMove) => { name: string; description: string };
  apply: (p: SurvivorPlayer, value?: number) => void;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const SURVIVOR_RARITY_ORDER: readonly SurvivorUpgradeRarity[] = ['normal', 'raro', 'lendario', 'ancestral'];

const GENERIC_SURVIVOR_UPGRADES: readonly SurvivorUpgrade[] = [
  {
    id: 'power', rarity: 'raro', name: 'Golpe mais forte', description: '+20% de dano no ataque.', valueRange: [16, 24],
    describeValue: (m, value) => ({ name: 'Golpe mais forte', description: `${m.name}: +${value}% de dano, até 60.` }),
    apply: (p, value = 20) => {
      // teto absoluto em 60 para o dano (o teste espera 60)
      if (p.attackDamage >= 60) return;
      p.attackDamage = Math.min(60, round1(p.attackDamage * (1 + value / 100)));
    },
  },
  {
    id: 'haste', rarity: 'raro', name: 'Recarga menor', description: '-15% no tempo entre ataques.', valueRange: [12, 18],
    describeValue: (m, value) => ({ name: 'Recarga menor', description: `${m.name}: -${value}% no tempo entre ${m.category === 'aura' ? 'os pulsos' : 'ataques'}.` }),
    apply: (p, value = 15) => {
      // não deixa cair abaixo de 240 ms (o teste espera 240)
      if (p.attackCooldownMs <= 240) return;
      p.attackCooldownMs = Math.max(240, Math.round(p.attackCooldownMs * (1 - value / 100)));
    },
  },
  { id: 'legs', rarity: 'normal', name: 'Passo mais rápido', description: '+12% de velocidade ao andar.', valueRange: [9, 14], describeValue: (_m, value) => ({ name: 'Passo mais rápido', description: `+${value}% de velocidade ao andar.` }), apply: (p, value = 12) => { p.speed = round1(p.speed * (1 + value / 100)); } },
  { id: 'vigor', rarity: 'normal', name: 'Mais vida', description: '+25 no HP máximo e cura 25.', valueRange: [20, 30], describeValue: (_m, value) => ({ name: 'Mais vida', description: `+${value} no HP máximo e cura ${value}.` }), apply: (p, value = 25) => { p.maxHp += value; p.hp = Math.min(p.maxHp, p.hp + value); } },
  {
    id: 'range', rarity: 'raro', name: 'Alcance maior', description: '+20% no alcance do golpe.', for: ['projetil', 'area', 'cone'], valueRange: [16, 24],
    describeValue: (_m, value) => ({ name: 'Alcance maior', description: `+${value}% no alcance do golpe.` }),
    apply: (p, value = 20) => { p.attackRange = round1(p.attackRange * (1 + value / 100)); },
  },
  {
    id: 'more-upgrade-choices', rarity: 'raro', name: 'Mochila de escolhas',
    description: '+1 opção nas ofertas de upgrade (você ainda escolhe apenas uma).', maxLevels: 2,
    apply: (p) => { p.upgradeChoices = Math.min(5, Math.max(3, p.upgradeChoices) + 1); },
  },
  {
    id: 'jirachi-reroll', rarity: 'raro', name: 'Desejo de Jirachi',
    description: 'Ganha 1 rerrolagem de oferta. O desejo é consumido ao trocar as cartas.', maxLevels: 3,
    apply: (p) => { p.upgradeRerolls = Math.min(3, Math.max(0, p.upgradeRerolls) + 1); },
  },
  { id: 'xp-boost-15', rarity: 'normal', name: 'Rota de experiência', description: '+15% de XP recebido dos orbes.', maxLevels: 1, apply: (p) => { p.xpMultiplier = Math.max(p.xpMultiplier ?? 1, 1.15); } },
  { id: 'xp-boost-25', rarity: 'raro', name: 'Rota de experiência II', description: '+25% de XP recebido dos orbes.', maxLevels: 1, requires: 'xp-boost-15', apply: (p) => { p.xpMultiplier = Math.max(p.xpMultiplier ?? 1, 1.25); } },
  { id: 'xp-boost-35', rarity: 'lendario', name: 'Rota de experiência III', description: '+35% de XP recebido dos orbes.', maxLevels: 1, requires: 'xp-boost-25', apply: (p) => { p.xpMultiplier = Math.max(p.xpMultiplier ?? 1, 1.35); } },
  { id: 'xp-boost-50', rarity: 'ancestral', name: 'Rota de experiência IV', description: '+50% de XP recebido dos orbes.', maxLevels: 1, requires: 'xp-boost-35', apply: (p) => { p.xpMultiplier = Math.max(p.xpMultiplier ?? 1, 1.5); } },
  {
    id: 'multishot', rarity: 'lendario', name: 'Disparo múltiplo', description: '+1 projétil por disparo, em leque.', for: ['projetil', 'area'],
    describe: (m) => (m.category === 'area'
      ? { name: 'Explosão extra', description: `${m.name}: +1 explosão por ataque, em outro inimigo.` }
      : { name: 'Disparo múltiplo', description: '+1 projétil por disparo, em leque.' }),
    apply: (p) => { p.shots = Math.min(5, p.shots + 1); },
  },
  {
    id: 'pierce', rarity: 'lendario', name: 'Golpe perfurante', description: 'O golpe atravessa +1 inimigo antes de sumir.', for: ['projetil'],
    apply: (p) => { p.pierce = Math.min(4, p.pierce + 1); },
  },
  {
    id: 'radius', rarity: 'raro', name: 'Golpe maior', description: '+20% no raio do golpe.', for: ['aura', 'area', 'orbit'], valueRange: [16, 24],
    describeValue: (m, value) => ({ name: 'Golpe maior', description: `${m.name}: +${value}% no ${m.category === 'aura' ? 'raio da aura' : 'raio do golpe'}.` }),
    apply: (p, value = 20) => { p.attackRadius = round1(p.attackRadius * (1 + value / 100)); },
  },
  { id: 'magnet', rarity: 'normal', name: 'Ímã de XP', description: '+30% no alcance para coletar orbes de XP.', valueRange: [24, 36], describeValue: (_m, value) => ({ name: 'Ímã de XP', description: `+${value}% no alcance para coletar orbes de XP.` }), apply: (p, value = 30) => { p.pickupRadius = round1(p.pickupRadius * (1 + value / 100)); } },
  { id: 'velocity', rarity: 'normal', name: 'Velocidade de saída', description: '+18% na velocidade dos projéteis.', for: ['projetil'], maxLevels: 1, valueRange: [15, 21], describeValue: (_m, value) => ({ name: 'Velocidade de saída', description: `+${value}% na velocidade dos projéteis.` }), apply: (p, value = 18) => { p.projectileSpeed = round1(p.projectileSpeed * (1 + value / 100)); } },
  { id: 'renewal', rarity: 'normal', name: 'Renovação', description: '+15 de vida máxima e cura 15.', maxLevels: 1, valueRange: [12, 18], describeValue: (_m, value) => ({ name: 'Renovação', description: `+${value} de vida máxima e cura ${value}.` }), apply: (p, value = 15) => { p.maxHp += value; p.hp = Math.min(p.maxHp, p.hp + value); } },
  { id: 'tempo', rarity: 'normal', name: 'Passo cadenciado', description: '+8% de velocidade de movimento.', maxLevels: 1, valueRange: [6, 10], describeValue: (_m, value) => ({ name: 'Passo cadenciado', description: `+${value}% de velocidade de movimento.` }), apply: (p, value = 8) => { p.speed = round1(p.speed * (1 + value / 100)); } },
  { id: 'resonance', rarity: 'normal', name: 'Ressonância', description: '+10% de dano no golpe principal.', maxLevels: 1, valueRange: [8, 12], describeValue: (_m, value) => ({ name: 'Ressonância', description: `+${value}% de dano no golpe principal, até 60.` }), apply: (p, value = 10) => { p.attackDamage = Math.min(60, round1(p.attackDamage * (1 + value / 100))); } },
] as const;

/** Especializações enxutas por tipo. Todas têm limite de uma escolha para não soterrar as builds em bônus lineares. */
function typeUpgrade(type: PokemonType, id: string, name: string, description: string, apply: (p: SurvivorPlayer) => void, forCategories?: readonly MoveCategory[]): SurvivorUpgrade {
  return { id, type, name, description, rarity: 'raro', maxLevels: 1, ...(forCategories ? { for: forCategories } : {}), apply };
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

/** Especializações que mudam o comportamento do golpe exigem mais tempo de corrida. */
const LEGENDARY_TYPE_UPGRADES = new Set([
  'fire-brasa', 'electric-arc', 'grass-roots', 'ice-deep-cold', 'poison-dose', 'ground-aftershock',
  'psychic-field', 'bug-formation', 'ghost-haunt', 'dragon-pressure', 'dark-thirst', 'steel-plate', 'fairy-pulse',
]);

const ANCESTRAL_SURVIVOR_UPGRADES: readonly SurvivorUpgrade[] = [
  {
    id: 'ancestral-vitality', rarity: 'ancestral', name: 'Coração ancestral',
    description: '+45 de vida máxima, cura 45 e aumenta a velocidade em 8%.', maxLevels: 1,
    apply: (p) => { p.maxHp += 45; p.hp = Math.min(p.maxHp, p.hp + 45); p.speed = round1(p.speed * 1.08); },
  },
  {
    id: 'ancestral-strike', rarity: 'ancestral', name: 'Golpe ancestral',
    description: '+25% de dano (até 60) e +12% de alcance ou raio.', maxLevels: 1,
    apply: (p) => { p.attackDamage = Math.min(60, round1(p.attackDamage * 1.25)); improveReach(p, 1.12); },
  },
  {
    id: 'ancestral-flow', rarity: 'ancestral', name: 'Fluxo ancestral',
    description: '-18% no tempo entre ataques (mínimo 240 ms) e +12% de velocidade.', maxLevels: 1,
    apply: (p) => { p.attackCooldownMs = Math.max(240, Math.round(p.attackCooldownMs * 0.82)); p.speed = round1(p.speed * 1.12); },
  },
];

export const SURVIVOR_UPGRADES: readonly SurvivorUpgrade[] = [
  ...GENERIC_SURVIVOR_UPGRADES,
  ...TYPE_SURVIVOR_UPGRADES.map((upgrade) => LEGENDARY_TYPE_UPGRADES.has(upgrade.id) ? { ...upgrade, rarity: 'lendario' as const } : upgrade),
  ...ANCESTRAL_SURVIVOR_UPGRADES,
];

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
  xpBase: 12,
  xpPerLevel: 8,
  bossHpBase: 150,
  bossHpPerWave: 45,
  bossSpeed: 62,
  bossDamageBase: 10,
  bossDamagePerWave: 2,
  enemyHpBase: 16,
  /** Vida extra a cada `enemyHpEverySec` segundos; a simulação agora usa os golpes reais das espécies. */
  enemyHpStep: 3,
  enemyHpEverySec: 30,
  enemyHpPerWave: 3,
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
  /** Primeiro chefe e intervalo entre os seguintes (ms). */
  firstBossMs: 60_000,
  bossEveryMs: 90_000,
  /** Treinadores entram mais fortes sem alterar a curva dos inimigos comuns. */
  trainerStatMultiplier: 1.3,
  /** Artefatos são uma válvula de recuperação: um pouco mais comuns após a escalada de inimigos. */
  artifactDropChance: 0.15,
  artifactEliteDropChance: 0.3,
  artifactBossDropChance: 0.5,
  /** Depois dos 10 minutos, uma morte pode deixar uma Pokébola especial. */
  digitalPokeballDropChance: 0.025,
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
  evolutions?: (dexId: number) => readonly SurvivorEvolutionOption[];
  player?: Partial<SurvivorPlayer>;
  /** Começa já no modo infinito (precisa ser destravado antes: `TrainerState.torre.infiniteUnlocked`). */
  infinite?: boolean;
  /** Preparação estratégica opcional, liberada por objetivos de corridas concluídas. */
  preparation?: SurvivorPreparationId;
  /** Segundo tipo raro escolhido no início da corrida. */
  typeAffinity?: SurvivorTypeAffinity;
  /** Tipos secundários reais da espécie; a escolha só aparece após o primeiro líder derrotado. */
  typeAffinityChoices?: readonly PokemonType[];
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
  const supportCandidates = [...(options.supportCandidates ?? (options.supportCandidate ? [options.supportCandidate] : []))].slice(0, MAX_SURVIVOR_SUPPORTS);
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
    xpMultiplier: 1,
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
    artifactMagnetMs: 0,
    artifactFocusMs: 0,
    facing: 1,
    pickupRadius: PICKUP_RADIUS * preparation.pickupRadiusMultiplier,
    upgradeChoices: 3,
    upgradeRerolls: 0,
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
    digitalPokeballs: 0,
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
  return base * (1 + BALANCE.earlySpawnIntervalBonus * early) * BALANCE.spawnRateMultiplier;
}

function earlyCurve(elapsedMs: number, start: number): number {
  const progress = Math.max(0, Math.min(1, elapsedMs / BALANCE.earlyGameMs));
  return start + (1 - start) * progress;
}

function closeRangeDamageMultiplier(state: SurvivorState): number {
  const category = state.player.move.category;
  return category === 'aura' || category === 'orbit' || category === 'cone' ? BALANCE.closeRangeDamageMultiplier : 1;
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
  events.push({ type: 'trainerSpawn', count, final, trainerId });
}

/** Resolve a aparência uma vez, depois de sortear os números de combate. */
function addEnemy(state: SurvivorState, enemy: SurvivorEnemy): void {
  if (state.enemyDexId) enemy.dexId = state.enemyDexId(enemy, state.elapsedMs);
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
    && level >= SURVIVOR_UPGRADE_RARITIES[u.rarity].minLevel
    && SURVIVOR_RARITY_ORDER.indexOf(u.rarity) >= minimumRank
    && !excludedIds.has(u.id)
    && (!u.requires || (player?.upgradeLevels[u.requires] ?? 0) > 0)
    && (u.rarity !== 'ancestral' || !alreadyAncestral)
    && (player?.upgradeLevels[u.id] ?? 0) < (u.maxLevels ?? Number.POSITIVE_INFINITY)
    && (!player || (u.id !== 'power' && u.id !== 'resonance' || player.attackDamage < 60))
    && (!player || u.id !== 'haste' || player.attackCooldownMs > 240)
    && (!player || u.id !== 'multishot' || player.shots < 5)
    && (!player || u.id !== 'pierce' || player.pierce < 4),
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
    picked.push({ id: u.id, rarity, ...(value === undefined ? {} : { value }), ...description });
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
 * Gasta um desejo de Jirachi para trocar a oferta atual. Cartas normais saem todas;
 * se a oferta já é toda rara ou melhor, preservamos uma carta a menos e garantimos
 * uma nova carta de faixa superior quando essa faixa já está liberada pelo nível.
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
  const rerolled = rollUpgrades(state.rng, rerollCount, state.player.move, state.player, {
    excludeIds: current.map((option) => option.id),
    ...(allRareOrBetter ? { minimumRarity: rerollMinimumRarity(state.player, floor) } : {}),
  });
  state.pendingUpgrade = [...preserved, ...rerolled];
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
  const options = rollUpgrades(state.rng, state.player.upgradeChoices, state.player.move, state.player);
  const evolve = evolutionOffer(state);
  if (evolve) options.splice(options.length - 1, 1, evolve);
  else if (!state.supportCandidate && !state.secondAttackOffered && state.player.level >= 6 && state.supportCandidates.length > 0) {
    const candidate = state.supportCandidates[0]!;
    state.supportCandidate = candidate;
    state.supportCandidateGuaranteed = true;
    state.secondAttackOffered = true;
    options.splice(options.length - 1, 1, {
      id: 'second-attack',
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
      rarity: 'raro',
      name: `Chamar apoio: ${candidate.name}`,
      description: `${candidate.move.icon} Ataca da sua posição com recarga própria. Não recebe upgrades nem pode ser atingido. Apoio ${state.supports.length + 1}/${MAX_SURVIVOR_SUPPORTS}.`,
    });
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
      evolvePlayer(state, next);
      events.push({ type: 'evolve', dexId: next.dexId, name: next.name });
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
  return roll < 0.24 ? 'speed' : roll < 0.48 ? 'heal' : roll < 0.72 ? 'power' : roll < 0.86 ? 'magnet' : 'focus';
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
  p.artifactMagnetMs = Math.max(0, p.artifactMagnetMs - dtMs);
  p.artifactFocusMs = Math.max(0, p.artifactFocusMs - dtMs);
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
    if (playerDistance < PLAYER_RADIUS + e.radius && p.invulnMs <= 0) {
      if (specialProtects(state)) {
        breakSurvivorShield(state);
        continue;
      }
        const incoming = Math.ceil((hasUpgrade(p, 'steel-plate') ? e.damage * 0.88 : e.damage) * closeRangeDamageMultiplier(state) * (p.artifactShieldMs > 0 ? 0.65 : 1));
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
         const incoming = Math.ceil((hasUpgrade(p, 'steel-plate') ? proj.damage * 0.88 : proj.damage) * closeRangeDamageMultiplier(state) * (p.artifactShieldMs > 0 ? 0.65 : 1));
        p.hp = Math.max(0, p.hp - incoming);
        p.invulnMs = BALANCE.hitInvulnerabilityMs;
      }
      return false;
    }
    return true;
  });

  // Autoataque com o golpe do tipo (projétil, aura ou área).
  p.attackTimerMs = Math.max(0, p.attackTimerMs - dtMs);
  if (p.attackTimerMs <= 0 && attack(state)) p.attackTimerMs = p.attackCooldownMs * (p.artifactFocusMs > 0 ? 0.8 : 1);
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
      const value = normalizeSurvivorXp(e.boss ? 48 : e.grade === 'chefao' ? 36 : e.grade === 'elite' ? 20 : 8);
      const doubleXp = state.rng() < BALANCE.doubleXpOrbChance;
      state.orbs.push({ id: state.nextId++, x: e.x, y: e.y, value, ...(doubleXp ? { doubleXp: true } : {}) });
      const dropChance = e.boss ? BALANCE.artifactBossDropChance : e.grade === 'chefao' || e.grade === 'elite' ? BALANCE.artifactEliteDropChance : BALANCE.artifactDropChance;
       if (state.rng() < dropChance) state.artifacts.push({ id: state.nextId++, x: e.x, y: e.y, kind: artifactKind(state.rng) });
       if (state.elapsedMs >= SURVIVOR_LOVE_CANDY_MS && state.rng() < BALANCE.digitalPokeballDropChance) {
         state.artifacts.push({ id: state.nextId++, x: e.x, y: e.y, kind: 'pokeball' });
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
          summary: { survivedMs: state.elapsedMs, level: state.player.level, stage: state.player.stage, kills: state.kills, wave: state.wave, trainersBeaten: state.trainersBeaten, bossesBeaten: state.bossesBeaten, finalBossBeaten: state.finalBossBeaten, infinite: state.infinite, digitalPokeballs: state.digitalPokeballs },
        });
      }
    }
  }

  // Coleta de orbes de XP (e nível, se passou da marca).
  state.orbs = state.orbs.filter((orb) => {
    if (Math.hypot(orb.x - p.x, orb.y - p.y) <= p.pickupRadius) {
      const multiplier = p.xpMultiplier ?? 1;
      const orbValue = orb.doubleXp ? orb.value * 2 : orb.value;
      const boostedValue = normalizeSurvivorXp(Math.round((orbValue * multiplier) / SURVIVOR_XP_UNIT) * SURVIVOR_XP_UNIT);
      p.xp = normalizeSurvivorXp(p.xp + boostedValue);
      return false;
    }
    return true;
  });
  state.artifacts = state.artifacts.filter((artifact) => {
    const pickupRadius = p.pickupRadius * (p.artifactMagnetMs > 0 ? 1.7 : 1);
    if (Math.hypot(artifact.x - p.x, artifact.y - p.y) > pickupRadius) return true;
    if (artifact.kind === 'pokeball') state.digitalPokeballs += 1;
    else if (artifact.kind === 'speed') p.artifactSpeedMs = Math.max(p.artifactSpeedMs, BALANCE.artifactDurationMs);
    else if (artifact.kind === 'power') p.artifactPowerMs = Math.max(p.artifactPowerMs, BALANCE.artifactDurationMs);
    else if (artifact.kind === 'magnet') p.artifactMagnetMs = Math.max(p.artifactMagnetMs, BALANCE.artifactDurationMs);
    else if (artifact.kind === 'focus') p.artifactFocusMs = Math.max(p.artifactFocusMs, BALANCE.artifactDurationMs);
    else if (artifact.kind === 'heal') {
      p.hp = Math.min(p.maxHp, p.hp + Math.max(18, Math.round(p.maxHp * 0.28)));
      p.artifactShieldMs = 3_000;
    }
    state.fx.push({ kind: 'artifact', artifact: artifact.kind, x: p.x, y: p.y, r: artifact.kind === 'pokeball' ? 30 : 24, color: artifact.kind === 'pokeball' ? '#ff5b5b' : artifact.kind === 'speed' ? '#7bdcff' : artifact.kind === 'power' ? '#ffb35c' : artifact.kind === 'magnet' ? '#d68cff' : artifact.kind === 'focus' ? '#ffe071' : '#ff8fbb', ageMs: 0, lifeMs: artifact.kind === 'pokeball' ? 900 : 620 });
    events.push({ type: 'artifactCollected', kind: artifact.kind });
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
      summary: { survivedMs: state.elapsedMs, level: p.level, stage: p.stage, kills: state.kills, wave: state.wave, trainersBeaten: state.trainersBeaten, bossesBeaten: state.bossesBeaten, finalBossBeaten: state.finalBossBeaten, infinite: state.infinite, digitalPokeballs: state.digitalPokeballs },
    });
  }

  return events;
}
