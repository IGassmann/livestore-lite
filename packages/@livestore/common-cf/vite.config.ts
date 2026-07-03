import { defineConfig } from 'vite-plus'

const stableUnitTestTask = {
  command: 'vp test run',
  dependsOn: ['build:cached'],
  output: [],
  untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
}

export default defineConfig({
  test: {
    name: '@livestore/common-cf',
    root: import.meta.dirname,
    include: ['src/**/*.test.ts'],
    server: { deps: { inline: ['@effect/vitest'] } },
  },
  run: {
    tasks: {
      'build:cached': {
        command: 'tsc',
        dependsOn: [{ task: 'build:cached', from: ['dependencies', 'devDependencies'] }],
        input: [{ auto: true }, '!**/*.tsbuildinfo'],
        output: ['dist/**', '!**/*.tsbuildinfo'],
        untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
      },
      'test:unit:stable': stableUnitTestTask,
    },
  },
})
