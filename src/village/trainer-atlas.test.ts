import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAYER_SPRITES } from '../core/trainer-sprites';
import { AVAILABLE_TRAINER_ATLASES, loadTrainerAtlas, trainerAtlasUrl } from './trainer-atlas';

describe('atlas local dos treinadores', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('tem endereço local para cada um dos 40 treinadores e respeita o base path', () => {
    expect(PLAYER_SPRITES).toHaveLength(40);
    for (const trainer of PLAYER_SPRITES) expect(trainerAtlasUrl(trainer.id, '/pokemon-tcg-ar/')).toBe(`/pokemon-tcg-ar/art/trainers/${trainer.id}.png`);
    expect(trainerAtlasUrl('../estranho', '/')).toBeNull();
    expect(AVAILABLE_TRAINER_ATLASES.every((id) => PLAYER_SPRITES.some((trainer) => trainer.id === id))).toBe(true);
    expect(AVAILABLE_TRAINER_ATLASES).toHaveLength(40);
  });

  it('inicia o download imediatamente e limita a espera mesmo quando o resultado só é consumido depois', async () => {
    vi.useFakeTimers();
    const requested: string[] = [];
    class PendingImage {
      decoding = '';
      set src(url: string) { requested.push(url); }
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
    }
    vi.stubGlobal('Image', PendingImage);
    const loading = loadTrainerAtlas('lucas');
    // A Vila começa a carga antes dos awaits do cache e só consome a promessa ao montar a cena.
    expect(requested).toEqual([trainerAtlasUrl('lucas')]);
    await vi.advanceTimersByTimeAsync(9000);
    expect(await loading).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(await loadTrainerAtlas('../inexistente')).toBeNull();
  });

});
