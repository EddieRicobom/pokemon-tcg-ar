/** Retorna o próximo extremo quando Tab sairia da janela; null deixa o navegador avançar. */
export function wrappedFocusIndex(current: number, count: number, backwards: boolean): number | null {
  if (count < 1) return null;
  if (current < 0) return backwards ? count - 1 : 0;
  if (backwards && current === 0) return count - 1;
  if (!backwards && current === count - 1) return 0;
  return null;
}
