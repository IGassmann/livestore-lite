import { defineConfig } from 'vite-plus'

const stableUnitTestTask = {
  command: 'vp test',
  dependsOn: ['livestore-workspace#ts:build'],
  output: [],
  untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
}

export default defineConfig({
  test: {
    name: '@livestore/common',
    root: import.meta.dirname,
    include: ['src/**/*.test.ts'],
    server: { deps: { inline: ['@effect/vitest'] } },
  },
  run: {
    tasks: {
      'test:unit:stable': stableUnitTestTask,
    },
  },
})
