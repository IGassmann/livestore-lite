import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite-plus'

const stableUnitTestTask = {
  command: "/bin/bash -lc 'vp test run'",
  dependsOn: ['build:cached'],
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
      'build:cached': {
        command: "/bin/bash -lc 'tsc'",
        dependsOn: [{ task: 'build:cached', from: ['dependencies', 'devDependencies'] }],
        input: [{ auto: true }, '!**/*.tsbuildinfo'],
        output: ['dist/**', '!**/*.tsbuildinfo'],
        untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
      },
      'test:unit:stable': stableUnitTestTask,
    },
  },
})
