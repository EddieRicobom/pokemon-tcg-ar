/** Páginas do painel no chão e a escolha da página (puro, testável). */
export const PANEL_PAGES = ['status', 'attacks', 'moves'] as const;
export type PanelPage = (typeof PANEL_PAGES)[number];
export type PanelMode = 'auto' | PanelPage;

export const PANEL_PAGE_LABELS_PT: Record<PanelPage, string> = {
  status: 'Status',
  attacks: 'Ataques da carta',
  moves: 'Golpes do jogo',
};

/** Tempo (ms) em cada página no modo automático. */
export const PAGE_INTERVAL_MS = 6000;

export function choosePage(mode: PanelMode, elapsedMs: number, intervalMs = PAGE_INTERVAL_MS): PanelPage {
  if (mode !== 'auto') return mode;
  const index = Math.floor(Math.max(0, elapsedMs) / intervalMs) % PANEL_PAGES.length;
  return PANEL_PAGES[index]!;
}

/** Depois de quanto tempo escondido o painel recomeça a animação ao reaparecer (ms). */
export const REAPPEAR_AFTER_MS = 2000;

/** Quebra o texto em até `maxLines` linhas de no máximo `maxWidth` (medida injetada); a última termina em "…" se cortar. */
export function wrapText(measure: (text: string) => number, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  let index = 0;
  for (; index < words.length; index++) {
    const word = words[index]!;
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  const consumedAll = index >= words.length;
  if (!consumedAll || lines.length > maxLines) {
    const last = Math.min(lines.length, maxLines) - 1;
    lines.length = Math.min(lines.length, maxLines);
    let line = lines[last] ?? '';
    while (line.length > 1 && measure(`${line}…`) > maxWidth) line = line.slice(0, -1);
    lines[last] = `${line}…`;
  }
  // Uma palavra sozinha pode ser maior que a linha: corta com reticências em vez de passar da borda.
  return lines.map((line) => {
    if (measure(line) <= maxWidth) return line;
    let cut = line.replace(/…$/, '');
    while (cut.length > 1 && measure(`${cut}…`) > maxWidth) cut = cut.slice(0, -1);
    return `${cut}…`;
  });
}
