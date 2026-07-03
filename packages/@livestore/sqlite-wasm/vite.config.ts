import { defineConfig } from 'vite-plus'

const stableUnitTestTask = {
  command: 'vp test',
  dependsOn: ['livestore-workspace#ts:build'],
  output: [],
  untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
}

export default defineConfig({
  test: {
    name: '@livestore/sqlite-wasm',
    root: import.meta.dirname,
    include: ['src/**/*.test.ts'],
    poolOptions: {
      workers: {
        wrangler: {
          configPath: './wrangler.toml',
        },
        isolatedStorage: false,
        main: './src/test/setup.ts',
      },
    },
    server: { deps: { inline: ['@effect/vitest'] } },
  },
  run: {
    tasks: {
      'test:unit:stable': stableUnitTestTask,
    },
  },
})
