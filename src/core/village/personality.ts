/**
 * O jeito de cada Pokémon: fixo, vem do id da carta (o mesmo Pokémon é sempre o mesmo "tipo de gente"). Usado pelo Livro,
 * pelas conversas e pelos momentos entre os Pokémon da Vila.
 */

export const PERSONALITIES = [
  { name: 'Brincalhão', about: 'Vive inventando brincadeiras e adora correr pela Vila.' },
  { name: 'Calmo', about: 'Gosta de sombra, silêncio e de ficar perto de você.' },
  { name: 'Tímido', about: 'Demora a se abrir, mas nunca esquece quem foi gentil.' },
  { name: 'Corajoso', about: 'Sempre o primeiro a querer batalhar.' },
  { name: 'Guloso', about: 'Pensa em frutas o dia inteiro.' },
  { name: 'Sonhador', about: 'Passa horas olhando as nuvens e as estrelas.' },
  { name: 'Curioso', about: 'Mexe em tudo e conhece cada canto da Vila.' },
  { name: 'Mandão', about: 'Acha que manda na Caixa (e às vezes manda mesmo).' },
] as const;

export type PersonalityName = (typeof PERSONALITIES)[number]['name'];

export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

export function personalityOf(id: string): (typeof PERSONALITIES)[number] {
  return PERSONALITIES[hash(`p:${id}`) % PERSONALITIES.length]!;
}
