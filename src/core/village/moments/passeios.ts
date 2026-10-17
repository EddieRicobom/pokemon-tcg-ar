import { L, calm, coupled, day, evening, friendsNow, is, night, other, rainy, rivals, snowy } from './kit';
import type { Template } from './kit';

/** Passeios que atravessam o mapa grande: do lago à fazenda, do parque ao bosque, mudanças de bairro e aventuras longas. */
export const PASSEIOS_MOMENTS: readonly Template[] = [
  {
    id: 'pas-volta-completa', kind: 'amizade', title: 'A volta completa', emoji: '🚶', cast: 2, weight: 5, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, `${c.n[1]}, desafio: dar a volta na Vila inteira antes do almoço.`, 'fire'), L(1, 'Lago, fazenda, parque, bosque e praça? Topo!', 'star'), L(0, '(três horas depois, os dois chegam arrastando os pés na fonte)', 'zzz'), L(1, 'Perdemos o almoço. Mas ganhamos a Vila.', 'heart')],
    outcome: { bond: 6, friend: 1 },
    after: (n, who) => `Dei a volta na Vila inteira com ${other(n, who)}. Meus pés estão pedindo férias.`,
  },
  {
    id: 'pas-do-lago-a-fazenda', kind: 'amizade', title: 'Peixe com legume', emoji: '🐟', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Eu pesquei no lago, você colheu na fazenda. Vamos juntar tudo num almoço?', 'idea'), L(1, 'Peixe assado com cenoura e batata. Já estou salivando.', 'heart'), L(0, `${c.n[1]}, você cozinha, eu lavo a louça.`, 'star'), L(1, 'Combinado. (os dois sabem que ninguém vai lavar a louça)', 'laugh')],
    outcome: { bond: 6, items: [['peixe', 1]] },
  },
  {
    id: 'pas-mudanca-bairro', kind: 'drama', title: 'Mudança de bairro', emoji: '📦', cast: 2, weight: 4, when: (c) => c.env.town >= 4 && friendsNow(c),
    lines: (c) => [L(0, 'O treinador me deu uma casa nova, na outra rua.', 'sad'), L(1, `Mas... a gente era vizinho, ${c.n[0]}.`, 'sad'), L(0, 'Agora vai ser uma caminhada até a sua casa. Uma caminhada boa.', 'idea'), L(1, 'Eu caminho todo dia, então. Até cansar a rua.', 'heart')],
    outcome: { bond: 7 },
  },
  {
    id: 'pas-cartao-postal', kind: 'solo', title: 'Cartões-postais da Vila', emoji: '🖼️', cast: 1, weight: 4, when: (c) => day(c) && is(c, 0, 'Sonhador', 'Curioso'),
    lines: () => [L(0, 'Vou desenhar um cartão-postal de cada lugar da Vila.', 'idea'), L(0, 'O lago com o sol. A fazenda com o celeiro. A praça com a fonte.', 'sparkle'), L(0, 'E vou mandar para mim mesmo pelo Correio. Para lembrar.', 'heart')],
    outcome: { friend: 1 },
  },
  {
    id: 'pas-mapa-desenhado', kind: 'amizade', title: 'O mapa da Vila', emoji: '🗺️', cast: 3, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'A Vila ficou grande demais para a memória. Vamos desenhar um mapa!', 'idea'), L(1, 'Eu desenho o lago. É fácil: um círculo azul.', 'star'), L(2, 'Eu desenho as casas. Vou colocar um coração em cada uma onde mora amigo.', 'heart'), L(0, `${c.n[2]} desenhou coração em todas.`, 'sparkle')],
    outcome: { bond: 4, bond02: 4, bond12: 4 },
  },
  {
    id: 'pas-entrega', kind: 'comedia', title: 'Entrega do outro lado', emoji: '📦', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Me pediram para entregar esse pacote na fazenda. Eu estou no lago.', 'sweat'), L(1, 'São dez minutos andando.', 'question'), L(0, `Dez minutos com esse pacote pesado, ${c.n[1]}. Me ajuda?`, 'sad'), L(1, '(levam juntos; o pacote era uma almofada)', 'laugh')],
    outcome: { bond: 4 },
  },
  {
    id: 'pas-estrelas-alto', kind: 'romance', title: 'O lugar mais alto', emoji: '🌌', cast: 2, weight: 4, when: (c) => night(c) && calm(c) && (coupled(c) || (c.rel?.spark ?? 0) >= 40),
    lines: (c) => [L(0, 'Eu achei o lugar mais alto da Vila: a pedra grande da pedreira.', 'sparkle'), L(1, 'Para quê?', 'question'), L(0, `Para ver as estrelas mais de perto com você, ${c.n[1]}.`, 'heart'), L(1, '(sobem, sentam e ficam em silêncio até o céu clarear)', 'heart')],
    outcome: { bond: 5, spark: 5 },
  },
  {
    id: 'pas-corrida-vila', kind: 'rivalidade', title: 'A maratona da Vila', emoji: '🏃', cast: 3, weight: 4, when: (c) => day(c) && calm(c),
    lines: (c) => {
      const v = Math.floor(c.rng() * 3);
      c.memo.v = v;
      return [L(0, 'Maratona: da praça até o lago, do lago até a fazenda, e de volta!', 'fire'), L(1, 'Eu vou no meu ritmo. O ritmo de quem para para comer.', 'heart'), L(2, 'Eu vou correndo. E depois andando. E depois sendo carregado.', 'sweat'), L(v, `(chega na fonte primeiro, sem fôlego) Ganhei! ${c.n[v]} é campeão!`, 'star')];
    },
    outcome: { bond: 3, bond02: 3, bond12: 3 },
  },
  {
    id: 'pas-domingo-familia', kind: 'festa', title: 'Domingo em todo lugar', emoji: '☀️', cast: 3, weight: 4, when: (c) => c.date.dow === 0 && day(c),
    lines: (c) => [L(0, 'É domingo! Manhã no lago, almoço na fazenda, tarde no parque!', 'star'), L(1, 'E a noite?', 'question'), L(2, 'A noite é na rede, contando o dia.', 'zzz'), L(0, `O melhor domingo, ${c.n[1]}, ${c.n[2]}. Igual ao próximo.`, 'heart')],
    outcome: { bond: 4, bond02: 4, bond12: 4, friend: 1 },
  },
  {
    id: 'pas-guia-novato', kind: 'amizade', title: 'Mostrando a Vila', emoji: '👋', cast: 2, weight: 5, when: (c) => day(c) && (c.rel?.met ?? 0) <= 1,
    lines: (c) => [L(0, `Você é novo aqui, né, ${c.n[1]}? Deixa eu te mostrar a Vila!`, 'star'), L(1, 'Ela é grande? Eu me perdi no caminho até a fonte.', 'sweat'), L(0, 'É grande, mas é toda amiga. Vem: primeiro o mercado, depois o lago.', 'heart'), L(1, '(no fim do passeio) Agora eu sei voltar para casa. E sei onde você mora.', 'sparkle')],
    outcome: { bond: 8, friend: 1 },
  },
  {
    id: 'pas-chuva-volta', kind: 'comedia', title: 'Pegos pela chuva longe de casa', emoji: '🌧️', cast: 2, weight: 4, when: (c) => rainy(c),
    lines: (c) => [L(0, 'A gente estava no bosque e choveu. A casa fica do outro lado da Vila!', 'shock'), L(1, 'Corre pela avenida! É o caminho mais reto!', 'fire'), L(0, '(chegam encharcados, pingando, rindo) Isso foi uma enchente particular.', 'laugh'), L(1, `${c.n[0]}, a próxima vez a gente leva guarda-chuva. Ou mora no bosque.`, 'sweat')],
    outcome: { bond: 5 },
  },
  {
    id: 'pas-neve-trilhas', kind: 'festa', title: 'Trenó na Vila', emoji: '🛷', cast: 3, weight: 4, when: (c) => snowy(c),
    lines: (c) => [L(0, 'Neve na Vila inteira! Trenó da pedreira até a avenida!', 'star'), L(1, 'Eu sento na frente!', 'fire'), L(2, 'Eu seguro atrás. E grito. Muito.', 'shock'), L(0, `(o trenó desce, gira e para num monte de neve; ${c.n[2]} ainda está gritando)`, 'laugh')],
    outcome: { bond: 4, bond02: 4, bond12: 4 },
  },
  {
    id: 'pas-cansado-longe', kind: 'solo', title: 'A Vila é grande demais', emoji: '🥵', cast: 1, weight: 4, when: (c) => day(c) && is(c, 0, 'Guloso', 'Calmo'),
    lines: () => [L(0, 'Eu queria ir no lago. Mas o lago é longe. Muito longe.', 'sweat'), L(0, '(senta na calçada para descansar no meio do caminho)', 'zzz'), L(0, 'Vou chegar amanhã. Hoje eu descanso aqui, na metade.', 'laugh')],
    outcome: {},
  },
  {
    id: 'pas-presente-de-cada-lugar', kind: 'amizade', title: 'Um presente de cada lugar', emoji: '🎁', cast: 2, weight: 4, when: (c) => friendsNow(c),
    lines: (c) => [L(0, `${c.n[1]}, eu trouxe uma coisa de cada canto da Vila para você.`, 'heart'), L(1, 'Uma concha, uma flor, uma pedrinha e... uma pinha?', 'question'), L(0, 'Do lago, do parque, da pedreira e do bosque. A Vila inteira, para você.', 'sparkle'), L(1, '(guarda tudo numa caixinha, como um tesouro)', 'heart')],
    outcome: { bond: 8, items: [['concha', 1]] },
  },
  {
    id: 'pas-briga-caminho', kind: 'rivalidade', title: 'O caminho mais curto', emoji: '🧭', cast: 2, weight: 4, when: (c) => rivals(c) || is(c, 0, 'Mandão'),
    lines: (c) => [L(0, 'Para o lago é pela trilha de terra. Todo mundo sabe.', 'anger'), L(1, 'É pela avenida e depois pela rua dos jogos. Mais rápido.', 'anger'), L(0, '(cada um vai por um caminho; chegam juntos, no mesmo segundo)', 'shock'), L(1, `...empate, ${c.n[0]}. Os dois caminhos são bons. Que raiva.`, 'sweat')],
    outcome: { bond: 2 },
  },
  {
    id: 'pas-sol-se-pondo-praca', kind: 'amizade', title: 'O fim do dia na praça', emoji: '🌇', cast: 3, weight: 4, when: (c) => evening(c) && calm(c),
    lines: (c) => [L(0, '(os três voltam de cantos diferentes da Vila e se encontram na fonte)', 'heart'), L(1, 'Eu vim do lago.', 'sparkle'), L(2, 'Eu vim da fazenda.', 'sparkle'), L(0, `E eu vim do parque. ${c.n[1]}, ${c.n[2]}: a fonte é o meio de tudo, e de nós.`, 'heart')],
    outcome: { bond: 4, bond02: 4, bond12: 4 },
  },
  {
    id: 'pas-explorador', kind: 'solo', title: 'O explorador', emoji: '🔭', cast: 1, weight: 4, when: (c) => day(c) && is(c, 0, 'Curioso', 'Corajoso'),
    lines: () => [L(0, 'Diário do explorador, dia um: a Vila tem mais cantos do que eu pensei.', 'idea'), L(0, 'Dia um, mais tarde: achei uma flor nova, uma pedra brilhante e um atalho falso.', 'sparkle'), L(0, 'Dia um, à noite: estou com fome. Fim do diário.', 'laugh')],
    outcome: { friend: 1 },
  },
  {
    id: 'pas-casal-mapa', kind: 'romance', title: 'Nossos lugares', emoji: '📍', cast: 2, weight: 4, when: (c) => coupled(c),
    lines: (c) => [L(0, 'Eu marquei no mapa da Vila os nossos lugares.', 'heart'), L(1, 'Quais?', 'question'), L(0, `O banco onde a gente se conheceu, a pedra do lago, a sombra do parque... ${c.n[1]}, o mapa está cheio de corações.`, 'heart'), L(1, 'Então a Vila inteira é nossa.', 'heart')],
    outcome: { bond: 5, spark: 4 },
  },
  {
    id: 'pas-noite-volta', kind: 'drama', title: 'Voltando no escuro', emoji: '🔦', cast: 2, weight: 4, when: (c) => night(c),
    lines: (c) => [L(0, 'Ficou tarde e a gente ainda está na fazenda. A rua está escura.', 'sad'), L(1, 'Os postes da cidade estão acesos. É só seguir as luzes.', 'idea'), L(0, `Não solta da minha mão, ${c.n[1]}.`, 'sweat'), L(1, 'Nunca. Nem quando chegar.', 'heart')],
    outcome: { bond: 7, spark: 1 },
  },
  {
    id: 'pas-trio-fotografo', kind: 'festa', title: 'Fotos em todo canto', emoji: '📸', cast: 3, weight: 4, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, 'Vamos tirar uma foto em cada lugar da Vila!', 'star'), L(1, 'No lago eu faço pose de peixe.', 'laugh'), L(2, 'Na fazenda eu faço pose de espantalho.', 'laugh'), L(0, `E no parque a gente cai do escorregador. ${c.n[1]}, a foto saiu tremida. Perfeita.`, 'sparkle')],
    outcome: { bond: 4, bond02: 4, bond12: 4 },
  },
  {
    id: 'pas-amigo-longe', kind: 'drama', title: 'Saudade do vizinho', emoji: '💭', cast: 1, weight: 4, when: (c) => evening(c) && is(c, 0, 'Tímido', 'Sonhador'),
    lines: () => [L(0, 'Meu melhor amigo mora do outro lado da Vila agora.', 'sad'), L(0, 'Antes eu via a janela dele da minha. Agora vejo o lago.', 'sad'), L(0, 'Mas o lago também é bonito. E amanhã eu vou visitar. Bem cedo.', 'heart')],
    outcome: { friend: 1 },
  },
  {
    id: 'pas-sinal-postes', kind: 'comedia', title: 'Contando postes', emoji: '💡', cast: 2, weight: 3, when: (c) => evening(c) || night(c),
    lines: (c) => [L(0, 'Quantos postes tem na Vila? Vamos contar!', 'idea'), L(1, 'Um, dois, três... vinte e... qual eu contei?', 'question'), L(0, `${c.n[1]}, você contou o mesmo três vezes.`, 'laugh'), L(1, 'Era um poste muito bonito.', 'sweat')],
    outcome: { bond: 3 },
  },
];
