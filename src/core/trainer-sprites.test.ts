import { describe, expect, it } from 'vitest';
import { ALL_CHALLENGES } from './league';
import { DEFAULT_TRAINER_SPRITE, normalizeTrainerSprite, PLAYER_SPRITES, trainerSprite, trainerSpriteUrl } from './trainer-sprites';

describe('sprites de treinador', () => {
  it('ids únicos e endereços no repositório de sprites do Showdown', () => {
    expect(new Set(PLAYER_SPRITES.map((s) => s.id)).size).toBe(PLAYER_SPRITES.length);
    expect(PLAYER_SPRITES.length).toBeGreaterThanOrEqual(30);
    expect(trainerSpriteUrl('dawn')).toBe('https://raw.githubusercontent.com/smogon/sprites/master/src/_uncategorized/canonical/trainers/gen4/platinum/Dawn.png');
    for (const c of ALL_CHALLENGES) {
      // Kalos não está no repositório da Smogon: vem do servidor do Showdown.
      if (c.region === 'kalos') expect(trainerSpriteUrl(c.sprite)).toMatch(/^https:\/\/play\.pokemonshowdown\.com\/sprites\/trainers\/[a-z]+\.png$/);
      else expect(trainerSpriteUrl(c.sprite)).toMatch(/\/gen[345]\/[-a-z0-9]+\/[A-Za-z_.]+\.png$/);
    }
  });

  it('escolha desconhecida vira o padrão', () => {
    expect(normalizeTrainerSprite('n')).toBe('n');
    expect(normalizeTrainerSprite('xx')).toBe(DEFAULT_TRAINER_SPRITE);
    expect(normalizeTrainerSprite(3)).toBe(DEFAULT_TRAINER_SPRITE);
    expect(trainerSprite('xx').id).toBe(DEFAULT_TRAINER_SPRITE);
  });
});
