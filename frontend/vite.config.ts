import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Keep the service worker to production builds only. In dev it intercepts
      // fetches and can drop custom headers (e.g. `Accept: application/json` on
      // the login POST), which makes Fortify fall back to a browser-style 302
      // redirect and surfaces as an opaque CORS failure.
      devOptions: {
        enabled: false
      },
      manifest: {
        name: 'TSSD Document Management System',
        short_name: 'TSSD DMS',
        description: 'Document management for DOLE MIMAROPA — TSSD.',
        lang: 'en',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1F4E78',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})