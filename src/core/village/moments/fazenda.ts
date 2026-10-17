import { L, calm, coupled, day, evening, friendsNow, is, night, other, rainy, rivals, snowy } from './kit';
import type { Template } from './kit';

/** A fazenda do leste (mapa grande): canteiros arados, o celeiro vermelho, a cerca, a colheita e os bichos da roça. */
export const FAZENDA_MOMENTS: readonly Template[] = [
  {
    id: 'faz-primeira-enxada', kind: 'solo', title: 'A primeira enxada', emoji: '🧑‍🌾', cast: 1, weight: 5, when: (c) => day(c),
    lines: () => [L(0, '(segura a enxada ao contrário e cava com o cabo)', 'question'), L(0, 'Isso é mais difícil do que parece. A terra está ganhando.', 'sweat'), L(0, '(vira a enxada) Ah. AH. Agora sim. Eu sou um fazendeiro!', 'star')],
    outcome: { friend: 1 },
  },
  {
    id: 'faz-celeiro-explorar', kind: 'amizade', title: 'Dentro do celeiro', emoji: '🛖', cast: 2, weight: 5, when: (c) => day(c),
    lines: (c) => [L(0, `${c.n[1]}, você já entrou no celeiro vermelho?`, 'question'), L(1, 'Uma vez. Tem feno, ferramenta e um cheiro de domingo.', 'sparkle'), L(0, 'Cheiro de domingo?', 'question'), L(1, 'Cheiro de quem pode dormir até tarde em cima do feno. Vem!', 'heart')],
    outcome: { bond: 5, spark: 1 },
  },
  {
    id: 'faz-feno-cochilo', kind: 'solo', title: 'Cochilo no feno', emoji: '🌾', cast: 1, weight: 5, when: (c) => day(c) && is(c, 0, 'Calmo', 'Guloso', 'Sonhador'),
    lines: () => [L(0, '(se joga num monte de feno no celeiro)', 'zzz'), L(0, 'É macio. É quentinho. Pinica só um pouquinho.', 'zzz'), L(0, '(acorda com feno no cabelo, na orelha e dentro do bolso)', 'laugh')],
    outcome: { friend: 1 },
  },
  {
    id: 'faz-espantalho', kind: 'comedia', title: 'O espantalho', emoji: '🪆', cast: 2, weight: 5, when: (c) => day(c),
    lines: (c) => [L(0, 'Vamos fazer um espantalho para os canteiros! Chapéu, palha e cara de bravo.', 'idea'), L(1, '(desenha a cara) Ficou... sorrindo. Muito. Demais.', 'laugh'), L(0, 'Esse espantalho não espanta nada. Ele dá boas-vindas.', 'sweat'), L(1, `Os passarinhos vão gostar dele, ${c.n[0]}. Eu gostei.`, 'heart')],
    outcome: { bond: 5 },
    after: (n, who) => `Eu e ${other(n, who)} fizemos um espantalho que sorri demais. Os passarinhos agora visitam ele.`,
  },
  {
    id: 'faz-colheita-juntos', kind: 'amizade', title: 'Colheita em dupla', emoji: '🧺', cast: 2, weight: 5, when: (c) => day(c) && c.env.ripeCrops > 0,
    lines: (c) => [L(0, `A horta está pronta! ${c.n[1]}, pega a cesta!`, 'star'), L(1, 'Uma para a cesta, uma para mim. Uma para a cesta, uma para mim.', 'laugh'), L(0, 'A cesta está vazia e você está redondo.', 'question'), L(1, 'É uma colheita muito pessoal.', 'sweat')],
    outcome: { bond: 5, friend: 1 },
  },
  {
    id: 'faz-rega-chuva', kind: 'solo', title: 'A chuva regou por mim', emoji: '🌧️', cast: 1, weight: 5, when: (c) => rainy(c) && c.env.crops > 0,
    lines: () => [L(0, '(olha para os canteiros encharcados)', 'sparkle'), L(0, 'Eu ia regar, mas o céu chegou antes. Obrigado, céu.', 'heart'), L(0, 'Agora vou voltar para dentro e ficar seco. Divisão de tarefas.', 'laugh')],
    outcome: { water: true },
  },
  {
    id: 'faz-abobora-gigante', kind: 'comedia', title: 'A abóbora gigante', emoji: '🎃', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, `${c.n[1]}, eu vou plantar uma abóbora do tamanho do celeiro.`, 'fire'), L(1, 'E como a gente vai colher?', 'question'), L(0, 'Rolando. Até a praça. A Vila inteira come.', 'idea'), L(1, 'Vou começar a treinar para empurrar abóbora.', 'laugh')],
    outcome: { bond: 4, items: [['sem-abobora', 1]] },
  },
  {
    id: 'faz-cerca-pular', kind: 'rivalidade', title: 'Quem pula a cerca', emoji: '🤸', cast: 2, weight: 4, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, 'Aposto que pulo essa cerca sem encostar!', 'fire'), L(1, 'Aposto que não. Valendo uma torta.', 'fire'), L(0, '(pula... encosta... cai do outro lado num canteiro de cenoura)', 'sweat'), L(1, `Eu ganhei a torta. Você ganhou uma cenoura no nariz, ${c.n[0]}.`, 'laugh')],
    outcome: { bond: 2, spark: 1 },
  },
  {
    id: 'faz-galinha-fugitiva', kind: 'comedia', title: 'A galinha fugitiva', emoji: '🐔', cast: 3, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Tem uma galinha correndo solta pela fazenda!', 'shock'), L(1, 'Pega! Pega! Por ali! Não, por aqui!', 'sweat'), L(2, '(a galinha para, olha para os três e entra calmamente no celeiro)', 'question'), L(0, `${c.n[2]}... ela nunca fugiu. Ela só estava passeando.`, 'laugh')],
    outcome: { bond: 3, bond02: 3, bond12: 3 },
  },
  {
    id: 'faz-milharal-perdido', kind: 'drama', title: 'Perdido no milharal', emoji: '🌽', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, `${c.n[1]}? Cadê você? O milho está mais alto que eu!`, 'sad'), L(1, 'Estou aqui! Segue a minha voz! Aqui! Não, aqui!', 'sweat'), L(0, '(os dois dão a volta no canteiro três vezes e se trombam)', 'shock'), L(1, 'Achei você. O milharal tem dois metros quadrados, mas foi uma aventura.', 'heart')],
    outcome: { bond: 6 },
  },
  {
    id: 'faz-semente-misteriosa', kind: 'solo', title: 'A semente misteriosa', emoji: '🌱', cast: 1, weight: 4, when: (c) => day(c) && is(c, 0, 'Curioso', 'Sonhador'),
    lines: () => [L(0, 'Achei uma semente no bolso. Não sei de quê. Vou plantar.', 'idea'), L(0, 'Pode ser uma flor. Pode ser uma árvore. Pode ser um pé de biscoito.', 'sparkle'), L(0, '(rega com muito cuidado e espera, olhando, sem piscar)', 'zzz')],
    outcome: { items: [['sem-girassol', 1]] },
  },
  {
    id: 'faz-girassois', kind: 'solo', title: 'Os girassóis', emoji: '🌻', cast: 1, weight: 4, when: (c) => day(c) && calm(c),
    lines: () => [L(0, 'Os girassóis viram para o sol. O dia inteiro. Sem cansar.', 'sparkle'), L(0, '(vira para o sol também, de olhos fechados)', 'heart'), L(0, 'Agora eu entendo. É gostoso ser girassol.', 'star')],
    outcome: { friend: 1 },
  },
  {
    id: 'faz-trio-mutirao', kind: 'festa', title: 'Mutirão na fazenda', emoji: '🤝', cast: 3, weight: 5, when: (c) => day(c),
    lines: (c) => [L(0, 'Mutirão! Um capina, um rega e um planta!', 'star'), L(1, 'Eu capino!', 'fire'), L(2, 'Eu rego! (rega o colega sem querer)', 'sweat'), L(0, `Pronto: os canteiros estão lindos e ${c.n[1]} está regado.`, 'laugh')],
    outcome: { bond: 4, bond02: 4, bond12: 4, water: true, friend: 1 },
  },
  {
    id: 'faz-minhoca', kind: 'comedia', title: 'A minhoca', emoji: '🪱', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, `AAAH! ${c.n[1]}, tem uma coisa mexendo na terra!`, 'shock'), L(1, 'É uma minhoca. Ela é do bem. Ela ajuda a horta.', 'idea'), L(0, '(olha a minhoca, a minhoca olha de volta, sem olhos)', 'question'), L(0, 'Tá bom. Bom trabalho, minhoca. Continue.', 'heart')],
    outcome: { bond: 3 },
  },
  {
    id: 'faz-trator-imaginario', kind: 'comedia', title: 'O trator imaginário', emoji: '🚜', cast: 1, weight: 4, when: (c) => day(c) && is(c, 0, 'Brincalhão', 'Corajoso'),
    lines: () => [L(0, 'VRUUUM! Saiam da frente! Trator passando!', 'fire'), L(0, '(dirige um trator invisível em volta dos canteiros)', 'laugh'), L(0, '(estaciona o trator invisível com cuidado) Ninguém encosta nele.', 'star')],
    outcome: {},
  },
  {
    id: 'faz-por-do-sol-celeiro', kind: 'romance', title: 'O pôr do sol no celeiro', emoji: '🌇', cast: 2, weight: 4, when: (c) => c.env.hour >= 17 && c.env.hour < 20 && calm(c) && (coupled(c) || friendsNow(c)),
    lines: (c) => [L(0, '(sentados na cerca, olhando o sol descer atrás do celeiro)', 'heart'), L(1, 'O celeiro fica mais vermelho ainda nessa hora.', 'sparkle'), L(0, `E você fica mais bonito, ${c.n[1]}.`, 'heart'), L(1, '(fica mais vermelho que o celeiro)', 'heart')],
    outcome: { bond: 5, spark: 4 },
  },
  {
    id: 'faz-praga', kind: 'drama', title: 'Bichinhos na horta', emoji: '🐛', cast: 2, weight: 4, when: (c) => day(c) && c.env.crops > 0,
    lines: (c) => [L(0, 'Tem bichinhos comendo as folhas da horta!', 'shock'), L(1, 'Não briga com eles. Eles também estão com fome.', 'sad'), L(0, `E o que a gente faz, ${c.n[1]}?`, 'question')],
    choice: {
      prompt: 'Os bichinhos estão nas folhas.',
      options: [
        { label: () => 'Levar para o bosque', lines: (c) => [L(0, '(leva os bichinhos, um por um, numa folha, até o bosque)', 'heart'), L(1, `Eles vão gostar mais de lá. ${c.n[0]}, você tem um coração enorme.`, 'sparkle')], outcome: { bond: 6, friend: 2 } },
        { label: () => 'Plantar flores para atrair passarinhos', lines: () => [L(0, 'Passarinho come bichinho, bichinho foge, horta fica feliz!', 'idea'), L(1, 'É um plano com flores. Eu gosto de planos com flores.', 'star')], outcome: { bond: 4, items: [['flor', 1]] } },
      ],
    },
    outcome: { bond: 3 },
  },
  {
    id: 'faz-cenoura-teimosa', kind: 'comedia', title: 'A cenoura teimosa', emoji: '🥕', cast: 2, weight: 4,
    lines: (c) => [L(0, '(puxa uma cenoura que não sai) Ela está segurando lá de baixo!', 'anger'), L(1, `Deixa comigo. (os dois puxam juntos)`, 'fire'), L(0, '(a cenoura sai de uma vez e os dois caem sentados)', 'shock'), L(1, `${c.n[0]}... ela era deste tamanho? Do tamanho de um dedo?`, 'laugh')],
    outcome: { bond: 4 },
  },
  {
    id: 'faz-galo-acorda', kind: 'comedia', title: 'O galo da madrugada', emoji: '🐓', cast: 1, weight: 4, when: (c) => c.env.hour >= 4 && c.env.hour < 7,
    lines: () => [L(0, '(cocoricó!) Ainda está escuro, galo!', 'anger'), L(0, '(cocoricó!) Você está adiantado! O sol nem acordou!', 'zzz'), L(0, '(cocoricó!) ...tá bom. Bom dia. Você venceu.', 'sweat')],
    outcome: {},
  },
  {
    id: 'faz-poco-desejo', kind: 'solo', title: 'Um pedido para a horta', emoji: '🙏', cast: 1, weight: 4, when: (c) => c.env.crops > 0 && is(c, 0, 'Sonhador', 'Tímido', 'Calmo'),
    lines: () => [L(0, '(agachado perto dos brotos, sussurra)', 'heart'), L(0, 'Cresçam bonitos. O treinador cuida tanto de vocês.', 'sparkle'), L(0, '(dá um tapinha na terra) Vocês conseguem.', 'star')],
    outcome: { friend: 1 },
  },
  {
    id: 'faz-banho-mangueira', kind: 'festa', title: 'Banho de mangueira', emoji: '🚿', cast: 2, weight: 4, when: (c) => day(c) && c.env.hour >= 11 && c.env.hour < 17 && calm(c),
    lines: (c) => [L(0, 'Calor! Muito calor! Alguém liga a mangueira!', 'fire'), L(1, `(liga a mangueira direto em ${c.n[0]})`, 'laugh'), L(0, 'AAAH! Que delícia! De novo!', 'laugh'), L(1, 'Agora é a minha vez! Não! Espera! AAAH!', 'shock')],
    outcome: { bond: 5, water: true },
  },
  {
    id: 'faz-concurso-legume', kind: 'rivalidade', title: 'Concurso do maior legume', emoji: '🥇', cast: 2, weight: 4, when: (c) => c.env.ripeCrops > 0,
    lines: (c) => {
      const v = c.rng() < 0.5 ? 0 : 1;
      c.memo.v = v;
      return [L(0, 'O meu tomate é o maior da Vila. Olha o tamanho!', 'fire'), L(1, 'O meu milho tem o dobro. Mede com a régua.', 'fire'), L(v, '(ergue o troféu de papelão) Campeão da colheita!', 'star'), L(v === 0 ? 1 : 0, 'Ano que vem eu planto uma melancia. Prepare-se.', 'anger')];
    },
    outcome: { bond: 2, spark: 1 },
  },
  {
    id: 'faz-neve-canteiros', kind: 'solo', title: 'Neve nos canteiros', emoji: '❄️', cast: 1, weight: 4, when: (c) => snowy(c),
    lines: () => [L(0, 'A neve cobriu os canteiros como um cobertor.', 'sparkle'), L(0, 'Será que as sementes estão com frio? Será que estão dormindo?', 'question'), L(0, 'Durmam, sementinhas. Na primavera a gente conversa.', 'heart')],
    outcome: {},
  },
  {
    id: 'faz-cerca-conserto', kind: 'amizade', title: 'Consertando a cerca', emoji: '🔨', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'A cerca da fazenda quebrou num pedaço. Me ajuda?', 'question'), L(1, 'Eu seguro, você martela. Mas na tábua. Não no meu dedo.', 'sweat'), L(0, '(toc, toc, toc) Pronto! Firme como nova!', 'star'), L(1, `Bom trabalho, ${c.n[0]}. Nenhum dedo ferido. Sucesso total.`, 'heart')],
    outcome: { bond: 5, items: [['madeira', 1]] },
  },
  {
    id: 'faz-receita-vovo', kind: 'amizade', title: 'Sopa da roça', emoji: '🍲', cast: 3, weight: 4, when: (c) => evening(c) || (rainy(c) && day(c)),
    lines: (c) => [L(0, 'Vou fazer uma sopa com tudo que a horta deu hoje.', 'idea'), L(1, 'Cenoura, batata, milho e um pouco de amor.', 'heart'), L(2, 'E sal. Amor sem sal fica sem graça.', 'laugh'), L(0, `${c.n[1]}, ${c.n[2]}: a sopa está servida. Cuidado que queima a língua.`, 'star')],
    outcome: { bond: 4, bond02: 4, bond12: 4, friend: 1 },
  },
  {
    id: 'faz-estrelas-celeiro', kind: 'amizade', title: 'Telhado do celeiro', emoji: '🌠', cast: 2, weight: 4, when: (c) => night(c) && calm(c),
    lines: (c) => [L(0, `${c.n[1]}, sobe aqui no telhado do celeiro! Dá para ver tudo!`, 'star'), L(1, 'Isso é seguro?', 'sweat'), L(0, 'Não muito. Mas olha essa vista. As estrelas parecem mais perto.', 'sparkle'), L(1, '(sobe devagar e fica, sem falar, até a lua sumir)', 'heart')],
    outcome: { bond: 6, spark: 2 },
  },
  {
    id: 'faz-pe-de-feijao', kind: 'solo', title: 'O pé de feijão', emoji: '🫘', cast: 1, weight: 4, when: (c) => is(c, 0, 'Sonhador', 'Brincalhão'),
    lines: () => [L(0, 'Eu ouvi uma história de um feijão que cresceu até as nuvens.', 'idea'), L(0, '(planta um feijão e fica esperando ao lado com uma mochila pronta)', 'zzz'), L(0, 'Quando ele chegar lá em cima, eu subo. Já estou com o lanche.', 'star')],
    outcome: {},
  },
  {
    id: 'faz-trio-forro', kind: 'festa', title: 'Forró no celeiro', emoji: '🪗', cast: 3, weight: 4, when: (c) => evening(c),
    lines: (c) => [L(0, 'Hoje tem forró no celeiro! Feno no chão, lampião no teto!', 'note'), L(1, 'Eu não sei dançar.', 'sweat'), L(2, `Ninguém sabe, ${c.n[1]}. É só balançar e sorrir.`, 'laugh'), L(0, '(dançam até o lampião piscar e o feno voar)', 'note')],
    outcome: { bond: 4, bond02: 4, bond12: 4, spark: 1 },
  },
  {
    id: 'faz-casal-plantar', kind: 'romance', title: 'Uma árvore para nós', emoji: '🌳', cast: 2, weight: 4, when: (c) => coupled(c) && day(c),
    lines: (c) => [L(0, 'Vamos plantar uma árvore juntos? Para ficar aqui para sempre.', 'heart'), L(1, 'E quando ela crescer, a gente senta na sombra.', 'sparkle'), L(0, `E grava nossos nomes. ${c.n[0]} e ${c.n[1]}.`, 'heart'), L(1, 'Num coração bem pequenininho, para não machucar a árvore.', 'heart')],
    outcome: { bond: 5, spark: 5 },
    keep: true,
  },
  {
    id: 'faz-briga-canteiro', kind: 'rivalidade', title: 'O canteiro é meu', emoji: '😤', cast: 2, weight: 4, when: (c) => rivals(c) || is(c, 0, 'Mandão'),
    lines: (c) => [L(0, 'Esse canteiro é meu. Eu que arei.', 'anger'), L(1, 'Eu que plantei.', 'anger'), L(0, 'Eu que reguei!', 'anger'), L(1, `...então ele é nosso, ${c.n[0]}. Só que a gente não sabe dividir.`, 'sweat')],
    outcome: { bond: 1, spark: 1 },
  },
  {
    id: 'faz-uva-pisada', kind: 'festa', title: 'Pisando uvas', emoji: '🍇', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Vamos fazer suco de uva do jeito antigo: pisando!', 'idea'), L(1, '(pula dentro do balde) Está geladinho! Está gosmento! Está ótimo!', 'laugh'), L(0, '(os dois pisam rindo até ficarem roxos até o joelho)', 'laugh'), L(1, `${c.n[0]}, o suco ficou com gosto de pé?`, 'question')],
    outcome: { bond: 6 },
  },
  {
    id: 'faz-melancia-partida', kind: 'festa', title: 'A melancia partida', emoji: '🍉', cast: 3, weight: 4, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, 'Melancia geladinha! Três fatias iguais!', 'star'), L(1, 'A minha tem mais semente.', 'sad'), L(2, `A minha não tem nenhuma. Troca comigo, ${c.n[1]}.`, 'heart'), L(0, '(campeonato de cuspir semente começa sem aviso)', 'laugh')],
    outcome: { bond: 4, bond02: 3, bond12: 5 },
  },
  {
    id: 'faz-chuva-colheita', kind: 'drama', title: 'Colheita na chuva', emoji: '⛈️', cast: 2, weight: 4, when: (c) => rainy(c) && c.env.ripeCrops > 0,
    lines: (c) => [L(0, 'Está chovendo forte e a colheita está pronta! A gente salva tudo?', 'shock'), L(1, 'Corre! Cada um pega uma cesta!', 'fire'), L(0, '(colhem tudo encharcados, escorregando na lama)', 'sweat'), L(1, `Salvamos, ${c.n[0]}. E viramos dois bonecos de barro.`, 'laugh')],
    outcome: { bond: 6, friend: 1 },
  },
  {
    id: 'faz-pomar-sonho', kind: 'solo', title: 'O pomar dos sonhos', emoji: '🍎', cast: 1, weight: 4, when: (c) => is(c, 0, 'Sonhador', 'Guloso'),
    lines: () => [L(0, 'Um dia essa fazenda vai ter um pomar inteiro.', 'idea'), L(0, 'Maçã, pera, pêssego e uma árvore só de bolo.', 'sparkle'), L(0, 'Bolo não dá em árvore? Ainda não. Eu sou paciente.', 'laugh')],
    outcome: {},
  },
  {
    id: 'faz-pegadas-lama', kind: 'comedia', title: 'Pegadas de lama', emoji: '🐾', cast: 2, weight: 4, when: (c) => rainy(c) || c.env.weather === null,
    lines: (c) => [L(0, '(entra na casa de um colega deixando pegadas de lama por todo lado)', 'sweat'), L(1, `${c.n[0]}! O meu tapete!`, 'anger'), L(0, 'Eu limpei os pés! (olha os pés) ...no tapete.', 'question'), L(1, 'Pega o pano. Eu faço o chá. Depois a gente ri disso.', 'laugh')],
    outcome: { bond: 3 },
  },
  {
    id: 'faz-cavalinho-feno', kind: 'comedia', title: 'O cavalinho de feno', emoji: '🐴', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Fiz um cavalinho de feno! Ele se chama Pipoca.', 'star'), L(1, 'Ele está meio torto.', 'question'), L(0, `Ele é original, ${c.n[1]}. Pipoca tem personalidade.`, 'anger'), L(1, '(o vento derruba o Pipoca) Pipoca foi descansar.', 'sweat')],
    outcome: { bond: 3 },
  },
  {
    id: 'faz-lavanda-cheiro', kind: 'solo', title: 'O cheiro de lavanda', emoji: '💜', cast: 1, weight: 4, when: (c) => day(c) && calm(c),
    lines: () => [L(0, '(passa pelo canteiro de lavanda e respira fundo)', 'heart'), L(0, 'Isso é cheiro de calma. Se calma tivesse cheiro, seria esse.', 'sparkle'), L(0, '(boceja) E dá sono também. Muito eficiente.', 'zzz')],
    outcome: { friend: 1 },
  },
  {
    id: 'faz-trio-banco-feira', kind: 'amizade', title: 'Barraca da feira', emoji: '🏷️', cast: 3, weight: 4, when: (c) => day(c) && c.env.ripeCrops > 0,
    lines: (c) => [L(0, 'Vamos montar uma barraca de feira com o que sobrou da colheita!', 'idea'), L(1, 'Eu faço as placas. "Tomate do bom. Preço de amigo."', 'star'), L(2, 'Eu fico gritando "olha a cenoura fresquinha"!', 'note'), L(0, `${c.n[2]} gritou tanto que a Vila inteira veio comprar.`, 'laugh')],
    outcome: { bond: 4, bond02: 4, bond12: 4, coins: 15 },
  },
  {
    id: 'faz-milho-pipoca', kind: 'comedia', title: 'Milho que virou pipoca', emoji: '🍿', cast: 2, weight: 4, when: (c) => day(c) && c.env.hour >= 11 && c.env.hour < 16 && calm(c),
    lines: (c) => [L(0, 'O sol está tão forte hoje que...', 'fire'), L(1, '(PLOC!) O que foi isso?!', 'shock'), L(0, '(PLOC! PLOC!) Não. Não pode ser.', 'shock'), L(1, `${c.n[0]}, acho que o milho pegou fogo de calor. Traz a manteiga.`, 'laugh')],
    outcome: { bond: 4, items: [['pipoca', 1]] },
  },
  {
    id: 'faz-amanhecer-ordenha', kind: 'solo', title: 'Fazendeiro madrugador', emoji: '🌄', cast: 1, weight: 4, when: (c) => c.env.hour >= 5 && c.env.hour < 8,
    lines: () => [L(0, 'Fazendeiro de verdade acorda antes do sol. Eu acordei!', 'star'), L(0, '(olha em volta) ...o que eu faço agora?', 'question'), L(0, 'Vou regar o que já está regado. Para garantir.', 'sweat')],
    outcome: { water: true },
  },
  {
    id: 'faz-galinha-ovo', kind: 'amizade', title: 'O ovo de presente', emoji: '🥚', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, `${c.n[1]}! A galinha do celeiro botou um ovo e deixou na minha frente!`, 'shock'), L(1, 'Acho que ela gosta de você.', 'heart'), L(0, 'Eu vou cuidar dele. Vou fazer um ninho. Vou ler histórias para ele.', 'sparkle'), L(1, `${c.n[0]}... é um ovo de café da manhã.`, 'sweat')],
    outcome: { bond: 4 },
  },
];
