import { L } from './kit';
import type { Template } from './kit';

export const SURVIVAL_ABSENCE_PREFIX = 'saudade-survival-';

const SOLO = [
  ['banco', 'Um lugar no banco', 'Acho que vou ficar mais um pouco neste banco. Fiquei com vontade de conversar.', 'Se o Treinador passar por aqui depois do Survival, tomara que sente um pouquinho.'],
  ['historia', 'Uma história na ponta da língua', 'Tive um sonho tão engraçado que ensaiei como ia contar.', 'Com tantas idas ao Survival, a gente ainda não teve tempo de bater papo. Tomara que eu lembre do final!'],
  ['porta', 'Um oi já basta', 'Ultimamente parece que só dá tempo de ir pro Survival.', 'Eu ficaria feliz até com um oi dito da porta.'],
  ['pergunta', 'A primeira pergunta', 'Queria perguntar como é lá no Survival para quem está jogando.', 'Mas acho que vou começar perguntando como foi o dia. Dessa resposta eu também estou com saudade.'],
  ['folha', 'A folha que virou barco', 'Olha só, achei uma folha com o formato certinho de um barquinho.', 'Dava vontade de mostrar pro Treinador antes de mais uma partida no Survival.'],
  ['janela', 'Depois da partida', 'Será que depois do Survival dá tempo de olhar o céu comigo?', 'Eu queria perguntar com o que aquela nuvem se parece. Pra mim é um Psyduck deitado.'],
  ['aceno', 'Acenar para o caminho', 'Andei com saudade de bater papo. Ensaiar um aceno pro Treinador não ajudou muito.', 'Quando acabar a correria do Survival, vou tentar um oi de verdade.'],
  ['pecha', 'Uma Pecha para dividir', 'Uma Pecha pra mim e outra pra quem quiser sentar comigo.', 'Tomara que o Treinador volte do Survival com fome de fruta e vontade de conversar.'],
  ['risada', 'Saudade de rir junto', 'Eu ia contar uma piada sobre uma pedra, mas esqueci a parte engraçada.', 'O Treinador anda indo pro Survival. Será que depois a gente consegue inventar outro final juntos?'],
  ['segredo', 'Um cantinho tranquilo', 'Descobri um lugar onde dá pra ouvir o vento sem ouvir mais nada.', 'Queria mostrar pro Treinador quando ele voltar do Survival e tiver um tempinho.'],
  ['perto', 'Aqui pertinho', 'Engraçado. O Survival parece levar o Treinador tão longe. Pra conversar comigo, é só chegar pertinho.', 'Acho que vou ficar por aqui. Não precisa dizer nada complicado.'],
  ['brisa', 'Conversa ao vento', 'Hoje a brisa está boa pra uma conversa sem pressa.', 'Tomara que sobre um pouquinho dela quando o Treinador sair do Survival.'],
  ['caderno', 'Páginas em branco', 'Se eu escrevesse uma pergunta por partida de Survival, será que enchia o caderno?', 'Fiquei com vontade de perguntar de uma em uma, numa conversa de verdade.'],
  ['chao', 'Desenho na poeira', 'Desenhei dois círculos na poeira. Um é pra mim e o outro é pro Treinador.', 'É só onde eu queria que a gente sentasse pra conversar quando acabasse o Survival.'],
  ['som', 'O barulho de um bom dia', 'Survival deve ter tanto barulho. Aqui eu fico até escutando as folhas caírem.', 'Também tem um som de que eu senti falta por aqui. Um bom dia vindo do Treinador.'],
] as const;

const DUO = [
  ['chazinho', 'Chá e conversa', 'Bateu uma saudade de conversar com o Treinador. Parece que sempre tem outra partida de Survival.', 'Quando der, chamamos pra um chá. Até lá, quer tomar uma xícara comigo?'],
  ['placar', 'Fora do placar', 'Será que o Survival tem um placar de conversas? O meu deve estar baixinho.', 'Se tivesse, o nosso papo agora já valia um ponto. Dá pra chamar o Treinador depois.'],
  ['respiro', 'Na hora do respiro', 'Queria que o Treinador ficasse aqui um pouquinho entre uma partida de Survival e outra.', 'A gente pode oferecer companhia. Às vezes, é só disso que alguém precisa pra querer ficar.'],
  ['caminhada', 'Uma volta devagar', 'Fiquei com vontade de chamar o Treinador pra dar uma volta. Faz falta conversar andando.', 'Boa ideia. Depois de tanta correria no Survival, podemos escolher a rua mais sossegada.'],
  ['bilhete', 'Só um oi no papel', 'Pensei em deixar um bilhete pro Treinador ler depois do Survival. Mas o que eu escrevo?', 'Que tal só “oi, senti saudade”? Eu gostaria de abrir um bilhete assim.'],
  ['ponte', 'Na beira do caminho', 'Será que eu chamo o Treinador quando tiver uma pausa no Survival? Estou com um nó na garganta.', 'Eu posso ficar ao seu lado na hora. Se você quiser, começo falando do tempo.'],
  ['jogo', 'Uma rodada sem pressa', 'O Treinador tem jogado tanto Survival. Eu queria uma rodada de conversa.', 'A regra podia ser simples. Cada um conta uma coisa pequena que aconteceu hoje.'],
  ['contar', 'O que você contaria?', 'O que você contaria pro Treinador se ele tivesse um minuto depois do Survival?', 'Que eu gostei de ter você por perto hoje. E que queria ouvir uma coisa boa sobre o dia dele.'],
  ['dois-sons', 'O silêncio da praça', 'Quando bate saudade de conversar com o Treinador, até a praça parece mais quieta.', 'Vem cá, escuta essa cigarra comigo. Depois do Survival podemos ver se ele também escuta.'],
  ['volta', 'Uma pausa para voltar', 'Tem dias em que eu queria que a chegada do Treinador fosse o começo de um papo, em vez de mais um Survival.', 'Se tiver um intervalo, podemos convidar pra ficar. Quer que eu convide junto com você?'],
  ['perguntas', 'Perguntas para levar', 'Se eu só puder fazer uma pergunta antes do próximo Survival, qual você faria?', '“Tem um tempinho?” Aí, se tiver, dá até pra fazer a segunda.'],
  ['cantoria', 'Uma canção pra chamar', 'Pensei em inventar uma música pro Treinador ouvir quando voltasse do Survival.', 'Se for só pra começar uma conversa, não precisa acertar a nota. Eu até canto junto.'],
  ['tempo', 'O tamanho de um minuto', 'Um minuto é pouco tempo lá no Survival?', 'Pode até ser. Aqui, um minuto já dá pra dizer que você sentiu saudade e ouvir a resposta.'],
  ['sombra', 'Um encontro à sombra', 'Sinto falta de ter o Treinador aqui pra conversar. Tomara que venha ver a Vila depois do Survival.', 'Se vier, podemos chamar pra cá. Cabe mais um debaixo dessa sombra.'],
  ['coisas-boas', 'Uma coisa boa por vez', 'Eu queria saber o que o Treinador anda achando do Survival. E contar uma coisa boa do meu dia também.', 'Vamos começar ensaiando comigo. Eu tenho tempo e quero saber qual foi a sua.'],
] as const;

export const SURVIVAL_ABSENCE_MOMENTS: readonly Template[] = [
  ...SOLO.map(([id, title, first, second]): Template => ({
    id: SURVIVAL_ABSENCE_PREFIX + id, title, kind: 'drama', emoji: '💭', cast: 1, weight: 1,
    lines: () => [L(0, first, 'sad'), L(0, second)], outcome: {},
  })),
  ...DUO.map(([id, title, first, second]): Template => ({
    id: SURVIVAL_ABSENCE_PREFIX + id, title, kind: 'drama', emoji: '💭', cast: 2, weight: 1,
    lines: () => [L(0, first, 'sad'), L(1, second)], outcome: {},
  })),
];
