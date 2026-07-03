import { defineConfig } from 'vite-plus'

const buildTask = {
  command: 'wrangler build',
  dependsOn: [
    '@livestore/adapter-cloudflare#build:cached',
    '@livestore/livestore#build:cached',
    '@livestore/sync-cf#build:cached',
  ],
  input: [{ auto: true }, '!dist/**', '!**/.wrangler/**'],
  output: ['.wrangler/**'],
  untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
}

export default defineConfig({
  run: {
    tasks: {
      'build:cached': buildTask,
    },
  },
})
