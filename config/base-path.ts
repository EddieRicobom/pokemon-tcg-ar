/**
 * Caminho base do site. No GitHub Pages de projeto o app fica em
 * https://<usuario>.github.io/<repositorio>/, então todos os assets precisam
 * ser servidos a partir de "/<repositorio>/".
 */
export const DEFAULT_BASE_PATH = '/pokemon-tcg-ar/';

/** Garante barra inicial e final e remove barras duplicadas. */
export function normalizeBasePath(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (value === '') return DEFAULT_BASE_PATH;

  const collapsed = `/${value}/`.replace(/\/{2,}/g, '/');
  return collapsed;
}
