import { defineConfig } from 'vite-plus'

const buildTask = {
  command: 'tsc',
  input: [{ auto: true }, '!dist/.tsbuildinfo'],
  output: ['dist/**', '!dist/.tsbuildinfo'],
  untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
}

export default defineConfig({
  run: {
    tasks: {
      'build:cached': buildTask,
    },
  },
})
