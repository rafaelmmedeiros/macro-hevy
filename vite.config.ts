/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from /<repo>/.
  base: '/macro-hevy/',
  plugins: [svelte()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
