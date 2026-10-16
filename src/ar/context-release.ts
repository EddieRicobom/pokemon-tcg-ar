/**
 * Libera o contexto WebGL de um canvas que saiu da página. `renderer.dispose()` sozinho não devolve o contexto ao
 * navegador (só quando o coletor de lixo passar), e o Escanear recria o <canvas> a cada carta: sem isto, cada AR
 * deixava um contexto vivo e, depois de umas 16 leituras, o Chrome começava a derrubar o mais antigo — às vezes o
 * do TensorFlow.js do rastreador. Um canvas que continua na página (reaproveitado) NÃO perde o contexto: forçar a
 * perda nele quebraria a próxima sessão no mesmo elemento.
 */
export function releaseWhenDetached(
  canvas: { readonly isConnected: boolean },
  loseContext: () => void,
  schedule: (fn: () => void) => void = (fn) => setTimeout(fn, 0),
): void {
  // Espera o Vue tirar o canvas antigo da página (acontece logo depois de parar o AR).
  schedule(() => {
    if (!canvas.isConnected) loseContext();
  });
}

/**
 * Devolve na hora o contexto WebGL de um canvas que vai ser descartado (cola com o navegador; o Escanear chama antes
 * de recriar o canvas do AR). Pega o contexto existente pelo mesmo tipo que o Three.js cria (webgl2, senão webgl).
 */
export function loseCanvasContext(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  try {
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // Sem WebGL ou contexto já perdido: nada a liberar.
  }
}
