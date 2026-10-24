import type { Rng } from '../battle';
import { friendOf } from './life';
import type { VillageState } from './life';
import { hash, personalityOf } from './personality';
import { cleanAnswer, MAX_ANSWERS, MAX_LINGO, MAX_WORDS } from './social-state';
import type { Answer, Fx, MomentLine } from './social-state';

/**
 * Perguntas, respostas e bordões, no espírito de Tomodachi Life. De vez em quando um Pokémon pergunta uma coisa a você
 * ("Qual é o seu doce favorito?"); você digita (ou toca numa sugestão) e ele reage ao que você escreveu, faz uma segunda
 * pergunta de volta e, depois, a Vila repete o que ouviu ("Hmmm, que fome de…"). Cada Pokémon também tem um bordão que
 * repete no fim das falas e que pode pegar dos amigos. Tudo é puro e fica guardado com a Vila (`SocialState`).
 */

export type QKind = 'comida' | 'coisa' | 'lugar' | 'bicho' | 'pessoa' | 'opiniao' | 'palavra' | 'sonho' | 'medo' | 'musica' | 'cor' | 'poder' | 'bordao';

export interface Question {
  id: string;
  kind: QKind;
  ask: (player: string) => string;
  /** Texto de ajuda no campo de resposta. */
  placeholder: string;
  /** Respostas prontas para tocar (o jogador também pode digitar a dele). */
  chips: string[];
}

const q = (id: string, kind: QKind, ask: string | ((p: string) => string), placeholder: string, chips: string[]): Question => ({ id, kind, ask: typeof ask === 'string' ? () => ask : ask, placeholder, chips });

export const QUESTIONS: readonly Question[] = [
  // comida
  q('doce', 'comida', 'Qual é o seu doce favorito?', 'Meu doce favorito é…', ['Brigadeiro', 'Pudim', 'Sorvete', 'Pão de mel']),
  q('comida-fav', 'comida', 'Qual é a sua comida favorita no mundo inteiro?', 'Minha comida favorita é…', ['Pizza', 'Lasanha', 'Churrasco', 'Sushi']),
  q('comida-odeio', 'comida', 'Qual comida você NÃO aguenta nem ver?', 'Eu não aguento…', ['Jiló', 'Fígado', 'Quiabo', 'Brócolis']),
  q('cafe', 'comida', 'O que você come no café da manhã?', 'No café da manhã eu como…', ['Pão com manteiga', 'Tapioca', 'Cuscuz', 'Nada']),
  q('lanche', 'comida', 'Se der fome de madrugada, o que você come?', 'De madrugada eu como…', ['Miojo', 'Bolacha', 'Sobra da janta', 'Cereal']),
  q('fruta', 'comida', 'Qual é a sua fruta favorita?', 'Minha fruta favorita é…', ['Morango', 'Manga', 'Uva', 'Melancia']),
  q('sempre-comer', 'comida', 'Se você só pudesse comer UMA coisa para sempre, o que seria?', 'Eu comeria só…', ['Pizza', 'Batata frita', 'Bolo', 'Arroz']),
  q('sorvete', 'comida', 'Qual o seu sabor de sorvete?', 'Sorvete de…', ['Chocolate', 'Morango', 'Flocos', 'Limão']),
  // coisas
  q('objeto', 'coisa', 'Qual é o seu objeto favorito?', 'Meu objeto favorito é…', ['Travesseiro', 'Celular', 'Chinelo', 'Violão']),
  q('mochila', 'coisa', 'O que tem na sua mochila agora?', 'Na minha mochila tem…', ['Pokébolas', 'Lanche', 'Carregador', 'Pedras']),
  q('ilha', 'coisa', 'Se você fosse parar numa ilha deserta, o que levaria?', 'Eu levaria…', ['Violão', 'Rede', 'Comida', 'Um amigo']),
  q('colecao', 'coisa', 'O que você coleciona (ou queria colecionar)?', 'Eu coleciono…', ['Cartas', 'Figurinhas', 'Pedras', 'Moedas']),
  q('presente', 'coisa', 'Qual seria o presente perfeito para você?', 'O presente perfeito é…', ['Um livro', 'Um pet', 'Dinheiro', 'Um abraço']),
  q('casa-ideal', 'coisa', 'O que não pode faltar numa casa?', 'Não pode faltar…', ['Sofá', 'Geladeira', 'Wi-Fi', 'Plantas']),
  // lugares
  q('lugar-fav', 'lugar', 'Qual é o seu lugar favorito do mundo?', 'Meu lugar favorito é…', ['Praia', 'Minha casa', 'Montanha', 'Cinema']),
  q('ferias', 'lugar', 'Para onde você iria nas férias dos sonhos?', 'Nas férias eu iria para…', ['Japão', 'Paris', 'Nordeste', 'Disney']),
  q('cantinho', 'lugar', 'Qual é o seu cantinho secreto para ficar sozinho?', 'Meu cantinho secreto é…', ['Quarto', 'Banheiro', 'Quintal', 'Cama']),
  q('cidade', 'lugar', 'Em que cidade você gostaria de morar?', 'Eu moraria em…', ['São Paulo', 'Rio', 'Tóquio', 'Roça']),
  q('onde-nasceu', 'lugar', (p) => `${p}, de onde você é?`, 'Eu sou de…', ['Brasil', 'São Paulo', 'Minas', 'Bahia']),
  // bichos
  q('pet', 'bicho', 'Qual seria o seu bicho de estimação ideal?', 'Meu pet ideal é…', ['Cachorro', 'Gato', 'Capivara', 'Dragão']),
  q('fofo', 'bicho', 'Qual animal você acha mais fofo?', 'O mais fofo é…', ['Gatinho', 'Pinguim', 'Panda', 'Coelho']),
  q('bicho-medo', 'bicho', 'Qual bicho te dá mais medo?', 'Eu tenho medo de…', ['Barata', 'Cobra', 'Aranha', 'Pombo']),
  q('se-pokemon', 'bicho', 'Se você fosse um Pokémon, qual seria?', 'Eu seria um…', ['Pikachu', 'Snorlax', 'Eevee', 'Magikarp']),
  // pessoas
  q('heroi', 'pessoa', 'Quem é o seu herói ou heroína?', 'Meu herói é…', ['Minha mãe', 'Meu pai', 'Ash', 'Eu mesmo']),
  q('engracado', 'pessoa', 'Quem é a pessoa mais engraçada que você conhece?', 'A mais engraçada é…', ['Meu amigo', 'Meu irmão', 'Eu', 'Minha avó']),
  q('melhor-amigo', 'pessoa', 'Qual o nome do seu melhor amigo?', 'Meu melhor amigo é…', ['Fulano', 'Meu irmão', 'Você', 'Ninguém']),
  q('jantar', 'pessoa', 'Quem você chamaria para jantar, se pudesse chamar qualquer um?', 'Eu chamaria…', ['Um famoso', 'Minha família', 'Você', 'Todo mundo']),
  // opiniões
  q('abacaxi', 'opiniao', 'Abacaxi na pizza: pode ou não pode?', 'Abacaxi na pizza…', ['Pode', 'Não pode']),
  q('estacao', 'opiniao', 'Qual é a melhor estação do ano?', 'A melhor estação é…', ['Verão', 'Inverno', 'Primavera', 'Outono']),
  q('dia-noite', 'opiniao', 'Dia ou noite?', 'Eu prefiro…', ['Dia', 'Noite']),
  q('praia-montanha', 'opiniao', 'Praia ou montanha?', 'Eu prefiro…', ['Praia', 'Montanha']),
  q('gato-cachorro', 'opiniao', 'Time gato ou time cachorro?', 'Eu sou time…', ['Gato', 'Cachorro', 'Os dois']),
  // palavras
  q('palavra-fav', 'palavra', 'Qual é a sua palavra favorita?', 'Minha palavra favorita é…', ['Saudade', 'Chuchu', 'Bora', 'Cacareco']),
  q('giria', 'palavra', 'Me ensina uma gíria?', 'Uma gíria é…', ['Tá pago', 'Daora', 'Mano', 'Suave']),
  q('palavra-boba', 'palavra', 'Diga a palavra mais boba que você conhecer.', 'A palavra mais boba é…', ['Pernilongo', 'Bumbum', 'Xerox', 'Borboleta']),
  q('exclamacao', 'palavra', 'O que você fala quando leva um susto?', 'Eu falo…', ['Ai!', 'Nossa!', 'Eita!', 'Misericórdia']),
  // sonhos
  q('sonho', 'sonho', 'Qual é o seu maior sonho?', 'Meu maior sonho é…', ['Viajar o mundo', 'Ficar rico', 'Ser feliz', 'Dormir']),
  q('profissao', 'sonho', 'O que você queria ser quando crescesse?', 'Eu queria ser…', ['Astronauta', 'Cantor', 'Mestre Pokémon', 'Chef']),
  q('estrela-cadente', 'sonho', 'Passou uma estrela cadente! Qual é o seu pedido?', 'Meu pedido é…', ['Saúde', 'Paz', 'Dinheiro', 'Um sorvete']),
  // medos
  q('medo', 'medo', 'Do que você tem medo?', 'Eu tenho medo de…', ['Escuro', 'Altura', 'Barata', 'Segunda-feira']),
  q('barulho', 'medo', 'Qual barulho te dá mais arrepio?', 'O barulho que me arrepia é…', ['Giz no quadro', 'Trovão', 'Porta rangendo', 'Alarme']),
  q('assustador', 'medo', 'Qual é a coisa mais assustadora que existe?', 'A mais assustadora é…', ['Fantasma', 'Boneco', 'Conta de luz', 'Palhaço']),
  // música
  q('musica', 'musica', 'Qual é a sua música favorita?', 'Minha música favorita é…', ['Parabéns pra você', 'Uma de rock', 'Funk', 'Sertanejo']),
  q('instrumento', 'musica', 'Qual instrumento você gostaria de tocar?', 'Eu tocaria…', ['Violão', 'Bateria', 'Piano', 'Flauta']),
  q('chuveiro', 'musica', 'Qual música você canta no chuveiro?', 'No chuveiro eu canto…', ['Qualquer uma', 'Pop', 'Pagode', 'Nenhuma']),
  // cores
  q('cor', 'cor', 'Qual é a sua cor favorita?', 'Minha cor favorita é…', ['Azul', 'Verde', 'Roxo', 'Amarelo']),
  q('cor-combina', 'cor', 'Qual cor combina mais comigo?', 'Combina com você…', ['Vermelho', 'Azul', 'Rosa', 'Dourado']),
  // poderes
  q('superpoder', 'poder', 'Se você tivesse um superpoder, qual seria?', 'Meu superpoder seria…', ['Voar', 'Ficar invisível', 'Ler mentes', 'Teletransporte']),
  q('golpe', 'poder', 'Qual seria o seu golpe especial?', 'Meu golpe seria…', ['Soco de mola', 'Abraço urso', 'Cócegas', 'Espirro atômico']),
  q('apelido-heroi', 'poder', 'Qual seria o seu nome de super-herói?', 'Eu seria o…', ['Capitão Pipoca', 'Sombra', 'Trovão', 'Mestre Soneca']),
  // mais comida
  q('pipoca', 'comida', 'O que você come no cinema?', 'No cinema eu como…', ['Pipoca salgada', 'Pipoca doce', 'Chocolate', 'Nachos']),
  q('festa-junina', 'comida', 'Qual é a melhor comida de festa junina?', 'Na festa junina eu como…', ['Pamonha', 'Canjica', 'Paçoca', 'Milho cozido']),
  q('salgado', 'comida', 'Qual é o seu salgadinho de festa favorito?', 'Meu salgadinho favorito é…', ['Coxinha', 'Esfiha', 'Pastel', 'Enroladinho']),
  q('bolo', 'comida', 'Qual bolo você pediria no seu aniversário?', 'Eu pediria bolo de…', ['Chocolate', 'Cenoura', 'Prestígio', 'Morango']),
  q('comida-estranha', 'comida', 'Qual é a comida mais estranha que você já provou?', 'A mais estranha foi…', ['Escargot', 'Pé de porco', 'Jaca', 'Sushi de manga']),
  q('domingo', 'comida', 'O que tem no almoço de domingo perfeito?', 'No almoço de domingo tem…', ['Macarronada', 'Churrasco', 'Feijoada', 'Frango assado']),
  q('bebida', 'comida', 'Qual é a sua bebida favorita?', 'Minha bebida favorita é…', ['Suco de laranja', 'Refrigerante', 'Água de coco', 'Chocolate quente']),
  q('frio', 'comida', 'O que você come num dia bem frio?', 'No frio eu como…', ['Sopa', 'Caldo verde', 'Fondue', 'Pão de queijo']),
  q('cozinhar', 'comida', 'O que você sabe cozinhar?', 'Eu sei fazer…', ['Ovo frito', 'Miojo', 'Brigadeiro', 'Nada']),
  q('pizza-sabor', 'comida', 'Qual é o melhor sabor de pizza?', 'O melhor sabor é…', ['Calabresa', 'Margherita', 'Portuguesa', 'Quatro queijos']),
  // mais coisas
  q('brinquedo', 'coisa', 'Qual era o seu brinquedo favorito quando era pequeno?', 'Meu brinquedo favorito era…', ['Carrinho', 'Boneca', 'Bola', 'Videogame']),
  q('bolso', 'coisa', 'O que você sempre tem no bolso?', 'No meu bolso sempre tem…', ['Chave', 'Moeda', 'Bala', 'Papel amassado']),
  q('invencao', 'coisa', 'Qual é a melhor invenção de todos os tempos?', 'A melhor invenção é…', ['Internet', 'Cama', 'Ventilador', 'Pizza']),
  q('jogo', 'coisa', 'Qual é o seu jogo favorito?', 'Meu jogo favorito é…', ['Pokémon', 'Uno', 'Xadrez', 'Esconde-esconde']),
  q('livro', 'coisa', 'Qual livro (ou gibi) você recomenda?', 'Eu recomendo…', ['Turma da Mônica', 'Harry Potter', 'Mangá', 'Livro de receitas']),
  q('roupa', 'coisa', 'Qual é a sua roupa favorita?', 'Minha roupa favorita é…', ['Pijama', 'Moletom', 'Camiseta velha', 'Chinelo']),
  q('guardado', 'coisa', 'Qual coisa você guarda há anos e nunca jogou fora?', 'Eu guardo…', ['Cartinhas', 'Ingresso', 'Ursinho', 'Caixa de sapato']),
  q('veiculo', 'coisa', 'Se você pudesse ter qualquer veículo, qual seria?', 'Eu teria…', ['Moto', 'Balão', 'Submarino', 'Skate']),
  q('perdi', 'coisa', 'O que você mais perde em casa?', 'Eu sempre perco…', ['Controle remoto', 'Chave', 'Meia', 'Óculos']),
  // mais lugares
  q('lugar-calmo', 'lugar', 'Qual é o lugar mais calmo que você conhece?', 'O mais calmo é…', ['Biblioteca', 'Sítio da avó', 'Igreja', 'Varanda']),
  q('lugar-espaco', 'lugar', 'Se você pudesse visitar outro planeta, qual seria?', 'Eu visitaria…', ['Marte', 'Lua', 'Saturno', 'Plutão']),
  q('passeio', 'lugar', 'Qual é o passeio perfeito de fim de semana?', 'O passeio perfeito é…', ['Parque', 'Shopping', 'Cachoeira', 'Sofá']),
  q('regiao-pokemon', 'lugar', 'Qual região Pokémon você queria visitar?', 'Eu visitaria…', ['Kanto', 'Johto', 'Hoenn', 'Galar']),
  q('lugar-infancia', 'lugar', 'Qual lugar te lembra a infância?', 'Me lembra a infância…', ['Casa da avó', 'Escola', 'Pracinha', 'Rua de casa']),
  q('lugar-assustador', 'lugar', 'Qual lugar você nunca entraria sozinho?', 'Eu nunca entraria em…', ['Porão', 'Cemitério', 'Floresta', 'Casa abandonada']),
  q('lugar-comer', 'lugar', 'Qual é o melhor lugar para comer?', 'O melhor lugar para comer é…', ['Padaria', 'Feira', 'Casa da mãe', 'Rodízio']),
  q('acampar', 'lugar', 'Onde você armaria uma barraca para acampar?', 'Eu acamparia em…', ['Praia', 'Serra', 'Quintal', 'Sala']),
  // mais bichos
  q('bicho-voar', 'bicho', 'Se você pudesse virar um bicho que voa, qual seria?', 'Eu viraria…', ['Águia', 'Coruja', 'Borboleta', 'Morcego']),
  q('bicho-mar', 'bicho', 'Qual é o bicho do mar mais legal?', 'O mais legal do mar é…', ['Golfinho', 'Polvo', 'Tubarão', 'Baleia']),
  q('pokemon-fav', 'bicho', 'Qual é o seu Pokémon favorito? (pode ser eu!)', 'Meu Pokémon favorito é…', ['Charizard', 'Gengar', 'Lucario', 'Mew']),
  q('bicho-manha', 'bicho', 'Qual bicho é mais parecido com você de manhã?', 'De manhã eu sou um…', ['Bicho-preguiça', 'Urso', 'Galo', 'Coala']),
  q('bicho-fazenda', 'bicho', 'Qual bicho de fazenda você teria?', 'Eu teria…', ['Vaca', 'Galinha', 'Cabra', 'Porquinho']),
  q('bicho-inventado', 'bicho', 'Inventa um bicho misturando dois!', 'Meu bicho inventado é…', ['Gato-pato', 'Cachorrafa', 'Leão-pão', 'Tubarãozinho']),
  q('bicho-esquisito', 'bicho', 'Qual é o bicho mais esquisito do mundo?', 'O mais esquisito é…', ['Ornitorrinco', 'Bicho-pau', 'Baiacu', 'Tatu']),
  q('bicho-dupla', 'bicho', 'Que bicho seria o seu parceiro de aventura?', 'Meu parceiro seria…', ['Cachorro', 'Lobo', 'Papagaio', 'Tartaruga']),
  // mais pessoas
  q('professor', 'pessoa', 'Quem foi o melhor professor que você já teve?', 'O melhor professor foi…', ['Minha professora', 'O de Educação Física', 'Meu avô', 'A internet']),
  q('famoso', 'pessoa', 'Se você pudesse conhecer um famoso, quem seria?', 'Eu conheceria…', ['Um cantor', 'Um jogador', 'Um youtuber', 'O Professor Carvalho']),
  q('conselho', 'pessoa', 'Quem te dá os melhores conselhos?', 'Quem me aconselha é…', ['Minha mãe', 'Minha avó', 'Meu amigo', 'Meu travesseiro']),
  q('vizinho', 'pessoa', 'Quem é o vizinho mais marcante que você já teve?', 'O vizinho mais marcante é…', ['Seu Zé', 'Dona Maria', 'O do cachorro', 'Ninguém']),
  q('cozinheiro', 'pessoa', 'Quem cozinha melhor na sua família?', 'Quem cozinha melhor é…', ['Minha avó', 'Meu pai', 'Minha tia', 'Eu']),
  q('rival', 'pessoa', 'Quem é o seu maior rival (de brincadeira)?', 'Meu rival é…', ['Meu irmão', 'Meu primo', 'Gary', 'Eu mesmo']),
  q('dupla-batalha', 'pessoa', 'Com quem você formaria dupla numa batalha?', 'Minha dupla seria…', ['Meu melhor amigo', 'Minha mãe', 'Ash', 'Você']),
  q('saudade', 'pessoa', 'De quem você está com saudade?', 'Estou com saudade de…', ['Meus avós', 'Um amigo', 'Minha família', 'Ninguém']),
  // mais opiniões
  q('biscoito', 'opiniao', 'É biscoito ou bolacha?', 'O certo é…', ['Biscoito', 'Bolacha']),
  q('feijao', 'opiniao', 'Feijão por cima ou por baixo do arroz?', 'O feijão vai…', ['Por cima', 'Por baixo', 'Do lado']),
  q('ketchup', 'opiniao', 'Ketchup ou maionese?', 'Eu prefiro…', ['Ketchup', 'Maionese', 'Os dois', 'Nenhum']),
  q('chuva-sol', 'opiniao', 'Dia de chuva ou dia de sol?', 'Eu prefiro…', ['Chuva', 'Sol']),
  q('doce-salgado', 'opiniao', 'Doce ou salgado?', 'Eu sou mais…', ['Doce', 'Salgado']),
  q('meia-cama', 'opiniao', 'Dormir de meia: pode ou não pode?', 'Dormir de meia…', ['Pode', 'Jamais']),
  q('acordar-cedo', 'opiniao', 'Acordar cedo é bom ou é um castigo?', 'Acordar cedo é…', ['Bom', 'Castigo', 'Depende']),
  q('cafe-cha', 'opiniao', 'Café ou chá?', 'Eu prefiro…', ['Café', 'Chá', 'Chocolate quente']),
  q('sorvete-inverno', 'opiniao', 'Sorvete no inverno: vale?', 'Sorvete no inverno…', ['Vale sempre', 'Nem pensar']),
  q('papel-higienico', 'opiniao', 'Papel higiênico: a ponta vai para a frente ou para trás?', 'A ponta vai…', ['Para a frente', 'Para trás']),
  q('filme-serie', 'opiniao', 'Filme ou série?', 'Eu prefiro…', ['Filme', 'Série', 'Desenho']),
  q('inicial', 'opiniao', 'Inicial de fogo, água ou planta?', 'Eu escolho…', ['Fogo', 'Água', 'Planta']),
  // mais palavras
  q('palavra-dificil', 'palavra', 'Qual é a palavra mais difícil de falar?', 'A mais difícil é…', ['Paralelepípedo', 'Otorrinolaringologista', 'Pneumonia', 'Trava-língua']),
  q('palavra-bonita', 'palavra', 'Qual é a palavra mais bonita que existe?', 'A mais bonita é…', ['Aurora', 'Cafuné', 'Lua', 'Serenata']),
  q('xingamento-fofo', 'palavra', 'Me ensina um xingamento bem fofinho?', 'Um xingamento fofo é…', ['Seu pamonha', 'Bobão', 'Cabeça de abóbora', 'Seu chuchu']),
  q('som-boca', 'palavra', 'Qual é o barulho mais gostoso de fazer com a boca?', 'O barulho é…', ['Pop', 'Brrr', 'Tsss', 'Nhoc']),
  q('apelido', 'palavra', 'Que apelido você me daria?', 'Seu apelido seria…', ['Fofucho', 'Chefinho', 'Pipoquinha', 'Trovãozinho']),
  q('palavra-inventada', 'palavra', 'Inventa uma palavra nova que não existe!', 'A palavra nova é…', ['Pirulitaço', 'Bambolê-bum', 'Xiruba', 'Fofomático']),
  q('palavra-estrangeira', 'palavra', 'Me ensina uma palavra em outra língua?', 'A palavra é…', ['Arigatô', 'Hello', 'Merci', 'Hola']),
  // mais sonhos
  q('casa-sonho', 'sonho', 'O que não pode faltar na casa dos seus sonhos?', 'A casa dos sonhos tem…', ['Piscina', 'Escorregador', 'Biblioteca', 'Sala de jogos']),
  q('loteria', 'sonho', 'Se ganhasse na loteria, o que faria primeiro?', 'Eu faria…', ['Viajaria', 'Daria para a família', 'Compraria uma casa', 'Dormiria um mês']),
  q('talento', 'sonho', 'Qual talento você queria ter?', 'Eu queria saber…', ['Cantar', 'Desenhar', 'Dançar', 'Cozinhar']),
  q('viagem-tempo', 'sonho', 'Se pudesse viajar no tempo, para quando iria?', 'Eu iria para…', ['Dinossauros', 'O futuro', 'Minha infância', 'Ontem']),
  q('recorde', 'sonho', 'Qual recorde mundial você queria bater?', 'Eu bateria o recorde de…', ['Mais pizza comida', 'Maior soneca', 'Mais abraços', 'Mais cartas']),
  q('dia-perfeito', 'sonho', 'Como seria o seu dia perfeito?', 'Meu dia perfeito é…', ['Na praia', 'Jogando', 'Com os amigos', 'Dormindo']),
  q('treinador', 'sonho', 'Que tipo de treinador você sonha ser?', 'Eu quero ser…', ['Campeão da Liga', 'Líder de ginásio', 'Criador', 'Pesquisador']),
  q('aventura', 'sonho', 'Qual aventura você ainda quer viver?', 'Eu quero…', ['Saltar de paraquedas', 'Mergulhar', 'Escalar um vulcão', 'Ver a aurora']),
  // mais medos
  q('pesadelo', 'medo', 'Qual foi o pesadelo mais esquisito que você já teve?', 'Eu sonhei com…', ['Prova surpresa', 'Cair', 'Dentes caindo', 'Ser perseguido']),
  q('monstro', 'medo', 'Qual monstro de filme mais te assusta?', 'O que mais assusta é…', ['Zumbi', 'Vampiro', 'Lobisomem', 'Alienígena']),
  q('medo-bobo', 'medo', 'Qual é o seu medo mais bobo?', 'Meu medo bobo é…', ['Pé debaixo da cama', 'Espelho de noite', 'Balão estourando', 'Galinha']),
  q('dentista', 'medo', 'O que é pior: dentista ou injeção?', 'O pior é…', ['Dentista', 'Injeção', 'Os dois']),
  q('nervoso', 'medo', 'Qual situação te dá mais nervoso?', 'Me dá nervoso…', ['Falar em público', 'Prova', 'Elevador parado', 'Ligação']),
  q('pokemon-medo', 'medo', 'Qual Pokémon você teria medo de encontrar no escuro?', 'Eu teria medo de…', ['Gengar', 'Haunter', 'Darkrai', 'Mimikyu']),
  q('inseto', 'medo', 'Qual inseto faz você sair correndo?', 'Eu fujo de…', ['Barata voadora', 'Abelha', 'Mariposa', 'Grilo']),
  q('sozinho', 'medo', 'Do que você tem medo quando está sozinho em casa?', 'Sozinho eu tenho medo de…', ['Barulho estranho', 'Escuro', 'Campainha', 'Nada']),
  // mais música
  q('festa-musica', 'musica', 'Qual música não pode faltar numa festa?', 'Na festa tem que tocar…', ['Axé', 'Forró', 'Pagode', 'Pop']),
  q('dormir-musica', 'musica', 'Que música você ouve para dormir?', 'Para dormir eu ouço…', ['Barulho de chuva', 'Música clássica', 'Lo-fi', 'Silêncio']),
  q('banda', 'musica', 'Se você tivesse uma banda, qual seria o nome?', 'Minha banda se chamaria…', ['Os Pikachus', 'Trovão Rosa', 'Banda Soneca', 'Pokérock']),
  q('danca', 'musica', 'Qual é a sua dança favorita?', 'Eu danço…', ['Forró', 'Funk', 'Valsa', 'Dancinha do robô']),
  q('trilha', 'musica', 'Qual é a melhor música de desenho ou jogo?', 'A melhor é…', ['Abertura de Pokémon', 'Música do Mario', 'Dragon Ball', 'Tema da batalha']),
  q('karaoke', 'musica', 'O que você cantaria num karaokê?', 'No karaokê eu canto…', ['Sertanejo', 'Uma romântica', 'Rock', 'Funk']),
  q('estilo', 'musica', 'Qual estilo de música combina comigo?', 'Combina com você…', ['MPB', 'Rock', 'Samba', 'Música eletrônica']),
  q('grudou', 'musica', 'Qual música grudou na sua cabeça esta semana?', 'Grudou na cabeça…', ['Uma do rádio', 'Um jingle', 'Uma de desenho', 'Uma que eu inventei']),
  // mais cores
  q('cor-cabelo', 'cor', 'Se pudesse pintar o cabelo de qualquer cor, qual seria?', 'Eu pintaria de…', ['Azul', 'Rosa', 'Verde', 'Arco-íris']),
  q('cor-feia', 'cor', 'Qual cor você acha mais feia?', 'A mais feia é…', ['Marrom', 'Bege', 'Laranja', 'Nenhuma']),
  q('cor-carro', 'cor', 'De que cor seria o seu carro?', 'Meu carro seria…', ['Preto', 'Vermelho', 'Amarelo', 'Verde-limão']),
  q('cor-humor', 'cor', 'Que cor é o seu humor hoje?', 'Hoje meu humor é…', ['Amarelo', 'Cinza', 'Laranja', 'Roxo']),
  q('cor-quarto', 'cor', 'De que cor é (ou seria) o seu quarto?', 'Meu quarto é…', ['Branco', 'Azul-claro', 'Lilás', 'Verde']),
  q('cor-shiny', 'cor', 'Se eu fosse shiny, de que cor eu seria?', 'Você seria…', ['Dourado', 'Prateado', 'Rosa', 'Preto']),
  // mais poderes
  q('poder-inutil', 'poder', 'Qual seria o superpoder mais inútil do mundo?', 'O mais inútil seria…', ['Esquentar sopa fria', 'Falar com pombos', 'Trocar de meia', 'Saber a hora']),
  q('arma-secreta', 'poder', 'Qual seria a minha arma secreta na batalha?', 'Sua arma secreta é…', ['Olhar fofo', 'Grito agudo', 'Pum', 'Dancinha']),
  q('poder-animal', 'poder', 'Qual poder de bicho você queria ter?', 'Eu queria…', ['Respirar na água', 'Ver no escuro', 'Correr como guepardo', 'Grudar na parede']),
  q('golpe-nome', 'poder', 'Inventa o nome de um golpe Pokémon novo!', 'O golpe se chama…', ['Raio Pipoca', 'Soneca Sísmica', 'Chute Arco-íris', 'Bafo de Dragão']),
  q('poder-casa', 'poder', 'Que poder ajudaria a arrumar a casa?', 'O poder seria…', ['Telecinese', 'Clonagem', 'Vento', 'Mágica']),
  q('tipo', 'poder', 'Se você fosse um Pokémon, qual seria o seu tipo?', 'Eu seria do tipo…', ['Fogo', 'Fantasma', 'Dragão', 'Normal']),
  q('item-magico', 'poder', 'Qual item mágico você queria ter?', 'Eu queria ter…', ['Varinha', 'Capa de invisibilidade', 'Botas voadoras', 'Mochila sem fundo']),
  q('ataque-final', 'poder', 'Qual seria o seu ataque final, aquele que encerra tudo?', 'Meu ataque final é…', ['Hiper Raio', 'Explosão', 'Abraço eterno', 'Cochilo profundo']),
  // bordões
  q('bordao-1', 'bordao', 'Eu preciso de um bordão! Me inventa um?', 'Meu bordão seria…', ['Tá pago!', 'Oxe!', 'Que isso, meu filho!', 'Bora!']),
  q('bordao-2', 'bordao', 'O que eu devia gritar quando fico animado?', 'Grite…', ['Uhuuul!', 'É nóis!', 'Partiu!', 'Aêêê!']),
  q('bordao-3', 'bordao', 'Preciso de um grito de guerra para as batalhas!', 'O grito é…', ['Pra cima!', 'Vamos nessa!', 'Aguenta aí!', 'Chegou!']),
  q('bordao-4', 'bordao', 'Que palavra eu falo quando levo um susto?', 'Quando me assusto, eu digo…', ['Eita!', 'Vixe Maria!', 'Misericórdia!', 'Caramba!']),
  q('bordao-5', 'bordao', 'Como eu devia comemorar quando ganho alguma coisa?', 'Comemora com…', ['Toma essa!', 'Sou demais!', 'Rumo ao topo!', 'Ganhei, ganhei!']),
  q('bordao-6', 'bordao', 'O que eu falo quando alguma coisa dá errado?', 'Quando dá errado…', ['Faz parte!', 'Bola pra frente!', 'Deu ruim!', 'Ops!']),
  q('bordao-7', 'bordao', 'Me ensina um jeito de dizer que algo é muito bom?', 'É muito bom: …', ['Show de bola!', 'Top demais!', 'Que massa!', 'Bom demais da conta!']),
  q('bordao-8', 'bordao', 'Como eu devia dar oi para todo mundo?', 'Eu dou oi assim…', ['E aí, galera!', 'Salve, salve!', 'Fala, meu povo!', 'Bom dia, flor do dia!']),
];

export const QUESTION_BY_ID = new Map(QUESTIONS.map((x) => [x.id, x]));

// ----------------------------------------------------------------------------- segunda pergunta e reação

export interface FollowOption {
  label: string;
  /** O que o Pokémon responde à sua escolha. `a` é o que você digitou. */
  reply: (a: string) => string;
  fx: Fx;
  /** Pontos de amizade com ele. */
  friend: number;
}

export interface Follow {
  ask: (a: string) => string;
  options: FollowOption[];
}

const o = (label: string, reply: (a: string) => string, fx: Fx, friend = 2): FollowOption => ({ label, reply, fx, friend });
const f = (ask: (a: string) => string, ...options: FollowOption[]): Follow => ({ ask, options });

export const FOLLOWS: Record<QKind, readonly Follow[]> = {
  comida: [
    f((a) => `${a}? Hmm! E você come ${a} com frequência?`, o('Todo dia!', (a) => `Todo dia?! Eu quero ser seu vizinho de ${a}.`, 'heart', 3), o('Só de vez em quando', (a) => `Entendi! ${a} é para ocasiões especiais.`, 'sparkle'), o('Nunca comi, só falei', (a) => `Nunca?! Então por que me disse ${a}?! Vou ficar pensando nisso.`, 'shock', 1)),
    f((a) => `${a} combina com o quê? Eu nunca provei.`, o('Com tudo', (a) => `Com tudo?! Vou misturar ${a} com tudo que eu achar!`, 'star'), o('Sozinho já é perfeito', (a) => `${a} sozinho, sem enfeite. Um purista!`, 'sparkle'), o('Com fruta', (a) => `${a} com fruta... isso deve ser uma delícia esquisita.`, 'question')),
    f((a) => `Posso provar um pedacinho de ${a}?`, o('Claro, divide comigo', (a) => `Dividir ${a} com você é o meu momento favorito do dia!`, 'heart', 4), o('Só se você pedir direito', () => 'Por favorzinho com açúcar em cima?', 'laugh'), o('Nem pensar', (a) => `Nem um pedacinho de ${a}? Ai, o meu coração!`, 'sad', 0)),
  ],
  coisa: [
    f((a) => `${a}! E você tem isso em casa?`, o('Tenho, e é lindo', (a) => `Você tem ${a}?! Quero ver um dia!`, 'star', 3), o('Não, só queria', () => 'Quem sabe a gente dá um jeito!', 'sparkle'), o('Tenho dois', (a) => `Dois de ${a}? Você é muito rico!`, 'shock')),
    f((a) => `Você conseguiria ficar um dia inteiro sem ${a}?`, o('Nem pensar!', (a) => `Sem ${a}? Eu também não!`, 'shock', 3), o('Consigo, sim', () => 'Que força de vontade! Eu desabaria.', 'sweat'), o('Depende do dia', () => 'Sempre depende do dia.', 'question')),
    f((a) => `Se eu achar ${a} por aí, posso te dar?`, o('Pode!', (a) => `Combinado! Vou procurar ${a} em tudo que é canto.`, 'idea', 3), o('Guarda para você', () => 'Que gentil. Mas eu insisto!', 'heart'), o('Prefiro uma fruta', () => 'Fruta eu acho fácil. Fechado!', 'laugh')),
  ],
  lugar: [
    f((a) => `${a}! E como é lá?`, o('Lindo demais', (a) => `${a} deve ser incrível. Me leva um dia?`, 'sparkle', 3), o('Tem muita gente', () => 'Tanta gente... eu ia me esconder atrás de você.', 'sweat'), o('Nunca fui', () => 'Então a gente vai juntos um dia!', 'star')),
    f((a) => `Dá para ir a ${a} a pé?`, o('Dá, é pertinho', () => 'Vamos amanhã! Eu levo lanche.', 'fire', 2), o('Só de avião', () => 'Avião?! Eu cabia na bagagem de mão!', 'laugh'), o('De foguete', () => 'De foguete! Eu sempre quis!', 'star')),
    f((a) => `${a} tem frutas por lá?`, o('Tem muita!', (a) => `Já estou imaginando as frutas de ${a}...`, 'heart'), o('Nenhuma', () => 'Nenhuma fruta?! Isso é inaceitável.', 'shock'), o('Não sei', () => 'Você nunca reparou em fruta? Estranho.', 'question')),
  ],
  bicho: [
    f((a) => `${a}! E ele faz barulho?`, o('Faz um barulhão', (a) => `Imitei ${a} agora: "grrr, nhac!". Acertei?`, 'laugh'), o('É bem calminho', () => 'Perfeito para a gente que gosta de sossego.', 'sparkle'), o('Fala, de verdade', () => 'Fala?! Vou perguntar sobre mim!', 'shock', 3)),
    f((a) => `Você já foi mordido por ${a}?`, o('Várias vezes', () => 'Ai! Coitado. Vem cá que eu faço carinho.', 'sad', 3), o('Nunca!', () => 'Que bom! É bom manter todos os dedos.', 'sparkle'), o('Quase', () => 'Quase é a pior parte. Dá aquele susto.', 'shock')),
    f((a) => `Se ${a} morasse aqui na Vila, ele ia ser meu amigo?`, o('Claro!', (a) => `${a} aqui seria o rei da festa!`, 'star', 3), o('Ia te dar um susto', () => 'Eu corro rápido, não tem problema.', 'laugh'), o('Ia roubar sua fruta', () => 'Fruta é sagrada! Eu defendo até o fim.', 'fire')),
  ],
  pessoa: [
    f((a) => `${a}! Essa pessoa me conhece?`, o('Ainda não', () => 'Um dia você me apresenta, combinado?', 'sparkle', 2), o('Já falei de você', () => 'Falou de mim?! Eu sou famoso!', 'star', 3), o('Vai gostar de você', () => 'Eu sou muito fácil de gostar mesmo.', 'laugh')),
    f((a) => `${a} sabe cozinhar bem?`, o('Muito bem', (a) => `Quero a receita do ${a}, com urgência!`, 'heart'), o('Queima água', () => 'Eu também queimo. A gente se entende.', 'laugh'), o('Só pede delivery', () => 'Delivery é a melhor invenção da humanidade.', 'sparkle')),
    f((a) => `Você e ${a} já brigaram?`, o('Já, e foi feio', () => 'Mas fizeram as pazes, né? Diz que fizeram!', 'sad', 2), o('Nunca', () => 'Que amizade bonita!', 'heart', 3), o('Todo dia, de brincadeira', () => 'É assim que a gente se ama!', 'laugh')),
  ],
  opiniao: [
    f((a) => `${a}, é? Tem certeza absoluta?`, o('Certeza total', () => 'Convicção! Eu admiro quem sabe o que quer.', 'star', 3), o('Mais ou menos', () => 'Mais ou menos já é uma opinião. Eu também tenho.', 'sparkle'), o('Mudei de ideia', () => 'Mudou?! Que reviravolta! Vou contar para todo mundo.', 'shock')),
    f((a) => `Vou perguntar aos outros se também acham que "${a}". Posso?`, o('Pode, e conte o resultado', () => 'Vai ser uma votação histórica!', 'fire', 3), o('Não espalha', () => 'Hum... eu vou tentar. Mas é difícil.', 'sweat'), o('Pergunta ao mais difícil', () => 'Ah, o mandão. Eu vou com medo!', 'laugh')),
    f((a) => `${a} é a resposta certa, mas por quê?`, o('Porque sim', () => 'Argumento imbatível.', 'laugh', 1), o('Pela tradição', () => 'Tradição! Eu respeito.', 'sparkle'), o('Porque eu mando', () => 'Você manda?! Obedeço, capitão!', 'fire', 2)),
  ],
  palavra: [
    f((a) => `"${a}"... Que palavra boa! O que ela significa?`, o('Significa alegria', (a) => `"${a}" é alegria! Vou usar o dia todo.`, 'sparkle', 3), o('Nada, só soa bem', (a) => `"${a}" não quer dizer nada, e eu adorei.`, 'laugh'), o('É um segredo', () => 'Um segredo! Eu guardo. Quase sempre.', 'sweat')),
    f((a) => `Posso falar "${a}" de agora em diante?`, o('Pode, é seu', (a) => `${a}! ${a}! Testando o som.`, 'star', 3), o('Só para mim', () => 'Tá bom, só falo quando você não estiver olhando.', 'sweat'), o('Pague royalties', () => 'Royalties em frutas! Aceita parcelado?', 'laugh')),
    f((a) => `Se eu gritar "${a}" na hora da batalha, assusta o inimigo?`, o('Com certeza', () => 'Eu vou treinar o grito!', 'fire', 2), o('Só dá risada', () => 'Dar risada já é meio caminho andado.', 'laugh'), o('Funciona com o Mandão', () => 'Com o Mandão ninguém sabe o que funciona.', 'sweat')),
  ],
  sonho: [
    f((a) => `${a}... que sonho bonito! Já chegou perto?`, o('Estou chegando', () => 'Eu torço por você com todas as minhas patas!', 'heart', 3), o('Ainda está longe', () => 'Longe é só um lugar que a gente ainda não visitou.', 'sparkle', 2), o('Já desisti', () => 'Desistir é só uma pausa comprida. Eu te ajudo a voltar!', 'sad', 2)),
    f((a) => `Posso fazer parte do seu sonho de "${a}"?`, o('Claro, você é essencial', () => 'Essencial! Vou pedir um crachá.', 'star', 4), o('Você já faz', () => 'Eu já faço?! Que honra!', 'heart', 3), o('Só se trouxer lanche', () => 'Lanche eu trago. É a minha especialidade.', 'laugh')),
    f((a) => `Você conta o seu sonho de "${a}" para mais alguém?`, o('Só para você', () => 'Eu sou um cofre. Mas com buraco.', 'heart', 3), o('Para todo mundo', () => 'Então a Vila inteira vai torcer!', 'star'), o('Para ninguém', () => 'Eu também guardava os meus. Até hoje.', 'sad')),
  ],
  medo: [
    f((a) => `${a}?! Eu também tenho um pouquinho de medo. E você, grita?`, o('Grito bem alto', () => 'Eu corro e grito junto, é mais seguro.', 'shock', 2), o('Congelo', () => 'Eu viro estátua. Uma estátua tremendo.', 'sweat'), o('Eu enfrento!', () => 'Que coragem! Fico atrás de você, tá?', 'star', 3)),
    f((a) => `Se eu ficar do seu lado, diminui o medo de ${a}?`, o('Diminui muito', () => 'Então eu fico do seu lado para sempre!', 'heart', 4), o('Só um pouquinho', () => 'Um pouquinho já é um começo.', 'sparkle'), o('Aumenta, você é medroso', () => 'Eu sou. E dividir o medo ainda ajuda!', 'laugh')),
    f((a) => `Quando você era pequeno, ${a} já assustava?`, o('Desde sempre', () => 'Então é coisa antiga! A gente vence juntos.', 'sparkle', 2), o('Só depois que cresci', () => 'Crescer assusta mesmo.', 'sweat'), o('Nunca assustou, é novo', () => 'Medo novo é o mais esquisito.', 'question')),
  ],
  musica: [
    f((a) => `"${a}"! Você sabe cantar?`, o('Canto bem', () => 'Canta um pedacinho! Eu faço a segunda voz!', 'note', 3), o('Canto mal, mas animado', () => 'Animado é o que importa!', 'laugh'), o('Só no chuveiro', () => 'O chuveiro é o melhor palco que existe.', 'sparkle')),
    f((a) => `Dá para dançar "${a}"?`, o('Dá, e como!', () => 'Já estou rebolando!', 'fire', 3), o('Só de lado', () => 'De lado é o passo clássico!', 'laugh'), o('Só dormindo', () => 'Dançar dormindo? Isso eu já faço.', 'zzz')),
    f((a) => `Se eu cantar "${a}" desafinado, você ri?`, o('Rio, mas com carinho', () => 'Com carinho eu aguento qualquer risada.', 'heart', 3), o('Não vou nem respirar', () => 'Você é um cavalheiro!', 'sparkle'), o('Vou gravar', () => 'Gravar?! Vai viralizar!', 'shock')),
  ],
  cor: [
    f((a) => `${a}! Essa cor combina com o céu?`, o('Combina com tudo', () => 'Com tudo! Eu quero tudo dessa cor.', 'star', 2), o('Só com o pôr do sol', () => 'O pôr do sol é o melhor modelo.', 'sparkle'), o('Não combina com nada', () => 'Ousado! Eu respeito.', 'laugh')),
    f((a) => `Posso pintar a minha casa de ${a}?`, o('Pinta, vai ficar lindo', () => 'Vou pintar hoje mesmo!', 'heart', 3), o('Eu ajudo a pintar', () => 'A gente se suja mais que a parede!', 'laugh', 3), o('Prefiro outra cor', () => 'Ih, tarde demais, já comprei a tinta.', 'sweat')),
    f((a) => `Se tudo na Vila fosse ${a}, você gostava?`, o('Amava!', () => 'Uma Vila inteira assim! Que sonho!', 'star'), o('Enjoava', () => 'Faz sentido. Variedade é tudo.', 'sparkle'), o('Só se a grama continuasse verde', () => 'A grama verde é intocável.', 'idea')),
  ],
  poder: [
    f((a) => `${a}! Eu também queria isso. E o que você faria primeiro?`, o('Salvaria o mundo', () => 'Salvaria o mundo e ainda voltaria para o almoço!', 'star', 3), o('Faria uma pegadinha', () => 'Uma pegadinha com superpoder. Genial!', 'laugh', 2), o('Ficaria na cama', () => 'Ficar na cama com superpoder: o melhor dos mundos.', 'zzz')),
    f((a) => `Se você tivesse "${a}", me emprestava um dia?`, o('Emprestava!', () => 'Combinado! Eu devolvo limpinho.', 'heart', 4), o('Só no fim de semana', () => 'Fim de semana está ótimo!', 'sparkle'), o('Nunca!', () => 'Nem por uma fruta?', 'sad', 0)),
    f((a) => `"${a}" seria útil numa batalha?`, o('Muito', () => 'Então você será meu parceiro de dupla!', 'fire', 3), o('Só para fazer graça', () => 'Fazer graça também vence batalha. Já vi.', 'laugh'), o('Atrapalharia', () => 'Atrapalhar o inimigo é vencer, ué!', 'idea')),
  ],
  bordao: [
    f(() => 'Vai ser o meu bordão! Será que cola?', o('Vai colar!', () => 'Vou falar toda hora!', 'star', 3), o('Fala com confiança', () => 'Com confiança, certo!', 'fire', 2), o('Treina no espelho', () => 'Treino já!', 'sparkle')),
  ],
};

// ----------------------------------------------------------------------------- escolher e guardar

/** Um Pokémon pode perguntar? No máximo 2 por Pokémon e 7 na Vila por dia. */
export function canAsk(state: VillageState, monId: string, day: string): boolean {
  const mine = state.asked[monId];
  const mineToday = mine && mine.day === day ? mine.n : 0;
  if (mineToday >= 2) return false;
  let total = 0;
  for (const v of Object.values(state.asked)) if (v.day === day) total += v.n;
  return total < 7;
}

/** Sorteia uma pergunta que você ainda não respondeu (as repetidas só voltam depois que todas foram respondidas). */
export function pickQuestion(state: VillageState, rng: Rng): Question {
  const done = new Set(state.answers.map((x) => x.q));
  const fresh = QUESTIONS.filter((x) => !done.has(x.id));
  const pool = fresh.length > 0 ? fresh : QUESTIONS;
  return pool[Math.floor(rng() * pool.length)]!;
}

export function markAsked(state: VillageState, monId: string, day: string): void {
  const cur = state.asked[monId];
  state.asked[monId] = { day, n: cur && cur.day === day ? cur.n + 1 : 1 };
}

export function pickFollow(kind: QKind, rng: Rng): Follow {
  const list = FOLLOWS[kind];
  return list[Math.floor(rng() * list.length)]!;
}

/** Reações a respostas peculiares (o nome dele, resposta repetida, gritaria…). Devolve a fala ou null. */
export function oddReaction(state: VillageState, qq: Question, a: string, mon: { id: string; name: string }, player: string): string | null {
  const low = a.toLowerCase();
  if (low === mon.name.toLowerCase()) return 'Ei, esse é o meu nome! Você está me zoando?';
  if (low === player.toLowerCase()) return `Espera, "${a}" é o seu nome! Você respondeu com você mesmo!`;
  if (a.length <= 1) return 'Só isso? Tá, tá, respeito o mistério.';
  if (/\d/.test(a)) return 'Tem número na resposta! Fiquei até tonto.';
  if (a.length >= 4 && a === a.toUpperCase() && /[A-ZÀ-Ú]/.test(a)) return 'Não precisa gritar! Eu estou bem aqui.';
  if (a.includes('?')) return 'Você respondeu com uma pergunta! Esperto.';
  if (state.answers.some((x) => x.q !== qq.id && x.a.toLowerCase() === low)) return 'Você já tinha dito isso em outra resposta! Gostou mesmo, hein?';
  return null;
}

export interface Answered {
  answer: Answer;
  /** Fala de reação a algo peculiar, ou null. */
  odd: string | null;
  /** Foi um bordão: o Pokémon adotou. */
  bordao: boolean;
}

/** Guarda a resposta, vira "gíria" da Vila (para os Pokémon repetirem) e dá um tiquinho de amizade. */
export function recordAnswer(state: VillageState, mon: { id: string; name: string }, qq: Question, raw: string, now: number, day: string, player: string): Answered | null {
  const a = cleanAnswer(raw);
  if (!a) return null;
  const odd = oddReaction(state, qq, a, mon, player);
  const answer: Answer = { q: qq.id, a, mon: mon.id, t: now, day };
  state.answers.push(answer);
  if (state.answers.length > MAX_ANSWERS) state.answers.splice(0, state.answers.length - MAX_ANSWERS);
  friendOf(state, mon.id).points = Math.min(100, friendOf(state, mon.id).points + 2);
  if (qq.kind === 'bordao') {
    setWord(state, mon.id, a);
    return { answer, odd, bordao: true };
  }
  const lingo = state.lingo.filter((x) => x.text.toLowerCase() !== a.toLowerCase());
  lingo.push({ text: a, kind: qq.kind, from: mon.id, t: now });
  state.lingo = lingo.slice(-MAX_LINGO);
  return { answer, odd, bordao: false };
}

export function applyFollow(state: VillageState, monId: string, opt: FollowOption): void {
  const f = friendOf(state, monId);
  f.points = Math.max(0, Math.min(100, f.points + opt.friend));
}

// ----------------------------------------------------------------------------- repetir o que ouviu

type EchoFn = (a: string, who: string) => string;
const ECHO: Record<QKind, readonly EchoFn[]> = {
  comida: [(a) => `Hmmm, que fome de ${a}!`, (a) => `Será que hoje tem ${a}?`, (a) => `Sonhei com ${a} esta noite.`, (a) => `${a}... ${a}... ${a}...`, (a, w) => `${w} me disse que você ama ${a}!`],
  coisa: [(a) => `Eu queria ter ${a}.`, (a) => `Alguém viu ${a} por aí?`, (a) => `${a} é o que não pode faltar, né?`, (a, w) => `${w} disse que o seu favorito é ${a}.`],
  lugar: [(a) => `Um dia eu ainda vou conhecer ${a}.`, (a) => `Dizem que ${a} é lindo.`, (a) => `Se eu fechar os olhos, vejo ${a}.`],
  bicho: [(a) => `Você já viu ${a} de perto? Eu fico arrepiado só de pensar.`, (a) => `Parece que você gosta de ${a}...`, (a) => `Acho que vi ${a} atrás daquela árvore!`],
  pessoa: [(a) => `Eu queria conhecer ${a}.`, (a) => `${a} deve ser uma pessoa e tanto!`, (a, w) => `${w} comentou sobre ${a}.`],
  opiniao: [(a) => `Sobre aquilo: "${a}". Eu discordo. Ou concordo. Ainda penso.`, (a) => `Dizem que o treinador falou "${a}"!`, (a) => `"${a}": vou levar isso para o resto da vida.`],
  palavra: [(a) => `${a}!`, (a) => `Hoje o dia está muito ${a}.`, (a) => `Que ${a}, hein!`, (a) => `Diga "${a}" três vezes rápido.`, (a) => `Eu inventei uma música só com "${a}".`],
  sonho: [(a) => `Eu torço pelo sonho de "${a}" do treinador.`, (a) => `E se um dia eu também quiser "${a}"?`, (a) => `Hoje eu acordei pensando em "${a}".`],
  medo: [(a) => `Eu não vou falar de ${a}. Só de pensar eu tremo.`, (a) => `Será que ${a} anda por aqui?`, (a) => `Se aparecer ${a}, eu me escondo atrás de você!`],
  musica: [(a) => `Está na minha cabeça: ${a}...`, (a) => `Ei, alguém sabe a letra de "${a}"?`, (a) => `Hmm, hmm, hmmm... (cantarolando "${a}")`],
  cor: [(a) => `Tudo ficaria mais bonito em ${a}.`, (a) => `Eu pintaria uma parede de ${a}.`, (a) => `Se eu pudesse escolher, seria ${a}.`],
  poder: [(a) => `Se eu tivesse "${a}", faria tudo diferente!`, (a) => `"${a}": é o meu golpe preferido do treinador.`, (a) => `Vou treinar "${a}" escondido.`],
  bordao: [],
};

export interface Echo {
  id: string;
  text: string;
  fx: Fx;
}

const ECHO_FX: Fx[] = ['idea', 'star', 'sparkle', 'note', 'question'];

/**
 * Algo que um Pokémon fala sozinho, repetindo o que você respondeu: ele mesmo (quem perguntou) ou outro que ouviu falar.
 * `ids` = quem está na Vila agora. Devolve null se ninguém tem nada para repetir.
 */
export function pickEcho(state: VillageState, ids: readonly string[], names: Readonly<Record<string, string>>, rng: Rng): Echo | null {
  if (ids.length === 0 || state.lingo.length === 0) return null;
  const recent = state.lingo.slice(-8);
  const lingo = recent[Math.floor(rng() * recent.length)]!;
  const speaker = ids.includes(lingo.from) && rng() < 0.6 ? lingo.from : ids[Math.floor(rng() * ids.length)]!;
  const all = ECHO[lingo.kind as QKind] ?? ECHO.palavra;
  // Os que citam "fulano me disse" só servem para quem NÃO foi o que perguntou.
  const usable = speaker === lingo.from ? all.filter((x) => x.length < 2) : all;
  const fns = usable.length > 0 ? usable : ECHO.palavra;
  const final = fns[Math.floor(rng() * fns.length)]!(lingo.text, names[lingo.from] ?? 'alguém');
  return { id: speaker, text: final, fx: ECHO_FX[Math.floor(rng() * ECHO_FX.length)]! };
}

// ----------------------------------------------------------------------------- bordões

/** Bordões padrão de cada personalidade (no máximo 24 letras, o limite de `setWord`, porque também passam de um a outro). */
export const DEFAULT_WORDS: Record<string, readonly string[]> = {
  Brincalhão: [
    'Hihihi!', 'Pega eu!', 'Bora brincar!', 'Uiii!', 'Tá com você!', 'Cosquinha!', 'Peguei!', 'Bu! Assustei?', 'Mais uma vez!',
    'Uhuuu, que farra!', 'Duvido você me pegar!', 'Pisca-pisca!', 'Iupiii!', 'Lá vem bagunça!',
  ],
  Calmo: [
    'Calma, calma.', 'Tudo no tempo.', 'Respira…', 'Hmm, tranquilo.', 'Devagarinho…', 'Sem pressa.', 'Tá tudo bem.', 'Deixa fluir.',
    'Paz e fruta.', 'Uma coisa de cada vez.', 'Ahh, que brisa.', 'Tranquilo, tranquilo.', 'Relaxa.', 'Tudo se ajeita.',
  ],
  Tímido: [
    'Ah… desculpa.', 'Se não for incômodo…', 'Hã… oi.', 'Eu só queria…', 'Hum… tá bom.', 'Posso ficar aqui?', 'Foi sem querer…',
    'Ai, que vergonha.', 'Talvez… sim?', 'Com licencinha…', 'Eu acho que…', 'Desculpa o mau jeito.', 'Ninguém viu, né?', 'Psiu… oi.',
  ],
  Corajoso: [
    'Pode vir!', 'Sem medo!', 'Eu seguro!', 'Bora pra cima!', 'Deixa comigo!', 'Pode contar comigo!', 'Avante!', 'Medo de quê?',
    'Eu vou na frente!', 'Ninguém me para!', 'Firme e forte!', 'É agora ou nunca!', 'Segura essa!', 'Vem com tudo!',
  ],
  Guloso: [
    'Tem fruta?', 'Hmm, delícia!', 'Dá um pedacinho?', 'Que fominha!', 'Que cheirinho bom!', 'Já é hora do lanche?', 'Sobrou alguma coisa?',
    'Nham nham!', 'Barriga roncando!', 'Mais um pouquinho!', 'Hmm, que fome!', 'Isso se come?', 'Guarda pra mim!', 'Comida é vida!',
  ],
  Sonhador: [
    'Será que sim?', 'Nas nuvens…', 'Que lindo, né?', 'Um dia…', 'E se fosse verdade?', 'Olha aquela nuvem!', 'Imagina só…',
    'Quem sabe amanhã…', 'Que dia mágico!', 'Parece um sonho.', 'As estrelas sabem.', 'Lá longe…', 'Faz um pedido!', 'Tudo é possível!',
  ],
  Curioso: [
    'Ué?', 'Me conta mais!', 'O que é isso?', 'Interessante!', 'Por quê?', 'Como assim?', 'E depois?', 'Deixa eu ver!', 'Hmm, que estranho!',
    'Será que funciona?', 'Quem fez isso?', 'Eu quero saber!', 'Opa, o que é aquilo?', 'Explica de novo?',
  ],
  Mandão: [
    'É ordem!', 'Eu mando aqui!', 'Faz assim.', 'Escuta o chefe!', 'Anda logo!', 'Sem discussão!', 'Fila indiana!', 'Eu decido!',
    'Obedece!', 'Já falei!', 'Isso é comigo.', 'Tá decidido!', 'Todo mundo atento!', 'Do meu jeito!',
  ],
};

/** O bordão do Pokémon: o que ele pegou (ou o que você deu) ou um padrão fixo do jeito dele. */
export function wordOf(state: VillageState, id: string): string {
  const w = state.words[id];
  if (w) return w;
  const list = DEFAULT_WORDS[personalityOf(id).name] ?? DEFAULT_WORDS.Curioso!;
  return list[hash(`w:${id}`) % list.length]!;
}

/**
 * Resorteia, uma única vez, os bordões já gravados usando a pool atual. O chamador guarda a data no save para que esta
 * ação seja permanente e não aconteça de novo ao reabrir a Vila.
 */
export function rerollWords(state: VillageState, ids: readonly string[], day: string): void {
  const used = new Set<string>();
  for (const id of [...new Set(ids)]) {
    const list = DEFAULT_WORDS[personalityOf(id).name] ?? DEFAULT_WORDS.Curioso!;
    const old = state.words[id];
    const start = hash(`reroll:${day}:${id}`) % list.length;
    let picked = list[start]!;
    for (let offset = 0; offset < list.length; offset++) {
      const candidate = list[(start + offset) % list.length]!;
      if (candidate !== old && !used.has(candidate)) {
        picked = candidate;
        break;
      }
    }
    state.words[id] = picked;
    used.add(picked);
  }
}

export function setWord(state: VillageState, id: string, word: string): void {
  const w = cleanAnswer(word, 24);
  if (!w) return;
  state.words[id] = w;
  const keys = Object.keys(state.words);
  if (keys.length > MAX_WORDS) for (const k of keys.slice(0, keys.length - MAX_WORDS)) delete state.words[k];
}

/**
 * Põe o bordão no fim de algumas falas de cada Pokémon (uma vez por cena, quase sempre na última fala dele), sem mexer
 * nos textos originais dos modelos. Devolve as falas novas.
 */
export function withWords(lines: readonly MomentLine[], castIds: readonly string[], state: VillageState, rng: Rng): MomentLine[] {
  const out = lines.map((l) => ({ ...l }));
  const lastOf = new Map<number, number>();
  out.forEach((l, i) => lastOf.set(l.who, i));
  for (const [who, i] of lastOf) {
    const id = castIds[who];
    if (!id || rng() > 0.4) continue;
    const line = out[i]!;
    const w = wordOf(state, id);
    if (line.text.includes(w)) continue;
    line.text = `${line.text} ${w}`.slice(0, 220);
  }
  return out;
}

/** Depois de um momento entre dois ou mais, um deles às vezes "pega" o bordão do outro. Devolve o aviso (ou null). */
export function spreadWords(state: VillageState, cast: readonly { id: string; name: string }[], rng: Rng): string | null {
  if (cast.length < 2 || rng() > 0.12) return null;
  const from = cast[Math.floor(rng() * cast.length)]!;
  const rest = cast.filter((c) => c.id !== from.id);
  const to = rest[Math.floor(rng() * rest.length)]!;
  const w = wordOf(state, from.id);
  if (wordOf(state, to.id) === w) return null;
  setWord(state, to.id, w);
  return `🗣️ ${to.name} pegou o bordão de ${from.name}: "${w}"`;
}
