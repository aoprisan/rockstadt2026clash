import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the project at /<repo>/ — keep base in sync with the repo name.
const base = '/rockstadt2026clash/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Rockstadt Extreme Fest 2026 Clashfinder',
        short_name: 'REF 2026',
        description:
          'Plan your Rockstadt Extreme Fest 2026 and spot set-time clashes across all three stages.',
        id: base,
        scope: base,
        start_url: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0a0c',
        theme_color: '#0a0a0c',
        lang: 'en',
        categories: ['music', 'events', 'lifestyle'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
