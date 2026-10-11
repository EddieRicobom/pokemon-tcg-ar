import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { normalizeBasePath } from './config/base-path.ts';

// No CI o valor vem de BASE_PATH=/<nome-do-repositório>/ (GitHub Pages de projeto).
const base = normalizeBasePath(process.env.BASE_PATH);

export default defineConfig({
  base,
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: base,
        name: 'Pokémon TCG AR',
        short_name: 'TCG AR',
        description:
          'Aponte a câmera para uma carta de Pokémon TCG e veja o Pokémon animado em pé sobre ela, em realidade aumentada.',
        lang: 'pt-BR',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#10172a',
        theme_color: '#10172a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // O OCR (≈ 6,7 MB no primeiro uso) e o índice do catálogo não entram no pré-cache da instalação:
        // são guardados só quando o usuário usa o reconhecimento (cache em tempo de execução).
        globIgnores: ['ocr/**', 'data/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith(`${base}ocr/`),
            handler: 'CacheFirst',
            options: { cacheName: 'ocr-assets-v1', expiration: { maxEntries: 8 } },
          },
          {
            urlPattern: ({ url }) => url.pathname === `${base}data/catalog-index.json`,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'catalog-index-v1', expiration: { maxEntries: 1 } },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    // Three.js é carregado sob demanda (import dinâmico); o chunk dele passa de 500 kB.
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'config/**/*.test.ts'],
  },
});
