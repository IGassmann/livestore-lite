import { defineConfig } from 'vite-plus'

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
})
