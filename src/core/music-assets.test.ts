import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VILLAGE_TRACKS } from './music';
import { SURVIVOR_TRACKS } from './survivor-music';

describe('arquivos de música publicados', () => {
  it('contém as 21 faixas reais, sem páginas HTML salvas como MP3', () => {
    const paths = [...VILLAGE_TRACKS.map(track => `village/${track[0]}`), ...SURVIVOR_TRACKS.map(track => `survival/${track[0]}`)];
    expect(new Set(paths).size).toBe(21);
    for (const path of paths) {
      const file = resolve('public/audio', `${path}.mp3`);
      expect(statSync(file).size, path).toBeGreaterThan(10_000);
      const bytes = readFileSync(file);
      expect(bytes.subarray(0, 3).toString() === 'ID3' || bytes[0] === 255 && (bytes[1]! & 224) === 224, path).toBe(true);
    }
  });
});
