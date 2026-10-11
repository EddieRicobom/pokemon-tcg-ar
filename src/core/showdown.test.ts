import { describe, expect, it } from 'vitest';
import { showdownSpriteUrl, toShowdownId } from './showdown';

describe('toShowdownId', () => {
  it('remove pontuação, espaços e hífens e passa para minúsculas', () => {
    expect(toShowdownId('Mr. Mime')).toBe('mrmime');
    expect(toShowdownId("Farfetch'd")).toBe('farfetchd');
    expect(toShowdownId('Ho-Oh')).toBe('hooh');
    expect(toShowdownId('Porygon-Z')).toBe('porygonz');
  });

  it('remove acentos', () => {
    expect(toShowdownId('Flabébé')).toBe('flabebe');
  });

  it('converte os símbolos de gênero do Nidoran', () => {
    expect(toShowdownId('Nidoran♀')).toBe('nidoranf');
    expect(toShowdownId('Nidoran♂')).toBe('nidoranm');
  });

  it('devolve vazio quando não sobra nenhum caractere válido', () => {
    expect(toShowdownId('!!! ---')).toBe('');
  });
});

describe('showdownSpriteUrl', () => {
  it('monta a URL da animação de frente', () => {
    expect(showdownSpriteUrl('Charizard')).toBe(
      'https://play.pokemonshowdown.com/sprites/ani/charizard.gif',
    );
  });

  it('inclui a forma alternativa depois de um hífen', () => {
    expect(showdownSpriteUrl('Charizard', { forme: 'Mega X' })).toBe(
      'https://play.pokemonshowdown.com/sprites/ani/charizard-megax.gif',
    );
  });

  it('escolhe o diretório conforme a variante', () => {
    expect(showdownSpriteUrl('Pikachu', { variant: 'back' })).toContain('/ani-back/');
    expect(showdownSpriteUrl('Pikachu', { variant: 'shiny' })).toContain('/ani-shiny/');
    expect(showdownSpriteUrl('Pikachu', { variant: 'back-shiny' })).toContain('/ani-back-shiny/');
  });

  it('rejeita nomes vazios ou sem caracteres válidos', () => {
    expect(() => showdownSpriteUrl('')).toThrow(RangeError);
    expect(() => showdownSpriteUrl('???')).toThrow(RangeError);
  });
});
