import process from 'node:process'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const enableLivestoreDevtools = process.env.LIVESTORE_ENABLE_DEVTOOLS_VITE === '1'

// Required for use of performance.measureUserAgentSpecificMemory()
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig(async ({ command }) => {
  const livestoreDevtoolsPlugins =
    command === 'serve' && enableLivestoreDevtools
      ? [
          (await import('@livestore/devtools-vite')).livestoreDevtoolsPlugin({
            schemaPath: './src/livestore/schema.ts',
          }),
        ]
      : []

  return {
    root: rootDir,
    server: {
      port: process.env.PORT !== undefined ? Number(process.env.PORT) : 46001,
      fs: { strict: false },
      headers: crossOriginIsolationHeaders,
    },
    preview: {
      headers: crossOriginIsolationHeaders,
    },
    plugins: [react(), ...livestoreDevtoolsPlugins],
    optimizeDeps: {
      exclude: ['@livestore/wa-sqlite'],
    },
    build: {
      sourcemap: true,
      rollupOptions: { output: { sourcemapIgnoreList: false } },
    },
  }
})
