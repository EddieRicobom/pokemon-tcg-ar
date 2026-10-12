import { defineConfig } from '@playwright/test';

const base = process.env.BASE_PATH ?? '/pokemon-tcg-ar/';
const port = 4173;

/**
 * Teste de ponta a ponta com Chromium e CÂMERA FALSA (um vídeo gerado a partir de um escaneamento oficial
 * da carta). É um teste AUTOMATIZADO: não substitui a validação com a câmera e o GPU de um celular.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 8 * 60 * 1000,
  expect: { timeout: 30 * 1000 },
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'e2e/.tmp/pw-report.json' }]],
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 420, height: 900 },
    serviceWorkers: 'allow',
    trace: 'off',
  },
  webServer: {
    command: `npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}${base}`,
    reuseExistingServer: true,
    timeout: 60 * 1000,
    env: { BASE_PATH: base },
  },
});
