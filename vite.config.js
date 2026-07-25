import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      workbox: {
        // glb matters: the horse model is the one asset the game can't draw
        // without, so leaving it out of the precache breaks "works with the
        // Wi-Fi off" — which is most of the point of installing this thing.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,glb}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      manifest: {
        name: 'Horse Meadow',
        short_name: 'Horses',
        description: 'Find a horse. Make friends. Go for a ride.',
        start_url: './',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#9AC7E8',
        theme_color: '#7CB56A',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
