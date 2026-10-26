/** Lugares das investigações e distribuição da primeira pista no mapa da Vila. */
export const LEGEND_PLACES = {
  plaza: { name: 'Fonte Central', x: 47, y: 38, landscape: 'city' },
  lake: { name: 'Píer do Lago Azul', x: 80, y: 18, landscape: 'water' },
  woods: { name: 'Clareira da Madeireira', x: 15, y: 13, landscape: 'forest' },
  mine: { name: 'Entrada da Mina', x: 16, y: 66, landscape: 'stone' },
  park: { name: 'Parquinho Oeste', x: 16, y: 47, landscape: 'forest' },
  farm: { name: 'Caminho da Fazenda', x: 84, y: 46, landscape: 'forest' },
  south: { name: 'Trilha do Bosque do Sul', x: 22, y: 64, landscape: 'forest' },
  tower: { name: 'Calçada da Torre', x: 14, y: 24, landscape: 'city' },
  // Bairros do mapa grande (coordenadas dos pontos de passeio em `expansion.ts`): servem de primeira pista.
  garden: { name: 'Jardim das Estações', x: 40, y: 81, landscape: 'forest' },
  square: { name: 'Praça dos Encontros', x: 71, y: 83, landscape: 'city' },
  grove: { name: 'Bosque do Piquenique', x: 99, y: 66, landscape: 'forest' },
  lookout: { name: 'Mirante das Nuvens', x: 104, y: 19, landscape: 'water' },
  beach: { name: 'Praia das Conchas', x: 109, y: 49, landscape: 'water' },
} as const;
export type LegendPlace = keyof typeof LEGEND_PLACES;
/** Cenários finais dos encontros; os demais lugares só abrigam a primeira pista. */
export const FINAL_PLACES = ['plaza', 'lake', 'woods', 'mine', 'park', 'farm', 'south', 'tower'] as const;
export type LegendEncounterPlace = (typeof FINAL_PLACES)[number];
/** Onde cada encontro dá o primeiro sinal: espalhado pelo mapa grande, nunca no próprio cenário final. */
const FIRST_SIGNS: Record<LegendEncounterPlace, readonly LegendPlace[]> = {
  plaza: ['park', 'square', 'garden', 'tower'],
  lake: ['lookout', 'beach', 'farm', 'plaza'],
  woods: ['tower', 'park', 'plaza', 'south'],
  mine: ['south', 'garden', 'park', 'woods'],
  park: ['plaza', 'tower', 'garden', 'mine'],
  farm: ['grove', 'beach', 'square', 'south'],
  south: ['garden', 'square', 'mine', 'farm'],
  tower: ['plaza', 'woods', 'square', 'park'],
};
export function firstSignPlace(story: { dexId: number; place: LegendEncounterPlace }): LegendPlace {
  const options = FIRST_SIGNS[story.place];
  return options[story.dexId % options.length]!;
}
