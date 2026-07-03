import { defineConfig } from 'vite-plus'

const buildTask = {
  command: 'tsc',
  input: [{ auto: true }, '!dist/.tsbuildinfo'],
  output: ['dist/**', '!dist/.tsbuildinfo'],
  untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
}

const stableUnitTestTask = {
  command: 'vp test',
  dependsOn: ['livestore-workspace#ts:build'],
  output: [],
  untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
}

export default defineConfig({
  test: {
    name: '@livestore/livestore',
    root: import.meta.dirname,
    include: ['src/**/*.test.ts'],
    server: { deps: { inline: ['@effect/vitest'] } },
  },
  resolve: {
    alias: {
      '@livestore/wa-sqlite/dist/wa-sqlite.mjs': '@livestore/wa-sqlite/dist/wa-sqlite.node.mjs',
    },
  },
  run: {
    tasks: {
      'build:cached': buildTask,
      'test:unit:stable': stableUnitTestTask,
    },
  },
})
