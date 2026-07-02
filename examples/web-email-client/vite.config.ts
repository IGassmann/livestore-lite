import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

const enableLivestoreDevtools = process.env.LIVESTORE_ENABLE_DEVTOOLS_VITE === '1'
const buildTask = {
  command: 'vp build --configLoader runner',
  dependsOn: ['livestore-workspace#ts:build'],
  input: [{ auto: true }, '!dist/**', '!**/.wrangler/**'],
  output: ['dist/**'],
  untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
}

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
    run: {
      tasks: {
        'build:cached': buildTask,
      },
    },
  }
})
