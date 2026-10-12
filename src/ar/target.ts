interface MindArCompiler {
  compileImageTargets(images: ImageBitmap[], progress: (percent: number) => void): Promise<unknown>;
  exportData(): ArrayBuffer;
}

/**
 * Compila, no aparelho, o alvo de rastreamento (formato .mind) a partir da imagem de referência da
 * carta. Não existe alvo pré-registrado por carta: ele é criado na hora e guardado no cache.
 */
export async function compileTarget(reference: Blob, onProgress?: (percent: number) => void): Promise<Blob> {
  const { Compiler } = await import('mind-ar/src/image-target/compiler.js');
  const bitmap = await createImageBitmap(reference);
  try {
    const compiler = new Compiler() as MindArCompiler;
    await compiler.compileImageTargets([bitmap], (percent) => onProgress?.(percent));
    return new Blob([compiler.exportData()], { type: 'application/octet-stream' });
  } finally {
    bitmap.close();
  }
}
