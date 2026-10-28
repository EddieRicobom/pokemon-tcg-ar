import type { Rng } from './battle';
import type { AttackProfile, MoveCategory, SurvivorMove } from './survivor-moves';
import type { PokemonType } from './pokemon-data';
import type { SurvivorSpecialState } from './survivor-specials';
import type { LunchEffect } from './survivor-lunch';
import type { SurvivorProjectileLook } from './survivor-projectile-power';

/**
 * Tipos, constantes e pontuação do modo Sobrevivência (movidos de `survivor.ts` sem mudar o texto, em 2026-10-23).
 * `survivor.ts` reexporta tudo daqui, então os imports existentes continuam valendo.
 */

/** Um setor de paisagem: mantém o tamanho visual dos tiles, árvores e itens. */
export const SURVIVOR_LANDSCAPE_TILE_W = 2880;
export const SURVIVOR_LANDSCAPE_TILE_H = 1920;
/** Dimensões do mundo jogável. A arena agora reúne nove setores 2.880×1.920; a câmera continua mostrando só uma janela. */
export const ARENA_W = SURVIVOR_LANDSCAPE_TILE_W * 3;
export const ARENA_H = SURVIVOR_LANDSCAPE_TILE_H * 3;
export const PLAYER_RADIUS = 14;
export const PICKUP_RADIUS = 46;
/** O artefato Ímã continua útil, mas não coleta orbes de uma tela inteira. */
export const MAGNET_PICKUP_RADIUS_CAP = 90;
/** Margem fora da arena onde os inimigos nascem (entram andando, nunca "aparecem" em cima de você). */
export const SPAWN_MARGIN = 48;

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
  /** Pontos obtidos em cartas nesta corrida; somam aos atributos reais da espécie. */
  defenseBonus?: number;
  spDefenseBonus?: number;
  speed: number;
  level: number;
  xp: number;
  xpToNext: number;
  /** Multiplicador acumulado de XP dos buffs de experiência da corrida. */
  xpMultiplier: number;
  /** Fração de XP dos orbes guardada para manter a redução total precisa apesar da unidade par. */
  xpCarry?: number;
  attackDamage: number;
  /** Multiplicador do dano secundário em área; ataques híbridos começam em 15%. */
  areaDamageMultiplier: number;
  attackRange: number;
  attackCooldownMs: number;
  attackTimerMs: number;
  projectileSpeed: number;
  /** Quantos inimigos extras um projétil atravessa antes de sumir. */
  pierce: number;
  /** Carta lendária: o golpe pode aparar um projétil inimigo por ataque. */
  projectileDeflection?: boolean;
  /** Moedas prometidas pelas cartas da corrida; entram na carteira só no resultado final. */
  bonusCoins?: number;
  /** Acúmulos voluntários de dificuldade; não há teto de escolha. */
  difficultyStacks?: number;
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
  /** Frente do Pokémon em radianos (último passo; no BONK, para onde a câmera olha). O cone ataca nessa direção. */
  aimAngle?: number;
  /** Fase do giro dos orbitais (radianos), avançada a cada quadro pelo golpe de órbita. */
  orbitAngle?: number;
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
  /** Regeneração por segundo, somada pelas cartas "Regeneração lenta". */
  regenPerSec?: number;
  /** Dano por segundo que cada inimigo sofre ao encostar em você (cartas "Espinhos"). */
  thornsDamage?: number;
  /** Bônus de chance de cada artefato cair dos inimigos (0.25 = +25%). */
  artifactLuck?: number;
  /** Chance de cada golpe do tipo principal causar dano dobrado. */
  critChance?: number;
  /** Segundo fôlego pronto: revive com parte da vida na primeira vez que a vida cai até 25%. */
  secondWindReady?: boolean;
  /** Só no BONK: força vertical inicial de cada salto. */
  bonkJumpPower?: number;
  /** Só no BONK: quantos saltos extras podem ser usados no ar. */
  bonkAirJumps?: number;
  /** Só no BONK: multiplicador da gravidade; menor deixa o salto mais longo. */
  bonkGravityFactor?: number;
  /** Marca interna para que cartas exclusivas do BONK não apareçam no Survival clássico. */
  bonkMode?: boolean;
  /** Defesa e Defesa Especial vindas do Dojô (campo próprio; soma com a marmita até `TRAINING_DEFENSE_CAP`). */
  trainingDefense?: number;
  /** Defesa e Defesa Especial da marmita de Raiz enquanto ela dura. */
  lunchDefense?: number;
  /** Fração somada à velocidade pela marmita de Fresco enquanto ela dura. */
  lunchSpeedBonus?: number;
  /** Fração somada ao alcance de coleta pela marmita de Grão enquanto ela dura. */
  lunchPickupBonus?: number;
  /** Fração somada à janela de proteção depois de um golpe (marmita de Fruta enquanto dura). */
  lunchHitInvulnBonus?: number;
  /** Marmita ativa: o efeito e quanto já curou (a cura tem teto por corrida). */
  lunch?: { effect: LunchEffect; healed: number; active: boolean };
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
  shiny?: boolean;
  accessory?: string | null;
  digital?: boolean;
}

/** Limite de apoios simultâneos: complementam o protagonista sem substituir a build dele. */
export const MAX_SURVIVOR_SUPPORTS = 5;
/** Depois do primeiro apoio garantido, cada novo candidato entra como uma carta rara comum. */
export const SURVIVOR_SUPPORT_RARE_OFFER_CHANCE = 0.3;
/** Laço Evolutivo só pode aparecer para um apoio já chamado que tenha próxima forma real desenhável. */
export const SURVIVOR_SUPPORT_EVOLUTION_OFFER_CHANCE = 0.18;
/** No máximo três Pokébolas digitais podem ser encontradas em uma corrida. */
export const MAX_DIGITAL_POKEBALLS_PER_RUN = 3;
/** A ameaça só começa depois que a corrida já tem ritmo e o jogador teve tempo de aprender o mapa. */
export const DIGITAL_DANGER_UNLOCK_MS = 180_000;
export const DIGITAL_DANGER_MAX = 100;
export const DIGITAL_DANGER_COOLDOWN_MS = 90_000;
export const DIGITAL_DANGER_VISIBLE_RADIUS = 520;

/** Grau do inimigo: `comum` (os de sempre), `elite` (do treinador do minuto 5+) e `chefao` (do 20º minuto e do infinito). */
export type SurvivorEnemyGrade = 'comum' | 'elite' | 'chefao';

export interface SurvivorEnemy {
  id: number;
  /** Espécie fixada no nascimento, independente dos atributos de combate. */
  dexId?: number;
  /** Índice da espécie no elenco desta corrida (ver `kindCount` em `createSurvivorState`); chefes usam `kindCount`. */
  kind: number;
  boss: boolean;
  /** Lendário chamado por uma Pokébola Sombria: recebe apresentação, escala e recompensa próprias. */
  shadowBoss?: boolean;
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
  /** Recarga do atordoamento (ms restantes): enquanto corre, o inimigo não pode ser atordoado de novo. */
  stunCooldownMs?: number;
  /** Recarga do empurrão (ms restantes): enquanto corre, o inimigo não pode ser empurrado de novo. */
  knockbackCooldownMs?: number;
  /** Ms até um orbital poder acertar este inimigo de novo. */
  orbitHitMs?: number;
  wetMs?: number;
  seededMs?: number;
  /** Acúmulos de frio. O congelamento é curto e tem intervalo por alvo. */
  frostStacks?: number;
  frostImmuneMs?: number;
  /** Comportamento de gameplay; não representa atributo oficial da espécie. */
  archetype?: SurvivorEnemyArchetype;
  /** Variação determinística do suporte: cura, acelera aliados ou dispara um projétil leve. */
  supportRole?: SurvivorSupportRole;
  /** Ms restantes do impulso de velocidade recebido de um Suporte. */
  hastenedMs?: number;
  /** Recarga do comportamento especial, em milissegundos. */
  specialTimerMs?: number;
  /** Proteção temporária recebida de um Protetor aliado. */
  protectedMs?: number;
  /** Aviso antes da investida (ms restantes): o inimigo para e fica marcado em vermelho. */
  chargeMs?: number;
  /** Ms restantes da investida em alta velocidade. */
  dashMs?: number;
}

/** Perfis internos de comportamento reutilizáveis entre regiões e espécies. */
export type SurvivorEnemyArchetype = 'perseguidor' | 'flanqueador' | 'atirador' | 'protetor' | 'suporte' | 'investida' | 'explosivo';

export type SurvivorSupportRole = 'cura' | 'impulso' | 'disparo';

export interface SurvivorHitSource {
  dexId?: number;
  boss: boolean;
  shadowBoss?: boolean;
  grade: SurvivorEnemyGrade;
}

export interface SurvivorFinalHit extends SurvivorHitSource {
  kind: 'contato' | 'projétil' | 'explosão';
  damage: number;
  hpBefore: number;
}

export interface SurvivorHostileProjectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  lifeMs: number;
  size: number;
  source?: SurvivorHitSource;
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
  /** Distância do jogador até o alvo no momento do disparo, para o falloff de dano. */
  distanceFromPlayer?: number;
  /** Aparência evoluída pelas cartas coletadas até o disparo (só desenho; ausente nos apoios). */
  look?: SurvivorProjectileLook;
}

/** Marcas visuais de um instante (pulso da aura, explosão da área, brilho da evolução): só para o desenho. */
export interface SurvivorFx {
  kind: 'pulse' | 'blast' | 'cone' | 'orbit-hit' | 'evolve' | 'echo' | 'follow-up' | 'artifact' | 'heal';
  x: number;
  y: number;
  r: number;
  color: string;
  ageMs: number;
  lifeMs: number;
  /** Tipo do golpe que criou a marca: o desenho usa a forma do elemento (chama, gota, faísca…), não só a cor. */
  moveType?: PokemonType;
  /** Cone: direção (radianos) e meia abertura do leque que acertou. */
  angle?: number;
  spread?: number;
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

export type SurvivorArtifactKind = 'speed' | 'heal' | 'power' | 'magnet' | 'focus' | 'pokeball' | 'shadow-ball';

/** Texto único para HUD e avisos: descreve exatamente os bônus temporários aplicados pelo motor. */
export const SURVIVOR_ARTIFACT_DETAILS: Record<SurvivorArtifactKind, { icon: string; name: string; description: string }> = {
  speed: { icon: '⚡', name: 'Passo relâmpago', description: '+35% de velocidade por 8 s.' },
  power: { icon: '✦', name: 'Núcleo de poder', description: '+25% de dano por 8 s.' },
  heal: { icon: '♥', name: 'Pulso vital', description: 'Cura 28% da vida (mín. 18) e protege por 3 s.' },
  magnet: { icon: '🧲', name: 'Ímã de experiência', description: '+70% de alcance para coletar orbes por 8 s.' },
  focus: { icon: '◈', name: 'Foco preciso', description: 'Reduz em 20% a recarga do golpe por 8 s.' },
  pokeball: { icon: '★', name: 'Pokébola errante', description: 'Reúne opções de Digital Pokémon para escolher ao fim da corrida.' },
  'shadow-ball': { icon: '◉', name: 'Pokébola Sombria', description: 'Desafio opcional: chama um lendário perigoso. Vença para assegurar uma Pedra da Confiança ao concluir a corrida.' },
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
  /** Ícone próprio da carta, quando ela precisa se destacar da família. */
  icon?: string;
  rarity?: SurvivorUpgradeRarity;
  /** Família visível da carta; não altera o sorteio nem o efeito. */
  family?: SurvivorUpgradeFamily;
  /** Valor já sorteado para esta carta; aplicar a escolha não sorteia novamente. */
  value?: number;
}

export type SurvivorUpgradeRarity = 'normal' | 'raro' | 'lendario' | 'ancestral';
export type SurvivorUpgradeFamily = 'ataque' | 'elemento' | 'defesa' | 'movimento' | 'progresso' | 'aliado';
export const SURVIVOR_UPGRADE_FAMILIES: Record<SurvivorUpgradeFamily, { label: string; icon: string }> = {
  ataque: { label: 'Ataque', icon: '⚔' },
  elemento: { label: 'Elemento', icon: '✦' },
  defesa: { label: 'Defesa', icon: '🛡' },
  movimento: { label: 'Movimento', icon: '➜' },
  progresso: { label: 'Progresso', icon: '◈' },
  aliado: { label: 'Aliado', icon: '✦' },
};
export const SURVIVOR_UPGRADE_RARITIES: Record<SurvivorUpgradeRarity, { label: string; icon: string; weight: number; minLevel: number; impact: string }> = {
  normal: { label: 'Poké Ball', icon: '⚪', weight: 74, minLevel: 1, impact: 'Ajuste pequeno e útil' },
  raro: { label: 'Great Ball', icon: '🔵', weight: 18, minLevel: 3, impact: 'Muda a força ou o alcance da estratégia' },
  lendario: { label: 'Ultra Ball', icon: '🟡', weight: 6, minLevel: 8, impact: 'Abre uma vantagem marcante' },
  ancestral: { label: 'Master Ball', icon: '🟣', weight: 2, minLevel: 12, impact: 'Transforma a corrida; uma escolha por partida' },
};

/** Afinidade rara: o segundo tipo da espécie reforça a corrida sem criar outro golpe. */
export interface SurvivorTypeAffinity {
  type: SurvivorMove['type'];
  effect: SurvivorMove['effect'];
}

export interface SurvivorState {
  lastHit?: SurvivorFinalHit;
  special: SurvivorSpecialState;
  rng: Rng;
  /** Semente original desta corrida, usada também para objetivos determinísticos. */
  runSeed: number;
  /** Aparência por nascimento; não deve consumir o RNG de combate. */
  enemyDexId: ((enemy: Readonly<SurvivorEnemy>, elapsedMs: number, runSeed: number) => number) | null;
  elapsedMs: number;
  player: SurvivorPlayer;
  enemies: SurvivorEnemy[];
  projectiles: SurvivorProjectile[];
  hostileProjectiles: SurvivorHostileProjectile[];
  orbs: SurvivorOrb[];
  artifacts: SurvivorArtifact[];
  /** Pokébolas especiais recolhidas nesta corrida; cada uma amplia a seleção no fim. */
  digitalPokeballs: number;
  /** Medidor que pune ficar parado quando a tela está sem inimigos visíveis. */
  digitalDanger: number;
  /** Recarga após uma convocação automática de treinador. */
  digitalDangerCooldownMs: number;
  /** Encontro opcional a partir dos 13 min: a cutscene pausa a Torre antes do lendário entrar. */
  shadowEncounter: {
    phase: 'idle' | 'available' | 'arrival' | 'battle';
    dexId: number;
    name: string;
    arrivalMs: number;
  };
  nextShadowBallAtMs: number;
  shadowBallsSpawned: number;
  /** Pedras asseguradas ao derrotar lendários; entram no inventário quando a corrida termina. */
  shadowTrustStones: number;
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
  /** Modificador de corrida curta: relógio 2×, XP 1,75× e chefão final aos 10 min exibidos. */
  fast: boolean;
  /** Variante opcional em terceira pessoa, com física e salto. */
  bonk: boolean;
  /** Multiplicador do HP/dano que o infinito aplica sobre `elapsedMs` (sem o infinito, sempre 1). */
  infiniteScale: number;
  /** Não-nulo pausa o avanço (ver `stepSurvivor`): espera `applyUpgrade`. */
  pendingUpgrade: SurvivorUpgradeOption[] | null;
  /** Níveis ganhos que ainda vão virar escolha de upgrade (subir 2 níveis de uma vez dá 2 escolhas, uma depois da outra). */
  upgradesOwed: number;
  nextId: number;
  /** Próximas formas reais de uma espécie (ver `CreateSurvivorOptions.evolutions`). */
  evolutions: (dexId: number, move?: SurvivorMove) => readonly SurvivorEvolutionOption[];
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
  /** Banimentos que ainda restam e as cartas banidas desta corrida (a Vila entrega pelo Dojô). */
  bansLeft?: number;
  bannedUpgradeIds?: string[];
  /** Cartas extras que a primeira oferta de upgrade ainda mostra (Olhar treinado). */
  firstOfferBonus?: number;
  /** O que a Vila entregou para esta corrida; vazio na corrida pura. */
  towerSummary?: string[];
  /** false = corrida pura (nada da Vila entrou). */
  trained?: boolean;
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
  /** Frente fixa em radianos (BONK: a direção da câmera). Sem ela, a frente segue o último passo. */
  aimAngle?: number;
  /** Quantos inimigos estão visíveis na janela atual; a cola Vue informa o valor real da câmera. */
  visibleEnemies?: number;
}

export interface SurvivorSummary {
  finalHit?: SurvivorFinalHit;
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
  /** A corrida usou o modificador Ritmo acelerado? */
  fast?: boolean;
  /** Quantas Pokébolas especiais foram realmente recolhidas durante a corrida. */
  digitalPokeballs: number;
  /** Pedras da Confiança asseguradas pelos lendários sombrios nesta corrida. */
  shadowTrustStones?: number;
  /** Moedas concedidas por cartas durante a corrida, pagas apenas no resultado final. */
  bonusCoins?: number;
}

/** Pontuação da corrida (0–100): tempo vivo, derrotas e nível. */
export function survivorScore(s: Pick<SurvivorSummary, 'survivedMs' | 'kills' | 'level'>): number {
  return Math.max(0, Math.min(100, Math.round(s.survivedMs / 1000 + s.kills * 2 + s.level * 5)));
}

/** Uma corrida que só conta se você durou um pouco ou derrotou alguém (sair logo não vira fazenda de moedas). */
export const SURVIVOR_MIN_MS = 20_000;

/** Marcos de corrida que só viram itens quando a partida termina de verdade na Vila. */
export const SURVIVOR_LOVE_CANDY_MS = 10 * 60_000;
/** Marco de 15 min: concede uma Pedra da Confiança depois que a corrida termina. */
export const SURVIVOR_TRUST_STONE_MS = 15 * 60_000;
export const SURVIVOR_MEGA_SHARD_MS = 20 * 60_000;
/** A primeira Pokébola Sombria aparece aos 13 min; a mesma corrida pode ter até três encontros. */
export const SURVIVOR_SHADOW_BALL_FIRST_MS = 13 * 60_000;
export const SURVIVOR_SHADOW_BALL_EVERY_MS = 3 * 60_000;
export const SURVIVOR_SHADOW_BALL_MAX_PER_RUN = 3;
export const SURVIVOR_SHADOW_CUTSCENE_MS = 2_800;

/** Prêmio por zerar a Torre (chefão final caído): só uma vez por dia (`today.clearedTorre`). */
export const SURVIVOR_CLEAR_BONUS = 500;

/**
 * Moedas da corrida (além das moedas do XP e do bônus por zerar):
 *  - metade da pontuação, de 5 a 50, se durou/derrotou algo (como antes);
 *  - +40 por treinador comum derrotado, +80 por chefão (6 Pokémon).
 */
export function survivorCoins(s: Pick<SurvivorSummary, 'survivedMs' | 'kills' | 'level' | 'trainersBeaten' | 'bossesBeaten' | 'bonusCoins'>): number {
  const base = (s.kills === 0 && s.survivedMs < SURVIVOR_MIN_MS) ? 0 : Math.max(5, Math.round(survivorScore(s) / 2));
  return base + (s.trainersBeaten - s.bossesBeaten) * 40 + s.bossesBeaten * 80 + Math.max(0, Math.round(s.bonusCoins ?? 0));
}

export type SurvivorEvent =
  | { type: 'levelup'; level: number }
  | { type: 'milestone'; id: 'ten-minutes' | 'fifteen-minutes' | 'twenty-minutes'; reward: 'love-candy' | 'trust-stone' | 'mega-stone-shard' }
  | { type: 'bossSpawn' }
  | { type: 'shadowBallSpawn'; dexId: number; name: string }
  | { type: 'shadowBossArrival'; dexId: number; name: string }
  | { type: 'shadowBossDefeated'; dexId: number; name: string; trustStones: number }
  /** Treinador apareceu: solta um grupo de `count` Pokémon elite (3 no normal, 6 no chefão final e no infinito). */
  | { type: 'trainerSpawn'; count: number; final: boolean; trainerId: number; trigger?: 'digital-danger' }
  /** Treinador derrotado (todos os Pokémon dele caíram). */
  | { type: 'trainerDown'; final: boolean }
  /** Primeiro treinador derrotado: oferece a afinidade do segundo tipo real da espécie. */
  | { type: 'typeAffinityOffer'; types: PokemonType[] }
  | { type: 'evolve'; dexId: number; name: string }
  | { type: 'secondAttack'; name: string }
  /** Um apoio assumiu uma evolução real; ele continua sem vida, hitbox ou upgrades do protagonista. */
  | { type: 'supportEvolve'; dexId: number; name: string }
  /** Artefato do chão realmente alcançado pelo jogador; a UI explica o efeito aplicado. */
  | { type: 'artifactCollected'; kind: SurvivorArtifactKind }
  | { type: 'gameover'; summary: SurvivorSummary };

export interface SurvivorUpgrade {
  id: string;
  name: string;
  description: string;
  /** Ícone próprio da carta, quando ela precisa se destacar da família. */
  icon?: string;
  rarity: SurvivorUpgradeRarity;
  family: SurvivorUpgradeFamily;
  /** Categorias de golpe em que o upgrade faz sentido (sem lista = todas). */
  for?: readonly MoveCategory[];
  /** Especializações só aparecem para o tipo de quem está jogando. */
  type?: SurvivorMove['type'];
  /** Só pode aparecer numa corrida BONK. */
  bonkOnly?: boolean;
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
