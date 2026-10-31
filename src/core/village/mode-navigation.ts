import type { BuildingKind } from './town-layout';

/** Modos que podem ser abertos pelo atalho de "Lugares da Vila". */
export type VillageGamePlaceKind = Extract<BuildingKind, 'arcade' | 'arena' | 'torre' | 'masmorra'>;

/** Uma única fonte para os atalhos dos modos dentro do menu da Vila. */
export const VILLAGE_GAME_MENU: readonly { kind: VillageGamePlaceKind; icon: string; label: string }[] = [
  { kind: 'arcade', icon: '🕹️', label: 'Fliperama' },
  { kind: 'arena', icon: '⚔️', label: 'Arena' },
  { kind: 'torre', icon: '🗼', label: 'Torre' },
  { kind: 'masmorra', icon: '🗝️', label: 'Masmorra' },
];
