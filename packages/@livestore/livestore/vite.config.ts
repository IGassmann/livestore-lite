import { defineConfig } from 'vite-plus'

const stableUnitTestTask = {
  command: "/bin/bash -lc 'vp test'",
  dependsOn: ['build:cached'],
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
