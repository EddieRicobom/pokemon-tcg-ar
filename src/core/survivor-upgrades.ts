import type { MoveCategory } from './survivor-moves';
import type { PokemonType } from './pokemon-data';
import type { SurvivorPlayer, SurvivorUpgradeRarity } from './survivor-types';
import type { SurvivorUpgrade } from './survivor-types';

/**
 * Catálogo de upgrades da corrida (movido de `survivor.ts` sem mudar o texto, em 2026-10-23). `survivor.ts` o reexporta.
 */

export const round1 = (n: number): number => Math.round(n * 10) / 10;
export const SURVIVOR_RARITY_ORDER: readonly SurvivorUpgradeRarity[] = ['normal', 'raro', 'lendario', 'ancestral'];

const GENERIC_SURVIVOR_UPGRADES: readonly SurvivorUpgrade[] = [
  {
    id: 'power', family: 'ataque', rarity: 'raro', name: 'Golpe mais forte', description: '+20% de dano no ataque.', valueRange: [16, 24],
    describeValue: (m, value) => ({ name: 'Golpe mais forte', description: `${m.name}: +${value}% de dano, até 60.` }),
    apply: (p, value = 20) => {
      // teto absoluto em 60 para o dano (o teste espera 60)
      if (p.attackDamage >= 60) return;
      p.attackDamage = Math.min(60, round1(p.attackDamage * (1 + value / 100)));
    },
  },
  {
    id: 'haste', family: 'ataque', rarity: 'raro', name: 'Recarga menor', description: '-15% no tempo entre ataques.', valueRange: [12, 18],
    describeValue: (m, value) => ({ name: 'Recarga menor', description: `${m.name}: -${value}% no tempo entre ${m.category === 'aura' ? 'os pulsos' : 'ataques'}.` }),
    apply: (p, value = 15) => {
      // não deixa cair abaixo de 240 ms (o teste espera 240)
      if (p.attackCooldownMs <= 240) return;
      p.attackCooldownMs = Math.max(240, Math.round(p.attackCooldownMs * (1 - value / 100)));
    },
  },
  { id: 'legs', family: 'movimento', rarity: 'normal', name: 'Passo mais rápido', description: '+12% de velocidade ao andar.', valueRange: [9, 14], describeValue: (_m, value) => ({ name: 'Passo mais rápido', description: `+${value}% de velocidade ao andar.` }), apply: (p, value = 12) => { p.speed = round1(p.speed * (1 + value / 100)); } },
  { id: 'vigor', family: 'defesa', rarity: 'normal', name: 'Mais vida', description: '+25 no HP máximo e cura 25.', valueRange: [20, 30], describeValue: (_m, value) => ({ name: 'Mais vida', description: `+${value} no HP máximo e cura ${value}.` }), apply: (p, value = 25) => { p.maxHp += value; p.hp = Math.min(p.maxHp, p.hp + value); } },
  {
    id: 'range', family: 'ataque', rarity: 'raro', name: 'Alcance maior', description: '+20% no alcance do golpe.', for: ['projetil', 'area', 'cone'], valueRange: [16, 24],
    describeValue: (_m, value) => ({ name: 'Alcance maior', description: `+${value}% no alcance do golpe.` }),
    apply: (p, value = 20) => { p.attackRange = round1(p.attackRange * (1 + value / 100)); },
  },
  {
    id: 'more-upgrade-choices', family: 'progresso', rarity: 'raro', name: 'Mochila de escolhas',
    description: '+1 opção nas ofertas de upgrade (você ainda escolhe apenas uma).', maxLevels: 2,
    apply: (p) => { p.upgradeChoices = Math.min(5, Math.max(3, p.upgradeChoices) + 1); },
  },
  {
    id: 'jirachi-reroll', family: 'progresso', rarity: 'raro', name: 'Desejo de Jirachi',
    description: 'Ganha 1 rerrolagem de oferta. O desejo é consumido ao trocar as cartas.', maxLevels: 3,
    apply: (p) => { p.upgradeRerolls = Math.min(3, Math.max(0, p.upgradeRerolls) + 1); },
  },
  { id: 'xp-boost-15', family: 'progresso', rarity: 'normal', name: 'Rota de experiência', description: '+15% de XP recebido dos orbes.', maxLevels: 1, apply: (p) => { p.xpMultiplier = Math.max(p.xpMultiplier ?? 1, 1.15); } },
  { id: 'xp-boost-25', family: 'progresso', rarity: 'raro', name: 'Rota de experiência II', description: '+25% de XP recebido dos orbes.', maxLevels: 1, requires: 'xp-boost-15', apply: (p) => { p.xpMultiplier = Math.max(p.xpMultiplier ?? 1, 1.25); } },
  { id: 'xp-boost-35', family: 'progresso', rarity: 'lendario', name: 'Rota de experiência III', description: '+35% de XP recebido dos orbes.', maxLevels: 1, requires: 'xp-boost-25', apply: (p) => { p.xpMultiplier = Math.max(p.xpMultiplier ?? 1, 1.35); } },
  { id: 'xp-boost-50', family: 'progresso', rarity: 'ancestral', name: 'Rota de experiência IV', description: '+50% de XP recebido dos orbes.', maxLevels: 1, requires: 'xp-boost-35', apply: (p) => { p.xpMultiplier = Math.max(p.xpMultiplier ?? 1, 1.5); } },
  {
    id: 'multishot', family: 'ataque', rarity: 'lendario', name: 'Disparo múltiplo', description: '+1 projétil por disparo, em leque.', for: ['projetil', 'area'],
    describe: (m) => (m.category === 'area'
      ? { name: 'Explosão extra', description: `${m.name}: +1 explosão por ataque, em outro inimigo.` }
      : { name: 'Disparo múltiplo', description: '+1 projétil por disparo, em leque.' }),
    apply: (p) => { p.shots = Math.min(5, p.shots + 1); },
  },
  {
    id: 'pierce', family: 'ataque', rarity: 'lendario', name: 'Golpe perfurante', description: 'O golpe atravessa +1 inimigo antes de sumir.', for: ['projetil'],
    apply: (p) => { p.pierce = Math.min(4, p.pierce + 1); },
  },
  {
    id: 'radius', family: 'ataque', rarity: 'raro', name: 'Golpe maior', description: '+20% no raio do golpe.', for: ['aura', 'area', 'orbit'], valueRange: [16, 24],
    describeValue: (m, value) => ({ name: 'Golpe maior', description: `${m.name}: +${value}% no ${m.category === 'aura' ? 'raio da aura' : 'raio do golpe'}.` }),
    apply: (p, value = 20) => { p.attackRadius = round1(p.attackRadius * (1 + value / 100)); },
  },
  { id: 'magnet', family: 'progresso', rarity: 'normal', name: 'Ímã de XP', description: '+30% no alcance para coletar orbes de XP.', valueRange: [24, 36], describeValue: (_m, value) => ({ name: 'Ímã de XP', description: `+${value}% no alcance para coletar orbes de XP.` }), apply: (p, value = 30) => { p.pickupRadius = round1(p.pickupRadius * (1 + value / 100)); } },
  { id: 'velocity', family: 'ataque', rarity: 'normal', name: 'Velocidade de saída', description: '+18% na velocidade dos projéteis.', for: ['projetil'], maxLevels: 1, valueRange: [15, 21], describeValue: (_m, value) => ({ name: 'Velocidade de saída', description: `+${value}% na velocidade dos projéteis.` }), apply: (p, value = 18) => { p.projectileSpeed = round1(p.projectileSpeed * (1 + value / 100)); } },
  { id: 'renewal', family: 'defesa', rarity: 'normal', name: 'Renovação', description: '+15 de vida máxima e cura 15.', maxLevels: 1, valueRange: [12, 18], describeValue: (_m, value) => ({ name: 'Renovação', description: `+${value} de vida máxima e cura ${value}.` }), apply: (p, value = 15) => { p.maxHp += value; p.hp = Math.min(p.maxHp, p.hp + value); } },
  { id: 'tempo', family: 'movimento', rarity: 'normal', name: 'Passo cadenciado', description: '+8% de velocidade de movimento.', maxLevels: 1, valueRange: [6, 10], describeValue: (_m, value) => ({ name: 'Passo cadenciado', description: `+${value}% de velocidade de movimento.` }), apply: (p, value = 8) => { p.speed = round1(p.speed * (1 + value / 100)); } },
  { id: 'resonance', family: 'ataque', rarity: 'normal', name: 'Ressonância', description: '+10% de dano no golpe principal.', maxLevels: 1, valueRange: [8, 12], describeValue: (_m, value) => ({ name: 'Ressonância', description: `+${value}% de dano no golpe principal, até 60.` }), apply: (p, value = 10) => { p.attackDamage = Math.min(60, round1(p.attackDamage * (1 + value / 100))); } },
  { id: 'area-damage-30', family: 'ataque', rarity: 'normal', name: 'Estilhaço amplo', description: 'Aumenta o dano em área secundário para 30%.', for: ['area'], maxLevels: 1, apply: (p) => { p.areaDamageMultiplier = Math.max(p.areaDamageMultiplier, 0.30); } },
  { id: 'area-damage-50', family: 'ataque', rarity: 'raro', name: 'Onda expandida', description: 'Aumenta o dano em área secundário para 50%.', for: ['area'], maxLevels: 1, requires: 'area-damage-30', apply: (p) => { p.areaDamageMultiplier = Math.max(p.areaDamageMultiplier, 0.50); } },
  { id: 'area-damage-75', family: 'ataque', rarity: 'lendario', name: 'Campo devastador', description: 'Aumenta o dano em área secundário para 75%.', for: ['area'], maxLevels: 1, requires: 'area-damage-50', apply: (p) => { p.areaDamageMultiplier = Math.max(p.areaDamageMultiplier, 0.75); } },
  { id: 'area-damage-100', family: 'ataque', rarity: 'ancestral', name: 'Área total', description: 'O dano em área secundário chega a 100% do dano direto.', for: ['area'], maxLevels: 1, requires: 'area-damage-75', apply: (p) => { p.areaDamageMultiplier = 1; } },
] as const;

/** Especializações enxutas por tipo. Todas têm limite de uma escolha para não soterrar as builds em bônus lineares. */
function typeUpgrade(type: PokemonType, id: string, name: string, description: string, apply: (p: SurvivorPlayer) => void, forCategories?: readonly MoveCategory[]): SurvivorUpgrade {
  return { id, type, name, description, family: 'elemento', rarity: 'raro', maxLevels: 1, ...(forCategories ? { for: forCategories } : {}), apply };
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
    id: 'ancestral-vitality', family: 'defesa', rarity: 'ancestral', name: 'Coração ancestral',
    description: '+45 de vida máxima, cura 45 e aumenta a velocidade em 8%.', maxLevels: 1,
    apply: (p) => { p.maxHp += 45; p.hp = Math.min(p.maxHp, p.hp + 45); p.speed = round1(p.speed * 1.08); },
  },
  {
    id: 'ancestral-strike', family: 'ataque', rarity: 'ancestral', name: 'Golpe ancestral',
    description: '+25% de dano (até 60) e +12% de alcance ou raio.', maxLevels: 1,
    apply: (p) => { p.attackDamage = Math.min(60, round1(p.attackDamage * 1.25)); improveReach(p, 1.12); },
  },
  {
    id: 'ancestral-flow', family: 'movimento', rarity: 'ancestral', name: 'Fluxo ancestral',
    description: '-18% no tempo entre ataques (mínimo 240 ms) e +12% de velocidade.', maxLevels: 1,
    apply: (p) => { p.attackCooldownMs = Math.max(240, Math.round(p.attackCooldownMs * 0.82)); p.speed = round1(p.speed * 1.12); },
  },
];

export const SURVIVOR_UPGRADES: readonly SurvivorUpgrade[] = [
  ...GENERIC_SURVIVOR_UPGRADES,
  ...TYPE_SURVIVOR_UPGRADES.map((upgrade) => LEGENDARY_TYPE_UPGRADES.has(upgrade.id) ? { ...upgrade, rarity: 'lendario' as const } : upgrade),
  ...ANCESTRAL_SURVIVOR_UPGRADES,
];
