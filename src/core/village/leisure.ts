import { LEISURE_SPOTS } from './expansion';
import { add, friendOf } from './life';
import type { Interaction, VillageState } from './life';

/** Atividades breves com limite diário; só amigos realmente presentes recebem a amizade. */
export function enjoyVillagePlace(state: VillageState, id: string, day: string, nearby: readonly string[]): Interaction {
  const place = LEISURE_SPOTS.find((p) => p.id === id);
  if (!place) return { ok: false, message: 'Este lugar não existe.' };
  const key = `lazer:${id}`;
  if (state.harvested[key] === day) return { ok: false, message: 'Você já fez esta atividade hoje. Pode continuar passeando e voltar amanhã!' };
  const friends = [...new Set(nearby)].slice(0, 3);
  if (id === 'grove') {
    if (!friends.length) return { ok: false, message: 'Convide um Pokémon para dividir o piquenique com você.' };
    const fruit = ['oran', 'pecha'].find((item) => (state.inventory[item] ?? 0) > 0);
    if (!fruit) return { ok: false, message: 'Traga uma Fruta Oran ou Pecha para compartilhar no piquenique.' };
    state.inventory[fruit]!--;
  }
  if (id === 'garden' && (state.inventory.flor ?? 0) >= 999 || id === 'beach' && (state.inventory.concha ?? 0) >= 999) return { ok: false, message: 'A mochila já está cheia desse item.' };
  if (id === 'garden') add(state, 'flor', 1);
  if (id === 'beach') add(state, 'concha', 1);
  for (const resident of friends) friendOf(state, resident).points = Math.min(100, friendOf(state, resident).points + (id === 'grove' ? 3 : 1));
  state.harvested[key] = day;
  const messages: Record<string, string> = {
    garden: 'Você cuidou dos canteiros e recolheu uma Flor.', square: 'Você fez uma pausa na praça para conversar e ouvir a Vila.',
    grove: 'Vocês dividiram a fruta à sombra das árvores. +3 de amizade com cada companheiro presente.',
    lookout: 'Uma nuvem passou devagar sobre o mirante. Vocês ficaram um pouco observando o céu.', beach: 'Você procurou na areia e encontrou uma Concha.',
  };
  return { ok: true, message: messages[id]! + (friends.length && id !== 'grove' ? ' +1 de amizade com os companheiros presentes.' : '') };
}
