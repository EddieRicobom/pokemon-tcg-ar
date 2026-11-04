/**
 * Itens segurados (held items) da Torre: saem de baús abertos com chaves que os elites derrubam.
 * Valem só durante a corrida e se somam (pegar o mesmo item de novo empilha o efeito). Cada item mexe numa ficha
 * de modificadores que o motor e o desenho leem; dois itens juntos combinam comportamento e visual sem regra
 * escrita à mão para cada par.
 */
import type { MoveCategory } from './survivor-moves';
import { survivorOrbiters } from './survivor-shapes';
import type { SurvivorOrbiter } from './survivor-shapes';
import type { PokemonType } from './pokemon-data';
import type { SurvivorHeldCharge, SurvivorPlayer, SurvivorUpgradeRarity } from './survivor-types';

export type HeldItemId =
  | 'orbe-vida' | 'sino-concha' | 'cinto-expert' | 'faixa-muscular'
  | 'lente-ampla' | 'lente-zoom' | 'lente-mira' | 'garra-afiada'
  | 'farpa-grudenta' | 'garra-rapida' | 'metronomo' | 'raiz-grande'
  | 'bola-luz' | 'pedra-dura' | 'po-prateado' | 'po-rapido'
  | 'pedra-rei' | 'orbe-chama' | 'orbe-toxico' | 'placa-chama'
  | 'placa-zap' | 'placa-gelo' | 'restos' | 'argila-luminosa'
  | 'orbe-adamante' | 'orbe-lustroso' | 'orbe-grisea' | 'laco-destino'
  | 'bola-ferro' | 'erva-poderosa';

export interface HeldItemDef {
  id: HeldItemId;
  name: string;
  /** Nome do item no PokeAPI (e do arquivo do sprite); todos existem até a 4ª geração. */
  slug: string;
  /** Geração em que o item apareceu nos jogos. */
  generation: 2 | 3 | 4;
  /** Ícone de reserva quando o sprite não carrega. */
  icon: string;
  /** Cor da gema que orbita o Pokémon e do brilho que o item põe nos golpes. */
  color: string;
  rarity: SurvivorUpgradeRarity;
  /** O que faz, em geral (vale para todos os golpes). */
  description: string;
  /** Como muda cada forma de ataque, quando muda de um jeito próprio. */
  perCategory?: Partial<Record<MoveCategory, string>>;
  /**
   * Formas de ataque em que o item muda algo de verdade. Ausente = todas. O baú só oferece itens que valem para
   * o golpe de quem joga, para nenhuma escolha ser vazia.
   */
  appliesTo?: readonly MoveCategory[];
  /** Mudanças diretas nos números do jogador, aplicadas a cada cópia pega. */
  applyStats?: (p: SurvivorPlayer) => void;
  /**
   * Transformador: em vez de somar números, troca a mecânica do golpe (tempo, espaço, distorção, laço). Cada forma de
   * ataque tem uma versão própria, descrita em `perCategory`. Raro no baú e com teto de 2 cópias.
   */
  transformer?: boolean;
  /** Peso do transformador na vaga especial do baú (Bola de Ferro e Erva Poderosa saem mais que os outros). */
  transformerWeight?: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const HELD_ITEMS: readonly HeldItemDef[] = [
  { id: 'orbe-vida', slug: 'life-orb', generation: 4, name: 'Orbe da Vida', icon: '🔮', color: '#b25cff', rarity: 'raro', description: 'Como nos jogos, força em troca de vida: +30% de dano por cópia, e acertar custa um pouco de vida, no máximo a cada 0,4 s (nunca abaixo de 25%).' },
  { id: 'sino-concha', slug: 'shell-bell', generation: 3, name: 'Sino Concha', icon: '🐚', color: '#ffc6e6', rarity: 'normal', description: 'Como nos jogos, cura com o dano causado: 4% do dano por cópia, até um teto por segundo.' },
  { id: 'cinto-expert', slug: 'expert-belt', generation: 4, name: 'Cinto Expert', icon: '🥋', color: '#ff7a4a', rarity: 'normal', description: 'Nos jogos, reforça golpes super efetivos; aqui, +25% de dano por cópia contra quem mais resiste: elites, treinadores e chefões.' },
  { id: 'faixa-muscular', slug: 'muscle-band', generation: 4, name: 'Faixa Muscular', icon: '💪', color: '#ffb35c', rarity: 'normal', description: 'Como nos jogos, golpes mais fortes: +12% de dano por cópia, e os golpes empurram inimigos comuns.' },
  {
    id: 'lente-ampla', slug: 'wide-lens', generation: 4, name: 'Lente Ampla', icon: '🔍', color: '#7bdcff', rarity: 'raro', description: 'Nos jogos, mais precisão; aqui, alarga o golpe: mais disparos, mais alvos ou mais raio, conforme a forma.',
    perCategory: { projetil: '+1 disparo no leque.', rapido: '+1 disparo em cada tiro da rajada.', area: '+1 explosão em outro alvo.', orbit: '+1 orbital e órbita 18% maior.', teleporte: 'Impacto e onda maiores.', aura: 'Raio da aura +18%.', cone: 'Leque 12% mais comprido.', foco: 'Feixe 30% mais largo.', trilha: 'Faixa 18% mais larga.' },
    applyStats: (p) => {
      p.shots += 1;
      p.attackRadius = round2(p.attackRadius * 1.18);
      if (p.move.category === 'cone') p.attackRange = round2(p.attackRange * 1.12);
      p.focusBeamWidthFactor = round2((p.focusBeamWidthFactor ?? 1) * 1.3);
    },
  },
  { id: 'lente-zoom', slug: 'zoom-lens', generation: 4, name: 'Lente Zoom', icon: '🔭', color: '#9fd6ff', rarity: 'normal', appliesTo: ['projetil', 'rapido', 'area', 'cone', 'foco', 'teleporte'], description: 'Nos jogos, acerta melhor quem age depois; aqui, enxerga mais longe: alcance +20% e disparos 10% mais rápidos por cópia.', applyStats: (p) => { p.attackRange = round2(p.attackRange * 1.2); p.projectileSpeed = round2(p.projectileSpeed * 1.1); } },
  { id: 'lente-mira', slug: 'scope-lens', generation: 2, name: 'Lente de Mira', icon: '🎯', color: '#ff5b7a', rarity: 'normal', description: 'Como nos jogos, mais críticos: +8% de chance de crítico por cópia.', applyStats: (p) => { p.critChance = round2(Math.min(0.6, (p.critChance ?? 0.05) + 0.08)); } },
  { id: 'garra-afiada', slug: 'razor-claw', generation: 4, name: 'Garra Afiada', icon: '🗡', color: '#e0e6ff', rarity: 'raro', description: 'Como nos jogos, mais críticos (+5% por cópia), e cada crítico rasga mais 1 inimigo por cópia com 60% do dano.', applyStats: (p) => { p.critChance = round2(Math.min(0.6, (p.critChance ?? 0.05) + 0.05)); } },
  { id: 'farpa-grudenta', slug: 'sticky-barb', generation: 4, name: 'Farpa Grudenta', icon: '🌵', color: '#9be36b', rarity: 'raro', description: 'Nos jogos, a farpa gruda em quem encosta; aqui, 20% de chance por cópia de grudar uma farpa no alvo, que explode 1 s depois em volta dele.' },
  { id: 'garra-rapida', slug: 'quick-claw', generation: 2, name: 'Garra Rápida', icon: '⚡', color: '#ffe066', rarity: 'normal', appliesTo: ['projetil', 'rapido', 'area', 'aura', 'cone', 'foco'], description: 'Como nos jogos, às vezes age primeiro: 12% de chance por cópia de atacar de novo na hora (até 45%).' },
  { id: 'metronomo', slug: 'metronome', generation: 4, name: 'Metrônomo', icon: '🎵', color: '#c7a6ff', rarity: 'normal', description: 'Como nos jogos, repetir fortalece: cada acerto seguido no mesmo inimigo soma +8% de dano por cópia, até 5 vezes (zera se ele ficar 1,5 s sem apanhar).' },
  { id: 'raiz-grande', slug: 'big-root', generation: 4, name: 'Raiz Grande', icon: '🌱', color: '#6bd17a', rarity: 'normal', description: 'Nos jogos, aumenta o que se drena; aqui, 18% de chance por cópia de brotar raízes que pulsam dano de Planta, e o roubo de vida cura 30% a mais.' },
  { id: 'bola-luz', slug: 'light-ball', generation: 2, name: 'Bola de Luz', icon: '💡', color: '#fff27a', rarity: 'raro', description: 'A bola elétrica do Pikachu: 20% de chance por cópia de soltar um raio que pula para 2 inimigos próximos (40% do dano). Com golpe Elétrico, a chance dobra.' },
  { id: 'pedra-dura', slug: 'hard-stone', generation: 2, name: 'Pedra Dura', icon: '🪨', color: '#c9a27a', rarity: 'normal', description: 'Como nos jogos, golpes de Pedra +20% por cópia; e todo disparo fica 30% maior e mais pesado, empurrando inimigos comuns.', applyStats: (p) => { p.projectileSize = round2(p.projectileSize * 1.3); p.projectileHitRadiusFactor = round2((p.projectileHitRadiusFactor ?? 1) * 1.2); p.attackRadius = round2(p.attackRadius * 1.1); } },
  {
    id: 'po-prateado', slug: 'silver-powder', generation: 2, name: 'Pó Prateado', icon: '✨', color: '#d9e2f2', rarity: 'lendario', description: 'Como nos jogos, golpes de Inseto +20% por cópia; e cada acerto solta um enxame de 2 estilhaços por cópia que voam do alvo para fora (35% do dano).',
    perCategory: { aura: 'A aura vira um chafariz de estilhaços.', trilha: 'A faixa espirra estilhaços a cada pulso.', foco: 'O feixe estilhaça cada inimigo da linha.' },
  },
  { id: 'po-rapido', slug: 'quick-powder', generation: 4, name: 'Pó Rápido', icon: '💨', color: '#b5f0ff', rarity: 'normal', appliesTo: ['projetil', 'rapido', 'foco'], description: 'Nos jogos, deixa o Ditto mais veloz; aqui, os disparos voam 15% mais rápido por cópia e perseguem o inimigo mais perto.', applyStats: (p) => { p.projectileSpeed = round2(p.projectileSpeed * 1.15); } },
  { id: 'pedra-rei', slug: 'kings-rock', generation: 2, name: 'Pedra do Rei', icon: '👑', color: '#ffcf3a', rarity: 'raro', description: 'Como nos jogos, pode fazer o alvo recuar: 7% de chance por cópia de atordoar (chefões, bem menos).' },
  { id: 'orbe-chama', slug: 'flame-orb', generation: 4, name: 'Orbe Chama', icon: '🔥', color: '#ff7a2f', rarity: 'normal', description: 'Nos jogos, queima quem segura; aqui, a chama vai para o alvo: 15% de chance por cópia de queimar.' },
  { id: 'orbe-toxico', slug: 'toxic-orb', generation: 4, name: 'Orbe Tóxico', icon: '☠', color: '#b46bff', rarity: 'normal', description: 'Nos jogos, envenena gravemente quem segura; aqui, 15% de chance por cópia de envenenar o alvo, e o veneno piora a cada aplicação.' },
  { id: 'placa-chama', slug: 'flame-plate', generation: 4, name: 'Placa Chama', icon: '🟥', color: '#ff6a3d', rarity: 'raro', description: 'Placa de Arceus: golpes de Fogo +20% por cópia, e todo acerto soma +25% de dano de Fogo, com o efeito do Fogo.' },
  { id: 'placa-zap', slug: 'zap-plate', generation: 4, name: 'Placa Zap', icon: '🟨', color: '#ffe14a', rarity: 'raro', description: 'Placa de Arceus: golpes Elétricos +20% por cópia, e todo acerto soma +25% de dano Elétrico, com o efeito Elétrico.' },
  { id: 'placa-gelo', slug: 'icicle-plate', generation: 4, name: 'Placa Pingente', icon: '🟦', color: '#8fe8ff', rarity: 'raro', description: 'Placa de Arceus: golpes de Gelo +20% por cópia, e todo acerto soma +25% de dano de Gelo, com o efeito do Gelo.' },
  { id: 'restos', slug: 'leftovers', generation: 2, name: 'Restos', icon: '🍎', color: '#ff8f8f', rarity: 'normal', description: 'Como nos jogos, recupera vida aos poucos: 0,6 por segundo por cópia.', applyStats: (p) => { p.regenPerSec = round2((p.regenPerSec ?? 0) + 0.6); } },
  { id: 'argila-luminosa', slug: 'light-clay', generation: 4, name: 'Argila Luminosa', icon: '🧱', color: '#ffe9a8', rarity: 'normal', description: 'Nos jogos, faz as barreiras durarem mais; aqui, queimadura, veneno, atordoamento e raízes dos itens duram 40% mais por cópia.' },
  {
    id: 'orbe-adamante', slug: 'adamant-orb', generation: 4, name: 'Orbe Adamante', icon: '⏳', color: '#7fd4ff', rarity: 'lendario', transformer: true,
    description: 'O orbe de Dialga, senhor do tempo: os golpes deixam bolhas que congelam os inimigos e, ao estourar, repetem o acerto em todos que estão dentro. A segunda cópia aumenta a bolha e repete mais uma vez.',
    perCategory: {
      projetil: 'Cada impacto prende o alvo numa bolha pequena.',
      rapido: 'Os tiros da rajada deixam bolhas no caminho dos alvos.',
      area: 'A explosão vira uma bolha do tamanho da área, que congela o grupo inteiro.',
      aura: 'A cada 1,2 s, a aura congela tudo em volta e repete o pulso.',
      cone: 'O fim do leque congela quem foi atingido.',
      orbit: 'Os orbitais deixam bolhas por onde batem.',
      foco: 'O disparo e o feixe congelam cada inimigo da linha.',
      teleporte: 'A chegada congela a área do impacto e repete o golpe.',
      trilha: 'Trechos da faixa viram poças de tempo parado.',
    },
  },
  {
    id: 'orbe-lustroso', slug: 'lustrous-orb', generation: 4, name: 'Orbe Lustroso', icon: '🌀', color: '#ff9ad5', rarity: 'lendario', transformer: true,
    description: 'O orbe de Palkia, senhor do espaço: os golpes abrem portais e uma cópia sai por trás dos inimigos. A segunda cópia deixa o golpe do portal mais forte.',
    perCategory: {
      projetil: 'Cada disparo ganha um gêmeo que sai de um portal atrás do alvo, vindo na direção contrária.',
      rapido: 'Cada tiro da rajada também sai de um portal atrás do alvo.',
      area: 'Cada explosão se repete num portal atrás do grupo.',
      aura: 'Uma segunda aura pulsa num portal sobre o grupo de inimigos mais denso por perto.',
      cone: 'Um leque invertido sai de um portal à frente e prende o grupo entre os dois.',
      orbit: 'De tempos em tempos, um orbital atravessa um portal e acerta um inimigo longe.',
      foco: 'O disparo ganha gêmeo do portal; o feixe carregado forma uma cruz com um segundo feixe.',
      teleporte: 'Além do pouso, um segundo impacto explode num portal atrás do alvo.',
      trilha: 'Enquanto desenha, a faixa abre portais que deixam um terreno pulsante sob inimigos distantes.',
    },
  },
  {
    id: 'orbe-grisea', slug: 'griseous-orb', generation: 4, name: 'Orbe Grísea', icon: '🪞', color: '#b48cff', rarity: 'lendario', transformer: true,
    description: 'O orbe de Giratina, senhor da distorção: cada golpe ganha uma cópia espelhada do outro lado. A segunda cópia deixa o espelho mais forte e maior.',
    perCategory: {
      projetil: 'Cada disparo sai também para trás, espelhado.',
      rapido: 'A rajada dispara para os dois lados.',
      area: 'Cada explosão se repete no ponto espelhado, do outro lado do Pokémon.',
      aura: 'Um anel distorcido bate do lado de fora da aura, onde ela não alcança.',
      cone: 'O leque sai para a frente e para trás.',
      orbit: 'Um segundo anel de orbitais gira ao contrário, mais aberto.',
      foco: 'O disparo e o feixe carregado saem também para trás.',
      teleporte: 'O impacto se repete espelhado, do outro lado do ponto de partida.',
      trilha: 'Uma faixa sombra corre ao lado da sua.',
    },
  },
  {
    id: 'laco-destino', slug: 'destiny-knot', generation: 4, name: 'Laço do Destino', icon: '🎀', color: '#ff6f9e', rarity: 'lendario', transformer: true,
    description: 'Como nos jogos, o laço liga um destino ao outro: o acerto prende o alvo aos vizinhos com correntes por 3 s, e o dano em um se espalha para os ligados. A segunda cópia liga mais inimigos e espalha mais dano.',
    perCategory: {
      projetil: 'Um disparo liga o alvo a 4 vizinhos; 40% do dano se espalha.',
      rapido: 'Cada tiro reforça a corrente; 40% do dano se espalha.',
      area: 'A explosão liga 2 vizinhos de cada atingido; 25% se espalha, para não multiplicar demais.',
      aura: 'A aura amarra quem está dentro aos de fora; 25% se espalha.',
      cone: 'O leque liga cada atingido a 4 vizinhos; 40% se espalha.',
      orbit: 'Cada toque de orbital liga 2 vizinhos; 25% se espalha.',
      foco: 'O feixe amarra a linha inteira; 40% se espalha.',
      teleporte: 'O pouso liga o grupo do impacto a 4 vizinhos; 40% se espalha.',
      trilha: 'Cada pulso da faixa liga 2 vizinhos; 25% se espalha.',
    },
  },
  {
    id: 'bola-ferro', slug: 'iron-ball', generation: 4, name: 'Bola de Ferro', icon: '⚫', color: '#6c6f86', rarity: 'raro', transformer: true, transformerWeight: 2,
    description: 'Nos jogos, prende quem segura ao chão; aqui, a gravidade vira arma: os golpes abrem buracos negros que puxam os inimigos para o centro e implodem. A segunda cópia aumenta o puxão e o tamanho.',
    perCategory: {
      projetil: 'Cada impacto abre um mini buraco negro que puxa os vizinhos.',
      rapido: 'Os tiros abrem mini buracos que juntam o grupo.',
      area: 'A explosão vira um buraco negro com o triplo da área: puxa todo mundo para o centro e implode.',
      aura: 'A aura suga: inimigos até o dobro do raio são puxados para dentro dela.',
      cone: 'O leque vira um vácuo que arrasta os inimigos para a sua frente.',
      orbit: 'Os orbitais viram poços de gravidade que prendem quem passa perto.',
      foco: 'Os disparos abrem mini buracos e o feixe deixa um buraco negro no fim da linha.',
      teleporte: 'A chegada implode e puxa todo mundo em volta para o ponto do pouso.',
      trilha: 'A faixa puxa os inimigos próximos para cima dela.',
    },
  },
  {
    id: 'erva-poderosa', slug: 'power-herb', generation: 4, name: 'Erva Poderosa', icon: '🌿', color: '#7be07b', rarity: 'raro', transformer: true, transformerWeight: 2,
    description: 'Nos jogos, carrega na hora os golpes de dois turnos; aqui, os golpes acumulam energia e soltam tudo de uma vez ou em sequência. A segunda cópia acumula ainda mais.',
    perCategory: {
      projetil: 'Os disparos flutuam em volta do Pokémon e saem todos juntos num leque.',
      rapido: 'Junta 6 tiros flutuando em volta e solta em sequência, como metralhadora.',
      area: 'Depois da explosão, 3 bombas pairam e chovem sobre o grupo.',
      aura: 'A cada 3 pulsos, a aura solta um estouro quase duas vezes maior.',
      cone: 'Depois do leque, sai um segundo leque mais longo.',
      orbit: 'De tempos em tempos, os orbitais se soltam em disparo para fora.',
      foco: 'O feixe carregado sai mais 2 vezes em seguida.',
      teleporte: 'Depois do pouso, salta em cadeia para mais 2 inimigos próximos.',
      trilha: 'Quando a faixa acaba, ela explode inteira de uma vez.',
    },
  },
];

export const HELD_ITEM_BY_ID: Readonly<Record<HeldItemId, HeldItemDef>> = Object.fromEntries(HELD_ITEMS.map((item) => [item.id, item])) as Record<HeldItemId, HeldItemDef>;

export function isHeldItemId(id: string): id is HeldItemId {
  return id in HELD_ITEM_BY_ID;
}

export type HeldStacks = Partial<Record<HeldItemId, number>>;

/** Ficha de modificadores lida pelo motor a cada acerto. Tudo é derivado das cópias, sem estado próprio. */
export interface HeldMods {
  damageMul: number;
  /** Vida perdida por acerto, no máximo a cada 0,4 s (Orbe da Vida). */
  selfDamagePerAttack: number;
  /** Fração do dano que vira cura (Sino Concha), e o teto de cura por segundo. */
  leech: number;
  leechCapPerSec: number;
  eliteMul: number;
  /** Empurrão em inimigos comuns (0 = nenhum). */
  knockback: number;
  /** Quantos inimigos extras um crítico atinge. */
  critBounces: number;
  stickyChance: number;
  recastChance: number;
  metronomeStep: number;
  rootChance: number;
  chainChance: number;
  shards: number;
  /** Rad/s de curva dos disparos (Pó Rápido). */
  homing: number;
  stunChance: number;
  burnChance: number;
  poisonChance: number;
  /** Um tipo por cópia de placa: cada um soma 25% do dano daquele elemento. */
  plates: PokemonType[];
  statusDurationMul: number;
  /** Bônus de dano por tipo do golpe (placas, Pedra Dura, Pó Prateado: +20% por cópia, como nos jogos). */
  typeBoost: Partial<Record<PokemonType, number>>;
  /** Bola de Luz: com golpe Elétrico, a chance do raio dobra. */
  electricChainBonus: boolean;
  /** Transformadores: cópias de cada um (0 = não tem). */
  time: number;
  portal: number;
  mirror: number;
  destiny: number;
  gravity: number;
  power: number;
  /** Itens pegos, na ordem do catálogo (para a faísca de cor em cada acerto, sem recalcular a cada golpe). */
  ids: HeldItemId[];
}

const chance = (perCopy: number, copies: number, cap: number): number => Math.min(cap, 1 - Math.pow(1 - perCopy, copies));

export function heldMods(stacks: HeldStacks): HeldMods {
  const n = (id: HeldItemId): number => Math.max(0, Math.floor(stacks[id] ?? 0));
  const plates: PokemonType[] = [];
  for (let i = 0; i < n('placa-chama'); i++) plates.push('fire');
  for (let i = 0; i < n('placa-zap'); i++) plates.push('electric');
  for (let i = 0; i < n('placa-gelo'); i++) plates.push('ice');
  return {
    damageMul: round2(Math.pow(1.3, n('orbe-vida')) * (1 + 0.12 * n('faixa-muscular'))),
    selfDamagePerAttack: round2(0.7 * n('orbe-vida')),
    leech: round2(0.04 * n('sino-concha') * (1 + 0.3 * n('raiz-grande'))),
    leechCapPerSec: 3 * n('sino-concha'),
    eliteMul: round2(1 + 0.25 * n('cinto-expert')),
    knockback: 6 * n('faixa-muscular') + 8 * n('pedra-dura'),
    critBounces: n('garra-afiada'),
    stickyChance: chance(0.2, n('farpa-grudenta'), 0.7),
    recastChance: Math.min(0.45, 0.12 * n('garra-rapida')),
    metronomeStep: round2(0.08 * n('metronomo')),
    rootChance: chance(0.18, n('raiz-grande'), 0.7),
    chainChance: chance(0.2, n('bola-luz'), 0.75),
    shards: Math.min(8, 2 * n('po-prateado')),
    homing: Math.min(9, 3 * n('po-rapido')),
    stunChance: chance(0.07, n('pedra-rei'), 0.4),
    burnChance: chance(0.15, n('orbe-chama'), 0.75),
    poisonChance: chance(0.15, n('orbe-toxico'), 0.75),
    plates,
    statusDurationMul: round2(1 + 0.4 * n('argila-luminosa')),
    typeBoost: Object.fromEntries(([['fire', 'placa-chama'], ['electric', 'placa-zap'], ['ice', 'placa-gelo'], ['rock', 'pedra-dura'], ['bug', 'po-prateado']] as const)
      .filter(([, id]) => n(id) > 0)
      .map(([type, id]) => [type, round2(1 + 0.2 * n(id))])),
    electricChainBonus: n('bola-luz') > 0,
    time: Math.min(HELD_TRANSFORMER_MAX_COPIES, n('orbe-adamante')),
    portal: Math.min(HELD_TRANSFORMER_MAX_COPIES, n('orbe-lustroso')),
    mirror: Math.min(HELD_TRANSFORMER_MAX_COPIES, n('orbe-grisea')),
    destiny: Math.min(HELD_TRANSFORMER_MAX_COPIES, n('laco-destino')),
    gravity: Math.min(HELD_TRANSFORMER_MAX_COPIES, n('bola-ferro')),
    power: Math.min(HELD_TRANSFORMER_MAX_COPIES, n('erva-poderosa')),
    ids: HELD_ITEMS.filter((item) => n(item.id) > 0).map((item) => item.id),
  };
}

/** O que os itens mudam no desenho de um disparo. Cada traço vem de um item; juntos, eles se somam no mesmo disparo. */
export interface HeldProjectileLook {
  /** Cores que envolvem o disparo: placas, orbes e Orbe da Vida, na ordem em que aparecem. */
  colors: string[];
  /** Farpa Grudenta: espinhos em volta. */
  spikes: boolean;
  /** Pedra do Rei: coroa dourada na cabeça. */
  crown: boolean;
  /** Bola de Luz: faíscas elétricas saltando. */
  sparks: boolean;
  /** Pó Prateado: estrela de pó girando no centro. */
  star: boolean;
  /** Pó Rápido: rastro de vento que bate como asas. */
  wings: boolean;
  /** Pedra Dura: casca de pedra (cópias deixam mais grossa). */
  heavy: number;
  /** Transformadores: ponteiro de relógio (tempo), redemoinho (portal), fantasma espelhado (distorção), fita (laço). */
  time?: boolean;
  portal?: boolean;
  mirror?: boolean;
  knot?: boolean;
  /** Bola de Ferro: núcleo escuro com anel de acreção. */
  gravity?: boolean;
}

export function heldProjectileLook(stacks: HeldStacks): HeldProjectileLook | null {
  const has = (id: HeldItemId): number => Math.max(0, stacks[id] ?? 0);
  const colors: string[] = [];
  for (const id of ['placa-chama', 'placa-zap', 'placa-gelo', 'orbe-chama', 'orbe-toxico', 'orbe-vida'] as const) {
    if (has(id) > 0) colors.push(HELD_ITEM_BY_ID[id].color);
  }
  const look: HeldProjectileLook = {
    colors,
    spikes: has('farpa-grudenta') > 0,
    crown: has('pedra-rei') > 0,
    sparks: has('bola-luz') > 0,
    star: has('po-prateado') > 0,
    wings: has('po-rapido') > 0,
    heavy: has('pedra-dura'),
    ...(has('orbe-adamante') > 0 ? { time: true } : {}),
    ...(has('orbe-lustroso') > 0 ? { portal: true } : {}),
    ...(has('orbe-grisea') > 0 ? { mirror: true } : {}),
    ...(has('laco-destino') > 0 ? { knot: true } : {}),
    ...(has('bola-ferro') > 0 ? { gravity: true } : {}),
  };
  const any = colors.length > 0 || look.spikes || look.crown || look.sparks || look.star || look.wings || look.heavy > 0 || !!look.time || !!look.portal || !!look.mirror || !!look.knot || !!look.gravity;
  return any ? look : null;
}

/** Itens já pegos, um por cópia, na ordem do catálogo (para as gemas que orbitam o Pokémon). */
export function heldGems(stacks: HeldStacks): HeldItemDef[] {
  const gems: HeldItemDef[] = [];
  for (const item of HELD_ITEMS) for (let i = 0; i < Math.max(0, stacks[item.id] ?? 0); i++) gems.push(item);
  return gems;
}

/** Peso no sorteio do baú: itens lendários são mais raros. */
const RARITY_WEIGHT: Record<SurvivorUpgradeRarity, number> = { normal: 10, raro: 6, lendario: 2, ancestral: 1 };
/** Teto de cópias de um mesmo item, para nenhum efeito virar absurdo. Transformadores: 2. */
export const HELD_MAX_COPIES = 4;
export const HELD_TRANSFORMER_MAX_COPIES = 2;
/** Chance de a segunda carta do baú ser um transformador (quando ainda houver algum para pegar). */
export const HELD_TRANSFORMER_SLOT_CHANCE = 0.3;

export function heldMaxCopies(id: HeldItemId): number {
  return HELD_ITEM_BY_ID[id].transformer ? HELD_TRANSFORMER_MAX_COPIES : HELD_MAX_COPIES;
}

/** O item muda algo no golpe desta forma de ataque? */
export function heldItemAppliesTo(id: HeldItemId, category: MoveCategory): boolean {
  const applies = HELD_ITEM_BY_ID[id].appliesTo;
  return !applies || applies.includes(category);
}

/**
 * Sorteia `count` itens diferentes para o baú: sem repetir, sem oferecer o que já chegou ao teto e só itens que
 * mudam o golpe da forma de ataque de quem joga.
 */
export function rollHeldOffer(rng: () => number, stacks: HeldStacks, count = 2, category?: MoveCategory): HeldItemId[] {
  const pool = HELD_ITEMS.filter((item) => (stacks[item.id] ?? 0) < heldMaxCopies(item.id) && (!category || heldItemAppliesTo(item.id, category)));
  const picked: HeldItemId[] = [];
  // A última carta pode ser um transformador; as outras vêm do sorteio comum (que exclui transformadores).
  const transformers = pool.filter((item) => item.transformer);
  const transformerSlot = count >= 2 && transformers.length > 0 && rng() < HELD_TRANSFORMER_SLOT_CHANCE;
  for (let i = pool.length - 1; i >= 0; i--) if (pool[i]!.transformer) pool.splice(i, 1);
  const regularCount = transformerSlot ? count - 1 : count;
  while (picked.length < regularCount && pool.length > 0) {
    const total = pool.reduce((sum, item) => sum + RARITY_WEIGHT[item.rarity], 0);
    let roll = rng() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= RARITY_WEIGHT[pool[i]!.rarity];
      if (roll < 0) { index = i; break; }
    }
    picked.push(pool[index]!.id);
    pool.splice(index, 1);
  }
  if (transformerSlot) {
    const total = transformers.reduce((sum, item) => sum + (item.transformerWeight ?? 1), 0);
    let roll = rng() * total;
    let chosen = transformers[transformers.length - 1]!;
    for (const item of transformers) {
      roll -= item.transformerWeight ?? 1;
      if (roll < 0) { chosen = item; break; }
    }
    picked.push(chosen.id);
  }
  return picked;
}

/** Texto da carta do baú: o efeito geral e, quando houver, o que muda na forma de ataque de quem joga. */
export function heldItemText(id: HeldItemId, category: MoveCategory, copies: number): string {
  const item = HELD_ITEM_BY_ID[id];
  // Transformador: a tela mostra a versão da forma de ataque num destaque à parte.
  const specific = item.transformer ? undefined : item.perCategory?.[category];
  const stack = copies > 0 ? ` Você já tem ${copies}: esta soma mais uma.` : '';
  return `${item.description}${specific ? ` ${specific}` : ''}${stack}`;
}

export const HELD_OFFER_PREFIX = 'held:';

/** Sprite oficial do item no repositório PokeAPI/sprites (o mesmo de onde vêm os GIFs dos Pokémon). */
export const HELD_SPRITE_BASE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items';
export const HELD_SPRITE_MIRROR_URL = 'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items';

export function heldItemSpriteUrl(id: HeldItemId, mirror = false): string {
  return `${mirror ? HELD_SPRITE_MIRROR_URL : HELD_SPRITE_BASE_URL}/${HELD_ITEM_BY_ID[id].slug}.png`;
}

/** Laço do Destino: quantos vizinhos cada acerto liga e quanto do dano se espalha, por forma de ataque. */
export function destinyLinkRule(category: MoveCategory, copies: number): { links: number; share: number } {
  const multi = category === 'aura' || category === 'area' || category === 'orbit' || category === 'trilha';
  const extra = Math.max(0, copies - 1);
  return { links: (multi ? 2 : 4) + extra, share: Math.min(0.8, (multi ? 0.25 : 0.4) + 0.2 * extra) };
}

/** Orbe Adamante: raio da bolha e intervalo mínimo entre bolhas, por forma de ataque. */
export function timeBubbleRule(category: MoveCategory, attackRadius: number, copies: number): { radius: number; cooldownMs: number; atSource: boolean } {
  const grow = 1 + 0.25 * Math.max(0, copies - 1);
  const rules: Record<MoveCategory, { radius: number; cooldownMs: number; atSource: boolean }> = {
    projetil: { radius: 46, cooldownMs: 450, atSource: false },
    rapido: { radius: 40, cooldownMs: 380, atSource: false },
    area: { radius: Math.max(50, attackRadius * 1.2), cooldownMs: 0, atSource: true },
    aura: { radius: Math.max(50, attackRadius * 0.8), cooldownMs: 1200, atSource: true },
    cone: { radius: 58, cooldownMs: 600, atSource: false },
    orbit: { radius: 36, cooldownMs: 650, atSource: false },
    foco: { radius: 44, cooldownMs: 160, atSource: false },
    teleporte: { radius: Math.max(60, attackRadius * 1.1), cooldownMs: 0, atSource: true },
    trilha: { radius: 44, cooldownMs: 800, atSource: false },
  };
  const rule = rules[category];
  return { ...rule, radius: Math.round(rule.radius * grow) };
}

/** Orbe Grísea na órbita: um segundo anel, mais aberto, girando ao contrário. */
export function mirrorOrbiters(p: Pick<SurvivorPlayer, 'x' | 'y' | 'shots' | 'attackRadius' | 'orbitAngle'>, copies: number): SurvivorOrbiter[] {
  return survivorOrbiters({ ...p, attackRadius: p.attackRadius * (1.45 + 0.15 * Math.max(0, copies - 1)), orbitAngle: -(p.orbitAngle ?? 0) });
}

/** Erva Poderosa: onde cada disparo carregado flutua em volta do Pokémon (o anel gira devagar enquanto espera). */
export function heldChargePosition(p: { x: number; y: number }, charge: Pick<SurvivorHeldCharge, 'slot' | 'total'>, nowMs: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * charge.slot) / Math.max(1, charge.total) + nowMs / 300;
  return { x: p.x + Math.cos(angle) * 34, y: p.y - 10 + Math.sin(angle) * 22 };
}
