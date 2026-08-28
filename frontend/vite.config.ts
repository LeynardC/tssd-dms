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
      devOptions: {
        enabled: true
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