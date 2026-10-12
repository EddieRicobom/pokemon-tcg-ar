import { describe, expect, it } from 'vitest';
import { encodeGif } from '../core/__fixtures__/encode-gif';
import type { Rgb } from '../core/__fixtures__/encode-gif';
import { CardSprite } from './card-sprite';
import { makePlaceholder } from './placeholder';
import { loadSpriteInto } from './sprite-loader';
import { SpriteNetworkError } from './sprite-source';
import type { SpriteSource } from './sprite-source';

const PALETTE: [Rgb, Rgb, Rgb, Rgb] = [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255]];
const gifBlob = () => {
  const frame = (c: number) => ({ left: 0, top: 0, width: 2, height: 2, indices: [c, c, c, c], delayCs: 5, disposal: 1 });
  return new Blob([encodeGif(2, 2, PALETTE, [frame(1), frame(2)])], { type: 'image/gif' });
};
const gif: SpriteSource = { kind: 'gif', url: 'https://x/25.gif', blob: gifBlob() };

// happy-dom: Blob.arrayBuffer existe; garantimos com um GIF real.
describe('loadSpriteInto', () => {
  it('GIF existente: anima', async () => {
    const sprite = new CardSprite();
    const states: string[] = [];
    const result = await loadSpriteInto(sprite, 25, { getSprite: async () => gif }, (s) => states.push(s.kind));
    expect(result).toMatchObject({ kind: 'animated', frames: 2 });
    expect(sprite.mode).toBe('animated');
    expect(states).toEqual(['loading', 'animated']);
  });

  it('só PNG estático (ex.: Miraidon): mostra parado e diz isso', async () => {
    const sprite = new CardSprite();
    const result = await loadSpriteInto(sprite, 1008, {
      getSprite: async () => ({ kind: 'static', url: 'https://x/1008.png', blob: new Blob(['png']) }),
      decodeStatic: async () => makePlaceholder(8),
    });
    expect(result.kind).toBe('static');
    expect(sprite.mode).toBe('static');
    expect((result as { reason: string }).reason).toMatch(/GIF/);
  });

  it('nenhum sprite: marcador e motivo, sem fingir que é o Pokémon', async () => {
    const sprite = new CardSprite();
    const result = await loadSpriteInto(sprite, 999999, { getSprite: async () => null });
    expect(result.kind).toBe('placeholder');
    expect(sprite.mode).toBe('placeholder');
  });

  it('carta sem Pokémon (Treinador/Energia): marcador', async () => {
    const sprite = new CardSprite();
    const result = await loadSpriteInto(sprite, undefined);
    expect(result.kind).toBe('placeholder');
  });

  it('falha de rede: erro (dá para tentar de novo) e nada na tela', async () => {
    const sprite = new CardSprite();
    const result = await loadSpriteInto(sprite, 25, { getSprite: async () => { throw new SpriteNetworkError('Sem conexão', 'x'); } });
    expect(result).toEqual({ kind: 'error', message: 'Sem conexão' });
    expect(sprite.mode).toBe('empty');
  });

  it('GIF corrompido: erro explícito, não troca em silêncio por imagem parada', async () => {
    const sprite = new CardSprite();
    const bad: SpriteSource = { kind: 'gif', url: 'https://x/bad.gif', blob: new Blob(['não é um gif']) };
    const result = await loadSpriteInto(sprite, 25, { getSprite: async () => bad });
    expect(result.kind).toBe('error');
    expect(sprite.mode).toBe('empty');
  });
});
