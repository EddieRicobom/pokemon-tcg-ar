import type { BaseStats } from './survivor-moves';

/**
 * As 20 armas do catálogo de `future project/IDEIAS_DO_JOGO.md` e as 210 fusões entre elas. Cada arma tem um FORMATO
 * de ataque (quais casas atinge) e um MECANISMO próprio (o que acontece além do dano). A fusão segue a regra do
 * catálogo: usa o formato e o mecanismo da primeira arma (na ordem do catálogo) e incorpora o mecanismo da segunda;
 * duas armas iguais reforçam o mecanismo (ele vale duas vezes). Os números são de protótipo.
 */

export type WeaponId =
  | 'laminas' | 'espada' | 'martelo' | 'lanca' | 'manoplas'
  | 'escudo' | 'barreira' | 'orbital' | 'espadaEscudo'
  | 'emissor' | 'dispersao' | 'continuo' | 'canhao' | 'lancador' | 'condutor' | 'rifle' | 'disco'
  | 'armadilhas' | 'correntes' | 'enxameador';

/**
 * `adjacent`: uma casa vizinha. `line`: todas as casas em linha até o alcance (atravessa). `ranged`: o primeiro inimigo
 * em linha reta. `area`: casa escolhida e as 4 vizinhas. `cone`: leque à frente (1 casa e depois 3). `aura`: as 8 casas
 * em volta. `homing`: qualquer inimigo até o alcance, sem precisar de linha. `trap`: instala uma armadilha na casa.
 */
export type WeaponPattern = 'adjacent' | 'line' | 'ranged' | 'area' | 'cone' | 'aura' | 'homing' | 'trap';
export type WeaponCategory = 'Corpo a corpo' | 'Defesa' | 'Distância' | 'Controle' | 'Fusão';

export type MechanicId =
  | 'rapido' | 'precisao' | 'abalo' | 'estender' | 'combo'
  | 'bloqueio' | 'barreira' | 'orbita' | 'escudada'
  | 'rajada' | 'estilhaco' | 'queimar' | 'carga' | 'explosao' | 'arco' | 'perfurar' | 'retorno'
  | 'armadilha' | 'puxar' | 'enxame';

export interface Weapon {
  id: WeaponId;
  /** Número no catálogo (1 a 20). */
  number: number;
  name: string;
  category: WeaponCategory;
  /** Físico usa Attack/Defense; especial usa Special Attack/Special Defense. */
  kind: 'physical' | 'special';
  ap: number;
  /** Carga gasta por ataque. */
  cost: number;
  /** Capacidade de carga da arma. */
  capacity: number;
  power: number;
  pattern: WeaponPattern;
  range: number;
  description: string;
  /** Mecanismos que o ataque aplica: o da própria arma; na fusão, o das duas. */
  mechanics: MechanicId[];
}

export const MECHANICS: Readonly<Record<MechanicId, { name: string; effect: string; component: string }>> = {
  rapido: { name: 'Cortes rápidos', effect: 'o primeiro alvo leva um corte extra de 40% do dano', component: 'acrescenta cortes rápidos adjacentes' },
  precisao: { name: 'Estocada precisa', effect: '+15% de chance de crítico neste ataque', component: 'acrescenta uma estocada curta e precisa' },
  abalo: { name: 'Abalo', effect: 'os alvos ficam com a defesa abalada (−25%) até o fim da rodada', component: 'acrescenta um golpe pesado que abala a defesa' },
  estender: { name: 'Alcance em linha', effect: 'quem estiver logo atrás de cada alvo leva 60% do dano', component: 'estende o ataque em linha por até duas casas' },
  combo: { name: 'Sequência', effect: '+15% de poder por ataque já feito neste turno (até +45%)', component: 'acrescenta uma sequência de socos e um golpe carregado' },
  bloqueio: { name: 'Bloqueio', effect: 'o próximo golpe recebido perde 40%, e quem bater de perto leva o revide', component: 'permite bloquear em uma direção e revidar de perto' },
  barreira: { name: 'Barreira', effect: 'ergue uma barreira por 2 rodadas na casa à sua frente, na direção do alvo', component: 'cria uma barreira temporária na direção escolhida' },
  orbita: { name: 'Proteção orbital', effect: 'o próximo golpe recebido perde 20% e os inimigos encostados em você levam 25%', component: 'adiciona proteção orbital temporária' },
  escudada: { name: 'Golpe de escudo', effect: 'o próximo golpe recebido perde 25% e o primeiro alvo é empurrado', component: 'acrescenta bloqueio direcional e um golpe de escudo' },
  rajada: { name: 'Rajada', effect: 'cada alvo leva mais 25% em projéteis', component: 'acrescenta uma sequência rápida de projéteis' },
  estilhaco: { name: 'Estilhaços', effect: 'inimigos encostados em você levam 30%', component: 'distribui projéteis em um cone de curto alcance' },
  queimar: { name: 'Ação sustentada', effect: 'os alvos perdem 20% do dano por rodada, por 2 rodadas', component: 'permite sustentar o efeito durante a ação' },
  carga: { name: 'Carga', effect: '+35% de poder', component: 'permite carregar o ataque para aumentar sua potência' },
  explosao: { name: 'Explosão', effect: 'inimigos vizinhos de cada alvo levam 40%', component: 'faz um projétil seguir um arco e explodir na área' },
  arco: { name: 'Arco elétrico', effect: 'a energia salta para até 2 inimigos próximos (50% e 30%)', component: 'faz a energia saltar entre alvos próximos' },
  perfurar: { name: 'Perfuração', effect: 'ignora 25% da defesa e atravessa até 3 casas atrás do alvo (60%)', component: 'permite atravessar alvos alinhados' },
  retorno: { name: 'Retorno', effect: 'cada alvo é atingido de novo na volta (30%)', component: 'faz o componente lançado retornar ao usuário' },
  armadilha: { name: 'Armadilha', effect: 'deixa uma armadilha ao lado do primeiro alvo (60% do dano em quem pisar)', component: 'permite instalar um dispositivo ativado por proximidade' },
  puxar: { name: 'Corrente', effect: 'puxa o primeiro alvo até ficar encostado em você', component: 'permite prender um alvo ou superfície e alterar o posicionamento' },
  enxame: { name: 'Enxame', effect: 'dois projéteis perseguem os 2 inimigos mais próximos (25% cada)', component: 'acrescenta projéteis que perseguem inimigos' },
};

type Def = Omit<Weapon, 'id' | 'number' | 'mechanics'> & { mechanic: MechanicId };
const DEFS: readonly [WeaponId, Def][] = [
  ['laminas', { name: 'Lâminas duplas', category: 'Corpo a corpo', kind: 'physical', ap: 1, cost: 1, capacity: 10, power: 26, pattern: 'adjacent', range: 1, mechanic: 'rapido', description: 'Ataca rapidamente um inimigo adjacente.' }],
  ['espada', { name: 'Espada longa', category: 'Corpo a corpo', kind: 'physical', ap: 2, cost: 1, capacity: 10, power: 38, pattern: 'ranged', range: 2, mechanic: 'precisao', description: 'Executa cortes precisos e uma estocada de alcance curto.' }],
  ['martelo', { name: 'Martelo de impacto', category: 'Corpo a corpo', kind: 'physical', ap: 3, cost: 3, capacity: 12, power: 80, pattern: 'adjacent', range: 1, mechanic: 'abalo', description: 'Desfere golpes lentos capazes de abalar a defesa.' }],
  ['lanca', { name: 'Lança de combate', category: 'Corpo a corpo', kind: 'physical', ap: 2, cost: 2, capacity: 10, power: 40, pattern: 'line', range: 2, mechanic: 'estender', description: 'Ataca em linha a até duas casas de distância.' }],
  ['manoplas', { name: 'Manoplas', category: 'Corpo a corpo', kind: 'physical', ap: 1, cost: 1, capacity: 12, power: 22, pattern: 'adjacent', range: 1, mechanic: 'combo', description: 'Combina socos rápidos com um golpe carregado.' }],
  ['escudo', { name: 'Escudo de impacto', category: 'Defesa', kind: 'physical', ap: 2, cost: 1, capacity: 12, power: 24, pattern: 'adjacent', range: 1, mechanic: 'bloqueio', description: 'Bloqueia em uma direção e pode golpear inimigos adjacentes.' }],
  ['barreira', { name: 'Projetor de barreira', category: 'Defesa', kind: 'special', ap: 2, cost: 2, capacity: 10, power: 22, pattern: 'ranged', range: 3, mechanic: 'barreira', description: 'Cria uma proteção temporária em uma casa ou direção escolhida.' }],
  ['orbital', { name: 'Guardião orbital', category: 'Defesa', kind: 'special', ap: 2, cost: 2, capacity: 10, power: 22, pattern: 'aura', range: 1, mechanic: 'orbita', description: 'Mantém um dispositivo de proteção ao redor do usuário.' }],
  ['espadaEscudo', { name: 'Espada e escudo', category: 'Defesa', kind: 'physical', ap: 2, cost: 2, capacity: 11, power: 34, pattern: 'adjacent', range: 1, mechanic: 'escudada', description: 'Combina cortes adjacentes com bloqueio direcional e golpes de escudo.' }],
  ['emissor', { name: 'Emissor rápido', category: 'Distância', kind: 'special', ap: 1, cost: 1, capacity: 10, power: 20, pattern: 'ranged', range: 4, mechanic: 'rajada', description: 'Dispara projéteis precisos em sequência.' }],
  ['dispersao', { name: 'Canhão de dispersão', category: 'Distância', kind: 'special', ap: 2, cost: 2, capacity: 10, power: 30, pattern: 'cone', range: 2, mechanic: 'estilhaco', description: 'Dispara projéteis em cone, eficazes de perto.' }],
  ['continuo', { name: 'Projetor contínuo', category: 'Distância', kind: 'special', ap: 2, cost: 2, capacity: 10, power: 24, pattern: 'line', range: 3, mechanic: 'queimar', description: 'Projeta energia em linha por uma ação sustentada.' }],
  ['canhao', { name: 'Canhão de carga', category: 'Distância', kind: 'special', ap: 3, cost: 3, capacity: 9, power: 62, pattern: 'ranged', range: 5, mechanic: 'carga', description: 'Carrega energia para um disparo potente.' }],
  ['lancador', { name: 'Lançador balístico', category: 'Distância', kind: 'special', ap: 3, cost: 3, capacity: 9, power: 36, pattern: 'area', range: 3, mechanic: 'explosao', description: 'Lança um projétil em arco que explode ao atingir a área.' }],
  ['condutor', { name: 'Condutor de arco', category: 'Distância', kind: 'special', ap: 2, cost: 2, capacity: 10, power: 28, pattern: 'ranged', range: 3, mechanic: 'arco', description: 'Conecta energia a um alvo e a outros próximos.' }],
  ['rifle', { name: 'Rifle perfurante', category: 'Distância', kind: 'physical', ap: 3, cost: 2, capacity: 9, power: 46, pattern: 'line', range: 5, mechanic: 'perfurar', description: 'Dispara um tiro preciso que atravessa alvos alinhados.' }],
  ['disco', { name: 'Disco retornável', category: 'Distância', kind: 'physical', ap: 2, cost: 2, capacity: 10, power: 28, pattern: 'line', range: 3, mechanic: 'retorno', description: 'Lança um disco que atravessa alvos e retorna.' }],
  ['armadilhas', { name: 'Lançador de armadilhas', category: 'Controle', kind: 'special', ap: 2, cost: 2, capacity: 10, power: 40, pattern: 'trap', range: 3, mechanic: 'armadilha', description: 'Instala dispositivos ativados por proximidade.' }],
  ['correntes', { name: 'Lança-correntes', category: 'Controle', kind: 'physical', ap: 2, cost: 2, capacity: 10, power: 28, pattern: 'ranged', range: 3, mechanic: 'puxar', description: 'Prende um alvo ou superfície para alterar o posicionamento.' }],
  ['enxameador', { name: 'Enxameador', category: 'Controle', kind: 'special', ap: 2, cost: 2, capacity: 10, power: 20, pattern: 'homing', range: 4, mechanic: 'enxame', description: 'Libera pequenos projéteis que perseguem inimigos.' }],
];

/** Ordem do catálogo (a fusão segue esta ordem, como em «Lâminas duplas + Espada longa»). */
export const CATALOG_ORDER: readonly WeaponId[] = DEFS.map(([id]) => id);

export const WEAPONS: Readonly<Record<WeaponId, Weapon>> = Object.fromEntries(
  DEFS.map(([id, { mechanic, ...def }], i) => [id, { ...def, id, number: i + 1, mechanics: [mechanic] }]),
) as Record<WeaponId, Weapon>;

/** O mecanismo próprio de uma arma base. */
export const mechanicOf = (id: WeaponId): MechanicId => WEAPONS[id].mechanics[0]!;

/**
 * PROVISÓRIO: a arma sai dos stats base, até a tabela de armas e munições ser definida. Quem aguenta mais do que bate
 * vai para a defesa; o resto se divide entre físico e especial pelo ritmo (Speed) e por mais um stat de desempate.
 */
export function weaponFor(s: BaseStats): WeaponId {
  const offense = s.attack + s.spAttack;
  const bulk = s.defense + s.spDefense;
  if (bulk > offense * 1.15) {
    if (s.defense >= s.spDefense) return s.speed < 60 ? 'escudo' : 'espadaEscudo';
    return s.speed < 60 ? 'barreira' : 'orbital';
  }
  if (s.attack >= s.spAttack) {
    if (s.speed >= 100) return 'laminas';
    if (s.speed >= 85) return 'manoplas';
    if (s.speed >= 70) return s.attack >= 100 ? 'espada' : 'disco';
    if (s.speed >= 55) return s.hp >= 75 ? 'lanca' : 'rifle';
    return s.attack >= 100 ? 'martelo' : 'correntes';
  }
  if (s.speed >= 100) return 'emissor';
  if (s.speed >= 85) return 'enxameador';
  if (s.speed >= 70) return s.spAttack >= 100 ? 'condutor' : 'dispersao';
  if (s.speed >= 55) return s.hp >= 75 ? 'continuo' : 'armadilhas';
  return s.spAttack >= 100 ? 'canhao' : 'lancador';
}

export const FUSION_CHARGE = 12;

/** As duas armas de uma fusão na ordem do catálogo (a ordem do par não importa). */
export function fusionOrigins(a: WeaponId, b: WeaponId): [WeaponId, WeaponId] {
  return CATALOG_ORDER.indexOf(a) <= CATALOG_ORDER.indexOf(b) ? [a, b] : [b, a];
}

/** Nome do catálogo para a fusão de duas armas. */
export function fusionName(a: WeaponId, b: WeaponId): string {
  const [first, second] = fusionOrigins(a, b);
  return `${WEAPONS[first].name} + ${WEAPONS[second].name}`;
}

/** Número da fusão no catálogo: 1 a 190 para armas diferentes, 191 a 210 para armas iguais. */
export function fusionNumber(a: WeaponId, b: WeaponId): number {
  const [first, second] = fusionOrigins(a, b);
  const i = CATALOG_ORDER.indexOf(first);
  const j = CATALOG_ORDER.indexOf(second);
  const n = CATALOG_ORDER.length;
  if (i === j) return n * (n - 1) / 2 + i + 1;
  // Pares (i, j) com i < j, contados linha a linha como no catálogo.
  return i * n - (i * (i + 1)) / 2 + (j - i);
}

/** O texto do catálogo: o que a primeira arma faz e o que o componente da segunda acrescenta. */
export function fusionDescription(a: WeaponId, b: WeaponId): string {
  const [first, second] = fusionOrigins(a, b);
  const component = MECHANICS[mechanicOf(second)].component;
  return first === second
    ? `${WEAPONS[first].description} A segunda arma ${component}, ampliando as possibilidades da ação.`
    : `${WEAPONS[first].description} O componente ${WEAPONS[second].name.toLowerCase()} ${component}.`;
}

/**
 * A arma híbrida: formato e categoria da primeira; os dois mecanismos; alcance do maior; potência somada com desconto
 * e 1 PA a mais que a mais rápida (uma fusão não executa os dois efeitos de graça). Físico ou especial como a primeira.
 */
export function fusionWeapon(a: WeaponId, b: WeaponId): Weapon {
  const [first, second] = fusionOrigins(a, b);
  const wa = WEAPONS[first];
  const wb = WEAPONS[second];
  return {
    ...wa,
    number: fusionNumber(first, second),
    name: fusionName(first, second),
    category: 'Fusão',
    ap: Math.min(4, Math.min(wa.ap, wb.ap) + 1),
    cost: Math.max(wa.cost, wb.cost),
    capacity: FUSION_CHARGE,
    power: Math.round((wa.power + wb.power) * 0.75),
    range: Math.max(wa.range, wb.range),
    description: fusionDescription(first, second),
    mechanics: [mechanicOf(first), mechanicOf(second)],
  };
}

/** Todas as 210 fusões do catálogo, na ordem dele. */
export function allFusions(): { origins: [WeaponId, WeaponId]; weapon: Weapon }[] {
  const out: { origins: [WeaponId, WeaponId]; weapon: Weapon }[] = [];
  for (let i = 0; i < CATALOG_ORDER.length; i++) for (let j = i; j < CATALOG_ORDER.length; j++) {
    const a = CATALOG_ORDER[i]!;
    const b = CATALOG_ORDER[j]!;
    out.push({ origins: [a, b], weapon: fusionWeapon(a, b) });
  }
  return out.sort((x, y) => x.weapon.number - y.weapon.number);
}
