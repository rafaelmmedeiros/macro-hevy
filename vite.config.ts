/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, type Plugin } from 'vite'

// The browser enforces this on the published page: it runs only its own script and can only
// connect to the Hevy API, so the key can't be sent anywhere else even by injected code. Any new
// external resource has to be added here. GitHub Pages can't send headers, hence a <meta> tag,
// which can't express frame-ancestors (src/main.ts refuses to run in a frame instead).
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  'connect-src https://api.hevyapp.com',
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/** Adds the policy to the built page only; the dev server needs inline styles and a WebSocket. */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from /<repo>/.
  base: '/macro-hevy/',
  plugins: [svelte(), contentSecurityPolicy()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
