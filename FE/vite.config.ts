/// <reference types="vitest" />

import path from 'node:path'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { seoPlugin } from './vite-plugin-seo.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [
      react(),
      seoPlugin({
        // Search Console HTML-tag token; override per deployment with VITE_GOOGLE_SITE_VERIFICATION.
        googleSiteVerification:
          env.VITE_GOOGLE_SITE_VERIFICATION || 'Famxi1gD0ANnvlfTkIqVv4RAMw0LTb9DnQzmY1071os',
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
  }
})
