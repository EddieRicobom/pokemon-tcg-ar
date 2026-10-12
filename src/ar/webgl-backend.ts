import { WebGLRenderer } from 'three';
import type { RenderBackend } from './session';

/** Desenho em WebGL sobre um canvas transparente (por cima do vídeo da câmera). */
export function createWebglBackend(canvas: HTMLCanvasElement): RenderBackend {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  return {
    render: (scene, camera) => renderer.render(scene, camera),
    setSize: (width, height) => renderer.setSize(width, height, false),
    dispose() {
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
