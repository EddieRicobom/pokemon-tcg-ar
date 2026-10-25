import type { AccessoryPos } from './accessory-fit';
import type { ItemDef } from './catalog';

type Source = { price: number } | { recipe: Record<string, number> } | 'prize';

/**
 * Acessórios da segunda leva: vendidos na loja (`price`), fabricados na bancada (`recipe`) ou exclusivos de conquistas
 * (`prize`, ver `rewards.ts`: não vendem nem se vendem).
 */
function acc(id: string, name: string, pos: AccessoryPos, from: Source, nudge?: { dx?: number; dy?: number }): ItemDef {
  const base: ItemDef = { id, name, kind: 'accessory', slot: 'both', pos, price: 0, sell: 0, ...(nudge ? { nudge } : {}) };
  if (from === 'prize') return base;
  if ('price' in from) return { ...base, price: from.price, sell: Math.floor(from.price / 3) };
  const parts = Object.values(from.recipe).reduce((n, k) => n + k, 0);
  return { ...base, recipe: from.recipe, sell: 8 * parts };
}

export const NEW_ACCESSORIES: readonly ItemDef[] = [
  // Cabeça.
  acc('cartola-branca', 'Cartola branca', 'hat', { price: 240 }),
  acc('touca-renda', 'Touca de renda', 'hat', { price: 150 }),
  acc('gorro-noel', 'Gorro de Noel', 'hat', { price: 120 }),
  acc('capelo', 'Capelo de formatura', 'hat', 'prize'),
  acc('elmo-viking', 'Elmo viking', 'hat', { recipe: { ferro: 3, pedra: 1 } }),
  acc('guirlanda', 'Guirlanda de folhas', 'hat', { recipe: { flor: 2, alga: 2 } }),
  acc('chapeu-sol', 'Chapéu de sol', 'hat', { price: 130 }),
  acc('chapeu-explorador', 'Chapéu de explorador', 'hat', { price: 170 }),
  acc('capacete-obra', 'Capacete de obra', 'hat', { recipe: { ferro: 2 } }),
  acc('chapeu-pirata', 'Chapéu pirata', 'hat', 'prize'),
  acc('chapeu-bobo', 'Chapéu de bobo da corte', 'hat', { price: 160 }),
  acc('peruca-black', 'Peruca black power', 'hat', { price: 200 }),
  acc('coroa-gelo', 'Coroa de gelo', 'hat', 'prize'),
  acc('aureola', 'Auréola', 'hat', 'prize', { dy: -3 }),
  acc('chifre-unicornio', 'Chifre de unicórnio', 'hat', { price: 220 }, { dy: 1 }),
  acc('orelhas-coelho', 'Orelhas de coelho', 'hat', { price: 120 }),
  acc('orelhas-urso', 'Orelhas de urso', 'hat', { price: 110 }),
  acc('antenas', 'Antenas de inseto', 'hat', { price: 90 }),
  acc('chapeu-cogumelo', 'Chapéu de cogumelo', 'hat', { recipe: { champignon: 3 } }),
  acc('chapeu-abobora', 'Chapéu de abóbora', 'hat', { recipe: { abobora: 2 } }),
  acc('coroa-girassol', 'Coroa de girassóis', 'hat', { recipe: { girassol: 3 } }),
  acc('chapeu-marinheiro', 'Chapéu de marinheiro', 'hat', { price: 120 }),
  acc('quepe', 'Quepe de capitão', 'hat', 'prize'),
  acc('lenco-cabeca', 'Lenço de cabeça florido', 'hat', { price: 70 }),
  acc('tiara-estrelas', 'Arco de estrelinhas', 'hat', 'prize'),
  acc('ninho', 'Ninho de passarinho', 'hat', { recipe: { madeira: 2, pena: 1 } }),
  acc('elmo-cavaleiro', 'Elmo de cavaleiro', 'hat', 'prize'),
  acc('nuvem', 'Nuvenzinha', 'hat', { price: 160 }, { dy: -3 }),
  acc('tiara-cristal', 'Tiara de cristal', 'hat', { recipe: { cristal: 3, ouro: 1 } }),
  acc('chapeu-fada', 'Chapéu de fada', 'hat', { price: 190 }),
  // Enfeites de cabelo.
  acc('laco-poa', 'Laço de bolinhas', 'ear', { price: 70 }),
  acc('laco-azul', 'Laço azul', 'ear', { price: 60 }),
  acc('laco-vermelho', 'Laço vermelho', 'ear', { price: 60 }),
  acc('laco-gigante', 'Laço gigante', 'ear', { price: 180 }),
  acc('laco-listrado', 'Laço listrado', 'ear', { price: 80 }),
  acc('folha-cabelo', 'Folha de enfeite', 'ear', { recipe: { flor: 1, madeira: 1 } }),
  acc('flor-azul', 'Flor azul', 'ear', { recipe: { flor: 2 } }),
  acc('flor-vermelha', 'Flor vermelha', 'ear', { recipe: { flor: 2 } }),
  acc('presilha-estrela', 'Presilha de estrela', 'ear', { price: 90 }),
  acc('presilha-coracao', 'Presilha de coração', 'ear', 'prize'),
  acc('pena-cabelo', 'Pena no cabelo', 'ear', { recipe: { pena: 2 } }),
  acc('floco-neve', 'Floco de neve', 'ear', { price: 80 }),
  // Olhos.
  acc('oculos-sol-amarelo', 'Óculos de lente amarela', 'face', { price: 130 }),
  acc('oculos-aro-preto', 'Óculos de aro preto', 'face', { price: 100 }),
  acc('oculos-espiral', 'Óculos de espiral', 'face', { price: 90 }),
  acc('oculos-coracao', 'Óculos de coração', 'face', { price: 140 }),
  acc('mascara-mergulho', 'Máscara de mergulho', 'face', { recipe: { vidro: 1, ferro: 1 } }),
  acc('tapa-olho', 'Tapa-olho', 'face', 'prize'),
  acc('mascara-baile', 'Máscara de baile', 'face', { price: 180 }),
  acc('oculos-neve', 'Óculos de neve', 'face', { price: 150 }),
  acc('visor-futurista', 'Visor futurista', 'face', 'prize'),
  // Boca.
  acc('barba-branca', 'Barba branca', 'mouth', { price: 110 }),
  acc('mascara-pano', 'Máscara de pano', 'mouth', { price: 40 }),
  acc('bigode-fino', 'Bigode fino', 'mouth', { price: 60 }),
  acc('rosa-boca', 'Rosa na boca', 'mouth', { recipe: { flor: 1 } }),
  // Pescoço.
  acc('gravata-preta', 'Gravata preta', 'neck', { price: 90 }),
  acc('gravata-listrada', 'Gravata listrada', 'neck', { price: 100 }),
  acc('colar-perolas', 'Colar de pérolas', 'neck', { recipe: { perola: 3 } }),
  acc('lenco-pescoco', 'Lenço de pescoço', 'neck', { price: 60 }),
  acc('colar-havaiano', 'Colar havaiano', 'neck', { recipe: { flor: 4 } }),
  acc('sininho', 'Sininho', 'neck', { price: 70 }),
  acc('cachecol-listrado', 'Cachecol listrado', 'neck', { price: 120 }),
  acc('medalhao', 'Medalhão', 'neck', 'prize'),
  acc('relogio-bolso', 'Relógio de bolso', 'neck', 'prize'),
  acc('gola-palhaco', 'Gola de palhaço', 'neck', { price: 90 }),
  // Peito.
  acc('broche-escudo', 'Broche de escudo', 'chest', 'prize'),
  acc('avental', 'Avental', 'chest', { price: 80 }),
  acc('rosa-lapela', 'Rosa na lapela', 'chest', { recipe: { flor: 2 } }),
  // Cintura.
  acc('saia-folhas', 'Saia de folhas', 'waist', { recipe: { alga: 4 } }),
  acc('cinturao', 'Cinturão de campeão', 'waist', 'prize'),
  acc('bolsinha', 'Bolsinha rosa', 'waist', { price: 150 }),
  // Costas.
  acc('capa-vampiro', 'Capa de vampiro', 'back', { price: 260 }),
  acc('asas-morcego', 'Asas de morcego', 'back', { price: 220 }),
  acc('asas-dragao', 'Asas de dragão', 'back', 'prize'),
  acc('manto-fantasma', 'Manto de fantasma', 'back', { price: 200 }),
  acc('asas-fada', 'Asas de fada', 'back', { recipe: { cristal: 2, pena: 2 } }),
  acc('mochila-pokebola', 'Mochila Poké Bola', 'back', 'prize'),
  // Na mão.
  acc('espada', 'Espada de brinquedo', 'hand', { price: 200 }),
  acc('cimitarra', 'Cimitarra', 'hand', 'prize'),
  acc('rosa', 'Rosa', 'hand', { recipe: { flor: 1 } }),
  acc('campanula', 'Campânula', 'hand', { recipe: { flor: 2 } }),
  acc('buque', 'Buquê', 'hand', { recipe: { flor: 5 } }),
  acc('microfone', 'Microfone', 'hand', 'prize'),
  acc('guitarra', 'Guitarra', 'hand', { price: 300 }),
  acc('guarda-sol-mao', 'Guarda-sol colorido', 'hand', { price: 180 }),
  acc('sombrinha', 'Sombrinha', 'hand', { price: 140 }),
  acc('frigideira', 'Frigideira', 'hand', { recipe: { ferro: 2 } }),
  acc('cajado', 'Cajado', 'hand', { recipe: { madeira: 3 } }),
  acc('raquete', 'Raquete de tênis', 'hand', { price: 120 }),
  acc('vara-pesca', 'Vara de pescar', 'hand', { recipe: { madeira: 2, tecido: 1 } }),
  acc('tridente', 'Tridente', 'hand', 'prize'),
  acc('trompete', 'Trompete', 'hand', { price: 220 }),
  acc('lanterna-papel', 'Lanterna de mão', 'hand', { price: 90 }),
  acc('balao', 'Balão', 'hand', { price: 40 }, { dy: -4 }),
  acc('livro', 'Livro de histórias', 'hand', 'prize'),
  acc('martelo', 'Martelo', 'hand', { recipe: { ferro: 1, madeira: 1 } }),
  acc('presente', 'Presente', 'hand', { price: 90 }),
  acc('estrela-ninja', 'Estrela ninja', 'hand', 'prize'),
  acc('varinha', 'Varinha mágica', 'hand', 'prize'),
  acc('leque', 'Leque', 'hand', { price: 90 }),
];
