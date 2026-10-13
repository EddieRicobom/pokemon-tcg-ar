import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// Só para validar o AR no navegador de teste (câmera falsa). Não faz parte do app publicado.
export default defineConfig({
  root: resolve(here, '..'),
  base: './',
  build: { outDir: 'e2e/.tmp/harness-dist', emptyOutDir: true, rollupOptions: { input: resolve(here, 'ar-harness.html') } },
});
