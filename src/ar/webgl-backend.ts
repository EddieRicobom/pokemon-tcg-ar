import { WebGLRenderer } from 'three';
import type { RenderBackend } from './session';

/** Desenho em WebGL sobre um canvas transparente (por cima do vídeo da câmera). */
export function createWebglBackend(canvas: HTMLCanvasElement): RenderBackend {
  // Opções seguras para navegadores móveis:
  // - precision: 'mediump' evita consultas a highp com retorno nulo se a GPU móvel estiver sob carga.
  // - antialias: false economiza buffers pesados de multisampling na GPU.
  // - powerPreference: 'default' evita conflitos com o contexto do MindAR/TensorFlow.js.
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      precision: 'mediump',
      powerPreference: 'default',
    });
  } catch {
    // Fallback básico caso o navegador recuse os parâmetros adicionais
    renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
    });
  }

  renderer.setClearColor(0x000000, 0);
  // 1,5 no máximo: o rastreador (TensorFlow.js) usa a mesma GPU, e o Pokémon é um GIF de poucos pixels, então a
  // diferença para 2 não aparece, mas a tela cheia com 3× de densidade tiraria quadros do rastreador.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  return {
    render: (scene, camera) => renderer.render(scene, camera),
    setSize: (width, height) => renderer.setSize(width, height, false),
    dispose() {
      // Importante: NÃO chamar renderer.forceContextLoss() aqui.
      // O forceContextLoss() invalida permanentemente o contexto do HTMLCanvasElement no DOM,
      // quebrando qualquer sessão subsequente no mesmo elemento.
      renderer.dispose();
    },
  };
}
