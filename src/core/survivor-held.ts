/**
 * Itens segurados (held items) da Torre: saem de baús abertos com chaves que os elites derrubam.
 * Valem só durante a corrida e se somam (pegar o mesmo item de novo empilha o efeito). Cada item mexe numa ficha
 * de modificadores que o motor e o desenho leem; dois itens juntos combinam comportamento e visual sem regra
 * escrita à mão para cada par.
 */
import type { MoveCategory } from './survivor-moves';
import type { PokemonType } from './pokemon-data';
import type { SurvivorPlayer, SurvivorUpgradeRarity } from './survivor-types';

export type HeldItemId =
  | 'orbe-vida' | 'sino-concha' | 'cinto-expert' | 'faixa-muscular'
  | 'lente-ampla' | 'lente-zoom' | 'lente-mira' | 'garra-afiada'
  | 'farpa-grudenta' | 'garra-rapida' | 'metronomo' | 'raiz-grande'
  | 'bola-luz' | 'pedra-dura' | 'fragmento-estrela' | 'pena-rapida'
  | 'pedra-rei' | 'orbe-chama' | 'orbe-toxico' | 'placa-chama'
  | 'placa-zap' | 'placa-gelo' | 'restos' | 'argila-luminosa';

export interface HeldItemDef {
  id: HeldItemId;
  name: string;
  icon: string;
  /** Cor da gema que orbita o Pokémon e do brilho que o item põe nos golpes. */
  color: string;
  rarity: SurvivorUpgradeRarity;
  /** O que faz, em geral (vale para todos os golpes). */
  description: string;
  /** Como muda cada forma de ataque, quando muda de um jeito próprio. */
  perCategory?: Partial<Record<MoveCategory, string>>;
  /** Mudanças diretas nos números do jogador, aplicadas a cada cópia pega. */
  applyStats?: (p: SurvivorPlayer) => void;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const HELD_ITEMS: readonly HeldItemDef[] = [
  { id: 'orbe-vida', name: 'Orbe da Vida', icon: '🔮', color: '#b25cff', rarity: 'raro', description: '+30% de dano por cópia, mas cada ataque custa um pouco de vida (nunca abaixo de 25%).' },
  { id: 'sino-concha', name: 'Sino Concha', icon: '🐚', color: '#ffc6e6', rarity: 'normal', description: 'Cura 4% do dano causado por cópia, até um teto por segundo.' },
  { id: 'cinto-expert', name: 'Cinto Expert', icon: '🥋', color: '#ff7a4a', rarity: 'normal', description: '+25% de dano por cópia contra elites, treinadores e chefões.' },
  { id: 'faixa-muscular', name: 'Faixa Muscular', icon: '💪', color: '#ffb35c', rarity: 'normal', description: '+12% de dano por cópia e golpes que empurram inimigos comuns.' },
  {
    id: 'lente-ampla', name: 'Lente Ampla', icon: '🔍', color: '#7bdcff', rarity: 'raro', description: 'Alarga o golpe: mais disparos, mais alvos ou mais raio, conforme a forma.',
    perCategory: { projetil: '+1 disparo no leque.', rapido: '+1 disparo em cada tiro da rajada.', area: '+1 explosão em outro alvo.', orbit: '+1 orbital e órbita 18% maior.', teleporte: 'Impacto e onda maiores.', aura: 'Raio da aura +18%.', cone: 'Leque 12% mais comprido.', foco: 'Feixe 30% mais largo.', trilha: 'Faixa 18% mais larga.' },
    applyStats: (p) => {
      p.shots += 1;
      p.attackRadius = round2(p.attackRadius * 1.18);
      if (p.move.category === 'cone') p.attackRange = round2(p.attackRange * 1.12);
      p.focusBeamWidthFactor = round2((p.focusBeamWidthFactor ?? 1) * 1.3);
    },
  },
  { id: 'lente-zoom', name: 'Lente Zoom', icon: '🔭', color: '#9fd6ff', rarity: 'normal', description: 'Alcance +20% e disparos 10% mais rápidos por cópia.', applyStats: (p) => { p.attackRange = round2(p.attackRange * 1.2); p.projectileSpeed = round2(p.projectileSpeed * 1.1); } },
  { id: 'lente-mira', name: 'Lente de Mira', icon: '🎯', color: '#ff5b7a', rarity: 'normal', description: '+8% de chance de crítico por cópia.', applyStats: (p) => { p.critChance = round2(Math.min(0.6, (p.critChance ?? 0.05) + 0.08)); } },
  { id: 'garra-afiada', name: 'Garra Afiada', icon: '🗡', color: '#e0e6ff', rarity: 'raro', description: 'Cada crítico salta para mais 1 inimigo por cópia, com 60% do dano.' },
  { id: 'farpa-grudenta', name: 'Farpa Grudenta', icon: '🌵', color: '#9be36b', rarity: 'raro', description: '20% de chance por cópia de grudar uma farpa que explode 1 s depois em volta do alvo.' },
  { id: 'garra-rapida', name: 'Garra Rápida', icon: '⚡', color: '#ffe066', rarity: 'normal', description: '12% de chance por cópia de atacar de novo na hora (até 45%).' },
  { id: 'metronomo', name: 'Metrônomo', icon: '🎵', color: '#c7a6ff', rarity: 'normal', description: 'Acertar o mesmo alvo seguido soma +8% de dano por cópia, até 5 vezes.' },
  { id: 'raiz-grande', name: 'Raiz Grande', icon: '🌱', color: '#6bd17a', rarity: 'normal', description: '18% de chance por cópia de brotar raízes no alvo, que pulsam dano de Planta três vezes.' },
  { id: 'bola-luz', name: 'Bola de Luz', icon: '💡', color: '#fff27a', rarity: 'raro', description: '20% de chance por cópia de soltar um raio que pula para 2 inimigos próximos (40% do dano).' },
  { id: 'pedra-dura', name: 'Pedra Dura', icon: '🪨', color: '#c9a27a', rarity: 'normal', description: 'Disparos 30% maiores e golpes 10% mais largos por cópia; empurra inimigos comuns.', applyStats: (p) => { p.projectileSize = round2(p.projectileSize * 1.3); p.projectileHitRadiusFactor = round2((p.projectileHitRadiusFactor ?? 1) * 1.2); p.attackRadius = round2(p.attackRadius * 1.1); } },
  {
    id: 'fragmento-estrela', name: 'Fragmento de Estrela', icon: '⭐', color: '#ffd84a', rarity: 'lendario', description: 'Cada acerto solta 2 estilhaços por cópia que voam do alvo para fora (35% do dano).',
    perCategory: { aura: 'A aura vira um chafariz de estilhaços.', trilha: 'A faixa espirra estilhaços a cada pulso.', foco: 'O feixe estilhaça cada inimigo da linha.' },
  },
  { id: 'pena-rapida', name: 'Pena Rápida', icon: '🪶', color: '#b5f0ff', rarity: 'normal', description: 'Disparos perseguem o inimigo mais perto e voam 15% mais rápido por cópia.', applyStats: (p) => { p.projectileSpeed = round2(p.projectileSpeed * 1.15); } },
  { id: 'pedra-rei', name: 'Pedra do Rei', icon: '👑', color: '#ffcf3a', rarity: 'raro', description: '7% de chance por cópia de atordoar (chefões, bem menos).' },
  { id: 'orbe-chama', name: 'Orbe Chama', icon: '🔥', color: '#ff7a2f', rarity: 'normal', description: '15% de chance por cópia de queimar o alvo.' },
  { id: 'orbe-toxico', name: 'Orbe Tóxico', icon: '☠', color: '#b46bff', rarity: 'normal', description: '15% de chance por cópia de envenenar: o veneno acumula a cada aplicação.' },
  { id: 'placa-chama', name: 'Placa Chama', icon: '🟥', color: '#ff6a3d', rarity: 'raro', description: 'Cada acerto soma +25% de dano de Fogo por cópia, com o efeito do Fogo.' },
  { id: 'placa-zap', name: 'Placa Zap', icon: '🟨', color: '#ffe14a', rarity: 'raro', description: 'Cada acerto soma +25% de dano Elétrico por cópia, com o efeito Elétrico.' },
  { id: 'placa-gelo', name: 'Placa Pingente', icon: '🟦', color: '#8fe8ff', rarity: 'raro', description: 'Cada acerto soma +25% de dano de Gelo por cópia, com o efeito do Gelo.' },
  { id: 'restos', name: 'Restos', icon: '🍎', color: '#ff8f8f', rarity: 'normal', description: 'Recupera 0,6 de vida por segundo por cópia.', applyStats: (p) => { p.regenPerSec = round2((p.regenPerSec ?? 0) + 0.6); } },
  { id: 'argila-luminosa', name: 'Argila Luminosa', icon: '🧱', color: '#ffe9a8', rarity: 'normal', description: 'Queimadura, veneno, atordoamento e raízes dos itens duram 40% mais por cópia.' },
];

export const HELD_ITEM_BY_ID: Readonly<Record<HeldItemId, HeldItemDef>> = Object.fromEntries(HELD_ITEMS.map((item) => [item.id, item])) as Record<HeldItemId, HeldItemDef>;

export function isHeldItemId(id: string): id is HeldItemId {
  return id in HELD_ITEM_BY_ID;
}

export type HeldStacks = Partial<Record<HeldItemId, number>>;

/** Ficha de modificadores lida pelo motor a cada acerto. Tudo é derivado das cópias, sem estado próprio. */
export interface HeldMods {
  damageMul: number;
  /** Vida perdida a cada ataque (Orbe da Vida). */
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
  /** Rad/s de curva dos disparos (Pena Rápida). */
  homing: number;
  stunChance: number;
  burnChance: number;
  poisonChance: number;
  /** Um tipo por cópia de placa: cada um soma 25% do dano daquele elemento. */
  plates: PokemonType[];
  statusDurationMul: number;
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
    selfDamagePerAttack: round2(0.5 * n('orbe-vida')),
    leech: round2(0.04 * n('sino-concha')),
    leechCapPerSec: 3 * n('sino-concha'),
    eliteMul: round2(1 + 0.25 * n('cinto-expert')),
    knockback: 6 * n('faixa-muscular') + 8 * n('pedra-dura'),
    critBounces: n('garra-afiada'),
    stickyChance: chance(0.2, n('farpa-grudenta'), 0.7),
    recastChance: Math.min(0.45, 0.12 * n('garra-rapida')),
    metronomeStep: round2(0.08 * n('metronomo')),
    rootChance: chance(0.18, n('raiz-grande'), 0.7),
    chainChance: chance(0.2, n('bola-luz'), 0.75),
    shards: Math.min(8, 2 * n('fragmento-estrela')),
    homing: Math.min(9, 3 * n('pena-rapida')),
    stunChance: chance(0.07, n('pedra-rei'), 0.4),
    burnChance: chance(0.15, n('orbe-chama'), 0.75),
    poisonChance: chance(0.15, n('orbe-toxico'), 0.75),
    plates,
    statusDurationMul: round2(1 + 0.4 * n('argila-luminosa')),
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
  /** Fragmento de Estrela: estrela girando no centro. */
  star: boolean;
  /** Pena Rápida: asinhas que batem. */
  wings: boolean;
  /** Pedra Dura: casca de pedra (cópias deixam mais grossa). */
  heavy: number;
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
    star: has('fragmento-estrela') > 0,
    wings: has('pena-rapida') > 0,
    heavy: has('pedra-dura'),
  };
  const any = colors.length > 0 || look.spikes || look.crown || look.sparks || look.star || look.wings || look.heavy > 0;
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
/** Teto de cópias de um mesmo item, para nenhum efeito virar absurdo. */
export const HELD_MAX_COPIES = 4;

/** Sorteia `count` itens diferentes para o baú, sem repetir e sem oferecer o que já chegou ao teto. */
export function rollHeldOffer(rng: () => number, stacks: HeldStacks, count = 2): HeldItemId[] {
  const pool = HELD_ITEMS.filter((item) => (stacks[item.id] ?? 0) < HELD_MAX_COPIES);
  const picked: HeldItemId[] = [];
  while (picked.length < count && pool.length > 0) {
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
  return picked;
}

/** Texto da carta do baú: o efeito geral e, quando houver, o que muda na forma de ataque de quem joga. */
export function heldItemText(id: HeldItemId, category: MoveCategory, copies: number): string {
  const item = HELD_ITEM_BY_ID[id];
  const specific = item.perCategory?.[category];
  const stack = copies > 0 ? ` Você já tem ${copies}: esta soma mais uma.` : '';
  return `${item.description}${specific ? ` ${specific}` : ''}${stack}`;
}

export const HELD_OFFER_PREFIX = 'held:';
