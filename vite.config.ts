import { defineConfig, loadEnv } from 'vite';
import googleHandler from './api/google/[action].ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of [
    'APP_ORIGIN',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_TOKEN_ENCRYPTION_KEY',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN',
    'CRON_SECRET',
  ]) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }
  const middleware = (server: {
    middlewares: {
      use: (path: string, handler: (req: IncomingMessage, res: ServerResponse) => void) => void;
    };
  }) => {
    // Connect removes the mount prefix; restore it for the same handler used by Vercel.
    server.middlewares.use('/api/google', (req, res) => {
      req.url = `/api/google${req.url}`;
      void googleHandler(req, res);
    });
  };
  return {
    plugins: [
      {
        name: 'dayflow-google-api',
        configureServer: middleware,
        configurePreviewServer: middleware,
      },
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: 'DAYFLOW — Planificación personal',
          short_name: 'DAYFLOW',
          description: 'Tu día, con intención. Tu organización personal, también sin conexión.',
          lang: 'es',
          theme_color: '#101014',
          background_color: '#101014',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
  };
});
