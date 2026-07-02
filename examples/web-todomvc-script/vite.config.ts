import process from 'node:process'

import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

const enableLivestoreDevtools = process.env.LIVESTORE_ENABLE_DEVTOOLS_VITE === '1'

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
    server: {
      port: process.env.PORT ? Number(process.env.PORT) : 60_004,
      fs: { strict: false },
    },
    worker: { format: 'es' },
    plugins: [cloudflare(), ...livestoreDevtoolsPlugins],
  }
})
