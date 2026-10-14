import { describe, expect, it } from 'vitest';
import { cameraFilterCss, CAMERA_FILTERS, normalizeVisual } from './visual-settings';

describe('configurações visuais', () => {
  it('normaliza valores inválidos para o padrão', () => {
    expect(normalizeVisual({ camera: 'xyz' as never, tone: 'abc' as never, outline: 'gold' })).toEqual({ camera: 'nenhum', tone: 'normal', outline: 'gold' });
    expect(normalizeVisual(null)).toEqual({ camera: 'nenhum', tone: 'normal', outline: 'none' });
  });

  it('cada filtro de câmera tem CSS válido e "Normal" não filtra', () => {
    expect(cameraFilterCss('nenhum')).toBe('none');
    for (const filter of CAMERA_FILTERS) expect(filter.css.length).toBeGreaterThan(0);
    expect(new Set(CAMERA_FILTERS.map((f) => f.id)).size).toBe(CAMERA_FILTERS.length);
  });
});
