import type { ItemDef } from './catalog';

/** Peças estáticas em pixel art, compartilhadas pela mochila, interiores e Vila. */
export const COZY_FURNITURE: readonly ItemDef[] = [
  { id: 'aparador', name: 'Aparador de carvalho', kind: 'furniture', group: 'Casa', price: 180, sell: 42, recipe: { tabua: 3, ferro: 1 }, purpose: 'Apoio para louças e pequenos objetos, junto à parede.', roomZone: 'wall' },
  { id: 'comoda', name: 'Cômoda de madeira', kind: 'furniture', group: 'Casa', price: 220, sell: 50, recipe: { tabua: 4, ferro: 1 }, purpose: 'Guarda roupas e fica no canto de descanso.', roomZone: 'rest' },
  { id: 'sapateira', name: 'Sapateira da entrada', kind: 'furniture', group: 'Casa', price: 95, sell: 20, recipe: { madeira: 4 }, purpose: 'Organiza os sapatos perto da entrada, sem bloquear a porta.', roomZone: 'wall' },
  { id: 'mesa-jantar', name: 'Mesa de jantar posta', kind: 'furniture', group: 'Casa', price: 260, sell: 60, recipe: { tabua: 4, tecido: 1 }, purpose: 'Centro do cantinho de refeições e encontros.', roomZone: 'social' },
  { id: 'balcao-cozinha', name: 'Balcão de cozinha', kind: 'furniture', group: 'Casa', price: 230, sell: 52, recipe: { tabua: 3, tijolo: 2 }, purpose: 'Bancada de preparo, junto ao fogão e à pia.', roomZone: 'kitchen' },
  { id: 'armario-loucas', name: 'Armário de louças', kind: 'furniture', group: 'Casa', price: 280, sell: 65, recipe: { tabua: 4, vidro: 1 }, purpose: 'Guarda xícaras e pratos no cantinho da cozinha.', roomZone: 'kitchen' },
  { id: 'cama-colcha', name: 'Cama com colcha artesanal', kind: 'furniture', group: 'Casa', price: 340, sell: 80, recipe: { tabua: 4, tecido: 4 }, purpose: 'Peça principal do canto de descanso, afastada da passagem.', roomZone: 'rest' },
  { id: 'almofadas', name: 'Almofadas de leitura', kind: 'furniture', group: 'Casa', price: 100, sell: 22, recipe: { tecido: 2, la: 1 }, purpose: 'Acomodação baixa para ler e conversar.', roomZone: 'social' },
  { id: 'estante-plantas', name: 'Estante de plantas', kind: 'furniture', group: 'Casa', price: 210, sell: 48, recipe: { tabua: 3, flor: 4, argila: 1 }, purpose: 'Organiza os vasos num canto iluminado.', roomZone: 'wall' },
  { id: 'mapa-parede', name: 'Mapa de aventuras', kind: 'furniture', group: 'Casa', price: 130, sell: 28, recipe: { tecido: 2, madeira: 2 }, purpose: 'Mapa para planejar viagens; fica na parede.', roomZone: 'wall' },
  { id: 'relogio-parede', name: 'Relógio de parede', kind: 'furniture', group: 'Casa', price: 120, sell: 26, recipe: { madeira: 2, ferro: 1 }, purpose: 'Ajuda a acompanhar os horários sem ocupar a passagem.', roomZone: 'wall' },
  { id: 'prateleira-canecas', name: 'Prateleira de canecas', kind: 'furniture', group: 'Casa', price: 110, sell: 24, recipe: { madeira: 3, argila: 1 }, purpose: 'Louças acessíveis acima do cantinho de refeições.', roomZone: 'kitchen' },
  { id: 'mesa-estudos', name: 'Mesa de estudos', kind: 'furniture', group: 'Casa', price: 240, sell: 55, recipe: { tabua: 4, tecido: 1 }, purpose: 'Livros e anotações organizados num canto tranquilo.', roomZone: 'wall' },
  { id: 'cesto-la', name: 'Cesto de lã', kind: 'furniture', group: 'Casa', price: 90, sell: 20, recipe: { madeira: 2, la: 2 }, purpose: 'Materiais de artesanato próximos ao lugar de descanso.', roomZone: 'rest' },
  { id: 'luminaria-leitura', name: 'Luminária de leitura', kind: 'furniture', group: 'Luz', price: 170, sell: 38, recipe: { ferro: 2, tecido: 2 }, light: true, purpose: 'Luz de apoio para o canto de leitura.', roomZone: 'rest' },
  { id: 'tapete-folha', name: 'Tapete de folha', kind: 'furniture', group: 'Casa', price: 140, sell: 30, recipe: { tecido: 3, flor: 1 }, purpose: 'Marca o espaço de convivência sem cobrir a saída.', roomZone: 'social' },
  { id: 'mesa-piquenique', name: 'Mesa de piquenique', kind: 'furniture', group: 'Jardim', price: 270, sell: 60, recipe: { tabua: 5, ferro: 1 }, purpose: 'Conjunto com bancos para o jardim e a praça.', roomZone: 'social' },
  { id: 'espreguicadeira', name: 'Espreguiçadeira listrada', kind: 'furniture', group: 'Jardim', price: 190, sell: 42, recipe: { madeira: 4, tecido: 3 }, purpose: 'Assento de descanso para o quintal ou a margem do lago.', roomZone: 'rest' },
  { id: 'jardineira-lavanda', name: 'Jardineira de lavanda', kind: 'furniture', group: 'Jardim', price: 150, sell: 34, recipe: { madeira: 3, lavanda: 2 }, purpose: 'Delimita cantos de jardim com flores baixas.', roomZone: 'wall' },
  { id: 'bebedouro-aves', name: 'Bebedouro de aves', kind: 'furniture', group: 'Jardim', price: 180, sell: 40, recipe: { pedra: 5, argila: 2 }, purpose: 'Uma pequena bacia de água para ornamentar o jardim.', roomZone: 'wall' },
  { id: 'banco-ferro', name: 'Banco de ferro e madeira', kind: 'furniture', group: 'Jardim', price: 250, sell: 56, recipe: { ferro: 3, tabua: 2 }, purpose: 'Assento resistente para os caminhos da Vila.', roomZone: 'social' },
  { id: 'carroca-flores', name: 'Carrocinha de flores', kind: 'furniture', group: 'Jardim', price: 300, sell: 70, recipe: { tabua: 4, ferro: 2, flor: 6 }, purpose: 'Expositor de vasos para a frente de casa.', roomZone: 'wall' },
  { id: 'caixote-horta', name: 'Caixotes da horta', kind: 'furniture', group: 'Jardim', price: 110, sell: 24, recipe: { tabua: 2, cenoura: 1, tomate: 1 }, purpose: 'Decoração de colheita; não substitui a caixa de sementes.', roomZone: 'wall' },
  { id: 'suporte-lenha', name: 'Suporte de lenha', kind: 'furniture', group: 'Jardim', price: 140, sell: 30, recipe: { madeira: 6, ferro: 1 }, purpose: 'Pilha organizada para decorar a área da madeireira.', roomZone: 'wall' },
  { id: 'bancada-jardim', name: 'Bancada de jardinagem', kind: 'furniture', group: 'Jardim', price: 230, sell: 52, recipe: { tabua: 4, argila: 2, flor: 2 }, purpose: 'Vasos e ferramentas organizados no quintal.', roomZone: 'wall' },
  { id: 'barril-flores', name: 'Barril florido', kind: 'furniture', group: 'Jardim', price: 160, sell: 36, recipe: { madeira: 4, ferro: 1, flor: 3 }, purpose: 'Vaso rústico para a varanda e o jardim.', roomZone: 'wall' },
  { id: 'placa-lago', name: 'Placa do lago', kind: 'furniture', group: 'Jardim', price: 100, sell: 22, recipe: { madeira: 3, concha: 1 }, purpose: 'Sinalização decorativa com um peixe pintado.', roomZone: 'wall' },
  { id: 'lixeira-praca', name: 'Lixeira da praça', kind: 'furniture', group: 'Jardim', price: 150, sell: 32, recipe: { ferro: 2, tabua: 2 }, purpose: 'Peça urbana para compor praças e caminhos.', roomZone: 'wall' },
  { id: 'lanterna-pedra', name: 'Lanterna de pedra', kind: 'furniture', group: 'Luz', price: 260, sell: 58, recipe: { pedra: 6, cristal: 1 }, light: true, purpose: 'Luz baixa para caminhos do jardim.', roomZone: 'wall' },
  { id: 'arco-bambu', name: 'Arco de bambu', kind: 'furniture', group: 'Jardim', price: 290, sell: 66, recipe: { madeira: 8, flor: 2 }, purpose: 'Marca visualmente uma entrada de jardim.', roomZone: 'wall' },
  { id: 'carrinho-cha', name: 'Carrinho de chá', kind: 'furniture', group: 'Jardim', price: 240, sell: 54, recipe: { tabua: 3, ferro: 2, argila: 1 }, purpose: 'Conjunto de chá para encontros ao ar livre.', roomZone: 'social' },
  { id: 'canteiro-pedras', name: 'Canteiro de pedras e flores', kind: 'furniture', group: 'Jardim', price: 180, sell: 40, recipe: { pedra: 4, flor: 4 }, purpose: 'Composição baixa para os cantos da praça.', roomZone: 'wall' },
];

type Zone = ItemDef['roomZone'];
type Get = { price?: number; recipe?: Record<string, number>; prize?: true };

/** Móvel da segunda leva: vendido (`price`), fabricado (`recipe`) ou prêmio de conquista (`prize`, ver `rewards.ts`). */
function mv(id: string, name: string, group: string, zone: Zone, get: Get, opt: Partial<ItemDef> = {}): ItemDef {
  const parts = Object.values(get.recipe ?? {}).reduce((n, q) => n + q, 0);
  const sell = get.prize ? 0 : Math.max(8, Math.round((get.price ? get.price / 4.5 : parts * 9) / 2) * 2);
  return { id, name, kind: 'furniture', group, price: get.price ?? 0, sell, ...(get.recipe ? { recipe: get.recipe } : {}), ...(get.prize ? { prize: true } : {}), ...(zone ? { roomZone: zone } : {}), ...opt };
}

/** Móveis da segunda leva, no estilo dos interiores da 3ª geração (decorações da Base Secreta incluídas). */
export const NEW_FURNITURE_ITEMS: readonly ItemDef[] = [
  // Bonecos de Pokémon.
  mv('boneco-pikachu', 'Boneco de Pikachu', 'Pokémon', 'social', { price: 220 }),
  mv('boneco-bulbasaur', 'Boneco de Bulbasaur', 'Pokémon', 'social', { price: 200 }),
  mv('boneco-charmander', 'Boneco de Charmander', 'Pokémon', 'social', { price: 200 }),
  mv('boneco-squirtle', 'Boneco de Squirtle', 'Pokémon', 'social', { price: 200 }),
  mv('boneco-jigglypuff', 'Boneco de Jigglypuff', 'Pokémon', 'social', { recipe: { la: 3, tecido: 2 } }),
  mv('boneco-eevee', 'Boneco de Eevee', 'Pokémon', 'social', { price: 240 }),
  mv('boneco-togepi', 'Boneco de Togepi', 'Pokémon', 'social', { prize: true }),
  mv('boneco-meowth', 'Boneco de Meowth', 'Pokémon', 'social', { recipe: { la: 2, tecido: 2, ouro: 1 } }),
  mv('boneco-psyduck', 'Boneco de Psyduck', 'Pokémon', 'social', { recipe: { la: 3, tecido: 1, pena: 1 } }),
  mv('boneco-clefairy', 'Boneco de Clefairy', 'Pokémon', 'social', { recipe: { la: 3, tecido: 1, 'pedra-lua': 1 } }),
  mv('boneco-marill', 'Boneco de Marill', 'Pokémon', 'social', { recipe: { la: 3, tecido: 1, 'concha-espiral': 1 } }),
  mv('boneco-snorlax', 'Boneco gigante de Snorlax', 'Pokémon', 'social', { recipe: { la: 10, tecido: 6 } }, { tall: true }),
  // Plantas.
  mv('planta-vermelha', 'Planta vermelha', 'Casa', 'wall', { price: 110 }),
  mv('planta-tropical', 'Planta tropical', 'Casa', 'wall', { recipe: { flor: 2, argila: 2, erva: 1 } }),
  mv('flores-bonitas', 'Flores bonitas', 'Casa', 'social', { recipe: { flor: 5, argila: 1 } }),
  mv('planta-colorida', 'Planta colorida', 'Casa', 'wall', { price: 130 }),
  mv('suculenta', 'Suculenta', 'Casa', 'wall', { recipe: { erva: 2, argila: 1, pedra: 1 } }),
  mv('orquidea', 'Orquídea', 'Casa', 'social', { price: 180 }),
  mv('bambu-vaso', 'Bambu no vaso', 'Casa', 'wall', { recipe: { madeira: 3, argila: 2 } }),
  mv('lirio', 'Lírios', 'Casa', 'rest', { recipe: { flor: 4, argila: 1 } }),
  mv('planta-grande', 'Planta grande', 'Casa', 'wall', { price: 260 }, { tall: true }),
  mv('planta-exuberante', 'Planta exuberante', 'Casa', 'wall', { recipe: { flor: 4, erva: 3, argila: 3 } }, { tall: true }),
  // Mesas.
  mv('escrivaninha-pequena', 'Escrivaninha pequena', 'Casa', 'wall', { recipe: { tabua: 3 } }),
  mv('mesa-pokemon', 'Mesa Pokémon', 'Casa', 'social', { prize: true }),
  mv('mesa-pesada', 'Mesa pesada', 'Casa', 'social', { recipe: { tabua: 6, ferro: 1 } }),
  mv('mesa-rustica', 'Mesa rústica', 'Casa', 'social', { recipe: { madeira: 6 } }),
  mv('mesa-vidro', 'Mesa de vidro', 'Casa', 'social', { recipe: { vidro: 2, ferro: 2 } }),
  mv('mesa-centro', 'Mesa de centro', 'Casa', 'social', { price: 150 }),
  mv('mesa-cozinha', 'Mesa da cozinha', 'Casa', 'kitchen', { recipe: { tabua: 4, tecido: 1 } }),
  mv('bancada-lab', 'Bancada de laboratório', 'Casa', 'wall', { recipe: { ferro: 3, vidro: 3, quartzo: 1 } }),
  // Cadeiras.
  mv('cadeira-pokemon', 'Cadeira Pokémon', 'Casa', 'social', { price: 160 }),
  mv('cadeira-pesada', 'Cadeira pesada', 'Casa', 'social', { recipe: { tabua: 4 } }),
  mv('cadeira-escritorio', 'Cadeira de escritório', 'Casa', 'wall', { price: 190 }),
  mv('banco-piano', 'Banco de piano', 'Casa', 'social', { recipe: { tabua: 2, tecido: 1 } }),
  mv('cadeira-balanco', 'Cadeira de balanço', 'Casa', 'rest', { recipe: { madeira: 5, tabua: 2 } }, { frames: 2 }),
  // Tapetes e pôsteres.
  mv('tapete-pokebola', 'Tapete Poké Bola', 'Casa', 'social', { price: 140 }),
  mv('tapete-fogo', 'Tapete do Fogo', 'Casa', 'social', { recipe: { tecido: 3, 'pedra-fogo': 1 } }),
  mv('tapete-onda', 'Tapete da Onda', 'Casa', 'social', { recipe: { tecido: 3, 'pedra-agua': 1 } }),
  mv('tapete-trovao', 'Tapete do Trovão', 'Casa', 'social', { recipe: { tecido: 3, 'pedra-trovao': 1 } }),
  mv('poster-pokebola', 'Pôster Poké Bola', 'Casa', 'wall', { prize: true }),
  mv('poster-pikachu', 'Pôster do Pikachu', 'Casa', 'wall', { price: 90 }),
  mv('poster-mapa', 'Pôster do mapa', 'Casa', 'wall', { price: 80 }),
  mv('poster-estrelas', 'Pôster do céu estrelado', 'Casa', 'wall', { prize: true }),
  // Eletrônicos.
  mv('tv-tela-plana', 'TV de tela plana', 'Casa', 'social', { price: 420 }, { frames: 2 }),
  mv('videogame', 'Videogame', 'Casa', 'social', { price: 380 }, { frames: 2 }),
  mv('pc-pokemon', 'PC de armazenamento', 'Casa', 'wall', { recipe: { ferro: 4, vidro: 2, quartzo: 2 } }, { frames: 2 }),
  mv('radio-antigo', 'Rádio antigo', 'Casa', 'wall', { price: 170 }),
  mv('telefone', 'Telefone', 'Casa', 'wall', { price: 90 }),
  mv('microondas', 'Micro-ondas', 'Casa', 'kitchen', { price: 210 }),
  mv('ventilador', 'Ventilador', 'Casa', 'rest', { recipe: { ferro: 3 } }, { frames: 2 }),
  mv('computador-lab', 'Computador do laboratório', 'Casa', 'wall', { recipe: { ferro: 4, vidro: 3, cristal: 1 } }, { frames: 2 }),
  mv('maquina-cura', 'Máquina de cura', 'Pokémon', 'wall', { recipe: { ferro: 6, vidro: 3, cristal: 2, 'escama-coracao': 1 } }, { tall: true, frames: 2 }),
  mv('maquina-vendas', 'Máquina de bebidas', 'Luz', 'wall', { price: 520 }, { tall: true, light: true }),
  // Cozinha.
  mv('geladeira-dupla', 'Geladeira duplex', 'Casa', 'kitchen', { price: 480 }, { tall: true }),
  mv('cafeteira', 'Cafeteira', 'Casa', 'kitchen', { recipe: { ferro: 1, vidro: 1, tabua: 1 } }),
  mv('forno-pizza', 'Forno a lenha', 'Casa', 'kitchen', { recipe: { tijolo: 6, pedra: 4, carvao: 2 } }, { frames: 2 }),
  mv('chaleira', 'Chaleira no fogareiro', 'Casa', 'kitchen', { recipe: { ferro: 2, carvao: 1 } }),
  mv('prateleira-temperos', 'Prateleira de temperos', 'Casa', 'kitchen', { recipe: { tabua: 2, erva: 2, 'sal-praia': 1 } }),
  mv('lava-loucas', 'Lava-louças', 'Casa', 'kitchen', { price: 360 }),
  // Quarto e banheiro.
  mv('beliche', 'Beliche', 'Casa', 'rest', { recipe: { tabua: 6, tecido: 4 } }, { tall: true }),
  mv('berco', 'Berço', 'Casa', 'rest', { recipe: { tabua: 4, tecido: 2 } }),
  mv('penteadeira', 'Penteadeira', 'Casa', 'rest', { price: 280 }),
  mv('armario-alto', 'Armário alto', 'Casa', 'rest', { recipe: { tabua: 8, ferro: 1 } }, { tall: true }),
  mv('cesto-roupa', 'Cesto de roupas', 'Casa', 'rest', { recipe: { madeira: 3, tecido: 1 } }),
  mv('espelho-oval', 'Espelho oval', 'Casa', 'rest', { recipe: { vidro: 2, ouro: 1 } }),
  mv('bau-brinquedos', 'Baú de brinquedos', 'Pokémon', 'rest', { price: 170 }),
  mv('pia-banheiro', 'Pia do banheiro', 'Casa', 'wall', { price: 200 }),
  // Decoração (da Base Secreta).
  mv('escudo-prata', 'Escudo de prata', 'Pokémon', 'wall', { prize: true }),
  mv('escudo-ouro', 'Escudo de ouro', 'Pokémon', 'wall', { prize: true }),
  mv('ornamento-vidro', 'Ornamento de vidro', 'Casa', 'social', { prize: true }),
  mv('ornamento-areia', 'Ornamento de areia', 'Casa', 'social', { recipe: { areia: 6, 'sal-praia': 1 } }),
  mv('pneu', 'Pneu', 'Jardim', 'wall', { recipe: { carvao: 3, ferro: 1 } }),
  mv('estande-trofeu', 'Estante de troféus', 'Pokémon', 'wall', { prize: true }),
  mv('globo-neve', 'Globo de neve', 'Casa', 'social', { recipe: { vidro: 1, 'pedra-gelo': 1 } }, { frames: 2 }),
  mv('aquario-grande', 'Aquário grande', 'Casa', 'wall', { recipe: { vidro: 4, ferro: 2, alga: 3, dourado: 1 } }, { frames: 2 }),
  mv('relogio-cuco', 'Relógio cuco', 'Casa', 'wall', { prize: true }, { frames: 2 }),
  mv('vitrola', 'Vitrola', 'Casa', 'social', { price: 320 }, { frames: 2 }),
  mv('jukebox', 'Jukebox', 'Luz', 'social', { price: 640 }, { frames: 3, light: true }),
  mv('mesa-sinuca', 'Mesa de sinuca', 'Casa', 'social', { recipe: { tabua: 6, tecido: 3, pedra: 2 } }),
  // Jardim.
  mv('casinha-passaro', 'Casinha de passarinho', 'Jardim', 'wall', { recipe: { tabua: 2, pena: 1 } }),
  mv('regador', 'Regador', 'Jardim', 'wall', { price: 60 }),
  mv('carrinho-mao', 'Carrinho de mão', 'Jardim', 'wall', { recipe: { ferro: 2, tabua: 2 } }),
  mv('cata-vento-jardim', 'Cata-vento de jardim', 'Jardim', 'wall', { price: 70 }, { frames: 2 }),
  mv('fonte-anjo', 'Fonte do anjo', 'Jardim', 'wall', { recipe: { pedra: 12, quartzo: 2 } }, { tall: true, frames: 2 }),
];
