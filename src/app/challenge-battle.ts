import type { SpriteSource } from '../ar/sprite-source';
import type { Fighter } from '../core/battle';
import { speciesName } from '../core/league';
import type { Challenge } from '../core/league';
import type { BattleLoader } from './battle-setup';

/** Como a Caixa desenha um Pokémon (o mesmo formato de `CreatureEntry`, sem depender de Three.js aqui). */
export interface LeaderEntry<S> {
  info: { id: string; name: string; dexId: number; detail: string };
  source: S;
}

export const leaderCreatureId = (challenge: Challenge, i: number): string => `lider:${challenge.id}:${i}`;
export const isLeaderCreature = (id: string): boolean => id.startsWith('lider:');

/**
 * Baixa e decodifica os sprites da equipe do líder (rede: PokeAPI/sprites). Um Pokémon que não carregar fica de fora e
 * vai para `failed`; sem nenhum, quem chama avisa e não começa a batalha.
 */
export async function loadLeaderEntries<S>(
  challenge: Challenge,
  deps: { fetchSprite: (dex: number) => Promise<SpriteSource | null>; decode: (sprite: SpriteSource) => Promise<S> },
): Promise<{ entries: LeaderEntry<S>[]; failed: string[] }> {
  const results = await Promise.all(
    challenge.team.map(async (dex, i) => {
      const name = speciesName(dex);
      try {
        const sprite = await deps.fetchSprite(dex);
        if (!sprite) return { failed: name };
        const source = await deps.decode(sprite);
        return { entry: { info: { id: leaderCreatureId(challenge, i), name, dexId: dex, detail: `${challenge.role} ${challenge.leader}` }, source } };
      } catch {
        return { failed: name };
      }
    }),
  );
  return {
    entries: results.flatMap((r) => ('entry' in r && r.entry ? [r.entry] : [])),
    failed: results.flatMap((r) => ('failed' in r && r.failed ? [r.failed] : [])),
  };
}

/**
 * Lutador do líder: atributos multiplicados por `power` (a dificuldade do desafio). Os Pokémon do líder não vêm de
 * cartas, então o aviso "sem os ataques da carta" não vale para eles e sai da lista.
 */
export function leaderFighter(f: Fighter, power: number): Fighter {
  const k = Math.max(0.5, Math.min(2, power));
  return {
    ...f,
    maxHp: Math.round(f.maxHp * k),
    attack: Math.round(f.attack * k),
    defense: Math.round(f.defense * k),
    spAttack: Math.round(f.spAttack * k),
    spDefense: Math.round(f.spDefense * k),
    speed: Math.round(f.speed * k),
    notes: f.notes.filter((n) => !n.includes('ataques da carta')),
  };
}

/** Carregador de dados para os Pokémon do líder: só a parte dos jogos (sem carta para consultar no TCGdex). */
export function leaderLoader(base: BattleLoader): BattleLoader {
  return (cardId, dexId, onPart) => {
    if (!isLeaderCreature(cardId)) return base(cardId, dexId, onPart);
    onPart('card', { state: 'error', message: '' });
    return base(cardId, dexId, (part, result) => {
      if (part !== 'card') onPart(part, result);
    });
  };
}

/** Plano do desafio: os seus (equipe 0) contra os do líder (equipe 1), em revezamento, com a faixa do líder. */
export function challengePlan(playerCount: number, leaderCount: number, challenge: Challenge, playerName: string) {
  const picks = Array.from({ length: playerCount + leaderCount }, (_, i) => i);
  const teams = picks.map((i) => (i < playerCount ? 0 : 1));
  const title = challenge.kind === 'champion' ? 'A Campeã desafia você!' : `${challenge.leader} desafia você!`;
  return {
    picks,
    teams,
    relay: true,
    teamNames: [playerName, challenge.leader],
    banner: { text: title, sub: `${challenge.role} · ${playerCount} contra ${leaderCount}, um duelo por vez` },
  };
}

/** Equipe do jogador num desafio: até 6 da caixa, na ordem da caixa. */
export const MAX_CHALLENGE_TEAM = 6;
