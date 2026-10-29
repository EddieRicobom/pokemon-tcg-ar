import { describe, expect, it } from 'vitest';
import { normalizeSurvivorMusicSettings } from './survivor-music';

describe('preferências de áudio da Torre', () => {
  it('mantém os sons de ataque ligados por padrão e aceita desligá-los separadamente', () => {
    expect(normalizeSurvivorMusicSettings(null).attackSounds).toBe(true);
    expect(normalizeSurvivorMusicSettings({ attackSounds: false }).attackSounds).toBe(false);
  });
});
