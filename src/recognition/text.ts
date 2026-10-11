/** Minúsculas, sem acentos e só letras/dígitos: base para comparar nomes lidos por OCR. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min((current[j - 1] ?? 0) + 1, (previous[j] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/**
 * Semelhança entre o nome lido e o nome do catálogo, em [0, 1]. Tolera erros de OCR e sufixos
 * ("Pikachu ex" lido como "Pikachu", ou o contrário): se um contém o outro, o mínimo é 0,85.
 */
export function nameSimilarity(read: string, catalog: string): number {
  const a = normalizeName(read);
  const b = normalizeName(catalog);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = levenshtein(a, b);
  const ratio = 1 - distance / Math.max(a.length, b.length);
  const shorter = Math.min(a.length, b.length);
  if (shorter >= 4 && (a.includes(b) || b.includes(a))) return Math.max(ratio, 0.85);
  return Math.max(0, ratio);
}
