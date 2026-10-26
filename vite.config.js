import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // Installable app ("Add to home screen") + offline app shell.
    VitePWA({
      registerType: 'autoUpdate', // new deploys are picked up on the next launch
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Workout Planner',
        short_name: 'Workouts',
        description: 'Plan your training week, log sets, and track your PRs.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f5f5f3',
        theme_color: '#f5f5f3',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // cache the built app (JS/CSS/HTML/icons) so it opens offline;
        // Supabase + wger requests are NOT cached — data always comes from the network
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
