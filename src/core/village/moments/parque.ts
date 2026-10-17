import { L, calm, coupled, day, evening, friendsNow, is, night, other, rainy, rivals, snowy } from './kit';
import type { Template } from './kit';

/** O parquinho do oeste (mapa grande): balanço, escorregador, gangorra, carrossel, trepa-trepa e as árvores grandes. */
export const PARQUE_MOMENTS: readonly Template[] = [
  {
    id: 'par-balanco-alto', kind: 'solo', title: 'O balanço mais alto', emoji: '🛝', cast: 1, weight: 5, when: (c) => day(c) && calm(c),
    lines: () => [L(0, 'Mais alto! Mais alto! Quase encosto no céu!', 'star'), L(0, '(no ponto mais alto, a barriga dá aquele frio gostoso)', 'shock'), L(0, 'De novo! A vida inteira! Ou até dar fome.', 'laugh')],
    outcome: { friend: 1 },
  },
  {
    id: 'par-empurra-balanco', kind: 'amizade', title: 'Me empurra?', emoji: '🙌', cast: 2, weight: 5, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, `${c.n[1]}, me empurra no balanço?`, 'question'), L(1, 'Um, dois, três... VAI!', 'fire'), L(0, 'Wiiii! Agora é a sua vez! Eu empurro!', 'laugh'), L(1, 'Devagar! Devagar! ...tá bom, rápido. Mais rápido!', 'star')],
    outcome: { bond: 6 },
    after: (n, who) => `${other(n, who)} me empurrou no balanço até eu quase tocar as nuvens.`,
  },
  {
    id: 'par-escorregador-fila', kind: 'comedia', title: 'Fila do escorregador', emoji: '🛝', cast: 3, weight: 5, when: (c) => day(c),
    lines: (c) => [L(0, 'Eu sou o primeiro da fila!', 'fire'), L(1, 'Eu sou o segundo!', 'star'), L(2, 'E eu sou o que escorrega de barriga! (passa na frente dos dois)', 'laugh'), L(0, `${c.n[2]}! Isso não vale! ...faz de novo, foi muito legal.`, 'sweat')],
    outcome: { bond: 3, bond02: 3, bond12: 3 },
  },
  {
    id: 'par-gangorra-peso', kind: 'comedia', title: 'A gangorra injusta', emoji: '⚖️', cast: 2, weight: 5, when: (c) => day(c),
    lines: (c) => [L(0, '(senta na gangorra; o outro lado sobe até o alto)', 'question'), L(1, `${c.n[0]}! Eu estou preso aqui em cima!`, 'shock'), L(0, 'Eu almocei bem. Não é culpa minha.', 'sweat'), L(1, 'Chama mais alguém para sentar comigo! Rápido!', 'laugh')],
    outcome: { bond: 4 },
  },
  {
    id: 'par-carrossel-tontura', kind: 'comedia', title: 'Tontura no carrossel', emoji: '😵', cast: 2, weight: 5, when: (c) => day(c),
    lines: (c) => [L(0, 'Gira mais! Mais rápido! Mais!', 'fire'), L(1, '(gira o carrossel com toda a força)', 'star'), L(0, '(desce cambaleando) O chão está girando. A Vila está girando. Você é dois.', 'shock'), L(1, `${c.n[0]}, eu sou um só. Senta um pouquinho.`, 'laugh')],
    outcome: { bond: 4 },
  },
  {
    id: 'par-trepa-trepa', kind: 'rivalidade', title: 'Rei do trepa-trepa', emoji: '👑', cast: 2, weight: 4, when: (c) => day(c) && calm(c),
    lines: (c) => {
      const v = c.rng() < 0.5 ? 0 : 1;
      c.memo.v = v;
      return [L(0, 'Quem chegar no topo do trepa-trepa é o rei do parque!', 'fire'), L(1, 'Eu já nasci rei. Mas aceito o desafio.', 'fire'), L(v, '(chega no topo e faz pose de estátua)', 'star'), L(v === 0 ? 1 : 0, 'Reinado provisório. Amanhã tem eleição.', 'anger')];
    },
    outcome: { bond: 2, spark: 1 },
  },
  {
    id: 'par-sombra-arvore', kind: 'amizade', title: 'Na sombra da árvore grande', emoji: '🌳', cast: 2, weight: 5, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, 'Essa árvore do parque deve ter mil anos.', 'sparkle'), L(1, 'Ou cem. Ou dez. Eu sou ruim de idade de árvore.', 'sweat'), L(0, `Tanto faz, ${c.n[1]}. A sombra dela é a melhor da Vila.`, 'heart'), L(1, '(os dois encostam no tronco e ficam ouvindo as folhas)', 'zzz')],
    outcome: { bond: 6, friend: 1 },
  },
  {
    id: 'par-esconde-esconde', kind: 'festa', title: 'Esconde-esconde', emoji: '🙈', cast: 3, weight: 5, when: (c) => day(c),
    lines: (c) => [L(0, 'Eu conto até dez! Um, dois, três...', 'note'), L(1, '(se esconde atrás do escorregador, com o rabo de fora)', 'sweat'), L(2, '(se esconde dentro do carrossel e gira sem querer)', 'shock'), L(0, `Achei ${c.n[1]}! Achei ${c.n[2]}! Vocês são péssimos nisso! Eu amo vocês!`, 'laugh')],
    outcome: { bond: 4, bond02: 4, bond12: 4, friend: 1 },
  },
  {
    id: 'par-pega-pega', kind: 'festa', title: 'Pega-pega no parque', emoji: '🏃', cast: 3, weight: 5, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, 'Tá com você!', 'laugh'), L(1, 'Volta aqui! Volta! Não é justo, você é rápido!', 'anger'), L(2, `${c.n[1]}, eu estou parado aqui do lado. Me pega.`, 'question'), L(1, '(pega) Tá com você! Ha! Estratégia!', 'star')],
    outcome: { bond: 3, bond02: 3, bond12: 3 },
  },
  {
    id: 'par-pipa', kind: 'amizade', title: 'A pipa', emoji: '🪁', cast: 2, weight: 4, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, 'Fiz uma pipa de jornal e linha! Me ajuda a soltar?', 'idea'), L(1, 'Corre contra o vento! Corre! Agora solta!', 'fire'), L(0, '(a pipa sobe, sobe, sobe e fica lá, dançando)', 'sparkle'), L(1, `Olha, ${c.n[0]}. Ela é a coisa mais alta da Vila agora.`, 'heart')],
    outcome: { bond: 5 },
  },
  {
    id: 'par-pipa-arvore', kind: 'drama', title: 'A pipa presa', emoji: '🌲', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Minha pipa! Ficou presa na árvore!', 'sad'), L(1, 'Calma. Eu subo. Eu sou bom de subir.', 'fire'), L(1, '(sobe, solta a pipa e... fica preso no lugar dela)', 'sweat'), L(0, `${c.n[1]}! Agora eu tenho a pipa e um amigo na árvore. Espera, eu chamo o treinador!`, 'shock')],
    outcome: { bond: 6 },
  },
  {
    id: 'par-banco-velhinho', kind: 'solo', title: 'O banco do parque', emoji: '🪑', cast: 1, weight: 4, when: (c) => is(c, 0, 'Calmo', 'Sonhador', 'Tímido'),
    lines: () => [L(0, '(senta no banco do parque e fica olhando os outros brincarem)', 'heart'), L(0, 'Às vezes é bom só olhar. Ver todo mundo feliz já é uma brincadeira.', 'sparkle'), L(0, '(depois de um tempo, corre para o balanço) Mas brincar também é bom!', 'laugh')],
    outcome: { friend: 1 },
  },
  {
    id: 'par-chuva-parquinho', kind: 'drama', title: 'Parquinho fechado pela chuva', emoji: '☔', cast: 2, weight: 4, when: (c) => rainy(c),
    lines: (c) => [L(0, '(olha pela janela o balanço balançando sozinho com o vento)', 'sad'), L(1, 'A chuva passa. O parquinho espera a gente.', 'heart'), L(0, `E se não passar, ${c.n[1]}?`, 'question'), L(1, 'Aí a gente vai de capa e faz guerra de poça. Ganha quem molhar mais.', 'laugh')],
    outcome: { bond: 5 },
  },
  {
    id: 'par-poca-lama', kind: 'festa', title: 'Guerra de poças', emoji: '💧', cast: 3, weight: 4, when: (c) => rainy(c),
    lines: (c) => [L(0, '(pula com tudo numa poça) SPLASH!', 'laugh'), L(1, 'Ah, é? (pula na poça do lado) SPLASH em dobro!', 'laugh'), L(2, `${c.n[0]}, ${c.n[1]}... eu estava de roupa limpa.`, 'sad'), L(2, '(pula na maior poça de todas) SPLASH DE VINGANÇA!', 'fire')],
    outcome: { bond: 4, bond02: 4, bond12: 4 },
  },
  {
    id: 'par-boneco-neve', kind: 'festa', title: 'Bonecos de neve no parque', emoji: '⛄', cast: 3, weight: 4, when: (c) => snowy(c),
    lines: (c) => [L(0, 'Cada um faz um boneco de neve! O mais bonito ganha.', 'star'), L(1, 'O meu tem cachecol e nariz de cenoura.', 'sparkle'), L(2, 'O meu está deitado. É um boneco de neve descansando.', 'zzz'), L(0, `O de ${c.n[2]} é o mais sincero. Todo mundo quer deitar na neve.`, 'laugh')],
    outcome: { bond: 4, bond02: 4, bond12: 4 },
  },
  {
    id: 'par-anjo-neve', kind: 'solo', title: 'Anjo de neve', emoji: '👼', cast: 1, weight: 4, when: (c) => snowy(c),
    lines: () => [L(0, '(deita na neve e mexe os braços e as pernas)', 'laugh'), L(0, '(levanta com cuidado e olha) Um anjo! Um anjo meio torto, mas anjo.', 'sparkle'), L(0, 'Agora estou com neve dentro da orelha. Valeu a pena.', 'sweat')],
    outcome: {},
  },
  {
    id: 'par-bolhas-sabao', kind: 'solo', title: 'Bolhas de sabão', emoji: '🫧', cast: 1, weight: 4, when: (c) => day(c) && calm(c),
    lines: () => [L(0, '(sopra devagar e uma bolha enorme sai flutuando)', 'sparkle'), L(0, 'Ela tem arco-íris dentro! E eu dentro dela, de cabeça para baixo!', 'shock'), L(0, '(ploc) ...tchau, bolha. Você foi linda.', 'sad')],
    outcome: { friend: 1 },
  },
  {
    id: 'par-amarelinha', kind: 'amizade', title: 'Amarelinha', emoji: '🔢', cast: 2, weight: 4, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, 'Desenhei uma amarelinha no chão! Até o céu!', 'star'), L(1, '(pula num pé só e perde o equilíbrio no oito)', 'sweat'), L(0, `Quase, ${c.n[1]}! O oito é traiçoeiro.`, 'laugh'), L(1, 'Eu vou treinar. Um dia eu chego no céu da amarelinha.', 'fire')],
    outcome: { bond: 5 },
  },
  {
    id: 'par-casal-balanco', kind: 'romance', title: 'Balanço lado a lado', emoji: '💞', cast: 2, weight: 4, when: (c) => (coupled(c) || friendsNow(c)) && (day(c) || evening(c)) && calm(c),
    lines: (c) => [L(0, '(balançam lado a lado, devagar)', 'heart'), L(1, 'Se a gente balançar no mesmo ritmo, parece que estamos voando juntos.', 'sparkle'), L(0, `Então vamos no mesmo ritmo, ${c.n[1]}. Para sempre.`, 'heart'), L(1, '(os dois balanços sobem e descem juntos até o fim da tarde)', 'heart')],
    outcome: { bond: 5, spark: 4 },
  },
  {
    id: 'par-noite-carrossel', kind: 'solo', title: 'O carrossel à noite', emoji: '🌙', cast: 1, weight: 4, when: (c) => night(c),
    lines: () => [L(0, '(o parquinho vazio, o carrossel parado, a lua em cima)', 'sparkle'), L(0, '(gira o carrossel bem devagarinho, sozinho)', 'heart'), L(0, 'Durante o dia ele é barulhento. À noite, é só meu.', 'zzz')],
    outcome: { friend: 1 },
  },
  {
    id: 'par-briga-balanco', kind: 'rivalidade', title: 'A vez do balanço', emoji: '😠', cast: 2, weight: 4, when: (c) => day(c) && (rivals(c) || is(c, 0, 'Mandão')),
    lines: (c) => [L(0, 'Sai do balanço. É a minha vez.', 'anger'), L(1, 'Eu cheguei agora. Faz cinco segundos.', 'anger'), L(0, 'Cinco segundos é muito tempo de balanço!', 'fire'), L(1, `Conta comigo, ${c.n[0]}: dez empurrões cada um. Combinado?`, 'sweat')],
    outcome: { bond: 1, spark: 1 },
  },
  {
    id: 'par-piquenique-grama', kind: 'amizade', title: 'Piquenique na grama', emoji: '🧺', cast: 3, weight: 5, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, 'Toalha xadrez, cesta cheia e grama fofinha. Piquenique!', 'star'), L(1, 'Eu trouxe frutas da horta.', 'heart'), L(2, 'Eu trouxe as formigas. Elas vieram sozinhas.', 'sweat'), L(0, `Tudo bem, ${c.n[2]}. Formiga também merece piquenique.`, 'laugh')],
    outcome: { bond: 4, bond02: 4, bond12: 4, friend: 1 },
  },
  {
    id: 'par-desenho-giz', kind: 'amizade', title: 'Giz no chão', emoji: '🖍️', cast: 2, weight: 4, when: (c) => day(c) && !rainy(c),
    lines: (c) => [L(0, 'Vou desenhar a Vila inteira no chão com giz!', 'idea'), L(1, 'Desenha a gente! E o treinador! E o lago!', 'star'), L(0, '(o desenho ocupa o parque inteiro, colorido e torto)', 'sparkle'), L(1, `${c.n[0]}, é a Vila mais bonita que existe. Depois da de verdade.`, 'heart')],
    outcome: { bond: 5 },
  },
  {
    id: 'par-giz-chuva', kind: 'drama', title: 'A chuva apagou o desenho', emoji: '🌧️', cast: 1, weight: 4, when: (c) => rainy(c),
    lines: () => [L(0, 'Meu desenho de giz... a chuva levou embora.', 'sad'), L(0, '(fica olhando as cores escorrendo pela calçada)', 'sad'), L(0, 'Pelo menos agora o chão está todo colorido. Um arco-íris líquido.', 'sparkle')],
    outcome: {},
  },
  {
    id: 'par-esquilo-ladrao', kind: 'comedia', title: 'O esquilo ladrão', emoji: '🐿️', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Um esquilo pegou minha noz e subiu na árvore!', 'shock'), L(1, 'Ele está te olhando lá de cima. Mastigando.', 'question'), L(0, 'Isso é um assalto! À luz do dia! No parque!', 'anger'), L(1, `Deixa ele, ${c.n[0]}. Ele tem cara de quem está guardando para o inverno.`, 'laugh')],
    outcome: { bond: 3 },
  },
  {
    id: 'par-roda-gigante-sonho', kind: 'solo', title: 'Se tivesse uma roda-gigante', emoji: '🎡', cast: 1, weight: 4, when: (c) => is(c, 0, 'Sonhador', 'Curioso', 'Brincalhão'),
    lines: () => [L(0, 'O parque é bom, mas imagina uma roda-gigante aqui?', 'idea'), L(0, 'Lá de cima dava para ver o lago, a fazenda e o telhado de todo mundo.', 'sparkle'), L(0, 'Vou pedir para o treinador. Ele consegue tudo. Quase tudo.', 'laugh')],
    outcome: {},
  },
  {
    id: 'par-primeiro-tombo', kind: 'drama', title: 'O tombo do escorregador', emoji: '🤕', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, '(desce rápido demais e rola na areia no fim do escorregador)', 'shock'), L(1, `${c.n[0]}! Você se machucou?`, 'sad'), L(0, '...não. Só o orgulho. E um pouquinho do cotovelo.', 'sweat'), L(1, '(assopra o cotovelo) Pronto. Sarou. É um poder secreto.', 'heart')],
    outcome: { bond: 6 },
  },
  {
    id: 'par-trio-corrida-saco', kind: 'festa', title: 'Corrida de saco', emoji: '🥔', cast: 3, weight: 4, when: (c) => day(c) && calm(c),
    lines: (c) => {
      const v = Math.floor(c.rng() * 3);
      c.memo.v = v;
      return [L(0, 'Corrida de saco! Cada um entra no seu e pula até a árvore!', 'fire'), L(1, '(pula, pula, cai, levanta, pula)', 'laugh'), L(2, '(pula de lado, sem querer, na direção errada)', 'sweat'), L(v, '(chega na árvore e abraça o tronco) GANHEI!', 'star')];
    },
    outcome: { bond: 3, bond02: 3, bond12: 3 },
  },
  {
    id: 'par-nuvens-formas', kind: 'amizade', title: 'Formas nas nuvens', emoji: '☁️', cast: 2, weight: 5, when: (c) => day(c) && c.env.weather !== 'chuva',
    lines: (c) => [L(0, 'Aquela nuvem é um Snorlax dormindo.', 'idea'), L(1, 'Aquela é uma torta. Com cereja.', 'heart'), L(0, `${c.n[1]}, todas as suas nuvens são comida.`, 'laugh'), L(1, 'É que eu deito na grama e a fome deita junto.', 'sweat')],
    outcome: { bond: 5 },
  },
  {
    id: 'par-flor-orelha', kind: 'romance', title: 'Uma flor atrás da orelha', emoji: '🌼', cast: 2, weight: 4, when: (c) => day(c) && (coupled(c) || (c.rel?.spark ?? 0) >= 30),
    lines: (c) => [L(0, '(colhe uma florzinha do parque e põe atrás da orelha do outro)', 'heart'), L(1, 'Por que isso?', 'question'), L(0, `Porque combinou, ${c.n[1]}. Combina com você.`, 'heart'), L(1, '(passa o resto do dia sem tirar a flor)', 'sparkle')],
    outcome: { bond: 4, spark: 4 },
  },
  {
    id: 'par-cambalhota', kind: 'solo', title: 'Cambalhota', emoji: '🤸', cast: 1, weight: 4, when: (c) => day(c) && is(c, 0, 'Brincalhão', 'Corajoso', 'Curioso'),
    lines: () => [L(0, 'Vou dar uma cambalhota perfeita. Observem.', 'fire'), L(0, '(rola de lado, depois de costas, depois para a moita)', 'sweat'), L(0, '(sai da moita com folhas na cabeça) Era o plano. Cambalhota com final surpresa.', 'laugh')],
    outcome: {},
  },
  {
    id: 'par-gangorra-equilibrio', kind: 'amizade', title: 'Equilíbrio perfeito', emoji: '⚖️', cast: 2, weight: 4, when: (c) => friendsNow(c) && day(c),
    lines: (c) => [L(0, 'Se a gente sentar bem no meio, a gangorra fica parada.', 'idea'), L(1, '(os dois se ajeitam devagar... e a gangorra fica reta)', 'sparkle'), L(0, `Conseguimos, ${c.n[1]}! Equilíbrio perfeito!`, 'star'), L(1, 'É porque a gente pesa igual. De amizade.', 'heart')],
    outcome: { bond: 6 },
  },
  {
    id: 'par-sorveteiro', kind: 'comedia', title: 'O sorveteiro imaginário', emoji: '🍨', cast: 2, weight: 4, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, 'Sorvete! Olha o sorvete! Morango, chocolate e pecha!', 'note'), L(1, 'Você está vendendo sorvete? Cadê o sorvete?', 'question'), L(0, `É imaginário, ${c.n[1]}. Mas o sabor é de verdade.`, 'idea'), L(1, '(finge que lambe) ...pecha. Está ótimo. Quero dois.', 'laugh')],
    outcome: { bond: 4 },
  },
  {
    id: 'par-vagalumes', kind: 'amizade', title: 'Vagalumes no parque', emoji: '✨', cast: 2, weight: 4, when: (c) => (evening(c) || night(c)) && calm(c),
    lines: (c) => [L(0, 'Olha! O parque inteiro está piscando!', 'sparkle'), L(1, 'São vagalumes. Eles saem quando todo mundo vai dormir.', 'heart'), L(0, `${c.n[1]}, eles estão fazendo uma festa e a gente foi convidado.`, 'star'), L(1, '(os dois giram devagar no meio dos vagalumes)', 'sparkle')],
    outcome: { bond: 5, spark: 1 },
  },
  {
    id: 'par-sapato-amarrado', kind: 'comedia', title: 'Cadarços amarrados', emoji: '👟', cast: 2, weight: 4, when: (c) => day(c) && is(c, 0, 'Brincalhão'),
    lines: (c) => [L(0, '(amarra o cadarço de um com o do outro, devagarinho)', 'laugh'), L(1, 'Vamos correr até o balanço? Valendo!', 'fire'), L(1, '(tropeça e leva os dois juntos para o chão)', 'shock'), L(0, `Desculpa, ${c.n[1]}! Era para ser engraçado só para você!`, 'sweat')],
    outcome: { bond: 2 },
  },
  {
    id: 'par-arvore-casa', kind: 'amizade', title: 'Casa na árvore', emoji: '🏡', cast: 3, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'E se a gente construísse uma casa na árvore grande?', 'idea'), L(1, 'Com escada de corda! E uma placa: proibido adultos!', 'star'), L(2, 'Proibido adultos e proibido brócolis.', 'laugh'), L(0, `${c.n[1]} traz a madeira, ${c.n[2]} traz o lanche. Eu trago os planos.`, 'heart')],
    outcome: { bond: 4, bond02: 4, bond12: 4, items: [['madeira', 1]] },
  },
  {
    id: 'par-cansado-volta', kind: 'solo', title: 'Volta do parque', emoji: '🌆', cast: 1, weight: 4, when: (c) => evening(c),
    lines: () => [L(0, '(volta do parque arrastando os pés, cheio de areia e de grama)', 'zzz'), L(0, 'Foi o melhor dia. Balanço, escorregador, gangorra, carrossel.', 'heart'), L(0, 'Amanhã eu faço tudo de novo. Na mesma ordem.', 'star')],
    outcome: { friend: 1 },
  },
  {
    id: 'par-timidez-carrossel', kind: 'drama', title: 'Com vergonha de brincar', emoji: '😳', cast: 2, weight: 4, when: (c) => day(c) && is(c, 0, 'Tímido'),
    lines: (c) => [L(0, '(fica olhando o carrossel de longe, sem coragem de chegar)', 'sad'), L(1, `${c.n[0]}, vem! Tem lugar para você!`, 'heart'), L(0, 'E se eu ficar tonto? E se todo mundo rir?', 'sweat'), L(1, 'A gente ri junto. Isso é diferente. Vem.', 'star')],
    outcome: { bond: 7, friend: 1 },
  },
  {
    id: 'par-trio-estatua', kind: 'festa', title: 'Estátua!', emoji: '🗿', cast: 3, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Quando eu falar estátua, ninguém mexe! Dança, dança... ESTÁTUA!', 'note'), L(1, '(congela no meio de um passo, num pé só, tremendo)', 'sweat'), L(2, '(congela com a língua de fora e não aguenta e ri)', 'laugh'), L(0, `${c.n[2]} se mexeu! ${c.n[1]} ganhou! E está quase caindo!`, 'star')],
    outcome: { bond: 3, bond02: 3, bond12: 3 },
  },
];
