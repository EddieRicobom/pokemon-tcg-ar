// Prêmios das conquistas do Treinador, entregues na Vila: moedas e acessórios para o seu personagem.
// A Vila "puxa" o que ganhou do Treinador (`claimPrizes`), então nenhuma tela escreve no estado da outra.
import { ACHIEVEMENTS } from '../trainer';
import { add } from './life';
import type { VillageState } from './life';
import { itemDef } from './catalog';

export interface Prize {
  coins: number;
  /** Acessório exclusivo (não vende em loja nenhuma). */
  item?: string;
  /** Origem apresentada ao jogador quando o prêmio chega à Vila. */
  origin?: string;
  /** Conteúdo ou marco que o prêmio abre. */
  unlocks?: string;
}

/** Moedas por conquista (as mais difíceis pagam mais) e, nas marcantes, um acessório que só vem daqui. */
export const PRIZES: Record<string, Prize> = {
  'primeira-carta': { coins: 40, item: 'bone-treinador' },
  'cartas-10': { coins: 40 },
  'cartas-50': { coins: 120, item: 'monoculo' },
  'cartas-150': { coins: 300 },
  'colecao-8': { coins: 60 },
  'colecao-20': { coins: 180 },
  'sequencia-3': { coins: 40 },
  'sequencia-7': { coins: 100, item: 'fita-chama' },
  'sequencia-30': { coins: 400, item: 'colar-estrela' },
  'batalha-1': { coins: 30 },
  'batalhas-10': { coins: 80 },
  'batalhas-50': { coins: 250 },
  equipe: { coins: 50 },
  'minigame-1': { coins: 30 },
  'minigame-10': { coins: 120 },
  'minigame-perfeito': { coins: 200 },
  'nivel-5': { coins: 80 },
  'nivel-10': { coins: 200, item: 'oculos-estrela' },
  'nivel-20': { coins: 500, item: 'capa-estelar' },
  'vila-conversa': { coins: 80 },
  'vila-grande-amigo': { coins: 100, item: 'laco-amizade' },
  'vila-melhor-amigo': { coins: 200, item: 'tiara-coracoes' },
  'vila-apelido': { coins: 40 },
  'vila-perguntas': { coins: 100 },
  'vila-album': { coins: 150 },
  'liga-insignia': { coins: 100, item: 'insignia', origin: 'credencial da Arena, conquistada ao vencer um Ginásio; abre uma história opcional no Museu da Vila' },
  'liga-oito': { coins: 400, item: 'capa-liga', origin: 'uniforme da Arena, por conquistar oito insígnias' },
  'liga-campea': { coins: 600, item: 'louros', origin: 'coroa da Liga, por vencer a Campeã' },
  'pvp-1': { coins: 60 },
  'pvp-vitoria': { coins: 120, item: 'faixa-vencedor' },
  'pins-primeiro': { coins: 40, item: 'pin-pista', origin: 'lembrança da Pista de Pins, por concluir sua primeira partida' },
  'pins-perfeito': { coins: 180, item: 'trofeu-pista', origin: 'troféu dos Pins, por marcar 100 pontos em uma partida concluída; abre uma história opcional no Museu da Vila' },
  'shiny-1': { coins: 150, item: 'tiara-brilho' },
  // Torre de Sobrevivência.
  'torre-primeira': { coins: 50, item: 'fita-torre', origin: 'fita da Torre, por concluir sua primeira corrida' },
  'torre-treinador': { coins: 120, item: 'pin-treinador', origin: 'pino de treinador, por vencer alguém na Torre' },
  'torre-chefao': { coins: 400, item: 'trofeu-torre', origin: 'troféu da Torre, por derrotar o chefão final aos 20 minutos; abre uma história opcional no Museu da Vila', unlocks: 'modo Infinito' },
  'torre-infinito': { coins: 300, item: 'pin-chefao', origin: 'pino de chefão, por derrotar três chefões' },
  'torre-mestre': { coins: 500, item: 'capa-sobrevivente', origin: 'capa da Torre, por vencer dez treinadores' },
};

/** Acessório que uma conquista dá (para o Treinador mostrar o prêmio). */
export const prizeOf = (achievementId: string): Prize | undefined => PRIZES[achievementId];

export interface Claimed {
  coins: number;
  /** Nomes dos acessórios novos. */
  items: string[];
  /** Conquistas pagas agora, na ordem em que foram desbloqueadas. */
  ids: string[];
  /** Uma frase para o aviso da Vila. */
  note: string;
}

/**
 * Entrega os prêmios das conquistas que ainda não foram pagas (`unlocked`: id → dia, como no Treinador).
 * Roda de novo sem efeito: cada conquista só paga uma vez. Conquistas antigas pagam na primeira vez que a Vila abre.
 */
export function claimPrizes(s: VillageState, unlocked: Record<string, string>): Claimed | null {
  const done = new Set(s.claimed);
  const pending = ACHIEVEMENTS.filter((a) => unlocked[a.id] && !done.has(a.id)).sort((a, b) => (unlocked[a.id]! < unlocked[b.id]! ? -1 : unlocked[a.id]! > unlocked[b.id]! ? 1 : 0));
  if (pending.length === 0) return null;
  let coins = 0;
  const items: string[] = [];
  for (const a of pending) {
    s.claimed.push(a.id);
    const prize = PRIZES[a.id];
    if (!prize) continue;
    coins += prize.coins;
    if (prize.item && (s.inventory[prize.item] ?? 0) === 0) {
      add(s, prize.item);
      items.push(itemDef(prize.item)?.name ?? prize.item);
    }
  }
  s.coins = Math.min(999999, s.coins + coins);
  const first = pending[0]!.title;
  const what = [coins > 0 ? `${coins} moedas` : '', items.length > 0 ? items.join(', ') : ''].filter(Boolean).join(' e ');
  const head = pending.length === 1 ? `Conquista «${first}»` : `${pending.length} conquistas`;
  const provenance = pending.flatMap((a) => {
    const prize = PRIZES[a.id];
    if (!prize?.origin) return [];
    return [`${prize.origin}${prize.unlocks ? `; abre ${prize.unlocks}` : ''}.`];
  });
  const note = what ? `${head}: ${what} na Vila!` : `${head} registrada.`;
  return { coins, items, ids: pending.map((a) => a.id), note: provenance.length ? `${note} ${provenance.join(' ')}` : note };
}
