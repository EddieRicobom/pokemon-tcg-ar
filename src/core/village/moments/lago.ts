import { L, calm, coupled, day, evening, friendsNow, is, night, other, rainy, rivals } from './kit';
import type { Template } from './kit';

/** O lago com praia do nordeste (mapa grande): pescaria, castelos de areia, barquinhos, conchas e o pôr do sol na água. */
export const LAGO_MOMENTS: readonly Template[] = [
  {
    id: 'lago-primeiro-mergulho', kind: 'solo', title: 'O primeiro mergulho', emoji: '🌊', cast: 1, weight: 5, when: (c) => day(c) && calm(c),
    lines: () => [L(0, '(olha para o lago, olha para os próprios pés, olha para o lago de novo)', 'question'), L(0, 'Um, dois... dois e meio... dois e três quartos...', 'sweat'), L(0, '(TCHIBUM!) Tá gelada! Tá ótima! Tá gelada!', 'laugh')],
    outcome: { friend: 1 },
  },
  {
    id: 'lago-castelo-areia', kind: 'amizade', title: 'O castelo de areia', emoji: '🏰', cast: 2, weight: 5, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, `${c.n[1]}, vamos fazer o maior castelo de areia da história da Vila!`, 'star'), L(1, 'Eu faço as torres. Você faz o fosso. A gente divide a glória.', 'idea'), L(0, '(três horas depois: um castelo com ponte, bandeira de folha e um quarto para cada um)', 'sparkle'), L(1, 'A onda vai levar. Mas a foto fica.', 'heart')],
    outcome: { bond: 6, spark: 1, items: [['concha', 1]] },
    after: (n, who) => `Eu e ${other(n, who)} fizemos um castelo de areia com ponte levadiça. A onda levou, mas foi bonito enquanto durou.`,
  },
  {
    id: 'lago-onda-castelo', kind: 'drama', title: 'A onda levou o castelo', emoji: '😭', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Meu castelo! Cinco torres! Um jardim de algas! Tudo!', 'sad'), L(1, 'Era um castelo lindo. Eu vi. Eu sou testemunha.', 'sad'), L(0, `${c.n[1]}, você me ajuda a fazer outro? Mais longe da água dessa vez.`, 'question'), L(1, 'Com muralha. E um guarda. Eu sou o guarda.', 'fire')],
    outcome: { bond: 5 },
  },
  {
    id: 'lago-pescaria-silencio', kind: 'amizade', title: 'Pescaria em silêncio', emoji: '🎣', cast: 2, weight: 5, when: (c) => (day(c) || evening(c)) && calm(c),
    lines: (c) => [L(0, '(joga a linha e senta na pedra)', 'zzz'), L(1, '(senta do lado, sem falar nada)', 'zzz'), L(0, `...${c.n[1]}, faz uma hora que a gente não fala nada.`, 'question'), L(1, 'Foi a melhor conversa que eu já tive.', 'heart')],
    outcome: { bond: 6, items: [['peixe', 1]] },
  },
  {
    id: 'lago-peixe-gigante', kind: 'comedia', title: 'O peixe que fugiu', emoji: '🐟', cast: 2, weight: 5,
    lines: (c) => [L(0, 'Eu peguei um peixe DESTE tamanho! (abre os braços até onde dá)', 'shock'), L(1, 'E cadê ele?', 'question'), L(0, 'Fugiu. Mas ele era enorme. E tinha bigode. E me olhou com desprezo.', 'sweat'), L(1, `Claro, ${c.n[0]}. Bigode e desprezo. Anotado.`, 'laugh')],
    outcome: { bond: 3 },
    after: (n, who) => (who === 0 ? 'Um peixe de bigode fugiu de mim no lago. Ninguém acredita. Mas ele existe.' : `${n[0]} jura que viu um peixe de bigode no lago. Eu finjo que acredito.`),
  },
  {
    id: 'lago-pedrinhas', kind: 'rivalidade', title: 'Campeonato de pedrinhas', emoji: '🪨', cast: 2, weight: 5, when: (c) => calm(c),
    lines: (c) => {
      const pulos = 3 + Math.floor(c.rng() * 6);
      c.memo.pulos = pulos;
      return [L(0, 'Quem fizer a pedra quicar mais vezes na água ganha. Valendo!', 'fire'), L(0, '(plic, plic, plic... três vezes)', 'note'), L(1, `(plic, plic, plic, plic... ${pulos + 1} vezes!)`, 'star'), L(0, 'Revanche! Melhor de cinco! Melhor de cinquenta!', 'anger')];
    },
    outcome: { bond: 2, spark: 1, items: [['pedra', 1]] },
  },
  {
    id: 'lago-por-do-sol', kind: 'romance', title: 'O pôr do sol no lago', emoji: '🌅', cast: 2, weight: 5, when: (c) => c.env.hour >= 17 && c.env.hour < 20 && calm(c) && (coupled(c) || friendsNow(c)),
    lines: (c) => [L(0, 'O sol está entrando na água. Parece que vai apagar com um chiado.', 'sparkle'), L(1, 'Se apagar, a gente fica aqui no escuro. Eu não ligo.', 'heart'), L(0, `${c.n[1]}... você também está vendo a água ficar laranja?`, 'question'), L(1, 'Estou vendo você ficar laranja. Também é bonito.', 'heart')],
    outcome: { bond: 6, spark: 4 },
  },
  {
    id: 'lago-conchas', kind: 'solo', title: 'Coleção de conchas', emoji: '🐚', cast: 1, weight: 5, when: (c) => day(c),
    lines: () => [L(0, 'Essa é rosa. Essa é listrada. Essa tem um morador dentro. Desculpa, morador!', 'sweat'), L(0, '(devolve a concha com o morador para a água)', 'heart'), L(0, 'Treinador, achei uma vazia e bonita. É sua.', 'star')],
    outcome: { friend: 1, items: [['concha', 1]] },
  },
  {
    id: 'lago-barquinho-folha', kind: 'amizade', title: 'Barquinhos de folha', emoji: '⛵', cast: 3, weight: 5, when: (c) => calm(c) && day(c),
    lines: (c) => [L(0, 'Cada um faz um barquinho de folha e a gente solta no lago!', 'idea'), L(1, 'O meu tem vela de pétala.', 'sparkle'), L(2, 'O meu tem um bichinho de passageiro. Ele não pediu, mas embarcou.', 'laugh'), L(0, `Ganhou o de ${c.n[2]}! Ou o bichinho. Os dois, talvez.`, 'star')],
    outcome: { bond: 4, bond02: 4, bond12: 4 },
  },
  {
    id: 'lago-chuva-na-agua', kind: 'solo', title: 'Chuva no lago', emoji: '🌧️', cast: 1, weight: 5, when: (c) => rainy(c),
    lines: () => [L(0, 'Cada pingo faz um círculo na água. Milhares de círculos.', 'sparkle'), L(0, 'Parece que o lago está aplaudindo a chuva.', 'note'), L(0, '(fica olhando até ficar encharcado, e nem se importa)', 'heart')],
    outcome: { friend: 1 },
  },
  {
    id: 'lago-luar', kind: 'solo', title: 'A lua no lago', emoji: '🌕', cast: 1, weight: 5, when: (c) => night(c) && calm(c),
    lines: () => [L(0, 'Tem duas luas hoje. Uma no céu, uma na água.', 'sparkle'), L(0, '(estica a pata para a lua da água; ela se desmancha em ondinhas)', 'shock'), L(0, 'Desculpa, lua. Volta. Eu prometo só olhar.', 'sad')],
    outcome: { friend: 1 },
  },
  {
    id: 'lago-sapo-cantor', kind: 'comedia', title: 'O coral da beira do lago', emoji: '🐸', cast: 2, weight: 4, when: (c) => evening(c) || night(c),
    lines: (c) => [L(0, '(croac, croac) Que barulho é esse?', 'question'), L(1, 'É o coral da beira do lago. Ensaiam toda noite.', 'note'), L(0, `${c.n[1]}, eles estão desafinados.`, 'sweat'), L(1, 'Não fala alto. Eles têm um solista muito sensível.', 'laugh')],
    outcome: { bond: 4 },
  },
  {
    id: 'lago-protetor', kind: 'comedia', title: 'Protetor solar', emoji: '🧴', cast: 2, weight: 4, when: (c) => day(c) && c.env.hour >= 11 && c.env.hour < 16 && calm(c),
    lines: (c) => [L(0, `${c.n[1]}, passa protetor nas minhas costas? Eu não alcanço.`, 'question'), L(1, '(passa protetor desenhando uma carinha feliz)', 'laugh'), L(0, '(duas horas depois: a carinha feliz ficou branquinha no meio do bronzeado)', 'shock'), L(1, 'Agora você sorri pelas costas. É um talento.', 'star')],
    outcome: { bond: 3, spark: 1 },
  },
  {
    id: 'lago-salva-vidas', kind: 'amizade', title: 'O salva-vidas', emoji: '🛟', cast: 2, weight: 4, when: (c) => day(c) && is(c, 0, 'Corajoso', 'Mandão'),
    lines: (c) => [L(0, 'Eu sou o salva-vidas oficial da praia. Ninguém se afoga no meu turno.', 'fire'), L(1, 'Mas a água chega no seu joelho.', 'question'), L(0, 'Ninguém se afoga, então. Turno perfeito!', 'star'), L(1, `Tá bom, ${c.n[0]}. Eu me sinto muito protegido.`, 'heart')],
    outcome: { bond: 4, friend: 1 },
  },
  {
    id: 'lago-desafio-nado', kind: 'rivalidade', title: 'Corrida até a pedra', emoji: '🏊', cast: 2, weight: 5, when: (c) => day(c) && calm(c),
    lines: (c) => {
      const ganhou = c.rng() < 0.5 ? 0 : 1;
      c.memo.ganhou = ganhou;
      return [L(0, 'Quem chegar primeiro na pedra do meio do lago ganha!', 'fire'), L(1, 'Valendo... já!', 'fire'), L(ganhou, '(chega primeiro, cospe água e faz pose)', 'star'), L(ganhou === 0 ? 1 : 0, 'Eu deixei. Era estratégia. Amanhã eu ganho.', 'anger')];
    },
    outcome: { bond: 2, spark: 1 },
  },
  {
    id: 'lago-mergulho-tesouro', kind: 'amizade', title: 'Tesouro no fundo', emoji: '💎', cast: 2, weight: 4, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, '(volta à superfície com algo brilhando na boca)', 'shock'), L(1, 'O que é isso? Um tesouro? Um peixe dourado? Uma tampinha?', 'question'), L(0, 'Uma pérola! Estava numa ostra com cara de quem não ia sentir falta.', 'sparkle'), L(1, `${c.n[0]}, dá de presente para o treinador. Ele vai adorar.`, 'heart')],
    outcome: { bond: 4, items: [['perola', 1]] },
  },
  {
    id: 'lago-bota-velha', kind: 'comedia', title: 'Pescou uma bota', emoji: '🥾', cast: 1, weight: 4,
    lines: () => [L(0, 'Puxou! Puxou! É pesado! É enorme! É...', 'shock'), L(0, '...uma bota. Uma bota velha. Só o pé esquerdo.', 'sweat'), L(0, 'Se alguém da Vila perdeu o pé esquerdo de uma bota, ele está comigo.', 'laugh')],
    outcome: { items: [['bota', 1]] },
  },
  {
    id: 'lago-algas', kind: 'solo', title: 'Cabelo de alga', emoji: '🌿', cast: 1, weight: 4, when: (c) => day(c),
    lines: () => [L(0, '(sai do lago com um tufo de alga na cabeça)', 'laugh'), L(0, 'É a última moda. Peruca natural. Cheira a lago.', 'star'), L(0, 'Ninguém vai rir. (todo mundo ri)', 'sweat')],
    outcome: { items: [['alga', 1]] },
  },
  {
    id: 'lago-estrela-do-mar', kind: 'solo', title: 'A estrela da areia', emoji: '⭐', cast: 1, weight: 4, when: (c) => day(c),
    lines: () => [L(0, 'Achei uma estrela caída na areia! Do céu!', 'shock'), L(0, '(é uma estrela-do-mar, mas ninguém tem coragem de contar)', 'sweat'), L(0, 'Vou guardar. Se cair outra, a gente faz uma constelação.', 'sparkle')],
    outcome: { items: [['estrela', 1]] },
  },
  {
    id: 'lago-piquenique-praia', kind: 'festa', title: 'Piquenique na praia', emoji: '🧺', cast: 3, weight: 5, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, 'Toalha estendida, sanduíche cortado em triângulo, suco gelado. Piquenique oficial!', 'star'), L(1, 'Tem areia no meu sanduíche. Mas é areia de praia, então é gourmet.', 'laugh'), L(2, `${c.n[0]}, quem trouxe a melancia?`, 'question'), L(0, 'Ninguém. Mas o treinador planta. Todo mundo olha para a horta...', 'idea')],
    outcome: { bond: 4, bond02: 4, bond12: 4, friend: 1 },
  },
  {
    id: 'lago-cochilo-sol', kind: 'solo', title: 'Cochilo ao sol', emoji: '😴', cast: 1, weight: 5, when: (c) => day(c) && calm(c) && is(c, 0, 'Calmo', 'Sonhador', 'Guloso'),
    lines: () => [L(0, '(deita na areia quentinha e fecha os olhos)', 'zzz'), L(0, 'Só cinco minutinhos...', 'zzz'), L(0, '(acorda duas horas depois com marca da toalha na bochecha)', 'laugh')],
    outcome: { friend: 1 },
  },
  {
    id: 'lago-mensagem-garrafa', kind: 'amizade', title: 'Mensagem na garrafa', emoji: '🍾', cast: 2, weight: 4,
    lines: (c) => [L(0, `${c.n[1]}, achei uma garrafa com um papel dentro!`, 'shock'), L(1, 'Lê! Lê! É um mapa do tesouro? Um pedido de socorro? Uma receita?', 'question'), L(0, '"Quem achar esta garrafa é meu melhor amigo." Assinado: ninguém.', 'sparkle'), L(1, 'Então somos melhores amigos de ninguém. E um do outro.', 'heart')],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'lago-ilha-imaginaria', kind: 'amizade', title: 'A ilha do meio do lago', emoji: '🏝️', cast: 3, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'E se tivesse uma ilha no meio do lago? A gente morava lá.', 'idea'), L(1, 'Eu seria o rei. Rei da ilha.', 'fire'), L(2, `E eu, a ponte. Para ${c.n[1]} não ficar sozinho no trono.`, 'heart'), L(0, 'Ilha, rei e ponte. O reino mais pequeno do mundo.', 'laugh')],
    outcome: { bond: 4, bond02: 3, bond12: 5 },
  },
  {
    id: 'lago-medo-agua', kind: 'drama', title: 'Medo de água funda', emoji: '😰', cast: 2, weight: 5, when: (c) => day(c) && is(c, 0, 'Tímido', 'Calmo', 'Sonhador'),
    lines: (c) => [L(0, 'Eu fico na beira. A água funda tem coisas que eu não vejo.', 'sad'), L(1, 'Quer que eu vá junto? Bem devagar, só até o joelho?', 'heart'), L(0, '(dá um passo, dois, três... e para)', 'sweat'), L(1, `Já é muito, ${c.n[0]}. Amanhã a gente vai até o umbigo.`, 'star')],
    outcome: { bond: 7, friend: 1 },
    after: (n, who) => (who === 0 ? `${other(n, who)} entrou no lago comigo, devagarinho. Fui até o joelho! Amanhã, o umbigo.` : `Ajudei ${n[0]} a perder o medo do lago. Um passo de cada vez.`),
  },
  {
    id: 'lago-areia-quente', kind: 'comedia', title: 'Areia quente', emoji: '🔥', cast: 1, weight: 4, when: (c) => day(c) && c.env.hour >= 11 && c.env.hour < 16 && calm(c),
    lines: () => [L(0, '(pisa na areia ao meio-dia) AI! AI! AI! AI!', 'fire'), L(0, '(atravessa a praia pulando como pipoca até a água)', 'laugh'), L(0, 'Foi a corrida mais rápida da minha vida. Recorde mundial de pé queimado.', 'star')],
    outcome: {},
  },
  {
    id: 'lago-noite-estrelas', kind: 'romance', title: 'Contando estrelas na areia', emoji: '✨', cast: 2, weight: 4, when: (c) => night(c) && calm(c) && (coupled(c) || (c.rel?.spark ?? 0) >= 40),
    lines: (c) => [L(0, 'Deitados na areia, olhando para cima. Quantas você acha que tem?', 'question'), L(1, 'Umas mil. Não, dez mil. Mais do que dá para contar numa noite.', 'sparkle'), L(0, `Então a gente volta amanhã, ${c.n[1]}. E depois. Até acabar.`, 'heart'), L(1, 'Isso vai levar a vida inteira. Perfeito.', 'heart')],
    outcome: { bond: 5, spark: 5 },
  },
  {
    id: 'lago-briga-toalha', kind: 'rivalidade', title: 'A melhor sombra', emoji: '⛱️', cast: 2, weight: 4, when: (c) => day(c) && calm(c) && (rivals(c) || is(c, 0, 'Mandão')),
    lines: (c) => [L(0, 'Essa sombra é minha. Eu cheguei primeiro.', 'anger'), L(1, 'Minha toalha estava aqui antes de você nascer.', 'anger'), L(0, '(os dois puxam a toalha de um lado e do outro)', 'fire'), L(1, `...cabe os dois, ${c.n[0]}. Se você encolher.`, 'sweat')],
    outcome: { bond: -2, spark: 1 },
  },
  {
    id: 'lago-pescaria-escolha', kind: 'amizade', title: 'O peixe dourado', emoji: '🐠', cast: 2, weight: 4, when: (c) => calm(c),
    lines: (c) => [L(0, 'Peguei! É um peixe dourado! Brilha que nem moeda!', 'shock'), L(1, 'Ele está olhando para você com uns olhos tão tristes...', 'sad'), L(0, `${c.n[1]}, treinador... o que a gente faz?`, 'question')],
    choice: {
      prompt: 'O peixe dourado olha para você.',
      options: [
        { label: () => 'Soltar no lago', lines: (c) => [L(0, '(solta o peixe, que dá uma cambalhota e some brilhando)', 'sparkle'), L(1, `Você fez bem, ${c.n[0]}. Dizem que dá sorte.`, 'heart')], outcome: { bond: 6, friend: 2 } },
        { label: () => 'Guardar', lines: () => [L(0, 'Vou cuidar bem dele. Juro que faço um aquário bonito.', 'star'), L(1, 'Com pedrinhas e um castelinho, tá?', 'idea')], outcome: { bond: 2, items: [['dourado', 1]] } },
      ],
    },
    outcome: { bond: 3 },
  },
  {
    id: 'lago-guarda-chuva-praia', kind: 'comedia', title: 'Praia na chuva', emoji: '☔', cast: 2, weight: 4, when: (c) => rainy(c),
    lines: (c) => [L(0, 'Eu vim à praia e choveu. Mas eu vim. Então eu fico.', 'anger'), L(1, `${c.n[0]}, você está de toalha, boia e guarda-chuva ao mesmo tempo.`, 'question'), L(0, 'Preparado para tudo. Menos para o vento.', 'sweat'), L(1, '(o vento leva o guarda-chuva para o meio do lago)', 'laugh')],
    outcome: { bond: 3 },
  },
  {
    id: 'lago-pegadas', kind: 'solo', title: 'Pegadas na areia', emoji: '👣', cast: 1, weight: 4, when: (c) => day(c) || evening(c),
    lines: () => [L(0, '(anda pela beira e olha para trás: uma fileira de pegadas)', 'sparkle'), L(0, 'A onda apaga, eu faço de novo. A onda apaga, eu faço de novo.', 'laugh'), L(0, 'Quem vai cansar primeiro? Eu acho que a onda.', 'fire')],
    outcome: {},
  },
  {
    id: 'lago-mergulhador', kind: 'solo', title: 'Prender a respiração', emoji: '🫧', cast: 1, weight: 4, when: (c) => day(c) && calm(c) && is(c, 0, 'Corajoso', 'Curioso', 'Brincalhão'),
    lines: () => [L(0, 'Vou prender a respiração por um minuto inteiro. Contem!', 'fire'), L(0, '(mergulha... três segundos depois sobe tossindo)', 'sweat'), L(0, 'Era um minuto de Pokémon. É diferente.', 'laugh')],
    outcome: {},
  },
  {
    id: 'lago-cais-pes-agua', kind: 'amizade', title: 'Pés na água', emoji: '🦶', cast: 2, weight: 5, when: (c) => (day(c) || evening(c)) && calm(c),
    lines: (c) => [L(0, '(senta na beira com os pés na água)', 'heart'), L(1, '(senta do lado e balança os pés também)', 'heart'), L(0, `Sabe, ${c.n[1]}, eu acho que esse é o melhor lugar da Vila.`, 'sparkle'), L(1, 'É o melhor lugar porque você está nele.', 'heart')],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'lago-trio-guerra-agua', kind: 'festa', title: 'Guerra de água', emoji: '💦', cast: 3, weight: 5, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, `(joga água em ${c.n[1]}) Começou!`, 'laugh'), L(1, 'Ah, é assim? Toma! E toma!', 'laugh'), L(2, 'Eu estava só passando! Eu estou de roupa seca! Eu estava!', 'shock'), L(0, 'Agora ninguém está seco. Empate técnico!', 'star')],
    outcome: { bond: 3, bond02: 3, bond12: 3, friend: 1 },
  },
  {
    id: 'lago-reflexo', kind: 'solo', title: 'O reflexo', emoji: '🪞', cast: 1, weight: 4, when: (c) => calm(c) && is(c, 0, 'Sonhador', 'Curioso', 'Tímido'),
    lines: () => [L(0, '(olha o próprio reflexo na água parada)', 'question'), L(0, 'Oi. Você também está com fome? Também gosta do treinador?', 'heart'), L(0, 'A gente tem muito em comum.', 'laugh')],
    outcome: {},
  },
  {
    id: 'lago-pato-amigo', kind: 'solo', title: 'Amizade com um pato', emoji: '🦆', cast: 1, weight: 4, when: (c) => day(c),
    lines: () => [L(0, '(um pato selvagem nada até a beira e encara)', 'question'), L(0, 'Oi, pato. Eu sou da Vila. Você é do lago. A gente pode ser amigo.', 'heart'), L(0, '(o pato faz quac e vai embora) Ele vai pensar.', 'sweat')],
    outcome: { friend: 1 },
  },
  {
    id: 'lago-sol-nascendo', kind: 'solo', title: 'O sol nascendo na água', emoji: '🌄', cast: 1, weight: 4, when: (c) => c.env.hour >= 5 && c.env.hour < 8 && calm(c),
    lines: () => [L(0, 'Acordei cedo só para ver. Valeu cada bocejo.', 'zzz'), L(0, 'O lago fica dourado, depois rosa, depois azul de novo.', 'sparkle'), L(0, 'Amanhã eu acordo cedo de novo. (não acorda)', 'laugh')],
    outcome: { friend: 1 },
  },
  {
    id: 'lago-desenho-areia', kind: 'amizade', title: 'Um desenho na areia', emoji: '✏️', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, '(desenha com um graveto na areia molhada)', 'idea'), L(1, 'O que é isso? Um coração? Uma batata?', 'question'), L(0, `É você, ${c.n[1]}.`, 'heart'), L(1, 'Sou eu?! (olha bem) ...eu sou lindo. E meio batata.', 'laugh')],
    outcome: { bond: 5, spark: 2 },
  },
  {
    id: 'lago-casal-barco', kind: 'romance', title: 'Passeio de barquinho', emoji: '🚣', cast: 2, weight: 4, when: (c) => coupled(c) && calm(c) && (day(c) || evening(c)),
    lines: (c) => [L(0, 'Eu remo, você aproveita a vista.', 'heart'), L(1, 'A vista é você remando torto.', 'laugh'), L(0, '(o barquinho gira em círculos no meio do lago)', 'sweat'), L(1, `Não tem pressa, ${c.n[0]}. Rodar com você também é passear.`, 'heart')],
    outcome: { bond: 4, spark: 4 },
  },
  {
    id: 'lago-sorvete-derretendo', kind: 'comedia', title: 'Sorvete na praia', emoji: '🍦', cast: 2, weight: 4, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, 'Comprei dois sorvetes! Um para mim e um para você!', 'star'), L(1, `${c.n[0]}... o seu já derreteu inteiro na sua mão.`, 'question'), L(0, '(lambe a mão) Ainda é sorvete. Tecnicamente.', 'laugh'), L(1, 'Toma, divide o meu. Rápido, antes que esse vire suco também.', 'heart')],
    outcome: { bond: 5 },
  },
  {
    id: 'lago-caranguejo', kind: 'comedia', title: 'O caranguejo mandão', emoji: '🦀', cast: 1, weight: 4, when: (c) => day(c),
    lines: () => [L(0, '(um caranguejo aparece e levanta as garras)', 'shock'), L(0, 'Calma, senhor caranguejo. A praia é grande. Cabe nós dois.', 'sweat'), L(0, '(o caranguejo anda de lado e vai embora, ofendido)', 'laugh')],
    outcome: {},
  },
  {
    id: 'lago-neve-praia', kind: 'solo', title: 'Neve na praia', emoji: '⛄', cast: 1, weight: 4, when: (c) => c.env.weather === 'neve',
    lines: () => [L(0, 'Areia com neve por cima. Parece bolo com açúcar.', 'sparkle'), L(0, 'Vou fazer um boneco de neve com chapéu de concha.', 'idea'), L(0, '(o boneco fica meio areia, meio neve, meio esquisito, todo lindo)', 'heart')],
    outcome: { items: [['concha', 1]] },
  },
  {
    id: 'lago-trio-competicao-pesca', kind: 'rivalidade', title: 'Torneio de pesca', emoji: '🏆', cast: 3, weight: 4, when: (c) => calm(c),
    lines: (c) => {
      const v = Math.floor(c.rng() * 3);
      c.memo.v = v;
      return [L(0, 'Torneio de pesca! Quem pescar mais em uma hora vence!', 'fire'), L(1, 'Eu tenho a isca secreta. Biscoito.', 'idea'), L(2, 'Eu tenho paciência. É melhor que biscoito.', 'zzz'), L(v, '(levanta o balde cheio) Campeão da beira do lago!', 'star')];
    },
    outcome: { bond: 2, bond02: 2, bond12: 2, items: [['peixe', 2]] },
  },
  {
    id: 'lago-mar-de-ideias', kind: 'solo', title: 'Ideias na beira', emoji: '💭', cast: 1, weight: 4, when: (c) => is(c, 0, 'Sonhador', 'Curioso'),
    lines: () => [L(0, 'Será que do outro lado do lago tem outra Vila?', 'question'), L(0, 'Com outro treinador, outros Pokémon, outro eu?', 'idea'), L(0, 'Se tiver, espero que ele também esteja com fome. A gente se entenderia.', 'laugh')],
    outcome: {},
  },
  {
    id: 'lago-isca-improvisada', kind: 'comedia', title: 'A isca perfeita', emoji: '🪱', cast: 2, weight: 4, when: (c) => (day(c) || evening(c)) && calm(c),
    lines: (c) => [L(0, `${c.n[1]}, achei a isca perfeita.`, 'star'), L(1, 'Isso é um biscoito.', 'question'), L(0, 'Exatamente. O peixe também merece um lanche.', 'idea'), L(1, '(o anzol volta com o biscoito intacto) O peixe tem mais juízo que nós.', 'laugh')],
    outcome: { bond: 4 },
  },
  {
    id: 'lago-balde-vazio', kind: 'amizade', title: 'O balde vazio', emoji: '🪣', cast: 2, weight: 4, when: (c) => day(c) && calm(c),
    lines: () => [L(0, 'Passei a manhã pescando. Veja o meu balde!', 'star'), L(1, '(olha dentro) Tem uma folha.', 'question'), L(0, 'Uma folha aquática. É uma espécie rara.', 'sweat'), L(1, 'Então vamos comemorar com um almoço que não veio do lago.', 'laugh')],
    outcome: { bond: 5 },
  },
  {
    id: 'lago-gaivotas', kind: 'drama', title: 'Roubaram o lanche', emoji: '🥪', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Meu sanduíche! Um pássaro levou meu sanduíche!', 'shock'), L(1, 'Ele foi para aquela árvore. Está comendo olhando para você.', 'sweat'), L(0, 'Que audácia. Que ousadia. Que fome.', 'anger'), L(1, `Toma metade do meu, ${c.n[0]}. E vamos comer de costas para a árvore.`, 'heart')],
    outcome: { bond: 5 },
  },
];
