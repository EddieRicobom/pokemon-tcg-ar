import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { normalizeBasePath } from './config/base-path.ts';

// No CI o valor vem de BASE_PATH=/<nome-do-repositório>/ (GitHub Pages de projeto).
const base = normalizeBasePath(process.env.BASE_PATH);

export default defineConfig({
  base,
  // Os workers inline do MindAR precisam passar pelo transformador de workers do Vite.
  optimizeDeps: { exclude: ['mind-ar'] },
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
        orientation: 'any',
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        // O OCR (≈ 6,7 MB no primeiro uso), o índice do catálogo e os sprites locais da Vila (≈ 100 MB, 966
        // espécies) não entram no pré-cache da instalação: são guardados só quando usados (cache em tempo de
        // execução), senão a instalação do PWA baixaria tudo isso de uma vez.
        globIgnores: ['ocr/**', 'data/**', 'sprites/**', 'art/trainers/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith(`${base}art/trainers/`),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'trainer-atlases-v1', expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 90 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith(`${base}ocr/`),
            handler: 'CacheFirst',
            options: { cacheName: 'ocr-assets-v1', expiration: { maxEntries: 8 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith(`${base}data/art-index.`),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'art-index-v1', expiration: { maxEntries: 4 } },
          },
          {
            urlPattern: ({ url }) => url.pathname === `${base}data/catalog-index.json`,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'catalog-index-v1', expiration: { maxEntries: 1 } },
          },
          {
            // Índice pequeno do pacote incorporado; evita consultá-lo na rede a cada nova abertura da PWA.
            urlPattern: ({ url }) => url.pathname === `${base}data/pokeapi-sprite-manifest.json`,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'pokeapi-sprite-manifest-v1', expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith(`${base}sprites/`),
            handler: 'CacheFirst',
            // Não pré-baixar o catálogo de centenas de MB: cada sprite entra no aparelho apenas quando usado.
            options: { cacheName: 'pokemon-sprites-v2', expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 90 } },
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
    pool: 'threads',
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'config/**/*.test.ts'],
  },
});
