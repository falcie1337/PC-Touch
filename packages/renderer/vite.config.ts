import { join } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from '../../package.json'

/**
 * @see https://vitejs.dev/config/
 */
export default defineConfig({
  mode: process.env.NODE_ENV,
  root: __dirname,
  plugins: [
    react({
      jsxImportSource: '@emotion/react',
      babel: {
        plugins: ['@emotion/babel-plugin']
      }
    })
  ],
  // cf issue: https://github.com/vitejs/vite/issues/8644
  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' }
  },
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    sourcemap: true
  },
  resolve: {
    alias: {
      '@lindo/shared': join(__dirname, '../../packages/shared'),
      '@lindo/i18n': join(__dirname, '../../packages/i18n'),
      '@': join(__dirname, 'src')
    }
  },
  server: {
    host: pkg.env.VITE_DEV_SERVER_HOST,
    port: pkg.env.VITE_DEV_SERVER_PORT
  }
})
