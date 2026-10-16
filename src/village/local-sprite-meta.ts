/**
 * Metadados de corte dos sprites locais da Vila (`public/sprites/pokemon/<dexId>/`), derivados do port Android
 * (Godot) do PokéSurvivor (github.com/JayElDragon/poke-survivor): cada folha é uma grade de `n` colunas (quadros
 * da animação) por `r` linhas (direção, sentido horário a partir de baixo). A arte em si vem do PMD SpriteCollab
 * (github.com/PMDCollab/SpriteCollab), licença CC BY-NC 4.0 — uso não comercial, com atribuição (ver
 * THIRD_PARTY_NOTICES.md). `d[i]` é a duração do quadro `i` em ticks de 60 quadros por segundo (como no jogo
 * original); aqui convertemos para milissegundos.
 */

/** Linhas da grade, sentido horário a partir de baixo (igual ao port Android). */
export const DIRECTION_ROWS = {
  down: 0,
  downRight: 1,
  right: 2,
  upRight: 3,
  up: 4,
  upLeft: 5,
  left: 6,
  downLeft: 7,
} as const;

export type DirectionRow = (typeof DIRECTION_ROWS)[keyof typeof DIRECTION_ROWS];

export interface LocalSpriteAnim {
  /** Largura de um quadro, em pixels. */
  w: number;
  /** Altura de um quadro, em pixels. */
  h: number;
  /** Número de quadros (colunas). */
  n: number;
  /** Número de direções (linhas). */
  r: number;
  /** Duração de cada quadro, em ticks de 60 fps (`d.length === n`). */
  d: number[];
}

export interface LocalSpriteEntry {
  /** Animações disponíveis para esta espécie (nomes como no port: "Idle", "Walk", "Shoot"...). */
  a: Record<string, LocalSpriteAnim>;
  /** Tem variante shiny guardada em `s/`. */
  sh?: number;
}

export type LocalSpriteMeta = Record<string, LocalSpriteEntry>;

const MS_PER_TICK = 1000 / 60;

/** Duração de cada quadro em milissegundos (nunca menos de 1 ms, mesmo com `d[i]` zerado). */
export function frameDurationsMs(anim: LocalSpriteAnim): number[] {
  return anim.d.map((ticks) => Math.max(1, Math.round(ticks * MS_PER_TICK)));
}

/** Dimensões esperadas da folha inteira (todas as direções e quadros de uma animação). */
export function sheetSize(anim: LocalSpriteAnim): { width: number; height: number } {
  return { width: anim.w * anim.n, height: anim.h * anim.r };
}

/** A espécie tem animação `name` nos metadados locais. */
export function hasLocalAnim(meta: LocalSpriteMeta, dexId: number, name: string): boolean {
  return meta[String(dexId)]?.a[name] !== undefined;
}

/** A espécie tem a variante shiny guardada (`s/<animação>.png`). */
export function hasLocalShiny(meta: LocalSpriteMeta, dexId: number): boolean {
  return meta[String(dexId)]?.sh === 1;
}
