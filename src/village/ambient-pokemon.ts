import { getLocalVillageSpriteDirs } from '../app/services';
import { frameIndexAt, type DecodedGif } from '../core/gif';
import { speciesTiles } from '../core/size-scale';
import { contentBounds } from './local-sprite';
import { framesOf } from './village-game-support';

type FlightDirection = 'left' | 'right';

function prepareFlight(gif: DecodedGif, heightTiles: number) {
  const { top, bottom, left, right } = contentBounds(gif);
  const height = heightTiles / (bottom - top);
  const width = height * gif.width / gif.height;
  return { gif, frames: framesOf(gif), width, height, centerX: width * (left + right) / 2, centerY: height * (top + bottom) / 2 };
}

type FlightSprite = Partial<Record<FlightDirection, ReturnType<typeof prepareFlight>>>;

export class AmbientPokemon {
  private readonly sprites = new Map<number, FlightSprite>();

  constructor(private readonly styleFrame: (frame: HTMLCanvasElement) => HTMLCanvasElement) {}

  draw(ctx: CanvasRenderingContext2D, dexId: number, facing: FlightDirection, time: number, x: number, y: number, tileSize: number): boolean {
    // Evita carregar ou desenhar poses para pontos de voo fora da tela.
    if (x < -tileSize || y < -tileSize || x > ctx.canvas.width + tileSize || y > ctx.canvas.height + tileSize) return false;
    let poses = this.sprites.get(dexId);
    if (!poses) {
      const heightTiles = speciesTiles(dexId);
      if (heightTiles === undefined) return false;
      const loading: FlightSprite = {};
      this.sprites.set(dexId, loading);
      void getLocalVillageSpriteDirs(dexId, false, 'Walk').then((gifs) => {
        if (gifs?.left) loading.left = prepareFlight(gifs.left, heightTiles);
        if (gifs?.right) loading.right = prepareFlight(gifs.right, heightTiles);
      });
      poses = loading;
    }
    const pose = poses[facing];
    if (!pose) return false;
    const frame = pose.frames[frameIndexAt(pose.gif, time)];
    if (!frame) return false;
    ctx.drawImage(this.styleFrame(frame), Math.round(x - pose.centerX * tileSize), Math.round(y - pose.centerY * tileSize),
      pose.width * tileSize, pose.height * tileSize);
    return true;
  }
}
