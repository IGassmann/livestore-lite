import { defineConfig } from 'vite-plus'

const buildTask = {
  command: 'wrangler build',
  dependsOn: [{ task: 'build:cached', from: 'dependencies' }],
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
