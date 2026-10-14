import { CardSprite } from './card-sprite';
import { MindArEngine } from './mindar-engine';
import { ArSession } from './session';
import type { ArState } from './session';
import { loadSpriteInto } from './sprite-loader';
import type { SpriteLoadState } from './sprite-loader';
import type { SpriteSource } from './sprite-source';
import { StatsPanel } from './stats-panel';
import { createWebglBackend } from './webgl-backend';
import type { BattleData, PartName } from '../app/pokemon-data-service';
import { sensorSettings } from '../app/sensor-settings';
import { getOrientationFeed } from '../sensors/orientation-feed';

export interface StartArOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  /** Alvo de rastreamento compilado (.mind). */
  target: ArrayBuffer;
  dexId: number | undefined;
  /** Carta shiny: halo dourado e estrelinhas em volta do Pokémon. */
  shiny?: boolean;
  /** Sprite já guardado no cache (se houver); senão busca na rede. */
  cachedSprite?: SpriteSource | null;
  fetchSprite: (dexId: number) => Promise<SpriteSource | null>;
  /** Painel de status no chão: nome da carta e carregador dos dados (PokéAPI + TCGdex). Sem isso, não há painel. */
  battle?: {
    name: string;
    load: (onPart: <K extends PartName>(part: K, result: BattleData[K]) => void) => Promise<void>;
  };
  onState: (state: ArState) => void;
  onSprite: (state: SpriteLoadState) => void;
}

export interface RunningAr {
  session: ArSession;
  sprite: CardSprite;
  panel: StatsPanel | null;
  reloadSprite(): Promise<void>;
  stop(): void;
}

/** Ponto de entrada do AR: tudo que usa Three.js e MindAR passa por aqui (import dinâmico). */
export async function startAr(options: StartArOptions): Promise<RunningAr> {
  const feed = getOrientationFeed();
  feed.acquire();
  const sprite = new CardSprite();
  sprite.setShiny(options.shiny === true);
  const panel = options.battle ? new StatsPanel(options.battle.name, options.dexId) : null;
  const session = new ArSession({
    engine: new MindArEngine(),
    renderer: createWebglBackend(options.canvas),
    sprite,
    panel: panel ?? undefined,
    orientation: feed,
    getGyroSettings: () => ({ gyro: sensorSettings.gyro, latencyMs: sensorSettings.latencyMs }),
    video: options.video,
    getContainerSize: () => ({ width: options.container.clientWidth, height: options.container.clientHeight }),
    onState: options.onState,
  });

  const loadSprite = async () => {
    await loadSpriteInto(
      sprite,
      options.dexId,
      {
        getSprite: async (dexId) => options.cachedSprite ?? options.fetchSprite(dexId),
        decodeStatic: decodeAtNativeSize,
      },
      options.onSprite,
    );
  };

  const observer = new ResizeObserver(() => session.resize());
  observer.observe(options.container);
  try {
    // O sprite é independente do rastreamento: se o GIF falhar, o AR continua (e a falha aparece na tela).
    await Promise.all([session.start(options.target), loadSprite()]);
  } catch (error) {
    observer.disconnect();
    feed.release();
    session.stop(); // libera motor, WebGL e sprite para a próxima tentativa
    throw error;
  }

  // Os dados do painel chegam em paralelo e por partes; falhas aparecem no próprio painel e não afetam o AR.
  if (options.battle && panel) {
    void options.battle
      .load((part, result) => panel.setPart(part, result))
      .catch((error: unknown) => {
        const message = `Falha ao carregar os dados: ${error instanceof Error ? error.message : String(error)}`;
        for (const part of ['profile', 'moves', 'card'] as const) panel.setPart(part, { state: 'error', message });
      });
  }

  return {
    session,
    sprite,
    panel,
    reloadSprite: async () => {
      options.cachedSprite = null;
      await loadSprite();
    },
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
    return blobToRgbaFromBitmap(bitmap);
  } finally {
    bitmap.close();
  }
}

function blobToRgbaFromBitmap(bitmap: ImageBitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D indisponível.');
  context.drawImage(bitmap, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width, height, data };
}
