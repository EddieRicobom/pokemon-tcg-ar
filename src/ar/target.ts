interface MindArCompiler {
  compileImageTargets(images: ImageBitmap[], progress: (percent: number) => void): Promise<unknown>;
  exportData(): Uint8Array;
  importData(buffer: ArrayBuffer): unknown[];
  data: unknown[];
}

/**
 * Versão do processo de compilação do alvo. Aumente quando mudar a imagem usada ou o compilador:
 * alvos guardados com versão diferente são descartados e recompilados (ver CardCache.prepareCard).
 * v1: imagem `low` (245 px de largura). v2: imagem `high` (600 px), com limite de tempo.
 */
export const TARGET_VERSION = 2;

/** O compilador roda num worker do MindAR que não avisa erros: sem limite de tempo, a tela ficaria esperando para sempre. */
export const COMPILE_TIMEOUT_MS = 120_000;

/**
 * Compila, no aparelho, o alvo de rastreamento (formato .mind) a partir da imagem de referência da
 * carta. Não existe alvo pré-registrado por carta: ele é criado na hora e guardado no cache.
 */
export async function compileTarget(reference: Blob, onProgress?: (percent: number) => void): Promise<Blob> {
  const { Compiler } = await import('mind-ar/src/image-target/compiler.js');
  const bitmap = await createImageBitmap(reference);
  try {
    const compiler = new Compiler() as MindArCompiler;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('A compilação do alvo de rastreamento demorou demais e foi cancelada.')), COMPILE_TIMEOUT_MS);
    });
    try {
      await Promise.race([compiler.compileImageTargets([bitmap], (percent) => onProgress?.(percent)), timeout]);
    } finally {
      clearTimeout(timer);
    }
    return new Blob([compiler.exportData() as BlobPart], { type: 'application/octet-stream' });
  } finally {
    bitmap.close();
  }
}

/**
 * Junta vários alvos compilados (um por carta, formato .mind) num só, na ordem dada: o índice do alvo no resultado
 * é a posição da carta na lista. É assim que o MindAR rastreia várias cartas ao mesmo tempo (o rastreador só
 * aceita um arquivo). Um arquivo de versão incompatível faz a junção falhar, em vez de ser ignorado em silêncio.
 */
export async function mergeTargets(buffers: readonly ArrayBuffer[]): Promise<ArrayBuffer> {
  if (buffers.length === 0) throw new Error('Nenhum alvo de rastreamento para juntar.');
  if (buffers.length === 1) return buffers[0]!;
  const { CompilerBase } = await import('mind-ar/src/image-target/compiler-base.js');
  const merged = new CompilerBase() as MindArCompiler;
  const all: unknown[] = [];
  buffers.forEach((buffer, i) => {
    const reader = new CompilerBase() as MindArCompiler;
    const list = reader.importData(buffer);
    if (list.length === 0) throw new Error(`O alvo ${i + 1} está vazio ou é de uma versão incompatível; recompile.`);
    all.push(...list);
  });
  merged.data = all;
  const out = merged.exportData();
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}
