import { defineConfig } from 'vitest/config';

// Avaliação com rede e OCR de verdade (GitHub Actions). Não faz parte de `npm test`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.eval.ts'],
    testTimeout: 25 * 60 * 1000,
    hookTimeout: 5 * 60 * 1000,
  },
});
