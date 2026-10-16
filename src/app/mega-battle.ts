import { MEGA_ENERGY_COST } from '../core/mega';
import type { BattleLoader } from './battle-setup';
import { planMegaEvolutions } from './mega-data';
import type { MegaPrepared, MegaReady } from './mega-data';

export interface MegaCandidate {
  id: string;
  name: string;
  /** Número da Pokédex da espécie base (da carta). */
  baseDexId: number | undefined;
  /** A carta é shiny: a forma Mega também usa o sprite shiny, se existir. */
  shiny?: boolean;
}

/** Uma troca de forma pronta: dados da PokéAPI e o sprite já decodificado (`S` é o que a Caixa usa para desenhar). */
export type MegaEntry<S> = MegaReady & { source: S };

export interface MegaBattlePlan<S> {
  /** Quem vai lutar na forma Mega nesta batalha, na ordem em que foram marcados. */
  entries: MegaEntry<S>[];
  /** Energia a cobrar (só depois que tudo estiver pronto). */
  cost: number;
  /** O que o jogador precisa saber: quem ficou na forma normal e por quê (em português). */
  notes: string[];
}

export interface MegaBattleDeps<S> {
  prepare: (candidate: MegaCandidate) => Promise<MegaPrepared>;
  decode: (ready: MegaReady) => Promise<S>;
}

/**
 * Monta as trocas para a Mega da próxima batalha. Primeiro tenta deixar tudo pronto para cada marcado (forma, atributos,
 * sprite e imagem); só depois escolhe quantos as moedas pagam, na ordem marcada. Nada é cobrado aqui: quem chama cobra
 * `cost` uma vez, depois que a batalha foi montada. Quem não ficou pronto, ou não coube nas moedas, luta na forma normal.
 */
export async function planMegaBattle<S>(
  candidates: readonly MegaCandidate[],
  energy: number,
  deps: MegaBattleDeps<S>,
  cost = MEGA_ENERGY_COST,
): Promise<MegaBattlePlan<S>> {
  if (candidates.length === 0) return { entries: [], cost: 0, notes: [] };
  const notes: string[] = [];
  const settled = await Promise.all(
    candidates.map(async (candidate): Promise<MegaEntry<S> | null> => {
      try {
        const prepared = await deps.prepare(candidate);
        if (!prepared.ok) {
          notes.push(prepared.reason);
          return null;
        }
        return { ...prepared.ready, source: await deps.decode(prepared.ready) };
      } catch (error) {
        notes.push(`${candidate.name}: não consegui preparar a forma Mega (${error instanceof Error ? error.message : String(error)}). Luta na forma normal e não gasta moedas.`);
        return null;
      }
    }),
  );
  const ready = settled.filter((entry): entry is MegaEntry<S> => entry !== null);
  const { afford } = planMegaEvolutions(ready.length, energy, cost);
  const entries = ready.slice(0, afford);
  for (const left of ready.slice(afford)) {
    const name = candidates.find((c) => c.id === left.cardId)?.name ?? 'Pokémon';
    notes.push(`${name}: sem moedas para a forma Mega (cada troca custa ${cost}). Luta na forma normal.`);
  }
  return { entries, cost: entries.length * cost, notes };
}

/**
 * O carregador de dados da batalha, com a forma Mega no lugar certa: tipos e atributos vêm da forma Mega; golpes do jogo
 * e ataques da carta continuam os da espécie e da carta.
 */
export function megaAwareLoader(base: BattleLoader, entries: readonly Pick<MegaReady, 'cardId' | 'profile'>[]): BattleLoader {
  const byCard = new Map(entries.map((entry) => [entry.cardId, entry.profile]));
  return (cardId, dexId, onPart) => {
    const profile = byCard.get(cardId);
    if (!profile) return base(cardId, dexId, onPart);
    onPart('profile', { state: 'ok', value: profile });
    return base(cardId, dexId, (part, result) => {
      if (part === 'profile') return;
      onPart(part, result);
    });
  };
}
