import process from 'node:process'

import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

const defaultPort = 60_002
const enableLivestoreDevtools = process.env.LIVESTORE_ENABLE_DEVTOOLS_VITE === '1'
const buildTask = {
  command: 'vp build --configLoader runner',
  dependsOn: ['livestore-workspace#ts:build'],
  input: [{ auto: true }, '!dist/**', '!**/.wrangler/**'],
  output: ['dist/**'],
  untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
}
const deployTask = {
  command: 'wrangler deploy',
  dependsOn: ['build:cached'],
  cache: false,
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
    server: {
      port: process.env.PORT ? Number(process.env.PORT) : defaultPort,
      fs: { strict: false },
    },
    worker: { format: 'es' },
    plugins: [cloudflare(), react(), ...livestoreDevtoolsPlugins],
    run: {
      tasks: {
        'build:cached': buildTask,
        'deploy:wrangler': deployTask,
        'test:e2e': {
          command: 'playwright test',
          cache: false,
        },
      },
    },
  }
})
