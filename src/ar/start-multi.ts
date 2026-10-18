import { CardSprite } from './card-sprite';
import { MindArEngine } from './mindar-engine';
import { MultiArSession } from './multi-session';
import type { MultiArState } from './multi-session';
import { loadSpriteInto } from './sprite-loader';
import type { SpriteLoadState } from './sprite-loader';
import type { SpriteSource } from './sprite-source';
import { createWebglBackend } from './webgl-backend';
import type { SpriteLayout } from './anchor';
import { sensorSettings } from '../app/sensor-settings';
import { getOrientationFeed } from '../sensors/orientation-feed';
import { MULTI_MAX_TRACK } from '../core/ar-limits';

/** Quantas cartas o rastreador acompanha ao mesmo tempo: cada uma custa tempo de processamento do celular. */
export { MULTI_MAX_TRACK } from '../core/ar-limits';
/** Memória dos quadros ampliados por Pokémon (várias cartas dividem a memória do aparelho). */
const SPRITE_FRAME_CACHE_BYTES = 10 * 1024 * 1024;

export interface MultiCard {
  cardId: string;
  name: string;
  dexId: number | undefined;
  /** Alvo de rastreamento compilado (.mind) desta carta. */
  target: ArrayBuffer;
  cachedSprite: SpriteSource | null;
  /** Carta shiny: halo dourado e estrelinhas em volta do Pokémon. */
  shiny?: boolean;
}

export interface StartMultiOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  cards: MultiCard[];
  fetchSprite: (dexId: number, shiny?: boolean) => Promise<SpriteSource | null>;
  onState: (state: MultiArState) => void;
  onSprite: (cardId: string, state: SpriteLoadState) => void;
}

export interface RunningMulti {
  session: MultiArSession;
  setLayout(layout: SpriteLayout): void;
  stop(): void;
}

/** Ponto de entrada do AR com várias cartas: tudo que usa Three.js e MindAR passa por aqui (import dinâmico). */
export async function startMulti(options: StartMultiOptions): Promise<RunningMulti> {
  const feed = getOrientationFeed();
  feed.acquire();
  const slots = options.cards.map((card) => {
    const sprite = new CardSprite({ frameCacheBytes: SPRITE_FRAME_CACHE_BYTES });
    sprite.setShiny(card.shiny === true);
    return { cardId: card.cardId, name: card.name, sprite };
  });
  const session = new MultiArSession({
    engine: new MindArEngine(),
    renderer: createWebglBackend(options.canvas),
    slots,
    maxTrack: MULTI_MAX_TRACK,
    orientation: feed,
    getGyroSettings: () => ({ gyro: sensorSettings.gyro, latencyMs: sensorSettings.latencyMs }),
    video: options.video,
    getContainerSize: () => ({ width: options.container.clientWidth, height: options.container.clientHeight }),
    onState: options.onState,
  });

  const loadSprites = Promise.all(
    options.cards.map((card, i) =>
      loadSpriteInto(
        slots[i]!.sprite,
        card.dexId,
        { getSprite: async (dexId) => card.cachedSprite ?? options.fetchSprite(dexId, card.shiny === true), decodeStatic: decodeAtNativeSize },
        (state) => options.onSprite(card.cardId, state),
      ),
    ),
  );

  const observer = new ResizeObserver(() => session.resize());
  observer.observe(options.container);
  try {
    // Cada sprite é independente do rastreamento e dos outros: uma falha vira marcador rotulado e o AR continua.
    await Promise.all([session.start(options.cards.map((card) => card.target)), loadSprites]);
  } catch (error) {
    observer.disconnect();
    feed.release();
    session.stop();
    throw error;
  }
  return {
    session,
    setLayout: (layout) => session.setLayout(layout),
    stop() {
      observer.disconnect();
      feed.release();
      session.stop();
    },
  };
}

async function decodeAtNativeSize(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D indisponível.');
    context.drawImage(bitmap, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width, height, data };
  } finally {
    bitmap.close();
  }
}
