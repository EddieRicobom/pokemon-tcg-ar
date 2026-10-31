import { spriteIdOf } from '../core/dex-form';
import { isShiny } from '../core/shiny';
import { friendLevel } from '../core/village/life';
import { displayName } from '../core/village/nickname';
import { digitalBoxRows } from './digital-members';
import { currentDexId } from './moveset-store';
import { getCache } from './services';
import { loadVillage } from './village-store';

/** Pokémon da equipe da Arena com o que a montagem de golpes e o duelo por turnos precisam. */
export interface ArenaMember {
  id: string;
  /** Apelido da Vila, se houver. */
  name: string;
  /** Espécie atual (já com a evolução da jornada); sem número da Pokédex não dá para buscar golpes. */
  dexId: number | undefined;
  shiny: boolean;
  /** Intimidade da Vila (0 a 4), a mesma da batalha da Caixa. */
  bond: number;
}

/** Monta os membros na ordem dos ids da equipe; quem sumiu do aparelho fica de fora. */
export async function loadArenaMembers(ids: readonly string[]): Promise<ArenaMember[]> {
  const village = loadVillage();
  const cards = await (await getCache()).list();
  const rows = [...cards, ...digitalBoxRows(village.digital)];
  return ids.flatMap((id) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return [];
    return [{
      id,
      name: displayName(village, id, row.name),
      dexId: currentDexId(id, spriteIdOf(row)),
      shiny: 'digital' in row ? false : isShiny(row),
      bond: friendLevel(village.friends[id]?.points ?? 0).level,
    }];
  });
}
