/**
 * Catálogo de itens da Vila: materiais que você coleta e pesca, móveis para colecionar (fabricados, comprados na loja ou
 * dados pelos amigos), sementes e colheitas da horta, comidas da cozinha e acessórios (para você e para os seus Pokémon).
 * `price` = custo na loja em moedas (0 = não vende); `sell` = quanto a loja paga.
 */

import { NEW_ACCESSORIES } from './accessory-collection';
import { NEW_CROPS, NEW_FOODS, NEW_MATERIALS, NEW_SEEDS } from './item-collection';
import type { AccessoryPos } from './accessory-fit';
import { COZY_FURNITURE, NEW_FURNITURE_ITEMS } from './furniture-collection';

export type ItemKind = 'material' | 'furniture' | 'seed' | 'crop' | 'accessory' | 'food';
export type AccessorySlot = 'player' | 'pokemon' | 'both';
/** Onde o acessório vai no corpo (ver `accessory-fit.ts`). */
export type { AccessoryPos } from './accessory-fit';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  /** Grupo, para organizar o catálogo (móveis) ou o lugar do acessório. */
  group?: string;
  /** Papel do móvel na casa: orienta a planta e explica a decoração ao jogador. */
  purpose?: string;
  roomZone?: 'rest' | 'kitchen' | 'social' | 'wall';
  price: number;
  sell: number;
  recipe?: Record<string, number>;
  /** Só aparece como presente de amigo (raro). */
  gift?: boolean;
  /** Só vem como prêmio de conquista (ver `rewards.ts`). */
  prize?: boolean;
  /** Acessório: quem pode usar e onde vai. */
  slot?: AccessorySlot;
  pos?: AccessoryPos;
  /** Acessório: ajuste fino da posição, em pixels do desenho (ex.: a auréola flutua acima da cabeça). */
  nudge?: { dx?: number; dy?: number };
  /** Semente: o que nasce e em quantos estágios (cada estágio precisa de rega e de tempo). */
  grows?: { crop: string; stages: number; minutes: number; yield: [number, number] };
  /** Móvel alto: o desenho tem 2 blocos de altura (ocupa 1 só no chão). */
  tall?: boolean;
  /** Móvel animado (quantos quadros tem). */
  frames?: number;
  /** Móvel que liga à noite. */
  light?: boolean;
  /** Comida: pontos de amizade que dá ao ser presenteada. */
  feeds?: number;
  /** Consumível raro que avança a amizade para o próximo nível. */
  friendshipLevels?: number;
  /** Porções que sustentam a comunidade quando o item está no inventário. Ingrediente = 1; prato pronto = 2. */
  nutrition?: number;
}

const m = (id: string, name: string, sell: number, price = 0, nutrition = 0): ItemDef => ({ id, name, kind: 'material', price, sell, ...(nutrition > 0 ? { nutrition } : {}) });
const f = (id: string, name: string, group: string, opt: Partial<ItemDef>): ItemDef => ({ id, name, kind: 'furniture', group, price: 0, sell: 10, ...opt });
const s = (id: string, name: string, crop: string, minutes: number, price: number): ItemDef => ({ id, name, kind: 'seed', price, sell: Math.floor(price / 2), grows: { crop, stages: 3, minutes, yield: [2, 4] } });
const c = (id: string, name: string, sell: number): ItemDef => ({ id, name, kind: 'crop', price: 0, sell, nutrition: 1 });
const a = (id: string, name: string, slot: AccessorySlot, pos: AccessoryPos, price: number, opt: Partial<ItemDef> = {}): ItemDef => ({ id, name, kind: 'accessory', slot, pos, price, sell: Math.floor(price / 3), ...opt });
const d = (id: string, name: string, feeds: number, sell: number, recipe: Record<string, number>): ItemDef => ({ id, name, kind: 'food', price: 0, sell, recipe, feeds, nutrition: 2 });

/** Cores dos móveis em variações (a arte usa a mesma chave). */
export const COLOR_NAMES = {
  vermelho: ['vermelho', 'vermelha'],
  azul: ['azul', 'azul'],
  verde: ['verde', 'verde'],
  rosa: ['rosa', 'rosa'],
  amarelo: ['amarelo', 'amarela'],
  roxo: ['roxo', 'roxa'],
  listrado: ['listrado', 'listrada'],
} as const;
export type ColorKey = keyof typeof COLOR_NAMES;

/** Variações de cor de um móvel base: `<base>-<cor>`. Custam um pouco mais e, se o base se fabrica, pedem uma flor de tinta. */
function variants(base: ItemDef, fem: boolean, colors: ColorKey[]): ItemDef[] {
  return colors.map((color) =>
    f(`${base.id}-${color}`, `${base.name} ${COLOR_NAMES[color][fem ? 1 : 0]}`, base.group!, {
      price: base.price > 0 ? Math.round((base.price * 1.15) / 5) * 5 : 0,
      recipe: base.recipe ? { ...base.recipe, flor: 1 } : undefined,
      sell: base.sell,
      tall: base.tall,
    }),
  );
}

const BASE = {
  cadeira: f('cadeira', 'Cadeira', 'Casa', { recipe: { madeira: 3 }, sell: 12 }),
  sofa: f('sofa', 'Sofá', 'Casa', { recipe: { madeira: 4, tecido: 4 }, price: 260, sell: 60 }),
  poltrona: f('poltrona', 'Poltrona', 'Casa', { recipe: { madeira: 3, tecido: 2 }, price: 160, sell: 40 }),
  cama: f('cama', 'Cama', 'Casa', { recipe: { madeira: 5, tecido: 3 }, price: 300, sell: 70 }),
  tapete: f('tapete', 'Tapete', 'Casa', { recipe: { tecido: 3 }, price: 90, sell: 20 }),
  vaso: f('vaso', 'Vaso de flores', 'Jardim', { recipe: { flor: 3, pedra: 1 }, sell: 14 }),
  cerca: f('cerca', 'Cerca', 'Jardim', { recipe: { madeira: 2 }, sell: 6 }),
  almofada: f('almofada', 'Almofada de chão', 'Casa', { recipe: { tecido: 2, la: 1 }, price: 70, sell: 16, roomZone: 'social' }),
  banqueta: f('banqueta', 'Banqueta', 'Casa', { recipe: { tabua: 2, tecido: 1 }, price: 90, sell: 20, roomZone: 'kitchen' }),
};

export const ITEMS: readonly ItemDef[] = [
  ...COZY_FURNITURE,
  ...NEW_FURNITURE_ITEMS,
  BASE.almofada,
  ...variants(BASE.almofada, true, ['vermelho', 'azul', 'verde', 'rosa', 'amarelo', 'roxo', 'listrado']),
  BASE.banqueta,
  ...variants(BASE.banqueta, true, ['vermelho', 'azul', 'verde', 'rosa', 'amarelo', 'roxo', 'listrado']),
  // Materiais (coleta)
  m('madeira', 'Madeira', 4),
  m('pedra', 'Pedra', 4),
  m('oran', 'Fruta Oran', 8, 0, 1),
  m('pecha', 'Fruta Pecha', 8, 0, 1),
  m('flor', 'Flor', 5),
  m('concha', 'Concha', 12),
  m('tecido', 'Tecido', 10, 30),
  m('ferro', 'Ferro', 14, 40),
  m('areia', 'Areia', 3),
  m('argila', 'Argila', 6),
  m('mel', 'Mel', 16, 0, 1),
  m('champignon', 'Cogumelo', 9, 0, 1),
  m('pena', 'Pena', 7),
  m('cristal', 'Cristal', 40),
  m('ouro', 'Pepita de ouro', 90),
  m('la', 'Lã', 12),
  // Pesca
  m('peixe', 'Peixe', 14, 0, 1),
  m('dourado', 'Peixe-dourado', 55, 0, 1),
  m('estrela', 'Estrela-do-mar', 30),
  m('perola', 'Pérola', 120),
  m('alga', 'Alga', 3),
  m('bota', 'Bota velha', 1),
  { ...m('love-candy', 'Love Candy', 0), friendshipLevels: 1 },
  m('trust-stone', 'Pedra da Confiança', 0),
  m('mega-stone-shard', 'Fragmento de Mega Stone', 0),
  // Materiais fabricados
  { ...m('tabua', 'Tábua', 9), recipe: { madeira: 2 } },
  { ...m('tijolo', 'Tijolo', 14), recipe: { pedra: 2, argila: 1 } },
  { ...m('vidro', 'Vidro', 20), recipe: { areia: 3, pedra: 1 } },
  ...NEW_MATERIALS,
  // Colheitas da horta
  c('girassol', 'Girassol', 18),
  c('abobora', 'Abóbora', 30),
  c('tomate', 'Tomate', 14),
  c('morango', 'Morango', 22),
  c('cenoura', 'Cenoura', 12),
  c('milho', 'Milho', 13),
  c('uva', 'Uva', 24),
  c('melancia', 'Melancia', 34),
  c('batata', 'Batata', 11),
  c('lavanda', 'Lavanda', 20),
  ...NEW_CROPS,
  // Sementes (loja; às vezes no mato alto)
  s('sem-oran', 'Semente de Oran', 'oran', 8, 20),
  s('sem-pecha', 'Semente de Pecha', 'pecha', 8, 20),
  s('sem-girassol', 'Semente de Girassol', 'girassol', 12, 30),
  s('sem-tomate', 'Semente de Tomate', 'tomate', 10, 25),
  s('sem-morango', 'Semente de Morango', 'morango', 14, 40),
  s('sem-abobora', 'Semente de Abóbora', 'abobora', 20, 50),
  s('sem-cenoura', 'Semente de Cenoura', 'cenoura', 9, 22),
  s('sem-milho', 'Semente de Milho', 'milho', 11, 26),
  s('sem-uva', 'Semente de Uva', 'uva', 16, 44),
  s('sem-melancia', 'Semente de Melancia', 'melancia', 22, 56),
  s('sem-batata', 'Semente de Batata', 'batata', 9, 20),
  s('sem-lavanda', 'Semente de Lavanda', 'lavanda', 12, 32),
  ...NEW_SEEDS,
  // Comidas (cozinha)
  d('suco-oran', 'Suco de Oran', 8, 26, { oran: 2 }),
  d('suco-pecha', 'Suco de Pecha', 8, 26, { pecha: 2 }),
  d('salada', 'Salada fresquinha', 9, 34, { tomate: 1, cenoura: 1 }),
  d('sopa-abobora', 'Sopa de abóbora', 11, 60, { abobora: 1, batata: 1 }),
  d('bolo-morango', 'Bolo de morango', 16, 90, { morango: 2, mel: 1 }),
  d('torta-pecha', 'Torta de Pecha', 14, 70, { pecha: 2, mel: 1 }),
  d('pao-mel', 'Pão de mel', 12, 50, { mel: 2, milho: 1 }),
  d('peixe-grelhado', 'Peixe grelhado', 13, 40, { peixe: 1 }),
  d('espetinho', 'Espetinho de cogumelo', 11, 38, { tomate: 1, champignon: 2 }),
  d('pipoca', 'Pipoca', 9, 28, { milho: 2 }),
  d('geleia', 'Geleia de uva', 13, 64, { uva: 2, mel: 1 }),
  d('melancia-gelada', 'Melancia gelada', 12, 60, { melancia: 1 }),
  d('ensopado', 'Ensopado caseiro', 14, 66, { batata: 1, cenoura: 1, champignon: 1 }),
  d('lanche-pokebola', 'Lanche Pokébola', 18, 110, { 'pao-mel': 1, tomate: 1, peixe: 1 }),
  ...NEW_FOODS,

  // Móveis: casa
  BASE.cadeira,
  f('banquinho', 'Banquinho', 'Casa', { recipe: { madeira: 2 }, sell: 8 }),
  BASE.poltrona,
  BASE.sofa,
  f('mesa', 'Mesa', 'Casa', { recipe: { madeira: 5 }, sell: 18 }),
  f('mesinha', 'Mesinha', 'Casa', { recipe: { madeira: 3 }, price: 60, sell: 12 }),
  BASE.cama,
  f('estante', 'Estante de livros', 'Casa', { recipe: { madeira: 6 }, price: 180, sell: 40 }),
  f('bau', 'Baú', 'Casa', { recipe: { madeira: 4, ferro: 1 }, price: 150, sell: 35 }),
  BASE.tapete,
  f('relogio', 'Relógio de pé', 'Casa', { recipe: { madeira: 4, ferro: 2 }, price: 320, sell: 80 }),
  f('quadro', 'Quadro', 'Casa', { price: 120, sell: 30 }),
  f('televisao', 'Televisão', 'Casa', { price: 480, sell: 120, frames: 2 }),
  f('radio', 'Rádio', 'Casa', { price: 220, sell: 55, frames: 2 }),
  f('lareira', 'Lareira', 'Casa', { recipe: { pedra: 10, ferro: 2 }, price: 520, sell: 130, light: true, frames: 2 }),
  f('geladeira', 'Geladeira', 'Casa', { recipe: { ferro: 4, vidro: 1 }, price: 420, sell: 100 }),
  f('fogao', 'Fogão', 'Casa', { recipe: { ferro: 3, tijolo: 2 }, price: 360, sell: 90, frames: 2 }),
  f('pia', 'Pia', 'Casa', { recipe: { ferro: 2, tijolo: 1 }, price: 200, sell: 45 }),
  f('guarda-roupa', 'Guarda-roupa', 'Casa', { recipe: { tabua: 4, tecido: 2 }, price: 340, sell: 80 }),
  f('espelho', 'Espelho', 'Casa', { recipe: { vidro: 2, tabua: 1 }, price: 150, sell: 36 }),
  f('piano', 'Piano', 'Casa', { price: 900, sell: 220 }),
  f('violao', 'Violão', 'Casa', { recipe: { tabua: 2, ferro: 1, tecido: 1 }, price: 240, sell: 55 }),
  f('aquario', 'Aquário', 'Casa', { recipe: { vidro: 3, dourado: 1, alga: 2 }, price: 0, sell: 120, frames: 2 }),
  f('samambaia', 'Samambaia', 'Casa', { recipe: { flor: 3, argila: 1 }, price: 70, sell: 16 }),
  f('cacto', 'Cacto', 'Casa', { price: 60, sell: 14 }),
  f('globo', 'Globo terrestre', 'Casa', { price: 200, sell: 50 }),
  f('cortina', 'Cortina', 'Casa', { recipe: { tecido: 3, tabua: 1 }, price: 130, sell: 28 }),
  f('escrivaninha', 'Escrivaninha', 'Casa', { recipe: { tabua: 4 }, price: 190, sell: 42 }),
  f('computador', 'Computador', 'Casa', { price: 640, sell: 160, frames: 2 }),
  f('banheira', 'Banheira', 'Casa', { recipe: { tijolo: 4, vidro: 1 }, price: 450, sell: 110 }),
  f('pufe', 'Pufe', 'Casa', { recipe: { tecido: 2, la: 1 }, price: 85, sell: 18 }),
  f('criado-mudo', 'Criado-mudo', 'Casa', { recipe: { tabua: 2 }, price: 70, sell: 15 }),
  f('fliperama', 'Fliperama', 'Casa', { price: 720, sell: 180, frames: 2 }),
  f('caixa-som', 'Caixa de som', 'Casa', { recipe: { ferro: 2, tecido: 1 }, price: 260, sell: 60, frames: 2 }),
  f('bola-disco', 'Bola de espelhos', 'Casa', { recipe: { vidro: 3, ferro: 1 }, price: 380, sell: 90, frames: 4, light: true }),
  f('rede', 'Rede de dormir', 'Casa', { recipe: { tecido: 4, madeira: 2 }, price: 190, sell: 40 }),
  f('ping-pong', 'Mesa de ping-pong', 'Casa', { recipe: { tabua: 4, ferro: 1 }, price: 380, sell: 90 }),
  f('bandeirinhas', 'Bandeirinhas', 'Casa', { recipe: { tecido: 2 }, price: 60, sell: 12 }),
  f('fossil', 'Fóssil antigo', 'Casa', { gift: true, sell: 260 }),
  f('ovo', 'Ovo misterioso', 'Pokémon', { gift: true, sell: 220, frames: 2 }),
  ...variants(BASE.cadeira, true, ['vermelho', 'azul', 'verde', 'rosa', 'amarelo']),
  ...variants(BASE.sofa, false, ['vermelho', 'verde', 'rosa', 'amarelo']),
  ...variants(BASE.poltrona, true, ['azul', 'verde', 'roxo']),
  ...variants(BASE.cama, true, ['azul', 'verde', 'amarelo']),
  ...variants(BASE.tapete, false, ['azul', 'verde', 'rosa', 'listrado']),
  f('quadro-mar', 'Quadro do mar', 'Casa', { price: 140, sell: 34 }),
  f('quadro-pokebola', 'Quadro de Pokébola', 'Casa', { price: 160, sell: 40 }),
  f('quadro-flores', 'Quadro de flores', 'Casa', { price: 130, sell: 32 }),
  // Coleção de vida cotidiana: peças acolhedoras, meio cidadezinha e meio casa de brinquedo.
  f('sofa-nuvem', 'Sofá nuvem', 'Casa', { recipe: { tecido: 5, la: 3 }, price: 390, sell: 92 }),
  f('mesa-cha', 'Mesa de chá', 'Casa', { recipe: { madeira: 3, flor: 2 }, price: 160, sell: 38 }),
  f('estante-bichinhos', 'Estante de bichinhos', 'Casa', { recipe: { tabua: 5, tecido: 2 }, price: 290, sell: 68 }),
  f('maquina-gacha', 'Máquina de cápsulas', 'Casa', { price: 460, sell: 110, frames: 2 }),
  f('luz-lava', 'Luminária de lava', 'Luz', { recipe: { vidro: 2, cristal: 1 }, price: 250, sell: 58, light: true, frames: 2 }),
  f('toca-discos', 'Toca-discos', 'Casa', { recipe: { ferro: 2, madeira: 2 }, price: 280, sell: 66, frames: 2 }),
  f('cabideiro', 'Cabideiro colorido', 'Casa', { recipe: { madeira: 3, tecido: 2 }, price: 150, sell: 34 }),
  f('planta-monstera', 'Monstera em vaso', 'Casa', { recipe: { argila: 2, flor: 3 }, price: 150, sell: 35 }),
  f('maquina-costura', 'Máquina de costura', 'Casa', { recipe: { ferro: 3, tecido: 2 }, price: 330, sell: 76 }),
  f('biombo', 'Biombo estampado', 'Casa', { recipe: { madeira: 3, tecido: 3 }, price: 220, sell: 50 }),
  f('cama-gatinho', 'Cama gatinho', 'Pokémon', { recipe: { tecido: 4, la: 2 }, price: 260, sell: 60 }),
  f('arranhador', 'Arranhador de Pokémon', 'Pokémon', { recipe: { madeira: 3, tecido: 3 }, price: 210, sell: 48 }),
  f('banco-cogumelo', 'Banco cogumelo', 'Jardim', { recipe: { madeira: 2, cogumelo: 1 }, price: 130, sell: 30 }),
  f('banquinho-toco', 'Banquinho de toco', 'Jardim', { recipe: { madeira: 3 }, price: 95, sell: 22 }),
  f('arco-flores', 'Arco de flores', 'Jardim', { recipe: { flor: 10, madeira: 3 }, price: 430, sell: 100, tall: true }),
  f('varal', 'Varal de roupinhas', 'Jardim', { recipe: { madeira: 3, tecido: 3 }, price: 190, sell: 44 }),
  f('caixa-correio-rosa', 'Caixa de correio rosa', 'Jardim', { recipe: { madeira: 2, ferro: 1, flor: 1 }, price: 120, sell: 28 }),
  // Móveis: luz
  f('luminaria', 'Lampião', 'Luz', { recipe: { madeira: 2, pedra: 2 }, sell: 15, light: true }),
  f('abajur', 'Abajur', 'Luz', { recipe: { tecido: 1, ferro: 1 }, price: 110, sell: 25, light: true }),
  f('poste', 'Poste de luz', 'Luz', { recipe: { ferro: 3 }, price: 240, sell: 60, light: true }),
  f('lanterna', 'Lanterna de papel', 'Luz', { recipe: { tecido: 2, madeira: 1 }, price: 130, sell: 30, light: true }),
  f('fogueira', 'Fogueira', 'Luz', { recipe: { pedra: 4, madeira: 3 }, price: 150, sell: 30, light: true, frames: 3 }),
  f('tocha', 'Tocha', 'Luz', { recipe: { madeira: 2, tecido: 1 }, price: 70, sell: 14, light: true, frames: 3 }),
  f('pisca-pisca', 'Pisca-pisca', 'Luz', { recipe: { ferro: 1, cristal: 1 }, price: 180, sell: 40, light: true, frames: 3 }),
  f('lampiao-cristal', 'Lampião de cristal', 'Luz', { recipe: { cristal: 2, ferro: 1 }, price: 0, sell: 110, light: true, frames: 2 }),
  // Móveis: jardim
  BASE.vaso,
  f('fonte', 'Fonte', 'Jardim', { recipe: { pedra: 6, concha: 2 }, sell: 40, frames: 2 }),
  BASE.cerca,
  f('placa', 'Placa', 'Jardim', { recipe: { madeira: 2, pedra: 1 }, sell: 8 }),
  f('banco', 'Banco de praça', 'Jardim', { recipe: { madeira: 4, ferro: 1 }, price: 200, sell: 45 }),
  f('balanco', 'Balanço', 'Jardim', { recipe: { madeira: 5, tecido: 1 }, price: 240, sell: 55, frames: 2 }),
  f('escorregador', 'Escorregador', 'Jardim', { price: 380, sell: 90 }),
  f('guarda-sol', 'Guarda-sol', 'Jardim', { recipe: { tecido: 3, madeira: 1 }, price: 160, sell: 35 }),
  f('churrasqueira', 'Churrasqueira', 'Jardim', { recipe: { pedra: 6, ferro: 2 }, price: 300, sell: 70, frames: 2 }),
  f('correio', 'Caixa de correio', 'Jardim', { recipe: { madeira: 2, ferro: 1 }, price: 90, sell: 20 }),
  f('poco', 'Poço', 'Jardim', { recipe: { pedra: 12, madeira: 3 }, price: 420, sell: 100 }),
  f('bonsai', 'Bonsai', 'Jardim', { price: 260, sell: 60 }),
  f('cogumelo', 'Cogumelo gigante', 'Jardim', { gift: true, sell: 80 }),
  f('abobora-lanterna', 'Lanterna de abóbora', 'Jardim', { recipe: { abobora: 1 }, sell: 50, light: true }),
  f('girassois', 'Canteiro de girassóis', 'Jardim', { recipe: { girassol: 3, madeira: 1 }, sell: 50 }),
  f('moinho', 'Moinho de vento', 'Jardim', { recipe: { tabua: 8, ferro: 3, tecido: 4 }, price: 700, sell: 170, tall: true, frames: 4 }),
  f('gazebo', 'Gazebo', 'Jardim', { recipe: { tabua: 10, tijolo: 4, flor: 6 }, price: 900, sell: 210, tall: true }),
  f('cerejeira', 'Cerejeira', 'Jardim', { price: 650, sell: 160, tall: true, frames: 2 }),
  f('palmeira', 'Palmeira', 'Jardim', { price: 360, sell: 85, tall: true, frames: 2 }),
  f('pinheirinho', 'Pinheirinho enfeitado', 'Jardim', { recipe: { madeira: 6, pedra: 2, cristal: 1 }, price: 420, sell: 100, tall: true, light: true, frames: 3 }),
  f('estatua', 'Estátua de pedra', 'Jardim', { recipe: { pedra: 14, tijolo: 2 }, price: 380, sell: 90, tall: true }),
  f('estatua-dourada', 'Estátua dourada', 'Jardim', { gift: true, sell: 400, tall: true }),
  f('mastro', 'Mastro com bandeira', 'Jardim', { recipe: { ferro: 3, tecido: 2 }, price: 210, sell: 48, tall: true, frames: 2 }),
  f('cerca-branca', 'Cerca branca', 'Jardim', { recipe: { tabua: 2 }, price: 40, sell: 8 }),
  f('cerca-pedra', 'Muro de pedra', 'Jardim', { recipe: { pedra: 3 }, price: 30, sell: 8 }),
  f('cerca-viva', 'Cerca-viva', 'Jardim', { recipe: { flor: 2, madeira: 1 }, price: 35, sell: 8 }),
  f('topiaria', 'Topiária', 'Jardim', { recipe: { flor: 8, madeira: 2 }, price: 260, sell: 60 }),
  f('laguinho', 'Laguinho', 'Jardim', { recipe: { pedra: 8, concha: 2, alga: 2 }, price: 340, sell: 80, frames: 3 }),
  f('cesta-piquenique', 'Cesta de piquenique', 'Jardim', { recipe: { madeira: 2, tecido: 2 }, price: 100, sell: 22 }),
  f('tenda', 'Tenda de acampamento', 'Jardim', { recipe: { tecido: 4, madeira: 3 }, price: 280, sell: 64 }),
  f('estufa', 'Estufa', 'Jardim', { recipe: { vidro: 6, tabua: 4 }, price: 560, sell: 130 }),
  f('carrinho-sorvete', 'Carrinho de sorvete', 'Jardim', { price: 520, sell: 130 }),
  f('barraca-suco', 'Barraquinha de suco', 'Jardim', { recipe: { tabua: 4, tecido: 2 }, price: 320, sell: 76 }),
  f('bicicleta', 'Bicicleta', 'Jardim', { recipe: { ferro: 4, tecido: 1 }, price: 340, sell: 80 }),
  f('skate', 'Skate', 'Jardim', { recipe: { tabua: 2, ferro: 1 }, price: 120, sell: 28 }),
  ...variants(BASE.vaso, true, ['rosa', 'azul', 'amarelo']),
  // Móveis: Pokémon
  f('pokebola', 'Pokébola gigante', 'Pokémon', { price: 500, sell: 120 }),
  f('cama-poke', 'Caminha de Pokémon', 'Pokémon', { recipe: { tecido: 3, madeira: 1 }, price: 180, sell: 40 }),
  f('trofeu', 'Troféu da Liga', 'Pokémon', { gift: true, sell: 200 }),
  f('pelucia', 'Pelúcia de Pokébola', 'Pokémon', { gift: true, sell: 90 }),
  f('totem', 'Totem de insígnias', 'Pokémon', { gift: true, sell: 150 }),
  f('comedouro', 'Comedouro', 'Pokémon', { recipe: { madeira: 2, oran: 2 }, price: 80, sell: 18 }),
  f('caixa-areia', 'Caixa de areia', 'Pokémon', { recipe: { madeira: 4, areia: 6 }, price: 90, sell: 20 }),
  f('cama-elastica', 'Cama elástica', 'Pokémon', { recipe: { ferro: 3, tecido: 3 }, price: 320, sell: 76, frames: 2 }),
  f('gangorra', 'Gangorra', 'Pokémon', { recipe: { tabua: 3, ferro: 1 }, price: 170, sell: 38, frames: 2 }),
  f('bola-praia', 'Bola de praia', 'Pokémon', { price: 55, sell: 10 }),
  f('casinha', 'Casinha de Pokémon', 'Pokémon', { recipe: { tabua: 5, tijolo: 2 }, price: 300, sell: 70 }),
  f('roda-giratoria', 'Roda de exercício', 'Pokémon', { recipe: { ferro: 3, tabua: 2 }, price: 230, sell: 52, frames: 2 }),
  f('pelucia-gigante', 'Pelúcia gigante', 'Pokémon', { recipe: { la: 6, tecido: 4 }, price: 0, sell: 130 }),
  f('banco-praca', 'Banco da praça', 'Jardim', { recipe: { tabua: 4, ferro: 1 }, price: 150, sell: 36 }),
  f('fonte-mini', 'Fonte de jardim', 'Jardim', { recipe: { pedra: 8, vidro: 2 }, price: 240, sell: 58, frames: 2 }),
  f('espantalho', 'Espantalho colorido', 'Jardim', { recipe: { madeira: 3, tecido: 2, flor: 2 }, price: 120, sell: 28 }),
  f('placa-bemvindo', 'Placa de boas-vindas', 'Jardim', { recipe: { tabua: 3, flor: 1 }, price: 95, sell: 22 }),

  // Acessórios: cabeça
  a('chapeu-palha', 'Chapéu de palha', 'both', 'hat', 120),
  a('bone', 'Boné esportivo', 'both', 'hat', 90),
  a('laco', 'Laço', 'both', 'ear', 80),
  a('coroa-flores', 'Coroa de flores', 'both', 'hat', 0, { recipe: { flor: 6 } }),
  a('cartola', 'Cartola', 'both', 'hat', 200),
  a('tiara', 'Tiara dourada', 'both', 'hat', 260),
  a('gorro', 'Gorro de inverno', 'both', 'hat', 150),
  a('chapeu-bruxa', 'Chapéu de bruxa', 'both', 'hat', 220),
  a('chapeu-festa', 'Chapéu de festa', 'both', 'hat', 60),
  a('chapeu-chef', 'Chapéu de chef', 'both', 'hat', 140),
  a('chapeu-cowboy', 'Chapéu de cowboy', 'both', 'hat', 190),
  a('capacete', 'Capacete', 'both', 'hat', 130),
  a('boina', 'Boina', 'both', 'hat', 110),
  a('coroa-real', 'Coroa real', 'both', 'hat', 0, { recipe: { ouro: 2, cristal: 2 } }),
  a('orelhas-gato', 'Orelhinhas de gato', 'both', 'hat', 100),
  a('chifres', 'Chifrinhos', 'both', 'hat', 100),
  a('bandana', 'Bandana', 'both', 'hat', 70),
  a('flor-orelha', 'Florzinha', 'both', 'ear', 0, { recipe: { flor: 2 } }),
  a('fones', 'Fones de ouvido', 'both', 'hat', 160),
  // Acessórios: rosto
  a('oculos', 'Óculos escuros', 'both', 'face', 140),
  a('oculos-redondos', 'Óculos redondos', 'both', 'face', 120),
  a('mascara', 'Máscara de herói', 'both', 'face', 150),
  a('bigode', 'Bigode falso', 'both', 'face', 50),
  a('nariz-palhaco', 'Nariz de palhaço', 'both', 'face', 40),
  // Acessórios: pescoço
  a('cachecol', 'Cachecol', 'both', 'neck', 110),
  a('gravata', 'Gravata-borboleta', 'both', 'neck', 90),
  a('medalha', 'Medalha dourada', 'both', 'neck', 0, { recipe: { ouro: 1, tecido: 1 } }),
  // Acessórios: costas
  a('mochila', 'Mochila de aventura', 'both', 'back', 160),
  a('capa', 'Capa de herói', 'both', 'back', 240),
  a('asinhas', 'Asinhas de anjo', 'both', 'back', 280),
  // Prêmios de conquistas: não vendem em lugar nenhum, só vêm do Treinador (ver `rewards.ts`).
  a('bone-treinador', 'Boné de Treinador', 'both', 'hat', 0, { sell: 0 }),
  a('fita-chama', 'Fita de chama', 'both', 'hat', 0, { sell: 0 }),
  a('louros', 'Coroa de louros', 'both', 'hat', 0, { sell: 0 }),
  a('tiara-brilho', 'Tiara brilhante', 'both', 'hat', 0, { sell: 0 }),
  a('tiara-coracoes', 'Tiara de corações', 'both', 'hat', 0, { sell: 0 }),
  a('monoculo', 'Monóculo', 'both', 'face', 0, { sell: 0 }),
  a('oculos-estrela', 'Óculos de estrela', 'both', 'face', 0, { sell: 0 }),
  a('colar-estrela', 'Colar de estrela', 'both', 'neck', 0, { sell: 0 }),
  a('laco-amizade', 'Laço da amizade', 'both', 'neck', 0, { sell: 0 }),
  a('insignia', 'Insígnia dourada', 'both', 'chest', 0, { sell: 0 }),
  a('faixa-vencedor', 'Faixa de vencedor', 'both', 'chest', 0, { sell: 0 }),
  a('capa-estelar', 'Capa estelar', 'both', 'back', 0, { sell: 0 }),
  a('capa-liga', 'Capa da Liga', 'both', 'back', 0, { sell: 0 }),
  // Cosméticos da Torre de Sobrevivência (prêmios de conquistas, nunca vendem).
  a('fita-torre', 'Fita de sobrevivente', 'both', 'neck', 0, { sell: 0 }),
  a('pin-treinador', 'Pino de Treinador', 'both', 'chest', 0, { sell: 0 }),
  a('pin-chefao', 'Pino de Chefão', 'both', 'chest', 0, { sell: 0 }),
  a('trofeu-torre', 'Troféu da Torre', 'both', 'hand', 0, { sell: 0 }),
  a('capa-sobrevivente', 'Capa de Sobrevivente', 'both', 'back', 0, { sell: 0 }),
  a('pin-pista', 'Pino da Pista', 'both', 'chest', 0, { sell: 0 }),
  a('trofeu-pista', 'Troféu dos Pins', 'both', 'hand', 0, { sell: 0 }),
  ...NEW_ACCESSORIES,
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const itemDef = (id: string): ItemDef | undefined => ITEM_BY_ID.get(id);
export const isItem = (id: string): boolean => ITEM_BY_ID.has(id);
export const FURNITURE_IDS = ITEMS.filter((i) => i.kind === 'furniture').map((i) => i.id);
export const SEED_IDS = ITEMS.filter((i) => i.kind === 'seed').map((i) => i.id);
export const ACCESSORY_IDS = ITEMS.filter((i) => i.kind === 'accessory').map((i) => i.id);
export const FOOD_IDS = ITEMS.filter((i) => i.kind === 'food').map((i) => i.id);
export const MATERIAL_IDS = ITEMS.filter((i) => i.kind === 'material' || i.kind === 'crop').map((i) => i.id);
/** Móveis que acendem à noite e os animados, para o desenho da Vila. */
export const LIGHT_IDS = new Set(ITEMS.filter((i) => i.light).map((i) => i.id));
export const GROUPS = ['Casa', 'Luz', 'Jardim', 'Pokémon'] as const;

/** O que a loja vende hoje: um sortimento que muda a cada dia (sempre com sementes). */
export function shopToday(day: string): ItemDef[] {
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
  const forSale = ITEMS.filter((i) => i.price > 0 && i.kind !== 'seed');
  const picks: ItemDef[] = [];
  const pool = [...forSale];
  for (let n = 0; n < 10 && pool.length > 0; n++) {
    h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    picks.push(pool.splice(h % pool.length, 1)[0]!);
  }
  return [...ITEMS.filter((i) => i.kind === 'seed'), ...picks];
}

/** Tudo que se fabrica na bancada (móveis, acessórios e materiais) e o que se cozinha. */
export const CRAFT_IDS = ITEMS.filter((i) => i.recipe && i.kind !== 'food').map((i) => i.id);
export const COOK_IDS = ITEMS.filter((i) => i.recipe && i.kind === 'food').map((i) => i.id);
