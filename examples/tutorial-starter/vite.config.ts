import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

const buildTask = {
  command: ['tsc -b', 'vp build --configLoader runner'],
  input: [{ auto: true }, '!dist/**', '!node_modules/.tmp/**'],
  output: ['dist/**'],
  untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  run: {
    tasks: {
      'build:cached': buildTask,
    },
  },
})
