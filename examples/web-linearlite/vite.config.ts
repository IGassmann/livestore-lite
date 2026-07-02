// @ts-check

import process from 'node:process'

import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import devtoolsJson from 'vite-plugin-devtools-json'
import svgr from 'vite-plugin-svgr'
import { defineConfig } from 'vite-plus'

const enableLivestoreDevtools = process.env.LIVESTORE_ENABLE_DEVTOOLS_VITE === '1'
const buildTask = {
  command: 'vp build --configLoader runner',
  dependsOn: ['livestore-workspace#ts:build'],
  input: [{ auto: true }, '!dist/**', '!**/.wrangler/**'],
  output: ['dist/**'],
  untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
}

// https://vitejs.dev/config/
export default defineConfig(async ({ command }) => {
  const livestoreDevtoolsPlugins =
    command === 'serve' && enableLivestoreDevtools
      ? [
          (await import('@livestore/devtools-vite')).livestoreDevtoolsPlugin({
            schemaPath: './src/livestore/schema/index.ts',
          }),
        ]
      : []

  return {
    server: {
      port: process.env.PORT ? Number(process.env.PORT) : 60_000,
      fs: { strict: false },
    },
    worker: { format: 'es' },
    optimizeDeps: {
      // TODO remove once fixed https://github.com/vitejs/vite/issues/8427
      exclude: ['@livestore/wa-sqlite'],
    },
    plugins: [
      // https://tanstack.com/start/latest/docs/framework/react/guide/hosting#cloudflare-workers--official-partner
      cloudflare({ viteEnvironment: { name: 'ssr' } }),
      tanstackStart(),
      react(),
      tailwindcss(),
      ...livestoreDevtoolsPlugins,
      svgr({
        svgrOptions: {
          svgo: true,
          plugins: ['@svgr/plugin-svgo', '@svgr/plugin-jsx'],
          svgoConfig: {
            plugins: ['preset-default', 'removeTitle', 'removeDesc', 'removeDoctype', 'cleanupIds'],
          },
        },
      }),
      devtoolsJson(), // Needed for https://github.com/TanStack/router/issues/2459#issuecomment-2969318833
    ],
    run: {
      tasks: {
        'build:cached': buildTask,
        'test:e2e': {
          command: 'playwright test',
          cache: false,
        },
      },
    },
  }
})
