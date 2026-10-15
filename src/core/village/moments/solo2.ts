import { L, calm, day, evening, heard, is, night, rainy, said, snowy } from './kit';
import type { Template } from './kit';

/** Mais momentos de um Pokémon sozinho: manias, a casa, o tempo, e o que ele ouviu de você nas perguntas. */
export const SOLO2_MOMENTS: readonly Template[] = [
  {
    id: 'solo2-nuvem-forma', kind: 'solo', title: 'Nuvem com formato', emoji: '☁️', cast: 1, weight: 4, when: (c) => day(c) && calm(c) && is(c, 0, 'Sonhador', 'Curioso', 'Calmo'),
    lines: ({ n }) => [L(0, 'Aquela nuvem parece um dragão. Não, um sapato. Não, um dragão de sapato.', 'idea'), L(0, `A outra é a cara do ${n[0]}! Só que com mais fofura.`, 'laugh'), L(0, '(deita na grama e encontra uma para cada pensamento)', 'sparkle')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-eco', kind: 'solo', title: 'Conversa com o eco', emoji: '🗣️', cast: 1, weight: 4, when: (c) => day(c),
    lines: () => [L(0, 'OI! (oi... oi...) Quem é você? (você... você...)', 'question'), L(0, 'Que mal-educado, repete tudo que eu falo!', 'anger'), L(0, 'EU TE ODEIO! (te amo... te amo...) Ué, agora gostei.', 'heart')],
    outcome: {},
  },
  {
    id: 'solo2-banho', kind: 'solo', title: 'Hora do banho', emoji: '🛁', cast: 1, weight: 4, when: (c) => c.has('banheira', 'fonte') && calm(c),
    lines: () => [L(0, 'Água morninha, bolhinhas e uma música na cabeça.', 'note'), L(0, '(canta no chuveiro com uma voz que ninguém pediu)', 'note'), L(0, 'Eu sou o melhor cantor de banheiro da Vila! A acústica ajuda.', 'star')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-soneca', kind: 'solo', title: 'A soneca da tarde', emoji: '😴', cast: 1, weight: 5, when: (c) => c.env.hour >= 13 && c.env.hour < 17 && is(c, 0, 'Calmo', 'Guloso', 'Sonhador'),
    lines: () => [L(0, 'Só uma sonequinha de cinco minutinhos...', 'zzz'), L(0, '(ronca; uma borboleta pousa no nariz dele)', 'zzz'), L(0, 'Ahn? Já é noite? Não... ainda é tarde. Dormi duas horas.', 'shock')],
    outcome: {},
  },
  {
    id: 'solo2-chuva-dancando', kind: 'solo', title: 'Dançando na chuva', emoji: '🌧️', cast: 1, weight: 5, when: (c) => rainy(c) && is(c, 0, 'Brincalhão', 'Sonhador', 'Corajoso'),
    lines: () => [L(0, 'Guarda-chuva é coisa de quem tem medo de molhar!', 'star'), L(0, '(roda, pula, escorrega e levanta com estilo)', 'laugh'), L(0, 'Eu fiz um passo novo: o "escorrego triunfal"!', 'sparkle')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-cobertor', kind: 'solo', title: 'Fortaleza de cobertor', emoji: '🏰', cast: 1, weight: 4, when: (c) => (rainy(c) || snowy(c) || night(c)) && c.has('cama', 'sofa', 'rede', 'cama-poke'),
    lines: () => [L(0, 'Frio lá fora, quentinho aqui dentro. Este é o meu reino.', 'heart'), L(0, '(constrói uma fortaleza de cobertor com três travesseiros e muita dignidade)', 'sparkle'), L(0, 'Ninguém entra sem a senha. A senha é "soneca".', 'zzz')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-colecao-folhas', kind: 'solo', title: 'Álbum de folhas', emoji: '🍂', cast: 1, weight: 4, when: (c) => day(c) && calm(c) && is(c, 0, 'Curioso', 'Calmo', 'Tímido'),
    lines: () => [L(0, 'Esta folha tem sete pontinhas. Esta tem oito. Esta tem... uma lagarta.', 'shock'), L(0, '(devolve a folha à árvore com um pedido de desculpas)', 'sweat'), L(0, 'O álbum está quase completo. Só falta uma folha de ouro.', 'idea')],
    outcome: { items: [['flor', 1]] },
  },
  {
    id: 'solo2-treino-pulo', kind: 'solo', title: 'Pulo em altura', emoji: '🦘', cast: 1, weight: 4, when: (c) => day(c) && is(c, 0, 'Corajoso', 'Brincalhão', 'Mandão'),
    lines: () => [L(0, 'Recorde de hoje: uma pedra! Vou bater: duas pedras!', 'fire'), L(0, '(toma impulso, pula e cai de cara na grama)', 'shock'), L(0, 'Duas pedras de lado. Conta?', 'question')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-sonhos-grandes', kind: 'solo', title: 'Planos para o futuro', emoji: '🗺️', cast: 1, weight: 4, when: (c) => is(c, 0, 'Sonhador', 'Mandão', 'Corajoso'),
    lines: () => [L(0, 'Plano número um: ser o Pokémon mais famoso da Vila.', 'star'), L(0, 'Plano dois: construir uma estátua minha na praça.', 'fire'), L(0, 'Plano três: comer algo. Pode ser logo agora.', 'laugh')],
    outcome: {},
  },
  {
    id: 'solo2-espelho-dagua', kind: 'solo', title: 'O reflexo na água', emoji: '🪞', cast: 1, weight: 4, when: (c) => day(c) && calm(c),
    lines: () => [L(0, 'Tem um bonitão me olhando de dentro da água!', 'star'), L(0, 'Oi, bonitão! (o bonitão cumprimenta de volta, que educado)', 'sparkle'), L(0, 'Ele me copia em tudo. Deve ser meu maior fã.', 'laugh')],
    outcome: {},
  },
  {
    id: 'solo2-barulho-noite', kind: 'solo', title: 'Que barulho foi esse?', emoji: '🔊', cast: 1, weight: 5, when: (c) => night(c) && is(c, 0, 'Tímido', 'Curioso', 'Guloso'),
    lines: () => [L(0, '(um barulho no mato) Quem está aí?', 'shock'), L(0, '(silêncio) ...Eu não estou com medo. Estou só preparado.', 'sweat'), L(0, '(sai um grilo) Ah! Era um grilo! Eu sabia o tempo todo!', 'laugh')],
    outcome: {},
  },
  {
    id: 'solo2-carta-sem-destino', kind: 'solo', title: 'A carta sem destino', emoji: '💌', cast: 1, weight: 4, when: (c) => c.env.town >= 5 && day(c),
    lines: () => [L(0, 'Achei uma carta perto do Correio. Está sem selo e sem nome.', 'question'), L(0, 'Será que eu abro? Não, é feio. Mas e se for para mim?', 'sweat'), L(0, '(lê só a primeira linha: "Obrigado por existir") Ah. É para todos.', 'heart')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-cafe-sozinho', kind: 'solo', title: 'Um cafezinho a sós', emoji: '☕', cast: 1, weight: 4, when: (c) => c.env.town >= 3 && day(c),
    lines: () => [L(0, '(senta no Café da Vila e pede um chá de erva-doce)', 'note'), L(0, 'Aqui ninguém me pergunta nada. É perfeito.', 'sparkle'), L(0, 'Moça do Café, essa torta tem algo a ver comigo? Está olhando para mim.', 'question')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-museu-passeio', kind: 'solo', title: 'Passeio no Museu', emoji: '🏛️', cast: 1, weight: 4, when: (c) => c.env.town >= 8 && day(c) && is(c, 0, 'Curioso', 'Sonhador', 'Calmo'),
    lines: () => [L(0, 'Esta é a vitrine dos móveis. Olha aquela cadeira! Dá para sentar nela?', 'question'), L(0, '(lê a plaquinha: "Não toque") Eu só olho. Com as duas patas.', 'sweat'), L(0, 'Um dia eu vou ser exposto aqui. Se estiver vivo, melhor ainda.', 'star')],
    outcome: { friend: 2 },
  },
  {
    id: 'solo2-lampiao-casa', kind: 'solo', title: 'Acendendo o lampião', emoji: '🏮', cast: 1, weight: 4, when: (c) => c.env.town >= 2 && (c.env.hour >= 18 && c.env.hour < 21),
    lines: () => [L(0, 'É a hora azul. O lampião da rua acende... e o da minha porta também.', 'sparkle'), L(0, 'Todo dia eu fico esperando essa hora. Parece uma cerimônia.', 'heart'), L(0, 'Hoje eu fiz um discurso para o lampião. Ele brilhou mais forte.', 'laugh')],
    outcome: {},
  },
  {
    id: 'solo2-casa-arrumando', kind: 'solo', title: 'Faxina na casa', emoji: '🧹', cast: 1, weight: 5, when: (c) => c.env.town >= 2 && day(c),
    lines: () => [L(0, 'Se eu varrer pra debaixo do tapete, conta como limpar?', 'question'), L(0, '(varre, varre, descobre uma moeda debaixo do tapete)', 'star'), L(0, 'Achei uma moeda! A faxina compensa!', 'laugh')],
    outcome: { coins: 5 },
  },
  {
    id: 'solo2-janela-olhando', kind: 'solo', title: 'Olhando pela janela', emoji: '🪟', cast: 1, weight: 4, when: (c) => c.env.town >= 2 && (rainy(c) || snowy(c)),
    lines: ({ n }) => [L(0, 'Dá pra ver a chuva do meu quarto. É a minha novela preferida.', 'note'), L(0, `${n[0]}, você tem uma vida muito interessante. Cada gota tem uma história.`, 'sparkle'), L(0, '(apoia o queixo na janela e fica uma hora assim)', 'zzz')],
    outcome: {},
  },
  {
    id: 'solo2-novo-bordao', kind: 'solo', title: 'Treinando o bordão', emoji: '🎙️', cast: 1, weight: 5, when: (c) => day(c) || evening(c),
    lines: () => [L(0, 'Preciso de uma frase marcante! Uma que todo mundo repita!', 'idea'), L(0, '"Tá tudo certo!" ...Não. "Eu sou eu!" ...Também não.', 'sweat'), L(0, 'Vou esperar o treinador me perguntar. Os melhores bordões vêm das perguntas.', 'star')],
    outcome: {},
  },
  {
    id: 'solo2-eco-resposta', kind: 'solo', title: 'A resposta que ficou', emoji: '🧠', cast: 1, weight: 9, when: (c) => heard(c),
    lines: (c) => [L(0, `Desde que o treinador me falou "${said(c)}", eu não consigo pensar em outra coisa.`, 'idea'), L(0, `${said(c)}... ${said(c)}... Fica na cabeça como uma música.`, 'note'), L(0, 'Eu vou dormir com essa frase e acordar com ela. Pelo menos é boa.', 'sparkle')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-faz-poema-resposta', kind: 'solo', title: 'Poema da resposta', emoji: '📝', cast: 1, weight: 7, when: (c) => heard(c) && is(c, 0, 'Sonhador', 'Calmo', 'Tímido', 'Curioso'),
    lines: (c) => [L(0, `"${said(c)}, ${said(c)}, tão bonito de falar,"`, 'note'), L(0, '"o dia inteiro eu fico a repetir, sem parar."', 'note'), L(0, 'Eu sei, eu sei: a rima está meio forçada. Mas a emoção é verdadeira.', 'heart')],
    outcome: { friend: 2 },
  },
  {
    id: 'solo2-cozinha-resposta', kind: 'solo', title: 'Receita inventada', emoji: '👩‍🍳', cast: 1, weight: 6, when: (c) => heard(c) && is(c, 0, 'Guloso', 'Curioso', 'Brincalhão'),
    lines: (c) => [L(0, `Hoje vou inventar o prato do dia: "${said(c)} com cobertura de ${said(c)}".`, 'idea'), L(0, '(mistura tudo numa tigela e cheira com cara de crítico)', 'question'), L(0, 'Hmm... não é para qualquer paladar. Mas é para o meu.', 'star')],
    outcome: {},
  },
  {
    id: 'solo2-sonhei-resposta', kind: 'solo', title: 'Sonhei com isso', emoji: '💤', cast: 1, weight: 6, when: (c) => heard(c) && (c.env.hour >= 6 && c.env.hour < 11),
    lines: (c) => [L(0, `Sonhei que o treinador gritava "${said(c)}" e todo mundo dançava.`, 'zzz'), L(0, 'No sonho eu era o chefe da festa. Acordei sem ser.', 'sad'), L(0, 'Vou tentar voltar a dormir para ver se ainda tem bolo.', 'zzz')],
    outcome: {},
  },
  {
    id: 'solo2-inventa-jogo', kind: 'solo', title: 'Jogo de uma pessoa só', emoji: '🎲', cast: 1, weight: 4, when: (c) => day(c) && is(c, 0, 'Brincalhão', 'Curioso', 'Mandão'),
    lines: () => [L(0, 'Regra um: eu sempre começo. Regra dois: eu sempre ganho.', 'star'), L(0, '(joga a pedrinha, corre atrás, corre na frente)', 'fire'), L(0, 'Placar final: eu 10, eu 9. Foi apertado, mas vencemos!', 'laugh')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-roupa-esquisita', kind: 'solo', title: 'Um chapéu de folha', emoji: '🎩', cast: 1, weight: 4, when: (c) => day(c) && calm(c),
    lines: () => [L(0, '(coloca uma folha na cabeça) Hoje eu sou um general.', 'fire'), L(0, 'Soldados! (olha em volta; só tem um bichinho e uma pedra) Bom dia, soldados!', 'star'), L(0, 'O bichinho foi embora. Deserção, no primeiro dia.', 'sad')],
    outcome: {},
  },
  {
    id: 'solo2-acorda-cedo', kind: 'solo', title: 'Madrugador', emoji: '🌅', cast: 1, weight: 5, when: (c) => c.env.hour >= 5 && c.env.hour < 8 && calm(c),
    lines: () => [L(0, '(boceja, abre a janela, vê o sol subir) Bom dia, mundo.', 'sparkle'), L(0, 'A Vila inteira dorme, e eu aqui, com o céu todinho para mim.', 'heart'), L(0, 'Vou fazer alongamento. Ou voltar a dormir. Ainda decido.', 'zzz')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-vagalumes', kind: 'solo', title: 'Caçando vagalumes', emoji: '✨', cast: 1, weight: 5, when: (c) => night(c) && calm(c) && is(c, 0, 'Curioso', 'Brincalhão', 'Sonhador', 'Corajoso'),
    lines: () => [L(0, 'Tem tantos vagalumes que parece uma festa de estrelas!', 'sparkle'), L(0, '(tenta pegar um, o vagalume escapa pelas patas)', 'sweat'), L(0, 'Tudo bem. Não é para pegar. É para olhar.', 'heart')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-cantoria-chuveiro', kind: 'solo', title: 'Sucesso do verão', emoji: '🎶', cast: 1, weight: 4, when: (c) => day(c) && calm(c) && is(c, 0, 'Brincalhão', 'Sonhador', 'Corajoso'),
    lines: () => [L(0, '(cantando) Lá-lá-lá, a vida é um bom lugar!', 'note'), L(0, 'Na minha cabeça isso é uma música da rádio. Na vida real é um miado.', 'sweat'), L(0, 'Mas a plateia (duas pedras e um arbusto) aplaudiu!', 'star')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-medico-imaginario', kind: 'solo', title: 'Consultório do arbusto', emoji: '🩺', cast: 1, weight: 4, when: (c) => day(c) && is(c, 0, 'Curioso', 'Mandão', 'Calmo'),
    lines: () => [L(0, 'Diga "ahh", seu arbusto. Hmm. Está com falta de sol.', 'idea'), L(0, 'Receita: duas horas de luz e um pouquinho de carinho.', 'heart'), L(0, '(o arbusto balança as folhas; o paciente já está melhor)', 'sparkle')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-pescador-sem-peixe', kind: 'solo', title: 'Pescador teimoso', emoji: '🎣', cast: 1, weight: 4, when: (c) => day(c) && calm(c) && is(c, 0, 'Calmo', 'Guloso', 'Corajoso'),
    lines: () => [L(0, 'Estou há três horas esperando um peixe. É uma questão de honra.', 'fire'), L(0, '(finalmente: puxa, puxa, e vem uma bota velha)', 'sad'), L(0, 'Uma bota! Bem... é um começo. Ela tem estilo.', 'laugh')],
    outcome: { items: [['concha', 1]] },
  },
  {
    id: 'solo2-vendedor-de-vento', kind: 'solo', title: 'Vendedor de vento', emoji: '🌬️', cast: 1, weight: 3, when: (c) => day(c) && is(c, 0, 'Brincalhão', 'Mandão'),
    lines: () => [L(0, 'Vento fresquinho! Quem leva um, leva dois! Só hoje!', 'star'), L(0, '(ninguém aparece, mas o vento passa e o dia melhora)', 'sparkle'), L(0, 'Vendi tudo! Para o mundo inteiro. De graça, mas vendi.', 'laugh')],
    outcome: {},
  },
  {
    id: 'solo2-pe-esquerdo', kind: 'solo', title: 'Levantou com o pé esquerdo', emoji: '🦶', cast: 1, weight: 4, when: (c) => c.env.hour < 11 && is(c, 0, 'Mandão', 'Guloso', 'Corajoso'),
    lines: () => [L(0, 'Acordei com o pé errado, o travesseiro errado e a vontade errada.', 'anger'), L(0, '(tropeça numa pedra) Até a pedra está contra mim.', 'sad'), L(0, 'Vou tomar um suco e mudar de vida.', 'idea')],
    outcome: {},
  },
  {
    id: 'solo2-trauma-balde', kind: 'solo', title: 'O balde misterioso', emoji: '🪣', cast: 1, weight: 4, when: (c) => day(c) && is(c, 0, 'Curioso', 'Tímido', 'Brincalhão'),
    lines: () => [L(0, 'Tem um balde aqui, de cabeça para baixo. Por quê?', 'question'), L(0, '(levanta o balde devagar, devagar... não tem nada)', 'sweat'), L(0, 'Nada! Eu fiquei dez minutos de suspense por nada!', 'anger')],
    outcome: {},
  },
  {
    id: 'solo2-promessa-regime', kind: 'solo', title: 'Promessa de segunda', emoji: '📅', cast: 1, weight: 4, when: (c) => c.date.dow === 1 && day(c),
    lines: () => [L(0, 'Segunda-feira! Dia de recomeçar: acordar cedo, treinar, beber água.', 'fire'), L(0, '(acorda, treina uma flexão, deita) Terça é melhor para isso.', 'zzz'), L(0, 'Promessa renovada para a próxima segunda.', 'laugh')],
    outcome: {},
  },
  {
    id: 'solo2-sexta', kind: 'solo', title: 'Sextou!', emoji: '🥳', cast: 1, weight: 5, when: (c) => c.date.dow === 5 && evening(c),
    lines: () => [L(0, 'SEXTOU! Eu aguentei a semana inteira!', 'star'), L(0, '(dança sozinho, uma coreografia de oito passos, três deles com tropeço)', 'note'), L(0, 'No sábado a gente descansa. No domingo a gente se arrepende.', 'laugh')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-domingo-calmo', kind: 'solo', title: 'Domingo sem pressa', emoji: '🛋️', cast: 1, weight: 5, when: (c) => c.date.dow === 0 && day(c),
    lines: () => [L(0, 'Domingo é o dia em que o tempo passa devagarinho.', 'heart'), L(0, '(boceja, estica as patas, não faz absolutamente nada)', 'zzz'), L(0, 'Produtividade zero. Satisfação cem.', 'sparkle')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-aniversario-esquecido', kind: 'solo', title: 'Aniversário de ninguém', emoji: '🎈', cast: 1, weight: 3, when: (c) => day(c) && is(c, 0, 'Brincalhão', 'Guloso', 'Sonhador'),
    lines: () => [L(0, 'Hoje é o aniversário de... de alguém! Tenho certeza!', 'idea'), L(0, '(compra um bolo, sopra uma vela, canta parabéns sozinho)', 'note'), L(0, 'Se não foi o aniversário de ninguém, pelo menos o bolo foi de todos.', 'laugh')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-formiga-amiga', kind: 'solo', title: 'A formiga e o Pokémon', emoji: '🐜', cast: 1, weight: 4, when: (c) => day(c) && calm(c) && is(c, 0, 'Curioso', 'Calmo', 'Tímido'),
    lines: () => [L(0, 'Oi, formiguinha! Você carrega uma folha maior que você!', 'star'), L(0, '(a formiga acena e segue; ele a acompanha por um tempo)', 'heart'), L(0, 'Ela tem mais foco que eu. Preciso de um chefe de formigas.', 'sweat')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-arco-iris', kind: 'solo', title: 'Um arco-íris', emoji: '🌈', cast: 1, weight: 5, when: (c) => c.env.weather === null && c.env.hour >= 8 && c.env.hour < 17 && c.date.d % 3 === 0,
    lines: () => [L(0, 'Olha! Um arco-íris! Dá para ver as sete cores!', 'sparkle'), L(0, '(conta as cores com as patas) Vermelho, laranja, amarelo... azul... ihh, perdi.', 'sweat'), L(0, 'Vou procurar o pote de ouro. Se achar, divido. Talvez.', 'idea')],
    outcome: { coins: 3 },
  },
  {
    id: 'solo2-neve-anjo', kind: 'solo', title: 'Anjo de neve', emoji: '👼', cast: 1, weight: 6, when: (c) => snowy(c) && is(c, 0, 'Brincalhão', 'Sonhador', 'Calmo', 'Curioso'),
    lines: () => [L(0, '(deita na neve e abre e fecha os braços)', 'sparkle'), L(0, 'Olha só! Eu deixei um anjo no chão!', 'star'), L(0, 'Ele tem pezinhos grandes. Tipo eu.', 'laugh')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-sopa-neve', kind: 'solo', title: 'Sopa quentinha', emoji: '🍲', cast: 1, weight: 5, when: (c) => (snowy(c) || rainy(c)) && is(c, 0, 'Guloso', 'Calmo', 'Sonhador'),
    lines: () => [L(0, 'Dia frio pede sopa. Dia de chuva também pede sopa. Todo dia pede sopa.', 'note'), L(0, '(mexe o caldeirão, prova, adiciona mais pimenta, prova de novo)', 'idea'), L(0, 'Perfeito. Só falta alguém para dividir. Mas a sopa não reclama.', 'heart')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-teatro-sombras', kind: 'solo', title: 'Teatro de sombras', emoji: '🎭', cast: 1, weight: 4, when: (c) => night(c) && c.has('luminaria', 'lanterna', 'fogueira', 'tocha'),
    lines: () => [L(0, '(faz uma sombra de pássaro na parede) Era uma vez...', 'idea'), L(0, '(a sombra vira cachorro, vira dragão, vira um dedo grande demais)', 'laugh'), L(0, 'Fim! Palmas, por favor! (silêncio) As sombras aplaudem em silêncio.', 'sparkle')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo2-xicara-cheia', kind: 'solo', title: 'O copo meio cheio', emoji: '🥛', cast: 1, weight: 3, when: (c) => day(c) && is(c, 0, 'Calmo', 'Curioso', 'Sonhador'),
    lines: () => [L(0, 'O copo está meio cheio ou meio vazio? Eu tenho dúvidas filosóficas.', 'question'), L(0, '(bebe tudo) Agora está vazio, e a dúvida morreu.', 'laugh'), L(0, 'A filosofia é importante, mas a sede é maior.', 'idea')],
    outcome: {},
  },
  {
    id: 'solo2-pedido-estrela', kind: 'solo', title: 'Pedido à estrela cadente', emoji: '🌠', cast: 1, weight: 5, when: (c) => night(c) && calm(c) && c.env.hour < 24,
    lines: (c) => [L(0, 'Uma estrela cadente! Rápido, um pedido!', 'star'), L(0, `Eu quero... que o ${c.env.player} nunca vá embora!`, 'heart'), L(0, '(fecha os olhos, sorri, e ainda dá tempo de pedir um lanche)', 'laugh')],
    outcome: { friend: 2 },
    after: () => 'Fiz um pedido a uma estrela cadente. Não conto qual foi. Mas você está nele.',
  },
  {
    id: 'solo2-alongamento', kind: 'solo', title: 'Alongamento matinal', emoji: '🧘', cast: 1, weight: 4, when: (c) => c.env.hour >= 6 && c.env.hour < 10 && is(c, 0, 'Calmo', 'Corajoso', 'Mandão'),
    lines: () => [L(0, 'Inspira... expira... a coluna estala. Normal.', 'idea'), L(0, '(tenta tocar os pés e toca os joelhos) É um bom começo.', 'sweat'), L(0, 'Daqui a um ano eu toco os pés. Ou dois.', 'sparkle')],
    outcome: {},
  },
  {
    id: 'solo2-mochila-vazia', kind: 'solo', title: 'A mochila vazia', emoji: '🎒', cast: 1, weight: 3, when: (c) => day(c) && is(c, 0, 'Curioso', 'Corajoso', 'Brincalhão'),
    lines: () => [L(0, 'Aventura! Eu preciso de mapa, lanterna e... (abre a mochila) nada.', 'shock'), L(0, 'Eu sempre esqueço de colocar coisas nela. Vai ver ela está vazia de propósito.', 'question'), L(0, 'Vou levar a mochila mesmo assim. Fica bonito.', 'star')],
    outcome: { items: [['madeira', 1]] },
  },
  {
    id: 'solo2-ensaio-pedido', kind: 'solo', title: 'Ensaio de pedido', emoji: '🪞', cast: 1, weight: 4, when: (c) => day(c) && is(c, 0, 'Tímido', 'Sonhador') && c.pts(0) >= 30,
    lines: ({ n }) => [L(0, '"Treinador, eu queria te pedir... eu queria... hmm."', 'sweat'), L(0, `(se olha no reflexo) ${n[0]}, você consegue. É só falar. Fala.`, 'fire'), L(0, '"Será que a gente pode comer algo?" Pronto. Missão cumprida, só falta dizer na hora.', 'laugh')],
    outcome: { friend: 1 },
  },
];
