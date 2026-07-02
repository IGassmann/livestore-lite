import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

const enableLivestoreDevtools = process.env.LIVESTORE_ENABLE_DEVTOOLS_VITE === '1'

export default defineConfig(async ({ command }) => {
  const livestoreDevtoolsPlugins =
    command === 'serve' && enableLivestoreDevtools
      ? [
          (await import('@livestore/devtools-vite')).livestoreDevtoolsPlugin({
            schemaPath: ['./src/stores/mailbox/schema.ts', './src/stores/thread/schema.ts'],
          }),
        ]
      : []

  return {
    plugins: [cloudflare(), react(), tailwindcss(), ...livestoreDevtoolsPlugins],
    optimizeDeps: {
      exclude: ['@livestore/wa-sqlite'],
    },
  }
})
