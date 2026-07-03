import { defineConfig } from 'vite-plus'

export default defineConfig({
  run: {
    tasks: {
      'build:cached': {
        command: 'tsc',
        dependsOn: [{ task: 'build:cached', from: ['dependencies', 'devDependencies'] }],
        input: [{ auto: true }, '!**/*.tsbuildinfo'],
        output: ['dist/**', '!**/*.tsbuildinfo'],
        untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
      },
    },
  },
})
