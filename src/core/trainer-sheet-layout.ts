/**
 * Limites [0, ...cortes, comprimento] para recortar bandas de uma folha transparente.
 * Cada entrada conta os pixels com alfa >= limiar do chamador naquela linha/coluna.
 * Intervalos são [limites[i], limites[i + 1]); null significa separação ambígua/inválida.
 * Não desenha, remove nem modifica pixels: todo corte interior fica no meio de um vale
 * completamente transparente, perto da divisão nominal. O mesmo algoritmo serve aos dois eixos.
 */
export function sheetCuts(histogram: readonly number[], bands = 4): number[] | null {
  if (!Number.isInteger(bands) || bands < 1 || histogram.length < bands ||
      histogram.some((value) => !Number.isFinite(value) || value < 0)) return null;
  const pitch = histogram.length / bands;
  // Uma linha vazia isolada pode ser um detalhe dentro do corpo; queremos um corredor.
  const minGap = Math.max(2, Math.ceil(pitch * 0.02));
  const gaps: { start: number; end: number; middle: number }[] = [];
  for (let index = 0; index < histogram.length;) {
    if (histogram[index] !== 0) { index++; continue; }
    const start = index;
    while (index < histogram.length && histogram[index] === 0) index++;
    const end = index;
    // Margens externas não são separações entre personagens.
    if (start > 0 && end < histogram.length && end - start >= minGap) {
      gaps.push({ start, end, middle: (start + end) / 2 });
    }
  }
  const cuts = [0];
  const used = new Set<number>();
  for (let band = 1; band < bands; band++) {
    const expected = band * pitch;
    const candidates = gaps
      .map((gap, index) => ({ ...gap, index, distance: Math.abs(gap.middle - expected) }))
      .filter((gap) => !used.has(gap.index) && gap.distance <= pitch * 0.35)
      .sort((a, b) => a.distance - b.distance || (b.end - b.start) - (a.end - a.start) || a.start - b.start);
    const gap = candidates[0];
    if (!gap) return null;
    const cut = Math.floor(gap.middle);
    if (cut <= cuts[cuts.length - 1]!) return null;
    cuts.push(cut);
    used.add(gap.index);
  }
  cuts.push(histogram.length);
  // Nenhuma banda pode ser uma margem vazia ou perder toda a personagem.
  for (let band = 0; band < bands; band++) {
    if (!histogram.slice(cuts[band]!, cuts[band + 1]!).some((value) => value > 0)) return null;
  }
  return cuts;
}
