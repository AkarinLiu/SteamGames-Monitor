import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
}

export default defineConfig({
  resolve: { alias },
  test: {
    passWithNoTests: true,
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', 'dist-server/**'],
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit-node',
          environment: 'node',
          include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'unit-ui',
          environment: 'jsdom',
          include: ['src/**/*.spec.ts'],
        },
      },
    ],
  },
})
