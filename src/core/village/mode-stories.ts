import type { VillageState } from './life';
import type { VillageRequest } from './requests';

/** Histórias opcionais do Museu, abertas apenas por marcos que o Treinador já registrou. */
const MODE_STORIES: Record<string, Omit<VillageRequest, 'id' | 'day' | 'done' | 'persistent'>> = {
  'liga-insignia': {
    kind: 'collect', title: 'Expor a credencial da Arena',
    detail: 'A sua primeira credencial da Liga merece uma placa no Museu. Leve duas madeiras para montar a moldura da lembrança.',
    location: 'Museu da Vila', item: 'madeira', qty: 2, rewardCoins: 30, rewardItem: 'cristal', rewardQty: 1, rewardFriend: 0,
  },
  'pins-perfeito': {
    kind: 'collect', title: 'Registrar a partida perfeita dos Pins',
    detail: 'O troféu veio da pista depois de uma partida concluída com 100 pontos. Leve duas conchas ao Museu para preparar a vitrine do recorde.',
    location: 'Museu da Vila', item: 'concha', qty: 2, rewardCoins: 35, rewardItem: 'pecha', rewardQty: 2, rewardFriend: 0,
  },
  'torre-chefao': {
    kind: 'collect', title: 'Preparar a placa do Troféu da Torre',
    detail: 'Você trouxe o troféu depois de derrotar o chefão final da Torre. Leve duas peças de ferro ao Museu para fixar a placa da conquista na vitrine.',
    location: 'Museu da Vila', item: 'ferro', qty: 2, rewardCoins: 50, rewardItem: 'cristal', rewardQty: 1, rewardFriend: 0,
  },
};

const CHALLENGE_GALLERY: Omit<VillageRequest, 'id' | 'day' | 'done' | 'persistent'> = {
  kind: 'collect', title: 'Montar o pedestal das conquistas',
  detail: 'As lembranças da Liga e dos Pins já estão prontas. Traga três pedras ao Museu para firmar a base da vitrine que contará as duas histórias.',
  location: 'Museu da Vila', item: 'pedra', qty: 3, rewardCoins: 75, rewardItem: 'cristal', rewardQty: 2, rewardFriend: 0,
};

/** Cria cada pedido uma vez, mesmo se a Vila abrir depois de o marco ter sido conquistado. */
export function ensureModeStories(state: VillageState, achievements: Readonly<Record<string, unknown>>): boolean {
  let created = false;
  state.requests.story ??= [];
  for (const [achievementId, request] of Object.entries(MODE_STORIES)) {
    const id = `modo:${achievementId}`;
    if (!achievements[achievementId] || state.requests.story.some((entry) => entry.id === id)) continue;
    state.requests.story.push({ id, day: '', persistent: true, done: false, ...request });
    created = true;
  }
  const storyIds = new Set(state.requests.story.map((request) => request.id));
  const leagueStory = state.requests.story.find((request) => request.id === 'modo:liga-insignia');
  const pinsStory = state.requests.story.find((request) => request.id === 'modo:pins-perfeito');
  const galleryId = 'modo:galeria-desafios';
  if (achievements['liga-insignia'] && achievements['pins-perfeito'] && leagueStory?.done && pinsStory?.done && !storyIds.has(galleryId)) {
    state.requests.story.push({ id: galleryId, day: '', persistent: true, done: false, ...CHALLENGE_GALLERY });
    created = true;
  }
  if (created) state.requests.story = state.requests.story.slice(-8);
  return created;
}
