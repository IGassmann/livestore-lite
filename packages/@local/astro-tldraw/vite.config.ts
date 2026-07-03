import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite-plus'

const stableUnitTestTask = {
  command: 'vp test run',
  dependsOn: ['livestore-workspace#ts:build'],
  output: [],
  untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
}

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    root: fileURLToPath(new URL('.', import.meta.url)),
    server: { deps: { inline: ['@effect/vitest'] } },
  },
  run: {
    tasks: {
      'test:unit:stable': stableUnitTestTask,
    },
  },
})
