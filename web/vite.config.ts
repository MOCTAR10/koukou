import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    // Lets the app open with no connection. API data has its own cache: see src/offline.
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.png', 'logo.png', 'fermia-lockup-light.png'],
      manifest: {
        name: 'Fermia',
        short_name: 'Fermia',
        description: 'Gérez votre ferme, même sans connexion.',
        lang: 'fr',
        theme_color: '#0C2331',
        background_color: '#0C2331',
        display: 'standalone',
        start_url: '/app',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webp,svg,woff2}'],
        // The guide's screenshots (4 MB) are cached when viewed, not precached with the app.
        globIgnores: ['guide/**', 'guide-jury/**'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/apk\//, /^\/guide-jury(\/|$)/],
        runtimeCaching: [
          {
            urlPattern: /\/guide\/.*\.webp$/,
            handler: 'CacheFirst',
            options: { cacheName: 'guide-screens', expiration: { maxEntries: 80 }, cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});