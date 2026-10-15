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
  'liga-insignia': { coins: 100, item: 'insignia' },
  'liga-oito': { coins: 400, item: 'capa-liga' },
  'liga-campea': { coins: 600, item: 'louros' },
  'pvp-1': { coins: 60 },
  'pvp-vitoria': { coins: 120, item: 'faixa-vencedor' },
  'shiny-1': { coins: 150, item: 'tiara-brilho' },
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
  return { coins, items, ids: pending.map((a) => a.id), note: what ? `${head}: ${what} na Vila!` : `${head} registrada.` };
}
