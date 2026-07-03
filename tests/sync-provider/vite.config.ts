import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    testTimeout: 60000,
    include: ['src/**/*.test.ts'],
    server: { deps: { inline: ['@effect/vitest'] } },
  },
})
