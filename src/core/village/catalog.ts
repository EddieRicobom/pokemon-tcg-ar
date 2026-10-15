/**
 * Catálogo de itens da Vila: materiais que você coleta, móveis para colecionar (fabricados, comprados na loja ou dados
 * pelos amigos), sementes e colheitas da horta, e acessórios (para você e para os seus Pokémon).
 * `price` = custo na loja em moedas (0 = não vende); `sell` = quanto a loja paga.
 */

export type ItemKind = 'material' | 'furniture' | 'seed' | 'crop' | 'accessory';
export type AccessorySlot = 'player' | 'pokemon' | 'both';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  /** Grupo, para organizar o catálogo (móveis) ou o lugar do acessório. */
  group?: string;
  price: number;
  sell: number;
  recipe?: Record<string, number>;
  /** Só aparece como presente de amigo (raro). */
  gift?: boolean;
  /** Acessório: quem pode usar. */
  slot?: AccessorySlot;
  /** Semente: o que nasce e em quantos estágios (cada estágio precisa de rega e de tempo). */
  grows?: { crop: string; stages: number; minutes: number; yield: [number, number] };
}

const m = (id: string, name: string, sell: number, price = 0): ItemDef => ({ id, name, kind: 'material', price, sell });
const f = (id: string, name: string, group: string, opt: Partial<ItemDef>): ItemDef => ({ id, name, kind: 'furniture', group, price: 0, sell: 10, ...opt });
const s = (id: string, name: string, crop: string, minutes: number, price: number): ItemDef => ({ id, name, kind: 'seed', price, sell: Math.floor(price / 2), grows: { crop, stages: 3, minutes, yield: [2, 4] } });
const c = (id: string, name: string, sell: number): ItemDef => ({ id, name, kind: 'crop', price: 0, sell });
const a = (id: string, name: string, slot: AccessorySlot, price: number, opt: Partial<ItemDef> = {}): ItemDef => ({ id, name, kind: 'accessory', slot, price, sell: Math.floor(price / 3), ...opt });

export const ITEMS: readonly ItemDef[] = [
  // Materiais (coleta)
  m('madeira', 'Madeira', 4),
  m('pedra', 'Pedra', 4),
  m('oran', 'Fruta Oran', 8),
  m('pecha', 'Fruta Pecha', 8),
  m('flor', 'Flor', 5),
  m('concha', 'Concha', 12),
  m('tecido', 'Tecido', 10, 30),
  m('ferro', 'Ferro', 14, 40),
  // Colheitas da horta
  c('girassol', 'Girassol', 18),
  c('abobora', 'Abóbora', 30),
  c('tomate', 'Tomate', 14),
  c('morango', 'Morango', 22),
  // Sementes (loja; às vezes no mato alto)
  s('sem-oran', 'Semente de Oran', 'oran', 8, 20),
  s('sem-pecha', 'Semente de Pecha', 'pecha', 8, 20),
  s('sem-girassol', 'Semente de Girassol', 'girassol', 12, 30),
  s('sem-tomate', 'Semente de Tomate', 'tomate', 10, 25),
  s('sem-morango', 'Semente de Morango', 'morango', 14, 40),
  s('sem-abobora', 'Semente de Abóbora', 'abobora', 20, 50),
  // Móveis: casa
  f('cadeira', 'Cadeira', 'Casa', { recipe: { madeira: 3 }, sell: 12 }),
  f('banquinho', 'Banquinho', 'Casa', { recipe: { madeira: 2 }, sell: 8 }),
  f('poltrona', 'Poltrona', 'Casa', { recipe: { madeira: 3, tecido: 2 }, price: 160, sell: 40 }),
  f('sofa', 'Sofá', 'Casa', { recipe: { madeira: 4, tecido: 4 }, price: 260, sell: 60 }),
  f('mesa', 'Mesa', 'Casa', { recipe: { madeira: 5 }, sell: 18 }),
  f('mesinha', 'Mesinha', 'Casa', { recipe: { madeira: 3 }, price: 60, sell: 12 }),
  f('cama', 'Cama', 'Casa', { recipe: { madeira: 5, tecido: 3 }, price: 300, sell: 70 }),
  f('estante', 'Estante de livros', 'Casa', { recipe: { madeira: 6 }, price: 180, sell: 40 }),
  f('bau', 'Baú', 'Casa', { recipe: { madeira: 4, ferro: 1 }, price: 150, sell: 35 }),
  f('tapete', 'Tapete', 'Casa', { recipe: { tecido: 3 }, price: 90, sell: 20 }),
  f('relogio', 'Relógio de pé', 'Casa', { recipe: { madeira: 4, ferro: 2 }, price: 320, sell: 80 }),
  f('quadro', 'Quadro', 'Casa', { price: 120, sell: 30 }),
  f('televisao', 'Televisão', 'Casa', { price: 480, sell: 120 }),
  f('radio', 'Rádio', 'Casa', { price: 220, sell: 55 }),
  f('lareira', 'Lareira', 'Casa', { recipe: { pedra: 10, ferro: 2 }, price: 520, sell: 130 }),
  // Móveis: luz
  f('luminaria', 'Lampião', 'Luz', { recipe: { madeira: 2, pedra: 2 }, sell: 15 }),
  f('abajur', 'Abajur', 'Luz', { recipe: { tecido: 1, ferro: 1 }, price: 110, sell: 25 }),
  f('poste', 'Poste de luz', 'Luz', { recipe: { ferro: 3 }, price: 240, sell: 60 }),
  f('lanterna', 'Lanterna de papel', 'Luz', { recipe: { tecido: 2, madeira: 1 }, price: 130, sell: 30 }),
  // Móveis: jardim
  f('vaso', 'Vaso de flores', 'Jardim', { recipe: { flor: 3, pedra: 1 }, sell: 14 }),
  f('fonte', 'Fonte', 'Jardim', { recipe: { pedra: 6, concha: 2 }, sell: 40 }),
  f('cerca', 'Cerca', 'Jardim', { recipe: { madeira: 2 }, sell: 6 }),
  f('placa', 'Placa', 'Jardim', { recipe: { madeira: 2, pedra: 1 }, sell: 8 }),
  f('banco', 'Banco de praça', 'Jardim', { recipe: { madeira: 4, ferro: 1 }, price: 200, sell: 45 }),
  f('balanco', 'Balanço', 'Jardim', { recipe: { madeira: 5, tecido: 1 }, price: 240, sell: 55 }),
  f('escorregador', 'Escorregador', 'Jardim', { price: 380, sell: 90 }),
  f('guarda-sol', 'Guarda-sol', 'Jardim', { recipe: { tecido: 3, madeira: 1 }, price: 160, sell: 35 }),
  f('churrasqueira', 'Churrasqueira', 'Jardim', { recipe: { pedra: 6, ferro: 2 }, price: 300, sell: 70 }),
  f('correio', 'Caixa de correio', 'Jardim', { recipe: { madeira: 2, ferro: 1 }, price: 90, sell: 20 }),
  f('espantalho', 'Espantalho', 'Jardim', { recipe: { madeira: 3, tecido: 2 }, price: 140, sell: 30 }),
  f('poco', 'Poço', 'Jardim', { recipe: { pedra: 12, madeira: 3 }, price: 420, sell: 100 }),
  f('bonsai', 'Bonsai', 'Jardim', { price: 260, sell: 60 }),
  f('cogumelo', 'Cogumelo gigante', 'Jardim', { gift: true, sell: 80 }),
  f('abobora-lanterna', 'Lanterna de abóbora', 'Jardim', { recipe: { abobora: 1 }, sell: 50 }),
  f('girassois', 'Canteiro de girassóis', 'Jardim', { recipe: { girassol: 3, madeira: 1 }, sell: 50 }),
  // Móveis: Pokémon
  f('pokebola', 'Pokébola gigante', 'Pokémon', { price: 500, sell: 120 }),
  f('cama-poke', 'Caminha de Pokémon', 'Pokémon', { recipe: { tecido: 3, madeira: 1 }, price: 180, sell: 40 }),
  f('trofeu', 'Troféu da Liga', 'Pokémon', { gift: true, sell: 200 }),
  f('pelucia', 'Pelúcia de Pokébola', 'Pokémon', { gift: true, sell: 90 }),
  f('totem', 'Totem de insígnias', 'Pokémon', { gift: true, sell: 150 }),
  f('comedouro', 'Comedouro', 'Pokémon', { recipe: { madeira: 2, oran: 2 }, price: 80, sell: 18 }),
  // Acessórios (você)
  a('chapeu-palha', 'Chapéu de palha', 'both', 120),
  a('bone', 'Boné esportivo', 'player', 90),
  a('oculos', 'Óculos escuros', 'player', 140),
  a('cachecol', 'Cachecol', 'player', 110),
  a('mochila', 'Mochila de aventura', 'player', 160),
  // Acessórios (você ou seus Pokémon)
  a('laco', 'Laço', 'both', 80),
  a('coroa-flores', 'Coroa de flores', 'both', 0, { recipe: { flor: 6 } }),
  a('cartola', 'Mini cartola', 'pokemon', 200),
  a('tiara', 'Tiara brilhante', 'both', 260),
  a('gorro', 'Gorro de inverno', 'both', 150),
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const itemDef = (id: string): ItemDef | undefined => ITEM_BY_ID.get(id);
export const isItem = (id: string): boolean => ITEM_BY_ID.has(id);
export const FURNITURE_IDS = ITEMS.filter((i) => i.kind === 'furniture').map((i) => i.id);
export const SEED_IDS = ITEMS.filter((i) => i.kind === 'seed').map((i) => i.id);
export const ACCESSORY_IDS = ITEMS.filter((i) => i.kind === 'accessory').map((i) => i.id);
export const MATERIAL_IDS = ITEMS.filter((i) => i.kind === 'material' || i.kind === 'crop').map((i) => i.id);
/** O que a loja vende hoje: um sortimento que muda a cada dia (sempre com sementes). */
export function shopToday(day: string): ItemDef[] {
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
  const forSale = ITEMS.filter((i) => i.price > 0 && i.kind !== 'seed');
  const picks: ItemDef[] = [];
  const pool = [...forSale];
  for (let n = 0; n < 8 && pool.length > 0; n++) {
    h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    picks.push(pool.splice(h % pool.length, 1)[0]!);
  }
  return [...ITEMS.filter((i) => i.kind === 'seed'), ...picks];
}
