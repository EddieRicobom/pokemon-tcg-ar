import { describe, expect, it } from 'vitest';
import { ARTIFACT_ICONS, ICON_SIZE, paintArtifactIcon } from './artifact-icons-art';
import type { SurvivorArtifactKind } from '../core/survivor-types';

const KINDS = Object.keys(ARTIFACT_ICONS) as SurvivorArtifactKind[];

describe('ícones dos artefatos', () => {
  it('todo mapa é um quadrado de 16 por 16', () => {
    for (const kind of KINDS) {
      const { rows } = ARTIFACT_ICONS[kind];
      expect(rows).toHaveLength(ICON_SIZE);
      for (const row of rows) expect(row).toHaveLength(ICON_SIZE);
    }
  });

  it('toda letra do mapa tem cor na paleta', () => {
    for (const kind of KINDS) {
      const { rows, palette } = ARTIFACT_ICONS[kind];
      for (const letter of new Set(rows.join(''))) {
        if (letter !== '.' && letter !== 'k') expect(palette[letter], `${kind}: ${letter}`).toBeDefined();
      }
    }
  });

  it('cada artefato tem desenho próprio', () => {
    expect(new Set(KINDS.map((kind) => paintArtifactIcon(kind).join())).size).toBe(KINDS.length);
  });
});
