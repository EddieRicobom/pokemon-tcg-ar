import { L, calm, day, evening, heard, is, night, rainy, said, snowy } from './kit';
import type { Template } from './kit';

/** Mais momentos com três Pokémon: confusões coletivas, bandas, missões e festas. `bond` é entre o 1º e o 2º; `bond02` e `bond12` completam o trio. */
export const TRIO2_MOMENTS: readonly Template[] = [
  {
    id: 'trio2-caca-tesouro', kind: 'festa', title: 'Caça ao tesouro', emoji: '🗺️', cast: 3, weight: 5, when: (c) => day(c) && calm(c),
    lines: (_c) => [L(0, 'O mapa diz: "Ande dez passos a partir da pedra torta".', 'idea'), L(1, 'Dez passos meus ou dez passos seus? Os meus são menores.', 'question'), L(2, '(cava no lugar errado) Achei um tesouro! É uma meia velha.', 'shock'), L(0, 'O tesouro está do outro lado. Mas a meia vai ter um museu.', 'laugh')],
    outcome: { bond: 5, bond02: 5, bond12: 5, spark: 1, coins: 8 },
  },
  {
    id: 'trio2-banda-garagem', kind: 'festa', title: 'Banda de garagem', emoji: '🎸', cast: 3, weight: 5, when: (c) => day(c) || evening(c),
    lines: (_c) => [L(0, 'Nome da banda: "Os Três Mosquiteiros da Madrugada"!', 'star'), L(1, 'Eu toco violão, mas só a corda que sobrou.', 'note'), L(2, 'Eu faço o vocal e a plateia, porque não veio ninguém.', 'sweat'), L(0, 'Um, dois, três, quatro! (um barulho que lembra uma panela caindo)', 'note')],
    outcome: { bond: 5, bond02: 5, bond12: 5, spark: 1 },
  },
  {
    id: 'trio2-time-de-futebol', kind: 'comedia', title: 'Três contra o mundo', emoji: '⚽', cast: 3, weight: 5, when: (c) => day(c) && calm(c),
    lines: (_c) => [L(0, 'A gente forma um time de três e chama de "Trio Elétrico FC"!', 'fire'), L(1, 'Quem vai ser o goleiro, o zagueiro e o atacante?', 'question'), L(2, 'Eu sou todos ao mesmo tempo e nenhum ao mesmo tempo.', 'sweat'), L(0, '(a bola passa pelo gol, depois pela cerca, depois pelo lago)', 'shock')],
    outcome: { bond: 4, bond02: 4, bond12: 4 },
  },
  {
    id: 'trio2-assalto-geladeira', kind: 'comedia', title: 'Assalto à geladeira', emoji: '🧀', cast: 3, weight: 5, when: (c) => (night(c) || c.env.hour >= 22) && is(c, 0, 'Guloso', 'Curioso', 'Brincalhão'),
    lines: (_c) => [L(0, 'Silêncio total. Eu vou abrir a porta. A luz é a inimiga.', 'idea'), L(1, '(entra pé ante pé) O queijo está na prateleira de cima.', 'sweat'), L(2, 'Eu fico de vigia. Se eu espirrar, finjam que foi o vento.', 'sweat'), L(0, '(a luz acende) Surpresa! O treinador me flagrou, aliás, nos flagrou!', 'shock')],
    outcome: { bond: 4, bond02: 4, bond12: 4, friend: 1 },
  },
  {
    id: 'trio2-curso-de-culinaria', kind: 'amizade', title: 'Aula de culinária', emoji: '👩‍🍳', cast: 3, weight: 5, when: (c) => day(c) || evening(c),
    lines: (_c) => [L(0, 'Hoje a receita é bolo de chocolate sem chocolate e sem bolo.', 'idea'), L(1, 'Então é uma massa de ar?', 'question'), L(2, 'Eu fico responsável por provar. É a parte mais difícil.', 'laugh'), L(0, '(a cozinha vira nuvem de farinha; os três espirram em coro)', 'sweat')],
    outcome: { bond: 5, bond02: 5, bond12: 5, spark: 1 },
  },
  {
    id: 'trio2-reuniao-de-condominio', kind: 'comedia', title: 'Reunião de vizinhos', emoji: '📋', cast: 3, weight: 5, when: (c) => c.env.town >= 3 && (day(c) || evening(c)),
    lines: (_c) => [L(0, 'Pauta de hoje: o barulho do galo, o muro do lado e a torta sumida.', 'fire'), L(1, 'Eu voto contra o galo e contra o barulho.', 'anger'), L(2, 'Eu voto a favor da torta. Mas contra quem comeu.', 'anger'), L(0, 'Aprovado por unanimidade: fazer outra torta e outra reunião.', 'laugh')],
    outcome: { bond: 3, bond02: 3, bond12: 3 },
  },
  {
    id: 'trio2-cinema-ao-ar-livre', kind: 'festa', title: 'Cinema ao ar livre', emoji: '🎬', cast: 3, weight: 4, when: (c) => night(c) && calm(c) && c.has('televisao', 'tenda', 'fogueira'),
    lines: (_c) => [L(0, 'Pipoca, cobertor, lençol e uma tela feita de lençol.', 'star'), L(1, 'É um filme de aventura, com um dragão e um bolo.', 'idea'), L(2, '(cochila no primeiro minuto, mas jura que viu tudo)', 'zzz'), L(0, 'No final o dragão virou amigo. Todos choraram, inclusive o dragão.', 'sad')],
    outcome: { bond: 5, bond02: 5, bond12: 5, spark: 1 },
  },
  {
    id: 'trio2-conselho-resposta', kind: 'amizade', title: 'Conselho sobre o treinador', emoji: '🧠', cast: 3, weight: 9, when: (c) => heard(c) && (day(c) || evening(c)),
    lines: (c) => [L(0, `Eu descobri que o treinador gosta de "${said(c)}". Anotem!`, 'idea'), L(1, 'Eu anoto na pedra e passo na parede.', 'star'), L(2, `Com "${said(c)}" a gente dá o presente perfeito!`, 'sparkle'), L(0, 'O plano é secreto. Se o treinador perguntar, a gente nega.', 'laugh')],
    outcome: { bond: 5, bond02: 5, bond12: 5, friend: 1 },
  },
  {
    id: 'trio2-coral-resposta', kind: 'festa', title: 'Coral da resposta', emoji: '🎤', cast: 3, weight: 8, when: (c) => heard(c) && (day(c) || evening(c)),
    lines: (c) => [L(0, `Um, dois, três... "${said(c)}"!`, 'note'), L(1, '(entra na segunda voz, meio atrasado) ...ado!', 'note'), L(2, '(grave, de barriga cheia) Aaaaah!', 'note'), L(0, 'Esse foi o ensaio. A apresentação é no domingo.', 'star')],
    outcome: { bond: 5, bond02: 5, bond12: 5, spark: 1 },
  },
  {
    id: 'trio2-julgamento-bordao', kind: 'comedia', title: 'Quem é o dono do bordão', emoji: '⚖️', cast: 3, weight: 6, when: (c) => day(c) || evening(c),
    lines: (_c) => [L(0, 'Esse bordão é meu! Eu falei primeiro!', 'anger'), L(1, 'Eu falei ontem! E com mais convicção!', 'anger'), L(2, 'Eu sou o juiz. A sentença é: o bordão pertence a quem falar mais alto.', 'fire'), L(0, 'ISSO É UMA INJUSTIÇA, É UM ABSURDO!', 'anger')],
    outcome: { bond: 2, bond02: 2, bond12: 2 },
  },
  {
    id: 'trio2-grande-mudanca', kind: 'drama', title: 'A mudança do trio', emoji: '🚚', cast: 3, weight: 4, when: (c) => c.env.town >= 3 && day(c),
    lines: (_c) => [L(0, 'Eu vou morar na casa nova, a dois passos daqui.', 'sad'), L(1, 'Dois passos? Mas dois passos é longe demais!', 'sad'), L(2, 'Eu empresto a bicicleta. E a gente toma café todo sábado.', 'heart'), L(0, 'Então não é adeus: é um até logo com bolinho.', 'sparkle')],
    outcome: { bond: 5, bond02: 5, bond12: 5, spark: 1 },
  },
  {
    id: 'trio2-fofoca-em-trio', kind: 'drama', title: 'Telefone sem fio', emoji: '📞', cast: 3, weight: 5, when: (c) => day(c) || evening(c),
    lines: (_c) => [L(0, '(sussurrando) A fada do biscoito vai trazer pão de mel.', 'idea'), L(1, '(sussurrando) O dragão do biscoito vai levar o pão de mel.', 'shock'), L(2, '(sussurrando) Alguém roubou o pão do dragão, e ele está furioso!', 'shock'), L(0, 'Não foi nada disso! Eu só falei do biscoito!', 'anger')],
    outcome: { bond: 3, bond02: 3, bond12: 3 },
  },
  {
    id: 'trio2-quem-quebrou', kind: 'drama', title: 'Quem quebrou o vaso?', emoji: '🏺', cast: 3, weight: 5, when: (c) => day(c) || evening(c),
    lines: (_c) => [L(0, 'O vaso está no chão, em mil pedaços. Quem foi?', 'shock'), L(1, 'Eu estava dormindo. Tenho três testemunhas, que também dormiam.', 'sweat'), L(2, 'Eu só passei por aqui. Com um taco. E uma bola.', 'sweat'), L(0, 'Vamos fingir que foi o vento. É o único que não pode se defender.', 'laugh')],
    outcome: { bond: 3, bond02: 3, bond12: 3 },
    choice: {
      prompt: 'Ninguém assume o vaso quebrado. O que você faz?',
      options: [
        { label: () => 'Consertar com cola', lines: () => [L(1, 'Um herói! O vaso ficou pior, mas está inteiro.', 'laugh'), L(0, 'Dá pra pôr uma flor dentro.', 'heart')], outcome: { bond: 6, bond02: 6, bond12: 6, friend: 1 } },
        { label: () => 'Dizer que foi o vento', lines: () => [L(2, 'O vento é um criminoso reincidente.', 'laugh'), L(1, 'Obrigado, treinador!', 'sparkle')], outcome: { bond: 3, bond02: 3, bond12: 3 } },
        { label: () => 'Dar uma flor ao vaso', needs: { item: 'flor', qty: 1 }, lines: () => [L(0, 'Um vaso quebrado, uma flor e uma lição.', 'heart'), L(2, 'Eu paguei o vaso do meu bolso. Quer dizer, do seu.', 'sweat')], outcome: { bond: 7, bond02: 7, bond12: 7, friend: 2 } },
      ],
    },
  },
  {
    id: 'trio2-corrida-de-tres', kind: 'rivalidade', title: 'A corrida dos três', emoji: '🏁', cast: 3, weight: 5, when: (c) => day(c) && calm(c) && is(c, 0, 'Corajoso', 'Brincalhão', 'Mandão'),
    lines: (_c) => [L(0, 'Largada! Vence quem chegar primeiro ao poste!', 'fire'), L(1, '(vai na frente) Eu já estou ganhando! Olha só!', 'star'), L(2, '(passa por baixo e cruza o poste) Surpresa!', 'laugh'), L(0, 'Eu deveria ter ido pela água. Seria injusto, mas mais rápido.', 'sweat')],
    outcome: { bond: 2, bond02: 2, bond12: 2, spark: 0 },
  },
  {
    id: 'trio2-pique-cola', kind: 'festa', title: 'Pique-cola', emoji: '🧍', cast: 3, weight: 4, when: (c) => day(c) && calm(c),
    lines: (_c) => [L(0, 'Se eu te pegar, você vira estátua até alguém te salvar!', 'fire'), L(1, '(é pego e congela na pose mais ridícula possível)', 'laugh'), L(2, 'Vou salvar! Vou salvar! (tropeça, cai em cima de todo mundo)', 'shock'), L(0, 'Estátua, é? Agora somos três estátuas e uma pilha.', 'laugh')],
    outcome: { bond: 5, bond02: 5, bond12: 5, spark: 1 },
  },
  {
    id: 'trio2-banheira-de-bolinhas', kind: 'festa', title: 'Festa das bolhas', emoji: '🫧', cast: 3, weight: 4, when: (c) => day(c) && calm(c),
    lines: (_c) => [L(0, 'Sabão, água e um canudo. É o laboratório da alegria!', 'star'), L(1, 'Eu soprei uma bolha do tamanho de uma casa!', 'shock'), L(2, '(a bolha pousa na cabeça dele, estoura e o deixa todo cheiroso)', 'sparkle'), L(0, 'Eu quero ser uma bolha na próxima vida.', 'heart')],
    outcome: { bond: 5, bond02: 5, bond12: 5, spark: 1 },
  },
  {
    id: 'trio2-troca-de-papeis', kind: 'comedia', title: 'Dia de trocar de papel', emoji: '🔁', cast: 3, weight: 4, when: (c) => day(c),
    lines: (_c) => [L(0, 'Hoje eu sou o chefe, ele é o cozinheiro e ela é o médico.', 'fire'), L(1, 'Eu cozinho com estetoscópio. Dá certo?', 'question'), L(2, 'Eu receito sopa para quem está com fome de um chefe.', 'laugh'), L(0, 'Tudo errado, mas tudo combinando.', 'sparkle')],
    outcome: { bond: 4, bond02: 4, bond12: 4 },
  },
  {
    id: 'trio2-capitao-pirata', kind: 'comedia', title: 'Os piratas do laguinho', emoji: '🏴‍☠️', cast: 3, weight: 5, when: (c) => day(c) && calm(c) && is(c, 0, 'Corajoso', 'Brincalhão', 'Mandão', 'Curioso'),
    lines: (_c) => [L(0, 'Eu sou o Capitão! Vamos zarpar com a nossa frota de folha!', 'fire'), L(1, 'Eu sou o imediato. Meu cargo é segurar a folha.', 'idea'), L(2, 'Eu sou o tesouro. Fico aqui, quietinho, esperando ser achado.', 'laugh'), L(0, '(o barco afunda a dois metros; o tesouro precisa ser resgatado)', 'shock')],
    outcome: { bond: 5, bond02: 5, bond12: 5, spark: 1 },
  },
  {
    id: 'trio2-aula-de-yoga', kind: 'amizade', title: 'Yoga na grama', emoji: '🧘', cast: 3, weight: 4, when: (c) => c.env.hour >= 6 && c.env.hour < 11 && calm(c),
    lines: (_c) => [L(0, 'Inspirem, expirem, sintam a grama entre os dedos.', 'idea'), L(1, 'Eu sinto. Cócegas. Muitas.', 'laugh'), L(2, '(tenta a posição da árvore e vira uma árvore tombada)', 'shock'), L(0, 'A paz interior chega de tombo, mas chega.', 'sparkle')],
    outcome: { bond: 5, bond02: 5, bond12: 5 },
  },
  {
    id: 'trio2-neve-iglu', kind: 'amizade', title: 'Iglu para três', emoji: '🧊', cast: 3, weight: 6, when: (c) => snowy(c),
    lines: (_c) => [L(0, 'Blocos de neve: um, dois, três... o telhado desmoronou.', 'sweat'), L(1, 'Segura a parede! Eu empurro a porta!', 'fire'), L(2, '(entra de lado e acha o iglu perfeito: cabe um e meio)', 'laugh'), L(0, 'Aqui dentro faz um frio quentinho. Dá para ficar para sempre.', 'heart')],
    outcome: { bond: 6, bond02: 6, bond12: 6, spark: 1 },
  },
  {
    id: 'trio2-pique-chuva', kind: 'festa', title: 'Campeonato de poças', emoji: '💦', cast: 3, weight: 5, when: (c) => rainy(c) && is(c, 0, 'Brincalhão', 'Corajoso', 'Curioso'),
    lines: (_c) => [L(0, 'Regra: quem fizer o maior respingo vence!', 'star'), L(1, '(salta na poça, o respingo atinge a árvore e o telhado)', 'shock'), L(2, '(salta, o respingo molha todo mundo, inclusive ele)', 'laugh'), L(0, 'Placar final: três molhados, uma vitória coletiva.', 'sparkle')],
    outcome: { bond: 5, bond02: 5, bond12: 5, spark: 1 },
  },
  {
    id: 'trio2-banco-de-moedas', kind: 'comedia', title: 'A moeda perdida', emoji: '🪙', cast: 3, weight: 4, when: (c) => day(c),
    lines: (_c) => [L(0, 'Uma moeda! Rolou para debaixo do banco!', 'shock'), L(1, 'Eu pego, eu pego! (enfia a cabeça e fica preso)', 'sweat'), L(2, 'Eu puxo! (puxa e a moeda vai parar no meu bolso)', 'laugh'), L(0, 'Moral: dividir em três e rir por dentro.', 'star')],
    outcome: { bond: 4, bond02: 4, bond12: 4, coins: 6 },
  },
  {
    id: 'trio2-livro-clube', kind: 'amizade', title: 'Clube do livro', emoji: '📚', cast: 3, weight: 4, when: (c) => (day(c) || evening(c)) && c.env.town >= 3 && is(c, 0, 'Curioso', 'Sonhador', 'Calmo'),
    lines: (_c) => [L(0, 'O livro de hoje fala de um dragão e de um tomate muito corajoso.', 'idea'), L(1, 'Eu li até a página dois e dormi no tomate.', 'zzz'), L(2, 'Eu li até o final, mas me esqueci de tudo no caminho.', 'sweat'), L(0, 'Então a nossa discussão é um grande empate de memória.', 'laugh')],
    outcome: { bond: 5, bond02: 5, bond12: 5, friend: 1 },
  },
  {
    id: 'trio2-concurso-de-bolos', kind: 'festa', title: 'Concurso de bolos', emoji: '🏆', cast: 3, weight: 5, when: (c) => day(c) || evening(c),
    lines: (_c) => [L(0, 'Meu bolo é de pecha com uma pitada de coragem!', 'fire'), L(1, 'Meu bolo é de oran, com cobertura de carinho!', 'heart'), L(2, 'O meu é de ar, porque eu comi tudo antes de apresentar.', 'sweat'), L(0, 'O juiz é o treinador. Escolha, por favor, antes que o bolo acabe!', 'star')],
    outcome: { bond: 3, bond02: 3, bond12: 3 },
    choice: {
      prompt: 'Três bolos, um vencedor. Quem leva o troféu?',
      options: [
        { label: (c) => c.n[0]!, lines: (c) => [L(0, 'Eu sabia que a coragem era o ingrediente secreto!', 'star'), L(1, `${c.n[0]}... ano que vem eu venço.`, 'fire')], outcome: { bond: 2, bond02: 4, bond12: 0, friendBy: [3, 0, 0] } },
        { label: (c) => c.n[1]!, lines: () => [L(1, 'O carinho vence! É a lição do dia!', 'heart'), L(0, 'Foi por uma migalha!', 'sad')], outcome: { bond: 2, bond02: 0, bond12: 4, friendBy: [0, 3, 0] } },
        { label: () => 'Todos vencem!', lines: () => [L(2, 'Todos vencem, inclusive o meu bolo de ar!', 'laugh'), L(0, 'Dividam o prêmio em três!', 'sparkle')], outcome: { bond: 6, bond02: 6, bond12: 6, friendBy: [1, 1, 1] } },
      ],
    },
  },
  {
    id: 'trio2-misterio-do-correio', kind: 'comedia', title: 'O mistério do correio', emoji: '📮', cast: 3, weight: 4, when: (c) => c.env.town >= 5 && day(c),
    lines: (_c) => [L(0, 'Chegou uma carta sem destinatário! Quem será o remetente?', 'question'), L(1, 'Pela letra, é de alguém que tem pressa e muita fome.', 'idea'), L(2, 'O selo está de cabeça para baixo. Ou é um criminoso ou um distraído.', 'idea'), L(0, '(abrem: é a lista de compras do ' + 'treinador)', 'laugh')],
    outcome: { bond: 4, bond02: 4, bond12: 4 },
  },
  {
    id: 'trio2-guarda-noturno', kind: 'comedia', title: 'Guardas da noite', emoji: '🔦', cast: 3, weight: 4, when: (c) => night(c) && c.env.town >= 2,
    lines: (_c) => [L(0, 'Eu vigio a rua, eles vigiam a casa e o outro vigia a mim.', 'fire'), L(1, 'Se eu ouvir um barulho, eu grito "quem vem lá?".', 'idea'), L(2, '(um grilo canta) Quem vem lá?! (o grilo para, constrangido)', 'laugh'), L(0, 'Ronda cumprida: nenhum crime, só um grilo envergonhado.', 'star')],
    outcome: { bond: 5, bond02: 5, bond12: 5 },
  },
  {
    id: 'trio2-festival-lanternas', kind: 'festa', title: 'Festival das lanternas', emoji: '🏮', cast: 3, weight: 5, when: (c) => night(c) && calm(c) && c.env.town >= 3,
    lines: (_c) => [L(0, 'Cada um acende uma lanterna e faz um pedido.', 'sparkle'), L(1, 'O meu pedido é segredo. Mas envolve um bolo enorme.', 'heart'), L(2, 'O meu é pedir mais pedidos. Dá certo?', 'question'), L(0, '(as três lanternas sobem juntas e viram estrelas pequenas)', 'sparkle')],
    outcome: { bond: 7, bond02: 7, bond12: 7, spark: 1, friend: 1 },
  },
  {
    id: 'trio2-cobertor-coletivo', kind: 'amizade', title: 'Cobertor coletivo', emoji: '🛌', cast: 3, weight: 5, when: (c) => (snowy(c) || rainy(c) || night(c)) && c.has('cama', 'sofa', 'rede', 'cama-poke', 'poltrona'),
    lines: (_c) => [L(0, 'Frio é quando três Pokémon e um cobertor viram uma só trouxa.', 'heart'), L(1, 'Ninguém sabe onde começa o meu pé e termina o seu.', 'laugh'), L(2, '(ronca baixinho) Quentinho... quentinho...', 'zzz'), L(0, 'A melhor soneca da semana, a três.', 'sparkle')],
    outcome: { bond: 6, bond02: 6, bond12: 6, spark: 1 },
  },
];
