import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: { server: { deps: { inline: ['@effect/vitest'] } } },
})
