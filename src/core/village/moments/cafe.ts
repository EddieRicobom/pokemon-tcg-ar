import { L } from './kit';
import type { Ctx, Template } from './kit';
const together = (c: Ctx) => c.ids.every((id) => c.env.cafeGuests?.includes(id));
export const CAFE_MOMENTS: readonly Template[] = [
  { id: 'cafe-biscoito', title: 'O último biscoito', kind: 'comedia', emoji: '🍪', cast: 2, weight: 18, when: together,
    lines: () => [L(0, 'Você está olhando para o último biscoito há bastante tempo.'), L(1, 'Estou esperando ele me escolher.', 'question'), L(0, 'Acho que podemos dividir.'), L(1, 'Ele escolheu nós dois. Que biscoito sensato.', 'laugh')], outcome: { bond: 5 } },
  { id: 'cafe-nuvem', title: 'Conversa de fim de tarde', kind: 'amizade', emoji: '☕', cast: 2, weight: 16, when: together,
    lines: (c) => [L(0, `${c.n[1]}, gosto de sentar aqui com você.`), L(1, 'Mesmo quando eu não tenho nada interessante para contar?', 'question'), L(0, 'Principalmente. Posso só ficar aqui.'), L(1, 'Então vou pedir que o tempo passe devagar.', 'heart')], outcome: { bond: 7, spark: 1 } },
  { id: 'cafe-acucar', title: 'Açúcar demais', kind: 'comedia', emoji: '🫖', cast: 2, weight: 18, when: together,
    lines: () => [L(0, 'Acho que adoçaram meu chá duas vezes.'), L(1, 'Eu coloquei açúcar enquanto você contava sua história.', 'sweat'), L(0, 'Eu também.'), L(1, 'Pelo menos nossa amizade não está amarga.', 'laugh')], outcome: { bond: 4 } },
  { id: 'cafe-recado', title: 'Um assunto mal entendido', kind: 'drama', emoji: '💬', cast: 2, weight: 9, when: together,
    lines: () => [L(0, 'Ontem você passou por mim sem dizer nada.'), L(1, 'Eu achei que você estava bravo comigo.', 'sad'), L(0, 'Eu estava tentando lembrar onde deixei minha carteira.'), L(1, 'A gente devia conversar antes de inventar uma novela.', 'sweat')], outcome: { bond: 5 } },
];
