import { describe, expect, it } from 'vitest';
import { aspectChanged, trackingSize } from './frame-relay';

describe('tamanho do quadro de rastreamento', () => {
  it('reduz 1080×1920 (câmera do celular) para 360×640 mantendo a proporção', () => {
    expect(trackingSize(1080, 1920)).toEqual({ width: 360, height: 640 });
  });
  it('paisagem 1920×1080 vira 640×360', () => {
    expect(trackingSize(1920, 1080)).toEqual({ width: 640, height: 360 });
  });
  it('não amplia vídeos pequenos', () => {
    expect(trackingSize(320, 240)).toEqual({ width: 320, height: 240 });
  });
});

describe('mudança de proporção da câmera', () => {
  it('ignora diferenças de arredondamento (<3%)', () => {
    expect(aspectChanged(360, 640, 1080, 1920)).toBe(false);
    expect(aspectChanged(360, 640, 1080, 1916)).toBe(false);
  });
  it('detecta quando a câmera passa de 16:9 para 4:3', () => {
    expect(aspectChanged(360, 640, 1440, 1920)).toBe(true);
  });
  it('detecta a rotação do aparelho', () => {
    expect(aspectChanged(360, 640, 1920, 1080)).toBe(true);
  });
});
